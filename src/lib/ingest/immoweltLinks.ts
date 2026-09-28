import { parseExposeUrl } from "@/lib/parsers/immowelt";

/**
 * Resolves Immowelt's personalized listing links before parsing.
 *
 * Real alerts only contain https://click.by.immowelt.de/?qs=<token> links.
 * Only the one directly above each "Mehr Informationen" identifies a listing;
 * it is resolved by following redirect Location headers (never the final
 * page) until a canonical https://www.immowelt.de/expose/<id> appears. All
 * other tracking links are left alone.
 *
 * Evidenced chains: tracker → expose, and tracker → /wl-cdp/<ID> → expose.
 * A wl-cdp URL is only an intermediate hop: it is never the result, and the
 * Location it answers with must be the canonical expose URL.
 *
 * Privacy: the qs token is personal. It is never logged, never part of an
 * error message, and the resolved text is not persisted.
 */

const TRACKING_HOST = "click.by.immowelt.de";
const LISTING_HOST = "www.immowelt.de";
const WL_CDP_PATH = /^\/wl-cdp\/[0-9a-z]{12}$/i;
const ANCHOR = "Mehr Informationen";
const UNICODE_SPACES = /[\u00a0\u1680\u2000-\u200a\u202f\u205f\u3000]/g;

export const DEFAULT_TIMEOUT_MS = 8000;
export const DEFAULT_MAX_REDIRECTS = 5;

export interface ResolverOptions {
  fetch: typeof fetch;
  timeoutMs?: number;
  maxRedirects?: number;
  /**
   * Development-only diagnostics (see scripts/ingest-fixture.ts
   * --debug-network). Receives only sanitized data, never a URL.
   */
  onHop?: (hop: HopDiagnostic) => void;
}

/** Where a URL points, without ids, query, fragment or unknown hostnames. */
export interface SanitizedDestination {
  host: typeof TRACKING_HOST | typeof LISTING_HOST | "other";
  path: "/" | "/wl-cdp/*" | "/expose/*" | "/other";
}

/** One resolver request, sanitized. */
export interface HopDiagnostic {
  /** 1-based listing number within the email (set by resolveImmoweltListingLinks). */
  listing?: number;
  hop: number;
  request: SanitizedDestination;
  /** HTTP status, or why no response arrived. */
  status: number | "timeout" | "network error";
  /** The Location header's destination (sanitized); "invalid" if unparsable, null if absent. */
  location: SanitizedDestination | "invalid" | null;
}

/** A listing link could not be resolved. The message never contains the URL. */
export class ImmoweltResolutionError extends Error {
  constructor(readonly reason: string) {
    super(`Immowelt listing redirect could not be resolved (${reason})`);
    this.name = "ImmoweltResolutionError";
  }
}

/** Exactly https://click.by.immowelt.de/?qs=<non-empty>, nothing looser. */
export function parseTrackingUrl(value: string): URL | null {
  let url: URL;
  try {
    url = new URL(value.trim());
  } catch {
    return null;
  }
  const valid =
    url.protocol === "https:" &&
    url.hostname === TRACKING_HOST &&
    url.port === "" &&
    url.username === "" &&
    url.password === "" &&
    url.pathname === "/" &&
    (url.searchParams.get("qs") ?? "") !== "";
  return valid ? url : null;
}

/**
 * Exactly https://www.immowelt.de/wl-cdp/<12 ASCII letters/digits>, the
 * evidenced intermediate listing route. Query and fragment are ignored.
 */
export function parseWlCdpUrl(value: string): URL | null {
  let url: URL;
  try {
    url = new URL(value.trim());
  } catch {
    return null;
  }
  const valid =
    url.protocol === "https:" &&
    url.hostname === LISTING_HOST &&
    url.port === "" &&
    url.username === "" &&
    url.password === "" &&
    WL_CDP_PATH.test(url.pathname);
  return valid ? url : null;
}

/** Reduces a URL to a known host and a path class; ids and everything else are dropped. */
export function sanitizeDestination(url: URL): SanitizedDestination {
  if (url.hostname === TRACKING_HOST) {
    return { host: TRACKING_HOST, path: url.pathname === "/" ? "/" : "/other" };
  }
  if (url.hostname === LISTING_HOST) {
    const path = url.pathname.startsWith("/wl-cdp/")
      ? "/wl-cdp/*"
      : url.pathname.startsWith("/expose/")
        ? "/expose/*"
        : "/other";
    return { host: LISTING_HOST, path };
  }
  return { host: "other", path: "/other" };
}

/** "listing 2 hop 2: www.immowelt.de /wl-cdp/* -> 403" (+ a sanitized location line). */
export function formatHopDiagnostic(hop: HopDiagnostic): string[] {
  const prefix = hop.listing === undefined ? "" : `listing ${hop.listing} `;
  const lines = [`${prefix}hop ${hop.hop}: ${hop.request.host} ${hop.request.path} -> ${hop.status}`];
  if (hop.location === "invalid") lines.push("  location -> invalid");
  else if (hop.location) lines.push(`  location -> ${hop.location.host} ${hop.location.path}`);
  return lines;
}

async function requestOnce(url: URL, options: ResolverOptions): Promise<Response> {
  try {
    return await options.fetch(url, {
      method: "GET",
      redirect: "manual",
      signal: AbortSignal.timeout(options.timeoutMs ?? DEFAULT_TIMEOUT_MS),
    });
  } catch (error) {
    const timedOut = error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError");
    // Deliberately no `cause`: network errors can embed the requested URL.
    throw new ImmoweltResolutionError(timedOut ? "timeout" : "network error");
  }
}

/**
 * Follows the tracker's redirects (at most maxRedirects hops, manual mode)
 * and returns the canonical expose URL as soon as a Location points to one.
 */
export async function resolveTrackingUrl(tracking: URL, options: ResolverOptions): Promise<string> {
  const maxRedirects = options.maxRedirects ?? DEFAULT_MAX_REDIRECTS;
  let current = tracking;
  let atWlCdp = false;
  for (let hop = 0; hop < maxRedirects; hop++) {
    let response: Response;
    try {
      response = await requestOnce(current, options);
    } catch (error) {
      options.onHop?.({
        hop: hop + 1,
        request: sanitizeDestination(current),
        status: error instanceof ImmoweltResolutionError && error.reason === "timeout" ? "timeout" : "network error",
        location: null,
      });
      throw error;
    }
    // Only the headers matter; never read the body.
    await response.body?.cancel().catch(() => undefined);
    if (options.onHop) {
      const raw = response.headers.get("location");
      let location: HopDiagnostic["location"] = null;
      if (raw) {
        try {
          location = sanitizeDestination(new URL(raw, current));
        } catch {
          location = "invalid";
        }
      }
      options.onHop({ hop: hop + 1, request: sanitizeDestination(current), status: response.status, location });
    }

    if (response.status < 300 || response.status >= 400) {
      throw new ImmoweltResolutionError(`unexpected status ${response.status}`);
    }
    const location = response.headers.get("location");
    if (!location) throw new ImmoweltResolutionError("redirect without location");

    let next: URL;
    try {
      next = new URL(location, current);
    } catch {
      throw new ImmoweltResolutionError("invalid redirect location");
    }

    const expose = parseExposeUrl(next.href);
    if (expose) return expose.sourceUrl;
    // After a wl-cdp hop, only the canonical expose URL is accepted.
    const hopTarget: URL | null = atWlCdp ? null : (parseTrackingUrl(next.href) ?? parseWlCdpUrl(next.href));
    if (!hopTarget) throw new ImmoweltResolutionError("unexpected redirect destination");
    atWlCdp = hopTarget.hostname === LISTING_HOST;
    current = hopTarget;
  }
  throw new ImmoweltResolutionError("too many redirects");
}

function normalize(line: string): string {
  return line.replace(UNICODE_SPACES, " ").trim();
}

interface ListingLink {
  /** Index of the link line. */
  line: number;
  /** The URL text exactly as it appears in that line. */
  raw: string;
  url: URL;
}

/**
 * Tracking links that identify listings: the previous non-empty line before
 * each exact "Mehr Informationen". Already canonical expose URLs are skipped.
 * Any other URL in that position would silently drop a listing, so it fails.
 */
export function findListingTrackingLinks(text: string): ListingLink[] {
  const lines = text.split("\n");
  const links: ListingLink[] = [];
  lines.forEach((line, index) => {
    if (normalize(line) !== ANCHOR) return;
    let previous = index - 1;
    while (previous >= 0 && normalize(lines[previous]) === "") previous--;
    if (previous < 0) return;
    const candidate = normalize(lines[previous]);
    if (!/^https?:\/\//i.test(candidate) || parseExposeUrl(candidate)) return;
    const url = parseTrackingUrl(candidate);
    if (!url) throw new ImmoweltResolutionError("unsupported listing link");
    links.push({ line: previous, raw: candidate, url });
  });
  return links;
}

/**
 * Replaces each listing tracking link with its canonical expose URL. All or
 * nothing: if any resolution fails, this throws and returns no partial text.
 * Identical tracking links are requested once.
 */
export async function resolveImmoweltListingLinks(
  text: string,
  options: ResolverOptions,
): Promise<{ text: string; resolutions: number }> {
  const links = findListingTrackingLinks(text);
  if (links.length === 0) return { text, resolutions: 0 };

  const unique = new Map(links.map((link) => [link.url.href, link.url]));
  const resolved = new Map(
    await Promise.all(
      [...unique].map(async ([href, url], index) => {
        const onHop = options.onHop;
        const withListing = onHop && { ...options, onHop: (hop: HopDiagnostic) => onHop({ ...hop, listing: index + 1 }) };
        return [href, await resolveTrackingUrl(url, withListing || options)] as const;
      }),
    ),
  );

  const lines = text.split("\n");
  for (const link of links) {
    lines[link.line] = lines[link.line].replace(link.raw, resolved.get(link.url.href)!);
  }
  return { text: lines.join("\n"), resolutions: unique.size };
}
