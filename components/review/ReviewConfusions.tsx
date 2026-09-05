"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { DATA_CHANGED_EVENT } from "@/db/events";
import { readStudySnapshot } from "@/db/repository";
import { REVIEW_EXERCISES } from "@/content/exercises";
import { FIVE_ELEMENTS } from "@/content/five-elements";
import { KNOWLEDGE_CONCEPTS } from "@/content/knowledge";
import { TRIGRAMS, getHexagramByNumber } from "@/core/iching";
import { formatLocalDateLabel } from "@/core/date/local";
import {
  summarizeReviewConfusions,
  type ReviewConfusionSummary,
} from "@/core/review/confusion";
import { StudyDataError } from "@/components/dashboard/StudyDataError";
import { StudyDataLoading } from "@/components/dashboard/StudyDataLoading";

const REVIEW_CARD_IDS = new Set(REVIEW_EXERCISES.map((exercise) => exercise.id));
const EXERCISE_BY_ID = new Map(REVIEW_EXERCISES.map((exercise) => [exercise.id, exercise]));

function targetLabel(item: ReviewConfusionSummary): string {
  if (item.targetType === "hexagram" && item.targetId) {
    try {
      return getHexagramByNumber(Number(item.targetId.replace("hexagram-", ""))).name;
    } catch {
      return item.targetId;
    }
  }
  if (item.targetType === "trigram" && item.targetId) {
    return TRIGRAMS.find((trigram) => trigram.id === item.targetId)?.name ?? item.targetId;
  }
  if (item.targetType === "five-element" && item.targetId) {
    return FIVE_ELEMENTS.find((element) => element.id === item.targetId)?.name ?? item.targetId;
  }
  if (item.targetType === "concept" && item.targetId) {
    return KNOWLEDGE_CONCEPTS.find((concept) => concept.id === item.targetId)?.title ?? item.targetId;
  }
  return EXERCISE_BY_ID.get(item.cardId)?.display ?? item.cardId;
}

function targetTypeLabel(targetType: string | null): string {
  if (targetType === "hexagram") return "六十四卦";
  if (targetType === "trigram") return "八卦";
  if (targetType === "five-element") return "五行";
  if (targetType === "concept") return "知识点";
  return "复习卡";
}

function targetHref(item: ReviewConfusionSummary): string | null {
  if (item.targetType === "hexagram" && item.targetId) {
    try {
      return `/hexagrams/${getHexagramByNumber(Number(item.targetId.replace("hexagram-", ""))).kingWenNumber}`;
    } catch {
      return null;
    }
  }
  if (item.targetType === "trigram" && item.targetId && TRIGRAMS.some((trigram) => trigram.id === item.targetId)) {
    return `/trigrams/${item.targetId}`;
  }
  if (item.targetType === "concept" && item.targetId && KNOWLEDGE_CONCEPTS.some((concept) => concept.id === item.targetId)) {
    return `/learn/${item.targetId}`;
  }
  if (item.targetType === "five-element" && item.targetId && FIVE_ELEMENTS.some((element) => element.id === item.targetId)) {
    return `/tools/five-elements?element=${encodeURIComponent(item.targetId)}`;
  }
  return null;
}

export function ReviewConfusions() {
  const [items, setItems] = useState<readonly ReviewConfusionSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const refreshSequence = useRef(0);

  const refresh = useCallback(() => {
    const sequence = ++refreshSequence.current;
    setLoading(true);
    setLoadError(false);
    void readStudySnapshot()
      .then(({ reviewAttempts, reviewCardStates }) => {
        if (sequence !== refreshSequence.current) return;
        setItems(
          summarizeReviewConfusions(reviewAttempts, reviewCardStates, {
            knownCardIds: REVIEW_CARD_IDS,
            limit: 5,
          }),
        );
        setLoading(false);
      })
      .catch(() => {
        if (sequence !== refreshSequence.current) return;
        setLoading(false);
        setLoadError(true);
      });
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(refresh, 0);
    window.addEventListener(DATA_CHANGED_EVENT, refresh);
    return () => {
      refreshSequence.current += 1;
      window.clearTimeout(timer);
      window.removeEventListener(DATA_CHANGED_EVENT, refresh);
    };
  }, [refresh]);

  if (loading) {
    return (
      <section className="review-confusions" aria-label="本地错题模式">
        <StudyDataLoading label="正在整理本地错题模式…" />
      </section>
    );
  }
  if (loadError) {
    return (
      <section className="review-confusions" aria-label="本地错题模式">
        <StudyDataError onRetry={refresh} />
      </section>
    );
  }

  return (
    <section className="review-confusions" aria-label="本地错题模式">
      <div className="section-heading">
        <div>
          <p className="eyebrow">本地错题模式</p>
          <h2>找到最容易混淆的卡片</h2>
        </div>
        <span className="weak-count">{items.length} 条</span>
      </div>
      <p className="review-confusions-intro">
        只按本地作答历史统计错误和遗忘，并保留当时的题干与答案快照；不做性格判断、不联网，也不会修改原笔记。
      </p>
      {items.length === 0 ? (
        <p className="review-confusions-empty">完成一次答错或标记“忘记”的题目后，这里会出现可回看的混淆点。</p>
      ) : (
        <div className="review-confusion-list">
          {items.map((item) => {
            const href = targetHref(item);
            const label = targetLabel(item);
            const heading = href ? <Link href={href}>{label} ↗</Link> : <strong>{label}</strong>;
            return (
              <article key={item.cardId} className="review-confusion-card">
                <div className="review-confusion-heading">
                  <span>{targetTypeLabel(item.targetType)}</span>
                  {heading}
                  <Link className="review-confusion-practice" href={`/review/session?focus=${encodeURIComponent(item.cardId)}`}>
                    立即再练
                  </Link>
                  <small>
                    错误 {item.errorCount} 次 / 作答 {item.attemptCount} 次 · 正确率 {item.accuracy}% · 最近 {formatLocalDateLabel(item.latestError.reviewedAt)}
                  </small>
                </div>
                <dl>
                  <div>
                    <dt>最近题目</dt>
                    <dd>{item.latestError.promptSnapshot || "（空题干）"}</dd>
                  </div>
                  <div>
                    <dt>当时答案</dt>
                    <dd>{item.latestError.answerSnapshot || "（未填写）"}</dd>
                  </div>
                  {item.latestError.selfExplanation && (
                    <div>
                      <dt>我的复述</dt>
                      <dd>{item.latestError.selfExplanation}</dd>
                    </div>
                  )}
                </dl>
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}
