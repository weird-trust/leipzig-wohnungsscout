import type { IncomingEmail } from "@/lib/domain/email";
import type { ApartmentParser, ParsedApartment } from "@/lib/parsers/types";
import { senderDomain } from "@/lib/sourceDetection";

/**
 * ImmoScout24 search-alert parser, built against the real plain-text alert in
 * fixtures/emails/immoscout/alert-01.json (the regression fixture). It only
 * understands the structure shown there:
 *
 *   Titel: <title>
 *   Link: https://push.search.is24.de/email/expose/<id>?<tracking>
 *   Adresse: <street>, <district>, Leipzig
 *   Kaltmiete: 1.099 €
 *   Wohnfläche: 77 m²
 *   Zimmer: 3
 *   <free text, e.g. "Balkon/Terrasse, Einbauküche">
 *   -------------------------------
 *   Alle Angebote ansehen            ← end of listings; search management and
 *   …                                  an HTML footer follow
 *
 * Features are not set here: the free text goes into `description` and the
 * generic extraction step reads it.
 */

const SENDER_DOMAIN = "immobilienscout24.de";
const LISTING_HOST = "push.search.is24.de";
const LISTING_PATH = /^\/email\/expose\/(\d+)$/;
const LISTING_LINK = /https:\/\/push\.search\.is24\.de\/email\/expose\/\d+/;

const SEPARATOR = /^-{10,}$/;
const LISTINGS_END = "Alle Angebote ansehen";
const FOOTER_START = "<!-- FOOTER START -->";
const FIELD = /^(Titel|Link|Adresse|Kaltmiete|Wohnfläche|Zimmer):\s*(.*)$/;

type Field = "Titel" | "Link" | "Adresse" | "Kaltmiete" | "Wohnfläche" | "Zimmer";

/** "1.099 €" → 1099, "1.099,50 €" → 1099.5; anything else → null. */
export function parseGermanEuro(value: string | undefined): number | null {
  const match = value?.trim().match(/^(\d{1,3}(?:\.\d{3})+|\d+)(?:,(\d{1,2}))?\s*€$/);
  if (!match) return null;
  return Number(`${match[1].replaceAll(".", "")}.${match[2] ?? "0"}`);
}

/** "77 m²" → 77, "77,5 m²" → 77.5; anything else → null. */
export function parseSquareMeters(value: string | undefined): number | null {
  const match = value?.trim().match(/^(\d+)(?:,(\d{1,2}))?\s*m²$/);
  if (!match) return null;
  return Number(`${match[1]}.${match[2] ?? "0"}`);
}

/** "3" → 3, "3,5" → 3.5; anything else → null. */
export function parseRoomCount(value: string | undefined): number | null {
  const match = value?.trim().match(/^(\d{1,2})(?:,(5))?$/);
  if (!match) return null;
  const rooms = Number(`${match[1]}.${match[2] ?? "0"}`);
  return rooms > 0 ? rooms : null;
}

/**
 * The listing URL without query/fragment (the real alert appends personal
 * tracking parameters), and its numeric id when the path is exactly
 * /email/expose/<digits> on push.search.is24.de.
 */
export function parseListingLink(value: string | undefined): {
  sourceUrl: string | null;
  sourceId: string | null;
} {
  let url: URL;
  try {
    url = new URL(value?.trim() ?? "");
  } catch {
    return { sourceUrl: null, sourceId: null };
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") {
    return { sourceUrl: null, sourceId: null };
  }
  const id = url.hostname === LISTING_HOST ? url.pathname.match(LISTING_PATH)?.[1] : undefined;
  return { sourceUrl: `${url.origin}${url.pathname}`, sourceId: id ?? null };
}

/** "<street>, <district>, Leipzig" → district; any other shape → null. */
export function districtFromAddress(address: string | null): string | null {
  if (!address) return null;
  const parts = address.split(",").map((part) => part.trim());
  if (parts.length < 3 || parts.at(-1) !== "Leipzig") return null;
  const district = parts.at(-2) ?? "";
  return district !== "" && !/\d/.test(district) ? district : null;
}

/** Plain-text lines that can contain listings: before "Alle Angebote ansehen" and the footer. */
function listingLines(text: string): string[] {
  const beforeFooter = text.split(FOOTER_START)[0];
  const lines = beforeFooter.split(/\r?\n/).map((line) => line.trim());
  const end = lines.indexOf(LISTINGS_END);
  return end === -1 ? lines : lines.slice(0, end);
}

/** Each block starts at a "Titel:" line and ends at the next one or a separator. */
function listingBlocks(lines: readonly string[]): string[][] {
  const blocks: string[][] = [];
  let current: string[] | null = null;
  for (const line of lines) {
    if (line.startsWith("Titel:")) {
      current = [line];
      blocks.push(current);
    } else if (SEPARATOR.test(line)) {
      current = null;
    } else if (current) {
      current.push(line);
    }
  }
  return blocks;
}

function parseBlock(block: readonly string[]): ParsedApartment | null {
  const fields = new Map<Field, string>();
  let lastFieldIndex = -1;
  block.forEach((line, index) => {
    const match = line.match(FIELD);
    if (match && !fields.has(match[1] as Field)) {
      fields.set(match[1] as Field, match[2].trim());
      lastFieldIndex = index;
    }
  });

  const title = fields.get("Titel");
  if (!title) return null;

  const description = block
    .slice(lastFieldIndex + 1)
    .filter((line) => line !== "")
    .join("\n");
  const address = fields.get("Adresse") || null;

  return {
    source: "immoscout",
    ...parseListingLink(fields.get("Link")),
    title,
    address,
    district: districtFromAddress(address),
    rooms: parseRoomCount(fields.get("Zimmer")),
    sqm: parseSquareMeters(fields.get("Wohnfläche")),
    rentCold: parseGermanEuro(fields.get("Kaltmiete")),
    // Not part of this alert format.
    rentWarm: null,
    floor: null,
    imageUrl: null,
    description: description || null,
  };
}

export const immoscoutParser: ApartmentParser = {
  name: "immoscout",
  version: "1.0.0",

  canParse(email: IncomingEmail): boolean {
    if (!email.text || !/^\s*Titel:/m.test(email.text)) return false;
    const domain = email.from ? senderDomain(email.from) : null;
    const fromImmoscout =
      domain === SENDER_DOMAIN || (domain?.endsWith(`.${SENDER_DOMAIN}`) ?? false);
    return fromImmoscout || LISTING_LINK.test(email.text);
  },

  parse(email: IncomingEmail): ParsedApartment[] {
    if (!email.text) return [];
    return listingBlocks(listingLines(email.text))
      .map(parseBlock)
      .filter((apartment): apartment is ParsedApartment => apartment !== null);
  },
};
