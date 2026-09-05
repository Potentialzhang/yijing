"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { REVIEW_EXERCISES } from "@/content/exercises";
import { formatLocalDate } from "@/core/date/local";
import { watchLocalDateRollover } from "@/core/browser/date-rollover";
import {
  REVIEW_INTERVAL_DAYS,
  isSupportedReviewAlgorithm,
  isValidReviewState,
} from "@/core/review/scheduler";
import { DATA_CHANGED_EVENT } from "@/db/events";
import { type ReviewCardState } from "@/db/schema";
import { getReviewCardState } from "@/db/repository";

const statusLabels = {
  not_started: "未开始",
  learning: "学习中",
  reviewing: "待复习",
  mastered: "已掌握",
  unsupported: "待迁移",
  invalid: "数据待修复",
} as const;

export type ReviewTargetStatus = keyof typeof statusLabels;
type ReviewTargetType = "trigram" | "hexagram" | "five-element";

export function deriveReviewTargetStatus(
  state: ReviewCardState | undefined,
  today: string,
): ReviewTargetStatus {
  if (!state) return "not_started";
  if (!isSupportedReviewAlgorithm(state)) return "unsupported";
  if (!isValidReviewState(state)) return "invalid";
  if (state.dueDate <= today) return "reviewing";
  if (state.stepIndex >= REVIEW_INTERVAL_DAYS.length - 1 && state.consecutivePasses >= 2) return "mastered";
  return "learning";
}

export function ReviewTargetLearningStatus({ targetType, targetId }: { targetType: ReviewTargetType; targetId: string }) {
  const card = REVIEW_EXERCISES.find((exercise) => exercise.targetType === targetType && exercise.targetId === targetId);
  const [status, setStatus] = useState<ReviewTargetStatus>("not_started");
  const [nextDue, setNextDue] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const refreshSequence = useRef(0);
  const lastTarget = useRef(`${targetType}:${targetId}`);
  const refresh = useCallback(() => {
    const sequence = ++refreshSequence.current;
    const today = formatLocalDate();
    if (!card) {
      setLoading(false);
      setLoadError(false);
      setStatus("not_started");
      setNextDue(null);
      return;
    }
    void getReviewCardState(card.id).then((state) => {
      if (sequence !== refreshSequence.current) return;
      setLoading(false);
      setLoadError(false);
      const nextStatus = deriveReviewTargetStatus(state, today);
      setStatus(nextStatus);
      setNextDue(
        nextStatus !== "invalid" &&
          nextStatus !== "unsupported" &&
          state &&
          state.dueDate > today
          ? state.dueDate
          : null,
      );
    }).catch(() => {
      if (sequence !== refreshSequence.current) return;
      setLoading(false);
      setLoadError(true);
      setStatus("not_started");
      setNextDue(null);
    });
  }, [card]);

  useEffect(() => {
    const targetKey = `${targetType}:${targetId}`;
    if (lastTarget.current !== targetKey) {
      lastTarget.current = targetKey;
      setLoading(true);
      setLoadError(false);
      setStatus("not_started");
      setNextDue(null);
    }
    const timer = window.setTimeout(refresh, 0);
    window.addEventListener(DATA_CHANGED_EVENT, refresh);
    const stopDateWatcher = watchLocalDateRollover(formatLocalDate, refresh);
    return () => {
      refreshSequence.current += 1;
      window.clearTimeout(timer);
      window.removeEventListener(DATA_CHANGED_EVENT, refresh);
      stopDateWatcher();
    };
  }, [refresh, targetId, targetType]);

  if (loading) {
    return <div className="hexagram-learning-status is-loading" aria-label="学习状态：正在读取" role="status">正在读取学习状态…</div>;
  }
  if (loadError) {
    return <div className="hexagram-learning-status is-error" aria-label="学习状态：暂时无法读取" role="alert"><span>学习状态暂时无法读取</span><button type="button" className="text-button" onClick={refresh}>重新读取</button></div>;
  }

  return (
    <div className="hexagram-learning-status" aria-label={`学习状态：${statusLabels[status]}`}>
      <span className={`lesson-status lesson-status-${status}`}><i aria-hidden="true" />学习状态：{statusLabels[status]}</span>
      {nextDue && <small>下一次复习：{nextDue}</small>}
      {status === "reviewing" && <Link className="text-button" href="/review">现在复习 →</Link>}
      {(status === "invalid" || status === "unsupported") && (
        <Link className="text-button" href="/settings/data">打开数据设置 →</Link>
      )}
    </div>
  );
}
