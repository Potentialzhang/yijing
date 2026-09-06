"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { DATA_CHANGED_EVENT, notifyDataChanged } from "@/db/events";
import { type CompassCorrectionRecord } from "@/db/schema";
import { addCompassCorrection, listCompassCorrectionsByUpdatedAt } from "@/db/repository";
import {
  COMPASS_CORRECTION_LIMIT,
  normalizeCompassCorrection,
} from "@/core/compass/correction";
import { formatLocalDateTime } from "@/core/date/local";

type CompassCorrectionProps = {
  offsetDegrees: number;
  onOffsetChange: (offsetDegrees: number) => void;
};

function recordId(): string {
  return (
    globalThis.crypto?.randomUUID?.() ??
    `compass-correction-${Date.now()}-${Math.random().toString(16).slice(2)}`
  );
}

export function CompassCorrection({
  offsetDegrees,
  onOffsetChange,
}: CompassCorrectionProps) {
  const [draft, setDraft] = useState(String(offsetDegrees));
  const [history, setHistory] = useState<CompassCorrectionRecord[]>([]);
  const [status, setStatus] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const refreshSequence = useRef(0);
  const draftDirty = useRef(false);
  const mountedRef = useRef(false);

  const refreshHistory = useCallback(() => {
    const sequence = ++refreshSequence.current;
    setLoading(true);
    setLoadError(false);
    void listCompassCorrectionsByUpdatedAt()
      .then((records) => records.slice(0, 5))
      .then((records) => {
        if (sequence !== refreshSequence.current) return;
        setHistory(records);
        const latest = records[0];
        if (latest && !draftDirty.current) {
          setDraft(String(latest.offsetDegrees));
          onOffsetChange(latest.offsetDegrees);
        }
        setLoading(false);
      })
      .catch(() => {
        if (sequence !== refreshSequence.current) return;
        setLoading(false);
        setLoadError(true);
      });
  }, [onOffsetChange]);

  useEffect(() => {
    mountedRef.current = true;
    const timer = window.setTimeout(refreshHistory, 0);
    const handler = () => refreshHistory();
    window.addEventListener(DATA_CHANGED_EVENT, handler);
    return () => {
      mountedRef.current = false;
      refreshSequence.current += 1;
      window.clearTimeout(timer);
      window.removeEventListener(DATA_CHANGED_EVENT, handler);
    };
  }, [refreshHistory]);

  async function save(offset: number, reason: string) {
    if (saving) return;
    setSaving(true);
    try {
      const now = new Date().toISOString();
      await addCompassCorrection({
        id: recordId(),
        offsetDegrees: offset,
        reason,
        createdAt: now,
        updatedAt: now,
      });
      notifyDataChanged();
      if (!mountedRef.current) return;
      setDraft(String(offset));
      draftDirty.current = false;
      onOffsetChange(offset);
      setStatus(
        `已${offset === 0 ? "重置" : "应用"}手动修正 ${offset > 0 ? "+" : ""}${offset.toFixed(1)}°`,
      );
    } catch {
      if (mountedRef.current) setStatus("修正保存失败，请检查浏览器存储权限后重试");
    } finally {
      if (mountedRef.current) setSaving(false);
    }
  }

  async function applyDraft() {
    const value = Number(draft);
    if (!Number.isFinite(value)) {
      setStatus("修正值必须是数字。");
      return;
    }
    const offset = normalizeCompassCorrection(value);
    await save(offset, "用户手动修正");
  }

  return (
    <section className="compass-correction" aria-label="罗盘手动偏差修正">
      <div className="section-heading">
        <div>
          <p className="eyebrow">罗盘偏差 · 可选修正</p>
          <h2>把已知偏差留下说明。</h2>
        </div>
        <span>
          {offsetDegrees > 0 ? "+" : ""}
          {offsetDegrees.toFixed(1)}°
        </span>
      </div>
      <p className="compass-correction-intro">
        修正只作用于当前设备传感器读数，不改变手动角度、八方规则或坐向记录；它是你的观察备注，不是自动校准或磁偏角。
      </p>
      {loading && <p className="compass-correction-loading" role="status">正在读取修正历史…</p>}
      {loadError && <p className="compass-correction-error" role="alert">修正历史暂时无法读取，当前表单仍可继续编辑。<button type="button" className="text-button" onClick={refreshHistory}>重试读取</button></p>}
      <div className="compass-correction-form">
        <label htmlFor="compass-correction-degrees">
          传感器修正角（-180° 至 +180°）
          <input
            id="compass-correction-degrees"
            type="number"
            min={-COMPASS_CORRECTION_LIMIT}
            max={COMPASS_CORRECTION_LIMIT}
            step="0.1"
            value={draft}
            disabled={loading || saving}
            onChange={(event) => {
              draftDirty.current = true;
              setDraft(event.target.value);
            }}
          />
        </label>
        <div className="compass-correction-actions">
          <button
            type="button"
            className="primary-button"
            onClick={() => void applyDraft()}
            disabled={loading || saving}
          >
            {saving ? "正在保存修正…" : "应用并记录"}
          </button>
          <button
            type="button"
            className="outline-button"
            onClick={() => void save(0, "用户重置修正")}
            disabled={loading || saving}
          >
            重置为 0°
          </button>
        </div>
      </div>
      {status && (
        <p className="share-status" role="status">
          {status}。
        </p>
      )}
      {history.length > 0 && (
        <details className="compass-correction-history">
          <summary>查看最近修正历史（{history.length} 条）</summary>
          <ul>
            {history.map((record) => (
              <li key={record.id}>
                <span>
                  {record.offsetDegrees > 0 ? "+" : ""}
                  {record.offsetDegrees.toFixed(1)}° · {record.reason}
                </span>
                <small>
                  {formatLocalDateTime(record.createdAt)}
                </small>
              </li>
            ))}
          </ul>
        </details>
      )}
    </section>
  );
}
