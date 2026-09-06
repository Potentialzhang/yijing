"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
} from "react";
import Link from "next/link";
import {
  InvalidReviewStateError,
  UnsupportedReviewAlgorithmError,
} from "@/core/review/scheduler";
import type { RecallGrade } from "@/core/review/scheduler";
import { REVIEW_EXERCISES } from "@/content/exercises";
import {
  readReviewQueueSnapshot,
  saveReviewResult,
  syncConceptProgress,
} from "@/db/repository";
import { notifyDataChanged } from "@/db/events";
import { NoteEntry } from "@/components/notes/NoteEntry";
// The session note editor is intentionally wrapped by NoteEntry:
// <NoteEditor targetType="session" targetId={sessionId} />
import { TRIGRAMS } from "@/core/iching";
import { TrigramGlyph } from "@/components/hexagram/TrigramGlyph";
import {
  TrigramSignatureVisual,
  isTrigramSignature,
} from "@/components/hexagram/TrigramSignatureVisual";
import type { LineValue } from "@/core/iching";
import {
  captureLocalNow,
  compareLocalDateStrings,
  formatLocalDate,
} from "@/core/date/local";
import {
  isExerciseAnswerCorrect,
  normalizeExerciseAnswer,
} from "@/core/review/answer";
import { MAX_RESPONSE_TIME_MS } from "@/core/review/response-time";
import {
  buildReviewQueue,
  focusReviewCard,
  getNextReviewBatch,
} from "@/core/review/queue";
import { estimateReviewMinutes } from "@/core/review/estimate";

const cards = REVIEW_EXERCISES;

function localDate() {
  return formatLocalDate();
}
function nowMs() {
  return Date.now();
}
function createSessionId(): string {
  const uuid = globalThis.crypto?.randomUUID?.();
  return uuid
    ? `review-${uuid}`
    : `review-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function ReviewDisplay({ card }: { card: (typeof cards)[number] }) {
  const trigram =
    card.targetType === "trigram"
      ? TRIGRAMS.find((item) => item.id === card.targetId)
      : undefined;
  if (trigram && card.kind === "trigram-lines-name")
    return (
      <TrigramGlyph lines={trigram.lines} label={`${trigram.name}三爻结构`} />
    );
  return <>{card.display}</>;
}

export function ReviewSession() {
  const [sessionId] = useState(createSessionId);
  const [queue, setQueue] = useState<typeof cards>([]);
  const [allQueue, setAllQueue] = useState<typeof cards>([]);
  const [batchOffset, setBatchOffset] = useState(0);
  const [batchSize, setBatchSize] = useState(20);
  const [immediateIds, setImmediateIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [index, setIndex] = useState(0);
  const [selected, setSelected] = useState<string | null>(null);
  const [lineDraft, setLineDraft] = useState<LineValue[]>([]);
  const [recorded, setRecorded] = useState(false);
  const [results, setResults] = useState<boolean[]>([]);
  const [nextDueDates, setNextDueDates] = useState<string[]>([]);
  const [unsupportedCardCount, setUnsupportedCardCount] = useState(0);
  const [invalidCardCount, setInvalidCardCount] = useState(0);
  const [finished, setFinished] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [hintUsed, setHintUsed] = useState(false);
  const [textDraft, setTextDraft] = useState("");
  const [selfExplanationDraft, setSelfExplanationDraft] = useState("");
  const [responseTimesMs, setResponseTimesMs] = useState<number[]>([]);
  const loadSequence = useRef(0);
  const mountedRef = useRef(false);
  const cardStartedAtRef = useRef(0);
  const responseTimeRef = useRef<number | undefined>(undefined);
  const card = queue[index];
  const correct =
    selected !== null && card
      ? isExerciseAnswerCorrect(selected, card.answer)
      : false;
  const progress = useMemo(
    () => `${index + (finished ? 0 : 1)} / ${queue.length}`,
    [finished, index, queue.length],
  );
  const progressPercent =
    queue.length > 0 ? Math.round((index / queue.length) * 100) : 0;
  // Once the current answer has been persisted, it no longer belongs to the
  // remaining work even if the learner pauses before pressing “下一题”.
  const remainingCards = Math.max(0, queue.length - index - (recorded ? 1 : 0));
  const estimatedMinutes = estimateReviewMinutes(
    remainingCards,
    responseTimesMs,
  );

  useEffect(() => {
    cardStartedAtRef.current = nowMs();
    responseTimeRef.current = undefined;
  }, [card?.id]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      loadSequence.current += 1;
    };
  }, []);

  const loadQueue = useCallback(() => {
    const sequence = ++loadSequence.current;
    setLoading(true);
    setLoadError("");
    const date = localDate();
    void readReviewQueueSnapshot()
      .then(
        ({
          dailyNewCardLimit,
          sessionBatchSize,
          reviewCardStates,
          responseTimesMs: storedResponseTimesMs,
        }) => {
          if (sequence !== loadSequence.current) return;
          const selection = buildReviewQueue(
            cards,
            reviewCardStates,
            date,
            dailyNewCardLimit,
            sessionBatchSize,
          );
          const focusCardId = new URLSearchParams(window.location.search).get(
            "focus",
          );
          const sessionSelection = focusReviewCard(
            selection,
            cards,
            reviewCardStates,
            focusCardId,
          );
          setUnsupportedCardCount(selection.unsupportedCardCount);
          setInvalidCardCount(selection.invalidCardCount);
          setBatchSize(sessionSelection.batchSize);
          setImmediateIds(new Set(sessionSelection.fresh.map(({ id }) => id)));
          setAllQueue(sessionSelection.ordered);
          setQueue(sessionSelection.firstBatch);
          setBatchOffset(sessionSelection.firstBatch.length);
          setResponseTimesMs(storedResponseTimesMs);
          setLoading(false);
        },
      )
      .catch(() => {
        if (sequence !== loadSequence.current) return;
        setLoadError("复习队列暂时无法读取，请检查浏览器存储权限后重试。");
        setLoading(false);
      });
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(loadQueue, 0);
    return () => {
      loadSequence.current += 1;
      window.clearTimeout(timer);
    };
  }, [loadQueue]);

  async function recordAnswer(
    grade: RecallGrade,
    responseTimeMs: number,
    selfExplanation: string,
  ) {
    const { iso: now, localDate: today } = captureLocalNow();
    const { dueDate } = await saveReviewResult({
      exercise: card,
      grade,
      objectiveCorrect: correct,
      hintUsed,
      responseTimeMs,
      selfExplanation,
      now,
      localDate: today,
    });
    if (card.targetType === "concept") {
      try {
        await syncConceptProgress(card.targetId, now);
      } catch {
        /* the immutable attempt is already saved; rebuild progress on the next refresh */
      }
    }
    notifyDataChanged();
    if (!mountedRef.current) return;
    setNextDueDates((dates) => [...dates, dueDate]);
    setResponseTimesMs((times) => [...times, responseTimeMs]);
  }

  function choose(option: string) {
    if (selected !== null || !normalizeExerciseAnswer(option)) return;
    setSelected(option);
  }
  function submitTextAnswer(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    choose(textDraft);
  }
  function appendLine(value: LineValue) {
    if (selected !== null || lineDraft.length >= 3) return;
    setLineDraft((draft) => [...draft, value]);
  }
  function checkLineDraft() {
    if (lineDraft.length === 3) choose(lineDraft.join(""));
  }

  async function gradeAnswer(grade: RecallGrade) {
    if (recorded || saving || selected === null) return;
    setSaving(true);
    setSaveError("");
    const responseTimeMs =
      responseTimeRef.current ??
      Math.min(
        MAX_RESPONSE_TIME_MS,
        Math.max(0, nowMs() - cardStartedAtRef.current),
      );
    responseTimeRef.current = responseTimeMs;
    try {
      await recordAnswer(grade, responseTimeMs, selfExplanationDraft);
      if (!mountedRef.current) return;
      setRecorded(true);
      setResults((previous) => [...previous, correct]);
    } catch (error) {
      if (!mountedRef.current) return;
      setSaveError(
        error instanceof UnsupportedReviewAlgorithmError
          ? "这张卡使用了当前不支持的复习算法版本，请先导出数据并完成版本迁移后再继续。"
          : error instanceof InvalidReviewStateError
            ? "这张卡的复习状态已损坏，尚未写入账户数据库；请先到数据设置导出或恢复备份，再重试。"
          : "这次复习还没有写入账户数据库，请重试保存。",
      );
    } finally {
      if (mountedRef.current) setSaving(false);
    }
  }

  function nextCard() {
    if (!recorded) return;
    if (index === queue.length - 1) setFinished(true);
    else {
      setIndex((previous) => previous + 1);
      setSelected(null);
      setLineDraft([]);
      setTextDraft("");
      setSelfExplanationDraft("");
      setHintUsed(false);
      setRecorded(false);
    }
  }
  function continueNextBatch() {
    const next = getNextReviewBatch(allQueue, batchOffset, batchSize);
    setQueue(next.items);
    setBatchOffset(next.nextOffset);
    setIndex(0);
    setResults([]);
    setNextDueDates([]);
    setSelected(null);
    setLineDraft([]);
    setTextDraft("");
    setSelfExplanationDraft("");
    setHintUsed(false);
    setRecorded(false);
    setFinished(false);
  }

  if (loading)
    return (
      <section className="review-empty">
        <span className="eyebrow">复习队列</span>
        <h2>正在整理今天的卡片…</h2>
      </section>
    );
  if (loadError)
    return (
      <section className="review-empty" role="alert">
        <span className="eyebrow">复习队列</span>
        <h2>复习队列暂时不可用。</h2>
        <p>{loadError}</p>
        <div className="review-empty-actions">
          <button type="button" className="primary-button" onClick={loadQueue}>
            重试读取
          </button>
          <Link className="outline-button" href="/">
            回到今日 <span>↗</span>
          </Link>
        </div>
      </section>
    );
  if (!card && !finished) {
    const blockedCount = unsupportedCardCount + invalidCardCount;
    const blockedReasons = [
      unsupportedCardCount > 0
        ? `${unsupportedCardCount} 张算法版本不兼容`
        : "",
      invalidCardCount > 0 ? `${invalidCardCount} 张复习状态或到期日期损坏` : "",
    ]
      .filter(Boolean)
      .join("，");
    return (
      <section
        className="review-empty"
        role={blockedCount > 0 ? "alert" : undefined}
      >
        <span className="eyebrow">复习队列</span>
        <h2>
          {blockedCount > 0 ? "有卡片暂时无法安排" : "今天没有到期卡片。"}
        </h2>
        <p>
          {blockedCount > 0
            ? `发现 ${blockedCount} 张复习卡已暂时隔离：${blockedReasons}。不会静默改写，请先导出数据并使用支持的版本或恢复工具处理。`
            : "可以去知识内容索引开始一个新知识点，或者明天再回来。"}
        </p>
        {blockedCount > 0 ? (
          <Link className="outline-button" href="/settings/data">
            打开数据设置 <span>↗</span>
          </Link>
        ) : (
          <Link className="primary-button" href="/learn">
            去知识内容索引 <span>↗</span>
          </Link>
        )}
      </section>
    );
  }

  if (finished) {
    const correctCount = results.filter(Boolean).length;
    const nextDue = [...nextDueDates].sort(compareLocalDateStrings)[0];
    return (
      <section className="review-finished">
        <span className="eyebrow">本次复习完成</span>
        <h2>留下一点可重复的记忆。</h2>
        <strong>
          {correctCount} <small>/ {queue.length} 正确</small>
        </strong>
        <p>
          答错的卡片已经回到更近的复习间隔。
          {nextDue ? `本组最早下次复习：${nextDue}。` : "复习日期已经更新。"}
        </p>
        <NoteEntry targetType="session" targetId={sessionId} label="打开本次复习笔记" />
        <div className="review-finished-actions">
          {batchOffset < allQueue.length && (
            <button
              type="button"
              className="primary-button"
              onClick={continueNextBatch}
            >
              继续下一组（剩余 {allQueue.length - batchOffset} 张）
            </button>
          )}
          <Link className="outline-button" href="/">
            回到今日 <span>↗</span>
          </Link>
        </div>
      </section>
    );
  }

  const isArrangeLines = card.kind === "trigram-arrange-lines";
  const isTextResponse = card.responseType === "text";
  const blockedCount = unsupportedCardCount + invalidCardCount;
  const blockedNotice =
    unsupportedCardCount > 0 && invalidCardCount > 0
      ? `另有 ${blockedCount} 张卡片已暂时隔离（${unsupportedCardCount} 张算法版本不兼容，${invalidCardCount} 张复习状态或到期日期损坏）`
      : unsupportedCardCount > 0
        ? `另有 ${unsupportedCardCount} 张卡片因复习算法版本不兼容已暂时隔离`
        : `另有 ${invalidCardCount} 张卡片因复习状态或到期日期损坏已暂时隔离`;
  return (
    <section className="review-session">
      {blockedCount > 0 && (
        <p className="review-blocked-notice" role="status">
          {blockedNotice}；
          <Link href="/settings/data">打开数据设置导出数据</Link>。
        </p>
      )}
      <div className="review-session-top">
        <span className="eyebrow">主动回忆 · 今日复习</span>
        <span>
          {progress} · 预计约 {estimatedMinutes} 分钟
        </span>
      </div>
      <div
        className="review-progress"
        role="progressbar"
        aria-label="复习进度"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={progressPercent}
        aria-valuetext={progress}
      >
        <span style={{ width: `${progressPercent}%` }} />
      </div>
      <div className="review-card">
        <span className="review-prompt">{card.prompt}</span>
        <span className="review-mode">
          {immediateIds.has(card.id) ? "即时练习 / 新卡" : "间隔复习卡"}
        </span>
        <div
          className={`review-symbol ${card.kind === "trigram-lines-name" ? "review-trigram-display" : ""}`}
          aria-label="待识别内容"
        >
          <ReviewDisplay card={card} />
        </div>
        <p>
          {isArrangeLines
            ? "从初爻到上爻依次选择，完成三爻排列。"
            : isTextResponse
              ? "先在心里回忆，再填写答案。"
              : "先在心里说出答案，再选择。"}
        </p>
        {card.targetType === "hexagram" && (
          <div className="review-hint" aria-live="polite">
            <button
              type="button"
              className="text-button"
              onClick={() => setHintUsed(true)}
              disabled={selected !== null || hintUsed}
            >
              {hintUsed ? "已查看提示" : "查看提示"}
            </button>
            {hintUsed && (
              <small>
                提示：先确认题目给出的上卦与下卦，再从结构或卦序定位，不要直接按名称猜。
              </small>
            )}
          </div>
        )}
        {isArrangeLines ? (
          <div className="line-arrangement" aria-label="三爻排列">
            <div className="line-draft" aria-live="polite">
              {lineDraft.length ? (
                lineDraft.map((line, position) => (
                  <span key={position}>
                    {position + 1}爻 · {line === 1 ? "阳" : "阴"}
                  </span>
                ))
              ) : (
                <small>尚未选择，从初爻开始</small>
              )}
            </div>
            <div className="line-draft-actions">
              <button
                type="button"
                onClick={() => appendLine(1)}
                disabled={selected !== null || lineDraft.length >= 3}
              >
                阳爻
              </button>
              <button
                type="button"
                onClick={() => appendLine(0)}
                disabled={selected !== null || lineDraft.length >= 3}
              >
                阴爻
              </button>
              <button
                type="button"
                className="outline-button"
                onClick={() => setLineDraft((draft) => draft.slice(0, -1))}
                disabled={selected !== null || lineDraft.length === 0}
              >
                撤回一爻
              </button>
              <button
                type="button"
                className="primary-button"
                onClick={checkLineDraft}
                disabled={selected !== null || lineDraft.length !== 3}
              >
                检查排列
              </button>
            </div>
          </div>
        ) : isTextResponse ? (
          <form className="answer-input" onSubmit={submitTextAnswer}>
            <label htmlFor={`review-answer-${card.id}`}>你的答案</label>
            <div>
              <input
                id={`review-answer-${card.id}`}
                value={textDraft}
                onChange={(event) => setTextDraft(event.target.value)}
                placeholder="输入方位，例如：东北"
                autoComplete="off"
                disabled={selected !== null || saving}
              />
              <button
                type="submit"
                className="primary-button"
                disabled={selected !== null || saving || !textDraft.trim()}
              >
                提交答案
              </button>
            </div>
          </form>
        ) : (
          <div className="answer-options">
            {card.choices.map((option) => (
              <button
                type="button"
                className={
                  selected === option
                    ? option === card.answer
                      ? "correct"
                      : "incorrect"
                    : ""
                }
                key={option}
                onClick={() => choose(option)}
                disabled={selected !== null}
              >
                {isTrigramSignature(option) ? (
                  <TrigramSignatureVisual value={option} />
                ) : (
                  option
                )}
              </button>
            ))}
          </div>
        )}
        {selected !== null && (
          <div
            className={`answer-feedback ${correct ? "is-correct" : "is-wrong"}`}
            role="status"
            aria-live="polite"
          >
            <strong>
              {correct ? (
                "答案正确"
              ) : (
                <>
                  答案是：<TrigramSignatureVisual value={card.answer} />
                </>
              )}
            </strong>
            <span>
              {correct
                ? card.explanation
                : "先记住答案，再用自己的话复述一次。"}
            </span>
          </div>
        )}
        {selected !== null && (
          <div className="recall-reflection">
            <label htmlFor={`review-self-explanation-${card.id}`}>
              用自己的话复述（可选）
            </label>
            <textarea
              id={`review-self-explanation-${card.id}`}
              value={selfExplanationDraft}
              onChange={(event) => setSelfExplanationDraft(event.target.value)}
              maxLength={2000}
              placeholder="用一句话说明你为什么这样回答，或记住了什么。"
              disabled={recorded || saving}
            />
            <small>保存到当前账户数据库，并会在错题回顾中显示。</small>
          </div>
        )}
        {selected !== null && (
          <div className="recall-grades">
            <span>这次回忆感觉如何？</span>
            <div>
              <button
                type="button"
                onClick={() => void gradeAnswer("forgot")}
                disabled={recorded || saving}
              >
                忘记
              </button>
              <button
                type="button"
                onClick={() => void gradeAnswer("hard")}
                disabled={recorded || saving}
              >
                困难
              </button>
              <button
                type="button"
                onClick={() => void gradeAnswer("remembered")}
                disabled={recorded || saving}
              >
                记得
              </button>
              <button
                type="button"
                onClick={() => void gradeAnswer("mastered")}
                disabled={recorded || saving}
              >
                熟练
              </button>
            </div>
            {saving && <small role="status">正在保存本次复习…</small>}
            {saveError && (
              <small className="instant-error" role="alert">
                {saveError}
              </small>
            )}
          </div>
        )}
      </div>
      {recorded && (
        <button type="button" className="next-review" onClick={nextCard}>
          {index === queue.length - 1 ? "查看复习总结" : "下一题"}{" "}
          <span>→</span>
        </button>
      )}
    </section>
  );
}
