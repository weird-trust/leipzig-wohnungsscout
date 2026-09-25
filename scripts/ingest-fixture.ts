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
 * never printed. The same fixture always gets the same provider id, so
 * re-running a non-dry run is a duplicate unless the fixture sets its own
 * providerMessageId.
 */
import { readFile } from "node:fs/promises";
import { getDb } from "@/lib/db/client";
import { fixtureFileSchema, fixtureToIncomingEmail } from "@/lib/ingest/fixtureFile";
import { findListingTrackingLinks } from "@/lib/ingest/immoweltLinks";
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
  const path = args.find((arg) => !arg.startsWith("--"));
  if (!path) throw new Error("Usage: npm run ingest:fixture -- <file.json> [--dry-run] [--allow-network]");

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
    let networkRequests = 0;
    const preprocess = createPreprocessor({
      fetch: (input, init) => {
        networkRequests++;
        return globalThis.fetch(input, init);
      },
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
