import { describe, expect, it } from "vitest";
import {
  parseSourceTemplate,
  serializeSourceTemplate,
  SOURCE_TEMPLATE_STORAGE_KEY,
} from "@/core/notes/source-template";

describe("来源模板协议", () => {
  const source = {
    label: "《周易》校注",
    kind: "book" as const,
    author: "作者甲",
    edition: "修订版",
    locator: "第 42 页",
    url: "https://example.com/book",
    accessedAt: "2026-08-30",
  };

  it("可以序列化并解析来源模板，同时归一化可选字段", () => {
    const parsed = parseSourceTemplate(
      serializeSourceTemplate(source, "2026-08-30T08:00:00.000Z"),
    );
    expect(parsed).toEqual({
      version: 1,
      copiedAt: "2026-08-30T08:00:00.000Z",
      sourceRef: source,
    });
    expect(SOURCE_TEMPLATE_STORAGE_KEY).toBe("yijing:source-template:v1");
  });

  it("拒绝损坏、危险链接、无效日期和未知字段", () => {
    expect(parseSourceTemplate("not-json")).toBeNull();
    expect(parseSourceTemplate(JSON.stringify({
      version: 1,
      copiedAt: "2026-08-30T08:00:00.000Z",
      sourceRef: { label: "危险", url: "javascript:alert(1)" },
    }))).toBeNull();
    expect(parseSourceTemplate(JSON.stringify({
      version: 1,
      copiedAt: "2026-08-30T08:00:00.000Z",
      sourceRef: { label: "坏字段", unexpected: true },
    }))).toBeNull();
    expect(() => serializeSourceTemplate(source, "not-a-time")).toThrow(/复制时间无效/);
  });
});
