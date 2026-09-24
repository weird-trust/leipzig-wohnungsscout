import Form from "next/form";
import Link from "next/link";
import { ChevronIcon } from "@/components/Icons";
import { FEATURE_LABELS, STATUS_LABELS } from "@/lib/dashboard/display";
import {
  dashboardHref,
  DEFAULT_FILTERS,
  FEATURE_FILTERS,
  withQuery,
  type DashboardQuery,
  type FeatureParam,
} from "@/lib/dashboard/query";
import { APARTMENT_STATUSES } from "@/lib/domain/apartment";

const INPUT =
  "w-full min-w-0 rounded-[6px] border border-line bg-transparent px-3 py-2 text-base tabular-nums " +
  "transition-colors hover:border-faint focus-visible:border-fg";
const LABEL = "block text-sm text-muted";
const LEGEND = "mb-2 text-sm font-medium tracking-[0.14em] text-muted uppercase";

function NumberField({
  name,
  label,
  value,
  step,
}: {
  name: string;
  label: string;
  value: number | null;
  step: string;
}) {
  return (
    <div className="space-y-1.5">
      <label htmlFor={name} className={LABEL}>
        {label}
      </label>
      <input
        id={name}
        name={name}
        type="number"
        inputMode="decimal"
        min={0}
        step={step}
        defaultValue={value ?? ""}
        className={INPUT}
      />
    </div>
  );
}

/**
 * Plain GET form inside a native disclosure: submitting writes the filters
 * into the URL, which the page parses. Tab and sort ride along as hidden
 * fields. Collapsed by default; the summary shows how many are active.
 */
export function FilterForm({
  query,
  districts,
  activeCount,
}: {
  query: DashboardQuery;
  districts: readonly string[];
  activeCount: number;
}) {
  const { filters } = query;
  const resetHref = dashboardHref(withQuery(query, { filters: DEFAULT_FILTERS }));

  return (
    <details className="group">
      <summary className="-m-1.5 inline-flex items-baseline gap-2 rounded-[4px] p-1.5 text-sm">
        <span className="font-medium">Filter</span>
        {activeCount > 0 ? (
          <span className="font-mono text-sm text-accent tabular-nums">
            {activeCount}
            <span className="sr-only"> aktiv</span>
          </span>
        ) : null}
        <ChevronIcon className="size-3 self-center text-faint transition-transform group-open:rotate-180" />
      </summary>

      <Form
        action="/"
        aria-label="Filter"
        className="mt-6 grid items-end gap-x-8 gap-y-6 pb-4 sm:grid-cols-2 lg:grid-cols-4"
      >
        <input type="hidden" name="tab" value={query.tab} />
        <input type="hidden" name="sort" value={query.sort} />

        <fieldset className="grid min-w-0 grid-cols-2 gap-3">
          <legend className={LEGEND}>Zimmer</legend>
          <NumberField name="minRooms" label="von" value={filters.minRooms} step="0.5" />
          <NumberField name="maxRooms" label="bis" value={filters.maxRooms} step="0.5" />
        </fieldset>

        <fieldset className="grid min-w-0 grid-cols-2 gap-3">
          <legend className={LEGEND}>Fläche & Miete</legend>
          <NumberField name="minSqm" label="Mindestfläche (m²)" value={filters.minSqm} step="1" />
          <NumberField name="maxWarmRent" label="Warmmiete bis (€)" value={filters.maxWarmRent} step="10" />
        </fieldset>

        <div className="min-w-0 space-y-1.5">
          <label htmlFor="district" className={LEGEND}>
            Stadtteil
          </label>
          <select id="district" name="district" defaultValue={filters.district ?? ""} className={INPUT}>
            <option value="">Alle Stadtteile</option>
            {districts.map((district) => (
              <option key={district} value={district}>
                {district}
              </option>
            ))}
          </select>
        </div>

        <div className="min-w-0 space-y-1.5">
          <label htmlFor="status" className={LEGEND}>
            Status
          </label>
          <select id="status" name="status" defaultValue={filters.status ?? ""} className={INPUT}>
            <option value="">Alle Status</option>
            {APARTMENT_STATUSES.map((status) => (
              <option key={status} value={status}>
                {STATUS_LABELS[status]}
              </option>
            ))}
          </select>
        </div>

        <fieldset className="min-w-0 sm:col-span-2">
          <legend className={LEGEND}>Nur bestätigt</legend>
          <div className="flex flex-wrap gap-x-6 gap-y-2">
            {(Object.entries(FEATURE_FILTERS) as [FeatureParam, (typeof FEATURE_FILTERS)[FeatureParam]][]).map(
              ([param, feature]) => (
                <label key={param} className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    name={param}
                    value="1"
                    defaultChecked={filters.require.includes(feature)}
                    className="size-4 accent-[var(--fg)]"
                  />
                  {FEATURE_LABELS[feature]}
                </label>
              ),
            )}
          </div>
          <p className="mt-2 text-sm text-faint">Unbekannte Angaben (?) zählen hier nicht.</p>
        </fieldset>

        <div className="flex items-end gap-6 sm:col-span-2 lg:justify-end">
          <button
            type="submit"
            className="rounded-[6px] bg-fg px-5 py-2 text-sm font-medium text-bg transition-opacity hover:opacity-85"
          >
            Anwenden
          </button>
          <Link
            href={resetHref}
            className="py-2 text-sm text-muted underline decoration-line underline-offset-4 transition-colors hover:text-fg hover:decoration-fg"
          >
            Zurücksetzen
          </Link>
        </div>
      </Form>
    </details>
  );
}
