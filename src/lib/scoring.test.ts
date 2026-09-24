import { describe, expect, it } from "vitest";
import { scoreApartment, type ScoringInput } from "@/lib/scoring";

const unknown: ScoringInput = {
  rooms: null,
  sqm: null,
  rentWarm: null,
  topFloor: null,
  balcony: null,
  bathtub: null,
  residentialKitchen: null,
  elevator: null,
  buildingType: "unknown",
};

const ideal: ScoringInput = {
  rooms: 3,
  sqm: 100,
  rentWarm: 1400,
  topFloor: true,
  balcony: true,
  bathtub: true,
  residentialKitchen: true,
  elevator: true,
  buildingType: "altbau",
};

function score(overrides: Partial<ScoringInput>): number {
  return scoreApartment({ ...unknown, ...overrides }).score;
}

function rules(input: ScoringInput): string[] {
  return scoreApartment(input).breakdown.map((item) => item.rule);
}

describe("scoreApartment", () => {
  it("scores the ideal apartment exactly 100", () => {
    const result = scoreApartment(ideal);
    expect(result.score).toBe(100);
    expect(result.rawScore).toBe(100);
  });

  it("returns a breakdown whose points sum to the raw score", () => {
    const result = scoreApartment({ ...ideal, rentWarm: 1600 });
    const sum = result.breakdown.reduce((total, item) => total + item.points, 0);
    expect(sum).toBe(result.rawScore);
    expect(result.breakdown).toContainEqual(
      expect.objectContaining({ rule: "warmRentOverMax", points: -15 }),
    );
    for (const item of result.breakdown) {
      expect(item.label).not.toBe("");
    }
  });

  it("gives an all-unknown apartment 0 with an empty breakdown", () => {
    expect(scoreApartment(unknown)).toEqual({ score: 0, rawScore: 0, breakdown: [] });
  });

  it("clamps negative totals to 0", () => {
    const result = scoreApartment({ ...unknown, rooms: 1, sqm: 30, rentWarm: 2000 });
    expect(result.rawScore).toBe(-55);
    expect(result.score).toBe(0);
  });
});

describe("unknown values", () => {
  it("never penalize missing optional attributes", () => {
    const withUnknowns = scoreApartment({
      ...ideal,
      balcony: null,
      bathtub: null,
      residentialKitchen: null,
    });
    const withFalse = scoreApartment({
      ...ideal,
      balcony: false,
      bathtub: false,
      residentialKitchen: false,
    });
    expect(withUnknowns.score).toBe(60);
    expect(withFalse.score).toBe(60);
  });

  it("give neither bonus nor penalty for unknown rooms, area or rent", () => {
    expect(rules({ ...ideal, rooms: null, sqm: null, rentWarm: null })).toEqual([
      "topFloor",
      "balcony",
      "bathtub",
      "residentialKitchen",
      "knownBuildingType",
      "elevatorWithTopFloor",
    ]);
  });

  it("gives no building type points for unknown type", () => {
    expect(score({ buildingType: "unknown" })).toBe(0);
    expect(score({ buildingType: "altbau" })).toBe(5);
    expect(score({ buildingType: "neubau" })).toBe(5);
  });

  it("only rewards an elevator when the apartment is known to be on the top floor", () => {
    expect(score({ elevator: true })).toBe(0);
    expect(score({ elevator: true, topFloor: null })).toBe(0);
    expect(score({ elevator: true, topFloor: false })).toBe(0);
    expect(score({ elevator: true, topFloor: true })).toBe(30);
  });
});

describe("boundaries", () => {
  it.each([
    [2.5, -20],
    [3, 5],
    [3.5, 5],
    [4, 5],
    [4.5, -20],
    [1, -20],
  ])("rooms %s → %s", (rooms, expected) => {
    expect(scoreApartment({ ...unknown, rooms }).rawScore).toBe(expected);
  });

  it.each([
    [79.9, -20],
    [80, 10],
    [89.9, 10],
    [90, 20],
    [110, 20],
    [110.1, 10],
    [130, 10],
    [130.1, 0],
    [160, 0],
  ])("area %s m² → %s (bonuses do not stack)", (sqm, expected) => {
    expect(scoreApartment({ ...unknown, sqm }).rawScore).toBe(expected);
  });

  it.each([
    [1500, 0],
    [1500.01, -15],
    [1800, -15],
  ])("warm rent €%s → %s", (rentWarm, expected) => {
    expect(scoreApartment({ ...unknown, rentWarm }).rawScore).toBe(expected);
  });
});
