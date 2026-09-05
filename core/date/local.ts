/** Format a local calendar date without converting it through UTC. */
export function formatLocalDate(date = new Date()): string {
  if (Number.isNaN(date.getTime())) throw new RangeError("日期无效");
  const year = String(date.getFullYear()).padStart(4, "0");
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/** Capture one instant and derive both its persisted timestamp and local date. */
export function captureLocalNow(date = new Date()): { iso: string; localDate: string } {
  return { iso: date.toISOString(), localDate: formatLocalDate(date) };
}

/** Check a calendar date without converting it through UTC or accepting rollover. */
export function isValidLocalDate(value: string): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return false;
  const year = Number(match[1]);
  const month = Number(match[2]) - 1;
  const day = Number(match[3]);
  const date = new Date(0);
  date.setHours(12, 0, 0, 0);
  date.setFullYear(year, month, day);
  return (
    date.getFullYear() === year &&
    date.getMonth() === month &&
    date.getDate() === day
  );
}

/**
 * Format a persisted timestamp for display without allowing corrupt local
 * data to leak an "Invalid Date" string into the UI.
 */
export function formatLocalDateTime(
  value: string | Date,
  fallback = "日期待校验",
): string {
  const date = value instanceof Date
    ? value
    : isValidIsoTimestamp(value)
      ? new Date(value)
      : null;
  return !date || Number.isNaN(date.getTime()) ? fallback : date.toLocaleString("zh-CN");
}

/** Format only the calendar portion of a persisted timestamp safely. */
export function formatLocalDateLabel(
  value: string | Date,
  fallback = "日期待校验",
): string {
  const date = value instanceof Date
    ? value
    : isValidIsoTimestamp(value)
      ? new Date(value)
      : null;
  return !date || Number.isNaN(date.getTime())
    ? fallback
    : date.toLocaleDateString("zh-CN");
}

/**
 * Compare persisted ISO instants by their actual moment, not their textual
 * offset. Valid timestamps sort before malformed values so a bad legacy row
 * cannot become the apparent newest record.
 */
export function compareIsoTimestamps(a: string, b: string): number {
  const aTime = parseIsoTimestamp(a);
  const bTime = parseIsoTimestamp(b);
  const aValid = aTime !== null;
  const bValid = bTime !== null;
  if (aValid && bValid) return aTime - bTime;
  if (aValid) return -1;
  if (bValid) return 1;
  // Even malformed values need a locale-independent tie-breaker so lists
  // remain deterministic across browsers and user language settings.
  return a < b ? -1 : a > b ? 1 : 0;
}

/** Compare persisted YYYY-MM-DD strings without locale-dependent collation. */
export function compareLocalDateStrings(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/** Persisted timestamps must be unambiguous ISO instants, not Date.parse's
 * permissive legacy formats such as `0`, `2026`, or date-only values. */
export function isValidIsoTimestamp(value: string): boolean {
  if (typeof value !== "string") return false;
  return parseIsoTimestamp(value) !== null;
}

const ISO_INSTANT = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d+)?(?:Z|[+-]\d{2}:?\d{2})$/;

function parseIsoTimestamp(value: string): number | null {
  const match = ISO_INSTANT.exec(value);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const hour = Number(match[4]);
  const minute = Number(match[5]);
  const second = Number(match[6]);
  if (hour > 23 || minute > 59 || second > 59) return null;
  const calendarDate = new Date(Date.UTC(2000, month - 1, day));
  calendarDate.setUTCFullYear(year);
  if (
    calendarDate.getUTCFullYear() !== year ||
    calendarDate.getUTCMonth() !== month - 1 ||
    calendarDate.getUTCDate() !== day
  ) return null;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}
