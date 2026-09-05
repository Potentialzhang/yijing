"use client";

import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { HEXAGRAMS, getTrigram } from "@/core/iching";
import { HexagramGlyph } from "@/components/hexagram/HexagramGlyph";
import { readHexagramIndexSnapshot } from "@/db/repository";
import { DATA_CHANGED_EVENT } from "@/db/events";

const HexagramIndexCard = memo(function HexagramIndexCard({ hexagram, favorite, studied }: { hexagram: (typeof HEXAGRAMS)[number]; favorite: boolean; studied: boolean }) {
  return <Link href={`/hexagrams/${hexagram.kingWenNumber}`} className="hexagram-index-card"><span className="hex-number">{String(hexagram.kingWenNumber).padStart(2, "0")}</span><span className="unicode-symbol" aria-hidden="true">{hexagram.unicodeSymbol}</span><HexagramGlyph lines={hexagram.lines} label={`${hexagram.name}卦象`} /><div><strong>{hexagram.name}</strong><small>上 {getTrigram(hexagram.upperTrigramId).name} · 下 {getTrigram(hexagram.lowerTrigramId).name}</small><small className="index-status">{favorite ? "★ 已收藏" : studied ? "已学习" : "未开始"}</small></div><span className="index-arrow">↗</span></Link>;
});

export function HexagramIndex() {
  const [query, setQuery] = useState("");
  const [filterQuery, setFilterQuery] = useState("");
  const isComposing = useRef(false);
  const [favoriteIds, setFavoriteIds] = useState<Set<string>>(new Set());
  const [studiedIds, setStudiedIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const refreshSequence = useRef(0);
  const refreshStatus = useCallback(() => {
    const sequence = ++refreshSequence.current;
    void readHexagramIndexSnapshot().then(({ favorites, reviewCardStates: states }) => {
      if (sequence !== refreshSequence.current) return;
      setLoading(false);
      setLoadError(false);
      setFavoriteIds(new Set(favorites.filter((item) => item.targetType === "hexagram").map((item) => item.targetId)));
      setStudiedIds(new Set(states.filter((item) => item.targetType === "hexagram").map((item) => item.targetId)));
    }).catch(() => {
      if (sequence !== refreshSequence.current) return;
      setLoading(false);
      setLoadError(true);
    });
  }, []);
  useEffect(() => {
    refreshStatus();
    window.addEventListener(DATA_CHANGED_EVENT, refreshStatus);
    return () => {
      refreshSequence.current += 1;
      window.removeEventListener(DATA_CHANGED_EVENT, refreshStatus);
    };
  }, [refreshStatus]);
  const filtered = useMemo(() => {
    const normalized = filterQuery.trim().toLowerCase();
    if (!normalized) return HEXAGRAMS;
    return HEXAGRAMS.filter((hexagram) => {
      const upper = getTrigram(hexagram.upperTrigramId);
      const lower = getTrigram(hexagram.lowerTrigramId);
      return `${hexagram.name} ${hexagram.kingWenNumber} 上${upper.name} 下${lower.name} ${upper.name} ${lower.name} ${hexagram.upperTrigramId} ${hexagram.lowerTrigramId}`.toLowerCase().includes(normalized);
    });
  }, [filterQuery]);
  if (loading) return <div className="hexagram-index-state" role="status" aria-live="polite">正在读取卦象学习状态…</div>;
  if (loadError) return <div className="hexagram-index-state is-error" role="alert"><strong>卦象学习状态暂时无法读取</strong><span>卦象内容仍可稍后查看，请检查浏览器存储权限后重试。</span><button type="button" className="outline-button" onClick={refreshStatus}>重新读取</button></div>;
  const updateQuery = (value: string) => {
    setQuery(value);
    if (!isComposing.current) setFilterQuery(value);
  };
  const clearQuery = () => {
    setQuery("");
    setFilterQuery("");
  };
  return <><div className="hexagram-toolbar"><label>搜索卦名、序号或上下卦<input value={query} onChange={(event) => updateQuery(event.target.value)} onCompositionStart={() => { isComposing.current = true; }} onCompositionEnd={(event) => { isComposing.current = false; updateQuery(event.currentTarget.value); }} placeholder="例如：既济、63、上坎" /></label>{query && <button type="button" className="text-button clear-search" onClick={clearQuery}>清空筛选</button>}<span role="status" aria-live="polite" aria-atomic="true">{filtered.length === HEXAGRAMS.length ? `共 ${HEXAGRAMS.length} 卦` : `匹配 ${filtered.length} 卦`}</span></div>{filtered.length ? <div className="hexagram-index">{filtered.map((hexagram) => <HexagramIndexCard key={hexagram.id} hexagram={hexagram} favorite={favoriteIds.has(hexagram.id)} studied={studiedIds.has(hexagram.id)} />)}</div> : <div className="empty-state"><span>⌕</span><h2>没有匹配的卦</h2><p>可以输入卦名、1～64 的序号，或上卦/下卦名称。</p><button type="button" className="outline-button" onClick={clearQuery}>清空搜索</button></div>}</>;
}
