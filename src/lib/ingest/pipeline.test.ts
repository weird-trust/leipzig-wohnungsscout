import { describe, expect, it } from "vitest";
import type { Apartment, NewApartment } from "@/lib/domain/apartment";
import type {
  EmailParseResult,
  EmailParseStatus,
  IncomingEmail,
  NewInboundEmail,
  StoredEmail,
} from "@/lib/domain/email";
import { makeApartment } from "@/lib/dashboard/testing/apartments";
import {
  IngestionError,
  processIncomingEmail,
  type IngestionStore,
} from "@/lib/ingest/pipeline";
import type { ParseOutcome, ParsedApartment } from "@/lib/parsers/types";

const email: IncomingEmail = {
  providerMessageId: "email_1",
  receivedAt: new Date("2026-09-24T08:00:00Z"),
  from: "Ich <ich@example.org>",
  to: ["wohnungen@inbound.example.com"],
  subject: "Fwd: Neue Wohnungen",
  text: "Angebote: https://www.immowelt.de/expose/1 https://www.immowelt.de/expose/2",
  html: null,
};

function listing(overrides: Partial<ParsedApartment> = {}): ParsedApartment {
  return {
    source: "immowelt",
    sourceUrl: null,
    sourceId: null,
    title: "3-Zimmer-Wohnung mit Balkon",
    address: null,
    district: "Plagwitz",
    rooms: 3,
    sqm: 95,
    rentCold: null,
    rentWarm: 1250,
    floor: null,
    description: "Helle Wohnung im Altbau, Badewanne.",
    imageUrl: null,
    ...overrides,
  };
}

const parsed = (apartments: ParsedApartment[]): (() => ParseOutcome) => () => ({
  status: "parsed",
  parserVersion: "test@1.0.0",
  apartments,
  failures: [],
});

/** In-memory IngestionStore recording every call. */
function memoryStore(options: { existing?: EmailParseStatus; failOn?: keyof IngestionStore; stored?: number } = {}) {
  const calls: string[] = [];
  const inserted: NewApartment[] = [];
  const upserted: NewApartment[] = [];
  const results: EmailParseResult[] = [];
  let storedEmail: StoredEmail | null = null;

  const maybeFail = (name: keyof IngestionStore) => {
    calls.push(name);
    if (options.failOn === name) throw new Error(`${name} unavailable`);
  };

  const store: IngestionStore = {
    async createInboundEmail(input: NewInboundEmail) {
      maybeFail("createInboundEmail");
      const created = options.existing === undefined;
      storedEmail = {
        ...input,
        id: "row-1",
        parserVersion: null,
        parseStatus: options.existing ?? "pending",
        parseError: null,
      };
      return { email: storedEmail, created };
    },
    async updateEmailParseResult(_id, result) {
      maybeFail("updateEmailParseResult");
      results.push(result);
      return { ...storedEmail!, ...result };
    },
    async insertApartment(apartment) {
      maybeFail("insertApartment");
      inserted.push(apartment);
      return makeApartment({ ...apartment }) as Apartment;
    },
    async upsertApartment(apartment) {
      maybeFail("upsertApartment");
      upserted.push(apartment);
      return makeApartment({ ...apartment }) as Apartment;
    },
    async countApartmentsWithoutSourceId() {
      maybeFail("countApartmentsWithoutSourceId");
      return options.stored ?? 0;
    },
  };
  return { store, calls, inserted, upserted, results, stored: () => storedEmail };
}

describe("processIncomingEmail", () => {
  it("stores the raw email first, with the detected source from the body links", async () => {
    const { store, calls, stored } = memoryStore();
    await processIncomingEmail(email, store);

    expect(calls[0]).toBe("createInboundEmail");
    expect(stored()).toMatchObject({
      providerMessageId: "email_1",
      detectedSource: "immowelt",
      text: email.text,
      to: ["wohnungen@inbound.example.com"],
    });
  });

  it("marks an unknown email unrecognized and creates no apartments", async () => {
    const { store, inserted, upserted, results } = memoryStore();
    const result = await processIncomingEmail(email, store);

    expect(result).toEqual({
      outcome: "processed",
      emailId: "row-1",
      parseStatus: "unrecognized",
      apartments: 0,
      reprocessed: false,
    });
    expect(inserted).toEqual([]);
    expect(upserted).toEqual([]);
    expect(results).toEqual([
      { parseStatus: "unrecognized", parserVersion: "generic@0.1.0", parseError: null },
    ]);
  });

  it.each(["parsed", "unrecognized"] as const)(
    "stops on a duplicate that already finished (%s)",
    async (existing) => {
      let parserRan = false;
      const { store, calls } = memoryStore({ existing });
      const result = await processIncomingEmail(email, store, () => {
        parserRan = true;
        return parsed([])();
      });

      expect(result).toEqual({ outcome: "duplicate", emailId: "row-1", parseStatus: existing });
      expect(calls).toEqual(["createInboundEmail"]);
      expect(parserRan).toBe(false);
    },
  );

  it("turns parser output into apartments with merged features and a fingerprint", async () => {
    const { store, inserted, results } = memoryStore();
    const result = await processIncomingEmail(email, store, parsed([listing()]));

    expect(result).toMatchObject({ parseStatus: "parsed", apartments: 1 });
    expect(inserted).toHaveLength(1);
    expect(inserted[0]).toMatchObject({
      emailId: "row-1",
      balcony: true,
      bathtub: true,
      buildingType: "altbau",
      topFloor: null,
      fingerprint: "plagwitz|3|95|1250",
    });
    expect(results[0]).toMatchObject({ parseStatus: "parsed", parserVersion: "test@1.0.0" });
  });

  it("lets structured parser values beat text extraction", async () => {
    const { store, inserted } = memoryStore();
    await processIncomingEmail(
      email,
      store,
      parsed([listing({ features: { balcony: false, bathtub: null, buildingType: "neubau" } })]),
    );

    expect(inserted[0]).toMatchObject({
      balcony: false, // structured false wins over "mit Balkon" in the title
      bathtub: true, // structured null falls back to the text
      buildingType: "neubau",
    });
  });

  it("upserts listings with a source id and inserts the rest", async () => {
    const { store, inserted, upserted } = memoryStore();
    await processIncomingEmail(
      email,
      store,
      parsed([listing({ sourceId: "expose-1" }), listing({ sourceId: null, district: "Lindenau" })]),
    );

    expect(upserted.map((a) => a.sourceId)).toEqual(["expose-1"]);
    expect(inserted.map((a) => a.district)).toEqual(["Lindenau"]);
  });

  it("never sends workflow fields, so an upsert keeps status, favorite and first seen", async () => {
    const { store, upserted } = memoryStore();
    await processIncomingEmail(email, store, parsed([listing({ sourceId: "expose-1" })]));

    expect(upserted[0]).not.toHaveProperty("status");
    expect(upserted[0]).not.toHaveProperty("isFavorite");
    expect(upserted[0]).not.toHaveProperty("firstSeen");
  });

  it("records a parser failure as failed without throwing (no retry)", async () => {
    const { store, results } = memoryStore();
    const result = await processIncomingEmail(email, store, () => ({
      status: "failed",
      parserVersion: "generic@0.1.0",
      apartments: [],
      failures: [{ parser: "immowelt", stage: "parse", message: "Unerwartetes Format" }],
    }));

    expect(result).toMatchObject({ outcome: "processed", parseStatus: "failed" });
    expect(results[0]).toEqual({
      parseStatus: "failed",
      parserVersion: "generic@0.1.0",
      parseError: "immowelt (parse): Unerwartetes Format",
    });
  });

  it("keeps the raw email when the parser registry itself throws", async () => {
    const { store, calls, results } = memoryStore();
    const result = await processIncomingEmail(email, store, () => {
      throw new Error("registry broken");
    });

    expect(calls[0]).toBe("createInboundEmail");
    expect(result).toMatchObject({ parseStatus: "failed" });
    expect(results[0].parseError).toContain("registry broken");
  });

  it("throws a retryable IngestionError when the raw email cannot be stored", async () => {
    const { store } = memoryStore({ failOn: "createInboundEmail" });
    await expect(processIncomingEmail(email, store)).rejects.toMatchObject({
      name: "IngestionError",
      stage: "store_email",
      emailId: null,
    });
  });

  it("marks the email failed and throws when storing apartments fails", async () => {
    const { store, results } = memoryStore({ failOn: "insertApartment" });
    const error = await processIncomingEmail(email, store, parsed([listing()])).catch((e) => e);

    expect(error).toBeInstanceOf(IngestionError);
    expect(error.stage).toBe("persist_apartments");
    expect(results).toEqual([
      expect.objectContaining({ parseStatus: "failed", parseError: expect.stringContaining("insertApartment unavailable") }),
    ]);
  });

  it("throws when the final status update fails (email stays pending for the retry)", async () => {
    const { store } = memoryStore({ failOn: "updateEmailParseResult" });
    await expect(processIncomingEmail(email, store)).rejects.toMatchObject({ stage: "update_status" });
  });

  it.each(["pending", "failed"] as const)(
    "reprocesses a redelivered email left %s, skipping listings already stored",
    async (existing) => {
      const { store, inserted, upserted } = memoryStore({ existing, stored: 1 });
      const result = await processIncomingEmail(
        email,
        store,
        parsed([
          listing({ district: "Erste" }),
          listing({ sourceId: "expose-9" }),
          listing({ district: "Zweite" }),
        ]),
      );

      expect(result).toMatchObject({ outcome: "processed", reprocessed: true, apartments: 3 });
      expect(inserted.map((a) => a.district)).toEqual(["Zweite"]); // "Erste" was stored before
      expect(upserted.map((a) => a.sourceId)).toEqual(["expose-9"]); // upsert is idempotent anyway
    },
  );

  it("does not look up stored listings for a brand-new email", async () => {
    const { store, calls } = memoryStore();
    await processIncomingEmail(email, store, parsed([listing()]));
    expect(calls).not.toContain("countApartmentsWithoutSourceId");
  });
});
