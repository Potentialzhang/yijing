/**
 * Decide whether a shared navigation item represents the current route.
 * Settings has one entry in the global menu but several child routes, so the
 * data-settings link acts as the parent marker for the whole settings area.
 */
export function isNavigationItemCurrent(pathname: string, href: string): boolean {
  const normalizedPathname = pathname.split("?", 1)[0].replace(/\/$/, "") || "/";
  const normalizedHref = href.replace(/\/$/, "") || "/";
  if (normalizedHref === "/") return normalizedPathname === "/";
  if (normalizedHref === "/settings/data") {
    return normalizedPathname === "/settings" || normalizedPathname.startsWith("/settings/");
  }
  return normalizedPathname === normalizedHref || normalizedPathname.startsWith(`${normalizedHref}/`);
}
