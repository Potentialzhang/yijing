import { describe, expect, it } from "vitest";
import { HEXAGRAMS } from "@/core/iching";
import { HEXAGRAM_JUDGMENTS, HEXAGRAM_LINE_TEXTS, getCanonicalEntry } from "@/content/hexagrams";
import { ZHOUYI_EDITORIAL } from "@/content/zhouyi-editorial";
import { MOUNTAINS, mountainAt, mountainBearing } from "@/content/mountains";
import { calculateCalendar, CALENDAR_RULES, solarTermsForYear } from "@/core/calendar/calculate";
import { CALCULATION_DATE_EVIDENCE } from "@/content/calendar-calculation-evidence";

const calculate = (instant: string, rule = 0, timeZone = "Asia/Shanghai") => calculateCalendar({ instant, timeZone, ruleVersion: CALENDAR_RULES[rule].id });
describe("周易正文与逐爻释义", () => {
  it("64 卦和 384 爻有实际正文与独立释义，爻名匹配阴阳及位置", () => {
    expect(ZHOUYI_EDITORIAL).toHaveLength(64);
    expect(HEXAGRAM_JUDGMENTS.every(row => !!row.canonicalText && row.blocks[0].markdown.length > 15)).toBe(true);
    expect(new Set(HEXAGRAM_LINE_TEXTS.map(row => row.blocks[0].markdown)).size).toBe(384);
    for (const hexagram of HEXAGRAMS) {
      const row = getCanonicalEntry(hexagram.id);
      expect(row.number).toBe(hexagram.kingWenNumber);
      expect(row.lines).toHaveLength(6);
      expect(row.sourceSha256).toMatch(/^[0-9a-f]{64}$/);
      row.lines.forEach((line, i) => {
        const yinYang = hexagram.lines[i] ? "九" : "六";
        const prefix = i === 0 ? "初" + yinYang : i === 5 ? "上" + yinYang : yinYang + "二三四五"[i - 1];
        expect(line.startsWith(prefix)).toBe(true);
        expect(line).not.toMatch(/<pb:|¶|《象》|《彖》/);
      });
    }
  });
  it("用九、用六另存，末卦末爻没有被遗漏", () => {
    expect(getCanonicalEntry("hexagram-01").extras[0]).toContain("用九");
    expect(getCanonicalEntry("hexagram-02").extras[0]).toContain("用六");
    expect(getCanonicalEntry("hexagram-64").lines[5]).toContain("有孚失是");
  });
});

describe("可计算历法", () => {
  it("独立核对香港天文台日期级样例", () => {
    for (const sample of CALCULATION_DATE_EVIDENCE) expect(calculate(`${sample.date}T12:00:00`).lunar).toEqual(sample.lunar);
    const lichun = solarTermsForYear(2026, "Asia/Shanghai").find(term => term.name === "立春")!;
    expect(new Date(Date.parse(lichun.occurredAt) + 8 * 3600000).toISOString().slice(0, 10)).toBe("2026-02-04");
  });
  it("核对上游文档 1986-05-29 的干支样例", () => {
    const reading = calculate("1986-05-29T12:00:00");
    expect(Object.values(reading.sexagenary).map(value => value.label)).toEqual(["丙寅", "癸巳", "癸酉", "戊午"]);
  });
  it("立春瞬间同时切换年柱和月柱，雨水中气不换月", () => {
    const before = calculate("2026-02-04T04:01:00"), after = calculate("2026-02-04T04:03:00");
    expect(before.sexagenary.year?.label).toBe("乙巳");
    expect(after.sexagenary.year?.label).toBe("丙午");
    expect(before.sexagenary.month?.label).toBe("己丑");
    expect(after.sexagenary.month?.label).toBe("庚寅");
    expect(calculate("2026-02-19T00:00:00").sexagenary.month?.label).toBe("庚寅");
  });
  it("午夜与子初规则的日干和时干配套，午夜后一致", () => {
    const a = calculate("2026-02-04T23:30:00"), b = calculate("2026-02-04T23:30:00", 1);
    expect([a.sexagenary.day?.label, a.sexagenary.hour?.label]).toEqual(["己酉", "甲子"]);
    expect([b.sexagenary.day?.label, b.sexagenary.hour?.label]).toEqual(["庚戌", "丙子"]);
    expect(calculate("2026-02-05T00:00:00").sexagenary.hour?.label).toBe("丙子");
  });
  it("相同瞬间跨区保持节气年/月一致，日/时按当地钟表计算", () => {
    const a = calculate("2026-02-03T20:03:00Z"), b = calculate("2026-02-03T20:03:00Z", 0, "America/New_York");
    expect(a.sexagenary.year?.label).toBe(b.sexagenary.year?.label);
    expect(a.sexagenary.month?.label).toBe(b.sexagenary.month?.label);
    expect(a.sexagenary.day?.label).not.toBe(b.sexagenary.day?.label);
    expect(a.lunar).toEqual(b.lunar);
  });
  it("夏令时歧义、不存在时间、未知规则及范围外输入均被拒绝", () => {
    expect(() => calculate("2026-11-01T01:30:00", 0, "America/New_York")).toThrow(/重复/);
    expect(() => calculate("2026-03-08T02:30:00", 0, "America/New_York")).toThrow(/不存在/);
    expect(() => calculate("1800-01-01T00:00:00")).toThrow(/1901/);
    expect(() => calculateCalendar({ instant: "2026-01-01T00:00:00Z", timeZone: "UTC", ruleVersion: "unknown" })).toThrow(/规则/);
  });
  it("每年输出 24 个唯一节气，年首年末仍有前后节气", () => {
    for (const year of [1901, 2000, 2026, 2099]) {
      const terms = solarTermsForYear(year, "UTC");
      expect(terms).toHaveLength(24);
      expect(new Set(terms.map(term => term.name)).size).toBe(24);
      expect(terms[0].name).toBe("小寒"); expect(terms.at(-1)?.name).toBe("冬至");
    }
    expect(calculate("2026-01-01T00:00:00").previousSolarTerm?.name).toBe("冬至");
    expect(calculate("2026-12-31T23:59:00").nextSolarTerm?.name).toBe("小寒");
  });
});

describe("二十四山地盘正针", () => {
  it("24 个中心、48 个边界附近和 360° 环绕正确", () => {
    expect(MOUNTAINS).toHaveLength(24);
    expect(new Set(MOUNTAINS.map(mountain => mountain.name)).size).toBe(24);
    MOUNTAINS.forEach((mountain, i) => {
      expect(mountainAt(mountain.centerDegrees).id).toBe(mountain.id);
      expect(mountainAt(mountain.startDegrees).id).toBe(mountain.id);
      expect(mountainAt(mountain.endDegrees - 0.001).id).toBe(mountain.id);
      expect(mountainAt(mountain.endDegrees).id).toBe(MOUNTAINS[(i + 1) % 24].id);
      expect(mountainBearing(mountain.centerDegrees).sitting.id).toBe(MOUNTAINS[(i + 12) % 24].id);
    });
    expect(mountainAt(360).name).toBe("子"); expect(mountainAt(-15).name).toBe("壬");
    expect(mountainAt(90).name).toBe("卯"); expect(mountainAt(315).name).toBe("乾");
    expect(() => mountainAt(NaN)).toThrow();
  });
});
