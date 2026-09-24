/**
 * Runs an email fixture through the real ingestion pipeline.
 *
 *   npm run ingest:fixture -- <file.json>            store in the configured Supabase
 *   npm run ingest:fixture -- <file.json> --dry-run  no database: show detected
 *                                                    source, parse result and
 *                                                    normalized apartments
 *
 * The same fixture always gets the same provider id, so re-running it is a
 * duplicate unless the fixture sets its own providerMessageId.
 */
import { readFile } from "node:fs/promises";
import { getDb } from "@/lib/db/client";
import { fixtureFileSchema, fixtureToIncomingEmail } from "@/lib/ingest/fixtureFile";
import { toNewApartment } from "@/lib/ingest/normalize";
import { processIncomingEmail } from "@/lib/ingest/pipeline";
import { supabaseIngestionStore } from "@/lib/ingest/store";
import { parseEmail } from "@/lib/parsers";
import { detectSource } from "@/lib/sourceDetection";

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const dryRun = args.includes("--dry-run");
  const path = args.find((arg) => !arg.startsWith("--"));
  if (!path) throw new Error("Usage: npm run ingest:fixture -- <file.json> [--dry-run]");

  const fixture = fixtureFileSchema.parse(JSON.parse(await readFile(path, "utf-8")));
  const email = fixtureToIncomingEmail(fixture, new Date());

  if (dryRun) {
    const outcome = parseEmail(email);
    console.log(
      JSON.stringify(
        {
          providerMessageId: email.providerMessageId,
          detected: detectSource(email),
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
