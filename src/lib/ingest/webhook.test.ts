import { describe, expect, it, vi } from "vitest";
import type { IncomingEmail } from "@/lib/domain/email";
import type { ResendEnv } from "@/lib/ingest/env";
import { IngestionError, type IngestionResult } from "@/lib/ingest/pipeline";
import {
  receivedEmail,
  receivedEvent,
  signedHeaders,
  TEST_WEBHOOK_SECRET,
  testResend,
} from "@/lib/ingest/testing/resend";
import { handleInboundWebhook, type InboundWebhookDeps } from "@/lib/ingest/webhook";

const CONFIG: ResendEnv = { apiKey: "re_test", webhookSecret: TEST_WEBHOOK_SECRET };
const silent = { info: vi.fn(), warn: vi.fn(), error: vi.fn() };

const processed: IngestionResult = {
  outcome: "processed",
  emailId: "row-1",
  parseStatus: "unrecognized",
  apartments: 0,
  reprocessed: false,
};

function setup(overrides: {
  get?: (id: string) => Promise<unknown>;
  process?: (email: IncomingEmail) => Promise<IngestionResult>;
  config?: () => ResendEnv;
} = {}) {
  const resend = testResend(
    overrides.get ?? (async (id) => ({ data: receivedEmail(id), error: null, headers: null })),
  );
  const processCalls: IncomingEmail[] = [];
  const deps: InboundWebhookDeps = {
    config: overrides.config ?? (() => CONFIG),
    resend: () => resend,
    process: async (email) => {
      processCalls.push(email);
      return (overrides.process ?? (async () => processed))(email);
    },
    log: silent,
  };
  return { deps, resend, processCalls };
}

function post(body: string, headers: Record<string, string>): Request {
  return new Request("http://localhost/api/email/incoming", { method: "POST", body, headers });
}

function signedPost(body: string): Request {
  return post(body, signedHeaders(body));
}

describe("handleInboundWebhook", () => {
  it("processes a valid email.received: fetch full email, then ingest", async () => {
    const { deps, resend, processCalls } = setup();

    const response = await handleInboundWebhook(signedPost(receivedEvent("email_1")), deps);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      ok: true,
      outcome: "processed",
      parseStatus: "unrecognized",
      apartments: 0,
    });
    expect(resend.getCalls).toEqual(["email_1"]);
    expect(processCalls).toHaveLength(1);
    expect(processCalls[0]).toMatchObject({
      providerMessageId: "email_1",
      text: "Neue Angebote",
      html: "<p>Neue Angebote</p>",
    });
  });

  it("rejects an invalid signature with 400 and processes nothing", async () => {
    const { deps, resend, processCalls } = setup();
    const body = receivedEvent("email_1");
    const forged = signedHeaders(body, { secret: `whsec_${Buffer.from("falsch").toString("base64")}` });

    const response = await handleInboundWebhook(post(body, forged), deps);

    expect(response.status).toBe(400);
    expect(resend.getCalls).toEqual([]);
    expect(processCalls).toEqual([]);
  });

  it("rejects a tampered body with 400", async () => {
    const { deps, processCalls } = setup();
    const body = receivedEvent("email_1");
    const response = await handleInboundWebhook(
      post(body.replace("email_1", "email_2"), signedHeaders(body)),
      deps,
    );
    expect(response.status).toBe(400);
    expect(processCalls).toEqual([]);
  });

  it("rejects missing signature headers with 400 before reading config", async () => {
    const config = vi.fn(() => CONFIG);
    const { deps } = setup({ config });
    const response = await handleInboundWebhook(post(receivedEvent("email_1"), {}), deps);
    expect(response.status).toBe(400);
    expect(config).not.toHaveBeenCalled();
  });

  it("acknowledges unsupported event types with 200 without ingesting", async () => {
    const { deps, resend, processCalls } = setup();
    const response = await handleInboundWebhook(signedPost(receivedEvent("email_1", "email.delivered")), deps);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true, ignored: "email.delivered" });
    expect(resend.getCalls).toEqual([]);
    expect(processCalls).toEqual([]);
  });

  it("rejects a signed but malformed event with 400", async () => {
    const { deps } = setup();
    const body = JSON.stringify({ type: "email.received", data: {} });
    expect((await handleInboundWebhook(signedPost(body), deps)).status).toBe(400);
  });

  it("returns 502 (retry) when the Receiving API fails, before storing anything", async () => {
    const { deps, processCalls } = setup({
      get: async () => ({
        data: null,
        error: { name: "internal_server_error", message: "boom", statusCode: 500 },
        headers: null,
      }),
    });
    const response = await handleInboundWebhook(signedPost(receivedEvent("email_1")), deps);
    expect(response.status).toBe(502);
    expect(processCalls).toEqual([]);
  });

  it("returns 200 for a duplicate delivery", async () => {
    const { deps } = setup({
      process: async () => ({ outcome: "duplicate", emailId: "row-1", parseStatus: "unrecognized" }),
    });
    const response = await handleInboundWebhook(signedPost(receivedEvent("email_1")), deps);
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ outcome: "duplicate" });
  });

  it("returns 200 when a parser failed (retrying would not help)", async () => {
    const { deps } = setup({
      process: async () => ({ ...processed, parseStatus: "failed" }),
    });
    const response = await handleInboundWebhook(signedPost(receivedEvent("email_1")), deps);
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ parseStatus: "failed" });
  });

  it.each(["store_email", "persist_apartments", "update_status"] as const)(
    "returns 500 (retry) on a storage failure at %s, without leaking details",
    async (stage) => {
      const { deps } = setup({
        process: async () => {
          throw new IngestionError(stage, "row-1", new Error("connection to db.internal:5432 refused"));
        },
      });
      const response = await handleInboundWebhook(signedPost(receivedEvent("email_1")), deps);
      expect(response.status).toBe(500);
      const text = await response.text();
      expect(text).not.toContain("db.internal");
      expect(text).not.toContain("Neue Angebote");
    },
  );

  it("returns 500 (retry) when Resend is not configured", async () => {
    const { deps, processCalls } = setup({
      config: () => {
        throw new Error("Missing environment variable(s): RESEND_WEBHOOK_SECRET.");
      },
    });
    const response = await handleInboundWebhook(signedPost(receivedEvent("email_1")), deps);
    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ error: "webhook not configured" });
    expect(processCalls).toEqual([]);
  });

  it("never logs email content", async () => {
    const log = { info: vi.fn(), warn: vi.fn(), error: vi.fn() };
    const { deps } = setup();
    await handleInboundWebhook(signedPost(receivedEvent("email_1")), { ...deps, log });
    const logged = JSON.stringify([log.info.mock.calls, log.warn.mock.calls, log.error.mock.calls]);
    expect(logged).not.toContain("Neue Angebote");
    expect(logged).not.toContain("ich@example.org");
  });
});
