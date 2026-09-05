export type LineValue = 0 | 1;
export type TrigramLines = readonly [LineValue, LineValue, LineValue];
export type HexagramLines = readonly [
  LineValue,
  LineValue,
  LineValue,
  LineValue,
  LineValue,
  LineValue,
];

export type TrigramId =
  | "qian"
  | "dui"
  | "li"
  | "zhen"
  | "xun"
  | "kan"
  | "gen"
  | "kun";

export type LinePosition = 1 | 2 | 3 | 4 | 5 | 6;

export interface TrigramIdentity {
  id: TrigramId;
  name: string;
  symbol: string;
  lines: TrigramLines;
  element: "木" | "火" | "土" | "金" | "水";
  direction: string;
  directions: readonly { system: "earlier_heaven" | "later_heaven"; value: string }[];
  nature: string;
  familyRole: string;
  bodyAssociations: readonly string[];
  keywords: readonly string[];
  sourceIds: readonly string[];
}

export interface HexagramIdentity {
  id: string;
  kingWenNumber: number;
  name: string;
  unicodeSymbol: string;
  lowerTrigramId: TrigramId;
  upperTrigramId: TrigramId;
  lines: HexagramLines;
  signature: string;
}
