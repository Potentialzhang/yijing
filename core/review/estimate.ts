import { isValidResponseTimeMs } from "@/core/review/response-time";

/**
 * A very long pause usually means the tab was backgrounded rather than that
 * the learner needs that long for every card. Keep ETA useful without
 * changing the persisted telemetry contract.
 */
export const MAX_USABLE_RESPONSE_TIME_MS = 5 * 60 * 1000;
export const DEFAULT_RESPONSE_TIME_MS = 60 * 1000;
export const MIN_ESTIMATE_RESPONSE_TIME_MS = 15 * 1000;

function median(values: readonly number[]): number {
  const ordered = [...values].sort((a, b) => a - b);
  const middle = Math.floor(ordered.length / 2);
  return ordered.length % 2 === 0
    ? (ordered[middle - 1] + ordered[middle]) / 2
    : ordered[middle];
}

/**
 * Estimate whole minutes for the cards still visible in the current batch.
 * Median valid response times are used so one slow/backgrounded attempt does
 * not dominate the estimate. With no usable history, retain the transparent
 * one-minute-per-card fallback used by the initial MVP.
 */
export function estimateReviewMinutes(
  remainingCards: number,
  responseTimesMs: readonly unknown[],
): number {
  if (!Number.isSafeInteger(remainingCards) || remainingCards <= 0) return 0;
  const samples = responseTimesMs
    .filter(isValidResponseTimeMs)
    .filter((value) => value <= MAX_USABLE_RESPONSE_TIME_MS);
  const typical = samples.length > 0 ? median(samples) : DEFAULT_RESPONSE_TIME_MS;
  const bounded = Math.max(MIN_ESTIMATE_RESPONSE_TIME_MS, typical);
  return Math.max(1, Math.ceil((remainingCards * bounded) / 60_000));
}
