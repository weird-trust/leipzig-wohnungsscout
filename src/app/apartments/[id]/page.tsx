import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { FeatureList } from "@/components/FeatureList";
import { ScoreFigure } from "@/components/ScoreFigure";
import { FavoriteButton, StatusButtons } from "@/components/StatusControls";
import {
  formatDateTime,
  formatEuro,
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

function Term({ label, value }: { label: string; value: string | null }) {
  return (
    <div className="border-t border-line py-2">
      <dt className="text-xs tracking-wide text-muted uppercase">{label}</dt>
      <dd className={`mt-0.5 tabular-nums ${value === null ? "text-faint italic" : ""}`}>
        {value ?? "unbekannt"}
      </dd>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-3">
      <h2 className="text-xs font-bold tracking-[0.12em] uppercase">{title}</h2>
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
  const location = [apartment.district, apartment.address].filter(Boolean).join(" · ");

  return (
    <main className="pt-6">
      <Link href="/" className="text-sm text-muted hover:text-fg hover:underline">
        ← Alle Wohnungen
      </Link>

      <header className="mt-4 space-y-2">
        <p className="text-sm">
          <span className="font-semibold">{STATUS_LABELS[apartment.status]}</span>
          {apartment.isFavorite && <span className="text-muted"> · ★ Favorit</span>}
        </p>
        <h1 className="max-w-3xl text-3xl leading-tight font-bold tracking-tight sm:text-4xl">
          {apartment.title}
        </h1>
        <p className="text-muted">{location || "Lage unbekannt"}</p>
      </header>

      <div className="mt-8 grid gap-10 lg:grid-cols-[1fr_18rem]">
        <div className="min-w-0 space-y-10">
          <Section title="Eckdaten">
            <dl className="grid grid-cols-2 gap-x-6 sm:grid-cols-3">
              <Term label="Zimmer" value={apartment.rooms !== null ? formatRooms(apartment.rooms) : null} />
              <Term label="Fläche" value={apartment.sqm !== null ? formatSqm(apartment.sqm) : null} />
              <Term label="Etage" value={apartment.floor !== null ? formatFloor(apartment.floor) : null} />
              <Term label="Kaltmiete" value={apartment.rentCold !== null ? formatEuro(apartment.rentCold) : null} />
              <Term label="Warmmiete" value={apartment.rentWarm !== null ? formatEuro(apartment.rentWarm) : null} />
              <Term label="Miete pro m²" value={perSqm?.text ?? null} />
              <Term label="Quelle" value={SOURCE_LABELS[apartment.source]} />
              <Term label="Erstmals gesehen" value={formatDateTime(apartment.firstSeen)} />
            </dl>
            {apartment.sourceUrl && (
              <a
                href={apartment.sourceUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-block text-sm underline underline-offset-2 hover:text-accent"
              >
                Original-Inserat öffnen ↗
              </a>
            )}
          </Section>

          <Section title="Merkmale">
            <FeatureList features={apartment} verbose />
          </Section>

          <Section title="Beschreibung">
            {description.length > 0 ? (
              <div className="max-w-prose space-y-3 leading-relaxed">
                {description.map((paragraph, index) => (
                  // Plain text only; line breaks inside a paragraph are kept.
                  <p key={index} className="whitespace-pre-line">
                    {paragraph}
                  </p>
                ))}
              </div>
            ) : (
              <p className="text-faint italic">Keine Beschreibung vorhanden.</p>
            )}
          </Section>

          <details className="border-t border-line pt-3 text-sm">
            <summary className="cursor-pointer text-muted hover:text-fg">Technische Details</summary>
            <dl className="mt-3 grid gap-x-6 font-mono text-xs sm:grid-cols-2">
              <Term label="Wohnungs-ID" value={apartment.id} />
              <Term label="Quell-ID" value={apartment.sourceId} />
              <Term label="Fingerprint" value={apartment.fingerprint} />
              <Term label="E-Mail-ID" value={apartment.emailId} />
              <Term label="Erstmals gesehen" value={apartment.firstSeen.toISOString()} />
              <Term
                label="Letzte Alert-E-Mail"
                value={apartment.emailReceivedAt?.toISOString() ?? null}
              />
            </dl>
          </details>
        </div>

        <aside className="space-y-10">
          <Section title="Score">
            <ScoreFigure score={score.score} size="lg" />
            {score.breakdown.length > 0 ? (
              <table className="w-full text-sm tabular-nums">
                <caption className="sr-only">Zusammensetzung des Scores</caption>
                <tbody>
                  {score.breakdown.map((item) => (
                    <tr key={item.rule} className="border-t border-line">
                      <td
                        className={`w-12 py-1.5 pr-3 text-right font-semibold ${
                          item.points < 0 ? "text-accent" : ""
                        }`}
                      >
                        {formatPoints(item.points)}
                      </td>
                      <td className="py-1.5">{item.label}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <p className="text-sm text-faint italic">Keine bewertbaren Angaben.</p>
            )}
            {score.rawScore !== score.score && (
              <p className="text-xs text-muted">
                Rohwert {score.rawScore}, begrenzt auf {score.score}.
              </p>
            )}
          </Section>

          <Section title="Status">
            <FavoriteButton apartment={apartment} />
            <StatusButtons apartment={apartment} statuses={APARTMENT_STATUSES} />
          </Section>
        </aside>
      </div>
    </main>
  );
}
