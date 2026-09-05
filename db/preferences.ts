import {
  DEFAULT_PREFERENCES,
  isValidPreferenceValue,
} from "@/core/preferences";
import { yijingDb } from "@/db/schema";

export { DEFAULT_PREFERENCES, isValidPreferenceValue } from "@/core/preferences";

export async function getPreference<K extends keyof typeof DEFAULT_PREFERENCES>(
  key: K,
): Promise<(typeof DEFAULT_PREFERENCES)[K]> {
  const record = await yijingDb.preferences.get(key);
  return (isValidPreferenceValue(key, record?.value)
    ? record?.value
    : DEFAULT_PREFERENCES[key]) as (typeof DEFAULT_PREFERENCES)[K];
}

export async function setPreference(
  key: string,
  value: string | number | boolean,
): Promise<void> {
  if (!isValidPreferenceValue(key, value)) throw new TypeError(`偏好 ${key} 的值无效`);
  await yijingDb.preferences.put({
    key,
    value,
    updatedAt: new Date().toISOString(),
  });
}
