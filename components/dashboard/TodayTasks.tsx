"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { readStudySnapshot } from "@/db/repository";
import { KNOWLEDGE_CONCEPTS } from "@/content/knowledge";
import { REVIEW_EXERCISES } from "@/content/exercises";
import { DATA_CHANGED_EVENT } from "@/db/events";
import { compareIsoTimestamps, formatLocalDate } from "@/core/date/local";
import { watchLocalDateRollover } from "@/core/browser/date-rollover";
import { getDueReviewCards } from "@/core/review/queue";
import { summarizeTodayReviewTask, type TodayReviewSummary } from "@/core/review/today";
import { StudyDataError } from "@/components/dashboard/StudyDataError";
import { StudyDataLoading } from "@/components/dashboard/StudyDataLoading";

function localDate() { return formatLocalDate(); }
const CONCEPT_IDS = new Set(KNOWLEDGE_CONCEPTS.map((concept) => concept.id));
const REVIEW_CARD_IDS = new Set(REVIEW_EXERCISES.map((exercise) => exercise.id));

export function TodayTasks() {
  const [due, setDue] = useState(0);
  const [started, setStarted] = useState(0);
  const [suggestedId, setSuggestedId] = useState(KNOWLEDGE_CONCEPTS[0].id);
  const [suggestedTitle, setSuggestedTitle] = useState(KNOWLEDGE_CONCEPTS[0].title);
  const [todayReview, setTodayReview] = useState<TodayReviewSummary>({ completedSpacedCount: 0, nextReviewDate: null });
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const refreshSequence = useRef(0);
  const refresh = useCallback(() => {
    const sequence = ++refreshSequence.current;
    const date = localDate();
    void readStudySnapshot().then(({ reviewCardStates: states, conceptProgress: progress, reviewAttempts: attempts }) => {
      if (sequence !== refreshSequence.current) return;
      setLoading(false);
      setLoadError(false);
      const knownProgress = progress.filter((item) => CONCEPT_IDS.has(item.conceptId));
      const dueCount = getDueReviewCards(REVIEW_EXERCISES, states, date).length;
      setDue(dueCount); setStarted(knownProgress.length);
      setTodayReview(summarizeTodayReviewTask(attempts, states, date, REVIEW_CARD_IDS));
      const next = KNOWLEDGE_CONCEPTS.find((concept) => !knownProgress.some((item) => item.conceptId === concept.id));
      const fallback = [...knownProgress].sort((a, b) => a.masteryScore - b.masteryScore || compareIsoTimestamps(a.updatedAt, b.updatedAt)).map((item) => KNOWLEDGE_CONCEPTS.find((concept) => concept.id === item.conceptId)).find((concept): concept is (typeof KNOWLEDGE_CONCEPTS)[number] => Boolean(concept)) ?? KNOWLEDGE_CONCEPTS[0];
      setSuggestedId((next ?? fallback).id); setSuggestedTitle((next ?? fallback).title);
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
    // Re-read after local midnight when the user leaves the page open; data
    // writes still use the same event-driven path and do not poll more often.
    const stopDateWatcher = watchLocalDateRollover(localDate, refresh);
    return () => {
      refreshSequence.current += 1;
      window.removeEventListener(DATA_CHANGED_EVENT, refresh);
      stopDateWatcher();
    };
  }, [refresh]);
  if (loading) return <section className="today-tasks" aria-label="今日任务"><StudyDataLoading /></section>;
  const completedToday = due === 0 && todayReview.completedSpacedCount > 0;
  const title = due
    ? `有 ${due} 张卡片等你回忆`
    : completedToday
      ? `今天已完成 ${todayReview.completedSpacedCount} 张复习卡`
      : started
        ? `建议继续：${suggestedTitle}`
        : `从「${suggestedTitle}」开始`;
  const description = due
    ? "先完成到期复习，再开始新内容。"
    : completedToday
      ? todayReview.nextReviewDate
        ? `今天的复习任务已完成。下一次复习：${todayReview.nextReviewDate}`
        : "今天的复习任务已完成，可以继续学习新内容。"
      : "用一次短练习建立今天的学习记录。";
  return <section className="today-tasks" aria-label="今日任务">{loadError ? <StudyDataError onRetry={refresh} /> : <><div><span className="eyebrow">今日任务</span><h2>{title}</h2><p>{description}</p></div><div className="today-task-actions"><Link className="primary-button" href={due ? "/review" : `/learn/${suggestedId}`}>{due ? "开始复习" : completedToday ? "继续学习" : "开始学习"} <span>↗</span></Link><Link className="outline-button" href="/#lab">打开实验室</Link></div></>}</section>;
}
