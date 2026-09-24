import { describe, expect, it } from "vitest";
import { matchesFilters, matchesTab } from "@/lib/dashboard/filters";
import { DEFAULT_FILTERS, type DashboardFilters } from "@/lib/dashboard/query";
import { makeApartment } from "@/lib/dashboard/testing/apartments";

const filters = (overrides: Partial<DashboardFilters>): DashboardFilters => ({
  ...DEFAULT_FILTERS,
  ...overrides,
});

describe("matchesTab", () => {
  it("shows everything under all", () => {
    expect(matchesTab(makeApartment({ status: "gone" }), "all")).toBe(true);
  });

  it.each(["new", "applied", "viewing"] as const)("matches status for the %s tab", (tab) => {
    expect(matchesTab(makeApartment({ status: tab }), tab)).toBe(true);
    expect(matchesTab(makeApartment({ status: "seen" }), tab)).toBe(false);
  });

  it("uses only isFavorite for favorites, independent of status", () => {
    expect(matchesTab(makeApartment({ status: "applied", isFavorite: true }), "favorites")).toBe(true);
    expect(matchesTab(makeApartment({ status: "rejected", isFavorite: true }), "favorites")).toBe(true);
    expect(matchesTab(makeApartment({ status: "new", isFavorite: false }), "favorites")).toBe(false);
  });

  it("keeps an applied favorite in the applied tab too", () => {
    expect(matchesTab(makeApartment({ status: "applied", isFavorite: true }), "applied")).toBe(true);
  });
});

describe("matchesFilters: optional features", () => {
  it("shows true, false and unknown when the filter is not active", () => {
    for (const balcony of [true, false, null]) {
      expect(matchesFilters(makeApartment({ balcony }), DEFAULT_FILTERS)).toBe(true);
    }
  });

  it("requires explicit true; unknown does not count", () => {
    const requireBalcony = filters({ require: ["balcony"] });
    expect(matchesFilters(makeApartment({ balcony: true }), requireBalcony)).toBe(true);
    expect(matchesFilters(makeApartment({ balcony: false }), requireBalcony)).toBe(false);
    expect(matchesFilters(makeApartment({ balcony: null }), requireBalcony)).toBe(false);
  });

  it("requires all selected features", () => {
    const both = filters({ require: ["topFloor", "residentialKitchen"] });
    expect(matchesFilters(makeApartment({ topFloor: true, residentialKitchen: true }), both)).toBe(true);
    expect(matchesFilters(makeApartment({ topFloor: true, residentialKitchen: null }), both)).toBe(false);
  });

  it("does not let other unknown features block a match", () => {
    const apartment = makeApartment({ bathtub: true, balcony: null, topFloor: false });
    expect(matchesFilters(apartment, filters({ require: ["bathtub"] }))).toBe(true);
  });
});

describe("matchesFilters: numbers", () => {
  it.each([
    [79, false],
    [80, true],
    [120, true],
  ])("minimum area 80 with %d m² → %s", (sqm, expected) => {
    expect(matchesFilters(makeApartment({ sqm }), filters({ minSqm: 80 }))).toBe(expected);
  });

  it.each([
    [1500, true],
    [1500.5, false],
    [900, true],
  ])("maximum warm rent 1500 with %d € → %s", (rentWarm, expected) => {
    expect(matchesFilters(makeApartment({ rentWarm }), filters({ maxWarmRent: 1500 }))).toBe(expected);
  });

  it.each([
    [2.5, false],
    [3, true],
    [3.5, true],
    [4, true],
    [4.5, false],
  ])("rooms 3–4 with %d rooms → %s", (rooms, expected) => {
    expect(matchesFilters(makeApartment({ rooms }), filters({ minRooms: 3, maxRooms: 4 }))).toBe(
      expected,
    );
  });

  it("keeps listings with unknown numbers visible (not known to violate)", () => {
    const active = filters({ minRooms: 3, maxRooms: 4, minSqm: 90, maxWarmRent: 1500 });
    expect(matchesFilters(makeApartment({ rooms: null, sqm: null, rentWarm: null }), active)).toBe(true);
  });

  it("does not use cold rent for the warm rent filter", () => {
    expect(
      matchesFilters(makeApartment({ rentCold: 1400, rentWarm: 1700 }), filters({ maxWarmRent: 1500 })),
    ).toBe(false);
  });
});

describe("matchesFilters: district and status", () => {
  it("matches the district exactly, ignoring surrounding whitespace", () => {
    const gohlis = filters({ district: "Gohlis-Süd" });
    expect(matchesFilters(makeApartment({ district: "Gohlis-Süd" }), gohlis)).toBe(true);
    expect(matchesFilters(makeApartment({ district: " Gohlis-Süd " }), gohlis)).toBe(true);
    expect(matchesFilters(makeApartment({ district: "Gohlis-Nord" }), gohlis)).toBe(false);
    expect(matchesFilters(makeApartment({ district: null }), gohlis)).toBe(false);
  });

  it("filters by workflow status without looking at favorite", () => {
    const applied = filters({ status: "applied" });
    expect(matchesFilters(makeApartment({ status: "applied", isFavorite: true }), applied)).toBe(true);
    expect(matchesFilters(makeApartment({ status: "viewing", isFavorite: true }), applied)).toBe(false);
  });
});
