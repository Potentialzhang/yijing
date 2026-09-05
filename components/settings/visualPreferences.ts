export type ThemePreference = "light" | "dark" | "system";

export function resolveTheme(
  preference: string,
  prefersDark: boolean,
): "light" | "dark" {
  if (preference === "dark") return "dark";
  if (preference === "system" && prefersDark) return "dark";
  return "light";
}

export function applyVisualPreferences(theme: string, fontScale: string): void {
  if (typeof document === "undefined") return;
  const prefersDark =
    typeof window !== "undefined" &&
    window.matchMedia("(prefers-color-scheme: dark)").matches;
  document.documentElement.dataset.theme = resolveTheme(theme, prefersDark);
  document.documentElement.dataset.themePreference = theme;
  document.documentElement.dataset.fontScale = fontScale;
}

export function subscribeToSystemTheme(
  theme: string,
  fontScale: string,
): () => void {
  if (typeof window === "undefined" || theme !== "system") return () => {};
  const query = window.matchMedia("(prefers-color-scheme: dark)");
  const update = () => applyVisualPreferences(theme, fontScale);
  if (typeof query.addEventListener === "function") {
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }
  query.addListener(update);
  return () => query.removeListener(update);
}
