export const SOURCES = [
  "immoscout",
  "immowelt",
  "kleinanzeigen",
  "wg-gesucht",
  "lwb",
  "ohne-makler",
  "other",
] as const;
export type Source = (typeof SOURCES)[number];

/** Workflow status. Favorite is deliberately not a status, see `isFavorite`. */
export const APARTMENT_STATUSES = [
  "new",
  "seen",
  "applied",
  "viewing",
  "rejected",
  "gone",
] as const;
export type ApartmentStatus = (typeof APARTMENT_STATUSES)[number];

export const BUILDING_TYPES = ["altbau", "neubau", "unknown"] as const;
export type BuildingType = (typeof BUILDING_TYPES)[number];

/**
 * true = explicitly present, false = explicitly absent, null = unknown.
 * Missing information is never false.
 */
export type TriState = boolean | null;

export interface ApartmentFeatures {
  topFloor: TriState;
  /** Balcony, loggia, terrace or roof terrace. */
  balcony: TriState;
  bathtub: TriState;
  residentialKitchen: TriState;
  elevator: TriState;
  buildingType: BuildingType;
}

/** Listing data as delivered by a source, before feature extraction. */
export interface ListingData {
  source: Source;
  sourceUrl: string | null;
  sourceId: string | null;

  title: string;
  address: string | null;
  district: string | null;

  rooms: number | null;
  sqm: number | null;
  rentCold: number | null;
  rentWarm: number | null;
  floor: number | null;

  description: string | null;
  imageUrl: string | null;
}

export interface Apartment extends ListingData, ApartmentFeatures {
  id: string;
  /** The alert email this listing came from; null for seeded/manual rows. */
  emailId: string | null;
  fingerprint: string | null;

  status: ApartmentStatus;
  /** Independent of `status`: an apartment can be both applied and a favorite. */
  isFavorite: boolean;

  firstSeen: Date;
  /** Received time of the linked email; null when there is none. */
  emailReceivedAt: Date | null;
}

/** What ingestion (or the seed) stores; workflow fields start at their defaults. */
export interface NewApartment extends ListingData, ApartmentFeatures {
  emailId: string | null;
  fingerprint: string | null;
}
