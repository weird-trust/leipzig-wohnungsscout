import { parse as parseHtml, type HTMLElement } from "node-html-parser";
import type { IncomingEmail } from "@/lib/domain/email";
import type { ApartmentParser, ParsedApartment } from "@/lib/parsers/types";
import { detectSource } from "@/lib/sourceDetection";

/**
 * Hildebrand & Partner (WP-ImmoMakler) search agent, built against the real
 * fixtures fixtures/emails/hildebrand-partner/alert-01.json (the email) and
 * fixtures/pages/hildebrand-partner/search-results-01.html (its results page).
 *
 * The email has no listings, only a private results link under the exact
 * label "Suchergebnisse ansehen". Ingestion preprocessing fetches that page
 * (src/lib/ingest/hildebrandResults.ts) and passes it as `email.fetchedPage`;
 * this parser makes no network requests and only reads that page.
 *
 * One property card in the page:
 *
 *   .property-container
 *     .property-thumbnail img[src]            ← imageUrl
 *     .property-title a[href]                 ← title, sourceUrl
 *     .property-subtitle                      ← "04275 Leipzig, Etagenwohnung" (postcode only)
 *     .property-data .row (.dt label / .dd value)
 *        Objekt ID: Kantstr. 37a_WE12         ← sourceId (card skipped without it)
 *        Zimmer: 3 · Wohnfläche: 85,64 m²
 *        Kaltmiete: 1.398,00 EUR · Warmmiete: 1.613,00 EUR
 *        Verfügbar ab: 01.01.2027             ← no field for it; ignored
 *
 * The "Wir haben N Angebot(e) für Sie" paginator appears twice and is never
 * used for counting. There is no district or street address.
 */

const HOST = "hildebrand-partner.com";
const RESULTS_PATH = "/immobilien/";
const RESULTS_LABEL = "Suchergebnisse ansehen";
const UNICODE_SPACES = /[   -   　]/g;

/**
 * The private search-results link: exactly
 * https://hildebrand-partner.com/immobilien/?…&confirm=<non-empty>, without
 * credentials, port, fragment or delete callback. Nothing looser.
 */
export function parseResultsUrl(value: string): URL | null {
  let url: URL;
  try {
    url = new URL(value.trim());
  } catch {
    return null;
  }
  const valid =
    url.protocol === "https:" &&
    url.hostname === HOST &&
    url.port === "" &&
    url.username === "" &&
    url.password === "" &&
    url.pathname === RESULTS_PATH &&
    url.search !== "" &&
    url.hash === "" &&
    (url.searchParams.get("confirm") ?? "") !== "" &&
    !url.searchParams.has("callback") &&
    !url.searchParams.has("delete");
  return valid ? url : null;
}

export type ResultsLink =
  /** No "Suchergebnisse ansehen" label: not a search-results mail. */
  | { kind: "none" }
  /** Labelled, but the link is missing or fails validation. */
  | { kind: "invalid" }
  | { kind: "valid"; url: URL };

/**
 * The bracketed URL on the first non-empty line after the exact label. Never
 * picks a link just because it has `confirm` (the edit link has one too).
 */
export function findResultsLink(text: string | null): ResultsLink {
  const lines = (text ?? "").split(/\r?\n/).map((line) => line.trim());
  const label = lines.indexOf(RESULTS_LABEL);
  if (label === -1) return { kind: "none" };
  const next = lines.slice(label + 1).find((line) => line !== "") ?? "";
  const bracketed = next.match(/^\[(\S+)\]$/)?.[1];
  const url = bracketed ? parseResultsUrl(bracketed) : null;
  return url ? { kind: "valid", url } : { kind: "invalid" };
}

/** Public listing page: https://hildebrand-partner.com/immobilien/<slug>/, no query or fragment. */
export function parseListingUrl(value: string): string | null {
  let url: URL;
  try {
    url = new URL(value.trim());
  } catch {
    return null;
  }
  const valid =
    url.protocol === "https:" &&
    url.hostname === HOST &&
    url.port === "" &&
    url.username === "" &&
    url.password === "" &&
    url.search === "" &&
    url.hash === "" &&
    /^\/immobilien\/[a-z0-9-]+\/$/.test(url.pathname);
  return valid ? url.href : null;
}

function clean(text: string): string {
  return text.replace(UNICODE_SPACES, " ").replace(/\s+/g, " ").trim();
}

/** "3", "3,5", "85,64": German decimal comma, no thousands separators. */
function germanDecimal(value: string): number | null {
  const match = value.match(/^(\d{1,4})(?:,(\d{1,2}))?$/);
  if (!match) return null;
  const number = Number(`${match[1]}.${match[2] ?? "0"}`);
  return number > 0 ? number : null;
}

/** "3" or "3,5" → rooms. */
export function parseRooms(value: string): number | null {
  return germanDecimal(clean(value));
}

/** "04275 Leipzig, Etagenwohnung" → "04275": a leading postcode + city; anything else → null. */
export function postcodeFromSubtitle(value: string): string | null {
  return clean(value).match(/^(\d{5})\s+\p{L}[\p{L} .-]*(?:,|$)/u)?.[1] ?? null;
}

/** "85,64 m²" → 85.64. */
export function parseArea(value: string): number | null {
  const match = clean(value).match(/^(\S+)\s*m²$/);
  return match ? germanDecimal(match[1]) : null;
}

/** "1.398,00 EUR" → 1398. Thousands dot, decimal comma, EUR (or €) suffix; nothing else. */
export function parseEuro(value: string): number | null {
  const match = clean(value).match(/^(\d{1,3}(?:\.\d{3})+|\d+)(?:,(\d{2}))?\s*(?:EUR|€)$/);
  if (!match) return null;
  const number = Number(`${match[1].replaceAll(".", "")}.${match[2] ?? "0"}`);
  return number > 0 ? number : null;
}

function httpUrl(value: string | undefined): string | null {
  if (!value) return null;
  try {
    const url = new URL(value.trim());
    return url.protocol === "https:" || url.protocol === "http:" ? url.href : null;
  } catch {
    return null;
  }
}

/** Label → value of the card's .property-data rows ("Objekt ID:" → "Objekt ID"). */
function dataRows(card: HTMLElement): Map<string, string> {
  const rows = new Map<string, string>();
  for (const row of card.querySelectorAll(".property-data .row")) {
    const label = row.querySelector(".dt");
    const value = row.querySelector(".dd");
    if (!label || !value) continue;
    const key = clean(label.text).replace(/:$/, "");
    if (!rows.has(key)) rows.set(key, clean(value.text));
  }
  return rows;
}

function parseCard(card: HTMLElement): ParsedApartment | null {
  const rows = dataRows(card);
  const sourceId = rows.get("Objekt ID") ?? "";
  const titleLink = card.querySelector(".property-title a");
  const title = titleLink ? clean(titleLink.text) : "";
  const sourceUrl = titleLink ? parseListingUrl(titleLink.getAttribute("href") ?? "") : null;
  // Conservative: without its Objekt ID, title or public URL a card is not a listing we can track.
  if (!sourceId || !title || !sourceUrl) return null;

  const value = (label: string) => rows.get(label) ?? "";
  return {
    source: "hildebrand-partner",
    sourceId,
    sourceUrl,
    title,
    rooms: parseRooms(value("Zimmer")),
    sqm: parseArea(value("Wohnfläche")),
    rentCold: parseEuro(value("Kaltmiete")),
    rentWarm: parseEuro(value("Warmmiete")),
    imageUrl: httpUrl(card.querySelector(".property-thumbnail img")?.getAttribute("src")),
    postcode: postcodeFromSubtitle(card.querySelector(".property-subtitle")?.text ?? ""),
    // Not in the results card ("04275 Leipzig, Etagenwohnung" has neither).
    district: null,
    address: null,
    floor: null,
    description: null,
  };
}

/** All property cards of a WP-ImmoMakler results page, each once (by Objekt ID). */
export function parseResultsPage(html: string): ParsedApartment[] {
  const seen = new Set<string>();
  const apartments: ParsedApartment[] = [];
  for (const card of parseHtml(html).querySelectorAll(".property-container")) {
    const apartment = parseCard(card);
    if (!apartment || seen.has(apartment.sourceId!)) continue;
    seen.add(apartment.sourceId!);
    apartments.push(apartment);
  }
  return apartments;
}

function isHildebrand(email: IncomingEmail): boolean {
  return detectSource(email).source === "hildebrand-partner";
}

export const hildebrandPartnerParser: ApartmentParser = {
  name: "hildebrand-partner",
  version: "1.1.0",

  canParse(email: IncomingEmail): boolean {
    return isHildebrand(email) && (email.fetchedPage?.source === "hildebrand-partner" || findResultsLink(email.text).kind !== "none");
  },

  parse(email: IncomingEmail): ParsedApartment[] {
    if (email.fetchedPage?.source === "hildebrand-partner") return parseResultsPage(email.fetchedPage.html);
    // Deterministic failures (no retry helps); messages never contain the URL.
    if (findResultsLink(email.text).kind === "invalid") {
      throw new Error("Hildebrand search-results link is missing or invalid");
    }
    throw new Error("Hildebrand search-results page was not fetched");
  },
};
