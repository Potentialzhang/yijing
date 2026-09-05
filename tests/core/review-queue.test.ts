import { describe, expect, it } from "vitest";
import type { Exercise } from "@/content/exercises";
import type { ReviewCardState } from "@/db/schema";
import { buildReviewQueue, focusReviewCard, getDueReviewCards, getNextReviewBatch } from "@/core/review/queue";

function exercise(id: string): Exercise {
  return {
    id,
    kind: "concept-recall",
    prompt: id,
    targetType: "concept",
    targetId: "yin-yang-lines",
    display: id,
    choices: ["A", "B", "C"],
    answer: "A",
    explanation: id,
  };
}

function state(cardId: string, dueDate: string, algorithmVersion?: number): ReviewCardState {
  return {
    cardId,
    targetType: "concept",
    targetId: "yin-yang-lines",
    ...(algorithmVersion === undefined ? {} : { algorithmVersion }),
    stepIndex: 0,
    dueDate,
    lapseCount: 0,
    consecutivePasses: 0,
    isWeak: false,
    updatedAt: "2026-08-30T00:00:00.000Z",
  };
}

describe("复习队列选择", () => {
  it("先放到期卡，再按每日上限加入新卡，并截取首批", () => {
    const selection = buildReviewQueue(
      [exercise("fresh-a"), exercise("due-a"), exercise("fresh-b"), exercise("due-b")],
      [state("due-a", "2026-08-29"), state("due-b", "2026-08-01")],
      "2026-08-30",
      1,
      2,
    );
    expect(selection.ordered.map((item) => item.id)).toEqual(["due-a", "due-b", "fresh-a"]);
    expect(selection.firstBatch.map((item) => item.id)).toEqual(["due-a", "due-b"]);
    expect(selection.fresh.map((item) => item.id)).toEqual(["fresh-a"]);
    expect(selection.batchSize).toBe(2);
  });

  it("隔离显式未知算法版本，不把它算进可复习队列", () => {
    const selection = buildReviewQueue(
      [exercise("unsupported"), exercise("fresh")],
      [state("unsupported", "2026-08-01", 99)],
      "2026-08-30",
      10,
      20,
    );
    expect(selection.ordered.map((item) => item.id)).toEqual(["fresh"]);
    expect(selection.unsupportedCardCount).toBe(1);
  });

  it("隔离损坏的到期日期并报告数量，避免卡片静默消失", () => {
    const selection = buildReviewQueue(
      [exercise("invalid"), exercise("fresh")],
      [state("invalid", "2026-02-30")],
      "2026-08-30",
      10,
      20,
    );
    expect(selection.ordered.map((item) => item.id)).toEqual(["fresh"]);
    expect(selection.invalidCardCount).toBe(1);
    expect(selection.unsupportedCardCount).toBe(0);
  });

  it("隔离损坏的复习状态并与首页到期判定保持一致", () => {
    const exercises = [exercise("invalid-step"), exercise("fresh")];
    const states = [{ ...state("invalid-step", "2026-08-30"), stepIndex: Number.NaN }];
    const selection = buildReviewQueue(exercises, states, "2026-08-30", 10, 20);
    expect(selection.ordered.map((item) => item.id)).toEqual(["fresh"]);
    expect(selection.invalidCardCount).toBe(1);
    expect(getDueReviewCards(exercises, states, "2026-08-30")).toEqual([]);
  });

  it("首页到期摘要与复习队列使用同一判定，并拒绝非法今天日期", () => {
    const exercises = [exercise("due"), exercise("invalid"), exercise("unsupported")];
    const states = [
      state("due", "2026-08-30"),
      state("invalid", "2026-02-30"),
      state("unsupported", "2026-08-01", 99),
    ];
    expect(getDueReviewCards(exercises, states, "2026-08-30").map((item) => item.id)).toEqual(["due"]);
    expect(getDueReviewCards(exercises, states, "2026-02-30")).toEqual([]);
  });

  it("显式非法算法版本不会按旧卡兼容，且到期判定不修改输入", () => {
    const exercises = [exercise("due"), exercise("malformed-version")];
    const states = [
      state("due", "2026-08-30"),
      state("malformed-version", "2026-08-01", null as never),
    ];
    const originalExerciseIds = exercises.map((item) => item.id);
    const originalStateDates = states.map((item) => item.dueDate);
    expect(getDueReviewCards(exercises, states, "2026-08-30").map((item) => item.id)).toEqual(["due"]);
    expect(exercises.map((item) => item.id)).toEqual(originalExerciseIds);
    expect(states.map((item) => item.dueDate)).toEqual(originalStateDates);
  });

  it("分批继续时不会越过队列尾部或重复首批", () => {
    const items = [exercise("a"), exercise("b"), exercise("c")];
    const first = getNextReviewBatch(items, 0, 2);
    const second = getNextReviewBatch(items, first.nextOffset, 2);
    const empty = getNextReviewBatch(items, second.nextOffset, 2);
    expect(first.items.map((item) => item.id)).toEqual(["a", "b"]);
    expect(second.items.map((item) => item.id)).toEqual(["c"]);
    expect(second.nextOffset).toBe(3);
    expect(empty.items).toEqual([]);
    expect(empty.nextOffset).toBe(3);
  });

  it("异常偏好值回退到安全批次范围", () => {
    const selection = buildReviewQueue(
      [exercise("a")],
      [],
      "2026-08-30",
      0,
      Number.NaN,
    );
    expect(selection.firstBatch).toHaveLength(1);
    expect(selection.batchSize).toBe(20);
  });

  it("显式聚焦错题时只安排目标卡，并保留新卡即时练习标记", () => {
    const exercises = [exercise("first"), exercise("target"), exercise("last")];
    const selection = buildReviewQueue(exercises, [], "2026-08-30", 1, 20);
    const focused = focusReviewCard(selection, exercises, [], "target");
    expect(focused.ordered.map((item) => item.id)).toEqual(["target"]);
    expect(focused.firstBatch.map((item) => item.id)).toEqual(["target"]);
    expect(focused.fresh.map((item) => item.id)).toEqual(["target"]);
  });

  it("聚焦已存在但未到期的卡片时允许显式再练，未知或损坏目标回退原队列", () => {
    const exercises = [exercise("due"), exercise("target"), exercise("invalid")];
    const states = [
      state("due", "2026-08-30"),
      state("target", "2026-09-10"),
      state("invalid", "2026-02-30"),
    ];
    const selection = buildReviewQueue(exercises, states, "2026-08-30", 10, 20);
    expect(focusReviewCard(selection, exercises, states, "target").ordered.map((item) => item.id)).toEqual(["target"]);
    expect(focusReviewCard(selection, exercises, states, "invalid")).toBe(selection);
    expect(focusReviewCard(selection, exercises, states, "missing")).toBe(selection);
  });
});
