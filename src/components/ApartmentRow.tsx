import Link from "next/link";
import { FeatureList } from "@/components/FeatureList";
import { ScoreFigure } from "@/components/ScoreFigure";
import { FavoriteButton, StatusMenu } from "@/components/StatusControls";
import {
  formatAge,
  formatDateTime,
  formatRooms,
  formatSqm,
  primaryRent,
  rentPerSqm,
  SOURCE_LABELS,
} from "@/lib/dashboard/display";
import type { ScoredApartment } from "@/lib/dashboard/sorting";

function Fact({ value, unknown }: { value: string | null; unknown: string }) {
  return value !== null ? (
    <span>{value}</span>
  ) : (
    <span className="text-faint">{unknown}</span>
  );
}

/**
 * One dashboard row on the `.listing` grid (see globals.css). The title
 * link stretches over the whole row (via ::after), while the controls sit
 * above it so they stay clickable.
 */
export function ApartmentRow({ item, now }: { item: ScoredApartment; now: Date }) {
  const { apartment, score } = item;
  const rent = primaryRent(apartment);
  const perSqm = rentPerSqm(apartment);

  return (
    <article className="listing group/row relative border-t border-line py-8 sm:py-10">
      <div className="min-w-0 [grid-area:head]">
        <p className="text-sm font-medium tracking-[0.14em] text-muted uppercase">
          {apartment.district ?? <span className="text-faint">Stadtteil unbekannt</span>}
        </p>
        <h2 className="mt-2 text-lg font-medium tracking-[-0.015em] text-balance">
          <Link
            href={`/apartments/${apartment.id}`}
            className="decoration-1 underline-offset-[0.2em] after:absolute after:inset-0 group-hover/row:underline"
          >
            {apartment.title}
          </Link>
        </h2>
        {apartment.address && <p className="mt-2 text-sm text-muted">{apartment.address}</p>}
      </div>

      <div className="[grid-area:score] max-sm:pt-5">
        <ScoreFigure score={score.score} />
      </div>

      <p className="mt-5 flex flex-wrap items-baseline gap-x-4 gap-y-1 text-base tabular-nums [grid-area:facts] lg:mt-6 lg:flex-col lg:items-start lg:gap-y-0.5">
        <Fact value={apartment.rooms !== null ? formatRooms(apartment.rooms) : null} unknown="? Zi." />
        <Fact value={apartment.sqm !== null ? formatSqm(apartment.sqm) : null} unknown="? m²" />
        <Fact value={rent?.text ?? null} unknown="Miete ?" />
        {perSqm && <span className="text-sm text-muted lg:mt-1">{perSqm.text}</span>}
      </p>

      <div className="mt-4 [grid-area:features] lg:mt-6">
        <FeatureList features={apartment} />
      </div>

      <div className="mt-6 flex flex-wrap items-center gap-x-6 gap-y-3 text-sm [grid-area:meta] lg:mt-6">
        <p className="text-faint">
          {SOURCE_LABELS[apartment.source]}
          <span aria-hidden="true"> · </span>
          <span className="sr-only">, erstmals gesehen </span>
          <time dateTime={apartment.firstSeen.toISOString()} title={formatDateTime(apartment.firstSeen)}>
            {formatAge(apartment.firstSeen, now)}
          </time>
        </p>
        <div className="relative z-10 ml-auto flex items-center gap-x-6">
          <StatusMenu apartment={apartment} />
          <FavoriteButton apartment={apartment} />
          {apartment.sourceUrl && (
            <a
              href={apartment.sourceUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-muted transition-colors hover:text-fg"
            >
              Inserat <span aria-hidden="true">↗</span>
              <span className="sr-only">(öffnet in neuem Tab)</span>
            </a>
          )}
        </div>
      </div>
    </article>
  );
}
