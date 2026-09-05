import type { ReviewAttempt, ReviewCardState } from "@/db/schema";
import { compareLocalDateStrings, isValidLocalDate } from "@/core/date/local";
import { isSupportedReviewAlgorithm, isValidReviewState } from "@/core/review/scheduler";

export interface TodayReviewSummary {
  completedSpacedCount: number;
  nextReviewDate: string | null;
}

/**
 * Summarize the review portion of today's task card.
 *
 * Only spaced attempts with a corresponding supported state count as
 * completed. The next date is taken from valid, supported states in the
 * future, so orphaned or malformed records cannot produce a misleading
 * completion message.
 */
export function summarizeTodayReviewTask(
  attempts: readonly ReviewAttempt[],
  states: readonly ReviewCardState[],
  today: string,
  knownCardIds: ReadonlySet<string>,
): TodayReviewSummary {
  if (!isValidLocalDate(today)) {
    return { completedSpacedCount: 0, nextReviewDate: null };
  }
  const knownStates = states.filter((state) => knownCardIds.has(state.cardId));
  const knownAttempts = attempts.filter((attempt) => knownCardIds.has(attempt.cardId));
  const stateByCard = new Map(knownStates.map((state) => [state.cardId, state]));
  const completed = new Set(
    knownAttempts
      .filter((attempt) => {
        const state = stateByCard.get(attempt.cardId);
        return attempt.localDate === today
          && attempt.reviewMode === "spaced"
          && state !== undefined
          && isSupportedReviewAlgorithm(state)
          && isValidReviewState(state);
      })
      .map((attempt) => attempt.cardId),
  );
  const nextReviewDate = knownStates
    .filter((state) =>
      isSupportedReviewAlgorithm(state)
      && isValidReviewState(state)
      && isValidLocalDate(state.dueDate)
      && compareLocalDateStrings(state.dueDate, today) > 0,
    )
    .map((state) => state.dueDate)
    .sort(compareLocalDateStrings)[0] ?? null;
  return { completedSpacedCount: completed.size, nextReviewDate };
}
