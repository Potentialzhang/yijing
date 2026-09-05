import { describe, expect, it } from "vitest";
import type { ReviewCardState } from "@/db/schema";
import { deriveReviewTargetStatus } from "@/components/review/ReviewTargetLearningStatus";

function state(overrides: Partial<ReviewCardState> = {}): ReviewCardState {
  return {
    cardId: "trigram-qian-name",
    targetType: "trigram",
    targetId: "qian",
    stepIndex: 1,
    dueDate: "2026-09-05",
    lapseCount: 0,
    consecutivePasses: 1,
    isWeak: false,
    updatedAt: "2026-09-01T00:00:00.000Z",
    ...overrides,
  };
}

describe("详情页复习状态派生", () => {
  it("对损坏的结构状态显示数据待修复，而不是误报学习中", () => {
    expect(
      deriveReviewTargetStatus(state({ stepIndex: Number.NaN }), "2026-09-05"),
    ).toBe("invalid");
    expect(
      deriveReviewTargetStatus(state({ dueDate: "2026-02-30" }), "2026-09-05"),
    ).toBe("invalid");
  });

  it("保留不兼容算法的待迁移状态", () => {
    expect(
      deriveReviewTargetStatus(state({ algorithmVersion: 99 }), "2026-09-05"),
    ).toBe("unsupported");
  });

  it("对合法到期、学习中和已掌握状态保持原有语义", () => {
    expect(deriveReviewTargetStatus(state({ dueDate: "2026-09-04" }), "2026-09-05")).toBe("reviewing");
    expect(deriveReviewTargetStatus(state({ dueDate: "2026-09-06" }), "2026-09-05")).toBe("learning");
    expect(
      deriveReviewTargetStatus(
        state({ stepIndex: 5, consecutivePasses: 2, dueDate: "2026-09-20" }),
        "2026-09-05",
      ),
    ).toBe("mastered");
  });
});
