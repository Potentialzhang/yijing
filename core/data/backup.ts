import { z } from "zod";
import type {
  ContentErratumRecord,
  CompassRecord,
  CompassCorrectionRecord,
  FavoriteRecord,
  LabSnapshotRecord,
  PreferenceRecord,
  ReviewAttempt,
  ReviewCardState,
  UserNote,
} from "@/db/schema";
import { directionIdAt } from "@/core/compass/directions";
import { normalizeAiScopes, parseAiScopes } from "@/core/ai/consent";
import { KNOWLEDGE_CONCEPTS } from "@/content/knowledge";
import { FIVE_ELEMENTS } from "@/content/five-elements";
import {
  getHexagramByLines,
  getHexagramByPair,
  toggleLines,
  HEXAGRAMS,
} from "@/core/iching";
import type { LinePosition, TrigramId } from "@/core/iching";
import { TRIGRAMS } from "@/core/iching/trigrams";
import { compareIsoTimestamps, isValidIsoTimestamp, isValidLocalDate } from "@/core/date/local";
import { isKnownPreferenceKey, isValidPreferenceValue } from "@/core/preferences";
import { isValidHttpUrl } from "@/core/links";
import { REVIEW_ALGORITHM_VERSION } from "@/core/review/scheduler";
import { MAX_RESPONSE_TIME_MS } from "@/core/review/response-time";
import { MAX_SELF_EXPLANATION_LENGTH } from "@/core/review/records";
import { REVIEW_EXERCISES } from "@/content/exercises";
import { normalizeNoteForWrite } from "@/core/notes/records";
import { trimmedIdentifierSchema } from "@/core/content/identifiers";

export const BACKUP_FORMAT = "yijing-local-backup" as const;

const isoDateTimeSchema = z.string().refine(
  (value) => isValidIsoTimestamp(value),
  "必须是带时区且日期真实存在的 ISO 时间戳",
);

const httpUrlSchema = z
  .string()
  .refine(isValidHttpUrl, "来源链接必须使用带主机的 HTTP(S) 地址");

const localDateSchema = z
  .string()
  .refine(isValidLocalDate, "来源访问日期无效，必须是实际存在的 YYYY-MM-DD 日期");

const sourceRefSchema = z.object({
  label: z.string().min(1),
  kind: z.enum(["classic", "book", "video", "web", "personal"]).optional(),
  author: z.string().optional(),
  edition: z.string().optional(),
  locator: z.string().optional(),
  url: httpUrlSchema.optional(),
  accessedAt: localDateSchema.optional(),
}).strict();

const noteSchema = z
  .object({
    id: trimmedIdentifierSchema,
    targetType: z.enum([
      "concept",
      "trigram",
      "hexagram",
      "hexagram_line",
      "session",
    ]),
    targetId: trimmedIdentifierSchema,
    title: z.string().optional(),
    markdown: z.string().default(""),
    tags: z.array(z.string()).default([]),
    sourceRefs: z.array(sourceRefSchema).default([]),
    createdAt: isoDateTimeSchema,
    updatedAt: isoDateTimeSchema,
    deletedAt: isoDateTimeSchema.optional(),
  })
  .strict();

const reviewAttemptSchema = z
  .object({
    id: trimmedIdentifierSchema,
    cardId: trimmedIdentifierSchema,
    exerciseVersion: z.number().int().positive().optional(),
    targetType: z.enum(["trigram", "concept", "hexagram", "five-element"]).optional(),
    promptSnapshot: z.string(),
    answerSnapshot: z.string(),
    objectiveCorrect: z.boolean().optional(),
    reviewMode: z.enum(["immediate", "spaced"]).optional(),
    hintUsed: z.boolean().optional(),
    selfExplanation: z.string().max(MAX_SELF_EXPLANATION_LENGTH).optional(),
    responseTimeMs: z.number().int().min(0).max(MAX_RESPONSE_TIME_MS).optional(),
    recallGrade: z.enum(["forgot", "hard", "remembered", "mastered"]),
    reviewedAt: isoDateTimeSchema,
    localDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  })
  .strict();

const cardStateSchema = z
  .object({
    cardId: trimmedIdentifierSchema,
    targetType: z.enum(["concept", "trigram", "hexagram", "five-element"]),
    targetId: trimmedIdentifierSchema,
    // Preserve future algorithm versions in backups so users can move data
    // between app versions. The active scheduler, not the backup parser,
    // decides whether a version is currently usable.
    algorithmVersion: z.number().int().positive().default(REVIEW_ALGORITHM_VERSION),
    stepIndex: z.number().int().min(0),
    dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    lastReviewedAt: isoDateTimeSchema.optional(),
    lapseCount: z.number().int().min(0),
    consecutivePasses: z.number().int().min(0),
    consecutiveForgets: z.number().int().min(0).default(0),
    isWeak: z.boolean(),
    updatedAt: isoDateTimeSchema,
  })
  .strict();

const progressSchema = z
  .object({
    conceptId: trimmedIdentifierSchema,
    status: z.enum(["not_started", "learning", "reviewing", "mastered"]),
    masteryScore: z.number().min(0).max(100),
    lastStudiedAt: isoDateTimeSchema.optional(),
    updatedAt: isoDateTimeSchema,
  })
  .strict();

const favoriteSchema = z
  .object({
    id: trimmedIdentifierSchema,
    targetType: z.enum(["concept", "trigram", "hexagram"]),
    targetId: trimmedIdentifierSchema,
    createdAt: isoDateTimeSchema,
  })
  .strict();

const preferenceSchema = z
  .object({
    key: trimmedIdentifierSchema,
    value: z.union([z.string(), z.number(), z.boolean()]),
    updatedAt: isoDateTimeSchema,
  })
  .strict();

const AI_PREVIEW_PURPOSES = new Set([
  "study-draft",
  "confusion-analysis",
  "note-organization",
]);

function assertPreferenceIntegrity(item: PreferenceRecord): void {
  preferenceSchema.parse(item);
  if (!isKnownPreferenceKey(item.key))
    throw new Error(`备份完整性校验失败：未知偏好键：${item.key}`);
  if (item.key === "aiAssistEnabled" && typeof item.value !== "boolean")
    throw new Error("备份完整性校验失败：AI 开关必须是布尔值");
  if (item.key === "aiAllowedScopes") {
    if (typeof item.value !== "string")
      throw new Error("备份完整性校验失败：AI 数据范围格式无效");
    if (!item.value.trim()) return;
    const scopes = parseAiScopes(item.value);
    let decoded: unknown;
    try {
      decoded = JSON.parse(item.value);
    } catch {
      throw new Error("备份完整性校验失败：AI 数据范围不是有效 JSON");
    }
    if (!Array.isArray(decoded) || normalizeAiScopes(decoded).length !== decoded.length)
      throw new Error("备份完整性校验失败：AI 数据范围包含未知或重复项");
    if (scopes.length !== decoded.length)
      throw new Error("备份完整性校验失败：AI 数据范围无法解析");
  }
  if (
    item.key === "aiPreviewPurpose" &&
    (typeof item.value !== "string" || !AI_PREVIEW_PURPOSES.has(item.value))
  )
    throw new Error("备份完整性校验失败：AI 预览用途无效");
  if (!isValidPreferenceValue(item.key, item.value))
    throw new Error(`备份完整性校验失败：偏好 ${item.key} 的值无效`);
}

const snapshotSchema = z
  .object({
    id: trimmedIdentifierSchema,
    lowerTrigramId: trimmedIdentifierSchema,
    upperTrigramId: trimmedIdentifierSchema,
    movingPositions: z.array(z.number().int().min(1).max(6)),
    baseHexagramId: trimmedIdentifierSchema,
    changedHexagramId: trimmedIdentifierSchema,
    title: z.string(),
    note: z.string(),
    createdAt: isoDateTimeSchema,
    updatedAt: isoDateTimeSchema,
  })
  .strict();

const erratumSchema = z
  .object({
    id: trimmedIdentifierSchema,
    targetType: z.enum(["concept", "trigram", "hexagram", "hexagram_line"]),
    targetId: trimmedIdentifierSchema,
    category: z.enum(["question", "correction"]),
    description: z.string(),
    proposedText: z.string(),
    sourceRef: z.string(),
    contentVersion: z.number().int().positive(),
    status: z.enum(["open", "resolved"]),
    history: z
      .array(
        z.object({
          status: z.enum(["open", "resolved"]),
          at: isoDateTimeSchema,
        }).strict(),
      )
      .default([]),
    createdAt: isoDateTimeSchema,
    updatedAt: isoDateTimeSchema,
  })
  .strict();

const compassRecordSchema = z
  .object({
    id: trimmedIdentifierSchema,
    degrees: z.number().finite().min(0).lt(360),
    directionId: z.enum([
      "north",
      "northeast",
      "east",
      "southeast",
      "south",
      "southwest",
      "west",
      "northwest",
    ]),
    layerId: z.literal("eight-directions-v1"),
    ruleVersion: z.literal(1),
    title: z.string().min(1),
    environmentNote: z.string(),
    createdAt: isoDateTimeSchema,
    updatedAt: isoDateTimeSchema,
  })
  .strict();

const compassCorrectionSchema = z
  .object({
    id: trimmedIdentifierSchema,
    offsetDegrees: z.number().finite().min(-180).max(180),
    reason: z.string().min(1),
    createdAt: isoDateTimeSchema,
    updatedAt: isoDateTimeSchema,
  })
  .strict();

const backupDataSchema = z
  .object({
    notes: z.array(noteSchema).default([]),
    reviewAttempts: z.array(reviewAttemptSchema).default([]),
    reviewCardStates: z.array(cardStateSchema).default([]),
    conceptProgress: z.array(progressSchema).default([]),
    favorites: z.array(favoriteSchema).default([]),
    preferences: z.array(preferenceSchema).default([]),
    labSnapshots: z.array(snapshotSchema).default([]),
    errata: z.array(erratumSchema).default([]),
    compassRecords: z.array(compassRecordSchema).default([]),
    compassCorrections: z.array(compassCorrectionSchema).default([]),
  })
  .strict();

const backupEnvelopeSchema = z
  .object({
    format: z.literal(BACKUP_FORMAT),
    schemaVersion: z.literal(1),
    // These fields were added to the exported v1 envelope after the earliest
    // backups existed. Keep them optional for backwards compatibility, but
    // reject malformed metadata whenever an envelope provides it.
    appVersion: z.string().min(1).optional(),
    contentVersion: z.string().min(1).optional(),
    exportedAt: isoDateTimeSchema.optional(),
    checksum: z.string().min(1).optional(),
    data: backupDataSchema,
  })
  .strict();

export type BackupData = {
  notes: UserNote[];
  reviewAttempts: ReviewAttempt[];
  reviewCardStates: ReviewCardState[];
  conceptProgress: {
    conceptId: string;
    status: "not_started" | "learning" | "reviewing" | "mastered";
    masteryScore: number;
    lastStudiedAt?: string;
    updatedAt: string;
  }[];
  favorites: FavoriteRecord[];
  preferences: PreferenceRecord[];
  labSnapshots: LabSnapshotRecord[];
  errata: ContentErratumRecord[];
  compassRecords: CompassRecord[];
  compassCorrections: CompassCorrectionRecord[];
};

/**
 * Produce a deterministic, non-cryptographic checksum for accidental backup
 * corruption detection. It is deliberately not presented as authentication
 * or tamper resistance; users should still protect exported files themselves.
 */
export function calculateBackupChecksum(data: BackupData): string {
  const canonicalize = (value: unknown): string => {
    if (Array.isArray(value)) return `[${value.map(canonicalize).join(",")}]`;
    if (value && typeof value === "object") {
      const entries = Object.entries(value)
        .filter(([, item]) => item !== undefined)
        // Protocol ordering must not depend on the browser's locale.
        .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
        .map(([key, item]) => `${JSON.stringify(key)}:${canonicalize(item)}`);
      return `{${entries.join(",")}}`;
    }
    return JSON.stringify(value);
  };

  let hash = 0x811c9dc5;
  for (const codeUnit of canonicalize(data)) {
    hash ^= codeUnit.charCodeAt(0);
    hash = Math.imul(hash, 0x01000193);
  }
  return `fnv1a32-${(hash >>> 0).toString(16).padStart(8, "0")}`;
}

export function parseBackupEnvelope(input: unknown): BackupData {
  const parsed = backupEnvelopeSchema.safeParse(input);
  if (!parsed.success) throw new Error("文件格式、版本或记录字段不完整");
  const data = parsed.data.data as BackupData;
  if (
    parsed.data.checksum &&
    parsed.data.checksum !== calculateBackupChecksum(data)
  ) {
    throw new Error("文件校验和不匹配，可能在传输或保存过程中损坏");
  }
  return data;
}

function assertUnique(values: readonly string[], label: string): void {
  if (new Set(values).size !== values.length)
    throw new Error(`备份完整性校验失败：${label}存在重复主键`);
}

const KNOWLEDGE_IDS = new Set(KNOWLEDGE_CONCEPTS.map((item) => item.id));
const TRIGRAM_IDS = new Set(TRIGRAMS.map((item) => item.id));
const HEXAGRAM_IDS = new Set(HEXAGRAMS.map((item) => item.id));
const FIVE_ELEMENT_IDS = new Set(FIVE_ELEMENTS.map((item) => item.id));
const HEXAGRAM_LINE_IDS = new Set(
  HEXAGRAMS.flatMap((hexagram) =>
    Array.from({ length: 6 }, (_, index) => `${hexagram.id}-${index + 1}`),
  ),
);
const REVIEW_EXERCISE_BY_ID = new Map(
  REVIEW_EXERCISES.map((exercise) => [exercise.id, exercise]),
);

function assertTargetExists(
  targetType: string,
  targetId: string,
  label: string,
): void {
  const known =
    targetType === "concept"
      ? KNOWLEDGE_IDS
      : targetType === "trigram"
        ? TRIGRAM_IDS
        : targetType === "hexagram"
          ? HEXAGRAM_IDS
          : targetType === "hexagram_line"
            ? HEXAGRAM_LINE_IDS
            : targetType === "five-element"
              ? FIVE_ELEMENT_IDS
              : null;
  if (!known) {
    throw new Error(`备份完整性校验失败：${label}包含未知目标类型：${targetType}`);
  }
  if (!known.has(targetId)) {
    throw new Error(`备份完整性校验失败：${label}引用了不存在的${targetType}：${targetId}`);
  }
}

function assertBackupReferences(data: BackupData): void {
  data.notes.forEach((item) => {
    if (item.targetType !== "session") {
      assertTargetExists(item.targetType, item.targetId, "笔记");
    }
  });
  data.favorites.forEach((item) =>
    assertTargetExists(item.targetType, item.targetId, "收藏"),
  );
  data.conceptProgress.forEach((item) =>
    assertTargetExists("concept", item.conceptId, "知识点进度"),
  );
  data.reviewCardStates.forEach((item) => {
    assertTargetExists(item.targetType, item.targetId, "复习卡");
    const exercise = REVIEW_EXERCISE_BY_ID.get(item.cardId);
    // Future exercise IDs remain opaque and compatible with newer app
    // versions. For IDs known by this build, however, the persisted target
    // must agree with the immutable exercise definition so a valid target
    // cannot be substituted for a different card.
    if (
      exercise &&
      (item.targetType !== exercise.targetType || item.targetId !== exercise.targetId)
    ) {
      throw new Error(`备份完整性校验失败：复习卡目标与练习定义不一致：${item.cardId}`);
    }
  });
  const cardIds = new Set(data.reviewCardStates.map((item) => item.cardId));
  data.reviewAttempts.forEach((item) => {
    if (!cardIds.has(item.cardId)) {
      throw new Error(`备份完整性校验失败：作答记录缺少对应复习卡：${item.cardId}`);
    }
    const exercise = REVIEW_EXERCISE_BY_ID.get(item.cardId);
    // Current writes persist version 1 together with immutable prompt/answer
    // snapshots.  Compare those fields for known cards so an otherwise valid
    // backup cannot replace the historical question or answer.  Very old
    // backups may omit exerciseVersion; keep those snapshots opaque while
    // still checking the target type when it is present.
    if (exercise) {
      if (item.targetType && item.targetType !== exercise.targetType) {
        throw new Error(`备份完整性校验失败：作答记录题目类型与练习定义不一致：${item.cardId}`);
      }
      if (
        item.exerciseVersion === 1 &&
        (item.promptSnapshot !== exercise.prompt || item.answerSnapshot !== exercise.answer)
      ) {
        throw new Error(`备份完整性校验失败：作答记录题目快照与练习定义不一致：${item.cardId}`);
      }
    }
    if (item.targetType) {
      const state = data.reviewCardStates.find((candidate) => candidate.cardId === item.cardId);
      if (state && item.targetType !== state.targetType) {
        throw new Error(`备份完整性校验失败：作答记录题目类型与复习卡不一致：${item.cardId}`);
      }
    }
  });
  data.labSnapshots.forEach((item) => {
    assertTargetExists("trigram", item.lowerTrigramId, "推演快照");
    assertTargetExists("trigram", item.upperTrigramId, "推演快照");
    assertTargetExists("hexagram", item.baseHexagramId, "推演快照");
    assertTargetExists("hexagram", item.changedHexagramId, "推演快照");
    if (new Set(item.movingPositions).size !== item.movingPositions.length) {
      throw new Error("备份完整性校验失败：推演快照的动爻位置存在重复");
    }
    item.movingPositions.forEach((position) => {
      if (position < 1 || position > 6) {
        throw new Error(`备份完整性校验失败：推演快照包含无效动爻位置：${position}`);
      }
    });
    const base = getHexagramByPair(
      item.lowerTrigramId as TrigramId,
      item.upperTrigramId as TrigramId,
    );
    if (base.id !== item.baseHexagramId) {
      throw new Error("备份完整性校验失败：推演快照的本卦与上下卦不一致");
    }
    const changed = getHexagramByLines(
      toggleLines(
        base.lines,
        new Set(item.movingPositions as LinePosition[]),
      ),
    );
    if (changed.id !== item.changedHexagramId) {
      throw new Error("备份完整性校验失败：推演快照的变卦与动爻不一致");
    }
  });
  data.errata.forEach((item) =>
    assertTargetExists(item.targetType, item.targetId, "内容勘误"),
  );
}

export function assertBackupDataIntegrity(data: BackupData): void {
  assertUnique(
    data.notes.map((item) => item.id),
    "笔记",
  );
  assertUnique(
    data.reviewAttempts.map((item) => item.id),
    "作答记录",
  );
  assertUnique(
    data.reviewCardStates.map((item) => item.cardId),
    "复习卡",
  );
  assertUnique(
    data.conceptProgress.map((item) => item.conceptId),
    "知识点进度",
  );
  assertUnique(
    data.favorites.map((item) => item.id),
    "收藏",
  );
  assertUnique(
    data.preferences.map((item) => item.key),
    "偏好",
  );
  assertUnique(
    data.labSnapshots.map((item) => item.id),
    "推演快照",
  );
  assertUnique(
    data.errata.map((item) => item.id),
    "内容勘误",
  );
  assertUnique(
    data.compassRecords.map((item) => item.id),
    "坐向记录",
  );
  assertUnique(
    data.compassCorrections.map((item) => item.id),
    "罗盘修正记录",
  );
  data.reviewAttempts.forEach((item) => {
    reviewAttemptSchema.parse(item);
    if (!isValidLocalDate(item.localDate)) {
      throw new Error(`备份完整性校验失败：作答记录的本地日期无效：${item.localDate}`);
    }
  });
  data.reviewCardStates.forEach((item) => {
    cardStateSchema.parse(item);
    if (!isValidLocalDate(item.dueDate)) {
      throw new Error(`备份完整性校验失败：复习卡的到期日期无效：${item.dueDate}`);
    }
  });
  data.conceptProgress.forEach((item) => progressSchema.parse(item));
  data.notes.forEach((item) => {
    noteSchema.parse(item);
    // Keep the more specific cross-reference error for orphaned content
    // before invoking the broader note writer contract below.
    if (item.targetType !== "session") {
      assertTargetExists(item.targetType, item.targetId, "笔记");
    }
    // Reuse the repository note contract at the backup boundary.  The
    // structural schema intentionally keeps old optional fields compatible,
    // but it must not allow whitespace-only labels or unnormalised tags to
    // bypass the same checks used by ordinary note writes.
    normalizeNoteForWrite(item);
    if (compareIsoTimestamps(item.updatedAt, item.createdAt) < 0) {
      throw new Error("备份完整性校验失败：笔记更新时间早于创建时间");
    }
    if (item.deletedAt && compareIsoTimestamps(item.deletedAt, item.createdAt) < 0) {
      throw new Error("备份完整性校验失败：笔记删除时间早于创建时间");
    }
    item.sourceRefs.forEach((source, index) => {
      if (source.accessedAt !== undefined && !isValidLocalDate(source.accessedAt)) {
        throw new Error(`备份完整性校验失败：笔记来源 ${index + 1} 的访问日期无效：${source.accessedAt}`);
      }
    });
  });
  data.favorites.forEach((item) => favoriteSchema.parse(item));
  data.preferences.forEach((item) => assertPreferenceIntegrity(item));
  data.labSnapshots.forEach((item) => snapshotSchema.parse(item));
  data.errata.forEach((item) => {
    erratumSchema.parse(item);
    if (compareIsoTimestamps(item.updatedAt, item.createdAt) < 0) {
      throw new Error("备份完整性校验失败：勘误更新时间早于创建时间");
    }
    // The history is append-only.  Schema validation alone would accept a
    // record whose current status disagrees with its last transition, which
    // makes the next repository update silently fork the lifecycle.
    if (item.history.length === 0 || item.history[0].status !== "open") {
      throw new Error("备份完整性校验失败：勘误状态历史必须从待处理开始");
    }
    const last = item.history[item.history.length - 1];
    if (last.status !== item.status) {
      throw new Error("备份完整性校验失败：勘误当前状态与状态历史不一致");
    }
    let previousAt = item.createdAt;
    for (const entry of item.history) {
      if (compareIsoTimestamps(entry.at, previousAt) < 0) {
        throw new Error("备份完整性校验失败：勘误状态历史时间顺序无效");
      }
      previousAt = entry.at;
    }
  });
  data.compassRecords.forEach((item) => {
    compassRecordSchema.parse(item);
    if (directionIdAt(item.degrees) !== item.directionId)
      throw new Error("备份完整性校验失败：坐向记录的角度与方位不一致");
  });
  data.compassCorrections.forEach((item) =>
    compassCorrectionSchema.parse(item),
  );
  assertBackupReferences(data);
}

export function recordIdentity(record: unknown, tableIndex: number): string {
  const value = record as {
    id?: unknown;
    cardId?: unknown;
    conceptId?: unknown;
    key?: unknown;
  };
  const identity =
    tableIndex === 2
      ? value.cardId
      : tableIndex === 3
        ? value.conceptId
        : tableIndex === 5
          ? value.key
          : value.id;
  return typeof identity === "string" ? identity : "";
}

export type ImportTableKey = keyof BackupData;

export type ImportTableSummary = {
  key: ImportTableKey;
  incoming: number;
  additions: number;
  conflicts: number;
  updates: number;
  skipped: number;
};

export type ImportSummary = {
  tables: ImportTableSummary[];
  incoming: number;
  additions: number;
  conflicts: number;
  updates: number;
  skipped: number;
};

const IMPORT_TABLE_KEYS: ImportTableKey[] = [
  "notes",
  "reviewAttempts",
  "reviewCardStates",
  "conceptProgress",
  "favorites",
  "preferences",
  "labSnapshots",
  "errata",
  "compassRecords",
  "compassCorrections",
];

if (new Set(IMPORT_TABLE_KEYS).size !== IMPORT_TABLE_KEYS.length) {
  throw new Error("备份导入表清单存在重复项");
}

function compareImportVersion(
  tableIndex: number,
  incoming: Record<string, unknown>,
  existing: Record<string, unknown>,
): boolean {
  // 作答历史是追加型记录：同 ID 永远保留现有记录，避免备份重复导入改变历史。
  if (tableIndex === 1) return false;
  const field = tableIndex === 4 ? "createdAt" : "updatedAt";
  const incomingValue = typeof incoming[field] === "string" ? incoming[field] : "";
  const existingValue = typeof existing[field] === "string" ? existing[field] : "";
  return compareIsoTimestamps(incomingValue, existingValue) > 0;
}

function stableSerialize(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableSerialize).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.entries(value as Record<string, unknown>)
      .filter(([key]) => key !== "createdAt" && key !== "updatedAt")
      // Import decisions must be invariant across browser locales.
      .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
      .map(([key, entry]) => `${JSON.stringify(key)}:${stableSerialize(entry)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value) ?? String(value);
}

function hasSameImportContent(
  incoming: Record<string, unknown>,
  existing: Record<string, unknown>,
): boolean {
  return stableSerialize(incoming) === stableSerialize(existing);
}

/** 返回该记录是否会在确认导入时写入当前数据库。 */
export function shouldImportRecord(
  incoming: unknown,
  existing: unknown,
  tableIndex: number,
): boolean {
  if (!existing) return true;
  const incomingRecord = incoming as Record<string, unknown>;
  const existingRecord = existing as Record<string, unknown>;
  if (hasSameImportContent(incomingRecord, existingRecord)) return false;
  return compareImportVersion(tableIndex, incomingRecord, existingRecord);
}

/**
 * 根据实际导入规则生成可解释摘要。
 * 该函数只做决策预览，不写入数据库，供 UI 与测试复用。
 */
export function summarizeImport(
  incoming: BackupData,
  existing: BackupData,
): ImportSummary {
  const tables = IMPORT_TABLE_KEYS.map((key, tableIndex) => {
    const current = new Map(
      existing[key].map((record) => [
        recordIdentity(record, tableIndex),
        record as unknown as Record<string, unknown>,
      ]),
    );
    let additions = 0;
    let conflicts = 0;
    let updates = 0;
    let skipped = 0;
    for (const record of incoming[key]) {
      const identity = recordIdentity(record, tableIndex);
      const previous = current.get(identity);
      if (!previous) {
        additions += 1;
        continue;
      }
      conflicts += 1;
      if (shouldImportRecord(record, previous, tableIndex))
        updates += 1;
      else skipped += 1;
    }
    return {
      key,
      incoming: incoming[key].length,
      additions,
      conflicts,
      updates,
      skipped,
    };
  });
  return tables.reduce(
    (summary, table) => ({
      tables: summary.tables.concat(table),
      incoming: summary.incoming + table.incoming,
      additions: summary.additions + table.additions,
      conflicts: summary.conflicts + table.conflicts,
      updates: summary.updates + table.updates,
      skipped: summary.skipped + table.skipped,
    }),
    {
      tables: [] as ImportTableSummary[],
      incoming: 0,
      additions: 0,
      conflicts: 0,
      updates: 0,
      skipped: 0,
    },
  );
}
