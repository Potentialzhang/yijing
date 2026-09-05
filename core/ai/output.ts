import { normalizeAiScopes, type AiScopeId } from "@/core/ai/consent";
import { isValidIsoTimestamp } from "@/core/date/local";
import { isTrimmedIdentifier } from "@/core/content/identifiers";

export const AI_OUTPUT_KINDS = [
  "exercise-draft",
  "confusion-analysis",
  "socratic-question",
  "note-draft",
  "viewpoint-comparison",
  "hexagram-discussion",
] as const;

export type AiOutputKind = (typeof AI_OUTPUT_KINDS)[number];

export interface AiSourceCitation {
  sourceId: string;
  label: string;
  locator?: string;
}

export interface AiDraftOutput {
  contractVersion: 1;
  kind: AiOutputKind;
  status: "draft";
  text: string;
  inputScopes: AiScopeId[];
  sourceCitations: AiSourceCitation[];
  disclaimer: "AI 辅助，仅供学习，不替代原典或程序结果";
  createdAt: string;
}

const OUTPUT_KIND_IDS = new Set<AiOutputKind>(AI_OUTPUT_KINDS);
const DISCLAIMER = "AI 辅助，仅供学习，不替代原典或程序结果" as const;
const AI_OUTPUT_KEYS = new Set([
  "contractVersion",
  "kind",
  "status",
  "text",
  "inputScopes",
  "sourceCitations",
  "disclaimer",
  "createdAt",
]);
const AI_SOURCE_CITATION_KEYS = new Set(["sourceId", "label", "locator"]);

export function createAiDraftOutput(input: {
  kind: AiOutputKind;
  text: string;
  inputScopes: readonly AiScopeId[];
  sourceCitations: readonly AiSourceCitation[];
  createdAt?: string;
}): AiDraftOutput {
  const text = input.text.trim();
  const inputScopes = normalizeAiScopes(input.inputScopes);
  const sourceCitations = input.sourceCitations.map((citation) => ({
    sourceId: citation.sourceId.trim(),
    label: citation.label.trim(),
    ...(citation.locator?.trim() ? { locator: citation.locator.trim() } : {}),
  }));
  const createdAt = input.createdAt ?? new Date().toISOString();
  assertAiDraftOutput({
    contractVersion: 1,
    kind: input.kind,
    status: "draft",
    text,
    inputScopes,
    sourceCitations,
    disclaimer: DISCLAIMER,
    createdAt,
  });
  return {
    contractVersion: 1,
    kind: input.kind,
    status: "draft",
    text,
    inputScopes,
    sourceCitations,
    disclaimer: DISCLAIMER,
    createdAt,
  };
}

export function assertAiDraftOutput(
  input: unknown,
): asserts input is AiDraftOutput {
  if (!input || typeof input !== "object")
    throw new TypeError("AI 输出必须是对象");
  const candidate = input as Partial<AiDraftOutput>;
  if (Object.keys(candidate).some((key) => !AI_OUTPUT_KEYS.has(key)))
    throw new TypeError("AI 输出包含未声明字段");
  if (candidate.contractVersion !== 1)
    throw new TypeError("AI 输出契约版本无效");
  if (
    typeof candidate.kind !== "string" ||
    !OUTPUT_KIND_IDS.has(candidate.kind as AiOutputKind)
  )
    throw new TypeError("AI 输出类型无效");
  if (candidate.status !== "draft")
    throw new TypeError("AI 输出只能以 draft 状态保存");
  if (typeof candidate.text !== "string" || !candidate.text.trim())
    throw new TypeError("AI 草稿文本不能为空");
  if (candidate.text.length > 20_000)
    throw new RangeError("AI 草稿文本超过 20000 字符限制");
  if (!Array.isArray(candidate.inputScopes))
    throw new TypeError("AI 输出必须记录输入范围数组");
  const scopes = normalizeAiScopes(candidate.inputScopes);
  // Output validation is a trust boundary: unlike the local preference
  // parser, a provider response must not silently drop unknown or duplicate
  // scopes and still pass as an authorized draft.
  if (
    scopes.length === 0 ||
    scopes.length !== candidate.inputScopes.length
  )
    throw new TypeError("AI 输出输入范围包含未知或重复项");
  if (!Array.isArray(candidate.sourceCitations))
    throw new TypeError("AI 输出必须包含来源引用数组");
  if (candidate.sourceCitations.length === 0)
    throw new TypeError("AI 输出至少需要一条来源引用");
  const sourceIds = new Set<string>();
  for (const citation of candidate.sourceCitations) {
    if (
      citation &&
      typeof citation === "object" &&
      Object.keys(citation).some((key) => !AI_SOURCE_CITATION_KEYS.has(key))
    )
      throw new TypeError("AI 来源引用包含未声明字段");
    if (
      !citation ||
      typeof citation !== "object" ||
      typeof citation.sourceId !== "string" ||
      !isTrimmedIdentifier(citation.sourceId) ||
      typeof citation.label !== "string" ||
      !citation.label.trim()
    )
      throw new TypeError("AI 来源引用缺少 sourceId 或 label");
    if (citation.locator !== undefined && typeof citation.locator !== "string")
      throw new TypeError("AI 来源定位必须是字符串");
    if (sourceIds.has(citation.sourceId))
      throw new TypeError("AI 来源引用不能重复");
    sourceIds.add(citation.sourceId);
  }
  if (candidate.disclaimer !== DISCLAIMER)
    throw new TypeError("AI 输出必须带有固定免责声明");
  if (
    typeof candidate.createdAt !== "string" ||
    !isValidIsoTimestamp(candidate.createdAt)
  )
    throw new TypeError("AI 输出时间无效");
}
