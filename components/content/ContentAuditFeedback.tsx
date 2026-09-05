"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { DATA_CHANGED_EVENT } from "@/db/events";
import { type ContentErratumRecord } from "@/db/schema";
import { readErrataSummarySnapshot } from "@/db/repository";
import { HEXAGRAMS, TRIGRAMS } from "@/core/iching";
import { KNOWLEDGE_CONCEPTS } from "@/content/knowledge";
import { compareIsoTimestamps } from "@/core/date/local";
import { parseHexagramLineTarget } from "@/core/notes/targets";
import Link from "next/link";

function targetHref(item: ContentErratumRecord): string {
  if (item.targetType === "concept") return KNOWLEDGE_CONCEPTS.some((concept) => concept.id === item.targetId) ? `/learn/${item.targetId}` : "/learn";
  if (item.targetType === "trigram") return TRIGRAMS.some((trigram) => trigram.id === item.targetId) ? `/trigrams/${item.targetId}` : "/trigrams";
  const lineTarget = item.targetType === "hexagram_line"
    ? parseHexagramLineTarget(item.targetId)
    : null;
  const hexagramId = item.targetType === "hexagram_line" ? lineTarget?.hexagramId : item.targetId;
  const hexagram = HEXAGRAMS.find((candidate) => candidate.id === hexagramId);
  if (!hexagram) return "/hexagrams";
  return item.targetType === "hexagram_line" && lineTarget
    ? `/hexagrams/${hexagram.kingWenNumber}#line-${lineTarget.position}`
    : `/hexagrams/${hexagram.kingWenNumber}`;
}

export function ContentAuditFeedback() {
  const [counts, setCounts] = useState({ open: 0, resolved: 0 });
  const [openItems, setOpenItems] = useState<ContentErratumRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const refreshSequence = useRef(0);
  const refresh = useCallback(() => {
    const sequence = ++refreshSequence.current;
    void readErrataSummarySnapshot().then(({ open, resolved }) => {
      if (sequence !== refreshSequence.current) return;
      setLoading(false);
      setLoadError(false);
      setOpenItems(open.sort((a, b) => compareIsoTimestamps(b.updatedAt, a.updatedAt)));
      setCounts({ open: open.length, resolved });
    }).catch(() => {
      if (sequence !== refreshSequence.current) return;
      setLoading(false);
      setLoadError(true);
    });
  }, []);

  useEffect(() => {
    refresh();
    window.addEventListener(DATA_CHANGED_EVENT, refresh);
    return () => {
      refreshSequence.current += 1;
      window.removeEventListener(DATA_CHANGED_EVENT, refresh);
    };
  }, [refresh]);

  if (loading) return (
    <section className="content-audit-feedback" aria-label="本地勘误汇总">
      <div>
        <span className="content-label">用户反馈</span>
        <h2>把疑问留在复核队列里。</h2>
      </div>
      <p className="content-audit-feedback-state" role="status" aria-live="polite">正在读取本地勘误记录…</p>
    </section>
  );

  if (loadError) return (
    <section className="content-audit-feedback" aria-label="本地勘误汇总">
      <div>
        <span className="content-label">用户反馈</span>
        <h2>把疑问留在复核队列里。</h2>
      </div>
      <div className="content-audit-feedback-state is-error" role="alert">
        <strong>勘误记录暂时无法读取</strong>
        <span>已有反馈不会因本次读取失败而被删除，请检查浏览器存储权限后重试。</span>
        <button type="button" className="outline-button" onClick={refresh}>重新读取</button>
      </div>
    </section>
  );

  return (
    <section className="content-audit-feedback" aria-label="本地勘误汇总">
      <div>
        <span className="content-label">用户反馈</span>
        <h2>把疑问留在复核队列里。</h2>
      </div>
      <p aria-live="polite">
        {counts.open > 0
          ? `当前有 ${counts.open} 条待处理勘误记录。打开对应内容页即可补充来源或定位。`
          : "当前没有待处理勘误记录。你可以在卦象或知识点详情页记录疑问。"}
      </p>
      {openItems.length > 0 && (
        <ul className="content-audit-feedback-list">
          {openItems.slice(0, 5).map((item) => (
            <li key={item.id}>
              <span>{item.category === "question" ? "疑问" : "勘误"} · {item.description}</span>
              <Link href={targetHref(item)}>打开内容 ↗</Link>
            </li>
          ))}
        </ul>
      )}
      {openItems.length > 5 && <small>还有 {openItems.length - 5} 条待处理记录，请从对应内容页继续查看。</small>}
      <small>已处理 {counts.resolved} 条 · 勘误只保存在当前浏览器，不会自动替换内置内容。</small>
    </section>
  );
}
