import {
  APARTMENT_STATUSES,
  type Apartment,
  type ApartmentStatus,
  type NewApartment,
} from "@/lib/domain/apartment";
import { DbError, isInvalidInput } from "@/lib/db/errors";
import { apartmentFromRow, apartmentToInsert } from "@/lib/db/mapping";
import type { Db } from "@/lib/db/types";

/** Every apartment read joins the received time of its email. */
const APARTMENT_SELECT = "*, emails(received_at)";

export async function insertApartment(
  db: Db,
  apartment: NewApartment,
): Promise<Apartment> {
  const { data, error } = await db
    .from("apartments")
    .insert(apartmentToInsert(apartment))
    .select(APARTMENT_SELECT)
    .single();
  if (error) throw new DbError("insertApartment", error);
  return apartmentFromRow(data);
}

/**
 * Inserts or refreshes a listing identified by (source, sourceId). Listing
 * data, features, fingerprint and email link are overwritten; status,
 * favorite and first seen are never touched, so re-receiving a listing keeps
 * its history. The fingerprint is data only, never a conflict key.
 */
export async function upsertApartment(
  db: Db,
  apartment: NewApartment & { sourceId: string },
): Promise<Apartment> {
  const { data, error } = await db
    .from("apartments")
    .upsert(apartmentToInsert(apartment), { onConflict: "source,source_id" })
    .select(APARTMENT_SELECT)
    .single();
  if (error) throw new DbError("upsertApartment", error);
  return apartmentFromRow(data);
}

export async function getApartmentById(
  db: Db,
  id: string,
): Promise<Apartment | null> {
  const { data, error } = await db
    .from("apartments")
    .select(APARTMENT_SELECT)
    .eq("id", id)
    .maybeSingle();
  if (error) {
    if (isInvalidInput(error)) return null;
    throw new DbError("getApartmentById", error);
  }
  return data ? apartmentFromRow(data) : null;
}

/**
 * All apartments, newest first. Scoring, filtering and sorting happen in
 * application code. Note: PostgREST caps responses (1000 rows by default).
 */
export async function listApartments(db: Db): Promise<Apartment[]> {
  const { data, error } = await db
    .from("apartments")
    .select(APARTMENT_SELECT)
    .order("first_seen", { ascending: false });
  if (error) throw new DbError("listApartments", error);
  return data.map(apartmentFromRow);
}

/** Changes only the workflow status; isFavorite is left as it is. */
export async function updateApartmentStatus(
  db: Db,
  id: string,
  status: ApartmentStatus,
): Promise<Apartment> {
  if (!(APARTMENT_STATUSES as readonly string[]).includes(status)) {
    throw new DbError("updateApartmentStatus", {
      message: `invalid status ${JSON.stringify(status)}`,
    });
  }
  const { data, error } = await db
    .from("apartments")
    .update({ status })
    .eq("id", id)
    .select(APARTMENT_SELECT)
    .single();
  if (error) throw new DbError("updateApartmentStatus", error);
  return apartmentFromRow(data);
}

/** Changes only isFavorite; the workflow status is left as it is. */
export async function updateApartmentFavorite(
  db: Db,
  id: string,
  isFavorite: boolean,
): Promise<Apartment> {
  const { data, error } = await db
    .from("apartments")
    .update({ is_favorite: isFavorite })
    .eq("id", id)
    .select(APARTMENT_SELECT)
    .single();
  if (error) throw new DbError("updateApartmentFavorite", error);
  return apartmentFromRow(data);
}

/**
 * Apartments without a source id already stored for an email. Ingestion uses
 * this to resume after a partial failure instead of inserting them twice.
 */
export async function countApartmentsWithoutSourceId(db: Db, emailId: string): Promise<number> {
  const { count, error } = await db
    .from("apartments")
    .select("id", { count: "exact", head: true })
    .eq("email_id", emailId)
    .is("source_id", null);
  if (error) throw new DbError("countApartmentsWithoutSourceId", error);
  return count ?? 0;
}
