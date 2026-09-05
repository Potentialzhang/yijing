import { describe, expect, it } from "vitest";
import {
  parseBasicMarkdown,
  sanitizeMarkdownHref,
  tokenizeMarkdownInline,
} from "@/core/notes/markdown";

describe("基础 Markdown 安全预览", () => {
  it("解析标题、段落、列表、引用和代码块", () => {
    const blocks = parseBasicMarkdown(
      "# 结构\n先看上下卦。\n\n- 上卦\n- 下卦\n\n> 待核对来源\n\n```text\nconst unsafe = '<script>'\n```",
    );
    expect(blocks.map((block) => block.kind)).toEqual([
      "heading",
      "paragraph",
      "unordered-list",
      "quote",
      "code",
    ]);
    expect(blocks[4]).toMatchObject({ kind: "code", language: "text" });
  });

  it("只允许带主机的 https 和有效 mailto 链接，其他协议按纯文本处理", () => {
    expect(sanitizeMarkdownHref("https://example.com/a")).toBe(
      "https://example.com/a",
    );
    expect(sanitizeMarkdownHref("mailto:study@example.com")).toBe(
      "mailto:study@example.com",
    );
    expect(sanitizeMarkdownHref("http://example.com/a")).toBeNull();
    expect(sanitizeMarkdownHref("https://")).toBeNull();
    expect(sanitizeMarkdownHref("https:example.com")).toBeNull();
    expect(sanitizeMarkdownHref("mailto:not-an-address")).toBeNull();
    expect(sanitizeMarkdownHref("javascript:alert(1)")).toBeNull();
    expect(tokenizeMarkdownInline("[危险](javascript:alert(1))")).toEqual([
      { kind: "text", value: "[危险](javascript:alert(1))" },
    ]);
  });

  it("不执行原始 HTML，而是保留为文本节点内容", () => {
    const [paragraph] = parseBasicMarkdown("<script>alert(1)</script>");
    expect(paragraph).toEqual({
      kind: "paragraph",
      lines: ["<script>alert(1)</script>"],
    });
  });
});
