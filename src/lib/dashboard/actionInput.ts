import {
  APARTMENT_STATUSES,
  type ApartmentStatus,
} from "@/lib/domain/apartment";

/** Validation of Server Action form input. Raw FormData is never trusted. */

export type Parsed<T> = { ok: true; value: T } | { ok: false; error: string };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function stringField(form: FormData, name: string): string | null {
  const value = form.get(name);
  return typeof value === "string" ? value : null;
}

function parseId(form: FormData): Parsed<string> {
  const id = stringField(form, "id");
  return id !== null && UUID.test(id)
    ? { ok: true, value: id.toLowerCase() }
    : { ok: false, error: "invalid apartment id" };
}

export function parseStatusInput(
  form: FormData,
): Parsed<{ id: string; status: ApartmentStatus }> {
  const id = parseId(form);
  if (!id.ok) return id;
  const status = stringField(form, "status");
  if (status === null || !(APARTMENT_STATUSES as readonly string[]).includes(status)) {
    return { ok: false, error: "invalid status" };
  }
  return { ok: true, value: { id: id.value, status: status as ApartmentStatus } };
}

export function parseFavoriteInput(
  form: FormData,
): Parsed<{ id: string; isFavorite: boolean }> {
  const id = parseId(form);
  if (!id.ok) return id;
  const favorite = stringField(form, "favorite");
  if (favorite !== "true" && favorite !== "false") {
    return { ok: false, error: "invalid favorite value" };
  }
  return { ok: true, value: { id: id.value, isFavorite: favorite === "true" } };
}
