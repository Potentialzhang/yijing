import { describe, expect, it } from "vitest";
import { EXERCISES } from "@/content/exercises";

describe("练习题种子数据", () => {
  it("至少覆盖 PRD 要求的八类题型，且每题答案可选", () => {
    expect(new Set(EXERCISES.map((exercise) => exercise.kind)).size).toBeGreaterThanOrEqual(8);
    expect(EXERCISES.every((exercise) => exercise.kind === "trigram-arrange-lines" || exercise.responseType === "text" || exercise.choices.includes(exercise.answer))).toBe(true);
  });

  it("八卦五种记忆路径都有明确的正向题型", () => {
    const kinds = new Set(EXERCISES.map((exercise) => exercise.kind));
    expect([...kinds]).toEqual(expect.arrayContaining(["trigram-name", "trigram-lines-name", "trigram-name-lines", "trigram-nature-name", "trigram-direction-name"]));
    expect(EXERCISES.filter((exercise) => exercise.kind === "trigram-lines-name")).toHaveLength(8);
    expect(EXERCISES.filter((exercise) => exercise.kind === "trigram-name-lines")).toHaveLength(8);
    expect(EXERCISES.filter((exercise) => exercise.kind === "trigram-nature-name")).toHaveLength(8);
    expect(EXERCISES.filter((exercise) => exercise.kind === "trigram-direction-name")).toHaveLength(8);
    expect(EXERCISES.filter((exercise) => exercise.kind === "trigram-arrange-lines")).toHaveLength(8);
    expect(EXERCISES.filter((exercise) => exercise.kind === "trigram-direction" && exercise.responseType === "text")).toHaveLength(8);
  });

  it("六十四卦组合题始终提供三个有效卦名选项", () => {
    const pairExercises = EXERCISES.filter((exercise) => exercise.kind === "hexagram-pair");
    expect(pairExercises).toHaveLength(64);
    expect(pairExercises.every((exercise) => exercise.choices.length === 4 && exercise.choices.includes(exercise.answer))).toBe(true);
  });

  it("所有选择题选项互不重复，除二选一题外至少提供三个选项", () => {
    const binaryKinds = new Set(["trigram-arrange-lines", "stem-yinyang"]);
    expect(EXERCISES.every((exercise) => new Set(exercise.choices).size === exercise.choices.length)).toBe(true);
    expect(EXERCISES.every((exercise) => exercise.responseType === "text" || binaryKinds.has(exercise.kind) || exercise.choices.length >= 3)).toBe(true);
    expect(EXERCISES.filter((exercise) => exercise.kind === "palace-trigram").every((exercise) => exercise.choices.length === 4)).toBe(true);
  });

  it("测试学堂覆盖六十四卦卦辞、三百八十四爻辞和猜卦填空", () => {
    expect(EXERCISES.filter((exercise) => exercise.kind === "hexagram-judgment")).toHaveLength(64);
    expect(EXERCISES.filter((exercise) => exercise.kind === "hexagram-line-meaning")).toHaveLength(384);
    expect(EXERCISES.filter((exercise) => exercise.kind === "hexagram-guess")).toHaveLength(64);
    expect(EXERCISES.filter((exercise) => exercise.kind === "hexagram-guess").every((exercise) => exercise.responseType === "text" && exercise.choices.length === 0)).toBe(true);
  });

  it.each([
    "trigram-name",
    "trigram-lines-name",
    "trigram-arrange-lines",
    "trigram-nature-name",
    "trigram-direction-name",
  ] as const)("题型 %s 至少关联一个八卦目标", (kind) => {
    expect(EXERCISES.some((exercise) => exercise.kind === kind && exercise.targetType === "trigram")).toBe(true);
  });
});
