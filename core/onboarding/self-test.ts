import { EXERCISES, type Exercise } from "@/content/exercises";
import { isValidIsoTimestamp } from "@/core/date/local";

/** 固定题目顺序，保证同一份结果可以解释和复现。 */
export const SELF_TEST_EXERCISE_IDS = [
  "trigram-name-qian",
  "trigram-lines-kun",
  "five-generates-wood",
  "hexagram-pair-qian-qian",
  "concept-keyword-yin-yang-lines",
] as const;

export type SelfTestLevel = "foundation" | "developing" | "ready";

export interface SelfTestResult {
  score: number;
  total: number;
  level: SelfTestLevel;
  completedAt: string;
  exerciseIds: readonly string[];
}

export function getSelfTestExercises(): readonly Exercise[] {
  return SELF_TEST_EXERCISE_IDS.map((id) => {
    const exercise = EXERCISES.find((item) => item.id === id);
    if (!exercise) throw new Error(`快速自测缺少题目：${id}`);
    return exercise;
  });
}

export function getSelfTestLevel(score: number, total: number): SelfTestLevel {
  const ratio = total > 0 ? score / total : 0;
  if (ratio >= 0.8) return "ready";
  if (ratio >= 0.5) return "developing";
  return "foundation";
}

export function createSelfTestResult(correctAnswers: readonly boolean[], completedAt = new Date().toISOString()): SelfTestResult {
  if (!correctAnswers.every((answer) => typeof answer === "boolean")) {
    throw new TypeError("快速自测答案必须是布尔值");
  }
  if (!isValidIsoTimestamp(completedAt)) throw new TypeError("快速自测完成时间无效");
  const total = correctAnswers.length;
  const score = correctAnswers.filter(Boolean).length;
  return { score, total, level: getSelfTestLevel(score, total), completedAt, exerciseIds: SELF_TEST_EXERCISE_IDS };
}

export function parseSelfTestResult(value: unknown): SelfTestResult | null {
  if (typeof value !== "string" || !value) return null;
  try {
    const parsed: unknown = JSON.parse(value);
    if (!parsed || typeof parsed !== "object") return null;
    const result = parsed as Partial<SelfTestResult>;
    const score = result.score;
    const total = result.total;
    const completedAt = result.completedAt;
    const exerciseIds = result.exerciseIds;
    const level = result.level;
    if (typeof score !== "number" || typeof total !== "number" || !Number.isInteger(score) || !Number.isInteger(total) || typeof completedAt !== "string" || !isValidIsoTimestamp(completedAt) || !Array.isArray(exerciseIds)) return null;
    if (total !== SELF_TEST_EXERCISE_IDS.length || score < 0 || score > total) return null;
    if (!exerciseIds.every((id, index) => id === SELF_TEST_EXERCISE_IDS[index])) return null;
    if (level !== "foundation" && level !== "developing" && level !== "ready") return null;
    if (level !== getSelfTestLevel(score, total)) return null;
    return { score, total, level, completedAt, exerciseIds: SELF_TEST_EXERCISE_IDS };
  } catch {
    return null;
  }
}
