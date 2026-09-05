import { spawn, spawnSync } from "node:child_process";
import { createServer } from "node:net";
import process from "node:process";

const image = process.env.CONTAINER_IMAGE ?? "yijing-app:local";
const container = process.env.CONTAINER_NAME ?? `yijing-app-container-${process.pid}`;
const configuredHostPort = process.env.CONTAINER_PORT;
const healthTimeoutMs = Number(process.env.CONTAINER_HEALTH_TIMEOUT_MS ?? 60_000);
const smokeTimeoutMs = Number(process.env.SMOKE_TIMEOUT_MS ?? 30_000);
const buildTimeoutMs = Number(process.env.CONTAINER_BUILD_TIMEOUT_MS ?? 900_000);
const skipBuild = process.env.CONTAINER_SKIP_BUILD === "1";
const buildKitEnabled = process.env.CONTAINER_BUILDKIT !== "0";

function positiveNumber(value, fallback) {
  return Number.isFinite(value) && value > 0 ? value : fallback;
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
          reject(new Error("无法分配容器验收端口"));
          return;
        }
        resolve(port);
      });
    });
  });
}

const normalizedPort = configuredHostPort === undefined
  ? await findFreePort()
  : Math.trunc(positiveNumber(Number(configuredHostPort), 3200));
const normalizedHealthTimeout = positiveNumber(healthTimeoutMs, 60_000);
const normalizedSmokeTimeout = positiveNumber(smokeTimeoutMs, 30_000);
const normalizedBuildTimeout = positiveNumber(buildTimeoutMs, 900_000);
const cleanupTimeoutMs = positiveNumber(
  Number(process.env.CONTAINER_CLEANUP_TIMEOUT_MS ?? 10_000),
  10_000,
);
let containerStarted = false;

function runDocker(args, options = {}) {
  const commandTimeout = options.timeout ?? normalizedBuildTimeout;
  const result = spawnSync("docker", args, {
    encoding: "utf8",
    stdio: options.stdio ?? "inherit",
    timeout: commandTimeout,
    ...options,
  });
  if (result.error?.code === "ETIMEDOUT") {
    throw new Error(`docker ${args.join(" ")} 超过 ${commandTimeout}ms 执行预算`);
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

function resolveBuildBackend() {
  if (!buildKitEnabled) return "legacy";
  const result = spawnSync("docker", ["buildx", "version"], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  if (result.status === 0) return "buildkit";
  console.warn("Docker buildx 不可用，容器构建回退到 legacy builder；安装 buildx 后会自动优先使用 BuildKit。");
  return "legacy";
}

function inspectHealth() {
  const result = spawnSync(
    "docker",
    ["inspect", "--format", "{{.State.Health.Status}}", container],
    { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] },
  );
  return result.status === 0 ? result.stdout.trim() : "";
}

function assertNonRootImage() {
  const configuredUser = runDocker(
    ["image", "inspect", "--format", "{{.Config.User}}", image],
    { stdio: ["ignore", "pipe", "pipe"] },
  );
  if (!configuredUser || configuredUser === "0" || configuredUser === "root") {
    throw new Error(`镜像 ${image} 的默认用户不安全：${configuredUser || "未声明"}`);
  }
}

function terminateContainer() {
  const result = spawnSync("docker", ["rm", "--force", container], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    timeout: cleanupTimeoutMs,
  });
  // `--rm` makes this idempotent when Docker already removed the container.
  return result.status === 0 || result.status === 1;
}

function handleTermination(signal) {
  // Signal handlers do not run the async `finally` block if the process is
  // terminated immediately. Remove the explicitly named container first so
  // an interrupted local/CI run cannot leave a server behind.
  terminateContainer();
  process.exit(signal === "SIGINT" ? 130 : 143);
}

process.once("SIGINT", () => handleTermination("SIGINT"));
process.once("SIGTERM", () => handleTermination("SIGTERM"));

async function waitForHealthy() {
  const deadline = Date.now() + normalizedHealthTimeout;
  let lastState = "not-found";
  while (Date.now() < deadline) {
    lastState = inspectHealth() || lastState;
    if (lastState === "healthy") return;
    if (lastState === "unhealthy") {
      throw new Error("容器 Docker HEALTHCHECK 返回 unhealthy");
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error(`容器在 ${normalizedHealthTimeout}ms 内未变为 healthy（最后状态：${lastState}）`);
}

async function runSmoke() {
  const child = spawn(
    process.execPath,
    ["scripts/smoke-production.mjs"],
    {
      stdio: "inherit",
      env: {
        ...process.env,
        SMOKE_BASE_URL: `http://127.0.0.1:${normalizedPort}`,
        SMOKE_TIMEOUT_MS: String(normalizedSmokeTimeout),
      },
    },
  );
  const exitCode = await new Promise((resolve, reject) => {
    child.once("error", reject);
    child.once("exit", (code, signal) => {
      if (signal) reject(new Error(`生产冒烟被信号 ${signal} 终止`));
      else resolve(code ?? 1);
    });
  });
  if (exitCode !== 0) throw new Error(`生产冒烟失败（退出码 ${exitCode}）`);
}

async function main() {
  if (!dockerAvailable()) {
    throw new Error("Docker daemon 不可用，请先启动 Docker 并重试");
  }
  const buildBackend = skipBuild ? "skipped" : resolveBuildBackend();
  // Remove a stale container with the same explicit name before starting.
  terminateContainer();
  if (!skipBuild) {
    runDocker(["build", "--tag", image, "."], {
      timeout: normalizedBuildTimeout,
      env: {
        ...process.env,
        DOCKER_BUILDKIT: buildBackend === "buildkit" ? "1" : "0",
      },
    });
  }
  assertNonRootImage();
  runDocker([
    "run",
    "--detach",
    "--rm",
    "--name",
    container,
    "--publish",
    `127.0.0.1:${normalizedPort}:3000`,
    image,
  ]);
  containerStarted = true;
  await waitForHealthy();
  await runSmoke();
  console.log(`容器验收通过：${image}，健康状态 healthy，端口 ${normalizedPort}`);
}

let failed = false;
try {
  await main();
} catch (error) {
  failed = true;
  console.error(error instanceof Error ? error.message : error);
  if (containerStarted) {
    const logs = spawnSync("docker", ["logs", container], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
    if (logs.stdout?.trim()) console.error(logs.stdout.trim());
    if (logs.stderr?.trim()) console.error(logs.stderr.trim());
  }
} finally {
  terminateContainer();
}

if (failed) process.exitCode = 1;
