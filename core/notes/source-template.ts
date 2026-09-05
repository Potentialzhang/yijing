import { isValidIsoTimestamp, isValidLocalDate } from "@/core/date/local";
import { isValidHttpUrl } from "@/core/links";
import type { SourceKind, UserSourceRef } from "@/db/schema";

export const SOURCE_TEMPLATE_STORAGE_KEY = "yijing:source-template:v1";
export const SOURCE_TEMPLATE_CHANGED_EVENT = "yijing:source-template-changed";
export const SOURCE_TEMPLATE_VERSION = 1 as const;

const SOURCE_KINDS: readonly SourceKind[] = [
  "classic",
  "book",
  "video",
  "web",
  "personal",
];
const SOURCE_REF_KEYS = new Set([
  "label",
  "kind",
  "author",
  "edition",
  "locator",
  "url",
  "accessedAt",
]);
const TEMPLATE_KEYS = new Set(["version", "copiedAt", "sourceRef"]);

export interface SourceTemplate {
  version: typeof SOURCE_TEMPLATE_VERSION;
  copiedAt: string;
  sourceRef: UserSourceRef;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function optionalString(value: unknown, field: string): string | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== "string") throw new TypeError(`${field}必须是字符串`);
  const normalized = value.trim();
  return normalized || undefined;
}

function normalizeSourceRef(value: unknown): UserSourceRef {
  if (!isRecord(value)) throw new TypeError("来源模板缺少来源对象");
  if (Object.keys(value).some((key) => !SOURCE_REF_KEYS.has(key))) {
    throw new TypeError("来源模板包含未声明字段");
  }
  if (typeof value.label !== "string" || !value.label.trim()) {
    throw new TypeError("来源模板缺少名称");
  }
  if (value.kind !== undefined && !SOURCE_KINDS.includes(value.kind as SourceKind)) {
    throw new TypeError("来源模板类型无效");
  }
  const author = optionalString(value.author, "来源模板作者");
  const edition = optionalString(value.edition, "来源模板版本");
  const locator = optionalString(value.locator, "来源模板定位");
  const url = optionalString(value.url, "来源模板链接");
  if (url && !isValidHttpUrl(url)) throw new TypeError("来源模板链接格式无效");
  const accessedAt = optionalString(value.accessedAt, "来源模板访问日期");
  if (accessedAt && !isValidLocalDate(accessedAt)) {
    throw new TypeError("来源模板访问日期无效");
  }
  return {
    label: value.label.trim(),
    kind: (value.kind as SourceKind | undefined) ?? "personal",
    ...(author ? { author } : {}),
    ...(edition ? { edition } : {}),
    ...(locator ? { locator } : {}),
    ...(url ? { url } : {}),
    ...(accessedAt ? { accessedAt } : {}),
  };
}

export function serializeSourceTemplate(
  sourceRef: UserSourceRef,
  copiedAt: string,
): string {
  if (!isValidIsoTimestamp(copiedAt)) throw new TypeError("来源模板复制时间无效");
  const normalized = normalizeSourceRef(sourceRef);
  return JSON.stringify({
    version: SOURCE_TEMPLATE_VERSION,
    copiedAt,
    sourceRef: normalized,
  } satisfies SourceTemplate);
}

export function parseSourceTemplate(value: string | null): SourceTemplate | null {
  if (!value) return null;
  try {
    const parsed: unknown = JSON.parse(value);
    if (!isRecord(parsed)) return null;
    if (Object.keys(parsed).some((key) => !TEMPLATE_KEYS.has(key))) return null;
    if (parsed.version !== SOURCE_TEMPLATE_VERSION || typeof parsed.copiedAt !== "string") return null;
    if (!isValidIsoTimestamp(parsed.copiedAt)) return null;
    return {
      version: SOURCE_TEMPLATE_VERSION,
      copiedAt: parsed.copiedAt,
      sourceRef: normalizeSourceRef(parsed.sourceRef),
    };
  } catch {
    return null;
  }
}
