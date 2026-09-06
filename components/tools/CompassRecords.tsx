"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { compassDirectionAt } from "@/content/compass";
import { DATA_CHANGED_EVENT, notifyDataChanged } from "@/db/events";
import { type CompassRecord } from "@/db/schema";
import { addCompassRecord, listCompassRecordsByUpdatedAt } from "@/db/repository";
import { formatLocalDateTime } from "@/core/date/local";
import { normalizeDegrees } from "@/core/compass/directions";
import { mountainBearing } from "@/content/mountains";

type CompassRecordsProps = {
  degrees: number;
  allowSave?: boolean;
  onRestore: (record: CompassRecord) => void;
};

function recordId(): string {
  return (
    globalThis.crypto?.randomUUID?.() ??
    `compass-${Date.now()}-${Math.random().toString(16).slice(2)}`
  );
}

export function CompassRecords({
  degrees,
  allowSave = true,
  onRestore,
}: CompassRecordsProps) {
  const [title, setTitle] = useState("");
  const [environmentNote, setEnvironmentNote] = useState("");
  const [records, setRecords] = useState<CompassRecord[]>([]);
  const [status, setStatus] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const refreshSequence = useRef(0);
  const mountedRef = useRef(false);

  const refreshRecords = useCallback(() => {
    const sequence = ++refreshSequence.current;
    setLoading(true);
    setLoadError(false);
    void listCompassRecordsByUpdatedAt()
      .then((nextRecords) => {
        if (sequence !== refreshSequence.current) return;
        setRecords(nextRecords);
        setLoading(false);
        setLoadError(false);
      })
      .catch(() => {
        if (sequence !== refreshSequence.current) return;
        setLoading(false);
        setLoadError(true);
        setStatus("历史坐向记录暂时无法读取，请检查网络和账户会话后重试");
      });
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    const timer = window.setTimeout(refreshRecords, 0);
    window.addEventListener(DATA_CHANGED_EVENT, refreshRecords);
    return () => {
      mountedRef.current = false;
      refreshSequence.current += 1;
      window.clearTimeout(timer);
      window.removeEventListener(DATA_CHANGED_EVENT, refreshRecords);
    };
  }, [refreshRecords]);

  async function saveRecord() {
    if (saving) return;
    setSaving(true);
    try {
      const normalizedDegrees = normalizeDegrees(degrees);
      const direction = compassDirectionAt(normalizedDegrees);
      const now = new Date().toISOString();
      await addCompassRecord({
        id: recordId(),
        degrees: normalizedDegrees,
        directionId: direction.id,
        layerId: "eight-directions-v1",
        ruleVersion: 1,
        title: title.trim() || "未命名坐向",
        environmentNote: environmentNote.trim(),
        createdAt: now,
        updatedAt: now,
      });
      notifyDataChanged();
      if (!mountedRef.current) return;
      setTitle("");
      setEnvironmentNote("");
      setStatus(`已保存 ${direction.label} · ${normalizedDegrees.toFixed(1)}°`);
    } catch {
      if (mountedRef.current) setStatus("坐向保存失败，请检查网络和账户会话后重试");
    } finally {
      if (mountedRef.current) setSaving(false);
    }
  }

  return (
    <section className="compass-records" aria-label="坐向记录">
      <div className="section-heading">
        <div>
          <p className="eyebrow">坐向记录 · 账户数据库</p>
          <h2>把一次观察留下来。</h2>
        </div>
        <span>{records.length} 条</span>
      </div>
      <p className="compass-records-intro">
        记录当前手工角度、当时的环境和你的标题。这里保存的是学习观察，不是传感器测量或现实决策结论。
      </p>
      {loading && <p className="compass-records-loading" role="status">正在读取历史坐向…</p>}
      {loadError && <p className="compass-records-error" role="alert">历史坐向记录暂时无法读取，当前表单仍可继续使用。<button type="button" className="text-button" onClick={refreshRecords}>重试读取</button></p>}
      <div className="compass-record-form">
        <label>
          记录标题
          <input
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            placeholder="例如：书桌朝向记录"
          />
        </label>
        <label>
          环境备注
          <textarea
            value={environmentNote}
            onChange={(event) => setEnvironmentNote(event.target.value)}
            placeholder="例如：下午、站在门内向外观察……"
          />
        </label>
        <button
          type="button"
          className="primary-button"
          onClick={() => void saveRecord()}
          disabled={!allowSave || loading || saving}
        >
          {saving ? "正在保存坐向…" : "保存当前坐向"}
        </button>
      </div>
      {!allowSave && (
        <small className="compass-records-hint">
          正在读取设备方向；停止读取后才能把当前角度保存为手工坐向。
        </small>
      )}
      {status && (
        <p className="share-status" role="status">
          {status}。
        </p>
      )}
      {records.length > 0 && (
        <div
          className="snapshot-list compass-record-list"
          aria-label="历史坐向记录"
        >
          {records.map((record) => {
            const direction = compassDirectionAt(record.degrees);
            const bearing = mountainBearing(record.degrees);
            return (
              <div className="snapshot-item" key={record.id}>
                <div>
                  <strong>{record.title}</strong>
                  <small>
                    {direction.label} · {record.degrees.toFixed(1)}° ·{" "}
                    {formatLocalDateTime(record.createdAt)}
                  </small>
                  {record.environmentNote && <p>{record.environmentNote}</p>}
                  <small>按地盘正针换算：坐{bearing.sitting.name}向{bearing.facing.name}</small>
                </div>
                <button
                  type="button"
                  className="outline-button"
                  onClick={() => {
                    onRestore(record);
                    setStatus(`已恢复“${record.title}”`);
                  }}
                >
                  恢复
                </button>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
