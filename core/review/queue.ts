import type { Exercise } from "@/content/exercises";
import type { ReviewCardState } from "@/db/schema";
import { isSupportedReviewAlgorithm, isValidReviewState } from "@/core/review/scheduler";
import { isValidLocalDate } from "@/core/date/local";

const DEFAULT_DAILY_NEW_CARD_LIMIT = 10;
const DEFAULT_SESSION_BATCH_SIZE = 20;

export interface ReviewQueueSelection {
  /** All supported due cards followed by the allowed number of new cards. */
  ordered: readonly Exercise[];
  /** The first session-sized batch shown to the learner. */
  firstBatch: readonly Exercise[];
  /** New cards in the full queue, used to label immediate practice. */
  fresh: readonly Exercise[];
  /** Cards with an explicit unsupported scheduler version. */
  unsupportedCardCount: number;
  /** Supported cards whose persisted scheduler state is malformed and was isolated. */
  invalidCardCount: number;
  batchSize: number;
}

export interface ReviewQueueBatch {
  items: readonly Exercise[];
  nextOffset: number;
}

/**
 * Build an explicit one-card practice queue from a learner's local target.
 * Choosing “立即再练” is an explicit learner action and may practice a card
 * that is not currently due, but it must still honor scheduler support and
 * persisted-date safety checks. Unknown or damaged targets fall back to the
 * normal queue so stale links cannot select an unexpected card.
 */
export function focusReviewCard(
  selection: ReviewQueueSelection,
  exercises: readonly Exercise[],
  states: readonly ReviewCardState[],
  focusCardId?: string | null,
): ReviewQueueSelection {
  if (!focusCardId) return selection;
  const focused = exercises.find((exercise) => exercise.id === focusCardId);
  if (!focused) return selection;
  const state = states.find((candidate) => candidate.cardId === focusCardId);
  if (!isSupportedReviewAlgorithm(state)) return selection;
  if (state && !isValidReviewState(state)) return selection;

  return {
    ...selection,
    ordered: [focused],
    firstBatch: [focused],
    fresh: state ? [] : [focused],
  };
}

/**
 * Return the cards that are actually due today.
 *
 * The dashboard uses this same predicate as the review session so a malformed
 * date or an unsupported scheduler version cannot make the two surfaces show
 * different counts. Invalid `today` values produce an empty result instead of
 * falling back to a lexicographic comparison.
 */
export function getDueReviewCards(
  exercises: readonly Exercise[],
  states: readonly ReviewCardState[],
  today: string,
): readonly Exercise[] {
  if (!isValidLocalDate(today)) return [];
  const stateByCardId = new Map(states.map((state) => [state.cardId, state]));
  return exercises.filter((exercise) => {
    const state = stateByCardId.get(exercise.id);
    return (
      state !== undefined &&
      isSupportedReviewAlgorithm(state) &&
      isValidReviewState(state) &&
      state.dueDate <= today
    );
  });
}

function normalizePositiveLimit(value: number, fallback: number): number {
  if (!Number.isSafeInteger(value) || value < 1) return fallback;
  // Preferences already enforce a much smaller range. This upper bound keeps
  // a malformed imported value from creating an unbounded session in memory.
  return Math.min(value, 1_000);
}

/**
 * Build the deterministic review order used by both the page and tests.
 *
 * Due cards retain content order, then unseen cards are appended in content
 * order up to the daily new-card limit. Unsupported explicit scheduler
 * versions are excluded rather than silently interpreted by the active
 * algorithm; legacy records without a version remain compatible.
 */
export function buildReviewQueue(
  exercises: readonly Exercise[],
  states: readonly ReviewCardState[],
  today: string,
  dailyNewCardLimit: number,
  sessionBatchSize: number,
): ReviewQueueSelection {
  const dailyLimit = normalizePositiveLimit(
    dailyNewCardLimit,
    DEFAULT_DAILY_NEW_CARD_LIMIT,
  );
  const batchSize = normalizePositiveLimit(
    sessionBatchSize,
    DEFAULT_SESSION_BATCH_SIZE,
  );
  const stateByCardId = new Map(states.map((state) => [state.cardId, state]));
  const supported = exercises.filter((exercise) =>
    isSupportedReviewAlgorithm(stateByCardId.get(exercise.id)),
  );
  const unsupportedCardCount = exercises.length - supported.length;
  const invalidCardIds = new Set(
    supported
      .map((exercise) => stateByCardId.get(exercise.id))
      .filter((state): state is ReviewCardState => state !== undefined && !isValidReviewState(state))
      .map((state) => state.cardId),
  );
  const invalidCardCount = invalidCardIds.size;
  const schedulable = supported.filter((exercise) => !invalidCardIds.has(exercise.id));
  const due = getDueReviewCards(exercises, states, today);
  const fresh = schedulable
    .filter((exercise) => !stateByCardId.has(exercise.id))
    .slice(0, dailyLimit);
  const ordered = [...due, ...fresh];

  return {
    ordered,
    firstBatch: ordered.slice(0, batchSize),
    fresh,
    unsupportedCardCount,
    invalidCardCount,
    batchSize,
  };
}

/** Return the next session batch and its safe continuation offset. */
export function getNextReviewBatch(
  ordered: readonly Exercise[],
  offset: number,
  batchSize: number,
): ReviewQueueBatch {
  const safeOffset = Number.isSafeInteger(offset)
    ? Math.max(0, offset)
    : 0;
  const safeBatchSize = normalizePositiveLimit(
    batchSize,
    DEFAULT_SESSION_BATCH_SIZE,
  );
  const items = ordered.slice(safeOffset, safeOffset + safeBatchSize);
  return {
    items,
    nextOffset: Math.min(ordered.length, safeOffset + items.length),
  };
}
