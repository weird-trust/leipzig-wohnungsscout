/**
 * Saves a real received email from Resend as a fixture, for building a
 * platform parser against it:
 *
 *   npm run capture:email -- <resend-email-id> <platform>
 *
 * Writes fixtures/emails/<platform>/<email-id>.json and never overwrites.
 * Captured alerts contain personal data (your address, maybe your name):
 * review and redact before committing.
 */
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { SOURCES, type Source } from "@/lib/domain/apartment";
import { readResendEnv } from "@/lib/ingest/env";
import { incomingEmailToFixture } from "@/lib/ingest/fixtureFile";
import { fetchReceivedEmail } from "@/lib/ingest/resend";
import { getResend } from "@/lib/ingest/resendClient";

async function main(): Promise<void> {
  const [emailId, platform] = process.argv.slice(2);
  if (!emailId || !platform || !(SOURCES as readonly string[]).includes(platform)) {
    throw new Error(
      `Usage: npm run capture:email -- <resend-email-id> <${SOURCES.join("|")}>`,
    );
  }

  const config = readResendEnv();
  const email = await fetchReceivedEmail(getResend(config), emailId, new Date());

  const dir = join("fixtures", "emails", platform as Source);
  await mkdir(dir, { recursive: true });
  const file = join(dir, `${emailId.replace(/[^A-Za-z0-9_-]/g, "_")}.json`);
  await writeFile(file, `${JSON.stringify(incomingEmailToFixture(email), null, 2)}\n`, {
    flag: "wx",
  });
  console.log(`Saved ${file}. Review and redact personal data before committing.`);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
