import { describe, expect, it } from "vitest";
import { libraryResultHref, librarySearchVariants, normalizeLibraryFilter, normalizeLibraryQuery } from "@/core/content/library";

describe("易学知识库查询契约", () => {
  it("清理 URL 查询并限制长度", () => {
    expect(normalizeLibraryQuery("  君子以   自强不息  ")).toBe("君子以 自强不息");
    expect(normalizeLibraryQuery(["程颐", "朱熹"])).toBe("程颐");
    expect(normalizeLibraryQuery("乾".repeat(100))).toHaveLength(80);
    expect(normalizeLibraryQuery(undefined)).toBe("");
  });

  it("只接受白名单内容类型", () => {
    expect(normalizeLibraryFilter("commentary")).toBe("commentary");
    expect(normalizeLibraryFilter("knowledge")).toBe("knowledge");
    expect(normalizeLibraryFilter(["source", "classic"])).toBe("source");
    expect(normalizeLibraryFilter("unknown")).toBe("all");
  });

  it("为常见易经用字生成简繁双向搜索词", () => {
    expect(librarySearchVariants("亢龙有悔")).toContain("亢龍有悔");
    expect(librarySearchVariants("自強不息")).toContain("自强不息");
    expect(librarySearchVariants("乾")).toEqual(["乾"]);
  });

  it("将经文、爻辞、解读和来源定位到正确位置", () => {
    expect(libraryResultHref({ kind: "classic", kingWenNumber: 1, sectionKind: "judgment" })).toBe("/hexagrams/1#classic-reading");
    expect(libraryResultHref({ kind: "classic", kingWenNumber: 63, sectionKind: "line", linePosition: 6 })).toBe("/hexagrams/63#line-6");
    expect(libraryResultHref({ kind: "commentary", kingWenNumber: 2 })).toBe("/hexagrams/2#commentaries");
    expect(libraryResultHref({ kind: "knowledge", kingWenNumber: null, targetHref: "/tools/compass" })).toBe("/tools/compass");
    expect(libraryResultHref({ kind: "source", kingWenNumber: null, sourceUrl: "https://example.com" })).toBe("https://example.com");
  });
});
