import { getDb } from "@/lib/db/client";
import { readResendEnv } from "@/lib/ingest/env";
import { processIncomingEmail } from "@/lib/ingest/pipeline";
import { getResend } from "@/lib/ingest/resendClient";
import { supabaseIngestionStore } from "@/lib/ingest/store";
import { handleInboundWebhook } from "@/lib/ingest/webhook";

/**
 * Resend inbound webhook. Excluded from dashboard Basic Auth (see
 * src/proxy.ts); authenticated only by the Resend webhook signature.
 */
export async function POST(request: Request): Promise<Response> {
  return handleInboundWebhook(request, {
    config: () => readResendEnv(),
    resend: getResend,
    process: (email) => processIncomingEmail(email, supabaseIngestionStore(getDb())),
  });
}
