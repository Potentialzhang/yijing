"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { type ReviewAttempt, type ReviewCardState } from "@/db/schema";
import { readStudySnapshot } from "@/db/repository";
import { TRIGRAMS, getHexagramByNumber } from "@/core/iching";
import { KNOWLEDGE_CONCEPTS } from "@/content/knowledge";
import { FIVE_ELEMENTS } from "@/content/five-elements";
import { REVIEW_EXERCISES } from "@/content/exercises";
import { DATA_CHANGED_EVENT } from "@/db/events";
import { isSupportedReviewAlgorithm, isValidReviewState } from "@/core/review/scheduler";
import { compareIsoTimestamps, formatLocalDateLabel } from "@/core/date/local";
import { StudyDataError } from "@/components/dashboard/StudyDataError";
import { StudyDataLoading } from "@/components/dashboard/StudyDataLoading";

const REVIEW_CARD_IDS = new Set(REVIEW_EXERCISES.map((exercise) => exercise.id));

export function WeakPoints() {
  const [items, setItems] = useState<ReviewCardState[]>([]);
  const [lastErrors, setLastErrors] = useState<Map<string, Pick<ReviewAttempt, "promptSnapshot" | "answerSnapshot" | "reviewedAt">>>(new Map());
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const refreshSequence = useRef(0);
  const refresh = useCallback(() => {
    const sequence = ++refreshSequence.current;
    void readStudySnapshot().then(({ reviewCardStates: states, reviewAttempts: attempts }) => {
      if (sequence !== refreshSequence.current) return;
      setLoading(false);
      setLoadError(false);
      setItems(states.filter((state) => REVIEW_CARD_IDS.has(state.cardId) && state.isWeak && isSupportedReviewAlgorithm(state) && isValidReviewState(state)));
      const errors = new Map<string, Pick<ReviewAttempt, "promptSnapshot" | "answerSnapshot" | "reviewedAt">>();
      attempts.filter((attempt) => REVIEW_CARD_IDS.has(attempt.cardId) && (attempt.objectiveCorrect === false || attempt.recallGrade === "forgot")).sort((a, b) => compareIsoTimestamps(b.reviewedAt, a.reviewedAt)).forEach((attempt) => { if (!errors.has(attempt.cardId)) errors.set(attempt.cardId, { promptSnapshot: attempt.promptSnapshot, answerSnapshot: attempt.answerSnapshot, reviewedAt: attempt.reviewedAt }); });
      setLastErrors(errors);
    }).catch(() => {
      if (sequence === refreshSequence.current) {
        setLoading(false);
        setLoadError(true);
      }
    });
  }, []);
  useEffect(() => { refresh(); window.addEventListener(DATA_CHANGED_EVENT, refresh); return () => { refreshSequence.current += 1; window.removeEventListener(DATA_CHANGED_EVENT, refresh); }; }, [refresh]);
  if (loading) return <section className="weak-points"><StudyDataLoading /></section>;
  if (loadError) return <section className="weak-points"><StudyDataError onRetry={refresh} /></section>;
  const context = (item: ReviewCardState): string | undefined => {
    if (item.targetType === "hexagram") {
      try { return `/hexagrams/${getHexagramByNumber(Number(item.targetId.replace("hexagram-", ""))).kingWenNumber}`; } catch { return undefined; }
    }
    if (item.targetType === "trigram") return TRIGRAMS.some((trigram) => trigram.id === item.targetId) ? `/trigrams/${item.targetId}` : undefined;
    if (item.targetType === "concept") return KNOWLEDGE_CONCEPTS.some((concept) => concept.id === item.targetId) ? `/learn/${item.targetId}` : undefined;
    if (item.targetType === "five-element") return FIVE_ELEMENTS.some((element) => element.id === item.targetId) ? `/tools/five-elements?element=${encodeURIComponent(item.targetId)}` : undefined;
    return undefined;
  };
  const label = (item: ReviewCardState) => {
    if (item.targetType === "hexagram") { try { return getHexagramByNumber(Number(item.targetId.replace("hexagram-", ""))).name; } catch { return item.targetId; } }
    if (item.targetType === "trigram") return TRIGRAMS.find((trigram) => trigram.id === item.targetId)?.name ?? item.targetId;
    if (item.targetType === "five-element") return FIVE_ELEMENTS.find((element) => element.id === item.targetId)?.name ?? item.targetId;
    return KNOWLEDGE_CONCEPTS.find((concept) => concept.id === item.targetId)?.title ?? item.targetId;
  };
  const typeLabel = (item: ReviewCardState) => item.targetType === "hexagram" ? "六十四卦" : item.targetType === "trigram" ? "八卦" : item.targetType === "five-element" ? "五行" : "知识点";
  return <section className="weak-points"><div className="section-heading"><div><p className="eyebrow">薄弱知识点</p><h2>把遗忘变成下一次入口</h2></div><span className="weak-count">{items.length} 张</span></div>{items.length === 0 ? <p className="weak-empty">连续遗忘两次的卡片会出现在这里。</p> : <div className="weak-list">{items.map((item) => { const href = context(item); const error = lastErrors.get(item.cardId); const content = <><span>{typeLabel(item)}</span><strong>{label(item)}</strong><small>遗忘 {item.lapseCount} 次{error ? ` · 最近错误 ${formatLocalDateLabel(error.reviewedAt)} · 题目：${error.promptSnapshot} · 答案：${error.answerSnapshot}` : ""}{href ? " · 查看上下文 ↗" : " · 内容已不可用，请检查数据迁移或备份"}</small></>; return href ? <Link key={item.cardId} href={href}>{content}</Link> : <div key={item.cardId} className="weak-list-item is-unavailable">{content}</div>; })}</div>}</section>;
}
