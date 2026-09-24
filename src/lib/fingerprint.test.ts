import { describe, expect, it } from "vitest";
import {
  createApartmentFingerprint,
  normalizeDistrict,
  type FingerprintInput,
} from "@/lib/fingerprint";

const base: FingerprintInput = {
  district: "Südvorstadt",
  rooms: 3,
  sqm: 98.6,
  rentWarm: 1234,
};

describe("normalizeDistrict", () => {
  it.each([
    ["Südvorstadt", "suedvorstadt"],
    ["  SÜDVORSTADT ", "suedvorstadt"],
    ["Leipzig-Plagwitz", "leipzig-plagwitz"],
    ["Gohlis Süd", "gohlis-sued"],
    ["Schleußig", "schleussig"],
    ["Zentrum-Süd / Ost", "zentrum-sued-ost"],
  ])("%j → %j", (input, expected) => {
    expect(normalizeDistrict(input)).toBe(expected);
  });
});

describe("createApartmentFingerprint", () => {
  it("combines normalized district and rounded values", () => {
    expect(createApartmentFingerprint(base)).toBe("suedvorstadt|3|99|1230");
  });

  it("gives the same fingerprint for small differences in spelling and numbers", () => {
    const other = { district: "SÜDVORSTADT ", rooms: 3, sqm: 99.2, rentWarm: 1228 };
    expect(createApartmentFingerprint(other)).toBe(createApartmentFingerprint(base));
  });

  it("keeps half rooms", () => {
    expect(createApartmentFingerprint({ ...base, rooms: 3.5 })).toBe(
      "suedvorstadt|3.5|99|1230",
    );
  });

  it.each(["district", "rooms", "sqm", "rentWarm"] as const)(
    "returns null when %s is unknown",
    (field) => {
      expect(createApartmentFingerprint({ ...base, [field]: null })).toBeNull();
    },
  );

  it("returns null for a district that normalizes to nothing", () => {
    expect(createApartmentFingerprint({ ...base, district: " – " })).toBeNull();
  });

  it("returns null for non-finite numbers", () => {
    expect(createApartmentFingerprint({ ...base, sqm: Number.NaN })).toBeNull();
  });
});
