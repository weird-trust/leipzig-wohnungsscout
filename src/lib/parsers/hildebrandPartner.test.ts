import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { IncomingEmail } from "@/lib/domain/email";
import { fixtureFileSchema, fixtureToIncomingEmail } from "@/lib/ingest/fixtureFile";
import { toNewApartment } from "@/lib/ingest/normalize";
import { parseEmail } from "@/lib/parsers";
import {
  findResultsLink,
  hildebrandPartnerParser,
  parseArea,
  parseEuro,
  parseListingUrl,
  parseResultsPage,
  parseResultsUrl,
  parseRooms,
  postcodeFromSubtitle,
} from "@/lib/parsers/hildebrandPartner";
import { detectSource } from "@/lib/sourceDetection";

/**
 * Regression tests against the real (reviewed, redacted) Hildebrand &
 * Partner search-agent email and its results page. Changing these
 * expectations requires a deliberate parser migration.
 */
function loadEmail(path: string): IncomingEmail {
  const file = fixtureFileSchema.parse(JSON.parse(readFileSync(path, "utf-8")));
  return fixtureToIncomingEmail(file, new Date("2026-09-28T07:23:22.241Z"));
}

const email = loadEmail("fixtures/emails/hildebrand-partner/alert-01.json");
const page = readFileSync("fixtures/pages/hildebrand-partner/search-results-01.html", "utf-8");
const withPage: IncomingEmail = { ...email, fetchedPage: { source: "hildebrand-partner", html: page } };

const RESULTS_URL =
  "https://hildebrand-partner.com/immobilien/?bis-kaltmiete=1600.00&bis-kaufpreis=NaN&bis-qm=150.00&bis-zimmer=5.00" +
  "&nutzungsart=wohnen&objekt-id&ort=leipzig&typ=wohnung&vermarktungsart=miete&von-kaufpreis=NaN&status=offen" +
  "&since=1790580184&confirm=FIXTURE_TOKEN";
const LISTING_URL =
  "https://hildebrand-partner.com/immobilien/wohnung-etagenwohnung-in-leipzig-mieten-kantstr-37a-we12/";
const IMAGE_URL =
  "https://hildebrand-partner.com/content/uploads/immomakler/Immowelt_estateOffice_20260928092224/" +
  "a9d9fa0f5a3f472e8b12d265259a16c3-360x252.jpg";

const EXPECTED = {
  source: "hildebrand-partner",
  sourceId: "Kantstr. 37a_WE12",
  sourceUrl: LISTING_URL,
  title: "Wunderschöner Neubau in der Südvorstadt – 3-Zimmerwohnung im 2.OG mit Balkon !",
  rooms: 3,
  sqm: 85.64,
  rentCold: 1398,
  rentWarm: 1613,
  imageUrl: IMAGE_URL,
  postcode: "04275", // subtitle "04275 Leipzig, Etagenwohnung"
  district: null,
  address: null,
  floor: null,
  description: null,
};

describe("Hildebrand & Partner alert-01 email (real fixture)", () => {
  it("is detected as hildebrand-partner by its sender", () => {
    expect(email.from).toBe("wp-immomakler@hildebrand-partner.com");
    expect(detectSource(email)).toEqual({ source: "hildebrand-partner", matchedBy: "sender" });
  });

  it("selects the URL under the exact \"Suchergebnisse ansehen\" label", () => {
    const link = findResultsLink(email.text);
    expect(link.kind).toBe("valid");
    expect(link.kind === "valid" && link.url.href).toBe(RESULTS_URL);
  });

  it("never selects the edit link (same URL + #flash-message) or the delete link", () => {
    expect(email.text).toContain("confirm=FIXTURE_TOKEN#flash-message]");
    expect(email.text).toContain("callback=delete_searchagent&delete=FIXTURE_TOKEN]");
    const link = findResultsLink(email.text);
    expect(link.kind === "valid" && link.url.hash).toBe("");
    expect(link.kind === "valid" && link.url.searchParams.has("callback")).toBe(false);

    // Remove the results link: the other confirm/delete links must not stand in for it.
    const lines = email.text!.split("\n");
    const at = lines.indexOf("Suchergebnisse ansehen");
    const withoutResults = [...lines.slice(0, at), ...lines.slice(at + 2)].join("\n");
    expect(findResultsLink(withoutResults)).toEqual({ kind: "none" });
  });

  it("rejects an edit or delete link placed under the results label", () => {
    const edit = email.text!.replace(RESULTS_URL, `${RESULTS_URL}#flash-message`);
    expect(findResultsLink(edit)).toEqual({ kind: "invalid" });
    const del = email.text!.replace(
      RESULTS_URL,
      "https://hildebrand-partner.com/immobilien/?callback=delete_searchagent&delete=FIXTURE_TOKEN",
    );
    expect(findResultsLink(del)).toEqual({ kind: "invalid" });
  });

  it("without the fetched page, parsing fails with a safe message (no URL, no token)", () => {
    expect(hildebrandPartnerParser.canParse(email)).toBe(true);
    const outcome = parseEmail(email);
    expect(outcome.status).toBe("failed");
    expect(outcome.failures).toEqual([
      { parser: "hildebrand-partner", stage: "parse", message: "Hildebrand search-results page was not fetched" },
    ]);
    const invalid = parseEmail({ ...email, text: email.text!.replace("hildebrand-partner.com/immobilien/?bis", "example.com/immobilien/?bis") });
    expect(invalid.failures[0].message).toBe("Hildebrand search-results link is missing or invalid");
    expect(JSON.stringify([outcome, invalid])).not.toMatch(/FIXTURE_TOKEN|confirm|since=|https?:/);
  });

  it("does not claim a Hildebrand mail without the results label (stays unrecognized)", () => {
    const other = { ...email, text: "Bitte bestätigen Sie Ihren Suchauftrag." };
    expect(hildebrandPartnerParser.canParse(other)).toBe(false);
    expect(parseEmail(other).status).toBe("unrecognized");
  });

  it("does not claim other platforms' real fixtures", () => {
    for (const path of [
      "fixtures/emails/immoscout/alert-01.json",
      "fixtures/emails/kleinanzeigen/alert-01.json",
      "fixtures/emails/ohne-makler/alert-01.json",
      "fixtures/emails/immowelt/alert-01.json",
    ]) {
      expect(hildebrandPartnerParser.canParse(loadEmail(path))).toBe(false);
    }
  });
});

describe("parseResultsUrl", () => {
  it("accepts the results URL shape", () => {
    expect(parseResultsUrl(RESULTS_URL)?.searchParams.get("confirm")).toBe("FIXTURE_TOKEN");
  });

  it.each([
    ["http", RESULTS_URL.replace("https:", "http:")],
    ["www host", RESULTS_URL.replace("//hildebrand-partner.com", "//www.hildebrand-partner.com")],
    ["look-alike host", RESULTS_URL.replace("hildebrand-partner.com", "hildebrand-partner.com.evil.example")],
    ["other host", "https://example.com/immobilien/?confirm=FIXTURE_TOKEN"],
    ["credentials", RESULTS_URL.replace("https://", "https://user:pw@")],
    ["explicit port", RESULTS_URL.replace("hildebrand-partner.com/", "hildebrand-partner.com:8443/")],
    ["other path", RESULTS_URL.replace("/immobilien/", "/immobilien/suche/")],
    ["path without trailing slash", RESULTS_URL.replace("/immobilien/", "/immobilien")],
    ["fragment (edit link)", `${RESULTS_URL}#flash-message`],
    ["missing confirm", RESULTS_URL.replace("&confirm=FIXTURE_TOKEN", "")],
    ["empty confirm", RESULTS_URL.replace("confirm=FIXTURE_TOKEN", "confirm=")],
    ["delete callback", "https://hildebrand-partner.com/immobilien/?callback=delete_searchagent&delete=X&confirm=Y"],
    ["no query", "https://hildebrand-partner.com/immobilien/"],
    ["not a URL", "Suchergebnisse ansehen"],
  ])("rejects %s", (_, url) => {
    expect(parseResultsUrl(url)).toBeNull();
  });

  it.each([
    ["unbracketed URL", `Suchergebnisse ansehen\n${RESULTS_URL}`],
    ["text after the label", "Suchergebnisse ansehen\nHier klicken"],
    ["label at the end", "Suchergebnisse ansehen"],
  ])("findResultsLink: %s → invalid", (_, text) => {
    expect(findResultsLink(text)).toEqual({ kind: "invalid" });
  });

  it("requires the exact label", () => {
    expect(findResultsLink(`Suchergebnisse ansehen!\n[${RESULTS_URL}]`)).toEqual({ kind: "none" });
    expect(findResultsLink(`  Suchergebnisse ansehen \n\n[${RESULTS_URL}]`).kind).toBe("valid");
  });
});

describe("Hildebrand & Partner search-results-01 page (real fixture)", () => {
  const apartments = parseResultsPage(page);
  const [stored] = apartments.map((apartment) => toNewApartment(apartment, "email-row"));

  it("is parsed by parseEmail() as hildebrand-partner@1.1.0 once the page is attached", () => {
    const outcome = parseEmail(withPage);
    expect(outcome).toMatchObject({ status: "parsed", parserVersion: "hildebrand-partner@1.1.0", failures: [] });
    expect(outcome.apartments).toEqual(apartments);
  });

  it("produces exactly the one listing, despite two paginators", () => {
    expect(page.match(/Wir haben 1 Angebot für Sie/g)).toHaveLength(2);
    expect(apartments).toEqual([EXPECTED]);
  });

  it("keeps Kaltmiete and Warmmiete apart and parses German numbers", () => {
    expect(apartments[0]).toMatchObject({ rentCold: 1398, rentWarm: 1613, sqm: 85.64, rooms: 3 });
  });

  it("extracts features only through the generic step; fingerprint stays null without district", () => {
    expect(stored).toMatchObject({
      balcony: true, // "mit Balkon"
      buildingType: "neubau", // "Neubau"
      topFloor: null, // "2.OG" is not a top-floor statement
      bathtub: null,
      residentialKitchen: null,
      elevator: null,
      floor: null,
      fingerprint: null,
    });
  });

  it("puts no search-agent URL, query or token into any apartment field", () => {
    expect(JSON.stringify([apartments, stored])).not.toMatch(/confirm|FIXTURE_TOKEN|since=|bis-kaltmiete|\?/);
  });

  it("does not depend on page chrome: the bare card markup parses the same", () => {
    const start = page.indexOf('<div class="properties">');
    const end = page.indexOf("<!-- #properties -->");
    expect(parseResultsPage(page.slice(start, end))).toEqual(apartments);
  });
});

/**
 * Two cards with the real markup: the fixture card twice, the second one
 * with SYNTHETIC values (test-only, not production data).
 */
function twoCardPage(): string {
  const start = page.indexOf('<div class="property col-sm-6 col-md-4">');
  const end = page.indexOf("<!-- #properties -->");
  const card = page.slice(start, page.lastIndexOf("</div>", end - 1));
  const synthetic = card
    .replaceAll("kantstr-37a-we12", "synth-card-2")
    .replace("Kantstr. 37a_WE12", "SYNTH 2_WE02")
    .replace(/Wunderschöner Neubau[^<]*<\/a><\/h3>/, "Synthetische Altbauwohnung mit Badewanne</a></h3>")
    .replace('<div class="col-xs-7 dd">3</div>', '<div class="col-xs-7 dd">2,5</div>')
    .replace("85,64 m²", "61 m²")
    .replace("1.398,00 EUR", "700,00 EUR")
    .replace("1.613,00 EUR", "890,50 EUR")
    .replaceAll("a9d9fa0f5a3f472e8b12d265259a16c3", "synthetic-image");
  return `<div class="properties">${card}${synthetic}</div>`;
}

describe("multiple cards (synthetic values in real markup)", () => {
  const apartments = parseResultsPage(twoCardPage());

  it("parses each card exactly once without data bleed", () => {
    expect(apartments).toHaveLength(2);
    expect(apartments[0]).toEqual(EXPECTED);
    expect(apartments[1]).toEqual({
      ...EXPECTED,
      sourceId: "SYNTH 2_WE02",
      sourceUrl: "https://hildebrand-partner.com/immobilien/wohnung-etagenwohnung-in-leipzig-mieten-synth-card-2/",
      title: "Synthetische Altbauwohnung mit Badewanne",
      rooms: 2.5,
      sqm: 61,
      rentCold: 700,
      rentWarm: 890.5,
      imageUrl: IMAGE_URL.replace("a9d9fa0f5a3f472e8b12d265259a16c3", "synthetic-image"),
    });
  });

  it("parses a repeated card (same Objekt ID) once", () => {
    const html = twoCardPage();
    const doubled = html.replace("SYNTH 2_WE02", "Kantstr. 37a_WE12");
    expect(parseResultsPage(doubled).map((a) => a.sourceId)).toEqual(["Kantstr. 37a_WE12"]);
  });

  it("skips a card without Objekt ID instead of inventing an id", () => {
    const html = twoCardPage().replace("SYNTH 2_WE02", "");
    expect(parseResultsPage(html).map((a) => a.sourceId)).toEqual(["Kantstr. 37a_WE12"]);
  });

  it("leaves an unparseable value null without affecting the other fields", () => {
    const html = twoCardPage().replace("890,50 EUR", "auf Anfrage");
    expect(parseResultsPage(html)[1]).toMatchObject({ rentWarm: null, rentCold: 700 });
  });
});

describe("value parsing", () => {
  it.each([
    ["1.398,00 EUR", 1398],
    ["1.613,00 EUR ", 1613],
    ["700,00 EUR", 700],
    ["890,50 EUR", 890.5],
    ["1.398 €", 1398],
    ["12.345,67 EUR", 12345.67],
  ])("parseEuro(%j) → %j", (value, expected) => {
    expect(parseEuro(value)).toBe(expected);
  });

  it.each(["1,398.00 EUR", "1398,0 EUR", "ca. 700 EUR", "700", "0,00 EUR", "auf Anfrage", "1.39,00 EUR"])(
    "parseEuro(%j) → null",
    (value) => {
      expect(parseEuro(value)).toBeNull();
    },
  );

  it("parses rooms and area with German decimals", () => {
    expect(parseRooms("3")).toBe(3);
    expect(parseRooms("3,5")).toBe(3.5);
    expect(parseRooms("drei")).toBeNull();
    expect(parseArea("85,64 m²")).toBe(85.64);
    expect(parseArea("61 m²")).toBe(61);
    expect(parseArea("85.64 m²")).toBeNull();
    expect(parseArea("85,64")).toBeNull();
  });

  it("reads the postcode only from a leading \"<postcode> <city>\" subtitle", () => {
    expect(postcodeFromSubtitle("04275 Leipzig, Etagenwohnung")).toBe("04275");
    expect(postcodeFromSubtitle(" 04229\u00a0Leipzig ")).toBe("04229");
    for (const value of ["Leipzig, Etagenwohnung", "0427 Leipzig", "Etagenwohnung, 04275 Leipzig", "04275", ""]) {
      expect(postcodeFromSubtitle(value)).toBeNull();
    }
  });

  it("accepts only public listing URLs as sourceUrl", () => {
    expect(parseListingUrl(LISTING_URL)).toBe(LISTING_URL);
    for (const url of [
      "https://hildebrand-partner.com/immobilien/?confirm=X",
      `${LISTING_URL}?utm_source=x`,
      `${LISTING_URL}#bilder`,
      LISTING_URL.replace("https:", "http:"),
      LISTING_URL.replace("hildebrand-partner.com", "example.com"),
      "https://hildebrand-partner.com/immobilien/",
      "https://hildebrand-partner.com/kontakt/",
    ]) {
      expect(parseListingUrl(url)).toBeNull();
    }
  });
});
