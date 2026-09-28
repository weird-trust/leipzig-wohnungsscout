import type { IncomingEmail } from "@/lib/domain/email";
import { fetchResultsPage } from "@/lib/ingest/hildebrandResults";
import { resolveImmoweltListingLinks, type ResolverOptions } from "@/lib/ingest/immoweltLinks";
import { findResultsLink } from "@/lib/parsers/hildebrandPartner";
import { detectSource } from "@/lib/sourceDetection";

/**
 * Prepares an email for the pure parsers. Runs for live ingestion and for
 * reprocessing alike (see pipeline.ts). The result is used for parsing only;
 * the stored raw email is never changed.
 *
 * - Immowelt: listing links are resolved to canonical expose URLs.
 * - Hildebrand & Partner: the mail only links to its search results; that
 *   page is fetched and attached as `fetchedPage` (never stored). Without a
 *   valid "Suchergebnisse ansehen" link nothing is fetched, and the parser
 *   reports the email as failed (invalid link) or it stays unrecognized.
 *
 * Network failures throw (safe, token-free errors); the pipeline stores the
 * email as "failed" and the webhook answers 500 so the provider retries.
 */
export type EmailPreprocessor = (email: IncomingEmail) => Promise<IncomingEmail>;

export function createPreprocessor(options: ResolverOptions): EmailPreprocessor {
  return async (email) => {
    if (!email.text) return email;
    const { source } = detectSource(email);

    if (source === "immowelt") {
      const { text, resolutions } = await resolveImmoweltListingLinks(email.text, options);
      return resolutions === 0 ? email : { ...email, text };
    }

    if (source === "hildebrand-partner") {
      const link = findResultsLink(email.text);
      if (link.kind !== "valid") return email;
      const html = await fetchResultsPage(link.url, options);
      return { ...email, fetchedPage: { source: "hildebrand-partner", html } };
    }

    return email;
  };
}

/** Production preprocessing with the runtime's fetch. No request unless an email needs one. */
export const defaultPreprocess: EmailPreprocessor = createPreprocessor({
  fetch: (input, init) => globalThis.fetch(input, init),
});
