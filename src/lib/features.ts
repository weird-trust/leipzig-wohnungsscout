import type {
  ApartmentFeatures,
  BuildingType,
  TriState,
} from "@/lib/domain/apartment";

/**
 * Heuristic, conservative feature detection on German listing text.
 *
 * Every match of a feature's terms is classified as positive or negated.
 * Any positive match wins (so "kein Balkon, dafür Loggia" counts as a
 * balcony), otherwise any negated match gives false, otherwise null.
 *
 * Text is normalized before matching (ß → ss, collapsed whitespace), so
 * terms are written with "ss" and a single space.
 */

interface FeatureRule {
  /** Regex sources, matched case-insensitively. */
  terms: readonly string[];
  /** Regex sources, matched case-sensitively (e.g. abbreviations). */
  caseSensitiveTerms?: readonly string[];
}

/** Not preceded or followed by a letter or digit. */
const TOKEN_START = "(?<![\\p{L}\\p{N}])";
const TOKEN_END = "(?![\\p{L}\\p{N}])";

export const FEATURE_RULES = {
  topFloor: {
    terms: [
      "dachgeschoss",
      "oberste[mnrs]? (?:geschoss|etage|stockwerk)",
      "penthouse",
    ],
    caseSensitiveTerms: [`${TOKEN_START}DG${TOKEN_END}`],
  },
  balcony: {
    terms: ["balkon", "loggia", "terrasse", "dachterrasse"],
  },
  bathtub: {
    terms: ["badewanne", "wannenbad", "bad mit wanne"],
  },
  residentialKitchen: {
    terms: [
      "wohnküche",
      "grosse[mnrs]? küche",
      "grosszügige[mnrs]? küche",
      "offene[mnrs]? küche",
      "küche mit essbereich",
      "platz für einen esstisch",
      "koch- und essbereich",
    ],
  },
  elevator: {
    terms: ["aufzug", "fahrstuhl", `${TOKEN_START}lift${TOKEN_END}`],
  },
} as const satisfies Record<string, FeatureRule>;

const BUILDING_TYPE_RULES = {
  altbau: { terms: ["altbau"] },
  neubau: { terms: ["neubau"] },
} as const satisfies Record<Exclude<BuildingType, "unknown">, FeatureRule>;

/** Negation words directly before a term, e.g. "kein Balkon", "ohne eigenen Balkon". */
const NEGATION_CUES = new Set([
  "kein",
  "keine",
  "keinen",
  "keinem",
  "keiner",
  "ohne",
  "nicht",
]);
/** How many words before a match are checked for a negation cue. */
const NEGATION_WINDOW_WORDS = 2;
/** A negation cue only applies within the same clause. */
const CLAUSE_BOUNDARY = /[.,;:!?()\n]/u;
/** Negation after a term, e.g. "Balkon: nein", "Aufzug nicht vorhanden". */
const TRAILING_NEGATION =
  /^\p{L}*\s*[:=\-–]?\s*(?:nein|nicht vorhanden)(?![\p{L}\p{N}])/iu;

export function normalizeText(text: string): string {
  return text.normalize("NFC").replace(/ß/g, "ss").replace(/\s+/g, " ");
}

type MatchKind = "positive" | "negated";

function clauseBefore(text: string, index: number): string {
  let start = index;
  while (start > 0 && !CLAUSE_BOUNDARY.test(text[start - 1])) {
    start--;
  }
  return text.slice(start, index);
}

function isNegated(text: string, start: number, end: number): boolean {
  const words = clauseBefore(text, start)
    .toLowerCase()
    .split(/[^\p{L}]+/u)
    .filter((word) => word.length > 0);
  const window = words.slice(-NEGATION_WINDOW_WORDS);
  if (window.some((word) => NEGATION_CUES.has(word))) {
    return true;
  }

  return TRAILING_NEGATION.test(text.slice(end));
}

function findMatches(text: string, rule: FeatureRule): MatchKind[] {
  const patterns = [
    ...rule.terms.map((term) => new RegExp(term, "giu")),
    ...(rule.caseSensitiveTerms ?? []).map((term) => new RegExp(term, "gu")),
  ];

  return patterns.flatMap((pattern) =>
    [...text.matchAll(pattern)].map((match): MatchKind => {
      const end = match.index + match[0].length;
      return isNegated(text, match.index, end) ? "negated" : "positive";
    }),
  );
}

function toTriState(matches: readonly MatchKind[]): TriState {
  if (matches.includes("positive")) return true;
  if (matches.includes("negated")) return false;
  return null;
}

export function detectFeature(
  text: string | null,
  rule: FeatureRule,
): TriState {
  if (!text) return null;
  return toTriState(findMatches(normalizeText(text), rule));
}

/**
 * Only explicit "Altbau" / "Neubau" wording counts; construction years are
 * not interpreted. Negated or contradictory mentions give "unknown".
 */
export function detectBuildingType(text: string | null): BuildingType {
  if (!text) return "unknown";
  const normalized = normalizeText(text);
  const isAltbau = findMatches(normalized, BUILDING_TYPE_RULES.altbau).includes(
    "positive",
  );
  const isNeubau = findMatches(normalized, BUILDING_TYPE_RULES.neubau).includes(
    "positive",
  );

  if (isAltbau && !isNeubau) return "altbau";
  if (isNeubau && !isAltbau) return "neubau";
  return "unknown";
}

export function extractFeatures(text: string | null): ApartmentFeatures {
  return {
    topFloor: detectFeature(text, FEATURE_RULES.topFloor),
    balcony: detectFeature(text, FEATURE_RULES.balcony),
    bathtub: detectFeature(text, FEATURE_RULES.bathtub),
    residentialKitchen: detectFeature(text, FEATURE_RULES.residentialKitchen),
    elevator: detectFeature(text, FEATURE_RULES.elevator),
    buildingType: detectBuildingType(text),
  };
}
