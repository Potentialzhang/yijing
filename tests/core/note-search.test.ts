import { describe, expect, it } from "vitest";
import { buildNoteSearchText } from "@/core/notes/search";

describe("笔记聚合全文搜索投影", () => {
  it("包含正文、上下文、标签和完整来源元数据", () => {
    const text = buildNoteSearchText(
      {
        title: "我的卦象笔记",
        markdown: "记录结构观察",
        targetId: "hexagram-01",
        tags: ["结构"],
        sourceRefs: [
          {
            label: "参考书",
            kind: "book",
            author: "作者甲",
            edition: "第三版",
            locator: "第 42 页",
            url: "https://example.com/book",
            accessedAt: "2026-08-30",
          },
        ],
      },
      "乾为天",
    );
    ["我的卦象笔记", "记录结构观察", "hexagram-01", "乾为天", "结构", "作者甲", "第三版", "第 42 页", "https://example.com/book", "2026-08-30", "书籍"].forEach((token) => {
      expect(text).toContain(token);
    });
  });

  it("把缺少类型的旧来源按个人来源纳入搜索", () => {
    const text = buildNoteSearchText({
      title: "旧笔记",
      markdown: "",
      targetId: "session-1",
      tags: [],
      sourceRefs: [{ label: "旧来源" }],
    });
    expect(text).toContain("personal");
    expect(text).toContain("个人");
  });
});
