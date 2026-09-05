import { describe, expect, it } from "vitest";
import {
  areSourceRefsEqual,
  normalizeNoteForWrite,
  normalizeSourceRefForWrite,
  replaceFirstSourceRefPreservingRest,
  replaceSourceRefAtPreservingRest,
} from "@/core/notes/records";
import {
  formatHexagramLineTarget,
  parseHexagramLineTarget,
} from "@/core/notes/targets";
import { shouldApplySourceRefresh } from "@/core/notes/source-sync";

const baseNote = {
  id: "concept:yin-yang-lines",
  targetType: "concept" as const,
  targetId: "yin-yang-lines",
  markdown: "我的复述",
  tags: ["  结构  ", "结构", "待复习"],
  sourceRefs: [{
    label: "学习笔记",
    kind: "personal" as const,
    author: "我",
    accessedAt: "2026-08-30",
  }],
  createdAt: "2026-08-30T08:00:00.000Z",
  updatedAt: "2026-08-30T08:01:00.000Z",
};

describe("笔记写入领域契约", () => {
  it("只接受一到六爻的稳定目标并可往返格式化", () => {
    expect(parseHexagramLineTarget("hexagram-01-6")).toEqual({ hexagramId: "hexagram-01", position: 6 });
    expect(parseHexagramLineTarget(" hexagram-01-2 ")).toEqual({ hexagramId: "hexagram-01", position: 2 });
    expect(parseHexagramLineTarget("hexagram-01-0")).toBeNull();
    expect(parseHexagramLineTarget("hexagram-01-7")).toBeNull();
    expect(parseHexagramLineTarget("hexagram-1-2")).toBeNull();
    expect(formatHexagramLineTarget("hexagram-01", 3)).toBe("hexagram-01-3");
    expect(() => formatHexagramLineTarget("hexagram-01", 7 as never)).toThrow(/单爻笔记目标无效/);
  });

  it("归一化标签、可选来源字段并保留上下文目标", () => {
    expect(normalizeNoteForWrite(baseNote)).toMatchObject({
      id: baseNote.id,
      targetType: "concept",
      targetId: "yin-yang-lines",
      tags: ["结构", "待复习"],
      sourceRefs: [{ label: "学习笔记", kind: "personal", author: "我", accessedAt: "2026-08-30" }],
    });
  });

  it("允许复习会话使用不属于静态内容目录的上下文 ID", () => {
    expect(normalizeNoteForWrite({
      ...baseNote,
      id: "session:session-1",
      targetType: "session",
      targetId: "session-1",
      sourceRefs: [],
    }).targetId).toBe("session-1");
  });

  it("拒绝不存在的内容目标", () => {
    expect(() => normalizeNoteForWrite({ ...baseNote, targetId: "concept-404" })).toThrow(/目标不存在/);
    expect(() => normalizeNoteForWrite({ ...baseNote, targetType: "hexagram_line", targetId: "hexagram-01-7" })).toThrow(/目标不存在/);
  });

  it("拒绝来源中的危险链接和不存在日期", () => {
    expect(() => normalizeNoteForWrite({
      ...baseNote,
      sourceRefs: [{ label: "危险", url: "javascript:alert(1)" }],
    })).toThrow(/链接格式无效/);
    expect(() => normalizeNoteForWrite({
      ...baseNote,
      sourceRefs: [{ label: "坏日期", accessedAt: "2026-02-30" }],
    })).toThrow(/访问日期无效/);
  });

  it("拒绝未知字段、非字符串标签和损坏时间", () => {
    expect(() => normalizeNoteForWrite({ ...baseNote, unexpected: true } as never)).toThrow(/未声明字段/);
    expect(() => normalizeNoteForWrite({ ...baseNote, tags: ["有效", 1] } as never)).toThrow(/标签格式无效/);
    expect(() => normalizeNoteForWrite({ ...baseNote, updatedAt: "not-a-date" })).toThrow(/更新时间无效/);
  });

  it("保留软删除时间但仍要求其为有效 ISO 时间", () => {
    expect(normalizeNoteForWrite({ ...baseNote, deletedAt: "2026-08-30T08:02:00.000Z" }).deletedAt).toBe("2026-08-30T08:02:00.000Z");
    expect(() => normalizeNoteForWrite({ ...baseNote, deletedAt: "2026-02-30T08:02:00.000Z" })).toThrow(/删除时间无效/);
  });

  it("拒绝时间线倒退的笔记记录", () => {
    expect(() => normalizeNoteForWrite({
      ...baseNote,
      createdAt: "2026-08-30T08:02:00.000Z",
      updatedAt: "2026-08-30T08:01:00.000Z",
    })).toThrow(/更新时间不能早于创建时间/);
    expect(() => normalizeNoteForWrite({
      ...baseNote,
      deletedAt: "2026-08-30T07:59:00.000Z",
    })).toThrow(/删除时间不能早于创建时间/);
  });

  it("编辑第一条来源时保留其余来源引用", () => {
    const existing = [
      { label: "旧主来源", kind: "book" as const },
      { label: "视频补充", kind: "video" as const, locator: "08:30" },
      { label: "网页补充", kind: "web" as const, url: "https://example.com" },
    ];
    expect(replaceFirstSourceRefPreservingRest(existing, [{ label: "新主来源", kind: "personal" }])).toEqual([
      { label: "新主来源", kind: "personal" },
      existing[1],
      existing[2],
    ]);
    expect(replaceFirstSourceRefPreservingRest(existing, [])).toEqual(existing.slice(1));
  });

  it("编辑或移除任意来源时只影响目标索引", () => {
    const existing = [
      { label: "主来源", kind: "book" as const },
      { label: "视频补充", kind: "video" as const },
      { label: "网页补充", kind: "web" as const },
    ];
    expect(replaceSourceRefAtPreservingRest(existing, 1, [{ label: "新视频", kind: "video" }])).toEqual([
      existing[0],
      { label: "新视频", kind: "video" },
      existing[2],
    ]);
    expect(replaceSourceRefAtPreservingRest(existing, 1, [])).toEqual([
      existing[0],
      existing[2],
    ]);
    expect(replaceSourceRefAtPreservingRest(existing, 99, [{ label: "无效" }])).toEqual(existing);
  });

  it("来源快照时间较旧但包含更多引用时仍可收敛", () => {
    expect(shouldApplySourceRefresh("2026-09-01T09:00:00.000Z", "2026-09-01T09:00:01.000Z", 4, 3)).toBe(true);
    expect(shouldApplySourceRefresh("2026-09-01T09:00:00.000Z", "2026-09-01T09:00:01.000Z", 3, 3)).toBe(false);
    expect(shouldApplySourceRefresh("2026-09-01T09:00:02.000Z", "2026-09-01T09:00:01.000Z", 3, 4)).toBe(true);
  });

  it("来源等价比较将旧版缺省类型视为个人记录", () => {
    expect(areSourceRefsEqual(
      { label: "我的记录" },
      { label: "我的记录", kind: "personal" },
    )).toBe(true);
    expect(areSourceRefsEqual(
      { label: "我的记录" },
      { label: "我的记录", kind: "book" },
    )).toBe(false);
    expect(areSourceRefsEqual(
      { label: "我的记录", kind: "personal", locator: "第 1 页" },
      { label: "我的记录", kind: "personal", locator: "第 2 页" },
    )).toBe(false);
  });

  it("单条来源写入会先归一化文本和可选字段", () => {
    expect(normalizeSourceRefForWrite({
      label: "  学习记录  ",
      kind: "personal",
      author: "  我 ",
      edition: "",
      locator: " 第 1 页 ",
    })).toEqual({
      label: "学习记录",
      kind: "personal",
      author: "我",
      locator: "第 1 页",
    });
    expect(() => normalizeSourceRefForWrite({ label: "坏链接", url: "javascript:alert(1)" })).toThrow(/链接格式无效/);
    expect(normalizeSourceRefForWrite({ label: "旧版个人来源" })).toEqual({
      label: "旧版个人来源",
      kind: "personal",
    });
  });
});
