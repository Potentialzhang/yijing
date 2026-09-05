import { existsSync } from "node:fs";
import { execFileSync, spawn, spawnSync } from "node:child_process";
import { createServer } from "node:net";
import process from "node:process";

if (!existsSync(".next/BUILD_ID")) {
  console.error("未找到生产构建产物，请先运行 npm run build");
  process.exit(1);
}

const executable = process.platform === "win32"
  ? "./node_modules/.bin/playwright.cmd"
  : "./node_modules/.bin/playwright";
const projectIndex = process.argv.findIndex((argument) => argument === "--project" || argument.startsWith("--project="));
const projectArg = projectIndex === -1
  ? undefined
  : process.argv[projectIndex] === "--project"
    ? process.argv[projectIndex + 1]
    : process.argv[projectIndex].slice("--project=".length);
// WebKit's macOS process model can slow a long, database-heavy suite under
// workstation load. Give that suite a larger overall budget while keeping
// the per-test timeout and controlled retries unchanged; Firefox keeps the
// shorter default so a browser startup regression is reported promptly.
const defaultTimeoutMs = projectArg === "webkit" ? 300_000 : 180_000;
const requestedTimeoutMs = Number(process.env.PRODUCTION_E2E_TIMEOUT_MS ?? defaultTimeoutMs);
const timeoutMs = Number.isFinite(requestedTimeoutMs) && requestedTimeoutMs > 0
  ? requestedTimeoutMs
  : defaultTimeoutMs;
const requestedLaunchTimeout = Number(process.env.FIREFOX_LAUNCH_TIMEOUT_MS ?? 15_000);
const launchTimeoutMs = Number.isFinite(requestedLaunchTimeout) && requestedLaunchTimeout > 0
  ? requestedLaunchTimeout
  : 15_000;
// The child preflight owns the browser launch timeout. The parent only needs
// to outlive it long enough to receive the diagnostic, while remaining finite
// for malformed or unexpectedly large environment values.
const preflightTimeoutMs = Math.min(Math.max(20_000, launchTimeoutMs + 5_000), 120_000);

if (projectArg === "firefox") {
  const preflight = spawnSync(
    process.execPath,
    ["scripts/check-firefox-launch.mjs"],
    {
      env: process.env,
      stdio: "inherit",
      timeout: preflightTimeoutMs,
    },
  );
  if (preflight.error || preflight.status !== 0) {
    const reason = preflight.error?.code === "ETIMEDOUT"
      ? `超过 ${preflightTimeoutMs}ms 启动预算`
      : `退出码 ${preflight.status ?? 1}`;
    console.error(`Firefox 生产 E2E 前置检查失败（${reason}）。请安装稳定版 Firefox，或设置 PLAYWRIGHT_FIREFOX_EXECUTABLE_PATH 指向可用的稳定版可执行文件。`);
    process.exit(1);
  }
}
function listeningPids(port) {
  if (process.platform === "win32") return new Set();
  try {
    return new Set(
      execFileSync("lsof", [`-tiTCP:${port}`, "-sTCP:LISTEN"], {
        encoding: "utf8",
        stdio: ["ignore", "pipe", "ignore"],
      })
        .split(/\s+/)
        .filter(Boolean)
        .map(Number),
    );
  } catch {
    return new Set();
  }
}

function findFreePort() {
  return new Promise((resolve, reject) => {
    const probe = createServer();
    probe.once("error", reject);
    probe.listen(0, "127.0.0.1", () => {
      const address = probe.address();
      const port = address && typeof address === "object" ? address.port : undefined;
      probe.close((error) => {
        if (error) {
          reject(error);
          return;
        }
        if (!port) {
          reject(new Error("无法分配生产 E2E 端口"));
          return;
        }
        resolve(port);
      });
    });
  });
}

const configuredPort = process.env.YIJING_PRODUCTION_PORT;
const parsedConfiguredPort = Number(configuredPort);
const productionPort = configuredPort === undefined
  ? await findFreePort()
  : Number.isInteger(parsedConfiguredPort) && parsedConfiguredPort > 0 && parsedConfiguredPort <= 65_535
    ? parsedConfiguredPort
    : 3000;
const productionEnv = {
  ...process.env,
  YIJING_PRODUCTION_HOST: "127.0.0.1",
  YIJING_PRODUCTION_PORT: String(productionPort),
};
const initialServerPids = listeningPids(productionPort);

function cleanupNewServers() {
  for (const pid of listeningPids(productionPort)) {
    if (initialServerPids.has(pid) || pid === process.pid) continue;
    try {
      process.kill(pid, "SIGTERM");
    } catch {
      // The server may have exited during Playwright cleanup.
    }
  }
}

const child = spawn(executable, [
  "test",
  "--config=playwright.production.config.ts",
  ...process.argv.slice(2),
], {
  stdio: "inherit",
  // Keep the selected project available to the config file as well as to the
  // Playwright CLI. This lets WebKit receive its larger navigation budget and
  // keeps project filtering/timeout policy consistent for all entry points.
  env: {
    ...productionEnv,
    YIJING_PRODUCTION_E2E: "1",
    ...(projectArg ? { PLAYWRIGHT_PROD_BROWSER: projectArg } : {}),
  },
  detached: process.platform !== "win32",
});

let timedOut = false;
const timer = setTimeout(() => {
  timedOut = true;
  console.error(`生产 E2E 超过 ${timeoutMs}ms，正在终止测试进程。`);
  terminate("SIGTERM");
  setTimeout(() => {
    terminate("SIGKILL");
    cleanupNewServers();
    setTimeout(cleanupNewServers, 1_000);
  }, 1_000);
}, timeoutMs);

function terminate(signal) {
  if (child.pid && process.platform !== "win32") {
    try {
      process.kill(-child.pid, signal);
      return;
    } catch {
      // The process may have exited before cleanup.
    }
  }
  child.kill(signal);
}

process.on("SIGINT", () => terminate("SIGINT"));
process.on("SIGTERM", () => terminate("SIGTERM"));
child.on("error", (error) => {
  clearTimeout(timer);
  console.error(`无法启动生产 E2E：${error.message}`);
  process.exitCode = 1;
});
child.on("exit", (code, signal) => {
  clearTimeout(timer);
  cleanupNewServers();
  if (timedOut) {
    process.exitCode = 124;
    return;
  }
  if (signal) {
    process.exitCode = 1;
    return;
  }
  process.exitCode = code ?? 1;
});
