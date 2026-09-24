import type { Apartment } from "@/lib/domain/apartment";

/**
 * All scoring weights. Ranges are inclusive. The ideal apartment scores
 * exactly 100; unknown (null) values never earn points or penalties.
 */
export const SCORING = {
  rooms: { min: 3, max: 4, inRange: 5, outOfRange: -20 },
  area: {
    ideal: { min: 90, max: 110, points: 20 },
    acceptable: { min: 80, max: 130, points: 10 },
    tooSmallBelow: 80,
    tooSmall: -20,
  },
  warmRent: { max: 1500, overMax: -15 },
  topFloor: 25,
  balcony: 15,
  bathtub: 10,
  residentialKitchen: 15,
  knownBuildingType: 5,
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
  | "buildingType"
>;

export type ScoreRule =
  | "roomsInRange"
  | "roomsOutOfRange"
  | "areaIdeal"
  | "areaAcceptable"
  | "areaTooSmall"
  | "warmRentOverMax"
  | "topFloor"
  | "balcony"
  | "bathtub"
  | "residentialKitchen"
  | "knownBuildingType"
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
  /** Only rules that applied, in evaluation order. */
  breakdown: ScoreItem[];
}

function inRange(value: number, range: { min: number; max: number }): boolean {
  return value >= range.min && value <= range.max;
}

function roomsItem(rooms: number | null): ScoreItem | null {
  if (rooms === null) return null;
  const { min, max, inRange: bonus, outOfRange } = SCORING.rooms;
  return inRange(rooms, SCORING.rooms)
    ? { rule: "roomsInRange", label: `${min}–${max} Zimmer`, points: bonus }
    : {
        rule: "roomsOutOfRange",
        label: `Zimmerzahl außerhalb ${min}–${max}`,
        points: outOfRange,
      };
}

/** Area bonuses do not stack: the ideal range replaces the acceptable one. */
function areaItem(sqm: number | null): ScoreItem | null {
  if (sqm === null) return null;
  const { ideal, acceptable, tooSmallBelow, tooSmall } = SCORING.area;
  if (inRange(sqm, ideal)) {
    return {
      rule: "areaIdeal",
      label: `${ideal.min}–${ideal.max} m²`,
      points: ideal.points,
    };
  }
  if (inRange(sqm, acceptable)) {
    return {
      rule: "areaAcceptable",
      label: `${acceptable.min}–${acceptable.max} m²`,
      points: acceptable.points,
    };
  }
  if (sqm < tooSmallBelow) {
    return {
      rule: "areaTooSmall",
      label: `Unter ${tooSmallBelow} m²`,
      points: tooSmall,
    };
  }
  return null;
}

function warmRentItem(rentWarm: number | null): ScoreItem | null {
  if (rentWarm === null || rentWarm <= SCORING.warmRent.max) return null;
  return {
    rule: "warmRentOverMax",
    label: `Warmmiete über ${SCORING.warmRent.max.toLocaleString("de-DE")} €`,
    points: SCORING.warmRent.overMax,
  };
}

function featureItems(input: ScoringInput): ScoreItem[] {
  const items: ScoreItem[] = [];
  if (input.topFloor === true) {
    items.push({ rule: "topFloor", label: "Dachgeschoss", points: SCORING.topFloor });
  }
  if (input.balcony === true) {
    items.push({
      rule: "balcony",
      label: "Balkon / Loggia / Terrasse",
      points: SCORING.balcony,
    });
  }
  if (input.bathtub === true) {
    items.push({ rule: "bathtub", label: "Badewanne", points: SCORING.bathtub });
  }
  if (input.residentialKitchen === true) {
    items.push({
      rule: "residentialKitchen",
      label: "Wohnküche",
      points: SCORING.residentialKitchen,
    });
  }
  if (input.buildingType !== "unknown") {
    items.push({
      rule: "knownBuildingType",
      label: input.buildingType === "altbau" ? "Altbau" : "Neubau",
      points: SCORING.knownBuildingType,
    });
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
    roomsItem(input.rooms),
    areaItem(input.sqm),
    warmRentItem(input.rentWarm),
    ...featureItems(input),
  ].filter((item): item is ScoreItem => item !== null);

  const rawScore = breakdown.reduce((sum, item) => sum + item.points, 0);
  const score = Math.min(MAX_SCORE, Math.max(MIN_SCORE, rawScore));

  return { score, rawScore, breakdown };
}
