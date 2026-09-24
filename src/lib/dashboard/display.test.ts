import { describe, expect, it } from "vitest";
import {
  formatAge,
  formatEuro,
  formatFloor,
  formatRooms,
  formatSqm,
  paragraphs,
  primaryRent,
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

describe("primaryRent", () => {
  it("prefers warm rent and labels the basis", () => {
    expect(primaryRent({ rentWarm: 1500, rentCold: 1200 })?.text).toMatch(/^1\.500\s€ warm$/);
    expect(primaryRent({ rentWarm: null, rentCold: 1349 })?.text).toMatch(/^1\.349\s€ kalt$/);
    expect(primaryRent({ rentWarm: null, rentCold: null })).toBeNull();
  });
});

describe("formatAge", () => {
  const now = new Date("2026-09-24T12:00:00Z");
  const ago = (minutes: number) => new Date(now.getTime() - minutes * 60_000);

  it.each([
    [0, "gerade eben"],
    [28, "vor 28 Min."],
    [180, "vor 3 Std."],
    [24 * 60, "gestern"],
    [4 * 24 * 60, "vor 4 Tagen"],
  ])("%d minutes → %s", (minutes, expected) => {
    expect(formatAge(ago(minutes), now)).toBe(expected);
  });

  it("falls back to the date after a week", () => {
    expect(formatAge(ago(10 * 24 * 60), now)).toBe("14.09.2026");
  });
});
