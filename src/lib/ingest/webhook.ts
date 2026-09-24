import type { IncomingEmail } from "@/lib/domain/email";
import type { ResendEnv } from "@/lib/ingest/env";
import { IngestionError, type IngestionResult } from "@/lib/ingest/pipeline";
import {
  fetchReceivedEmail,
  parseWebhookEvent,
  readWebhookHeaders,
  ReceivingApiError,
  verifyWebhook,
  type ResendLike,
} from "@/lib/ingest/resend";

/**
 * POST /api/email/incoming. Resend retries every non-2xx response
 * (5s, 5m, 30m, 2h, 5h, 10h), so:
 *
 * - 400: missing/invalid signature or malformed signed payload. Nothing processed.
 * - 200: unsupported event type, duplicate delivery, or processed (including
 *   "unrecognized", and "failed" caused by a parser: retrying would not help;
 *   the raw email is kept for reprocessing).
 * - 502: the Receiving API failed before anything was stored → retry.
 * - 500: missing configuration or a storage failure → retry. A partially
 *   processed email is resumed safely on the next attempt (see pipeline.ts).
 *
 * Responses and logs never contain email content, secrets or DB details.
 */

export interface InboundWebhookDeps {
  /** Throws when the Resend configuration is missing. */
  config(): ResendEnv;
  resend(config: ResendEnv): ResendLike;
  process(email: IncomingEmail): Promise<IngestionResult>;
  now?(): Date;
  log?: Pick<Console, "info" | "warn" | "error">;
}

function json(status: number, body: Record<string, unknown>): Response {
  return Response.json(body, { status });
}

export async function handleInboundWebhook(
  request: Request,
  deps: InboundWebhookDeps,
): Promise<Response> {
  const log = deps.log ?? console;

  const headers = readWebhookHeaders(request.headers);
  if (!headers) return json(400, { error: "missing webhook signature headers" });

  let config: ResendEnv;
  try {
    config = deps.config();
  } catch (error) {
    log.error("[inbound] webhook not configured:", error instanceof Error ? error.message : error);
    return json(500, { error: "webhook not configured" });
  }

  // Raw body first: the signature covers the exact bytes. Never request.json() before this.
  const rawBody = await request.text();
  const resend = deps.resend(config);
  const verified = verifyWebhook(resend, rawBody, headers, config.webhookSecret);
  if (!verified.ok) {
    log.warn(`[inbound] rejected webhook ${headers.id}: ${verified.reason}`);
    return json(400, {
      error: verified.reason === "invalid_signature" ? "invalid webhook signature" : "invalid webhook payload",
    });
  }

  const event = parseWebhookEvent(verified.payload);
  if (event.kind === "invalid") {
    log.warn(`[inbound] signed webhook ${headers.id} has an unsupported shape`);
    return json(400, { error: "invalid webhook payload" });
  }
  if (event.kind === "ignored") {
    return json(200, { ok: true, ignored: event.type });
  }

  const now = deps.now?.() ?? new Date();
  let email: IncomingEmail;
  try {
    email = await fetchReceivedEmail(resend, event.emailId, now);
  } catch (error) {
    const detail = error instanceof ReceivingApiError ? error.message : "unexpected error";
    log.error(`[inbound] could not retrieve email ${event.emailId}: ${detail}`);
    return json(502, { error: "could not retrieve email" });
  }

  try {
    const result = await deps.process(email);
    log.info(
      `[inbound] email ${event.emailId}: ${result.outcome}, ${result.parseStatus}` +
        (result.outcome === "processed" ? `, ${result.apartments} apartment(s)` : ""),
    );
    return json(200, {
      ok: true,
      outcome: result.outcome,
      parseStatus: result.parseStatus,
      ...(result.outcome === "processed" ? { apartments: result.apartments } : {}),
    });
  } catch (error) {
    const stage = error instanceof IngestionError ? error.stage : "unknown";
    log.error(
      `[inbound] processing email ${event.emailId} failed at ${stage}:`,
      error instanceof Error ? error.message : error,
    );
    return json(500, { error: "processing failed" });
  }
}
