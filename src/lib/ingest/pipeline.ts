import type { Apartment, NewApartment } from "@/lib/domain/apartment";
import type {
  EmailParseResult,
  EmailParseStatus,
  IncomingEmail,
  NewInboundEmail,
  StoredEmail,
} from "@/lib/domain/email";
import { toNewApartment } from "@/lib/ingest/normalize";
import { parseEmail } from "@/lib/parsers";
import type { ParseOutcome, ParserFailure } from "@/lib/parsers/types";
import { detectSource } from "@/lib/sourceDetection";

/**
 * Provider-independent ingestion: store the raw email first, then parse,
 * normalize and persist apartments, then record the parse result.
 *
 * Not transactional (Supabase REST has no multi-request transactions). The
 * compromise that keeps retries safe:
 * - The raw email row is created first and is never lost to later failures.
 * - A redelivered email that already finished (parsed/unrecognized) stops.
 *   One left "pending" or "failed" is processed again.
 * - Re-processing upserts listings with a source id (idempotent) and skips as
 *   many source-id-less listings as were already stored for this email. That
 *   relies on the parser returning listings in the same order for the same
 *   email, which holds for deterministic parsers.
 * - Two deliveries processed at the very same moment could still both insert
 *   source-id-less listings. Accepted for V0.1.
 */

export interface IngestionStore {
  createInboundEmail(email: NewInboundEmail): Promise<{ email: StoredEmail; created: boolean }>;
  updateEmailParseResult(id: string, result: EmailParseResult): Promise<StoredEmail>;
  insertApartment(apartment: NewApartment): Promise<Apartment>;
  upsertApartment(apartment: NewApartment & { sourceId: string }): Promise<Apartment>;
  countApartmentsWithoutSourceId(emailId: string): Promise<number>;
}

export type IngestionResult =
  | { outcome: "duplicate"; emailId: string; parseStatus: EmailParseStatus }
  | {
      outcome: "processed";
      emailId: string;
      parseStatus: EmailParseResult["parseStatus"];
      apartments: number;
      /** True when an earlier, unfinished attempt for this email existed. */
      reprocessed: boolean;
    };

export type IngestionStage = "store_email" | "persist_apartments" | "update_status";

/** An infrastructure failure. The caller should let the provider retry. */
export class IngestionError extends Error {
  constructor(
    readonly stage: IngestionStage,
    readonly emailId: string | null,
    readonly cause: unknown,
  ) {
    super(`ingestion failed at ${stage}: ${errorMessage(cause)}`);
    this.name = "IngestionError";
  }
}

const MAX_PARSE_ERROR_LENGTH = 500;
const FINISHED: readonly EmailParseStatus[] = ["parsed", "unrecognized"];

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function truncate(text: string): string {
  return text.length > MAX_PARSE_ERROR_LENGTH
    ? `${text.slice(0, MAX_PARSE_ERROR_LENGTH - 1)}…`
    : text;
}

function describeFailures(failures: readonly ParserFailure[]): string | null {
  if (failures.length === 0) return null;
  return truncate(failures.map((f) => `${f.parser} (${f.stage}): ${f.message}`).join("; "));
}

/** parseEmail never throws, but a broken registry must not lose the email either. */
function safeParse(parse: (email: IncomingEmail) => ParseOutcome, email: IncomingEmail): ParseOutcome {
  try {
    return parse(email);
  } catch (error) {
    return {
      status: "failed",
      parserVersion: "registry",
      apartments: [],
      failures: [{ parser: "registry", stage: "parse", message: errorMessage(error) }],
    };
  }
}

async function persistApartments(
  store: IngestionStore,
  outcome: ParseOutcome,
  emailId: string,
  reprocessed: boolean,
): Promise<number> {
  let alreadyStored = reprocessed ? await store.countApartmentsWithoutSourceId(emailId) : 0;
  for (const parsed of outcome.apartments) {
    const apartment = toNewApartment(parsed, emailId);
    if (apartment.sourceId !== null) {
      await store.upsertApartment({ ...apartment, sourceId: apartment.sourceId });
    } else if (alreadyStored > 0) {
      alreadyStored--;
    } else {
      await store.insertApartment(apartment);
    }
  }
  return outcome.apartments.length;
}

export async function processIncomingEmail(
  email: IncomingEmail,
  store: IngestionStore,
  parse: (email: IncomingEmail) => ParseOutcome = parseEmail,
): Promise<IngestionResult> {
  // Detect on the complete email: forwarded alerts only reveal the platform
  // in their links, not in From.
  const { source } = detectSource(email);

  let stored: StoredEmail;
  let created: boolean;
  try {
    ({ email: stored, created } = await store.createInboundEmail({ ...email, detectedSource: source }));
  } catch (error) {
    throw new IngestionError("store_email", null, error);
  }

  if (!created && FINISHED.includes(stored.parseStatus)) {
    return { outcome: "duplicate", emailId: stored.id, parseStatus: stored.parseStatus };
  }

  const outcome = safeParse(parse, email);

  let apartments: number;
  try {
    apartments = await persistApartments(store, outcome, stored.id, !created);
  } catch (error) {
    // Best effort: record the failure on the raw email; it stays retryable.
    await store
      .updateEmailParseResult(stored.id, {
        parseStatus: "failed",
        parserVersion: outcome.parserVersion,
        parseError: truncate(`storing apartments failed: ${errorMessage(error)}`),
      })
      .catch(() => undefined);
    throw new IngestionError("persist_apartments", stored.id, error);
  }

  try {
    await store.updateEmailParseResult(stored.id, {
      parseStatus: outcome.status,
      parserVersion: outcome.parserVersion,
      parseError: describeFailures(outcome.failures),
    });
  } catch (error) {
    throw new IngestionError("update_status", stored.id, error);
  }

  return {
    outcome: "processed",
    emailId: stored.id,
    parseStatus: outcome.status,
    apartments,
    reprocessed: !created,
  };
}
