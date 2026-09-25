import { describe, expect, it } from "vitest";
import type { Apartment, NewApartment } from "@/lib/domain/apartment";
import type { EmailParseResult, IncomingEmail, StoredEmail } from "@/lib/domain/email";
import { makeApartment } from "@/lib/dashboard/testing/apartments";
import {
  IngestionError,
  processIncomingEmail,
  reprocessStoredEmail,
  type IngestionStore,
  type ReprocessingStore,
} from "@/lib/ingest/pipeline";
import { createPreprocessor, defaultPreprocess } from "@/lib/ingest/preprocess";
import {
  allListingRoutes,
  EXPOSE_IDS,
  expose,
  fakeTracker,
  reviewedImmoweltEmail,
  syntheticRawImmoweltText,
} from "@/lib/ingest/testing/immowelt";
import { parseEmail } from "@/lib/parsers";

/** Raw-looking Immowelt email: real structure, synthetic tracking tokens. */
function rawImmoweltEmail(): IncomingEmail {
  return { ...reviewedImmoweltEmail(), providerMessageId: "email_raw", text: syntheticRawImmoweltText() };
}

/** In-memory store for both entry points; upsert keeps workflow fields. */
function memoryStore(existing?: StoredEmail) {
  let email: StoredEmail | null = existing ? structuredClone(existing) : null;
  const apartments: Apartment[] = [];
  const updates: EmailParseResult[] = [];
  const upsert = async (input: NewApartment) => {
    const found = apartments.find((a) => a.source === input.source && a.sourceId === input.sourceId);
    if (found) return Object.assign(found, input);
    const created = makeApartment({ ...input, id: `apt-${apartments.length + 1}` });
    apartments.push(created);
    return created;
  };
  const store: IngestionStore & ReprocessingStore = {
    async createInboundEmail(input) {
      if (email) return { email, created: false };
      email = { ...input, id: "row-1", parserVersion: null, parseStatus: "pending", parseError: null };
      return { email, created: true };
    },
    async findEmailByProviderMessageId(id) {
      return email?.providerMessageId === id ? structuredClone(email) : null;
    },
    async updateEmailParseResult(_id, result) {
      updates.push(result);
      email = { ...email!, ...result, detectedSource: result.detectedSource ?? email!.detectedSource };
      return email;
    },
    insertApartment: upsert,
    upsertApartment: upsert,
    async countApartmentsWithoutSourceId() {
      return 0;
    },
  };
  return { store, apartments, updates, email: () => email };
}

describe("preprocessing", () => {
  it("leaves non-Immowelt emails alone without any request", async () => {
    const fake = fakeTracker({});
    const email = { ...rawImmoweltEmail(), from: "noreply@kleinanzeigen.de", text: "Anzeige ansehen" };
    expect(await createPreprocessor(fake)(email)).toBe(email);
    expect(fake.requested).toEqual([]);
  });

  it("returns the reviewed (already resolved) fixture unchanged with zero requests", async () => {
    const fake = fakeTracker({});
    const email = reviewedImmoweltEmail();
    expect(await createPreprocessor(fake)(email)).toBe(email);
    expect(fake.requested).toEqual([]);
    // The production preprocessor needs no network for it either (fetch is disabled in tests).
    expect(await defaultPreprocess(email)).toBe(email);
  });

  it("does not modify the input email", async () => {
    const email = rawImmoweltEmail();
    const before = structuredClone(email);
    await createPreprocessor(fakeTracker(allListingRoutes()))(email);
    expect(email).toEqual(before);
  });
});

describe("ingestion with Immowelt link resolution (integration)", () => {
  it("raw-style email → mocked redirects → immowelt@1.0.1 → six apartments; raw email stored unchanged", async () => {
    const email = rawImmoweltEmail();
    const fake = fakeTracker(allListingRoutes());
    const db = memoryStore();

    const result = await processIncomingEmail(email, db.store, parseEmail, createPreprocessor(fake));

    expect(result).toMatchObject({ outcome: "processed", parseStatus: "parsed", apartments: 6 });
    expect(fake.requested).toHaveLength(6);
    expect(db.updates.at(-1)).toMatchObject({ parseStatus: "parsed", parserVersion: "immowelt@1.0.1" });
    expect(db.email()?.text).toBe(email.text); // the stored raw text keeps its trackers
    expect(db.apartments.map((a) => a.sourceUrl)).toEqual(EXPOSE_IDS.map(expose));
    expect(db.apartments.map((a) => [a.title, a.rentCold, a.rooms, a.sqm, a.district])).toEqual([
      ["Inkl. Aufzug und neuer Einbauküche!", 1199, 3, 85, "Südvorstadt"],
      ["Wohnen mit Weitblick_helle 3-Zimmer-Dachgeschosswo...", 700, 3, 64.64, "Wahren"],
      ["Erstbezug nach Modernisierung! Inkl. EBK", 929, 3, 64, "Schönefeld-Abtnaundorf"],
      ["Maisonette-Wohnung inkl. EBK", 899, 3.5, 65, "Schönefeld-Abtnaundorf"],
      ["Inkl. Balkon und EBK", 1349, 4, 95, "Gohlis-Süd"],
      ["4-RW inkl. großem Balkon und neuer Einbauküche! *I...", 1349, 4, 94, "Plagwitz"],
    ]);
    expect(JSON.stringify(db.apartments)).not.toContain("click.by.immowelt.de");
  });

  it("without resolution, the raw email yields no apartments (parser stays network-free)", () => {
    expect(parseEmail(rawImmoweltEmail())).toMatchObject({ status: "unrecognized", apartments: [] });
  });

  it("fails atomically: one failed redirect → no apartments, email failed with a safe error, retryable", async () => {
    const routes = { ...allListingRoutes(), "SYNTH-LISTING-3": "network-error" as const };
    const db = memoryStore();

    const error = await processIncomingEmail(rawImmoweltEmail(), db.store, parseEmail, createPreprocessor(fakeTracker(routes))).catch(
      (e: unknown) => e,
    );

    expect(error).toBeInstanceOf(IngestionError);
    expect((error as IngestionError).stage).toBe("preprocess");
    expect(db.apartments).toEqual([]); // not five
    expect(db.email()).toMatchObject({
      parseStatus: "failed",
      parserVersion: null,
      parseError: "Immowelt listing redirect could not be resolved (network error)",
    });
    expect(JSON.stringify({ message: (error as Error).message, updates: db.updates })).not.toContain("SYNTH");

    // A webhook retry finds the email "failed" and processes it again.
    const retry = await processIncomingEmail(rawImmoweltEmail(), db.store, parseEmail, createPreprocessor(fakeTracker(allListingRoutes())));
    expect(retry).toMatchObject({ outcome: "processed", parseStatus: "parsed", apartments: 6, reprocessed: true });
    expect(db.apartments).toHaveLength(6);
  });

  it("reprocessing a stored raw Immowelt email uses the same resolution step, idempotently", async () => {
    const raw = rawImmoweltEmail();
    const stored: StoredEmail = {
      ...raw,
      id: "row-1",
      detectedSource: "immowelt",
      parserVersion: "generic@0.1.0",
      parseStatus: "unrecognized",
      parseError: null,
    };
    const db = memoryStore(stored);

    const first = await reprocessStoredEmail("email_raw", db.store, parseEmail, createPreprocessor(fakeTracker(allListingRoutes())));
    const second = await reprocessStoredEmail("email_raw", db.store, parseEmail, createPreprocessor(fakeTracker(allListingRoutes())));

    expect(first).toMatchObject({ parseStatus: "parsed", parserVersion: "immowelt@1.0.1", apartments: 6 });
    expect(second.apartments).toBe(6);
    expect(db.apartments).toHaveLength(6); // upserts, no duplicates
    expect(db.email()?.text).toBe(raw.text);
  });
});
