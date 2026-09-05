import { describe, expect, it } from "vitest";
import { isExerciseAnswerCorrect, normalizeExerciseAnswer } from "@/core/review/answer";

describe("主动回忆答案判定", () => {
  it("会去除首尾和中间空白，但保留答案本身的字符", () => {
    expect(normalizeExerciseAnswer("  西  北 \n")).toBe("西北");
    expect(normalizeExerciseAnswer("  101  ")).toBe("101");
  });

  it("文本答案按归一化后的值比较，并拒绝空答案", () => {
    expect(isExerciseAnswerCorrect(" 西北 ", "西北")).toBe(true);
    expect(isExerciseAnswerCorrect("西 南", "西北")).toBe(false);
    expect(normalizeExerciseAnswer(" \t\n ")).toBe("");
  });
});
