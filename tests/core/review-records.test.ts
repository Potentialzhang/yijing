import { describe, expect, it } from "vitest";
import { REVIEW_EXERCISES } from "@/content/exercises";
import {
  assertReviewExerciseSnapshot,
  assertReviewSubmission,
  MAX_SELF_EXPLANATION_LENGTH,
  normalizeSelfExplanation,
} from "@/core/review/records";

describe("复习记录写入边界", () => {
  it("只接受当前构建的完整题目快照", () => {
    const exercise = REVIEW_EXERCISES[0];
    expect(() => assertReviewExerciseSnapshot(exercise)).not.toThrow();
    expect(() => assertReviewExerciseSnapshot({ ...exercise, prompt: "伪造题目" })).toThrow(/快照与当前内容不一致/);
    expect(() => assertReviewExerciseSnapshot({ ...exercise, id: "unknown-exercise" })).toThrow(/题目不存在/);
    expect(() => assertReviewExerciseSnapshot({ ...exercise, targetId: "unknown" })).toThrow(/快照与当前内容不一致/);
  });

  it("校验评价、模式、时间和遥测字段", () => {
    expect(() => assertReviewSubmission({
      grade: "remembered",
      objectiveCorrect: true,
      reviewMode: "immediate",
      hintUsed: false,
      responseTimeMs: 0,
      now: "2026-08-30T00:00:00.000Z",
      localDate: "2026-08-30",
    })).not.toThrow();
    expect(() => assertReviewSubmission({
      grade: "unknown" as never,
      objectiveCorrect: true,
      hintUsed: false,
      now: "2026-08-30T00:00:00.000Z",
      localDate: "2026-08-30",
    })).toThrow(/评价无效/);
    expect(() => assertReviewSubmission({
      grade: "remembered",
      objectiveCorrect: "yes" as never,
      hintUsed: false,
      now: "2026-08-30T00:00:00.000Z",
      localDate: "2026-08-30",
    })).toThrow(/布尔值/);
    expect(() => assertReviewSubmission({
      grade: "remembered",
      objectiveCorrect: true,
      hintUsed: false,
      now: "not-a-date",
      localDate: "2026-08-30",
    })).toThrow(/复习时间无效/);
    expect(() => assertReviewSubmission({
      grade: "remembered",
      objectiveCorrect: true,
      hintUsed: false,
      now: "2026-08-30T00:00:00.000Z",
      localDate: "2026-02-30",
    })).toThrow(/本地日期无效/);
  });

  it("限制复述长度并将空白复述视为空值", () => {
    expect(normalizeSelfExplanation("  乾为纯阳  ")).toBe("乾为纯阳");
    expect(normalizeSelfExplanation("   ")).toBeUndefined();
    expect(() => normalizeSelfExplanation("x".repeat(MAX_SELF_EXPLANATION_LENGTH + 1))).toThrow(/不能超过/);
    expect(() => normalizeSelfExplanation(42)).toThrow(/必须是字符串/);
    expect(() => assertReviewSubmission({
      grade: "remembered",
      objectiveCorrect: true,
      hintUsed: false,
      selfExplanation: "x".repeat(MAX_SELF_EXPLANATION_LENGTH + 1),
      now: "2026-08-30T00:00:00.000Z",
      localDate: "2026-08-30",
    })).toThrow(/不能超过/);
  });
});
