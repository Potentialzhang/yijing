import { describe, expect, it } from "vitest";
import {
  assertAiRequestPreview,
  buildAiRequestPreview,
  isAiPreviewPurpose,
  normalizeAiScopes,
  parseAiScopes,
  serializeAiScopes,
} from "@/core/ai/consent";

describe("M4 AI 辅学授权与发送预览契约", () => {
  it("只保留受支持且不重复的授权范围", () => {
    expect(
      normalizeAiScopes([
        "review-history",
        "unknown",
        "review-history",
        "selected-notes",
      ]),
    ).toEqual(["review-history", "selected-notes"]);
  });

  it("可以安全序列化和解析偏好中的范围", () => {
    const encoded = serializeAiScopes(["selected-content", "selected-notes"]);
    expect(parseAiScopes(encoded)).toEqual([
      "selected-content",
      "selected-notes",
    ]);
    expect(parseAiScopes("not-json")).toEqual([]);
  });

  it("预览只列出允许字段并固定排除整库和传感器数据", () => {
    const preview = buildAiRequestPreview("confusion-analysis", [
      "review-history",
    ]);
    expect(preview.contractVersion).toBe(1);
    expect(preview.purpose).toBe("confusion-analysis");
    expect(preview.includedFields).toContain("reviewAttempts.recallGrade");
    expect(preview.includedFields).not.toContain("note.markdown");
    expect(preview.excludedFields).toContain("all-local-database-records");
    expect(preview.excludedFields).toContain("compass-sensor-readings");
    expect(preview.transport).toBe("local-preview-not-sent");
  });

  it("运行时拒绝空授权范围和未知用途", () => {
    expect(isAiPreviewPurpose("study-draft")).toBe(true);
    expect(isAiPreviewPurpose("fortune-telling")).toBe(false);
    expect(() => buildAiRequestPreview("study-draft", [])).toThrow(/至少需要一个授权范围/);
    expect(() => buildAiRequestPreview("fortune-telling" as never, ["selected-notes"])).toThrow(/用途无效/);
  });

  it("运行时拒绝被篡改的预览字段和策略", () => {
    const preview = buildAiRequestPreview("study-draft", ["selected-content"]);
    expect(() =>
      assertAiRequestPreview({ ...preview, unexpected: true }),
    ).toThrow(/包含未声明字段/);
    expect(() =>
      assertAiRequestPreview({
        ...preview,
        includedFields: [...preview.includedFields, "all-local-database-records"],
      }),
    ).toThrow(/字段与授权范围不一致/);
    expect(() =>
      assertAiRequestPreview({ ...preview, transport: "remote" }),
    ).toThrow(/传输策略无效/);
    const sparseFields = [...preview.includedFields];
    delete sparseFields[0];
    expect(() =>
      assertAiRequestPreview({ ...preview, includedFields: sparseFields }),
    ).toThrow(/字段与授权范围不一致/);
    expect(() =>
      assertAiRequestPreview({
        ...preview,
        excludedFields: [...preview.excludedFields, ""],
      }),
    ).toThrow(/排除字段无效/);
    expect(() =>
      assertAiRequestPreview({
        ...preview,
        excludedFields: [...preview.excludedFields, "private-profile"],
      }),
    ).toThrow(/排除字段无效/);
  });
});
