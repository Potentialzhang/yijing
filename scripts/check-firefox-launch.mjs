import process from "node:process";
import { firefox } from "@playwright/test";

const executablePath = process.env.PLAYWRIGHT_FIREFOX_EXECUTABLE_PATH;
const requestedTimeout = Number(process.env.FIREFOX_LAUNCH_TIMEOUT_MS ?? 15_000);
const timeoutMs = Number.isFinite(requestedTimeout) && requestedTimeout > 0
  ? requestedTimeout
  : 15_000;
let browser;
try {
  browser = await firefox.launch({
    headless: true,
    timeout: timeoutMs,
    ...(executablePath ? { executablePath } : {}),
  });
  await browser.close();
  console.log("Firefox 启动预检通过");
} catch (error) {
  if (browser) await browser.close().catch(() => undefined);
  console.error(
    `Firefox 启动预检失败（预算 ${timeoutMs}ms）：${error instanceof Error ? error.message : String(error)}`,
  );
  process.exitCode = 1;
}
