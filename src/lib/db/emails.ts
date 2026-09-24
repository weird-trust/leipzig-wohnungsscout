import type { EmailParseResult, NewInboundEmail, StoredEmail } from "@/lib/domain/email";
import { DbError, isUniqueViolation } from "@/lib/db/errors";
import { emailFromRow, emailParseResultToUpdate, emailToInsert } from "@/lib/db/mapping";
import type { Db } from "@/lib/db/types";

export interface CreateInboundEmailResult {
  email: StoredEmail;
  /** false when an email with this provider message id already existed. */
  created: boolean;
}

export async function findEmailByProviderMessageId(
  db: Db,
  providerMessageId: string,
): Promise<StoredEmail | null> {
  const { data, error } = await db
    .from("emails")
    .select()
    .eq("provider_message_id", providerMessageId)
    .maybeSingle();
  if (error) throw new DbError("findEmailByProviderMessageId", error);
  return data ? emailFromRow(data) : null;
}

/**
 * Stores a new inbound email with parse_status "pending". A duplicate
 * provider message id (webhook redelivery) returns the existing row with
 * created = false instead of failing.
 */
export async function createInboundEmail(
  db: Db,
  email: NewInboundEmail,
): Promise<CreateInboundEmailResult> {
  const { data, error } = await db
    .from("emails")
    .insert(emailToInsert(email))
    .select()
    .single();
  if (!error) return { email: emailFromRow(data), created: true };
  if (!isUniqueViolation(error)) throw new DbError("createInboundEmail", error);

  const existing = await findEmailByProviderMessageId(db, email.providerMessageId);
  if (!existing) {
    throw new DbError("createInboundEmail", {
      message: `duplicate ${email.providerMessageId} reported but not found`,
    });
  }
  return { email: existing, created: false };
}

export async function updateEmailParseResult(
  db: Db,
  id: string,
  result: EmailParseResult,
): Promise<StoredEmail> {
  const { data, error } = await db
    .from("emails")
    .update(emailParseResultToUpdate(result))
    .eq("id", id)
    .select()
    .single();
  if (error) throw new DbError("updateEmailParseResult", error);
  return emailFromRow(data);
}
