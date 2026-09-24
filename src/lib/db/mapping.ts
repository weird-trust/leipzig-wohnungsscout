import {
  APARTMENT_STATUSES,
  BUILDING_TYPES,
  SOURCES,
  type Apartment,
  type NewApartment,
} from "@/lib/domain/apartment";
import {
  EMAIL_PARSE_STATUSES,
  type EmailParseResult,
  type NewInboundEmail,
  type StoredEmail,
} from "@/lib/domain/email";
import type {
  ApartmentInsert,
  ApartmentWithEmailRow,
  EmailInsert,
  EmailRow,
  EmailUpdate,
} from "@/lib/db/types";

/**
 * The only place that translates between snake_case rows and domain types.
 * Rows are validated: an unexpected value throws instead of leaking into
 * the domain.
 */

export class DbMappingError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DbMappingError";
  }
}

function oneOf<const T extends string>(
  allowed: readonly T[],
  value: string,
  field: string,
): T {
  if ((allowed as readonly string[]).includes(value)) return value as T;
  throw new DbMappingError(`Invalid ${field}: ${JSON.stringify(value)}`);
}

function toDate(value: string, field: string): Date {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new DbMappingError(`Invalid ${field}: ${JSON.stringify(value)}`);
  }
  return date;
}

export function emailFromRow(row: EmailRow): StoredEmail {
  return {
    id: row.id,
    providerMessageId: row.provider_message_id,
    receivedAt: toDate(row.received_at, "emails.received_at"),
    from: row.raw_from,
    to: row.raw_to,
    subject: row.raw_subject,
    text: row.raw_text,
    html: row.raw_html,
    detectedSource: oneOf(SOURCES, row.detected_source, "emails.detected_source"),
    parserVersion: row.parser_version,
    parseStatus: oneOf(EMAIL_PARSE_STATUSES, row.parse_status, "emails.parse_status"),
    parseError: row.parse_error,
  };
}

export function emailToInsert(email: NewInboundEmail): EmailInsert {
  return {
    provider_message_id: email.providerMessageId,
    received_at: email.receivedAt.toISOString(),
    raw_from: email.from,
    raw_to: email.to,
    raw_subject: email.subject,
    raw_text: email.text,
    raw_html: email.html,
    detected_source: email.detectedSource,
  };
}

export function emailParseResultToUpdate(result: EmailParseResult): EmailUpdate {
  return {
    parse_status: result.parseStatus,
    parser_version: result.parserVersion,
    parse_error: result.parseError,
    ...(result.detectedSource !== undefined ? { detected_source: result.detectedSource } : {}),
  };
}

export function apartmentFromRow(row: ApartmentWithEmailRow): Apartment {
  return {
    id: row.id,
    emailId: row.email_id,
    source: oneOf(SOURCES, row.source, "apartments.source"),
    sourceUrl: row.source_url,
    sourceId: row.source_id,
    title: row.title,
    address: row.address,
    district: row.district,
    rooms: row.rooms,
    sqm: row.sqm,
    rentCold: row.rent_cold,
    rentWarm: row.rent_warm,
    floor: row.floor,
    topFloor: row.top_floor,
    balcony: row.balcony,
    bathtub: row.bathtub,
    residentialKitchen: row.residential_kitchen,
    elevator: row.elevator,
    buildingType: oneOf(BUILDING_TYPES, row.building_type, "apartments.building_type"),
    description: row.description,
    imageUrl: row.image_url,
    fingerprint: row.fingerprint,
    status: oneOf(APARTMENT_STATUSES, row.status, "apartments.status"),
    isFavorite: row.is_favorite,
    firstSeen: toDate(row.first_seen, "apartments.first_seen"),
    emailReceivedAt: row.emails
      ? toDate(row.emails.received_at, "emails.received_at")
      : null,
  };
}

export function apartmentToInsert(apartment: NewApartment): ApartmentInsert {
  return {
    email_id: apartment.emailId,
    source: apartment.source,
    source_url: apartment.sourceUrl,
    source_id: apartment.sourceId,
    title: apartment.title,
    address: apartment.address,
    district: apartment.district,
    rooms: apartment.rooms,
    sqm: apartment.sqm,
    rent_cold: apartment.rentCold,
    rent_warm: apartment.rentWarm,
    floor: apartment.floor,
    top_floor: apartment.topFloor,
    balcony: apartment.balcony,
    bathtub: apartment.bathtub,
    residential_kitchen: apartment.residentialKitchen,
    elevator: apartment.elevator,
    building_type: apartment.buildingType,
    description: apartment.description,
    image_url: apartment.imageUrl,
    fingerprint: apartment.fingerprint,
  };
}
