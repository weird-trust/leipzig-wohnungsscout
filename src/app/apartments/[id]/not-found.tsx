import Link from "next/link";

export default function ApartmentNotFound() {
  return (
    <main className="pt-12">
      <h1 className="text-3xl font-bold tracking-tight">Wohnung nicht gefunden</h1>
      <p className="mt-3 text-muted">
        Diese Wohnung gibt es nicht (mehr), oder der Link ist unvollständig.
      </p>
      <Link href="/" className="mt-6 inline-block underline underline-offset-2 hover:text-accent">
        ← Zu allen Wohnungen
      </Link>
    </main>
  );
}
