"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { DATA_CHANGED_EVENT } from "@/db/events";
import { getConceptProgress } from "@/db/repository";

type Prerequisite = { id: string; title: string };

export function PrerequisiteNotice({ prerequisites }: { prerequisites: readonly Prerequisite[] }) {
  const [incomplete, setIncomplete] = useState<Prerequisite[]>([]);
  const [loading, setLoading] = useState(prerequisites.length > 0);
  const [readError, setReadError] = useState(false);
  const refreshSequence = useRef(0);

  const refresh = useCallback(() => {
    const sequence = ++refreshSequence.current;
    if (prerequisites.length === 0) {
      setIncomplete([]);
      setLoading(false);
      setReadError(false);
      return;
    }
    setLoading(true);
    setReadError(false);
    void Promise.all(prerequisites.map(async (item) => ({ item, progress: await getConceptProgress(item.id) })))
      .then((items) => {
        if (sequence !== refreshSequence.current) return;
        setIncomplete(items.filter(({ progress }) => progress?.status !== "mastered").map(({ item }) => item));
        setLoading(false);
      })
      .catch(() => {
        if (sequence !== refreshSequence.current) return;
        setReadError(true);
        setIncomplete([...prerequisites]);
        setLoading(false);
      });
  }, [prerequisites]);

  useEffect(() => {
    const timer = window.setTimeout(refresh, 0);
    window.addEventListener(DATA_CHANGED_EVENT, refresh);
    return () => {
      refreshSequence.current += 1;
      window.clearTimeout(timer);
      window.removeEventListener(DATA_CHANGED_EVENT, refresh);
    };
  }, [refresh]);

  if (prerequisites.length === 0) return null;
  if (loading) {
    return (
      <section className="pending-content prerequisite-notice prerequisite-loading" aria-label="前置知识提示" role="status">
        <span className="content-label">学习建议</span>
        <p>正在读取前置知识状态…</p>
      </section>
    );
  }
  if (incomplete.length === 0) return null;
  return (
    <section className="pending-content prerequisite-notice" aria-label="前置知识提示">
      <span className="content-label">学习建议</span>
      <h2>{readError ? "前置知识状态暂时无法读取" : "建议先回顾前置知识"}</h2>
      <p>{readError ? "仍可继续浏览当前内容；稍后可以直接重试读取状态。" : "仍可继续浏览当前内容，但先完成这些知识点会更容易理解。"}</p>
      {readError && <button type="button" className="text-button" onClick={() => void refresh()}>重试读取</button>}
      <div className="prerequisite-links">
        {incomplete.map((item) => <Link href={`/learn/${item.id}`} key={item.id}>{item.title} ↗</Link>)}
      </div>
    </section>
  );
}
