import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { IncomingEmail } from "@/lib/domain/email";
import { fixtureFileSchema, fixtureToIncomingEmail } from "@/lib/ingest/fixtureFile";
import { toNewApartment } from "@/lib/ingest/normalize";
import { parseEmail } from "@/lib/parsers";
import {
  districtFromLocation,
  immoweltParser,
  parseExposeUrl,
  parseKaltmiete,
  parseRoomsAndArea,
  parseWarmmiete,
  postcodeFromLocation,
} from "@/lib/parsers/immowelt";
import { detectSource } from "@/lib/sourceDetection";

/**
 * Regression tests against the real (reviewed, redacted, link-resolved)
 * Immowelt alert. Changing these expectations requires a deliberate migration.
 */
function loadFixture(path: string): IncomingEmail {
  const file = fixtureFileSchema.parse(JSON.parse(readFileSync(path, "utf-8")));
  return fixtureToIncomingEmail(file, new Date("2026-09-24T18:48:42.089Z"));
}

const email = loadFixture("fixtures/emails/immowelt/alert-01.json");
const apartments = immoweltParser.parse(email);
const normalized = apartments.map((apartment) => toNewApartment(apartment, "email-row"));

const EXPECTED = [
  ["0fe5b1ed-db33-4796-bbd8-2c2ee9c9e459", "Inkl. Aufzug und neuer Einbauküche!", 1199, 3, 85, "Südvorstadt", "04275"],
  ["f2e06b10-a30a-4799-b472-374e5023223a", "Wohnen mit Weitblick_helle 3-Zimmer-Dachgeschosswo...", 700, 3, 64.64, "Wahren", "04159"],
  ["bb8aa4d3-357f-4940-9232-e1bc74f095a3", "Erstbezug nach Modernisierung! Inkl. EBK", 929, 3, 64, "Schönefeld-Abtnaundorf", "04347"],
  ["286a483b-704a-4cd4-b45c-e2603bdc0b25", "Maisonette-Wohnung inkl. EBK", 899, 3.5, 65, "Schönefeld-Abtnaundorf", "04347"],
  ["03a6cf24-7b46-4d3d-8dd8-0fb448ddf3a0", "Inkl. Balkon und EBK", 1349, 4, 95, "Gohlis-Süd", "04155"],
  ["baf7a139-5e15-488e-82d8-b939303bf33c", "4-RW inkl. großem Balkon und neuer Einbauküche! *I...", 1349, 4, 94, "Plagwitz", "04229"],
] as const;

describe("Immowelt alert-01 (real fixture, link-resolved)", () => {
  it("is detected as Immowelt by its sender", () => {
    expect(email.from).toBe("angebot@suchen.immowelt.de");
    expect(detectSource(email)).toEqual({ source: "immowelt", matchedBy: "sender" });
  });

  it("is selected by parseEmail() as immowelt@1.2.0", () => {
    const outcome = parseEmail(email);
    expect(outcome.status).toBe("parsed");
    expect(outcome.parserVersion).toBe("immowelt@1.2.0");
    expect(outcome.failures).toEqual([]);
    expect(outcome.apartments).toEqual(apartments);
  });

  it("produces exactly six apartments with unique, correct ids", () => {
    expect(apartments.map((a) => a.sourceId)).toEqual(EXPECTED.map(([id]) => id));
    expect(new Set(apartments.map((a) => a.sourceId)).size).toBe(6);
  });

  it.each(EXPECTED.map((expected, index) => [expected[1], index] as const))(
    "keeps %j attached to its own rent, rooms, area, district and postcode",
    (_, index) => {
      const [id, title, rentCold, rooms, sqm, district, postcode] = EXPECTED[index];
      expect(apartments[index]).toEqual({
        source: "immowelt",
        sourceId: id,
        sourceUrl: `https://www.immowelt.de/expose/${id}`,
        title,
        rentCold,
        rooms,
        sqm,
        district,
        postcode,
        address: null,
        rentWarm: null,
        floor: null,
        description: null,
        imageUrl: null,
      });
    },
  );

  it("parses the real NBSP price and German decimals", () => {
    expect(email.text).toContain("1.199\u00a0€ Kaltmiete");
    expect(apartments[0].rentCold).toBe(1199);
    expect(apartments[3].rooms).toBe(3.5); // "3,5 Zimmer"
    expect(apartments[1].sqm).toBe(64.64); // "64,64 m²"
  });

  it("leaves address, warm rent and fingerprint null for all six", () => {
    for (const apartment of normalized) {
      expect(apartment).toMatchObject({ address: null, rentWarm: null, fingerprint: null });
    }
  });

  it("extracts features from the titles through the generic step", () => {
    const features = normalized.map(({ topFloor, balcony, elevator }) => ({ topFloor, balcony, elevator }));
    expect(features).toEqual([
      { topFloor: null, balcony: null, elevator: true }, // "Aufzug"
      { topFloor: true, balcony: null, elevator: null }, // "Dachgeschosswo..."
      { topFloor: null, balcony: null, elevator: null },
      { topFloor: null, balcony: null, elevator: null },
      { topFloor: null, balcony: true, elevator: null }, // "Balkon"
      { topFloor: null, balcony: true, elevator: null }, // "großem Balkon"
    ]);
    for (const apartment of normalized) {
      // EBK / Einbauküche is not a Wohnküche.
      expect(apartment).toMatchObject({ residentialKitchen: null, bathtub: null, buildingType: "unknown" });
    }
  });

  it("creates no apartments from the footer, including its \"0 €\" price text", () => {
    const text = email.text!;
    expect(text).toContain("Der Preis von 0 € gilt nur für private Anbieter");
    for (const label of ["SCHUFA-BonitätsCheck", "Jetzt inserieren", "Suchauftrag bearbeiten", "Abmelden"]) {
      expect(text).toContain(label);
    }
    const footer = text.slice(text.lastIndexOf("Mehr Informationen") + "Mehr Informationen".length);
    const footerOnly = { ...email, text: footer };
    expect(immoweltParser.canParse(footerOnly)).toBe(false);
    expect(immoweltParser.parse(footerOnly)).toEqual([]);
    expect(apartments).toHaveLength(6);
  });

  it("does not recognize an unresolved listing (tracking link instead of expose URL)", () => {
    const unresolved = email.text!.replace(
      "https://www.immowelt.de/expose/0fe5b1ed-db33-4796-bbd8-2c2ee9c9e459",
      "https://click.by.immowelt.de/?qs=abc",
    );
    const ids = immoweltParser.parse({ ...email, text: unresolved }).map((a) => a.sourceId);
    expect(ids).not.toContain("0fe5b1ed-db33-4796-bbd8-2c2ee9c9e459");
    expect(ids).toHaveLength(5);
  });

  it("does not claim the other platforms' real fixtures", () => {
    for (const path of [
      "fixtures/emails/immoscout/alert-01.json",
      "fixtures/emails/immoscout/alert-02-multiple.json",
      "fixtures/emails/kleinanzeigen/alert-01.json",
      "fixtures/emails/ohne-makler/alert-01.json",
    ]) {
      const other = loadFixture(path);
      expect(immoweltParser.canParse(other)).toBe(false);
      expect(parseEmail(other).parserVersion).not.toMatch(/^immowelt@/);
    }
  });

  it("recognizes a forwarded, resolved alert by its expose URLs", () => {
    const forwarded = { ...email, from: "Ich <ich@example.org>" };
    expect(immoweltParser.canParse(forwarded)).toBe(true);
    expect(detectSource(forwarded)).toEqual({ source: "immowelt", matchedBy: "links" });
  });
});

describe("parseKaltmiete", () => {
  it.each([
    ["1.199 € Kaltmiete", 1199],
    ["1.199\u00a0€ Kaltmiete", 1199],
    ["700 € Kaltmiete", 700],
    ["1.349 € Kaltmiete", 1349],
  ])("%j → %j", (line, expected) => {
    expect(parseKaltmiete(line)).toBe(expected);
  });

  it.each(["700 €", "700 € Warmmiete", "ca. 700 € Kaltmiete", "1,199.00 € Kaltmiete", "€ Kaltmiete", "Der Preis von 0 € gilt"])(
    "%j → null",
    (line) => {
      expect(parseKaltmiete(line)).toBeNull();
    },
  );
});

describe("parseWarmmiete", () => {
  it.each([
    ["1.350 €/Monat Warmmiete", 1350],
    ["1.350\u00a0€/Monat Warmmiete", 1350],
    ["890,50 €/Monat Warmmiete", 890.5],
  ])("%j → %j", (line, expected) => {
    expect(parseWarmmiete(line)).toBe(expected);
  });

  it.each(["1.350 € Warmmiete", "1.350 €/Monat Kaltmiete", "1.199 € Kaltmiete", "ca. 1.350 €/Monat Warmmiete", "1.350 €/Monat"])(
    "%j → null",
    (line) => {
      expect(parseWarmmiete(line)).toBeNull();
    },
  );
});

describe("parseRoomsAndArea", () => {
  it.each([
    ["3 Zimmer . 85 m²", { rooms: 3, sqm: 85 }],
    ["3,5 Zimmer . 65 m²", { rooms: 3.5, sqm: 65 }],
    ["3 Zimmer . 64,64 m²", { rooms: 3, sqm: 64.64 }],
    ["3\u00a0Zimmer . 85\u00a0m²", { rooms: 3, sqm: 85 }],
  ])("%j → %j", (line, expected) => {
    expect(parseRoomsAndArea(line)).toEqual(expected);
  });

  it("gives null for a malformed part while keeping the other", () => {
    expect(parseRoomsAndArea("drei Zimmer . 85 m²")).toEqual({ rooms: null, sqm: 85 });
    expect(parseRoomsAndArea("3 Zimmer . 1.234,5 m²")).toEqual({ rooms: 3, sqm: null });
  });

  it.each(["3 Zimmer", "85 m²", "3 Zimmer, 85 m²", "Inkl. Balkon und EBK"])("does not match %j", (line) => {
    expect(parseRoomsAndArea(line)).toBeNull();
  });
});

describe("parseExposeUrl", () => {
  const ID = "0fe5b1ed-db33-4796-bbd8-2c2ee9c9e459";
  const CANONICAL = { sourceUrl: `https://www.immowelt.de/expose/${ID}`, sourceId: ID };

  it("accepts the canonical expose URL and removes query and fragment", () => {
    expect(parseExposeUrl(`https://www.immowelt.de/expose/${ID}`)).toEqual(CANONICAL);
    expect(parseExposeUrl(`https://www.immowelt.de/expose/${ID}?utm_source=mail`)).toEqual(CANONICAL);
    expect(parseExposeUrl(`https://www.immowelt.de/expose/${ID}#bilder`)).toEqual(CANONICAL);
  });

  it("accepts a 12-character alphanumeric id, normalized to lowercase", () => {
    const short = { sourceUrl: "https://www.immowelt.de/expose/26temfacszzi", sourceId: "26temfacszzi" };
    expect(parseExposeUrl("https://www.immowelt.de/expose/26temfacszzi")).toEqual(short);
    expect(parseExposeUrl("https://www.immowelt.de/expose/26TEMFACSZZI")).toEqual(short);
    expect(parseExposeUrl("https://www.immowelt.de/expose/26TemFacSzzi?utm_source=mail#bilder")).toEqual(short);
  });

  it("keeps UUID ids unchanged (lowercased)", () => {
    expect(parseExposeUrl(`https://www.immowelt.de/expose/${ID.toUpperCase()}`)).toEqual(CANONICAL);
  });

  it.each([
    ["11-character id", "https://www.immowelt.de/expose/26temfacszz"],
    ["13-character id", "https://www.immowelt.de/expose/26temfacszzia"],
    ["id with punctuation", "https://www.immowelt.de/expose/26temfac-szz"],
    ["id with underscore", "https://www.immowelt.de/expose/26temfac_szz"],
    ["id with a non-ASCII letter", "https://www.immowelt.de/expose/26temfacszzä"],
    ["arbitrary slug", "https://www.immowelt.de/expose/3-zimmer-wohnung-leipzig"],
    ["wl-cdp URL", "https://www.immowelt.de/wl-cdp/26TEMFACSZZI"],
    ["wrong host", `https://immowelt.de/expose/${ID}`],
    ["tracking host", "https://click.by.immowelt.de/?qs=abc"],
    ["malformed uuid", "https://www.immowelt.de/expose/0fe5b1ed-db33-4796-bbd8"],
    ["non-uuid id", "https://www.immowelt.de/expose/2xyz4ab"],
    ["extra path segment", `https://www.immowelt.de/expose/${ID}/bilder`],
    ["arbitrary immowelt URL", "https://www.immowelt.de/suche/leipzig/wohnungen/mieten"],
    ["plain http", `http://www.immowelt.de/expose/${ID}`],
  ])("rejects a %s", (_, url) => {
    expect(parseExposeUrl(url)).toBeNull();
  });
});

describe("postcodeFromLocation", () => {
  it("reads the parenthesized postcode line", () => {
    expect(postcodeFromLocation(["", " Südvorstadt, ", " Leipzig", " (04275)"])).toBe("04275");
    expect(postcodeFromLocation(["Dölitz-Dösen,", "Süd", "(04279)"])).toBe("04279");
  });

  it.each<[string, string[]]>([
    ["no postcode line", ["Südvorstadt,", "Leipzig"]],
    ["postcode without parentheses", ["Südvorstadt,", "Leipzig", "04275"]],
    ["four digits", ["Südvorstadt,", "Leipzig", "(0427)"]],
    ["text around the postcode", ["Südvorstadt,", "Leipzig (04275)"]],
  ])("returns null for %s", (_, lines) => {
    expect(postcodeFromLocation(lines)).toBeNull();
  });
});

describe("districtFromLocation", () => {
  it("takes the comma line before Leipzig and postcode, trimmed", () => {
    expect(districtFromLocation(["", " Südvorstadt, ", " ", " Leipzig", " (04275)", "  "])).toBe("Südvorstadt");
    expect(districtFromLocation(["Schönefeld-Abtnaundorf,", "Leipzig", "(04347)"])).toBe("Schönefeld-Abtnaundorf");
  });

  it.each([
    ["no district line", ["Leipzig", "(04275)"]],
    ["Leipzig as the comma line", ["Leipzig,", "Leipzig", "(04275)"]],
    ["postcode as the comma line", ["04275,", "Leipzig", "(04275)"]],
    ["no postcode line", ["Südvorstadt,", "Leipzig"]],
    ["district without comma", ["Südvorstadt", "Leipzig", "(04275)"]],
    ["missing postcode with another context", ["Dölitz-Dösen,", "Süd"]],
    ["only two lines", ["Dölitz-Dösen,", "(04279)"]],
    ["an extra line between district and context", ["Dölitz-Dösen,", "Süd", "Leipzig", "(04279)"]],
    ["a context line with digits", ["Dölitz-Dösen,", "04279 Süd", "(04279)"]],
    ["a context line with a comma", ["Dölitz-Dösen,", "Süd, Leipzig", "(04279)"]],
    ["a four-digit postcode", ["Dölitz-Dösen,", "Süd", "(0427)"]],
    ["a district line with digits", ["3 Zimmer,", "Süd", "(04279)"]],
  ])("returns null for %s", (_, lines) => {
    expect(districtFromLocation(lines)).toBeNull();
  });

  it("accepts any plain location-context line, e.g. Süd, without storing it", () => {
    expect(districtFromLocation([" Dölitz-Dösen, ", " ", " Süd", " (04279)", "  "])).toBe("Dölitz-Dösen");
    expect(districtFromLocation([" Reudnitz-Thonberg, ", " ", " Leipzig", " (04317)"])).toBe("Reudnitz-Thonberg");
    // The middle line is structural, not a city check (1.0.2 dropped the "Leipzig" requirement).
    expect(districtFromLocation(["Mitte,", "Berlin", "(10115)"])).toBe("Mitte");
  });
});

describe("Immowelt alert-02-alternatives (real fixture, link-resolved)", () => {
  const alternatives = loadFixture("fixtures/emails/immowelt/alert-02-alternatives.json");
  const parsed = immoweltParser.parse(alternatives);
  const stored = parsed.map((apartment) => toNewApartment(apartment, "email-row"));

  it("is parsed by immowelt@1.2.0", () => {
    expect(detectSource(alternatives)).toEqual({ source: "immowelt", matchedBy: "sender" });
    const outcome = parseEmail(alternatives);
    expect(outcome).toMatchObject({ status: "parsed", parserVersion: "immowelt@1.2.0", failures: [] });
    expect(outcome.apartments).toEqual(parsed);
  });

  it("produces exactly the two listings, UUID and short id", () => {
    expect(parsed.map((a) => [a.sourceId, a.sourceUrl])).toEqual([
      ["918f96ec-1cb0-47a8-ae27-64ec04bd8f02", "https://www.immowelt.de/expose/918f96ec-1cb0-47a8-ae27-64ec04bd8f02"],
      ["26temfacszzi", "https://www.immowelt.de/expose/26temfacszzi"],
    ]);
  });

  it("keeps each title with its own rent, rooms, area, district and postcode", () => {
    const base = { source: "immowelt", address: null, rentWarm: null, floor: null, description: null, imageUrl: null };
    expect(parsed).toEqual([
      {
        ...base,
        sourceId: "918f96ec-1cb0-47a8-ae27-64ec04bd8f02",
        sourceUrl: "https://www.immowelt.de/expose/918f96ec-1cb0-47a8-ae27-64ec04bd8f02",
        title: "renovierte attraktive 3 Raum Wohnung in Dölitz Dös...",
        rentCold: 733,
        rooms: 3,
        sqm: 75,
        district: "Dölitz-Dösen", // "Süd" context line, not stored
        postcode: "04279",
      },
      {
        ...base,
        sourceId: "26temfacszzi",
        sourceUrl: "https://www.immowelt.de/expose/26temfacszzi",
        title: "Tolle Altbau-Wohnung mit Balkon mitten in Reudnitz...",
        rentCold: 740,
        rooms: 3,
        sqm: 92,
        district: "Reudnitz-Thonberg",
        postcode: "04317",
      },
    ]);
  });

  it("never uses the \"Abweichende Lage\" label or the headline as title or district", () => {
    expect(alternatives.text).toContain("Abweichende Lage");
    expect(alternatives.text).toContain("Alternative Angebote für dich in Altlindenau");
    for (const apartment of parsed) {
      expect([apartment.title, apartment.district]).not.toContain("Abweichende Lage");
      expect(apartment.title).not.toMatch(/Alternative Angebote|Abweichende Lage/);
    }
  });

  it("extracts only what the titles say through the generic feature step", () => {
    expect(stored.map(({ balcony, buildingType }) => ({ balcony, buildingType }))).toEqual([
      { balcony: null, buildingType: "unknown" },
      { balcony: true, buildingType: "altbau" }, // "Altbau-Wohnung mit Balkon"
    ]);
    for (const apartment of stored) expect(apartment).toMatchObject({ rentWarm: null, address: null });
  });

  it("contains no tracking URL or token anywhere, in the fixture or in any apartment field", () => {
    expect(alternatives.text).not.toMatch(/click\.by\.immowelt|qs=/);
    expect(alternatives.html).toBeNull();
    expect(JSON.stringify(stored)).not.toMatch(/click\.by\.immowelt|qs=|wl-cdp/);
  });
});

describe("Immowelt alert-03-warmmiete (real fixture, link-resolved)", () => {
  const warm = loadFixture("fixtures/emails/immowelt/alert-03-warmmiete.json");
  const parsed = immoweltParser.parse(warm);

  it("is parsed by immowelt@1.2.0", () => {
    expect(detectSource(warm)).toEqual({ source: "immowelt", matchedBy: "sender" });
    const outcome = parseEmail(warm);
    expect(outcome).toMatchObject({ status: "parsed", parserVersion: "immowelt@1.2.0", failures: [] });
    expect(outcome.apartments).toEqual(parsed);
  });

  it("stores the labelled Warmmiete as warm rent and leaves cold rent unknown", () => {
    expect(warm.text).toContain("1.350\u00a0€/Monat Warmmiete");
    expect(parsed).toEqual([
      {
        source: "immowelt",
        sourceId: "c05c39d3-2cf2-49ae-93a6-156aa83ff518",
        sourceUrl: "https://www.immowelt.de/expose/c05c39d3-2cf2-49ae-93a6-156aa83ff518",
        title: "Wohnen auf Zeit mit 2 separaten Schlafzimmern / ST...",
        rentCold: null,
        rentWarm: 1350,
        rooms: 3,
        sqm: 70,
        district: "Altlindenau",
        postcode: "04177",
        address: null,
        floor: null,
        description: null,
        imageUrl: null,
      },
    ]);
  });

  it("does not turn the footer's \"0 €\" into a listing", () => {
    expect(warm.text).toContain("Der Preis von 0 € gilt");
    expect(parsed).toHaveLength(1);
  });
});
