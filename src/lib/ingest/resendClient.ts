import "server-only";

import { Resend } from "resend";
import type { ResendEnv } from "@/lib/ingest/env";

let client: Resend | undefined;

/**
 * Created on first use, never at import time: the constructor throws without
 * an API key, and the build runs without secrets.
 */
export function getResend(config: ResendEnv): Resend {
  client ??= new Resend(config.apiKey);
  return client;
}
