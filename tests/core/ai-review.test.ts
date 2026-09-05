import { describe, expect, it } from "vitest";
import { createAiDraftOutput } from "@/core/ai/output";
import {
  assertAiDraftReview,
  createAiDraftReview,
  transitionAiDraftReview,
} from "@/core/ai/review";

const draft = createAiDraftOutput({
  kind: "note-draft",
  text: "AI 辅助学习草稿：先列出两个可核对的观察。",
  inputScopes: ["selected-notes"],
  sourceCitations: [{ sourceId: "note-1", label: "用户选定笔记" }],
  createdAt: "2026-08-26T12:00:00.000Z",
});

describe("M4-005 AI 草稿审阅状态机", () => {
  it("支持编辑后接受，并保留原始草稿不变", () => {
    const initial = createAiDraftReview(draft);
    const editing = transitionAiDraftReview(initial, { type: "start-edit" });
    const accepted = transitionAiDraftReview(editing, {
      type: "update-text",
      text: "AI 辅助学习草稿：改写后仍需回到来源核对。",
    });
    const decided = transitionAiDraftReview(accepted, { type: "accept" });
    expect(decided.status).toBe("accepted");
    expect(decided.editedText).toContain("回到来源核对");
    expect(decided.draft.text).toContain("两个可核对");
    expect(decided.decidedAt).toBeTruthy();
  });

  it("支持拒绝和重置，结束后禁止直接再次操作", () => {
    const rejected = transitionAiDraftReview(createAiDraftReview(draft), {
      type: "reject",
    });
    expect(rejected.status).toBe("rejected");
    expect(() => transitionAiDraftReview(rejected, { type: "accept" })).toThrow(
      /先重置/,
    );
    const reset = transitionAiDraftReview(rejected, { type: "reset" });
    expect(reset.status).toBe("pending");
    expect(reset.editedText).toBe(draft.text);
  });

  it("拒绝空编辑，避免接受后覆盖成空内容", () => {
    const review = transitionAiDraftReview(createAiDraftReview(draft), {
      type: "start-edit",
    });
    expect(() =>
      transitionAiDraftReview(review, { type: "update-text", text: "  " }),
    ).toThrow(/不能为空/);
  });

  it("直接接受编辑框内容时会原子保存最新文字", () => {
    const editing = transitionAiDraftReview(createAiDraftReview(draft), {
      type: "start-edit",
    });
    const decided = transitionAiDraftReview(editing, {
      type: "accept-edited",
      text: "直接接受的最新草稿",
    });
    expect(decided.status).toBe("accepted");
    expect(decided.editedText).toBe("直接接受的最新草稿");
  });

  it("运行时拒绝未知事件和非字符串编辑内容", () => {
    const initial = createAiDraftReview(draft);
    expect(() => transitionAiDraftReview(initial, { type: "archive" } as never)).toThrow(
      /未知的 AI 草稿审阅事件/,
    );
    const editing = transitionAiDraftReview(initial, { type: "start-edit" });
    expect(() =>
      transitionAiDraftReview(editing, { type: "update-text", text: 123 } as never),
    ).toThrow(/必须是字符串/);
  });

  it("运行时拒绝损坏的审阅状态快照", () => {
    expect(() =>
      assertAiDraftReview({
        draft,
        status: "accepted",
        editedText: draft.text,
      }),
    ).toThrow(/状态与决定时间不一致/);
    expect(() =>
      transitionAiDraftReview(
        {
          draft,
          status: "pending",
          editedText: draft.text,
          decidedAt: "not-a-date",
        } as never,
        { type: "reset" },
      ),
    ).toThrow(/决定时间无效/);
  });

  it("拒绝状态和事件中的未声明字段", () => {
    expect(() =>
      assertAiDraftReview({
        ...createAiDraftReview(draft),
        unexpected: true,
      } as never),
    ).toThrow(/包含未声明字段/);
    expect(() =>
      transitionAiDraftReview(createAiDraftReview(draft), {
        type: "accept",
        unexpected: true,
      } as never),
    ).toThrow(/包含未声明字段/);
    expect(() =>
      transitionAiDraftReview(createAiDraftReview(draft), {
        type: "update-text",
      } as never),
    ).toThrow(/包含未声明字段/);
  });

  it("拒绝 pending 状态携带已改写的编辑文本", () => {
    expect(() =>
      assertAiDraftReview({
        draft,
        status: "pending",
        editedText: "未经进入编辑态的改写",
      }),
    ).toThrow(/编辑文本必须与原始草稿一致/);
  });
});
