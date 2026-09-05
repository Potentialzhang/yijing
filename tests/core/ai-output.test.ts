import { describe, expect, it } from "vitest";
import { assertAiDraftOutput, createAiDraftOutput } from "@/core/ai/output";

describe("M4 AI 草稿输出与来源引用契约", () => {
  it("创建带输入范围、来源和免责声明的草稿", () => {
    const output = createAiDraftOutput({
      kind: "exercise-draft",
      text: "请先说出乾卦的三爻结构，再核对答案。",
      inputScopes: ["selected-content"],
      sourceCitations: [
        { sourceId: "source-trigram-structure", label: "八卦结构资料" },
      ],
      createdAt: "2026-08-26T12:00:00.000Z",
    });
    expect(output.status).toBe("draft");
    expect(output.disclaimer).toContain("AI 辅助");
    expect(output.sourceCitations[0].sourceId).toBe("source-trigram-structure");
  });

  it("拒绝缺少输入范围、重复来源或伪造免责声明的输出", () => {
    expect(() =>
      createAiDraftOutput({
        kind: "confusion-analysis",
        text: "混淆点草稿",
        inputScopes: ["review-history"],
        sourceCitations: [],
      }),
    ).toThrow(/来源引用/);
    expect(() =>
      assertAiDraftOutput({
        contractVersion: 1,
        kind: "note-draft",
        status: "draft",
        text: "整理草稿",
        inputScopes: ["selected-notes"],
        sourceCitations: [
          { sourceId: "note-1", label: "笔记" },
          { sourceId: "note-1", label: "笔记重复" },
        ],
        disclaimer: "这是确定答案",
        createdAt: "2026-08-26T12:00:00.000Z",
      }),
    ).toThrow(/来源引用不能重复/);
  });

  it("拒绝供应商输出中的未知或重复输入范围及错误定位类型", () => {
    const base = {
      contractVersion: 1,
      kind: "note-draft",
      status: "draft",
      text: "整理草稿",
      sourceCitations: [{ sourceId: "note-1", label: "笔记" }],
      disclaimer: "AI 辅助，仅供学习，不替代原典或程序结果",
      createdAt: "2026-08-26T12:00:00.000Z",
    } as const;
    expect(() =>
      assertAiDraftOutput({
        ...base,
        inputScopes: ["selected-notes", "unknown-scope"],
      }),
    ).toThrow(/输入范围包含未知或重复项/);
    expect(() =>
      assertAiDraftOutput({
        ...base,
        inputScopes: ["selected-notes", "selected-notes"],
      }),
    ).toThrow(/输入范围包含未知或重复项/);
    expect(() =>
      assertAiDraftOutput({
        ...base,
        inputScopes: ["selected-notes"],
        unexpected: true,
      }),
    ).toThrow(/未声明字段/);
    expect(() =>
      assertAiDraftOutput({
        ...base,
        inputScopes: ["selected-notes"],
        sourceCitations: [{ sourceId: "note-1", label: "笔记", extra: "x" }],
      }),
    ).toThrow(/未声明字段/);
    expect(() =>
      assertAiDraftOutput({
        ...base,
        inputScopes: ["selected-notes"],
        sourceCitations: [{ sourceId: "note-1", label: "笔记", locator: 3 }],
      }),
    ).toThrow(/定位必须是字符串/);
    expect(() =>
      assertAiDraftOutput({
        ...base,
        inputScopes: ["selected-notes"],
        createdAt: "0",
      }),
    ).toThrow(/时间无效/);
  });

  it("拒绝供应商输出中的未修剪来源 ID", () => {
    expect(() => assertAiDraftOutput({
      contractVersion: 1,
      kind: "note-draft",
      status: "draft",
      text: "整理草稿",
      inputScopes: ["selected-notes"],
      sourceCitations: [{ sourceId: " note-1", label: "笔记" }],
      disclaimer: "AI 辅助，仅供学习，不替代原典或程序结果",
      createdAt: "2026-08-26T12:00:00.000Z",
    })).toThrow(/来源引用/);
  });
});
