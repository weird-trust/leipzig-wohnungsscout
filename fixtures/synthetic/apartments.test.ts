import { describe, expect, it } from "vitest";
import { scoreApartment } from "@/lib/scoring";
import { SYNTHETIC_APARTMENTS, toNewApartment } from "./apartments";

const byId = (sourceId: string) => {
  const entry = SYNTHETIC_APARTMENTS.find((e) => e.sourceId === sourceId);
  if (!entry) throw new Error(`missing ${sourceId}`);
  return { entry, apartment: toNewApartment(entry) };
};

describe("synthetic seed data", () => {
  it("is clearly marked as synthetic and never claims a real platform", () => {
    for (const entry of SYNTHETIC_APARTMENTS) {
      const apartment = toNewApartment(entry);
      expect(apartment.source).toBe("other");
      expect(apartment.sourceUrl).toBeNull();
      expect(apartment.sourceId).toMatch(/^synthetic-/);
      expect(apartment.description).toContain("Synthetischer Testdatensatz");
    }
  });

  it("has unique source ids so re-seeding upserts instead of duplicating", () => {
    const ids = SYNTHETIC_APARTMENTS.map((e) => e.sourceId);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("contains an ideal top-floor apartment scoring 100", () => {
    const { apartment } = byId("synthetic-ideal-top-floor");
    expect(apartment.topFloor).toBe(true);
    expect(scoreApartment(apartment).score).toBe(100);
  });

  it("contains an apartment over budget", () => {
    const { apartment } = byId("synthetic-over-budget");
    expect(apartment.rentWarm).toBe(1750);
    expect(scoreApartment(apartment).breakdown.map((i) => i.rule)).toContain("warmRentOver");
  });

  it("contains an apartment with only unknown features", () => {
    const { apartment } = byId("synthetic-unknown-features");
    expect(apartment).toMatchObject({
      topFloor: null,
      balcony: null,
      bathtub: null,
      residentialKitchen: null,
      elevator: null,
      buildingType: "unknown",
      rentWarm: null,
      fingerprint: null,
    });
  });

  it("contains explicit negative features", () => {
    const { apartment } = byId("synthetic-rejected");
    expect(apartment).toMatchObject({ balcony: false, bathtub: false, elevator: false });
  });

  it("covers every workflow status, an applied favorite and a new favorite", () => {
    const statuses = new Set(SYNTHETIC_APARTMENTS.map((e) => e.status));
    expect([...statuses].sort()).toEqual(
      ["applied", "gone", "new", "rejected", "seen", "viewing"],
    );
    expect(byId("synthetic-applied-favorite").entry).toMatchObject({
      status: "applied",
      isFavorite: true,
    });
    expect(byId("synthetic-new-favorite").entry).toMatchObject({
      status: "new",
      isFavorite: true,
    });
  });

  it("spans several Leipzig districts", () => {
    const districts = new Set(SYNTHETIC_APARTMENTS.map((e) => e.district));
    expect(districts.size).toBeGreaterThanOrEqual(8);
  });
});
