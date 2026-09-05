import { REVIEW_EXERCISES, type Exercise } from "@/content/exercises";
import { isValidIsoTimestamp, isValidLocalDate } from "@/core/date/local";
import { isRecallGrade, type RecallGrade } from "@/core/review/scheduler";
import { isValidResponseTimeMs } from "@/core/review/response-time";

const REVIEW_MODES = ["immediate", "spaced"] as const;
export const MAX_SELF_EXPLANATION_LENGTH = 2_000;

/** Normalize the optional learner reflection without altering internal spacing. */
export function normalizeSelfExplanation(value: unknown): string | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== "string") throw new TypeError("复述必须是字符串");
  const normalized = value.trim();
  if (normalized.length > MAX_SELF_EXPLANATION_LENGTH) {
    throw new RangeError(`复述不能超过 ${MAX_SELF_EXPLANATION_LENGTH} 个字符`);
  }
  return normalized || undefined;
}
const EXERCISE_BY_ID = new Map(REVIEW_EXERCISES.map((exercise) => [exercise.id, exercise]));

/** Ensure the persisted answer uses the immutable exercise shipped by this build. */
export function assertReviewExerciseSnapshot(exercise: Exercise): void {
  const canonical = EXERCISE_BY_ID.get(exercise.id);
  if (!canonical) throw new TypeError("复习题目不存在");
  const sameChoices = exercise.choices.length === canonical.choices.length
    && exercise.choices.every((choice, index) => choice === canonical.choices[index]);
  if (
    exercise.kind !== canonical.kind
    || exercise.prompt !== canonical.prompt
    || exercise.targetType !== canonical.targetType
    || exercise.targetId !== canonical.targetId
    || exercise.display !== canonical.display
    || !sameChoices
    || exercise.answer !== canonical.answer
    || exercise.explanation !== canonical.explanation
    || exercise.responseType !== canonical.responseType
    || exercise.mode !== canonical.mode
  ) {
    throw new TypeError("复习题目快照与当前内容不一致");
  }
}

export function assertReviewSubmission(input: {
  grade: RecallGrade;
  objectiveCorrect: boolean;
  reviewMode?: "immediate" | "spaced";
  hintUsed: boolean;
  selfExplanation?: string;
  responseTimeMs?: number;
  now: string;
  localDate: string;
}): void {
  if (!isRecallGrade(input.grade)) throw new TypeError("复习评价无效");
  if (typeof input.objectiveCorrect !== "boolean") throw new TypeError("题目对错必须是布尔值");
  if (input.reviewMode !== undefined && !REVIEW_MODES.includes(input.reviewMode)) {
    throw new TypeError("复习模式无效");
  }
  if (typeof input.hintUsed !== "boolean") throw new TypeError("提示状态必须是布尔值");
  normalizeSelfExplanation(input.selfExplanation);
  if (!isValidIsoTimestamp(input.now)) throw new TypeError("复习时间无效");
  if (!isValidLocalDate(input.localDate)) throw new TypeError("复习本地日期无效");
  if (input.responseTimeMs !== undefined && !isValidResponseTimeMs(input.responseTimeMs)) {
    throw new TypeError("作答耗时必须是 0 到 24 小时内的整数毫秒");
  }
}
