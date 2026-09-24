"use client";

/**
 * Shown when loading data fails (e.g. database unreachable), so a failure
 * never looks like "zero apartments". Server error details are not sent to
 * the browser in production; the digest matches the server log.
 */
export default function DashboardError({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  return (
    <main className="pt-12" role="alert">
      <h1 className="text-3xl font-bold tracking-tight">Daten konnten nicht geladen werden</h1>
      <p className="mt-3 max-w-prose text-muted">
        Die Datenbank ist gerade nicht erreichbar oder nicht konfiguriert. Die Wohnungsliste
        wird deshalb nicht angezeigt.
      </p>
      {error.digest && (
        <p className="mt-2 font-mono text-xs text-faint">Fehler-ID: {error.digest}</p>
      )}
      <button
        type="button"
        onClick={() => retry()}
        className="mt-6 bg-fg px-4 py-2 text-sm font-semibold text-bg hover:opacity-90"
      >
        Erneut versuchen
      </button>
    </main>
  );
}
