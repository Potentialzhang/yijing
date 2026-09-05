import { describe, expect, it } from "vitest";
import { resolveTheme } from "@/components/settings/visualPreferences";

describe("视觉偏好", () => {
  it("浅色和深色选择不受系统主题影响", () => {
    expect(resolveTheme("light", true)).toBe("light");
    expect(resolveTheme("dark", false)).toBe("dark");
  });

  it("跟随系统主题解析为当前系统颜色", () => {
    expect(resolveTheme("system", true)).toBe("dark");
    expect(resolveTheme("system", false)).toBe("light");
    expect(resolveTheme("unknown", true)).toBe("light");
  });
});
