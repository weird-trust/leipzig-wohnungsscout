import { createHash } from "node:crypto";
import { z } from "zod";
import type { IncomingEmail } from "@/lib/domain/email";

/**
 * JSON file format for email fixtures: fixtures/emails/<platform>/ (real,
 * captured with `npm run capture:email`) and fixtures/synthetic/emails/.
 */
export const fixtureFileSchema = z.object({
  /** Real captures keep Resend's email_id; otherwise derived from the content. */
  providerMessageId: z.string().min(1).optional(),
  receivedAt: z.iso.datetime({ offset: true }).optional(),
  from: z.string().nullable(),
  to: z.array(z.string()).default([]),
  subject: z.string().nullable(),
  text: z.string().nullable(),
  html: z.string().nullable(),
});
export type FixtureFile = z.infer<typeof fixtureFileSchema>;

export function fixtureToIncomingEmail(fixture: FixtureFile, fallbackReceivedAt: Date): IncomingEmail {
  const contentHash = createHash("sha256")
    .update(JSON.stringify([fixture.from, fixture.subject, fixture.text, fixture.html]))
    .digest("hex")
    .slice(0, 16);
  return {
    // Deterministic, so ingesting the same fixture twice is a duplicate.
    providerMessageId: fixture.providerMessageId ?? `fixture:${contentHash}`,
    receivedAt: fixture.receivedAt ? new Date(fixture.receivedAt) : fallbackReceivedAt,
    from: fixture.from,
    to: fixture.to,
    subject: fixture.subject,
    text: fixture.text,
    html: fixture.html,
  };
}

export function incomingEmailToFixture(email: IncomingEmail): FixtureFile {
  return {
    providerMessageId: email.providerMessageId,
    receivedAt: email.receivedAt.toISOString(),
    from: email.from,
    to: email.to,
    subject: email.subject,
    text: email.text,
    html: email.html,
  };
}
