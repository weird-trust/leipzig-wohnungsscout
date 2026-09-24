export interface SupabaseEnv {
  url: string;
  secretKey: string;
}

type Env = Record<string, string | undefined>;

/**
 * Reads the server-side Supabase settings and fails with a clear message.
 * The secret key must never be exposed as NEXT_PUBLIC_*.
 */
export function readSupabaseEnv(env: Env = process.env): SupabaseEnv {
  const url = env.SUPABASE_URL?.trim();
  const secretKey = env.SUPABASE_SECRET_KEY?.trim();

  if (!url || !secretKey) {
    const missing = [];
    if (!url) missing.push("SUPABASE_URL");
    if (!secretKey) missing.push("SUPABASE_SECRET_KEY");
    throw new Error(
      `Missing environment variable(s): ${missing.join(", ")}. ` +
        "Copy .env.example to .env.local and fill them in.",
    );
  }

  if (secretKey.startsWith("sb_publishable_")) {
    throw new Error(
      "SUPABASE_SECRET_KEY contains a publishable key. Use the project's secret key (sb_secret_…).",
    );
  }
  if (env.NEXT_PUBLIC_SUPABASE_SECRET_KEY) {
    throw new Error(
      "NEXT_PUBLIC_SUPABASE_SECRET_KEY is set. The secret key must never be public; remove it.",
    );
  }

  return { url, secretKey };
}
