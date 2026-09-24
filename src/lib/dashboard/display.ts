import type {
  Apartment,
  ApartmentStatus,
  BuildingType,
  Source,
  TriState,
} from "@/lib/domain/apartment";
import type { Sort, Tab } from "@/lib/dashboard/query";

/** German UI labels and formatting. No logic beyond presentation. */

export const TAB_LABELS: Record<Tab, string> = {
  all: "Alle",
  new: "Neu",
  favorites: "Favoriten",
  applied: "Beworben",
  viewing: "Besichtigungen",
};

export const SORT_LABELS: Record<Sort, string> = {
  score: "Score",
  newest: "Neueste",
  rent: "Warmmiete",
  area: "Fläche",
};

export const STATUS_LABELS: Record<ApartmentStatus, string> = {
  new: "Neu",
  seen: "Gesehen",
  applied: "Beworben",
  viewing: "Besichtigung",
  rejected: "Abgelehnt",
  gone: "Nicht mehr verfügbar",
};

export const SOURCE_LABELS: Record<Source, string> = {
  immoscout: "ImmoScout24",
  immowelt: "Immowelt",
  kleinanzeigen: "Kleinanzeigen",
  "wg-gesucht": "WG-Gesucht",
  lwb: "LWB",
  "ohne-makler": "Ohne-Makler",
  other: "Andere Quelle",
};

export const FEATURE_LABELS = {
  topFloor: "Dachgeschoss",
  balcony: "Balkon / Terrasse",
  bathtub: "Badewanne",
  residentialKitchen: "Wohnküche",
  elevator: "Aufzug",
} as const;
export type DisplayFeature = keyof typeof FEATURE_LABELS;
export const DISPLAY_FEATURES = Object.keys(FEATURE_LABELS) as DisplayFeature[];

export const TRI_STATE_TEXT = {
  yes: "vorhanden",
  no: "nicht vorhanden",
  unknown: "unbekannt",
} as const;

export function triStateKey(value: TriState): keyof typeof TRI_STATE_TEXT {
  if (value === true) return "yes";
  if (value === false) return "no";
  return "unknown";
}

export function buildingTypeLabel(type: BuildingType): string | null {
  if (type === "altbau") return "Altbau";
  if (type === "neubau") return "Neubau";
  return null;
}

const euro = new Intl.NumberFormat("de-DE", {
  style: "currency",
  currency: "EUR",
  maximumFractionDigits: 0,
});
const euroCents = new Intl.NumberFormat("de-DE", {
  style: "currency",
  currency: "EUR",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});
const decimal = new Intl.NumberFormat("de-DE", { maximumFractionDigits: 1 });
const dateTime = new Intl.DateTimeFormat("de-DE", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "Europe/Berlin",
});

export function formatEuro(value: number): string {
  return euro.format(value);
}

export function formatEuroCents(value: number): string {
  return euroCents.format(value);
}

export function formatRooms(value: number): string {
  return `${decimal.format(value)} Zi.`;
}

export function formatSqm(value: number): string {
  return `${decimal.format(value)} m²`;
}

export function formatDateTime(value: Date): string {
  return dateTime.format(value);
}

/** Warm rent per m² when known, otherwise cold rent per m², labelled accordingly. */
export function rentPerSqm(
  apartment: Pick<Apartment, "rentWarm" | "rentCold" | "sqm">,
): { value: number; basis: "warm" | "kalt"; text: string } | null {
  const { sqm } = apartment;
  if (sqm === null || sqm <= 0) return null;
  const rent = apartment.rentWarm ?? apartment.rentCold;
  if (rent === null) return null;
  const basis = apartment.rentWarm !== null ? "warm" : "kalt";
  const value = rent / sqm;
  return { value, basis, text: `${formatEuroCents(value)}/m² ${basis}` };
}

/** Splits plain-text descriptions into paragraphs on blank lines. */
export function paragraphs(text: string | null): string[] {
  if (!text) return [];
  return text
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter((p) => p.length > 0);
}

/** 0 → "EG", 3 → "3. OG", -1 → "UG". */
export function formatFloor(floor: number): string {
  if (floor === 0) return "EG";
  if (floor < 0) return "UG";
  return `${floor}. OG`;
}

/** The rent to headline: warm when known, otherwise cold, labelled accordingly. */
export function primaryRent(
  apartment: Pick<Apartment, "rentWarm" | "rentCold">,
): { value: number; basis: "warm" | "kalt"; text: string } | null {
  const rent = apartment.rentWarm ?? apartment.rentCold;
  if (rent === null) return null;
  const basis = apartment.rentWarm !== null ? "warm" : "kalt";
  return { value: rent, basis, text: `${formatEuro(rent)} ${basis}` };
}

const relative = new Intl.RelativeTimeFormat("de-DE", { numeric: "auto", style: "short" });
const shortDate = new Intl.DateTimeFormat("de-DE", { dateStyle: "medium", timeZone: "Europe/Berlin" });

/** "gerade eben", "vor 28 Min.", "vor 3 Std.", "gestern", "vor 4 Tagen", then the date. */
export function formatAge(value: Date, now: Date): string {
  const minutes = Math.floor((now.getTime() - value.getTime()) / 60_000);
  if (minutes < 1) return "gerade eben";
  if (minutes < 60) return relative.format(-minutes, "minute");
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return relative.format(-hours, "hour");
  const days = Math.floor(hours / 24);
  if (days < 7) return relative.format(-days, "day");
  return shortDate.format(value);
}
