import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import type { IncomingEmail, StoredEmail } from "@/lib/domain/email";
import { fixtureFileSchema, fixtureToIncomingEmail } from "@/lib/ingest/fixtureFile";
import { fetchResultsPage, HildebrandFetchError } from "@/lib/ingest/hildebrandResults";
import { IngestionError, processIncomingEmail, reprocessStoredEmail } from "@/lib/ingest/pipeline";
import { createPreprocessor } from "@/lib/ingest/preprocess";
import { memoryStore } from "@/lib/ingest/testing/memoryStore";
import { receivedEmail, receivedEvent, signedHeaders, TEST_WEBHOOK_SECRET, testResend } from "@/lib/ingest/testing/resend";
import { handleInboundWebhook } from "@/lib/ingest/webhook";
import { parseEmail } from "@/lib/parsers";
import { parseResultsUrl } from "@/lib/parsers/hildebrandPartner";

/**
 * Results-page fetching and the full Hildebrand path (email → fetched page
 * → apartments) with fake fetches only. The reviewed page fixture stands in
 * for the live page; the token is the fixture's FIXTURE_TOKEN.
 */

function reviewedEmail(): IncomingEmail {
  const file = fixtureFileSchema.parse(
    JSON.parse(readFileSync("fixtures/emails/hildebrand-partner/alert-01.json", "utf-8")),
  );
  return fixtureToIncomingEmail(file, new Date("2026-09-28T07:23:22.241Z"));
}

const PAGE = readFileSync("fixtures/pages/hildebrand-partner/search-results-01.html", "utf-8");
const RESULTS_URL = parseResultsUrl(
  "https://hildebrand-partner.com/immobilien/?status=offen&since=1790580184&confirm=SECRET-TOKEN",
)!;
const SECRETS = /SECRET-TOKEN|FIXTURE_TOKEN|confirm|since=|bis-kaltmiete/;

type Answer = { status?: number; type?: string | null; body?: string; location?: string } | "network-error";

/** Answers every request with `answer`; records requests (and whether init was as required). */
function fakePage(answer: Answer = {}) {
  const requests: { url: URL; init?: RequestInit }[] = [];
  const fetchImpl = (async (input: string | URL | Request, init?: RequestInit) => {
    requests.push({ url: new URL(input instanceof Request ? input.url : input), init });
    if (answer === "network-error") throw new TypeError(`fetch failed: ${String(input)}`);
    const headers: Record<string, string> = {};
    if (answer.type !== null) headers["content-type"] = answer.type ?? "text/html; charset=UTF-8";
    if (answer.location) headers.location = answer.location;
    return new Response(answer.body ?? PAGE, { status: answer.status ?? 200, headers });
  }) as typeof fetch;
  return { fetch: fetchImpl, requests };
}

async function errorOf(promise: Promise<unknown>): Promise<Error> {
  const error = await promise.then(
    () => null,
    (e: unknown) => e,
  );
  if (!(error instanceof Error)) throw new Error("expected a rejection");
  return error;
}

describe("fetchResultsPage", () => {
  it("GETs the validated URL once, manual redirects, no custom headers, and returns the HTML", async () => {
    const fake = fakePage();
    expect(await fetchResultsPage(RESULTS_URL, fake)).toBe(PAGE);
    expect(fake.requests).toHaveLength(1);
    expect(fake.requests[0].url.href).toBe(RESULTS_URL.href);
    expect(fake.requests[0].init).toMatchObject({ method: "GET", redirect: "manual" });
    expect(fake.requests[0].init?.headers).toBeUndefined(); // no spoofed User-Agent
    expect(fake.requests[0].init?.signal).toBeInstanceOf(AbortSignal);
  });

  it.each([
    ["a server error", { status: 503 }, "unexpected status 503"],
    ["a 403", { status: 403 }, "unexpected status 403"],
    ["a redirect (not followed)", { status: 302, location: "https://example.com/?confirm=SECRET-TOKEN", body: "" }, "unexpected status 302"],
    ["a non-HTML response", { type: "application/json", body: "{}" }, "unexpected content type"],
    ["a missing content type", { type: null }, "unexpected content type"],
    ["an oversized body", { body: "x".repeat(2_000_001) }, "response too large"],
  ] as const)("rejects %s with a safe error", async (_, answer, reason) => {
    const error = await errorOf(fetchResultsPage(RESULTS_URL, fakePage(answer)));
    expect(error).toBeInstanceOf(HildebrandFetchError);
    expect(error.message).toBe(`Hildebrand search results could not be fetched (${reason})`);
    expect(error.message).not.toMatch(SECRETS);
  });

  it("turns network errors and timeouts into safe errors without the URL", async () => {
    const network = await errorOf(fetchResultsPage(RESULTS_URL, fakePage("network-error")));
    expect(network.message).toBe("Hildebrand search results could not be fetched (network error)");
    expect(JSON.stringify({ m: network.message, c: network.cause, s: network.stack })).not.toMatch(SECRETS);

    const hanging = ((_: unknown, init?: RequestInit) =>
      new Promise((_, reject) => init?.signal?.addEventListener("abort", () => reject(init.signal?.reason)))) as typeof fetch;
    const timeout = await errorOf(fetchResultsPage(RESULTS_URL, { fetch: hanging, timeoutMs: 20 }));
    expect(timeout.message).toBe("Hildebrand search results could not be fetched (timeout)");
  });
});

describe("pipeline: Hildebrand email → fetched results page → apartments", () => {
  it("fetches exactly the results link and stores one apartment; raw email unchanged, page not stored", async () => {
    const db = memoryStore();
    const fake = fakePage();
    const raw = reviewedEmail();

    const result = await processIncomingEmail(raw, db.store, parseEmail, createPreprocessor(fake));

    expect(result).toMatchObject({ outcome: "processed", parseStatus: "parsed", apartments: 1 });
    expect(fake.requests.map((r) => r.url.href)).toEqual([
      "https://hildebrand-partner.com/immobilien/?bis-kaltmiete=1600.00&bis-kaufpreis=NaN&bis-qm=150.00&bis-zimmer=5.00" +
        "&nutzungsart=wohnen&objekt-id&ort=leipzig&typ=wohnung&vermarktungsart=miete&von-kaufpreis=NaN&status=offen" +
        "&since=1790580184&confirm=FIXTURE_TOKEN",
    ]);
    expect(db.apartments).toHaveLength(1);
    expect(db.apartments[0]).toMatchObject({
      source: "hildebrand-partner",
      sourceId: "Kantstr. 37a_WE12",
      sourceUrl: "https://hildebrand-partner.com/immobilien/wohnung-etagenwohnung-in-leipzig-mieten-kantstr-37a-we12/",
      rentCold: 1398,
      rentWarm: 1613,
      balcony: true,
      buildingType: "neubau",
      fingerprint: null,
    });
    expect(db.email()).toMatchObject({ detectedSource: "hildebrand-partner", parserVersion: "hildebrand-partner@1.1.0" });
    expect(db.email()?.text).toBe(raw.text);
    expect(db.email()).not.toHaveProperty("fetchedPage");
    expect(JSON.stringify([db.apartments, db.updates])).not.toMatch(/FIXTURE_TOKEN|confirm|property-container/);
  });

  it("a failed fetch → IngestionError (retry), email failed with a safe error, no apartments; the retry succeeds", async () => {
    const db = memoryStore();
    const error = await errorOf(
      processIncomingEmail(reviewedEmail(), db.store, parseEmail, createPreprocessor(fakePage({ status: 503 }))),
    );
    expect(error).toBeInstanceOf(IngestionError);
    expect((error as IngestionError).stage).toBe("preprocess");
    expect(db.apartments).toEqual([]);
    expect(db.email()).toMatchObject({
      parseStatus: "failed",
      parserVersion: null,
      parseError: "Hildebrand search results could not be fetched (unexpected status 503)",
    });
    expect(JSON.stringify([error.message, db.updates])).not.toMatch(/FIXTURE_TOKEN|confirm/);

    const retry = await processIncomingEmail(reviewedEmail(), db.store, parseEmail, createPreprocessor(fakePage()));
    expect(retry).toMatchObject({ outcome: "processed", parseStatus: "parsed", apartments: 1, reprocessed: true });
    expect(db.apartments).toHaveLength(1);
  });

  it("an invalid results link is a deterministic failure: no request, failed, not retried", async () => {
    const db = memoryStore();
    const fake = fakePage();
    const broken = { ...reviewedEmail() };
    broken.text = broken.text!.replace("confirm=FIXTURE_TOKEN]", "confirm=]");
    const result = await processIncomingEmail(broken, db.store, parseEmail, createPreprocessor(fake));
    expect(fake.requests).toEqual([]);
    expect(result).toMatchObject({ outcome: "processed", parseStatus: "failed", apartments: 0 });
    expect(db.email()?.parseError).toBe("hildebrand-partner (parse): Hildebrand search-results link is missing or invalid");
  });

  it("the webhook answers 500 on a transient fetch failure, so Resend retries", async () => {
    const db = memoryStore();
    const body = receivedEvent("email_1");
    const response = await handleInboundWebhook(
      new Request("http://localhost/api/email/incoming", { method: "POST", body, headers: signedHeaders(body) }),
      {
        config: () => ({ apiKey: "re_test", webhookSecret: TEST_WEBHOOK_SECRET }),
        resend: () => testResend(async (id) => ({ data: receivedEmail(id), error: null, headers: null })),
        log: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
        // The webhook's fetched email, with the reviewed Hildebrand content.
        process: (email) =>
          processIncomingEmail(
            { ...reviewedEmail(), providerMessageId: email.providerMessageId },
            db.store,
            parseEmail,
            createPreprocessor(fakePage("network-error")),
          ),
      },
    );
    expect(response.status).toBe(500);
    expect(await response.text()).not.toMatch(/FIXTURE_TOKEN|confirm|hildebrand-partner\.com/);
    expect(db.email()).toMatchObject({ providerMessageId: "email_1", parseStatus: "failed" });
    expect(db.apartments).toEqual([]);
  });

  it("reprocessing the old mail stored as \"other\" re-detects hildebrand-partner and parses it", async () => {
    const raw = reviewedEmail();
    const stored: StoredEmail = {
      ...raw,
      id: "row-1",
      detectedSource: "other",
      parserVersion: "generic@0.1.0",
      parseStatus: "unrecognized",
      parseError: null,
    };
    const db = memoryStore(stored);

    const first = await reprocessStoredEmail(raw.providerMessageId, db.store, parseEmail, createPreprocessor(fakePage()));
    const second = await reprocessStoredEmail(raw.providerMessageId, db.store, parseEmail, createPreprocessor(fakePage()));

    expect(first).toMatchObject({
      detectedSource: "hildebrand-partner",
      parserVersion: "hildebrand-partner@1.1.0",
      parseStatus: "parsed",
      apartments: 1,
    });
    expect(second.apartments).toBe(1);
    expect(db.apartments).toHaveLength(1); // upsert by (source, Objekt ID)
    expect(db.email()).toMatchObject({ detectedSource: "hildebrand-partner", text: raw.text });
  });
});
