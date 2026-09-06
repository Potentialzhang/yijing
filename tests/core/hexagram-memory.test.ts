import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  HEXAGRAM_SEQUENCE_MEMORY_TIPS,
  HEXAGRAM_SEQUENCE_VERSE,
} from "@/content/hexagram-memory";

describe("六十四卦卦序记忆内容", () => {
  it("按上经三十卦、下经三十四卦连续覆盖全部卦序", () => {
    expect(HEXAGRAM_SEQUENCE_VERSE.map((section) => section.subtitle)).toEqual([
      "第 1—30 卦",
      "第 31—64 卦",
    ]);
    const coveredNumbers = HEXAGRAM_SEQUENCE_VERSE.flatMap((section) =>
      section.lines.flatMap((line) =>
        Array.from({ length: line.end - line.start + 1 }, (_, index) => line.start + index),
      ),
    );
    expect(coveredNumbers).toEqual(Array.from({ length: 64 }, (_, index) => index + 1));
  });

  it("保留上经、下经首尾锚点并提供实际背诵方法", () => {
    const verse = HEXAGRAM_SEQUENCE_VERSE.flatMap((section) => section.lines.map((line) => line.text)).join("");
    expect(verse).toContain("乾坤屯蒙需讼师");
    expect(verse).toContain("大过坎离三十备");
    expect(verse).toContain("咸恒遁兮及大壮");
    expect(verse).toContain("小过既济兼未济，是为下经三十四");
    expect(HEXAGRAM_SEQUENCE_MEMORY_TIPS).toHaveLength(3);
  });

  it("口诀只出现在独立工具页，不占用六十四卦索引", () => {
    const hexagramIndexPage = readFileSync(join(process.cwd(), "app/hexagrams/page.tsx"), "utf8");
    const toolPage = readFileSync(join(process.cwd(), "app/tools/hexagram-sequence/page.tsx"), "utf8");
    const toolsIndex = readFileSync(join(process.cwd(), "app/tools/page.tsx"), "utf8");
    expect(hexagramIndexPage).not.toContain("HexagramMemoryGuide");
    expect(toolPage).toContain("<HexagramMemoryGuide />");
    expect(toolsIndex).toContain('href: "/tools/hexagram-sequence"');
  });
});
