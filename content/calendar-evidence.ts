import {
  inspectCalendarEvidenceCoverage,
  assertCalendarEvidenceSet,
} from "@/core/calendar/evidence";
import type { CalendarEvidenceCoverage } from "@/core/calendar/evidence";
import { assertCalendarRuleSet, DRAFT_CALENDAR_RULE_SET } from "@/core/calendar/rules";
import { SOURCE_REGISTRY } from "@/content/sources";
import type {
  CalendarEvidenceSample,
  CalendarRuleSet,
} from "@/core/calendar/types";

export { CALENDAR_EVIDENCE_BOUNDARIES } from "@/core/calendar/evidence";

/**
 * Reviewer-owned calendar samples.  This registry intentionally starts empty:
 * no lunar, solar-term, or sexagenary fact is allowed into the application
 * until an owner supplies a source-backed sample and marks it verified.
 */
export const CALENDAR_EVIDENCE_SAMPLES: readonly CalendarEvidenceSample[] = [];

/** The rule set shipped before ADR-0002 and its evidence are accepted. */
export const CALENDAR_EVIDENCE_RULE_SET: CalendarRuleSet = DRAFT_CALENDAR_RULE_SET;

/** Validate the checked-in registry without calculating any calendar result. */
export function validateCalendarEvidenceRegistry(
  samples: readonly CalendarEvidenceSample[] = CALENDAR_EVIDENCE_SAMPLES,
  ruleSet: CalendarRuleSet = CALENDAR_EVIDENCE_RULE_SET,
  knownSourceIds: readonly string[] = SOURCE_REGISTRY.map((source) => source.id),
): void {
  const knownSources = new Set(knownSourceIds);
  if (knownSources.size !== knownSourceIds.length || knownSourceIds.some((id) => !id.trim())) {
    throw new TypeError("历法交接来源索引存在重复或空 ID");
  }
  assertCalendarRuleSet(ruleSet);
  const usesGlobalSourceRegistry =
    knownSourceIds.length === SOURCE_REGISTRY.length &&
    knownSourceIds.every((id) => SOURCE_REGISTRY.some((source) => source.id === id));
  const sourceById = new Map(SOURCE_REGISTRY.map((source) => [source.id, source]));
  const assertKnownSources = (sourceIds: readonly string[], label: string): void => {
    sourceIds.forEach((sourceId) => {
      if (!knownSources.has(sourceId)) throw new TypeError(`${label}引用了未登记来源：${sourceId}`);
    });
  };
  assertKnownSources(ruleSet.sourceIds, `历法规则集 ${ruleSet.id}`);
  if (
    usesGlobalSourceRegistry &&
    ruleSet.status === "accepted" &&
    ruleSet.sourceIds.some((sourceId) => sourceById.get(sourceId)?.status !== "verified")
  ) {
    throw new TypeError(`accepted 历法规则集 ${ruleSet.id} 引用了未核验来源`);
  }
  assertCalendarEvidenceSet(samples, ruleSet);
  samples.forEach((sample) => {
    assertKnownSources(sample.sourceIds, `历法样例 ${sample.id}`);
    if (sample.expected.solarTerm) {
      if (sample.expected.solarTerm.sourceIds.some((sourceId) => !ruleSet.sourceIds.includes(sourceId))) {
        throw new TypeError(`历法样例 ${sample.id} 的节气结果引用了规则集未登记的来源`);
      }
      assertKnownSources(sample.expected.solarTerm.sourceIds, `历法样例 ${sample.id} 的节气结果`);
    }
  });
}

/** Return the deterministic hand-off coverage used by the review page/export. */
export function getCalendarEvidenceCoverage(): CalendarEvidenceCoverage {
  validateCalendarEvidenceRegistry();
  return inspectCalendarEvidenceCoverage(
    CALENDAR_EVIDENCE_SAMPLES,
    CALENDAR_EVIDENCE_RULE_SET,
  );
}
