import {
  parseSourceTemplate,
  SOURCE_TEMPLATE_CHANGED_EVENT,
  SOURCE_TEMPLATE_STORAGE_KEY,
  type SourceTemplate,
} from "@/core/notes/source-template";

/** Read the user's copyable source template from browser storage. */
export function readStoredSourceTemplate(): SourceTemplate | null {
  if (typeof window === "undefined") return null;
  try {
    return parseSourceTemplate(window.localStorage.getItem(SOURCE_TEMPLATE_STORAGE_KEY));
  } catch {
    return null;
  }
}

export function hasStoredSourceTemplate(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem(SOURCE_TEMPLATE_STORAGE_KEY) !== null;
  } catch {
    return false;
  }
}

export function clearStoredSourceTemplate(): boolean {
  if (typeof window === "undefined") return true;
  try {
    window.localStorage.removeItem(SOURCE_TEMPLATE_STORAGE_KEY);
  } catch {
    return false;
  }
  try {
    window.dispatchEvent(new Event(SOURCE_TEMPLATE_CHANGED_EVENT));
  } catch {
    // A notification failure must not turn a successful storage removal into
    // a false failure; mounted editors will re-read on their next refresh.
  }
  return true;
}
