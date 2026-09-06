import { describe, expect, it } from "vitest";
import { shouldOpenNoteShortcut } from "@/core/notes/shortcut";

describe("笔记快捷键", () => {
  it("只在非编辑状态接受单独的 N 键", () => {
    expect(shouldOpenNoteShortcut({ key: "n" })).toBe(true);
    expect(shouldOpenNoteShortcut({ key: "N" })).toBe(true);
    expect(shouldOpenNoteShortcut({ key: "n", editableTarget: true })).toBe(false);
    expect(shouldOpenNoteShortcut({ key: "n", metaKey: true })).toBe(false);
    expect(shouldOpenNoteShortcut({ key: "Escape" })).toBe(false);
  });
});
