import { describe, expect, it } from "vitest";
import {
  AI_EVALUATION_CASES,
  assertAiEvaluationDataset,
  buildEvaluationPrompt,
} from "@/content/ai-evaluation";
import { evaluateAiDraftSafety } from "@/core/ai/evaluation";
import { createAiDraftOutput } from "@/core/ai/output";

describe("M4 AI 提示词与安全评测样例", () => {
  it("提供三类风险的结构化评测案例和边界提示", () => {
    expect(AI_EVALUATION_CASES).toHaveLength(3);
    expect(new Set(AI_EVALUATION_CASES.map((item) => item.risk)).size).toBe(3);
    const prompt = buildEvaluationPrompt(AI_EVALUATION_CASES[0], "乾卦结构");
    expect(prompt).toContain("确定预测");
    expect(prompt).toContain("乾卦结构");
    expect(prompt).toContain("AI 辅助");
    expect(() => assertAiEvaluationDataset()).not.toThrow();
    expect(() => assertAiEvaluationDataset(AI_EVALUATION_CASES.map((item, index) => index === 0 ? { ...item, unexpected: true } : item))).toThrow();
    expect(() => assertAiEvaluationDataset(AI_EVALUATION_CASES.map((item, index) => index === 0 ? { ...item, risk: "mixed-schools" } : item))).toThrow(/三类风险/);
  });

  it("拦截确定性预测和缺少来源的草稿", () => {
    const evaluationCase = AI_EVALUATION_CASES[0];
    const unsafe = createAiDraftOutput({
      kind: evaluationCase.kind,
      text: "AI 辅助：这个结果必然发财。",
      inputScopes: ["selected-content"],
      sourceCitations: [{ sourceId: "source-1", label: "学习材料" }],
    });
    const report = evaluateAiDraftSafety(unsafe, evaluationCase);
    expect(report.ok).toBe(false);
    expect(report.issues.map((issue) => issue.code)).toContain(
      "forbidden-claim",
    );
  });

  it("允许带来源、待核对提示且不作确定结论的草稿", () => {
    const evaluationCase = AI_EVALUATION_CASES[2];
    const safe = createAiDraftOutput({
      kind: evaluationCase.kind,
      text: "AI 辅助学习草稿：相关引文待核对，请查看来源后再复述。来源：用户选定材料。",
      inputScopes: ["selected-content"],
      sourceCitations: [
        { sourceId: "source-zhouyi-classic-pending", label: "待核对底本" },
      ],
    });
    expect(evaluateAiDraftSafety(safe, evaluationCase)).toEqual({
      ok: true,
      issues: [],
    });
  });
});
