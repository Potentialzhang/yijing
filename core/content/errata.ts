import {
  compareIsoTimestamps,
  isValidIsoTimestamp,
} from "@/core/date/local";
import type {
  ContentErratumHistoryEntry,
  ContentErratumRecord,
} from "@/db/schema";

const TARGET_TYPES = ["concept", "trigram", "hexagram", "hexagram_line"] as const;
const CATEGORIES = ["question", "correction"] as const;
const STATUSES = ["open", "resolved"] as const;
const ERRATUM_KEYS = new Set([
  "id",
  "targetType",
  "targetId",
  "category",
  "description",
  "proposedText",
  "sourceRef",
  "contentVersion",
  "status",
  "history",
  "createdAt",
  "updatedAt",
]);

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function normalizeHistoryEntry(value: unknown): ContentErratumHistoryEntry {
  if (!isObject(value)) throw new TypeError("勘误状态历史格式无效");
  if (Object.keys(value).some((key) => key !== "status" && key !== "at")) {
    throw new TypeError("勘误状态历史包含未声明字段");
  }
  if (!STATUSES.includes(value.status as (typeof STATUSES)[number])) {
    throw new TypeError("勘误状态历史状态无效");
  }
  if (typeof value.at !== "string" || !isValidIsoTimestamp(value.at)) {
    throw new TypeError("勘误状态历史时间无效");
  }
  return { status: value.status as ContentErratumHistoryEntry["status"], at: value.at };
}

/**
 * Enforce the append-only history contract before a new erratum is written.
 * Imports and legacy rows use their migration/backup validators; this helper
 * protects ordinary repository writes from bypassing the form contract.
 */
export function normalizeErratumForWrite(
  record: ContentErratumRecord,
): ContentErratumRecord {
  if (!isObject(record) || Object.keys(record).some((key) => !ERRATUM_KEYS.has(key))) {
    throw new TypeError("勘误记录包含未声明字段");
  }
  if (typeof record.id !== "string" || !record.id.trim()) {
    throw new TypeError("勘误记录 ID 不能为空");
  }
  if (!TARGET_TYPES.includes(record.targetType)) {
    throw new TypeError("勘误目标类型无效");
  }
  if (typeof record.targetId !== "string" || !record.targetId.trim()) {
    throw new TypeError("勘误目标 ID 不能为空");
  }
  if (!CATEGORIES.includes(record.category)) {
    throw new TypeError("勘误类别无效");
  }
  if (typeof record.description !== "string" || !record.description.trim()) {
    throw new TypeError("勘误描述不能为空");
  }
  if (typeof record.proposedText !== "string" || typeof record.sourceRef !== "string") {
    throw new TypeError("勘误文本字段必须是字符串");
  }
  if (!Number.isInteger(record.contentVersion) || record.contentVersion < 1) {
    throw new TypeError("勘误内容版本无效");
  }
  if (!STATUSES.includes(record.status)) {
    throw new TypeError("勘误状态无效");
  }
  if (!isValidIsoTimestamp(record.createdAt) || !isValidIsoTimestamp(record.updatedAt)) {
    throw new TypeError("勘误时间无效");
  }
  if (compareIsoTimestamps(record.updatedAt, record.createdAt) < 0) {
    throw new TypeError("勘误更新时间不能早于创建时间");
  }
  if (!Array.isArray(record.history) || record.history.length === 0) {
    throw new TypeError("勘误状态历史不能为空");
  }
  const history = record.history.map(normalizeHistoryEntry);
  if (history[0].status !== "open") {
    throw new TypeError("新建勘误的首个状态必须是待处理");
  }
  if (history.at(-1)?.status !== record.status) {
    throw new TypeError("勘误当前状态与状态历史不一致");
  }
  for (let index = 1; index < history.length; index += 1) {
    if (compareIsoTimestamps(history[index - 1].at, history[index].at) > 0) {
      throw new TypeError("勘误状态历史时间顺序无效");
    }
  }
  return {
    ...record,
    id: record.id.trim(),
    targetId: record.targetId.trim(),
    description: record.description.trim(),
    proposedText: record.proposedText.trim(),
    sourceRef: record.sourceRef.trim(),
    history,
  };
}
