import { isValidLocalDate } from "@/core/date/local";

export const REVIEW_INTERVAL_DAYS = [1, 3, 7, 15, 30, 60] as const;
/** Version of the explainable fixed-step scheduler persisted with each card. */
export const REVIEW_ALGORITHM_VERSION = 1 as const;
export type RecallGrade = "forgot" | "hard" | "remembered" | "mastered";
const RECALL_GRADES = ["forgot", "hard", "remembered", "mastered"] as const;

export function isRecallGrade(value: unknown): value is RecallGrade {
  return typeof value === "string" && (RECALL_GRADES as readonly string[]).includes(value);
}

export class UnsupportedRecallGradeError extends RangeError {
  readonly grade: unknown;

  constructor(grade: unknown) {
    super(`不支持的复习评价：${String(grade)}`);
    this.name = "UnsupportedRecallGradeError";
    this.grade = grade;
  }
}

export class UnsupportedReviewAlgorithmError extends RangeError {
  readonly algorithmVersion: unknown;

  constructor(algorithmVersion: unknown) {
    super(`不支持的复习算法版本：${String(algorithmVersion)}`);
    this.name = "UnsupportedReviewAlgorithmError";
    this.algorithmVersion = algorithmVersion;
  }
}

/** Raised when a card state would make the scheduler produce non-finite data. */
export class InvalidReviewStateError extends TypeError {
  readonly field: string;
  readonly value: unknown;

  constructor(field: string, value: unknown) {
    super(`复习状态字段无效：${field}（${String(value)}）`);
    this.name = "InvalidReviewStateError";
    this.field = field;
    this.value = value;
  }
}

export interface ReviewState {
  /** Optional keeps in-memory fixtures and pre-v9 records backwards compatible. */
  algorithmVersion?: number;
  stepIndex: number;
  dueDate: string;
  lapseCount: number;
  consecutivePasses: number;
  /** Number of immediately consecutive forgotten reviews. */
  consecutiveForgets?: number;
  isWeak: boolean;
}

/**
 * Whether a persisted card can be interpreted by the active scheduler.
 * Missing versions are legacy records and are intentionally compatible;
 * explicit unknown values must remain isolated instead of being rewritten.
 */
export function isSupportedReviewAlgorithm(
  state?: { algorithmVersion?: unknown } | null,
): boolean {
  return state?.algorithmVersion === undefined
    || state.algorithmVersion === REVIEW_ALGORITHM_VERSION;
}

function assertNonNegativeSafeInteger(value: unknown, field: string): asserts value is number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) {
    throw new InvalidReviewStateError(field, value);
  }
}

/**
 * Validate the state before doing arithmetic. Persistence migrations repair
 * known legacy rows, but direct callers and damaged storage must not be
 * allowed to turn NaN/Infinity or out-of-range steps into a new card state.
 */
function assertReviewState(current: ReviewState): void {
  if (current === null || typeof current !== "object") {
    throw new InvalidReviewStateError("state", current);
  }
  if (!Number.isSafeInteger(current.stepIndex) || current.stepIndex < 0 || current.stepIndex >= REVIEW_INTERVAL_DAYS.length) {
    throw new InvalidReviewStateError("stepIndex", current.stepIndex);
  }
  if (typeof current.dueDate !== "string" || !isValidLocalDate(current.dueDate)) {
    throw new InvalidReviewStateError("dueDate", current.dueDate);
  }
  assertNonNegativeSafeInteger(current.lapseCount, "lapseCount");
  assertNonNegativeSafeInteger(current.consecutivePasses, "consecutivePasses");
  if (current.consecutiveForgets !== undefined) {
    assertNonNegativeSafeInteger(current.consecutiveForgets, "consecutiveForgets");
  }
  if (typeof current.isWeak !== "boolean") {
    throw new InvalidReviewStateError("isWeak", current.isWeak);
  }
}

/** Non-throwing form used by queue/read models before a card is displayed. */
export function isValidReviewState(value: unknown): value is ReviewState {
  try {
    assertReviewState(value as ReviewState);
    return true;
  } catch {
    return false;
  }
}

function addDays(localDate: string, days: number): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(localDate);
  if (!match) throw new RangeError("复习日期必须是 YYYY-MM-DD");
  const year = Number(match[1]);
  const month = Number(match[2]) - 1;
  const day = Number(match[3]);
  // Build through setFullYear so valid years 0000–0099 are not coerced to
  // 1900–1999 by the multi-argument Date constructor.
  const date = new Date(0);
  date.setHours(12, 0, 0, 0);
  date.setFullYear(year, month, day);
  if (
    date.getFullYear() !== year ||
    date.getMonth() !== month ||
    date.getDate() !== day
  ) {
    throw new RangeError("复习日期不是有效的日历日期");
  }
  date.setDate(date.getDate() + days);
  const resultYear = date.getFullYear();
  const resultMonth = String(date.getMonth() + 1).padStart(2, "0");
  const resultDay = String(date.getDate()).padStart(2, "0");
  return `${resultYear}-${resultMonth}-${resultDay}`;
}

export function scheduleNext(
  current: ReviewState,
  grade: RecallGrade,
  localDate: string,
): ReviewState {
  // TypeScript types disappear at runtime. Keep malformed values from being
  // interpreted as the neutral "hard" branch and persisted as history.
  if (!isRecallGrade(grade)) {
    throw new UnsupportedRecallGradeError(grade);
  }
  if (current === null || typeof current !== "object") {
    throw new InvalidReviewStateError("state", current);
  }
  // Only a missing field is a legacy record. Null, strings, and future
  // numeric versions are malformed/unsupported and must not be reinterpreted.
  const algorithmVersion = current.algorithmVersion === undefined
    ? REVIEW_ALGORITHM_VERSION
    : current.algorithmVersion;
  if (algorithmVersion !== REVIEW_ALGORITHM_VERSION) {
    throw new UnsupportedReviewAlgorithmError(algorithmVersion);
  }
  assertReviewState(current);
  const consecutiveForgets = Number.isInteger(current.consecutiveForgets) && current.consecutiveForgets! >= 0
    ? current.consecutiveForgets!
    : current.isWeak ? 2 : 0;
  const lastStep = REVIEW_INTERVAL_DAYS.length - 1;
  if (grade === "forgot") {
    const nextConsecutiveForgets = consecutiveForgets + 1;
    return {
      algorithmVersion,
      stepIndex: Math.max(0, current.stepIndex - 1),
      dueDate: addDays(localDate, 1),
      lapseCount: current.lapseCount + 1,
      consecutivePasses: 0,
      consecutiveForgets: nextConsecutiveForgets,
      isWeak: current.isWeak || nextConsecutiveForgets >= 2,
    };
  }

  const stepDelta = grade === "mastered" ? 2 : grade === "remembered" ? 1 : 0;
  const stepIndex = Math.min(lastStep, Math.max(0, current.stepIndex + stepDelta));
  const interval = grade === "hard" ? 2 : REVIEW_INTERVAL_DAYS[stepIndex];
  return {
    algorithmVersion,
    stepIndex,
    dueDate: addDays(localDate, interval),
    lapseCount: current.lapseCount,
    consecutivePasses: current.consecutivePasses + 1,
    consecutiveForgets: 0,
    isWeak: current.consecutivePasses + 1 < 2 ? current.isWeak : false,
  };
}
