import { spawnSync } from "node:child_process";
import process from "node:process";

const npm = process.platform === "win32" ? "npm.cmd" : "npm";
const result = spawnSync(
  npm,
  [
    "test",
    "--",
    "--run",
    "tests/core/content.test.ts",
    "tests/core/content-audit.test.ts",
  ],
  {
    env: process.env,
    stdio: "inherit",
  },
);

if (result.error) {
  console.error(`[content] 内容门禁无法启动：${result.error.message}`);
  process.exit(1);
}

if (result.status !== 0) {
  const code = result.status ?? 1;
  console.error(`[content] 内容门禁失败（退出码 ${code}）`);
  process.exit(code);
}

console.log("\n[content] 内容结构与复核交接门禁通过");
