import { describe, expect, it } from "vitest";
import {
  dashboardHref,
  DEFAULT_QUERY,
  hasActiveFilters,
  parseDashboardQuery,
  parseNonNegativeNumber,
  searchParamsHref,
  withQuery,
  type SearchParams,
} from "@/lib/dashboard/query";

describe("parseDashboardQuery", () => {
  it("returns defaults for an empty URL", () => {
    expect(parseDashboardQuery({})).toEqual(DEFAULT_QUERY);
  });

  it("parses every supported parameter", () => {
    expect(
      parseDashboardQuery({
        tab: "favorites",
        sort: "rent",
        minRooms: "3",
        maxRooms: "4",
        minSqm: "90",
        maxWarmRent: "1500",
        topFloor: "1",
        balcony: "1",
        bathtub: "true",
        kitchen: "on",
        district: " Gohlis-Süd ",
        status: "applied",
      }),
    ).toEqual({
      tab: "favorites",
      sort: "rent",
      filters: {
        minRooms: 3,
        maxRooms: 4,
        minSqm: 90,
        maxWarmRent: 1500,
        require: ["topFloor", "balcony", "bathtub", "residentialKitchen"],
        district: "Gohlis-Süd",
        status: "applied",
      },
    });
  });

  it.each<[string, SearchParams]>([
    ["unknown tab", { tab: "archive" }],
    ["unknown sort", { sort: "price" }],
    ["unknown status", { status: "favorite" }],
    ["negative number", { minSqm: "-5" }],
    ["text as number", { maxWarmRent: "billig" }],
    ["empty number", { minRooms: "" }],
    ["number with unit", { minSqm: "90m2" }],
    ["disabled feature flag", { balcony: "0" }],
    ["blank district", { district: "   " }],
  ])("falls back to defaults for %s", (_, params) => {
    expect(parseDashboardQuery(params)).toEqual(DEFAULT_QUERY);
  });

  it("uses the first value of repeated parameters", () => {
    expect(parseDashboardQuery({ tab: ["new", "applied"] }).tab).toBe("new");
  });

  it("accepts a German decimal comma", () => {
    expect(parseDashboardQuery({ minRooms: "3,5" }).filters.minRooms).toBe(3.5);
  });
});

describe("parseNonNegativeNumber", () => {
  it.each([
    ["90", 90],
    ["0", 0],
    ["3.5", 3.5],
    ["3,5", 3.5],
    [" 1500 ", 1500],
    ["1e3", null],
    ["Infinity", null],
    [undefined, null],
  ])("%j → %j", (input, expected) => {
    expect(parseNonNegativeNumber(input)).toBe(expected);
  });
});

describe("dashboardHref", () => {
  it("leaves out defaults", () => {
    expect(dashboardHref(DEFAULT_QUERY)).toBe("/");
    expect(dashboardHref(withQuery(DEFAULT_QUERY, { sort: "newest" }))).toBe("/?sort=newest");
  });

  it("round-trips through the parser, so canonical URLs never redirect again", () => {
    const urls = [
      "/?tab=favorites",
      "/?sort=newest",
      "/?minSqm=90&maxWarmRent=1500",
      "/?topFloor=1&balcony=1",
      "/?tab=applied&sort=area&minRooms=3.5&maxRooms=4&kitchen=1&district=Gohlis-S%C3%BCd&status=seen",
    ];
    for (const url of urls) {
      const params = Object.fromEntries(new URL(url, "http://x").searchParams);
      const query = parseDashboardQuery(params);
      expect(dashboardHref(query)).toBe(url);
      expect(searchParamsHref(params)).toBe(url);
    }
  });

  it("normalizes messy form submissions", () => {
    const params = { tab: "all", sort: "score", minRooms: "", minSqm: "90", district: "", bathtub: "on" };
    expect(dashboardHref(parseDashboardQuery(params))).toBe("/?minSqm=90&bathtub=1");
  });
});

describe("searchParamsHref", () => {
  it("serializes repeated and undefined values", () => {
    expect(searchParamsHref({ a: ["1", "2"], b: undefined })).toBe("/?a=1&a=2");
    expect(searchParamsHref({})).toBe("/");
  });
});

describe("hasActiveFilters", () => {
  it("ignores tab and sort", () => {
    expect(hasActiveFilters(parseDashboardQuery({ tab: "new", sort: "rent" }).filters)).toBe(false);
    expect(hasActiveFilters(parseDashboardQuery({ balcony: "1" }).filters)).toBe(true);
    expect(hasActiveFilters(parseDashboardQuery({ status: "gone" }).filters)).toBe(true);
  });
});
