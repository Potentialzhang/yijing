"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { type ReviewAttempt, type ReviewCardState } from "@/db/schema";
import { readStudySnapshot } from "@/db/repository";
import { calculateDueCardCompletionRate, calculateIndependentCompletionRate, calculateSevenDayMemoryRate, calculateSevenDayRetention, calculateWeakPointImprovementRate, summarizePeriod } from "@/core/review/stats";
import { isSupportedReviewAlgorithm, isValidReviewState } from "@/core/review/scheduler";
import { DATA_CHANGED_EVENT } from "@/db/events";
import { formatLocalDate } from "@/core/date/local";
import { watchLocalDateRollover } from "@/core/browser/date-rollover";
import { REVIEW_EXERCISES } from "@/content/exercises";
import { StudyDataError } from "@/components/dashboard/StudyDataError";
import { StudyDataLoading } from "@/components/dashboard/StudyDataLoading";

function today() { return formatLocalDate(); }
const REVIEW_CARD_IDS = new Set(REVIEW_EXERCISES.map((exercise) => exercise.id));

export function StudyStats() {
  const [attempts, setAttempts] = useState<ReviewAttempt[]>([]);
  const [states, setStates] = useState<ReviewCardState[]>([]);
  const [days, setDays] = useState<7 | 30>(7);
  const [todayDate, setTodayDate] = useState(today);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const refreshSequence = useRef(0);
  const periodFocusTarget = useRef<7 | 30 | null>(null);
  const refresh = useCallback(() => {
    const sequence = ++refreshSequence.current;
    void readStudySnapshot().then(({ reviewAttempts: nextAttempts, reviewCardStates: nextStates }) => {
      if (sequence !== refreshSequence.current) return;
      setLoading(false);
      setLoadError(false);
      const knownStates = nextStates.filter((state) => REVIEW_CARD_IDS.has(state.cardId));
      const stateByCardId = new Map(knownStates.map((state) => [state.cardId, state]));
      setAttempts(nextAttempts.filter((attempt) => {
        if (!REVIEW_CARD_IDS.has(attempt.cardId)) return false;
        const state = stateByCardId.get(attempt.cardId);
        return state !== undefined && isSupportedReviewAlgorithm(state) && isValidReviewState(state);
      }));
      setStates(knownStates);
    }).catch(() => {
      if (sequence === refreshSequence.current) {
        setLoading(false);
        setLoadError(true);
      }
    });
  }, []);
  useEffect(() => { refresh(); window.addEventListener(DATA_CHANGED_EVENT, refresh); return () => { refreshSequence.current += 1; window.removeEventListener(DATA_CHANGED_EVENT, refresh); }; }, [refresh]);
  useEffect(() => watchLocalDateRollover(today, () => setTodayDate(today)), []);
  useEffect(() => {
    const target = periodFocusTarget.current;
    if (target === null) return;
    periodFocusTarget.current = null;
    document.querySelector<HTMLButtonElement>(`.stats-period-tabs button[data-period="${target}"]`)?.focus();
  }, [days]);
  const summary = useMemo(() => summarizePeriod(attempts, todayDate, days), [attempts, days, todayDate]);
  const retention = useMemo(() => calculateSevenDayRetention(attempts, todayDate), [attempts, todayDate]);
  const memoryRate = useMemo(() => calculateSevenDayMemoryRate(attempts, todayDate), [attempts, todayDate]);
  const weakImprovementRate = useMemo(() => calculateWeakPointImprovementRate(attempts, todayDate), [attempts, todayDate]);
  const dueCompletionRate = useMemo(() => calculateDueCardCompletionRate(attempts, states, todayDate), [attempts, states, todayDate]);
  const independentCompletionRate = useMemo(() => calculateIndependentCompletionRate(attempts, todayDate), [attempts, todayDate]);
  const maxDaily = Math.max(1, ...summary.dailyCounts.map((item) => item.total));
  function movePeriodTab(event: KeyboardEvent<HTMLButtonElement>, next: 7 | 30) {
    const target = event.key === "Home"
      ? 7
      : event.key === "End"
        ? 30
        : ["ArrowLeft", "ArrowUp", "ArrowRight", "ArrowDown"].includes(event.key)
          ? next
          : null;
    if (target === null) return;
    event.preventDefault();
    periodFocusTarget.current = target;
    setDays(target);
  }
  if (loading) return <section className="study-stats-panel" aria-label="学习统计"><StudyDataLoading /></section>;
  if (loadError) return <section className="study-stats-panel" aria-label="学习统计"><StudyDataError onRetry={refresh} /></section>;
  return <section className="study-stats-panel" aria-label="学习统计"><div className="stats-period-tabs" role="tablist" aria-label="统计周期"><button id="stats-period-7" type="button" data-period="7" tabIndex={days === 7 ? 0 : -1} className={days === 7 ? "selected" : ""} role="tab" aria-selected={days === 7} aria-controls="stats-period-panel" onKeyDown={(event) => movePeriodTab(event, 30)} onClick={() => setDays(7)}>近 7 天</button><button id="stats-period-30" type="button" data-period="30" tabIndex={days === 30 ? 0 : -1} className={days === 30 ? "selected" : ""} role="tab" aria-selected={days === 30} aria-controls="stats-period-panel" onKeyDown={(event) => movePeriodTab(event, 7)} onClick={() => setDays(30)}>近 30 天</button></div><div id="stats-period-panel" role="tabpanel" tabIndex={0} aria-labelledby={days === 7 ? "stats-period-7" : "stats-period-30"}><div className="stats-summary-grid"><div><strong>{summary.totalAttempts}</strong><span>作答次数</span></div><div><strong>{summary.accuracy === null ? "—" : `${summary.accuracy}%`}</strong><span>正确率</span></div><div><strong>{summary.activeDays}</strong><span>活跃天数</span></div><div><strong>{summary.forgottenAttempts}</strong><span>遗忘次数</span></div></div><div className="learning-metrics" aria-label="长期学习指标"><div><strong>{retention === null ? "—" : retention ? "达成" : "未达成"}</strong><span>7 日学习留存</span><small>首次学习后第 7 天是否回来复习</small></div><div><strong>{dueCompletionRate === null ? "—" : `${dueCompletionRate}%`}</strong><span>到期卡完成率</span><small>今日到期集合中已完成的比例</small></div><div><strong>{memoryRate === null ? "—" : `${memoryRate}%`}</strong><span>7 日后记忆率</span><small>间隔至少 7 天后的记得/熟练比例</small></div><div><strong>{independentCompletionRate === null ? "—" : `${independentCompletionRate}%`}</strong><span>推演独立完成率</span><small>卦象题未打开提示的比例</small></div><div><strong>{weakImprovementRate === null ? "—" : `${weakImprovementRate}%`}</strong><span>14 日薄弱点改善率</span><small>标记薄弱后 14 日内连续两次通过</small></div></div>{summary.totalAttempts === 0 ? <div className="stats-no-data"><strong>还没有这段时间的作答记录</strong><span>完成一次复习后，这里会显示你的学习节奏。</span></div> : <div className="daily-bars" aria-label={`${summary.days} 天作答分布`}>{summary.dailyCounts.map((item) => <div className="daily-bar" key={item.date} title={`${item.date}：${item.total} 次`}><span style={{ height: `${Math.max(8, (item.total / maxDaily) * 100)}%` }} /><small>{item.date.slice(5).replace("-", "/")}</small></div>)}</div>}<p className="stats-method">统计只使用当前账户的作答记录；正确率和长期指标均从账户数据重算，观察窗口不足时显示“—”。薄弱点改善率只统计间隔复习记录，即时练习不会计入；推演独立完成率仅统计已记录题目类型的卦象题。</p></div></section>;
}
