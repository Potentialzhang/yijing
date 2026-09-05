import { spawn, spawnSync } from "node:child_process";
import { execFileSync } from "node:child_process";
import process from "node:process";

const requestedTestTimeout = Number(process.env.FIREFOX_TEST_TIMEOUT_MS ?? 120_000);
const timeoutMs = Number.isFinite(requestedTestTimeout) && requestedTestTimeout > 0
  ? requestedTestTimeout
  : 120_000;
const requestedLaunchTimeout = Number(process.env.FIREFOX_LAUNCH_TIMEOUT_MS ?? 15_000);
const launchTimeoutMs = Number.isFinite(requestedLaunchTimeout) && requestedLaunchTimeout > 0
  ? requestedLaunchTimeout
  : 15_000;
// Leave a small amount of room for the preflight process to report the
// Playwright error after Firefox's own launch budget expires. Keep the parent
// guard finite even when an accidental environment value is very large.
const preflightTimeoutMs = Math.min(Math.max(20_000, launchTimeoutMs + 5_000), 120_000);
const executable = process.platform === "win32"
  ? "./node_modules/.bin/playwright.cmd"
  : "./node_modules/.bin/playwright";
const args = ["test", "--project=firefox", ...process.argv.slice(2)];

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
  console.error(`Firefox 开发态 E2E 前置检查失败（${reason}）。请安装稳定版 Firefox，或设置 PLAYWRIGHT_FIREFOX_EXECUTABLE_PATH 指向可用的稳定版可执行文件。`);
  process.exit(1);
}

function listeningPids() {
  try {
    return new Set(
      execFileSync("lsof", ["-tiTCP:3000", "-sTCP:LISTEN"], {
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

const initialServerPids = listeningPids();

const child = spawn(executable, args, {
  stdio: "inherit",
  env: process.env,
  detached: process.platform !== "win32",
});

function terminateProcessGroup(signal) {
  if (child.pid && process.platform !== "win32") {
    try {
      process.kill(-child.pid, signal);
      return;
    } catch {
      // The process may have exited between the timeout and the cleanup call.
    }
  }
  child.kill(signal);
}

function cleanupNewDevServers() {
  for (const pid of listeningPids()) {
    if (initialServerPids.has(pid) || pid === process.pid) continue;
    try {
      process.kill(pid, "SIGTERM");
    } catch {
      // The server may have exited during Playwright cleanup.
    }
  }
}

let timedOut = false;
const timer = setTimeout(() => {
  timedOut = true;
  console.error(`Firefox 测试超过 ${timeoutMs}ms，正在终止浏览器进程。`);
  terminateProcessGroup("SIGTERM");
  setTimeout(() => {
    terminateProcessGroup("SIGKILL");
    cleanupNewDevServers();
  }, 1_000);
}, timeoutMs);

child.on("error", (error) => {
  clearTimeout(timer);
  console.error(`无法启动 Firefox 测试：${error.message}`);
  process.exitCode = 1;
});

child.on("exit", (code, signal) => {
  clearTimeout(timer);
  if (timedOut) {
    process.exitCode = 124;
    return;
  }
  process.exitCode = signal ? 1 : code ?? 1;
});
