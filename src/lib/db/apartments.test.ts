import { describe, expect, it } from "vitest";
import type { ApartmentStatus, NewApartment } from "@/lib/domain/apartment";
import {
  countApartmentsWithoutSourceId,
  getApartmentById,
  insertApartment,
  listApartments,
  updateApartmentFavorite,
  updateApartmentStatus,
  upsertApartment,
} from "@/lib/db/apartments";
import { DbMappingError } from "@/lib/db/mapping";
import { callArgs, createFakeDb } from "@/lib/db/testing/fakeDb";
import { apartmentRow } from "@/lib/db/testing/rows";

const input: NewApartment & { sourceId: string } = {
  emailId: null,
  source: "other",
  sourceUrl: null,
  sourceId: "abc-1",
  title: "3-Zimmer-Wohnung in Gohlis",
  address: null,
  district: "Gohlis",
  rooms: 3,
  sqm: 98.5,
  rentCold: 1000,
  rentWarm: 1250,
  floor: 2,
  topFloor: null,
  balcony: true,
  bathtub: false,
  residentialKitchen: null,
  elevator: null,
  buildingType: "altbau",
  description: null,
  imageUrl: null,
  fingerprint: "gohlis|3|99|1250",
};

describe("insertApartment / upsertApartment", () => {
  it("inserts and joins the email received time", async () => {
    const { db, queries } = createFakeDb([{ data: apartmentRow(), error: null }]);

    const apartment = await insertApartment(db, input);

    expect(apartment.emailReceivedAt).toEqual(new Date("2026-09-20T09:59:00Z"));
    expect(callArgs(queries[0], "select")).toEqual(["*, emails(received_at)"]);
  });

  it("upserts on (source, source_id) without sending workflow fields", async () => {
    const { db, queries } = createFakeDb([{ data: apartmentRow(), error: null }]);

    await upsertApartment(db, input);

    const [row, options] = callArgs(queries[0], "upsert") ?? [];
    expect(options).toEqual({ onConflict: "source,source_id" });
    expect(row).not.toHaveProperty("status");
    expect(row).not.toHaveProperty("is_favorite");
    expect(row).not.toHaveProperty("first_seen");
  });

  it("refreshes the fingerprint on upsert but never uses it as the conflict key", async () => {
    const { db, queries } = createFakeDb([{ data: apartmentRow(), error: null }]);
    const changed = { ...input, district: "Gohlis-Nord", sqm: 104, fingerprint: "gohlis-nord|3|104|1250" };

    await upsertApartment(db, changed);

    const [row, options] = callArgs(queries[0], "upsert") ?? [];
    expect(row).toMatchObject({
      fingerprint: "gohlis-nord|3|104|1250",
      district: "Gohlis-Nord",
      sqm: 104,
    });
    expect(JSON.stringify(options)).not.toContain("fingerprint");
  });

  it("clears a stale fingerprint when a listing loses a fingerprint input", async () => {
    const { db, queries } = createFakeDb([{ data: apartmentRow(), error: null }]);

    await upsertApartment(db, { ...input, rentWarm: null, fingerprint: null });

    const [row] = callArgs(queries[0], "upsert") ?? [];
    expect(row).toHaveProperty("fingerprint", null);
  });
});

describe("getApartmentById", () => {
  it("returns null when not found", async () => {
    const { db } = createFakeDb([{ data: null, error: null }]);
    expect(await getApartmentById(db, "6f1c2c43-6c2a-4a55-9a52-0d3f3f4b2a11")).toBeNull();
  });

  it("returns null for a malformed id instead of throwing", async () => {
    const { db } = createFakeDb([
      { data: null, error: { code: "22P02", message: "invalid input syntax for type uuid" } },
    ]);
    expect(await getApartmentById(db, "kein-uuid")).toBeNull();
  });

  it("throws on other errors", async () => {
    const { db } = createFakeDb([{ data: null, error: { code: "57014", message: "timeout" } }]);
    await expect(getApartmentById(db, "x")).rejects.toThrow("getApartmentById failed: timeout");
  });
});

describe("listApartments", () => {
  it("maps all rows, newest first", async () => {
    const { db, queries } = createFakeDb([
      { data: [apartmentRow(), apartmentRow({ id: "b", status: "new", is_favorite: false })], error: null },
    ]);

    const apartments = await listApartments(db);

    expect(apartments.map((a) => a.id)).toEqual(["6f1c2c43-6c2a-4a55-9a52-0d3f3f4b2a11", "b"]);
    expect(callArgs(queries[0], "order")).toEqual(["first_seen", { ascending: false }]);
  });

  it("does not silently accept an invalid stored value", async () => {
    const { db } = createFakeDb([{ data: [apartmentRow({ status: "favorite" })], error: null }]);
    await expect(listApartments(db)).rejects.toThrow(DbMappingError);
  });
});

describe("status and favorite are independent", () => {
  it("a status update writes only the status", async () => {
    const { db, queries } = createFakeDb([
      { data: apartmentRow({ status: "viewing", is_favorite: true }), error: null },
    ]);

    const apartment = await updateApartmentStatus(db, "id-1", "viewing");

    expect(callArgs(queries[0], "update")).toEqual([{ status: "viewing" }]);
    expect(callArgs(queries[0], "eq")).toEqual(["id", "id-1"]);
    expect(apartment).toMatchObject({ status: "viewing", isFavorite: true });
  });

  it("a favorite update writes only is_favorite", async () => {
    const { db, queries } = createFakeDb([
      { data: apartmentRow({ status: "applied", is_favorite: false }), error: null },
    ]);

    const apartment = await updateApartmentFavorite(db, "id-1", false);

    expect(callArgs(queries[0], "update")).toEqual([{ is_favorite: false }]);
    expect(apartment).toMatchObject({ status: "applied", isFavorite: false });
  });

  it("rejects an invalid status before querying", async () => {
    const { db, queries } = createFakeDb([]);
    await expect(
      updateApartmentStatus(db, "id-1", "favorite" as ApartmentStatus),
    ).rejects.toThrow("invalid status");
    expect(queries).toHaveLength(0);
  });
});

describe("countApartmentsWithoutSourceId", () => {
  it("counts only this email's apartments without a source id", async () => {
    const { db, queries } = createFakeDb([{ data: null, error: null, count: 2 }]);

    expect(await countApartmentsWithoutSourceId(db, "email-row")).toBe(2);
    expect(callArgs(queries[0], "eq")).toEqual(["email_id", "email-row"]);
    expect(callArgs(queries[0], "is")).toEqual(["source_id", null]);
    expect(callArgs(queries[0], "select")).toEqual(["id", { count: "exact", head: true }]);
  });

  it("treats a missing count as zero and rethrows errors", async () => {
    expect(await countApartmentsWithoutSourceId(createFakeDb([{ data: null, error: null }]).db, "x")).toBe(0);
    const failing = createFakeDb([{ data: null, error: { message: "timeout" } }]).db;
    await expect(countApartmentsWithoutSourceId(failing, "x")).rejects.toThrow("timeout");
  });
});
