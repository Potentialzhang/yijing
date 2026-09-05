"use client";

import { useEffect, useRef, useState } from "react";
import { KNOWLEDGE_CONCEPTS } from "@/content/knowledge";
import { HEXAGRAMS } from "@/core/iching";
import { AI_TASKS, selectedContentData, validateStudyRequest, type StudyQuestion } from "@/core/ai/materials";
import { buildAiRequestPreview, parseAiScopes, type AiScopeId } from "@/core/ai/consent";
import { assertAiDraftOutput, type AiDraftOutput, type AiOutputKind } from "@/core/ai/output";
import { listNotesByUpdatedAt, listReviewAttempts, readPreferenceSnapshot, upsertNoteAtomically } from "@/db/repository";
import { notifyDataChanged } from "@/db/events";
import type { UserNote, ReviewAttempt } from "@/db/schema";
import { AIDraftReview } from "./AIDraftReview";

interface StudyResult { draft: AiDraftOutput; questions: StudyQuestion[] }

function PracticeQuestions({ questions }: { questions: StudyQuestion[] }) {
  const [answers, setAnswers] = useState<Record<number, number>>({});
  return <section className="ai-practice" aria-label="AI 个性化练习"><h3>先作答，再看解析</h3>
    {questions.map((q, i) => <article key={i}><h4>{i + 1}. {q.question}</h4><div className="compass-quiz-options">
      {q.options.map((option, j) => <button key={j} type="button" disabled={answers[i] !== undefined} onClick={() => setAnswers(previous => ({ ...previous, [i]: j }))}>{"ABCD"[j]}. {option}</button>)}
    </div>{answers[i] !== undefined && <p role="status">{answers[i] === q.answerIndex ? "回答正确" : `答案为 ${"ABCD"[q.answerIndex]}`}：{q.explanation}</p>}</article>)}
    {Object.keys(answers).length === questions.length && <p role="status">完成 {questions.length} 题，答对 {questions.filter((q, i) => answers[i] === q.answerIndex).length} 题。</p>}
  </section>;
}

export function AIStudyWorkspace({ enabled, scopes }: { enabled: boolean; scopes: AiScopeId[] }) {
  const [kind, setKind] = useState<AiOutputKind>("exercise-draft");
  const [notes, setNotes] = useState<UserNote[]>([]);
  const [attempts, setAttempts] = useState<ReviewAttempt[]>([]);
  const [noteIds, setNoteIds] = useState<string[]>([]);
  const [contentIds, setContentIds] = useState<string[]>([]);
  const [attemptIds, setAttemptIds] = useState<string[]>([]);
  const [payload, setPayload] = useState<ReturnType<typeof makePayload> | null>(null);
  const [result, setResult] = useState<StudyResult | null>(null);
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);
  const [model, setModel] = useState<{ configured: boolean; model: string | null; provider?: string } | null>(null);
  const controller = useRef<AbortController | null>(null);
  const generation = useRef(0);
  const busyRef = useRef(false);
  const savedId = useRef<string | null>(null);

  useEffect(() => {
    const abort = new AbortController();
    void fetch("/api/ai/study", { cache: "no-store", signal: abort.signal }).then(response => response.json()).then(setModel).catch(() => {});
    const lifetimeGeneration = generation;
    return () => { abort.abort(); controller.current?.abort(); lifetimeGeneration.current++; };
  }, []);

  function resetPreview() { setPayload(null); setResult(null); setStatus(""); savedId.current = null; }
  async function loadMaterials() {
    try {
      const [loadedNotes, loadedAttempts] = await Promise.all([
        scopes.includes("selected-notes") ? listNotesByUpdatedAt() : Promise.resolve([]),
        scopes.includes("review-history") ? listReviewAttempts() : Promise.resolve([]),
      ]);
      setNotes(loadedNotes.filter(note => !note.deletedAt && note.markdown.trim()));
      setAttempts(loadedAttempts.sort((a, b) => b.reviewedAt.localeCompare(a.reviewedAt)).slice(0, 30));
      setNoteIds([]); setAttemptIds([]); resetPreview(); setStatus("本地材料已载入，请勾选本次使用的内容。");
    } catch { setStatus("材料读取失败，请重试。"); }
  }

  function makePayload() {
    const selectedData: Record<string, unknown> = {};
    const usedScopes: AiScopeId[] = [];
    if (scopes.includes("selected-content") && contentIds.length) {
      Object.assign(selectedData, selectedContentData(contentIds)); usedScopes.push("selected-content");
    }
    if (scopes.includes("selected-notes") && noteIds.length) {
      const selected = notes.filter(note => noteIds.includes(note.id));
      selectedData["note.markdown"] = selected.map(note => note.markdown);
      selectedData["note.tags"] = selected.map(note => note.tags);
      selectedData["note.sourceRefs"] = selected.map(note => note.sourceRefs);
      usedScopes.push("selected-notes");
    }
    if (scopes.includes("review-history") && attemptIds.length) {
      const selected = attempts.filter(attempt => attemptIds.includes(attempt.id));
      selectedData["reviewAttempts.promptSnapshot"] = selected.map(attempt => attempt.promptSnapshot);
      selectedData["reviewAttempts.recallGrade"] = selected.map(attempt => attempt.recallGrade);
      usedScopes.push("review-history");
    }
    const purpose = kind === "confusion-analysis" ? "confusion-analysis" : kind === "note-draft" || kind === "viewpoint-comparison" ? "note-organization" : "study-draft";
    return { kind, selectedData, preview: buildAiRequestPreview(purpose, usedScopes), userConfirmed: true as const };
  }

  function prepare() {
    try {
      const next = makePayload(); validateStudyRequest(next);
      if (JSON.stringify(next.selectedData).length > 50000) throw new Error("材料超过 50000 字符，请减少选择。");
      setPayload(next); setResult(null); savedId.current = null; setStatus("请核对下面的实际发送内容，再发起请求。");
    } catch (error) { setPayload(null); setStatus(error instanceof Error ? error.message : "无法生成预览"); }
  }

  async function generate() {
    if (!payload || !enabled || busyRef.current) return;
    if (!navigator.onLine) { setStatus("当前离线，联网后可重新发起。"); return; }
    busyRef.current = true; setBusy(true); setStatus("正在生成…");
    const token = ++generation.current;
    const abort = new AbortController(); controller.current = abort;
    const timeout = window.setTimeout(() => abort.abort(), 65000);
    try {
      const latest = await readPreferenceSnapshot();
      if (!latest.aiAssistEnabled || payload.preview.scopes.some(scope => !parseAiScopes(latest.aiAllowedScopes).includes(scope))) throw new Error("授权已变化，请重新选择材料。");
      const response = await fetch("/api/ai/study", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload), signal: abort.signal });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "模型请求失败");
      assertAiDraftOutput(data.draft);
      const current = await readPreferenceSnapshot();
      if (!current.aiAssistEnabled || payload.preview.scopes.some(scope => !parseAiScopes(current.aiAllowedScopes).includes(scope))) throw new Error("授权已撤销，本次输出已丢弃。");
      if (token !== generation.current) return;
      setResult(data); setStatus("生成完成。练习可直接作答，草稿可编辑后保存为新笔记。");
    } catch (error) {
      if (token === generation.current) setStatus(abort.signal.aborted ? "请求已取消或超时，可手动重试。" : error instanceof Error ? error.message : "模型请求失败");
    } finally { window.clearTimeout(timeout); if (token === generation.current) { busyRef.current = false; setBusy(false); } }
  }

  async function saveDraft(text: string) {
    if (!result) return;
    const id = savedId.current ?? `ai-draft-${crypto.randomUUID()}`;
    savedId.current = id;
    const now = new Date().toISOString();
    const noteId = `session:${id}`;
    await upsertNoteAtomically(noteId, () => ({ id: noteId, targetType: "session", targetId: id, title: `AI 辅助 · ${AI_TASKS.find(task => task.id === result.draft.kind)?.label}`, markdown: text, tags: ["AI辅助", result.draft.kind], sourceRefs: result.draft.sourceCitations.map(source => ({ kind: "personal", label: source.label, locator: source.sourceId })), createdAt: now, updatedAt: now }), () => undefined);
    notifyDataChanged(); setStatus("已保存为新笔记，可在笔记库查看并随备份导出。");
  }

  const toggle = (ids: string[], id: string) => ids.includes(id) ? ids.filter(item => item !== id) : [...ids, id];
  return <section className="ai-study-workspace" aria-label="真实 AI 辅学">
    <h2>用自己的材料开始辅学</h2>
    <p>{model?.configured ? `模型：${model.model} · ${model.provider}` : "模型尚未配置：在服务器设置 OPENAI_API_KEY 和 OPENAI_MODEL 后重启。密钥不会保存在浏览器。"}</p>
    <fieldset disabled={!enabled || busy}>
      <legend>本次任务与材料</legend>
      <label>辅学任务<select value={kind} onChange={event => { setKind(event.target.value as AiOutputKind); resetPreview(); }}>{AI_TASKS.map(task => <option key={task.id} value={task.id}>{task.label}</option>)}</select></label>
      {scopes.includes("selected-content") && <details open><summary>选择知识（最多 4 项）</summary><div className="ai-material-list">{[...KNOWLEDGE_CONCEPTS.map(item => ({ id: item.id, title: item.title })), ...HEXAGRAMS.map(item => ({ id: item.id, title: item.name }))].map(item => <label key={item.id}><input type="checkbox" checked={contentIds.includes(item.id)} disabled={contentIds.length >= 4 && !contentIds.includes(item.id)} onChange={() => { setContentIds(toggle(contentIds, item.id)); resetPreview(); }} />{item.title}</label>)}</div></details>}
      {(scopes.includes("selected-notes") || scopes.includes("review-history")) && <button type="button" className="outline-button" onClick={loadMaterials}>载入本地笔记与作答记录</button>}
      {scopes.includes("selected-notes") && <details open><summary>选定笔记（最多 10 篇）</summary>{notes.length ? <div className="ai-material-list">{notes.map(note => <label key={note.id}><input type="checkbox" checked={noteIds.includes(note.id)} disabled={noteIds.length >= 10 && !noteIds.includes(note.id)} onChange={() => { setNoteIds(toggle(noteIds, note.id)); resetPreview(); }} />{note.title || note.markdown.slice(0, 60)}</label>)}</div> : <p>载入后可选择已写下的笔记。</p>}</details>}
      {scopes.includes("review-history") && <details><summary>选择作答记录（最近 30 条）</summary><div className="ai-material-list">{attempts.map(attempt => <label key={attempt.id}><input type="checkbox" checked={attemptIds.includes(attempt.id)} onChange={() => { setAttemptIds(toggle(attemptIds, attempt.id)); resetPreview(); }} />{attempt.promptSnapshot} · {attempt.recallGrade}</label>)}</div></details>}
      <button type="button" className="primary-button" onClick={prepare}>预览本次实际发送内容</button>
    </fieldset>
    {!enabled && <p>请在上方开启 AI，并授权需要的材料范围。</p>}
    {payload && enabled && <article className="ai-request-preview" aria-label="实际材料发送预览"><h3>本次发送 {JSON.stringify(payload.selectedData).length.toLocaleString()} 字符</h3><p>仅发送下方列出的材料，用于一次生成。请求设置 store=false；提供方的数据处理政策仍适用。</p><details><summary>展开检查完整材料</summary><pre>{JSON.stringify(payload.selectedData, null, 2)}</pre></details><button type="button" className="primary-button" disabled={busy || !model?.configured} onClick={generate}>{busy ? "正在请求模型…" : "确认发送并生成"}</button>{busy && <button className="outline-button" type="button" onClick={() => controller.current?.abort()}>取消请求</button>}</article>}
    {status && <p role="status">{status}</p>}
    {result && <>{result.questions.length > 0 && <PracticeQuestions key={result.draft.createdAt} questions={result.questions} />}<details open={result.questions.length === 0}><summary>审阅并保存完整草稿（含答案）</summary><AIDraftReview key={result.draft.createdAt} draft={result.draft} onAccept={saveDraft} /></details></>}
  </section>;
}
