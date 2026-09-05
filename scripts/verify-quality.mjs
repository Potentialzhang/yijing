import { spawnSync } from "node:child_process";
import process from "node:process";

const npm = process.platform === "win32" ? "npm.cmd" : "npm";
const steps = [
  { label: "单元测试", args: ["test", "--", "--run"] },
  { label: "静态检查", args: ["run", "lint"] },
  { label: "类型检查", args: ["run", "typecheck"] },
  { label: "生产构建", args: ["run", "build"] },
  { label: "生产冒烟", args: ["run", "test:smoke"] },
];

for (const step of steps) {
  console.log(`\n[verify] ${step.label}`);
  const result = spawnSync(npm, step.args, {
    env: process.env,
    stdio: "inherit",
  });
  if (result.error) {
    console.error(`[verify] ${step.label} 无法启动：${result.error.message}`);
    process.exit(1);
  }
  if (result.status !== 0) {
    const code = result.status ?? 1;
    console.error(`[verify] ${step.label} 失败（退出码 ${code}）`);
    process.exit(code);
  }
}

console.log("\n[verify] 全部质量门禁通过");
