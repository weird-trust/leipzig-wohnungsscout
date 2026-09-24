/**
 * Re-runs one stored inbound email through the CURRENT source detection and
 * parser registry, using the raw content already in Supabase:
 *
 *   npm run reprocess:email -- <provider_message_id>
 *
 * Never calls Resend and never changes the stored raw email. Updates the
 * email's detected source, parser version, status and error, and upserts or
 * inserts apartments with the normal semantics (safe to run repeatedly).
 * Exits non-zero when the email is missing or processing fails.
 */
import { getDb } from "@/lib/db/client";
import { reprocessStoredEmail } from "@/lib/ingest/pipeline";
import { supabaseIngestionStore } from "@/lib/ingest/store";

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  if (args.length !== 1 || args[0].trim() === "" || args[0].startsWith("-")) {
    throw new Error("Usage: npm run reprocess:email -- <provider_message_id>");
  }

  const result = await reprocessStoredEmail(args[0].trim(), supabaseIngestionStore(getDb()));

  console.log(`source:         ${result.detectedSource}`);
  console.log(`parser version: ${result.parserVersion}`);
  console.log(`parse status:   ${result.parseStatus}`);
  console.log(`apartments:     ${result.apartments}`);

  if (result.parseStatus === "failed") {
    console.error("Parsing failed; see emails.parse_error for details.");
    process.exitCode = 1;
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
