import { cpSync, existsSync } from "node:fs";
import { spawn } from "node:child_process";
import process from "node:process";

const serverPath = ".next/standalone/server.js";
if (!existsSync(serverPath)) {
  console.error("未找到 standalone 生产服务，请先运行 npm run build");
  process.exit(1);
}

// Next.js does not copy `public` or `.next/static` into the local standalone
// directory. Dockerfile copies both explicitly, while the host-side smoke and
// Playwright servers need the same runtime layout before starting.
function syncStandaloneAssets() {
  if (existsSync("public")) {
    cpSync("public", ".next/standalone/public", { recursive: true, force: true });
  }
  if (existsSync(".next/static")) {
    cpSync(".next/static", ".next/standalone/.next/static", {
      recursive: true,
      force: true,
    });
  }
}

syncStandaloneAssets();

function optionValue(names) {
  const options = Array.isArray(names) ? names : [names];
  // Scan from right to left so the last occurrence follows normal CLI
  // precedence, while accepting long/short flags in both separated and
  // inline forms (`--port 3000`, `--port=3000`, `-p 3000`, `-p=3000`).
  for (let index = process.argv.length - 1; index >= 0; index -= 1) {
    const argument = process.argv[index];
    const inlineName = options.find((name) => argument.startsWith(`${name}=`));
    if (inlineName) {
      const value = argument.slice(inlineName.length + 1);
      return value && !value.startsWith("-") ? value : undefined;
    }
    if (options.includes(argument)) {
      const value = process.argv[index + 1];
      return value && !value.startsWith("-") ? value : undefined;
    }
  }
  return undefined;
}

const hostname = optionValue(["--hostname", "-H"]) ?? process.env.YIJING_HOSTNAME ?? "127.0.0.1";
const port = optionValue(["--port", "-p"]) ?? process.env.PORT ?? "3000";
const child = spawn(process.execPath, [serverPath], {
  stdio: "inherit",
  env: {
    ...process.env,
    HOSTNAME: hostname,
    PORT: port,
  },
});

function forwardSignal(signal) {
  if (child.exitCode === null) child.kill(signal);
}

process.on("SIGINT", () => forwardSignal("SIGINT"));
process.on("SIGTERM", () => forwardSignal("SIGTERM"));
child.once("error", (error) => {
  console.error(`无法启动 standalone 生产服务：${error.message}`);
  process.exitCode = 1;
});
child.once("exit", (code, signal) => {
  if (signal) {
    process.exitCode = 1;
    return;
  }
  process.exitCode = code ?? 1;
});
