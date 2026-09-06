import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { createServer } from "node:net";
import process from "node:process";

const host = process.env.SMOKE_HOST ?? "127.0.0.1";
const timeoutMs = Number(process.env.SMOKE_TIMEOUT_MS ?? 30_000);

function positiveNumber(value, fallback) {
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

const normalizedTimeoutMs = positiveNumber(timeoutMs, 30_000);

function parsePort(value, fallback = 3100) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 && parsed <= 65_535 ? parsed : fallback;
}

function findFreePort(bindHost) {
  return new Promise((resolve, reject) => {
    const probe = createServer();
    probe.once("error", reject);
    probe.listen(0, bindHost, () => {
      const address = probe.address();
      const port = address && typeof address === "object" ? address.port : undefined;
      probe.close((error) => {
        if (error) {
          reject(error);
          return;
        }
        if (!port) {
          reject(new Error("无法分配生产冒烟端口"));
          return;
        }
        resolve(port);
      });
    });
  });
}

// A caller-provided base URL or port is an explicit contract. Otherwise use
// an ephemeral local port so smoke checks can run beside another local
// server without a hidden 3100 collision.
const port = process.env.SMOKE_BASE_URL
  ? parsePort(process.env.SMOKE_PORT)
  : process.env.SMOKE_PORT === undefined
    ? await findFreePort(host)
    : parsePort(process.env.SMOKE_PORT);
const baseUrl = process.env.SMOKE_BASE_URL ?? `http://${host}:${port}`;
const routes = [
  { path: "/", status: 200 },
  { path: "/learn", status: 200 },
  { path: "/learn/yin-yang-lines", status: 200 },
  { path: "/lab/hexagram", status: 200 },
  { path: "/hexagrams", status: 200 },
  { path: "/hexagrams/1", status: 200 },
  { path: "/trigrams", status: 200 },
  { path: "/trigrams/qian", status: 200 },
  { path: "/review", status: 200 },
  { path: "/self-test", status: 200 },
  { path: "/review/session", status: 200 },
  { path: "/notes", status: 200 },
  { path: "/notes/draft", status: 200 },
  { path: "/api/ai/study", status: 200, contentType: "application/json" },
  { path: "/stats", status: 200 },
  { path: "/tools/trigrams", status: 200 },
  { path: "/tools/five-elements", status: 200 },
  { path: "/tools/sexagenary-relations", status: 200 },
  { path: "/tools/hetu-luoshu", status: 200 },
  { path: "/tools/calendar", status: 200 },
  { path: "/tools/compass", status: 200 },
  { path: "/settings", status: 200 },
  { path: "/settings/content", status: 200 },
  { path: "/settings/data", status: 200 },
  { path: "/settings/preferences", status: 200 },
  { path: "/settings/ai", status: 200 },
  { path: "/account", status: 200 },
  { path: "/manifest.webmanifest", status: 200 },
  { path: "/sw.js", status: 200 },
  { path: "/icon.svg", status: 200, contentType: "image/svg+xml" },
  { path: "/icon-192.png", status: 200, contentType: "image/png" },
  { path: "/icon-512.png", status: 200, contentType: "image/png" },
  { path: "/this-route-does-not-exist", status: 404 },
];

let server;
let ownsServer = false;

function terminateServer(signal = "SIGTERM") {
  if (!server?.pid) return;
  if (process.platform !== "win32") {
    try {
      process.kill(-server.pid, signal);
      return;
    } catch {
      // The process may have exited between the request and cleanup.
    }
  }
  server.kill(signal);
}

function remainingMs(deadline) {
  return Math.max(1, deadline - Date.now());
}

async function fetchWithinDeadline(url, init, deadline) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), remainingMs(deadline));
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } catch (error) {
    if (controller.signal.aborted) {
      throw new Error(`请求 ${url} 超过生产冒烟执行预算`);
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

async function waitForServer(deadline) {
  let lastError = "未知错误";
  while (Date.now() < deadline) {
    try {
      const response = await fetchWithinDeadline(`${baseUrl}/`, { redirect: "manual" }, deadline);
      if (response.status < 500) return;
      lastError = `HTTP ${response.status}`;
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
    }
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  throw new Error(`生产服务在 ${normalizedTimeoutMs}ms 内未就绪：${lastError}`);
}

async function assertRoutes(deadline) {
  const requiredHeaders = {
    "x-content-type-options": "nosniff",
    "x-frame-options": "DENY",
    "referrer-policy": "strict-origin-when-cross-origin",
  };
  for (const route of routes) {
    const response = await fetchWithinDeadline(`${baseUrl}${route.path}`, undefined, deadline);
    if (response.status !== route.status) {
      throw new Error(`${route.path} 返回 HTTP ${response.status}，预期 ${route.status}`);
    }
    if (route.contentType && !response.headers.get("content-type")?.includes(route.contentType)) {
      throw new Error(`${route.path} 的 Content-Type 不包含 ${route.contentType}`);
    }
    for (const [name, expected] of Object.entries(requiredHeaders)) {
      if (response.headers.get(name) !== expected) {
        throw new Error(`${route.path} 缺少安全响应头 ${name}: ${expected}`);
      }
    }
    if (route.path === "/manifest.webmanifest") {
      const manifest = await response.json();
      if (manifest.display !== "standalone" || !String(manifest.name).includes("易境")) {
        throw new Error("Manifest 缺少易境名称或 standalone 配置");
      }
    }
    if (route.path === "/sw.js") {
      const serviceWorker = await response.text();
      if (!serviceWorker.includes("yijing-static-v62")) {
        throw new Error("Service Worker 缓存版本不是 yijing-static-v62");
      }
    }
  }
  const health = await fetchWithinDeadline(`${baseUrl}/api/health`, { cache: "no-store" }, deadline);
  if (health.status !== 200) {
    throw new Error(`/api/health 返回 HTTP ${health.status}，预期 200`);
  }
  if (health.headers.get("cache-control") !== "no-store") {
    throw new Error("/api/health 必须返回 Cache-Control: no-store");
  }
  for (const [name, expected] of Object.entries(requiredHeaders)) {
    if (health.headers.get(name) !== expected) {
      throw new Error(`/api/health 缺少安全响应头 ${name}: ${expected}`);
    }
  }
  const healthData = await health.json();
  if (
    healthData.status !== "ok" ||
    healthData.service !== "易境" ||
    healthData.appVersion !== "0.1.0" ||
    healthData.serviceWorkerCache !== "yijing-static-v62" ||
    healthData.storage !== "postgresql"
  ) {
    throw new Error("/api/health 返回的部署状态摘要不完整或版本不匹配");
  }
}

async function main() {
  if (!process.env.SMOKE_BASE_URL) {
    if (!existsSync(".next/BUILD_ID")) {
      throw new Error("未找到生产构建产物，请先运行 npm run build");
    }
    server = spawn("npm", ["run", "start", "--", "--hostname", host, "--port", String(port)], {
      stdio: "inherit",
      env: process.env,
      detached: process.platform !== "win32",
    });
    ownsServer = true;
  }
  const deadline = Date.now() + normalizedTimeoutMs;
  await waitForServer(deadline);
  await assertRoutes(deadline);
  console.log(`生产冒烟通过：${routes.length} 个路由，服务地址 ${baseUrl}`);
}

try {
  await main();
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
} finally {
  if (ownsServer) terminateServer();
}
