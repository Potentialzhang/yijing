import type { Exercise } from "@/content/exercises";
import {
  REVIEW_ALGORITHM_VERSION,
  scheduleNext,
  type RecallGrade,
} from "@/core/review/scheduler";
import {
  assertReviewExerciseSnapshot,
  assertReviewSubmission,
  normalizeSelfExplanation,
} from "@/core/review/records";
import { yijingDb } from "@/db/schema";

type ReviewMode = "immediate" | "spaced";

type SaveReviewResultInput = {
  exercise: Exercise;
  grade: RecallGrade;
  objectiveCorrect: boolean;
  reviewMode?: ReviewMode;
  hintUsed: boolean;
  selfExplanation?: string;
  responseTimeMs?: number;
  now: string;
  localDate: string;
};

/** Persist the scheduler state and immutable attempt from one serialized read/write transaction. */
export async function saveReviewResult({
  exercise,
  grade,
  objectiveCorrect,
  reviewMode,
  hintUsed,
  selfExplanation,
  responseTimeMs,
  now,
  localDate,
}: SaveReviewResultInput): Promise<{ dueDate: string }> {
  assertReviewExerciseSnapshot(exercise);
  const normalizedSelfExplanation = normalizeSelfExplanation(selfExplanation);
  assertReviewSubmission({
    grade,
    objectiveCorrect,
    reviewMode,
    hintUsed,
    selfExplanation: normalizedSelfExplanation,
    responseTimeMs,
    now,
    localDate,
  });
  return yijingDb.transaction("rw", yijingDb.reviewCardStates, yijingDb.reviewAttempts, async () => {
    // Read inside the transaction. A read performed before opening this
    // transaction allows two tabs to schedule from the same stale step.
    const previous = await yijingDb.reviewCardStates.get(exercise.id);
    const current = previous ?? {
      cardId: exercise.id,
      targetType: exercise.targetType,
      targetId: exercise.targetId,
      algorithmVersion: REVIEW_ALGORITHM_VERSION,
      stepIndex: 0,
      dueDate: localDate,
      lapseCount: 0,
      consecutivePasses: 0,
      isWeak: false,
      updatedAt: now,
    };
    const next = scheduleNext(current, grade, localDate);
    await yijingDb.reviewCardStates.put({
      ...current,
      ...next,
      cardId: exercise.id,
      targetType: exercise.targetType,
      targetId: exercise.targetId,
      lastReviewedAt: now,
      updatedAt: now,
    });
    const attemptId = globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    await yijingDb.reviewAttempts.add({
      id: attemptId,
      cardId: exercise.id,
      exerciseVersion: 1,
      targetType: exercise.targetType,
      promptSnapshot: exercise.prompt,
      answerSnapshot: exercise.answer,
      objectiveCorrect,
      reviewMode: reviewMode ?? (previous ? "spaced" : "immediate"),
      hintUsed,
      ...(responseTimeMs === undefined ? {} : { responseTimeMs }),
      ...(normalizedSelfExplanation === undefined ? {} : { selfExplanation: normalizedSelfExplanation }),
      recallGrade: grade,
      reviewedAt: now,
      localDate,
    });
    return { dueDate: next.dueDate };
  });
}
