import type {
  ApartmentStatus,
  NewApartment,
} from "@/lib/domain/apartment";
import { extractFeatures } from "@/lib/features";
import { createApartmentFingerprint } from "@/lib/fingerprint";

/**
 * SYNTHETIC apartments for UI development. Invented by hand; they do not
 * come from any platform and must not be used as parser fixtures (those live
 * in fixtures/emails/<platform>/). All use source "other", no URL, and a
 * "synthetic-" source id, which also makes re-seeding an upsert.
 *
 * Features are derived from the German text with the real extractor, so the
 * seed stays consistent with the heuristics.
 */

export interface SyntheticApartment {
  sourceId: `synthetic-${string}`;
  title: string;
  description: string;
  address: string | null;
  district: string | null;
  rooms: number | null;
  sqm: number | null;
  rentCold: number | null;
  rentWarm: number | null;
  floor: number | null;
  status: ApartmentStatus;
  isFavorite: boolean;
}

const NOTE = "Synthetischer Testdatensatz.";

export const SYNTHETIC_APARTMENTS: readonly SyntheticApartment[] = [
  {
    sourceId: "synthetic-ideal-top-floor",
    title: "3,5-Zimmer-Dachgeschosswohnung in der Südvorstadt",
    description: `${NOTE} Helle Wohnung im Dachgeschoss eines sanierten Altbaus mit Aufzug. Große Wohnküche, Bad mit Badewanne, Südbalkon.`,
    address: "Beispielstraße 12",
    district: "Südvorstadt",
    rooms: 3.5,
    sqm: 102,
    rentCold: 1180,
    rentWarm: 1450,
    floor: 5,
    status: "new",
    isFavorite: false,
  },
  {
    sourceId: "synthetic-over-budget",
    title: "4-Zimmer-Neubauwohnung am Zentrum",
    description: `${NOTE} Neubau mit Aufzug, großer Balkon, modernes Duschbad.`,
    address: null,
    district: "Zentrum-Süd",
    rooms: 4,
    sqm: 118,
    rentCold: 1420,
    rentWarm: 1750,
    floor: 3,
    status: "new",
    isFavorite: false,
  },
  {
    sourceId: "synthetic-unknown-features",
    title: "3-Zimmer-Wohnung in Gohlis",
    description: `${NOTE} Wohnung in ruhiger Lage, ab sofort frei.`,
    address: null,
    district: "Gohlis-Süd",
    rooms: 3,
    sqm: 95,
    rentCold: 980,
    rentWarm: null,
    floor: null,
    status: "new",
    isFavorite: false,
  },
  {
    sourceId: "synthetic-rejected",
    title: "2-Zimmer-Wohnung in Grünau",
    description: `${NOTE} Kompakte Wohnung, kein Balkon, keine Badewanne, ohne Aufzug.`,
    address: null,
    district: "Grünau-Mitte",
    rooms: 2,
    sqm: 58,
    rentCold: 450,
    rentWarm: 690,
    floor: 2,
    status: "rejected",
    isFavorite: false,
  },
  {
    sourceId: "synthetic-applied-favorite",
    title: "Altbauwohnung mit Loggia in Plagwitz",
    description: `${NOTE} Altbau, kein Balkon, dafür Loggia zum Hof. Wannenbad, Küche mit Essbereich.`,
    address: null,
    district: "Plagwitz",
    rooms: 3,
    sqm: 92,
    rentCold: 1090,
    rentWarm: 1380,
    floor: 2,
    status: "applied",
    isFavorite: true,
  },
  {
    sourceId: "synthetic-viewing",
    title: "Dachgeschoss mit Dachterrasse in Connewitz",
    description: `${NOTE} 4 Zimmer im DG, eigene Dachterrasse, leider ohne Aufzug. Bad mit Wanne.`,
    address: null,
    district: "Connewitz",
    rooms: 4,
    sqm: 105,
    rentCold: 1240,
    rentWarm: 1520,
    floor: 4,
    status: "viewing",
    isFavorite: false,
  },
  {
    sourceId: "synthetic-seen",
    title: "Erdgeschosswohnung mit Terrasse in Schleußig",
    description: `${NOTE} Neubau, offene Küche mit Essbereich, Terrasse zum Garten.`,
    address: null,
    district: "Schleußig",
    rooms: 3,
    sqm: 84,
    rentCold: 1030,
    rentWarm: 1290,
    floor: 0,
    status: "seen",
    isFavorite: false,
  },
  {
    sourceId: "synthetic-gone",
    title: "3-Zimmer-Wohnung in Reudnitz",
    description: `${NOTE} Balkon, Duschbad.`,
    address: null,
    district: "Reudnitz-Thonberg",
    rooms: 3,
    sqm: 88,
    rentCold: 920,
    rentWarm: 1190,
    floor: 1,
    status: "gone",
    isFavorite: false,
  },
  {
    sourceId: "synthetic-too-many-rooms",
    title: "5-Zimmer-Altbau in Lindenau",
    description: `${NOTE} Großzügiger Altbau mit Balkon.`,
    address: null,
    district: "Lindenau",
    rooms: 5,
    sqm: 135,
    rentCold: 1210,
    rentWarm: 1490,
    floor: 1,
    status: "new",
    isFavorite: false,
  },
  {
    sourceId: "synthetic-new-favorite",
    title: "Wohnung mit Wohnküche in Eutritzsch",
    description: `${NOTE} Wohnküche, Balkon, Badewanne. Baujahr unbekannt.`,
    address: null,
    district: "Eutritzsch",
    rooms: 3,
    sqm: 99,
    rentCold: 1070,
    rentWarm: 1350,
    floor: 2,
    status: "new",
    isFavorite: true,
  },
];

export function toNewApartment(
  entry: SyntheticApartment,
): NewApartment & { sourceId: string } {
  return {
    source: "other",
    sourceUrl: null,
    sourceId: entry.sourceId,
    emailId: null,
    title: entry.title,
    address: entry.address,
    district: entry.district,
    rooms: entry.rooms,
    sqm: entry.sqm,
    rentCold: entry.rentCold,
    rentWarm: entry.rentWarm,
    floor: entry.floor,
    description: entry.description,
    imageUrl: null,
    ...extractFeatures(`${entry.title}. ${entry.description}`),
    fingerprint: createApartmentFingerprint(entry),
  };
}
