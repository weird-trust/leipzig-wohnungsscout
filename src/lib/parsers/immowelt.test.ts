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
  ["0fe5b1ed-db33-4796-bbd8-2c2ee9c9e459", "Inkl. Aufzug und neuer Einbauküche!", 1199, 3, 85, "Südvorstadt"],
  ["f2e06b10-a30a-4799-b472-374e5023223a", "Wohnen mit Weitblick_helle 3-Zimmer-Dachgeschosswo...", 700, 3, 64.64, "Wahren"],
  ["bb8aa4d3-357f-4940-9232-e1bc74f095a3", "Erstbezug nach Modernisierung! Inkl. EBK", 929, 3, 64, "Schönefeld-Abtnaundorf"],
  ["286a483b-704a-4cd4-b45c-e2603bdc0b25", "Maisonette-Wohnung inkl. EBK", 899, 3.5, 65, "Schönefeld-Abtnaundorf"],
  ["03a6cf24-7b46-4d3d-8dd8-0fb448ddf3a0", "Inkl. Balkon und EBK", 1349, 4, 95, "Gohlis-Süd"],
  ["baf7a139-5e15-488e-82d8-b939303bf33c", "4-RW inkl. großem Balkon und neuer Einbauküche! *I...", 1349, 4, 94, "Plagwitz"],
] as const;

describe("Immowelt alert-01 (real fixture, link-resolved)", () => {
  it("is detected as Immowelt by its sender", () => {
    expect(email.from).toBe("angebot@suchen.immowelt.de");
    expect(detectSource(email)).toEqual({ source: "immowelt", matchedBy: "sender" });
  });

  it("is selected by parseEmail() as immowelt@1.0.1", () => {
    const outcome = parseEmail(email);
    expect(outcome.status).toBe("parsed");
    expect(outcome.parserVersion).toBe("immowelt@1.0.1");
    expect(outcome.failures).toEqual([]);
    expect(outcome.apartments).toEqual(apartments);
  });

  it("produces exactly six apartments with unique, correct ids", () => {
    expect(apartments.map((a) => a.sourceId)).toEqual(EXPECTED.map(([id]) => id));
    expect(new Set(apartments.map((a) => a.sourceId)).size).toBe(6);
  });

  it.each(EXPECTED.map((expected, index) => [expected[1], index] as const))(
    "keeps %j attached to its own rent, rooms, area and district",
    (_, index) => {
      const [id, title, rentCold, rooms, sqm, district] = EXPECTED[index];
      expect(apartments[index]).toEqual({
        source: "immowelt",
        sourceId: id,
        sourceUrl: `https://www.immowelt.de/expose/${id}`,
        title,
        rentCold,
        rooms,
        sqm,
        district,
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

  it.each([
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
    ["another city", ["Mitte,", "Berlin", "(10115)"]],
    ["district without comma", ["Südvorstadt", "Leipzig", "(04275)"]],
  ])("returns null for %s", (_, lines) => {
    expect(districtFromLocation(lines)).toBeNull();
  });
});
