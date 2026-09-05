import { z } from "zod";
import { assertCalendarInput } from "@/core/calendar/input";
import { assertCalendarRuleSet } from "@/core/calendar/rules";
import { isValidIsoTimestamp } from "@/core/date/local";
import type {
  CalendarEvidenceSample,
  CalendarEvidenceBoundary,
  CalendarRuleSet,
  SexagenaryValue,
} from "@/core/calendar/types";
import { trimmedIdentifierSchema } from "@/core/content/identifiers";

/**
 * ADR-0002 requires evidence at each boundary before a rule set can be
 * accepted.  Keep the list in the domain layer so content tooling and future
 * review UIs cannot silently drift from the documented handoff contract.
 */
export const CALENDAR_EVIDENCE_BOUNDARIES = [
  "year",
  "month",
  "day",
  "zi-hour",
  "time-zone",
  "solar-term",
] as const satisfies readonly CalendarEvidenceBoundary[];

export interface CalendarEvidenceBoundaryCoverage {
  sampleIds: readonly string[];
  verifiedSampleIds: readonly string[];
}

export interface CalendarEvidenceCoverage {
  ruleVersion: string | null;
  sampleCount: number;
  verifiedSampleCount: number;
  byBoundary: Readonly<Record<CalendarEvidenceBoundary, CalendarEvidenceBoundaryCoverage>>;
  missingBoundaries: readonly CalendarEvidenceBoundary[];
  unverifiedSampleIds: readonly string[];
  complete: boolean;
}

const boundarySchema = z.enum([
  "year",
  "month",
  "day",
  "zi-hour",
  "time-zone",
  "solar-term",
]);
const sexagenarySchema = z.object({
  label: z.string().trim().min(1),
  stemId: trimmedIdentifierSchema,
  branchId: trimmedIdentifierSchema,
  basis: z.enum(["year", "month", "day", "hour"]),
  boundary: z.enum([
    "lunar-new-year",
    "lichun",
    "lunar-month",
    "solar-term-month",
    "civil-midnight",
    "zi-hour",
    "true-solar-time",
    "pending",
  ]),
  ruleVersion: trimmedIdentifierSchema,
}).strict();
const lunarSchema = z.object({
  year: z.number().int().positive(),
  month: z.number().int().min(1).max(12),
  day: z.number().int().min(1).max(30),
  isLeapMonth: z.boolean(),
}).strict();
const solarTermSchema = z.object({
  name: z.string().trim().min(1),
  occurredAt: z.string().refine(isValidIsoTimestamp, "节气事件时间无效"),
  timeZone: z.string().trim().min(1),
  precision: z.enum(["instant", "minute", "date"]),
  sourceIds: z.array(trimmedIdentifierSchema).min(1),
}).strict();
const expectedSchema = z.object({
  localDateTime: z.string().trim().min(1),
  utcInstant: z.string().refine(isValidIsoTimestamp, "样例 UTC 时间无效").nullable(),
  lunar: lunarSchema.nullable(),
  solarTerm: solarTermSchema.nullable(),
  sexagenary: z.object({
    year: sexagenarySchema.optional(),
    month: sexagenarySchema.optional(),
    day: sexagenarySchema.optional(),
    hour: sexagenarySchema.optional(),
  }).strict(),
}).strict();
const sampleSchema = z.object({
  id: trimmedIdentifierSchema,
  title: z.string().trim().min(1),
  ruleVersion: trimmedIdentifierSchema,
  boundary: boundarySchema,
  input: z.object({
    instant: z.string().min(1),
    timeZone: z.string().min(1),
    ruleVersion: trimmedIdentifierSchema,
  }).strict(),
  expected: expectedSchema,
  sourceIds: z.array(trimmedIdentifierSchema).min(1),
  status: z.enum(["pending", "verified"]),
}).strict();

function assertTrimmed(value: string, label: string): void {
  if (!value.trim() || value !== value.trim()) {
    throw new TypeError(`${label}必须是已修剪的非空字符串`);
  }
}

function assertTrimmedValues(values: readonly string[], label: string): void {
  values.forEach((value) => assertTrimmed(value, label));
}

function assertUnique(values: readonly string[], label: string): void {
  if (new Set(values).size !== values.length) throw new TypeError(`${label}不能重复`);
}

function assertExpectedSexagenary(
  sample: CalendarEvidenceSample,
): void {
  (Object.values(sample.expected.sexagenary) as SexagenaryValue[]).forEach((value) => {
    if (value.ruleVersion !== sample.ruleVersion) {
      throw new TypeError(`历法样例 ${sample.id} 的干支结果规则版本不一致`);
    }
    if (value.basis !== Object.entries(sample.expected.sexagenary).find(([, item]) => item === value)?.[0]) {
      throw new TypeError(`历法样例 ${sample.id} 的干支结果层级不一致`);
    }
  });
}

function buildCoverage(
  samples: readonly CalendarEvidenceSample[],
  ruleVersion: string | null,
): CalendarEvidenceCoverage {
  const byBoundary = Object.fromEntries(
    CALENDAR_EVIDENCE_BOUNDARIES.map((boundary) => [
      boundary,
      {
        sampleIds: samples
          .filter((sample) => sample.boundary === boundary)
          .map((sample) => sample.id),
        verifiedSampleIds: samples
          .filter((sample) => sample.boundary === boundary && sample.status === "verified")
          .map((sample) => sample.id),
      },
    ]),
  ) as unknown as Record<CalendarEvidenceBoundary, CalendarEvidenceBoundaryCoverage>;
  const missingBoundaries = CALENDAR_EVIDENCE_BOUNDARIES.filter(
    (boundary) => byBoundary[boundary].sampleIds.length === 0,
  );
  return {
    ruleVersion,
    sampleCount: samples.length,
    verifiedSampleCount: samples.filter((sample) => sample.status === "verified").length,
    byBoundary,
    missingBoundaries,
    unverifiedSampleIds: samples
      .filter((sample) => sample.status !== "verified")
      .map((sample) => sample.id),
    complete: missingBoundaries.length === 0 && samples.every((sample) => sample.status === "verified"),
  };
}

/**
 * Return a deterministic coverage report for reviewer tooling.  When a rule
 * set is supplied, only the samples it explicitly references are counted;
 * unrelated samples must not accidentally make an accepted rule appear
 * complete.
 */
export function inspectCalendarEvidenceCoverage(
  input: readonly CalendarEvidenceSample[],
  ruleSet?: CalendarRuleSet,
): CalendarEvidenceCoverage {
  // Validation still rejects malformed rows and unknown references, but the
  // report itself must be able to describe an incomplete accepted candidate;
  // otherwise reviewer tooling could never show which boundary is missing.
  const validated = validateCalendarEvidenceSet(input, ruleSet, false);
  const samples = ruleSet
    ? validated.filter((sample) => ruleSet.authoritativeSampleIds.includes(sample.id))
    : validated;
  return buildCoverage(samples, ruleSet?.id ?? null);
}

/** Validate one reviewer-supplied sample at the serialization boundary. */
export function assertCalendarEvidenceSample(
  input: unknown,
): asserts input is CalendarEvidenceSample {
  const parsed = sampleSchema.safeParse(input);
  if (!parsed.success) {
    // Preserve the actionable identifier contract in the public error even
    // though Zod performs the first structural pass.  Review tooling and
    // content-owner handoff tests rely on distinguishing whitespace errors
    // from otherwise malformed samples.
    if (parsed.error.issues.some((issue) => issue.message.includes("已修剪"))) {
      throw new TypeError("历法权威样例标识符必须是已修剪的非空字符串");
    }
    throw new TypeError("历法权威样例字段无效");
  }
  const sample = parsed.data;
  assertTrimmed(sample.id, `历法样例 ${sample.id} 的 ID`);
  assertTrimmed(sample.ruleVersion, `历法样例 ${sample.id} 的规则版本`);
  assertTrimmed(sample.input.ruleVersion, `历法样例 ${sample.id} 的输入规则版本`);
  assertTrimmedValues(sample.sourceIds, `历法样例 ${sample.id} 的来源 ID`);
  if (sample.expected.solarTerm) {
    assertTrimmedValues(sample.expected.solarTerm.sourceIds, `历法样例 ${sample.id} 的节气来源 ID`);
  }
  Object.values(sample.expected.sexagenary).forEach((value) => {
    assertTrimmed(value.stemId, `历法样例 ${sample.id} 的天干 ID`);
    assertTrimmed(value.branchId, `历法样例 ${sample.id} 的地支 ID`);
    assertTrimmed(value.ruleVersion, `历法样例 ${sample.id} 的干支规则版本`);
  });
  assertCalendarInput(sample.input);
  if (sample.input.ruleVersion.trim() !== sample.ruleVersion) {
    throw new TypeError(`历法样例 ${sample.id} 的输入规则版本不一致`);
  }
  assertUnique(sample.sourceIds, `历法样例 ${sample.id} 的来源`);
  if (sample.expected.solarTerm) {
    assertUnique(sample.expected.solarTerm.sourceIds, `历法样例 ${sample.id} 的节气来源`);
  }
  assertExpectedSexagenary(sample as CalendarEvidenceSample);
}

/**
 * Validate the sample registry and, when supplied, its coverage for a rule
 * set.  An accepted rule set may only reference registered, verified samples
 * from the same version, and every sample citation must be one of its sources.
 */
function validateCalendarEvidenceSet(
  input: unknown,
  ruleSet?: CalendarRuleSet,
  enforceAcceptedCoverage = true,
): CalendarEvidenceSample[] {
  if (!Array.isArray(input)) throw new TypeError("历法权威样例集必须是数组");
  input.forEach(assertCalendarEvidenceSample);
  const samples = input as CalendarEvidenceSample[];
  assertUnique(samples.map((sample) => sample.id), "历法权威样例 ID");
  if (!ruleSet) return samples;
  assertCalendarRuleSet(ruleSet);
  const byId = new Map(samples.map((sample) => [sample.id, sample]));
  ruleSet.authoritativeSampleIds.forEach((sampleId) => {
    const sample = byId.get(sampleId);
    if (!sample) throw new Error(`规则集 ${ruleSet.id} 引用了未登记的权威样例：${sampleId}`);
    if (sample.ruleVersion !== ruleSet.id) throw new Error(`权威样例 ${sampleId} 的规则版本与规则集不一致`);
    if (ruleSet.status === "accepted" && enforceAcceptedCoverage && sample.status !== "verified") {
      throw new Error(`accepted 规则集不能引用未核验样例：${sampleId}`);
    }
    if (sample.sourceIds.some((sourceId) => !ruleSet.sourceIds.includes(sourceId))) {
      throw new Error(`权威样例 ${sampleId} 引用了规则集未登记的来源`);
    }
  });
  if (ruleSet.status === "accepted" && ruleSet.authoritativeSampleIds.length === 0) {
    throw new Error(`accepted 规则集 ${ruleSet.id} 缺少权威样例`);
  }
  if (ruleSet.status === "accepted" && enforceAcceptedCoverage) {
    const coverage = buildCoverage(
      ruleSet.authoritativeSampleIds.map((sampleId) => byId.get(sampleId) as CalendarEvidenceSample),
      ruleSet.id,
    );
    if (!coverage.complete) {
      const missing = coverage.missingBoundaries.join("、");
      const unverified = coverage.unverifiedSampleIds.join("、");
      throw new Error(
        `accepted 规则集 ${ruleSet.id} 的权威样例覆盖不完整` +
          (missing ? `；缺少边界：${missing}` : "") +
          (unverified ? `；未核验样例：${unverified}` : ""),
      );
    }
  }
  return samples;
}

export function assertCalendarEvidenceSet(
  input: unknown,
  ruleSet?: CalendarRuleSet,
): asserts input is readonly CalendarEvidenceSample[] {
  validateCalendarEvidenceSet(input, ruleSet);
}
