import { assertAiDraftOutput, type AiDraftOutput } from "@/core/ai/output";
import { isValidIsoTimestamp } from "@/core/date/local";

export type AiDraftReviewStatus =
  "pending" | "editing" | "accepted" | "rejected";

export interface AiDraftReview {
  draft: AiDraftOutput;
  status: AiDraftReviewStatus;
  editedText: string;
  decidedAt?: string;
}

export type AiDraftReviewEvent =
  | { type: "start-edit" }
  | { type: "update-text"; text: string }
  | { type: "accept-edited"; text: string }
  | { type: "accept" }
  | { type: "reject" }
  | { type: "reset" };

const REVIEW_STATUSES = new Set<AiDraftReviewStatus>([
  "pending",
  "editing",
  "accepted",
  "rejected",
]);
const REVIEW_KEYS = new Set(["draft", "status", "editedText", "decidedAt"]);

function assertEventShape(event: AiDraftReviewEvent): void {
  const candidate = event as unknown as Record<string, unknown>;
  const keys = Object.keys(candidate);
  const type = candidate.type;
  const textEvents = type === "update-text" || type === "accept-edited";
  const expectedKeys = textEvents ? ["text", "type"] : ["type"];
  if (
    keys.length !== expectedKeys.length ||
    expectedKeys.some((key) => !keys.includes(key)) ||
    keys.some((key) => !expectedKeys.includes(key))
  ) {
    throw new TypeError("AI 草稿审阅事件包含未声明字段");
  }
}

/**
 * Validate a review snapshot before applying an event.  The UI keeps this
 * state in React, but the function is also a public domain boundary for
 * future persistence or provider integrations, so TypeScript alone is not
 * sufficient protection.
 */
export function assertAiDraftReview(
  input: unknown,
): asserts input is AiDraftReview {
  if (!input || typeof input !== "object")
    throw new TypeError("AI 草稿审阅状态必须是对象");
  const candidate = input as Partial<AiDraftReview>;
  if (Object.keys(candidate).some((key) => !REVIEW_KEYS.has(key)))
    throw new TypeError("AI 草稿审阅状态包含未声明字段");
  assertAiDraftOutput(candidate.draft);
  if (
    typeof candidate.status !== "string" ||
    !REVIEW_STATUSES.has(candidate.status as AiDraftReviewStatus)
  )
    throw new TypeError("AI 草稿审阅状态无效");
  if (
    typeof candidate.editedText !== "string" ||
    !candidate.editedText.trim()
  )
    throw new TypeError("AI 草稿审阅文本不能为空");
  if (candidate.editedText.length > 20_000)
    throw new RangeError("AI 草稿审阅文本超过 20000 字符限制");
  if (candidate.status === "pending" && candidate.editedText !== candidate.draft.text)
    throw new TypeError("待审阅状态的编辑文本必须与原始草稿一致");
  if (
    candidate.decidedAt !== undefined &&
    (typeof candidate.decidedAt !== "string" ||
      !isValidIsoTimestamp(candidate.decidedAt))
  )
    throw new TypeError("AI 草稿审阅决定时间无效");
  const isTerminal =
    candidate.status === "accepted" || candidate.status === "rejected";
  if (isTerminal !== (candidate.decidedAt !== undefined))
    throw new TypeError("AI 草稿审阅状态与决定时间不一致");
}

export function createAiDraftReview(draft: AiDraftOutput): AiDraftReview {
  assertAiDraftOutput(draft);
  return { draft, status: "pending", editedText: draft.text };
}

function withDecision(
  review: AiDraftReview,
  status: Extract<AiDraftReviewStatus, "accepted" | "rejected">,
): AiDraftReview {
  return { ...review, status, decidedAt: new Date().toISOString() };
}

function validateEditedText(text: string): string {
  if (typeof text !== "string") throw new TypeError("编辑后的 AI 草稿必须是字符串");
  const editedText = text.trim();
  if (!editedText) throw new TypeError("编辑后的 AI 草稿不能为空");
  if (editedText.length > 20_000)
    throw new RangeError("编辑后的 AI 草稿超过 20000 字符限制");
  return editedText;
}

export function transitionAiDraftReview(
  review: AiDraftReview,
  event: AiDraftReviewEvent,
): AiDraftReview {
  assertAiDraftReview(review);
  if (!event || typeof event !== "object" || typeof event.type !== "string")
    throw new TypeError("AI 草稿审阅事件无效");
  assertEventShape(event);
  const eventType = event.type;
  if (event.type === "reset")
    return {
      ...review,
      status: "pending",
      editedText: review.draft.text,
      decidedAt: undefined,
    };
  if (review.status === "accepted" || review.status === "rejected")
    throw new Error("已结束的 AI 草稿审阅必须先重置");
  if (event.type === "start-edit") return { ...review, status: "editing" };
  if (event.type === "accept-edited") {
    if (review.status !== "editing")
      throw new Error("接受编辑后的 AI 草稿前必须先进入编辑状态");
    return withDecision(
      { ...review, editedText: validateEditedText(event.text) },
      "accepted",
    );
  }
  if (event.type === "update-text") {
    if (review.status !== "editing")
      throw new Error("编辑 AI 草稿前必须先进入编辑状态");
    return {
      ...review,
      status: "editing",
      editedText: validateEditedText(event.text),
    };
  }
  if (event.type === "accept") {
    if (!review.editedText.trim()) throw new TypeError("不能接受空的 AI 草稿");
    return withDecision(review, "accepted");
  }
  if (event.type === "reject") return withDecision(review, "rejected");
  throw new TypeError(`未知的 AI 草稿审阅事件：${eventType}`);
}
