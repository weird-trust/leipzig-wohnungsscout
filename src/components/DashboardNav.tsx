import Link from "next/link";
import { ChevronIcon } from "@/components/Icons";
import { SORT_LABELS, TAB_LABELS } from "@/lib/dashboard/display";
import {
  dashboardHref,
  SORTS,
  TABS,
  withQuery,
  type DashboardQuery,
  type Sort,
  type Tab,
} from "@/lib/dashboard/query";

function sortArrow(sort: Sort): string {
  return sort === "rent" ? "↑" : "↓";
}

/** View tabs as a typographic index; filters and sort carry over. */
export function TabNav({
  query,
  counts,
}: {
  query: DashboardQuery;
  counts: Record<Tab, number>;
}) {
  return (
    <nav aria-label="Ansicht" className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
      <ul className="flex min-w-max gap-x-6 sm:gap-x-9">
        {TABS.map((tab) => {
          const active = tab === query.tab;
          return (
            <li key={tab}>
              <Link
                href={dashboardHref(withQuery(query, { tab }))}
                aria-current={active ? "page" : undefined}
                className={`group/tab inline-flex items-baseline gap-1.5 py-1 text-base transition-colors ${
                  active ? "font-medium text-fg" : "text-muted hover:text-fg"
                }`}
              >
                <span
                  className={`decoration-[1.5px] underline-offset-[0.35em] ${
                    active ? "underline" : "group-hover/tab:underline group-hover/tab:decoration-line"
                  }`}
                >
                  {TAB_LABELS[tab]}
                </span>
                <span className="font-mono text-sm font-normal text-faint tabular-nums">
                  {counts[tab]}
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

/** Sort as a small utility: the current order, the others in a native disclosure. */
export function SortMenu({ query }: { query: DashboardQuery }) {
  return (
    <details className="group relative text-sm">
      <summary className="-m-1.5 inline-flex items-baseline gap-2 rounded-[4px] p-1.5">
        <span className="text-faint max-sm:sr-only">Sortierung</span>
        <span className="font-medium">
          {SORT_LABELS[query.sort]} <span aria-hidden="true">{sortArrow(query.sort)}</span>
        </span>
        <ChevronIcon className="size-3 self-center text-faint transition-transform group-open:rotate-180" />
      </summary>
      <nav
        aria-label="Sortierung"
        className="absolute top-full right-0 z-30 mt-2 w-44 rounded-md border border-line bg-bg p-2 shadow-[0_8px_24px_-12px_rgb(0_0_0/0.25)]"
      >
        <ul>
          {SORTS.map((sort) => {
            const active = sort === query.sort;
            return (
              <li key={sort}>
                <Link
                  href={dashboardHref(withQuery(query, { sort }))}
                  aria-current={active ? "true" : undefined}
                  className={`flex justify-between rounded-[4px] px-2 py-1.5 transition-colors hover:bg-surface hover:text-fg ${
                    active ? "font-medium text-fg" : "text-muted"
                  }`}
                >
                  {SORT_LABELS[sort]}
                  <span aria-hidden="true" className="text-faint">
                    {sortArrow(sort)}
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
    </details>
  );
}
