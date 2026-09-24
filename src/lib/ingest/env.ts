export interface ResendEnv {
  apiKey: string;
  webhookSecret: string;
}

type Env = Record<string, string | undefined>;

/**
 * Reads the Resend settings when the webhook runs (never at build or import
 * time) and fails with a clear message.
 */
export function readResendEnv(env: Env = process.env): ResendEnv {
  const apiKey = env.RESEND_API_KEY?.trim();
  const webhookSecret = env.RESEND_WEBHOOK_SECRET?.trim();

  if (!apiKey || !webhookSecret) {
    const missing = [];
    if (!apiKey) missing.push("RESEND_API_KEY");
    if (!webhookSecret) missing.push("RESEND_WEBHOOK_SECRET");
    throw new Error(`Missing environment variable(s): ${missing.join(", ")}.`);
  }
  for (const name of ["NEXT_PUBLIC_RESEND_API_KEY", "NEXT_PUBLIC_RESEND_WEBHOOK_SECRET"]) {
    if (env[name]) throw new Error(`${name} is set. Resend secrets must never be public; remove it.`);
  }

  return { apiKey, webhookSecret };
}
