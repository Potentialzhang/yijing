import { Solar } from "lunar-typescript";
import { interpretCalendarTime, normalizeCalendarInput } from "./input";
import type { CalendarInput, CalendarReading, CalendarRuleSet, SexagenaryValue, SolarTermEvent } from "./types";

export const CALENDAR_RULES: readonly CalendarRuleSet[] = ["midnight", "zi"].map((boundary) => ({
  id: `calendar-lichun-jie-${boundary}-v1`,
  yearBoundary: "lichun",
  monthBoundary: "solar-term-month",
  dayBoundary: boundary === "zi" ? "zi-hour" : "civil-midnight",
  timeZoneBasis: "standard-time",
  sourceIds: ["source-lunar-typescript", "source-hko-calendar"],
  authoritativeSampleIds: ["hko-2026-new-year", "hko-2026-lichun"],
  status: "accepted",
}));

const STEM_NAMES = "甲乙丙丁戊己庚辛壬癸";
const BRANCH_NAMES = "子丑寅卯辰巳午未申酉戌亥";
const STEM_IDS = ["jia", "yi", "bing", "ding", "wu", "ji", "geng", "xin", "ren", "gui"];
const BRANCH_IDS = ["zi", "chou", "yin", "mao", "chen", "si", "wu", "wei", "shen", "you", "xu", "hai"];
const TERM_ALIAS: Record<string, string> = { DA_XUE: "大雪", DONG_ZHI: "冬至", XIAO_HAN: "小寒", DA_HAN: "大寒", LI_CHUN: "立春", YU_SHUI: "雨水", JING_ZHE: "惊蛰" };

export interface CalculatedCalendarReading extends CalendarReading {
  solarTerms: SolarTermEvent[];
  previousSolarTerm: SolarTermEvent | null;
  nextSolarTerm: SolarTermEvent | null;
  lunarLabel: string;
  lunarTimeZone: "Asia/Shanghai";
  engine: "lunar-typescript@1.8.6";
}

/** The engine's astronomical term timestamps use UTC+08:00, not host time. */
export function solarTermsForYear(year: number, timeZone: string): SolarTermEvent[] {
  if (!Number.isInteger(year) || year < 1900 || year > 2100) throw new RangeError("节气年份支持 1900～2100");
  const table = Solar.fromYmd(year, 7, 1).getLunar().getJieQiTable();
  return Object.entries(table).filter(([, solar]) => solar.getYear() === year).map(([name, solar]) => ({
    name: TERM_ALIAS[name] ?? name,
    occurredAt: new Date(solar.toYmdHms().replace(" ", "T") + "+08:00").toISOString(),
    timeZone,
    precision: "minute" as const,
    sourceIds: ["source-lunar-typescript"],
  })).sort((a, b) => a.occurredAt.localeCompare(b.occurredAt));
}

export function calculateCalendar(input: CalendarInput): CalculatedCalendarReading {
  const normalized = normalizeCalendarInput(input);
  const ruleSet = CALENDAR_RULES.find(rule => rule.id === normalized.ruleVersion);
  if (!ruleSet) throw new Error("不支持的计算规则版本");
  const { gregorian, interpretation } = interpretCalendarTime(normalized);
  if (!interpretation.utcInstant) throw new Error(interpretation.status === "ambiguous"
    ? "本地时间重复，请使用含偏移的 ISO 时间明确选择。" : "这个本地时间不存在，请调整输入。");
  if (gregorian.year < 1901 || gregorian.year > 2099) throw new RangeError("当前计算范围为 1901～2099 年");
  const china = interpretCalendarTime({ ...normalized, instant: interpretation.utcInstant, timeZone: "Asia/Shanghai" }).gregorian;
  const solar = Solar.fromYmdHms(china.year, china.month, china.day, china.hour, china.minute, Math.floor(china.second));
  const lunar = solar.getLunar();
  const localSolar = Solar.fromYmdHms(gregorian.year, gregorian.month, gregorian.day, gregorian.hour, gregorian.minute, Math.floor(gregorian.second));
  const dayLunar = localSolar.getLunar();
  const day = ruleSet.dayBoundary === "zi-hour" ? dayLunar.getDayInGanZhiExact() : dayLunar.getDayInGanZhiExact2();
  const hourBranch = Math.floor((gregorian.hour + 1) / 2) % 12;
  // Explicitly derive the hour stem from the selected day convention. The
  // library's getTimeInGanZhi always uses the 23:00 day, even in sect 2.
  const hourStem = (STEM_NAMES.indexOf(day[0]) % 5 * 2 + hourBranch) % 10;
  const labels = { year: lunar.getYearInGanZhiExact(), month: lunar.getMonthInGanZhiExact(), day, hour: STEM_NAMES[hourStem] + BRANCH_NAMES[hourBranch] };
  const sexagenary = Object.fromEntries(Object.entries(labels).map(([basis, label]) => [basis, {
    label, stemId: STEM_IDS[STEM_NAMES.indexOf(label[0])], branchId: BRANCH_IDS[BRANCH_NAMES.indexOf(label[1])],
    basis, boundary: basis === "year" ? ruleSet.yearBoundary : basis === "month" ? ruleSet.monthBoundary : ruleSet.dayBoundary,
    ruleVersion: ruleSet.id,
  }])) as Record<"year" | "month" | "day" | "hour", SexagenaryValue>;
  const terms = [gregorian.year - 1, gregorian.year, gregorian.year + 1].flatMap(year => solarTermsForYear(year, normalized.timeZone));
  const instantMs = Date.parse(interpretation.utcInstant);
  const previousSolarTerm = terms.filter(term => Date.parse(term.occurredAt) <= instantMs).at(-1) ?? null;
  const nextSolarTerm = terms.find(term => Date.parse(term.occurredAt) > instantMs) ?? null;
  const solarTerms = terms.filter(term => Number(new Intl.DateTimeFormat("en", { year: "numeric", timeZone: normalized.timeZone }).format(new Date(term.occurredAt))) === gregorian.year);
  return {
    input: normalized, ruleSet, gregorian, timeInterpretation: interpretation,
    lunar: { year: lunar.getYear(), month: Math.abs(lunar.getMonth()), day: lunar.getDay(), isLeapMonth: lunar.getMonth() < 0 },
    lunarLabel: `${lunar.getYearInChinese()}年${lunar.getMonthInChinese()}月${lunar.getDayInChinese()}`,
    lunarTimeZone: "Asia/Shanghai", engine: "lunar-typescript@1.8.6",
    solarTerm: previousSolarTerm, solarTerms, previousSolarTerm, nextSolarTerm, sexagenary,
    explanation: [
      `输入已解析为 ${interpretation.utcInstant}；日柱、时柱按 ${normalized.timeZone} 的当地钟表时间计算。`,
      "年柱在立春时刻切换；月柱以立春、惊蛰等十二个‘节’切换，中气不换月。节气按同一实际瞬间判断。",
      ruleSet.dayBoundary === "zi-hour" ? "日柱在当地 23:00 换日；时干按换日后的日干推算。" : "日柱在当地 00:00 换日；23:00～23:59 的时干仍由当日日干推算。",
      "农历日期按中国标准时间（UTC+08:00）编算；海外当地日柱日期可能与农历对应的中国日期不同。",
      "采用标准钟表时间，不作真太阳时修正。节气展示到分钟；秒级交界附近可能因算法精度存在差异。",
    ], sourceIds: ruleSet.sourceIds, status: "calculated",
  };
}
