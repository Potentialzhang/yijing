import { expect, test } from "@playwright/test";

test.setTimeout(120_000);

test("手机、平板和桌面宽度无横向溢出并保留核心操作", async ({ page }) => {
  const routes = [
    {
      path: "/lab/hexagram",
      marker: page.getByRole("button", { name: "1爻" }).first(),
    },
    {
      path: "/learn/heavenly-stems",
      marker: page.getByRole("heading", { name: "十天干基础" }),
    },
    {
      path: "/learn/earthly-branches",
      marker: page.getByRole("heading", { name: "十二地支基础" }),
    },
    {
      path: "/tools/sexagenary-relations",
      marker: page.getByRole("tab", { name: "天干五合" }),
    },
    {
      path: "/tools/five-elements",
      marker: page.getByRole("button", { name: "同时显示" }),
    },
    {
      path: "/tools/trigrams",
      marker: page.getByRole("heading", { name: "先认出卦，再扩展象意。" }),
    },
    {
      path: "/tools/hetu-luoshu",
      marker: page.getByRole("tab", { name: "河图" }),
    },
    { path: "/tools/compass", marker: page.getByLabel("拖动角度") },
    {
      path: "/tools/calendar",
      marker: page.getByRole("button", { name: "计算干支与节气" }),
    },
    {
      path: "/settings/ai",
      marker: page.getByRole("button", { name: "生成本地发送预览" }),
    },
    {
      path: "/settings/content",
      marker: page.getByRole("heading", { name: "当前仍有待复核内容" }),
    },
    {
      path: "/notes",
      marker: page.getByRole("heading", { name: "我的收藏" }),
    },
    {
      path: "/settings/data",
      marker: page.getByRole("button", { name: "导出 JSON 备份" }),
    },
  ];
  let checkedViewportMeta = false;
  for (const viewport of [
    { width: 360, height: 800 },
    { width: 768, height: 900 },
    { width: 1024, height: 900 },
    { width: 1440, height: 900 },
  ]) {
    await page.setViewportSize(viewport);
    for (const route of routes) {
      // The marker is the app's readiness contract. Waiting for commit avoids
      // spending the whole navigation budget on a late load event when a
      // local-first page is already interactive (especially in WebKit).
      await page.goto(route.path, { waitUntil: "commit" });
      await expect(
        route.marker,
        `${route.path} 在 ${viewport.width}px 核心操作不可见`,
      ).toBeVisible({ timeout: 10_000 });
      if (!checkedViewportMeta) {
        const viewportContent = await page.locator('meta[name="viewport"]').getAttribute("content");
        expect(viewportContent).toContain("viewport-fit=cover");
        checkedViewportMeta = true;
      }
      const widths = await page.evaluate(() => ({
        scrollWidth: document.documentElement.scrollWidth,
        clientWidth: document.documentElement.clientWidth,
      }));
      expect(
        widths.scrollWidth,
        `${route.path} 在 ${viewport.width}px 出现横向溢出`,
      ).toBeLessThanOrEqual(widths.clientWidth);
    }
  }
});
