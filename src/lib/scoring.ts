import type { Apartment } from "@/lib/domain/apartment";

/**
 * All scoring weights. The score is a ranking signal, not an eligibility
 * test: every apartment starts at a base score, known values move it up or
 * down, and unknown (null) or explicitly absent (false) features are neutral.
 * Buckets within a group never stack. Building type is deliberately not
 * scored: Altbau and Neubau are equally fine.
 */
export const SCORING = {
  base: 25,
  /** Inclusive range. */
  rooms: { min: 3, max: 4, inRange: 10, outOfRange: -10 },
  /** Checked top to bottom; the first bucket that applies wins. Above 130 m²: 0. */
  area: {
    tooSmall: { below: 75, points: -10 },
    compact: { below: 80, points: 5 }, // 75–79.99
    ideal: { min: 90, max: 110, points: 20 },
    good: { min: 80, max: 130, points: 10 }, // 80–89.99 and 110.01–130
  },
  /** Checked top to bottom; 1,500.01–1,600 € scores 0. */
  warmRent: {
    withinBudget: { upTo: 1500, points: 5 },
    tolerated: { upTo: 1600 },
    over: { upTo: 1800, points: -10 },
    farOver: { points: -20 },
  },
  topFloor: 20,
  balcony: 10,
  bathtub: 5,
  residentialKitchen: 5,
  elevatorWithTopFloor: 5,
} as const;

export const MIN_SCORE = 0;
export const MAX_SCORE = 100;

export type ScoringInput = Pick<
  Apartment,
  | "rooms"
  | "sqm"
  | "rentWarm"
  | "topFloor"
  | "balcony"
  | "bathtub"
  | "residentialKitchen"
  | "elevator"
>;

export type ScoreRule =
  | "base"
  | "roomsInRange"
  | "roomsOutOfRange"
  | "areaTooSmall"
  | "areaCompact"
  | "areaIdeal"
  | "areaGood"
  | "warmRentWithinBudget"
  | "warmRentOver"
  | "warmRentFarOver"
  | "topFloor"
  | "balcony"
  | "bathtub"
  | "residentialKitchen"
  | "elevatorWithTopFloor";

export interface ScoreItem {
  rule: ScoreRule;
  label: string;
  points: number;
}

export interface ScoreResult {
  /** Clamped to MIN_SCORE..MAX_SCORE. */
  score: number;
  /** Sum of the breakdown before clamping. */
  rawScore: number;
  /** The base score first, then every rule that applied, in evaluation order. */
  breakdown: ScoreItem[];
}

const euro = (value: number) => `${value.toLocaleString("de-DE")} €`;

function inRange(value: number, range: { min: number; max: number }): boolean {
  return value >= range.min && value <= range.max;
}

function roomsItem(rooms: number | null): ScoreItem | null {
  if (rooms === null) return null;
  const { min, max, inRange: bonus, outOfRange } = SCORING.rooms;
  return inRange(rooms, SCORING.rooms)
    ? { rule: "roomsInRange", label: `${min}–${max} Zimmer`, points: bonus }
    : { rule: "roomsOutOfRange", label: `Zimmerzahl außerhalb ${min}–${max}`, points: outOfRange };
}

function areaItem(sqm: number | null): ScoreItem | null {
  if (sqm === null) return null;
  const { tooSmall, compact, ideal, good } = SCORING.area;
  if (sqm < tooSmall.below) {
    return { rule: "areaTooSmall", label: `Unter ${tooSmall.below} m²`, points: tooSmall.points };
  }
  if (sqm < compact.below) {
    return {
      rule: "areaCompact",
      label: `${tooSmall.below}–${compact.below} m²`,
      points: compact.points,
    };
  }
  if (inRange(sqm, ideal)) {
    return { rule: "areaIdeal", label: `${ideal.min}–${ideal.max} m²`, points: ideal.points };
  }
  if (inRange(sqm, good)) {
    return { rule: "areaGood", label: `${good.min}–${good.max} m²`, points: good.points };
  }
  return null;
}

function warmRentItem(rentWarm: number | null): ScoreItem | null {
  if (rentWarm === null) return null;
  const { withinBudget, tolerated, over, farOver } = SCORING.warmRent;
  if (rentWarm <= withinBudget.upTo) {
    return {
      rule: "warmRentWithinBudget",
      label: `Warmmiete bis ${euro(withinBudget.upTo)}`,
      points: withinBudget.points,
    };
  }
  if (rentWarm <= tolerated.upTo) return null;
  if (rentWarm <= over.upTo) {
    return { rule: "warmRentOver", label: `Warmmiete über ${euro(tolerated.upTo)}`, points: over.points };
  }
  return { rule: "warmRentFarOver", label: `Warmmiete über ${euro(over.upTo)}`, points: farOver.points };
}

function featureItems(input: ScoringInput): ScoreItem[] {
  const items: ScoreItem[] = [];
  if (input.topFloor === true) {
    items.push({ rule: "topFloor", label: "Dachgeschoss", points: SCORING.topFloor });
  }
  if (input.balcony === true) {
    items.push({ rule: "balcony", label: "Balkon / Loggia / Terrasse", points: SCORING.balcony });
  }
  if (input.bathtub === true) {
    items.push({ rule: "bathtub", label: "Badewanne", points: SCORING.bathtub });
  }
  if (input.residentialKitchen === true) {
    items.push({ rule: "residentialKitchen", label: "Wohnküche", points: SCORING.residentialKitchen });
  }
  if (input.elevator === true && input.topFloor === true) {
    items.push({
      rule: "elevatorWithTopFloor",
      label: "Aufzug ins Dachgeschoss",
      points: SCORING.elevatorWithTopFloor,
    });
  }
  return items;
}

export function scoreApartment(input: ScoringInput): ScoreResult {
  const breakdown = [
    { rule: "base", label: "Basis", points: SCORING.base } satisfies ScoreItem,
    roomsItem(input.rooms),
    areaItem(input.sqm),
    warmRentItem(input.rentWarm),
    ...featureItems(input),
  ].filter((item): item is ScoreItem => item !== null);

  const rawScore = breakdown.reduce((sum, item) => sum + item.points, 0);
  const score = Math.min(MAX_SCORE, Math.max(MIN_SCORE, rawScore));

  return { score, rawScore, breakdown };
}
