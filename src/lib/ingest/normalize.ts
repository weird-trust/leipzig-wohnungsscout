import type {
  ApartmentFeatures,
  NewApartment,
} from "@/lib/domain/apartment";
import { extractFeatures } from "@/lib/features";
import { createApartmentFingerprint } from "@/lib/fingerprint";
import type { ParsedApartment } from "@/lib/parsers/types";

/**
 * Per feature: an explicit structured parser value wins, then the value
 * extracted from the text, then null. A structured null (or "unknown"
 * building type) counts as "not stated" and does not hide the text value.
 */
export function mergeFeatures(
  structured: Partial<ApartmentFeatures> | undefined,
  extracted: ApartmentFeatures,
): ApartmentFeatures {
  const pick = <K extends Exclude<keyof ApartmentFeatures, "buildingType">>(key: K) =>
    structured?.[key] ?? extracted[key];

  return {
    topFloor: pick("topFloor"),
    balcony: pick("balcony"),
    bathtub: pick("bathtub"),
    residentialKitchen: pick("residentialKitchen"),
    elevator: pick("elevator"),
    buildingType:
      structured?.buildingType && structured.buildingType !== "unknown"
        ? structured.buildingType
        : extracted.buildingType,
  };
}

/** Parsed listing → apartment ready to store: merged features and fingerprint. */
export function toNewApartment(parsed: ParsedApartment, emailId: string): NewApartment {
  const { features: structured, ...listing } = parsed;
  const text = [listing.title, listing.description].filter(Boolean).join("\n");
  return {
    ...listing,
    ...mergeFeatures(structured, extractFeatures(text)),
    emailId,
    fingerprint: createApartmentFingerprint(listing),
  };
}
