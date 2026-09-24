import { describe, expect, it } from "vitest";
import {
  formatEuro,
  formatFloor,
  formatRooms,
  formatSqm,
  paragraphs,
  rentPerSqm,
  triStateKey,
} from "@/lib/dashboard/display";

describe("rentPerSqm", () => {
  it("uses warm rent when known", () => {
    expect(rentPerSqm({ rentWarm: 1500, rentCold: 1200, sqm: 100 })).toMatchObject({
      value: 15,
      basis: "warm",
    });
  });

  it("falls back to cold rent and says so", () => {
    const result = rentPerSqm({ rentWarm: null, rentCold: 1000, sqm: 80 });
    expect(result?.basis).toBe("kalt");
    expect(result?.text).toMatch(/12,50\s€\/m² kalt/);
  });

  it("returns null without area or any rent", () => {
    expect(rentPerSqm({ rentWarm: 1000, rentCold: null, sqm: null })).toBeNull();
    expect(rentPerSqm({ rentWarm: null, rentCold: null, sqm: 90 })).toBeNull();
  });
});

describe("formatting", () => {
  it("formats German numbers", () => {
    expect(formatEuro(1450)).toMatch(/^1\.450\s€$/);
    expect(formatRooms(3.5)).toBe("3,5 Zi.");
    expect(formatSqm(98.6)).toBe("98,6 m²");
  });

  it.each([
    [0, "EG"],
    [3, "3. OG"],
    [-1, "UG"],
  ])("floor %d → %s", (floor, expected) => {
    expect(formatFloor(floor)).toBe(expected);
  });

  it("maps tri-state values", () => {
    expect([true, false, null].map(triStateKey)).toEqual(["yes", "no", "unknown"]);
  });
});

describe("paragraphs", () => {
  it("splits on blank lines and keeps single line breaks", () => {
    expect(paragraphs("Erster Absatz.\nZweite Zeile.\n\n  \nZweiter Absatz.")).toEqual([
      "Erster Absatz.\nZweite Zeile.",
      "Zweiter Absatz.",
    ]);
    expect(paragraphs(null)).toEqual([]);
  });
});
