import { spawn, spawnSync } from "node:child_process";
import { createServer } from "node:net";
import process from "node:process";

const project = process.env.CONTAINER_COMPOSE_PROJECT ?? `yijing-test-${process.pid}`;
const hostPort = process.env.CONTAINER_PORT ?? await findFreePort();
const healthTimeoutMs = Number(process.env.CONTAINER_HEALTH_TIMEOUT_MS ?? 90_000);
const smokeTimeoutMs = Number(process.env.SMOKE_TIMEOUT_MS ?? 30_000);
const composeEnv = {
  ...process.env,
  YIJING_PORT: String(hostPort),
  YIJING_BIND: "127.0.0.1",
  YIJING_DB_CONTAINER: `${project}-db`,
  YIJING_CONTAINER: `${project}-app`,
};

function findFreePort() {
  return new Promise((resolve, reject) => {
    const probe = createServer();
    probe.once("error", reject);
    probe.listen(0, "127.0.0.1", () => {
      const address = probe.address();
      const port = address && typeof address === "object" ? address.port : undefined;
      probe.close((error) => error ? reject(error) : resolve(port));
    });
  });
}

function runDocker(args, options = {}) {
  const result = spawnSync("docker", args, { encoding: "utf8", stdio: "inherit", ...options });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`docker ${args.join(" ")} 失败（退出码 ${result.status ?? 1}）`);
}

function compose(args, options = {}) {
  runDocker(["compose", "--project-name", project, ...args], options);
}

function dockerAvailable() {
  return spawnSync("docker", ["version", "--format", "{{.Server.Version}}"], { stdio: ["ignore", "pipe", "pipe"] }).status === 0;
}

function appContainerId() {
  const result = spawnSync("docker", ["compose", "--project-name", project, "ps", "-q", "yijing"], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], env: composeEnv });
  return result.status === 0 ? result.stdout.trim() : "";
}

function inspectHealth() {
  const id = appContainerId();
  if (!id) return "";
  const result = spawnSync("docker", ["inspect", "--format", "{{.State.Health.Status}}", id], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
  return result.status === 0 ? result.stdout.trim() : "";
}

async function waitForHealthy() {
  const deadline = Date.now() + healthTimeoutMs;
  let last = "not-found";
  while (Date.now() < deadline) {
    last = inspectHealth() || last;
    if (last === "healthy") return;
    if (last === "unhealthy") throw new Error("应用容器 HEALTHCHECK 返回 unhealthy");
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error(`应用容器在 ${healthTimeoutMs}ms 内未变为 healthy（最后状态：${last}）`);
}

async function runSmoke() {
  const child = spawn(process.execPath, ["scripts/smoke-production.mjs"], {
    stdio: "inherit",
    env: { ...process.env, SMOKE_BASE_URL: `http://127.0.0.1:${hostPort}`, SMOKE_TIMEOUT_MS: String(smokeTimeoutMs) },
  });
  const code = await new Promise((resolve, reject) => {
    child.once("error", reject);
    child.once("exit", (exitCode, signal) => signal ? reject(new Error(`生产冒烟被信号 ${signal} 终止`)) : resolve(exitCode ?? 1));
  });
  if (code !== 0) throw new Error(`生产冒烟失败（退出码 ${code}）`);
}

async function runAccountDataCheck() {
  const baseUrl = `http://127.0.0.1:${hostPort}`;
  const email = `container-${process.pid}-${Date.now()}@example.com`;
  const password = "container-test-password";
  const registration = await fetch(`${baseUrl}/api/auth/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: baseUrl },
    body: JSON.stringify({ email, password, displayName: "容器验收" }),
  });
  if (registration.status !== 201) throw new Error(`账户注册验收失败（HTTP ${registration.status}）`);
  const cookieValues = typeof registration.headers.getSetCookie === "function"
    ? registration.headers.getSetCookie()
    : [registration.headers.get("set-cookie") ?? ""];
  const cookie = cookieValues.map((value) => value.split(";", 1)[0]).filter(Boolean).join("; ");
  if (!cookie) throw new Error("账户注册验收未返回会话 Cookie");
  const me = await fetch(`${baseUrl}/api/auth/me`, { headers: { Cookie: cookie } });
  if (me.status !== 200 || !(await me.json()).user?.email) throw new Error("账户会话验收失败");
  const record = { id: `container-note-${process.pid}`, targetType: "concept", targetId: "yin-yang-lines", title: "容器验收", markdown: "PostgreSQL OK", tags: [], sourceRefs: [], createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
  const write = await fetch(`${baseUrl}/api/data`, {
    method: "PUT",
    headers: { "Content-Type": "application/json", Origin: baseUrl, Cookie: cookie },
    body: JSON.stringify({ table: "notes", key: record.id, record }),
  });
  if (write.status !== 200) throw new Error(`账户数据写入验收失败（HTTP ${write.status}）`);
  const read = await fetch(`${baseUrl}/api/data?table=notes`, { headers: { Cookie: cookie } });
  const payload = await read.json();
  if (read.status !== 200 || !payload.records?.some((item) => item.id === record.id && item.markdown === record.markdown)) throw new Error("账户数据读取验收失败");
  await fetch(`${baseUrl}/api/auth/logout`, { method: "POST", headers: { Cookie: cookie } });
}

if (!dockerAvailable()) throw new Error("Docker daemon 不可用，请先启动 Docker 并重试");
let failed = false;
let containerStarted = false;
try {
  compose(["down", "--volumes", "--remove-orphans"], { stdio: ["ignore", "pipe", "pipe"], env: composeEnv });
  compose(["build"], { env: composeEnv });
  compose(["up", "-d"], { env: composeEnv });
  containerStarted = true;
  await waitForHealthy();
  await runSmoke();
  await runAccountDataCheck();
  console.log(`容器验收通过：PostgreSQL + 易境应用，健康状态 healthy，账户与数据 API 通过，端口 ${hostPort}`);
} catch (error) {
  failed = true;
  console.error(error instanceof Error ? error.message : error);
  if (containerStarted) {
    try { compose(["logs", "--no-color", "yijing"], { stdio: ["ignore", "pipe", "pipe"], env: composeEnv }); } catch { /* best effort */ }
  }
} finally {
  try { compose(["down", "--volumes", "--remove-orphans"], { stdio: ["ignore", "pipe", "pipe"], env: composeEnv }); } catch { /* best effort */ }
}
if (failed) process.exitCode = 1;
