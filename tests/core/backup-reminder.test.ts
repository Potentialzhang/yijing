import { describe, expect, it } from "vitest";
import {
  BACKUP_REMINDER_AFTER_MS,
  buildBackupAgeReminder,
} from "@/core/data/backup-reminder";
import { buildClearDataStatus } from "@/core/data/clear-status";
import { buildExportCompletionStatus } from "@/core/data/export-status";

const now = Date.parse("2026-08-27T12:00:00.000Z");

describe("备份提醒边界", () => {
  it("没有成功导出记录时提醒导出", () => {
    expect(buildBackupAgeReminder("", now)).toBe("还没有导出过备份");
    expect(buildBackupAgeReminder("not-a-date", now)).toBe("还没有导出过备份");
    expect(buildBackupAgeReminder("0", now)).toBe("还没有导出过备份");
    expect(buildBackupAgeReminder("2026-02-30T12:00:00.000Z", now)).toBe("还没有导出过备份");
  });

  it("七天以内不提示，达到七天后按完整日数提示", () => {
    expect(buildBackupAgeReminder(new Date(now - BACKUP_REMINDER_AFTER_MS + 1).toISOString(), now)).toBe("");
    expect(buildBackupAgeReminder(new Date(now - BACKUP_REMINDER_AFTER_MS).toISOString(), now)).toBe("距上次备份已超过 7 天");
    expect(buildBackupAgeReminder(new Date(now - 10 * 24 * 60 * 60 * 1000 - 3_600_000).toISOString(), now)).toBe("距上次备份已超过 10 天");
  });

  it("未来时间不提前触发提醒", () => {
    expect(buildBackupAgeReminder(new Date(now + 30 * 24 * 60 * 60 * 1000).toISOString(), now)).toBe("");
  });

  it("清空数据时只在确有来源模板时展示模板结果", () => {
    expect(buildClearDataStatus(false, true)).toBe("已清空账户学习数据。建议重新导入备份或从一个知识点开始。");
    expect(buildClearDataStatus(true, true)).toContain("含来源模板");
    expect(buildClearDataStatus(true, false)).toContain("来源模板未能移除");
  });

  it("下载已触发但备份元数据失败时仍明确告知文件已导出", () => {
    expect(buildExportCompletionStatus(2, 5, true)).toBe("已导出 2 条笔记和 5 条作答记录。");
    expect(buildExportCompletionStatus(2, 5, false)).toContain("但上次备份时间未能记录");
  });
});
