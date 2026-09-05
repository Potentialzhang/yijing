import { spawn } from "node:child_process";
import process from "node:process";

const host = process.env.LOCAL_TEST_HOST ?? "127.0.0.1";
const port = normalizePort(process.env.LOCAL_TEST_PORT, 3000);
const startupTimeoutMs = positiveNumber(process.env.LOCAL_TEST_STARTUP_TIMEOUT_MS, 120_000);
const npm = process.platform === "win32" ? "npm.cmd" : "npm";

function positiveNumber(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function normalizePort(value, fallback) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 && parsed <= 65_535 ? parsed : fallback;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForReady() {
  const deadline = Date.now() + startupTimeoutMs;
  let lastError = "尚未连接";
  while (Date.now() < deadline) {
    if (child.exitCode !== null) {
      throw new Error(`本地测试服务提前退出（退出码：${child.exitCode ?? "无"}）`);
    }
    try {
      const response = await fetch(`http://${host}:${port}/api/health`);
      if (response.ok) return;
      lastError = `HTTP ${response.status}`;
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
    }
    await sleep(500);
  }
  throw new Error(`本地测试服务在 ${startupTimeoutMs}ms 内未就绪（${lastError}）`);
}

const child = spawn(npm, ["run", "dev", "--", "--hostname", host, "--port", String(port)], {
  stdio: "inherit",
  env: { ...process.env, NEXT_TELEMETRY_DISABLED: "1" },
});

let shuttingDown = false;
let childExit = null;
const childExited = new Promise((resolve) => {
  child.once("exit", (code, signal) => {
    childExit = { code, signal };
    resolve(childExit);
  });
});
function stop(signal) {
  if (shuttingDown) return;
  shuttingDown = true;
  if (child.exitCode === null) child.kill(signal);
}

process.once("SIGINT", () => stop("SIGINT"));
process.once("SIGTERM", () => stop("SIGTERM"));

try {
  await Promise.race([
    waitForReady(),
    childExited.then(({ code, signal }) => {
      throw new Error(`本地测试服务提前退出（退出码：${code ?? "无"}，信号：${signal ?? "无"}）`);
    }),
  ]);
  console.log(`\n本地测试环境已就绪：http://${host}:${port}`);
  console.log("可在另一个终端运行：npm run test:e2e 或 npm run test:smoke");
  console.log("按 Ctrl-C 停止本地测试服务。\n");
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  stop("SIGTERM");
  process.exitCode = 1;
}

await new Promise((resolve) => {
  const finish = ({ code, signal }) => {
    if (signal && !shuttingDown) process.exitCode = 1;
    else if (code !== null && code !== 0 && process.exitCode === undefined) process.exitCode = code;
    resolve();
  };
  if (childExit) finish(childExit);
  else childExited.then(finish);
});
