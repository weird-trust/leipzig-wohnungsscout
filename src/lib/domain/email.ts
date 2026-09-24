import type { Source } from "@/lib/domain/apartment";

/**
 * Provider-independent inbound email. The Resend adapter maps its payload to
 * this shape; nothing downstream knows about Resend.
 */
export interface IncomingEmail {
  /** The provider's id for this email (Resend: email_id). Idempotency key. */
  providerMessageId: string;
  receivedAt: Date;
  from: string | null;
  to: string[];
  subject: string | null;
  text: string | null;
  html: string | null;
}

/** "pending" until the parse result has been stored. */
export const EMAIL_PARSE_STATUSES = [
  "pending",
  "parsed",
  "unrecognized",
  "failed",
] as const;
export type EmailParseStatus = (typeof EMAIL_PARSE_STATUSES)[number];

/** An inbound email as stored, raw content kept for debugging parsers. */
export interface StoredEmail extends IncomingEmail {
  id: string;
  detectedSource: Source;
  parserVersion: string | null;
  parseStatus: EmailParseStatus;
  parseError: string | null;
}

/** Outcome of processing an email, as stored on it. */
export interface EmailParseResult {
  parseStatus: Exclude<EmailParseStatus, "pending">;
  parserVersion: string | null;
  parseError: string | null;
}

export interface NewInboundEmail extends IncomingEmail {
  detectedSource: Source;
}
