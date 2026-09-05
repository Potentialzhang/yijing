import { describe, expect, it } from "vitest";
import { buildLessonProgress, latestIsoTimestamp } from "@/db/progress";

describe("知识点掌握度时间戳", () => {
  it("跨标签页回写时保留较新的时间戳", () => {
    expect(latestIsoTimestamp("2026-08-28T10:00:00.000Z", "2026-08-28T09:00:00.000Z")).toBe("2026-08-28T10:00:00.000Z");
    expect(latestIsoTimestamp(undefined, "2026-08-28T09:00:00.000Z")).toBe("2026-08-28T09:00:00.000Z");
  });

  it("忽略损坏的历史值，避免污染新的学习记录", () => {
    expect(latestIsoTimestamp("not-a-date", "2026-08-28T09:00:00.000Z")).toBe("2026-08-28T09:00:00.000Z");
    expect(latestIsoTimestamp("not-a-date")).toBeUndefined();
  });

  it("忽略 Date.parse 可误认的非 ISO 时间戳", () => {
    expect(latestIsoTimestamp("0", "2026-08-28T09:00:00.000Z")).toBe("2026-08-28T09:00:00.000Z");
  });

  it("重复打开课程或完成课程时不降低已有掌握度", () => {
    const previous = {
      conceptId: "heavenly-stems",
      status: "mastered" as const,
      masteryScore: 90,
      lastStudiedAt: "2026-08-28T10:00:00.000Z",
      updatedAt: "2026-08-28T10:00:00.000Z",
    };
    expect(buildLessonProgress("heavenly-stems", 10, previous, [], "2026-08-28T09:00:00.000Z")).toMatchObject({ status: "mastered", masteryScore: 90, lastStudiedAt: previous.lastStudiedAt });
    expect(buildLessonProgress("heavenly-stems", 40, undefined, [], "2026-08-28T09:00:00.000Z")).toMatchObject({ status: "reviewing", masteryScore: 40 });
  });

  it("遇到损坏的旧分数时回退到有效课程里程碑", () => {
    const previous = {
      conceptId: "heavenly-stems",
      status: "mastered" as const,
      masteryScore: Number.NaN,
      updatedAt: "2026-08-28T10:00:00.000Z",
    };
    expect(buildLessonProgress("heavenly-stems", 40, previous, [], "2026-08-28T09:00:00.000Z")).toMatchObject({ status: "reviewing", masteryScore: 40 });
  });

  it("拒绝非法课程里程碑分数，避免产生 NaN 掌握度", () => {
    expect(() => buildLessonProgress("heavenly-stems", Number.NaN, undefined, [], "2026-08-28T09:00:00.000Z")).toThrow(/有限数字/);
    expect(() => buildLessonProgress("heavenly-stems", Number.POSITIVE_INFINITY, undefined, [], "2026-08-28T09:00:00.000Z")).toThrow(/有限数字/);
  });

  it("拒绝非法学习进度时间，避免写入不可排序记录", () => {
    expect(() => buildLessonProgress("heavenly-stems", 40, undefined, [], "2026-02-30T09:00:00.000Z")).toThrow(/时间无效/);
    expect(() => buildLessonProgress("heavenly-stems", 40, undefined, [], "not-a-date")).toThrow(/时间无效/);
  });
});
