import {
  APARTMENT_STATUSES,
  type ApartmentStatus,
} from "@/lib/domain/apartment";

/**
 * Dashboard state as it lives in the URL. Parsing never throws: anything
 * invalid falls back to the default, so every URL renders.
 */

export const TABS = ["all", "new", "favorites", "applied", "viewing"] as const;
export type Tab = (typeof TABS)[number];

export const SORTS = ["score", "newest", "rent", "area"] as const;
export type Sort = (typeof SORTS)[number];

/** Optional features that can be required; URL param name → domain field. */
export const FEATURE_FILTERS = {
  topFloor: "topFloor",
  balcony: "balcony",
  bathtub: "bathtub",
  kitchen: "residentialKitchen",
} as const;
export type FeatureParam = keyof typeof FEATURE_FILTERS;
export type RequirableFeature = (typeof FEATURE_FILTERS)[FeatureParam];

export interface DashboardFilters {
  minRooms: number | null;
  maxRooms: number | null;
  minSqm: number | null;
  maxWarmRent: number | null;
  /** Features that must be explicitly true. */
  require: readonly RequirableFeature[];
  district: string | null;
  status: ApartmentStatus | null;
}

export interface DashboardQuery {
  tab: Tab;
  sort: Sort;
  filters: DashboardFilters;
}

export const DEFAULT_FILTERS: DashboardFilters = {
  minRooms: null,
  maxRooms: null,
  minSqm: null,
  maxWarmRent: null,
  require: [],
  district: null,
  status: null,
};

export const DEFAULT_QUERY: DashboardQuery = {
  tab: "all",
  sort: "score",
  filters: DEFAULT_FILTERS,
};

export type SearchParams = Record<string, string | string[] | undefined>;

const NUMBER_PARAMS = ["minRooms", "maxRooms", "minSqm", "maxWarmRent"] as const;

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function oneOf<const T extends string>(
  allowed: readonly T[],
  value: string | undefined,
  fallback: T,
): T {
  return value !== undefined && (allowed as readonly string[]).includes(value)
    ? (value as T)
    : fallback;
}

/** Accepts "90", "90.5" and "90,5"; rejects negatives, empty and non-numbers. */
export function parseNonNegativeNumber(value: string | undefined): number | null {
  const trimmed = value?.trim().replace(",", ".");
  if (!trimmed || !/^\d+(\.\d+)?$/.test(trimmed)) return null;
  const number = Number(trimmed);
  return Number.isFinite(number) ? number : null;
}

function isEnabled(value: string | undefined): boolean {
  return value === "1" || value === "true" || value === "on";
}

export function parseDashboardQuery(params: SearchParams): DashboardQuery {
  const get = (key: string) => first(params[key]);

  const numbers = Object.fromEntries(
    NUMBER_PARAMS.map((key) => [key, parseNonNegativeNumber(get(key))]),
  ) as Record<(typeof NUMBER_PARAMS)[number], number | null>;

  const require = (Object.keys(FEATURE_FILTERS) as FeatureParam[])
    .filter((param) => isEnabled(get(param)))
    .map((param) => FEATURE_FILTERS[param]);

  const district = get("district")?.trim() || null;
  const status = get("status");

  return {
    tab: oneOf(TABS, get("tab"), DEFAULT_QUERY.tab),
    sort: oneOf(SORTS, get("sort"), DEFAULT_QUERY.sort),
    filters: {
      ...numbers,
      require,
      district,
      status:
        status && (APARTMENT_STATUSES as readonly string[]).includes(status)
          ? (status as ApartmentStatus)
          : null,
    },
  };
}

/** Serializes a query to a URL, leaving out defaults so URLs stay short. */
export function dashboardHref(query: DashboardQuery): string {
  const params = new URLSearchParams();
  if (query.tab !== DEFAULT_QUERY.tab) params.set("tab", query.tab);
  if (query.sort !== DEFAULT_QUERY.sort) params.set("sort", query.sort);

  const { filters } = query;
  for (const key of NUMBER_PARAMS) {
    const value = filters[key];
    if (value !== null) params.set(key, String(value));
  }
  for (const [param, feature] of Object.entries(FEATURE_FILTERS)) {
    if (filters.require.includes(feature)) params.set(param, "1");
  }
  if (filters.district) params.set("district", filters.district);
  if (filters.status) params.set("status", filters.status);

  const search = params.toString();
  return search ? `/?${search}` : "/";
}

/** The incoming params serialized like dashboardHref, for canonical-URL checks. */
export function searchParamsHref(params: SearchParams): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    for (const item of Array.isArray(value) ? value : [value]) {
      if (item !== undefined) search.append(key, item);
    }
  }
  const text = search.toString();
  return text ? `/?${text}` : "/";
}

export function withQuery(
  query: DashboardQuery,
  changes: { tab?: Tab; sort?: Sort; filters?: Partial<DashboardFilters> },
): DashboardQuery {
  return {
    tab: changes.tab ?? query.tab,
    sort: changes.sort ?? query.sort,
    filters: { ...query.filters, ...changes.filters },
  };
}

export function hasActiveFilters(filters: DashboardFilters): boolean {
  return (
    NUMBER_PARAMS.some((key) => filters[key] !== null) ||
    filters.require.length > 0 ||
    filters.district !== null ||
    filters.status !== null
  );
}
