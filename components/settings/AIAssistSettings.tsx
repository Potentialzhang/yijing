"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AI_SCOPE_DEFINITIONS,
  buildAiRequestPreview,
  parseAiScopes,
  serializeAiScopes,
  type AiPreviewPurpose,
  type AiRequestPreview,
  type AiScopeId,
} from "@/core/ai/consent";
import { createAiDraftOutput, type AiOutputKind } from "@/core/ai/output";
import {
  DEFAULT_AI_PAYLOAD_CHARS,
  DEFAULT_AI_TIMEOUT_MS,
  MAX_AI_PAYLOAD_CHARS,
  MAX_AI_TIMEOUT_MS,
} from "@/core/ai/provider";
import { buildAiFallbackNotice } from "@/core/ai/service-policy";
import { AIDraftReview } from "@/components/settings/AIDraftReview";
import { AIStudyWorkspace } from "@/components/settings/AIStudyWorkspace";
import { DATA_CHANGED_EVENT, notifyDataChanged } from "@/db/events";
import { createSerialTaskQueue } from "@/core/async/serial-task-queue";
import {
  readPreferenceSnapshot,
  setPreferencesAtomically,
  type PreferenceUpdate,
} from "@/db/repository";

const PURPOSE_OPTIONS: { value: AiPreviewPurpose; label: string }[] = [
  { value: "study-draft", label: "生成练习草稿" },
  { value: "confusion-analysis", label: "分析常见混淆点" },
  { value: "note-organization", label: "整理选定笔记" },
];

export function AIAssistSettings() {
  const [enabled, setEnabled] = useState(false);
  const [scopes, setScopes] = useState<AiScopeId[]>([]);
  const [purpose, setPurpose] = useState<AiPreviewPurpose>("study-draft");
  const [preview, setPreview] = useState<AiRequestPreview | null>(null);
  const [status, setStatus] = useState("AI 辅学默认关闭，不会发送任何数据。");
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const refreshSequence = useRef(0);
  const mountedRef = useRef(false);
  const enabledRef = useRef(false);
  const scopesRef = useRef<AiScopeId[]>([]);
  const purposeRef = useRef<AiPreviewPurpose>("study-draft");
  // Rapid control changes can otherwise complete out of order in the database.
  // Serializing the atomic writes keeps persisted consent aligned with the UI.
  const preferenceWriteQueue = useRef(createSerialTaskQueue());
  const demoDraft = useMemo(() => {
    if (!preview) return null;
    const kind: AiOutputKind =
      preview.purpose === "confusion-analysis"
        ? "confusion-analysis"
        : preview.purpose === "note-organization"
          ? "note-draft"
          : "exercise-draft";
    return createAiDraftOutput({
      kind,
      text: "AI 辅助学习草稿：请先用自己的话复述观察，再回到来源核对。",
      inputScopes: preview.scopes,
      sourceCitations: [
        { sourceId: "source-project-editorial", label: "易境项目自编基础内容" },
      ],
    });
  }, [preview]);

  const refresh = useCallback(() => {
    const sequence = ++refreshSequence.current;
    setLoading(true);
    setLoadError(false);
    void readPreferenceSnapshot().then(({ aiAssistEnabled: savedEnabled, aiAllowedScopes: savedScopes, aiPreviewPurpose: savedPurpose }) => {
      if (sequence !== refreshSequence.current) return;
      const parsedScopes = parseAiScopes(savedScopes);
      enabledRef.current = savedEnabled;
      scopesRef.current = parsedScopes;
      setEnabled(savedEnabled);
      setScopes(parsedScopes);
      if (
        savedPurpose === "study-draft" ||
        savedPurpose === "confusion-analysis" ||
        savedPurpose === "note-organization"
      ) {
        purposeRef.current = savedPurpose;
        setPurpose(savedPurpose);
      }
      setStatus((current) =>
        current.startsWith("AI 设置读取失败")
          ? savedEnabled
            ? "AI 辅学已开启，但仍需选择数据范围并生成预览。"
            : "AI 辅学默认关闭，不会发送任何数据。"
          : current,
      );
      setLoading(false);
      setLoadError(false);
    }).catch(() => {
      if (sequence !== refreshSequence.current) return;
      setLoading(false);
      setLoadError(true);
      setStatus("AI 设置读取失败，请检查网络和账户会话后重试。");
    });
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    const timer = window.setTimeout(refresh, 0);
    window.addEventListener(DATA_CHANGED_EVENT, refresh);
    return () => {
      mountedRef.current = false;
      refreshSequence.current += 1;
      window.clearTimeout(timer);
      window.removeEventListener(DATA_CHANGED_EVENT, refresh);
    };
  }, [refresh]);

  function enqueuePreferenceWrite(updates: readonly PreferenceUpdate[]) {
    return preferenceWriteQueue.current.enqueue(() => setPreferencesAtomically(updates));
  }

  async function saveConsent(
    nextEnabled: boolean,
    nextScopes: AiScopeId[],
    nextPurpose: AiPreviewPurpose = purposeRef.current,
  ) {
    await enqueuePreferenceWrite([
      { key: "aiAssistEnabled", value: nextEnabled },
      { key: "aiAllowedScopes", value: serializeAiScopes(nextScopes) },
      { key: "aiPreviewPurpose", value: nextPurpose },
    ]);
    notifyDataChanged();
  }

  function toggleScope(scope: AiScopeId) {
    const nextScopes = scopes.includes(scope)
      ? scopes.filter((item) => item !== scope)
      : [...scopes, scope];
    scopesRef.current = nextScopes;
    setScopes(nextScopes);
    setPreview(null);
    void saveConsent(enabledRef.current, nextScopes, purposeRef.current).then(() => {
      if (mountedRef.current) setStatus("授权范围已保存，仅适用于你下一次明确确认的请求。");
    }).catch(() => {
      if (mountedRef.current) setStatus("授权范围保存失败，请检查网络和账户会话后重试。");
    });
  }

  function toggleEnabled() {
    const nextEnabled = !enabled;
    enabledRef.current = nextEnabled;
    setEnabled(nextEnabled);
    setPreview(null);
    void saveConsent(nextEnabled, scopesRef.current, purposeRef.current).then(() => {
      if (mountedRef.current) setStatus(
        nextEnabled
          ? "AI 辅学已开启，但仍需选择数据范围并生成预览。"
          : "AI 辅学已关闭，不会发送任何数据。",
      );
    }).catch(() => {
      if (mountedRef.current) setStatus("AI 设置保存失败，请检查网络和账户会话后重试。");
    });
  }

  function updatePurpose(nextPurpose: AiPreviewPurpose) {
    purposeRef.current = nextPurpose;
    setPurpose(nextPurpose);
    setPreview(null);
    void saveConsent(enabledRef.current, scopesRef.current, nextPurpose).then(() => {
      notifyDataChanged();
      if (mountedRef.current) setStatus("预览目的已保存。");
    }).catch(() => { if (mountedRef.current) setStatus("预览目的保存失败，请稍后重试。"); });
  }

  function createPreview() {
    if (!enabled) {
      setStatus("请先开启 AI 辅学授权；当前没有任何数据会发送。");
      setPreview(null);
      return;
    }
    if (scopes.length === 0) {
      setStatus("请至少选择一个数据范围，再生成发送预览。");
      setPreview(null);
      return;
    }
    setPreview(buildAiRequestPreview(purpose, scopes));
    setStatus("本地发送预览已生成，尚未发送任何数据。");
  }

  function revokeConsent() {
    enabledRef.current = false;
    scopesRef.current = [];
    setEnabled(false);
    setScopes([]);
    setPreview(null);
    void saveConsent(false, [], purposeRef.current).then(() => {
      if (mountedRef.current) setStatus("AI 授权已撤销，后续不再发送材料；账户学习功能不受影响。已发送请求仍受提供方数据政策约束。");
    }).catch(() => {
      if (mountedRef.current) setStatus("AI 授权撤销保存失败，请稍后重试。");
    });
  }

  return (
    <section className="ai-assist-settings" aria-label="AI 辅学授权设置">
      <div className="ai-assist-status" role="status">
        {loading ? "正在读取 AI 设置…" : status}
        {loadError && <button type="button" className="text-button" onClick={refresh}>重试读取</button>}
      </div>
      <label className="ai-assist-toggle">
        <input type="checkbox" checked={enabled} onChange={toggleEnabled} disabled={loading || loadError} />
        <span>
          <strong>允许使用 AI 辅学</strong>
          <small>关闭时，学习、复习、笔记和工具完全不受影响。</small>
        </span>
      </label>
      <fieldset disabled={!enabled || loading || loadError}>
        <legend>本次允许读取的范围</legend>
        <div className="ai-scope-list">
          {AI_SCOPE_DEFINITIONS.map((definition) => (
            <label className="ai-scope-option" key={definition.id}>
              <input
                type="checkbox"
                checked={scopes.includes(definition.id)}
                onChange={() => toggleScope(definition.id)}
              />
              <span>
                <strong>{definition.label}</strong>
                <small>{definition.description}</small>
              </span>
            </label>
          ))}
        </div>
        <label className="ai-purpose-select">
          预览目的
          <select
            value={purpose}
            onChange={(event) =>
              updatePurpose(event.target.value as AiPreviewPurpose)
            }
          >
            {PURPOSE_OPTIONS.map((option) => (
              <option value={option.value} key={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
      </fieldset>
      <button type="button" className="primary-button" onClick={createPreview} disabled={loading || loadError}>
        生成本地发送预览
      </button>
      {preview && (
        <article className="ai-request-preview" aria-label="AI 发送预览">
          <div className="section-heading">
            <div>
              <p className="eyebrow">请求契约 v{preview.contractVersion}</p>
              <h2>你可以先检查，再决定是否发送。</h2>
            </div>
            <span>尚未发送</span>
          </div>
          <p>
            这里展示授权范围。下方辅学工作区选择实际材料，核对后可发起一次模型请求。
          </p>
          <p>
            输出约束：只能保存为草稿，必须记录输入范围、来源引用和“AI
            辅助”免责声明；后续评测会拦截确定性预测、混淆流派和伪造原文。
          </p>
          <p>
            发送前护栏：选中数据默认不超过{" "}
            {DEFAULT_AI_PAYLOAD_CHARS.toLocaleString()} 个字符（绝对上限{" "}
            {MAX_AI_PAYLOAD_CHARS.toLocaleString()}），响应默认等待{" "}
            {DEFAULT_AI_TIMEOUT_MS / 1000} 秒（最高 {MAX_AI_TIMEOUT_MS / 1000}{" "}
            秒）；超限或无法序列化时不会调用供应商。
          </p>
          <div className="ai-preview-columns">
            <div>
              <strong>将允许读取</strong>
              <ul>
                {preview.includedFields.map((field) => (
                  <li key={field}>{field}</li>
                ))}
              </ul>
            </div>
            <div>
              <strong>明确排除</strong>
              <ul>
                {preview.excludedFields.map((field) => (
                  <li key={field}>{field}</li>
                ))}
              </ul>
            </div>
          </div>
          {demoDraft && <details><summary>查看本地审阅演示</summary>
            <AIDraftReview
              key={`${demoDraft.contractVersion}-${demoDraft.kind}-${demoDraft.inputScopes.join(",")}`}
              draft={demoDraft}
            />
          </details>}
        </article>
      )}
      <AIStudyWorkspace key={`${enabled}-${scopes.join(",")}`} enabled={enabled && !loadError} scopes={scopes} />
      <section className="ai-policy-panel" aria-label="AI 服务降级与删除策略">
        <div>
          <p className="eyebrow">AI 辅学 · 服务策略</p>
          <h2>随时撤销，失败时回到账户学习。</h2>
        </div>
        <p>
          {buildAiFallbackNotice("offline").title}：
          {buildAiFallbackNotice("offline").message}
        </p>
        <p>
          模型请求设置 store=false，不建立远端会话历史。已接受的草稿保存在账户笔记库，可通过笔记和备份功能管理。
        </p>
        <button
          type="button"
          className="outline-button"
          onClick={revokeConsent}
          disabled={loading || loadError}
        >
          撤销 AI 授权并清除范围
        </button>
      </section>
    </section>
  );
}
