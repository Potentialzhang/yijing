"use client";

import { useRef, useState } from "react";
import { AI_SCOPE_DEFINITIONS } from "@/core/ai/consent";
import type { AiDraftOutput } from "@/core/ai/output";
import {
  createAiDraftReview,
  transitionAiDraftReview,
  type AiDraftReview,
  type AiDraftReviewEvent,
} from "@/core/ai/review";

const STATUS_LABELS: Record<AiDraftReview["status"], string> = {
  pending: "待审阅",
  editing: "编辑中",
  accepted: "已接受（仅本地草稿）",
  rejected: "已拒绝",
};

const AI_SCOPE_LABELS = new Map(
  AI_SCOPE_DEFINITIONS.map((definition) => [definition.id, definition.label]),
);

export function AIDraftReview({ draft, onAccept }: { draft: AiDraftOutput; onAccept?: (text: string) => Promise<void> }) {
  const [review, setReview] = useState(() => createAiDraftReview(draft));
  const [editorText, setEditorText] = useState(draft.text);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);

  async function dispatch(event: AiDraftReviewEvent) {
    if (savingRef.current) return;
    try {
      const next = transitionAiDraftReview(review, event);
      if (next.status === "accepted" && onAccept) {
        savingRef.current = true; setSaving(true);
        await onAccept(next.editedText);
      }
      setReview(next);
      setError("");
      if (event.type === "reset") setEditorText(next.editedText);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "草稿状态无法更新");
    } finally { savingRef.current = false; setSaving(false); }
  }

  return (
    <article className="ai-draft-review" aria-label="AI 草稿审阅工作流">
      <div className="ai-draft-review-heading">
        <div>
          <p className="eyebrow">{onAccept ? "模型输出 · 草稿审阅" : "本地演示"}</p>
          <h3>审阅草稿，再决定是否接受。</h3>
        </div>
        <span role="status" aria-live="polite" aria-atomic="true">
          {review.status === "accepted" && onAccept ? "已保存为本地笔记" : STATUS_LABELS[review.status]}
        </span>
      </div>
      <p className="ai-draft-review-note">
        {onAccept ? "接受后将另存为一篇新笔记，保留来源；原笔记保持原样。" : "这是本地演示草稿，不代表真实模型输出；接受或拒绝都不会修改原笔记。"}
      </p>
      {review.status === "editing" ? (
        <label className="ai-draft-editor">
          AI 草稿文本
          <textarea
            aria-label="AI 草稿文本"
            autoFocus
            value={editorText}
            onChange={(event) => setEditorText(event.target.value)}
          />
        </label>
      ) : (
        <div className="ai-draft-text">{review.editedText}</div>
      )}
      <div className="ai-draft-provenance" aria-label="AI 草稿来源与免责声明">
        <div>
          <strong>本次输入范围</strong>
          <ul>
            {review.draft.inputScopes.map((scope) => (
              <li key={scope}>{AI_SCOPE_LABELS.get(scope) ?? scope}</li>
            ))}
          </ul>
        </div>
        <div>
          <strong>来源引用</strong>
          <ul>
            {review.draft.sourceCitations.map((citation) => (
              <li key={citation.sourceId}>
                {citation.label}
                {citation.locator ? ` · ${citation.locator}` : ""}
              </li>
            ))}
          </ul>
        </div>
        <small>{review.draft.disclaimer}</small>
      </div>
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      <fieldset className="ai-draft-review-actions" disabled={saving}>
        {review.status === "pending" && (
          <>
            <button
              type="button"
              className="outline-button"
              onClick={() => dispatch({ type: "start-edit" })}
            >
              进入编辑
            </button>
            <button
              type="button"
              className="primary-button"
              onClick={() => dispatch({ type: "accept" })}
            >
              接受草稿
            </button>
            <button
              type="button"
              className="danger-button"
              onClick={() => dispatch({ type: "reject" })}
            >
              拒绝草稿
            </button>
          </>
        )}
        {review.status === "editing" && (
          <>
            <button
              type="button"
              className="outline-button"
              onClick={() =>
                dispatch({ type: "update-text", text: editorText })
              }
            >
              保存编辑
            </button>
            <button
              type="button"
              className="primary-button"
              onClick={() =>
                dispatch({ type: "accept-edited", text: editorText })
              }
            >
              接受编辑后的草稿
            </button>
            <button
              type="button"
              className="danger-button"
              onClick={() => dispatch({ type: "reject" })}
            >
              拒绝草稿
            </button>
          </>
        )}
        {(review.status === "accepted" || review.status === "rejected") && (
          <button
            type="button"
            className="outline-button"
            onClick={() => dispatch({ type: "reset" })}
          >
            重置审阅
          </button>
        )}
      </fieldset>
    </article>
  );
}
