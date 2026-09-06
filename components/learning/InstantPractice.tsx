"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { EXERCISES, type Exercise } from "@/content/exercises";
import { notifyDataChanged } from "@/db/events";
import { saveReviewResult, syncConceptProgress } from "@/db/repository";
import { captureLocalNow } from "@/core/date/local";
import { InvalidReviewStateError } from "@/core/review/scheduler";
import {
  isExerciseAnswerCorrect,
  normalizeExerciseAnswer,
} from "@/core/review/answer";
import { MAX_RESPONSE_TIME_MS } from "@/core/review/response-time";
import type { LineValue } from "@/core/iching";
import {
  TrigramSignatureVisual,
  isTrigramSignature,
} from "@/components/hexagram/TrigramSignatureVisual";
import { ExerciseDisplayValue } from "@/components/learning/ExerciseDisplayValue";

function nowMs() {
  return Date.now();
}

async function saveImmediateAnswer(
  exercise: Exercise,
  correct: boolean,
  responseTimeMs: number,
  selfExplanation: string,
): Promise<void> {
  const { iso: now, localDate: today } = captureLocalNow();
  await saveReviewResult({
    exercise,
    grade: correct ? "remembered" : "forgot",
    objectiveCorrect: correct,
    reviewMode: "immediate",
    hintUsed: false,
    selfExplanation,
    responseTimeMs,
    now,
    localDate: today,
  });
  if (exercise.targetType === "concept") {
    try {
      await syncConceptProgress(exercise.targetId, now);
    } catch {
      /* the attempt is durable; progress can be rebuilt on the next refresh */
    }
  }
  notifyDataChanged();
}

export function InstantPractice({
  targetType,
  targetId,
}: {
  targetType: Exercise["targetType"];
  targetId: string;
}) {
  const exercises = useMemo(() => {
    const candidates = EXERCISES.filter(
      (item) =>
        item.targetType === targetType &&
        item.targetId === targetId &&
        item.mode !== "review",
    );
    if (targetType !== "trigram") return candidates.slice(0, 5);
    // Keep the five MVP memory paths visible on every trigram detail page,
    // including the free-form later-heaven direction recall required by FR-022.
    const preferredKinds: Exercise["kind"][] = [
      "trigram-name",
      "trigram-lines-name",
      "trigram-arrange-lines",
      "trigram-direction",
      "trigram-nature",
    ];
    const preferred = preferredKinds
      .map((kind) => candidates.find((item) => item.kind === kind))
      .filter((item): item is Exercise => Boolean(item));
    return [
      ...preferred,
      ...candidates.filter((item) => !preferred.includes(item)),
    ].slice(0, 5);
  }, [targetId, targetType]);
  const [index, setIndex] = useState(0);
  const [selected, setSelected] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [finished, setFinished] = useState(false);
  const [results, setResults] = useState<boolean[]>([]);
  const [textDraft, setTextDraft] = useState("");
  const [selfExplanationDraft, setSelfExplanationDraft] = useState("");
  const [lineDraft, setLineDraft] = useState<LineValue[]>([]);
  const mountedRef = useRef(false);
  const questionStartedAtRef = useRef(0);
  const responseTimeRef = useRef<number | undefined>(undefined);
  const exercise = exercises[index];
  const progressPercent =
    exercises.length > 0 ? Math.round((index / exercises.length) * 100) : 0;

  useEffect(() => {
    mountedRef.current = true;
    questionStartedAtRef.current = nowMs();
    responseTimeRef.current = undefined;
    return () => {
      mountedRef.current = false;
    };
  }, [exercise?.id]);

  if (!exercises.length) return null;
  if (finished) {
    const correctCount = results.filter(Boolean).length;
    return (
      <section className="instant-practice" aria-live="polite">
        <span className="eyebrow">即时练习完成</span>
        <h2>把刚才的答案留在记忆里。</h2>
        <strong className="instant-score">
          {correctCount} <small>/ {exercises.length} 正确</small>
        </strong>
        <p>这次作答已单独记录到账户数据库，间隔复习会继续安排。</p>
        <div className="instant-actions">
          <Link className="primary-button" href="/">
            回到今日 <span>↗</span>
          </Link>
          <Link className="outline-button" href="/review">
            去复习队列 <span>↗</span>
          </Link>
          <button type="button" className="outline-button" onClick={restart}>
            再练一次
          </button>
        </div>
      </section>
    );
  }

  function choose(option: string) {
    if (selected !== null || saving) return;
    if (!normalizeExerciseAnswer(option)) {
      setError("请先填写答案，再提交。");
      return;
    }
    const responseTimeMs = Math.min(
      MAX_RESPONSE_TIME_MS,
      Math.max(0, nowMs() - questionStartedAtRef.current),
    );
    responseTimeRef.current = responseTimeMs;
    setSelected(option);
    setSaved(false);
    setError("");
  }

  async function persistAnswer(): Promise<boolean> {
    if (selected === null || saving || saved) return saved;
    const correct = isExerciseAnswerCorrect(selected, exercise.answer);
    setSaving(true);
    setError("");
    try {
      const responseTimeMs =
        responseTimeRef.current ??
        Math.min(
          MAX_RESPONSE_TIME_MS,
          Math.max(0, nowMs() - questionStartedAtRef.current),
        );
      responseTimeRef.current = responseTimeMs;
      await saveImmediateAnswer(
        exercise,
        correct,
        responseTimeMs,
        selfExplanationDraft,
      );
      if (!mountedRef.current) return true;
      setSaved(true);
      setResults((previous) => [...previous, correct]);
      return true;
    } catch (error) {
      if (!mountedRef.current) return false;
      setError(
        error instanceof InvalidReviewStateError
          ? "这张卡的复习状态已损坏，尚未写入账户数据库；请先到数据设置导出或恢复备份，再重试。"
          : "这次作答还没有写入账户数据库，请重试保存。",
      );
      return false;
    } finally {
      if (mountedRef.current) setSaving(false);
    }
  }

  async function retry() {
    if (selected === null || saving) return;
    await persistAnswer();
  }

  function appendLine(value: LineValue) {
    if (selected !== null || saving || lineDraft.length >= 3) return;
    setLineDraft((draft) => [...draft, value]);
  }

  function checkLineDraft() {
    if (lineDraft.length === 3) void choose(lineDraft.join(""));
  }

  async function next() {
    if (selected === null || saving) return;
    if (!saved && !(await persistAnswer())) return;
    if (!mountedRef.current) return;
    if (index >= exercises.length - 1) {
      setFinished(true);
      return;
    }
    setIndex((current) => current + 1);
    setSelected(null);
    setSaved(false);
    setError("");
    setTextDraft("");
    setSelfExplanationDraft("");
    setLineDraft([]);
  }

  function restart() {
    questionStartedAtRef.current = nowMs();
    responseTimeRef.current = undefined;
    setFinished(false);
    setIndex(0);
    setSelected(null);
    setSaved(false);
    setResults([]);
    setTextDraft("");
    setSelfExplanationDraft("");
    setLineDraft([]);
  }

  const isTextResponse = exercise.responseType === "text";
  const isArrangeLines = exercise.kind === "trigram-arrange-lines";
  const isCorrect =
    selected !== null && isExerciseAnswerCorrect(selected, exercise.answer);
  return (
    <section
      className="instant-practice"
      aria-labelledby={`instant-practice-${targetType}-${targetId}`}
    >
      <div className="instant-top">
        <div>
          <span className="eyebrow">即时练习</span>
          <h2 id={`instant-practice-${targetType}-${targetId}`}>
            合上答案，先说出自己的理解。
          </h2>
        </div>
        <span>
          {index + 1} / {exercises.length}
        </span>
      </div>
      <div
        className="instant-progress"
        role="progressbar"
        aria-label="即时练习进度"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={progressPercent}
        aria-valuetext={`${index + 1} / ${exercises.length}`}
      >
        <span style={{ width: `${progressPercent}%` }} />
      </div>
      <p className="instant-prompt">{exercise.prompt}</p>
      <div className="instant-display">
        <ExerciseDisplayValue value={exercise.display} />
      </div>
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
              disabled={selected !== null || saving || lineDraft.length >= 3}
            >
              阳爻
            </button>
            <button
              type="button"
              onClick={() => appendLine(0)}
              disabled={selected !== null || saving || lineDraft.length >= 3}
            >
              阴爻
            </button>
            <button
              type="button"
              className="outline-button"
              onClick={() => setLineDraft((draft) => draft.slice(0, -1))}
              disabled={selected !== null || saving || lineDraft.length === 0}
            >
              撤回一爻
            </button>
            <button
              type="button"
              className="primary-button"
              onClick={checkLineDraft}
              disabled={selected !== null || saving || lineDraft.length !== 3}
            >
              检查排列
            </button>
          </div>
        </div>
      ) : isTextResponse ? (
        <form
          className="answer-input"
          onSubmit={(event) => {
            event.preventDefault();
            void choose(textDraft);
          }}
        >
          <label htmlFor={`instant-answer-${exercise.id}`}>你的答案</label>
          <div>
            <input
              id={`instant-answer-${exercise.id}`}
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
        <div className="instant-choices">
          {exercise.choices.map((option) => (
            <button
              type="button"
              key={option}
              className={
                selected === option
                  ? option === exercise.answer
                    ? "correct"
                    : "incorrect"
                  : ""
              }
              onClick={() => void choose(option)}
              disabled={selected !== null || saving}
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
          className={`instant-feedback ${isCorrect ? "is-correct" : "is-wrong"}`}
          role="status"
          aria-live="polite"
        >
          <strong>
            {isCorrect ? (
              "回答正确"
            ) : (
              <>
                答案是：<TrigramSignatureVisual value={exercise.answer} />
              </>
            )}
          </strong>
          <span>{exercise.explanation}</span>
        </div>
      )}
      {selected !== null && (
        <div className="recall-reflection">
          <label htmlFor={`instant-self-explanation-${exercise.id}`}>
            用自己的话复述（可选）
          </label>
          <textarea
            id={`instant-self-explanation-${exercise.id}`}
            value={selfExplanationDraft}
            onChange={(event) => setSelfExplanationDraft(event.target.value)}
            maxLength={2000}
            placeholder="用一句话说明你为什么这样回答，或记住了什么。"
            disabled={saved || saving}
          />
          <small>点击下一题时保存到当前账户数据库，并会在错题回顾中显示。</small>
        </div>
      )}
      {error && (
        <div className="instant-error" role="alert">
          {error}
          <button
            type="button"
            className="text-button"
            onClick={() => void retry()}
            disabled={saving}
          >
            重试保存
          </button>
        </div>
      )}
      {selected !== null && (
        <button
          type="button"
          className="next-review"
          onClick={() => void next()}
          disabled={saving}
        >
          {index === exercises.length - 1 ? "查看练习总结" : "下一题"}{" "}
          <span>→</span>
        </button>
      )}
    </section>
  );
}
