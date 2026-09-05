import { describe, expect, it } from "vitest";
import { HEXAGRAMS, getHexagramByLines, getHexagramByPair, getHexagramByNumber } from "@/core/iching/hexagrams";
import { TRIGRAMS, trigramFromLines } from "@/core/iching/trigrams";
import { nuclearLines, oppositeLines, relationHexagrams, reversedLines, toggleLines } from "@/core/iching/transforms";
import { normalizeLabSnapshotForWrite } from "@/core/iching/snapshots";
import type { HexagramLines } from "@/core/iching/types";
import type { LabSnapshotRecord } from "@/db/schema";

describe("八卦基础映射", () => {
  it("覆盖 8 个唯一三爻签名，并从下往上保持约定", () => {
    expect(TRIGRAMS).toHaveLength(8);
    expect(new Set(TRIGRAMS.map((trigram) => trigram.lines.join(""))).size).toBe(8);
    expect(trigramFromLines([1, 0, 1]).id).toBe("li");
    expect(trigramFromLines([0, 1, 0]).id).toBe("kan");
    expect(TRIGRAMS.every((trigram) => trigram.directions.length === 2 && trigram.bodyAssociations.length > 0)).toBe(true);
  });
});

describe("六十四卦身份", () => {
  it("拥有完整且唯一的文王卦序和六爻签名", () => {
    expect(HEXAGRAMS).toHaveLength(64);
    expect(HEXAGRAMS.map((hexagram) => hexagram.kingWenNumber)).toEqual(Array.from({ length: 64 }, (_, index) => index + 1));
    expect(new Set(HEXAGRAMS.map((hexagram) => hexagram.signature)).size).toBe(64);
  });

  it("乾坤、既济、未济的上下卦组合正确", () => {
    expect(getHexagramByPair("qian", "qian").kingWenNumber).toBe(1);
    expect(getHexagramByPair("li", "kan").kingWenNumber).toBe(63);
    expect(getHexagramByPair("kan", "li").kingWenNumber).toBe(64);
    expect(getHexagramByNumber(29).name).toBe("坎为水");
  });
});

describe("关系卦和爻变", () => {
  const sample: HexagramLines = [1, 1, 1, 1, 1, 1];

  it("准确反转、倒置和取互卦", () => {
    expect(oppositeLines(sample)).toEqual([0, 0, 0, 0, 0, 0]);
    expect(reversedLines([1, 0, 1, 0, 0, 1])).toEqual([1, 0, 0, 1, 0, 1]);
    expect(nuclearLines([1, 0, 0, 1, 1, 0])).toEqual([0, 0, 1, 0, 1, 1]);
  });

  it("动爻不受点击顺序影响，并能回到已知卦", () => {
    const changed = toggleLines(sample, new Set([1, 6]));
    expect(changed).toEqual([0, 1, 1, 1, 1, 0]);
    expect(getHexagramByLines(changed).kingWenNumber).toBe(28);
    expect(relationHexagrams(sample).opposite.kingWenNumber).toBe(2);
  });

  it("推演快照写入时重算派生卦并稳定动爻顺序", () => {
    const snapshot: LabSnapshotRecord = {
      id: "snapshot-write",
      lowerTrigramId: "qian",
      upperTrigramId: "kun",
      movingPositions: [6, 1],
      baseHexagramId: "hexagram-64",
      changedHexagramId: "hexagram-01",
      title: "测试快照",
      note: "",
      createdAt: "2026-08-30T00:00:00.000Z",
      updatedAt: "2026-08-30T00:00:00.000Z",
    };
    expect(normalizeLabSnapshotForWrite(snapshot)).toMatchObject({
      movingPositions: [1, 6],
      baseHexagramId: "hexagram-11",
      changedHexagramId: "hexagram-18",
    });
    expect(() => normalizeLabSnapshotForWrite({ ...snapshot, movingPositions: [1, 6, 1] })).toThrow(/不能重复/);
    expect(() => normalizeLabSnapshotForWrite({ ...snapshot, lowerTrigramId: "unknown" as never })).toThrow(/上下卦无效/);
    expect(() => normalizeLabSnapshotForWrite({ ...snapshot, movingPositions: [1, 7] as never })).toThrow(/动爻位置无效/);
  });

  it("六十四卦都能计算错卦、综卦和互卦", () => {
    for (const hexagram of HEXAGRAMS) {
      const relations = relationHexagrams(hexagram.lines);
      expect(relations.opposite.signature).toHaveLength(6);
      expect(relations.reversed.signature).toHaveLength(6);
      expect(relations.nuclear.signature).toHaveLength(6);
      expect(HEXAGRAMS).toContainEqual(relations.opposite);
      expect(HEXAGRAMS).toContainEqual(relations.reversed);
      expect(HEXAGRAMS).toContainEqual(relations.nuclear);
    }
  });
});
