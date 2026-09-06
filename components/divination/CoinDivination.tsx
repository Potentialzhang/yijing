"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { getHexagramByLines, getTrigram, type HexagramLines, type LinePosition } from "@/core/iching";
import { toggleLines } from "@/core/iching/transforms";
import { HexagramGlyph } from "@/components/hexagram/HexagramGlyph";
import { TrigramGlyph } from "@/components/hexagram/TrigramGlyph";
import { addLabSnapshot } from "@/db/repository";
import { notifyDataChanged } from "@/db/events";

type CoinValue = 6 | 7 | 8 | 9;
type Roll = CoinValue | null;

const COIN_OPTIONS: readonly { value: CoinValue; label: string; detail: string }[] = [
  { value: 6, label: "三反", detail: "老阴 · 动" },
  { value: 7, label: "一正两反", detail: "少阳" },
  { value: 8, label: "两正一反", detail: "少阴" },
  { value: 9, label: "三正", detail: "老阳 · 动" },
];
const POSITION_LABELS = ["初爻", "二爻", "三爻", "四爻", "五爻", "上爻"] as const;

function createId(prefix: string) { return globalThis.crypto?.randomUUID?.() ?? `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`; }

export function CoinDivination() {
  const [rolls, setRolls] = useState<Roll[]>([null, null, null, null, null, null]);
  const [status, setStatus] = useState("");
  const [saving, setSaving] = useState(false);
  const result = useMemo(() => {
    if (rolls.some((roll) => roll === null)) return null;
    const values = rolls as CoinValue[];
    const baseLines = values.map((value) => (value === 6 || value === 8 ? 0 : 1)) as unknown as HexagramLines;
    const movingPositions = new Set(values.map((value, index) => value === 6 || value === 9 ? (index + 1) as LinePosition : null).filter((position): position is LinePosition => position !== null));
    const changedLines = toggleLines(baseLines, movingPositions);
    return { values, base: getHexagramByLines(baseLines), changed: getHexagramByLines(changedLines), baseLines, changedLines, movingPositions };
  }, [rolls]);

  function setRoll(index: number, value: CoinValue) {
    setStatus("");
    setRolls((current) => current.map((roll, rollIndex) => rollIndex === index ? value : roll));
  }

  function clearAll() { setRolls([null, null, null, null, null, null]); setStatus(""); }

  async function saveResult() {
    if (!result || saving) return;
    setSaving(true);
    try {
      const now = new Date().toISOString();
      await addLabSnapshot({ id: createId("divination"), lowerTrigramId: result.base.lowerTrigramId, upperTrigramId: result.base.upperTrigramId, movingPositions: [...result.movingPositions].sort((a, b) => a - b), baseHexagramId: result.base.id, changedHexagramId: result.changed.id, title: `六次铜钱 · ${result.base.name}`, note: `铜钱结果：${result.values.join("、")}；动爻：${result.movingPositions.size ? [...result.movingPositions].join("、") : "无"}`, createdAt: now, updatedAt: now });
      notifyDataChanged();
      setStatus("已保存到推演记录");
    } catch {
      setStatus("保存失败，请稍后重试");
    } finally { setSaving(false); }
  }

  return <section className="coin-divination" aria-label="六次铜钱起卦"><div className="coin-divination-instructions"><span className="content-label">三枚铜钱 · 从初爻开始</span><h2>每次记录一个爻，六次得到本卦。</h2><p>约定正面记 3、反面记 2：三枚铜钱相加得到 6、7、8 或 9。6、9 是动爻，会同时生成变卦。</p></div><div className="coin-roll-grid">{rolls.map((roll, index) => <article className={`coin-roll-card ${roll !== null ? "is-filled" : ""}`} key={POSITION_LABELS[index]}><div className="coin-roll-heading"><strong>{POSITION_LABELS[index]}</strong><span>{roll === null ? "待记录" : `${roll} 分`}</span></div><div className="coin-roll-options">{COIN_OPTIONS.map((option) => <button type="button" key={option.value} className={roll === option.value ? "selected" : ""} aria-pressed={roll === option.value} onClick={() => setRoll(index, option.value)}><b>{option.label}</b><small>{option.detail}</small></button>)}</div></article>)}</div><div className="coin-divination-actions"><button type="button" className="outline-button" onClick={clearAll}>重新起卦</button>{result && <button type="button" className="primary-button" onClick={() => void saveResult()} disabled={saving}>{saving ? "正在保存…" : "保存这次起卦"}</button>}{status && <span role="status">{status}</span>}</div>{result ? <section className="divination-result" aria-live="polite"><div className="divination-result-heading"><div><span className="content-label">起卦结果</span><h2>{result.base.name}</h2><p>动爻：{result.movingPositions.size ? [...result.movingPositions].map((position) => POSITION_LABELS[position - 1]).join("、") : "无"}</p></div><Link className="outline-button" href={`/hexagrams/${result.base.kingWenNumber}`}>查看本卦详情 ↗</Link></div><div className="divination-result-grid"><article><span>本卦 · 第 {result.base.kingWenNumber} 卦</span><HexagramGlyph lines={result.baseLines} movingPositions={result.movingPositions} label={`${result.base.name}本卦`} /><h3>{result.base.name}</h3><div className="divination-trigrams"><span><TrigramGlyph lines={getTrigram(result.base.lowerTrigramId).lines} />下卦 {getTrigram(result.base.lowerTrigramId).name}</span><span><TrigramGlyph lines={getTrigram(result.base.upperTrigramId).lines} />上卦 {getTrigram(result.base.upperTrigramId).name}</span></div></article><div className="divination-arrow" aria-hidden="true">→</div><article><span>变卦</span><HexagramGlyph lines={result.changedLines} label={`${result.changed.name}变卦`} /><h3>{result.changed.name}</h3><Link href={`/hexagrams/${result.changed.kingWenNumber}`}>查看变卦详情 ↗</Link></article></div></section> : <div className="divination-empty"><span>{rolls.filter(Boolean).length}/6</span><p>按顺序记录六次铜钱；完成后这里会自动显示本卦、变卦和动爻。</p></div>}</section>;
}
