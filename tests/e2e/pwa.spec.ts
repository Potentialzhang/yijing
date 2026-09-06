import { expect, test } from "@playwright/test";

test("生产环境离线打开实验室分享链接时保留查询参数", async ({
  page,
  context,
}) => {
  test.skip(
    process.env.YIJING_PRODUCTION_E2E !== "1",
    "开发环境不注册 Service Worker，仅在生产 E2E 验证",
  );
  await page.goto("/lab/hexagram?lower=li&upper=kan&moving=1");
  await page.waitForFunction(
    async () => {
      if (!("serviceWorker" in navigator)) return false;
      const registrations = await navigator.serviceWorker.getRegistrations();
      return registrations.some((registration) => registration.scope.endsWith("/"));
    },
    undefined,
    { timeout: 10_000 },
  );

  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  // A registration controls the next navigation, so establish control while
  // online before simulating the offline reload.
  await page.reload({ waitUntil: "networkidle" });
  await expect
    .poll(() =>
      page.evaluate(async () => {
        const cache = await caches.open("yijing-static-v64");
        const keys = await cache.keys();
        return keys.some((request) => new URL(request.url).search.length > 0);
      }),
    )
    .toBe(false);
  // Poison an exact query-string entry to prove offline navigation always
  // reads the canonical pathname shell instead of trusting stale share-link
  // HTML. The current worker never writes such entries, but older caches or
  // external tooling may still leave one behind.
  await page.evaluate(async () => {
        const cache = await caches.open("yijing-static-v64");
    await cache.put(
      "/lab/hexagram?lower=li&upper=kan&moving=1",
      new Response("<html><body>stale query cache</body></html>", {
        headers: { "content-type": "text/html" },
      }),
    );
  });
  if (test.info().project.name === "webkit") {
    // Playwright WebKit currently raises an internal error for offline
    // navigation/reload before the service worker can answer. Verify the
    // cache-level fallback in that browser and leave real navigation to the
    // Chromium run; this keeps the limitation explicit rather than hiding it.
    const fallback = await page.evaluate(async () => {
        const cache = await caches.open("yijing-static-v64");
      return Boolean(await cache.match("/lab/hexagram"));
    });
    expect(fallback).toBe(true);
    return;
  }
  await context.setOffline(true);
  const offlinePage = await context.newPage();
  try {
    await offlinePage.goto(
      "/lab/hexagram?lower=li&upper=kan&moving=1",
      { waitUntil: "domcontentloaded" },
    );
    await expect(offlinePage).toHaveURL(/\/lab\/hexagram\?lower=li&upper=kan&moving=1/);
    await expect(
      offlinePage.getByRole("heading", { name: "组合上下卦，观察一爻如何改变全局" }),
    ).toBeVisible();
  } finally {
    await offlinePage.close();
    await context.setOffline(false);
  }
});

test("生产环境升级 Service Worker 时会清理旧版本缓存", async ({ page }) => {
  test.skip(
    process.env.YIJING_PRODUCTION_E2E !== "1",
    "开发环境不注册 Service Worker，仅在生产 E2E 验证",
  );
  // about:blank has an opaque origin and cannot access Cache Storage; use the
  // same-origin worker script as a neutral document before registration.
  await page.goto("/sw.js");
  await page.evaluate(async () => {
    const previousCache = await caches.open("yijing-static-v19");
    await previousCache.put(
      "/previous-cache-marker",
      new Response("previous", { headers: { "content-type": "text/plain" } }),
    );
    const currentLegacyCache = await caches.open("yijing-static-v20");
    await currentLegacyCache.put(
      "/current-legacy-cache-marker",
      new Response("current-legacy", { headers: { "content-type": "text/plain" } }),
    );
    const currentVersionCache = await caches.open("yijing-static-v35");
    await currentVersionCache.put(
      "/previous-current-cache-marker",
      new Response("previous-current", { headers: { "content-type": "text/plain" } }),
    );
    const previousVersionCache = await caches.open("yijing-static-v36");
    await previousVersionCache.put(
      "/previous-version-cache-marker",
      new Response("previous-version", { headers: { "content-type": "text/plain" } }),
    );
    const latestPreviousCache = await caches.open("yijing-static-v62");
    await latestPreviousCache.put(
      "/latest-previous-cache-marker",
      new Response("latest-previous", { headers: { "content-type": "text/plain" } }),
    );
    const immediatelyPreviousCache = await caches.open("yijing-static-v63");
    await immediatelyPreviousCache.put(
      "/immediately-previous-cache-marker",
      new Response("immediately-previous", { headers: { "content-type": "text/plain" } }),
    );
    const legacyCache = await caches.open("yijing-static-v11");
    await legacyCache.put(
      "/legacy-cache-marker",
      new Response("legacy", { headers: { "content-type": "text/plain" } }),
    );
  });
  await page.goto("/");
  await page.waitForFunction(
    async () => {
      if (!("serviceWorker" in navigator)) return false;
      const registrations = await navigator.serviceWorker.getRegistrations();
      return registrations.some((registration) => registration.scope.endsWith("/"));
    },
    undefined,
    { timeout: 10_000 },
  );
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  await expect
    .poll(() => page.evaluate(() => caches.keys()))
    .toContain("yijing-static-v64");
  await expect
    .poll(() => page.evaluate(() => caches.keys()))
    .not.toContain("yijing-static-v19");
  await expect
    .poll(() => page.evaluate(() => caches.keys()))
    .not.toContain("yijing-static-v20");
  await expect
    .poll(() => page.evaluate(() => caches.keys()))
    .not.toContain("yijing-static-v35");
  await expect
    .poll(() => page.evaluate(() => caches.keys()))
    .not.toContain("yijing-static-v36");
  await expect
    .poll(() => page.evaluate(() => caches.keys()))
    .not.toContain("yijing-static-v62");
  await expect
    .poll(() => page.evaluate(() => caches.keys()))
    .not.toContain("yijing-static-v63");
  await expect
    .poll(() => page.evaluate(() => caches.keys()))
    .not.toContain("yijing-static-v11");
});
