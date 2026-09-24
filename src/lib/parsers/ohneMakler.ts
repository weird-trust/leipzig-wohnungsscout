import type { IncomingEmail } from "@/lib/domain/email";
import type { ApartmentParser, ParsedApartment } from "@/lib/parsers/types";

/**
 * Ohne-Makler saved-search alert parser, built against the real plain-text
 * alert in fixtures/emails/ohne-makler/alert-01.json (regression fixture).
 * Each listing is one pipe-delimited row that repeats its URL:
 *
 *   | (<url>) | <title>  (<url>)    Wohnung, Wohnung in <location>
 *     Zimmer: 2,00 Wohnfläche: 74,00 m²     Miete: 790 € Privatangebot
 *     👉 Exposé anzeigen  (<url>) |
 *
 * <location> is either "04299 Leipzig" (postcode + city) or
 * "<street> <no>, 04177 Leipzig"; only the latter is an address.
 * "Miete" is not labelled cold or warm, so it maps to neither rent field.
 */

const LISTING_HOST = "www.ohne-makler.net";
const LISTING_PATH = /^\/immobilie\/(\d+)\/$/;
/** A parenthesized URL, as the plain text renders links: "(https://…)". */
const PARENTHESIZED_URL = /\((https?:\/\/[^\s()]+)\)/g;
const ROW_START = /^\|\s*\((https?:\/\/[^\s()]+)\)\s*\|\s*/;

/** Canonical listing URL and id for exactly https://www.ohne-makler.net/immobilie/<digits>/. */
export function parseListingUrl(value: string): { sourceUrl: string; sourceId: string } | null {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return null;
  }
  if (url.protocol !== "https:" || url.hostname !== LISTING_HOST) return null;
  const id = url.pathname.match(LISTING_PATH)?.[1];
  return id ? { sourceUrl: `${url.origin}${url.pathname}`, sourceId: id } : null;
}

/** German number as in the alert: "3,00" → 3, "3,5" → 3.5, "87,00" → 87; else null. */
export function parseGermanDecimal(value: string | undefined): number | null {
  const match = value?.trim().match(/^(\d{1,4})(?:,(\d{1,2}))?$/);
  if (!match) return null;
  const number = Number(`${match[1]}.${match[2] ?? "0"}`);
  return number > 0 ? number : null;
}

/**
 * The location as an address only when it has a street with house number
 * before "<5-digit postcode> <city>" ("Musterstraße 9, 04177 Leipzig").
 * Postcode + city alone is not an address.
 */
export function addressFromLocation(location: string | null): string | null {
  if (!location) return null;
  const match = location.match(
    /^(\p{L}[\p{L}\p{M} .'-]*?)\s+(\d+\s?[a-zA-Z]?(?:\s?[-/]\s?\d+\s?[a-zA-Z]?)?),\s*(\d{5})\s+(\p{L}[\p{L} .-]*)$/u,
  );
  return match ? location : null;
}

/** The listing id of a row, when the row is a listing row for exactly one listing. */
function rowListing(line: string): { sourceUrl: string; sourceId: string } | null {
  const lead = line.match(ROW_START);
  const leadListing = lead ? parseListingUrl(lead[1]) : null;
  if (!leadListing) return null;
  const ids = new Set(
    [...line.matchAll(PARENTHESIZED_URL)]
      .map((match) => parseListingUrl(match[1])?.sourceId)
      .filter((id): id is string => id !== undefined),
  );
  return ids.size === 1 ? leadListing : null;
}

function parseRow(line: string, listing: { sourceUrl: string; sourceId: string }): ParsedApartment | null {
  const afterLead = line.replace(ROW_START, "");
  // The title runs up to the next listing link.
  const titleEnd = [...afterLead.matchAll(PARENTHESIZED_URL)].find((match) => parseListingUrl(match[1]));
  if (!titleEnd || titleEnd.index === undefined) return null;
  const title = afterLead.slice(0, titleEnd.index).trim();
  if (!title) return null;

  const rest = afterLead.slice(titleEnd.index + titleEnd[0].length);
  // Segments are separated by runs of spaces; the location one reads "<type> in <location>".
  const segments = rest.split(/\s{2,}/).map((segment) => segment.trim());
  const location =
    segments.map((segment) => segment.match(/^[^:()]+?\sin\s(.+)$/)?.[1]?.trim()).find(Boolean) ?? null;

  return {
    source: "ohne-makler",
    ...listing,
    title,
    address: addressFromLocation(location),
    // Not derived from the postcode.
    district: null,
    rooms: parseGermanDecimal(rest.match(/Zimmer:\s*(\S+)/)?.[1]),
    sqm: parseGermanDecimal(rest.match(/Wohnfläche:\s*(\S+)\s*m²/)?.[1]),
    // "Miete" has no cold/warm label in this alert.
    rentCold: null,
    rentWarm: null,
    floor: null,
    description: null,
    imageUrl: null,
  };
}

export const ohneMaklerParser: ApartmentParser = {
  name: "ohne-makler",
  version: "1.0.0",

  canParse(email: IncomingEmail): boolean {
    return (email.text ?? "").split(/\r?\n/).some((line) => rowListing(line.trim()) !== null);
  },

  parse(email: IncomingEmail): ParsedApartment[] {
    const seen = new Set<string>();
    const apartments: ParsedApartment[] = [];
    for (const raw of (email.text ?? "").split(/\r?\n/)) {
      const line = raw.trim();
      const listing = rowListing(line);
      if (!listing || seen.has(listing.sourceId)) continue;
      const apartment = parseRow(line, listing);
      if (apartment) {
        seen.add(listing.sourceId);
        apartments.push(apartment);
      }
    }
    return apartments;
  },
};
