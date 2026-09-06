import { describe, expect, it } from "vitest";
import { isNavigationItemCurrent } from "@/core/navigation/navigation";

describe("共享导航路由匹配", () => {
  it("将所有设置子路由归到设置入口", () => {
    expect(isNavigationItemCurrent("/settings", "/settings/data")).toBe(true);
    expect(isNavigationItemCurrent("/settings/content", "/settings/data")).toBe(true);
    expect(isNavigationItemCurrent("/settings/preferences/", "/settings/data")).toBe(true);
    expect(isNavigationItemCurrent("/settings/ai?from=notes", "/settings/data")).toBe(true);
  });

  it("不会把相邻路由误判为当前项", () => {
    expect(isNavigationItemCurrent("/settings-other", "/settings/data")).toBe(false);
    expect(isNavigationItemCurrent("/tools/compass", "/tools")).toBe(true);
    expect(isNavigationItemCurrent("/hexagrams/1", "/hexagrams")).toBe(true);
    expect(isNavigationItemCurrent("/library", "/library")).toBe(true);
    expect(isNavigationItemCurrent("/learn", "/")).toBe(false);
  });
});
