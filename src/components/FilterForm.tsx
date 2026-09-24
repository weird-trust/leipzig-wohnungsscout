import Form from "next/form";
import Link from "next/link";
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
  "w-full min-w-0 border border-line bg-surface px-2 py-1.5 text-sm tabular-nums focus-visible:border-fg";
const LABEL = "block text-xs font-medium tracking-wide text-muted uppercase";

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
    <div className="space-y-1">
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
 * Plain GET form: submitting writes the filters into the URL, which the
 * page parses. Tab and sort ride along as hidden fields.
 */
export function FilterForm({
  query,
  districts,
}: {
  query: DashboardQuery;
  districts: readonly string[];
}) {
  const { filters } = query;
  const resetHref = dashboardHref(withQuery(query, { filters: DEFAULT_FILTERS }));

  return (
    <Form action="/" className="space-y-5" aria-label="Filter">
      <input type="hidden" name="tab" value={query.tab} />
      <input type="hidden" name="sort" value={query.sort} />

      <fieldset className="grid min-w-0 grid-cols-2 gap-2">
        <legend className={`${LABEL} mb-1`}>Zimmer</legend>
        <NumberField name="minRooms" label="von" value={filters.minRooms} step="0.5" />
        <NumberField name="maxRooms" label="bis" value={filters.maxRooms} step="0.5" />
      </fieldset>

      <NumberField name="minSqm" label="Mindestfläche (m²)" value={filters.minSqm} step="1" />
      <NumberField
        name="maxWarmRent"
        label="Max. Warmmiete (€)"
        value={filters.maxWarmRent}
        step="10"
      />

      <fieldset className="min-w-0 space-y-1.5">
        <legend className={`${LABEL} mb-1`}>Nur bestätigt</legend>
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
        <p className="text-xs text-muted">Unbekannte Angaben (?) zählen hier nicht.</p>
      </fieldset>

      <div className="space-y-1">
        <label htmlFor="district" className={LABEL}>
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

      <div className="space-y-1">
        <label htmlFor="status" className={LABEL}>
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

      <div className="flex items-center gap-4">
        <button
          type="submit"
          className="bg-fg px-4 py-2 text-sm font-semibold text-bg hover:opacity-90"
        >
          Anwenden
        </button>
        <Link href={resetHref} className="text-sm underline underline-offset-2 hover:text-accent">
          Zurücksetzen
        </Link>
      </div>
    </Form>
  );
}
