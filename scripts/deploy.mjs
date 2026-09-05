import { spawnSync } from "node:child_process";
import process from "node:process";

const image = process.env.YIJING_IMAGE ?? "yijing-app:local";
const container = process.env.YIJING_CONTAINER ?? "yijing-app";
const hostPort = normalizePort(process.env.YIJING_PORT, 3000);
const bindAddress = process.env.YIJING_BIND ?? "0.0.0.0";
const buildTimeoutMs = positiveNumber(process.env.DEPLOY_BUILD_TIMEOUT_MS, 900_000);
const healthTimeoutMs = positiveNumber(process.env.DEPLOY_HEALTH_TIMEOUT_MS, 60_000);
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
  if (!/^[a-zA-Z0-9][a-zA-Z0-9_.-]*$/.test(value)) {
    throw new Error(`${label}包含不安全字符：${value}`);
  }
}

function assertSafeImageReference(value) {
  if (!/^[a-zA-Z0-9][a-zA-Z0-9_./:@-]*$/.test(value) || value.includes("..")) {
    throw new Error(`镜像名包含不安全字符：${value}`);
  }
}

function runDocker(args, options = {}) {
  const result = spawnSync("docker", args, {
    encoding: "utf8",
    stdio: options.stdio ?? "inherit",
    timeout: options.timeout,
    env: options.env,
  });
  if (result.error?.code === "ETIMEDOUT") {
    throw new Error(`docker ${args.join(" ")} 超过 ${options.timeout}ms 执行预算`);
  }
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`docker ${args.join(" ")} 失败（退出码 ${result.status ?? 1}）`);
  }
  return result.stdout?.trim() ?? "";
}

function dockerAvailable() {
  const result = spawnSync("docker", ["version", "--format", "{{.Server.Version}}"], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  return result.status === 0;
}

function containerExists() {
  const result = spawnSync("docker", ["container", "inspect", container], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  return result.status === 0;
}

function removeExistingContainer() {
  if (!containerExists()) return;
  console.log(`移除旧容器：${container}`);
  runDocker(["rm", "--force", container], { timeout: 20_000 });
}

function containerHealth() {
  const result = spawnSync(
    "docker",
    ["inspect", "--format", "{{.State.Health.Status}}", container],
    { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] },
  );
  return result.status === 0 ? result.stdout.trim() : "";
}

async function waitForHealthy() {
  const deadline = Date.now() + healthTimeoutMs;
  let lastStatus = "starting";
  while (Date.now() < deadline) {
    lastStatus = containerHealth() || lastStatus;
    if (lastStatus === "healthy") return;
    if (lastStatus === "unhealthy") throw new Error("容器健康检查失败");
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error(`容器在 ${healthTimeoutMs}ms 内未通过健康检查（最后状态：${lastStatus}）`);
}

function printLogs() {
  const result = spawnSync("docker", ["logs", container], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  const output = [result.stdout, result.stderr].filter((value) => value?.trim()).join("\n");
  if (output) console.error(output.trim());
}

async function main() {
  assertSafeImageReference(image);
  assertSafeIdentifier(container, "容器名");
  if (!/^\S+$/.test(bindAddress)) throw new Error("YIJING_BIND 不能为空或包含空白字符");
  if (!dockerAvailable()) throw new Error("Docker daemon 不可用，请先启动 Docker Desktop 或 Docker 服务");

  if (!skipBuild) {
    console.log(`构建镜像：${image}`);
    runDocker(["build", "--tag", image, "."], {
      timeout: buildTimeoutMs,
      env: { ...process.env, DOCKER_BUILDKIT: process.env.DOCKER_BUILDKIT ?? "1" },
    });
  } else {
    console.log(`跳过构建，复用镜像：${image}`);
  }

  removeExistingContainer();
  runDocker([
    "run",
    "--detach",
    "--init",
    "--restart",
    "unless-stopped",
    "--name",
    container,
    "--publish",
    `${bindAddress}:${hostPort}:3000`,
    "--security-opt",
    "no-new-privileges:true",
    "--cap-drop",
    "ALL",
    "--tmpfs",
    "/tmp:rw,noexec,nosuid,size=64m",
    image,
  ]);

  try {
    await waitForHealthy();
  } catch (error) {
    printLogs();
    console.error(`健康检查失败，清理失败容器：${container}`);
    try {
      runDocker(["rm", "--force", container], { timeout: 20_000 });
    } catch (cleanupError) {
      console.error(cleanupError instanceof Error ? cleanupError.message : cleanupError);
    }
    throw error;
  }

  console.log("易境已部署并通过健康检查：");
  console.log(`  地址：http://127.0.0.1:${hostPort}`);
  console.log(`  容器：${container}`);
  console.log(`  镜像：${image}`);
  console.log(`  停止：docker rm --force ${container}`);
}

try {
  await main();
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
}
