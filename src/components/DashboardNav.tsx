import Link from "next/link";
import { SORT_LABELS, TAB_LABELS } from "@/lib/dashboard/display";
import {
  dashboardHref,
  SORTS,
  TABS,
  withQuery,
  type DashboardQuery,
  type Tab,
} from "@/lib/dashboard/query";

/** View tabs as plain links; filters and sort carry over. */
export function TabNav({
  query,
  counts,
}: {
  query: DashboardQuery;
  counts: Record<Tab, number>;
}) {
  return (
    <nav aria-label="Ansicht" className="-mx-1 overflow-x-auto">
      <ul className="flex min-w-max gap-1 border-b border-line">
        {TABS.map((tab) => {
          const active = tab === query.tab;
          return (
            <li key={tab}>
              <Link
                href={dashboardHref(withQuery(query, { tab }))}
                aria-current={active ? "page" : undefined}
                className={`-mb-px inline-flex items-baseline gap-1.5 border-b-2 px-2 py-2 text-sm ${
                  active
                    ? "border-fg font-semibold"
                    : "border-transparent text-muted hover:border-line hover:text-fg"
                }`}
              >
                {TAB_LABELS[tab]}
                <span className="text-xs text-muted tabular-nums">{counts[tab]}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

export function SortNav({ query }: { query: DashboardQuery }) {
  return (
    <nav aria-label="Sortierung" className="flex flex-wrap items-baseline gap-x-3 gap-y-1 text-sm">
      <span className="text-muted">Sortierung</span>
      {SORTS.map((sort) => {
        const active = sort === query.sort;
        return (
          <Link
            key={sort}
            href={dashboardHref(withQuery(query, { sort }))}
            aria-current={active ? "true" : undefined}
            className={
              active
                ? "font-semibold underline decoration-2 underline-offset-4"
                : "text-muted hover:text-fg hover:underline"
            }
          >
            {SORT_LABELS[sort]}
            {sort === "rent" ? " ↑" : " ↓"}
          </Link>
        );
      })}
    </nav>
  );
}
