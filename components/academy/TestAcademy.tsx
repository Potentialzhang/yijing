"use client";

import { useState } from "react";
import Link from "next/link";

type AcademyMode = {
  id: string;
  title: string;
  description: string;
  questionType: string;
  example: string;
  href: string;
};

const MODES: readonly AcademyMode[] = [
  { id: "recognize-hexagram", title: "认卦", description: "看六爻卦象，选出卦名与上下卦。", questionType: "选择题 · 卦象识别", example: "给出卦象 → 选择“水天需”", href: "/hexagrams" },
  { id: "recognize-line", title: "认爻", description: "从阴阳线和位置，认出初爻、二爻直到上爻。", questionType: "选择题 · 爻位识别", example: "高亮一爻 → 选择它的爻位", href: "/hexagrams/1" },
  { id: "judgment", title: "卦辞理解", description: "把卦辞中的关键意象与主题配对。", questionType: "选择题 · 语义配对", example: "“密云不雨”对应哪一卦？", href: "/hexagrams" },
  { id: "line-meaning", title: "爻辞含义", description: "逐爻判断处境、行动与时位的含义。", questionType: "选择题 · 含义判断", example: "选择最贴合爻辞的解释", href: "/hexagrams" },
  { id: "trigram", title: "八卦与三爻", description: "直接识别三爻结构，并连接自然象、五行与方位。", questionType: "选择题 · 三爻识别", example: "三爻图 → 选择乾、兑、离等", href: "/trigrams" },
  { id: "cycles", title: "五行、干支与罗盘", description: "将五行生克、干支序列、二十四山和角度映射放在同一套题型中。", questionType: "选择题 · 关系映射", example: "角度或干支 → 选择对应关系", href: "/tools" },
  { id: "guess", title: "猜卦", description: "根据上下卦、卦德或卦辞提示写出卦名。", questionType: "填空题 · 自由输入", example: "上坎下乾，卦名是 ______", href: "/hexagrams" },
];

export function TestAcademy() {
  const [selectedId, setSelectedId] = useState(MODES[0].id);
  const selected = MODES.find((item) => item.id === selectedId) ?? MODES[0];
  return <section className="test-academy-shell" aria-label="测试学堂题型选择"><div className="academy-mode-grid">{MODES.map((mode) => <button type="button" key={mode.id} className={`academy-mode-card ${mode.id === selectedId ? "is-selected" : ""}`} aria-pressed={mode.id === selectedId} onClick={() => setSelectedId(mode.id)}><span>{mode.questionType}</span><strong>{mode.title}</strong><p>{mode.description}</p><small>查看题型说明 ↗</small></button>)}</div><article className="academy-preview"><div><span className="content-label">当前题型 · {selected.questionType}</span><h2>{selected.title}</h2><p>{selected.example}</p><div className="academy-progress"><span><i style={{ width: "0%" }} /></span><small>题库统一设计中 · 暂不计入成绩</small></div></div><div className="academy-preview-actions"><Link className="outline-button" href={selected.href}>先看学习内容 <span>↗</span></Link><button className="primary-button" type="button" disabled>开始练习（即将开放）</button></div></article><div className="academy-footer"><span>统一入口</span><p>认卦、认爻、卦辞、爻辞、五行、干支、罗盘和猜卦会共用同一套题目记录与复习规则。</p></div></section>;
}
