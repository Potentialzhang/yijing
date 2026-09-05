import { getHexagramByLines } from "./hexagrams";
import { toggleLine } from "./trigrams";
import type { HexagramLines, LinePosition } from "./types";

export function toggleLines(lines: HexagramLines, movingPositions: ReadonlySet<LinePosition>): HexagramLines {
  const changed = lines.map((line, index) => {
    const position = (index + 1) as LinePosition;
    return movingPositions.has(position) ? toggleLine(line) : line;
  });
  return [changed[0], changed[1], changed[2], changed[3], changed[4], changed[5]];
}

export function reversedLines(lines: HexagramLines): HexagramLines {
  return [lines[5], lines[4], lines[3], lines[2], lines[1], lines[0]];
}

export function oppositeLines(lines: HexagramLines): HexagramLines {
  return [toggleLine(lines[0]), toggleLine(lines[1]), toggleLine(lines[2]), toggleLine(lines[3]), toggleLine(lines[4]), toggleLine(lines[5])];
}

export function nuclearLines(lines: HexagramLines): HexagramLines {
  return [lines[1], lines[2], lines[3], lines[2], lines[3], lines[4]];
}

export function relationHexagrams(lines: HexagramLines) {
  return {
    changed: getHexagramByLines(lines),
    opposite: getHexagramByLines(oppositeLines(lines)),
    reversed: getHexagramByLines(reversedLines(lines)),
    nuclear: getHexagramByLines(nuclearLines(lines)),
  };
}
