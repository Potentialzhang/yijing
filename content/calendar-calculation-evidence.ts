/** External date facts; seconds-level algorithm regression fixtures live in tests.
 * HKO gives civil dates, not this application's choice of four-pillar boundaries.
 */
export const CALCULATION_DATE_EVIDENCE = [
  { id: "hko-2026-new-year", date: "2026-02-17", lunar: { year: 2026, month: 1, day: 1, isLeapMonth: false }, sourceId: "source-hko-calendar", locator: "2026/2/17 · 1st Lunar Month" },
  { id: "hko-2026-lichun", date: "2026-02-04", lunar: { year: 2025, month: 12, day: 17, isLeapMonth: false }, term: "立春", sourceId: "source-hko-calendar", locator: "2026/2/4 · 17 · Spring Commences" },
] as const;
