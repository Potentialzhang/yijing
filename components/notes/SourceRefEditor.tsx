"use client";

import { useEffect, useRef, useState } from "react";
import { DATA_CHANGED_EVENT, notifyDataChanged } from "@/db/events";
import { type SourceKind, type UserSourceRef } from "@/db/schema";
import {
  getNote,
  appendNoteSourceRefAtomically,
  updateNoteAtomically,
  upsertNoteAtomically,
} from "@/db/repository";
import { isValidHttpUrl } from "@/core/links";
import { isValidLocalDate } from "@/core/date/local";
import { createSerialTaskQueue } from "@/core/async/serial-task-queue";
import { areSourceRefsEqual, replaceSourceRefAtPreservingRest } from "@/core/notes/records";
import { shouldApplySourceRefresh } from "@/core/notes/source-sync";
import {
  SOURCE_TEMPLATE_CHANGED_EVENT,
} from "@/core/notes/source-template";
import {
  readStoredSourceTemplate,
  saveStoredSourceTemplate,
} from "@/core/browser/source-template-storage";

type SourceSnapshot = {
  source: string;
  kind: SourceKind;
  author: string;
  edition: string;
  locator: string;
  url: string;
  accessedAt: string;
};

const SOURCE_KIND_LABELS: Record<SourceKind, string> = {
  classic: "经典原文",
  book: "书籍",
  video: "视频",
  web: "网页",
  personal: "个人记录",
};

function createEmptySourceSnapshot(): SourceSnapshot {
  return {
    source: "",
    kind: "personal",
    author: "",
    edition: "",
    locator: "",
    url: "",
    accessedAt: "",
  };
}

function snapshotToSourceRef(snapshot: SourceSnapshot): UserSourceRef | undefined {
  const label = snapshot.source.trim();
  if (!label) return undefined;
  return {
    label,
    kind: snapshot.kind,
    ...(snapshot.author.trim() ? { author: snapshot.author.trim() } : {}),
    ...(snapshot.edition.trim() ? { edition: snapshot.edition.trim() } : {}),
    ...(snapshot.locator.trim() ? { locator: snapshot.locator.trim() } : {}),
    ...(snapshot.url.trim() ? { url: snapshot.url.trim() } : {}),
    ...(snapshot.accessedAt.trim() ? { accessedAt: snapshot.accessedAt.trim() } : {}),
  };
}

export function SourceRefEditor({
  noteId,
  targetType,
  targetId,
}: {
  noteId: string;
  targetType: "concept" | "trigram" | "hexagram" | "hexagram_line" | "session";
  targetId: string;
}) {
  const [source, setSource] = useState("");
  const [kind, setKind] = useState<SourceKind>("personal");
  const [author, setAuthor] = useState("");
  const [edition, setEdition] = useState("");
  const [locator, setLocator] = useState("");
  const [url, setUrl] = useState("");
  const [accessedAt, setAccessedAt] = useState("");
  const [preservedSourceCount, setPreservedSourceCount] = useState(0);
  const [activeSourceIndex, setActiveSourceIndex] = useState(0);
  const [additionalSources, setAdditionalSources] = useState<UserSourceRef[]>([]);
  const [showAdditionalForm, setShowAdditionalForm] = useState(false);
  const [additionalDraft, setAdditionalDraft] = useState<SourceSnapshot>(createEmptySourceSnapshot);
  const [additionalStatus, setAdditionalStatus] = useState("");
  const [hasSourceTemplate, setHasSourceTemplate] = useState(false);
  const [templateStatus, setTemplateStatus] = useState("");
  const [sourceStatus, setSourceStatus] = useState("");
  const [loading, setLoading] = useState(true);
  const [readError, setReadError] = useState(false);
  const [retryVersion, setRetryVersion] = useState(0);
  const sourceRef = useRef("");
  const kindRef = useRef<SourceKind>("personal");
  const authorRef = useRef("");
  const editionRef = useRef("");
  const locatorRef = useRef("");
  const urlRef = useRef("");
  const accessedAtRef = useRef("");
  const dirtyRef = useRef(false);
  const refreshSequence = useRef(0);
  const saveQueue = useRef(createSerialTaskQueue());
  const lastNoteId = useRef(noteId);
  const sourceCountRef = useRef(0);
  const activeSourceIndexRef = useRef(0);
  const refreshTimers = useRef<number[]>([]);
  const lastLocalWriteAt = useRef<string | null>(null);
  const mountedRef = useRef(false);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  function currentSnapshot(): SourceSnapshot {
    return {
      source: sourceRef.current,
      kind: kindRef.current,
      author: authorRef.current,
      edition: editionRef.current,
      locator: locatorRef.current,
      url: urlRef.current,
      accessedAt: accessedAtRef.current,
    };
  }

  function applySourceRef(ref: UserSourceRef | undefined, index: number): void {
    if (!mountedRef.current) return;
    activeSourceIndexRef.current = index;
    setActiveSourceIndex(index);
    sourceRef.current = ref?.label ?? "";
    kindRef.current = ref?.kind ?? "personal";
    authorRef.current = ref?.author ?? "";
    editionRef.current = ref?.edition ?? "";
    locatorRef.current = ref?.locator ?? "";
    urlRef.current = ref?.url ?? "";
    accessedAtRef.current = ref?.accessedAt ?? "";
    setSource(sourceRef.current);
    setKind(kindRef.current);
    setAuthor(authorRef.current);
    setEdition(editionRef.current);
    setLocator(locatorRef.current);
    setUrl(urlRef.current);
    setAccessedAt(accessedAtRef.current);
    dirtyRef.current = false;
  }

  function hasCurrentSnapshot(snapshot: SourceSnapshot): boolean {
    const current = currentSnapshot();
    return (
      current.source === snapshot.source &&
      current.kind === snapshot.kind &&
      current.author === snapshot.author &&
      current.edition === snapshot.edition &&
      current.locator === snapshot.locator &&
      current.url === snapshot.url &&
      current.accessedAt === snapshot.accessedAt
    );
  }

  function updateSource(value: string): void {
    sourceRef.current = value;
    dirtyRef.current = true;
    setSource(value);
  }

  function updateKind(value: SourceKind): void {
    kindRef.current = value;
    dirtyRef.current = true;
    setKind(value);
  }

  function updateAuthor(value: string): void {
    authorRef.current = value;
    dirtyRef.current = true;
    setAuthor(value);
  }

  function updateEdition(value: string): void {
    editionRef.current = value;
    dirtyRef.current = true;
    setEdition(value);
  }

  function updateLocator(value: string): void {
    locatorRef.current = value;
    dirtyRef.current = true;
    setLocator(value);
  }

  function updateUrl(value: string): void {
    urlRef.current = value;
    dirtyRef.current = true;
    setUrl(value);
    setSourceStatus("");
  }

  function updateAccessedAt(value: string): void {
    accessedAtRef.current = value;
    dirtyRef.current = true;
    setAccessedAt(value);
  }

  function updateAdditionalDraft<K extends keyof SourceSnapshot>(
    field: K,
    value: SourceSnapshot[K],
  ): void {
    setAdditionalDraft((draft) => ({ ...draft, [field]: value }));
    setAdditionalStatus("");
  }

  async function refreshSourceTemplateAvailability(): Promise<void> {
    if (!mountedRef.current) return;
    const template = await readStoredSourceTemplate();
    if (mountedRef.current) setHasSourceTemplate(template !== null);
  }

  async function copyCurrentSource(): Promise<void> {
    if (loading || readError) return;
    const snapshot = currentSnapshot();
    const sourceRef = snapshotToSourceRef(snapshot);
    if (!sourceRef) {
      setTemplateStatus("请先填写来源名称，再复制来源模板。");
      return;
    }
    try {
      const saved = await saveStoredSourceTemplate(sourceRef, new Date().toISOString());
      if (!saved) throw new Error("保存失败");
      setHasSourceTemplate(true);
      setTemplateStatus("已复制当前来源，可在其他笔记粘贴填写。");
    } catch {
      setTemplateStatus("来源模板复制失败，请确认已登录且网络可用后重试。");
    }
  }

  async function pasteSourceTemplate(): Promise<void> {
    if (loading || readError) return;
    const template = await readStoredSourceTemplate();
    if (!template) {
      setHasSourceTemplate(false);
      setTemplateStatus("没有可用的来源模板，请先在另一条笔记中复制来源。");
      return;
    }
    applySourceRef(template.sourceRef, activeSourceIndexRef.current);
    dirtyRef.current = true;
    setTemplateStatus("已填入来源模板，正在保存…");
    const didSave = await saveSource();
    if (!mountedRef.current) return;
    setTemplateStatus(didSave ? "来源模板已填入并保存。" : "来源模板已填入，请检查保存状态。");
  }

  async function saveSource(): Promise<boolean> {
    if (loading || readError) return false;
    const snapshot = currentSnapshot();
    if (snapshot.url.trim()) {
      if (!isValidHttpUrl(snapshot.url.trim())) {
        setSourceStatus("链接格式不正确，请填写带主机的 https:// 或 http:// 地址。");
        return false;
      }
    }
    if (snapshot.accessedAt.trim() && !isValidLocalDate(snapshot.accessedAt.trim())) {
      setSourceStatus("访问日期无效，请填写实际存在的日期。");
      return false;
    }
    let didSave = false;
    // Capture the selected source before entering the serial queue. A
    // cross-tab refresh may run while an earlier save is waiting in the
    // queue; reading the mutable ref inside the queued callback could then
    // redirect an edit of an additional source back to index 0.
    const editIndex = activeSourceIndexRef.current;
    const operation = saveQueue.current.enqueue(async () => {
      const sourceRef = snapshotToSourceRef(snapshot);
      const sourceRefs: UserSourceRef[] = sourceRef ? [sourceRef] : [];
      let writtenSourceRefs = sourceRefs;
      const now = new Date().toISOString();
      const didWrite = await upsertNoteAtomically(
        noteId,
        () => {
          if (sourceRefs.length === 0) return undefined;
          return {
            id: noteId,
            targetType,
            targetId,
            markdown: "",
            tags: [],
            sourceRefs,
            createdAt: now,
            updatedAt: now,
          };
        },
        (note) => {
          if (editIndex > note.sourceRefs.length) return undefined;
          writtenSourceRefs = replaceSourceRefAtPreservingRest(note.sourceRefs, editIndex, sourceRefs);
          return {
            ...note,
            sourceRefs: writtenSourceRefs,
            updatedAt: now,
          };
        },
      );
      if (!didWrite) {
        if (mountedRef.current) setSourceStatus("来源已清空");
        return;
      }
      lastLocalWriteAt.current = now;
      didSave = true;
      sourceCountRef.current = writtenSourceRefs.length;
      if (mountedRef.current) {
        setPreservedSourceCount(Math.max(0, writtenSourceRefs.length - 1));
        setAdditionalSources(writtenSourceRefs.slice(1));
        if (hasCurrentSnapshot(snapshot)) {
          dirtyRef.current = false;
        }
      }
      notifyDataChanged();
      if (mountedRef.current) {
        setSourceStatus(snapshot.source.trim() ? "来源已保存" : "来源已清空");
      }
    });
    try {
      await operation;
    } catch {
      if (mountedRef.current) setSourceStatus("来源保存失败，请确认已登录且网络可用后重试");
    }
    return didSave;
  }

  async function saveAdditionalSource(): Promise<void> {
    if (loading || readError) return;
    const snapshot = additionalDraft;
    if (!snapshot.source.trim()) {
      setAdditionalStatus("请先填写新增来源名称。");
      return;
    }
    if (snapshot.url.trim() && !isValidHttpUrl(snapshot.url.trim())) {
      setAdditionalStatus("链接格式不正确，请填写带主机的 https:// 或 http:// 地址。");
      return;
    }
    if (snapshot.accessedAt.trim() && !isValidLocalDate(snapshot.accessedAt.trim())) {
      setAdditionalStatus("访问日期无效，请填写实际存在的日期。");
      return;
    }
    const newSourceRef = snapshotToSourceRef(snapshot);
    if (!newSourceRef) return;
    const operation = saveQueue.current.enqueue(async () => {
      const now = new Date().toISOString();
      const writtenNote = await appendNoteSourceRefAtomically(
        noteId,
        newSourceRef,
        () => ({
          id: noteId,
          targetType,
          targetId,
          markdown: "",
          tags: [],
          sourceRefs: [],
          createdAt: now,
          updatedAt: now,
        }),
      );
      if (!writtenNote) {
        if (mountedRef.current) setAdditionalStatus("新增来源未保存，请重新读取后重试。");
        return;
      }
      const writtenSourceRefs = writtenNote.sourceRefs;
      lastLocalWriteAt.current = writtenNote.updatedAt;
      const hadExistingSource = writtenSourceRefs.length > 1;
      const nextCount = writtenSourceRefs.length;
      sourceCountRef.current = nextCount;
      if (mountedRef.current) {
        setPreservedSourceCount(Math.max(0, nextCount - 1));
        if (hadExistingSource) {
          setAdditionalSources(writtenSourceRefs.slice(1));
        } else {
          applySourceRef(writtenSourceRefs[0], 0);
          setAdditionalSources([]);
        }
        setAdditionalDraft(createEmptySourceSnapshot());
        setShowAdditionalForm(false);
        setAdditionalStatus("新增来源已保存");
        setSourceStatus("新增来源已保存");
      }
      notifyDataChanged();
    });
    try {
      await operation;
    } catch {
      if (mountedRef.current) setAdditionalStatus("新增来源保存失败，请确认已登录且网络可用后重试");
    }
  }

  function beginEditAdditionalSource(index: number): void {
    if (dirtyRef.current) {
      setSourceStatus("请先保存当前来源后再切换来源。");
      return;
    }
    const ref = additionalSources[index];
    if (!ref) return;
    applySourceRef(ref, index + 1);
    setSourceStatus(`正在编辑第 ${index + 2} 条来源`);
  }

  async function removeAdditionalSource(index: number): Promise<void> {
    if (loading || readError) return;
    const target = additionalSources[index];
    if (!target) return;
    if (window.confirm(`确认移除来源“${target.label}”？` ) === false) return;
    const sourceIndex = index + 1;
    let writtenSourceRefs: UserSourceRef[] = [];
    const operation = saveQueue.current.enqueue(async () => {
      const now = new Date().toISOString();
      const didWrite = await updateNoteAtomically(noteId, (note) => {
        const current = note.sourceRefs[sourceIndex];
        if (!current || !areSourceRefsEqual(current, target)) return false;
        writtenSourceRefs = replaceSourceRefAtPreservingRest(note.sourceRefs, sourceIndex, []);
        return { ...note, sourceRefs: writtenSourceRefs, updatedAt: now };
      });
      if (!didWrite) {
        if (mountedRef.current) setSourceStatus("来源已被其他标签页修改，请重新读取后重试。");
        return;
      }
      lastLocalWriteAt.current = now;
      sourceCountRef.current = writtenSourceRefs.length;
      if (mountedRef.current) {
        setPreservedSourceCount(Math.max(0, writtenSourceRefs.length - 1));
        setAdditionalSources(writtenSourceRefs.slice(1));
        if (activeSourceIndexRef.current === sourceIndex) {
          applySourceRef(writtenSourceRefs[0], 0);
        } else if (activeSourceIndexRef.current > sourceIndex) {
          activeSourceIndexRef.current -= 1;
          setActiveSourceIndex(activeSourceIndexRef.current);
        }
      }
      notifyDataChanged();
      if (mountedRef.current) setSourceStatus("来源已移除");
    });
    try {
      await operation;
    } catch {
      if (mountedRef.current) setSourceStatus("来源移除失败，请确认已登录且网络可用后重试");
    }
  }

  function retryRead(): void {
    setLoading(true);
    setReadError(false);
    setSourceStatus("");
    setRetryVersion((value) => value + 1);
  }

  useEffect(() => {
    let active = true;
    if (lastNoteId.current !== noteId) {
      lastNoteId.current = noteId;
      dirtyRef.current = false;
      setPreservedSourceCount(0);
      setAdditionalSources([]);
      setAdditionalDraft(createEmptySourceSnapshot());
      setShowAdditionalForm(false);
      setAdditionalStatus("");
      sourceCountRef.current = 0;
      lastLocalWriteAt.current = null;
      activeSourceIndexRef.current = 0;
      setActiveSourceIndex(0);
      setLoading(true);
      setReadError(false);
      setSourceStatus("");
    }
    const refresh = () => {
      const sequence = ++refreshSequence.current;
      void getNote(noteId)
        .then((note) => {
          if (!active || sequence !== refreshSequence.current) return;
          if (
            !shouldApplySourceRefresh(
              note?.updatedAt,
              lastLocalWriteAt.current,
              note?.sourceRefs?.length ?? 0,
              sourceCountRef.current,
            )
          ) {
            // A notification can race the visibility of our own committed
            // Server-side transaction. Never let that stale read roll back the
            // locally acknowledged source list or selected editor fields.
            return;
          }
          setLoading(false);
          setReadError(false);
          if (dirtyRef.current) return;
          const sourceRefs = note?.sourceRefs ?? [];
          const nextIndex = sourceRefs.length > 0
            ? Math.min(activeSourceIndexRef.current, sourceRefs.length - 1)
            : 0;
          const ref = sourceRefs[nextIndex];
          sourceCountRef.current = sourceRefs.length;
          setPreservedSourceCount(Math.max(0, sourceRefs.length - 1));
          setAdditionalSources(sourceRefs.slice(1));
          applySourceRef(ref, nextIndex);
        })
        .catch(() => {
          if (!active || sequence !== refreshSequence.current) return;
          setLoading(false);
          setReadError(true);
          setSourceStatus("来源读取失败，请确认网络可用后重试");
        });
    };
    const scheduleRefresh = () => {
      refresh();
      // Cross-tab notifications are hints rather than the source of truth.
      // WebKit can deliver BroadcastChannel/storage events while the other
      // tab's transaction is still becoming visible to this connection. A
      // few bounded follow-up reads converge the editor on the committed
      // source list without introducing a permanent polling loop.
      refreshTimers.current.forEach((timer) => window.clearTimeout(timer));
      refreshTimers.current = [120, 360, 900, 1800, 3200].map((delay) =>
        window.setTimeout(refresh, delay),
      );
    };
    refresh();
    window.addEventListener(DATA_CHANGED_EVENT, scheduleRefresh);
    const refreshOnReturn = () => {
      if (document.visibilityState !== "hidden") refresh();
    };
    document.addEventListener("visibilitychange", refreshOnReturn);
    window.addEventListener("pageshow", refreshOnReturn);
    // Notifications are intentionally best-effort. Keep a low-frequency
    // local fallback so a suspended WebKit tab that misses both channels
    // still converges after another tab commits a source change; this never
    // leaves the browser and is paused while the document is hidden.
    const refreshPoll = window.setInterval(refreshOnReturn, 1_500);
    return () => {
      active = false;
      refreshSequence.current += 1;
      refreshTimers.current.forEach((timer) => window.clearTimeout(timer));
      refreshTimers.current = [];
      window.clearInterval(refreshPoll);
      document.removeEventListener("visibilitychange", refreshOnReturn);
      window.removeEventListener("pageshow", refreshOnReturn);
      window.removeEventListener(DATA_CHANGED_EVENT, scheduleRefresh);
    };
  }, [noteId, retryVersion]);

  useEffect(() => {
    const initialRead = window.setTimeout(() => void refreshSourceTemplateAvailability(), 0);
    const handleTemplateChange = () => refreshSourceTemplateAvailability();
    window.addEventListener(SOURCE_TEMPLATE_CHANGED_EVENT, handleTemplateChange);
    window.addEventListener(DATA_CHANGED_EVENT, handleTemplateChange);
    return () => {
      window.clearTimeout(initialRead);
      window.removeEventListener(SOURCE_TEMPLATE_CHANGED_EVENT, handleTemplateChange);
      window.removeEventListener(DATA_CHANGED_EVENT, handleTemplateChange);
    };
  }, []);

  const locatorPlaceholder =
    kind === "book" || kind === "classic"
      ? "例如：第 12 页 / 第三章"
      : kind === "video"
        ? "例如：08:30 或 1:02:15"
        : "例如：章节、页码或时间点";

  return (
    <div className="source-ref-editor">
      {loading && <small className="source-loading" role="status">正在读取来源…</small>}
      {readError && <div className="source-load-error" role="alert"><span>来源暂时无法读取，已保护当前表单内容。</span><button type="button" className="outline-button" onClick={retryRead}>重新读取</button></div>}
      <div className="source-ref-grid">
        <label>
          来源类型
          <select value={kind} onChange={(event) => updateKind(event.target.value as SourceKind)} onBlur={() => void saveSource()} disabled={loading || readError}>
            <option value="classic">经典原文</option>
            <option value="book">书籍</option>
            <option value="video">视频</option>
            <option value="web">网页</option>
            <option value="personal">个人记录</option>
          </select>
        </label>
        <label>
          来源（书名、视频或网页）
          <input value={source} onChange={(event) => updateSource(event.target.value)} onBlur={() => void saveSource()} placeholder="例如：《周易》某注本 / 视频标题" disabled={loading || readError} />
        </label>
      </div>
      {preservedSourceCount > 0 && (
        <small className="source-preserved-note" role="status">
          当前编辑第 {activeSourceIndex + 1} 条来源，另有 {preservedSourceCount} 条来源会在保存时保留。
        </small>
      )}
      {additionalSources.length > 0 && (
        <div className="source-ref-list" aria-label="其他来源">
          <strong>其他来源（{additionalSources.length}）</strong>
          <ul>
            {additionalSources.map((ref, index) => (
              <li key={`${ref.label}-${index}`}>
                <div className="source-ref-list-item">
                  <span>{ref.label}</span>
                  <small>
                    {SOURCE_KIND_LABELS[ref.kind ?? "personal"]}
                    {ref.author ? ` · ${ref.author}` : ""}
                    {ref.edition ? ` · ${ref.edition}` : ""}
                    {ref.locator ? ` · ${ref.locator}` : ""}
                    {ref.accessedAt ? ` · 访问 ${ref.accessedAt}` : ""}
                  </small>
                  {ref.url && (
                    <a
                      className="source-ref-link"
                      href={ref.url}
                      target="_blank"
                      rel="noreferrer noopener"
                      aria-label={`打开来源链接：${ref.label}`}
                    >
                      打开链接 ↗
                    </a>
                  )}
                </div>
                <div className="source-ref-list-actions">
                  <button type="button" className="text-button" onClick={() => beginEditAdditionalSource(index)} disabled={loading || readError}>
                    编辑
                  </button>
                  <button type="button" className="text-button source-remove-button" onClick={() => void removeAdditionalSource(index)} disabled={loading || readError}>
                    移除
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
      <button
        type="button"
        className="text-button source-add-trigger"
        onClick={() => {
          setShowAdditionalForm((visible) => !visible);
          setAdditionalStatus("");
        }}
        aria-expanded={showAdditionalForm}
      >
        {showAdditionalForm ? "收起新增来源" : "添加另一条来源"}
      </button>
      {showAdditionalForm && (
        <div className="source-add-panel">
          <div className="source-ref-grid">
            <label>
              新增来源类型
              <select
                value={additionalDraft.kind}
                onChange={(event) => updateAdditionalDraft("kind", event.target.value as SourceKind)}
                disabled={loading || readError}
              >
                {(Object.keys(SOURCE_KIND_LABELS) as SourceKind[]).map((sourceKind) => (
                  <option key={sourceKind} value={sourceKind}>{SOURCE_KIND_LABELS[sourceKind]}</option>
                ))}
              </select>
            </label>
            <label>
              新增来源名称
              <input
                value={additionalDraft.source}
                onChange={(event) => updateAdditionalDraft("source", event.target.value)}
                placeholder="例如：另一部参考书或视频"
                disabled={loading || readError}
              />
            </label>
          </div>
          <div className="source-ref-grid">
            <label>
              新增作者 / 频道（可选）
              <input
                value={additionalDraft.author}
                onChange={(event) => updateAdditionalDraft("author", event.target.value)}
                placeholder="作者、频道或讲述者"
                disabled={loading || readError}
              />
            </label>
            <label>
              新增版本 / 出版信息（可选）
              <input
                value={additionalDraft.edition}
                onChange={(event) => updateAdditionalDraft("edition", event.target.value)}
                placeholder="例如：修订版 / 出版社"
                disabled={loading || readError}
              />
            </label>
          </div>
          <label>
            新增定位（页码、章节或时间点）
            <input
              value={additionalDraft.locator}
              onChange={(event) => updateAdditionalDraft("locator", event.target.value)}
              placeholder="例如：第 12 页 / 08:30"
              disabled={loading || readError}
            />
          </label>
          <div className="source-ref-grid">
            <label>
              新增链接（可选）
              <input
                type="url"
                value={additionalDraft.url}
                onChange={(event) => updateAdditionalDraft("url", event.target.value)}
                placeholder="https://…"
                disabled={loading || readError}
              />
            </label>
            <label>
              新增访问日期（可选）
              <input
                type="date"
                value={additionalDraft.accessedAt}
                onChange={(event) => updateAdditionalDraft("accessedAt", event.target.value)}
                disabled={loading || readError}
              />
            </label>
          </div>
          <div className="source-add-actions">
            <button type="button" className="outline-button" onClick={() => void saveAdditionalSource()} disabled={loading || readError}>
              保存新增来源
            </button>
            {additionalStatus && <small role="status">{additionalStatus}</small>}
          </div>
        </div>
      )}
      <div className="source-ref-grid">
        <label>
          作者 / 频道（可选）
          <input value={author} onChange={(event) => updateAuthor(event.target.value)} onBlur={() => void saveSource()} placeholder="作者、频道或讲述者" disabled={loading || readError} />
        </label>
        <label>
          版本 / 出版信息（可选）
          <input value={edition} onChange={(event) => updateEdition(event.target.value)} onBlur={() => void saveSource()} placeholder="例如：修订版 / 出版社" disabled={loading || readError} />
        </label>
      </div>
      <label>
        定位（页码、章节或时间点）
        <input value={locator} onChange={(event) => updateLocator(event.target.value)} onBlur={() => void saveSource()} placeholder={locatorPlaceholder} disabled={loading || readError} />
      </label>
      <div className="source-ref-grid">
        <label>
          链接（可选）
          <input type="url" value={url} onChange={(event) => updateUrl(event.target.value)} onBlur={() => void saveSource()} placeholder="https://…" disabled={loading || readError} />
        </label>
        <label>
          访问日期（可选）
          <input type="date" value={accessedAt} onChange={(event) => updateAccessedAt(event.target.value)} onBlur={() => void saveSource()} disabled={loading || readError} />
        </label>
      </div>
      {sourceStatus && (
        <small className={sourceStatus.startsWith("链接") ? "source-error" : "source-saved"} role="status">
          {sourceStatus}
        </small>
      )}
      <div className="source-template-actions">
        <button type="button" className="text-button" onClick={copyCurrentSource} disabled={loading || readError || !source.trim()}>
          复制当前来源
        </button>
        <button type="button" className="text-button" onClick={pasteSourceTemplate} disabled={loading || readError || !hasSourceTemplate}>
          粘贴来源模板
        </button>
        {templateStatus && <small role="status">{templateStatus}</small>}
      </div>
    </div>
  );
}
