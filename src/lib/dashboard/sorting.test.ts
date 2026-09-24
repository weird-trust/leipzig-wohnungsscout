import { describe, expect, it } from "vitest";
import type { Apartment } from "@/lib/domain/apartment";
import { sortApartments, type ScoredApartment } from "@/lib/dashboard/sorting";
import { idOf, makeApartment } from "@/lib/dashboard/testing/apartments";
import { scoreApartment } from "@/lib/scoring";

function scored(overrides: Partial<Apartment>): ScoredApartment {
  const apartment = makeApartment(overrides);
  return { apartment, score: scoreApartment(apartment) };
}

const ids = (items: ScoredApartment[]) => items.map((i) => i.apartment.id);
const day = (d: number) => new Date(`2026-09-${String(d).padStart(2, "0")}T10:00:00Z`);

describe("sortApartments", () => {
  it("sorts by score, highest first", () => {
    const items = [
      scored({ id: idOf(1), rooms: 3 }), // 5
      scored({ id: idOf(2), rooms: 3, topFloor: true }), // 30
      scored({ id: idOf(3) }), // 0
    ];
    expect(ids(sortApartments(items, "score"))).toEqual([idOf(2), idOf(1), idOf(3)]);
  });

  it("breaks score ties by newest, then by id", () => {
    const items = [
      scored({ id: idOf(3), firstSeen: day(1) }),
      scored({ id: idOf(2), firstSeen: day(5) }),
      scored({ id: idOf(1), firstSeen: day(1) }),
    ];
    expect(ids(sortApartments(items, "score"))).toEqual([idOf(2), idOf(1), idOf(3)]);
  });

  it("sorts by newest first", () => {
    const items = [
      scored({ id: idOf(1), firstSeen: day(1) }),
      scored({ id: idOf(2), firstSeen: day(9) }),
      scored({ id: idOf(3), firstSeen: day(4) }),
    ];
    expect(ids(sortApartments(items, "newest"))).toEqual([idOf(2), idOf(3), idOf(1)]);
  });

  it("sorts by warm rent ascending with unknown rent last", () => {
    const items = [
      scored({ id: idOf(1), rentWarm: null }),
      scored({ id: idOf(2), rentWarm: 1400 }),
      scored({ id: idOf(3), rentWarm: 950 }),
      scored({ id: idOf(4), rentWarm: null, rentCold: 500 }),
    ];
    expect(ids(sortApartments(items, "rent"))).toEqual([idOf(3), idOf(2), idOf(1), idOf(4)]);
  });

  it("sorts by area descending with unknown area last", () => {
    const items = [
      scored({ id: idOf(1), sqm: null }),
      scored({ id: idOf(2), sqm: 85 }),
      scored({ id: idOf(3), sqm: 120 }),
    ];
    expect(ids(sortApartments(items, "area"))).toEqual([idOf(3), idOf(2), idOf(1)]);
  });

  it("breaks rent ties by score", () => {
    const items = [
      scored({ id: idOf(1), rentWarm: 1200 }),
      scored({ id: idOf(2), rentWarm: 1200, balcony: true }),
    ];
    expect(ids(sortApartments(items, "rent"))).toEqual([idOf(2), idOf(1)]);
  });

  it("is deterministic regardless of input order and does not mutate the input", () => {
    const items = Array.from({ length: 6 }, (_, i) =>
      scored({ id: idOf(i + 1), rentWarm: i % 2 ? 1000 : null, firstSeen: day(1) }),
    );
    const original = ids(items);
    for (const sort of ["score", "newest", "rent", "area"] as const) {
      const forward = ids(sortApartments(items, sort));
      const backward = ids(sortApartments([...items].reverse(), sort));
      expect(backward).toEqual(forward);
    }
    expect(ids(items)).toEqual(original);
  });
});
