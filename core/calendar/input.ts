import type {
  CalendarInput,
  CalendarTimeInterpretation,
  GregorianDateParts,
} from "@/core/calendar/types";

const ISO_DATE_TIME = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}(?:\.\d{1,9})?))?(Z|[+-]\d{2}:?\d{2})?$/;
const CALENDAR_INPUT_KEYS = new Set(["instant", "timeZone", "ruleVersion"]);

interface ParsedDateTime {
  parts: GregorianDateParts;
  hasExplicitOffset: boolean;
}

function parseDateTime(value: string): ParsedDateTime | null {
  const match = ISO_DATE_TIME.exec(value);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const hour = Number(match[4]);
  const minute = Number(match[5]);
  const second = match[6] ? Number(match[6]) : 0;
  if (year < 1 || month < 1 || month > 12 || day < 1 || hour > 23 || minute > 59 || second > 59) return null;
  // Date.UTC treats years 0–99 as 1900–1999. Construct from a neutral year
  // and then set the full year so the validation also works for year 1–99.
  const calendarDate = new Date(Date.UTC(2000, month - 1, day));
  calendarDate.setUTCFullYear(year);
  if (
    calendarDate.getUTCFullYear() !== year ||
    calendarDate.getUTCMonth() !== month - 1 ||
    calendarDate.getUTCDate() !== day
  ) return null;
  if (match[7]) {
    // Do not rely solely on Date.parse for offset validation. Browser
    // runtimes differ in how permissively they accept malformed offsets;
    // keep the input contract deterministic before parsing the instant.
    if (match[7] !== "Z") {
      const offset = /^([+-])(\d{2}):?(\d{2})$/.exec(match[7]);
      if (!offset || Number(offset[2]) > 23 || Number(offset[3]) > 59) return null;
    }
    if (Number.isNaN(Date.parse(value))) return null;
  }
  return {
    parts: { year, month, day, hour, minute, second },
    hasExplicitOffset: Boolean(match[7]),
  };
}

function isValidDateTime(value: string): boolean {
  return Boolean(parseDateTime(value));
}

function isValidTimeZone(value: string): boolean {
  try {
    new Intl.DateTimeFormat("en", { timeZone: value }).format();
    return true;
  } catch {
    return false;
  }
}

export function assertCalendarInput(input: unknown): asserts input is CalendarInput {
  if (!input || typeof input !== "object") throw new TypeError("历法输入必须是对象");
  const candidate = input as Partial<CalendarInput>;
  if (Object.keys(candidate).some((key) => !CALENDAR_INPUT_KEYS.has(key)))
    throw new TypeError("历法输入包含未声明字段");
  if (typeof candidate.instant !== "string" || !isValidDateTime(candidate.instant)) throw new TypeError("历法输入的时间必须是有效 ISO 日期时间");
  if (typeof candidate.timeZone !== "string" || !isValidTimeZone(candidate.timeZone)) throw new TypeError("历法输入的时区必须是有效 IANA 时区");
  if (typeof candidate.ruleVersion !== "string" || !candidate.ruleVersion.trim()) throw new TypeError("历法输入必须指定规则版本");
}

export function normalizeCalendarInput(input: CalendarInput): CalendarInput {
  assertCalendarInput(input);
  return { instant: input.instant, timeZone: input.timeZone, ruleVersion: input.ruleVersion.trim() };
}

function wallTimeEpoch(parts: GregorianDateParts): number {
  const wholeSecond = Math.trunc(parts.second);
  const millisecond = millisecondsFromSecond(parts.second);
  const value = new Date(Date.UTC(2000, parts.month - 1, parts.day, parts.hour, parts.minute, wholeSecond));
  value.setUTCFullYear(parts.year);
  value.setUTCMilliseconds(millisecond);
  return value.getTime();
}

function millisecondsFromSecond(second: number): number {
  // Date has millisecond precision. Truncate additional ISO digits instead
  // of rounding 59.999… into the following minute.
  return Math.min(999, Math.floor((second - Math.trunc(second)) * 1_000 + 1e-7));
}

// Formatting the same zone is hot on repeated reviews. Keep one formatter per
// IANA zone instead of rebuilding it for every transition sample.
const formatterCache = new Map<string, Intl.DateTimeFormat>();

function formatterForTimeZone(timeZone: string): Intl.DateTimeFormat {
  const cached = formatterCache.get(timeZone);
  if (cached) return cached;
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    calendar: "gregory",
    numberingSystem: "latn",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  });
  formatterCache.set(timeZone, formatter);
  return formatter;
}

function partsFromFormatter(date: Date, timeZone: string): GregorianDateParts {
  const formatter = formatterForTimeZone(timeZone);
  const values = Object.fromEntries(
    formatter.formatToParts(date).map((part) => [part.type, part.value]),
  );
  return {
    year: Number(values.year),
    month: Number(values.month),
    day: Number(values.day),
    hour: Number(values.hour),
    minute: Number(values.minute),
    second: Number(values.second) + date.getUTCMilliseconds() / 1_000,
  };
}

function sameDateTime(left: GregorianDateParts, right: GregorianDateParts): boolean {
  return (
    left.year === right.year &&
    left.month === right.month &&
    left.day === right.day &&
    left.hour === right.hour &&
    left.minute === right.minute &&
    Math.trunc(left.second) === Math.trunc(right.second) &&
    millisecondsFromSecond(left.second) === millisecondsFromSecond(right.second)
  );
}

function canonicalDateTime(parts: GregorianDateParts): string {
  const wholeSecond = Math.trunc(parts.second);
  const millisecond = millisecondsFromSecond(parts.second);
  const fraction = millisecond ? `.${String(millisecond).padStart(3, "0")}` : "";
  return `${String(parts.year).padStart(4, "0")}-${String(parts.month).padStart(2, "0")}-${String(parts.day).padStart(2, "0")}T${String(parts.hour).padStart(2, "0")}:${String(parts.minute).padStart(2, "0")}:${String(wholeSecond).padStart(2, "0")}${fraction}`;
}

/**
 * Resolve the input instant for review purposes only. This does not apply any
 * lunar, solar-term, or sexagenary rule. Explicit-offset values are converted
 * into the requested display timezone; local values are matched against the
 * IANA timezone without consulting the server timezone.
 */
export function interpretCalendarTime(input: CalendarInput): {
  gregorian: GregorianDateParts;
  interpretation: CalendarTimeInterpretation;
} {
  const normalized = normalizeCalendarInput(input);
  const parsed = parseDateTime(normalized.instant);
  if (!parsed) throw new TypeError("无法解析历法输入的日期时间");

  if (parsed.hasExplicitOffset) {
    const date = new Date(normalized.instant);
    const gregorian = partsFromFormatter(date, normalized.timeZone);
    const offsetMinutes = Math.round((wallTimeEpoch(gregorian) - date.getTime()) / 60_000);
    return {
      gregorian,
      interpretation: {
        basis: "explicit-offset",
        status: "resolved",
        localDateTime: canonicalDateTime(gregorian),
        utcInstant: date.toISOString(),
        offsetMinutes,
      },
    };
  }

  const wall = parsed.parts;
  const target = wallTimeEpoch(wall);
  const offsets = new Set<number>();
  // Sample a broad window around the wall time to discover both sides of a
  // DST/date-line transition, then verify each candidate against the zone.
  // Six-hour steps are sufficient to observe the stable offset on either side
  // while avoiding hundreds of formatter calls on a mobile submission.
  for (let delta = -72 * 60 * 60_000; delta <= 72 * 60 * 60_000; delta += 6 * 60 * 60_000) {
    const guess = new Date(target + delta);
    const displayed = partsFromFormatter(guess, normalized.timeZone);
    offsets.add(wallTimeEpoch(displayed) - guess.getTime());
  }
  const candidates = [...offsets]
    .map((offset) => new Date(target - offset))
    .filter((candidate) => sameDateTime(partsFromFormatter(candidate, normalized.timeZone), wall));
  const status: CalendarTimeInterpretation["status"] =
    candidates.length === 1 ? "resolved" : candidates.length > 1 ? "ambiguous" : "nonexistent";
  const candidate = status === "resolved" ? candidates[0] : undefined;
  return {
    gregorian: wall,
    interpretation: {
      basis: "time-zone",
      status,
      localDateTime: canonicalDateTime(wall),
      utcInstant: candidate ? candidate.toISOString() : null,
      offsetMinutes: candidate ? Math.round((target - candidate.getTime()) / 60_000) : null,
    },
  };
}
