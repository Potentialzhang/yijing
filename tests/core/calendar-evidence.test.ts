import { describe, expect, it } from "vitest";
import {
  assertCalendarEvidenceSample,
  assertCalendarEvidenceSet,
  inspectCalendarEvidenceCoverage,
} from "@/core/calendar/evidence";
import { DRAFT_CALENDAR_RULE_SET } from "@/core/calendar/rules";

const sample = {
  id: "sample-calendar-1",
  title: "换日边界样例（待复核）",
  ruleVersion: "calendar-draft-1",
  boundary: "day",
  input: {
    instant: "2026-08-26T12:00",
    timeZone: "Asia/Shanghai",
    ruleVersion: "calendar-draft-1",
  },
  expected: {
    localDateTime: "2026-08-26T12:00:00",
    utcInstant: null,
    lunar: null,
    solarTerm: null,
    sexagenary: {},
  },
  sourceIds: ["source-calendar-authority"],
  status: "pending",
} as const;

const REQUIRED_BOUNDARIES = [
  "year",
  "month",
  "day",
  "zi-hour",
  "time-zone",
  "solar-term",
] as const;

function verifiedBoundarySamples(ruleVersion: string) {
  return REQUIRED_BOUNDARIES.map((boundary, index) => ({
    ...sample,
    id: `${sample.id}-${boundary}`,
    boundary,
    ruleVersion,
    input: { ...sample.input, ruleVersion },
    status: "verified" as const,
    title: `边界样例 ${index + 1}`,
  }));
}

describe("M2-B 历法权威样例契约", () => {
  it("接受带输入、期望结果和来源的待复核样例", () => {
    expect(() => assertCalendarEvidenceSample(sample)).not.toThrow();
  });

  it("要求未解析的 UTC 瞬间使用 null 而不是空字符串", () => {
    expect(() => assertCalendarEvidenceSample({
      ...sample,
      expected: { ...sample.expected, utcInstant: "" },
    })).toThrow(/字段无效/);
  });

  it("拒绝输入规则版本不一致或重复来源", () => {
    expect(() => assertCalendarEvidenceSample({
      ...sample,
      input: { ...sample.input, ruleVersion: "calendar-other-1" },
    })).toThrow(/输入规则版本/);
    expect(() => assertCalendarEvidenceSample({
      ...sample,
      sourceIds: ["source-calendar-authority", "source-calendar-authority"],
    })).toThrow(/来源.*不能重复/);
  });

  it("拒绝证据 ID 和规则版本的前后空格", () => {
    expect(() => assertCalendarEvidenceSample({
      ...sample,
      id: " sample-calendar-1",
    })).toThrow(/已修剪/);
    expect(() => assertCalendarEvidenceSample({
      ...sample,
      sourceIds: [" source-calendar-authority"],
    })).toThrow(/已修剪/);
    expect(() => assertCalendarEvidenceSample({
      ...sample,
      input: { ...sample.input, ruleVersion: "calendar-draft-1 " },
    })).toThrow(/已修剪/);
  });

  it("要求干支期望结果使用样例自身规则版本并匹配层级", () => {
    expect(() => assertCalendarEvidenceSample({
      ...sample,
      expected: {
        ...sample.expected,
        sexagenary: {
          year: {
            label: "甲子",
            stemId: "jia",
            branchId: "zi",
            basis: "month",
            boundary: "pending",
            ruleVersion: "calendar-draft-1",
          },
        },
      },
    })).toThrow(/层级/);
    expect(() => assertCalendarEvidenceSample({
      ...sample,
      expected: {
        ...sample.expected,
        sexagenary: {
          year: {
            label: "甲子",
            stemId: "jia",
            branchId: "zi",
            basis: "year",
            boundary: "pending",
            ruleVersion: "calendar-other-1",
          },
        },
      },
    })).toThrow(/规则版本/);
  });

  it("accepted 规则集必须覆盖已登记且已核验的同版本样例", () => {
    const accepted = {
      ...DRAFT_CALENDAR_RULE_SET,
      id: "calendar-accepted-1",
      yearBoundary: "lunar-new-year" as const,
      monthBoundary: "solar-term-month" as const,
      dayBoundary: "civil-midnight" as const,
      timeZoneBasis: "standard-time" as const,
      sourceIds: ["source-calendar-authority"],
      authoritativeSampleIds: verifiedBoundarySamples("calendar-accepted-1").map((item) => item.id),
      status: "accepted" as const,
    };
    const samples = verifiedBoundarySamples(accepted.id);
    expect(() => assertCalendarEvidenceSet(samples, accepted)).not.toThrow();
    expect(inspectCalendarEvidenceCoverage(samples, accepted).complete).toBe(true);
    expect(() => assertCalendarEvidenceSet([sample], accepted)).toThrow(/未登记/);
    expect(() => assertCalendarEvidenceSet([
      ...samples.slice(0, -1),
      { ...samples.at(-1)!, status: "pending" as const },
    ], accepted)).toThrow(/未核验/);
  });

  it("报告缺失的边界样例，避免无关样例让规则集看起来完整", () => {
    const accepted = {
      ...DRAFT_CALENDAR_RULE_SET,
      id: "calendar-accepted-coverage-1",
      yearBoundary: "lunar-new-year" as const,
      monthBoundary: "solar-term-month" as const,
      dayBoundary: "civil-midnight" as const,
      timeZoneBasis: "standard-time" as const,
      sourceIds: ["source-calendar-authority"],
      authoritativeSampleIds: ["sample-calendar-1-year"],
      status: "accepted" as const,
    };
    const samples = verifiedBoundarySamples(accepted.id);
    const incomplete = { ...accepted, authoritativeSampleIds: [samples[0].id] };
    const report = inspectCalendarEvidenceCoverage(samples, incomplete);
    expect(report.complete).toBe(false);
    expect(report.missingBoundaries).toEqual([
      "month",
      "day",
      "zi-hour",
      "time-zone",
      "solar-term",
    ]);
    expect(() => assertCalendarEvidenceSet(samples, incomplete)).toThrow(/覆盖不完整/);

    const pendingCandidate = { ...accepted, authoritativeSampleIds: [samples[0].id] };
    const pendingReport = inspectCalendarEvidenceCoverage(
      [{ ...samples[0], status: "pending" as const }, ...samples.slice(1)],
      pendingCandidate,
    );
    expect(pendingReport.unverifiedSampleIds).toEqual([samples[0].id]);
  });

  it("拒绝 accepted 规则引用未登记样例或样例外来源", () => {
    const accepted = {
      ...DRAFT_CALENDAR_RULE_SET,
      id: "calendar-accepted-1",
      yearBoundary: "lunar-new-year" as const,
      monthBoundary: "solar-term-month" as const,
      dayBoundary: "civil-midnight" as const,
      timeZoneBasis: "standard-time" as const,
      sourceIds: ["source-calendar-authority"],
      authoritativeSampleIds: ["sample-missing"],
      status: "accepted" as const,
    };
    expect(() => assertCalendarEvidenceSet([], accepted)).toThrow(/未登记/);
    expect(() => assertCalendarEvidenceSet([{
      ...sample,
      ruleVersion: accepted.id,
      input: { ...sample.input, ruleVersion: accepted.id },
      status: "verified" as const,
      sourceIds: ["source-other"],
    }], {
      ...accepted,
      authoritativeSampleIds: [sample.id],
    })).toThrow(/未登记的来源/);
  });
});
