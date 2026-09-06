"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { EXERCISES, type Exercise, type ExerciseKind } from "@/content/exercises";
import { HEXAGRAMS, type LineValue } from "@/core/iching";
import { HexagramGlyph } from "@/components/hexagram/HexagramGlyph";
import { TrigramSignatureVisual, isTrigramSignature } from "@/components/hexagram/TrigramSignatureVisual";
import { ExerciseDisplayValue } from "@/components/learning/ExerciseDisplayValue";
import { captureLocalNow } from "@/core/date/local";
import { isExerciseAnswerCorrect, normalizeExerciseAnswer } from "@/core/review/answer";
import { saveReviewResult, syncConceptProgress } from "@/db/repository";
import { notifyDataChanged } from "@/db/events";

type AcademyMode = {
  id: string;
  title: string;
  description: string;
  questionType: string;
  example: string;
  href: string;
  kinds: readonly ExerciseKind[];
};

const MODE_KINDS = {
  "recognize-hexagram": ["hexagram-pair"] as const,
  "recognize-line": ["line-position", "trigram-lines-name", "trigram-arrange-lines", "hexagram-line"] as const,
  judgment: ["hexagram-judgment"] as const,
  "line-meaning": ["hexagram-line-meaning"] as const,
  trigram: ["trigram-name", "trigram-lines", "trigram-lines-name", "trigram-name-lines", "trigram-arrange-lines", "trigram-element", "trigram-direction", "trigram-direction-name", "trigram-nature", "trigram-nature-name", "trigram-family", "trigram-body"] as const,
  cycles: ["five-generates", "five-controls", "stem-element", "stem-yinyang", "stem-name", "branch-element", "branch-direction", "branch-hour", "branch-name", "hetu-direction", "hetu-element", "hetu-numbers", "palace-direction", "palace-number", "palace-trigram", "sexagenary-relation"] as const,
  guess: ["hexagram-guess"] as const,
} satisfies Record<string, readonly ExerciseKind[]>;

const MODES: readonly AcademyMode[] = [
  { id: "recognize-hexagram", title: "认卦", description: "看六爻卦象，选出卦名与上下卦。", questionType: "选择题 · 卦象识别", example: "给出卦象 → 选择“水天需”", href: "/hexagrams", kinds: MODE_KINDS["recognize-hexagram"] },
  { id: "recognize-line", title: "认爻", description: "从阴阳线和位置，认出初爻、二爻直到上爻。", questionType: "选择题 · 爻位识别", example: "三爻结构 → 选择对应卦名或排列", href: "/trigrams", kinds: MODE_KINDS["recognize-line"] },
  { id: "judgment", title: "卦辞理解", description: "把六十四卦卦辞与卦名对应，读完再回答。", questionType: "选择题 · 卦辞识别", example: "“密云不雨”对应哪一卦？", href: "/hexagrams", kinds: MODE_KINDS.judgment },
  { id: "line-meaning", title: "爻辞含义", description: "逐爻判断处境、行动与时位的含义。", questionType: "选择题 · 含义判断", example: "选择最贴合爻辞的学习释义", href: "/hexagrams", kinds: MODE_KINDS["line-meaning"] },
  { id: "trigram", title: "八卦与三爻", description: "识别三爻结构，并连接自然象、五行、方位与家庭角色。", questionType: "选择题 · 三爻识别", example: "三爻图 → 选择乾、兑、离等", href: "/trigrams", kinds: MODE_KINDS.trigram },
  { id: "cycles", title: "五行、干支与九宫", description: "将五行生克、干支序列、河图洛书和九宫放在同一套题型中。", questionType: "选择题 · 关系映射", example: "天干、地支或九宫 → 选择对应关系", href: "/tools", kinds: MODE_KINDS.cycles },
  { id: "guess", title: "猜卦", description: "根据上下卦填写卦名，训练从结构反推六十四卦。", questionType: "填空题 · 自由输入", example: "上坎下乾，卦名是 ______", href: "/hexagrams", kinds: MODE_KINDS.guess },
];

function shuffle<T>(items: readonly T[]): T[] {
  const result = [...items];
  for (let index = result.length - 1; index > 0; index -= 1) {
    const target = Math.floor(Math.random() * (index + 1));
    [result[index], result[target]] = [result[target], result[index]];
  }
  return result;
}

function exerciseKindsFor(modeId: string): readonly ExerciseKind[] {
  return MODES.find((mode) => mode.id === modeId)?.kinds ?? MODE_KINDS["recognize-hexagram"];
}

function QuestionDisplay({ exercise }: { exercise: Exercise }) {
  const hexagram = exercise.targetType === "hexagram" ? HEXAGRAMS.find((item) => item.id === exercise.targetId) : undefined;
  if (hexagram && ["hexagram-pair", "hexagram-guess"].includes(exercise.kind)) return <HexagramGlyph lines={hexagram.lines} label={`${hexagram.name}六爻卦象`} />;
  return <ExerciseDisplayValue value={exercise.display} />;
}

function AnswerValue({ value }: { value: string }) {
  return isTrigramSignature(value) ? <TrigramSignatureVisual value={value} /> : <span>{value}</span>;
}

export function TestAcademy() {
  const [selectedId, setSelectedId] = useState(MODES[0].id);
  const [questions, setQuestions] = useState<Exercise[]>([]);
  const [index, setIndex] = useState(0);
  const [selected, setSelected] = useState<string | null>(null);
  const [textDraft, setTextDraft] = useState("");
  const [lineDraft, setLineDraft] = useState<LineValue[]>([]);
  const [results, setResults] = useState<boolean[]>([]);
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [startedAt, setStartedAt] = useState(0);
  const [finished, setFinished] = useState(false);

  const selectedMode = MODES.find((mode) => mode.id === selectedId) ?? MODES[0];
  const availableCount = useMemo(() => EXERCISES.filter((exercise) => exerciseKindsFor(selectedId).includes(exercise.kind)).length, [selectedId]);
  const exercise = questions[index];
  const correct = Boolean(exercise && selected !== null && isExerciseAnswerCorrect(selected, exercise.answer));

  function start(modeId = selectedId) {
    const kinds = exerciseKindsFor(modeId);
    const pool = EXERCISES.filter((item) => kinds.includes(item.kind));
    setSelectedId(modeId);
    setQuestions(shuffle(pool).slice(0, Math.min(10, pool.length)));
    setIndex(0); setSelected(null); setTextDraft(""); setLineDraft([]); setResults([]); setSaved(false); setSaving(false); setError(""); setStartedAt(Date.now()); setFinished(false);
  }

  function choose(value: string) {
    if (!exercise || selected !== null || saving || !normalizeExerciseAnswer(value)) return;
    setSelected(value); setError(""); setSaved(false);
  }

  function appendLine(value: LineValue) {
    if (selected !== null || saving || lineDraft.length >= 3) return;
    setLineDraft((current) => [...current, value]);
  }

  async function persistAnswer(): Promise<boolean> {
    if (!exercise || selected === null || saved || saving) return saved;
    setSaving(true); setError("");
    const objectiveCorrect = isExerciseAnswerCorrect(selected, exercise.answer);
    const { iso: now, localDate } = captureLocalNow();
    try {
      await saveReviewResult({ exercise, grade: objectiveCorrect ? "remembered" : "forgot", objectiveCorrect, reviewMode: "spaced", hintUsed: false, responseTimeMs: Math.min(86_400_000, Math.max(0, Date.now() - startedAt)), now, localDate });
      if (exercise.targetType === "concept") {
        try { await syncConceptProgress(exercise.targetId, now); } catch { /* attempt remains durable */ }
      }
      notifyDataChanged(); setSaved(true); setResults((current) => [...current, objectiveCorrect]); return true;
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "这次作答尚未写入账户数据库，请重试保存。"); return false;
    } finally { setSaving(false); }
  }

  async function next() {
    if (!exercise || selected === null || saving) return;
    if (!saved && !(await persistAnswer())) return;
    if (index >= questions.length - 1) { setFinished(true); return; }
    setIndex((current) => current + 1); setSelected(null); setTextDraft(""); setLineDraft([]); setSaved(false); setError(""); setStartedAt(Date.now());
  }

  if (finished) {
    const correctCount = results.filter(Boolean).length;
    return <section className="academy-session academy-session-result" aria-live="polite"><span className="eyebrow">测试学堂完成</span><h2>{selectedMode.title} · 本轮结束</h2><strong className="academy-score">{correctCount} <small>/ {questions.length} 正确</small></strong><p>作答与回忆等级已保存到账户数据库，之后会进入统一复习队列。</p><div className="academy-session-actions"><button className="primary-button" type="button" onClick={() => start()}>再练一轮</button><Link className="outline-button" href="/review">去复习队列 <span>↗</span></Link><Link className="outline-button" href="/">回到今日 <span>↗</span></Link></div></section>;
  }

  if (!exercise) {
    return <section className="test-academy-shell" aria-label="测试学堂题型选择"><div className="academy-mode-grid">{MODES.map((mode) => { const count = EXERCISES.filter((item) => mode.kinds.includes(item.kind)).length; return <button type="button" key={mode.id} className={`academy-mode-card ${mode.id === selectedId ? "is-selected" : ""}`} aria-pressed={mode.id === selectedId} onClick={() => setSelectedId(mode.id)}><span>{mode.questionType}</span><strong>{mode.title}</strong><p>{mode.description}</p><small>{count} 道题 · 查看题型说明 ↗</small></button>; })}</div><article className="academy-preview"><div><span className="content-label">当前题型 · {selectedMode.questionType}</span><h2>{selectedMode.title}</h2><p>{selectedMode.example}</p><div className="academy-progress"><span><i style={{ width: availableCount ? "100%" : "0%" }} /></span><small>题库 {availableCount} 道 · 每轮随机 10 题</small></div></div><div className="academy-preview-actions"><Link className="outline-button" href={selectedMode.href}>先看学习内容 <span>↗</span></Link><button className="primary-button" type="button" onClick={() => start()} disabled={!availableCount}>开始本轮练习</button></div></article><div className="academy-footer"><span>统一记录</span><p>认卦、认爻、卦辞、爻辞、五行、干支、九宫和猜卦共用同一套作答记录与间隔复习规则。</p></div></section>;
  }

  const isText = exercise.responseType === "text";
  const isArrange = exercise.kind === "trigram-arrange-lines";
  const progress = Math.round(((index + (selected ? 1 : 0)) / questions.length) * 100);
  return <section className="academy-session" aria-labelledby="academy-session-title"><div className="academy-session-top"><div><span className="eyebrow">测试学堂 · {selectedMode.title}</span><h2 id="academy-session-title">先回忆，再核对。</h2></div><span>{index + 1} / {questions.length}</span></div><div className="academy-session-progress" role="progressbar" aria-label="测试学堂进度" aria-valuemin={0} aria-valuemax={100} aria-valuenow={progress}><span style={{ width: `${progress}%` }} /></div><p className="academy-question-prompt">{exercise.prompt}</p><div className="academy-question-display"><QuestionDisplay exercise={exercise} /></div>{isArrange ? <div className="academy-line-arrangement" aria-label="三爻排列"><div className="academy-line-draft" aria-live="polite">{lineDraft.length ? lineDraft.map((line, lineIndex) => <span key={lineIndex}>{["初", "二", "三"][lineIndex]}爻 · {line === 1 ? "阳" : "阴"}</span>) : <small>从初爻开始选择三条线</small>}</div><div className="academy-line-actions"><button type="button" onClick={() => appendLine(1)} disabled={selected !== null || saving || lineDraft.length >= 3}>阳爻</button><button type="button" onClick={() => appendLine(0)} disabled={selected !== null || saving || lineDraft.length >= 3}>阴爻</button><button type="button" className="outline-button" onClick={() => setLineDraft((current) => current.slice(0, -1))} disabled={selected !== null || saving || !lineDraft.length}>撤回</button><button type="button" className="primary-button" onClick={() => choose(lineDraft.join(""))} disabled={selected !== null || saving || lineDraft.length !== 3}>检查排列</button></div></div> : isText ? <form className="academy-answer-input" onSubmit={(event) => { event.preventDefault(); choose(textDraft); }}><label htmlFor="academy-text-answer">你的答案</label><div><input id="academy-text-answer" value={textDraft} onChange={(event) => setTextDraft(event.target.value)} disabled={selected !== null || saving} placeholder="输入卦名，例如：水天需" autoComplete="off" /><button type="submit" className="primary-button" disabled={selected !== null || saving || !textDraft.trim()}>提交</button></div></form> : <div className="academy-choices">{exercise.choices.map((option) => <button type="button" key={option} className={selected === option ? option === exercise.answer ? "correct" : "incorrect" : ""} onClick={() => choose(option)} disabled={selected !== null || saving}><AnswerValue value={option} /></button>)}</div>}{selected !== null && <div className={`academy-feedback ${correct ? "is-correct" : "is-wrong"}`} role="status" aria-live="polite"><strong>{correct ? "回答正确" : <><span>正确答案：</span><AnswerValue value={exercise.answer} /></>}</strong><p>{exercise.explanation}</p>{error && <span className="academy-save-error">{error}</span>}</div>}{selected !== null && <div className="academy-session-actions"><button type="button" className="primary-button" onClick={() => void next()} disabled={saving}>{saving ? "正在保存…" : index === questions.length - 1 ? "查看本轮总结" : "下一题"} <span>→</span></button>{error && <button type="button" className="outline-button" onClick={() => void persistAnswer()} disabled={saving}>重试保存</button>}</div>}</section>;
}
