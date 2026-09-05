import {
  assertCalendarEvidenceSet,
  inspectCalendarEvidenceCoverage,
} from "@/core/calendar/evidence";
import type { CalendarEvidenceCoverage } from "@/core/calendar/evidence";
import { assertCalendarRuleSet } from "@/core/calendar/rules";
import type { CalendarEvidenceSample, CalendarRuleSet } from "@/core/calendar/types";

/**
 * Non-persistent payload used by the content-owner handoff inspector.
 *
 * The payload intentionally contains only reviewer-supplied evidence and a
 * rule-set candidate. It never turns evidence into a calendar calculation or
 * mutates the checked-in registry.
 */
export interface CalendarEvidencePayload {
  ruleSet: CalendarRuleSet;
  samples: readonly CalendarEvidenceSample[];
}

export interface CalendarEvidencePayloadPreview extends CalendarEvidencePayload {
  /** Coverage across every supplied sample, regardless of rule references. */
  sampleCoverage: CalendarEvidenceCoverage;
  /** Coverage limited to samples referenced by the supplied rule set. */
  ruleCoverage: CalendarEvidenceCoverage;
}

export interface CalendarEvidenceValidationReport {
  reportVersion: 1;
  ruleSet: CalendarRuleSet;
  samples: readonly CalendarEvidenceSample[];
  coverage: {
    allSamples: CalendarEvidenceCoverage;
    ruleReferencedSamples: CalendarEvidenceCoverage;
  };
}

const PAYLOAD_KEYS = new Set(["ruleSet", "samples"]);
const REPORT_KEYS = new Set(["reportVersion", "ruleSet", "samples", "coverage"]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function assertExactKeys(value: Record<string, unknown>, keys: Set<string>, label: string): void {
  if (Object.keys(value).some((key) => !keys.has(key))) {
    throw new TypeError(`${label}包含未声明字段`);
  }
}

function parseJson(value: string): unknown {
  if (!value.trim()) throw new TypeError("请先粘贴历法样例 JSON");
  try {
    return JSON.parse(value);
  } catch {
    throw new TypeError("历法样例 JSON 无法解析");
  }
}

/**
 * Parse either a bare sample array or an envelope with `ruleSet` and
 * `samples`. Bare arrays use the supplied fallback rule set, which keeps the
 * inspector convenient while requiring callers to make the rule version
 * explicit at the application boundary.
 */
export function parseCalendarEvidencePayload(
  input: unknown,
  fallbackRuleSet: CalendarRuleSet,
): CalendarEvidencePayload {
  const value = typeof input === "string" ? parseJson(input) : input;
  let samples: unknown;
  let ruleSet: unknown = fallbackRuleSet;
  if (Array.isArray(value)) {
    samples = value;
  } else if (isRecord(value)) {
    assertExactKeys(value, PAYLOAD_KEYS, "历法样例包");
    samples = value.samples;
    if ("ruleSet" in value) ruleSet = value.ruleSet;
  } else {
    throw new TypeError("历法样例包必须是数组或包含 samples 的对象");
  }
  if (!Array.isArray(samples)) throw new TypeError("历法样例包必须包含 samples 数组");
  assertCalendarRuleSet(ruleSet);
  assertCalendarEvidenceSet(samples, ruleSet);
  return {
    ruleSet,
    samples,
  };
}

function sameStringArray(actual: unknown, expected: readonly string[]): boolean {
  return Array.isArray(actual)
    && actual.length === expected.length
    && actual.every((item, index) => item === expected[index]);
}

function sameCoverage(actual: unknown, expected: CalendarEvidenceCoverage): boolean {
  if (!isRecord(actual)) return false;
  assertExactKeys(
    actual,
    new Set(["ruleVersion", "sampleCount", "verifiedSampleCount", "byBoundary", "missingBoundaries", "unverifiedSampleIds", "complete"]),
    "历法校验报告覆盖",
  );
  if (actual.ruleVersion !== expected.ruleVersion
    || actual.sampleCount !== expected.sampleCount
    || actual.verifiedSampleCount !== expected.verifiedSampleCount
    || actual.complete !== expected.complete
    || !sameStringArray(actual.missingBoundaries, expected.missingBoundaries)
    || !sameStringArray(actual.unverifiedSampleIds, expected.unverifiedSampleIds)) {
    return false;
  }
  if (!isRecord(actual.byBoundary)) return false;
  const actualByBoundary = actual.byBoundary;
  const expectedBoundaries = Object.keys(expected.byBoundary) as Array<keyof CalendarEvidenceCoverage["byBoundary"]>;
  if (Object.keys(actualByBoundary).length !== expectedBoundaries.length
    || expectedBoundaries.some((boundary) => !(boundary in actualByBoundary))) {
    return false;
  }
  return expectedBoundaries.every((boundary) => {
    const actualBoundary = actualByBoundary[boundary];
    const expectedBoundary = expected.byBoundary[boundary];
    if (!isRecord(actualBoundary)) return false;
    assertExactKeys(actualBoundary, new Set(["sampleIds", "verifiedSampleIds"]), "历法校验报告边界覆盖");
    return sameStringArray(actualBoundary.sampleIds, expectedBoundary.sampleIds)
      && sameStringArray(actualBoundary.verifiedSampleIds, expectedBoundary.verifiedSampleIds);
  });
}

/**
 * Parse a report produced by `serializeCalendarEvidenceValidationReport`.
 * Coverage is recomputed from the payload, so a hand-edited report cannot be
 * mistaken for evidence that has passed the actual boundary checks.
 */
export function parseCalendarEvidenceValidationReport(
  input: unknown,
  fallbackRuleSet: CalendarRuleSet,
): CalendarEvidenceValidationReport {
  const value = typeof input === "string" ? parseJson(input) : input;
  if (!isRecord(value)) throw new TypeError("历法校验报告必须是对象");
  assertExactKeys(value, REPORT_KEYS, "历法校验报告");
  if (value.reportVersion !== 1) throw new TypeError("历法校验报告版本不受支持");
  const preview = previewCalendarEvidencePayload(
    { ruleSet: value.ruleSet, samples: value.samples },
    fallbackRuleSet,
  );
  if (!isRecord(value.coverage)) throw new TypeError("历法校验报告缺少 coverage");
  assertExactKeys(value.coverage, new Set(["allSamples", "ruleReferencedSamples"]), "历法校验报告覆盖");
  if (!sameCoverage(value.coverage.allSamples, preview.sampleCoverage)
    || !sameCoverage(value.coverage.ruleReferencedSamples, preview.ruleCoverage)) {
    throw new TypeError("历法校验报告覆盖结果与样例不一致");
  }
  return {
    reportVersion: 1,
    ruleSet: preview.ruleSet,
    samples: preview.samples,
    coverage: {
      allSamples: preview.sampleCoverage,
      ruleReferencedSamples: preview.ruleCoverage,
    },
  };
}

/** Validate and return the two coverage views shown to content reviewers. */
export function previewCalendarEvidencePayload(
  input: unknown,
  fallbackRuleSet: CalendarRuleSet,
): CalendarEvidencePayloadPreview {
  const payload = parseCalendarEvidencePayload(input, fallbackRuleSet);
  return {
    ...payload,
    sampleCoverage: inspectCalendarEvidenceCoverage(payload.samples),
    ruleCoverage: inspectCalendarEvidenceCoverage(payload.samples, payload.ruleSet),
  };
}

/**
 * Build a portable, non-persistent validation report for content handoff.
 * Re-parsing here is intentional: callers cannot forge the coverage values by
 * mutating a previously returned preview before downloading it.
 */
export function buildCalendarEvidenceValidationReport(
  input: unknown,
  fallbackRuleSet: CalendarRuleSet,
): CalendarEvidenceValidationReport {
  const preview = previewCalendarEvidencePayload(input, fallbackRuleSet);
  return {
    reportVersion: 1,
    ruleSet: preview.ruleSet,
    samples: preview.samples,
    coverage: {
      allSamples: preview.sampleCoverage,
      ruleReferencedSamples: preview.ruleCoverage,
    },
  };
}

export function serializeCalendarEvidenceValidationReport(
  input: unknown,
  fallbackRuleSet: CalendarRuleSet,
): string {
  return JSON.stringify(
    buildCalendarEvidenceValidationReport(input, fallbackRuleSet),
    null,
    2,
  );
}
