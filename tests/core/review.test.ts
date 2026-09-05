import { describe, expect, it } from "vitest";
import { InvalidReviewStateError, isRecallGrade, isSupportedReviewAlgorithm, REVIEW_ALGORITHM_VERSION, REVIEW_INTERVAL_DAYS, scheduleNext, UnsupportedRecallGradeError, UnsupportedReviewAlgorithmError, type RecallGrade } from "@/core/review/scheduler";
import { calculateMastery, masteryStatus } from "@/core/review/mastery";
import { calculateDueCardCompletionRate, calculateIndependentCompletionRate, calculateSevenDayMemoryRate, calculateSevenDayRetention, calculateStudyStreak, calculateWeeklyAccuracy, calculateWeakPointImprovementRate, latestStudyPosition, summarizePeriod } from "@/core/review/stats";
import { summarizeTodayReviewTask } from "@/core/review/today";

const initial = { stepIndex: 0, dueDate: "2026-08-24", lapseCount: 0, consecutivePasses: 0, isWeak: false };

function addDays(value: string, days: number): string {
  const date = new Date(`${value}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

describe("复习调度器", () => {
  it("拒绝无效本地日期，避免把错误输入静默转成 UTC 日期", () => {
    expect(() => scheduleNext(initial, "remembered", "2026-02-30")).toThrow(/有效的日历日期/);
    expect(() => scheduleNext(initial, "remembered", "2026/08/24")).toThrow(/YYYY-MM-DD/);
  });

  it("忘记后安排次日，并记录遗忘次数", () => {
    expect(scheduleNext(initial, "forgot", "2026-08-24")).toMatchObject({ dueDate: "2026-08-25", lapseCount: 1, consecutivePasses: 0 });
  });

  it("记得和熟练沿固定阶梯前进", () => {
    expect(scheduleNext(initial, "remembered", "2026-08-24")).toMatchObject({ algorithmVersion: REVIEW_ALGORITHM_VERSION, stepIndex: 1, dueDate: "2026-08-27" });
    expect(scheduleNext(initial, "mastered", "2026-08-24")).toMatchObject({ stepIndex: 2, dueDate: "2026-08-31" });
  });

  it("拒绝用当前实现解释未知的调度算法版本", () => {
    expect(() => scheduleNext({ ...initial, algorithmVersion: REVIEW_ALGORITHM_VERSION + 1 }, "remembered", "2026-08-24")).toThrow(UnsupportedReviewAlgorithmError);
    expect(() => scheduleNext({ ...initial, algorithmVersion: null as never }, "remembered", "2026-08-24")).toThrow(/不支持的复习算法版本/);
  });

  it("拒绝运行时未知的复习评价，避免落入 hard 分支", () => {
    expect(isRecallGrade("remembered")).toBe(true);
    expect(isRecallGrade("again")).toBe(false);
    expect(() => scheduleNext(initial, "again" as never, "2026-08-24")).toThrow(UnsupportedRecallGradeError);
  });

  it("拒绝损坏的复习状态，避免 NaN 或越界阶梯进入持久化", () => {
    expect(() => scheduleNext({ ...initial, stepIndex: Number.NaN }, "remembered", "2026-08-24")).toThrow(InvalidReviewStateError);
    expect(() => scheduleNext({ ...initial, stepIndex: REVIEW_INTERVAL_DAYS.length }, "remembered", "2026-08-24")).toThrow(/stepIndex/);
    expect(() => scheduleNext({ ...initial, lapseCount: Number.POSITIVE_INFINITY }, "forgot", "2026-08-24")).toThrow(/lapseCount/);
    expect(() => scheduleNext({ ...initial, consecutivePasses: -1 }, "remembered", "2026-08-24")).toThrow(/consecutivePasses/);
    expect(() => scheduleNext({ ...initial, consecutiveForgets: 1.5 }, "forgot", "2026-08-24")).toThrow(/consecutiveForgets/);
    expect(() => scheduleNext({ ...initial, isWeak: "false" as never }, "remembered", "2026-08-24")).toThrow(/isWeak/);
    expect(() => scheduleNext({ ...initial, dueDate: "2026-02-30" }, "remembered", "2026-08-24")).toThrow(/dueDate/);
  });

  it("只把缺失版本和当前版本视为可调度卡片", () => {
    expect(isSupportedReviewAlgorithm()).toBe(true);
    expect(isSupportedReviewAlgorithm({})).toBe(true);
    expect(isSupportedReviewAlgorithm({ algorithmVersion: REVIEW_ALGORITHM_VERSION })).toBe(true);
    expect(isSupportedReviewAlgorithm({ algorithmVersion: 99 })).toBe(false);
    expect(isSupportedReviewAlgorithm({ algorithmVersion: null })).toBe(false);
  });

  it("连续两次忘记标记薄弱，间隔后忘记不会误判为连续", () => {
    const weak = scheduleNext({ ...initial, lapseCount: 1, consecutiveForgets: 1 }, "forgot", "2026-08-24");
    expect(weak.isWeak).toBe(true);
    expect(scheduleNext({ ...weak, consecutivePasses: 1 }, "remembered", "2026-08-25").isWeak).toBe(false);
    const firstForgot = scheduleNext(initial, "forgot", "2026-08-24");
    const remembered = scheduleNext(firstForgot, "remembered", "2026-08-25");
    const laterForgot = scheduleNext(remembered, "forgot", "2026-08-26");
    expect(laterForgot).toMatchObject({ lapseCount: 2, consecutiveForgets: 1, isWeak: false });
    expect(scheduleNext(laterForgot, "forgot", "2026-08-27")).toMatchObject({ consecutiveForgets: 2, isWeak: true });
  });

  it("14 天模拟窗口只在到期日推进，并保持可解释的本地日期", () => {
    let state = { ...initial, dueDate: "2026-08-01" };
    let date = "2026-08-01";
    const grades: readonly RecallGrade[] = ["remembered", "hard", "remembered", "mastered"];
    const reviewedDates: string[] = [];
    for (let day = 0; day < 14; day += 1) {
      if (state.dueDate <= date && reviewedDates.length < grades.length) {
        reviewedDates.push(date);
        state = scheduleNext(state, grades[reviewedDates.length - 1], date);
      }
      date = addDays(date, 1);
    }
    expect(reviewedDates).toEqual(["2026-08-01", "2026-08-04", "2026-08-06", "2026-08-13"]);
    expect(state.dueDate).toBe("2026-09-12");
  });

  it("14 天多卡演练保持记录、卡片和知识点引用一致", () => {
    const cards = [
      { cardId: "card-a", targetType: "concept", targetId: "yin-yang-lines", state: { ...initial, dueDate: "2026-08-01" } },
      { cardId: "card-b", targetType: "concept", targetId: "trigrams", state: { ...initial, dueDate: "2026-08-01" } },
      { cardId: "card-c", targetType: "trigram", targetId: "qian", state: { ...initial, dueDate: "2026-08-03" } },
    ];
    const attempts: { cardId: string; targetType: string; targetId: string; localDate: string }[] = [];
    const grades: readonly RecallGrade[] = ["remembered", "hard", "forgot", "remembered", "mastered"];
    let date = "2026-08-01";
    for (let day = 0; day < 14; day += 1) {
      cards.forEach((card, index) => {
        if (card.state.dueDate <= date) {
          const grade = grades[(attempts.length + index) % grades.length];
          card.state = scheduleNext(card.state, grade, date);
          attempts.push({ cardId: card.cardId, targetType: card.targetType, targetId: card.targetId, localDate: date });
        }
      });
      date = addDays(date, 1);
    }
    expect(attempts.length).toBeGreaterThanOrEqual(8);
    expect(new Set(attempts.map((attempt) => attempt.cardId))).toEqual(new Set(cards.map((card) => card.cardId)));
    expect(attempts.every((attempt) => /^2026-08-\d{2}$/.test(attempt.localDate))).toBe(true);
    expect(cards.every((card) => card.state.dueDate >= "2026-08-01")).toBe(true);
  });

  it("30 天连续演练跨月且同一卡片每天最多推进一次", () => {
    const cards = [
      { cardId: "card-a", targetType: "concept", targetId: "yin-yang-lines", state: { ...initial, dueDate: "2026-08-01" } },
      { cardId: "card-b", targetType: "concept", targetId: "trigrams", state: { ...initial, dueDate: "2026-08-03" } },
      { cardId: "card-c", targetType: "trigram", targetId: "qian", state: { ...initial, dueDate: "2026-08-05" } },
      { cardId: "card-d", targetType: "trigram", targetId: "kun", state: { ...initial, dueDate: "2026-08-07" } },
    ];
    const grades: readonly RecallGrade[] = ["remembered", "hard", "forgot", "mastered"];
    const attempts: { cardId: string; targetType: string; targetId: string; localDate: string }[] = [];
    let date = "2026-08-01";
    for (let day = 0; day < 30; day += 1) {
      cards.forEach((card, index) => {
        if (card.state.dueDate <= date && !attempts.some((attempt) => attempt.cardId === card.cardId && attempt.localDate === date)) {
          const grade = grades[(day + index) % grades.length];
          card.state = scheduleNext(card.state, grade, date);
          attempts.push({ cardId: card.cardId, targetType: card.targetType, targetId: card.targetId, localDate: date });
        }
      });
      date = addDays(date, 1);
    }
    expect(date).toBe("2026-08-31");
    expect(attempts.length).toBeGreaterThanOrEqual(cards.length * 4);
    expect(new Set(attempts.map((attempt) => attempt.cardId))).toEqual(new Set(cards.map((card) => card.cardId)));
    expect(new Set(attempts.map((attempt) => `${attempt.cardId}:${attempt.localDate}`)).size).toBe(attempts.length);
    expect(attempts.some((attempt) => attempt.localDate === "2026-08-30")).toBe(true);
    expect(cards.every((card) => card.state.dueDate >= date)).toBe(true);
  });
});

describe("掌握度", () => {
  it("按最近作答计算可解释的 0-100 分", () => {
    expect(calculateMastery(["forgot", "remembered", "mastered"])).toBe(58);
    expect(masteryStatus(0)).toBe("not_started");
    expect(masteryStatus(85)).toBe("mastered");
    expect(calculateMastery(["remembered", "unknown" as never])).toBe(75);
    expect(calculateMastery(["unknown" as never])).toBe(0);
    expect(masteryStatus(Number.NaN)).toBe("not_started");
  });
});

describe("今日页统计", () => {
  it("今日复习完成后给出下一次复习日期，并排除孤立记录", () => {
    const attempts = [
      { id: "done", cardId: "a", promptSnapshot: "", answerSnapshot: "", reviewMode: "spaced" as const, recallGrade: "remembered" as const, reviewedAt: "2026-08-26T08:00:00Z", localDate: "2026-08-26" },
      { id: "orphan", cardId: "missing", promptSnapshot: "", answerSnapshot: "", reviewMode: "spaced" as const, recallGrade: "remembered" as const, reviewedAt: "2026-08-26T09:00:00Z", localDate: "2026-08-26" },
    ];
    const states = [
      { cardId: "a", targetType: "concept", targetId: "yin-yang-lines", stepIndex: 1, dueDate: "2026-08-29", lapseCount: 0, consecutivePasses: 1, isWeak: false, updatedAt: "2026-08-26T08:00:00Z" },
      { cardId: "future", targetType: "trigram", targetId: "qian", stepIndex: 1, dueDate: "2026-08-27", lapseCount: 0, consecutivePasses: 1, isWeak: false, updatedAt: "2026-08-26T08:00:00Z" },
    ];
    expect(summarizeTodayReviewTask(attempts, states, "2026-08-26", new Set(["a"]))).toEqual({ completedSpacedCount: 1, nextReviewDate: "2026-08-29" });
    expect(summarizeTodayReviewTask(attempts, states, "2026-02-30", new Set(["a"]))).toEqual({ completedSpacedCount: 0, nextReviewDate: null });
  });

  it("计算今日到期卡完成率，并把遗忘也视为已完成任务", () => {
    const attempts = [
      { id: "done", cardId: "a", promptSnapshot: "", answerSnapshot: "", objectiveCorrect: false, reviewMode: "spaced" as const, recallGrade: "forgot" as const, reviewedAt: "2026-08-26T08:00:00Z", localDate: "2026-08-26" },
      { id: "new", cardId: "new", promptSnapshot: "", answerSnapshot: "", objectiveCorrect: true, reviewMode: "immediate" as const, recallGrade: "remembered" as const, reviewedAt: "2026-08-26T09:00:00Z", localDate: "2026-08-26" },
    ];
    const states = [
      { cardId: "a", targetType: "concept", targetId: "yin-yang-lines", stepIndex: 0, dueDate: "2026-08-27", lapseCount: 1, consecutivePasses: 0, isWeak: false, updatedAt: "2026-08-26T08:00:00Z" },
      { cardId: "b", targetType: "concept", targetId: "trigrams", stepIndex: 0, dueDate: "2026-08-26", lapseCount: 0, consecutivePasses: 0, isWeak: false, updatedAt: "2026-08-25T08:00:00Z" },
    ];
    expect(calculateDueCardCompletionRate(attempts, states, "2026-08-26")).toBe(50);
    expect(calculateDueCardCompletionRate([], [], "2026-08-26")).toBeNull();
  });

  it("到期卡完成率排除没有卡片状态的孤立间隔作答", () => {
    const attempts = [
      { id: "orphan", cardId: "orphan", promptSnapshot: "", answerSnapshot: "", reviewMode: "spaced" as const, recallGrade: "remembered" as const, reviewedAt: "2026-08-26T08:00:00Z", localDate: "2026-08-26" },
    ];
    const states = [
      { cardId: "real", targetType: "concept", targetId: "yin-yang-lines", stepIndex: 0, dueDate: "2026-08-26", lapseCount: 0, consecutivePasses: 0, isWeak: false, updatedAt: "2026-08-25T08:00:00Z" },
    ];
    expect(calculateDueCardCompletionRate(attempts, states, "2026-08-26")).toBe(0);
  });

  it("到期卡完成率不把未知复习算法版本纳入任务集合", () => {
    const attempts = [{ id: "blocked", cardId: "blocked", promptSnapshot: "", answerSnapshot: "", reviewMode: "spaced" as const, recallGrade: "remembered" as const, reviewedAt: "2026-08-26T08:00:00Z", localDate: "2026-08-26" }];
    const states = [{ cardId: "blocked", targetType: "concept", targetId: "yin-yang-lines", algorithmVersion: 99, stepIndex: 0, dueDate: "2026-08-26", lapseCount: 0, consecutivePasses: 0, isWeak: true, updatedAt: "2026-08-26T08:00:00Z" }];
    expect(calculateDueCardCompletionRate(attempts, states, "2026-08-26")).toBeNull();
  });

  it("今日总结和完成率都排除结构损坏的复习状态", () => {
    const attempts = [
      { id: "broken", cardId: "broken", promptSnapshot: "", answerSnapshot: "", reviewMode: "spaced" as const, recallGrade: "remembered" as const, reviewedAt: "2026-08-26T09:00:00Z", localDate: "2026-08-26" },
    ];
    const states = [
      { cardId: "broken", targetType: "concept" as const, targetId: "yin-yang-lines", stepIndex: Number.NaN, dueDate: "2026-08-26", lapseCount: 0, consecutivePasses: 1, isWeak: false, updatedAt: "2026-08-26T08:00:00Z" },
      { cardId: "valid", targetType: "concept" as const, targetId: "trigrams", stepIndex: 0, dueDate: "2026-08-27", lapseCount: 0, consecutivePasses: 1, isWeak: false, updatedAt: "2026-08-26T08:00:00Z" },
      { cardId: "due-valid", targetType: "concept" as const, targetId: "yin-yang-lines", stepIndex: 0, dueDate: "2026-08-26", lapseCount: 0, consecutivePasses: 0, isWeak: false, updatedAt: "2026-08-25T08:00:00Z" },
    ];
    expect(summarizeTodayReviewTask(attempts, states, "2026-08-26", new Set(["broken", "valid"]))).toEqual({
      completedSpacedCount: 0,
      nextReviewDate: "2026-08-27",
    });
    expect(calculateDueCardCompletionRate(attempts, states, "2026-08-26")).toBe(0);
  });

  it("最近学习位置不跳转到当前无法解释的复习算法卡片", () => {
    const attempts = [
      { id: "supported-attempt", cardId: "supported", promptSnapshot: "", answerSnapshot: "", recallGrade: "remembered" as const, reviewedAt: "2026-08-26T08:00:00Z", localDate: "2026-08-26" },
      { id: "unknown-attempt", cardId: "unknown", promptSnapshot: "", answerSnapshot: "", recallGrade: "remembered" as const, reviewedAt: "2026-08-26T09:00:00Z", localDate: "2026-08-26" },
    ];
    const states = [
      { cardId: "supported", targetType: "concept", targetId: "yin-yang-lines", stepIndex: 0, dueDate: "2026-08-27", lapseCount: 0, consecutivePasses: 1, isWeak: false, updatedAt: "2026-08-26T08:00:00Z" },
      { cardId: "unknown", targetType: "concept", targetId: "trigrams", algorithmVersion: 99, stepIndex: 0, dueDate: "2026-08-27", lapseCount: 0, consecutivePasses: 1, isWeak: false, updatedAt: "2026-08-26T09:00:00Z" },
    ];
    expect(latestStudyPosition(attempts, states, [])).toMatchObject({
      targetType: "concept",
      targetId: "yin-yang-lines",
    });
  });

  it("最近学习位置不跳转到结构损坏的复习卡", () => {
    const attempts = [
      { id: "valid", cardId: "valid", promptSnapshot: "", answerSnapshot: "", recallGrade: "remembered" as const, reviewedAt: "2026-08-26T08:00:00Z", localDate: "2026-08-26" },
      { id: "broken", cardId: "broken", promptSnapshot: "", answerSnapshot: "", recallGrade: "remembered" as const, reviewedAt: "2026-08-26T09:00:00Z", localDate: "2026-08-26" },
    ];
    const states = [
      { cardId: "valid", targetType: "concept" as const, targetId: "yin-yang-lines", stepIndex: 0, dueDate: "2026-08-27", lapseCount: 0, consecutivePasses: 1, isWeak: false, updatedAt: "2026-08-26T08:00:00Z" },
      { cardId: "broken", targetType: "concept" as const, targetId: "trigrams", stepIndex: Number.NaN, dueDate: "2026-08-27", lapseCount: 0, consecutivePasses: 1, isWeak: false, updatedAt: "2026-08-26T09:00:00Z" },
    ];
    expect(latestStudyPosition(attempts, states, [])).toMatchObject({
      targetId: "yin-yang-lines",
      at: "2026-08-26T08:00:00Z",
    });
  });

  it("最近学习位置忽略损坏的历史时间", () => {
    const attempts = [
      { id: "valid", cardId: "valid", promptSnapshot: "", answerSnapshot: "", recallGrade: "remembered" as const, reviewedAt: "2026-08-26T08:00:00Z", localDate: "2026-08-26" },
      { id: "invalid", cardId: "invalid", promptSnapshot: "", answerSnapshot: "", recallGrade: "remembered" as const, reviewedAt: "not-a-date", localDate: "2026-08-26" },
    ];
    const states = [
      { cardId: "valid", targetType: "concept", targetId: "yin-yang-lines", stepIndex: 0, dueDate: "2026-08-27", lapseCount: 0, consecutivePasses: 1, isWeak: false, updatedAt: "2026-08-26T08:00:00Z" },
      { cardId: "invalid", targetType: "concept", targetId: "trigrams", stepIndex: 0, dueDate: "2026-08-27", lapseCount: 0, consecutivePasses: 1, isWeak: false, updatedAt: "2026-08-26T09:00:00Z" },
    ];
    expect(latestStudyPosition(attempts, states, [])).toMatchObject({ targetId: "yin-yang-lines", at: "2026-08-26T08:00:00Z" });
  });

  it("最近学习位置忽略 Date.parse 可误认的时间格式", () => {
    const attempts = [{ id: "legacy", cardId: "legacy", promptSnapshot: "", answerSnapshot: "", recallGrade: "remembered" as const, reviewedAt: "0", localDate: "2026-08-26" }];
    const states = [{ cardId: "legacy", targetType: "concept", targetId: "yin-yang-lines", stepIndex: 0, dueDate: "2026-08-27", lapseCount: 0, consecutivePasses: 1, isWeak: false, updatedAt: "2026-08-26T08:00:00Z" }];
    expect(latestStudyPosition(attempts, states, [])).toBeNull();
  });

  it("最近学习位置按实际时间瞬间排序，而不是按带偏移的字符串排序", () => {
    const attempts = [
      { id: "utc", cardId: "utc", promptSnapshot: "", answerSnapshot: "", recallGrade: "remembered" as const, reviewedAt: "2026-08-26T17:30:00Z", localDate: "2026-08-27" },
      { id: "offset", cardId: "offset", promptSnapshot: "", answerSnapshot: "", recallGrade: "remembered" as const, reviewedAt: "2026-08-27T01:00:00+08:00", localDate: "2026-08-27" },
    ];
    const states = [
      { cardId: "utc", targetType: "concept", targetId: "yin-yang-lines", stepIndex: 0, dueDate: "2026-08-28", lapseCount: 0, consecutivePasses: 1, isWeak: false, updatedAt: "2026-08-27T00:00:00Z" },
      { cardId: "offset", targetType: "concept", targetId: "trigrams", stepIndex: 0, dueDate: "2026-08-28", lapseCount: 0, consecutivePasses: 1, isWeak: false, updatedAt: "2026-08-27T00:00:00Z" },
    ];
    expect(latestStudyPosition(attempts, states, [])).toMatchObject({ targetId: "yin-yang-lines", at: "2026-08-26T17:30:00Z" });
  });

  it("只按带题目类型的卦象题计算推演独立完成率", () => {
    const attempts = [
      { id: "h1", cardId: "h1", targetType: "hexagram" as const, hintUsed: false, promptSnapshot: "", answerSnapshot: "", recallGrade: "remembered" as const, reviewedAt: "2026-08-26T08:00:00Z", localDate: "2026-08-26" },
      { id: "h2", cardId: "h2", targetType: "hexagram" as const, hintUsed: true, promptSnapshot: "", answerSnapshot: "", recallGrade: "remembered" as const, reviewedAt: "2026-08-26T09:00:00Z", localDate: "2026-08-26" },
      { id: "c1", cardId: "c1", targetType: "concept" as const, hintUsed: false, promptSnapshot: "", answerSnapshot: "", recallGrade: "remembered" as const, reviewedAt: "2026-08-26T10:00:00Z", localDate: "2026-08-26" },
    ];
    expect(calculateIndependentCompletionRate(attempts, "2026-08-26")).toBe(50);
    expect(calculateIndependentCompletionRate([attempts[2]], "2026-08-26")).toBeNull();
  });

  it("按本地日期计算连续学习天数，允许今天尚未开始但昨天有记录", () => {
    expect(calculateStudyStreak(["2026-08-24", "2026-08-25"], "2026-08-26")).toBe(2);
    expect(calculateStudyStreak(["2026-08-24", "2026-08-26"], "2026-08-26")).toBe(1);
    expect(calculateStudyStreak(["2026-02-30", "2026-02-28"], "2026-02-30")).toBe(0);
  });

  it("日期指标跨闰日仍按日历天计算，不依赖时区或固定毫秒数", () => {
    expect(calculateStudyStreak(["2024-02-28", "2024-02-29", "2024-03-01"], "2024-03-01")).toBe(3);
    expect(calculateStudyStreak(["2023-02-29", "2023-03-01"], "2023-03-01")).toBe(1);
  });

  it("只统计最近七天，并区分答对与忘记", () => {
    expect(calculateWeeklyAccuracy([
      { id: "a", cardId: "a", promptSnapshot: "", answerSnapshot: "", objectiveCorrect: true, recallGrade: "remembered", reviewedAt: "2026-08-26T08:00:00Z", localDate: "2026-08-26" },
      { id: "b", cardId: "b", promptSnapshot: "", answerSnapshot: "", objectiveCorrect: false, recallGrade: "forgot", reviewedAt: "2026-08-25T08:00:00Z", localDate: "2026-08-25" },
      { id: "c", cardId: "c", promptSnapshot: "", answerSnapshot: "", objectiveCorrect: true, recallGrade: "mastered", reviewedAt: "2026-08-10T08:00:00Z", localDate: "2026-08-10" },
    ], "2026-08-26")).toBe(50);
    expect(calculateWeeklyAccuracy([
      { id: "invalid", cardId: "invalid", promptSnapshot: "", answerSnapshot: "", objectiveCorrect: true, recallGrade: "remembered", reviewedAt: "2026-02-30T08:00:00Z", localDate: "2026-02-30" },
    ], "2026-02-30")).toBeNull();
  });

  it("周/月统计按本地日期聚合作答", () => {
    const summary = summarizePeriod([
      { id: "a", cardId: "a", promptSnapshot: "", answerSnapshot: "", objectiveCorrect: true, recallGrade: "remembered", reviewedAt: "2026-08-26T08:00:00Z", localDate: "2026-08-26" },
      { id: "b", cardId: "b", promptSnapshot: "", answerSnapshot: "", objectiveCorrect: false, recallGrade: "forgot", reviewedAt: "2026-08-25T08:00:00Z", localDate: "2026-08-25" },
      { id: "old", cardId: "old", promptSnapshot: "", answerSnapshot: "", objectiveCorrect: true, recallGrade: "remembered", reviewedAt: "2026-07-01T08:00:00Z", localDate: "2026-07-01" },
    ], "2026-08-26", 7);
    expect(summary).toMatchObject({ totalAttempts: 2, correctAttempts: 1, accuracy: 50, activeDays: 2, forgottenAttempts: 1 });
    expect(summary.dailyCounts).toHaveLength(7);
    expect(summarizePeriod([], "2026-02-30", 7)).toMatchObject({ totalAttempts: 0, dailyCounts: [] });
  });

  it("只在观察窗口结束后计算七日留存", () => {
    const attempts = [
      { id: "a", cardId: "a", promptSnapshot: "", answerSnapshot: "", recallGrade: "remembered" as const, reviewedAt: "2026-08-01T08:00:00Z", localDate: "2026-08-01" },
      { id: "b", cardId: "b", promptSnapshot: "", answerSnapshot: "", recallGrade: "remembered" as const, reviewedAt: "2026-08-08T08:00:00Z", localDate: "2026-08-08" },
    ];
    expect(calculateSevenDayRetention(attempts, "2026-08-06")).toBeNull();
    expect(calculateSevenDayRetention(attempts, "2026-08-08")).toBe(true);
    expect(calculateSevenDayRetention([attempts[0]], "2026-08-08")).toBe(false);
  });

  it("按同一张卡片的长间隔作答计算七日后记忆率", () => {
    const attempts = [
      { id: "a1", cardId: "a", promptSnapshot: "", answerSnapshot: "", recallGrade: "forgot" as const, reviewedAt: "2026-08-01T08:00:00Z", localDate: "2026-08-01" },
      { id: "a2", cardId: "a", promptSnapshot: "", answerSnapshot: "", recallGrade: "remembered" as const, reviewedAt: "2026-08-09T08:00:00Z", localDate: "2026-08-09" },
      { id: "a3", cardId: "a", promptSnapshot: "", answerSnapshot: "", recallGrade: "hard" as const, reviewedAt: "2026-08-10T08:00:00Z", localDate: "2026-08-10" },
      { id: "b1", cardId: "b", promptSnapshot: "", answerSnapshot: "", recallGrade: "remembered" as const, reviewedAt: "2026-08-02T08:00:00Z", localDate: "2026-08-02" },
      { id: "b2", cardId: "b", promptSnapshot: "", answerSnapshot: "", recallGrade: "mastered" as const, reviewedAt: "2026-08-09T08:00:00Z", localDate: "2026-08-09" },
    ];
    expect(calculateSevenDayMemoryRate(attempts, "2026-08-09")).toBe(100);
    const laterAttempts = [
      ...attempts,
      { id: "c1", cardId: "c", promptSnapshot: "", answerSnapshot: "", recallGrade: "remembered" as const, reviewedAt: "2026-08-02T08:00:00Z", localDate: "2026-08-02" },
      { id: "c2", cardId: "c", promptSnapshot: "", answerSnapshot: "", recallGrade: "forgot" as const, reviewedAt: "2026-08-09T08:00:00Z", localDate: "2026-08-09" },
      { id: "d1", cardId: "d", promptSnapshot: "", answerSnapshot: "", recallGrade: "remembered" as const, reviewedAt: "2026-08-03T08:00:00Z", localDate: "2026-08-03" },
      { id: "d2", cardId: "d", promptSnapshot: "", answerSnapshot: "", recallGrade: "forgot" as const, reviewedAt: "2026-08-10T08:00:00Z", localDate: "2026-08-10" },
    ];
    expect(calculateSevenDayMemoryRate(laterAttempts, "2026-08-10")).toBe(50);
    expect(calculateSevenDayMemoryRate([attempts[0]], "2026-08-10")).toBeNull();
  });

  it("七日后记忆率排除即时练习，避免把短练习当成长间隔复习", () => {
    const immediateOnly = [
      { id: "i1", cardId: "i", promptSnapshot: "", answerSnapshot: "", recallGrade: "forgot" as const, reviewMode: "immediate" as const, reviewedAt: "2026-08-01T08:00:00Z", localDate: "2026-08-01" },
      { id: "i2", cardId: "i", promptSnapshot: "", answerSnapshot: "", recallGrade: "remembered" as const, reviewMode: "immediate" as const, reviewedAt: "2026-08-09T08:00:00Z", localDate: "2026-08-09" },
    ];
    expect(calculateSevenDayMemoryRate(immediateOnly, "2026-08-09")).toBeNull();
  });

  it("计算薄弱点在十四日内连续通过后的改善率，并排除即时练习", () => {
    const attempts = [
      { id: "a1", cardId: "a", promptSnapshot: "", answerSnapshot: "", recallGrade: "forgot" as const, reviewedAt: "2026-08-01T08:00:00Z", localDate: "2026-08-01" },
      { id: "a2", cardId: "a", promptSnapshot: "", answerSnapshot: "", recallGrade: "forgot" as const, reviewedAt: "2026-08-02T08:00:00Z", localDate: "2026-08-02" },
      { id: "a3", cardId: "a", promptSnapshot: "", answerSnapshot: "", recallGrade: "hard" as const, reviewedAt: "2026-08-03T08:00:00Z", localDate: "2026-08-03" },
      { id: "a4", cardId: "a", promptSnapshot: "", answerSnapshot: "", recallGrade: "remembered" as const, reviewedAt: "2026-08-04T08:00:00Z", localDate: "2026-08-04" },
      { id: "b1", cardId: "b", promptSnapshot: "", answerSnapshot: "", recallGrade: "forgot" as const, reviewedAt: "2026-08-01T08:00:00Z", localDate: "2026-08-01" },
      { id: "b2", cardId: "b", promptSnapshot: "", answerSnapshot: "", recallGrade: "forgot" as const, reviewedAt: "2026-08-02T08:00:00Z", localDate: "2026-08-02" },
      { id: "b3", cardId: "b", promptSnapshot: "", answerSnapshot: "", recallGrade: "remembered" as const, reviewedAt: "2026-08-03T08:00:00Z", localDate: "2026-08-03" },
      { id: "b4", cardId: "b", promptSnapshot: "", answerSnapshot: "", recallGrade: "forgot" as const, reviewedAt: "2026-08-04T08:00:00Z", localDate: "2026-08-04" },
      { id: "c1", cardId: "c", promptSnapshot: "", answerSnapshot: "", recallGrade: "forgot" as const, reviewMode: "immediate" as const, reviewedAt: "2026-08-01T08:00:00Z", localDate: "2026-08-01" },
      { id: "c2", cardId: "c", promptSnapshot: "", answerSnapshot: "", recallGrade: "forgot" as const, reviewMode: "immediate" as const, reviewedAt: "2026-08-02T08:00:00Z", localDate: "2026-08-02" },
    ];
    expect(calculateWeakPointImprovementRate(attempts, "2026-08-10")).toBeNull();
    expect(calculateWeakPointImprovementRate(attempts, "2026-08-20")).toBe(50);
    expect(calculateWeakPointImprovementRate([attempts[0]], "2026-08-10")).toBeNull();
    const late = [
      { id: "late-1", cardId: "late", promptSnapshot: "", answerSnapshot: "", recallGrade: "forgot" as const, reviewedAt: "2026-08-01T08:00:00Z", localDate: "2026-08-01" },
      { id: "late-2", cardId: "late", promptSnapshot: "", answerSnapshot: "", recallGrade: "forgot" as const, reviewedAt: "2026-08-02T08:00:00Z", localDate: "2026-08-02" },
      { id: "late-3", cardId: "late", promptSnapshot: "", answerSnapshot: "", recallGrade: "remembered" as const, reviewedAt: "2026-08-16T08:00:00Z", localDate: "2026-08-16" },
      { id: "late-4", cardId: "late", promptSnapshot: "", answerSnapshot: "", recallGrade: "remembered" as const, reviewedAt: "2026-08-17T08:00:00Z", localDate: "2026-08-17" },
    ];
    expect(calculateWeakPointImprovementRate(late, "2026-08-17")).toBe(0);
  });
});
