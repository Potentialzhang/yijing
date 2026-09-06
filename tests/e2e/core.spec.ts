import { expect, test, type Page } from "@playwright/test";
import { readFile } from "node:fs/promises";

async function gotoDatabasePage(page: Page, path: string): Promise<void> {
  let lastError: unknown;
  for (const timeout of [15_000, 45_000]) {
    try {
      await page.goto(path, { waitUntil: "commit", timeout });
      await expect(page.locator(".database-loading")).toHaveCount(0, { timeout: 20_000 });
      return;
    } catch (error: unknown) {
      lastError = error;
    }
  }
  throw lastError;
}

test.describe("易境核心学习流程", () => {
  test.describe.configure({ timeout: 120_000 });

  test("首页实验室可以设置动爻并显示变卦", async ({ page }) => {
    await page.goto("/");
    await expect(
      page.getByRole("heading", { name: "把看过的，变成会用的。" }),
    ).toBeVisible();
    await page.locator("#lab").scrollIntoViewIfNeeded();
    await page.getByRole("button", { name: /1爻/ }).first().click();
    await expect(page.getByText(/变卦 · 动 1 爻/)).toBeVisible();
    await expect(page.locator(".line-moving-mark")).toHaveCount(1);
    await expect(page.getByText("关系卦")).toHaveCount(0);
    await expect(page.getByLabel("关系卦")).toBeVisible();
  });

  test("今日页会即时刷新本地待复习摘要", async ({ page }) => {
    await page.goto("/");
    await expect(
      page.getByRole("heading", { name: "把看过的，变成会用的。" }),
    ).toBeVisible();
    await page.evaluate(async () => {
      const today = new Date().toLocaleDateString("sv-SE");
      await new Promise<void>((resolve, reject) => {
        const request = indexedDB.open("yijing-local");
        request.onerror = () => reject(request.error);
        request.onblocked = () => reject(new Error("今日页测试数据写入被 IndexedDB 连接阻塞"));
        request.onsuccess = () => {
          const db = request.result;
          const transaction = db.transaction("reviewCardStates", "readwrite");
          transaction.objectStore("reviewCardStates").put({
            cardId: "trigram-name-qian",
            targetType: "trigram",
            targetId: "qian",
            stepIndex: 0,
            dueDate: today,
            lapseCount: 0,
            consecutivePasses: 0,
            isWeak: false,
            updatedAt: new Date().toISOString(),
          });
          transaction.oncomplete = () => {
            db.close();
            window.dispatchEvent(new Event("yijing:data-changed"));
            resolve();
          };
          transaction.onerror = () => reject(transaction.error);
        };
      });
    });
    await expect(page.getByRole("heading", { name: "有 1 张卡片等你回忆" })).toBeVisible();
    await expect(page.getByRole("link", { name: "开始复习" })).toHaveAttribute("href", "/review");
  });

  test("页面从后台恢复可见时会立即刷新日期标签", async ({ page }) => {
    await page.addInitScript(() => {
      const NativeDate = Date;
      let now = NativeDate.parse("2026-08-31T12:00:00.000Z");
      class MockDate extends NativeDate {
        constructor(value?: string | number | Date) {
          super(value instanceof NativeDate ? value.getTime() : value === undefined ? now : value);
        }

        static now() {
          return now;
        }
      }
      Object.defineProperty(window, "Date", { configurable: true, value: MockDate });
      Object.defineProperty(window, "__setYijingTestDate", {
        configurable: true,
        value: (value: string) => { now = NativeDate.parse(value); },
      });
    });
    await page.goto("/");
    await expect(page.getByText("今日学习 · 08 月 31 日")).toBeVisible();
    await page.evaluate(() => {
      const setDate = (window as unknown as { __setYijingTestDate: (value: string) => void }).__setYijingTestDate;
      setDate("2026-09-01T12:00:00.000Z");
      document.dispatchEvent(new Event("visibilitychange"));
    });
    await expect(page.getByText("今日学习 · 09 月 01 日")).toBeVisible();
    await page.evaluate(() => {
      const setDate = (window as unknown as { __setYijingTestDate: (value: string) => void }).__setYijingTestDate;
      setDate("2026-09-02T12:00:00.000Z");
      window.dispatchEvent(new Event("pageshow"));
    });
    await expect(page.getByText("今日学习 · 09 月 02 日")).toBeVisible();
  });

  test("今日页完成复习后显示总结和下一次复习日期", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { name: "把看过的，变成会用的。" })).toBeVisible();
    await page.evaluate(async () => {
      const today = new Date().toLocaleDateString("sv-SE");
      await new Promise<void>((resolve, reject) => {
        const request = indexedDB.open("yijing-local");
        request.onerror = () => reject(request.error);
        request.onblocked = () => reject(new Error("今日完成摘要测试被 IndexedDB 连接阻塞"));
        request.onsuccess = () => {
          const db = request.result;
          const transaction = db.transaction(["reviewCardStates", "reviewAttempts"], "readwrite");
          transaction.objectStore("reviewCardStates").clear();
          transaction.objectStore("reviewAttempts").clear();
          transaction.objectStore("reviewCardStates").put({
            cardId: "trigram-name-qian",
            targetType: "trigram",
            targetId: "qian",
            algorithmVersion: 1,
            stepIndex: 1,
            dueDate: "2099-01-01",
            lapseCount: 0,
            consecutivePasses: 1,
            isWeak: false,
            updatedAt: new Date().toISOString(),
          });
          transaction.objectStore("reviewAttempts").put({
            id: "today-completed-review",
            cardId: "trigram-name-qian",
            exerciseVersion: 1,
            targetType: "trigram",
            promptSnapshot: "看卦符选卦名",
            answerSnapshot: "乾",
            objectiveCorrect: true,
            reviewMode: "spaced",
            hintUsed: false,
            recallGrade: "remembered",
            reviewedAt: new Date().toISOString(),
            localDate: today,
          });
          transaction.oncomplete = () => { db.close(); window.dispatchEvent(new Event("yijing:data-changed")); resolve(); };
          transaction.onerror = () => { db.close(); reject(transaction.error); };
        };
      });
    });
    const tasks = page.getByRole("region", { name: "今日任务" });
    await expect(tasks.getByRole("heading", { name: "今天已完成 1 张复习卡" })).toBeVisible();
    await expect(tasks).toContainText("下一次复习：2099-01-01");
    await expect(tasks.getByRole("link", { name: "继续学习" })).toHaveAttribute("href", "/learn/yin-yang-lines");
  });

  test("今日页最近学习位置可以继续进入上下文", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator(".stats-card")).toBeVisible();
    await page.evaluate(async () => {
      await new Promise<void>((resolve, reject) => {
        const request = indexedDB.open("yijing-local");
        request.onerror = () => reject(request.error);
        request.onblocked = () => reject(new Error("最近位置测试被 IndexedDB 连接阻塞"));
        request.onsuccess = () => {
          const db = request.result;
          const transaction = db.transaction(["reviewAttempts", "reviewCardStates", "conceptProgress"], "readwrite");
          transaction.objectStore("reviewAttempts").clear();
          transaction.objectStore("reviewCardStates").clear();
          transaction.objectStore("conceptProgress").clear();
          transaction.objectStore("reviewCardStates").put({
            cardId: "trigram-name-qian",
            targetType: "trigram",
            targetId: "qian",
            algorithmVersion: 1,
            stepIndex: 1,
            dueDate: "2099-01-01",
            lapseCount: 0,
            consecutivePasses: 1,
            isWeak: false,
            updatedAt: "2026-08-27T00:00:00.000Z",
          });
          transaction.objectStore("reviewAttempts").put({
            id: "recent-position-attempt",
            cardId: "trigram-name-qian",
            exerciseVersion: 1,
            targetType: "trigram",
            promptSnapshot: "测试最近位置",
            answerSnapshot: "乾",
            objectiveCorrect: true,
            reviewMode: "spaced",
            hintUsed: false,
            recallGrade: "remembered",
            reviewedAt: "2026-08-27T00:00:00.000Z",
            localDate: "2026-08-27",
          });
          transaction.oncomplete = () => {
            db.close();
            window.dispatchEvent(new Event("yijing:data-changed"));
            resolve();
          };
          transaction.onerror = () => reject(transaction.error);
        };
      });
    });
    const recent = page.locator(".recent-position");
    await expect(recent.getByRole("link", { name: /继续学习/ })).toHaveAttribute("href", "/trigrams/qian");
    await expect(recent).toContainText("八卦 · 乾");
  });

  test("今日页最近位置遇到未知知识 ID 时会回退到安全入口", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator(".stats-card")).toBeVisible();
    await page.evaluate(async () => {
      await new Promise<void>((resolve, reject) => {
        const request = indexedDB.open("yijing-local");
        request.onerror = () => reject(request.error);
        request.onblocked = () => reject(new Error("未知最近位置测试被 IndexedDB 连接阻塞"));
        request.onsuccess = () => {
          const db = request.result;
          const transaction = db.transaction(["reviewAttempts", "reviewCardStates", "conceptProgress"], "readwrite");
          transaction.objectStore("reviewAttempts").clear();
          transaction.objectStore("reviewCardStates").clear();
          transaction.objectStore("conceptProgress").clear();
          transaction.objectStore("reviewCardStates").put({
            cardId: "trigram-name-qian",
            targetType: "trigram",
            targetId: "unknown-trigram",
            algorithmVersion: 1,
            stepIndex: 1,
            dueDate: "2099-01-01",
            lapseCount: 0,
            consecutivePasses: 1,
            isWeak: false,
            updatedAt: "2026-08-27T00:00:00.000Z",
          });
          transaction.objectStore("reviewAttempts").put({
            id: "unknown-recent-position-attempt",
            cardId: "trigram-name-qian",
            exerciseVersion: 1,
            targetType: "trigram",
            promptSnapshot: "测试未知最近位置",
            answerSnapshot: "未知",
            objectiveCorrect: true,
            reviewMode: "spaced",
            hintUsed: false,
            recallGrade: "remembered",
            reviewedAt: "2026-08-27T00:00:00.000Z",
            localDate: "2026-08-27",
          });
          transaction.oncomplete = () => {
            db.close();
            window.dispatchEvent(new Event("yijing:data-changed"));
            resolve();
          };
          transaction.onerror = () => reject(transaction.error);
        };
      });
    });
    const recent = page.locator(".recent-position");
    await expect(recent.getByRole("link", { name: /继续学习/ })).toHaveAttribute("href", "/trigrams");
    await expect(recent).toContainText("八卦 · 内容已不可用");
  });

  test("今日摘要不会把孤立复习卡和知识进度计入任务", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator(".stats-card")).toBeVisible();
    await page.evaluate(async () => {
      await new Promise<void>((resolve, reject) => {
        const request = indexedDB.open("yijing-local");
        request.onerror = () => reject(request.error);
        request.onblocked = () => reject(new Error("孤立记录测试被 IndexedDB 连接阻塞"));
        request.onsuccess = () => {
          const db = request.result;
          const transaction = db.transaction(["reviewAttempts", "reviewCardStates", "conceptProgress"], "readwrite");
          transaction.objectStore("reviewAttempts").clear();
          transaction.objectStore("reviewCardStates").clear();
          transaction.objectStore("conceptProgress").clear();
          transaction.objectStore("reviewCardStates").put({
            cardId: "removed-exercise-card",
            targetType: "trigram",
            targetId: "removed-trigram",
            algorithmVersion: 1,
            stepIndex: 1,
            dueDate: new Date().toLocaleDateString("sv-SE"),
            lapseCount: 0,
            consecutivePasses: 0,
            isWeak: false,
            updatedAt: new Date().toISOString(),
          });
          transaction.objectStore("conceptProgress").put({
            conceptId: "removed-concept",
            status: "mastered",
            masteryScore: 100,
            lastStudiedAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          });
          transaction.oncomplete = () => {
            db.close();
            window.dispatchEvent(new Event("yijing:data-changed"));
            resolve();
          };
          transaction.onerror = () => reject(transaction.error);
        };
      });
    });
    await expect(page.getByRole("heading", { name: "从「阴阳与爻」开始" })).toBeVisible();
    await expect(page.locator(".stat-main strong")).toHaveText("00");
    await expect(page.locator(".recent-position")).toContainText("还没有学习记录");
  });

  test("首页和统计不会把孤立作答历史计入指标", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator(".stats-card")).toBeVisible();
    await page.evaluate(async () => {
      await new Promise<void>((resolve, reject) => {
        const request = indexedDB.open("yijing-local");
        request.onerror = () => reject(request.error);
        request.onblocked = () => reject(new Error("孤立作答历史测试被 IndexedDB 连接阻塞"));
        request.onsuccess = () => {
          const db = request.result;
          const transaction = db.transaction(["reviewAttempts", "reviewCardStates", "conceptProgress"], "readwrite");
          transaction.objectStore("reviewAttempts").clear();
          transaction.objectStore("reviewCardStates").clear();
          transaction.objectStore("conceptProgress").clear();
          transaction.objectStore("reviewAttempts").put({
            id: "removed-attempt",
            cardId: "removed-exercise-card",
            exerciseVersion: 1,
            targetType: "trigram",
            promptSnapshot: "已删除题目",
            answerSnapshot: "已删除答案",
            objectiveCorrect: false,
            reviewMode: "spaced",
            hintUsed: false,
            recallGrade: "forgot",
            reviewedAt: new Date().toISOString(),
            localDate: new Date().toLocaleDateString("sv-SE"),
          });
          transaction.objectStore("reviewCardStates").put({
            cardId: "trigram-name-qian",
            targetType: "trigram",
            targetId: "qian",
            algorithmVersion: 1,
            stepIndex: Number.NaN,
            dueDate: new Date().toLocaleDateString("sv-SE"),
            lapseCount: 0,
            consecutivePasses: 0,
            isWeak: false,
            updatedAt: new Date().toISOString(),
          });
          transaction.objectStore("reviewAttempts").put({
            id: "broken-known-attempt",
            cardId: "trigram-name-qian",
            exerciseVersion: 1,
            targetType: "trigram",
            promptSnapshot: "损坏状态题目",
            answerSnapshot: "损坏状态答案",
            objectiveCorrect: false,
            reviewMode: "spaced",
            hintUsed: false,
            recallGrade: "forgot",
            reviewedAt: new Date().toISOString(),
            localDate: new Date().toLocaleDateString("sv-SE"),
          });
          transaction.oncomplete = () => {
            db.close();
            window.dispatchEvent(new Event("yijing:data-changed"));
            resolve();
          };
          transaction.onerror = () => reject(transaction.error);
        };
      });
    });
    const miniStats = page.locator(".mini-stats");
    await expect(miniStats.locator("div").first()).toContainText("0");
    await page.getByRole("link", { name: "查看周/月统计 ↗" }).click();
    await expect(page).toHaveURL(/\/stats$/);
    const summary = page.locator(".stats-summary-grid");
    await expect(summary.locator("div").first()).toContainText("0");
    await expect(page.getByText("还没有这段时间的作答记录")).toBeVisible();
  });

  test("实验室有可直接访问的独立路由", async ({ page }) => {
    await page.goto("/lab/hexagram");
    await expect(
      page.getByRole("heading", { name: "亲手组合，理解变化。" }),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "组合上下卦，观察一爻如何改变全局" }),
    ).toBeVisible();
    await expect(
      page
        .getByRole("navigation", { name: "主导航" })
        .getByRole("link", { name: "六十四卦" }),
    ).toBeVisible();
    await page.goto("/review/session");
    await expect(
      page.getByRole("heading", { name: "把这一组回忆完成。" }),
    ).toBeVisible();
    await page.goto("/tools/trigrams");
    await expect(page).toHaveURL(/\/tools\/trigrams$/);
    await expect(
      page.getByRole("heading", { name: "先认出卦，再扩展象意。" }),
    ).toBeVisible();
    await expect(page.getByRole("link", { name: "← 工具" })).toHaveAttribute(
      "href",
      "/tools",
    );
    await page.goto("/this-route-does-not-exist");
    await expect(
      page.getByRole("heading", { name: "这条路径还没有卦象。" }),
    ).toBeVisible();
  });

  test("首页工具导航进入工具集合", async ({ page }) => {
    await page.goto("/");
    const toolsLink = page
      .getByRole("navigation", { name: "主导航" })
      .getByRole("link", { name: "工具" });
    await expect(toolsLink).toHaveAttribute("href", "/tools");
    await toolsLink.click();
    await expect(page).toHaveURL(/\/tools$/);
    await expect(
      page.getByRole("heading", { name: "把关系放到眼前。" }),
    ).toBeVisible();
    await expect(page.getByRole("link", { name: /八卦卡片/ })).toBeVisible();
    await expect(page.getByRole("link", { name: /360° 学习罗盘/ })).toBeVisible();
  });

  test("五行工具返回工具集合", async ({ page }) => {
    await page.goto("/tools/five-elements");
    await page.getByRole("link", { name: "← 工具" }).click();
    await expect(page).toHaveURL(/\/tools$/);
    await expect(page.getByRole("heading", { name: "把关系放到眼前。" })).toBeVisible();
  });

  test("干支关系工具返回工具集合", async ({ page }) => {
    await page.goto("/tools/sexagenary-relations");
    await page.getByRole("link", { name: "← 工具" }).click();
    await expect(page).toHaveURL(/\/tools$/);
    await expect(page.getByRole("heading", { name: "把关系放到眼前。" })).toBeVisible();
  });

  test("设置子页面会在全局导航标记设置入口", async ({ page }) => {
    await page.goto("/settings/content");
    const settingsLink = page
      .getByRole("navigation", { name: "主导航" })
      .getByRole("link", { name: "设置" });
    await expect(settingsLink).toHaveAttribute("aria-current", "page");
    await page.goto("/settings/ai");
    await expect(
      page
        .getByRole("navigation", { name: "主导航" })
        .getByRole("link", { name: "设置" }),
    ).toHaveAttribute("aria-current", "page");
  });

  test.describe("静态八卦卡片结构", () => {
    // This assertion does not exercise offline behavior. Blocking the
    // Service Worker keeps long production WebKit runs from accumulating
    // unrelated cache-install work while still rendering the real page.
    test.use({ serviceWorkers: "block" });

    test("八卦卡片使用真实三爻结构", async ({ page }) => {
      await page.goto("/trigrams", { waitUntil: "domcontentloaded" });
      await expect(
        page.getByRole("heading", { name: "先认出卦，再扩展象意。" }),
      ).toBeVisible();
      await expect(page.locator(".trigram-card")).toHaveCount(8);
      await expect(
        page.locator(".trigram-card").first().locator(".trigram-line"),
      ).toHaveCount(3);
      await expect(page.locator(".trigram-card").first()).toContainText("阴阳构成");
      await expect(page.locator(".trigram-card").first()).toContainText("先天方位");
    });
  });

  test("应用提供可安装的 Web App Manifest", async ({ page, request }) => {
    await page.goto("/");
    const manifest = await request.get("/manifest.webmanifest");
    expect(manifest.ok()).toBe(true);
    const data = await manifest.json();
    expect(data.name).toContain("易境");
    expect(data.display).toBe("standalone");
    expect(data.icons).toEqual(expect.arrayContaining([
      expect.objectContaining({ src: "/icon-192.png", sizes: "192x192", type: "image/png" }),
      expect.objectContaining({ src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" }),
      expect.objectContaining({ src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" }),
      expect.objectContaining({ src: "/icon.svg", type: "image/svg+xml" }),
    ]));
    const icon = await request.get("/icon.svg");
    expect(icon.ok()).toBe(true);
    expect(await icon.text()).toContain("易境");
    for (const [path, contentType] of [["/icon-192.png", "image/png"], ["/icon-512.png", "image/png"]] as const) {
      const response = await request.get(path);
      expect(response.ok()).toBe(true);
      expect(response.headers()["content-type"]).toContain(contentType);
    }
    await expect(page.locator('link[rel="manifest"]')).toHaveAttribute(
      "href",
      "/manifest.webmanifest",
    );
    const serviceWorker = await request.get("/sw.js");
    expect(serviceWorker.ok()).toBe(true);
    const serviceWorkerText = await serviceWorker.text();
    expect(serviceWorkerText).toContain("yijing-static-v69");
    expect(serviceWorkerText).toContain("function precacheCoreRoutes");
    expect(serviceWorkerText).toContain("A single temporarily unavailable route");
    expect(serviceWorkerText).toContain("function matchCachedRequest");
    expect(serviceWorkerText).toContain("function cacheSuccessfulResponse");
    expect(serviceWorkerText).toContain("if (!response.ok) return");
    expect(serviceWorkerText).toContain("cache.match(cacheKey)");
    expect(serviceWorkerText).toContain("Always read the canonical pathname entry");
    const health = await request.get("/api/health", { failOnStatusCode: false });
    expect(health.status()).toBe(200);
    expect(health.headers()["cache-control"]).toBe("no-store");
    await expect(health.json()).resolves.toMatchObject({
      status: "ok",
      service: "易境",
      appVersion: "0.1.0",
      serviceWorkerCache: "yijing-static-v69",
      storage: "postgresql",
    });
    for (const conceptId of [
      "yin-yang-lines",
      "heavenly-stems",
      "earthly-branches",
      "hetu-luoshu",
      "nine-palaces",
      "active-recall",
    ]) {
      expect(serviceWorkerText).toContain(`"${conceptId}"`);
    }
    for (const route of [
      "/tools/sexagenary-relations",
      "/tools/hetu-luoshu",
      "/tools/compass",
      "/settings/content",
    ]) {
      expect(serviceWorkerText).toContain(`"${route}"`);
    }
  });

  test("Service Worker 注册失败时保留可学习页面并显示降级提示", async ({ page }) => {
    test.skip(process.env.YIJING_PRODUCTION_E2E !== "1", "仅在生产构建中验证 Service Worker 降级");
    await page.addInitScript(() => {
      if (!("serviceWorker" in navigator) || typeof ServiceWorkerContainer === "undefined") return;
      Object.defineProperty(ServiceWorkerContainer.prototype, "register", {
        configurable: true,
        value: () => Promise.reject(new Error("测试模拟注册失败")),
      });
    });
    await page.goto("/");
    await expect(page.getByRole("heading", { name: "把看过的，变成会用的。" })).toBeVisible();
    await expect(page.getByRole("status").filter({ hasText: "离线缓存暂不可用" })).toBeVisible();
  });

  test("支持的平台会显示安装入口并允许用户触发安装", async ({ page, browser }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { name: "把看过的，变成会用的。" })).toBeVisible();
    await page.evaluate(() => {
      const event = new Event("beforeinstallprompt", { cancelable: true });
      Object.defineProperty(event, "prompt", { value: () => Promise.resolve() });
      Object.defineProperty(event, "userChoice", {
        value: Promise.resolve({ outcome: "accepted", platform: "test" }),
      });
      window.dispatchEvent(event);
    });
    const prompt = page.getByRole("complementary", { name: "安装易境" });
    await expect(prompt).toBeVisible();
    await prompt.getByRole("button", { name: "安装易境" }).click();
    await expect(prompt).toBeHidden();
    const iosContext = await browser.newContext({ userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Version/17.0 Mobile/15E148 Safari/604.1" });
    const iosPage = await iosContext.newPage();
    try {
      const hydrationErrors: string[] = [];
      iosPage.on("console", (message) => {
        if (message.type() === "error" && /hydration|hydrat/i.test(message.text())) hydrationErrors.push(message.text());
      });
      await iosPage.goto("/");
      const iosPrompt = iosPage.getByRole("complementary", { name: "安装易境" });
      await expect(iosPrompt).toBeVisible();
      expect(hydrationErrors, "iOS 安装提示不应产生水合错误").toEqual([]);
      await expect(iosPrompt).toContainText("分享");
      await iosPrompt.getByRole("button", { name: "知道了" }).click();
      await expect(iosPrompt).toBeHidden();
    } finally {
      await iosContext.close();
    }
  });

  test("统计页支持七日和三十日切换", async ({ page }) => {
    await page.goto("/stats");
    await expect(
      page.getByRole("heading", { name: "看见自己的学习节奏。" }),
    ).toBeVisible();
    await expect(page.getByRole("tab", { name: "近 7 天" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    await expect(page.getByRole("tab", { name: "近 7 天" })).toHaveAttribute(
      "aria-controls",
      "stats-period-panel",
    );
    await expect(page.getByRole("tabpanel")).toHaveAttribute(
      "aria-labelledby",
      "stats-period-7",
    );
    await page.getByRole("tab", { name: "近 7 天" }).focus();
    await page.keyboard.press("ArrowRight");
    await expect(page.getByRole("tab", { name: "近 30 天" })).toBeFocused();
    await page.keyboard.press("Home");
    await expect(page.getByRole("tab", { name: "近 7 天" })).toBeFocused();
    await page.keyboard.press("End");
    await expect(page.getByRole("tab", { name: "近 30 天" })).toBeFocused();
    await page.getByRole("tab", { name: "近 30 天" }).click();
    await expect(page.getByRole("tab", { name: "近 30 天" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    await expect(page.getByRole("tabpanel")).toHaveAttribute(
      "aria-labelledby",
      "stats-period-30",
    );
    await expect(page.getByText("7 日学习留存", { exact: true })).toBeVisible();
    await expect(page.getByText("到期卡完成率", { exact: true })).toBeVisible();
    await expect(page.getByText("7 日后记忆率", { exact: true })).toBeVisible();
    await expect(page.getByText("推演独立完成率", { exact: true })).toBeVisible();
    await expect(page.getByText("14 日薄弱点改善率", { exact: true })).toBeVisible();
  });

  test("统计页到期卡完成率不会被孤立复习卡污染", async ({ page }) => {
    await page.goto("/stats");
    await expect(page.locator(".study-stats-panel")).toBeVisible();
    await page.evaluate(async () => {
      await new Promise<void>((resolve, reject) => {
        const request = indexedDB.open("yijing-local");
        request.onerror = () => reject(request.error);
        request.onblocked = () => reject(new Error("统计孤立卡测试被 IndexedDB 连接阻塞"));
        request.onsuccess = () => {
          const db = request.result;
          const transaction = db.transaction(["reviewAttempts", "reviewCardStates"], "readwrite");
          transaction.objectStore("reviewAttempts").clear();
          transaction.objectStore("reviewCardStates").clear();
          transaction.objectStore("reviewCardStates").put({
            cardId: "removed-exercise-card",
            targetType: "trigram",
            targetId: "removed-trigram",
            algorithmVersion: 1,
            stepIndex: 1,
            dueDate: new Date().toLocaleDateString("sv-SE"),
            lapseCount: 0,
            consecutivePasses: 0,
            isWeak: false,
            updatedAt: new Date().toISOString(),
          });
          transaction.oncomplete = () => {
            db.close();
            window.dispatchEvent(new Event("yijing:data-changed"));
            resolve();
          };
          transaction.onerror = () => reject(transaction.error);
        };
      });
    });
    const metric = page.getByText("到期卡完成率", { exact: true }).locator("..");
    await expect(metric).toContainText("—");
  });

  test("内容设置页集中展示来源和经典文本复核门禁", async ({ page }) => {
    await page.goto("/settings/content");
    await expect(page.getByRole("heading", { name: "先确认来源，再扩展解释。" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "当前仍有待复核内容" })).toBeVisible();
    await expect(page.getByText("已核验卦辞", { exact: true })).toBeVisible();
    await expect(page.getByText("0 / 64", { exact: true })).toBeVisible();
    await expect(page.getByText("0 / 384", { exact: true })).toBeVisible();
    await expect(page.getByRole("heading", { name: "来源与收录策略" })).toBeVisible();
    await expect(page.getByText("作者：易境项目组 · 版本：内置学习版 v0.1 · 出版方：易境项目 · 年份：2026 · 定位：content/knowledge.ts · content/exercises.ts", { exact: true })).toBeVisible();
    await expect(page.getByText("《周易》经文底本（待确定）", { exact: true })).toBeVisible();
    const calendarAudit = page.locator(".content-audit-calendar");
    await expect(calendarAudit.getByRole("heading", { name: "历法边界样例" })).toBeVisible();
    await expect(calendarAudit).toContainText("规则集 calendar-draft-1 仍是草案");
    await expect(calendarAudit.locator(".content-audit-calendar-item")).toHaveCount(6);
    await expect(calendarAudit.locator(".content-audit-calendar-item").filter({ hasText: "换年边界" })).toContainText("待补齐");
    await expect(calendarAudit).toContainText("只有六类边界样例全部标记为 verified");
    const evidenceInspector = page.locator(".content-audit-evidence-inspector");
    await expect(evidenceInspector.getByRole("heading", { name: "校验外部历法样例" })).toBeVisible();
    const inspectButton = evidenceInspector.getByRole("button", { name: "校验样例包" });
    await expect(inspectButton).toBeDisabled();
    const templateDownloadPromise = page.waitForEvent("download");
    await evidenceInspector.getByRole("button", { name: "下载空白模板" }).click();
    const templateDownload = await templateDownloadPromise;
    expect(templateDownload.suggestedFilename()).toBe("yijing-calendar-evidence-template.json");
    const templateDownloadPath = await templateDownload.path();
    expect(templateDownloadPath).toBeTruthy();
    expect(JSON.parse(await readFile(templateDownloadPath!, "utf8"))).toMatchObject({
      ruleSet: { id: "calendar-draft-1", status: "draft" },
      samples: [],
    });
    await expect(evidenceInspector.getByText("空白样例模板已下载，可交给内容负责人填写。模板不会写入应用。", { exact: true })).toBeVisible();
    await evidenceInspector.getByRole("button", { name: "填入空白模板" }).click();
    await expect(inspectButton).toBeEnabled();
    await inspectButton.click();
    await expect(evidenceInspector.getByRole("status")).toContainText("结构与来源校验通过");
    await expect(evidenceInspector.getByRole("status")).toContainText("待补齐 换年、换月、换日、子时、时区、节气");
    await expect(evidenceInspector.locator(".content-audit-evidence-boundaries li")).toHaveCount(6);
    await expect(evidenceInspector.locator(".content-audit-evidence-boundaries li").first()).toContainText("换年");
    await expect(evidenceInspector.locator(".content-audit-evidence-boundaries li").first()).toContainText("尚未登记权威样例");
    const evidenceReportButton = evidenceInspector.getByRole("button", { name: "下载校验报告" });
    await expect(evidenceReportButton).toBeVisible();
    const evidenceDownloadPromise = page.waitForEvent("download");
    await evidenceReportButton.click();
    const evidenceDownload = await evidenceDownloadPromise;
    expect(evidenceDownload.suggestedFilename()).toMatch(/^yijing-calendar-evidence-validation-\d{4}-\d{2}-\d{2}\.json$/);
    const evidenceDownloadPath = await evidenceDownload.path();
    expect(evidenceDownloadPath).toBeTruthy();
    const evidenceReport = JSON.parse(await readFile(evidenceDownloadPath!, "utf8")) as {
      reportVersion?: number;
      samples?: unknown[];
      coverage?: { allSamples?: { sampleCount?: number } };
    };
    expect(evidenceReport).toMatchObject({
      reportVersion: 1,
      samples: [],
      coverage: { allSamples: { sampleCount: 0 } },
    });
    await evidenceInspector.getByLabel("样例包 JSON").fill(JSON.stringify(evidenceReport));
    await inspectButton.click();
    await expect(evidenceInspector.getByRole("status")).toContainText("校验报告重新载入并通过");
    const tamperedEvidenceReport = JSON.stringify(evidenceReport).replace('"sampleCount":0', '"sampleCount":1');
    await evidenceInspector.getByLabel("样例包 JSON").fill(tamperedEvidenceReport);
    await inspectButton.click();
    await expect(evidenceInspector.getByRole("alert")).toContainText("覆盖结果与样例不一致");
    await evidenceInspector.getByLabel("样例包 JSON").fill("{");
    await inspectButton.click();
    await expect(evidenceInspector.getByRole("alert")).toContainText("JSON 无法解析");
    await expect(evidenceInspector.getByText("校验报告已下载，可与内容负责人交接。报告不会写入应用。", { exact: true })).not.toBeVisible();
    const judgmentRecords = page.locator(".content-audit-record-group").nth(0);
    await expect(judgmentRecords.getByText("卦辞清单 · 0 / 64 已核验", { exact: true })).toBeVisible();
    await judgmentRecords.locator("summary").click();
    await expect(judgmentRecords.getByRole("link", { name: "第 1 卦 · 乾为天 ↗" })).toHaveAttribute("href", "/hexagrams/1");
    const lineRecords = page.locator(".content-audit-record-group").nth(1);
    await expect(lineRecords.getByText("爻辞清单 · 0 / 384 已核验", { exact: true })).toBeVisible();
    await lineRecords.locator("summary").click();
    await expect(lineRecords.getByRole("link", { name: "第 1 卦 · 乾为天 · 第 1 爻 ↗" })).toHaveAttribute("href", "/hexagrams/1#line-1");
    const exportButton = page.getByRole("button", { name: "导出内容复核清单" });
    await expect(exportButton).toBeVisible();
    const sourceRegistryDownloadPromise = page.waitForEvent("download");
    await page.getByRole("button", { name: "下载来源登记表" }).click();
    const sourceRegistryDownload = await sourceRegistryDownloadPromise;
    expect(sourceRegistryDownload.suggestedFilename()).toMatch(/^yijing-content-sources-\d{4}-\d{2}-\d{2}\.json$/);
    const sourceRegistryPath = await sourceRegistryDownload.path();
    expect(sourceRegistryPath).toBeTruthy();
    const sourceRegistry = JSON.parse(await readFile(sourceRegistryPath!, "utf8")) as {
      templateVersion?: number;
      purpose?: string;
      sources?: Array<{ id?: string; status?: string }>;
    };
    expect(sourceRegistry.templateVersion).toBe(1);
    expect(sourceRegistry.purpose).toBe("content-source-registration");
    expect(sourceRegistry.sources).toHaveLength(5);
    expect(sourceRegistry.sources?.some((source) => source.id === "source-zhouyi-classic-pending" && source.status === "needs-review")).toBe(true);
    await expect(page.getByText("来源登记表已下载，可交给内容负责人补齐版本、授权和复核信息。文件不会写回应用。", { exact: true })).toBeVisible();
    const loadSourceInput = page.locator("label.content-audit-file-label").filter({ hasText: "载入来源登记表" }).locator("input");
    await loadSourceInput.setInputFiles(sourceRegistryPath!);
    await expect(page.getByRole("heading", { name: "来源登记表已重新校验" })).toBeVisible();
    await expect(page.getByText("仍有 4 条来源待补齐版本、授权或复核信息。", { exact: true })).toBeVisible();
    await loadSourceInput.setInputFiles({
      name: "invalid-source-registry.json",
      mimeType: "application/json",
      buffer: Buffer.from(JSON.stringify({ templateVersion: 1, purpose: "content-source-registration", sources: [] }), "utf8"),
    });
    await expect(page.locator('small[role="alert"]').filter({ hasText: "来源登记表载入失败" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "来源登记表已重新校验" })).toHaveCount(0);
    const downloadPromise = page.waitForEvent("download");
    await exportButton.click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toMatch(/^yijing-content-audit-\d{4}-\d{2}-\d{2}\.json$/);
    const downloadPath = await download.path();
    expect(downloadPath).toBeTruthy();
    const report = JSON.parse(await readFile(downloadPath!, "utf8")) as {
      policy?: { includesCanonicalText?: boolean };
      calendarEvidence?: { ruleVersion?: string; ruleStatus?: string; missingBoundaries?: string[] };
    };
    expect(report.policy?.includesCanonicalText).toBe(false);
    expect(report.calendarEvidence).toMatchObject({
      ruleVersion: "calendar-draft-1",
      ruleStatus: "draft",
      missingBoundaries: ["year", "month", "day", "zi-hour", "time-zone", "solar-term"],
    });
    await expect(page.getByText("复核清单已生成，请交给内容负责人逐条核对。", { exact: true })).toBeVisible();
    const loadAuditInput = page.locator("label.content-audit-file-label").filter({ hasText: "载入复核清单" }).locator("input");
    await loadAuditInput.setInputFiles(downloadPath!);
    await expect(page.getByText(/已载入复核清单（2026-/, { exact: false })).toBeVisible();
    const contentAuditExport = page.locator(".content-audit-export");
    await expect(contentAuditExport.getByRole("heading", { name: "复核清单已重新校验" })).toBeVisible();
    await expect(contentAuditExport.getByText("卦辞0/64 已核验", { exact: true })).toBeVisible();
    await expect(contentAuditExport.getByText("当前报告仍有 4 项发布阻塞。", { exact: true })).toBeVisible();
    await loadAuditInput.setInputFiles({
      name: "invalid-content-audit.json",
      mimeType: "application/json",
      buffer: Buffer.from("{", "utf8"),
    });
    await expect(contentAuditExport.locator('[role="alert"]').filter({ hasText: "内容复核清单 JSON 无法解析" })).toBeVisible();
    await expect(contentAuditExport.getByRole("status")).toContainText("未载入复核清单");
    await expect(contentAuditExport.getByRole("heading", { name: "复核清单已重新校验" })).toHaveCount(0);
  });

  test("内容复核页显示本地勘误汇总", async ({ page }) => {
    await page.goto("/hexagrams/1");
    const errata = page.locator(".content-errata");
    await errata.getByText("记录内容疑问或勘误", { exact: true }).click();
    await errata.getByLabel("描述").fill("集中复核页应显示这条本地反馈。");
    await errata.getByRole("button", { name: "保存记录" }).click();
    await expect(errata.getByText("集中复核页应显示这条本地反馈。", { exact: true })).toBeVisible();
    await page.goto("/settings/content");
    await expect(page.getByText("当前有 1 条待处理勘误记录。", { exact: false })).toBeVisible();
    await expect(page.getByText("已处理 0 条", { exact: false })).toBeVisible();
    await expect(page.getByRole("link", { name: "打开内容 ↗" })).toHaveAttribute("href", "/hexagrams/1");
  });

  test("下载 API 失败时显示错误且不遗留隐藏锚点", async ({ page }) => {
    await page.goto("/settings/content");
    await page.evaluate(() => {
      Object.defineProperty(URL, "createObjectURL", {
        configurable: true,
        value: () => {
          throw new Error("模拟下载失败");
        },
      });
    });
    await page.getByRole("button", { name: "导出内容复核清单" }).click();
    await expect(page.locator(".content-audit-export").getByRole("status")).toHaveText("复核清单导出失败：模拟下载失败");
    await expect(page.locator(".content-audit-export a")).toHaveCount(0);

    await page.goto("/settings/data");
    await page.evaluate(() => {
      Object.defineProperty(URL, "createObjectURL", {
        configurable: true,
        value: () => {
          throw new Error("模拟下载失败");
        },
      });
    });
    await page.getByRole("button", { name: "导出 JSON 备份" }).click();
    await expect(page.getByText("导出范围预览", { exact: true })).toBeVisible();
    await page.getByRole("button", { name: "确认导出" }).click();
    await expect(page.getByText("导出失败：模拟下载失败", { exact: false })).toBeVisible();
  });

  test("内容勘误汇总会校验单爻目标并回到对应锚点", async ({ page }) => {
    await page.goto("/settings/content");
    await expect(page.getByRole("heading", { name: "先确认来源，再扩展解释。" })).toBeVisible();
    await page.evaluate(async () => {
      await new Promise<void>((resolve, reject) => {
        const request = indexedDB.open("yijing-local");
        request.onerror = () => reject(request.error);
        request.onsuccess = () => {
          const db = request.result;
          const now = new Date().toISOString();
          const transaction = db.transaction("errata", "readwrite");
          transaction.objectStore("errata").put({
            id: "test-line-errata",
            targetType: "hexagram_line",
            targetId: "hexagram-01-1",
            category: "question",
            description: "集中复核初爻来源。",
            proposedText: "",
            sourceRef: "",
            contentVersion: 1,
            status: "open",
            history: [{ status: "open", at: now }],
            createdAt: now,
            updatedAt: now,
          });
          transaction.oncomplete = () => { db.close(); window.dispatchEvent(new Event("yijing:data-changed")); resolve(); };
          transaction.onerror = () => reject(transaction.error);
        };
      });
    });
    await expect(page.getByRole("link", { name: "打开内容 ↗" })).toHaveAttribute("href", "/hexagrams/1#line-1");
  });

  test("快速自测入口跳转到统一测试学堂", async ({ page }) => {
    await page.goto("/self-test");
    await expect(page.getByRole("heading", { name: "所有测试都在测试学堂。" })).toBeVisible();
    await expect(page.locator(".self-test-question")).toHaveCount(0);
    await expect(page.getByRole("link", { name: /进入测试学堂/ })).toHaveAttribute("href", "/test-academy");
  });

  test("实验室分享链接只恢复卦象参数", async ({ page }) => {
    await page.goto("/?lower=kun&upper=li&moving=2,5#lab");
    await expect(page.locator("#lower-trigram")).toHaveValue("kun");
    await expect(page.locator("#upper-trigram")).toHaveValue("li");
    await expect(
      page.locator(".position-chips").getByRole("button", { name: "2爻" }),
    ).toHaveAttribute("aria-pressed", "true");
    await expect(
      page.locator(".position-chips").getByRole("button", { name: "5爻" }),
    ).toHaveAttribute("aria-pressed", "true");
  });

  test("实验室支持交换上下卦、撤销和关系计算说明", async ({ page }) => {
    await page.goto("/#lab");
    await page.locator("#lower-trigram").selectOption("kun");
    await page.locator("#upper-trigram").selectOption("li");
    await expect(page.getByText(/本卦 · 第/)).toBeVisible();
    await page.getByRole("button", { name: "交换上下卦" }).click();
    await expect(page.locator("#lower-trigram")).toHaveValue("li");
    await expect(page.locator("#upper-trigram")).toHaveValue("kun");
    await page.getByRole("button", { name: "撤销一步" }).click();
    await expect(page.locator("#lower-trigram")).toHaveValue("kun");
    await page.getByRole("button", { name: "1爻" }).first().click();
    await expect(page.getByText(/第 1 爻：/)).toBeVisible();
    await page.getByText("查看计算过程").first().click();
    await expect(page.getByText(/逐爻将六个阴阳值反转/)).toBeVisible();
  });

  test("实验室可以保存并恢复推演快照", async ({ page }) => {
    await page.goto("/");
    const savePanel = page.locator(".lab-save-panel");
    await savePanel.getByText("保存这次推演", { exact: true }).click();
    await savePanel.getByLabel("标题").fill("我的第一次推演");
    await savePanel.getByLabel("备注").fill("记录上下卦和动爻观察");
    await savePanel.getByRole("button", { name: "保存快照" }).click();
    await expect(page.getByText("推演快照已保存")).toBeVisible();
    await expect(
      page.getByText("我的第一次推演", { exact: true }),
    ).toBeVisible();
    await page.getByRole("button", { name: "恢复" }).click();
    await expect(page.getByText(/已恢复“我的第一次推演”/)).toBeVisible();
  });

  test("可以从六十四卦索引进入既济详情", async ({ page }) => {
    await page.goto("/hexagrams");
    await page.getByRole("link", { name: /水火既济/ }).click();
    await expect(page).toHaveURL(/\/hexagrams\/63$/);
    await expect(page.getByRole("heading", { name: "水火既济" })).toBeVisible();
    const trigramSummary = page.locator(".hexagram-trigram-table");
    await expect(trigramSummary).toContainText("下卦");
    await expect(trigramSummary).toContainText("坎 · ☵");
    await expect(trigramSummary).toContainText("上卦");
    await expect(trigramSummary).toContainText("离 · ☲");
    await expect(page.locator(".pending-badge").first()).toContainText("已校对");
    await expect(page.getByText("《周易》经文 · Kanripo KR1a0001 · 已登记")).toBeVisible();
    await expect(page.getByText("易境项目自编基础内容 · 已登记")).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "写下你自己的理解" }),
    ).toBeVisible();
  });

  test("六十四卦详情的关系卦提供计算过程", async ({ page }) => {
    await page.goto("/hexagrams/63");
    const relations = page.locator(".relations-grid");
    await expect(relations.getByText("查看计算过程")).toHaveCount(3);
    await relations.getByText("查看计算过程").first().click();
    await expect(
      relations.getByText(/逐爻将六个阴阳值反转：阳爻变阴爻/),
    ).toBeVisible();
    await relations.getByText("查看计算过程").nth(1).click();
    await expect(
      relations.getByText(/把六爻从初爻到上爻整体倒序排列/),
    ).toBeVisible();
  });

  test("六十四卦索引支持卦名和序号搜索", async ({ page }) => {
    await page.goto("/hexagrams");
    await page.getByLabel("搜索卦名、序号或上下卦").fill("既济");
    await expect(page.getByRole("status").filter({ hasText: "匹配 1 卦" })).toHaveAttribute("aria-live", "polite");
    await expect(page.getByRole("link", { name: /水火既济/ })).toBeVisible();
    await page.getByLabel("搜索卦名、序号或上下卦").fill("上坎");
    await expect(page.getByText("匹配 8 卦")).toBeVisible();
    await page.getByRole("button", { name: "清空筛选" }).click();
    await expect(page.getByText("共 64 卦")).toBeVisible();
    await page.getByLabel("搜索卦名、序号或上下卦").fill("999");
    await expect(
      page.getByRole("heading", { name: "没有匹配的卦" }),
    ).toBeVisible();
  });

  test("六十四卦搜索在中文输入法组合阶段保持当前结果", async ({ page }) => {
    await page.goto("/hexagrams");
    const input = page.getByLabel("搜索卦名、序号或上下卦");
    await input.dispatchEvent("compositionstart");
    await input.fill("既");
    await expect(page.getByText("共 64 卦")).toBeVisible();
    await expect(page).toHaveURL(/\/hexagrams$/);
    await input.dispatchEvent("compositionend", { data: "既" });
    await expect(page.getByText("匹配 1 卦")).toBeVisible();
    await expect(page.getByRole("link", { name: /水火既济/ })).toBeVisible();
  });

  test("六十四卦索引不显示学习阶段并同步其他标签页的收藏状态", async ({ page, context }) => {
    await page.goto("/hexagrams");
    const card = page.getByRole("link", { name: /乾为天/ });
    await expect(card).not.toContainText("未开始");
    await expect(card).not.toContainText("已学习");

    const detailPage = await context.newPage();
    try {
      await detailPage.goto("/hexagrams/1");
      await detailPage.getByRole("button", { name: "☆ 收藏" }).click();
      await expect(card).toContainText("★ 已收藏");
      await detailPage.getByRole("button", { name: "★ 已收藏" }).click();
      await expect(card).not.toContainText("已收藏");
    } finally {
      await detailPage.close();
    }
  });

  test("六十四卦提供卦序歌且详情不显示学习阶段", async ({ page }) => {
    await page.goto("/hexagrams");
    const memoryGuide = page.getByRole("region", { name: "上下经卦名次序歌" });
    await expect(memoryGuide).toContainText("乾坤屯蒙需讼师，比小畜兮履泰否");
    await expect(memoryGuide).toContainText("小过既济兼未济，是为下经三十四");
    await expect(memoryGuide).toContainText("三步记法");

    await page.goto("/hexagrams/1");
    await expect(page.getByLabel(/学习状态：/)).toHaveCount(0);
  });

  test("卦象详情可以收藏并保存个人笔记来源", async ({ page }) => {
    await page.goto("/hexagrams/1");
    await page.getByRole("button", { name: "☆ 收藏" }).click();
    await expect(page.getByRole("button", { name: "★ 已收藏" })).toBeVisible();
    await page
      .getByRole("textbox", { name: "个人笔记" })
      .fill("乾卦的六爻结构让我想到主动与承载的差别。");
    const mainNote = page.locator(".note-editor").last();
    await mainNote
      .getByLabel("来源（书名、视频或网页）")
      .fill("我的周易学习笔记");
    await mainNote.getByLabel("来源类型").selectOption("personal");
    await mainNote.getByLabel("标签（用逗号分隔）").fill("结构, 我的例子");
    await mainNote.getByLabel("来源（书名、视频或网页）").blur();
    await expect(page.getByText(/已保存于|正在保存/)).toBeVisible();
    await page.waitForTimeout(800);
    await page.reload();
    await expect(page.getByRole("textbox", { name: "个人笔记" })).toHaveValue(
      "乾卦的六爻结构让我想到主动与承载的差别。",
    );
    await expect(
      page.locator(".note-editor").last().getByLabel("标签（用逗号分隔）"),
    ).toHaveValue("结构, 我的例子");
    await page.evaluate(async () => {
      await new Promise<void>((resolve, reject) => {
        const request = indexedDB.open("yijing-local");
        request.onerror = () => reject(request.error);
        request.onblocked = () => reject(new Error("多来源保护测试被 IndexedDB 连接阻塞"));
        request.onsuccess = () => {
          const db = request.result;
          const transaction = db.transaction("notes", "readwrite");
          const store = transaction.objectStore("notes");
          const getRequest = store.get("hexagram:hexagram-01");
          getRequest.onerror = () => reject(getRequest.error);
          getRequest.onsuccess = () => {
            const note = getRequest.result;
            if (!note) {
              reject(new Error("多来源保护测试找不到主笔记"));
              return;
            }
            note.sourceRefs = [
              ...(note.sourceRefs ?? []),
              { label: "补充视频", kind: "video", locator: "08:30" },
            ];
            store.put(note);
          };
          transaction.oncomplete = () => {
            db.close();
            window.dispatchEvent(new Event("yijing:data-changed"));
            resolve();
          };
          transaction.onerror = () => reject(transaction.error);
        };
      });
    });
    await page.reload();
    const sourceEditor = page.locator(".note-editor").last();
    await expect(sourceEditor.getByText(/另有 1 条来源会在保存时保留/)).toBeVisible();
    await sourceEditor.getByLabel("作者 / 频道（可选）").fill("更新后的作者");
    await sourceEditor.getByLabel("作者 / 频道（可选）").blur();
    await page.waitForTimeout(800);
    const sourceCount = await page.evaluate(async () => {
      return await new Promise<number>((resolve, reject) => {
        const request = indexedDB.open("yijing-local");
        request.onerror = () => reject(request.error);
        request.onsuccess = () => {
          const db = request.result;
          const transaction = db.transaction("notes", "readonly");
          const getRequest = transaction.objectStore("notes").get("hexagram:hexagram-01");
          getRequest.onerror = () => reject(getRequest.error);
          getRequest.onsuccess = () => {
            resolve(getRequest.result?.sourceRefs?.length ?? 0);
            db.close();
          };
        };
      });
    });
    expect(sourceCount).toBe(2);
    await sourceEditor.getByRole("button", { name: "添加另一条来源" }).click();
    await sourceEditor.getByLabel("新增来源名称").fill("补充网页");
    await sourceEditor.getByLabel("新增来源类型").selectOption("web");
    await sourceEditor.getByLabel("新增链接（可选）").fill("https://example.com/yijing");
    await sourceEditor.getByRole("button", { name: "保存新增来源" }).click();
    await expect(sourceEditor.getByText("新增来源已保存")).toBeVisible();
    await page.waitForTimeout(800);
    const sourceCountAfterAppend = await page.evaluate(async () => {
      return await new Promise<number>((resolve, reject) => {
        const request = indexedDB.open("yijing-local");
        request.onerror = () => reject(request.error);
        request.onsuccess = () => {
          const db = request.result;
          const transaction = db.transaction("notes", "readonly");
          const getRequest = transaction.objectStore("notes").get("hexagram:hexagram-01");
          getRequest.onerror = () => reject(getRequest.error);
          getRequest.onsuccess = () => {
            resolve(getRequest.result?.sourceRefs?.length ?? 0);
            db.close();
          };
        };
      });
    });
    expect(sourceCountAfterAppend).toBe(3);
    await expect(sourceEditor.getByText("补充网页")).toBeVisible();
    await expect(
      sourceEditor.getByRole("link", { name: "打开来源链接：补充网页" }),
    ).toHaveAttribute("href", "https://example.com/yijing");
    await sourceEditor.getByRole("button", { name: "编辑" }).first().click();
    await expect(sourceEditor.getByLabel("来源（书名、视频或网页）")).toHaveValue("补充视频");
    await sourceEditor.getByLabel("作者 / 频道（可选）").fill("视频作者");
    await sourceEditor.getByLabel("作者 / 频道（可选）").blur();
    await page.waitForTimeout(800);
    page.once("dialog", (dialog) => void dialog.accept());
    await sourceEditor.getByRole("button", { name: "移除" }).last().click();
    await expect(sourceEditor.getByText("来源已移除")).toBeVisible();
    await page.waitForTimeout(800);
    const sourceSnapshot = await page.evaluate(async () => {
      return await new Promise<Array<{ label: string; author?: string }>>((resolve, reject) => {
        const request = indexedDB.open("yijing-local");
        request.onerror = () => reject(request.error);
        request.onsuccess = () => {
          const db = request.result;
          const transaction = db.transaction("notes", "readonly");
          const getRequest = transaction.objectStore("notes").get("hexagram:hexagram-01");
          getRequest.onerror = () => reject(getRequest.error);
          getRequest.onsuccess = () => {
            resolve((getRequest.result?.sourceRefs ?? []).map((ref: { label: string; author?: string }) => ({ label: ref.label, author: ref.author })));
            db.close();
          };
        };
      });
    });
    expect(sourceSnapshot).toEqual([
      { label: "我的周易学习笔记", author: "更新后的作者" },
      { label: "补充视频", author: "视频作者" },
    ]);
    await page.getByText("初爻 · 阳爻").click();
    await page
      .locator(".line-notes details")
      .first()
      .getByRole("textbox", { name: "个人笔记" })
      .fill("初爻先记录位置，再判断变化。");
    await page.waitForTimeout(800);
    await page.reload();
    await page.getByText("初爻 · 阳爻").click();
    await expect(
      page
        .locator(".line-notes details")
        .first()
        .getByRole("textbox", { name: "个人笔记" }),
    ).toHaveValue("初爻先记录位置，再判断变化。");
  });

  test("卦象详情收藏状态会同步其他标签页", async ({ page, context }) => {
    await page.goto("/hexagrams/1");
    await expect(page.getByRole("button", { name: "☆ 收藏" })).toBeVisible();

    const otherPage = await context.newPage();
    try {
      await otherPage.goto("/hexagrams/1");
      await otherPage.getByRole("button", { name: "☆ 收藏" }).click();
      await expect(otherPage.getByRole("button", { name: "★ 已收藏" })).toBeVisible();
      await expect(page.getByRole("button", { name: "★ 已收藏" })).toBeVisible();

      await otherPage.getByRole("button", { name: "★ 已收藏" }).click();
      await expect(page.getByRole("button", { name: "☆ 收藏" })).toBeVisible();
    } finally {
      await otherPage.close();
    }
  });

  test("笔记入口汇总收藏并可按上下文筛选", async ({ page }) => {
    await page.goto("/hexagrams/1");
    await page.getByRole("button", { name: "☆ 收藏" }).click();
    await expect(page.getByRole("button", { name: "★ 已收藏" })).toBeVisible();

    await page.goto("/notes");
    await expect(page.getByRole("heading", { name: "我的收藏" })).toBeVisible();
    await expect(page.getByRole("link", { name: /乾为天/ })).toBeVisible();
    await page.getByLabel("上下文").selectOption("hexagram");
    await expect(page.getByRole("link", { name: /乾为天/ })).toBeVisible();
    await expect(page.getByText("1 条", { exact: true })).toHaveCount(2);
  });

  test("笔记聚合全文搜索可以检索来源元数据", async ({ page }) => {
    await page.goto("/notes");
    await expect(page.getByRole("heading", { name: "把理解留下来。" })).toBeVisible();
    await page.evaluate(async () => {
      await new Promise<void>((resolve, reject) => {
        const request = indexedDB.open("yijing-local");
        request.onerror = () => reject(request.error);
        request.onblocked = () => reject(new Error("来源元数据搜索测试被 IndexedDB 连接阻塞"));
        request.onsuccess = () => {
          const db = request.result;
          const transaction = db.transaction("notes", "readwrite");
          transaction.objectStore("notes").put({
            id: "note-source-search-metadata",
            targetType: "hexagram",
            targetId: "hexagram-01",
            title: "来源元数据检索",
            markdown: "记录一条可按来源字段检索的笔记。",
            tags: ["来源测试"],
            sourceRefs: [{ label: "参考书", kind: "book", author: "作者乙", edition: "第三版", locator: "第 42 页" }],
            createdAt: "2026-08-30T00:00:00.000Z",
            updatedAt: "2026-08-30T00:00:00.000Z",
          });
          transaction.oncomplete = () => {
            db.close();
            window.dispatchEvent(new Event("yijing:data-changed"));
            resolve();
          };
          transaction.onerror = () => reject(transaction.error);
        };
      });
    });
    const search = page.getByPlaceholder("输入卦名、关键词、标签或来源");
    await search.fill("作者乙");
    const result = page.locator(".note-list-item").filter({ hasText: "记录一条可按来源字段检索的笔记。" });
    await expect(result).toBeVisible();
    await expect(result.locator(".note-source-meta")).toHaveText("来源 1 条 · 参考书");
    await search.fill("第 42 页");
    await expect(result).toBeVisible();
  });

  test("来源模板可以跨笔记复制填写", async ({ page }) => {
    await page.goto("/hexagrams/1");
    await page.locator(".line-notes details").first().locator("summary").click();
    const sourceEditor = page.locator(".note-editor").last();
    await sourceEditor.getByLabel("来源（书名、视频或网页）").fill("跨笔记参考书");
    await sourceEditor.getByLabel("来源类型").selectOption("book");
    await sourceEditor.getByLabel("作者 / 频道（可选）").fill("模板作者");
    await sourceEditor.getByLabel("版本 / 出版信息（可选）").fill("第二版");
    await sourceEditor.getByLabel("定位（页码、章节或时间点）").fill("第 18 页");
    await sourceEditor.getByLabel("来源（书名、视频或网页）").blur();
    await page.waitForTimeout(800);
    await sourceEditor.getByRole("button", { name: "复制当前来源" }).click();
    await expect(sourceEditor.getByText("已复制当前来源，可在其他笔记粘贴填写。")).toBeVisible();
    const samePageEditor = page.locator(".line-notes details").first().locator(".note-editor");
    await expect(samePageEditor.getByRole("button", { name: "粘贴来源模板" })).toBeEnabled();

    await page.goto("/hexagrams/2");
    const targetEditor = page.locator(".note-editor").last();
    await expect(targetEditor.getByRole("button", { name: "粘贴来源模板" })).toBeEnabled();
    await targetEditor.getByRole("button", { name: "粘贴来源模板" }).click();
    await expect(targetEditor.getByLabel("来源（书名、视频或网页）")).toHaveValue("跨笔记参考书");
    await expect(targetEditor.getByLabel("来源类型")).toHaveValue("book");
    await expect(targetEditor.getByLabel("作者 / 频道（可选）")).toHaveValue("模板作者");
    await expect(targetEditor.getByLabel("版本 / 出版信息（可选）")).toHaveValue("第二版");
    await expect(targetEditor.getByLabel("定位（页码、章节或时间点）")).toHaveValue("第 18 页");
    await targetEditor.getByLabel("来源（书名、视频或网页）").blur();
    await expect(targetEditor.getByText("来源已保存")).toBeVisible();
    await page.waitForTimeout(800);
    const targetSource = await page.evaluate(async () => await new Promise<unknown>((resolve, reject) => {
      const request = indexedDB.open("yijing-local");
      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        const db = request.result;
        const transaction = db.transaction("notes", "readonly");
        const getRequest = transaction.objectStore("notes").get("hexagram:hexagram-02");
        getRequest.onerror = () => reject(getRequest.error);
        getRequest.onsuccess = () => {
          resolve(getRequest.result?.sourceRefs?.[0]);
          db.close();
        };
      };
    }));
    expect(targetSource).toMatchObject({
      label: "跨笔记参考书",
      kind: "book",
      author: "模板作者",
      edition: "第二版",
      locator: "第 18 页",
    });
  });

  test("来源模板跨标签清理后会同步禁用粘贴", async ({ page, context }) => {
    await page.goto("/hexagrams/1");
    await page.locator(".line-notes details").first().locator("summary").click();
    const sourceEditor = page.locator(".note-editor").last();
    await sourceEditor.getByLabel("来源（书名、视频或网页）").fill("待清理的来源模板");
    await sourceEditor.getByLabel("来源（书名、视频或网页）").blur();
    await page.waitForTimeout(500);
    await sourceEditor.getByRole("button", { name: "复制当前来源" }).click();

    const otherPage = await context.newPage();
    try {
      await otherPage.goto("/hexagrams/2");
      const targetEditor = otherPage.locator(".note-editor").last();
      const pasteButton = targetEditor.getByRole("button", { name: "粘贴来源模板" });
      await expect(pasteButton).toBeEnabled();

      await page.evaluate(() => {
        window.localStorage.removeItem("yijing:source-template:v1");
      });
      await expect(pasteButton).toBeDisabled();
    } finally {
      await otherPage.close();
    }
  });

  test("两个标签页同时追加来源时保留事务内全部来源", async ({ page, context }) => {
    await page.goto("/hexagrams/3");
    const editor = page.locator(".note-editor").last();
    await editor.getByLabel("来源（书名、视频或网页）").fill("初始来源");
    await editor.getByLabel("来源（书名、视频或网页）").blur();
    await expect(editor).toContainText("来源已保存");
    await editor.getByRole("button", { name: "添加另一条来源" }).click();
    await editor.getByLabel("新增来源名称").fill("既有来源");
    await editor.getByRole("button", { name: "保存新增来源" }).click();
    await expect(editor).toContainText("既有来源");
    const otherPage = await context.newPage();
    try {
      await otherPage.goto("/hexagrams/3");
      const otherEditor = otherPage.locator(".note-editor").last();
      await expect(editor.getByText(/另有 1 条来源会在保存时保留/)).toBeVisible();
      await expect(otherEditor.getByText(/另有 1 条来源会在保存时保留/)).toBeVisible();
      await editor.getByRole("button", { name: "添加另一条来源" }).click();
      await otherEditor.getByRole("button", { name: "添加另一条来源" }).click();
      await editor.getByLabel("新增来源名称").fill("标签页 A 来源");
      await otherEditor.getByLabel("新增来源名称").fill("标签页 B 来源");
      await Promise.all([
        editor.getByRole("button", { name: "保存新增来源" }).click(),
        otherEditor.getByRole("button", { name: "保存新增来源" }).click(),
      ]);
      await expect(editor.getByText("标签页 A 来源")).toBeVisible();
      await expect(editor.getByText("标签页 B 来源")).toBeVisible();
      const sourceLabels = [
        await editor.getByLabel("来源（书名、视频或网页）").inputValue(),
        ...(await editor.locator(".source-ref-list-item > span").allTextContents()),
      ];
      expect(sourceLabels).toHaveLength(4);
      expect(sourceLabels.slice(0, 2)).toEqual(["初始来源", "既有来源"]);
      expect(sourceLabels.slice(2)).toEqual(
        expect.arrayContaining(["标签页 A 来源", "标签页 B 来源"]),
      );
    } finally {
      await otherPage.close();
    }
  });

  test("逐爻笔记聚合会显示卦名并回到对应爻位", async ({ page }) => {
    await page.goto("/hexagrams/1");
    await page.getByText("初爻 · 阳爻").click();
    const lineNote = page.locator(".line-notes details").first().getByRole("textbox", { name: "个人笔记" });
    await lineNote.fill("先看初爻位置，再判断是否发生变化。");
    await lineNote.blur();
    await expect(page.getByText(/已保存于|正在保存/)).toBeVisible();
    await page.waitForTimeout(800);

    await page.goto("/notes");
    const lineLink = page.getByRole("link", { name: /乾为天 · 第1爻/ });
    await expect(lineLink).toBeVisible();
    await expect(lineLink).toHaveAttribute("href", "/hexagrams/1#line-1");
  });

  test("笔记聚合不会把未知目标误链到其他卦", async ({ page }) => {
    await page.goto("/notes");
    await expect(page.getByRole("heading", { name: "把理解留下来。" })).toBeVisible();
    await page.evaluate(async () => {
      await new Promise<void>((resolve, reject) => {
        const request = indexedDB.open("yijing-local");
        request.onerror = () => reject(request.error);
        request.onsuccess = () => {
          const db = request.result;
          const transaction = db.transaction("notes", "readwrite");
          transaction.objectStore("notes").put({
            id: "hexagram:hexagram-99",
            targetType: "hexagram",
            targetId: "hexagram-99",
            markdown: "保留待迁移的旧内容记录。",
            tags: [],
            sourceRefs: [],
            createdAt: "2026-08-28T00:00:00.000Z",
            updatedAt: "2026-08-28T00:00:00.000Z",
          });
          transaction.oncomplete = () => {
            db.close();
            window.dispatchEvent(new Event("yijing:data-changed"));
            resolve();
          };
          transaction.onerror = () => reject(transaction.error);
        };
      });
    });
    const unavailable = page.locator(".note-list-item.is-unavailable");
    await expect(unavailable).toContainText("内容不可用");
    await expect(unavailable).toContainText("不在当前内容版本中");
    await expect(page.locator('a[href="/hexagrams/1"]')).toHaveCount(0);
  });

  test("收藏变更会同步到笔记聚合页", async ({ page, context }) => {
    await page.goto("/notes");
    await expect(page.getByRole("heading", { name: "我的收藏" })).toBeVisible();
    await expect(page.getByText("还没有收藏。打开知识点、八卦或六十四卦详情页即可收藏。", { exact: true })).toBeVisible();

    const detailPage = await context.newPage();
    try {
      await detailPage.goto("/hexagrams/1");
      await detailPage.getByRole("button", { name: "☆ 收藏" }).click();
      await expect(page.getByRole("link", { name: /乾为天/ })).toBeVisible();
      await detailPage.getByRole("button", { name: "★ 已收藏" }).click();
      await expect(page.getByText("还没有收藏。打开知识点、八卦或六十四卦详情页即可收藏。", { exact: true })).toBeVisible();
    } finally {
      await detailPage.close();
    }
  });

  test("知识库可回到三类内容收藏", async ({ page }) => {
    await page.goto("/learn/trigrams");
    await page.getByRole("button", { name: "☆ 收藏" }).click();
    await expect(page.getByRole("button", { name: "★ 已收藏" })).toBeVisible();
    await page.goto("/trigrams/qian");
    await page.getByRole("button", { name: "☆ 收藏" }).click();
    await expect(page.getByRole("button", { name: "★ 已收藏" })).toBeVisible();
    await page.goto("/hexagrams/1");
    await page.getByRole("button", { name: "☆ 收藏" }).click();
    await expect(page.getByRole("button", { name: "★ 已收藏" })).toBeVisible();

    await page.goto("/notes");
    await expect(page.getByRole("link", { name: /八卦结构/ })).toBeVisible();
    await expect(page.getByRole("link", { name: /乾 · 天/ })).toBeVisible();
    await expect(page.getByRole("link", { name: /乾为天/ })).toBeVisible();
  });

  test("笔记变更会同步到同一浏览器的其他标签页", async ({ page, context }) => {
    await page.goto("/notes");
    await expect(page.getByRole("heading", { name: "还没有笔记" })).toBeVisible();

    const editorPage = await context.newPage();
    try {
      await editorPage.goto("/hexagrams/1");
      const note = editorPage.locator(".note-editor").last();
      const field = note.getByRole("textbox", { name: "个人笔记" });
      await field.fill("跨标签页同步演练");
      await field.blur();
      await expect(note).toContainText(/已保存于/);
      await expect(page.getByText("跨标签页同步演练", { exact: false })).toBeVisible();
    } finally {
      await editorPage.close();
    }
  });

  test("偏好变更会同步到同一浏览器的其他标签页", async ({ page, context }) => {
    await page.goto("/settings/preferences");
    await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
    await expect(page.getByLabel("主题")).toHaveValue("light");

    const settingsPage = await context.newPage();
    try {
      await settingsPage.goto("/settings/preferences");
      await settingsPage.getByLabel("主题").selectOption("dark");
      await expect(settingsPage.getByRole("status")).toContainText("设置已保存");
      await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
      await expect(page.getByLabel("主题")).toHaveValue("dark");
    } finally {
      await settingsPage.close();
    }
  });

  test("已打开的笔记编辑器会同步其他标签页的保存", async ({ page, context }) => {
    await page.goto("/hexagrams/1");
    const currentNote = page.locator(".note-editor").last();
    const currentField = currentNote.getByRole("textbox", { name: "个人笔记" });
    await expect(currentField).toBeEnabled();
    await expect(currentField).toHaveValue("");

    const editorPage = await context.newPage();
    try {
      await editorPage.goto("/hexagrams/1");
      const otherField = editorPage.locator(".note-editor").last().getByRole("textbox", { name: "个人笔记" });
      await otherField.fill("详情页跨标签同步");
      await otherField.blur();
      await expect(editorPage.locator(".note-editor").last()).toContainText(/(?:已保存于|上次保存于)/);
      await expect(currentField).toHaveValue("详情页跨标签同步");
    } finally {
      await editorPage.close();
    }
  });

  test("已打开的来源编辑器会同步保存且保护本地草稿", async ({ page, context }) => {
    await page.goto("/hexagrams/8");
    const currentSource = page.locator(".note-editor").last().getByLabel("来源（书名、视频或网页）");
    await expect(currentSource).toHaveValue("");

    const editorPage = await context.newPage();
    try {
      await editorPage.goto("/hexagrams/8");
      const otherSource = editorPage.locator(".note-editor").last().getByLabel("来源（书名、视频或网页）");
      await otherSource.fill("跨标签来源记录");
      await otherSource.blur();
      await expect(editorPage.locator(".source-ref-editor").last()).toContainText("来源已保存");
      await expect(currentSource).toHaveValue("跨标签来源记录");

      await currentSource.fill("当前标签页的来源草稿");
      await otherSource.fill("另一标签页的来源");
      await otherSource.blur();
      await expect(editorPage.locator(".source-ref-editor").last()).toContainText("来源已保存");
      await expect(currentSource).toHaveValue("当前标签页的来源草稿");
    } finally {
      await editorPage.close();
    }
  });

  test("正在编辑的笔记草稿不会被其他标签页覆盖", async ({ page, context }) => {
    await page.goto("/hexagrams/1");
    const currentField = page.locator(".note-editor").last().getByRole("textbox", { name: "个人笔记" });
    await expect(currentField).toBeEnabled();

    const editorPage = await context.newPage();
    try {
      await editorPage.goto("/hexagrams/1");
      const otherField = editorPage.locator(".note-editor").last().getByRole("textbox", { name: "个人笔记" });
      await expect(otherField).toBeEnabled();
      await currentField.fill("当前标签页的未保存草稿");
      await otherField.fill("另一标签页的已保存内容");
      await otherField.blur();
      await expect(editorPage.locator(".note-editor").last()).toContainText(/(?:已保存于|上次保存于)/);
      await expect(currentField).toHaveValue("当前标签页的未保存草稿");
    } finally {
      await editorPage.close();
    }
  });

  test("笔记支持软删除和 30 秒内撤销", async ({ page }) => {
    await page.goto("/hexagrams/2");
    const mainNote = page.locator(".note-editor").last();
    await mainNote
      .getByRole("textbox", { name: "个人笔记" })
      .fill("待删除的学习笔记");
    await page.waitForTimeout(800);
    page.once("dialog", (dialog) => void dialog.accept());
    await mainNote.getByRole("button", { name: "删除笔记" }).click();
    await expect(mainNote.getByText("已删除，可在 30 秒内撤销")).toBeVisible();
    await mainNote.getByRole("button", { name: "撤销删除" }).click();
    await expect(
      mainNote.getByRole("textbox", { name: "个人笔记" }),
    ).toHaveValue("待删除的学习笔记");
  });

  test("撤销删除不会覆盖其他标签页已经写入的内容", async ({ page, context }) => {
    await gotoDatabasePage(page, "/hexagrams/6");
    const mainNote = page.locator(".note-editor").last();
    await mainNote
      .getByRole("textbox", { name: "个人笔记" })
      .fill("删除前的内容");
    await page.waitForTimeout(800);

    const otherPage = await context.newPage();
    try {
      await gotoDatabasePage(otherPage, "/hexagrams/6");
      await expect(
        otherPage.locator(".note-editor").last().getByRole("textbox", { name: "个人笔记" }),
      ).toHaveValue("删除前的内容");
      page.once("dialog", (dialog) => void dialog.accept());
      await mainNote.getByRole("button", { name: "删除笔记" }).click();
      await expect(mainNote.getByText("已删除，可在 30 秒内撤销")).toBeVisible();

      await otherPage.evaluate(async () => {
        await new Promise<void>((resolve, reject) => {
          const request = indexedDB.open("yijing-local");
          request.onerror = () => reject(request.error);
          request.onblocked = () => reject(new Error("并发删除测试被 IndexedDB 连接阻塞"));
          request.onsuccess = () => {
            const db = request.result;
            const transaction = db.transaction("notes", "readwrite");
            const store = transaction.objectStore("notes");
            const get = store.get("hexagram:hexagram-06");
            get.onerror = () => reject(get.error);
            get.onsuccess = () => {
              const note = get.result;
              if (!note) {
                reject(new Error("并发删除测试缺少笔记记录"));
                return;
              }
              store.put({
                ...note,
                markdown: "其他标签页的最新内容",
                sourceRefs: [{ label: "并发更新来源", kind: "personal" }],
                updatedAt: new Date().toISOString(),
              });
            };
            transaction.oncomplete = () => {
              db.close();
              resolve();
            };
            transaction.onerror = () => reject(transaction.error);
          };
        });
      });
      await mainNote.getByRole("button", { name: "撤销删除" }).click();
      const readNoteAfterUndo = () => page.evaluate(async () => {
        return new Promise<Record<string, unknown> | undefined>((resolve, reject) => {
          const request = indexedDB.open("yijing-local");
          request.onerror = () => reject(request.error);
          request.onsuccess = () => {
            const db = request.result;
            const transaction = db.transaction("notes", "readonly");
            const get = transaction.objectStore("notes").get("hexagram:hexagram-06");
            get.onerror = () => reject(get.error);
            get.onsuccess = () => {
              db.close();
              resolve(get.result as Record<string, unknown> | undefined);
            };
          };
        });
      });
      await expect.poll(async () => {
        const record = await readNoteAfterUndo();
        return record?.markdown === "其他标签页的最新内容" &&
          Array.isArray(record.sourceRefs) &&
          !record.deletedAt;
      }).toBe(true);
      const recordAfterUndo = await readNoteAfterUndo();
      expect(recordAfterUndo).toMatchObject({
        markdown: "其他标签页的最新内容",
        sourceRefs: [{ label: "并发更新来源", kind: "personal" }],
      });
      expect(recordAfterUndo?.deletedAt).toBeUndefined();
      await page.reload();
      const restored = page.locator(".note-editor").last();
      await expect(restored.getByRole("textbox", { name: "个人笔记" })).toHaveValue(
        "其他标签页的最新内容",
      );
      await expect(restored.getByLabel("来源（书名、视频或网页）")).toHaveValue(
        "并发更新来源",
      );
    } finally {
      await otherPage.close();
    }
  });

  test("清空已有笔记后会自动保存为空快照", async ({ page }) => {
    await page.goto("/hexagrams/3");
    const note = page.locator(".note-editor").last();
    const field = note.getByRole("textbox", { name: "个人笔记" });
    await expect(field).toBeEnabled();
    await field.fill("先写入再清空");
    await expect(note.getByText(/已保存于/)).toBeVisible();
    await field.fill("");
    await page.waitForTimeout(800);
    await page.reload();
    await expect(page.locator(".note-editor").last().getByRole("textbox", { name: "个人笔记" })).toHaveValue("");
    await page.goto("/notes");
    await expect(page.getByRole("heading", { name: "还没有笔记" })).toBeVisible();
  });

  test("空白笔记编辑器不会创建空记录", async ({ page }) => {
    await page.goto("/hexagrams/4");
    const note = page.locator(".note-editor").last();
    await expect(note.getByRole("textbox", { name: "个人笔记" })).toBeEnabled();
    await page.waitForTimeout(800);
    await expect(note).toContainText("还没有笔记");
    await page.goto("/notes");
    await expect(page.getByRole("heading", { name: "还没有笔记" })).toBeVisible();
  });

  test("空来源编辑器不会创建空记录", async ({ page }) => {
    // The editor's enabled state is the readiness contract. In WebKit a late
    // load event can exceed the navigation budget even after the page is
    // usable, so do not make this data-boundary test depend on `load`.
    await page.goto("/hexagrams/5", { waitUntil: "commit" });
    const note = page.locator(".note-editor").last();
    const source = note.getByLabel("来源（书名、视频或网页）");
    await expect(source).toBeEnabled();
    await source.focus();
    await source.blur();
    await expect(note.locator(".source-ref-editor")).toContainText("来源已清空");
    await page.goto("/notes");
    await expect(page.getByRole("heading", { name: "还没有笔记" })).toBeVisible();
  });

  test("笔记聚合支持上下文、标签和来源筛选", async ({ page }) => {
    await page.goto("/hexagrams/1");
    const editor = page.locator(".note-editor").last();
    await editor
      .getByRole("textbox", { name: "个人笔记" })
      .fill("筛选用的推演记录");
    await editor.getByLabel("标签（用逗号分隔）").fill("重点");
    await editor.getByLabel("标签（用逗号分隔）").blur();
    await expect(editor.getByText(/已保存于/)).toBeVisible();
    await page.goto("/notes");
    await expect(
      page.getByText("筛选用的推演记录", { exact: false }),
    ).toBeVisible();
    await page.getByLabel("具体内容").selectOption("hexagram:hexagram-01");
    await expect(
      page.getByText("筛选用的推演记录", { exact: false }),
    ).toBeVisible();
    await page.getByLabel("上下文").selectOption("hexagram");
    await page.locator(".notes-toolbar select").nth(1).selectOption("重点");
    await expect(
      page.getByText("筛选用的推演记录", { exact: false }),
    ).toBeVisible();
  });

  test("学习详情可以记录完成状态", async ({ page }) => {
    // The learning detail is usable as soon as its server-rendered document
    // is committed. Waiting for every load event can hang in WebKit when a
    // background IndexedDB/resource task is slow; the assertions below still
    // prove that the interactive page finished rendering before use.
    await page.goto("/learn/trigrams", { waitUntil: "domcontentloaded" });
    await expect(page.getByRole("heading", { name: "八卦结构" })).toBeVisible();
    await expect(page.locator(".content-block")).toHaveCount(2);
    await expect(page.locator(".content-block-kind").first()).toContainText(
      "编辑释义",
    );
    await expect(page.locator(".content-block-source").first()).toContainText(
      "易境项目自编基础内容",
    );
    await expect(page.locator(".instant-practice")).toHaveCount(0);
    await expect(page.getByRole("link", { name: /进入测试学堂/ })).toHaveAttribute("href", "/test-academy");
    const errata = page.locator(".content-errata");
    await errata.getByText("记录内容疑问或勘误", { exact: true }).click();
    await errata.getByLabel("描述").fill("记录一个待核对的术语来源。");
    await errata.getByRole("button", { name: "保存记录" }).click();
    await expect(
      errata.getByText("已记录，后续可根据底本复核。"),
    ).toBeVisible();
    await expect(errata.getByText("记录一个待核对的术语来源。")).toBeVisible();
    await errata.getByRole("button", { name: "标记已处理" }).click();
    await errata.getByText(/状态历史 · 2 条/).click();
    await expect(errata.locator(".erratum-history li")).toHaveCount(2);
    await page.getByRole("button", { name: "完成本节" }).click();
    await expect(page.getByText("已完成本节，待复习")).toBeVisible();
  });

  test("学习内容只保留统一测试入口", async ({ page }) => {
    for (const path of ["/trigrams/qian", "/tools/five-elements", "/hexagrams/1", "/learn/trigrams"]) {
      await page.goto(path);
      await expect(page.locator(".instant-practice")).toHaveCount(0);
      await expect(page.getByRole("link", { name: /测试学堂/ }).first()).toHaveAttribute("href", "/test-academy");
    }
  });

  test("重复打开已掌握课程不会降低掌握度", async ({ page }) => {
    await page.goto("/learn/trigrams");
    await expect(page.getByRole("heading", { name: "八卦结构" })).toBeVisible();
    await page.evaluate(async () => {
      await new Promise<void>((resolve, reject) => {
        const request = indexedDB.open("yijing-local");
        request.onerror = () => reject(request.error);
        request.onblocked = () => reject(new Error("课程进度回归被 IndexedDB 连接阻塞"));
        request.onsuccess = () => {
          const db = request.result;
          const transaction = db.transaction("conceptProgress", "readwrite");
          transaction.objectStore("conceptProgress").put({
            conceptId: "trigrams",
            status: "mastered",
            masteryScore: 95,
            lastStudiedAt: "2099-01-01T00:00:00.000Z",
            updatedAt: "2099-01-01T00:00:00.000Z",
          });
          transaction.oncomplete = () => { db.close(); resolve(); };
          transaction.onerror = () => reject(transaction.error);
        };
      });
    });
    await page.reload();
    await expect(page.getByText("已掌握")).toBeVisible();
    await page.getByRole("button", { name: "开始学习" }).click();
    await expect(page.getByText("已掌握")).toBeVisible();
    await page.getByRole("button", { name: "完成本节" }).click();
    await expect(page.getByText("已掌握")).toBeVisible();
    const progress = await page.evaluate(async () => {
      return await new Promise<{ masteryScore: number; status: string } | undefined>((resolve, reject) => {
        const request = indexedDB.open("yijing-local");
        request.onerror = () => reject(request.error);
        request.onsuccess = () => {
          const db = request.result;
          const transaction = db.transaction("conceptProgress", "readonly");
          const get = transaction.objectStore("conceptProgress").get("trigrams");
          get.onsuccess = () => { db.close(); resolve(get.result); };
          get.onerror = () => reject(get.error);
        };
      });
    });
    expect(progress).toMatchObject({ masteryScore: 95, status: "mastered" });
  });

  test("课程详情会同步其他标签页的完成状态", async ({ page, context }) => {
    await page.goto("/learn/trigrams");
    await expect(page.getByRole("heading", { name: "八卦结构" })).toBeVisible();
    const otherPage = await context.newPage();
    try {
      await otherPage.goto("/learn/trigrams");
      await expect(otherPage.getByRole("button", { name: "完成本节" })).toBeVisible();
      await otherPage.getByRole("button", { name: "完成本节" }).click();
      await expect(otherPage.getByText("已完成本节，待复习")).toBeVisible();
      await expect(page.getByText("已完成本节，待复习")).toBeVisible();
    } finally {
      await otherPage.close();
    }
  });

  test("未完成前置知识时仍可浏览并看到学习建议", async ({ page }) => {
    await page.goto("/learn/hexagram-composition");
    await expect(page.getByRole("heading", { name: "上下卦与六十四卦" })).toBeVisible();
    const notice = page.getByRole("region", { name: "前置知识提示" });
    await expect(notice).toBeVisible();
    await expect(notice).toContainText("八卦结构");
    await expect(notice.getByRole("link", { name: /八卦结构/ })).toHaveAttribute("href", "/learn/trigrams");
  });

  test("前置知识完成后提示会响应本地数据变更", async ({ page }) => {
    await page.goto("/learn/hexagram-composition");
    const notice = page.getByRole("region", { name: "前置知识提示" });
    await expect(notice).toBeVisible();
    await page.evaluate(async () => {
      await new Promise<void>((resolve, reject) => {
        const request = indexedDB.open("yijing-local");
        request.onerror = () => reject(request.error);
        request.onblocked = () => reject(new Error("前置知识状态写入被 IndexedDB 连接阻塞"));
        request.onsuccess = () => {
          const db = request.result;
          const transaction = db.transaction("conceptProgress", "readwrite");
          transaction.objectStore("conceptProgress").put({
            conceptId: "trigrams",
            status: "mastered",
            masteryScore: 100,
            updatedAt: new Date().toISOString(),
          });
          transaction.oncomplete = () => {
            db.close();
            window.dispatchEvent(new Event("yijing:data-changed"));
            resolve();
          };
          transaction.onerror = () => reject(transaction.error);
        };
      });
    });
    await expect(notice).toBeHidden();
  });

  test("M2 干支静态卡片可以浏览并进入练习", async ({ page }) => {
    await page.goto("/learn/heavenly-stems");
    await expect(
      page.getByRole("heading", { name: "十天干基础" }),
    ).toBeVisible();
    await expect(page.locator(".cycle-card")).toHaveCount(10);
    await expect(page.getByText("还没有开始")).toBeVisible();
    await expect(
      page.getByText("内容待复核", { exact: false }).first(),
    ).toBeVisible();
    await expect(
      page.getByRole("link", { name: /下一节：十二地支基础/ }),
    ).toHaveAttribute("href", "/learn/earthly-branches");
    await expect(page.locator(".instant-practice")).toHaveCount(0);
    await expect(page.getByRole("link", { name: /进入测试学堂/ })).toHaveAttribute("href", "/test-academy");
    await expect(
      page
        .getByRole("region", { name: "相关知识" })
        .getByRole("link", { name: /五行生克/ }),
    ).toBeVisible();
    await page.goto("/learn/earthly-branches");
    await expect(
      page.getByRole("heading", { name: "十二地支基础" }),
    ).toBeVisible();
    await expect(page.locator(".cycle-card")).toHaveCount(12);
    await expect(page.getByText("还没有开始")).toBeVisible();
    await expect(page.getByText("23:00–01:00", { exact: true })).toBeVisible();
    await expect(
      page.getByRole("link", { name: /下一节：河图与洛书入门/ }),
    ).toHaveAttribute("href", "/learn/hetu-luoshu");
    await page.goto("/learn/nine-palaces");
    await expect(page.getByRole("heading", { name: "九宫基础" })).toBeVisible();
    await expect(
      page.getByRole("link", { name: /打开河图洛书九宫工具/ }),
    ).toBeVisible();
    await expect(page.locator(".instant-practice")).toHaveCount(0);
    await expect(page.getByRole("link", { name: /进入测试学堂/ })).toHaveAttribute("href", "/test-academy");
    await expect(page.getByRole("heading", { name: "相关知识" })).toBeVisible();
  });

  test("干支关系图按体系切换并显示计算边界", async ({ page }) => {
    await page.goto("/tools");
    await expect(
      page.getByRole("heading", { name: "把关系放到眼前。" }),
    ).toBeVisible();
    await expect(page.locator(".tools-hub-card")).toHaveCount(7);
    await page.goto("/tools/sexagenary-relations");
    await expect(
      page.getByRole("heading", { name: "先记配对，再谈规则。" }),
    ).toBeVisible();
    await expect(page.getByRole("tab", { name: "天干五合" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    await expect(page.getByRole("tab", { name: "天干五合" })).toHaveAttribute(
      "aria-controls",
      "sexagenary-mode-panel",
    );
    await expect(page.getByRole("tabpanel")).toHaveAttribute(
      "aria-labelledby",
      "sexagenary-mode-stem-combination",
    );
    await expect(page.locator(".sexagenary-relation-list button")).toHaveCount(
      5,
    );
    await expect(
      page
        .locator(".sexagenary-relation-list")
        .getByText("甲己合", { exact: true }),
    ).toBeVisible();
    await expect(page.locator(".sexagenary-relation-detail")).toHaveAttribute("role", "status");
    await expect(page.locator(".sexagenary-relation-detail")).toHaveAttribute("aria-live", "polite");
    await page.getByRole("tab", { name: "天干五合" }).focus();
    await page.keyboard.press("ArrowRight");
    await expect(page.getByRole("tab", { name: "地支六合" })).toBeFocused();
    await expect(page.getByRole("tab", { name: "地支六合" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    await page.keyboard.press("Home");
    await expect(page.getByRole("tab", { name: "天干五合" })).toBeFocused();
    await expect(page.getByRole("tab", { name: "天干五合" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    await page.keyboard.press("End");
    await expect(page.getByRole("tab", { name: "地支六冲" })).toBeFocused();
    await expect(page.getByRole("tab", { name: "地支六冲" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    await page.getByRole("tab", { name: "地支六冲" }).click();
    await expect(page.locator(".sexagenary-relation-list button")).toHaveCount(
      6,
    );
    await expect(
      page
        .locator(".sexagenary-relation-list")
        .getByText("子午冲", { exact: true }),
    ).toBeVisible();
    await expect(page.getByText(/不进行历法计算/)).toBeVisible();
  });

  test("历法输入审阅保留时区和规则边界且不生成排盘", async ({ page }) => {
    await page.goto("/tools/calendar");
    await page.getByLabel("换日规则").selectOption("calendar-draft-1");
    await expect(
      page.getByRole("heading", { name: "读懂时间里的干支变化。" }),
    ).toBeVisible();
    await page.getByLabel("公历本地时间").fill("2026-08-26T12:34");
    await page.getByRole("button", { name: "计算干支与节气" }).click();
    const reading = page.locator(".calendar-reading");
    await expect(reading).toContainText("calendar-draft-1");
    await expect(reading).toContainText("Asia/Shanghai");
    await expect(reading).toContainText("时区解析");
    await expect(reading).toContainText("2026-08-26T04:34:00.000Z");
    await expect(reading).toContainText("不生成农历或干支结果");
    await expect(reading.getByText("干支年", { exact: true })).toBeVisible();
    await expect(reading.locator('[aria-label="规则证据状态"]')).toContainText("来源 ID");
    await expect(reading.locator('[aria-label="规则证据状态"]')).toContainText("权威样例 ID");
    await expect(reading.locator('[aria-label="规则证据状态"]')).toContainText("待补齐");
    const boundaryStatus = reading.locator('.calendar-boundary-status:not([aria-label="规则证据状态"])');
    await expect(boundaryStatus.locator("li")).toHaveCount(6);
    await expect(boundaryStatus).toContainText(
      "二十四节气边界",
    );
    await expect(boundaryStatus).toContainText(
      "换年边界",
    );
    await expect(boundaryStatus).toContainText(
      "真太阳时边界",
    );
  });

  test("历法页面的动态默认时间不会产生水合错误", async ({ page }) => {
    const hydrationErrors: string[] = [];
    page.on("console", (message) => {
      if (message.type() === "error" && /hydration|hydrat/i.test(message.text())) {
        hydrationErrors.push(message.text());
      }
    });
    await page.goto("/tools/calendar");
    await expect(
      page.getByRole("heading", { name: "读懂时间里的干支变化。" }),
    ).toBeVisible();
    await expect(page.getByLabel("公历本地时间")).toHaveValue(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/);
    expect(hydrationErrors, "历法页面不应产生水合错误").toEqual([]);
  });

  test("历法输入不会静默选择夏令时重复或不存在的本地时间", async ({ page }) => {
    await page.goto("/tools/calendar");
    await page.getByLabel("换日规则").selectOption("calendar-draft-1");
    await expect(
      page.getByRole("heading", { name: "读懂时间里的干支变化。" }),
    ).toBeVisible();
    await page.getByLabel("IANA 时区").fill("America/Los_Angeles");
    await page.getByLabel("公历本地时间").fill("2026-03-08T02:30");
    await page.getByRole("button", { name: "计算干支与节气" }).click();
    await expect(page.locator(".calendar-reading")).toContainText("不存在时间");
    await expect(page.locator(".calendar-reading")).toContainText("暂不构造");

    await page.getByLabel("公历本地时间").fill("2026-11-01T01:30");
    await page.getByRole("button", { name: "计算干支与节气" }).click();
    await expect(page.locator(".calendar-reading")).toContainText("重复时间");
    await expect(page.locator(".calendar-reading")).toContainText("暂不构造");
  });

  test("历法输入页面支持通过显式 ISO 偏移消除重复时间歧义", async ({ page }) => {
    await page.goto("/tools/calendar");
    await page.getByLabel("换日规则").selectOption("calendar-draft-1");
    await expect(
      page.getByRole("heading", { name: "读懂时间里的干支变化。" }),
    ).toBeVisible();
    await page.getByLabel("时间输入方式").selectOption("iso");
    await page.getByLabel("IANA 时区").fill("America/Los_Angeles");
    await page
      .getByLabel("ISO 时间（可含偏移）")
      .fill("2026-11-01T01:30:00.789123-07:00");
    await page.getByRole("button", { name: "计算干支与节气" }).click();
    const reading = page.locator(".calendar-reading");
    await expect(reading).toContainText("已解析");
    await expect(reading).toContainText("2026-11-01T01:30:00.789");
    await expect(reading).toContainText("2026-11-01T08:30:00.789Z");
    await expect(reading).toContainText("-07:00");
  });

  test("历法审阅不会静默替换用户输入的规则版本", async ({ page }) => {
    await page.goto("/tools/calendar");
    await page.getByLabel("换日规则").selectOption("calendar-lichun-jie-zi-v1");
    await page.getByRole("button", { name: "计算干支与节气" }).click();
    await page.getByText("查看计算依据与边界", { exact: true }).click();
    await expect(page.getByLabel("干支与节气计算结果")).toContainText("calendar-lichun-jie-zi-v1");
  });

  test("河图洛书九宫分层展示并可查看宫位", async ({ page }) => {
    await page.goto("/tools/hetu-luoshu");
    await expect(
      page.getByRole("heading", { name: "分开看数字，再建立方位。" }),
    ).toBeVisible();
    await expect(page.getByRole("tab", { name: "河图" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    await expect(page.getByRole("tab", { name: "河图" })).toHaveAttribute(
      "aria-controls",
      "hetu-layer-panel",
    );
    await expect(page.getByRole("tabpanel")).toHaveAttribute(
      "aria-labelledby",
      "hetu-layer-hetu",
    );
    await expect(page.locator(".hetu-group")).toHaveCount(5);
    await page.getByRole("tab", { name: "河图" }).focus();
    await page.keyboard.press("ArrowRight");
    await expect(page.getByRole("tab", { name: "洛书" })).toBeFocused();
    await expect(page.getByRole("tab", { name: "洛书" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    await page.keyboard.press("Home");
    await expect(page.getByRole("tab", { name: "河图" })).toBeFocused();
    await expect(page.getByRole("tab", { name: "河图" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    await page.keyboard.press("End");
    await expect(page.getByRole("tab", { name: "九宫" })).toBeFocused();
    await expect(page.getByRole("tab", { name: "九宫" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    await page.getByRole("tab", { name: "洛书" }).click();
    await expect(page.locator(".luoshu-cell")).toHaveCount(9);
    await page.getByRole("tab", { name: "九宫" }).click();
    await expect(page.locator(".palace-grid button")).toHaveCount(9);
    await page.getByRole("button", { name: /9 南/ }).click();
    await expect(page.getByRole("heading", { name: "九紫离宫" })).toBeVisible();
    await expect(page.locator(".palace-detail")).toHaveAttribute("role", "status");
    await expect(page.locator(".palace-detail")).toHaveAttribute("aria-live", "polite");
  });

  test("360度学习罗盘支持角度、八方和边界映射", async ({ page }) => {
    await page.goto("/tools/compass");
    await expect(
      page.getByRole("group", { name: "当前盘面旋转 0.0 度" }),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "先把角度读清楚。" }),
    ).toBeVisible();
    await expect(page.getByRole("button", { name: /二十四山/ })).toBeEnabled();
    await expect(page.getByText(/360° 几何方位/)).toBeVisible();
    await expect(page.getByRole("tab", { name: "自由探索" })).toHaveAttribute(
      "aria-controls",
      "compass-mode-panel",
    );
    await expect(page.getByRole("tabpanel")).toHaveAttribute(
      "aria-labelledby",
      "compass-mode-explore",
    );
    await page.getByRole("button", { name: "检测设备能力" }).click();
    await expect(
      page.getByRole("status").filter({ hasText: /手动模式/ }),
    ).toBeVisible();
    const diagnostics = page.locator(".compass-sensor-diagnostics");
    await diagnostics.getByText(/平台诊断/).click();
    await expect(diagnostics).toContainText("方向事件 API");
    await expect(
      page.getByRole("heading", { name: /北 · 0\.0°/ }),
    ).toBeVisible();
    await page.getByLabel("手动输入角度（0°=北，顺时针）").fill("90");
    await expect(
      page.getByRole("heading", { name: /东 · 90\.0°/ }),
    ).toBeVisible();
    await page.getByLabel("手动输入角度（0°=北，顺时针）").fill("22.5");
    await expect(
      page.getByRole("heading", { name: /东北 · 22\.5°/ }),
    ).toBeVisible();
    await page.getByRole("tab", { name: "自由探索" }).focus();
    await page.keyboard.press("ArrowRight");
    await expect(page.getByRole("tab", { name: "隐藏标签" })).toBeFocused();
    await expect(page.getByRole("tab", { name: "隐藏标签" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    await page.keyboard.press("Home");
    await expect(page.getByRole("tab", { name: "自由探索" })).toBeFocused();
    await expect(page.getByRole("tab", { name: "自由探索" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    await page.keyboard.press("End");
    await expect(page.getByRole("tab", { name: "隐藏标签" })).toBeFocused();
    await expect(page.getByRole("tab", { name: "隐藏标签" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    await expect(page.getByRole("tab", { name: "方位测验" })).toHaveCount(0);
    await expect(page.getByText(/不读取设备传感器/)).toBeVisible();
  });

  test("点击开始读取方向后会消费方向事件并显示精度边界", async ({ page }) => {
    await page.addInitScript(() => {
      Object.defineProperty(window, "DeviceOrientationEvent", {
        configurable: true,
        value: class DeviceOrientationEvent extends Event {},
      });
    });
    await page.goto("/tools/compass");
    await page.getByRole("button", { name: "检测设备能力" }).click();
    await expect(page.getByRole("button", { name: "开始读取方向" })).toBeVisible();
    await page.getByRole("button", { name: "开始读取方向" }).click();
    await expect(page.getByRole("button", { name: "停止读取方向" })).toBeVisible();
    await page.evaluate(() => {
      const event = new Event("deviceorientation");
      Object.defineProperties(event, {
        alpha: { value: 90 },
        absolute: { value: true },
      });
      window.dispatchEvent(event);
    });
    await expect(page.getByRole("status").filter({ hasText: /传感器读数 270\.0°/ })).toBeVisible();
    await expect(page.getByRole("status").filter({ hasText: /精度未知，仅供学习/ })).toBeVisible();
    await page.getByRole("button", { name: "停止读取方向" }).click();
    await expect(page.getByText(/已停止读取/)).toBeVisible();
  });

  test("方向权限等待期间切换模式会取消尚未启动的监听", async ({ page }) => {
    await page.addInitScript(() => {
      class DeviceOrientationEventWithPermission extends Event {
        static requestPermission() {
          (window as Window & { __permissionCalls?: number }).__permissionCalls = ((window as Window & { __permissionCalls?: number }).__permissionCalls ?? 0) + 1;
          return new Promise<string>((resolve) => {
            (window as Window & { __resolveDirectionPermission?: (value: string) => void }).__resolveDirectionPermission = resolve;
          });
        }
      }
      Object.defineProperty(window, "DeviceOrientationEvent", {
        configurable: true,
        value: DeviceOrientationEventWithPermission,
      });
    });
    await page.goto("/tools/compass");
    await expect.poll(() => page.evaluate(() => ({ secure: window.isSecureContext, hasDeviceOrientation: "DeviceOrientationEvent" in window, hasRequestPermission: typeof (window.DeviceOrientationEvent as unknown as { requestPermission?: unknown }).requestPermission === "function" }))).toEqual({ secure: true, hasDeviceOrientation: true, hasRequestPermission: true });
    await page.getByRole("button", { name: "检测设备能力" }).click();
    await page.getByRole("button", { name: "开始读取方向" }).click();
    await expect.poll(() => page.evaluate(() => (window as Window & { __permissionCalls?: number }).__permissionCalls ?? 0)).toBe(1);
    const startButton = page.getByRole("button", { name: /正在请求方向权限/ });
    await expect(startButton).toBeVisible();
    await expect(startButton).toBeDisabled();
    await page.getByRole("tab", { name: "隐藏标签" }).click();
    await page.evaluate(() => {
      (window as Window & { __resolveDirectionPermission?: (value: string) => void }).__resolveDirectionPermission?.("granted");
      const event = new Event("deviceorientation");
      Object.defineProperties(event, { alpha: { value: 90 }, absolute: { value: true } });
      window.dispatchEvent(event);
    });
    await expect(page.getByRole("button", { name: "停止读取方向" })).toHaveCount(0);
    await expect(page.getByRole("status").filter({ hasText: /传感器读数/ })).toHaveCount(0);
  });

  test("学习罗盘可以保存、恢复手工坐向记录", async ({ page }) => {
    await page.goto("/tools/compass");
    await page.getByLabel("手动输入角度（0°=北，顺时针）").fill("180");
    await page.getByLabel("记录标题").fill("书桌朝向练习");
    await page.getByLabel("环境备注").fill("下午站在书桌前观察");
    await page.getByRole("button", { name: "保存当前坐向" }).click();
    await expect(page.getByText("已保存 南 · 180.0°")).toBeVisible();
    const history = page.getByRole("region", { name: "坐向记录" });
    await expect(
      history.getByText("书桌朝向练习", { exact: true }),
    ).toBeVisible();
    await expect(
      history.getByText("下午站在书桌前观察", { exact: true }),
    ).toBeVisible();
    await page.getByLabel("手动输入角度（0°=北，顺时针）").fill("90");
    await history.getByRole("button", { name: "恢复" }).click();
    await expect(page.getByLabel("手动输入角度（0°=北，顺时针）")).toHaveValue(
      "180.0",
    );
    await expect(history.getByText(/已恢复“书桌朝向练习”/)).toBeVisible();
  });

  test("学习罗盘可以应用、重置并查看传感器偏差修正历史", async ({ page }) => {
    await page.goto("/tools/compass");
    const correction = page.getByRole("region", { name: "罗盘手动偏差修正" });
    await expect(
      correction.getByRole("heading", { name: "把已知偏差留下说明。" }),
    ).toBeVisible();
    await correction.getByLabel("传感器修正角（-180° 至 +180°）").fill("12.5");
    await correction.getByRole("button", { name: "应用并记录" }).click();
    await expect(correction.locator(".share-status")).toContainText(
      "已应用手动修正 +12.5°",
    );
    await correction.getByText(/查看最近修正历史/).click();
    await expect(correction.getByText(/用户手动修正/)).toBeVisible();
    await correction.getByRole("button", { name: "重置为 0°" }).click();
    await expect(correction.locator(".share-status")).toContainText(
      "已重置手动修正 0.0°",
    );
  });

  test("罗盘修正表单的未保存草稿不会被其他标签页覆盖", async ({ page, context }) => {
    await page.goto("/tools/compass");
    const correction = page.getByRole("region", { name: "罗盘手动偏差修正" });
    const draft = correction.getByLabel("传感器修正角（-180° 至 +180°）");
    await draft.fill("12.5");

    const otherPage = await context.newPage();
    try {
      await otherPage.goto("/tools/compass");
      const otherCorrection = otherPage.getByRole("region", { name: "罗盘手动偏差修正" });
      await otherCorrection.getByLabel("传感器修正角（-180° 至 +180°）").fill("7.5");
      await otherCorrection.getByRole("button", { name: "应用并记录" }).click();
      await expect(otherCorrection.locator(".share-status")).toContainText("已应用手动修正 +7.5°");
      await expect(draft).toHaveValue("12.5");
    } finally {
      await otherPage.close();
    }
  });

  test("复习题支持作答和四级回忆评价", async ({ page }) => {
    await page.goto("/review");
    await expect(page.getByText("主动回忆 · 今日复习")).toBeVisible();
    await expect(page.getByRole("progressbar", { name: "复习进度" })).toHaveAttribute("aria-valuenow", "0");
    await page.getByRole("button", { name: "乾" }).click();
    await expect(page.getByText("这次回忆感觉如何？")).toBeVisible();
    await page.getByLabel("用自己的话复述（可选）").fill("我用三条阳爻记住乾卦。 ");
    await page.getByRole("button", { name: "记得" }).click();
    await expect.poll(async () => page.evaluate(async () => new Promise<string | undefined>((resolve, reject) => {
      const request = indexedDB.open("yijing-local");
      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        const transaction = request.result.transaction("reviewAttempts", "readonly");
        const getAll = transaction.objectStore("reviewAttempts").getAll();
        getAll.onsuccess = () => resolve(getAll.result.at(-1)?.selfExplanation);
        getAll.onerror = () => reject(getAll.error);
      };
    }))).toBe("我用三条阳爻记住乾卦。");
    await expect(page.getByRole("button", { name: "下一题" })).toBeVisible();
  });

  test("复习会话支持填写后天方位并保存评分", async ({ page }) => {
    // Let the app create/upgrade the schema first, then seed only the card
    // needed by this test. Avoiding broad clears keeps WebKit transaction
    // setup deterministic while preserving the production data path.
    test.setTimeout(120_000);
    await page.goto("/review/session");
    await expect(page.locator(".database-loading")).toHaveCount(0, { timeout: 20_000 });
    await expect(page.locator("body")).toBeVisible();
    await page.evaluate(async () => {
      await new Promise<void>((resolve, reject) => {
        const request = indexedDB.open("yijing-local");
        request.onblocked = () => reject(new Error("IndexedDB setup was blocked"));
        request.onerror = () => reject(request.error);
        request.onsuccess = () => {
          const db = request.result;
          const transaction = db.transaction(["reviewCardStates", "reviewAttempts", "preferences"], "readwrite");
          transaction.objectStore("reviewCardStates").put({
            cardId: "trigram-direction-qian",
            targetType: "trigram",
            targetId: "qian",
            algorithmVersion: 1,
            stepIndex: 0,
            dueDate: "2000-01-01",
            lapseCount: 0,
            consecutivePasses: 0,
            consecutiveForgets: 0,
            isWeak: false,
            updatedAt: new Date().toISOString(),
          });
          transaction.objectStore("reviewAttempts").put({
            id: "eta-history-trigram-direction-qian",
            cardId: "trigram-direction-qian",
            exerciseVersion: 1,
            targetType: "trigram",
            promptSnapshot: "填写后天方位",
            answerSnapshot: "西北",
            objectiveCorrect: true,
            reviewMode: "spaced",
            hintUsed: false,
            responseTimeMs: 120_000,
            recallGrade: "remembered",
            reviewedAt: new Date().toISOString(),
            localDate: "2026-08-30",
          });
          transaction.objectStore("preferences").put({
            key: "sessionBatchSize",
            value: 10,
            updatedAt: new Date().toISOString(),
          });
          transaction.oncomplete = () => { db.close(); resolve(); };
          transaction.onerror = () => { db.close(); reject(transaction.error); };
          transaction.onabort = () => { db.close(); reject(transaction.error ?? new Error("IndexedDB setup aborted")); };
        };
      });
    });
    await page.reload();
    await expect(page.getByLabel("你的答案")).toBeVisible();
    await expect(page.getByText("预计约 20 分钟")).toBeVisible();
    await page.getByLabel("你的答案").fill(" 西北 ");
    await page.getByRole("button", { name: "提交答案" }).click();
    await expect(page.getByText("答案正确")).toBeVisible();
    await page.getByRole("button", { name: "记得" }).click();
    await expect(page.getByText("正在保存本次复习…")).toHaveCount(0);
    await expect(page.getByRole("button", { name: "下一题" })).toBeVisible();
    // The quick answer contributes a bounded short sample to the median, and
    // the completed current card is removed from the remaining count.
    await expect(page.getByText("预计约 10 分钟")).toBeVisible();
    const attempts = await page.evaluate(async () => {
      return await new Promise<Array<{ responseTimeMs?: number }>>((resolve, reject) => {
        const request = indexedDB.open("yijing-local");
        request.onerror = () => reject(request.error);
        request.onsuccess = () => {
          const db = request.result;
          const get = db.transaction("reviewAttempts", "readonly").objectStore("reviewAttempts").getAll();
          get.onsuccess = () => { db.close(); resolve(get.result); };
          get.onerror = () => reject(get.error);
        };
      });
    });
    expect(attempts.some((attempt) => Number.isInteger(attempt.responseTimeMs) && (attempt.responseTimeMs ?? -1) >= 0 && (attempt.responseTimeMs ?? Infinity) <= 86_400_000)).toBe(true);
  });

  test("薄弱六十四卦可以回到正确的详情路由", async ({ page }) => {
    await page.goto("/review");
    await expect(page.getByRole("heading", { name: "把遗忘变成下一次入口" })).toBeVisible();
    await page.evaluate(async () => {
      await new Promise<void>((resolve, reject) => {
        const request = indexedDB.open("yijing-local");
        request.onerror = () => reject(request.error);
        request.onsuccess = () => {
          const db = request.result;
          const transaction = db.transaction(["reviewCardStates", "reviewAttempts"], "readwrite");
          transaction.objectStore("reviewCardStates").put({
            cardId: "hexagram-pair-qian-qian",
            targetType: "hexagram",
            targetId: "hexagram-01",
            algorithmVersion: 1,
            stepIndex: 0,
            dueDate: new Date().toLocaleDateString("sv-SE"),
            lapseCount: 2,
            consecutivePasses: 0,
            isWeak: true,
            updatedAt: new Date().toISOString(),
          });
          transaction.objectStore("reviewAttempts").put({
            id: "weak-hexagram-attempt",
            cardId: "hexagram-pair-qian-qian",
            exerciseVersion: 1,
            targetType: "hexagram",
            promptSnapshot: "下卦为乾、上卦为乾，组成哪一卦？",
            answerSnapshot: "乾为天",
            objectiveCorrect: false,
            reviewMode: "spaced",
            hintUsed: false,
            recallGrade: "forgot",
            reviewedAt: "2026-08-28T00:00:00.000Z",
            localDate: "2026-08-28",
          });
          transaction.oncomplete = () => {
            db.close();
            window.dispatchEvent(new Event("yijing:data-changed"));
            resolve();
          };
          transaction.onerror = () => reject(transaction.error);
        };
      });
    });
    const weakLink = page.locator(".weak-list a").filter({ hasText: "乾为天" });
    await expect(weakLink).toHaveAttribute("href", "/hexagrams/1");
    await expect(weakLink).toContainText("题目：下卦为乾、上卦为乾，组成哪一卦？");
    await expect(weakLink).toContainText("答案：乾为天");
  });

  test("复习中心显示本地混淆点并保留具体错题快照", async ({ page }) => {
    await page.goto("/review");
    await expect(page.getByRole("heading", { name: "找到最容易混淆的卡片" })).toBeVisible();
    await page.evaluate(async () => {
      await new Promise<void>((resolve, reject) => {
        const request = indexedDB.open("yijing-local");
        request.onerror = () => reject(request.error);
        request.onblocked = () => reject(new Error("混淆点测试被 IndexedDB 连接阻塞"));
        request.onsuccess = () => {
          const db = request.result;
          const transaction = db.transaction(["reviewCardStates", "reviewAttempts"], "readwrite");
          transaction.objectStore("reviewCardStates").put({
            cardId: "trigram-name-qian",
            targetType: "trigram",
            targetId: "qian",
            algorithmVersion: 1,
            stepIndex: 0,
            dueDate: "2026-08-31",
            lapseCount: 1,
            consecutivePasses: 0,
            consecutiveForgets: 1,
            isWeak: false,
            updatedAt: "2026-08-31T00:00:00.000Z",
          });
          transaction.objectStore("reviewAttempts").put({
            id: "confusion-qian-old",
            cardId: "trigram-name-qian",
            targetType: "trigram",
            promptSnapshot: "旧的卦名题",
            answerSnapshot: "旧答案",
            objectiveCorrect: false,
            recallGrade: "forgot",
            reviewedAt: "2026-08-29T00:00:00.000Z",
            localDate: "2026-08-29",
          });
          transaction.objectStore("reviewAttempts").put({
            id: "confusion-qian-new",
            cardId: "trigram-name-qian",
            targetType: "trigram",
            promptSnapshot: "最新的卦名题",
            answerSnapshot: "用户当时的答案",
            objectiveCorrect: false,
            recallGrade: "forgot",
            selfExplanation: "我把三条阳爻和乾卦联系起来。",
            reviewedAt: "2026-08-31T00:00:00.000Z",
            localDate: "2026-08-31",
          });
          transaction.oncomplete = () => {
            db.close();
            window.dispatchEvent(new Event("yijing:data-changed"));
            resolve();
          };
          transaction.onerror = () => {
            db.close();
            reject(transaction.error);
          };
          transaction.onabort = () => {
            db.close();
            reject(transaction.error ?? new Error("混淆点测试事务中止"));
          };
        };
      });
    });
    const confusion = page.locator(".review-confusions");
    await expect(confusion).toContainText("乾");
    await expect(confusion).toContainText("错误 2 次 / 作答 2 次");
    await expect(confusion).toContainText("最近题目");
    await expect(confusion).toContainText("最新的卦名题");
    await expect(confusion).toContainText("用户当时的答案");
    await expect(confusion).toContainText("我把三条阳爻和乾卦联系起来。");
    await expect(confusion.getByRole("link", { name: /乾/ })).toHaveAttribute("href", "/trigrams/qian");
    await confusion.getByRole("link", { name: "立即再练" }).click();
    await expect(page).toHaveURL(/\/review\/session\?focus=trigram-name-qian$/);
    await expect(page.locator(".review-session-top")).toContainText("1 / 1");
    await expect(page.getByText("看卦符，选择卦名", { exact: true })).toBeVisible();
  });

  test("复习中心不会把孤立状态显示为薄弱知识点", async ({ page }) => {
    await page.goto("/review");
    await expect(page.getByRole("heading", { name: "把遗忘变成下一次入口" })).toBeVisible();
    await page.evaluate(async () => {
      await new Promise<void>((resolve, reject) => {
        const request = indexedDB.open("yijing-local");
        request.onerror = () => reject(request.error);
        request.onblocked = () => reject(new Error("薄弱点孤立状态测试被 IndexedDB 连接阻塞"));
        request.onsuccess = () => {
          const db = request.result;
          const transaction = db.transaction("reviewCardStates", "readwrite");
          const store = transaction.objectStore("reviewCardStates");
          store.clear();
          store.put({
            cardId: "hexagram-pair-qian-qian",
            targetType: "hexagram",
            targetId: "hexagram-01",
            algorithmVersion: 1,
            stepIndex: 0,
            dueDate: new Date().toLocaleDateString("sv-SE"),
            lapseCount: 2,
            consecutivePasses: 0,
            isWeak: true,
            updatedAt: new Date().toISOString(),
          });
          store.put({
            cardId: "removed-exercise-card",
            targetType: "trigram",
            targetId: "removed-trigram",
            algorithmVersion: 1,
            stepIndex: 0,
            dueDate: new Date().toLocaleDateString("sv-SE"),
            lapseCount: 8,
            consecutivePasses: 0,
            isWeak: true,
            updatedAt: new Date().toISOString(),
          });
          store.put({
            cardId: "trigram-name-qian",
            targetType: "trigram",
            targetId: "qian",
            algorithmVersion: 1,
            stepIndex: Number.NaN,
            dueDate: new Date().toLocaleDateString("sv-SE"),
            lapseCount: 2,
            consecutivePasses: 0,
            isWeak: true,
            updatedAt: new Date().toISOString(),
          });
          transaction.oncomplete = () => {
            db.close();
            window.dispatchEvent(new Event("yijing:data-changed"));
            resolve();
          };
          transaction.onerror = () => reject(transaction.error);
        };
      });
    });
    const weakPoints = page.locator(".weak-points");
    await expect(weakPoints.locator(".weak-count")).toHaveText("1 张");
    await expect(weakPoints).toContainText("乾为天");
    await expect(weakPoints).not.toContainText("removed-trigram");
  });

  test("掌握度回写不会让已有的学习时间倒退", async ({ page }) => {
    await page.goto("/review");
    await expect(page.getByText("主动回忆 · 今日复习")).toBeVisible();
    await page.evaluate(async () => {
      const today = new Date().toLocaleDateString("sv-SE");
      await new Promise<void>((resolve, reject) => {
        const request = indexedDB.open("yijing-local");
        request.onerror = () => reject(request.error);
        request.onblocked = () => reject(new Error("掌握度时间戳测试被 IndexedDB 连接阻塞"));
        request.onsuccess = () => {
          const db = request.result;
          const transaction = db.transaction(["reviewCardStates", "conceptProgress"], "readwrite");
          transaction.objectStore("reviewCardStates").put({
            cardId: "stem-element-jia",
            targetType: "concept",
            targetId: "heavenly-stems",
            algorithmVersion: 1,
            stepIndex: 0,
            dueDate: today,
            lapseCount: 0,
            consecutivePasses: 0,
            isWeak: false,
            updatedAt: "2026-08-28T09:00:00.000Z",
          });
          transaction.objectStore("conceptProgress").put({
            conceptId: "heavenly-stems",
            status: "learning",
            masteryScore: 40,
            lastStudiedAt: "2099-01-01T00:00:00.000Z",
            updatedAt: "2099-01-01T00:00:00.000Z",
          });
          transaction.oncomplete = () => { db.close(); resolve(); };
          transaction.onerror = () => reject(transaction.error);
        };
      });
    });
    await page.reload();
    await expect(page.getByRole("button", { name: "木" })).toBeVisible();
    await page.getByRole("button", { name: "木" }).click();
    await page.getByRole("button", { name: "记得" }).click();
    await expect(page.getByRole("button", { name: "下一题" })).toBeVisible();
    const progress = await page.evaluate(async () => {
      return await new Promise<{ lastStudiedAt?: string; updatedAt?: string } | undefined>((resolve, reject) => {
        const request = indexedDB.open("yijing-local");
        request.onerror = () => reject(request.error);
        request.onblocked = () => reject(new Error("掌握度时间戳测试读取被 IndexedDB 连接阻塞"));
        request.onsuccess = () => {
          const db = request.result;
          const transaction = db.transaction("conceptProgress", "readonly");
          const get = transaction.objectStore("conceptProgress").get("heavenly-stems");
          get.onsuccess = () => { db.close(); resolve(get.result); };
          get.onerror = () => reject(get.error);
        };
      });
    });
    expect(progress).toMatchObject({
      lastStudiedAt: "2099-01-01T00:00:00.000Z",
      updatedAt: "2099-01-01T00:00:00.000Z",
    });
  });

  test("两个标签页同时复习时按事务内最新阶梯推进", async ({ page, context }) => {
    await page.goto("/review");
    await expect(page.getByText("主动回忆 · 今日复习")).toBeVisible();
    await page.evaluate(async () => {
      const today = new Date().toLocaleDateString("sv-SE");
      await new Promise<void>((resolve, reject) => {
        const request = indexedDB.open("yijing-local");
        request.onerror = () => reject(request.error);
        request.onsuccess = () => {
          const db = request.result;
          const transaction = db.transaction("reviewCardStates", "readwrite");
          transaction.objectStore("reviewCardStates").put({
            cardId: "stem-element-jia",
            targetType: "concept",
            targetId: "heavenly-stems",
            algorithmVersion: 1,
            stepIndex: 0,
            dueDate: today,
            lapseCount: 0,
            consecutivePasses: 0,
            isWeak: false,
            updatedAt: new Date().toISOString(),
          });
          transaction.oncomplete = () => { db.close(); resolve(); };
          transaction.onerror = () => reject(transaction.error);
        };
      });
    });
    await page.goto("/review");
    await expect(page.getByRole("button", { name: "木" })).toBeVisible();
    const otherPage = await context.newPage();
    try {
      await otherPage.goto("/review");
      await expect(otherPage.getByRole("button", { name: "木" })).toBeVisible();
      await Promise.all([
        page.getByRole("button", { name: "木" }).click(),
        otherPage.getByRole("button", { name: "木" }).click(),
      ]);
      await Promise.all([
        page.getByRole("button", { name: "记得" }).click(),
        otherPage.getByRole("button", { name: "记得" }).click(),
      ]);
      await expect(page.getByRole("button", { name: "下一题" })).toBeVisible();
      await expect(otherPage.getByRole("button", { name: "下一题" })).toBeVisible();
      const state = await page.evaluate(async () => {
        return await new Promise<{ stepIndex: number } | undefined>((resolve, reject) => {
          const request = indexedDB.open("yijing-local");
          request.onerror = () => reject(request.error);
          request.onsuccess = () => {
            const db = request.result;
            const transaction = db.transaction("reviewCardStates", "readonly");
            const get = transaction.objectStore("reviewCardStates").get("stem-element-jia");
            get.onsuccess = () => { db.close(); resolve(get.result); };
            get.onerror = () => reject(get.error);
          };
        });
      });
      expect(state).toMatchObject({ stepIndex: 2 });
    } finally {
      await otherPage.close();
    }
  });

  test("卦象题查看提示后会记录为非独立完成", async ({ page }) => {
    await page.goto("/review");
    await expect(page.getByText("主动回忆 · 今日复习")).toBeVisible();
    await page.evaluate(async () => {
      const today = new Date().toLocaleDateString("sv-SE");
      await new Promise<void>((resolve, reject) => {
        const request = indexedDB.open("yijing-local");
        request.onerror = () => reject(request.error);
        request.onblocked = () => reject(new Error("测试数据写入被 IndexedDB 连接阻塞"));
        request.onsuccess = () => {
          const db = request.result;
          const transaction = db.transaction("reviewCardStates", "readwrite");
          transaction.objectStore("reviewCardStates").put({
            cardId: "hexagram-pair-qian-qian",
            targetType: "hexagram",
            targetId: "hexagram-01",
            stepIndex: 0,
            dueDate: today,
            lapseCount: 0,
            consecutivePasses: 0,
            isWeak: false,
            updatedAt: new Date().toISOString(),
          });
          transaction.oncomplete = () => { db.close(); resolve(); };
          transaction.onerror = () => reject(transaction.error);
        };
      });
    });
    await page.reload();
    await expect(page.getByRole("button", { name: "查看提示" })).toBeVisible();
    await page.getByRole("button", { name: "查看提示" }).click();
    await expect(page.getByText(/先确认题目给出的上卦与下卦/)).toBeVisible();
    await page.locator(".answer-options button").first().click();
    await page.getByRole("button", { name: "记得" }).click();
    const attempt = await page.evaluate(async () => {
      return await new Promise<{ targetType?: string; hintUsed?: boolean } | undefined>((resolve, reject) => {
        const request = indexedDB.open("yijing-local");
        request.onerror = () => reject(request.error);
        request.onblocked = () => reject(new Error("测试数据读取被 IndexedDB 连接阻塞"));
        request.onsuccess = () => {
          const db = request.result;
          const transaction = db.transaction("reviewAttempts", "readonly");
          const cursor = transaction.objectStore("reviewAttempts").openCursor();
          cursor.onsuccess = () => { const value = cursor.result?.value; db.close(); resolve(value); };
          cursor.onerror = () => reject(cursor.error);
        };
      });
    });
    expect(attempt).toMatchObject({ targetType: "hexagram", hintUsed: true });
  });

  test("复习评分在刷新后不会重复进入同一张卡", async ({ page }) => {
    await page.goto("/review");
    await expect(page.getByText("主动回忆 · 今日复习")).toBeVisible();
    const firstDisplay = await page.locator(".review-symbol").textContent();
    await page.locator(".answer-options button").first().click();
    await page.getByRole("button", { name: "记得" }).click();
    await expect(page.getByRole("button", { name: "下一题" })).toBeVisible();
    await page.reload();
    await expect(page.getByText("主动回忆 · 今日复习")).toBeVisible();
    await expect(page.locator(".review-symbol")).not.toHaveText(
      firstDisplay ?? "",
    );
  });

  test("遇到未知复习算法版本时不会静默记分", async ({ page }) => {
    await page.goto("/review");
    await expect(page.locator(".review-session, .review-empty").first()).toBeVisible();
    await page.evaluate(async () => {
      await new Promise<void>((resolve, reject) => {
        const request = indexedDB.open("yijing-local");
        request.onerror = () => reject(request.error);
        request.onblocked = () => reject(new Error("未知算法版本测试被 IndexedDB 连接阻塞"));
        request.onsuccess = () => {
          const db = request.result;
          const transaction = db.transaction("reviewCardStates", "readwrite");
          const store = transaction.objectStore("reviewCardStates");
          store.clear();
          store.put({
            cardId: "trigram-name-qian",
            targetType: "trigram",
            targetId: "qian",
            algorithmVersion: 99,
            stepIndex: 0,
            dueDate: new Date().toLocaleDateString("sv-SE"),
            lapseCount: 0,
            consecutivePasses: 0,
            isWeak: true,
            updatedAt: new Date().toISOString(),
          });
          transaction.oncomplete = () => { db.close(); resolve(); };
          transaction.onerror = () => reject(transaction.error);
        };
      });
    });
    await page.reload();
    const blocked = page.locator(".review-blocked-notice");
    await expect(blocked).toBeVisible();
    await expect(blocked).toContainText("另有 1 张卡片因复习算法版本不兼容已暂时隔离");
    await expect(blocked.getByRole("link", { name: "打开数据设置导出数据" })).toHaveAttribute("href", "/settings/data");
    await expect(page.locator(".answer-options")).toBeVisible();
    await expect(page.locator(".weak-points")).toContainText("连续遗忘两次的卡片会出现在这里。");
    await page.goto("/settings/data");
    await page.getByRole("button", { name: "导出 JSON 备份" }).click();
    await expect(page.locator(".export-preview")).toContainText("复习卡 1 张");
    await expect(page.locator(".export-preview")).toContainText("其中 1 张算法版本待兼容");
    await page.goto("/");
    await expect(page.locator(".stats-card .stat-main strong")).toHaveText("00");
    await expect(page.locator(".today-tasks .primary-button")).toHaveAttribute("href", /\/learn\//);
  });

  test("八卦排列题按初爻到上爻逐步作答", async ({ page }) => {
    await page.goto("/review");
    await expect(
      page.getByRole("heading", { name: "先回忆，再打开答案。" }),
    ).toBeVisible();
    await page.evaluate(async () => {
      const today = new Date().toLocaleDateString("sv-SE");
      await new Promise<void>((resolve, reject) => {
        const request = indexedDB.open("yijing-local");
        request.onerror = () => reject(request.error);
        request.onblocked = () => reject(new Error("排列题测试被 IndexedDB 连接阻塞"));
        request.onsuccess = () => {
          const db = request.result;
          const transaction = db.transaction("reviewCardStates", "readwrite");
          transaction.objectStore("reviewCardStates").put({
            cardId: "trigram-arrange-lines-qian",
            targetType: "trigram",
            targetId: "qian",
            stepIndex: 0,
            dueDate: today,
            lapseCount: 0,
            consecutivePasses: 0,
            isWeak: false,
            updatedAt: new Date().toISOString(),
          });
          transaction.oncomplete = () => {
            db.close();
            resolve();
          };
          transaction.onerror = () => reject(transaction.error);
        };
      });
    });
    await page.reload();
    await expect(page.getByText("按从下往上排列乾的三爻")).toBeVisible();
    const yang = page.getByRole("button", { name: "阳爻", exact: true });
    await yang.click();
    await yang.click();
    await yang.click();
    await page.getByRole("button", { name: "检查排列" }).click();
    await expect(page.getByText("答案正确")).toBeVisible();
  });

  test("五行工具可以切换元素并显示相生相克", async ({ page }) => {
    await page.goto("/tools/five-elements");
    const elementWheel = page.locator(".element-wheel");
    await elementWheel.getByRole("button", { name: "木", exact: true }).click();
    await expect(
      page.getByRole("heading", { name: "木 · 生发、条达" }),
    ).toBeVisible();
    await expect(page.getByText("相生：木生火。相克：木克土。"))
      .toBeVisible();
    await expect(page.getByText("相生方向：木是施生方，火是受生方；本工具只用于记忆关系方向。"))
      .toBeVisible();
    await expect(page.getByText("相克方向：木是施克方，土是受克方；本工具只用于记忆关系方向。"))
      .toBeVisible();
    const explanations = page.locator(".element-relation-explanations");
    await expect(explanations).toHaveAttribute("role", "status");
    await expect(explanations).toHaveAttribute("aria-live", "polite");
    await expect(explanations).toHaveAttribute("aria-atomic", "true");
    for (const relation of [
      ["木", "火", "土"],
      ["火", "土", "金"],
      ["土", "金", "水"],
      ["金", "水", "木"],
      ["水", "木", "火"],
    ] as const) {
      await elementWheel.getByRole("button", { name: relation[0], exact: true }).click();
      await expect(page.getByText(`相生方向：${relation[0]}是施生方，${relation[1]}是受生方；本工具只用于记忆关系方向。`)).toBeVisible();
      await expect(page.getByText(`相克方向：${relation[0]}是施克方，${relation[2]}是受克方；本工具只用于记忆关系方向。`)).toBeVisible();
    }
    await elementWheel.getByRole("button", { name: "木", exact: true }).click();
    await page.getByRole("button", { name: "相生", exact: true }).click();
    await expect(page.getByText("当前元素 · 相生")).toBeVisible();
    await expect(page.getByText("相生方向：木是施生方，火是受生方；本工具只用于记忆关系方向。"))
      .toBeVisible();
    await expect(page.getByText("相克方向：木是施克方，土是受克方；本工具只用于记忆关系方向。"))
      .toHaveCount(0);
    await page.getByRole("button", { name: "相克", exact: true }).click();
    await expect(page.getByText("当前元素 · 相克")).toBeVisible();
    await expect(page.getByText("相生方向：木是施生方，火是受生方；本工具只用于记忆关系方向。"))
      .toHaveCount(0);
    await expect(page.getByText("相克方向：木是施克方，土是受克方；本工具只用于记忆关系方向。"))
      .toBeVisible();
  });

  test("五行工具可以从上下文链接恢复指定元素", async ({ page }) => {
    await page.goto("/tools/five-elements?element=fire");
    await expect(page.getByRole("heading", { name: "火 · 温热、明亮" })).toBeVisible();
    await expect(page.locator(".element-wheel > button.selected")).toContainText("火");
  });

  test("数据设置页显示备份与导入入口", async ({ page }) => {
    await page.goto("/settings/data");
    await expect(
      page.getByRole("button", { name: "导出 JSON 备份" }),
    ).toBeVisible();
    await expect(page.getByText("选择备份文件")).toBeVisible();
    await expect(page.getByText("清空本地数据")).toBeVisible();
  });

  test("没有来源模板时清空结果不会误报模板已清理", async ({ page }) => {
    await page.goto("/settings/data");
    await expect(page.getByRole("heading", { name: "你的学习数据，由你保管。" })).toBeVisible();
    await page.evaluate(() => localStorage.removeItem("yijing:source-template:v1"));
    page.once("dialog", (dialog) => {
      expect(dialog.message()).not.toContain("来源模板");
      void dialog.accept("清空易境");
    });
    await page.getByRole("button", { name: "清空本地数据" }).click();
    await expect(
      page.getByText("已清空本地学习数据。建议重新导入备份或从一个知识点开始。", { exact: true }),
    ).toBeVisible();
  });

  test("AI 辅学默认关闭并先展示本地发送预览", async ({ page }) => {
    await page.goto("/settings/ai");
    await expect(
      page.getByRole("heading", { name: "先决定哪些内容可以被看见。" }),
    ).toBeVisible();
    await expect(page.getByText(/默认关闭，不会发送任何数据/)).toBeVisible();
    await page.getByLabel("允许使用 AI 辅学").check();
    await page.getByLabel("我选定的笔记").check();
    await page.getByRole("button", { name: "生成本地发送预览" }).click();
    await expect(page.locator(".ai-request-preview")).toContainText("尚未发送");
    await expect(page.locator(".ai-request-preview")).toContainText(
      "all-local-database-records",
    );
    await expect(page.getByText(/尚未发送任何数据/)).toBeVisible();
    await page.getByText("查看本地审阅演示", { exact: true }).click();
    const draftReview = page.locator(".ai-draft-review");
    await expect(
      draftReview.getByRole("heading", { name: "审阅草稿，再决定是否接受。" }),
    ).toBeVisible();
    await expect(draftReview).toContainText("易境项目自编基础内容");
    await expect(draftReview).toContainText("我选定的笔记");
    await expect(draftReview).toContainText(
      "AI 辅助，仅供学习，不替代原典或程序结果",
    );
    await draftReview.getByRole("button", { name: "进入编辑" }).click();
    await expect(
      draftReview.getByRole("textbox", { name: "AI 草稿文本" }),
    ).toBeFocused();
    await expect(draftReview.getByRole("status")).toContainText("编辑中");
    await draftReview
      .getByRole("textbox", { name: "AI 草稿文本" })
      .fill("AI 辅助学习草稿：编辑后回到来源核对。");
    await draftReview.getByRole("button", { name: "接受编辑后的草稿" }).click();
    await expect(draftReview).toContainText("已接受");
    await expect(draftReview).toContainText("编辑后回到来源核对");
    await draftReview.getByRole("button", { name: "重置审阅" }).click();
    await expect(draftReview).toContainText("待审阅");
    await page.getByRole("button", { name: "撤销 AI 授权并清除范围" }).click();
    await expect(page.getByRole("status")).toContainText("AI 授权已撤销");
    await expect(page.getByLabel("允许使用 AI 辅学")).not.toBeChecked();
  });

  test("笔记 Markdown 预览支持基础结构并阻止危险链接", async ({ page }) => {
    await page.goto("/hexagrams/1");
    await page
      .getByRole("textbox", { name: "个人笔记" })
      .fill(
        "# 结构观察\n\n- 上卦\n- 下卦\n\n[安全链接](https://example.com/notes)\n[HTTP 链接](http://example.com/notes)\n[无效邮箱](mailto:not-an-address)\n[危险链接](javascript:alert(1))",
      );
    const preview = page.locator(".note-preview");
    await expect(preview).toContainText("结构观察");
    await expect(preview.locator("li")).toHaveCount(2);
    await expect(preview.locator("a")).toHaveCount(1);
    await expect(preview.locator("a")).toHaveAttribute(
      "href",
      "https://example.com/notes",
    );
    await expect(preview).toContainText("[HTTP 链接](http://example.com/notes)");
    await expect(preview).toContainText("[无效邮箱](mailto:not-an-address)");
    await expect(preview).toContainText("[危险链接](javascript:alert(1))");
  });

  test("学习偏好可以保存主题、字号和复习上限", async ({ page }) => {
    await page.goto("/settings/preferences");
    await page.getByLabel("主题").selectOption("dark");
    await page.getByLabel("字号").selectOption("large");
    await page.getByLabel("每日新卡上限").selectOption("5");
    await page.getByLabel("每组复习上限").selectOption("10");
    await expect(page.locator(".preference-impact")).toContainText("每天最多加入 5 张未开始新卡；每组最多展示 10 张");
    await expect(page.locator(".preference-availability")).toContainText("当前内置内容仅提供简体版");
    await expect(page.getByRole("status")).toContainText("设置已保存");
    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
    await expect(page.locator("html")).toHaveAttribute(
      "data-font-scale",
      "large",
    );
    await page.reload();
    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
    await expect(page.getByLabel("每组复习上限")).toHaveValue("10");
    await page.getByLabel("主题").selectOption("system");
    await page.emulateMedia({ colorScheme: "dark" });
    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  });

  test("深色主题为主要内容和导航提供深色语义表面", async ({ page }) => {
    await page.goto("/settings/preferences");
    await page.getByLabel("主题").selectOption("dark");
    await expect(page.getByRole("status")).toContainText("设置已保存");
    await page.goto("/");
    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
    await expect(page.getByRole("heading", { name: "把看过的，变成会用的。" })).toBeVisible();
    const colors = await page.evaluate(() => {
      const read = (selector: string) => {
        const element = document.querySelector(selector);
        if (!element) return null;
        const style = getComputedStyle(element);
        return { background: style.backgroundColor, color: style.color };
      };
      return {
        body: read("body"),
        navigation: read(".main-nav a.active"),
        hero: read(".hero-card"),
        task: read(".today-tasks"),
      };
    });
    expect(colors.body?.background).toBe("rgb(33, 31, 29)");
    expect(colors.navigation?.background).not.toBe("rgb(233, 225, 215)");
    expect(colors.hero?.background).toBe("rgb(57, 51, 46)");
    expect(colors.task?.background).toBe("rgb(57, 51, 46)");
  });

  test("核心阅读正文和笔记输入保持可读字号", async ({ page }) => {
    await page.goto("/learn/five-elements");
    await expect(page.locator(".subpage-lead")).toBeVisible();
    await expect(page.locator(".note-editor textarea")).toBeVisible();
    await expect(
      page.getByRole("complementary", { name: "学习关系" }).getByRole("link", { name: /下一节：八卦结构/ }),
    ).toHaveAttribute("href", "/learn/trigrams");
    const learningSizes = await page.evaluate(() =>
      [".subpage-lead", ".content-block .note-preview p", ".note-editor textarea"].map((selector) => {
        const element = document.querySelector(selector);
        return element ? Number.parseFloat(getComputedStyle(element).fontSize) : 0;
      }),
    );
    expect(learningSizes.every((size) => size >= 16), `实际字号：${learningSizes.join(", ")}`).toBe(true);

    await page.goto("/lab/hexagram");
    const labLeadSize = await page.locator(".subpage-lead").evaluate((element) => Number.parseFloat(getComputedStyle(element).fontSize));
    expect(labLeadSize).toBeGreaterThanOrEqual(16);
  });

  test("手机宽度核心页面没有横向溢出", async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 800 });
    await page.goto("/hexagrams/1");
    const widths = await page.evaluate(() => ({
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
    }));
    expect(widths.scrollWidth).toBeLessThanOrEqual(widths.clientWidth);
  });

  test("断网时显示提示且保留本地学习说明", async ({ page, context }) => {
    test.setTimeout(120_000);
    await page.goto("/", { waitUntil: "domcontentloaded" });
    await context.setOffline(true);
    await expect(page.getByRole("status").filter({ hasText: "当前处于离线状态" })).toBeVisible();
    await context.setOffline(false);
    await expect(page.getByRole("status").filter({ hasText: "当前处于离线状态" })).toHaveCount(0);
  });

  test("核心交互可用键盘完成", async ({ page }) => {
    await page.goto("/#lab");
    const movingChip = page
      .locator(".position-chips")
      .getByRole("button", { name: "1爻" });
    await movingChip.focus();
    await page.keyboard.press("Enter");
    await expect(movingChip).toHaveAttribute("aria-pressed", "true");
    await page.goto("/review");
    const firstAnswer = page.locator(".answer-options button").first();
    await firstAnswer.focus();
    await page.keyboard.press("Enter");
    await expect(page.getByText("这次回忆感觉如何？")).toBeVisible();
    const remembered = page.getByRole("button", { name: "记得" });
    await remembered.focus();
    await page.keyboard.press("Enter");
    await expect(
      page.getByRole("button", { name: /下一题|查看复习总结/ }),
    ).toBeVisible();
  });

  test("八卦详情可以记录内容勘误", async ({ page }) => {
    await page.goto("/trigrams/qian");
    await expect(page.getByLabel("学习状态：未开始")).toBeVisible();
    await expect(page.getByRole("heading", { name: "乾 · 天" })).toBeVisible();
    await page.getByText("记录内容疑问或勘误").click();
    await page.getByLabel("描述").fill("测试记录：请核对乾卦的基础字段来源。");
    await page.getByRole("button", { name: "保存记录" }).click();
    await expect(page.getByText("本地记录 · 1 条")).toBeVisible();
    await expect(page.getByText("测试记录：请核对乾卦的基础字段来源。")).toBeVisible();
  });

  test.describe("勘误并发跨页面隔离", () => {
    // This flow edits IndexedDB directly in a second page and does not test
    // the Service Worker. Blocking it prevents a long-lived worker from
    // competing with WebKit's multi-page startup during the full suite.
    test.use({ serviceWorkers: "block" });

    test("勘误状态切换不会覆盖其他标签页的最新内容", async ({ page, context }) => {
    test.setTimeout(120_000);
    // This flow only needs the document response and the rendered heading.
    // Waiting for DOMContentLoaded can hang in WebKit when a service-worker
    // startup races with IndexedDB initialization, even though the page is
    // already usable. Use the commit boundary and an explicit UI marker.
    await page.goto("/trigrams/qian", { waitUntil: "commit" });
    await expect(page.getByRole("heading", { name: "乾 · 天" })).toBeVisible();
    await page.getByText("记录内容疑问或勘误").click();
    await page.getByLabel("描述").fill("初始勘误描述");
    await page.getByRole("button", { name: "保存记录" }).click();
    const erratum = page.locator(".content-errata article").filter({ hasText: "初始勘误描述" });
    await expect(erratum).toBeVisible();

    const otherPage = await context.newPage();
    try {
      await otherPage.goto("/trigrams/qian", { waitUntil: "commit" });
      await expect(otherPage.getByRole("heading", { name: "乾 · 天" })).toBeVisible();
      await otherPage.evaluate(async () => {
        await new Promise<void>((resolve, reject) => {
          const request = indexedDB.open("yijing-local");
          request.onerror = () => reject(request.error);
          request.onblocked = () => reject(new Error("勘误并发测试被 IndexedDB 连接阻塞"));
          request.onsuccess = () => {
            const db = request.result;
            const transaction = db.transaction("errata", "readwrite");
            const store = transaction.objectStore("errata");
            const getAll = store.getAll();
            getAll.onerror = () => reject(getAll.error);
            getAll.onsuccess = () => {
              const record = getAll.result.find(
                (item: { targetType?: string; targetId?: string; description?: string }) =>
                  item.targetType === "trigram" &&
                  item.targetId === "qian" &&
                  item.description === "初始勘误描述",
              ) as {
                history?: { status: string; at: string }[];
                [key: string]: unknown;
              } | undefined;
              if (!record) {
                reject(new Error("勘误并发测试缺少记录"));
                return;
              }
              store.put({
                ...record,
                description: "另一标签页更新后的疑问",
                sourceRef: "另一标签页底本",
                updatedAt: new Date().toISOString(),
              });
            };
            transaction.oncomplete = () => {
              db.close();
              resolve();
            };
            transaction.onerror = () => reject(transaction.error);
          };
        });
      });
      await erratum.getByRole("button", { name: "标记已处理" }).click();
      await expect(
        page
          .locator(".content-errata article")
          .filter({ hasText: "另一标签页更新后的疑问" })
          .getByRole("button", { name: "恢复待处理" }),
      ).toBeVisible();
      await page.reload();
      const updated = page.locator(".content-errata article").filter({
        hasText: "另一标签页更新后的疑问",
      });
      await expect(updated).toHaveCount(1);
      await expect(updated).toContainText("另一标签页更新后的疑问");
      await expect(updated).toContainText("另一标签页底本");
      await expect(updated).toContainText("状态历史 · 2 条");
      await expect(updated.getByRole("button", { name: "恢复待处理" })).toBeVisible();
    } finally {
      await otherPage.close();
    }
    });
  });

  test("数据备份导入先显示预览再确认", async ({ page }) => {
    // Start from a v1-shaped IndexedDB to verify that Dexie upgrades all later stores.
    await page.goto("/favicon.ico", {
      // The favicon is only a same-origin execution context for the IndexedDB
      // fixture; waiting for its full document lifecycle can hang in WebKit
      // while the static response is already available.
      waitUntil: "commit",
      timeout: 30_000,
    });
    await page.evaluate(async () => {
      await new Promise<void>((resolve, reject) => {
        const deletion = indexedDB.deleteDatabase("yijing-local");
        deletion.onsuccess = () => resolve();
        deletion.onerror = () => reject(deletion.error);
        deletion.onblocked = () =>
          reject(new Error("database deletion was blocked"));
      });
      await new Promise<void>((resolve, reject) => {
        const request = indexedDB.open("yijing-local", 1);
        request.onupgradeneeded = () => {
          const db = request.result;
          db.createObjectStore("notes", { keyPath: "id" });
          db.createObjectStore("reviewAttempts", { keyPath: "id" });
          db.createObjectStore("reviewCardStates", { keyPath: "cardId" });
          db.createObjectStore("conceptProgress", { keyPath: "conceptId" });
        };
        request.onsuccess = () => {
          const db = request.result;
          db.close();
          resolve();
        };
        request.onerror = () => reject(request.error);
        request.onblocked = () => reject(new Error("备份迁移测试被 IndexedDB 连接阻塞"));
      });
    });
    await page.goto("/settings/data");
    const backup = JSON.stringify({
      format: "yijing-local-backup",
      schemaVersion: 1,
      data: {
        notes: [],
        reviewAttempts: [],
        reviewCardStates: [
          {
            cardId: "fixture-card",
            targetType: "concept",
            targetId: "yin-yang-lines",
            stepIndex: 0,
            dueDate: "2026-08-26",
            lapseCount: 0,
            consecutivePasses: 0,
            isWeak: false,
            updatedAt: "2026-08-26T00:00:00.000Z",
          },
        ],
        conceptProgress: [
          {
            conceptId: "yin-yang-lines",
            status: "learning",
            masteryScore: 10,
            updatedAt: "2026-08-26T00:00:00.000Z",
          },
        ],
        favorites: [],
        preferences: [
          {
            key: "sessionBatchSize",
            value: 10,
            updatedAt: "2026-08-26T00:00:00.000Z",
          },
        ],
      },
    });
    await page.locator('input[type="file"]').setInputFiles({
      name: "backup.json",
      mimeType: "application/json",
      buffer: Buffer.from(backup),
    });
    await expect(page.getByText("导入摘要", { exact: true })).toBeVisible();
    await expect(
      page.getByText(/1 张复习卡 · 1 条学习进度 · 0 个收藏 · 1 项偏好/),
    ).toBeVisible();
    await expect(
      page.getByRole("table", { name: "导入冲突处理摘要" }),
    ).toContainText("复习卡");
    await page.getByRole("button", { name: "确认合并" }).click();
    await expect(page.getByText(/已合并备份/)).toBeVisible();
    const migratedState = await page.evaluate(async () => {
      return await new Promise<{ algorithmVersion?: number; consecutiveForgets?: number; hasRecoverySnapshots: boolean } | undefined>((resolve, reject) => {
        const request = indexedDB.open("yijing-local");
        request.onerror = () => reject(request.error);
        request.onblocked = () => reject(new Error("复习卡连续遗忘字段迁移读取被 IndexedDB 连接阻塞"));
        request.onsuccess = () => {
          const db = request.result;
          const transaction = db.transaction("reviewCardStates", "readonly");
          const get = transaction.objectStore("reviewCardStates").get("fixture-card");
          get.onsuccess = () => {
            const result = get.result;
            const hasRecoverySnapshots = db.objectStoreNames.contains("recoverySnapshots");
            db.close();
            resolve({ ...result, hasRecoverySnapshots });
          };
          get.onerror = () => reject(get.error);
        };
      });
    });
    expect(migratedState).toMatchObject({ algorithmVersion: 1, consecutiveForgets: 0, hasRecoverySnapshots: true });
  });

  test("备份导入后按作答历史重建缺失的掌握度", async ({ page }) => {
    await page.goto("/settings/data");
    await expect(page.getByRole("heading", { name: "你的学习数据，由你保管。" })).toBeVisible();
    const backup = JSON.stringify({
      format: "yijing-local-backup",
      schemaVersion: 1,
      data: {
        reviewAttempts: [{
          id: "import-progress-attempt",
          cardId: "stem-element-jia",
          exerciseVersion: 1,
          targetType: "concept",
          promptSnapshot: "天干甲的五行是什么？",
          answerSnapshot: "木",
          objectiveCorrect: true,
          reviewMode: "spaced",
          hintUsed: false,
          recallGrade: "remembered",
          reviewedAt: "2026-08-28T08:00:00.000Z",
          localDate: "2026-08-28",
        }],
        reviewCardStates: [{
          cardId: "stem-element-jia",
          targetType: "concept",
          targetId: "heavenly-stems",
          algorithmVersion: 1,
          stepIndex: 1,
          dueDate: "2026-08-31",
          lastReviewedAt: "2026-08-28T08:00:00.000Z",
          lapseCount: 0,
          consecutivePasses: 1,
          isWeak: false,
          updatedAt: "2026-08-28T08:00:00.000Z",
        }],
      },
    });
    await page.locator('input[type="file"]').setInputFiles({
      name: "progress-rebuild.json",
      mimeType: "application/json",
      buffer: Buffer.from(backup),
    });
    await expect(page.getByText("导入摘要", { exact: true })).toBeVisible();
    await page.getByRole("button", { name: "确认合并" }).click();
    await expect(page.getByText(/掌握度已按作答历史重算/)).toBeVisible();
    const progress = await page.evaluate(async () => {
      return await new Promise<{ conceptId: string; masteryScore: number; status: string } | undefined>((resolve, reject) => {
        const request = indexedDB.open("yijing-local");
        request.onerror = () => reject(request.error);
        request.onblocked = () => reject(new Error("掌握度重建测试读取被 IndexedDB 连接阻塞"));
        request.onsuccess = () => {
          const db = request.result;
          const transaction = db.transaction("conceptProgress", "readonly");
          const get = transaction.objectStore("conceptProgress").get("heavenly-stems");
          get.onsuccess = () => { db.close(); resolve(get.result); };
          get.onerror = () => reject(get.error);
        };
      });
    });
    expect(progress).toMatchObject({ conceptId: "heavenly-stems", masteryScore: 75, status: "reviewing" });
  });

  test("数据备份确认时按最新本地快照重算摘要", async ({ page }) => {
    await page.goto("/settings/data");
    await expect(page.getByRole("heading", { name: "你的学习数据，由你保管。" })).toBeVisible();
    await page.evaluate(async () => {
      await new Promise<void>((resolve, reject) => {
        const request = indexedDB.open("yijing-local");
        request.onerror = () => reject(request.error);
        request.onblocked = () => reject(new Error("导入摘要竞态测试被 IndexedDB 连接阻塞"));
        request.onsuccess = () => {
          const db = request.result;
          const transaction = db.transaction("notes", "readwrite");
          transaction.objectStore("notes").put({
            id: "import-summary-race-note",
            targetType: "hexagram",
            targetId: "hexagram-01",
            markdown: "导入摘要竞态测试",
            tags: [],
            sourceRefs: [],
            createdAt: "2026-08-01T00:00:00.000Z",
            updatedAt: "2026-08-01T00:00:00.000Z",
          });
          transaction.oncomplete = () => {
            db.close();
            resolve();
          };
          transaction.onerror = () => reject(transaction.error);
        };
      });
    });
    const backup = JSON.stringify({
      format: "yijing-local-backup",
      schemaVersion: 1,
      data: {
        notes: [{
          id: "import-summary-race-note",
          targetType: "hexagram",
          targetId: "hexagram-01",
          markdown: "备份中的较新内容",
          tags: [],
          sourceRefs: [],
          createdAt: "2026-08-01T00:00:00.000Z",
          updatedAt: "2026-08-02T00:00:00.000Z",
        }],
      },
    });
    await page.locator('input[type="file"]').setInputFiles({
      name: "import-summary-race.json",
      mimeType: "application/json",
      buffer: Buffer.from(backup),
    });
    await expect(page.getByText("导入摘要", { exact: true })).toBeVisible();
    await expect(page.getByRole("table", { name: "导入冲突处理摘要" })).toContainText("笔记");

    // Simulate another tab saving a newer version after the preview was made.
    await page.evaluate(async () => {
      await new Promise<void>((resolve, reject) => {
        const request = indexedDB.open("yijing-local");
        request.onerror = () => reject(request.error);
        request.onblocked = () => reject(new Error("导入摘要竞态测试写入被 IndexedDB 连接阻塞"));
        request.onsuccess = () => {
          const db = request.result;
          const transaction = db.transaction("notes", "readwrite");
          const store = transaction.objectStore("notes");
          const getRequest = store.get("import-summary-race-note");
          getRequest.onerror = () => reject(getRequest.error);
          getRequest.onsuccess = () => {
            const note = getRequest.result;
            store.put({ ...note, markdown: "另一标签页的最新内容", updatedAt: "2026-08-03T00:00:00.000Z" });
          };
          transaction.oncomplete = () => {
            db.close();
            resolve();
          };
          transaction.onerror = () => reject(transaction.error);
        };
      });
    });
    await page.getByRole("button", { name: "确认合并" }).click();
    await expect(page.getByText(/已合并备份：新增 0 条、更新 0 条、跳过 1 条（含同 ID 冲突）。掌握度已按作答历史重算。/, { exact: true })).toBeVisible();
  });

  test("超过七天未导出时在数据设置页显示备份提醒", async ({ page }) => {
    // WebKit can take longer to finish loading the IndexedDB-backed settings
    // route under a full parallel production run. The assertion below waits
    // for the heading and status, so DOM readiness is the relevant boundary.
    test.setTimeout(60_000);
    await page.goto("/settings/data", {
      waitUntil: "domcontentloaded",
      timeout: 60_000,
    });
    await expect(page.getByRole("heading", { name: "你的学习数据，由你保管。" })).toBeVisible();
    await page.evaluate(async () => {
      await new Promise<void>((resolve, reject) => {
        const request = indexedDB.open("yijing-local");
        request.onsuccess = () => {
          const db = request.result;
          const transaction = db.transaction("preferences", "readwrite");
          transaction.objectStore("preferences").put({
            key: "lastExportAt",
            value: new Date(Date.now() - 8 * 24 * 60 * 60 * 1000).toISOString(),
            updatedAt: new Date().toISOString(),
          });
          transaction.oncomplete = () => {
            db.close();
            resolve();
          };
          transaction.onerror = () => reject(transaction.error);
        };
        request.onerror = () => reject(request.error);
        request.onblocked = () => reject(new Error("备份提醒测试被 IndexedDB 连接阻塞"));
      });
    });
    await page.reload();
    await expect(page.getByRole("status")).toContainText("距上次备份已超过 8 天");
  });

  test("导入坏文件不会改动已有本地数据", async ({ page }) => {
    await page.goto("/hexagrams/1");
    const note = page.locator(".note-editor").last();
    const noteField = note.getByRole("textbox", { name: "个人笔记" });
    await noteField.fill("坏文件演练前的本地笔记");
    await noteField.blur();
    await expect(note).toContainText(/已保存于/);

    await page.goto("/settings/data");
    await page.locator('input[type="file"]').setInputFiles({
      name: "broken-backup.json",
      mimeType: "application/json",
      buffer: Buffer.from(
        JSON.stringify({
          format: "yijing-local-backup",
          schemaVersion: 1,
          data: { notes: [{ id: "broken-note" }] },
        }),
      ),
    });
    await expect(page.getByText(/导入失败/)).toBeVisible();
    await page.goto("/hexagrams/1");
    await expect(
      page.getByRole("textbox", { name: "个人笔记" }).last(),
    ).toHaveValue("坏文件演练前的本地笔记");
  });

  test("导入校验和不匹配的备份不会改动已有本地数据", async ({ page }) => {
    await page.goto("/hexagrams/1");
    const note = page.locator(".note-editor").last();
    const noteField = note.getByRole("textbox", { name: "个人笔记" });
    await noteField.fill("校验和演练前的本地笔记");
    await noteField.blur();
    await expect(note).toContainText(/已保存于/);

    await page.goto("/settings/data");
    await page.getByRole("button", { name: "导出 JSON 备份" }).click();
    await expect(page.getByText("导出范围预览", { exact: true })).toBeVisible();
    const downloadPromise = page.waitForEvent("download");
    await page.getByRole("button", { name: "确认导出" }).click();
    const download = await downloadPromise;
    const backupPath = await download.path();
    expect(backupPath).not.toBeNull();
    const backup = JSON.parse(await readFile(backupPath!, "utf8")) as {
      data: { notes: Array<{ markdown: string }> };
      checksum: string;
    };
    backup.data.notes[0].markdown = "传输中被意外修改";

    await page.locator('input[type="file"]').setInputFiles({
      name: "tampered-backup.json",
      mimeType: "application/json",
      buffer: Buffer.from(JSON.stringify(backup)),
    });
    await expect(page.getByText(/校验和不匹配/)).toBeVisible();
    await page.goto("/hexagrams/1");
    await expect(
      page.getByRole("textbox", { name: "个人笔记" }).last(),
    ).toHaveValue("校验和演练前的本地笔记");
  });

  test("结构完整但存在孤立引用的备份不会改动已有本地数据", async ({ page }) => {
    await gotoDatabasePage(page, "/hexagrams/1");
    const note = page.locator(".note-editor").last();
    const noteField = note.getByRole("textbox", { name: "个人笔记" });
    await noteField.fill("孤立引用演练前的本地笔记");
    await noteField.blur();
    await expect(note).toContainText(/已保存于/);

    await page.goto("/settings/data");
    await page.locator('input[type="file"]').setInputFiles({
      name: "orphan-reference-backup.json",
      mimeType: "application/json",
      buffer: Buffer.from(JSON.stringify({
        format: "yijing-local-backup",
        schemaVersion: 1,
        data: {
          notes: [{
            id: "orphan-note",
            targetType: "hexagram",
            targetId: "hexagram-99",
            markdown: "不应导入",
            tags: [],
            sourceRefs: [],
            createdAt: "2026-08-26T00:00:00.000Z",
            updatedAt: "2026-08-26T00:00:00.000Z",
          }],
        },
      })),
    });
    await expect(page.getByText(/导入失败/)).toBeVisible();
    await gotoDatabasePage(page, "/hexagrams/1");
    await expect(
      page.getByRole("textbox", { name: "个人笔记" }).last(),
    ).toHaveValue("孤立引用演练前的本地笔记");
  });

  test("可以完成一次导出、清空、导入恢复演练", async ({ page }) => {
    await page.goto("/hexagrams/1");
    const mainNote = page.locator(".note-editor").last();
    const noteField = mainNote.getByRole("textbox", { name: "个人笔记" });
    await noteField.fill("恢复演练用笔记");
    await noteField.blur();
    await expect(mainNote).toContainText(/已保存于/);
    const errata = page.locator(".content-errata");
    await errata.getByText("记录内容疑问或勘误", { exact: true }).click();
    await errata.getByLabel("描述").fill("备份恢复时也要保留这条勘误。");
    await errata.getByRole("button", { name: "保存记录" }).click();
    await expect(
      errata.getByText("备份恢复时也要保留这条勘误。"),
    ).toBeVisible();
    await page.goto("/tools/compass");
    await page.getByLabel("手动输入角度（0°=北，顺时针）").fill("45");
    await page.getByLabel("记录标题").fill("备份坐向");
    await page.getByLabel("环境备注").fill("用于恢复演练");
    await page.getByRole("button", { name: "保存当前坐向" }).click();
    await expect(page.getByText("已保存 东北 · 45.0°")).toBeVisible();
    await page.getByLabel("传感器修正角（-180° 至 +180°）").fill("12.5");
    await page.getByRole("button", { name: "应用并记录" }).click();
    await expect(page.getByText("已应用手动修正 +12.5°", { exact: false })).toBeVisible();
    await page.goto("/settings/data");
    await page.getByRole("button", { name: "导出 JSON 备份" }).click();
    await expect(page.getByText("导出范围预览", { exact: true })).toBeVisible();
    await expect(page.locator(".export-preview")).toContainText(
      "不会导出经典正文",
    );
    await expect(page.locator(".export-preview")).toContainText("来源模板");
    const downloadPromise = page.waitForEvent("download");
    await page.getByRole("button", { name: "确认导出" }).click();
    const download = await downloadPromise;
    const backupPath = await download.path();
    expect(backupPath).not.toBeNull();
    await page.evaluate(() => {
      localStorage.setItem(
        "yijing:source-template:v1",
        JSON.stringify({
          version: 1,
          copiedAt: "2026-08-30T08:00:00.000Z",
          sourceRef: { label: "恢复演练来源", kind: "book" },
        }),
      );
    });
    page.once("dialog", (dialog) => {
      expect(dialog.message()).toContain("1 个来源模板");
      void dialog.accept("清空易境");
    });
    await page.getByRole("button", { name: "清空本地数据" }).click();
    await expect(
      page.getByText("已清空本地学习数据", { exact: false }),
    ).toBeVisible();
    await expect
      .poll(() => page.evaluate(() => localStorage.getItem("yijing:source-template:v1")))
      .toBeNull();
    await page.locator('input[type="file"]').setInputFiles(backupPath!);
    await expect(page.getByText("导入摘要", { exact: true })).toBeVisible();
    await page.getByRole("button", { name: "确认合并" }).click();
    await expect(page.getByText(/已合并备份/)).toBeVisible();
    await page.goto("/hexagrams/1");
    await expect(
      page.getByRole("textbox", { name: "个人笔记" }).last(),
    ).toHaveValue("恢复演练用笔记");
    await expect(
      page.locator(".content-errata").getByText("备份恢复时也要保留这条勘误。"),
    ).toBeVisible();
    await page.goto("/tools/compass");
    await expect(
      page
        .getByRole("region", { name: "坐向记录" })
        .getByText("备份坐向", { exact: true }),
    ).toBeVisible();
    const correction = page.getByRole("region", { name: "罗盘手动偏差修正" });
    await correction.getByText(/查看最近修正历史/).click();
    await expect(correction).toContainText("12.5° · 用户手动修正");

    // A successful merge keeps one local pre-merge snapshot so the user can
    // undo an accidental overwrite without depending on a downloaded file.
    const replacementBackup = JSON.stringify({
      format: "yijing-local-backup",
      schemaVersion: 1,
      appVersion: "0.1.0",
      contentVersion: "seed-1",
      exportedAt: "2026-08-29T00:00:00.000Z",
      data: {
        notes: [{
          id: "hexagram:hexagram-01",
          targetType: "hexagram",
          targetId: "hexagram-01",
          markdown: "导入覆盖后的笔记",
          tags: [],
          sourceRefs: [],
          createdAt: "2099-01-01T00:00:00.000Z",
          updatedAt: "2099-01-01T00:00:00.000Z",
        }],
        reviewAttempts: [],
        reviewCardStates: [],
        conceptProgress: [],
        favorites: [],
        preferences: [],
        labSnapshots: [],
        errata: [],
        compassRecords: [],
        compassCorrections: [],
      },
    });
    await page.goto("/settings/data");
    await page.locator('input[type="file"]').setInputFiles({
      name: "replacement-backup.json",
      mimeType: "application/json",
      buffer: Buffer.from(replacementBackup),
    });
    await expect(page.getByText("导入摘要", { exact: true })).toBeVisible();
    await page.getByRole("button", { name: "确认合并" }).click();
    await expect(page.getByText(/已合并备份/)).toBeVisible();
    await page.goto("/hexagrams/1");
    await expect(page.getByRole("textbox", { name: "个人笔记" }).last()).toHaveValue("导入覆盖后的笔记");
    await page.goto("/settings/data");
    const undoImport = page.getByRole("button", { name: "撤销最近一次导入" });
    await expect(undoImport).toBeVisible();
    await undoImport.click();
    await expect(page.getByText("已撤销最近一次导入，数据恢复到导入前状态。", { exact: true })).toBeVisible();
    await page.goto("/hexagrams/1");
    await expect(page.getByRole("textbox", { name: "个人笔记" }).last()).toHaveValue("恢复演练用笔记");
  });
});
