import type { Apartment } from "@/lib/domain/apartment";
import type { Sort } from "@/lib/dashboard/query";
import type { ScoreResult } from "@/lib/scoring";

export interface ScoredApartment {
  apartment: Apartment;
  score: ScoreResult;
}

type Compare = (a: ScoredApartment, b: ScoredApartment) => number;

/** Known values first; unknown (null) values always sort last. */
function nullsLast(
  pick: (item: ScoredApartment) => number | null,
  direction: "asc" | "desc",
): Compare {
  return (a, b) => {
    const x = pick(a);
    const y = pick(b);
    if (x === null && y === null) return 0;
    if (x === null) return 1;
    if (y === null) return -1;
    return direction === "asc" ? x - y : y - x;
  };
}

const byScore: Compare = (a, b) => b.score.score - a.score.score;
const byNewest: Compare = (a, b) =>
  b.apartment.firstSeen.getTime() - a.apartment.firstSeen.getTime();
/** Final tie-breaker so equal listings never swap places between renders. */
const byId: Compare = (a, b) =>
  a.apartment.id < b.apartment.id ? -1 : a.apartment.id > b.apartment.id ? 1 : 0;

const COMPARATORS: Record<Sort, Compare[]> = {
  score: [byScore, byNewest, byId],
  newest: [byNewest, byScore, byId],
  rent: [nullsLast((i) => i.apartment.rentWarm, "asc"), byScore, byNewest, byId],
  area: [nullsLast((i) => i.apartment.sqm, "desc"), byScore, byNewest, byId],
};

export function sortApartments(
  items: readonly ScoredApartment[],
  sort: Sort,
): ScoredApartment[] {
  const comparators = COMPARATORS[sort];
  return [...items].sort((a, b) => {
    for (const compare of comparators) {
      const result = compare(a, b);
      if (result !== 0) return result;
    }
    return 0;
  });
}
