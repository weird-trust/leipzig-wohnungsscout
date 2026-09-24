import type { Resend } from "resend";
import { z } from "zod";
import type { IncomingEmail } from "@/lib/domain/email";

/**
 * The only module that knows Resend's webhook and Receiving API formats.
 * Everything it returns is provider-independent.
 *
 * Flow: signed `email.received` webhook (metadata only, carries `email_id`)
 * → `emails.receiving.get(email_id)` for the full body → IncomingEmail.
 */

/** The part of the Resend SDK this adapter uses; a real `Resend` satisfies it. */
export interface ResendLike {
  webhooks: Pick<Resend["webhooks"], "verify">;
  emails: { receiving: Pick<Resend["emails"]["receiving"], "get"> };
}

export interface WebhookHeaders {
  id: string;
  timestamp: string;
  signature: string;
}

/** Resend signs webhooks with Svix-style headers. */
export function readWebhookHeaders(headers: Headers): WebhookHeaders | null {
  const id = headers.get("svix-id");
  const timestamp = headers.get("svix-timestamp");
  const signature = headers.get("svix-signature");
  return id && timestamp && signature ? { id, timestamp, signature } : null;
}

export type VerifyResult =
  | { ok: true; payload: unknown }
  | { ok: false; reason: "invalid_signature" | "malformed_payload" };

/**
 * Verifies the signature over the exact raw body with the official SDK
 * helper (which also rejects timestamps older than 5 minutes). The body must
 * not be parsed or re-serialized before this.
 */
export function verifyWebhook(
  resend: ResendLike,
  rawBody: string,
  headers: WebhookHeaders,
  webhookSecret: string,
): VerifyResult {
  try {
    const payload: unknown = resend.webhooks.verify({ payload: rawBody, headers, webhookSecret });
    return { ok: true, payload };
  } catch (error) {
    // A correct signature over a non-JSON body surfaces as a SyntaxError.
    return {
      ok: false,
      reason: error instanceof SyntaxError ? "malformed_payload" : "invalid_signature",
    };
  }
}

const eventSchema = z.object({ type: z.string().min(1), data: z.unknown() });
const receivedEventDataSchema = z.object({ email_id: z.string().min(1) });

export type WebhookEvent =
  | { kind: "email.received"; emailId: string }
  | { kind: "ignored"; type: string }
  | { kind: "invalid" };

/** Classifies a verified payload. Only `email.received` is processed. */
export function parseWebhookEvent(payload: unknown): WebhookEvent {
  const event = eventSchema.safeParse(payload);
  if (!event.success) return { kind: "invalid" };
  if (event.data.type !== "email.received") return { kind: "ignored", type: event.data.type };

  const data = receivedEventDataSchema.safeParse(event.data.data);
  return data.success ? { kind: "email.received", emailId: data.data.email_id } : { kind: "invalid" };
}

/** The Receiving API could not deliver the email; the webhook should be retried. */
export class ReceivingApiError extends Error {
  constructor(
    message: string,
    readonly statusCode: number | null,
  ) {
    super(message);
    this.name = "ReceivingApiError";
  }
}

/** Only the fields we use, checked at runtime rather than trusted from SDK types. */
const receivedEmailSchema = z.object({
  id: z.string().min(1),
  created_at: z.string().nullish(),
  from: z.string().nullish(),
  to: z.array(z.string()).nullish(),
  subject: z.string().nullish(),
  text: z.string().nullish(),
  html: z.string().nullish(),
});

function emptyToNull(value: string | null | undefined): string | null {
  return value === undefined || value === null || value.trim() === "" ? null : value;
}

/**
 * Accepts ISO timestamps and the Postgres style Resend sometimes uses
 * ("2026-09-24 08:00:00.123+00"). Returns null when unparseable.
 */
export function parseProviderTimestamp(value: string | null | undefined): Date | null {
  if (!value) return null;
  const iso = value.trim().replace(" ", "T").replace(/([+-]\d{2})$/, "$1:00");
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? null : date;
}

/**
 * Maps a Receiving API email to IncomingEmail. providerMessageId is Resend's
 * email_id (stable across webhook retries), not the RFC Message-ID.
 */
export function mapReceivedEmail(
  emailId: string,
  data: unknown,
  fallbackReceivedAt: Date,
): IncomingEmail {
  const parsed = receivedEmailSchema.safeParse(data);
  if (!parsed.success) {
    throw new ReceivingApiError("received email has an unexpected shape", null);
  }
  const email = parsed.data;
  if (email.id !== emailId) {
    throw new ReceivingApiError("received email id does not match the webhook", null);
  }

  return {
    providerMessageId: emailId,
    receivedAt: parseProviderTimestamp(email.created_at) ?? fallbackReceivedAt,
    from: emptyToNull(email.from),
    to: (email.to ?? []).filter((address) => address.trim() !== ""),
    subject: emptyToNull(email.subject),
    text: emptyToNull(email.text),
    html: emptyToNull(email.html),
  };
}

/**
 * Fetches the complete email. `html_format: "cid"` keeps inline images as
 * cid: references instead of embedding them as base64 data URIs, which keeps
 * stored HTML small; nothing renders it anyway.
 */
export async function fetchReceivedEmail(
  resend: ResendLike,
  emailId: string,
  fallbackReceivedAt: Date,
): Promise<IncomingEmail> {
  let response: Awaited<ReturnType<ResendLike["emails"]["receiving"]["get"]>>;
  try {
    response = await resend.emails.receiving.get(emailId, { html_format: "cid" });
  } catch (error) {
    throw new ReceivingApiError(
      `receiving.get threw: ${error instanceof Error ? error.name : "unknown error"}`,
      null,
    );
  }
  if (response.error) {
    throw new ReceivingApiError(
      `receiving.get failed: ${response.error.name}`,
      response.error.statusCode,
    );
  }
  return mapReceivedEmail(emailId, response.data, fallbackReceivedAt);
}
