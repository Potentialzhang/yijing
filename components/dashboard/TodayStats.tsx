"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { readStudySnapshot } from "@/db/repository";
import { calculateMastery } from "@/core/review/mastery";
import { getDueReviewCards } from "@/core/review/queue";
import { calculateStudyStreak, calculateWeeklyAccuracy, latestStudyPosition, studyDates } from "@/core/review/stats";
import { isSupportedReviewAlgorithm, isValidReviewState } from "@/core/review/scheduler";
import { DATA_CHANGED_EVENT } from "@/db/events";
import { KNOWLEDGE_CONCEPTS } from "@/content/knowledge";
import { FIVE_ELEMENTS } from "@/content/five-elements";
import { REVIEW_EXERCISES } from "@/content/exercises";
import { TRIGRAMS, getHexagramByNumber } from "@/core/iching";
import Link from "next/link";
import { formatLocalDate, formatLocalDateLabel } from "@/core/date/local";
import { watchLocalDateRollover } from "@/core/browser/date-rollover";
import { StudyDataError } from "@/components/dashboard/StudyDataError";
import { StudyDataLoading } from "@/components/dashboard/StudyDataLoading";

function today() { return formatLocalDate(); }
const REVIEW_CARD_IDS = new Set(REVIEW_EXERCISES.map((exercise) => exercise.id));
const CONCEPT_IDS = new Set(KNOWLEDGE_CONCEPTS.map((concept) => concept.id));

function hexagramNumber(targetId: string): number | null {
  const number = Number(targetId.replace("hexagram-", ""));
  return Number.isInteger(number) && number >= 1 && number <= 64 ? number : null;
}

function positionLabel(targetType: string, targetId: string): string {
  if (targetType === "concept") return `知识点 · ${KNOWLEDGE_CONCEPTS.find((concept) => concept.id === targetId)?.title ?? "内容已不可用"}`;
  if (targetType === "trigram") return `八卦 · ${TRIGRAMS.find((trigram) => trigram.id === targetId)?.name ?? "内容已不可用"}`;
  if (targetType === "hexagram") {
    const number = hexagramNumber(targetId);
    if (number !== null) return `六十四卦 · ${getHexagramByNumber(number).name}`;
    return "六十四卦 · 内容已不可用";
  }
  if (targetType === "five-element") return `五行 · ${FIVE_ELEMENTS.find((element) => element.id === targetId)?.name ?? "内容已不可用"}`;
  return `${targetType} · ${targetId}`;
}

function positionHref(targetType: string, targetId: string): string {
  if (targetType === "concept") return KNOWLEDGE_CONCEPTS.some((concept) => concept.id === targetId) ? `/learn/${encodeURIComponent(targetId)}` : "/learn";
  if (targetType === "trigram") return TRIGRAMS.some((trigram) => trigram.id === targetId) ? `/trigrams/${encodeURIComponent(targetId)}` : "/trigrams";
  if (targetType === "hexagram") {
    const number = hexagramNumber(targetId);
    return number === null ? "/hexagrams" : `/hexagrams/${number}`;
  }
  if (targetType === "five-element") return FIVE_ELEMENTS.some((element) => element.id === targetId) ? `/tools/five-elements?element=${encodeURIComponent(targetId)}` : "/tools/five-elements";
  return "/learn";
}

type RecentPosition = { label: string; href: string };

export function TodayStats() {
  const [dueCount, setDueCount] = useState(0);
  const [progressCount, setProgressCount] = useState(0);
  const [reviewCount, setReviewCount] = useState(0);
  const [mastery, setMastery] = useState(0);
  const [streak, setStreak] = useState(0);
  const [weeklyAccuracy, setWeeklyAccuracy] = useState<number | null>(null);
  const [recentPosition, setRecentPosition] = useState<RecentPosition | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const refreshSequence = useRef(0);
  const refresh = useCallback(() => {
    const sequence = ++refreshSequence.current;
    const date = today();
    void readStudySnapshot().then(({ reviewCardStates: states, conceptProgress: progress, reviewAttempts: attempts }) => {
      if (sequence !== refreshSequence.current) return;
      setLoading(false);
      setLoadError(false);
      const knownStates = states.filter((state) => REVIEW_CARD_IDS.has(state.cardId));
      const knownProgress = progress.filter((item) => CONCEPT_IDS.has(item.conceptId));
      const stateByCardId = new Map(knownStates.map((state) => [state.cardId, state]));
      const knownAttempts = attempts.filter((attempt) => {
        if (!REVIEW_CARD_IDS.has(attempt.cardId)) return false;
        const state = stateByCardId.get(attempt.cardId);
        return state !== undefined && isSupportedReviewAlgorithm(state) && isValidReviewState(state);
      });
      const due = getDueReviewCards(REVIEW_EXERCISES, knownStates, date).length;
      setDueCount(due); setProgressCount(knownProgress.length); setReviewCount(knownAttempts.length);
      setMastery(calculateMastery(knownAttempts.map((attempt) => attempt.recallGrade)));
      setStreak(calculateStudyStreak(studyDates(knownAttempts, knownProgress), date));
      setWeeklyAccuracy(calculateWeeklyAccuracy(knownAttempts, date));
      const latest = latestStudyPosition(knownAttempts, knownStates, knownProgress);
      setRecentPosition(latest ? { label: `${positionLabel(latest.targetType, latest.targetId)} · ${formatLocalDateLabel(latest.at)}`, href: positionHref(latest.targetType, latest.targetId) } : null);
    }).catch(() => {
      if (sequence === refreshSequence.current) {
        setLoading(false);
        setLoadError(true);
      }
    });
  }, []);
  useEffect(() => {
    refresh();
    window.addEventListener(DATA_CHANGED_EVENT, refresh);
    // A tab can remain open across local midnight. Poll cheaply and only
    // reload the snapshot when the calendar date actually changes, so the
    // dashboard does not keep yesterday's due count/streak indefinitely.
    const stopDateWatcher = watchLocalDateRollover(today, refresh);
    return () => {
      refreshSequence.current += 1;
      window.removeEventListener(DATA_CHANGED_EVENT, refresh);
      stopDateWatcher();
    };
  }, [refresh]);
  const completion = Math.max(mastery, Math.min(100, Math.round((progressCount / KNOWLEDGE_CONCEPTS.length) * 100)));
  if (loading) return <div className="stats-card"><div className="stat-heading"><span>学习概览</span><span className="soft-badge">账户记录</span></div><StudyDataLoading /></div>;
  return <div className="stats-card"><div className="stat-heading"><span>学习概览</span><span className="soft-badge">账户记录</span></div>{loadError ? <StudyDataError onRetry={refresh} /> : <><div className="stat-main"><strong>{dueCount}</strong><span>张卡片<br />待复习</span></div><div className="progress-track" role="progressbar" aria-label="总体掌握参考" aria-valuemin={0} aria-valuemax={100} aria-valuenow={completion} aria-valuetext={`${completion}%`}><span style={{ width: `${completion}%` }} /></div><div className="stat-foot"><span>总体掌握参考</span><strong>{completion}%</strong></div><div className="stat-divider" /><div className="mini-stats"><div><strong>{reviewCount}</strong><span>累计作答次数</span></div><div><strong>{progressCount}</strong><span>已开始知识点</span></div><div><strong>{streak}</strong><span>连续学习天数</span></div><div><strong>{weeklyAccuracy === null ? "—" : `${weeklyAccuracy}%`}</strong><span>近七日正确率</span></div></div><div className="recent-position"><span>最近位置</span>{recentPosition ? <Link className="recent-position-link" href={recentPosition.href}><strong>{recentPosition.label}</strong><span>继续学习 ↗</span></Link> : <strong>还没有学习记录</strong>}</div><Link className="stats-link" href="/stats">查看周/月统计 ↗</Link></>}</div>;
}
