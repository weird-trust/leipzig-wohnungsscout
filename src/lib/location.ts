import type { Apartment } from "@/lib/domain/apartment";
import { normalizeDistrict } from "@/lib/fingerprint";

/**
 * The preferred area around Plagwitz, Schleußig and Lindenau. Scoring and the
 * dashboard's default filter both read it from here.
 */
export const PREFERRED_AREA = {
  /** Compared after normalization, so "Altlindenau" matches "Alt-Lindenau". */
  districts: [
    "Plagwitz",
    "Schleußig",
    "Lindenau",
    "Alt-Lindenau",
    "Neulindenau",
    "Kleinzschocher",
  ],
  /**
   * Postcodes covering those districts. A postcode also covers neighbouring
   * districts, so it is a weaker signal than a named district and is only
   * used when the district is unknown.
   */
  postcodes: ["04229", "04177", "04179"],
} as const;

/**
 * preferred: district in the preferred area.
 * nearby: district unknown, postcode in the preferred area.
 * outside: district (or, without one, postcode) known and not in the area.
 * null: neither known.
 */
export type LocationMatch = "preferred" | "nearby" | "outside";

/** "Leipzig-Alt-Lindenau", "Altlindenau", "alt lindenau" → "altlindenau". */
function districtKey(district: string): string {
  return normalizeDistrict(district).replace(/^leipzig-/, "").replaceAll("-", "");
}

const PREFERRED_DISTRICT_KEYS: ReadonlySet<string> = new Set(
  PREFERRED_AREA.districts.map(districtKey),
);
const PREFERRED_POSTCODES: ReadonlySet<string> = new Set(PREFERRED_AREA.postcodes);

export function matchLocation(
  apartment: Pick<Apartment, "district" | "postcode">,
): LocationMatch | null {
  const district = apartment.district ? districtKey(apartment.district) : "";
  if (district !== "") {
    return PREFERRED_DISTRICT_KEYS.has(district) ? "preferred" : "outside";
  }
  if (apartment.postcode !== null) {
    return PREFERRED_POSTCODES.has(apartment.postcode) ? "nearby" : "outside";
  }
  return null;
}
