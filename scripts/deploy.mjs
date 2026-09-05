import { spawnSync } from "node:child_process";
import process from "node:process";

const image = process.env.YIJING_IMAGE ?? "yijing-app:local";
const container = process.env.YIJING_CONTAINER ?? "yijing-app";
const hostPort = normalizePort(process.env.YIJING_PORT, 3000);
const bindAddress = process.env.YIJING_BIND ?? "0.0.0.0";
const project = process.env.DEPLOY_COMPOSE_PROJECT ?? "yijing";
const buildTimeoutMs = positiveNumber(process.env.DEPLOY_BUILD_TIMEOUT_MS, 900_000);
const healthTimeoutMs = positiveNumber(process.env.DEPLOY_HEALTH_TIMEOUT_MS, 90_000);
const skipBuild = process.env.DEPLOY_SKIP_BUILD === "1";

function positiveNumber(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function normalizePort(value, fallback) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 && parsed <= 65_535 ? parsed : fallback;
}

function assertSafeIdentifier(value, label) {
  if (!/^[a-zA-Z0-9][a-zA-Z0-9_.-]*$/.test(value)) throw new Error(`${label}包含不安全字符：${value}`);
}

function assertSafeImageReference(value) {
  if (!/^[a-zA-Z0-9][a-zA-Z0-9_./:@-]*$/.test(value) || value.includes("..")) throw new Error(`镜像名包含不安全字符：${value}`);
}

const composeEnv = {
  ...process.env,
  YIJING_IMAGE: image,
  YIJING_CONTAINER: container,
  YIJING_PORT: String(hostPort),
  YIJING_BIND: bindAddress,
  YIJING_DB_CONTAINER: process.env.YIJING_DB_CONTAINER ?? `${container}-db`,
};

function runCompose(args, options = {}) {
  const result = spawnSync("docker", ["compose", "--project-name", project, ...args], {
    encoding: "utf8",
    stdio: options.stdio ?? "inherit",
    timeout: options.timeout,
    env: composeEnv,
  });
  if (result.error?.code === "ETIMEDOUT") throw new Error(`docker compose ${args.join(" ")} 超过 ${options.timeout}ms 执行预算`);
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`docker compose ${args.join(" ")} 失败（退出码 ${result.status ?? 1}）`);
  return result.stdout?.trim() ?? "";
}

function dockerAvailable() {
  return spawnSync("docker", ["version", "--format", "{{.Server.Version}}"], { stdio: ["ignore", "pipe", "pipe"] }).status === 0;
}

function appContainerId() {
  const result = spawnSync("docker", ["compose", "--project-name", project, "ps", "-q", "yijing"], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], env: composeEnv });
  return result.status === 0 ? result.stdout.trim() : "";
}

function containerHealth() {
  const id = appContainerId();
  if (!id) return "";
  const result = spawnSync("docker", ["inspect", "--format", "{{.State.Health.Status}}", id], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
  return result.status === 0 ? result.stdout.trim() : "";
}

async function waitForHealthy() {
  const deadline = Date.now() + healthTimeoutMs;
  let lastStatus = "starting";
  while (Date.now() < deadline) {
    lastStatus = containerHealth() || lastStatus;
    if (lastStatus === "healthy") return;
    if (lastStatus === "unhealthy") throw new Error("应用容器健康检查失败");
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error(`容器在 ${healthTimeoutMs}ms 内未通过健康检查（最后状态：${lastStatus}）`);
}

function printLogs() {
  try { runCompose(["logs", "--no-color", "yijing"], { stdio: ["ignore", "pipe", "pipe"], timeout: 20_000 }); } catch { /* best effort */ }
}

async function main() {
  assertSafeImageReference(image);
  assertSafeIdentifier(container, "容器名");
  assertSafeIdentifier(composeEnv.YIJING_DB_CONTAINER, "数据库容器名");
  if (!/^\S+$/.test(bindAddress)) throw new Error("YIJING_BIND 不能为空或包含空白字符");
  if (!dockerAvailable()) throw new Error("Docker daemon 不可用，请先启动 Docker Desktop 或 Docker 服务");

  console.log(`${skipBuild ? "启动" : "构建并启动"} PostgreSQL + 易境 Compose 服务…`);
  runCompose(["up", "-d", ...(skipBuild ? [] : ["--build"])], { timeout: buildTimeoutMs });
  try {
    await waitForHealthy();
  } catch (error) {
    printLogs();
    throw error;
  }
  console.log("易境已部署并通过健康检查：");
  console.log(`  地址：http://127.0.0.1:${hostPort}`);
  console.log(`  局域网：http://电脑局域网IP:${hostPort}`);
  console.log(`  应用容器：${container}`);
  console.log(`  数据库容器：${composeEnv.YIJING_DB_CONTAINER}`);
  console.log(`  停止：docker compose --project-name ${project} down`);
}

try {
  await main();
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
}
