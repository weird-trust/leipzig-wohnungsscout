import { createHash, timingSafeEqual } from "node:crypto";

/**
 * HTTP Basic Auth for the single-user dashboard. The username is ignored;
 * only DASHBOARD_PASSWORD is checked. Without a configured password access
 * is always refused (fail closed), in every environment.
 */

export type AuthDecision = "allow" | "deny" | "misconfigured";

export const BASIC_AUTH_REALM = "Wohnungsscout";

/** Password part of an "Authorization: Basic …" header, or null. */
export function basicAuthPassword(header: string | null): string | null {
  const match = header?.match(/^Basic\s+([A-Za-z0-9+/=]+)\s*$/i);
  if (!match) return null;

  let decoded: string;
  try {
    const bytes = Uint8Array.from(atob(match[1]), (char) => char.charCodeAt(0));
    decoded = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    return null;
  }
  const separator = decoded.indexOf(":");
  return separator === -1 ? null : decoded.slice(separator + 1);
}

/** Constant-time comparison; hashing first makes lengths equal. */
function safeEqual(a: string, b: string): boolean {
  const digest = (value: string) => createHash("sha256").update(value).digest();
  return timingSafeEqual(digest(a), digest(b));
}

export function checkBasicAuth(
  header: string | null,
  configuredPassword: string | undefined,
): AuthDecision {
  if (!configuredPassword) return "misconfigured";
  const password = basicAuthPassword(header);
  return password !== null && safeEqual(password, configuredPassword) ? "allow" : "deny";
}
