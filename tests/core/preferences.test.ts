import { describe, expect, it } from "vitest";
import { createSelfTestResult } from "@/core/onboarding/self-test";
import { isValidPreferenceValue } from "@/db/preferences";

describe("偏好值运行时契约", () => {
  it("只接受已知键和可解释的值", () => {
    const selfTest = JSON.stringify(createSelfTestResult([true, false, true, true, false], "2026-08-26T00:00:00.000Z"));
    expect(isValidPreferenceValue("theme", "dark")).toBe(true);
    expect(isValidPreferenceValue("dailyNewCardLimit", 30)).toBe(true);
    expect(isValidPreferenceValue("dailyNewCardLimit", 999)).toBe(false);
    expect(isValidPreferenceValue("futurePreference", "anything")).toBe(false);
    expect(isValidPreferenceValue("toString", "anything")).toBe(false);
    expect(isValidPreferenceValue("__proto__", "anything")).toBe(false);
    expect(isValidPreferenceValue("lastExportAt", "0")).toBe(false);
    expect(isValidPreferenceValue("lastExportAt", "2026-08-26T00:00:00.000Z")).toBe(true);
    expect(isValidPreferenceValue("selfTestResult", selfTest)).toBe(true);
    expect(isValidPreferenceValue("selfTestResult", JSON.stringify({ score: 5 }))).toBe(false);
    expect(isValidPreferenceValue("aiAllowedScopes", '["selected-notes"]')).toBe(true);
    expect(isValidPreferenceValue("aiAllowedScopes", '["selected-notes","selected-notes"]')).toBe(false);
  });
});
