import Link from "next/link";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { ApartmentCard } from "@/components/ApartmentCard";
import { SortNav, TabNav } from "@/components/DashboardNav";
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

function EmptyState({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="border-t border-line py-12">
      <p className="text-lg font-semibold">{title}</p>
      <div className="mt-2 max-w-prose text-sm text-muted">{children}</div>
    </div>
  );
}

function NoResults({ query, total }: { query: DashboardQuery; total: number }) {
  if (total === 0) {
    return (
      <EmptyState title="Noch keine Wohnungen">
        <p>
          Sobald Suchaufträge per E-Mail eingehen, erscheinen die Angebote hier. Für die
          Entwicklung lassen sich synthetische Testdaten mit <code>npm run seed</code> anlegen.
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
          <Link href={resetHref} className="text-fg underline underline-offset-2">
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
        <p>Mit „☆ Favorit“ lassen sich Wohnungen merken, unabhängig von ihrem Status.</p>
      </EmptyState>
    );
  }

  return (
    <EmptyState title={`Keine Wohnungen in „${TAB_LABELS[query.tab]}“`}>
      <p>
        <Link href="/" className="text-fg underline underline-offset-2">
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

  return (
    <main className="pt-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <h1 className="text-4xl font-bold tracking-tight tabular-nums sm:text-5xl">
          {view.total} {view.total === 1 ? "Wohnung" : "Wohnungen"}
        </h1>
        <p className="text-lg tabular-nums">
          <span className="font-semibold text-accent">{view.tabCounts.new} neu</span>
          <span className="text-muted"> · {view.tabCounts.favorites} Favoriten</span>
        </p>
      </div>

      <div className="mt-6">
        <TabNav query={query} counts={view.tabCounts} />
      </div>

      <div className="mt-6 grid gap-8 lg:grid-cols-[14rem_1fr]">
        <aside className="min-w-0">
          <h2 className="sr-only">Filter</h2>
          <FilterForm key={canonical} query={query} districts={view.districts} />
        </aside>

        <section aria-labelledby="results-heading" className="min-w-0">
          <div className="flex flex-wrap items-baseline justify-between gap-3 pb-3">
            <h2 id="results-heading" className="text-sm tabular-nums">
              <span className="font-semibold">{view.items.length}</span>
              <span className="text-muted"> von {view.tabCounts[query.tab]} angezeigt</span>
            </h2>
            <SortNav query={query} />
          </div>

          {chips.length > 0 && (
            <ul aria-label="Aktive Filter" className="flex flex-wrap gap-2 pb-4">
              {chips.map((chip) => (
                <li key={chip.label}>
                  <Link
                    href={chip.removeHref}
                    className="inline-flex items-center gap-1.5 border border-fg px-2 py-0.5 text-xs hover:bg-fg hover:text-bg"
                  >
                    {chip.label}
                    <span aria-hidden="true">×</span>
                    <span className="sr-only">entfernen</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}

          {view.items.length > 0 ? (
            <div className="border-b border-line">
              {view.items.map((item) => (
                <ApartmentCard key={item.apartment.id} item={item} />
              ))}
            </div>
          ) : (
            <NoResults query={query} total={view.total} />
          )}
        </section>
      </div>
    </main>
  );
}
