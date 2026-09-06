import type { LinePosition } from "@/core/iching";

const LINE_POSITION_DISPLAY = /^line-position:([1-6])$/;

/** Parse the persisted exercise token without ever exposing it as learner copy. */
export function parseLinePositionDisplay(value: string): LinePosition | null {
  const match = LINE_POSITION_DISPLAY.exec(value);
  return match ? (Number(match[1]) as LinePosition) : null;
}

