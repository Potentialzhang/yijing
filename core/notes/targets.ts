/**
 * Stable target helpers for notes and content feedback.
 *
 * A single-line note is addressed by the immutable hexagram ID and a
 * one-based line position. Keep parsing in the domain layer so every UI
 * surface agrees on the same six-position boundary.
 */
export interface HexagramLineTarget {
  hexagramId: string;
  position: 1 | 2 | 3 | 4 | 5 | 6;
}

const HEXAGRAM_LINE_TARGET = /^(hexagram-\d{2})-([1-6])$/;

function isLinePosition(value: number): value is HexagramLineTarget["position"] {
  return Number.isInteger(value) && value >= 1 && value <= 6;
}

/** Parse an immutable single-line target; malformed targets return null. */
export function parseHexagramLineTarget(targetId: string): HexagramLineTarget | null {
  if (typeof targetId !== "string") return null;
  const match = HEXAGRAM_LINE_TARGET.exec(targetId.trim());
  if (!match) return null;
  const position = Number(match[2]);
  return isLinePosition(position) ? { hexagramId: match[1], position } : null;
}

/** Format a validated one-based single-line target for persistence or links. */
export function formatHexagramLineTarget(
  hexagramId: string,
  position: HexagramLineTarget["position"],
): string {
  if (!/^hexagram-\d{2}$/.test(hexagramId) || !isLinePosition(position)) {
    throw new TypeError("单爻笔记目标无效");
  }
  return `${hexagramId}-${position}`;
}
