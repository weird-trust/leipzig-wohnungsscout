import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { FeatureList } from "@/components/FeatureList";
import { ScoreFigure } from "@/components/ScoreFigure";
import { FavoriteButton, StatusButtons } from "@/components/StatusControls";
import {
  formatAge,
  formatDateTime,
  formatEuro,
  formatEuroCents,
  formatFloor,
  formatRooms,
  formatSqm,
  paragraphs,
  rentPerSqm,
  SOURCE_LABELS,
  STATUS_LABELS,
} from "@/lib/dashboard/display";
import { getApartmentById } from "@/lib/db/apartments";
import { getDb } from "@/lib/db/client";
import { APARTMENT_STATUSES } from "@/lib/domain/apartment";
import { scoreApartment } from "@/lib/scoring";

const HEADING = "text-sm font-medium tracking-[0.14em] text-muted uppercase";

/** A primary fact: small label, large figure. Unknown is spelled out, quieter. */
function Fact({ label, value }: { label: string; value: string | null }) {
  return (
    <div className="border-t border-line pt-3">
      <dt className="text-sm text-muted">{label}</dt>
      <dd
        className={`mt-1 text-lg tracking-[-0.02em] tabular-nums ${
          value === null ? "text-faint" : ""
        }`}
      >
        {value ?? "unbekannt"}
      </dd>
    </div>
  );
}

/** Developer metadata: monospaced, small. */
function Meta({ label, value }: { label: string; value: string | null }) {
  return (
    <div className="grid grid-cols-[9rem_minmax(0,1fr)] gap-4 border-t border-line py-2">
      <dt className="text-faint">{label}</dt>
      <dd className={`break-all ${value === null ? "text-faint" : ""}`}>{value ?? "—"}</dd>
    </div>
  );
}

function Section({
  title,
  children,
  className = "",
}: {
  title: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={className}>
      <h2 className={`${HEADING} mb-5`}>{title}</h2>
      {children}
    </section>
  );
}

function formatPoints(points: number): string {
  return points > 0 ? `+${points}` : `−${Math.abs(points)}`;
}

export default async function ApartmentPage({ params }: PageProps<"/apartments/[id]">) {
  await connection();
  const { id } = await params;
  const apartment = await getApartmentById(getDb(), id);
  if (!apartment) notFound();

  const score = scoreApartment(apartment);
  const perSqm = rentPerSqm(apartment);
  const description = paragraphs(apartment.description);
  const now = new Date();

  return (
    <main>
      <Link href="/" className="text-sm text-muted transition-colors hover:text-fg">
        <span aria-hidden="true">← </span>Mauwscout Leipzig
      </Link>

      <header className="mt-12 grid gap-x-16 gap-y-8 sm:mt-16 lg:mt-20 lg:grid-cols-[minmax(0,1fr)_auto]">
        <div className="min-w-0">
          <p className={HEADING}>
            {apartment.district ?? <span className="text-faint">Stadtteil unbekannt</span>}
          </p>
          <h1 className="mt-3 max-w-4xl text-xl font-medium tracking-[-0.03em] text-balance">
            {apartment.title}
          </h1>
          <p className="mt-4 text-base text-muted">{apartment.address ?? "Adresse unbekannt"}</p>
          <p className="mt-6 flex flex-wrap items-center gap-x-6 gap-y-2 text-sm">
            <span className={apartment.status === "new" ? "font-medium text-accent" : "font-medium"}>
              <span className="sr-only">Status: </span>
              {STATUS_LABELS[apartment.status]}
            </span>
            <span className="text-faint">
              {SOURCE_LABELS[apartment.source]}
              <span aria-hidden="true"> · </span>
              <span className="sr-only">, erstmals gesehen </span>
              <time dateTime={apartment.firstSeen.toISOString()} title={formatDateTime(apartment.firstSeen)}>
                {formatAge(apartment.firstSeen, now)}
              </time>
            </span>
            {apartment.sourceUrl && (
              <a
                href={apartment.sourceUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="underline decoration-line underline-offset-4 transition-colors hover:decoration-fg"
              >
                Original-Inserat <span aria-hidden="true">↗</span>
                <span className="sr-only">(öffnet in neuem Tab)</span>
              </a>
            )}
          </p>
        </div>
        <div className="lg:text-right">
          <h2 className="sr-only">Score</h2>
          <div className="inline-block">
            <ScoreFigure score={score.score} />
          </div>
        </div>
      </header>

      <dl className="mt-14 grid grid-cols-2 gap-x-6 gap-y-8 sm:mt-20 sm:grid-cols-3 lg:grid-cols-6">
        <Fact label="Zimmer" value={apartment.rooms !== null ? formatRooms(apartment.rooms) : null} />
        <Fact label="Fläche" value={apartment.sqm !== null ? formatSqm(apartment.sqm) : null} />
        <Fact label="Kaltmiete" value={apartment.rentCold !== null ? formatEuro(apartment.rentCold) : null} />
        <Fact label="Warmmiete" value={apartment.rentWarm !== null ? formatEuro(apartment.rentWarm) : null} />
        <Fact
          label={perSqm ? `pro m² (${perSqm.basis})` : "pro m²"}
          value={perSqm ? formatEuroCents(perSqm.value) : null}
        />
        <Fact label="Etage" value={apartment.floor !== null ? formatFloor(apartment.floor) : null} />
      </dl>

      <div className="mt-16 grid gap-16 sm:mt-24 lg:grid-cols-[minmax(0,1fr)_20rem] lg:gap-24 xl:grid-cols-[minmax(0,1fr)_22rem]">
        <Section title="Beschreibung" className="min-w-0">
          {description.length > 0 ? (
            <div className="max-w-[65ch] space-y-5 text-base leading-relaxed">
              {description.map((paragraph, index) => (
                // Plain text only; line breaks inside a paragraph are kept.
                <p key={index} className="whitespace-pre-line">
                  {paragraph}
                </p>
              ))}
            </div>
          ) : (
            <p className="text-faint">Keine Beschreibung vorhanden.</p>
          )}
        </Section>

        <div className="space-y-14">
          <Section title="Merkmale">
            <FeatureList features={apartment} verbose />
          </Section>

          <Section title="Score im Detail">
            {score.breakdown.length > 0 ? (
              <table className="w-full text-sm tabular-nums">
                <caption className="sr-only">Zusammensetzung des Scores</caption>
                <tbody>
                  {score.breakdown.map((item) => (
                    <tr key={item.rule} className="border-t border-line">
                      <td
                        className={`w-12 py-2 pr-4 text-right font-mono ${
                          item.points < 0 ? "text-muted" : ""
                        }`}
                      >
                        {formatPoints(item.points)}
                      </td>
                      <td className="py-2">{item.label}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <p className="text-sm text-faint">Keine bewertbaren Angaben.</p>
            )}
            {score.rawScore !== score.score && (
              <p className="mt-3 text-sm text-muted">
                Rohwert {score.rawScore}, begrenzt auf {score.score}.
              </p>
            )}
          </Section>

          <Section title="Status">
            <div className="space-y-5">
              <FavoriteButton apartment={apartment} withLabel />
              <StatusButtons apartment={apartment} statuses={APARTMENT_STATUSES} />
            </div>
          </Section>
        </div>
      </div>

      <details className="group mt-24 border-t border-line pt-4 text-sm">
        <summary className="-m-1.5 inline-flex rounded-[4px] p-1.5 text-faint transition-colors hover:text-fg">
          Technische Details
        </summary>
        <dl className="mt-4 max-w-3xl font-mono text-sm">
          <Meta label="Wohnungs-ID" value={apartment.id} />
          <Meta label="Quell-ID" value={apartment.sourceId} />
          <Meta label="Fingerprint" value={apartment.fingerprint} />
          <Meta label="E-Mail-ID" value={apartment.emailId} />
          <Meta label="Erstmals gesehen" value={apartment.firstSeen.toISOString()} />
          <Meta label="Letzte Alert-E-Mail" value={apartment.emailReceivedAt?.toISOString() ?? null} />
        </dl>
      </details>
    </main>
  );
}
