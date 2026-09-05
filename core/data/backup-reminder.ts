import { isValidIsoTimestamp } from "@/core/date/local";

export const BACKUP_REMINDER_AFTER_DAYS = 7;
export const BACKUP_REMINDER_AFTER_MS = BACKUP_REMINDER_AFTER_DAYS * 24 * 60 * 60 * 1000;

/**
 * Return the user-facing reminder for the last successful export.
 * An empty string means a recent, valid export does not need a reminder.
 * Invalid and missing timestamps are treated as “never exported”, while a
 * future timestamp is ignored until it becomes older than the threshold.
 */
export function buildBackupAgeReminder(lastExportAt: string, nowMs = Date.now()): string {
  if (!lastExportAt) return "还没有导出过备份";
  if (!isValidIsoTimestamp(lastExportAt)) return "还没有导出过备份";
  const exportedAtMs = Date.parse(lastExportAt);
  if (!Number.isFinite(exportedAtMs) || !Number.isFinite(nowMs)) return "还没有导出过备份";
  const elapsedMs = nowMs - exportedAtMs;
  if (elapsedMs < BACKUP_REMINDER_AFTER_MS) return "";
  return `距上次备份已超过 ${Math.floor(elapsedMs / (24 * 60 * 60 * 1000))} 天`;
}
