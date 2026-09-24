import { FEATURE_LABELS, formatEuro, STATUS_LABELS } from "@/lib/dashboard/display";
import {
  dashboardHref,
  withQuery,
  type DashboardQuery,
} from "@/lib/dashboard/query";

export interface ActiveFilter {
  label: string;
  /** URL of the same view with just this filter removed. */
  removeHref: string;
}

const number = new Intl.NumberFormat("de-DE", { maximumFractionDigits: 1 });

export function activeFilters(query: DashboardQuery): ActiveFilter[] {
  const { filters } = query;
  const without = (changes: Parameters<typeof withQuery>[1]["filters"]) =>
    dashboardHref(withQuery(query, { filters: changes }));

  const result: ActiveFilter[] = [];
  if (filters.minRooms !== null) {
    result.push({ label: `ab ${number.format(filters.minRooms)} Zi.`, removeHref: without({ minRooms: null }) });
  }
  if (filters.maxRooms !== null) {
    result.push({ label: `bis ${number.format(filters.maxRooms)} Zi.`, removeHref: without({ maxRooms: null }) });
  }
  if (filters.minSqm !== null) {
    result.push({ label: `ab ${number.format(filters.minSqm)} m²`, removeHref: without({ minSqm: null }) });
  }
  if (filters.maxWarmRent !== null) {
    result.push({
      label: `bis ${formatEuro(filters.maxWarmRent)} warm`,
      removeHref: without({ maxWarmRent: null }),
    });
  }
  for (const feature of filters.require) {
    result.push({
      label: `✓ ${FEATURE_LABELS[feature]}`,
      removeHref: without({ require: filters.require.filter((f) => f !== feature) }),
    });
  }
  if (filters.district !== null) {
    result.push({ label: `Stadtteil: ${filters.district}`, removeHref: without({ district: null }) });
  }
  if (filters.status !== null) {
    result.push({ label: `Status: ${STATUS_LABELS[filters.status]}`, removeHref: without({ status: null }) });
  }
  return result;
}
