/**
 * M2-B calendar contracts.
 *
 * These types deliberately describe inputs, rule boundaries and explainable
 * outputs. They do not calculate a lunar date or a sexagenary value until
 * ADR-0002 has been accepted and authoritative samples are available.
 */
export type CalendarRuleVersion = string;

export interface CalendarInput {
  /** ISO 8601 timestamp. A local ISO datetime is interpreted in `timeZone`. */
  instant: string;
  /** IANA time zone such as `Asia/Shanghai`. */
  timeZone: string;
  /** Explicit rule-set identifier; never silently defaults in a calculation. */
  ruleVersion: CalendarRuleVersion;
}

export type CalendarBoundaryChoice =
  | "lunar-new-year"
  | "lichun"
  | "lunar-month"
  | "solar-term-month"
  | "civil-midnight"
  | "zi-hour"
  | "true-solar-time"
  | "pending";

export interface CalendarRuleSet {
  id: CalendarRuleVersion;
  yearBoundary: Extract<CalendarBoundaryChoice, "lunar-new-year" | "lichun" | "pending">;
  monthBoundary: Extract<CalendarBoundaryChoice, "lunar-month" | "solar-term-month" | "pending">;
  dayBoundary: Extract<CalendarBoundaryChoice, "civil-midnight" | "zi-hour" | "true-solar-time" | "pending">;
  timeZoneBasis: "standard-time" | "true-solar-time" | "pending";
  /** Registered source IDs supporting the selected boundary decisions. */
  sourceIds: readonly string[];
  /** IDs of independently reviewed authoritative samples for this version. */
  authoritativeSampleIds: readonly string[];
  status: "draft" | "accepted";
}

export interface GregorianDateParts {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  /** Seconds may include a fractional part, normalized to millisecond precision. */
  second: number;
}

export type CalendarTimeBasis = "explicit-offset" | "time-zone";
export type CalendarTimeStatus = "resolved" | "ambiguous" | "nonexistent";

/**
 * Explain how the entered ISO value was interpreted before any calendar rule
 * is applied.  A local wall time can be ambiguous or nonexistent around a
 * daylight-saving transition, so callers must not silently invent an instant.
 */
export interface CalendarTimeInterpretation {
  basis: CalendarTimeBasis;
  status: CalendarTimeStatus;
  /** Canonical wall-clock fields used for the Gregorian preview. */
  localDateTime: string;
  /** The resolved absolute instant, when the mapping is unambiguous. */
  utcInstant: string | null;
  /** Offset used for the resolved instant, in minutes east of UTC. */
  offsetMinutes: number | null;
}

export interface LunarDateParts {
  year: number;
  month: number;
  day: number;
  isLeapMonth: boolean;
}

export interface SolarTermEvent {
  name: string;
  occurredAt: string;
  timeZone: string;
  precision: "instant" | "minute" | "date";
  sourceIds: readonly string[];
}

export type CalendarEvidenceBoundary =
  | "year"
  | "month"
  | "day"
  | "zi-hour"
  | "time-zone"
  | "solar-term";

export interface SexagenaryValue {
  label: string;
  stemId: string;
  branchId: string;
  basis: "year" | "month" | "day" | "hour";
  boundary: CalendarBoundaryChoice;
  ruleVersion: CalendarRuleVersion;
}

/**
 * A reviewer-supplied expected result used to validate a future calculation
 * implementation.  It deliberately carries no computed value by itself;
 * samples remain data owned by the content reviewer.
 */
export interface CalendarEvidenceSample {
  id: string;
  title: string;
  ruleVersion: CalendarRuleVersion;
  boundary: CalendarEvidenceBoundary;
  input: CalendarInput;
  expected: {
    localDateTime: string;
    utcInstant: string | null;
    lunar: LunarDateParts | null;
    solarTerm: SolarTermEvent | null;
    sexagenary: Partial<Record<"year" | "month" | "day" | "hour", SexagenaryValue>>;
  };
  sourceIds: readonly string[];
  status: "pending" | "verified";
}

export interface CalendarReading {
  input: CalendarInput;
  ruleSet: CalendarRuleSet;
  gregorian: GregorianDateParts;
  timeInterpretation: CalendarTimeInterpretation;
  lunar: LunarDateParts | null;
  solarTerm: SolarTermEvent | null;
  sexagenary: Partial<Record<"year" | "month" | "day" | "hour", SexagenaryValue>>;
  explanation: readonly string[];
  sourceIds: readonly string[];
  status: "pending-rules" | "calculated";
}
