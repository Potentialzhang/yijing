"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { DATA_CHANGED_EVENT, notifyDataChanged } from "@/db/events";
import { type ContentErratumRecord } from "@/db/schema";
import { listErrataForTarget, putErratum, updateErratumAtomically } from "@/db/repository";
import { compareIsoTimestamps, formatLocalDateTime } from "@/core/date/local";

interface ContentErrataProps {
  targetType: ContentErratumRecord["targetType"];
  targetId: string;
  contentVersion?: number;
}

function makeId(): string { return globalThis.crypto?.randomUUID?.() ?? `errata-${Date.now()}-${Math.random().toString(16).slice(2)}`; }

export function ContentErrata({ targetType, targetId, contentVersion = 1 }: ContentErrataProps) {
  const [items, setItems] = useState<ContentErratumRecord[]>([]);
  const [category, setCategory] = useState<ContentErratumRecord["category"]>("question");
  const [description, setDescription] = useState("");
  const [proposedText, setProposedText] = useState("");
  const [sourceRef, setSourceRef] = useState("");
  const [status, setStatus] = useState("");
  const [loading, setLoading] = useState(true);
  const [readError, setReadError] = useState(false);
  const [writing, setWriting] = useState(false);
  const [retryVersion, setRetryVersion] = useState(0);
  const refreshSequence = useRef(0);
  const mountedRef = useRef(false);
  const lastTarget = useRef(`${targetType}:${targetId}`);

  const refresh = useCallback(() => {
    const sequence = ++refreshSequence.current;
    void listErrataForTarget(targetId).then((records) => {
      if (sequence !== refreshSequence.current) return;
      setLoading(false);
      setReadError(false);
      setItems(records.filter((item) => item.targetType === targetType).sort((a, b) => compareIsoTimestamps(b.updatedAt, a.updatedAt)));
    }).catch(() => {
      if (sequence !== refreshSequence.current) return;
      setLoading(false);
      setReadError(true);
      setStatus("勘误记录暂时无法读取");
    });
  }, [targetId, targetType]);
  useEffect(() => {
    mountedRef.current = true;
    const targetKey = `${targetType}:${targetId}`;
    if (lastTarget.current !== targetKey) {
      lastTarget.current = targetKey;
      setItems([]);
      setLoading(true);
      setReadError(false);
      setStatus("");
    }
    refresh();
    window.addEventListener(DATA_CHANGED_EVENT, refresh);
    return () => {
      mountedRef.current = false;
      refreshSequence.current += 1;
      window.removeEventListener(DATA_CHANGED_EVENT, refresh);
    };
  }, [refresh, retryVersion, targetId, targetType]);

  function retryRead(): void {
    setLoading(true);
    setReadError(false);
    setStatus("");
    setRetryVersion((value) => value + 1);
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (loading || readError || writing) return;
    if (!description.trim()) { setStatus("请先写下疑问或需要修订的地方。"); return; }
    setWriting(true);
    try {
      const now = new Date().toISOString();
      await putErratum({ id: makeId(), targetType, targetId, category, description: description.trim(), proposedText: proposedText.trim(), sourceRef: sourceRef.trim(), contentVersion, status: "open", history: [{ status: "open", at: now }], createdAt: now, updatedAt: now });
      notifyDataChanged();
      if (!mountedRef.current) return;
      setDescription(""); setProposedText(""); setSourceRef(""); setStatus("已记录，后续可根据底本复核。");
    } catch {
      if (mountedRef.current) setStatus("勘误保存失败，请检查浏览器存储权限后重试");
    } finally {
      if (mountedRef.current) setWriting(false);
    }
  }

  async function toggleResolved(item: ContentErratumRecord) {
    if (loading || readError || writing) return;
    setWriting(true);
    try {
      const updatedAt = new Date().toISOString();
      const didWrite = await updateErratumAtomically(item.id, (current) => {
        // Treat a stale list item as a conflict instead of accidentally
        // reversing a status change made in another tab.
        if (current.status !== item.status) return false;
        const nextStatus = current.status === "open" ? "resolved" : "open";
        return {
          ...current,
          status: nextStatus,
          history: [...(current.history ?? []), { status: nextStatus, at: updatedAt }],
          updatedAt,
        };
      });
      if (!didWrite) {
        if (mountedRef.current) setStatus("勘误记录已被其他标签页更新或移除，请刷新后重试");
        return;
      }
      notifyDataChanged();
    } catch {
      if (mountedRef.current) setStatus("勘误状态更新失败，请稍后重试");
    } finally {
      if (mountedRef.current) setWriting(false);
    }
  }

  const writeDisabled = loading || readError || writing;
  return <section className="content-errata"><details><summary>记录内容疑问或勘误</summary><form onSubmit={(event) => void submit(event)}><label>类型<select value={category} onChange={(event) => setCategory(event.target.value as ContentErratumRecord["category"])} disabled={writeDisabled}><option value="question">我有一个疑问</option><option value="correction">可能需要修订</option></select></label><label>描述<textarea value={description} onChange={(event) => setDescription(event.target.value)} placeholder="例如：这里的卦名与我的底本不同……" required disabled={writeDisabled} /></label><label>建议文本（可选）<textarea value={proposedText} onChange={(event) => setProposedText(event.target.value)} placeholder="只写自己的建议，不会自动替换页面内容" disabled={writeDisabled} /></label><label>来源或定位（可选）<input value={sourceRef} onChange={(event) => setSourceRef(event.target.value)} placeholder="书名、版本、页码或链接" disabled={writeDisabled} /></label><button type="submit" className="outline-button" disabled={writeDisabled}>{writing ? "正在保存…" : "保存记录"}</button>{status && !readError && <small role="status">{status}</small>}</form></details>{loading && <p className="content-errata-state" role="status">正在读取本地勘误记录…</p>}{writing && <p className="content-errata-state" role="status">正在保存勘误记录…</p>}{readError && <div className="content-errata-state is-error" role="alert"><span>勘误记录暂时无法读取，已保护当前表单内容。</span><button type="button" className="outline-button" onClick={retryRead}>重新读取</button></div>}{items.length > 0 && <div className="errata-list"><strong>本地记录 · {items.length} 条</strong>{items.map((item) => <article key={item.id} className={item.status === "resolved" ? "is-resolved" : ""}><div><span>{item.category === "question" ? "疑问" : "勘误"} · 内容版本 {item.contentVersion}</span><p>{item.description}</p>{item.proposedText && <small>建议：{item.proposedText}</small>}{item.sourceRef && <small>来源：{item.sourceRef}</small>}<details className="erratum-history"><summary>状态历史 · {(item.history ?? []).length} 条</summary><ol>{(item.history ?? []).map((entry, index) => <li key={`${item.id}-history-${index}`}><span>{entry.status === "open" ? "待处理" : "已处理"}</span><time dateTime={entry.at}>{formatLocalDateTime(entry.at)}</time></li>)}</ol></details></div><button type="button" className="text-button" onClick={() => void toggleResolved(item)} disabled={writeDisabled}>{item.status === "open" ? "标记已处理" : "恢复待处理"}</button></article>)}</div>}</section>;
}
