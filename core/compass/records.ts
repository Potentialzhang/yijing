import { compassDirectionAt } from "@/content/compass";
import { normalizeDegrees } from "@/core/compass/directions";
import type { CompassRecord } from "@/db/schema";

/**
 * Normalize the user-entered bearing at the persistence boundary and verify
 * that the stored direction snapshot still describes that bearing.  The UI
 * also normalizes before displaying a success message, but repository callers
 * must not be able to bypass the same invariant.
 */
export function normalizeCompassRecordForWrite(
  record: CompassRecord,
): CompassRecord {
  const degrees = normalizeDegrees(record.degrees);
  const expectedDirectionId = compassDirectionAt(degrees).id;
  if (record.directionId !== expectedDirectionId) {
    throw new TypeError("坐向记录的角度与方位不一致");
  }
  if (record.layerId !== "eight-directions-v1" || record.ruleVersion !== 1) {
    throw new TypeError("坐向记录的盘层或规则版本不受支持");
  }
  return degrees === record.degrees ? record : { ...record, degrees };
}
