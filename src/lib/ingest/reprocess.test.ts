import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { Apartment, NewApartment } from "@/lib/domain/apartment";
import type { EmailParseResult, StoredEmail } from "@/lib/domain/email";
import { makeApartment } from "@/lib/dashboard/testing/apartments";
import { fixtureFileSchema, fixtureToIncomingEmail } from "@/lib/ingest/fixtureFile";
import {
  EmailNotFoundError,
  IngestionError,
  reprocessStoredEmail,
  type ReprocessingStore,
} from "@/lib/ingest/pipeline";
import type { ParseOutcome } from "@/lib/parsers/types";

/** The real ImmoScout alert, stored earlier when no ImmoScout parser existed. */
function storedImmoscoutEmail(overrides: Partial<StoredEmail> = {}): StoredEmail {
  const file = fixtureFileSchema.parse(
    JSON.parse(readFileSync("fixtures/emails/immoscout/alert-01.json", "utf-8")),
  );
  return {
    ...fixtureToIncomingEmail(file, new Date(0)),
    id: "email-row-1",
    detectedSource: "immoscout",
    parserVersion: "generic@0.1.0",
    parseStatus: "unrecognized",
    parseError: null,
    ...overrides,
  };
}

/**
 * In-memory stand-in for the two tables, with the real persistence semantics:
 * upsert on (source, sourceId) refreshes listing data but keeps status,
 * favorite and first seen; the email row only receives parse results.
 */
function memoryDb(email: StoredEmail | null, options: { failOn?: keyof ReprocessingStore } = {}) {
  let storedEmail = email ? structuredClone(email) : null;
  const apartments: Apartment[] = [];
  const updates: EmailParseResult[] = [];
  const calls: string[] = [];
  let nextId = 1;

  const track = (name: keyof ReprocessingStore) => {
    calls.push(name);
    if (options.failOn === name) throw new Error(`${name} unavailable`);
  };
  const create = (input: NewApartment): Apartment => {
    const apartment = makeApartment({ ...input, id: `apt-${nextId++}` });
    apartments.push(apartment);
    return apartment;
  };

  const store: ReprocessingStore = {
    async findEmailByProviderMessageId(id) {
      track("findEmailByProviderMessageId");
      return storedEmail && storedEmail.providerMessageId === id ? structuredClone(storedEmail) : null;
    },
    async updateEmailParseResult(id, result) {
      track("updateEmailParseResult");
      updates.push(result);
      if (!storedEmail || storedEmail.id !== id) throw new Error("no such email");
      storedEmail = {
        ...storedEmail,
        parseStatus: result.parseStatus,
        parserVersion: result.parserVersion,
        parseError: result.parseError,
        detectedSource: result.detectedSource ?? storedEmail.detectedSource,
      };
      return storedEmail;
    },
    async insertApartment(input) {
      track("insertApartment");
      return create(input);
    },
    async upsertApartment(input) {
      track("upsertApartment");
      const existing = apartments.find(
        (a) => a.source === input.source && a.sourceId === input.sourceId,
      );
      if (!existing) return create(input);
      Object.assign(existing, input); // workflow fields are not part of the input
      return existing;
    },
    async countApartmentsWithoutSourceId(emailId) {
      track("countApartmentsWithoutSourceId");
      return apartments.filter((a) => a.emailId === emailId && a.sourceId === null).length;
    },
  };
  return { store, apartments, updates, calls, email: () => storedEmail };
}

const ID = "fixture-immoscout-alert-01";

describe("reprocessStoredEmail", () => {
  it("turns a previously unrecognized email into a parsed one with the current parsers", async () => {
    const db = memoryDb(storedImmoscoutEmail());

    const result = await reprocessStoredEmail(ID, db.store);

    expect(result).toEqual({
      emailId: "email-row-1",
      detectedSource: "immoscout",
      parserVersion: "immoscout@1.0.1",
      parseStatus: "parsed",
      apartments: 1,
    });
    expect(db.email()).toMatchObject({
      parseStatus: "parsed",
      parserVersion: "immoscout@1.0.1",
      parseError: null,
    });
    expect(db.apartments).toHaveLength(1);
    expect(db.apartments[0]).toMatchObject({
      emailId: "email-row-1",
      sourceId: "171164085",
      rentCold: 1099,
      balcony: true,
    });
  });

  it("leaves the stored raw email untouched", async () => {
    const before = storedImmoscoutEmail();
    const db = memoryDb(before);

    await reprocessStoredEmail(ID, db.store);

    const after = db.email()!;
    const RAW_FIELDS = ["id", "providerMessageId", "receivedAt", "from", "to", "subject", "text", "html"] as const;
    for (const field of RAW_FIELDS) {
      expect(after[field]).toEqual(before[field]);
    }
    expect(after).toMatchObject({
      parseStatus: "parsed",
      parserVersion: "immoscout@1.0.1",
      parseError: null,
      detectedSource: "immoscout",
    });
    // The update itself carries only processing results.
    for (const update of db.updates) {
      expect(Object.keys(update).sort()).toEqual(
        ["detectedSource", "parseError", "parseStatus", "parserVersion"].sort(),
      );
    }
  });

  it("re-detects and records the source", async () => {
    const db = memoryDb(storedImmoscoutEmail({ detectedSource: "other" }));
    await reprocessStoredEmail(ID, db.store);
    expect(db.email()?.detectedSource).toBe("immoscout");
  });

  it("upserts the listing because it has a source id", async () => {
    const db = memoryDb(storedImmoscoutEmail());
    await reprocessStoredEmail(ID, db.store);
    expect(db.calls).toContain("upsertApartment");
    expect(db.calls).not.toContain("insertApartment");
  });

  it("does not create a second apartment when run twice, and keeps workflow state", async () => {
    const db = memoryDb(storedImmoscoutEmail());
    await reprocessStoredEmail(ID, db.store);
    const firstSeen = db.apartments[0].firstSeen;
    Object.assign(db.apartments[0], { status: "applied", isFavorite: true });

    const second = await reprocessStoredEmail(ID, db.store);

    expect(second.parseStatus).toBe("parsed");
    expect(db.apartments).toHaveLength(1);
    expect(db.apartments[0]).toMatchObject({ status: "applied", isFavorite: true, firstSeen });
  });

  it.each(["pending", "failed", "parsed", "unrecognized"] as const)(
    "reprocesses an email currently marked %s",
    async (parseStatus) => {
      const db = memoryDb(storedImmoscoutEmail({ parseStatus }));
      expect((await reprocessStoredEmail(ID, db.store)).parseStatus).toBe("parsed");
    },
  );

  it("does not re-insert source-id-less listings an earlier run stored", async () => {
    const listing = (district: string) => ({
      source: "other" as const,
      sourceUrl: null,
      sourceId: null,
      title: "Wohnung",
      address: null,
      district,
      rooms: 3,
      sqm: 90,
      rentCold: null,
      rentWarm: 1200,
      floor: null,
      description: null,
      imageUrl: null,
    });
    const parse = (): ParseOutcome => ({
      status: "parsed",
      parserVersion: "test@1",
      apartments: [listing("A"), listing("B")],
      failures: [],
    });
    const db = memoryDb(storedImmoscoutEmail());

    await reprocessStoredEmail(ID, db.store, parse);
    await reprocessStoredEmail(ID, db.store, parse);

    expect(db.apartments.map((a) => a.district)).toEqual(["A", "B"]);
  });

  it("marks an email unrecognized when the parsers still find nothing", async () => {
    const db = memoryDb(storedImmoscoutEmail({ parseStatus: "failed", parseError: "alt" }));
    const result = await reprocessStoredEmail(ID, db.store, () => ({
      status: "unrecognized",
      parserVersion: "generic@0.1.0",
      apartments: [],
      failures: [],
    }));

    expect(result).toMatchObject({ parseStatus: "unrecognized", apartments: 0 });
    expect(db.email()).toMatchObject({ parseStatus: "unrecognized", parseError: null });
    expect(db.apartments).toEqual([]);
  });

  it("marks the email failed when a parser fails", async () => {
    const db = memoryDb(storedImmoscoutEmail());
    const result = await reprocessStoredEmail(ID, db.store, () => ({
      status: "failed",
      parserVersion: "generic@0.1.0",
      apartments: [],
      failures: [{ parser: "immoscout", stage: "parse", message: "Unerwartetes Format" }],
    }));

    expect(result.parseStatus).toBe("failed");
    expect(db.email()).toMatchObject({
      parseStatus: "failed",
      parseError: "immoscout (parse): Unerwartetes Format",
    });
  });

  it("fails clearly for an unknown provider message id, without touching anything", async () => {
    const db = memoryDb(storedImmoscoutEmail());

    const error = await reprocessStoredEmail("does-not-exist", db.store).catch((e) => e);

    expect(error).toBeInstanceOf(EmailNotFoundError);
    expect(error.message).toBe('No stored email with provider message id "does-not-exist".');
    expect(db.calls).toEqual(["findEmailByProviderMessageId"]);
  });

  it("marks the email failed and throws when storing apartments fails", async () => {
    const db = memoryDb(storedImmoscoutEmail(), { failOn: "upsertApartment" });

    const error = await reprocessStoredEmail(ID, db.store).catch((e) => e);

    expect(error).toBeInstanceOf(IngestionError);
    expect(error.stage).toBe("persist_apartments");
    expect(db.email()?.parseStatus).toBe("failed");
  });
});
