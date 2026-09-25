import { parseExposeUrl } from "@/lib/parsers/immowelt";

/**
 * Resolves Immowelt's personalized listing links before parsing.
 *
 * Real alerts only contain https://click.by.immowelt.de/?qs=<token> links.
 * Only the one directly above each "Mehr Informationen" identifies a listing;
 * it is resolved by following redirect Location headers (never the final
 * page) until a canonical https://www.immowelt.de/expose/<uuid> appears. All
 * other tracking links are left alone.
 *
 * Privacy: the qs token is personal. It is never logged, never part of an
 * error message, and the resolved text is not persisted.
 */

const TRACKING_HOST = "click.by.immowelt.de";
const ANCHOR = "Mehr Informationen";
const UNICODE_SPACES = /[\u00a0\u1680\u2000-\u200a\u202f\u205f\u3000]/g;

export const DEFAULT_TIMEOUT_MS = 8000;
export const DEFAULT_MAX_REDIRECTS = 5;

export interface ResolverOptions {
  fetch: typeof fetch;
  timeoutMs?: number;
  maxRedirects?: number;
}

/** A listing link could not be resolved. The message never contains the URL. */
export class ImmoweltResolutionError extends Error {
  constructor(reason: string) {
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
  for (let hop = 0; hop < maxRedirects; hop++) {
    const response = await requestOnce(current, options);
    // Only the headers matter; never read the body.
    await response.body?.cancel().catch(() => undefined);

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
    const tracker = parseTrackingUrl(next.href);
    if (!tracker) throw new ImmoweltResolutionError("unexpected redirect destination");
    current = tracker;
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
      [...unique].map(async ([href, url]) => [href, await resolveTrackingUrl(url, options)] as const),
    ),
  );

  const lines = text.split("\n");
  for (const link of links) {
    lines[link.line] = lines[link.line].replace(link.raw, resolved.get(link.url.href)!);
  }
  return { text: lines.join("\n"), resolutions: unique.size };
}
