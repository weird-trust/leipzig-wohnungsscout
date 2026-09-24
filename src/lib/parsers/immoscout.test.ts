import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { IncomingEmail } from "@/lib/domain/email";
import { fixtureFileSchema, fixtureToIncomingEmail } from "@/lib/ingest/fixtureFile";
import { toNewApartment } from "@/lib/ingest/normalize";
import { parseEmail } from "@/lib/parsers";
import {
  districtFromAddress,
  immoscoutParser,
  parseGermanEuro,
  parseListingLink,
  parseRoomCount,
  parseSquareMeters,
} from "@/lib/parsers/immoscout";

/**
 * Regression tests against the real (reviewed, redacted) ImmoScout alert.
 * Changing these expectations requires a deliberate parser migration.
 */
const FIXTURE = "fixtures/emails/immoscout/alert-01.json";

function loadFixture(): IncomingEmail {
  const file = fixtureFileSchema.parse(JSON.parse(readFileSync(FIXTURE, "utf-8")));
  return fixtureToIncomingEmail(file, new Date("2026-09-24T13:36:22.146Z"));
}

const email = loadFixture();
const apartments = immoscoutParser.parse(email);
const [apartment] = apartments;

describe("ImmoScout alert-01 (real fixture)", () => {
  it("is recognized by the ImmoScout parser", () => {
    expect(immoscoutParser.canParse(email)).toBe(true);
  });

  it("is selected by parseEmail()", () => {
    const outcome = parseEmail(email);
    expect(outcome.status).toBe("parsed");
    expect(outcome.parserVersion).toBe("immoscout@1.0.0");
    expect(outcome.failures).toEqual([]);
    expect(outcome.apartments).toEqual(apartments);
  });

  it("contains exactly one listing", () => {
    expect(apartments).toHaveLength(1);
  });

  it("extracts every field present in the alert", () => {
    expect(apartment).toMatchObject({
      source: "immoscout",
      title: "Inkl. Balkon & neuer EBK!",
      sourceUrl: "https://push.search.is24.de/email/expose/171164085",
      sourceId: "171164085",
      address: "Beispielstraße 5A, Südvorstadt, Leipzig",
      district: "Südvorstadt",
      rentCold: 1099,
      sqm: 77,
      rooms: 3,
      description: "Balkon/Terrasse, Einbauküche",
    });
  });

  it("leaves fields the alert does not contain null", () => {
    expect(apartment).toMatchObject({ rentWarm: null, floor: null, imageUrl: null });
  });

  it("sets no structured features (the feature line is free text)", () => {
    expect(apartment).not.toHaveProperty("features");
  });

  it("does not turn navigation, search-management or footer links into listings", () => {
    const urls = apartments.map((a) => a.sourceUrl);
    expect(urls).toEqual(["https://push.search.is24.de/email/expose/171164085"]);
    for (const text of [
      "executeSavedSearch",
      "savedsearch/anonymous/delete",
      "savedsearch/myscout/manage",
      "impressum",
    ]) {
      expect(email.text).toContain(text); // present in the fixture…
      expect(JSON.stringify(apartments)).not.toContain(text); // …but never parsed
    }
  });

  it("keeps the embedded HTML footer and navigation out of the description", () => {
    expect(apartment.description).not.toMatch(/<|FOOTER|Alle Angebote|Suchauftrag|-{5}/);
  });

  it("normalizes through the pipeline step into the expected apartment", () => {
    expect(toNewApartment(apartment, "email-row")).toEqual({
      source: "immoscout",
      sourceUrl: "https://push.search.is24.de/email/expose/171164085",
      sourceId: "171164085",
      title: "Inkl. Balkon & neuer EBK!",
      address: "Beispielstraße 5A, Südvorstadt, Leipzig",
      district: "Südvorstadt",
      rooms: 3,
      sqm: 77,
      rentCold: 1099,
      rentWarm: null,
      floor: null,
      description: "Balkon/Terrasse, Einbauküche",
      imageUrl: null,
      // Generic text extraction: "Balkon" → balcony; "Einbauküche"/"EBK" is not a Wohnküche.
      topFloor: null,
      balcony: true,
      bathtub: null,
      residentialKitchen: null,
      elevator: null,
      buildingType: "unknown",
      emailId: "email-row",
      // The fingerprint needs warm rent, which this alert format does not include.
      fingerprint: null,
    });
  });
});

describe("immoscoutParser.canParse", () => {
  const base = loadFixture();

  it("does not claim an unrelated email", () => {
    expect(
      immoscoutParser.canParse({ ...base, from: "Hausverwaltung <info@example.com>", text: "Titel: Mieterhöhung" }),
    ).toBe(false);
  });

  it("does not claim an ImmoScout email without listing blocks", () => {
    expect(immoscoutParser.canParse({ ...base, text: "Ihr Passwort wurde geändert." })).toBe(false);
    expect(immoscoutParser.canParse({ ...base, text: null })).toBe(false);
  });

  it("recognizes a forwarded alert by its listing link", () => {
    expect(immoscoutParser.canParse({ ...base, from: "Ich <ich@example.org>" })).toBe(true);
  });
});

describe("parseListingLink", () => {
  it("drops tracking parameters and extracts the numeric id", () => {
    expect(
      parseListingLink("https://push.search.is24.de/email/expose/171164085?PID=x&savedSearchId=1&utm_medium=email"),
    ).toEqual({ sourceUrl: "https://push.search.is24.de/email/expose/171164085", sourceId: "171164085" });
  });

  it.each([
    ["non-numeric id", "https://push.search.is24.de/email/expose/abc"],
    ["extra path segment", "https://push.search.is24.de/email/expose/171164085/x"],
    ["other host", "https://example.com/email/expose/171164085"],
  ])("gives no source id for a %s", (_, link) => {
    expect(parseListingLink(link).sourceId).toBeNull();
  });

  it("returns nulls for something that is not a URL", () => {
    expect(parseListingLink("siehe Anhang")).toEqual({ sourceUrl: null, sourceId: null });
    expect(parseListingLink("javascript:alert(1)")).toEqual({ sourceUrl: null, sourceId: null });
  });
});

describe("German number helpers", () => {
  it.each([
    ["1.099 €", 1099],
    ["850 €", 850],
    ["1.099,50 €", 1099.5],
    ["1.099", null],
    ["ca. 1.100 €", null],
    ["1,099.00 €", null],
    ["", null],
  ])("rent %j → %j", (input, expected) => {
    expect(parseGermanEuro(input)).toBe(expected);
  });

  it.each([
    ["77 m²", 77],
    ["77,5 m²", 77.5],
    ["77", null],
    ["77 qm", null],
  ])("area %j → %j", (input, expected) => {
    expect(parseSquareMeters(input)).toBe(expected);
  });

  it.each([
    ["3", 3],
    ["3,5", 3.5],
    ["0", null],
    ["drei", null],
    ["3-4", null],
  ])("rooms %j → %j", (input, expected) => {
    expect(parseRoomCount(input)).toBe(expected);
  });
});

describe("districtFromAddress", () => {
  it("takes the part before a trailing Leipzig", () => {
    expect(districtFromAddress("Beispielstraße 5A, Südvorstadt, Leipzig")).toBe("Südvorstadt");
  });

  it.each([
    ["no district part", "Beispielstraße 5A, Leipzig"],
    ["another city", "Beispielstraße 5A, Mitte, Berlin"],
    ["postcode instead of district", "Beispielstraße 5A, 04275, Leipzig"],
    ["no address", null],
  ])("returns null for %s", (_, address) => {
    expect(districtFromAddress(address)).toBeNull();
  });
});
