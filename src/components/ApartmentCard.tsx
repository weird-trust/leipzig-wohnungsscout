import Link from "next/link";
import { FeatureList } from "@/components/FeatureList";
import { ScoreFigure } from "@/components/ScoreFigure";
import { FavoriteButton, StatusButtons } from "@/components/StatusControls";
import {
  formatDateTime,
  formatEuro,
  formatRooms,
  formatSqm,
  rentPerSqm,
  SOURCE_LABELS,
  STATUS_LABELS,
} from "@/lib/dashboard/display";
import type { ScoredApartment } from "@/lib/dashboard/sorting";

function Fact({ value, unknown }: { value: string | null; unknown: string }) {
  return value !== null ? (
    <span className="text-fg">{value}</span>
  ) : (
    <span className="text-faint italic">{unknown}</span>
  );
}

/**
 * One dashboard row. The title link stretches over the whole row (via
 * ::after), while the controls sit above it so they stay clickable.
 */
export function ApartmentCard({ item }: { item: ScoredApartment }) {
  const { apartment, score } = item;
  const perSqm = rentPerSqm(apartment);

  return (
    <article className="relative grid gap-x-6 gap-y-3 border-t border-line py-5 hover:bg-surface sm:grid-cols-[4rem_1fr_auto] sm:px-2">
      <ScoreFigure score={score.score} />

      <div className="min-w-0 space-y-2">
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <h2 className="text-lg leading-snug font-semibold">
            <Link
              href={`/apartments/${apartment.id}`}
              className="after:absolute after:inset-0 hover:underline"
            >
              {apartment.title}
            </Link>
          </h2>
          {apartment.status === "new" ? (
            <span className="text-xs font-bold tracking-wider text-accent uppercase">Neu</span>
          ) : (
            <span className="border border-line px-1.5 text-xs text-muted">
              {STATUS_LABELS[apartment.status]}
            </span>
          )}
        </div>

        <p className="flex flex-wrap gap-x-3 gap-y-0.5 text-sm tabular-nums">
          <Fact value={apartment.district} unknown="Stadtteil ?" />
          <Fact value={apartment.rooms !== null ? formatRooms(apartment.rooms) : null} unknown="? Zi." />
          <Fact value={apartment.sqm !== null ? formatSqm(apartment.sqm) : null} unknown="? m²" />
          <Fact
            value={apartment.rentWarm !== null ? `${formatEuro(apartment.rentWarm)} warm` : null}
            unknown="Warmmiete ?"
          />
          {perSqm && <span className="text-muted">{perSqm.text}</span>}
        </p>

        <FeatureList features={apartment} />

        <p className="text-xs text-muted">
          {SOURCE_LABELS[apartment.source]} · erstmals gesehen {formatDateTime(apartment.firstSeen)}
        </p>
      </div>

      <div className="relative z-10 flex flex-wrap items-start gap-2 sm:w-56 sm:flex-col sm:items-end">
        <FavoriteButton apartment={apartment} />
        <StatusButtons apartment={apartment} />
        {apartment.sourceUrl && (
          <a
            href={apartment.sourceUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs underline underline-offset-2 hover:text-accent"
          >
            Original-Inserat ↗
          </a>
        )}
      </div>
    </article>
  );
}
