import type { Apartment, NewApartment } from "@/lib/domain/apartment";
import type { EmailParseResult, StoredEmail } from "@/lib/domain/email";
import { makeApartment } from "@/lib/dashboard/testing/apartments";
import type { IngestionStore, ReprocessingStore } from "@/lib/ingest/pipeline";

/**
 * In-memory store for both pipeline entry points (one email). Upsert keeps
 * workflow fields. Test-only.
 */
export function memoryStore(existing?: StoredEmail) {
  let email: StoredEmail | null = existing ? structuredClone(existing) : null;
  const apartments: Apartment[] = [];
  const updates: EmailParseResult[] = [];
  const upsert = async (input: NewApartment) => {
    const found = apartments.find((a) => a.source === input.source && a.sourceId === input.sourceId);
    if (found) return Object.assign(found, input);
    const created = makeApartment({ ...input, id: `apt-${apartments.length + 1}` });
    apartments.push(created);
    return created;
  };
  const store: IngestionStore & ReprocessingStore = {
    async createInboundEmail(input) {
      if (email) return { email, created: false };
      email = { ...input, id: "row-1", parserVersion: null, parseStatus: "pending", parseError: null };
      return { email, created: true };
    },
    async findEmailByProviderMessageId(id) {
      return email?.providerMessageId === id ? structuredClone(email) : null;
    },
    async updateEmailParseResult(_id, result) {
      updates.push(result);
      email = { ...email!, ...result, detectedSource: result.detectedSource ?? email!.detectedSource };
      return email;
    },
    insertApartment: upsert,
    upsertApartment: upsert,
    async countApartmentsWithoutSourceId() {
      return 0;
    },
  };
  return { store, apartments, updates, email: () => email };
}

