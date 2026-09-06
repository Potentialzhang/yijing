import { describe, expect, it } from "vitest";
import { parseLinePositionDisplay } from "@/core/exercises/display";
import { renderToStaticMarkup } from "react-dom/server";
import { ExerciseDisplayValue } from "@/components/learning/ExerciseDisplayValue";

describe("练习内部显示编码", () => {
  it("只接受一到六爻的严格爻位编码", () => {
    expect(parseLinePositionDisplay("line-position:1")).toBe(1);
    expect(parseLinePositionDisplay("line-position:6")).toBe(6);
    expect(parseLinePositionDisplay("line-position:0")).toBeNull();
    expect(parseLinePositionDisplay("line-position:7")).toBeNull();
    expect(parseLinePositionDisplay("line-position:1x")).toBeNull();
    expect(parseLinePositionDisplay(" line-position:1")).toBeNull();
  });

  it("将内部爻位编码渲染成高亮卦象而不是原始字符串", () => {
    const markup = renderToStaticMarkup(ExerciseDisplayValue({ value: "line-position:1" }));
    expect(markup).not.toContain("line-position:1");
    expect(markup).toContain("六爻卦象，高亮初爻");
    expect(markup.match(/<span/g)).toHaveLength(6);
    expect(markup.match(/is-active/g)).toHaveLength(1);
  });
});
