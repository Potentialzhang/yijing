import { expect, test } from "@playwright/test";

type AxeWindow = Window & {
  axe: {
    run: (
      context: Document,
      options: { runOnly: string[] },
    ) => Promise<{ violations: unknown[] }>;
  };
};

const routes = [
  "/",
  "/learn",
  "/learn/heavenly-stems",
  "/learn/earthly-branches",
  "/learn/five-elements",
  "/learn/hexagram-composition",
  "/trigrams",
  "/trigrams/qian",
  "/hexagrams",
  "/hexagrams/1",
  "/review",
  "/review/session",
  "/stats",
  "/notes",
  "/settings",
  "/settings/data",
  "/settings/content",
  "/settings/preferences",
  "/settings/ai",
  "/self-test",
  "/tools/five-elements",
  "/tools/trigrams",
  "/tools",
  "/tools/sexagenary-relations",
  "/tools/hetu-luoshu",
  "/tools/compass",
  "/tools/calendar",
  "/lab/hexagram",
  "/this-route-does-not-exist",
];

test("核心页面通过 WCAG 2 AA 自动扫描", async ({ page }) => {
  test.setTimeout(120_000);
  for (const route of routes) {
    // Network-idle is not a meaningful readiness signal for a local-first
    // page: Service Worker, font and IndexedDB activity can keep WebKit busy
    // long after the document is usable. Wait for the document and the app's
    // own database gate instead, then scan the rendered surface.
    await page.goto(route, { waitUntil: "domcontentloaded" });
    await expect(page.locator(".database-loading")).toHaveCount(0, {
      timeout: 10_000,
    });
    // `/settings` is a static alias that completes its redirect after the
    // client shell hydrates. Wait for the destination before scanning so axe
    // never observes the transient shell metadata between the two routes.
    if (route === "/settings") {
      await page.waitForURL("**/settings/data", { timeout: 10_000 });
    }
    await expect
      .poll(
        () =>
          page.evaluate(
            () => document.head.querySelector("title")?.textContent ?? "",
          ),
        { timeout: 10_000 },
      )
      .toContain("易境");
    if (route === "/settings/ai") {
      await page.getByLabel("允许使用 AI 辅学").check();
      await page.getByLabel("我选定的笔记").check();
      await page.getByRole("button", { name: "生成本地发送预览" }).click();
    }
    await page.addScriptTag({ path: require.resolve("axe-core/axe.min.js") });
    const result = await page.evaluate(async () => {
      const axe = (window as unknown as AxeWindow).axe;
      return axe.run(document, { runOnly: ["wcag2a", "wcag2aa"] });
    });
    expect(result.violations, `${route} 存在无障碍问题`).toEqual([]);
  }
});

test("键盘焦点与减少动画偏好保持可见且可预测", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/#lab", { waitUntil: "domcontentloaded" });
  await expect(page.locator(".database-loading")).toHaveCount(0, { timeout: 10_000 });

  const movingChip = page.locator(".position-chips").getByRole("button", { name: "1爻" });
  await movingChip.focus();
  await expect(movingChip).toBeFocused();
  await expect
    .poll(() => movingChip.evaluate((element) => getComputedStyle(element).outlineStyle))
    .toBe("solid");

  const motionStyles = await page.evaluate(() => ({
    scrollBehavior: getComputedStyle(document.documentElement).scrollBehavior,
    transitionDuration: getComputedStyle(document.body).transitionDuration,
    animationDuration: getComputedStyle(document.body).animationDuration,
  }));
  expect(motionStyles.scrollBehavior).toBe("auto");
  expect(Number.parseFloat(motionStyles.transitionDuration)).toBeGreaterThan(0);
  expect(Number.parseFloat(motionStyles.transitionDuration)).toBeLessThanOrEqual(0.01);
  expect(Number.parseFloat(motionStyles.animationDuration)).toBeGreaterThan(0);
  expect(Number.parseFloat(motionStyles.animationDuration)).toBeLessThanOrEqual(0.01);
});
