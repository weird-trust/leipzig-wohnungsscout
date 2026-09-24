/**
 * Saves a real received email from Resend, untouched, as a PRIVATE capture:
 *
 *   npm run capture:email -- <resend-email-id> <platform>
 *
 * Writes fixtures/private/emails/<platform>/<email-id>.json (ignored by git)
 * and never overwrites an existing capture. Raw captures contain personal
 * data and tracking URLs. A reviewed, redacted copy goes to
 * fixtures/emails/<platform>/ by hand; only that one is committed and tested.
 */
import { access, mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { SOURCES, type Source } from "@/lib/domain/apartment";
import { readResendEnv } from "@/lib/ingest/env";
import { incomingEmailToFixture } from "@/lib/ingest/fixtureFile";
import { fetchReceivedEmail } from "@/lib/ingest/resend";
import { getResend } from "@/lib/ingest/resendClient";

async function exists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

async function main(): Promise<void> {
  const [emailId, platform] = process.argv.slice(2);
  if (!emailId || !platform || !(SOURCES as readonly string[]).includes(platform)) {
    throw new Error(
      `Usage: npm run capture:email -- <resend-email-id> <${SOURCES.join("|")}>`,
    );
  }

  const dir = join("fixtures", "private", "emails", platform as Source);
  const file = join(dir, `${emailId.replace(/[^A-Za-z0-9_-]/g, "_")}.json`);
  if (await exists(file)) {
    throw new Error(`${file} already exists; captures are never overwritten.`);
  }

  const config = readResendEnv();
  const email = await fetchReceivedEmail(getResend(config), emailId, new Date());

  await mkdir(dir, { recursive: true });
  // "wx" fails if the file appeared meanwhile: still never overwrites.
  await writeFile(file, `${JSON.stringify(incomingEmailToFixture(email), null, 2)}\n`, {
    flag: "wx",
  });
  console.log(
    `Saved private capture ${file} (not committed). ` +
      `Put a reviewed, redacted copy in fixtures/emails/${platform}/ for tests.`,
  );
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
