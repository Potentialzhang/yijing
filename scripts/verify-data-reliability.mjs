import { spawnSync } from "node:child_process";
import process from "node:process";

const npm = process.platform === "win32" ? "npm.cmd" : "npm";
const reliabilitySuites = [
  "tests/core/review.test.ts",
  "tests/core/backup.test.ts",
  "tests/core/backup-reminder.test.ts",
  "tests/core/migration-warning.test.ts",
  "tests/core/repository-boundary.test.ts",
  "tests/core/calendar-evidence.test.ts",
];

console.log("[reliability] S6-005 数据可靠性演练：14/30 天调度、迁移、备份、事务和历法样例契约");
const result = spawnSync(
  npm,
  ["test", "--", "--run", ...reliabilitySuites],
  {
    env: process.env,
    stdio: "inherit",
  },
);

if (result.error) {
  console.error(`[reliability] 数据可靠性门禁无法启动：${result.error.message}`);
  process.exit(1);
}

if (result.status !== 0) {
  const code = result.status ?? 1;
  console.error(`[reliability] 数据可靠性门禁失败（退出码 ${code}）`);
  process.exit(code);
}

console.log("\n[reliability] 数据可靠性演练门禁通过");
