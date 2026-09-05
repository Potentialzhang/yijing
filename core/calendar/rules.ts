import type { CalendarBoundaryChoice, CalendarRuleSet } from "@/core/calendar/types";

export interface CalendarBoundaryStatus {
  id: "year" | "month" | "day" | "zi-hour" | "solar-terms" | "true-solar-time";
  label: string;
  status: "pending" | "configured";
  detail: string;
}

/** The only rule set shipped before content review; it intentionally calculates nothing. */
export const DRAFT_CALENDAR_RULE_SET: CalendarRuleSet = {
  id: "calendar-draft-1",
  yearBoundary: "pending",
  monthBoundary: "pending",
  dayBoundary: "pending",
  timeZoneBasis: "pending",
  sourceIds: [],
  authoritativeSampleIds: [],
  status: "draft",
};

const YEAR_BOUNDARIES = new Set<CalendarRuleSet["yearBoundary"]>(["lunar-new-year", "lichun", "pending"]);
const MONTH_BOUNDARIES = new Set<CalendarRuleSet["monthBoundary"]>(["lunar-month", "solar-term-month", "pending"]);
const DAY_BOUNDARIES = new Set<CalendarRuleSet["dayBoundary"]>(["civil-midnight", "zi-hour", "true-solar-time", "pending"]);
const TIME_ZONE_BASES = new Set<CalendarRuleSet["timeZoneBasis"]>(["standard-time", "true-solar-time", "pending"]);
const CALENDAR_RULE_SET_KEYS = new Set([
  "id",
  "yearBoundary",
  "monthBoundary",
  "dayBoundary",
  "timeZoneBasis",
  "sourceIds",
  "authoritativeSampleIds",
  "status",
]);

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object";
}

function assertChoice<T extends string>(value: unknown, choices: Set<T>, label: string): asserts value is T {
  if (typeof value !== "string" || !choices.has(value as T)) throw new TypeError(`${label}不是受支持的规则选项`);
}

export function assertCalendarRuleSet(input: unknown): asserts input is CalendarRuleSet {
  if (!isObject(input)) throw new TypeError("历法规则集必须是对象");
  if (Object.keys(input).some((key) => !CALENDAR_RULE_SET_KEYS.has(key)))
    throw new TypeError("历法规则集包含未声明字段");
  if (typeof input.id !== "string" || !input.id.trim()) throw new TypeError("历法规则集必须有版本 ID");
  if (input.id !== input.id.trim()) throw new TypeError("历法规则集版本 ID 必须是已修剪的非空字符串");
  assertChoice(input.yearBoundary, YEAR_BOUNDARIES, "换年边界");
  assertChoice(input.monthBoundary, MONTH_BOUNDARIES, "换月边界");
  assertChoice(input.dayBoundary, DAY_BOUNDARIES, "换日边界");
  assertChoice(input.timeZoneBasis, TIME_ZONE_BASES, "时区基准");
  for (const [field, label] of [
    ["sourceIds", "历法规则来源"],
    ["authoritativeSampleIds", "历法权威样例"],
  ] as const) {
    const values = input[field];
    if (
      !Array.isArray(values) ||
      values.some(
        (value) =>
          typeof value !== "string" ||
          !value.trim() ||
          value !== value.trim(),
      )
    ) {
      throw new TypeError(`${label}必须是已修剪的非空字符串数组（草案可为空）`);
    }
    if (new Set(values).size !== values.length) throw new Error(`${label}不能重复`);
  }
  const sourceIds = input.sourceIds as string[];
  const authoritativeSampleIds = input.authoritativeSampleIds as string[];
  if (input.status !== "draft" && input.status !== "accepted") throw new TypeError("历法规则集状态无效");
  if (input.status === "accepted" && [input.yearBoundary, input.monthBoundary, input.dayBoundary, input.timeZoneBasis].includes("pending" as CalendarBoundaryChoice)) {
    throw new Error("未完成的边界规则不能标记为 accepted");
  }
  if (
    input.status === "accepted" &&
    (sourceIds.length === 0 || authoritativeSampleIds.length === 0)
  ) {
    throw new Error("已接受的历法规则必须关联来源和权威样例");
  }
}

type BoundaryChoice = CalendarBoundaryChoice | "standard-time";

const BOUNDARY_LABELS: Record<BoundaryChoice, string> = {
  "lunar-new-year": "农历正月初一",
  lichun: "立春",
  "lunar-month": "农历月界",
  "solar-term-month": "节气月界",
  "civil-midnight": "民用午夜",
  "zi-hour": "子时",
  "true-solar-time": "真太阳时",
  "standard-time": "标准时区（不采用真太阳时）",
  pending: "尚未确认",
};

function boundaryStatus(
  id: CalendarBoundaryStatus["id"],
  label: string,
  choice: BoundaryChoice,
): CalendarBoundaryStatus {
  return {
    id,
    label,
    status: choice === "pending" ? "pending" : "configured",
    detail: BOUNDARY_LABELS[choice],
  };
}

function explicitBoundaryStatus(
  id: CalendarBoundaryStatus["id"],
  label: string,
  detail: string,
): CalendarBoundaryStatus {
  return { id, label, status: "configured", detail };
}

/** Return the explicit boundary checklist without inferring a calendar result. */
export function describeCalendarBoundaries(
  ruleSet: CalendarRuleSet,
): readonly CalendarBoundaryStatus[] {
  assertCalendarRuleSet(ruleSet);
  return [
    boundaryStatus("year", "换年边界", ruleSet.yearBoundary),
    boundaryStatus("month", "换月边界", ruleSet.monthBoundary),
    boundaryStatus("day", "换日边界", ruleSet.dayBoundary),
    ruleSet.dayBoundary === "pending"
      ? boundaryStatus("zi-hour", "子时边界", "pending")
      : explicitBoundaryStatus(
          "zi-hour",
          "子时边界",
          ruleSet.dayBoundary === "zi-hour"
            ? "采用子时换日"
            : `不采用子时（${BOUNDARY_LABELS[ruleSet.dayBoundary]}）`,
        ),
    ruleSet.monthBoundary === "pending"
      ? boundaryStatus("solar-terms", "二十四节气边界", "pending")
      : explicitBoundaryStatus(
          "solar-terms",
          "二十四节气边界",
          ruleSet.monthBoundary === "solar-term-month"
            ? "采用节气月界"
            : "不采用节气月界（农历月界）",
        ),
    boundaryStatus("true-solar-time", "真太阳时边界", ruleSet.timeZoneBasis),
  ];
}
