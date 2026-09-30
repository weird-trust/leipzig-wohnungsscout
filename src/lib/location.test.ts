import { describe, expect, it } from "vitest";
import { matchLocation } from "@/lib/location";

describe("matchLocation", () => {
  it.each([
    "Plagwitz",
    "Schleußig",
    "Schleussig",
    "Lindenau",
    "Alt-Lindenau",
    "Altlindenau",
    "Neulindenau",
    "Kleinzschocher",
    " leipzig-plagwitz ",
  ])("treats %j as preferred", (district) => {
    expect(matchLocation({ district, postcode: null })).toBe("preferred");
  });

  it("uses the postcode only when the district is unknown", () => {
    expect(matchLocation({ district: null, postcode: "04177" })).toBe("nearby");
    expect(matchLocation({ district: null, postcode: "04107" })).toBe("outside");
    expect(matchLocation({ district: "Südvorstadt", postcode: "04229" })).toBe("outside");
  });

  it("does not match neighbours by substring", () => {
    expect(matchLocation({ district: "Plagwitz-Nord", postcode: null })).toBe("outside");
    expect(matchLocation({ district: "Großzschocher", postcode: null })).toBe("outside");
  });

  it("returns null when nothing is known", () => {
    expect(matchLocation({ district: null, postcode: null })).toBeNull();
    expect(matchLocation({ district: " – ", postcode: null })).toBeNull();
  });
});
