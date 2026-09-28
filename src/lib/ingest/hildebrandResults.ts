import { DEFAULT_TIMEOUT_MS } from "@/lib/ingest/immoweltLinks";

/**
 * Fetches a Hildebrand & Partner search-results page for the pure parser
 * (src/lib/parsers/hildebrandPartner.ts). The URL must already have passed
 * `findResultsLink()` / `parseResultsUrl()` there.
 *
 * Privacy: the URL carries the search agent's `confirm` credential. It is
 * never logged, never part of an error message, never stored anywhere new
 * and never an apartment's sourceUrl. The fetched HTML is not persisted.
 */

/** WP pages here are ~70 KB; anything far bigger is not a results page. */
const MAX_PAGE_LENGTH = 2_000_000;

export interface PageFetchOptions {
  fetch: typeof fetch;
  timeoutMs?: number;
}

/** The results page could not be fetched. The message never contains the URL. */
export class HildebrandFetchError extends Error {
  constructor(readonly reason: string) {
    super(`Hildebrand search results could not be fetched (${reason})`);
    this.name = "HildebrandFetchError";
  }
}

/**
 * GETs the validated results URL with the default server-side fetch (no
 * custom User-Agent). Redirects are not followed: none is expected, and one
 * would leave the validated URL. Requires a 2xx text/html response.
 */
export async function fetchResultsPage(url: URL, options: PageFetchOptions): Promise<string> {
  let response: Response;
  try {
    response = await options.fetch(url, {
      method: "GET",
      redirect: "manual",
      signal: AbortSignal.timeout(options.timeoutMs ?? DEFAULT_TIMEOUT_MS),
    });
  } catch (error) {
    const timedOut = error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError");
    // Deliberately no `cause`: network errors can embed the requested URL.
    throw new HildebrandFetchError(timedOut ? "timeout" : "network error");
  }

  const discard = () => response.body?.cancel().catch(() => undefined);
  if (response.status < 200 || response.status >= 300) {
    await discard();
    throw new HildebrandFetchError(`unexpected status ${response.status}`);
  }
  if (!/^text\/html\b/i.test(response.headers.get("content-type") ?? "")) {
    await discard();
    throw new HildebrandFetchError("unexpected content type");
  }

  let html: string;
  try {
    html = await response.text();
  } catch {
    throw new HildebrandFetchError("network error");
  }
  if (html.length > MAX_PAGE_LENGTH) throw new HildebrandFetchError("response too large");
  return html;
}
