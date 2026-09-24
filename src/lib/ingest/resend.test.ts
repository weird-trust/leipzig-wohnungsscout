import { describe, expect, it } from "vitest";
import {
  fetchReceivedEmail,
  mapReceivedEmail,
  parseProviderTimestamp,
  parseWebhookEvent,
  readWebhookHeaders,
  ReceivingApiError,
  verifyWebhook,
} from "@/lib/ingest/resend";
import {
  receivedEmail,
  receivedEvent,
  signedHeaders,
  TEST_WEBHOOK_SECRET,
  testResend,
} from "@/lib/ingest/testing/resend";

const FALLBACK = new Date("2026-09-24T09:00:00Z");
const resend = testResend(async () => ({ data: null, error: null, headers: null }));

function headersFor(body: string, options?: Parameters<typeof signedHeaders>[1]) {
  const headers = readWebhookHeaders(new Headers(signedHeaders(body, options)));
  if (!headers) throw new Error("headers missing");
  return headers;
}

describe("readWebhookHeaders", () => {
  it("reads the svix headers", () => {
    expect(readWebhookHeaders(new Headers({ "svix-id": "a", "svix-timestamp": "1", "svix-signature": "v1,x" })))
      .toEqual({ id: "a", timestamp: "1", signature: "v1,x" });
  });

  it("returns null when any header is missing", () => {
    expect(readWebhookHeaders(new Headers({ "svix-id": "a", "svix-timestamp": "1" }))).toBeNull();
    expect(readWebhookHeaders(new Headers())).toBeNull();
  });
});

describe("verifyWebhook (real SDK verification)", () => {
  const body = receivedEvent("email_1");

  it("accepts a correctly signed raw body and returns the parsed payload", () => {
    const result = verifyWebhook(resend, body, headersFor(body), TEST_WEBHOOK_SECRET);
    expect(result.ok).toBe(true);
    expect(result.ok && parseWebhookEvent(result.payload)).toEqual({
      kind: "email.received",
      emailId: "email_1",
    });
  });

  it("rejects a body changed after signing, even by whitespace", () => {
    const reformatted = JSON.stringify(JSON.parse(body), null, 2);
    expect(verifyWebhook(resend, reformatted, headersFor(body), TEST_WEBHOOK_SECRET)).toEqual({
      ok: false,
      reason: "invalid_signature",
    });
  });

  it("rejects a signature made with another secret", () => {
    const other = `whsec_${Buffer.from("someone-else").toString("base64")}`;
    expect(verifyWebhook(resend, body, headersFor(body, { secret: other }), TEST_WEBHOOK_SECRET).ok).toBe(
      false,
    );
  });

  it("rejects replayed webhooks older than the tolerance", () => {
    const old = Math.floor(Date.now() / 1000) - 10 * 60;
    expect(verifyWebhook(resend, body, headersFor(body, { timestamp: old }), TEST_WEBHOOK_SECRET).ok).toBe(
      false,
    );
  });

  it("reports a correctly signed non-JSON body as malformed", () => {
    expect(verifyWebhook(resend, "not json", headersFor("not json"), TEST_WEBHOOK_SECRET)).toEqual({
      ok: false,
      reason: "malformed_payload",
    });
  });
});

describe("parseWebhookEvent", () => {
  it("ignores other event types", () => {
    expect(parseWebhookEvent({ type: "email.delivered", data: {} })).toEqual({
      kind: "ignored",
      type: "email.delivered",
    });
  });

  it.each([
    ["no type", { data: {} }],
    ["received without email_id", { type: "email.received", data: {} }],
    ["received with empty email_id", { type: "email.received", data: { email_id: "" } }],
    ["not an object", "email.received"],
  ])("rejects %s", (_, payload) => {
    expect(parseWebhookEvent(payload)).toEqual({ kind: "invalid" });
  });
});

describe("mapReceivedEmail", () => {
  it("maps text + HTML and uses the Resend email_id as provider id", () => {
    expect(mapReceivedEmail("email_1", receivedEmail("email_1"), FALLBACK)).toEqual({
      providerMessageId: "email_1",
      receivedAt: new Date("2026-09-24T08:00:00.123Z"),
      from: "Ich <ich@example.org>",
      to: ["wohnungen@inbound.example.com"],
      subject: "Fwd: Neue Wohnungen",
      text: "Neue Angebote",
      html: "<p>Neue Angebote</p>",
    });
  });

  it("does not use the RFC Message-ID as provider id", () => {
    const email = mapReceivedEmail("email_1", receivedEmail("email_1"), FALLBACK);
    expect(email.providerMessageId).not.toContain("rfc-message-id");
  });

  it("handles text-only emails", () => {
    const email = mapReceivedEmail("email_1", receivedEmail("email_1", { html: null }), FALLBACK);
    expect(email).toMatchObject({ text: "Neue Angebote", html: null });
  });

  it("handles HTML-only emails", () => {
    const email = mapReceivedEmail("email_1", receivedEmail("email_1", { text: null }), FALLBACK);
    expect(email).toMatchObject({ text: null, html: "<p>Neue Angebote</p>" });
  });

  it("turns empty or missing subject and sender into null", () => {
    expect(
      mapReceivedEmail("email_1", receivedEmail("email_1", { subject: "", from: "  " }), FALLBACK),
    ).toMatchObject({ subject: null, from: null });
    const withoutSubject: Record<string, unknown> = receivedEmail("email_1");
    delete withoutSubject.subject;
    expect(mapReceivedEmail("email_1", withoutSubject, FALLBACK).subject).toBeNull();
  });

  it("falls back to the request time for an unparseable timestamp", () => {
    const email = mapReceivedEmail("email_1", receivedEmail("email_1", { created_at: "gestern" }), FALLBACK);
    expect(email.receivedAt).toEqual(FALLBACK);
  });

  it("rejects an email whose id does not match the webhook", () => {
    expect(() => mapReceivedEmail("email_1", receivedEmail("email_2"), FALLBACK)).toThrow(ReceivingApiError);
  });

  it("rejects an unexpected shape", () => {
    expect(() => mapReceivedEmail("email_1", { id: "email_1", to: "kein Array" }, FALLBACK)).toThrow(
      ReceivingApiError,
    );
  });
});

describe("parseProviderTimestamp", () => {
  it.each([
    ["2026-09-24T08:00:00.000Z", "2026-09-24T08:00:00.000Z"],
    ["2026-09-24 08:00:00.123+00", "2026-09-24T08:00:00.123Z"],
    ["2026-09-24 10:00:00+02:00", "2026-09-24T08:00:00.000Z"],
  ])("%s → %s", (input, expected) => {
    expect(parseProviderTimestamp(input)?.toISOString()).toBe(expected);
  });

  it("returns null for missing or invalid values", () => {
    expect(parseProviderTimestamp(null)).toBeNull();
    expect(parseProviderTimestamp("nie")).toBeNull();
  });
});

describe("fetchReceivedEmail", () => {
  it("requests the email with cid HTML and maps it", async () => {
    let options: unknown;
    const client = testResend(async () => ({ data: receivedEmail("email_1"), error: null, headers: null }));
    const originalGet = client.emails.receiving.get;
    client.emails.receiving.get = ((id: string, opts: unknown) => {
      options = opts;
      return originalGet(id);
    }) as typeof originalGet;

    const email = await fetchReceivedEmail(client, "email_1", FALLBACK);

    expect(email.providerMessageId).toBe("email_1");
    expect(options).toEqual({ html_format: "cid" });
  });

  it("turns an API error into a ReceivingApiError with its status", async () => {
    const client = testResend(async () => ({
      data: null,
      error: { name: "rate_limit_exceeded", message: "Too many requests", statusCode: 429 },
      headers: null,
    }));
    await expect(fetchReceivedEmail(client, "email_1", FALLBACK)).rejects.toMatchObject({
      name: "ReceivingApiError",
      statusCode: 429,
    });
  });

  it("turns a network exception into a ReceivingApiError", async () => {
    const client = testResend(async () => {
      throw new TypeError("fetch failed");
    });
    await expect(fetchReceivedEmail(client, "email_1", FALLBACK)).rejects.toBeInstanceOf(ReceivingApiError);
  });
});
