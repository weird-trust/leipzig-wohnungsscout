import Link from "next/link";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { ApartmentRow } from "@/components/ApartmentRow";
import { SortMenu, TabNav } from "@/components/DashboardNav";
import { FilterForm } from "@/components/FilterForm";
import { activeFilters } from "@/lib/dashboard/activeFilters";
import { TAB_LABELS } from "@/lib/dashboard/display";
import {
  dashboardHref,
  DEFAULT_FILTERS,
  hasActiveFilters,
  parseDashboardQuery,
  searchParamsHref,
  withQuery,
  type DashboardQuery,
} from "@/lib/dashboard/query";
import { buildDashboardView } from "@/lib/dashboard/view";
import { listApartments } from "@/lib/db/apartments";
import { getDb } from "@/lib/db/client";

const LINK = "text-fg underline decoration-line underline-offset-4 transition-colors hover:decoration-fg";

function EmptyState({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="border-t border-line py-16 sm:py-24">
      <p className="text-lg font-medium tracking-[-0.015em]">{title}</p>
      <div className="mt-3 max-w-prose text-muted">{children}</div>
    </div>
  );
}

function NoResults({ query, total }: { query: DashboardQuery; total: number }) {
  if (total === 0) {
    return (
      <EmptyState title="Noch keine Wohnungen">
        <p>
          Sobald Suchaufträge per E-Mail eingehen, erscheinen die Angebote hier. Für die
          Entwicklung lassen sich synthetische Testdaten mit <code className="font-mono">npm run seed</code>{" "}
          anlegen.
        </p>
      </EmptyState>
    );
  }

  const resetHref = dashboardHref(withQuery(query, { filters: DEFAULT_FILTERS }));
  if (hasActiveFilters(query.filters)) {
    return (
      <EmptyState title="Keine Wohnung passt zu diesen Filtern">
        <p>
          Filter lockern oder{" "}
          <Link href={resetHref} className={LINK}>
            alle Filter zurücksetzen
          </Link>
          .
        </p>
      </EmptyState>
    );
  }

  if (query.tab === "favorites") {
    return (
      <EmptyState title="Noch keine Favoriten">
        <p>Mit dem Stern lassen sich Wohnungen merken, unabhängig von ihrem Status.</p>
      </EmptyState>
    );
  }

  return (
    <EmptyState title={`Keine Wohnungen in „${TAB_LABELS[query.tab]}“`}>
      <p>
        <Link href="/" className={LINK}>
          Alle Wohnungen anzeigen
        </Link>
      </p>
    </EmptyState>
  );
}

export default async function DashboardPage({ searchParams }: PageProps<"/">) {
  await connection();
  const params = await searchParams;
  const query = parseDashboardQuery(params);

  // Keep URLs canonical: drops empty form fields and invalid values.
  const canonical = dashboardHref(query);
  if (searchParamsHref(params) !== canonical) redirect(canonical);

  const apartments = await listApartments(getDb());
  const view = buildDashboardView(apartments, query);
  const chips = activeFilters(query);
  const now = new Date();

  return (
    <main>
      <header>
        <h1 className="text-xl font-medium tracking-[-0.04em]">
          Mauwscout24{" "}
          <span className="font-mono font-extralight tracking-[-0.06em] text-muted">Leipzig</span>
        </h1>
        <p className="mt-4 text-base text-muted tabular-nums">
          {view.total} {view.total === 1 ? "Wohnung" : "Wohnungen"}
          <span aria-hidden="true"> · </span>
          <span className="sr-only">, </span>
          <span className="text-fg">{view.tabCounts.new} neu</span>
          <span aria-hidden="true"> · </span>
          <span className="sr-only">, </span>
          {view.tabCounts.favorites} {view.tabCounts.favorites === 1 ? "Favorit" : "Favoriten"}
        </p>
      </header>

      <div className="mt-12 sm:mt-16 lg:mt-20">
        <TabNav query={query} counts={view.tabCounts} />
      </div>

      <section aria-labelledby="results-heading" className="mt-8 sm:mt-10">
        <div className="relative border-t border-line py-4">
          <h2 id="results-heading" className="sr-only">
            Ergebnisse
          </h2>
          {/* Sort sits top-right; the filter panel below it spans the full width. */}
          <div className="absolute top-4 right-0 z-30 flex items-baseline gap-6">
            <p className="text-sm text-faint tabular-nums">
              <span className="text-fg">{view.items.length}</span> von {view.tabCounts[query.tab]}
              <span className="sr-only"> angezeigt</span>
            </p>
            <SortMenu query={query} />
          </div>
          <FilterForm
            key={canonical}
            query={query}
            districts={view.districts}
            activeCount={chips.length}
          />

          {chips.length > 0 && (
            <ul aria-label="Aktive Filter" className="mt-4 flex flex-wrap gap-2">
              {chips.map((chip) => (
                <li key={chip.label}>
                  <Link
                    href={chip.removeHref}
                    className="inline-flex items-baseline gap-2 rounded-[6px] border border-line px-2.5 py-1 text-sm transition-colors hover:border-fg"
                  >
                    {chip.label}
                    <span aria-hidden="true" className="text-faint">
                      ×
                    </span>
                    <span className="sr-only">entfernen</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="mt-2">
          {view.items.length > 0 ? (
            <div className="border-b border-line">
              {view.items.map((item) => (
                <ApartmentRow key={item.apartment.id} item={item} now={now} />
              ))}
            </div>
          ) : (
            <NoResults query={query} total={view.total} />
          )}
        </div>
      </section>
    </main>
  );
}
