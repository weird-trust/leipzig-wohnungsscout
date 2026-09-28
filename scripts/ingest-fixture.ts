/**
 * Runs an email fixture through the real ingestion pipeline.
 *
 *   npm run ingest:fixture -- <file.json>            store in the configured Supabase
 *   npm run ingest:fixture -- <file.json> --dry-run  no database: show detected
 *                                                    source, preprocessing, parse
 *                                                    result and normalized apartments
 *
 * The dry run applies the same preprocessing as ingestion (Immowelt link
 * resolution) but is offline by default: a fixture that still contains
 * tracking links fails unless --allow-network is given. Tracking URLs are
 * never printed.
 *
 * --debug-network (development only; requires --dry-run and --allow-network)
 * prints one sanitized line per redirect hop to stderr: listing and hop
 * number, known host, path class (/, /wl-cdp/*, /expose/*, /other) and HTTP
 * status, plus the Location's sanitized destination. Never tokens, ids,
 * query strings, fragments, raw Location headers or email content.
 *
 * --page=<file.html> (dry run only) serves that reviewed page fixture instead
 * of fetching a Hildebrand & Partner results page, so the whole email → page
 * → apartments path runs offline:
 *
 *   npm run ingest:fixture -- fixtures/emails/hildebrand-partner/alert-01.json \
 *     --dry-run --page=fixtures/pages/hildebrand-partner/search-results-01.html
 *
 * The same fixture always gets the same provider id, so
 * re-running a non-dry run is a duplicate unless the fixture sets its own
 * providerMessageId.
 */
import { readFile } from "node:fs/promises";
import { getDb } from "@/lib/db/client";
import { fixtureFileSchema, fixtureToIncomingEmail } from "@/lib/ingest/fixtureFile";
import { findListingTrackingLinks, formatHopDiagnostic } from "@/lib/ingest/immoweltLinks";
import { findResultsLink } from "@/lib/parsers/hildebrandPartner";
import { toNewApartment } from "@/lib/ingest/normalize";
import { processIncomingEmail } from "@/lib/ingest/pipeline";
import { createPreprocessor } from "@/lib/ingest/preprocess";
import { supabaseIngestionStore } from "@/lib/ingest/store";
import { parseEmail } from "@/lib/parsers";
import { detectSource } from "@/lib/sourceDetection";

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const dryRun = args.includes("--dry-run");
  const allowNetwork = args.includes("--allow-network");
  const debugNetwork = args.includes("--debug-network");
  const pagePath = args.find((arg) => arg.startsWith("--page="))?.slice("--page=".length);
  const path = args.find((arg) => !arg.startsWith("--"));
  if (!path) {
    throw new Error(
      "Usage: npm run ingest:fixture -- <file.json> [--dry-run] [--allow-network] [--debug-network] [--page=<file.html>]",
    );
  }
  if (pagePath !== undefined && (!dryRun || allowNetwork || pagePath === "")) {
    throw new Error("--page=<file.html> requires --dry-run and cannot be combined with --allow-network.");
  }
  if (debugNetwork && (!dryRun || !allowNetwork)) {
    throw new Error("--debug-network requires --dry-run and --allow-network.");
  }
  if (debugNetwork && process.env.NODE_ENV === "production") {
    throw new Error("--debug-network is for development only.");
  }

  const fixture = fixtureFileSchema.parse(JSON.parse(await readFile(path, "utf-8")));
  const email = fixtureToIncomingEmail(fixture, new Date());

  if (dryRun) {
    const pending = email.text ? findListingTrackingLinks(email.text).length : 0;
    if (pending > 0 && !allowNetwork) {
      throw new Error(
        `This email has ${pending} unresolved Immowelt listing link(s). ` +
          "Re-run with --allow-network to resolve them (makes real HTTP requests).",
      );
    }
    const resultsLink = detectSource(email).source === "hildebrand-partner" ? findResultsLink(email.text) : null;
    if (resultsLink?.kind === "valid" && !allowNetwork && pagePath === undefined) {
      throw new Error(
        "This email links to a Hildebrand & Partner results page. Re-run with " +
          "--page=<file.html> to use a page fixture, or --allow-network to fetch it (real HTTP request).",
      );
    }
    const page = pagePath === undefined ? null : await readFile(pagePath, "utf-8");
    let networkRequests = 0;
    const preprocess = createPreprocessor({
      fetch: (input, init) => {
        if (page !== null) {
          // Offline: the page fixture answers the (validated) results request.
          return Promise.resolve(new Response(page, { headers: { "content-type": "text/html; charset=UTF-8" } }));
        }
        networkRequests++;
        return globalThis.fetch(input, init);
      },
      // Sanitized by the resolver; printed as it happens, so it survives a failure.
      onHop: debugNetwork ? (hop) => formatHopDiagnostic(hop).forEach((line) => console.error(line)) : undefined,
    });
    const prepared = await preprocess(email);
    const outcome = parseEmail(prepared);
    console.log(
      JSON.stringify(
        {
          providerMessageId: email.providerMessageId,
          detected: detectSource(email),
          networkRequests,
          parseStatus: outcome.status,
          parserVersion: outcome.parserVersion,
          failures: outcome.failures,
          apartments: outcome.apartments.map((parsed) => toNewApartment(parsed, "dry-run")),
        },
        null,
        2,
      ),
    );
    return;
  }

  const result = await processIncomingEmail(email, supabaseIngestionStore(getDb()));
  console.log(JSON.stringify(result, null, 2));
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
