"use client";

import { useEffect } from "react";
import { readPreferenceSnapshot } from "@/db/repository";
import { applyVisualPreferences, subscribeToSystemTheme } from "@/components/settings/visualPreferences";
import { DATA_CHANGED_EVENT } from "@/db/events";

export function PreferenceHydrator() {
  useEffect(() => {
    let cancelled = false;
    let hydrationSequence = 0;
    let initialSettled = false;
    let unsubscribe = () => {};
    async function hydrate() {
      const sequence = ++hydrationSequence;
      const { theme, fontScale } = await readPreferenceSnapshot();
      if (cancelled || sequence !== hydrationSequence) return;
      const userChangedBeforeHydration = !initialSettled && document.documentElement.dataset.preferenceLocked === "true";
      initialSettled = true;
      if (userChangedBeforeHydration) return;
      applyVisualPreferences(theme, fontScale);
      document.documentElement.removeAttribute("data-preference-locked");
      unsubscribe();
      unsubscribe = subscribeToSystemTheme(theme, fontScale);
    }
    void hydrate().catch(() => undefined);
    const onDataChanged = () => void hydrate().catch(() => undefined);
    window.addEventListener(DATA_CHANGED_EVENT, onDataChanged);
    return () => {
      cancelled = true;
      window.removeEventListener(DATA_CHANGED_EVENT, onDataChanged);
      unsubscribe();
    };
  }, []);
  return null;
}
