import { describe, expect, it } from "vitest";
import {
  assertCalendarInput,
  interpretCalendarTime,
  normalizeCalendarInput,
} from "@/core/calendar/input";
import {
  assertCalendarRuleSet,
  describeCalendarBoundaries,
  DRAFT_CALENDAR_RULE_SET,
} from "@/core/calendar/rules";
import { buildPendingCalendarReading } from "@/core/calendar/reading";

describe("M2-B 历法输入契约", () => {
  it("接受带偏移和显式规则版本的输入，并保留时区", () => {
    const input = normalizeCalendarInput({
      instant: "2026-08-26T12:34:56+08:00",
      timeZone: "Asia/Shanghai",
      ruleVersion: " calendar-draft-1 ",
    });
    expect(input).toEqual({
      instant: "2026-08-26T12:34:56+08:00",
      timeZone: "Asia/Shanghai",
      ruleVersion: "calendar-draft-1",
    });
  });

  it("允许按 IANA 时区解释的本地 ISO 时间", () => {
    expect(() =>
      assertCalendarInput({
        instant: "2026-08-26T12:34",
        timeZone: "America/Los_Angeles",
        ruleVersion: "calendar-draft-1",
      }),
    ).not.toThrow();
    expect(() =>
      assertCalendarInput({
        instant: "2026-08-26T12:00",
        timeZone: "Pacific/Honolulu",
        ruleVersion: "calendar-draft-1",
      }),
    ).not.toThrow();
  });

  it("拒绝无效时间、时区和隐式规则版本", () => {
    expect(() =>
      assertCalendarInput({
        instant: "2026-02-30T12:00",
        timeZone: "Asia/Shanghai",
        ruleVersion: "v1",
      }),
    ).toThrow();
    expect(() =>
      assertCalendarInput({
        instant: "2026-08-26T12:00",
        timeZone: "Mars/Base",
        ruleVersion: "v1",
      }),
    ).toThrow(/IANA/);
    expect(() =>
      assertCalendarInput({
        instant: "2026-08-26T12:00",
        timeZone: "Asia/Shanghai",
        ruleVersion: "",
      }),
    ).toThrow(/规则版本/);
    expect(() =>
      assertCalendarInput({
        instant: "2026-08-26T12:00",
        timeZone: "Asia/Shanghai",
        ruleVersion: "v1",
        unexpected: true,
      }),
    ).toThrow(/未声明字段/);
    expect(() =>
      assertCalendarInput({
        instant: "2026-08-26T12:00+24:00",
        timeZone: "Asia/Shanghai",
        ruleVersion: "v1",
      }),
    ).toThrow(/有效 ISO/);
    expect(() =>
      assertCalendarInput({
        instant: "2026-08-26T12:00+12:60",
        timeZone: "Asia/Shanghai",
        ruleVersion: "v1",
      }),
    ).toThrow(/有效 ISO/);
  });

  it("保留一个明确的 draft 规则集，并拒绝未完成规则冒充 accepted", () => {
    expect(() => assertCalendarRuleSet(DRAFT_CALENDAR_RULE_SET)).not.toThrow();
    expect(DRAFT_CALENDAR_RULE_SET.status).toBe("draft");
    expect(() =>
      assertCalendarRuleSet({ ...DRAFT_CALENDAR_RULE_SET, status: "accepted" }),
    ).toThrow(/accepted/);
    expect(() =>
      assertCalendarRuleSet({
        ...DRAFT_CALENDAR_RULE_SET,
        yearBoundary: "unknown",
      }),
    ).toThrow(/换年边界/);
    expect(() =>
      assertCalendarRuleSet({ ...DRAFT_CALENDAR_RULE_SET, unexpected: true }),
    ).toThrow(/未声明字段/);
    expect(() =>
      assertCalendarRuleSet({ ...DRAFT_CALENDAR_RULE_SET, id: " calendar-draft-1" }),
    ).toThrow(/已修剪/);
    expect(() =>
      assertCalendarRuleSet({
        ...DRAFT_CALENDAR_RULE_SET,
        yearBoundary: "lunar-new-year",
        monthBoundary: "solar-term-month",
        dayBoundary: "civil-midnight",
        timeZoneBasis: "standard-time",
        sourceIds: ["source-calendar-authority"],
        authoritativeSampleIds: ["calendar-sample-1"],
        status: "accepted",
      }),
    ).not.toThrow();
    expect(() =>
      assertCalendarRuleSet({
        ...DRAFT_CALENDAR_RULE_SET,
        yearBoundary: "lunar-new-year",
        monthBoundary: "solar-term-month",
        dayBoundary: "civil-midnight",
        timeZoneBasis: "standard-time",
        status: "accepted",
      }),
    ).toThrow(/来源和权威样例/);
    expect(() =>
      assertCalendarRuleSet({
        ...DRAFT_CALENDAR_RULE_SET,
        sourceIds: ["source-calendar-authority", "source-calendar-authority"],
      }),
    ).toThrow(/不能重复/);
    expect(() =>
      assertCalendarRuleSet({
        ...DRAFT_CALENDAR_RULE_SET,
        authoritativeSampleIds: [" calendar-sample-1"],
      }),
    ).toThrow(/已修剪/);
  });

  it("在规则未确认时只生成带条件说明的 pending reading", () => {
    const reading = buildPendingCalendarReading(
      {
        instant: "2026-08-26T12:34",
        timeZone: "Asia/Shanghai",
        ruleVersion: "calendar-draft-1",
      },
      DRAFT_CALENDAR_RULE_SET,
    );
    expect(reading.status).toBe("pending-rules");
    expect(reading.gregorian).toMatchObject({
      year: 2026,
      month: 8,
      day: 26,
      hour: 12,
      minute: 34,
      second: 0,
    });
    expect(reading.lunar).toBeNull();
    expect(reading.sexagenary).toEqual({});
    expect(reading.explanation.join(" ")).toMatch(/二十四节气边界尚未确认/);
    expect(reading.explanation.join(" ")).toMatch(/不生成农历或干支结果/);
  });

  it("拒绝输入版本与实际规则集不一致的 reading", () => {
    expect(() =>
      buildPendingCalendarReading(
        {
          instant: "2026-08-26T12:34",
          timeZone: "Asia/Shanghai",
          ruleVersion: "calendar-other-1",
        },
        DRAFT_CALENDAR_RULE_SET,
      ),
    ).toThrow(/规则版本与实际规则集不一致/);
  });

  it("不允许已接受规则集伪装成待确认阅读", () => {
    expect(() =>
      buildPendingCalendarReading(
        {
          instant: "2026-08-26T12:34",
          timeZone: "Asia/Shanghai",
          ruleVersion: "calendar-accepted-1",
        },
        {
          ...DRAFT_CALENDAR_RULE_SET,
          id: "calendar-accepted-1",
          yearBoundary: "lunar-new-year",
          monthBoundary: "solar-term-month",
          dayBoundary: "civil-midnight",
          timeZoneBasis: "standard-time",
          sourceIds: ["source-calendar-authority"],
          authoritativeSampleIds: ["calendar-sample-1"],
          status: "accepted",
        },
      ),
    ).toThrow(/只有草案规则集/);
  });

  it("逐项列出换年、换月、换日、子时、节气和真太阳时边界状态", () => {
    const pending = describeCalendarBoundaries(DRAFT_CALENDAR_RULE_SET);
    expect(pending).toHaveLength(6);
    expect(pending.map((item) => item.label)).toEqual([
      "换年边界",
      "换月边界",
      "换日边界",
      "子时边界",
      "二十四节气边界",
      "真太阳时边界",
    ]);
    expect(pending.every((item) => item.status === "pending")).toBe(true);

    const accepted = describeCalendarBoundaries({
      ...DRAFT_CALENDAR_RULE_SET,
      yearBoundary: "lichun",
      monthBoundary: "solar-term-month",
      dayBoundary: "zi-hour",
      timeZoneBasis: "standard-time",
      sourceIds: ["source-calendar-authority"],
      authoritativeSampleIds: ["calendar-sample-1"],
      status: "accepted",
    });
    expect(accepted.map((item) => item.status)).toEqual([
      "configured",
      "configured",
      "configured",
      "configured",
      "configured",
      "configured",
    ]);
    expect(accepted[0].detail).toBe("立春");
    expect(accepted[2].detail).toBe("子时");
    expect(accepted[3].detail).toBe("采用子时换日");
    expect(accepted[4].detail).toBe("采用节气月界");
    expect(accepted[5].detail).toBe("标准时区（不采用真太阳时）");
  });

  it("把带偏移的瞬间转换为目标 IANA 时区后再展示公历字段", () => {
    const result = interpretCalendarTime({
      instant: "2026-08-26T12:34:56+08:00",
      timeZone: "America/Los_Angeles",
      ruleVersion: "calendar-draft-1",
    });
    expect(result.interpretation).toMatchObject({
      basis: "explicit-offset",
      status: "resolved",
      utcInstant: "2026-08-26T04:34:56.000Z",
      offsetMinutes: -420,
    });
    expect(result.gregorian).toMatchObject({
      year: 2026,
      month: 8,
      day: 25,
      hour: 21,
      minute: 34,
      second: 56,
    });
    const reading = buildPendingCalendarReading(
      {
        instant: "2026-08-26T12:34:56+08:00",
        timeZone: "America/Los_Angeles",
        ruleVersion: "calendar-draft-1",
      },
      DRAFT_CALENDAR_RULE_SET,
    );
    expect(reading.explanation.join(" ")).toMatch(/按输入的显式偏移换算到 America\/Los_Angeles 展示/);
  });

  it("保留 ISO 小数秒到毫秒，并在本地时区解析时使用同一精度", () => {
    const explicit = interpretCalendarTime({
      instant: "2026-08-26T12:34:56.789123+08:00",
      timeZone: "Asia/Shanghai",
      ruleVersion: "calendar-draft-1",
    });
    expect(explicit.interpretation).toMatchObject({
      status: "resolved",
      localDateTime: "2026-08-26T12:34:56.789",
      utcInstant: "2026-08-26T04:34:56.789Z",
    });

    const local = interpretCalendarTime({
      instant: "2026-08-26T12:34:56.789123",
      timeZone: "Asia/Shanghai",
      ruleVersion: "calendar-draft-1",
    });
    expect(local.interpretation).toMatchObject({
      status: "resolved",
      localDateTime: "2026-08-26T12:34:56.789",
      utcInstant: "2026-08-26T04:34:56.789Z",
    });
  });

  it("识别夏令时回拨造成的重复本地时间", () => {
    const result = interpretCalendarTime({
      instant: "2026-11-01T01:30",
      timeZone: "America/Los_Angeles",
      ruleVersion: "calendar-draft-1",
    });
    expect(result.interpretation.status).toBe("ambiguous");
    expect(result.interpretation.utcInstant).toBeNull();
  });

  it("识别夏令时前跳造成的不存在本地时间", () => {
    const result = interpretCalendarTime({
      instant: "2026-03-08T02:30",
      timeZone: "America/Los_Angeles",
      ruleVersion: "calendar-draft-1",
    });
    expect(result.interpretation.status).toBe("nonexistent");
    expect(result.interpretation.utcInstant).toBeNull();
  });

  it("处理显式偏移跨年和跨月后的目标时区日期", () => {
    const result = interpretCalendarTime({
      instant: "2025-12-31T23:30:00-05:00",
      timeZone: "Asia/Tokyo",
      ruleVersion: "calendar-draft-1",
    });
    expect(result.gregorian).toMatchObject({
      year: 2026,
      month: 1,
      day: 1,
      hour: 13,
      minute: 30,
      second: 0,
    });
    expect(result.interpretation).toMatchObject({
      status: "resolved",
      utcInstant: "2026-01-01T04:30:00.000Z",
      offsetMinutes: 540,
    });
  });

  it("在 UTC+14 本地时间跨年时保留正确的 UTC 瞬间", () => {
    const result = interpretCalendarTime({
      instant: "2026-01-01T00:30",
      timeZone: "Pacific/Kiritimati",
      ruleVersion: "calendar-draft-1",
    });
    expect(result.gregorian).toMatchObject({
      year: 2026,
      month: 1,
      day: 1,
      hour: 0,
      minute: 30,
      second: 0,
    });
    expect(result.interpretation).toMatchObject({
      basis: "time-zone",
      status: "resolved",
      utcInstant: "2025-12-31T10:30:00.000Z",
      offsetMinutes: 840,
    });
  });

  it("处理 UTC-12 与 UTC+14 的日期边界转换", () => {
    const result = interpretCalendarTime({
      instant: "2026-01-01T00:15:00+14:00",
      timeZone: "Etc/GMT+12",
      ruleVersion: "calendar-draft-1",
    });
    expect(result.gregorian).toMatchObject({
      year: 2025,
      month: 12,
      day: 30,
      hour: 22,
      minute: 15,
      second: 0,
    });
    expect(result.interpretation.utcInstant).toBe("2025-12-31T10:15:00.000Z");
  });
});
