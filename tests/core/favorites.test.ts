import { describe, expect, it } from "vitest";
import { normalizeFavoriteForWrite } from "@/core/notes/favorites";
import type { FavoriteRecord } from "@/db/schema";

describe("收藏写入边界", () => {
  const record: FavoriteRecord = {
    id: "trigram:qian",
    targetType: "trigram",
    targetId: "qian",
    createdAt: "2026-08-30T00:00:00.000Z",
  };

  it("接受可回链的已知目标并保持稳定主键", () => {
    expect(normalizeFavoriteForWrite(record)).toEqual(record);
    expect(normalizeFavoriteForWrite({
      ...record,
      id: "hexagram:hexagram-01",
      targetType: "hexagram",
      targetId: "hexagram-01",
    })).toMatchObject({ id: "hexagram:hexagram-01" });
  });

  it("拒绝未知目标、错误主键和无效时间", () => {
    expect(() => normalizeFavoriteForWrite({ ...record, targetId: "unknown" })).toThrow(/目标不存在/);
    expect(() => normalizeFavoriteForWrite({ ...record, id: "other" })).toThrow(/ID 必须与目标一致/);
    expect(() => normalizeFavoriteForWrite({ ...record, createdAt: "2026-02-30T00:00:00.000Z" })).toThrow(/时间无效/);
  });
});
