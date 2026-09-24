import { describe, expect, it } from "vitest";
import type { NewApartment } from "@/lib/domain/apartment";
import type { NewInboundEmail } from "@/lib/domain/email";
import {
  apartmentFromRow,
  apartmentToInsert,
  DbMappingError,
  emailFromRow,
  emailParseResultToUpdate,
  emailToInsert,
} from "@/lib/db/mapping";
import { apartmentRow, emailRow } from "@/lib/db/testing/rows";

describe("apartmentFromRow", () => {
  it("maps a row to a camelCase domain apartment", () => {
    expect(apartmentFromRow(apartmentRow())).toEqual({
      id: "6f1c2c43-6c2a-4a55-9a52-0d3f3f4b2a11",
      emailId: "0b8f4f7e-1b5d-4c1e-8d5c-2f6c1a9e7d20",
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
      description: "Altbau mit Balkon, keine Badewanne.",
      imageUrl: null,
      fingerprint: "gohlis|3|99|1250",
      status: "applied",
      isFavorite: true,
      firstSeen: new Date("2026-09-20T10:00:00Z"),
      emailReceivedAt: new Date("2026-09-20T09:59:00Z"),
    });
  });

  it("keeps null features null and false features false", () => {
    const apartment = apartmentFromRow(
      apartmentRow({ top_floor: null, balcony: false, bathtub: null, elevator: false }),
    );
    expect(apartment.topFloor).toBeNull();
    expect(apartment.balcony).toBe(false);
    expect(apartment.bathtub).toBeNull();
    expect(apartment.elevator).toBe(false);
  });

  it("maps status and favorite independently", () => {
    expect(apartmentFromRow(apartmentRow({ status: "applied", is_favorite: true }))).toMatchObject(
      { status: "applied", isFavorite: true },
    );
    expect(apartmentFromRow(apartmentRow({ status: "new", is_favorite: false }))).toMatchObject({
      status: "new",
      isFavorite: false,
    });
  });

  it("gives null emailReceivedAt when there is no linked email", () => {
    const apartment = apartmentFromRow(apartmentRow({ email_id: null, emails: null }));
    expect(apartment.emailId).toBeNull();
    expect(apartment.emailReceivedAt).toBeNull();
  });

  it.each([
    ["status", { status: "favorite" }],
    ["source", { source: "immobilienscout" }],
    ["building type", { building_type: "plattenbau" }],
    ["first seen", { first_seen: "gestern" }],
  ])("rejects an invalid %s", (_, overrides) => {
    expect(() => apartmentFromRow(apartmentRow(overrides))).toThrow(DbMappingError);
  });
});

describe("apartmentToInsert", () => {
  const input: NewApartment = {
    emailId: null,
    source: "immowelt",
    sourceUrl: "https://www.immowelt.de/expose/abc",
    sourceId: "abc",
    title: "Dachgeschosswohnung",
    address: null,
    district: "Connewitz",
    rooms: 3.5,
    sqm: 101,
    rentCold: null,
    rentWarm: 1400,
    floor: null,
    topFloor: true,
    balcony: null,
    bathtub: false,
    residentialKitchen: null,
    elevator: null,
    buildingType: "unknown",
    description: null,
    imageUrl: null,
    fingerprint: null,
  };

  it("maps domain input to snake_case columns", () => {
    expect(apartmentToInsert(input)).toEqual({
      email_id: null,
      source: "immowelt",
      source_url: "https://www.immowelt.de/expose/abc",
      source_id: "abc",
      title: "Dachgeschosswohnung",
      address: null,
      district: "Connewitz",
      rooms: 3.5,
      sqm: 101,
      rent_cold: null,
      rent_warm: 1400,
      floor: null,
      top_floor: true,
      balcony: null,
      bathtub: false,
      residential_kitchen: null,
      elevator: null,
      building_type: "unknown",
      description: null,
      image_url: null,
      fingerprint: null,
    });
  });

  it("never writes workflow fields, so upserts cannot reset them", () => {
    const row = apartmentToInsert(input);
    expect(row).not.toHaveProperty("status");
    expect(row).not.toHaveProperty("is_favorite");
    expect(row).not.toHaveProperty("first_seen");
    expect(row).not.toHaveProperty("id");
  });
});

describe("email mapping", () => {
  it("maps a row to a stored email", () => {
    expect(emailFromRow(emailRow())).toEqual({
      id: "0b8f4f7e-1b5d-4c1e-8d5c-2f6c1a9e7d20",
      providerMessageId: "msg-1",
      receivedAt: new Date("2026-09-20T09:59:00Z"),
      from: "Suchauftrag <alert@example.com>",
      to: ["wohnungen@inbound.example.com"],
      subject: "Neue Wohnungen",
      text: "3-Zimmer-Wohnung in Gohlis",
      html: null,
      detectedSource: "other",
      parserVersion: null,
      parseStatus: "pending",
      parseError: null,
    });
  });

  it.each([
    ["parse status", { parse_status: "done" }],
    ["detected source", { detected_source: "gmail" }],
    ["received at", { received_at: "" }],
  ])("rejects an invalid %s", (_, overrides) => {
    expect(() => emailFromRow(emailRow(overrides))).toThrow(DbMappingError);
  });

  it("maps a new inbound email to an insert without parse fields", () => {
    const email: NewInboundEmail = {
      providerMessageId: "msg-2",
      detectedSource: "lwb",
      from: "info@lwb.de",
      to: ["wohnungen@inbound.example.com"],
      subject: "Neues Angebot",
      text: null,
      html: "<p>Angebot</p>",
      receivedAt: new Date("2026-09-24T08:00:00Z"),
    };
    expect(emailToInsert(email)).toEqual({
      provider_message_id: "msg-2",
      received_at: "2026-09-24T08:00:00.000Z",
      raw_from: "info@lwb.de",
      raw_to: ["wohnungen@inbound.example.com"],
      raw_subject: "Neues Angebot",
      raw_text: null,
      raw_html: "<p>Angebot</p>",
      detected_source: "lwb",
    });
  });

  it("maps a parse result to an update", () => {
    expect(
      emailParseResultToUpdate({
        parseStatus: "failed",
        parserVersion: "generic@0.1.0",
        parseError: "broken: Unerwartetes Format",
      }),
    ).toEqual({
      parse_status: "failed",
      parser_version: "generic@0.1.0",
      parse_error: "broken: Unerwartetes Format",
    });
  });
});
