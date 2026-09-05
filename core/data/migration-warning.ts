import { isValidIsoTimestamp } from "@/core/date/local";

export const MIGRATION_WARNING_KEY = "yijing:migration-warning";

export interface MigrationWarning {
  fromVersion: number;
  toVersion: number;
  detectedAt: string;
}

const MIGRATION_WARNING_KEYS = new Set([
  "fromVersion",
  "toVersion",
  "detectedAt",
]);

export function assertMigrationWarning(input: unknown): asserts input is MigrationWarning {
  if (!input || typeof input !== "object") throw new TypeError("迁移提醒必须是对象");
  if (Object.keys(input).some((key) => !MIGRATION_WARNING_KEYS.has(key)))
    throw new TypeError("迁移提醒包含未声明字段");
  const candidate = input as Partial<MigrationWarning>;
  if (
    typeof candidate.fromVersion !== "number" ||
    typeof candidate.toVersion !== "number" ||
    !Number.isInteger(candidate.fromVersion) ||
    !Number.isInteger(candidate.toVersion) ||
    candidate.fromVersion < 1 ||
    candidate.toVersion < candidate.fromVersion ||
    typeof candidate.detectedAt !== "string" ||
    !isValidIsoTimestamp(candidate.detectedAt)
  ) {
    throw new TypeError("迁移提醒字段无效");
  }
}

export function serializeMigrationWarning(warning: MigrationWarning): string {
  assertMigrationWarning(warning);
  return JSON.stringify(warning);
}

export function parseMigrationWarning(value: string | null): MigrationWarning | null {
  if (!value) return null;
  try {
    const parsed: unknown = JSON.parse(value);
    if (!parsed || typeof parsed !== "object") return null;
    const candidate = parsed as Partial<MigrationWarning>;
    assertMigrationWarning(candidate);
    return {
      fromVersion: candidate.fromVersion,
      toVersion: candidate.toVersion,
      detectedAt: candidate.detectedAt,
    };
  } catch {
    return null;
  }
}
