import {
  parseSourceTemplate,
  serializeSourceTemplate,
  SOURCE_TEMPLATE_CHANGED_EVENT,
  type SourceTemplate,
} from "@/core/notes/source-template";
import type { UserSourceRef } from "@/db/schema";
import { notifyDataChanged } from "@/db/events";

/**
 * The source template is a personal record, so it is persisted in PostgreSQL
 * through the same account-scoped API as notes and preferences.  This module
 * keeps the editor API small while deliberately avoiding browser storage.
 */
const TABLE = "sourceTemplates";
const KEY = "latest";

function announceChange(): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(SOURCE_TEMPLATE_CHANGED_EVENT));
  notifyDataChanged();
}

export async function readStoredSourceTemplate(): Promise<SourceTemplate | null> {
  try {
    const response = await fetch(`/api/data?table=${TABLE}`, { cache: "no-store" });
    if (!response.ok) return null;
    const body = await response.json() as { records?: unknown[] };
    const record = body.records?.[0];
    if (!record || typeof record !== "object" || Array.isArray(record)) return null;
    const template = (record as { template?: unknown }).template ?? record;
    return parseSourceTemplate(JSON.stringify(template));
  } catch {
    return null;
  }
}

export async function hasStoredSourceTemplate(): Promise<boolean> {
  return Boolean(await readStoredSourceTemplate());
}

export async function saveStoredSourceTemplate(
  sourceRef: UserSourceRef,
  copiedAt: string,
): Promise<boolean> {
  try {
    const template = JSON.parse(serializeSourceTemplate(sourceRef, copiedAt)) as SourceTemplate;
    const response = await fetch("/api/data", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        table: TABLE,
        key: KEY,
        record: { id: KEY, template, updatedAt: new Date().toISOString() },
      }),
    });
    if (!response.ok) return false;
    announceChange();
    return true;
  } catch {
    return false;
  }
}

export async function clearStoredSourceTemplate(): Promise<boolean> {
  try {
    const response = await fetch("/api/data", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ table: TABLE, id: KEY }),
    });
    if (!response.ok) return false;
    announceChange();
    return true;
  } catch {
    return false;
  }
}
