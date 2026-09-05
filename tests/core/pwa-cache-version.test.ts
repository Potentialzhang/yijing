import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(join(process.cwd(), path), "utf8");

describe("PWA 缓存版本契约", () => {
  it("Service Worker、冒烟检查和 E2E 断言使用同一当前版本", () => {
    const serviceWorker = read("public/sw.js");
    const cacheVersion = serviceWorker.match(/const CACHE_NAME = "yijing-static-v(\d+)"/)?.[1];
    expect(cacheVersion).toBeTruthy();
    const cacheVersionNumber = Number(cacheVersion);

    const currentCache = `yijing-static-v${cacheVersion}`;
    expect(read("scripts/smoke-production.mjs")).toContain(currentCache);
    expect(read("tests/e2e/core.spec.ts")).toContain(currentCache);
    expect(read("tests/e2e/pwa.spec.ts")).toContain(currentCache);
    expect(read("docs/README.md")).toContain(`当前 Service Worker 为 v${cacheVersion}`);
    expect(read("docs/02-技术设计与数据规范.md")).toContain(`当前缓存版本 \`yijing-static-v${cacheVersion}\``);
    expect(read("docs/03-开发路线图与任务清单.md")).toContain(`当前缓存版本 v${cacheVersion}`);
    expect(read("docs/04-M0发布说明与已知限制.md")).toContain(`当前缓存版本为 \`yijing-static-v${cacheVersion}\``);
    expect(read("docs/05-外部验收与内容交接模板.md")).toContain(
      `Service Worker v${cacheVersionNumber} 安装/升级（确认 v${cacheVersionNumber - 1} 旧缓存清理）`,
    );
  });

  it("缓存升级回归明确覆盖当前版本的上一版本清理", () => {
    const serviceWorker = read("public/sw.js");
    const cacheVersion = Number(serviceWorker.match(/const CACHE_NAME = "yijing-static-v(\d+)"/)?.[1]);
    expect(Number.isInteger(cacheVersion)).toBe(true);
    expect(cacheVersion).toBeGreaterThan(1);

    const previousCache = `yijing-static-v${cacheVersion - 1}`;
    const pwaSpec = read("tests/e2e/pwa.spec.ts");
    expect(pwaSpec).toContain(previousCache);
    expect(pwaSpec).toContain(`.not.toContain("${previousCache}")`);
    expect(serviceWorker).toContain("event.waitUntil(cacheSuccessfulResponse(event.request, response))");
    expect(serviceWorker).toContain("cacheSuccessfulResponse(event.request, response, { navigation: true })");
  });
});
