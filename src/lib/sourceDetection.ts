import type { Source } from "@/lib/domain/apartment";
import type { IncomingEmail } from "@/lib/domain/email";

/**
 * Public platform domains. A hostname matches a domain exactly or as a
 * subdomain (e.g. "mail.immowelt.de" matches "immowelt.de").
 * Verify against real fixtures before relying on sender addresses.
 */
export const SOURCE_DOMAINS = {
  immoscout: ["immobilienscout24.de", "immoscout24.de"],
  immowelt: ["immowelt.de"],
  kleinanzeigen: ["kleinanzeigen.de"],
  "wg-gesucht": ["wg-gesucht.de"],
  lwb: ["lwb.de"],
  // Alerts come from suchauftrag.ohne-makler.net; listings are on www.ohne-makler.net.
  "ohne-makler": ["ohne-makler.net"],
} as const satisfies Record<Exclude<Source, "other">, readonly string[]>;

type PlatformSource = keyof typeof SOURCE_DOMAINS;

export interface SourceDetection {
  source: Source;
  matchedBy: "sender" | "links" | "none";
}

export function sourceForHostname(hostname: string): PlatformSource | null {
  const host = hostname.toLowerCase().replace(/\.$/, "");
  for (const [source, domains] of Object.entries(SOURCE_DOMAINS) as [
    PlatformSource,
    readonly string[],
  ][]) {
    if (domains.some((domain) => host === domain || host.endsWith(`.${domain}`))) {
      return source;
    }
  }
  return null;
}

/** "Immowelt <alert@mail.immowelt.de>" → "mail.immowelt.de" */
export function senderDomain(from: string): string | null {
  const address = from.match(/<([^>]+)>/)?.[1] ?? from;
  const domain = address.trim().match(/@([^@\s>]+)$/)?.[1];
  return domain ? domain.toLowerCase() : null;
}

/** Hostnames of all http(s) links in plain text or HTML. */
export function linkHostnames(body: string): string[] {
  return [...body.matchAll(/https?:\/\/([^\s/?#"'<>]+)/gi)].map((match) =>
    match[1]
      .replace(/^[^@]*@/, "")
      .replace(/:\d+$/, "")
      .toLowerCase(),
  );
}

/**
 * Sender domain first; otherwise the platform most links point to (covers
 * forwarded alerts, where the sender is the forwarding mailbox). Ties and
 * unknown domains give "other".
 */
export function detectSource(email: IncomingEmail): SourceDetection {
  const fromDomain = email.from ? senderDomain(email.from) : null;
  const fromSource = fromDomain ? sourceForHostname(fromDomain) : null;
  if (fromSource) return { source: fromSource, matchedBy: "sender" };

  const counts = new Map<PlatformSource, number>();
  for (const body of [email.text, email.html]) {
    if (!body) continue;
    for (const hostname of linkHostnames(body)) {
      const source = sourceForHostname(hostname);
      if (source) counts.set(source, (counts.get(source) ?? 0) + 1);
    }
  }

  const ranked = [...counts.entries()].sort((a, b) => b[1] - a[1]);
  const [best, runnerUp] = ranked;
  if (best && (!runnerUp || best[1] > runnerUp[1])) {
    return { source: best[0], matchedBy: "links" };
  }
  return { source: "other", matchedBy: "none" };
}
