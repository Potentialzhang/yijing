import { expect, test } from "@playwright/test";

test.setTimeout(120_000);

test("本地索引搜索与爻点击交互满足性能基线", async ({ page }) => {
  await page.goto("/hexagrams", { waitUntil: "domcontentloaded" });
  const search = page.getByLabel("搜索卦名、序号或上下卦");
  await page.evaluate(() => {
    document.addEventListener("input", () => performance.mark("hexagram-search-input"), { once: true, capture: true });
    const observer = new MutationObserver(() => {
        const counter = document.querySelector<HTMLElement>(".hexagram-toolbar > span");
        if (counter?.textContent?.includes("匹配 1 卦")) {
          performance.mark("hexagram-search-result");
          observer.disconnect();
        }
    });
    observer.observe(document.body, { childList: true, characterData: true, subtree: true });
  });
  await search.fill("既济");
  await expect(page.getByText("匹配 1 卦")).toBeVisible();
  const searchDuration = await page.evaluate(() => performance.measure("hexagram-search", "hexagram-search-input", "hexagram-search-result").duration);
  expect(searchDuration).toBeLessThan(300);

  await page.goto("/lab/hexagram", { waitUntil: "domcontentloaded" });
  await page.evaluate(() => {
    document.addEventListener("click", (event) => { if ((event.target as HTMLElement).closest(".position-chips button")) performance.mark("line-click"); }, { once: true, capture: true });
    const observer = new MutationObserver(() => {
        const result = document.querySelector<HTMLElement>(".changed-result .result-label");
        if (result?.textContent?.includes("动 1 爻")) {
          performance.mark("line-result");
          observer.disconnect();
        }
    });
    observer.observe(document.body, { childList: true, characterData: true, subtree: true });
  });
  await page.getByRole("button", { name: "1爻" }).first().click();
  await expect(page.getByText(/变卦 · 动 1 爻/)).toBeVisible();
  const clickDuration = await page.evaluate(() => performance.measure("line-change", "line-click", "line-result").duration);
  expect(clickDuration).toBeLessThan(300);
});

test("历法输入审阅的时区规范化满足性能基线", async ({ page }) => {
  await page.goto("/tools/calendar", { waitUntil: "domcontentloaded" });
  await expect(page.getByRole("button", { name: "审阅输入" })).toBeVisible();
  await page.evaluate(() => {
    const button = document.querySelector<HTMLButtonElement>(
      '.calendar-input-form button[type="button"]',
    );
    button?.addEventListener(
      "click",
      () => performance.mark("calendar-review-click"),
      { once: true },
    );
    const observer = new MutationObserver(() => {
      if (document.querySelector(".calendar-reading")) {
        performance.mark("calendar-review-result");
        observer.disconnect();
      }
    });
    observer.observe(document.body, {
      childList: true,
      characterData: true,
      subtree: true,
    });
  });
  await page.getByRole("button", { name: "审阅输入" }).click();
  await expect(page.locator(".calendar-reading")).toBeVisible();
  const reviewDuration = await page.evaluate(() =>
    performance.measure(
      "calendar-review",
      "calendar-review-click",
      "calendar-review-result",
    ).duration,
  );
  expect(reviewDuration).toBeLessThan(300);
});
