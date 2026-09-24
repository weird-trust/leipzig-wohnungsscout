import Link from "next/link";

export default function ApartmentNotFound() {
  return (
    <main>
      <h1 className="text-xl font-medium tracking-[-0.03em]">Wohnung nicht gefunden</h1>
      <p className="mt-6 text-base text-muted">
        Diese Wohnung gibt es nicht (mehr), oder der Link ist unvollständig.
      </p>
      <Link href="/" className="mt-10 inline-block underline decoration-line underline-offset-4 transition-colors hover:decoration-fg">
        ← Zu allen Wohnungen
      </Link>
    </main>
  );
}
