import { createHmac } from "node:crypto";
import { Resend } from "resend";
import type { ResendLike } from "@/lib/ingest/resend";

/** Test helpers: real SDK verification, faked Receiving API. Test-only. */

export const TEST_WEBHOOK_SECRET = `whsec_${Buffer.from("wohnungsscout-test-secret").toString("base64")}`;

/** Signs a body like Resend does (Standard Webhooks HMAC-SHA256, svix-* headers). */
export function signedHeaders(
  body: string,
  options: { id?: string; timestamp?: number; secret?: string } = {},
): Record<string, string> {
  const id = options.id ?? "msg_test_1";
  const timestamp = options.timestamp ?? Math.floor(Date.now() / 1000);
  const key = Buffer.from((options.secret ?? TEST_WEBHOOK_SECRET).replace(/^whsec_/, ""), "base64");
  const signature = createHmac("sha256", key).update(`${id}.${timestamp}.${body}`).digest("base64");
  return {
    "svix-id": id,
    "svix-timestamp": String(timestamp),
    "svix-signature": `v1,${signature}`,
  };
}

export function receivedEvent(emailId: string, type = "email.received"): string {
  return JSON.stringify({
    type,
    created_at: "2026-09-24T08:00:01.000Z",
    data: {
      email_id: emailId,
      created_at: "2026-09-24T08:00:00.000Z",
      from: "Ich <ich@example.org>",
      to: ["wohnungen@inbound.example.com"],
      bcc: [],
      cc: [],
      received_for: ["wohnungen@inbound.example.com"],
      message_id: "<rfc-message-id@example.org>",
      subject: "Neue Wohnungen",
      attachments: [],
    },
  });
}

/** A Receiving API email in the shape the SDK returns. */
export function receivedEmail(id: string, overrides: Record<string, unknown> = {}) {
  return {
    object: "email",
    id,
    to: ["wohnungen@inbound.example.com"],
    from: "Ich <ich@example.org>",
    created_at: "2026-09-24 08:00:00.123+00",
    subject: "Fwd: Neue Wohnungen",
    bcc: null,
    cc: null,
    reply_to: null,
    received_for: ["wohnungen@inbound.example.com"],
    html: "<p>Neue Angebote</p>",
    text: "Neue Angebote",
    headers: {},
    message_id: "<rfc-message-id@example.org>",
    attachments: [],
    ...overrides,
  };
}

type Get = ResendLike["emails"]["receiving"]["get"];

/** Real `webhooks.verify` from the SDK, with a scripted `receiving.get`. */
export function testResend(get: (id: string) => Promise<unknown>): ResendLike & {
  getCalls: string[];
} {
  const real = new Resend("re_test_not_used");
  const getCalls: string[] = [];
  return {
    webhooks: real.webhooks,
    emails: {
      receiving: {
        get: (async (id: string) => {
          getCalls.push(id);
          return get(id);
        }) as unknown as Get,
      },
    },
    getCalls,
  };
}
