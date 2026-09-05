"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { getHexagramByLines, getHexagramByPair, getTrigram, relationHexagrams, TRIGRAMS, toggleLines } from "@/core/iching";
import type { LinePosition, TrigramId } from "@/core/iching";
import { HexagramGlyph } from "@/components/hexagram/HexagramGlyph";
import { type LabSnapshotRecord } from "@/db/schema";
import { addLabSnapshot, listLabSnapshotsByUpdatedAt } from "@/db/repository";
import { DATA_CHANGED_EVENT, notifyDataChanged } from "@/db/events";
import { formatLocalDateTime } from "@/core/date/local";

const POSITIONS: readonly LinePosition[] = [1, 2, 3, 4, 5, 6];

function RelationCard({ title, name, number, process }: { title: string; name: string; number: number; process: string }) {
  return <div className="relation-card"><span>{title}</span><strong>{name}</strong><small>第 {number} 卦</small><details><summary>查看计算过程</summary><p>{process}</p></details></div>;
}

type LabSnapshot = { lowerId: TrigramId; upperId: TrigramId; moving: ReadonlySet<LinePosition> };

export function HexagramLab({ id = "lab" }: { id?: string } = {}) {
  const [lowerId, setLowerId] = useState<TrigramId>("qian");
  const [upperId, setUpperId] = useState<TrigramId>("qian");
  const [moving, setMoving] = useState<ReadonlySet<LinePosition>>(new Set());
  const [shareStatus, setShareStatus] = useState("");
  const [past, setPast] = useState<LabSnapshot[]>([]);
  const [snapshotTitle, setSnapshotTitle] = useState("");
  const [snapshotNote, setSnapshotNote] = useState("");
  const [snapshots, setSnapshots] = useState<LabSnapshotRecord[]>([]);
  const [snapshotLoading, setSnapshotLoading] = useState(true);
  const [snapshotSaving, setSnapshotSaving] = useState(false);
  const [snapshotError, setSnapshotError] = useState(false);
  const initialized = useRef(false);
  const mountedRef = useRef(false);
  const base = useMemo(() => getHexagramByPair(lowerId, upperId), [lowerId, upperId]);
  const changedLines = useMemo(() => toggleLines(base.lines, moving), [base.lines, moving]);
  const changed = useMemo(() => getHexagramByLines(changedLines), [changedLines]);
  const relations = useMemo(() => relationHexagrams(base.lines), [base.lines]);

  const snapshotRefreshSequence = useRef(0);
  const refreshSnapshots = useCallback(() => {
    const sequence = ++snapshotRefreshSequence.current;
    setSnapshotLoading(true);
    setSnapshotError(false);
    void listLabSnapshotsByUpdatedAt().then((nextSnapshots) => {
      if (sequence !== snapshotRefreshSequence.current) return;
      setSnapshots(nextSnapshots);
      setSnapshotLoading(false);
      setSnapshotError(false);
    }).catch(() => {
      if (sequence !== snapshotRefreshSequence.current) return;
      setSnapshotLoading(false);
      setSnapshotError(true);
    });
  }, []);
  useEffect(() => {
    mountedRef.current = true;
    const timer = window.setTimeout(refreshSnapshots, 0);
    window.addEventListener(DATA_CHANGED_EVENT, refreshSnapshots);
    return () => {
      mountedRef.current = false;
      snapshotRefreshSequence.current += 1;
      window.clearTimeout(timer);
      window.removeEventListener(DATA_CHANGED_EVENT, refreshSnapshots);
    };
  }, [refreshSnapshots]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      const params = new URLSearchParams(window.location.search);
      const lower = params.get("lower");
      const upper = params.get("upper");
      const movingParam = params.get("moving");
      const validTrigrams = new Set(TRIGRAMS.map((trigram) => trigram.id));
      let invalid = false;
      if (lower && !validTrigrams.has(lower as TrigramId)) invalid = true;
      if (upper && !validTrigrams.has(upper as TrigramId)) invalid = true;
      if (lower && validTrigrams.has(lower as TrigramId)) setLowerId(lower as TrigramId);
      if (upper && validTrigrams.has(upper as TrigramId)) setUpperId(upper as TrigramId);
      if (movingParam) {
        const positions = movingParam.split(",").map(Number).filter((position): position is LinePosition => POSITIONS.includes(position as LinePosition));
        if (positions.length !== movingParam.split(",").length) invalid = true;
        setMoving(new Set(positions));
      }
      if (invalid) setShareStatus("分享参数无效，已回退到默认可用值");
      initialized.current = true;
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (!initialized.current) return;
    const params = new URLSearchParams();
    params.set("lower", lowerId); params.set("upper", upperId);
    if (moving.size) params.set("moving", [...moving].sort((a, b) => a - b).join(","));
    window.history.replaceState(null, "", `${window.location.pathname}?${params.toString()}${window.location.hash}`);
  }, [lowerId, upperId, moving]);

  function togglePosition(position: LinePosition) {
    const next = new Set(moving);
    if (next.has(position)) next.delete(position); else next.add(position);
    setPast((previous) => [...previous, { lowerId, upperId, moving }].slice(-20));
    setMoving(next);
  }

  function updateTrigrams(nextLower: TrigramId, nextUpper: TrigramId) { setPast((previous) => [...previous, { lowerId, upperId, moving }].slice(-20)); setLowerId(nextLower); setUpperId(nextUpper); setMoving(new Set()); }
  function swapTrigrams() { updateTrigrams(upperId, lowerId); }
  function undo() { const previous = past[past.length - 1]; if (!previous) return; setPast((items) => items.slice(0, -1)); setLowerId(previous.lowerId); setUpperId(previous.upperId); setMoving(previous.moving); }
  function resetLab() { setPast([]); setLowerId("qian"); setUpperId("qian"); setMoving(new Set()); }

  async function saveSnapshot() {
    if (snapshotSaving) return;
    setSnapshotSaving(true);
    try {
      const now = new Date().toISOString();
      const id = globalThis.crypto?.randomUUID?.() ?? `lab-${Date.now()}-${Math.random().toString(16).slice(2)}`;
      await addLabSnapshot({ id, lowerTrigramId: lowerId, upperTrigramId: upperId, movingPositions: [...moving].sort((a, b) => a - b), baseHexagramId: base.id, changedHexagramId: changed.id, title: snapshotTitle.trim() || `${base.name}${moving.size ? ` · ${[...moving].sort((a, b) => a - b).join("、")}爻变` : " · 结构"}`, note: snapshotNote.trim(), createdAt: now, updatedAt: now });
      notifyDataChanged();
      if (!mountedRef.current) return;
      setSnapshotTitle(""); setSnapshotNote(""); setShareStatus("推演快照已保存");
    } catch {
      if (mountedRef.current) setShareStatus("推演快照保存失败，请检查浏览器存储权限后重试");
    } finally {
      if (mountedRef.current) setSnapshotSaving(false);
    }
  }

  function restoreSnapshot(snapshot: LabSnapshotRecord) {
    const validPositions = snapshot.movingPositions.filter((position): position is LinePosition => POSITIONS.includes(position as LinePosition));
    if (!TRIGRAMS.some((trigram) => trigram.id === snapshot.lowerTrigramId) || !TRIGRAMS.some((trigram) => trigram.id === snapshot.upperTrigramId)) return;
    setPast((previous) => [...previous, { lowerId, upperId, moving }].slice(-20));
    setLowerId(snapshot.lowerTrigramId as TrigramId); setUpperId(snapshot.upperTrigramId as TrigramId); setMoving(new Set(validPositions)); setShareStatus(`已恢复“${snapshot.title}”`);
  }

  async function copyShareLink() {
    try { await navigator.clipboard.writeText(window.location.href); setShareStatus("分享链接已复制"); }
    catch { if (mountedRef.current) setShareStatus("浏览器未允许自动复制，请直接复制地址栏链接"); }
  }

  return (
    <section className="lab-shell" id={id} aria-labelledby="lab-title">
      <div className="section-heading"><div><p className="eyebrow">卦象实验室 · 交互练习</p><h2 id="lab-title">组合上下卦，观察一爻如何改变全局</h2></div><div className="lab-actions"><button className="text-button" type="button" onClick={undo} disabled={!past.length}>撤销一步</button><button className="text-button" type="button" onClick={resetLab}>重置实验</button><button className="text-button" type="button" onClick={() => void copyShareLink()}>复制分享链接</button></div></div>
      <div className="lab-grid">
        <div className="panel lab-controls">
          <div className="control-row"><label htmlFor="lower-trigram">下卦</label><select id="lower-trigram" value={lowerId} onChange={(event) => updateTrigrams(event.target.value as TrigramId, upperId)}>{TRIGRAMS.map((trigram) => <option value={trigram.id} key={trigram.id}>{trigram.symbol} {trigram.name} · {trigram.nature}</option>)}</select></div>
          <div className="control-row"><label htmlFor="upper-trigram">上卦</label><select id="upper-trigram" value={upperId} onChange={(event) => updateTrigrams(lowerId, event.target.value as TrigramId)}>{TRIGRAMS.map((trigram) => <option value={trigram.id} key={trigram.id}>{trigram.symbol} {trigram.name} · {trigram.nature}</option>)}</select></div>
          <button type="button" className="outline-button swap-button" onClick={swapTrigrams}>交换上下卦 ↕</button>
          <div className="hint-box"><strong>点击任意一爻，设置或取消动爻</strong><span>数据按初爻到上爻从下往上保存；显示时上爻在上。</span></div>
          <div className="position-chips" aria-label="动爻位置">{POSITIONS.map((position) => <button type="button" className={`position-chip ${moving.has(position) ? "is-active" : ""}`} key={position} aria-pressed={moving.has(position)} onClick={() => togglePosition(position)}>{position}爻</button>)}</div>
          <details className="lab-save-panel"><summary>保存这次推演</summary><label>标题<input value={snapshotTitle} onChange={(event) => setSnapshotTitle(event.target.value)} placeholder="例如：乾坤交换练习" disabled={snapshotSaving} /></label><label>备注<textarea value={snapshotNote} onChange={(event) => setSnapshotNote(event.target.value)} placeholder="记录这次推演的观察……" disabled={snapshotSaving} /></label><button type="button" className="primary-button" onClick={() => void saveSnapshot()} disabled={snapshotSaving}>{snapshotSaving ? "正在保存快照…" : "保存快照"}</button></details>
        </div>
        <div className="panel primary-result">
          <div className="result-column"><span className="result-label">本卦 · 第 {base.kingWenNumber} 卦</span><h3>{base.name}</h3><div className="trigram-pair"><span>上 {getTrigram(base.upperTrigramId).symbol}</span><span>下 {getTrigram(base.lowerTrigramId).symbol}</span></div><HexagramGlyph lines={base.lines} movingPositions={moving} interactive onToggle={togglePosition} label={`${base.name}，可点击设置动爻`} /></div>
          <div className="change-arrow" aria-hidden="true">→</div>
          <div className="result-column changed-result"><span className="result-label">变卦 · {moving.size ? `动 ${[...moving].sort((a, b) => a - b).join("、")} 爻` : "暂无动爻"}</span><h3>{changed.name}</h3><HexagramGlyph lines={changed.lines} label={`${changed.name}，变卦`} /><p>{moving.size ? "动爻已切换，观察本卦与变卦的结构差异。" : "先选择一爻，开始观察变化。"}</p>{moving.size > 0 && <ul className="change-explanation">{[...moving].sort((a, b) => a - b).map((position) => <li key={position}>第 {position} 爻：{base.lines[position - 1] === 1 ? "阳" : "阴"} → {changed.lines[position - 1] === 1 ? "阳" : "阴"}</li>)}</ul>}</div>
        </div>
      </div>
      <div className="relations-grid" aria-label="关系卦"><RelationCard title="错卦 · 阴阳反转" name={relations.opposite.name} number={relations.opposite.kingWenNumber} process="逐爻将六个阴阳值反转：1 变 0，0 变 1。" /><RelationCard title="综卦 · 上下倒置" name={relations.reversed.name} number={relations.reversed.kingWenNumber} process="把第 1～6 爻倒序排列，初爻与上爻交换位置。" /><RelationCard title="互卦 · 取二至五爻" name={relations.nuclear.name} number={relations.nuclear.kingWenNumber} process="下互取第 2、3、4 爻，上互取第 3、4、5 爻，再组合为六爻。" /></div>
      {snapshotLoading && <p className="lab-snapshot-loading" role="status">正在读取已保存推演…</p>}
      {snapshotError && <p className="lab-snapshot-error" role="alert">已保存推演暂时无法读取，当前实验内容仍可继续使用。<button type="button" className="text-button" onClick={refreshSnapshots}>重试读取</button></p>}
      {!snapshotLoading && snapshots.length > 0 && <section className="lab-snapshots" aria-label="已保存推演"><div className="section-heading"><div><p className="eyebrow">本地快照</p><h3>继续之前的推演</h3></div><span>{snapshots.length} 条</span></div><div className="snapshot-list">{snapshots.map((snapshot) => <div className="snapshot-item" key={snapshot.id}><div><strong>{snapshot.title}</strong><small>{snapshot.baseHexagramId} → {snapshot.changedHexagramId} · {formatLocalDateTime(snapshot.createdAt)}</small>{snapshot.note && <p>{snapshot.note}</p>}</div><button type="button" className="outline-button" onClick={() => restoreSnapshot(snapshot)}>恢复</button></div>)}</div></section>}
      {shareStatus && <p className="share-status" role="status">{shareStatus}。链接只包含上下卦与动爻，不包含个人笔记。</p>}
    </section>
  );
}
