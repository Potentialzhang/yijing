import { TRIGRAMS } from "@/core/iching";
import { TrigramGlyph } from "@/components/hexagram/TrigramGlyph";

function findTrigramBySignature(value: string) {
  return TRIGRAMS.find((trigram) => trigram.lines.join("") === value);
}

function describeLines(lines: readonly (0 | 1)[]) {
  return `${lines.map((line) => (line === 1 ? "阳爻" : "阴爻")).join("、")}（从初爻到上爻）`;
}

/**
 * Render an internal three-bit signature as the actual yin/yang line glyph.
 * The bit string remains the persisted answer value, but never becomes the
 * learner-facing representation.
 */
export function TrigramSignatureVisual({
  value,
  className = "",
}: {
  value: string;
  className?: string;
}) {
  const trigram = findTrigramBySignature(value);
  if (!trigram) return <>{value}</>;

  const description = describeLines(trigram.lines);
  return (
    <span
      className={`trigram-signature-visual ${className}`.trim()}
      aria-label={`三爻结构：${description}`}
    >
      <TrigramGlyph lines={trigram.lines} label={`三爻结构：${description}`} />
    </span>
  );
}

export function isTrigramSignature(value: string) {
  return Boolean(findTrigramBySignature(value));
}
