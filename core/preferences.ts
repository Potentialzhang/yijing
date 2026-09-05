import { parseAiScopes, normalizeAiScopes } from "@/core/ai/consent";
import { isValidIsoTimestamp } from "@/core/date/local";
import { parseSelfTestResult } from "@/core/onboarding/self-test";

/** The only user preference keys that may be persisted or imported. */
export const DEFAULT_PREFERENCES = {
  theme: "light",
  fontScale: "normal",
  dailyNewCardLimit: 10,
  sessionBatchSize: 20,
  lastExportAt: "",
  selfTestResult: "",
  aiAssistEnabled: false,
  aiAllowedScopes: "",
  aiPreviewPurpose: "study-draft",
} as const;

export type PreferenceKey = keyof typeof DEFAULT_PREFERENCES;

export function isKnownPreferenceKey(key: string): key is PreferenceKey {
  return Object.prototype.hasOwnProperty.call(DEFAULT_PREFERENCES, key);
}

/** Validate a preference at every runtime boundary, not only in form code. */
export function isValidPreferenceValue(key: string, value: unknown): boolean {
  if (!isKnownPreferenceKey(key)) return false;
  if (key === "theme") return value === "light" || value === "dark" || value === "system";
  if (key === "fontScale") return value === "normal" || value === "large";
  if (key === "dailyNewCardLimit") return typeof value === "number" && [5, 10, 15, 20, 30].includes(value);
  if (key === "sessionBatchSize") return typeof value === "number" && [10, 20, 30, 40].includes(value);
  if (key === "lastExportAt") return value === "" || (typeof value === "string" && isValidIsoTimestamp(value));
  if (key === "selfTestResult") return value === "" || (typeof value === "string" && parseSelfTestResult(value) !== null);
  if (key === "aiAssistEnabled") return typeof value === "boolean";
  if (key === "aiAllowedScopes") {
    if (typeof value !== "string" || !value.trim()) return value === "";
    try {
      const decoded: unknown = JSON.parse(value);
      return Array.isArray(decoded) && normalizeAiScopes(decoded).length === decoded.length && parseAiScopes(value).length === decoded.length;
    } catch {
      return false;
    }
  }
  if (key === "aiPreviewPurpose") return value === "study-draft" || value === "confusion-analysis" || value === "note-organization";
  return false;
}
