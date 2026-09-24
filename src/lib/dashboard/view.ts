import type { Apartment } from "@/lib/domain/apartment";
import { matchesFilters, matchesTab } from "@/lib/dashboard/filters";
import { TABS, type DashboardQuery, type Tab } from "@/lib/dashboard/query";
import { sortApartments, type ScoredApartment } from "@/lib/dashboard/sorting";
import { scoreApartment } from "@/lib/scoring";

export interface DashboardView {
  items: ScoredApartment[];
  /** Per-tab counts over all apartments, ignoring filters. */
  tabCounts: Record<Tab, number>;
  total: number;
  /** Districts present in the data, for the filter select. */
  districts: string[];
}

/** Everything the dashboard renders, derived from the loaded apartments. */
export function buildDashboardView(
  apartments: readonly Apartment[],
  query: DashboardQuery,
): DashboardView {
  const tabCounts = Object.fromEntries(
    TABS.map((tab) => [tab, apartments.filter((a) => matchesTab(a, tab)).length]),
  ) as Record<Tab, number>;

  const visible = apartments
    .filter((a) => matchesTab(a, query.tab) && matchesFilters(a, query.filters))
    .map((apartment) => ({ apartment, score: scoreApartment(apartment) }));

  const districts = [
    ...new Set(
      apartments
        .map((a) => a.district?.trim())
        .filter((d): d is string => Boolean(d)),
    ),
  ].sort((a, b) => a.localeCompare(b, "de"));

  return {
    items: sortApartments(visible, query.sort),
    tabCounts,
    total: apartments.length,
    districts,
  };
}
