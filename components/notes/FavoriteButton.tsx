"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { DATA_CHANGED_EVENT, notifyDataChanged } from "@/db/events";
import { getFavorite, toggleFavoriteAtomically } from "@/db/repository";

export function FavoriteButton({ targetType, targetId }: { targetType: "concept" | "trigram" | "hexagram"; targetId: string }) {
  const id = `${targetType}:${targetId}`;
  const [favorite, setFavorite] = useState(false);
  const [loading, setLoading] = useState(true);
  const [readError, setReadError] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const refreshSequence = useRef(0);
  const mountedRef = useRef(false);
  const lastFavoriteId = useRef(id);
  const refresh = useCallback(() => {
    const sequence = ++refreshSequence.current;
    void getFavorite(id).then((record) => {
      if (sequence !== refreshSequence.current) return;
      setFavorite(Boolean(record));
      setLoading(false);
      setReadError(false);
    }).catch(() => {
      if (sequence !== refreshSequence.current) return;
      setLoading(false);
      setReadError(true);
    });
  }, [id]);
  useEffect(() => {
    mountedRef.current = true;
    if (lastFavoriteId.current !== id) {
      lastFavoriteId.current = id;
      setFavorite(false);
      setLoading(true);
      setReadError(false);
      setError("");
    }
    refresh();
    window.addEventListener(DATA_CHANGED_EVENT, refresh);
    return () => {
      mountedRef.current = false;
      refreshSequence.current += 1;
      window.removeEventListener(DATA_CHANGED_EVENT, refresh);
    };
  }, [id, refresh]);
  async function toggle() {
    if (saving) return;
    setSaving(true);
    setError("");
    try {
      const nextFavorite = await toggleFavoriteAtomically({
        id,
        targetType,
        targetId,
        createdAt: new Date().toISOString(),
      });
      notifyDataChanged();
      if (!mountedRef.current) return;
      setFavorite(nextFavorite);
    } catch {
      if (!mountedRef.current) return;
      setError("收藏保存失败，请检查浏览器存储权限后重试");
    } finally {
      if (mountedRef.current) setSaving(false);
    }
  }
  if (loading) return <button type="button" className="favorite-button is-loading" disabled aria-busy="true">正在读取收藏状态…</button>;
  if (readError) return <span className="favorite-state-error" role="alert"><span>收藏状态暂时无法读取</span><button type="button" onClick={refresh}>重新读取</button></span>;
  return <><button type="button" className={`favorite-button ${favorite ? "is-favorite" : ""}`} aria-pressed={favorite} onClick={() => void toggle()} disabled={saving}>{favorite ? "★ 已收藏" : "☆ 收藏"}</button>{error && <small className="source-error" role="alert">{error}</small>}</>;
}
