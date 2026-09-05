"use client";

import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { TRIGRAMS } from "@/core/iching";
import { HETU_GROUPS, LUOSHU_GRID, getNinePalace, type NinePalace } from "@/content/hetu-luoshu";

type Layer = "hetu" | "luoshu" | "palaces";
const layers: readonly { id: Layer; label: string; description: string }[] = [
  { id: "hetu", label: "河图", description: "按方向与五行查看一六、二七、三八、四九、五十的成组提示。" },
  { id: "luoshu", label: "洛书", description: "只看九个数字的网格排列；不把数字格直接当作九宫名称。" },
  { id: "palaces", label: "九宫", description: "点击宫位查看数字、方位、关联卦和五行；当前是学习用静态映射。" },
];
const PALACE_LAYOUT = [4, 9, 2, 3, 5, 7, 8, 1, 6] as const;

function PalaceDetail({ palace }: { palace: NinePalace }) {
  const trigram = TRIGRAMS.find((item) => item.id === palace.trigramId);
  return <article className="palace-detail" role="status" aria-live="polite" aria-atomic="true"><span className="content-label">九宫字段 · 待复核</span><h2>{palace.name}</h2><div className="palace-facts"><span>数字<strong>{palace.number}</strong></span><span>方位<strong>{palace.direction}</strong></span><span>关联卦<strong>{trigram?.symbol} {trigram?.name ?? palace.trigramId}</strong></span><span>五行<strong>{palace.element}</strong></span></div><p>{palace.mnemonic}</p><small>此关联用于学习记忆，不构成罗盘读数或现实判断。</small></article>;
}

export function HeTuLuoShuExplorer() {
  const [layer, setLayer] = useState<Layer>("hetu");
  const [selectedPalaceNumber, setSelectedPalaceNumber] = useState<number>(1);
  const layerFocusTarget = useRef<Layer | null>(null);
  const current = layers.find((item) => item.id === layer) ?? layers[0];
  const selectedPalace = useMemo(() => getNinePalace(selectedPalaceNumber), [selectedPalaceNumber]);
  useEffect(() => {
    const target = layerFocusTarget.current;
    if (target === null) return;
    layerFocusTarget.current = null;
    document.querySelector<HTMLButtonElement>(
      `.hetu-luoshu-explorer .relation-mode button[data-layer="${target}"]`,
    )?.focus();
  }, [layer]);
  function moveLayer(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    const nextIndex = event.key === "Home"
      ? 0
      : event.key === "End"
        ? layers.length - 1
        : event.key === "ArrowLeft" || event.key === "ArrowUp" || event.key === "ArrowRight" || event.key === "ArrowDown"
          ? (index + (event.key === "ArrowLeft" || event.key === "ArrowUp" ? -1 : 1) + layers.length) % layers.length
          : null;
    if (nextIndex === null) return;
    event.preventDefault();
    const next = layers[nextIndex];
    layerFocusTarget.current = next.id;
    setLayer(next.id);
  }
  return (
    <section className="hetu-luoshu-explorer" aria-label="河图洛书九宫学习工具">
      <div className="relation-mode" role="tablist" aria-label="河图洛书九宫层">
        <div>
          {layers.map((item, index) => (
            <button
              type="button"
              role="tab"
              id={`hetu-layer-${item.id}`}
              data-layer={item.id}
              tabIndex={layer === item.id ? 0 : -1}
              key={item.id}
              className={layer === item.id ? "selected" : ""}
              aria-selected={layer === item.id}
              aria-controls="hetu-layer-panel"
              onKeyDown={(event) => moveLayer(event, index)}
              onClick={() => setLayer(item.id)}
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>
      <div
        id="hetu-layer-panel"
        role="tabpanel"
        tabIndex={0}
        aria-labelledby={`hetu-layer-${layer}`}
      >
        <p className="relation-description">{current.description}</p>
        {layer === "hetu" && (
          <div className="hetu-groups" aria-label="河图五组数字">
            {HETU_GROUPS.map((group) => (
              <article className="hetu-group" key={group.id}>
                <span>{group.direction}</span>
                <strong>{group.numbers[0]} · {group.numbers[1]}</strong>
                <em>{group.element}</em>
                <p>{group.mnemonic}</p>
              </article>
            ))}
          </div>
        )}
        {layer === "luoshu" && (
          <div className="luoshu-panel">
            <div className="luoshu-grid" aria-label="洛书数字网格">
              {LUOSHU_GRID.map((cell) => (
                <div className="luoshu-cell" key={`${cell.row}-${cell.column}`}>
                  <strong>{cell.number}</strong>
                  <span>{cell.direction}</span>
                </div>
              ))}
            </div>
            <p className="luoshu-note">每条横、竖、斜线的数字和为 15；这是数字结构提示，不等同于九宫标签。</p>
          </div>
        )}
        {layer === "palaces" && (
          <div className="palace-layout">
            <div className="palace-grid" aria-label="九宫交互图">
              {PALACE_LAYOUT.map((number) => {
                const palace = getNinePalace(number);
                return (
                  <button
                    type="button"
                    key={palace.id}
                    className={selectedPalaceNumber === number ? "selected" : ""}
                    aria-pressed={selectedPalaceNumber === number}
                    onClick={() => setSelectedPalaceNumber(number)}
                  >
                    <strong>{palace.number}</strong>
                    <span>{palace.direction}</span>
                  </button>
                );
              })}
            </div>
            <PalaceDetail palace={selectedPalace} />
          </div>
        )}
      </div>
    </section>
  );
}
