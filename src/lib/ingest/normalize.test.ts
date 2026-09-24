import { describe, expect, it } from "vitest";
import type { ApartmentFeatures } from "@/lib/domain/apartment";
import { mergeFeatures, toNewApartment } from "@/lib/ingest/normalize";

const extracted: ApartmentFeatures = {
  topFloor: true,
  balcony: true,
  bathtub: null,
  residentialKitchen: false,
  elevator: null,
  buildingType: "altbau",
};

describe("mergeFeatures", () => {
  it("uses extracted values when there are no structured ones", () => {
    expect(mergeFeatures(undefined, extracted)).toEqual(extracted);
    expect(mergeFeatures({}, extracted)).toEqual(extracted);
  });

  it("prefers explicit structured values, including false", () => {
    expect(
      mergeFeatures({ balcony: false, bathtub: true, buildingType: "neubau" }, extracted),
    ).toEqual({ ...extracted, balcony: false, bathtub: true, buildingType: "neubau" });
  });

  it("treats structured null and unknown building type as not stated", () => {
    expect(mergeFeatures({ topFloor: null, buildingType: "unknown" }, extracted)).toEqual(extracted);
  });

  it("stays null when neither side knows", () => {
    expect(mergeFeatures({ elevator: null }, extracted).elevator).toBeNull();
  });
});

describe("toNewApartment", () => {
  it("extracts features from title and description and adds email id and fingerprint", () => {
    const apartment = toNewApartment(
      {
        source: "other",
        sourceUrl: null,
        sourceId: null,
        title: "Dachgeschosswohnung",
        address: null,
        district: "Südvorstadt",
        rooms: 3,
        sqm: 100,
        rentCold: null,
        rentWarm: 1400,
        floor: null,
        description: "Mit Wohnküche und Aufzug.",
        imageUrl: null,
      },
      "row-1",
    );
    expect(apartment).toMatchObject({
      emailId: "row-1",
      topFloor: true,
      residentialKitchen: true,
      elevator: true,
      balcony: null,
      fingerprint: "suedvorstadt|3|100|1400",
    });
    expect(apartment).not.toHaveProperty("features");
  });
});
