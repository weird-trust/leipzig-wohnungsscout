import {
  countApartmentsWithoutSourceId,
  insertApartment,
  upsertApartment,
} from "@/lib/db/apartments";
import { createInboundEmail, updateEmailParseResult } from "@/lib/db/emails";
import type { Db } from "@/lib/db/types";
import type { IngestionStore } from "@/lib/ingest/pipeline";

/** The ingestion pipeline's storage, backed by the Supabase repositories. */
export function supabaseIngestionStore(db: Db): IngestionStore {
  return {
    createInboundEmail: (email) => createInboundEmail(db, email),
    updateEmailParseResult: (id, result) => updateEmailParseResult(db, id, result),
    insertApartment: (apartment) => insertApartment(db, apartment),
    upsertApartment: (apartment) => upsertApartment(db, apartment),
    countApartmentsWithoutSourceId: (emailId) => countApartmentsWithoutSourceId(db, emailId),
  };
}
