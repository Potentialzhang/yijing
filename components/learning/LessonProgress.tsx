"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { DATA_CHANGED_EVENT, notifyDataChanged } from "@/db/events";
import { captureLocalNow } from "@/core/date/local";
import { getConceptProgress, markLessonProgress } from "@/db/repository";

const statusLabels = { not_started: "还没有开始", learning: "学习中", reviewing: "已完成本节，待复习", mastered: "已掌握" } as const;

export function LessonProgress({ conceptId }: { conceptId: string }) {
  const [status, setStatus] = useState("还没有开始");
  const [loaded, setLoaded] = useState(false);
  const [readError, setReadError] = useState(false);
  const [saving, setSaving] = useState(false);
  const refreshSequence = useRef(0);
  const mountedRef = useRef(false);
  const displayStatus = useCallback((progressStatus: keyof typeof statusLabels) => statusLabels[progressStatus], []);
  const refresh = useCallback(() => {
    const sequence = ++refreshSequence.current;
    setLoaded(false);
    setReadError(false);
    void getConceptProgress(conceptId)
      .then((progress) => {
        if (sequence !== refreshSequence.current) return;
        setStatus(progress ? displayStatus(progress.status) : statusLabels.not_started);
        setReadError(false);
      })
      .catch(() => {
        if (sequence !== refreshSequence.current) return;
        setStatus("无法读取状态");
        setReadError(true);
      })
      .finally(() => { if (sequence === refreshSequence.current) setLoaded(true); });
  }, [conceptId, displayStatus]);
  useEffect(() => {
    mountedRef.current = true;
    const timer = window.setTimeout(refresh, 0);
    window.addEventListener(DATA_CHANGED_EVENT, refresh);
    return () => { mountedRef.current = false; refreshSequence.current += 1; window.clearTimeout(timer); window.removeEventListener(DATA_CHANGED_EVENT, refresh); };
  }, [refresh]);
  async function markStarted() {
    if (!loaded || readError || saving) return;
    setSaving(true);
    const { iso: now, localDate: today } = captureLocalNow();
    try {
      const nextProgress = await markLessonProgress(conceptId, 10, now, today, false);
      notifyDataChanged();
      if (!mountedRef.current) return;
      setStatus(displayStatus(nextProgress.status));
      setReadError(false);
    } catch { if (mountedRef.current) setStatus("保存失败，请重试"); }
    finally { if (mountedRef.current) setSaving(false); }
  }
  async function markCompleted() {
    if (!loaded || readError || saving) return;
    setSaving(true);
    const { iso: now, localDate: today } = captureLocalNow();
    try {
      const nextProgress = await markLessonProgress(conceptId, 40, now, today, true);
      notifyDataChanged();
      if (!mountedRef.current) return;
      setStatus(displayStatus(nextProgress.status));
      setReadError(false);
    } catch { if (mountedRef.current) setStatus("保存失败，请重试"); }
    finally { if (mountedRef.current) setSaving(false); }
  }
  return <div className="lesson-progress"><div><span className="content-label">学习状态</span><strong>{loaded ? status : "正在读取…"}</strong>{readError && <small className="lesson-progress-error" role="alert">状态暂时无法读取 <button type="button" className="text-button" onClick={refresh}>重试读取</button></small>}</div><div className="lesson-actions"><button type="button" className="outline-button" onClick={() => void markStarted()} disabled={!loaded || readError || saving}>开始学习</button><button type="button" className="primary-button" onClick={() => void markCompleted()} disabled={!loaded || readError || saving}>完成本节 <span>✓</span></button><Link className="text-button" href="/review">去练习 →</Link></div></div>;
}
