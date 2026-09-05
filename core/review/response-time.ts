/** Maximum duration retained for one answer attempt (24 hours). */
export const MAX_RESPONSE_TIME_MS = 24 * 60 * 60 * 1000;

/** Keep response-time telemetry bounded and safe for local statistics. */
export function isValidResponseTimeMs(value: unknown): value is number {
  return (
    typeof value === "number" &&
    Number.isInteger(value) &&
    value >= 0 &&
    value <= MAX_RESPONSE_TIME_MS
  );
}
