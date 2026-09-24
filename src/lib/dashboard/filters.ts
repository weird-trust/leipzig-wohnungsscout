import type { Apartment } from "@/lib/domain/apartment";
import type { DashboardFilters, Tab } from "@/lib/dashboard/query";

export function matchesTab(apartment: Apartment, tab: Tab): boolean {
  switch (tab) {
    case "all":
      return true;
    case "favorites":
      // Independent of the workflow status.
      return apartment.isFavorite;
    case "new":
    case "applied":
    case "viewing":
      return apartment.status === tab;
  }
}

/**
 * Numeric filters hide only listings known to violate them: an unknown
 * value (e.g. no warm rent in the alert) stays visible. Required features
 * must be explicitly true; unknown does not count. A district filter needs
 * a matching district.
 */
export function matchesFilters(
  apartment: Apartment,
  filters: DashboardFilters,
): boolean {
  const { rooms, sqm, rentWarm } = apartment;

  if (filters.minRooms !== null && rooms !== null && rooms < filters.minRooms) return false;
  if (filters.maxRooms !== null && rooms !== null && rooms > filters.maxRooms) return false;
  if (filters.minSqm !== null && sqm !== null && sqm < filters.minSqm) return false;
  if (filters.maxWarmRent !== null && rentWarm !== null && rentWarm > filters.maxWarmRent) {
    return false;
  }

  if (filters.require.some((feature) => apartment[feature] !== true)) return false;

  if (filters.district !== null && apartment.district?.trim() !== filters.district) {
    return false;
  }
  if (filters.status !== null && apartment.status !== filters.status) return false;

  return true;
}
