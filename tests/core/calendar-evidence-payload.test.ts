import { describe, expect, it } from "vitest";
import {
  buildCalendarEvidenceValidationReport,
  parseCalendarEvidenceValidationReport,
  parseCalendarEvidencePayload,
  previewCalendarEvidencePayload,
  serializeCalendarEvidenceValidationReport,
} from "@/core/calendar/evidence-payload";
import { DRAFT_CALENDAR_RULE_SET } from "@/core/calendar/rules";

describe("历法样例交接包解析", () => {
  it("接受裸样例数组并使用草案规则集作为默认版本", () => {
    const payload = parseCalendarEvidencePayload("[]", DRAFT_CALENDAR_RULE_SET);
    expect(payload).toEqual({ ruleSet: DRAFT_CALENDAR_RULE_SET, samples: [] });
  });

  it("接受带规则集的 envelope，并同时返回所有样例与规则引用覆盖", () => {
    const ruleSet = {
      ...DRAFT_CALENDAR_RULE_SET,
      sourceIds: ["source-project-editorial"],
      authoritativeSampleIds: [],
    };
    const payload = previewCalendarEvidencePayload(
      JSON.stringify({ ruleSet, samples: [] }),
      DRAFT_CALENDAR_RULE_SET,
    );
    expect(payload.ruleSet).toEqual(ruleSet);
    expect(payload.sampleCoverage.sampleCount).toBe(0);
    expect(payload.ruleCoverage.missingBoundaries).toEqual([
      "year",
      "month",
      "day",
      "zi-hour",
      "time-zone",
      "solar-term",
    ]);
  });

  it("拒绝空文本、非法 JSON、未知字段和缺少样例数组", () => {
    expect(() => parseCalendarEvidencePayload(" ", DRAFT_CALENDAR_RULE_SET)).toThrow(/粘贴/);
    expect(() => parseCalendarEvidencePayload("{", DRAFT_CALENDAR_RULE_SET)).toThrow(/无法解析/);
    expect(() => parseCalendarEvidencePayload(
      JSON.stringify({ samples: [], extra: true }),
      DRAFT_CALENDAR_RULE_SET,
    )).toThrow(/未声明字段/);
    expect(() => parseCalendarEvidencePayload(
      JSON.stringify({ ruleSet: DRAFT_CALENDAR_RULE_SET }),
      DRAFT_CALENDAR_RULE_SET,
    )).toThrow(/samples 数组/);
  });

  it("沿用样例与规则集的严格校验，不接受错误规则版本", () => {
    expect(() => parseCalendarEvidencePayload(
      JSON.stringify({
        ruleSet: { ...DRAFT_CALENDAR_RULE_SET, id: "calendar-other-1" },
        samples: [],
      }),
      DRAFT_CALENDAR_RULE_SET,
    )).not.toThrow();
    expect(() => parseCalendarEvidencePayload(
      JSON.stringify({
        ruleSet: DRAFT_CALENDAR_RULE_SET,
        samples: [{ id: "sample" }],
      }),
      DRAFT_CALENDAR_RULE_SET,
    )).toThrow(/字段无效/);
  });

  it("重新校验并序列化可交接的覆盖报告，不保存或推导额外事实", () => {
    const report = buildCalendarEvidenceValidationReport(
      { ruleSet: DRAFT_CALENDAR_RULE_SET, samples: [] },
      DRAFT_CALENDAR_RULE_SET,
    );
    expect(report).toMatchObject({
      reportVersion: 1,
      ruleSet: DRAFT_CALENDAR_RULE_SET,
      samples: [],
      coverage: {
        allSamples: { sampleCount: 0 },
        ruleReferencedSamples: { sampleCount: 0 },
      },
    });
    const serialized = serializeCalendarEvidenceValidationReport(
      { ruleSet: DRAFT_CALENDAR_RULE_SET, samples: [] },
      DRAFT_CALENDAR_RULE_SET,
    );
    expect(JSON.parse(serialized)).toEqual(report);
    expect(parseCalendarEvidenceValidationReport(serialized, DRAFT_CALENDAR_RULE_SET)).toEqual(report);
  });

  it("拒绝被篡改的覆盖结果或报告字段", () => {
    const report = buildCalendarEvidenceValidationReport(
      { ruleSet: DRAFT_CALENDAR_RULE_SET, samples: [] },
      DRAFT_CALENDAR_RULE_SET,
    );
    expect(() => parseCalendarEvidenceValidationReport(
      JSON.stringify({ ...report, coverage: { ...report.coverage, allSamples: { ...report.coverage.allSamples, sampleCount: 1 } } }),
      DRAFT_CALENDAR_RULE_SET,
    )).toThrow(/覆盖结果与样例不一致/);
    expect(() => parseCalendarEvidenceValidationReport(
      JSON.stringify({ ...report, extra: true }),
      DRAFT_CALENDAR_RULE_SET,
    )).toThrow(/未声明字段/);
  });
});
