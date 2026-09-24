import { describe, expect, it } from "vitest";
import type { Apartment } from "@/lib/domain/apartment";
import { SCORING, scoreApartment, type ScoringInput } from "@/lib/scoring";

const unknown: ScoringInput = {
  rooms: null,
  sqm: null,
  rentWarm: null,
  topFloor: null,
  balcony: null,
  bathtub: null,
  residentialKitchen: null,
  elevator: null,
};

const ideal: ScoringInput = {
  rooms: 4,
  sqm: 100,
  rentWarm: null,
  topFloor: true,
  balcony: true,
  bathtub: true,
  residentialKitchen: true,
  elevator: null,
};

const BASE = SCORING.base;

function raw(overrides: Partial<ScoringInput>): number {
  return scoreApartment({ ...unknown, ...overrides }).rawScore;
}

/** Points on top of the base score, so boundary tables read naturally. */
function delta(overrides: Partial<ScoringInput>): number {
  return raw(overrides) - BASE;
}

function rules(input: ScoringInput): string[] {
  return scoreApartment(input).breakdown.map((item) => item.rule);
}

describe("scoreApartment", () => {
  it("starts every apartment at the base score, shown first in the breakdown", () => {
    const result = scoreApartment(unknown);
    expect(result.score).toBe(25);
    expect(result.breakdown).toEqual([{ rule: "base", label: "Basis", points: 25 }]);
  });

  it("returns a breakdown whose points sum to the raw score", () => {
    const result = scoreApartment({ ...ideal, rentWarm: 1700, elevator: true });
    const sum = result.breakdown.reduce((total, item) => total + item.points, 0);
    expect(sum).toBe(result.rawScore);
    for (const item of result.breakdown) {
      expect(item.label).not.toBe("");
    }
  });

  it("scores the ideal apartment 95 before elevator and warm-rent bonuses", () => {
    expect(scoreApartment(ideal)).toMatchObject({ score: 95, rawScore: 95 });
  });

  it("clamps an apartment with every bonus at 100", () => {
    const result = scoreApartment({ ...ideal, elevator: true, rentWarm: 1400 });
    expect(result.rawScore).toBe(105);
    expect(result.score).toBe(100);
  });

  it("clamps negative totals to 0", () => {
    const result = scoreApartment({ ...unknown, rooms: 1, sqm: 30, rentWarm: 2500 });
    expect(result.rawScore).toBe(25 - 10 - 10 - 20);
    expect(result.score).toBe(0);
  });
});

describe("regression examples (real ImmoScout apartments)", () => {
  it.each([
    ["3 rooms, 77 m², balcony", { rooms: 3, sqm: 77, balcony: true }, 50],
    ["3 rooms, 76 m², balcony", { rooms: 3, sqm: 76, balcony: true }, 50],
    ["3 rooms, 85 m², balcony, elevator, top floor unknown", { rooms: 3, sqm: 85, balcony: true, elevator: true }, 55],
    ["4 rooms, 94 m², balcony", { rooms: 4, sqm: 94, balcony: true }, 65],
  ] as const)("%s → %d", (_, overrides, expected) => {
    expect(scoreApartment({ ...unknown, ...overrides }).score).toBe(expected);
  });
});

describe("neutral values", () => {
  it("gives unknown and false optional features neither bonus nor penalty", () => {
    const features = ["topFloor", "balcony", "bathtub", "residentialKitchen", "elevator"] as const;
    for (const feature of features) {
      expect(delta({ [feature]: null })).toBe(0);
      expect(delta({ [feature]: false })).toBe(0);
    }
  });

  it("gives unknown rooms, area and warm rent nothing", () => {
    expect(rules({ ...ideal, rooms: null, sqm: null, rentWarm: null })).toEqual([
      "base",
      "topFloor",
      "balcony",
      "bathtub",
      "residentialKitchen",
    ]);
  });

  it("does not score the building type", () => {
    const withType = (buildingType: Apartment["buildingType"]) =>
      scoreApartment({ ...ideal, buildingType } as ScoringInput & Pick<Apartment, "buildingType">);
    expect(withType("altbau")).toEqual(scoreApartment(ideal));
    expect(withType("neubau")).toEqual(scoreApartment(ideal));
    expect(withType("unknown")).toEqual(scoreApartment(ideal));
  });

  it("only rewards an elevator when the apartment is known to be on the top floor", () => {
    expect(delta({ elevator: true })).toBe(0);
    expect(delta({ elevator: true, topFloor: null })).toBe(0);
    expect(delta({ elevator: true, topFloor: false })).toBe(0);
    expect(delta({ elevator: true, topFloor: true })).toBe(20 + 5);
  });

  it.each([
    ["top floor", { topFloor: true }, 20],
    ["balcony", { balcony: true }, 10],
    ["bathtub", { bathtub: true }, 5],
    ["residential kitchen", { residentialKitchen: true }, 5],
  ] as const)("%s adds %s", (_, overrides, expected) => {
    expect(delta(overrides)).toBe(expected);
  });
});

describe("boundaries", () => {
  it.each([
    [2.5, -10],
    [3, 10],
    [3.5, 10],
    [4, 10],
    [4.5, -10],
  ])("rooms %s → %s", (rooms, expected) => {
    expect(delta({ rooms })).toBe(expected);
  });

  it.each([
    [74.99, -10],
    [75, 5],
    [79.99, 5],
    [80, 10],
    [89.99, 10],
    [90, 20],
    [110, 20],
    [110.01, 10],
    [130, 10],
    [130.01, 0],
    [200, 0],
  ])("area %s m² → %s (buckets do not stack)", (sqm, expected) => {
    expect(delta({ sqm })).toBe(expected);
  });

  it.each([
    [900, 5],
    [1500, 5],
    [1500.01, 0],
    [1600, 0],
    [1600.01, -10],
    [1800, -10],
    [1800.01, -20],
    [2500, -20],
  ])("warm rent €%s → %s (buckets do not stack)", (rentWarm, expected) => {
    expect(delta({ rentWarm })).toBe(expected);
  });

  it("gives an unknown warm rent nothing", () => {
    expect(delta({ rentWarm: null })).toBe(0);
    expect(rules({ ...unknown, rentWarm: null })).toEqual(["base"]);
  });

  it("uses at most one area and one warm-rent rule", () => {
    for (const sqm of [74.99, 75, 80, 90, 110.01, 130.01]) {
      const areaRules = rules({ ...unknown, sqm }).filter((r) => r.startsWith("area"));
      expect(areaRules.length).toBeLessThanOrEqual(1);
    }
    for (const rentWarm of [1500, 1500.01, 1700, 1900]) {
      const rentRules = rules({ ...unknown, rentWarm }).filter((r) => r.startsWith("warmRent"));
      expect(rentRules.length).toBeLessThanOrEqual(1);
    }
  });
});
