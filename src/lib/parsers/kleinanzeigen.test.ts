import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { IncomingEmail } from "@/lib/domain/email";
import { fixtureFileSchema, fixtureToIncomingEmail } from "@/lib/ingest/fixtureFile";
import { toNewApartment } from "@/lib/ingest/normalize";
import { parseEmail } from "@/lib/parsers";
import {
  kleinanzeigenParser,
  parseListingImage,
  parseListingLink,
  roomsFromTitle,
} from "@/lib/parsers/kleinanzeigen";
import { detectSource } from "@/lib/sourceDetection";

/**
 * Regression tests against the real (reviewed, redacted) Kleinanzeigen alert.
 * Changing these expectations requires a deliberate parser migration.
 */
const FIXTURE = "fixtures/emails/kleinanzeigen/alert-01.json";
const TITLE = "Schöne 3 Zi. Altbau Whg. in Connewitz ab Nov. zu vermieten";
const IMAGE =
  "https://img.kleinanzeigen.de/api/v1/prod-ads/images/c6/c648aa62-9653-4515-94bd-eb219c469550";

function loadFixture(): IncomingEmail {
  const file = fixtureFileSchema.parse(JSON.parse(readFileSync(FIXTURE, "utf-8")));
  return fixtureToIncomingEmail(file, new Date("2026-09-24T15:07:19.214Z"));
}

const email = loadFixture();
const apartments = kleinanzeigenParser.parse(email);
const [apartment] = apartments;

describe("Kleinanzeigen alert-01 (real fixture)", () => {
  it("is detected as Kleinanzeigen by its sender", () => {
    expect(detectSource(email)).toEqual({ source: "kleinanzeigen", matchedBy: "sender" });
  });

  it("is selected by parseEmail() as kleinanzeigen@1.0.0", () => {
    const outcome = parseEmail(email);
    expect(outcome.status).toBe("parsed");
    expect(outcome.parserVersion).toBe("kleinanzeigen@1.0.0");
    expect(outcome.failures).toEqual([]);
    expect(outcome.apartments).toEqual(apartments);
  });

  it("produces exactly one apartment although the title appears twice", () => {
    expect(email.text?.split(TITLE).length).toBe(3); // alt text + standalone title
    expect(apartments).toHaveLength(1);
  });

  it("extracts the listing identity and the canonical title", () => {
    expect(apartment).toMatchObject({
      source: "kleinanzeigen",
      sourceId: "3522075281",
      sourceUrl: "https://www.kleinanzeigen.de/s-anzeige/3522075281",
      title: TITLE,
      rooms: 3,
    });
  });

  it("leaves everything the alert does not provide null", () => {
    expect(apartment).toMatchObject({
      address: null,
      district: null, // "in Connewitz" is deliberately not interpreted
      sqm: null,
      floor: null,
    });
  });

  it("does not treat the displayed 800 € as cold or warm rent", () => {
    expect(email.text).toMatch(/^800 €$/m);
    expect(apartment).toMatchObject({ rentCold: null, rentWarm: null });
  });

  it("keeps \"Von Privat\" out of the description", () => {
    expect(email.text).toMatch(/^Von Privat$/m);
    expect(apartment.description).toBeNull();
  });

  it("takes the listing image, not a logo or footer image", () => {
    expect(apartment.imageUrl).toBe(IMAGE);
    expect(email.text).toContain("https://static.kleinanzeigen.de/img/mail/logo-kleinanzeigen-boxed.png");
  });

  it("does not create apartments from navigation, footer or social links", () => {
    for (const url of [
      "https://www.kleinanzeigen.de/m-suche-verwenden.html",
      "https://www.kleinanzeigen.de/impressum.html",
      "https://www.facebook.com/Kleinanzeigen/",
    ]) {
      expect(email.text).toContain(url);
    }
    expect(apartments.map((a) => a.sourceId)).toEqual(["3522075281"]);
  });

  it("finds nothing once the listing block is removed (footer alone is not a listing)", () => {
    const text = email.text!;
    const withoutListing = text.slice(0, text.indexOf("Bild zur Anzeige")) + text.slice(text.indexOf("Viele Grüße"));
    const footerOnly = { ...email, text: withoutListing };
    expect(kleinanzeigenParser.canParse(footerOnly)).toBe(false);
    expect(kleinanzeigenParser.parse(footerOnly)).toEqual([]);
  });

  it("normalizes into the expected apartment", () => {
    expect(toNewApartment(apartment, "email-row")).toEqual({
      source: "kleinanzeigen",
      sourceUrl: "https://www.kleinanzeigen.de/s-anzeige/3522075281",
      sourceId: "3522075281",
      title: TITLE,
      rooms: 3,
      address: null,
      district: null,
      sqm: null,
      rentCold: null,
      rentWarm: null,
      floor: null,
      description: null,
      imageUrl: IMAGE,
      // Generic extraction from the title: only "Altbau" is stated.
      topFloor: null,
      balcony: null,
      bathtub: null,
      residentialKitchen: null,
      elevator: null,
      buildingType: "altbau",
      emailId: "email-row",
      // Needs district, area and warm rent, none of which this alert has.
      fingerprint: null,
    });
  });
});

describe("kleinanzeigenParser.canParse", () => {
  it("does not claim an ImmoScout alert", () => {
    const immoscout = fixtureFileSchema.parse(
      JSON.parse(readFileSync("fixtures/emails/immoscout/alert-01.json", "utf-8")),
    );
    expect(kleinanzeigenParser.canParse(fixtureToIncomingEmail(immoscout, new Date(0)))).toBe(false);
  });

  it("recognizes a forwarded alert by its listing anchor", () => {
    expect(kleinanzeigenParser.canParse({ ...email, from: "Ich <ich@example.org>" })).toBe(true);
  });
});

describe("parseListingLink", () => {
  it("accepts the exact listing URL and drops query strings", () => {
    expect(
      parseListingLink("[https://www.kleinanzeigen.de/s-anzeige/3522075281?utm_source=email&utm_campaign=x]"),
    ).toEqual({ sourceUrl: "https://www.kleinanzeigen.de/s-anzeige/3522075281", sourceId: "3522075281" });
  });

  it.each([
    ["search link", "[https://www.kleinanzeigen.de/m-suche-verwenden.html]"],
    ["non-numeric id", "[https://www.kleinanzeigen.de/s-anzeige/abc]"],
    ["extra path segment", "[https://www.kleinanzeigen.de/s-anzeige/3522075281/x]"],
    ["other host", "[https://example.com/s-anzeige/3522075281]"],
    ["not bracketed", "https://www.kleinanzeigen.de/s-anzeige/3522075281"],
  ])("rejects a %s", (_, line) => {
    expect(parseListingLink(line)).toBeNull();
  });
});

describe("parseListingImage", () => {
  it("accepts only the listing image host, without query", () => {
    expect(parseListingImage(`[${IMAGE}?rule=$_12.JPG]`)).toBe(IMAGE);
    expect(parseListingImage("[https://static.kleinanzeigen.de/img/mail/logo-kleinanzeigen-boxed.png]")).toBeNull();
    expect(parseListingImage("[https://example.com/image.jpg]")).toBeNull();
  });
});

describe("roomsFromTitle", () => {
  it.each([
    ["Schöne 3 Zi. Altbau Whg.", 3],
    ["Helle 3,5 Zi. Wohnung", 3.5],
    ["4 Zi. mit Balkon", 4],
    ["3Zi. Wohnung", 3],
  ])("%j → %j", (title, expected) => {
    expect(roomsFromTitle(title)).toBe(expected);
  });

  it.each([
    ["no room pattern", "Schöne Altbauwohnung in Connewitz"],
    ["word instead of number", "Drei Zi. Wohnung"],
    ["zero rooms", "0 Zi. Wohnung"],
    ["doubled decimal separator", "3,,5 Zi. Wohnung"],
    ["two different counts", "3 Zi. oder 4 Zi."],
    ["number glued to other digits", "123 Zi. Wohnung"],
    ["\"Zimmer\" spelled out (not the observed pattern)", "3 Zimmer Wohnung"],
  ])("%s → null", (_, title) => {
    expect(roomsFromTitle(title)).toBeNull();
  });
});
