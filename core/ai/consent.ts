/**
 * M4-001 AI 辅学授权与发送预览契约。
 *
 * 这里仅描述用户明确选择的数据范围，不读取 IndexedDB，也不执行网络
 * 请求。后续 AI 接入必须先把真实请求映射到这个预览，再由用户确认。
 */
export const AI_SCOPE_DEFINITIONS = [
  {
    id: "selected-notes",
    label: "我选定的笔记",
    description: "只包含用户在当前任务中明确选择的笔记正文、标签和来源定位。",
    fields: ["note.markdown", "note.tags", "note.sourceRefs"],
  },
  {
    id: "review-history",
    label: "错题与掌握度",
    description: "只包含用于分析混淆点的作答结果、复习等级和知识点状态。",
    fields: [
      "reviewAttempts.promptSnapshot",
      "reviewAttempts.recallGrade",
      "conceptProgress.masteryScore",
    ],
  },
  {
    id: "selected-content",
    label: "我选定的已校对知识",
    description: "只包含用户选定且已标记为可用的知识结构和来源编号。",
    fields: ["content.conceptId", "content.blocks", "content.sourceIds"],
  },
] as const;

export type AiScopeId = (typeof AI_SCOPE_DEFINITIONS)[number]["id"];
export type AiPreviewPurpose =
  "study-draft" | "confusion-analysis" | "note-organization";

const AI_PREVIEW_PURPOSES = new Set<AiPreviewPurpose>([
  "study-draft",
  "confusion-analysis",
  "note-organization",
]);

export function isAiPreviewPurpose(value: unknown): value is AiPreviewPurpose {
  return typeof value === "string" && AI_PREVIEW_PURPOSES.has(value as AiPreviewPurpose);
}

export interface AiRequestPreview {
  contractVersion: 1;
  purpose: AiPreviewPurpose;
  scopes: AiScopeId[];
  includedFields: string[];
  excludedFields: readonly string[];
  transport: "local-preview-not-sent";
  retention: "one-time-request";
}

const AI_SCOPE_IDS = new Set<AiScopeId>(
  AI_SCOPE_DEFINITIONS.map((definition) => definition.id),
);

const EXCLUDED_FIELDS = [
  "all-local-database-records",
  "unselected-notes",
  "backup-files",
  "compass-sensor-readings",
  "platform-diagnostics",
  "account-identifiers",
] as const;

const EXCLUDED_FIELD_SET = new Set<string>(EXCLUDED_FIELDS);
const AI_PREVIEW_KEYS = new Set([
  "contractVersion",
  "purpose",
  "scopes",
  "includedFields",
  "excludedFields",
  "transport",
  "retention",
]);

export function normalizeAiScopes(value: unknown): AiScopeId[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<AiScopeId>();
  return value.filter((item): item is AiScopeId => {
    if (typeof item !== "string" || !AI_SCOPE_IDS.has(item as AiScopeId))
      return false;
    const scope = item as AiScopeId;
    if (seen.has(scope)) return false;
    seen.add(scope);
    return true;
  });
}

export function parseAiScopes(value: unknown): AiScopeId[] {
  if (typeof value !== "string" || !value.trim()) return [];
  try {
    return normalizeAiScopes(JSON.parse(value));
  } catch {
    return [];
  }
}

export function serializeAiScopes(scopes: readonly AiScopeId[]): string {
  return JSON.stringify(normalizeAiScopes(scopes));
}

export function buildAiRequestPreview(
  purpose: AiPreviewPurpose,
  scopes: readonly AiScopeId[],
): AiRequestPreview {
  if (!isAiPreviewPurpose(purpose)) throw new TypeError("AI 预览用途无效");
  const normalizedScopes = normalizeAiScopes(scopes);
  if (normalizedScopes.length === 0)
    throw new TypeError("AI 预览至少需要一个授权范围");
  const includedFields = AI_SCOPE_DEFINITIONS.filter((definition) =>
    normalizedScopes.includes(definition.id),
  ).flatMap((definition) => definition.fields);
  return {
    contractVersion: 1,
    purpose,
    scopes: normalizedScopes,
    includedFields,
    excludedFields: EXCLUDED_FIELDS,
    transport: "local-preview-not-sent",
    retention: "one-time-request",
  };
}

/**
 * Validate a preview at the provider boundary.  A preview normally comes
 * from `buildAiRequestPreview`, but callers can deserialize or construct one
 * independently, so the adapter must not trust the TypeScript interface.
 */
export function assertAiRequestPreview(
  input: unknown,
): asserts input is AiRequestPreview {
  if (!input || typeof input !== "object")
    throw new TypeError("AI 请求预览必须是对象");
  const candidate = input as Partial<AiRequestPreview>;
  if (Object.keys(candidate).some((key) => !AI_PREVIEW_KEYS.has(key)))
    throw new TypeError("AI 请求预览包含未声明字段");
  if (candidate.contractVersion !== 1)
    throw new TypeError("AI 请求预览契约版本无效");
  if (!isAiPreviewPurpose(candidate.purpose))
    throw new TypeError("AI 请求预览用途无效");
  if (!Array.isArray(candidate.scopes))
    throw new TypeError("AI 请求预览范围必须是数组");
  const scopes = normalizeAiScopes(candidate.scopes);
  if (scopes.length === 0 || scopes.length !== candidate.scopes.length)
    throw new TypeError("AI 请求预览范围包含未知或重复项");
  if (!Array.isArray(candidate.includedFields))
    throw new TypeError("AI 请求预览字段必须是数组");
  const expectedFields = new Set<string>(
    AI_SCOPE_DEFINITIONS.filter((definition) => scopes.includes(definition.id)).flatMap(
      (definition) => definition.fields,
    ),
  );
  const includedFields = candidate.includedFields;
  if (
    new Set(includedFields).size !== includedFields.length ||
    includedFields.length !== expectedFields.size
  )
    throw new TypeError("AI 请求预览字段与授权范围不一致");
  for (const field of includedFields) {
    if (typeof field !== "string" || !field.trim() || !expectedFields.has(field))
      throw new TypeError("AI 请求预览字段与授权范围不一致");
  }
  if (!Array.isArray(candidate.excludedFields))
    throw new TypeError("AI 请求预览排除字段必须是数组");
  const excludedFields = candidate.excludedFields;
  const excludedFieldValues = new Set<string>();
  for (const field of excludedFields) {
    if (
      typeof field !== "string" ||
      !field.trim() ||
      !EXCLUDED_FIELD_SET.has(field) ||
      excludedFieldValues.has(field)
    )
      throw new TypeError("AI 请求预览排除字段无效");
    excludedFieldValues.add(field);
  }
  if (
    excludedFieldValues.size !== EXCLUDED_FIELD_SET.size ||
    ![...EXCLUDED_FIELD_SET].every((field) => excludedFieldValues.has(field))
  )
    throw new TypeError("AI 请求预览缺少必要排除字段");
  if (candidate.transport !== "local-preview-not-sent")
    throw new TypeError("AI 请求预览传输策略无效");
  if (candidate.retention !== "one-time-request")
    throw new TypeError("AI 请求预览留存策略无效");
}
