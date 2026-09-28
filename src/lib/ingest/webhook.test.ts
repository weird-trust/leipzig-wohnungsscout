import { describe, expect, it, vi } from "vitest";
import type { IncomingEmail } from "@/lib/domain/email";
import type { ResendEnv } from "@/lib/ingest/env";
import { IngestionError, processIncomingEmail, type IngestionResult } from "@/lib/ingest/pipeline";
import { createPreprocessor } from "@/lib/ingest/preprocess";
import {
  allListingRoutes,
  fakeTracker,
  reviewedImmoweltEmail,
  syntheticRawImmoweltText,
} from "@/lib/ingest/testing/immowelt";
import { memoryStore } from "@/lib/ingest/testing/memoryStore";
import {
  receivedEmail,
  receivedEvent,
  signedHeaders,
  TEST_WEBHOOK_SECRET,
  testResend,
} from "@/lib/ingest/testing/resend";
import { handleInboundWebhook, type InboundWebhookDeps } from "@/lib/ingest/webhook";
import { parseEmail } from "@/lib/parsers";

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

/**
 * End to end through the real pipeline (in-memory store, fake redirects):
 * the three failure classes must stay distinct.
 */
describe("handleInboundWebhook + pipeline: Immowelt link resolution failures", () => {
  function immoweltDeps(routes: Parameters<typeof fakeTracker>[0], db = memoryStore()) {
    const fake = fakeTracker(routes);
    const deps: InboundWebhookDeps = {
      config: () => CONFIG,
      resend: () => testResend(async (id) => ({ data: receivedEmail(id), error: null, headers: null })),
      // The webhook's fetched email, with the synthetic raw Immowelt content.
      process: (email) =>
        processIncomingEmail(
          { ...email, from: raw.from, subject: raw.subject, text: raw.text, html: null },
          db.store,
          parseEmail,
          createPreprocessor(fake),
        ),
      log: silent,
    };
    return { deps, db, fake };
  }
  const raw = { ...reviewedImmoweltEmail(), text: syntheticRawImmoweltText() };

  it("a transient redirect failure (e.g. 403) → 500 (Resend retries), email kept as failed, no apartments", async () => {
    const { deps, db } = immoweltDeps({ ...allListingRoutes(), "SYNTH-LISTING-2": { status: 403 } });

    const response = await handleInboundWebhook(signedPost(receivedEvent("email_1")), deps);

    expect(response.status).toBe(500);
    const body = await response.text();
    expect(body).not.toMatch(/SYNTH|qs=|click\.by/);
    expect(db.apartments).toEqual([]);
    expect(db.email()).toMatchObject({
      providerMessageId: "email_1",
      text: raw.text, // raw content stored unchanged
      parseStatus: "failed",
      parserVersion: null,
      parseError: "Immowelt listing redirect could not be resolved (unexpected status 403)",
    });
    expect(JSON.stringify(db.updates)).not.toMatch(/SYNTH|qs=/);
  });

  it("the redelivery reprocesses the failed email (200, parsed), a further one is a duplicate", async () => {
    const db = memoryStore();
    const failing = immoweltDeps({ ...allListingRoutes(), "SYNTH-LISTING-2": "network-error" }, db);
    expect((await handleInboundWebhook(signedPost(receivedEvent("email_1")), failing.deps)).status).toBe(500);

    const working = immoweltDeps(allListingRoutes(), db);
    const retry = await handleInboundWebhook(signedPost(receivedEvent("email_1")), working.deps);
    expect(retry.status).toBe(200);
    expect(await retry.json()).toMatchObject({ outcome: "processed", parseStatus: "parsed", apartments: 6 });
    expect(db.apartments).toHaveLength(6);

    const again = immoweltDeps(allListingRoutes(), db);
    const duplicate = await handleInboundWebhook(signedPost(receivedEvent("email_1")), again.deps);
    expect(duplicate.status).toBe(200);
    expect(await duplicate.json()).toMatchObject({ outcome: "duplicate", parseStatus: "parsed" });
    expect(again.fake.requested).toEqual([]); // no further network requests
    expect(db.apartments).toHaveLength(6);
  });

  it("an unrecognized (non-listing) email stays 200 without any request", async () => {
    const db = memoryStore();
    const fake = fakeTracker({});
    const deps: InboundWebhookDeps = {
      config: () => CONFIG,
      resend: () => testResend(async (id) => ({ data: receivedEmail(id), error: null, headers: null })),
      process: (email) => processIncomingEmail(email, db.store, parseEmail, createPreprocessor(fake)),
      log: silent,
    };
    const response = await handleInboundWebhook(signedPost(receivedEvent("email_1")), deps);
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ parseStatus: "unrecognized", apartments: 0 });
    expect(fake.requested).toEqual([]);
  });

  it("a deterministic parser failure stays 200 (retrying would not help)", async () => {
    const db = memoryStore();
    const deps: InboundWebhookDeps = {
      config: () => CONFIG,
      resend: () => testResend(async (id) => ({ data: receivedEmail(id), error: null, headers: null })),
      process: (email) =>
        processIncomingEmail(
          email,
          db.store,
          () => ({ status: "failed", parserVersion: "x@1", apartments: [], failures: [{ parser: "x", stage: "parse", message: "bad" }] }),
          async (e) => e,
        ),
      log: silent,
    };
    const response = await handleInboundWebhook(signedPost(receivedEvent("email_1")), deps);
    expect(response.status).toBe(200);
    expect(db.email()).toMatchObject({ parseStatus: "failed", parserVersion: "x@1" });
  });
});
