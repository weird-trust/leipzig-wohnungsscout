import type { Apartment } from "@/lib/domain/apartment";

/**
 * Simple V0.1 fingerprint for spotting likely duplicates later.
 * Equal fingerprints are a hint only; nothing is merged automatically.
 */

/** Rounding steps; widen these once real duplicates show up. */
export const FINGERPRINT_STEPS = {
  rooms: 0.5,
  sqm: 1,
  rentWarm: 10,
} as const;

export type FingerprintInput = Pick<
  Apartment,
  "district" | "rooms" | "sqm" | "rentWarm"
>;

const UMLAUTS: Record<string, string> = { ä: "ae", ö: "oe", ü: "ue", ß: "ss" };

/** "Leipzig-Südvorstadt " → "leipzig-suedvorstadt". Returns "" if nothing is left. */
export function normalizeDistrict(district: string): string {
  return district
    .normalize("NFC")
    .toLowerCase()
    .replace(/[äöüß]/g, (char) => UMLAUTS[char])
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function roundTo(value: number, step: number): number {
  return Math.round(value / step) * step;
}

export function createApartmentFingerprint(
  input: FingerprintInput,
): string | null {
  const { district, rooms, sqm, rentWarm } = input;
  if (district === null || rooms === null || sqm === null || rentWarm === null) {
    return null;
  }
  if (![rooms, sqm, rentWarm].every(Number.isFinite)) return null;

  const normalizedDistrict = normalizeDistrict(district);
  if (normalizedDistrict === "") return null;

  return [
    normalizedDistrict,
    roundTo(rooms, FINGERPRINT_STEPS.rooms),
    roundTo(sqm, FINGERPRINT_STEPS.sqm),
    roundTo(rentWarm, FINGERPRINT_STEPS.rentWarm),
  ].join("|");
}
