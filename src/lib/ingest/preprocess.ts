import type { IncomingEmail } from "@/lib/domain/email";
import { resolveImmoweltListingLinks, type ResolverOptions } from "@/lib/ingest/immoweltLinks";
import { detectSource } from "@/lib/sourceDetection";

/**
 * Prepares an email for the pure parsers. Runs for live ingestion and for
 * reprocessing alike (see pipeline.ts). Only Immowelt needs it: its listing
 * links are resolved to canonical expose URLs. The result is used for
 * parsing only; the stored raw email is never changed.
 */
export type EmailPreprocessor = (email: IncomingEmail) => Promise<IncomingEmail>;

export function createPreprocessor(options: ResolverOptions): EmailPreprocessor {
  return async (email) => {
    if (!email.text || detectSource(email).source !== "immowelt") return email;
    const { text, resolutions } = await resolveImmoweltListingLinks(email.text, options);
    return resolutions === 0 ? email : { ...email, text };
  };
}

/** Production preprocessing with the runtime's fetch. No-op (no request) without tracking links. */
export const defaultPreprocess: EmailPreprocessor = createPreprocessor({
  fetch: (input, init) => globalThis.fetch(input, init),
});
