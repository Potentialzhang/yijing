import { describe, expect, it } from "vitest";
import { summarizeReviewConfusions } from "@/core/review/confusion";

const state = {
  cardId: "card-a",
  targetType: "trigram",
  targetId: "qian",
  algorithmVersion: 1,
  stepIndex: 0,
  dueDate: "2026-08-31",
  lapseCount: 1,
  consecutivePasses: 0,
  consecutiveForgets: 1,
  isWeak: false,
  updatedAt: "2026-08-31T00:00:00.000Z",
} as const;

describe("本地复习混淆点摘要", () => {
  it("按卡片聚合错误并保留最新错误快照", () => {
    const result = summarizeReviewConfusions(
      [
        {
          id: "a-1",
          cardId: "card-a",
          promptSnapshot: "旧题目",
          answerSnapshot: "旧答案",
          objectiveCorrect: false,
          recallGrade: "forgot",
          reviewedAt: "2026-08-29T16:00:00.000Z",
          localDate: "2026-08-30",
        },
        {
          id: "a-2",
          cardId: "card-a",
          promptSnapshot: "正确题目",
          answerSnapshot: "正确答案",
          objectiveCorrect: true,
          recallGrade: "remembered",
          reviewedAt: "2026-08-30T16:00:00.000Z",
          localDate: "2026-08-31",
        },
        {
          id: "a-3",
          cardId: "card-a",
          promptSnapshot: "最新题目",
          answerSnapshot: "最新答案",
          objectiveCorrect: false,
          recallGrade: "forgot",
          selfExplanation: "我把乾卦的纯阳结构记下来了。",
          reviewedAt: "2026-08-31T00:00:00.000Z",
          localDate: "2026-08-31",
        },
      ],
      [state],
    );
    expect(result).toEqual([
      expect.objectContaining({
        cardId: "card-a",
        targetType: "trigram",
        targetId: "qian",
        attemptCount: 3,
        correctCount: 1,
        errorCount: 2,
        accuracy: 33,
        latestError: {
          promptSnapshot: "最新题目",
          answerSnapshot: "最新答案",
          reviewedAt: "2026-08-31T00:00:00.000Z",
          selfExplanation: "我把乾卦的纯阳结构记下来了。",
        },
      }),
    ]);
  });

  it("过滤孤立卡片、排序同频错误并限制结果数量", () => {
    const attempts = [
      ...Array.from({ length: 2 }, (_, index) => ({
        id: `b-${index}`,
        cardId: "card-b",
        promptSnapshot: "B",
        answerSnapshot: "B",
        objectiveCorrect: false,
        recallGrade: "forgot" as const,
        reviewedAt: `2026-08-2${index + 1}T00:00:00.000Z`,
        localDate: "2026-08-31",
      })),
      {
        id: "c-1",
        cardId: "card-c",
        promptSnapshot: "C",
        answerSnapshot: "C",
        objectiveCorrect: false,
        recallGrade: "forgot" as const,
        reviewedAt: "2026-08-30T00:00:00.000Z",
        localDate: "2026-08-31",
      },
      {
        id: "orphan",
        cardId: "removed-card",
        promptSnapshot: "不应出现",
        answerSnapshot: "不应出现",
        objectiveCorrect: false,
        recallGrade: "forgot" as const,
        reviewedAt: "2026-08-31T00:00:00.000Z",
        localDate: "2026-08-31",
      },
    ];
    const result = summarizeReviewConfusions(attempts, [], {
      knownCardIds: new Set(["card-b", "card-c"]),
      limit: 1,
    });
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ cardId: "card-b", errorCount: 2 });
  });

  it("没有错误时返回空列表，并将非法上限回退为默认值", () => {
    const result = summarizeReviewConfusions(
      [{
        id: "ok",
        cardId: "card-ok",
        promptSnapshot: "题目",
        answerSnapshot: "答案",
        objectiveCorrect: true,
        recallGrade: "remembered",
        reviewedAt: "2026-08-31T00:00:00.000Z",
        localDate: "2026-08-31",
      }],
      [],
      { limit: Number.NaN },
    );
    expect(result).toEqual([]);
  });

  it("不会把结构损坏或不支持算法版本的卡片聚合为混淆点", () => {
    const attempts = [
      {
        id: "broken-attempt",
        cardId: "broken-card",
        promptSnapshot: "损坏题目",
        answerSnapshot: "损坏答案",
        objectiveCorrect: false,
        recallGrade: "forgot" as const,
        reviewedAt: "2026-08-31T00:00:00.000Z",
        localDate: "2026-08-31",
      },
      {
        id: "unsupported-attempt",
        cardId: "unsupported-card",
        promptSnapshot: "未来题目",
        answerSnapshot: "未来答案",
        objectiveCorrect: false,
        recallGrade: "forgot" as const,
        reviewedAt: "2026-08-31T00:00:00.000Z",
        localDate: "2026-08-31",
      },
    ];
    const result = summarizeReviewConfusions(attempts, [
      { ...state, cardId: "broken-card", stepIndex: Number.NaN },
      { ...state, cardId: "unsupported-card", algorithmVersion: 99 },
    ]);
    expect(result).toEqual([]);
  });
});
