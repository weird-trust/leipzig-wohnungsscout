import type { ApartmentWithEmailRow, EmailRow } from "@/lib/db/types";

/** Row builders for db-layer tests. Test-only. */

export function apartmentRow(
  overrides: Partial<ApartmentWithEmailRow> = {},
): ApartmentWithEmailRow {
  return {
    id: "6f1c2c43-6c2a-4a55-9a52-0d3f3f4b2a11",
    email_id: "0b8f4f7e-1b5d-4c1e-8d5c-2f6c1a9e7d20",
    source: "other",
    source_url: null,
    source_id: "abc-1",
    title: "3-Zimmer-Wohnung in Gohlis",
    address: null,
    district: "Gohlis",
    rooms: 3,
    sqm: 98.5,
    rent_cold: 1000,
    rent_warm: 1250,
    floor: 2,
    top_floor: null,
    balcony: true,
    bathtub: false,
    residential_kitchen: null,
    elevator: null,
    building_type: "altbau",
    description: "Altbau mit Balkon, keine Badewanne.",
    image_url: null,
    fingerprint: "gohlis|3|99|1250",
    first_seen: "2026-09-20T10:00:00+00:00",
    status: "applied",
    is_favorite: true,
    created_at: "2026-09-20T10:00:00+00:00",
    updated_at: "2026-09-21T10:00:00+00:00",
    emails: { received_at: "2026-09-20T09:59:00+00:00" },
    ...overrides,
  };
}

export function emailRow(overrides: Partial<EmailRow> = {}): EmailRow {
  return {
    id: "0b8f4f7e-1b5d-4c1e-8d5c-2f6c1a9e7d20",
    provider_message_id: "msg-1",
    received_at: "2026-09-20T09:59:00+00:00",
    raw_from: "Suchauftrag <alert@example.com>",
    raw_to: ["wohnungen@inbound.example.com"],
    raw_subject: "Neue Wohnungen",
    raw_text: "3-Zimmer-Wohnung in Gohlis",
    raw_html: null,
    detected_source: "other",
    parser_version: null,
    parse_status: "pending",
    parse_error: null,
    created_at: "2026-09-20T09:59:01+00:00",
    updated_at: "2026-09-20T09:59:01+00:00",
    ...overrides,
  };
}
