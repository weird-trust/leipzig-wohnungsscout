/**
 * Upserts the synthetic apartments from fixtures/synthetic/ and sets their
 * status/favorite. Safe to run repeatedly: rows are keyed by
 * (source "other", source_id "synthetic-…") and re-running resets them to
 * the seeded state. Real (non-synthetic) rows are never touched.
 *
 * Run with: npm run seed
 */
import { getDb } from "@/lib/db/client";
import {
  updateApartmentFavorite,
  updateApartmentStatus,
  upsertApartment,
} from "@/lib/db/apartments";
import { SYNTHETIC_APARTMENTS, toNewApartment } from "../fixtures/synthetic/apartments";

async function main(): Promise<void> {
  const db = getDb();

  for (const entry of SYNTHETIC_APARTMENTS) {
    let apartment = await upsertApartment(db, toNewApartment(entry));
    if (apartment.status !== entry.status) {
      apartment = await updateApartmentStatus(db, apartment.id, entry.status);
    }
    if (apartment.isFavorite !== entry.isFavorite) {
      apartment = await updateApartmentFavorite(db, apartment.id, entry.isFavorite);
    }
    console.log(
      `${entry.sourceId}: ${apartment.status}${apartment.isFavorite ? ", favorite" : ""}`,
    );
  }

  console.log(`Seeded ${SYNTHETIC_APARTMENTS.length} synthetic apartments.`);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
