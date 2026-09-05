import type { TrigramLines } from "@/core/iching";

export function TrigramGlyph({ lines, label }: { lines: TrigramLines; label?: string }) {
  return <div className="trigram-glyph" role="img" aria-label={label ?? "三爻卦象，从初爻到上爻"}>{[...lines].reverse().map((value, index) => <div className="trigram-line" key={index}><span className={`line-glyph ${value === 1 ? "line-yang" : "line-yin"}`}><span className="line-part" />{value === 0 && <span className="line-gap" aria-hidden="true" />}{value === 0 && <span className="line-part" />}</span></div>)}</div>;
}
