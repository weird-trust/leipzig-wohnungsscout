import { describe, expect, it } from "vitest";
import type { IncomingEmail } from "@/lib/domain/email";
import { genericParser } from "@/lib/parsers/generic";
import { parseEmail, PLATFORM_PARSERS } from "@/lib/parsers/index";
import type { ApartmentParser, ParsedApartment } from "@/lib/parsers/types";

// Test doubles only; no real platform formats are modelled here.
const incoming: IncomingEmail = {
  providerMessageId: "email-1",
  to: ["wohnungen@inbound.example.com"],
  from: "Suchauftrag <alert@example.com>",
  subject: "2 neue Wohnungen in Leipzig",
  text: "3-Zimmer-Wohnung in Gohlis, 98 m², 1.250 € warm",
  html: null,
  receivedAt: new Date("2026-09-24T08:00:00Z"),
};

const listing: ParsedApartment = {
  source: "other",
  sourceUrl: null,
  sourceId: null,
  title: "3-Zimmer-Wohnung in Gohlis",
  address: null,
  district: "Gohlis",
  rooms: 3,
  sqm: 98,
  rentCold: null,
  rentWarm: 1250,
  floor: null,
  description: null,
  imageUrl: null,
};

function fakeParser(name: string, overrides: Partial<ApartmentParser>): ApartmentParser {
  return {
    name,
    version: "1.0.0",
    canParse: () => true,
    parse: () => [listing],
    ...overrides,
  };
}

const throwing = (): never => {
  throw new Error("Unerwartetes Format");
};

describe("genericParser", () => {
  it("accepts every email but extracts nothing", () => {
    expect(genericParser.canParse(incoming)).toBe(true);
    expect(genericParser.parse(incoming)).toEqual([]);
  });
});

describe("parseEmail", () => {
  it("has no platform parsers until real fixtures exist", () => {
    expect(PLATFORM_PARSERS).toEqual([]);
  });

  it("marks an email as unrecognized when only the fallback runs", () => {
    expect(parseEmail(incoming)).toEqual({
      status: "unrecognized",
      parserVersion: "generic@0.1.0",
      apartments: [],
      failures: [],
    });
  });

  it("uses the first parser that returns apartments", () => {
    const outcome = parseEmail(incoming, [
      fakeParser("skipped", { canParse: () => false }),
      fakeParser("empty", { parse: () => [] }),
      fakeParser("match", {}),
      fakeParser("never-reached", { parse: throwing }),
    ]);

    expect(outcome.status).toBe("parsed");
    expect(outcome.parserVersion).toBe("match@1.0.0");
    expect(outcome.apartments).toEqual([listing]);
    expect(outcome.failures).toEqual([]);
  });

  it("isolates a parser that throws in parse and keeps going", () => {
    const outcome = parseEmail(incoming, [
      fakeParser("broken", { parse: throwing }),
      fakeParser("match", {}),
    ]);

    expect(outcome.status).toBe("parsed");
    expect(outcome.apartments).toEqual([listing]);
    expect(outcome.failures).toEqual([
      { parser: "broken", stage: "parse", message: "Unerwartetes Format" },
    ]);
  });

  it("isolates a parser that throws in canParse", () => {
    const outcome = parseEmail(incoming, [fakeParser("broken", { canParse: throwing })]);

    expect(outcome.status).toBe("failed");
    expect(outcome.parserVersion).toBe("generic@0.1.0");
    expect(outcome.failures).toEqual([
      { parser: "broken", stage: "canParse", message: "Unerwartetes Format" },
    ]);
  });

  it("never throws, even when the fallback throws", () => {
    const outcome = parseEmail(
      incoming,
      [fakeParser("broken", { parse: throwing })],
      fakeParser("broken-fallback", {
        parse: () => {
          throw "kein Error-Objekt";
        },
      }),
    );

    expect(outcome.status).toBe("failed");
    expect(outcome.apartments).toEqual([]);
    expect(outcome.failures.map((failure) => failure.message)).toEqual([
      "Unerwartetes Format",
      "kein Error-Objekt",
    ]);
  });
});
