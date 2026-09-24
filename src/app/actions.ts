"use server";

import { revalidatePath } from "next/cache";
import { assertDashboardAuth } from "@/lib/auth/server";
import {
  parseFavoriteInput,
  parseStatusInput,
} from "@/lib/dashboard/actionInput";
import {
  updateApartmentFavorite,
  updateApartmentStatus,
} from "@/lib/db/apartments";
import { getDb } from "@/lib/db/client";

function revalidateApartment(id: string): void {
  revalidatePath("/");
  revalidatePath(`/apartments/${id}`);
}

/** Changes the workflow status only; the favorite flag is untouched. */
export async function setApartmentStatus(form: FormData): Promise<void> {
  await assertDashboardAuth();
  const input = parseStatusInput(form);
  if (!input.ok) throw new Error(`setApartmentStatus: ${input.error}`);

  await updateApartmentStatus(getDb(), input.value.id, input.value.status);
  revalidateApartment(input.value.id);
}

/** Sets the favorite flag only; the workflow status is untouched. */
export async function setApartmentFavorite(form: FormData): Promise<void> {
  await assertDashboardAuth();
  const input = parseFavoriteInput(form);
  if (!input.ok) throw new Error(`setApartmentFavorite: ${input.error}`);

  await updateApartmentFavorite(getDb(), input.value.id, input.value.isFavorite);
  revalidateApartment(input.value.id);
}
