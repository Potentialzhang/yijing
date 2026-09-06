"use client";

import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { HEXAGRAMS, getHexagramNaturePair, getHexagramTrigramPositionLabel, getTrigram } from "@/core/iching";
import { HexagramGlyph } from "@/components/hexagram/HexagramGlyph";
import { getHexagramStudy } from "@/content/hexagram-study";
import { listFavorites } from "@/db/repository";
import { DATA_CHANGED_EVENT } from "@/db/events";

const HexagramIndexCard = memo(function HexagramIndexCard({ hexagram, favorite }: { hexagram: (typeof HEXAGRAMS)[number]; favorite: boolean }) {
  const study = getHexagramStudy(hexagram);
  return <Link href={`/hexagrams/${hexagram.kingWenNumber}`} className="hexagram-index-card">
    <div className="hex-index-top"><span className="hex-number">第 {hexagram.kingWenNumber} 卦</span><span className="hex-index-nature">{getHexagramNaturePair(hexagram)}</span></div>
    <div className="hex-index-visual"><HexagramGlyph lines={hexagram.lines} label={`${study.shortName}六爻卦象`} /></div>
    <div className="hex-index-copy"><strong>{study.shortName}</strong><small>{getHexagramTrigramPositionLabel(hexagram)}</small>{favorite && <small className="index-favorite">★ 已收藏</small>}</div>
  </Link>;
});

export function HexagramIndex() {
  const [query, setQuery] = useState("");
  const [filterQuery, setFilterQuery] = useState("");
  const isComposing = useRef(false);
  const [favoriteIds, setFavoriteIds] = useState<Set<string>>(new Set());
  const [loadError, setLoadError] = useState(false);
  const refreshSequence = useRef(0);
  const refreshFavorites = useCallback(() => {
    const sequence = ++refreshSequence.current;
    void listFavorites().then((favorites) => {
      if (sequence !== refreshSequence.current) return;
      setLoadError(false);
      setFavoriteIds(new Set(favorites.filter((item) => item.targetType === "hexagram").map((item) => item.targetId)));
    }).catch(() => {
      if (sequence !== refreshSequence.current) return;
      setLoadError(true);
    });
  }, []);
  useEffect(() => {
    refreshFavorites();
    window.addEventListener(DATA_CHANGED_EVENT, refreshFavorites);
    return () => {
      refreshSequence.current += 1;
      window.removeEventListener(DATA_CHANGED_EVENT, refreshFavorites);
    };
  }, [refreshFavorites]);
  const filtered = useMemo(() => {
    const normalized = filterQuery.trim().toLowerCase();
    if (!normalized) return HEXAGRAMS;
    return HEXAGRAMS.filter((hexagram) => {
      const upper = getTrigram(hexagram.upperTrigramId);
      const lower = getTrigram(hexagram.lowerTrigramId);
      return `${hexagram.name} ${hexagram.kingWenNumber} 上${upper.name} 下${lower.name} ${upper.name} ${lower.name} ${hexagram.upperTrigramId} ${hexagram.lowerTrigramId}`.toLowerCase().includes(normalized);
    });
  }, [filterQuery]);
  const updateQuery = (value: string) => {
    setQuery(value);
    if (!isComposing.current) setFilterQuery(value);
  };
  const clearQuery = () => {
    setQuery("");
    setFilterQuery("");
  };
  return <>{loadError && <div className="hexagram-favorite-state" role="alert"><span>收藏标记暂时无法读取，卦库内容不受影响。</span><button type="button" className="text-button" onClick={refreshFavorites}>重试</button></div>}<div className="hexagram-toolbar"><label>搜索卦名、序号或上下卦<input value={query} onChange={(event) => updateQuery(event.target.value)} onCompositionStart={() => { isComposing.current = true; }} onCompositionEnd={(event) => { isComposing.current = false; updateQuery(event.currentTarget.value); }} placeholder="例如：既济、63、上坎" /></label>{query && <button type="button" className="text-button clear-search" onClick={clearQuery}>清空筛选</button>}<span role="status" aria-live="polite" aria-atomic="true">{filtered.length === HEXAGRAMS.length ? `共 ${HEXAGRAMS.length} 卦` : `匹配 ${filtered.length} 卦`}</span></div><p className="hexagram-index-hint">按卦序排列 · 点击卡片查看完整卦德、取象、经典文本与逐爻解释</p>{filtered.length ? <div className="hexagram-index">{filtered.map((hexagram) => <HexagramIndexCard key={hexagram.id} hexagram={hexagram} favorite={favoriteIds.has(hexagram.id)} />)}</div> : <div className="empty-state"><span>⌕</span><h2>没有匹配的卦</h2><p>可以输入卦名、1～64 的序号，或上卦/下卦名称。</p><button type="button" className="outline-button" onClick={clearQuery}>清空搜索</button></div>}</>;
}
