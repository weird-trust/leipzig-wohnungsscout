import type { Apartment } from "@/lib/domain/apartment";

/** Apartment builder for dashboard tests. Everything optional starts unknown. Test-only. */
export function makeApartment(overrides: Partial<Apartment> = {}): Apartment {
  return {
    id: "00000000-0000-4000-8000-000000000001",
    emailId: null,
    source: "other",
    sourceUrl: null,
    sourceId: null,
    title: "3-Zimmer-Wohnung",
    address: null,
    district: null,
    rooms: null,
    sqm: null,
    rentCold: null,
    rentWarm: null,
    floor: null,
    topFloor: null,
    balcony: null,
    bathtub: null,
    residentialKitchen: null,
    elevator: null,
    buildingType: "unknown",
    description: null,
    imageUrl: null,
    fingerprint: null,
    status: "new",
    isFavorite: false,
    firstSeen: new Date("2026-09-20T10:00:00Z"),
    emailReceivedAt: null,
    ...overrides,
  };
}

export function idOf(n: number): string {
  return `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
}
