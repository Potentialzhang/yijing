import { KNOWLEDGE_CONCEPTS } from "@/content/knowledge";
import { HEXAGRAMS } from "@/core/iching/hexagrams";
import { TRIGRAMS } from "@/core/iching/trigrams";
import { compareIsoTimestamps, isValidIsoTimestamp, isValidLocalDate } from "@/core/date/local";
import { isValidHttpUrl } from "@/core/links";
import type { UserNote, UserSourceRef } from "@/db/schema";

const TARGET_TYPES = ["concept", "trigram", "hexagram", "hexagram_line", "session"] as const;
const SOURCE_KINDS = ["classic", "book", "video", "web", "personal"] as const;
const TARGET_IDS: Record<Exclude<UserNote["targetType"], "session" | "hexagram_line">, ReadonlySet<string>> = {
  concept: new Set(KNOWLEDGE_CONCEPTS.map((concept) => concept.id)),
  trigram: new Set(TRIGRAMS.map((trigram) => trigram.id)),
  hexagram: new Set(HEXAGRAMS.map((hexagram) => hexagram.id)),
};
const HEXAGRAM_LINE_IDS = new Set(
  HEXAGRAMS.flatMap((hexagram) =>
    Array.from({ length: 6 }, (_, index) => `${hexagram.id}-${index + 1}`),
  ),
);
const NOTE_KEYS = new Set([
  "id",
  "targetType",
  "targetId",
  "title",
  "markdown",
  "tags",
  "sourceRefs",
  "createdAt",
  "updatedAt",
  "deletedAt",
]);
const SOURCE_REF_KEYS = new Set([
  "label",
  "kind",
  "author",
  "edition",
  "locator",
  "url",
  "accessedAt",
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function normalizeOptionalString(value: unknown, label: string): string | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== "string") throw new TypeError(`${label}必须是字符串`);
  const normalized = value.trim();
  return normalized || undefined;
}

function normalizeSourceRef(value: unknown, index: number): UserSourceRef {
  if (!isRecord(value)) throw new TypeError(`笔记来源 ${index + 1} 格式无效`);
  if (Object.keys(value).some((key) => !SOURCE_REF_KEYS.has(key))) {
    throw new TypeError(`笔记来源 ${index + 1} 包含未声明字段`);
  }
  if (typeof value.label !== "string" || !value.label.trim()) {
    throw new TypeError(`笔记来源 ${index + 1} 缺少名称`);
  }
  if (value.kind !== undefined && !SOURCE_KINDS.includes(value.kind as (typeof SOURCE_KINDS)[number])) {
    throw new TypeError(`笔记来源 ${index + 1} 类型无效`);
  }
  const author = normalizeOptionalString(value.author, `笔记来源 ${index + 1} 作者`);
  const edition = normalizeOptionalString(value.edition, `笔记来源 ${index + 1} 版本`);
  const locator = normalizeOptionalString(value.locator, `笔记来源 ${index + 1} 定位`);
  const url = normalizeOptionalString(value.url, `笔记来源 ${index + 1} 链接`);
  if (url && !isValidHttpUrl(url)) throw new TypeError(`笔记来源 ${index + 1} 链接格式无效`);
  const accessedAt = normalizeOptionalString(value.accessedAt, `笔记来源 ${index + 1} 访问日期`);
  if (accessedAt && !isValidLocalDate(accessedAt)) {
    throw new TypeError(`笔记来源 ${index + 1} 访问日期无效`);
  }
  return {
    label: value.label.trim(),
    ...(value.kind === undefined ? {} : { kind: value.kind as UserSourceRef["kind"] }),
    ...(author ? { author } : {}),
    ...(edition ? { edition } : {}),
    ...(locator ? { locator } : {}),
    ...(url ? { url } : {}),
    ...(accessedAt ? { accessedAt } : {}),
  };
}

/** Normalize one source reference at a repository boundary. */
export function normalizeSourceRefForWrite(value: UserSourceRef): UserSourceRef {
  const normalized = normalizeSourceRef(value, 0);
  // Legacy v1 notes may omit `kind`, but every newly appended reference
  // should persist the backwards-compatible default explicitly. This keeps
  // future writes canonical without rewriting untouched legacy records.
  return { ...normalized, kind: normalized.kind ?? "personal" };
}

/**
 * The current editor edits the first source reference. Preserve additional
 * references when an imported or future note contains more than one source;
 * silently dropping them would make a routine edit destructive.
 */
export function replaceFirstSourceRefPreservingRest(
  existing: readonly UserSourceRef[] | undefined,
  edited: readonly UserSourceRef[],
): UserSourceRef[] {
  return replaceSourceRefAtPreservingRest(existing, 0, edited);
}

/**
 * Replace or remove one source reference while preserving every other
 * reference. An empty edited list removes the selected reference; when the
 * selected index is zero this also promotes the next source to the first
 * position used by the compact editor.
 */
export function replaceSourceRefAtPreservingRest(
  existing: readonly UserSourceRef[] | undefined,
  index: number,
  edited: readonly UserSourceRef[],
): UserSourceRef[] {
  const refs = [...(existing ?? [])];
  if (!Number.isInteger(index) || index < 0 || index > refs.length) return refs;
  if (index === refs.length) return [...refs, ...edited.slice(0, 1)];
  return [...refs.slice(0, index), ...edited.slice(0, 1), ...refs.slice(index + 1)];
}

/**
 * Compare source references by their persisted meaning. Legacy notes may omit
 * `kind`; that omission means the backwards-compatible default `personal`, so
 * it must compare equal to a newly-created explicit `personal` reference.
 */
export function areSourceRefsEqual(
  left: UserSourceRef,
  right: UserSourceRef,
): boolean {
  return left.label === right.label
    && (left.kind ?? "personal") === (right.kind ?? "personal")
    && left.author === right.author
    && left.edition === right.edition
    && left.locator === right.locator
    && left.url === right.url
    && left.accessedAt === right.accessedAt;
}

function assertTarget(targetType: UserNote["targetType"], targetId: string): void {
  if (targetType === "session") return;
  if (targetType === "hexagram_line") {
    if (!HEXAGRAM_LINE_IDS.has(targetId)) throw new TypeError("笔记目标不存在");
    return;
  }
  if (!TARGET_IDS[targetType].has(targetId)) throw new TypeError("笔记目标不存在");
}

/** Normalize every user-note write so UI and future callers share one contract. */
export function normalizeNoteForWrite(record: UserNote): UserNote {
  if (!isRecord(record)) throw new TypeError("笔记记录格式无效");
  if (Object.keys(record).some((key) => !NOTE_KEYS.has(key))) {
    throw new TypeError("笔记记录包含未声明字段");
  }
  if (typeof record.id !== "string" || !record.id.trim()) throw new TypeError("笔记 ID 不能为空");
  if (!TARGET_TYPES.includes(record.targetType)) throw new TypeError("笔记目标类型无效");
  if (typeof record.targetId !== "string" || !record.targetId.trim()) throw new TypeError("笔记目标 ID 不能为空");
  const targetId = record.targetId.trim();
  assertTarget(record.targetType, targetId);
  if (record.title !== undefined && typeof record.title !== "string") throw new TypeError("笔记标题必须是字符串");
  if (typeof record.markdown !== "string") throw new TypeError("笔记正文必须是字符串");
  if (!Array.isArray(record.tags) || record.tags.some((tag) => typeof tag !== "string")) {
    throw new TypeError("笔记标签格式无效");
  }
  if (!Array.isArray(record.sourceRefs)) throw new TypeError("笔记来源格式无效");
  if (typeof record.createdAt !== "string" || !isValidIsoTimestamp(record.createdAt)) throw new TypeError("笔记创建时间无效");
  if (typeof record.updatedAt !== "string" || !isValidIsoTimestamp(record.updatedAt)) throw new TypeError("笔记更新时间无效");
  if (compareIsoTimestamps(record.updatedAt, record.createdAt) < 0) throw new TypeError("笔记更新时间不能早于创建时间");
  if (record.deletedAt !== undefined && (typeof record.deletedAt !== "string" || !isValidIsoTimestamp(record.deletedAt))) {
    throw new TypeError("笔记删除时间无效");
  }
  if (record.deletedAt !== undefined && compareIsoTimestamps(record.deletedAt, record.createdAt) < 0) {
    throw new TypeError("笔记删除时间不能早于创建时间");
  }
  const tags = [...new Set(record.tags.map((tag) => tag.trim()).filter(Boolean))];
  const sourceRefs = record.sourceRefs.map((source, index) => normalizeSourceRef(source, index));
  return {
    id: record.id.trim(),
    targetType: record.targetType,
    targetId,
    ...(record.title === undefined ? {} : { title: record.title.trim() }),
    markdown: record.markdown,
    tags,
    sourceRefs,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
    ...(record.deletedAt === undefined ? {} : { deletedAt: record.deletedAt }),
  };
}
