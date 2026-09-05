import type { HexagramLines, LinePosition } from "@/core/iching";

interface HexagramGlyphProps {
  lines: HexagramLines;
  movingPositions?: ReadonlySet<LinePosition>;
  interactive?: boolean;
  onToggle?: (position: LinePosition) => void;
  label?: string;
}

function Line({ value, position, moving, interactive, onToggle }: { value: 0 | 1; position: LinePosition; moving: boolean; interactive: boolean; onToggle?: (position: LinePosition) => void }) {
  const content = (
    <span className={`line-glyph ${value === 1 ? "line-yang" : "line-yin"} ${moving ? "line-moving" : ""}`}>
      {moving && <span className="line-moving-mark" aria-hidden="true">动</span>}
      <span className="line-part" />
      {value === 0 && <span className="line-gap" aria-hidden="true" />}
      {value === 0 && <span className="line-part" />}
    </span>
  );

  if (!interactive) return content;
  return (
    <button type="button" className="line-button" aria-label={`${position}爻，${value === 1 ? "阳爻" : "阴爻"}${moving ? "，动爻" : ""}，点击切换`} onClick={() => onToggle?.(position)}>
      {content}
    </button>
  );
}

export function HexagramGlyph({ lines, movingPositions = new Set<LinePosition>(), interactive = false, onToggle, label }: HexagramGlyphProps) {
  return (
    <div className="hexagram-glyph" role={interactive ? "group" : "img"} aria-label={label ?? "六爻卦象，从初爻到上爻"}>
      {[...lines].reverse().map((value, reversedIndex) => {
        const position = (6 - reversedIndex) as LinePosition;
        return (
          <div className="line-row" key={position}>
            <span className="line-position">{position}</span>
            <Line value={value} position={position} moving={movingPositions.has(position)} interactive={interactive} onToggle={onToggle} />
          </div>
        );
      })}
    </div>
  );
}
