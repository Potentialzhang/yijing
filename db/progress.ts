import { REVIEW_EXERCISES } from "@/content/exercises";
import { compareIsoTimestamps, isValidIsoTimestamp, isValidLocalDate } from "@/core/date/local";
import { calculateMastery, masteryStatus } from "@/core/review/mastery";
import { REVIEW_ALGORITHM_VERSION } from "@/core/review/scheduler";
import { yijingDb, type ConceptProgress, type ReviewAttempt } from "@/db/schema";

/** Return the newest valid timestamp, keeping progress fields monotonic across tabs. */
export function latestIsoTimestamp(...timestamps: Array<string | undefined>): string | undefined {
  return timestamps
    .filter((timestamp): timestamp is string => typeof timestamp === "string" && isValidIsoTimestamp(timestamp))
    .sort(compareIsoTimestamps)
    .at(-1);
}

function assertProgressTimestamp(now: string): void {
  if (typeof now !== "string" || !isValidIsoTimestamp(now)) {
    throw new TypeError("学习进度时间无效");
  }
}

/** Merge a lesson milestone without downgrading progress already earned from review history. */
export function buildLessonProgress(
  conceptId: string,
  minimumScore: number,
  previous: ConceptProgress | undefined,
  attempts: readonly ReviewAttempt[],
  now: string,
): ConceptProgress {
  assertProgressTimestamp(now);
  if (!Number.isFinite(minimumScore)) {
    throw new TypeError("课程里程碑分数必须是有限数字");
  }
  const attemptScore = attempts.length > 0
    ? calculateMastery([...attempts].sort((a, b) => compareIsoTimestamps(a.reviewedAt, b.reviewedAt)).map((attempt) => attempt.recallGrade))
    : 0;
  const requestedScore = Math.max(0, Math.min(100, minimumScore));
  const previousScore = typeof previous?.masteryScore === "number" && Number.isFinite(previous.masteryScore)
    ? Math.max(0, Math.min(100, previous.masteryScore))
    : 0;
  const masteryScore = Math.max(requestedScore, previousScore, attemptScore);
  return {
    conceptId,
    status: masteryStatus(masteryScore),
    masteryScore,
    lastStudiedAt: latestIsoTimestamp(previous?.lastStudiedAt, now),
    updatedAt: latestIsoTimestamp(previous?.updatedAt, now) ?? now,
  };
}

/** Rebuild one concept's progress from immutable attempts instead of trusting UI state. */
export async function syncConceptProgress(conceptId: string, now = new Date().toISOString()): Promise<void> {
  assertProgressTimestamp(now);
  const cardIds = REVIEW_EXERCISES.filter((exercise) => exercise.targetType === "concept" && exercise.targetId === conceptId).map((exercise) => exercise.id);
  if (cardIds.length === 0) return;
  // Keep the historical read and derived write in one transaction. Without
  // this boundary, two tabs can both read the same attempt set and the tab
  // that finishes last can overwrite a newer mastery score with a stale one.
  await yijingDb.transaction("rw", yijingDb.reviewAttempts, yijingDb.conceptProgress, async () => {
    const attempts = await yijingDb.reviewAttempts.where("cardId").anyOf(cardIds).toArray();
    if (attempts.length === 0) return;
    const previous = await yijingDb.conceptProgress.get(conceptId);
    const score = calculateMastery(
      [...attempts]
        .sort((a, b) => compareIsoTimestamps(a.reviewedAt, b.reviewedAt))
        .map((attempt) => attempt.recallGrade),
    );
    await yijingDb.conceptProgress.put({
      conceptId,
      status: masteryStatus(score),
      masteryScore: score,
      lastStudiedAt: latestIsoTimestamp(previous?.lastStudiedAt, now),
      updatedAt: latestIsoTimestamp(previous?.updatedAt, now) ?? now,
    });
  });
}

/** Persist a lesson milestone and, when requested, seed its review cards. */
export async function markLessonProgress(
  conceptId: string,
  minimumScore: number,
  now: string,
  today: string,
  seedReviewCards: boolean,
): Promise<ConceptProgress> {
  assertProgressTimestamp(now);
  if (typeof today !== "string" || !isValidLocalDate(today)) {
    throw new TypeError("学习进度本地日期无效");
  }
  const cards = REVIEW_EXERCISES.filter(
    (exercise) => exercise.targetType === "concept" && exercise.targetId === conceptId,
  );
  if (cards.length === 0) {
    throw new Error("未知知识点或未配置课程练习");
  }
  const writeProgress = async () => {
    const previous = await yijingDb.conceptProgress.get(conceptId);
    const attempts = cards.length > 0
      ? await yijingDb.reviewAttempts.where("cardId").anyOf(cards.map((card) => card.id)).toArray()
      : [];
    const next = buildLessonProgress(conceptId, minimumScore, previous, attempts, now);
    await yijingDb.conceptProgress.put(next);
    if (seedReviewCards) {
      for (const card of cards) {
        if (await yijingDb.reviewCardStates.get(card.id)) continue;
        await yijingDb.reviewCardStates.put({
          cardId: card.id,
          targetType: card.targetType,
          targetId: card.targetId,
          algorithmVersion: REVIEW_ALGORITHM_VERSION,
          stepIndex: 0,
          dueDate: today,
          lapseCount: 0,
          consecutivePasses: 0,
          isWeak: false,
          updatedAt: now,
        });
      }
    }
    return next;
  };
  return seedReviewCards
    ? yijingDb.transaction("rw", yijingDb.conceptProgress, yijingDb.reviewAttempts, yijingDb.reviewCardStates, writeProgress)
    : yijingDb.transaction("rw", yijingDb.conceptProgress, yijingDb.reviewAttempts, writeProgress);
}
