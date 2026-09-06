import {
  inspectCalendarEvidenceCoverage,
  assertCalendarEvidenceSet,
} from "@/core/calendar/evidence";
import type { CalendarEvidenceCoverage } from "@/core/calendar/evidence";
import { CALENDAR_RULES } from "@/core/calendar/calculate";
import { assertCalendarRuleSet } from "@/core/calendar/rules";
import type {
  CalendarEvidenceBoundary,
  CalendarEvidenceSample,
  CalendarRuleSet,
  LunarDateParts,
  SexagenaryValue,
  SolarTermEvent,
} from "@/core/calendar/types";
import { SOURCE_REGISTRY } from "@/content/sources";

export { CALENDAR_EVIDENCE_BOUNDARIES } from "@/core/calendar/evidence";

const PRIMARY_RULE = CALENDAR_RULES[0];
const ZI_RULE = CALENDAR_RULES[1];
const SOURCE_IDS = ["source-lunar-typescript", "source-hko-calendar"] as const;
const STEM_IDS = ["jia", "yi", "bing", "ding", "wu", "ji", "geng", "xin", "ren", "gui"] as const;
const BRANCH_IDS = ["zi", "chou", "yin", "mao", "chen", "si", "wu", "wei", "shen", "you", "xu", "hai"] as const;
const STEM_NAMES = "甲乙丙丁戊己庚辛壬癸";
const BRANCH_NAMES = "子丑寅卯辰巳午未申酉戌亥";

function sexagenary(
  ruleVersion: string,
  basis: "year" | "month" | "day" | "hour",
  label: string,
  boundary: SexagenaryValue["boundary"],
): SexagenaryValue {
  return {
    label,
    stemId: STEM_IDS[STEM_NAMES.indexOf(label[0])] ?? "unknown-stem",
    branchId: BRANCH_IDS[BRANCH_NAMES.indexOf(label[1])] ?? "unknown-branch",
    basis,
    boundary,
    ruleVersion,
  };
}

function solarTerm(name: string, occurredAt: string): SolarTermEvent {
  return { name, occurredAt, timeZone: "Asia/Shanghai", precision: "minute", sourceIds: ["source-lunar-typescript"] };
}

function sample(
  rule: CalendarRuleSet,
  boundary: CalendarEvidenceBoundary,
  id: string,
  title: string,
  instant: string,
  localDateTime: string,
  utcInstant: string,
  lunar: LunarDateParts,
  expectedSexagenary: Partial<Record<"year" | "month" | "day" | "hour", SexagenaryValue>> = {},
  expectedSolarTerm: SolarTermEvent | null = null,
): CalendarEvidenceSample {
  return {
    id,
    title,
    ruleVersion: rule.id,
    boundary,
    input: { instant, timeZone: instant.endsWith("Z") ? "America/New_York" : "Asia/Shanghai", ruleVersion: rule.id },
    expected: {
      localDateTime,
      utcInstant,
      lunar,
      solarTerm: expectedSolarTerm,
      sexagenary: expectedSexagenary,
    },
    sourceIds: [...SOURCE_IDS],
    status: "verified",
  };
}

function samplesFor(rule: CalendarRuleSet, prefix: "midnight" | "zi"): CalendarEvidenceSample[] {
  const dayBoundary = rule.dayBoundary;
  const year = sexagenary(rule.id, "year", "丙午", "lichun");
  const month = sexagenary(rule.id, "month", "庚寅", "solar-term-month");
  const dayBeforeMidnight = sexagenary(rule.id, "day", "己酉", dayBoundary);
  const hourBeforeMidnight = sexagenary(rule.id, "hour", "甲子", dayBoundary);
  const dayAfterZi = sexagenary(rule.id, "day", "庚戌", dayBoundary);
  const hourAfterZi = sexagenary(rule.id, "hour", "丙子", dayBoundary);
  const monthAfterJingzhe = sexagenary(rule.id, "month", "辛卯", "solar-term-month");
  const dayNewYork = sexagenary(rule.id, "day", "戊申", dayBoundary);
  const hourNewYork = sexagenary(rule.id, "hour", "庚申", dayBoundary);
  const ids = {
    year: `calendar-${prefix}-year-2026`,
    month: `calendar-${prefix}-month-2026`,
    day: `calendar-${prefix}-day-2026`,
    zi: `calendar-${prefix}-zi-hour-2026`,
    timeZone: `calendar-${prefix}-time-zone-2026`,
    solarTerm: `calendar-${prefix}-solar-term-2026`,
  };
  return [
    sample(rule, "year", ids.year, "2026 立春后换年样例", "2026-02-04T04:03:00", "2026-02-04T04:03:00", "2026-02-03T20:03:00.000Z", { year: 2025, month: 12, day: 17, isLeapMonth: false }, { year, month }, solarTerm("立春", "2026-02-03T20:02:08.000Z")),
    sample(rule, "month", ids.month, "2026 惊蛰后换月样例", "2026-03-05T22:59:00", "2026-03-05T22:59:00", "2026-03-05T14:59:00.000Z", { year: 2026, month: 1, day: 17, isLeapMonth: false }, { month: monthAfterJingzhe }),
    sample(rule, "day", ids.day, "民用午夜换日样例", "2026-02-05T00:00:00", "2026-02-05T00:00:00", "2026-02-04T16:00:00.000Z", { year: 2025, month: 12, day: 18, isLeapMonth: false }, { day: dayAfterZi }),
    sample(rule, "zi-hour", ids.zi, "子时边界样例", "2026-02-04T23:30:00", "2026-02-04T23:30:00", "2026-02-04T15:30:00.000Z", { year: 2025, month: 12, day: 17, isLeapMonth: false }, { day: prefix === "zi" ? dayAfterZi : dayBeforeMidnight, hour: prefix === "zi" ? hourAfterZi : hourBeforeMidnight }),
    sample(rule, "time-zone", ids.timeZone, "跨时区同一瞬间样例", "2026-02-03T20:03:00Z", "2026-02-03T15:03:00", "2026-02-03T20:03:00.000Z", { year: 2025, month: 12, day: 17, isLeapMonth: false }, { day: dayNewYork, hour: hourNewYork }),
    sample(rule, "solar-term", ids.solarTerm, "立春节气瞬间样例", "2026-02-04T04:03:00", "2026-02-04T04:03:00", "2026-02-03T20:03:00.000Z", { year: 2025, month: 12, day: 17, isLeapMonth: false }, { year, month }, solarTerm("立春", "2026-02-03T20:02:08.000Z")),
  ];
}

/** Source-backed, reviewed samples for both shipped calculation rules. */
export const CALENDAR_EVIDENCE_SAMPLES: readonly CalendarEvidenceSample[] = [
  ...samplesFor(PRIMARY_RULE, "midnight"),
  ...samplesFor(ZI_RULE, "zi"),
];

/** The standard civil-midnight rule shown by the content audit page. */
export const CALENDAR_EVIDENCE_RULE_SET: CalendarRuleSet = PRIMARY_RULE;

/** Validate the checked-in registry against the source and evidence contracts. */
export function validateCalendarEvidenceRegistry(
  samples: readonly CalendarEvidenceSample[] = CALENDAR_EVIDENCE_SAMPLES,
  ruleSet: CalendarRuleSet = CALENDAR_EVIDENCE_RULE_SET,
  knownSourceIds: readonly string[] = SOURCE_REGISTRY.map((source) => source.id),
): void {
  const knownSources = new Set(knownSourceIds);
  if (knownSources.size !== knownSourceIds.length || knownSourceIds.some((id) => !id.trim())) throw new TypeError("历法交接来源索引存在重复或空 ID");
  assertCalendarRuleSet(ruleSet);
  const usesGlobalSourceRegistry = knownSourceIds.length === SOURCE_REGISTRY.length && knownSourceIds.every((id) => SOURCE_REGISTRY.some((source) => source.id === id));
  const sourceById = new Map(SOURCE_REGISTRY.map((source) => [source.id, source]));
  const assertKnownSources = (sourceIds: readonly string[], label: string): void => sourceIds.forEach((sourceId) => { if (!knownSources.has(sourceId)) throw new TypeError(`${label}引用了未登记来源：${sourceId}`); });
  assertKnownSources(ruleSet.sourceIds, `历法规则集 ${ruleSet.id}`);
  if (usesGlobalSourceRegistry && ruleSet.status === "accepted" && ruleSet.sourceIds.some((sourceId) => sourceById.get(sourceId)?.status !== "verified")) throw new TypeError(`accepted 历法规则集 ${ruleSet.id} 引用了未核验来源`);
  assertCalendarEvidenceSet(samples, ruleSet);
  samples.forEach((item) => {
    assertKnownSources(item.sourceIds, `历法样例 ${item.id}`);
    if (item.expected.solarTerm) {
      if (item.expected.solarTerm.sourceIds.some((sourceId) => !ruleSet.sourceIds.includes(sourceId))) throw new TypeError(`历法样例 ${item.id} 的节气结果引用了规则集未登记的来源`);
      assertKnownSources(item.expected.solarTerm.sourceIds, `历法样例 ${item.id} 的节气来源`);
    }
  });
}

/** Return the deterministic hand-off coverage used by the review page/export. */
export function getCalendarEvidenceCoverage(): CalendarEvidenceCoverage {
  validateCalendarEvidenceRegistry();
  return inspectCalendarEvidenceCoverage(CALENDAR_EVIDENCE_SAMPLES, CALENDAR_EVIDENCE_RULE_SET);
}
