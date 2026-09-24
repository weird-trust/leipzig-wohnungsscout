import { describe, expect, it } from "vitest";
import { activeFilters } from "@/lib/dashboard/activeFilters";
import { parseDashboardQuery } from "@/lib/dashboard/query";
import { idOf, makeApartment } from "@/lib/dashboard/testing/apartments";
import { buildDashboardView } from "@/lib/dashboard/view";

const apartments = [
  makeApartment({ id: idOf(1), status: "new", district: "Plagwitz", balcony: true, rooms: 3 }),
  makeApartment({ id: idOf(2), status: "applied", isFavorite: true, district: "Connewitz" }),
  makeApartment({ id: idOf(3), status: "viewing", district: " Plagwitz " }),
  makeApartment({ id: idOf(4), status: "new", district: null, balcony: null }),
];

describe("buildDashboardView", () => {
  it("counts tabs over all apartments, independent of filters", () => {
    const view = buildDashboardView(apartments, parseDashboardQuery({ balcony: "1" }));
    expect(view.total).toBe(4);
    expect(view.tabCounts).toEqual({ all: 4, new: 2, favorites: 1, applied: 1, viewing: 1 });
  });

  it("applies tab and filters together", () => {
    const view = buildDashboardView(apartments, parseDashboardQuery({ tab: "new", balcony: "1" }));
    expect(view.items.map((i) => i.apartment.id)).toEqual([idOf(1)]);
  });

  it("attaches the computed score to each item", () => {
    const view = buildDashboardView(apartments, parseDashboardQuery({}));
    const first = view.items.find((i) => i.apartment.id === idOf(1));
    expect(first?.score.score).toBe(20); // 3 rooms + balcony
  });

  it("lists each known district once, sorted", () => {
    expect(buildDashboardView(apartments, parseDashboardQuery({})).districts).toEqual([
      "Connewitz",
      "Plagwitz",
    ]);
  });

  it("returns an empty list, not an error, when nothing matches", () => {
    const view = buildDashboardView(apartments, parseDashboardQuery({ tab: "favorites", status: "new" }));
    expect(view.items).toEqual([]);
  });
});

describe("activeFilters", () => {
  it("labels each active filter with a link that removes only that filter", () => {
    const query = parseDashboardQuery({
      tab: "new",
      minSqm: "90",
      maxWarmRent: "1500",
      balcony: "1",
      topFloor: "1",
      district: "Plagwitz",
    });
    expect(activeFilters(query)).toEqual([
      { label: "ab 90 m²", removeHref: "/?tab=new&maxWarmRent=1500&topFloor=1&balcony=1&district=Plagwitz" },
      { label: expect.stringMatching(/^bis 1\.500\s€ warm$/), removeHref: "/?tab=new&minSqm=90&topFloor=1&balcony=1&district=Plagwitz" },
      { label: "✓ Dachgeschoss", removeHref: "/?tab=new&minSqm=90&maxWarmRent=1500&balcony=1&district=Plagwitz" },
      { label: "✓ Balkon / Terrasse", removeHref: "/?tab=new&minSqm=90&maxWarmRent=1500&topFloor=1&district=Plagwitz" },
      { label: "Stadtteil: Plagwitz", removeHref: "/?tab=new&minSqm=90&maxWarmRent=1500&topFloor=1&balcony=1" },
    ]);
  });

  it("is empty without filters", () => {
    expect(activeFilters(parseDashboardQuery({ tab: "favorites", sort: "rent" }))).toEqual([]);
  });
});
