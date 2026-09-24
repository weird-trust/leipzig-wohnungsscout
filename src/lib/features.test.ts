import { describe, expect, it } from "vitest";
import {
  detectBuildingType,
  detectFeature,
  extractFeatures,
  FEATURE_RULES,
} from "@/lib/features";

describe("extractFeatures", () => {
  it("detects all features in a typical listing", () => {
    const text =
      "Traumhafte 3-Zimmer-Wohnung im Dachgeschoss eines sanierten Altbaus. " +
      "Großzügige Wohnküche, Bad mit Badewanne, Südbalkon. Aufzug vorhanden.";

    expect(extractFeatures(text)).toEqual({
      topFloor: true,
      balcony: true,
      bathtub: true,
      residentialKitchen: true,
      elevator: true,
      buildingType: "altbau",
    });
  });

  it("returns null and unknown when the text says nothing", () => {
    const text = "Schöne 3-Zimmer-Wohnung in Gohlis, ab sofort frei.";

    expect(extractFeatures(text)).toEqual({
      topFloor: null,
      balcony: null,
      bathtub: null,
      residentialKitchen: null,
      elevator: null,
      buildingType: "unknown",
    });
  });

  it("handles empty input", () => {
    expect(extractFeatures(null).balcony).toBeNull();
    expect(extractFeatures("").buildingType).toBe("unknown");
  });
});

describe("topFloor", () => {
  const topFloor = (text: string) => detectFeature(text, FEATURE_RULES.topFloor);

  it.each([
    "Wohnung im Dachgeschoss",
    "Wohnung im Dachgeschoß",
    "Helle DG-Wohnung",
    "3. OG / DG",
    "Lage: oberstes Geschoss",
    "in der obersten Etage gelegen",
    "Penthouse mit Weitblick",
  ])("detects %j", (text) => {
    expect(topFloor(text)).toBe(true);
  });

  it.each([
    "Erdgeschoss, Stadtteil Lindenau",
    // "DG" only counts as a standalone uppercase token.
    "DGB-Haus in der Nähe",
    "Wohnung in Sdg-Nähe",
    "Einkaufen: dg Markt",
  ])("ignores %j", (text) => {
    expect(topFloor(text)).toBeNull();
  });

  it("detects negation", () => {
    expect(topFloor("Die Wohnung liegt nicht im Dachgeschoss.")).toBe(false);
  });
});

describe("balcony", () => {
  const balcony = (text: string) => detectFeature(text, FEATURE_RULES.balcony);

  it.each([
    "mit Balkon",
    "sonnige Loggia",
    "große Terrasse",
    "eigene Dachterrasse",
    "Westbalkon zum Hof",
  ])("detects %j", (text) => {
    expect(balcony(text)).toBe(true);
  });

  it.each([
    "kein Balkon",
    "Wohnung ohne Balkon",
    "ohne eigenen Balkon",
    "keine Dachterrasse",
    "Balkon: nein",
    "Balkon nicht vorhanden",
  ])("detects negation in %j", (text) => {
    expect(balcony(text)).toBe(false);
  });

  it("prefers positive evidence for an equivalent feature", () => {
    expect(balcony("kein Balkon, dafür Loggia")).toBe(true);
    expect(balcony("Leider ohne Balkon, aber mit Terrasse.")).toBe(true);
  });

  it("does not carry a negation across clauses", () => {
    expect(balcony("Provisionsfrei, ohne Makler. Balkon zum Garten.")).toBe(true);
    expect(balcony("ohne Makler, Balkon vorhanden")).toBe(true);
  });

  it("only looks at the words directly before the term", () => {
    expect(balcony("ohne Provision und mit großem Balkon")).toBe(true);
  });
});

describe("bathtub", () => {
  const bathtub = (text: string) => detectFeature(text, FEATURE_RULES.bathtub);

  it.each(["Bad mit Badewanne", "Wannenbad mit Fenster", "Bad mit Wanne und Dusche"])(
    "detects %j",
    (text) => {
      expect(bathtub(text)).toBe(true);
    },
  );

  it.each(["keine Badewanne, nur Dusche", "Duschbad ohne Badewanne"])(
    "detects negation in %j",
    (text) => {
      expect(bathtub(text)).toBe(false);
    },
  );

  it("does not treat a shower as a bathtub", () => {
    expect(bathtub("Modernes Duschbad")).toBeNull();
  });
});

describe("residentialKitchen", () => {
  const kitchen = (text: string) =>
    detectFeature(text, FEATURE_RULES.residentialKitchen);

  it.each([
    "Wohnküche mit Einbauküche",
    "große Küche",
    "grosse Küche",
    "mit einer großen Küche",
    "großzügige Küche",
    "offene Küche zum Wohnzimmer",
    "Küche mit Essbereich",
    "Platz für einen Esstisch",
    "Koch- und Essbereich",
  ])("detects %j", (text) => {
    expect(kitchen(text)).toBe(true);
  });

  it("does not match a plain kitchen", () => {
    expect(kitchen("Küche mit Fenster, Einbauküche vorhanden")).toBeNull();
  });

  it("detects negation", () => {
    expect(kitchen("keine Wohnküche")).toBe(false);
  });
});

describe("elevator", () => {
  const elevator = (text: string) => detectFeature(text, FEATURE_RULES.elevator);

  it.each(["Aufzug im Haus", "Personenaufzug", "Fahrstuhl vorhanden", "mit Lift"])(
    "detects %j",
    (text) => {
      expect(elevator(text)).toBe(true);
    },
  );

  it.each(["ohne Aufzug", "kein Fahrstuhl", "Aufzug: nein"])(
    "detects negation in %j",
    (text) => {
      expect(elevator(text)).toBe(false);
    },
  );

  it("ignores a stair lift and other words containing 'lift'", () => {
    expect(elevator("Treppenlift nachrüstbar, Liftingcreme")).toBeNull();
  });
});

describe("detectBuildingType", () => {
  it.each([
    ["Schöner Altbau in Connewitz", "altbau"],
    ["Altbauwohnung mit Stuck", "altbau"],
    ["Erstbezug im Neubau", "neubau"],
    ["Neubauprojekt 2024", "neubau"],
  ] as const)("classifies %j as %s", (text, expected) => {
    expect(detectBuildingType(text)).toBe(expected);
  });

  it("does not infer the type from a construction year", () => {
    expect(detectBuildingType("Baujahr 1905")).toBe("unknown");
    expect(detectBuildingType("Baujahr 2021")).toBe("unknown");
  });

  it("returns unknown for contradictory or negated mentions", () => {
    expect(detectBuildingType("Altbau mit Neubau-Anbau")).toBe("unknown");
    expect(detectBuildingType("kein Neubau")).toBe("unknown");
  });

  it("accepts a type when the other one is only negated", () => {
    expect(detectBuildingType("Altbau, kein Neubau")).toBe("altbau");
  });
});
