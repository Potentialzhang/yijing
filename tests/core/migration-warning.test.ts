import { describe, expect, it } from "vitest";
import { assertMigrationWarning, parseMigrationWarning, serializeMigrationWarning } from "@/core/data/migration-warning";

describe("数据库迁移前备份提醒", () => {
  it("可以序列化并恢复有效提醒", () => {
    const warning = { fromVersion: 1, toVersion: 6, detectedAt: "2026-08-26T00:00:00.000Z" };
    expect(parseMigrationWarning(serializeMigrationWarning(warning))).toEqual(warning);
  });

  it("拒绝损坏、倒退版本和缺少时间的提醒", () => {
    expect(parseMigrationWarning("not-json")).toBeNull();
    expect(parseMigrationWarning(JSON.stringify({ fromVersion: 6, toVersion: 2, detectedAt: "now" }))).toBeNull();
    expect(parseMigrationWarning(JSON.stringify({ fromVersion: 1, toVersion: 6 }))).toBeNull();
    expect(parseMigrationWarning(JSON.stringify({ fromVersion: 1, toVersion: 6, detectedAt: "2026-02-30T00:00:00.000Z" }))).toBeNull();
    expect(parseMigrationWarning(JSON.stringify({ fromVersion: 1, toVersion: 6, detectedAt: "2026-08-26T00:00:00" }))).toBeNull();
    expect(() => serializeMigrationWarning({ fromVersion: 1, toVersion: 6, detectedAt: "not-a-date" } as never)).toThrow(/字段无效/);
    expect(() => assertMigrationWarning({ fromVersion: 1, toVersion: 6, detectedAt: "2026-08-26T00:00:00" })).toThrow(/字段无效/);
  });

  it("拒绝提醒中的未声明字段", () => {
    const warning = {
      fromVersion: 1,
      toVersion: 6,
      detectedAt: "2026-08-26T00:00:00.000Z",
      unexpected: true,
    };
    expect(() => assertMigrationWarning(warning)).toThrow(/未声明字段/);
    expect(() => serializeMigrationWarning(warning as never)).toThrow(/未声明字段/);
    expect(parseMigrationWarning(JSON.stringify(warning))).toBeNull();
  });
});
