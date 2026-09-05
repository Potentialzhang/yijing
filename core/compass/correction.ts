import { normalizeDegrees } from "@/core/compass/directions";
import type { CompassCorrectionRecord } from "@/db/schema";

export const COMPASS_CORRECTION_LIMIT = 180 as const;

/** Keep a user-entered correction visible and bounded; do not infer it. */
export function normalizeCompassCorrection(value: number): number {
  if (!Number.isFinite(value)) throw new Error("罗盘修正值必须是数字");
  const bounded = Math.max(
    -COMPASS_CORRECTION_LIMIT,
    Math.min(COMPASS_CORRECTION_LIMIT, value),
  );
  return Object.is(bounded, -0) ? 0 : Number(bounded.toFixed(1));
}

/**
 * Apply the same bounded correction contract at the persistence boundary.
 * The form normalizes before submitting, but repository callers must not be
 * able to persist an out-of-range correction by bypassing that form.
 */
export function normalizeCompassCorrectionRecordForWrite(
  record: CompassCorrectionRecord,
): CompassCorrectionRecord {
  const offsetDegrees = normalizeCompassCorrection(record.offsetDegrees);
  return offsetDegrees === record.offsetDegrees
    ? record
    : { ...record, offsetDegrees };
}

/** Apply a visible manual offset to a live heading only. */
export function applyCompassCorrection(
  degrees: number,
  offsetDegrees: number,
): number {
  return normalizeDegrees(degrees + normalizeCompassCorrection(offsetDegrees));
}
