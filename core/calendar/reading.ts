import {
  interpretCalendarTime,
  normalizeCalendarInput,
} from "@/core/calendar/input";
import { assertCalendarRuleSet } from "@/core/calendar/rules";
import type {
  CalendarReading,
  CalendarRuleSet,
} from "@/core/calendar/types";

/**
 * Create an explainable, non-calculating reading while calendar rules are
 * still pending. The Gregorian fields mirror the user's entered local wall
 * time; no timezone conversion or sexagenary inference happens here.
 */
export function buildPendingCalendarReading(
  input: Parameters<typeof normalizeCalendarInput>[0],
  ruleSet: CalendarRuleSet,
): CalendarReading {
  const normalizedInput = normalizeCalendarInput(input);
  assertCalendarRuleSet(ruleSet);
  if (ruleSet.status !== "draft") {
    throw new Error("只有草案规则集可以生成待确认历法阅读");
  }
  if (normalizedInput.ruleVersion !== ruleSet.id) {
    throw new Error("历法输入规则版本与实际规则集不一致");
  }
  const { gregorian, interpretation: timeInterpretation } = interpretCalendarTime(normalizedInput);
  const timeExplanation =
    timeInterpretation.status === "resolved"
      ? timeInterpretation.basis === "explicit-offset"
        ? `输入带显式偏移，已按 ${normalizedInput.timeZone} 展示公历字段。`
        : `本地时间已按 ${normalizedInput.timeZone} 解析为唯一实际瞬间。`
      : timeInterpretation.status === "ambiguous"
        ? `该本地时间在 ${normalizedInput.timeZone} 中对应多个实际瞬间，暂不选择其中之一。`
        : `该本地时间在 ${normalizedInput.timeZone} 中不存在，暂不构造实际瞬间。`;
  const displayExplanation =
    timeInterpretation.basis === "explicit-offset"
      ? `公历字段已按输入的显式偏移换算到 ${normalizedInput.timeZone} 展示。`
      : `公历字段按 ${normalizedInput.timeZone} 的本地墙上时间展示，未猜测服务器时区。`;
  return {
    input: normalizedInput,
    ruleSet,
    gregorian,
    timeInterpretation,
    lunar: null,
    solarTerm: null,
    sexagenary: {},
    explanation: [
      "当前只确认公历输入、IANA 时区和规则版本。",
      timeExplanation,
      "换年、换月、换日、子时和二十四节气边界尚未确认，因此不生成农历或干支结果。",
      displayExplanation,
    ],
    sourceIds: [...ruleSet.sourceIds],
    status: "pending-rules",
  };
}
