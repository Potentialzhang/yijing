import type { ReviewAttempt, ReviewCardState } from "@/db/schema";
import { compareIsoTimestamps } from "@/core/date/local";
import { isAttemptCorrect } from "@/core/review/stats";
import { isSupportedReviewAlgorithm, isValidReviewState } from "@/core/review/scheduler";

export interface ReviewConfusionError {
  promptSnapshot: string;
  answerSnapshot: string;
  selfExplanation?: string;
  reviewedAt: string;
}

export interface ReviewConfusionSummary {
  cardId: string;
  targetType: string | null;
  targetId: string | null;
  attemptCount: number;
  correctCount: number;
  errorCount: number;
  accuracy: number;
  latestError: ReviewConfusionError;
}

export interface ReviewConfusionOptions {
  /** Keep the UI bounded while still allowing callers to request all rows. */
  limit?: number;
  /** Exclude stale/orphaned attempts when a current exercise catalog is known. */
  knownCardIds?: ReadonlySet<string>;
}

interface MutableSummary {
  cardId: string;
  targetType: string | null;
  targetId: string | null;
  attemptCount: number;
  correctCount: number;
  errorCount: number;
  latestError: ReviewConfusionError | null;
}

/**
 * Aggregate concrete mistakes from local review history.
 *
 * This is deliberately deterministic and non-interpretive: it reports only
 * what was answered incorrectly (or marked forgotten), never infers a
 * learner's personality or invents a reason for the mistake. The latest
 * error keeps immutable prompt/answer snapshots for historical review.
 */
export function summarizeReviewConfusions(
  attempts: readonly ReviewAttempt[],
  states: readonly ReviewCardState[] = [],
  options: ReviewConfusionOptions = {},
): readonly ReviewConfusionSummary[] {
  const knownCardIds = options.knownCardIds;
  const stateByCard = new Map(states.map((state) => [state.cardId, state]));
  const grouped = new Map<string, MutableSummary>();

  attempts.forEach((attempt) => {
    if (
      !attempt ||
      typeof attempt.cardId !== "string" ||
      attempt.cardId.trim().length === 0 ||
      (knownCardIds && !knownCardIds.has(attempt.cardId))
    ) {
      return;
    }
    const state = stateByCard.get(attempt.cardId);
    // Preserve the legacy optional-state behavior for callers that only have
    // an attempt list, but never surface a present state that the scheduler
    // cannot safely interpret.
    if (state && (!isSupportedReviewAlgorithm(state) || !isValidReviewState(state))) return;
    const current = grouped.get(attempt.cardId) ?? {
      cardId: attempt.cardId,
      targetType: state?.targetType ?? attempt.targetType ?? null,
      targetId: state?.targetId ?? null,
      attemptCount: 0,
      correctCount: 0,
      errorCount: 0,
      latestError: null,
    };
    current.attemptCount += 1;
    if (isAttemptCorrect(attempt)) {
      current.correctCount += 1;
    } else {
      current.errorCount += 1;
      const error: ReviewConfusionError = {
        promptSnapshot: attempt.promptSnapshot,
        answerSnapshot: attempt.answerSnapshot,
        ...(attempt.selfExplanation ? { selfExplanation: attempt.selfExplanation } : {}),
        reviewedAt: attempt.reviewedAt,
      };
      if (
        current.latestError === null ||
        compareIsoTimestamps(error.reviewedAt, current.latestError.reviewedAt) > 0
      ) {
        current.latestError = error;
      }
    }
    grouped.set(attempt.cardId, current);
  });

  const limit = normalizeLimit(options.limit);
  return [...grouped.values()]
    .filter(
      (item): item is MutableSummary & { latestError: ReviewConfusionError } =>
        item.errorCount > 0 && item.latestError !== null,
    )
    .map((item) => ({
      cardId: item.cardId,
      targetType: item.targetType,
      targetId: item.targetId,
      attemptCount: item.attemptCount,
      correctCount: item.correctCount,
      errorCount: item.errorCount,
      accuracy: Math.round((item.correctCount / item.attemptCount) * 100),
      latestError: item.latestError,
    }))
    .sort(
      (a, b) =>
        b.errorCount - a.errorCount ||
        a.accuracy - b.accuracy ||
        compareIsoTimestamps(b.latestError.reviewedAt, a.latestError.reviewedAt) ||
        compareCodePoint(a.cardId, b.cardId),
    )
    .slice(0, limit);
}

function normalizeLimit(value: number | undefined): number {
  if (value === undefined || !Number.isFinite(value)) return 5;
  return Math.max(0, Math.floor(value));
}

function compareCodePoint(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}
