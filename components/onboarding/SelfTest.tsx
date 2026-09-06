"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createSelfTestResult, getSelfTestExercises, parseSelfTestResult, type SelfTestLevel, type SelfTestResult } from "@/core/onboarding/self-test";
import { DATA_CHANGED_EVENT, notifyDataChanged } from "@/db/events";
import { getPreference, setPreference } from "@/db/repository";

const exercises = getSelfTestExercises();
const levelCopy: Record<SelfTestLevel, { title: string; description: string; conceptId: string; conceptTitle: string }> = {
  foundation: { title: "从基础起步", description: "先把阴阳、五行和八卦结构练熟，再进入六十四卦。", conceptId: "yin-yang-lines", conceptTitle: "阴阳与爻" },
  developing: { title: "沿着结构继续", description: "你已经有一些基础，可以边复习八卦边开始组合上下卦。", conceptId: "trigrams", conceptTitle: "八卦结构" },
  ready: { title: "进入关系练习", description: "基础识别较稳，建议直接练习六十四卦结构和爻变。", conceptId: "hexagram-composition", conceptTitle: "上下卦与六十四卦" },
};

export function SelfTest() {
  const [savedResult, setSavedResult] = useState<SelfTestResult | null>(null);
  const [started, setStarted] = useState(false);
  const [index, setIndex] = useState(0);
  const [selected, setSelected] = useState<string | null>(null);
  const [answers, setAnswers] = useState<boolean[]>([]);
  const [result, setResult] = useState<SelfTestResult | null>(null);
  const [pendingSave, setPendingSave] = useState<SelfTestResult | null>(null);
  const [saveError, setSaveError] = useState(false);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const exercise = exercises[index];
  const progress = useMemo(() => `${Math.min(index + 1, exercises.length)} / ${exercises.length}`, [index]);
  // The visible counter is one-based ("第 1 / 5 题"), so the progressbar
  // must include the current question as completed viewing progress too.
  const progressPercent = exercises.length > 0
    ? Math.round((Math.min(index + 1, exercises.length) / exercises.length) * 100)
    : 0;
  const refreshSequence = useRef(0);
  const startedRef = useRef(false);
  const mountedRef = useRef(false);

  const refresh = useCallback(() => {
    if (startedRef.current) return;
    const sequence = ++refreshSequence.current;
    setLoading(true);
    setLoadError(false);
    void getPreference("selfTestResult")
      .then((value) => {
        if (sequence !== refreshSequence.current || startedRef.current) return;
        setSavedResult(parseSelfTestResult(value));
        setLoading(false);
      })
      .catch(() => {
        if (sequence !== refreshSequence.current || startedRef.current) return;
        setLoading(false);
        setLoadError(true);
      });
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    const timer = window.setTimeout(refresh, 0);
    window.addEventListener(DATA_CHANGED_EVENT, refresh);
    return () => {
      mountedRef.current = false;
      refreshSequence.current += 1;
      window.clearTimeout(timer);
      window.removeEventListener(DATA_CHANGED_EVENT, refresh);
    };
  }, [refresh]);

  function start() {
    if (loading) return;
    setLoadError(false);
    setSaveError(false);
    setPendingSave(null);
    startedRef.current = true;
    setStarted(true); setResult(null); setIndex(0); setSelected(null); setAnswers([]);
  }

  async function saveResult(nextResult: SelfTestResult) {
    setSaving(true);
    setSaveError(false);
    try {
      await setPreference("selfTestResult", JSON.stringify(nextResult));
      notifyDataChanged();
      if (!mountedRef.current) return;
      setResult(nextResult);
      setSavedResult(nextResult);
      setPendingSave(null);
      setStarted(false);
      startedRef.current = false;
    } catch {
      if (!mountedRef.current) return;
      setResult(nextResult);
      setPendingSave(nextResult);
      setSaveError(true);
      setStarted(false);
      startedRef.current = false;
    } finally {
      if (mountedRef.current) setSaving(false);
    }
  }

  async function choose(option: string) {
    if (selected !== null || !exercise) return;
    const isCorrect = option === exercise.answer;
    setSelected(option);
    const nextAnswers = [...answers, isCorrect];
    if (index < exercises.length - 1) {
      setAnswers(nextAnswers);
      return;
    }
    const nextResult = createSelfTestResult(nextAnswers);
    await saveResult(nextResult);
  }

  function next() {
    if (selected === null || index >= exercises.length - 1) return;
    setIndex((current) => current + 1); setSelected(null);
  }

  if (loading) return <section className="self-test-panel" role="status"><span className="eyebrow">快速自测</span><h2>正在读取上次自测…</h2></section>;
  if (loadError && !started && !result && !savedResult) return <section className="self-test-panel"><strong>快速自测暂时无法读取账户数据。</strong><p>可以重试读取，或先去测试学堂查看练习类型。</p><div className="self-test-actions"><button type="button" className="outline-button" onClick={refresh}>重试读取</button><Link className="outline-button" href="/test-academy">去测试学堂 <span>↗</span></Link></div></section>;

  if (result || savedResult) {
    const display = result ?? savedResult;
    if (!display) return null;
    const displayCopy = levelCopy[display.level];
    return <section className="self-test-panel self-test-result" aria-live="polite"><span className="eyebrow">上次快速自测</span><h2>{displayCopy.title}</h2><strong className="self-test-score">{display.score} <small>/ {display.total} 正确</small></strong><p>{displayCopy.description}</p>{saveError && pendingSave && <div className="self-test-save-error" role="alert"><strong>结果尚未保存到本地。</strong><span>可以重试保存；学习起点建议仍可查看。</span><button type="button" className="outline-button" onClick={() => void saveResult(pendingSave)} disabled={saving}>{saving ? "正在重试…" : "重试保存"}</button></div>}<div className="self-test-actions"><Link className="primary-button" href={`/learn/${displayCopy.conceptId}`}>从「{displayCopy.conceptTitle}」开始 <span>↗</span></Link><button type="button" className="outline-button" onClick={start}>重新测试</button></div><small>自测只用于给出学习起点建议，不会直接修改掌握状态或复习队列。</small></section>;
  }

  if (!started) return <section className="self-test-panel"><span className="eyebrow">快速自测 · 约 3 分钟</span><h2>先看看自己从哪里开始。</h2><p>回答 5 道基础题，系统只根据结果推荐一个学习起点；不记录为正式复习成绩，也不会替你判定“已掌握”。</p><button type="button" className="primary-button" onClick={start}>开始快速自测 <span>→</span></button></section>;

  return <section className="self-test-panel self-test-question" aria-labelledby="self-test-question"><div className="self-test-top"><span className="eyebrow">快速自测</span><span>{progress}</span></div><div className="self-test-progress" role="progressbar" aria-label="快速自测进度" aria-valuemin={0} aria-valuemax={100} aria-valuenow={progressPercent} aria-valuetext={progress}><span style={{ width: `${progressPercent}%` }} /></div><h2 id="self-test-question">{exercise.prompt}</h2><div className="self-test-display">{exercise.display}</div><div className="self-test-choices">{exercise.choices.map((option) => <button type="button" key={option} className={selected === option ? option === exercise.answer ? "correct" : "incorrect" : ""} onClick={() => void choose(option)} disabled={selected !== null || saving}>{option}</button>)}</div>{selected !== null && <div className={`self-test-feedback ${selected === exercise.answer ? "is-correct" : "is-wrong"}`} role="status" aria-live="polite"><strong>{selected === exercise.answer ? "回答正确" : `答案是：${exercise.answer}`}</strong><span>{exercise.explanation}</span></div>}{selected !== null && index < exercises.length - 1 && <button type="button" className="next-review" onClick={next}>下一题 <span>→</span></button>}{saving && <small className="self-test-saving" role="status" aria-live="polite">正在保存自测结果…</small>}</section>;
}
