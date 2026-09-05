import { spawnSync } from "node:child_process";
import process from "node:process";

const npm = process.platform === "win32" ? "npm.cmd" : "npm";
const steps = [
  { label: "基础质量门禁", args: ["run", "verify"] },
  { label: "内容结构与复核门禁", args: ["run", "verify:content"] },
  { label: "数据可靠性演练门禁", args: ["run", "verify:data"] },
  { label: "无障碍门禁", args: ["run", "test:a11y"] },
  { label: "响应式门禁", args: ["run", "test:responsive"] },
  { label: "性能门禁", args: ["run", "test:perf"] },
  { label: "Chromium 生产 E2E", args: ["run", "test:e2e:prod:chromium"] },
  { label: "WebKit 生产 E2E", args: ["run", "test:e2e:prod:webkit"] },
  { label: "移动端生产模拟", args: ["run", "test:mobile:prod"] },
];

for (const step of steps) {
  console.log(`\n[release] ${step.label}`);
  const result = spawnSync(npm, step.args, {
    env: process.env,
    stdio: "inherit",
  });
  if (result.error) {
    console.error(`[release] ${step.label} 无法启动：${result.error.message}`);
    process.exit(1);
  }
  if (result.status !== 0) {
    const code = result.status ?? 1;
    console.error(`[release] ${step.label} 失败（退出码 ${code}）`);
    process.exit(code);
  }
}

console.log("\n[release] 本地可执行发布门禁全部通过（Firefox 需单独在稳定版或 CI 验收）");
