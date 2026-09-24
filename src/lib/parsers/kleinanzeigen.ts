import type { IncomingEmail } from "@/lib/domain/email";
import type { ApartmentParser, ParsedApartment } from "@/lib/parsers/types";

/**
 * Kleinanzeigen saved-search alert parser, built against the real plain-text
 * alert in fixtures/emails/kleinanzeigen/alert-01.json (regression fixture).
 * It only understands the listing structure shown there:
 *
 *   Bild zur Anzeige <title>           ← image alt text
 *   [https://img.kleinanzeigen.de/…]   ← listing image
 *
 *   <title>                            ← canonical title
 *
 *   800 €                              ← price of unknown kind: not mapped
 *
 *   Von Privat                         ← seller type: no field, not mapped
 *
 *   Anzeige ansehen
 *   [https://www.kleinanzeigen.de/s-anzeige/<id>]
 *
 * Each "Anzeige ansehen" + listing-URL pair anchors one listing; the lines
 * since the previous anchor form its block. The alert has no address,
 * district, area or clearly typed rent, so those stay null.
 */

const LISTING_HOST = "www.kleinanzeigen.de";
const LISTING_PATH = /^\/s-anzeige\/(\d+)$/;
const IMAGE_HOST = "img.kleinanzeigen.de";
const ANCHOR = "Anzeige ansehen";
const IMAGE_ALT_PREFIX = "Bild zur Anzeige ";
const BRACKETED = /^\[(\S+)\]$/;

function parseUrl(value: string): URL | null {
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:" ? url : null;
  } catch {
    return null;
  }
}

/** "[https://www.kleinanzeigen.de/s-anzeige/<digits>?…]" → canonical URL and id. */
export function parseListingLink(line: string): { sourceUrl: string; sourceId: string } | null {
  const url = parseUrl(line.match(BRACKETED)?.[1] ?? "");
  if (!url || url.hostname !== LISTING_HOST) return null;
  const id = url.pathname.match(LISTING_PATH)?.[1];
  return id ? { sourceUrl: `${url.origin}${url.pathname}`, sourceId: id } : null;
}

/** "[https://img.kleinanzeigen.de/…]" → the image URL without query; other hosts → null. */
export function parseListingImage(line: string): string | null {
  const url = parseUrl(line.match(BRACKETED)?.[1] ?? "");
  return url && url.hostname === IMAGE_HOST ? `${url.origin}${url.pathname}` : null;
}

const ROOMS_IN_TITLE = /(?<![\d,.])(\d{1,2})(?:[,.](\d))?\s*Zi\./g;

/**
 * Rooms from the title pattern "<n> Zi." seen in the real alert ("3 Zi.",
 * also "3,5 Zi."). No match, several matches or implausible values → null.
 */
export function roomsFromTitle(title: string): number | null {
  const matches = [...title.matchAll(ROOMS_IN_TITLE)];
  if (matches.length !== 1) return null;
  const [, whole, fraction] = matches[0];
  const rooms = Number(`${whole}.${fraction ?? "0"}`);
  return rooms > 0 ? rooms : null;
}

function nextNonEmpty(lines: readonly string[], from: number): number {
  let index = from;
  while (index < lines.length && lines[index] === "") index++;
  return index;
}

interface Anchor {
  /** Index of the listing-URL line. */
  urlLine: number;
  anchorLine: number;
  link: { sourceUrl: string; sourceId: string };
}

function findAnchors(lines: readonly string[]): Anchor[] {
  const anchors: Anchor[] = [];
  lines.forEach((line, index) => {
    if (line !== ANCHOR) return;
    const urlLine = nextNonEmpty(lines, index + 1);
    const link = urlLine < lines.length ? parseListingLink(lines[urlLine]) : null;
    if (link) anchors.push({ urlLine, anchorLine: index, link });
  });
  return anchors;
}

function parseBlock(block: readonly string[], link: Anchor["link"]): ParsedApartment | null {
  const altIndex = block.findLastIndex((line) => line.startsWith(IMAGE_ALT_PREFIX));
  if (altIndex === -1) return null;
  const altTitle = block[altIndex].slice(IMAGE_ALT_PREFIX.length).trim();

  let cursor = nextNonEmpty(block, altIndex + 1);
  const imageUrl = cursor < block.length ? parseListingImage(block[cursor]) : null;
  if (cursor < block.length && BRACKETED.test(block[cursor])) {
    cursor = nextNonEmpty(block, cursor + 1);
  }

  const standaloneTitle = cursor < block.length ? block[cursor] : "";
  const title = standaloneTitle || altTitle;
  if (!title) return null;

  return {
    source: "kleinanzeigen",
    ...link,
    title,
    rooms: roomsFromTitle(title),
    // Not provided by this alert format (the displayed price has no rent type).
    address: null,
    district: null,
    sqm: null,
    rentCold: null,
    rentWarm: null,
    floor: null,
    // "Von Privat" is a seller type, not a description.
    description: null,
    imageUrl,
  };
}

function textLines(email: IncomingEmail): string[] {
  return (email.text ?? "").split(/\r?\n/).map((line) => line.trim());
}

export const kleinanzeigenParser: ApartmentParser = {
  name: "kleinanzeigen",
  version: "1.0.0",

  canParse(email: IncomingEmail): boolean {
    return findAnchors(textLines(email)).length > 0;
  },

  parse(email: IncomingEmail): ParsedApartment[] {
    const lines = textLines(email);
    const apartments: ParsedApartment[] = [];
    let blockStart = 0;
    for (const anchor of findAnchors(lines)) {
      const apartment = parseBlock(lines.slice(blockStart, anchor.anchorLine), anchor.link);
      if (apartment) apartments.push(apartment);
      blockStart = anchor.urlLine + 1;
    }
    return apartments;
  },
};
