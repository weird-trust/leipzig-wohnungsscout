import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { IncomingEmail } from "@/lib/domain/email";
import { fixtureFileSchema, fixtureToIncomingEmail } from "@/lib/ingest/fixtureFile";
import { toNewApartment } from "@/lib/ingest/normalize";
import { parseEmail } from "@/lib/parsers";
import {
  addressFromLocation,
  ohneMaklerParser,
  parseGermanDecimal,
  parseListingUrl,
} from "@/lib/parsers/ohneMakler";
import { detectSource } from "@/lib/sourceDetection";

/**
 * Regression tests against the real (reviewed, redacted) Ohne-Makler alert.
 * Changing these expectations requires a deliberate parser migration.
 */
function loadFixture(path: string): IncomingEmail {
  const file = fixtureFileSchema.parse(JSON.parse(readFileSync(path, "utf-8")));
  return fixtureToIncomingEmail(file, new Date("2026-09-24T15:03:47.625Z"));
}

const email = loadFixture("fixtures/emails/ohne-makler/alert-01.json");
const apartments = ohneMaklerParser.parse(email);
const normalized = apartments.map((apartment) => toNewApartment(apartment, "email-row"));

const EXPECTED = [
  {
    sourceId: "498369",
    title: "Kernsanierte 2-Zimmer-Wohnung mit großem Balkon und Luxus-Einbauküche zu vermieten",
    rooms: 2,
    sqm: 74,
    address: null,
    location: "04299 Leipzig",
  },
  {
    sourceId: "498366",
    title: "Neu sanierte 3-Zimmer-Wohnung mit großem Balkon zu vermieten",
    rooms: 3,
    sqm: 77,
    address: null,
    location: "04129 Leipzig",
  },
  {
    sourceId: "498178",
    title: "Neu sanierte 3-Zimmer-Wohnung mit Luxus-Einbauküche großem Balkon zu vermieten",
    rooms: 3,
    sqm: 87,
    address: "Musterstraße 9, 04177 Leipzig",
    location: "Musterstraße 9, 04177 Leipzig",
  },
] as const;

describe("Ohne-Makler alert-01 (real fixture)", () => {
  it("is detected as Ohne-Makler by its sender", () => {
    expect(email.from).toBe("info@suchauftrag.ohne-makler.net");
    expect(detectSource(email)).toEqual({ source: "ohne-makler", matchedBy: "sender" });
  });

  it("is selected by parseEmail() as ohne-makler@1.0.0", () => {
    const outcome = parseEmail(email);
    expect(outcome.status).toBe("parsed");
    expect(outcome.parserVersion).toBe("ohne-makler@1.0.0");
    expect(outcome.failures).toEqual([]);
    expect(outcome.apartments).toEqual(apartments);
  });

  it("produces exactly three apartments although every URL appears three times", () => {
    for (const { sourceId } of EXPECTED) {
      expect(email.text?.split(`/immobilie/${sourceId}/`).length).toBe(4);
    }
    expect(apartments.map((a) => a.sourceId)).toEqual(["498369", "498366", "498178"]);
  });

  it.each(EXPECTED.map((expected, index) => [expected.sourceId, index] as const))(
    "keeps listing %s's own title, rooms, area and location",
    (_, index) => {
      const expected = EXPECTED[index];
      expect(apartments[index]).toEqual({
        source: "ohne-makler",
        sourceId: expected.sourceId,
        sourceUrl: `https://www.ohne-makler.net/immobilie/${expected.sourceId}/`,
        title: expected.title,
        rooms: expected.rooms,
        sqm: expected.sqm,
        address: expected.address,
        district: null,
        rentCold: null,
        rentWarm: null,
        floor: null,
        description: null,
        imageUrl: null,
      });
      // The location really belongs to this row in the fixture.
      const row = email.text!.split("\n").find((line) => line.includes(`/immobilie/${expected.sourceId}/`));
      expect(row).toContain(`in ${expected.location}`);
    },
  );

  it("does not map the displayed Miete to cold or warm rent", () => {
    for (const miete of ["Miete: 790 €", "Miete: 890 €", "Miete: 1.150 €"]) {
      expect(email.text).toContain(miete);
    }
    for (const apartment of apartments) {
      expect(apartment).toMatchObject({ rentCold: null, rentWarm: null });
    }
  });

  it("extracts balcony from the titles but not a Wohnküche from Einbauküche", () => {
    for (const apartment of normalized) {
      expect(apartment).toMatchObject({
        balcony: true,
        residentialKitchen: null,
        topFloor: null,
        bathtub: null,
        elevator: null,
        buildingType: "unknown", // "(kern)sanierte" does not mean Altbau
        fingerprint: null, // no district, no warm rent
      });
    }
  });

  it("creates no listings from saved-search, unsubscribe or imprint links", () => {
    for (const url of [
      "https://www.ohne-makler.net/suchauftrag/REDACTED/edit/",
      "https://www.ohne-makler.net/suchauftrag/abbestellen/REDACTED/",
    ]) {
      expect(email.text).toContain(url);
    }
    const text = email.text!;
    const withoutRows = text
      .split("\n")
      .filter((line) => !line.startsWith("| ("))
      .join("\n");
    const managementOnly = { ...email, text: withoutRows };
    expect(ohneMaklerParser.canParse(managementOnly)).toBe(false);
    expect(ohneMaklerParser.parse(managementOnly)).toEqual([]);
  });

  it("deduplicates a listing whose row appears twice", () => {
    const firstRow = email.text!.split("\n").find((line) => line.includes("/immobilie/498369/"))!;
    const doubled = { ...email, text: `${email.text}\n${firstRow}\n` };
    expect(ohneMaklerParser.parse(doubled).map((a) => a.sourceId)).toEqual(["498369", "498366", "498178"]);
  });

  it("does not claim the ImmoScout or Kleinanzeigen fixtures", () => {
    for (const path of [
      "fixtures/emails/immoscout/alert-01.json",
      "fixtures/emails/immoscout/alert-02-multiple.json",
      "fixtures/emails/kleinanzeigen/alert-01.json",
    ]) {
      expect(ohneMaklerParser.canParse(loadFixture(path))).toBe(false);
    }
  });

  it("recognizes a forwarded alert by its listing rows", () => {
    const forwarded = { ...email, from: "Ich <ich@example.org>" };
    expect(ohneMaklerParser.canParse(forwarded)).toBe(true);
    expect(detectSource(forwarded)).toEqual({ source: "ohne-makler", matchedBy: "links" });
  });
});

describe("parseGermanDecimal", () => {
  it.each([
    ["3,00", 3],
    ["2,00", 2],
    ["3,5", 3.5],
    ["87,00", 87],
    ["74", 74],
  ])("%j → %j", (input, expected) => {
    expect(parseGermanDecimal(input)).toBe(expected);
  });

  it.each(["3.5", "1.234,00", "drei", "3,", ",5", "0,00", "", "3,00 m²", undefined])(
    "%j → null",
    (input) => {
      expect(parseGermanDecimal(input)).toBeNull();
    },
  );
});

describe("addressFromLocation", () => {
  it("accepts a street with house number before postcode and city", () => {
    expect(addressFromLocation("Musterstraße 9, 04177 Leipzig")).toBe("Musterstraße 9, 04177 Leipzig");
  });

  it.each([
    ["postcode and city only", "04129 Leipzig"],
    ["street without house number", "Musterstraße, 04177 Leipzig"],
    ["no postcode", "Musterstraße 9, Leipzig"],
    ["district-like text", "Leipzig-Plagwitz"],
    ["nothing", null],
  ])("returns null for %s", (_, location) => {
    expect(addressFromLocation(location)).toBeNull();
  });
});

describe("parseListingUrl", () => {
  it("accepts the exact listing URL and drops the query string", () => {
    expect(parseListingUrl("https://www.ohne-makler.net/immobilie/498369/?utm_source=autosearch")).toEqual({
      sourceUrl: "https://www.ohne-makler.net/immobilie/498369/",
      sourceId: "498369",
    });
  });

  it.each([
    ["non-numeric id", "https://www.ohne-makler.net/immobilie/abc/"],
    ["missing trailing slash", "https://www.ohne-makler.net/immobilie/498369"],
    ["extra path segment", "https://www.ohne-makler.net/immobilie/498369/bilder/"],
    ["wrong host", "https://suchauftrag.ohne-makler.net/immobilie/498369/"],
    ["other domain", "https://example.com/immobilie/498369/"],
    ["saved-search link", "https://www.ohne-makler.net/suchauftrag/444879/edit/"],
    ["not a URL", "Exposé anzeigen"],
  ])("rejects a %s", (_, url) => {
    expect(parseListingUrl(url)).toBeNull();
  });
});
