import type { IncomingEmail } from "@/lib/domain/email";
import type { ApartmentParser, ParsedApartment } from "@/lib/parsers/types";

/**
 * Immowelt saved-search alert parser, built against the real plain-text
 * alert in fixtures/emails/immowelt/alert-01.json (regression fixture).
 *
 * It expects LINK-RESOLVED text: the raw email only has personalized
 * click.by.immowelt.de tracking links, and resolving the one above each
 * "Mehr Informationen" to its canonical expose URL is an ingestion-layer
 * step (not implemented yet). This parser makes no network requests; raw,
 * unresolved alerts are simply not recognized.
 *
 * One listing, blank lines varying:
 *
 *   1.199 € Kaltmiete                  ← explicitly cold rent
 *   Inkl. Aufzug und neuer Einbauküche!  ← title (may be truncated with "...")
 *   3 Zimmer . 85 m²
 *    Südvorstadt,                        ← district
 *    Leipzig
 *    (04275)
 *   https://www.immowelt.de/expose/<uuid>
 *   Mehr Informationen                  ← anchor
 *
 * There is no street address and no warm rent.
 */

const LISTING_HOST = "www.immowelt.de";
const EXPOSE_PATH =
  /^\/expose\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i;
const ANCHOR = "Mehr Informationen";
const CITY = "Leipzig";
const POSTCODE_LINE = /^\(\d{5}\)$/;
/** NBSP and other Unicode spaces used by the real alert (e.g. "1.199 €"). */
const UNICODE_SPACES = /[   -   　]/g;

/** Canonical listing identity for exactly https://www.immowelt.de/expose/<uuid>. */
export function parseExposeUrl(value: string): { sourceUrl: string; sourceId: string } | null {
  let url: URL;
  try {
    url = new URL(value.trim());
  } catch {
    return null;
  }
  if (url.protocol !== "https:" || url.hostname !== LISTING_HOST) return null;
  const id = url.pathname.match(EXPOSE_PATH)?.[1]?.toLowerCase();
  return id ? { sourceUrl: `https://${LISTING_HOST}/expose/${id}`, sourceId: id } : null;
}

function normalizeSpaces(line: string): string {
  return line.replace(UNICODE_SPACES, " ").trim();
}

/** "3", "3,5", "64,64": German decimal comma, no thousands separators. */
function germanDecimal(value: string): number | null {
  const match = value.match(/^(\d{1,4})(?:,(\d{1,2}))?$/);
  if (!match) return null;
  const number = Number(`${match[1]}.${match[2] ?? "0"}`);
  return number > 0 ? number : null;
}

/** "1.199 € Kaltmiete" → 1199. Requires the explicit "Kaltmiete" label; else null. */
export function parseKaltmiete(line: string): number | null {
  const match = normalizeSpaces(line).match(
    /^(\d{1,3}(?:\.\d{3})+|\d+)(?:,(\d{1,2}))?\s*€\s+Kaltmiete$/,
  );
  if (!match) return null;
  return Number(`${match[1].replaceAll(".", "")}.${match[2] ?? "0"}`);
}

/** "3,5 Zimmer . 65 m²" → { rooms: 3.5, sqm: 65 }; each part null when malformed. */
export function parseRoomsAndArea(line: string): { rooms: number | null; sqm: number | null } | null {
  const match = normalizeSpaces(line).match(/^(\S+)\s+Zimmer\s+\.\s+(\S+)\s+m²$/);
  if (!match) return null;
  return { rooms: germanDecimal(match[1]), sqm: germanDecimal(match[2]) };
}

/**
 * The district in the " Südvorstadt, / Leipzig / (04275)" location: the line
 * ending in a comma directly before "Leipzig" + postcode. Anything else → null.
 */
export function districtFromLocation(lines: readonly string[]): string | null {
  const content = lines.map(normalizeSpaces).filter((line) => line !== "");
  for (let i = 1; i < content.length - 1; i++) {
    if (content[i] !== CITY || !POSTCODE_LINE.test(content[i + 1])) continue;
    const candidate = content[i - 1];
    if (!candidate.endsWith(",")) return null;
    const district = candidate.slice(0, -1).trim();
    return district !== "" && district !== CITY && !/\d/.test(district) ? district : null;
  }
  return null;
}

interface Anchor {
  urlLine: number;
  anchorLine: number;
  listing: { sourceUrl: string; sourceId: string };
}

function findAnchors(lines: readonly string[]): Anchor[] {
  const anchors: Anchor[] = [];
  lines.forEach((line, index) => {
    if (line !== ANCHOR) return;
    let urlLine = index - 1;
    while (urlLine >= 0 && lines[urlLine] === "") urlLine--;
    const listing = urlLine >= 0 ? parseExposeUrl(lines[urlLine]) : null;
    if (listing) anchors.push({ urlLine, anchorLine: index, listing });
  });
  return anchors;
}

function nextContentLine(lines: readonly string[], from: number): number {
  let index = from;
  while (index < lines.length && lines[index] === "") index++;
  return index;
}

/** Parses one listing from its own block (lines since the previous anchor). */
function parseBlock(block: readonly string[], listing: Anchor["listing"]): ParsedApartment | null {
  const rentIndex = block.findLastIndex((line) => parseKaltmiete(line) !== null);
  if (rentIndex === -1) return null;

  const titleIndex = nextContentLine(block, rentIndex + 1);
  const title = block[titleIndex] ?? "";
  if (!title || parseRoomsAndArea(title)) return null;

  const roomsIndex = nextContentLine(block, titleIndex + 1);
  const roomsAndArea = roomsIndex < block.length ? parseRoomsAndArea(block[roomsIndex]) : null;
  const locationStart = roomsAndArea ? roomsIndex + 1 : titleIndex + 1;

  return {
    source: "immowelt",
    ...listing,
    title,
    rentCold: parseKaltmiete(block[rentIndex]),
    rooms: roomsAndArea?.rooms ?? null,
    sqm: roomsAndArea?.sqm ?? null,
    district: districtFromLocation(block.slice(locationStart)),
    // Not in this alert format.
    address: null,
    rentWarm: null,
    floor: null,
    description: null,
    imageUrl: null,
  };
}

function textLines(email: IncomingEmail): string[] {
  return (email.text ?? "").split(/\r?\n/).map(normalizeSpaces);
}

export const immoweltParser: ApartmentParser = {
  name: "immowelt",
  version: "1.0.0",

  canParse(email: IncomingEmail): boolean {
    return findAnchors(textLines(email)).length > 0;
  },

  parse(email: IncomingEmail): ParsedApartment[] {
    const lines = textLines(email);
    const seen = new Set<string>();
    const apartments: ParsedApartment[] = [];
    let blockStart = 0;
    for (const anchor of findAnchors(lines)) {
      const block = lines.slice(blockStart, anchor.urlLine);
      blockStart = anchor.anchorLine + 1;
      if (seen.has(anchor.listing.sourceId)) continue;
      const apartment = parseBlock(block, anchor.listing);
      if (apartment) {
        seen.add(anchor.listing.sourceId);
        apartments.push(apartment);
      }
    }
    return apartments;
  },
};
