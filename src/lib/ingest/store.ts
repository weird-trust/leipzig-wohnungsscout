import {
  countApartmentsWithoutSourceId,
  insertApartment,
  upsertApartment,
} from "@/lib/db/apartments";
import {
  createInboundEmail,
  findEmailByProviderMessageId,
  updateEmailParseResult,
} from "@/lib/db/emails";
import type { Db } from "@/lib/db/types";
import type { IngestionStore, ReprocessingStore } from "@/lib/ingest/pipeline";

/** Storage for ingestion and reprocessing, backed by the Supabase repositories. */
export function supabaseIngestionStore(db: Db): IngestionStore & ReprocessingStore {
  return {
    createInboundEmail: (email) => createInboundEmail(db, email),
    findEmailByProviderMessageId: (providerMessageId) =>
      findEmailByProviderMessageId(db, providerMessageId),
    updateEmailParseResult: (id, result) => updateEmailParseResult(db, id, result),
    insertApartment: (apartment) => insertApartment(db, apartment),
    upsertApartment: (apartment) => upsertApartment(db, apartment),
    countApartmentsWithoutSourceId: (emailId) => countApartmentsWithoutSourceId(db, emailId),
  };
}
