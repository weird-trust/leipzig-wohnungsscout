import "server-only";

import { createClient } from "@supabase/supabase-js";
import { readSupabaseEnv } from "@/lib/db/env";
import type { Database, Db } from "@/lib/db/types";

let client: Db | undefined;

/**
 * Trusted server-side client using the secret key (bypasses RLS).
 * There is deliberately no browser client.
 */
export function getDb(): Db {
  if (!client) {
    const { url, secretKey } = readSupabaseEnv();
    client = createClient<Database>(url, secretKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
    });
  }
  return client;
}
