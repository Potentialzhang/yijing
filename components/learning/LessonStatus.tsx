"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { DATA_CHANGED_EVENT } from "@/db/events";
import { getConceptProgress } from "@/db/repository";

const labels = { not_started: "未开始", learning: "学习中", reviewing: "待复习", mastered: "已掌握" } as const;

export function LessonStatus({ conceptId }: { conceptId: string }) {
  const [status, setStatus] = useState<keyof typeof labels>("not_started");
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const refreshSequence = useRef(0);
  const lastConceptId = useRef(conceptId);
  const refresh = useCallback(() => {
    const sequence = ++refreshSequence.current;
    void getConceptProgress(conceptId).then((progress) => {
      if (sequence !== refreshSequence.current) return;
      setStatus(progress?.status ?? "not_started");
      setLoading(false);
      setLoadError(false);
    }).catch(() => {
      if (sequence !== refreshSequence.current) return;
      setLoading(false);
      setLoadError(true);
    });
  }, [conceptId]);
  useEffect(() => {
    if (lastConceptId.current !== conceptId) {
      lastConceptId.current = conceptId;
      setLoading(true);
      setLoadError(false);
      setStatus("not_started");
    }
    refresh();
    window.addEventListener(DATA_CHANGED_EVENT, refresh);
    return () => {
      refreshSequence.current += 1;
      window.removeEventListener(DATA_CHANGED_EVENT, refresh);
    };
  }, [conceptId, refresh]);
  if (loading) return <span className="lesson-status lesson-status-loading" role="status" aria-label="学习状态：正在读取"><i aria-hidden="true" />正在读取…</span>;
  if (loadError) return <span className="lesson-status lesson-status-error" role="alert"><i aria-hidden="true" /><span>学习状态暂时无法读取</span><button type="button" onClick={refresh}>重试</button></span>;
  return <span className={`lesson-status lesson-status-${status}`} aria-label={`学习状态：${labels[status]}`}><i aria-hidden="true" />{labels[status]}</span>;
}
