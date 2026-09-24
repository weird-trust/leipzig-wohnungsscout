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
    <main role="alert">
      <h1 className="max-w-3xl text-xl font-medium tracking-[-0.03em]">Daten konnten nicht geladen werden</h1>
      <p className="mt-6 max-w-prose text-base text-muted">
        Die Datenbank ist gerade nicht erreichbar oder nicht konfiguriert. Die Wohnungsliste
        wird deshalb nicht angezeigt.
      </p>
      {error.digest && (
        <p className="mt-2 font-mono text-sm text-faint">Fehler-ID: {error.digest}</p>
      )}
      <button
        type="button"
        onClick={() => retry()}
        className="mt-10 rounded-[6px] bg-fg px-5 py-2 text-sm font-medium text-bg transition-opacity hover:opacity-85"
      >
        Erneut versuchen
      </button>
    </main>
  );
}
