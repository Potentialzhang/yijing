import { describe, expect, it } from "vitest";
import { documentTitleForPathname } from "@/core/navigation/document-title";

describe("路由文档标题", () => {
  it("为静态页面生成描述性标题", () => {
    expect(documentTitleForPathname("/")).toBe("今日 · 易境");
    expect(documentTitleForPathname("/tools/compass")).toBe("学习罗盘 · 易境");
    expect(documentTitleForPathname("/library")).toBe("易学知识库 · 易境");
    expect(documentTitleForPathname("/settings/ai")).toBe("AI 辅学设置 · 易境");
  });

  it("为动态详情和尾部斜线生成稳定标题", () => {
    expect(documentTitleForPathname("/hexagrams/63/")).toBe("第 63 卦详情 · 易境");
    expect(documentTitleForPathname("/trigrams/qian?from=tools")).toBe("乾卦详情 · 易境");
    expect(documentTitleForPathname("/learn/five-elements")).toBe("五行及生克 · 易境");
  });

  it("未知路由回退到产品标题", () => {
    expect(documentTitleForPathname("/this-route-does-not-exist")).toBe("易境 · 个人易学学习工具");
  });
});
