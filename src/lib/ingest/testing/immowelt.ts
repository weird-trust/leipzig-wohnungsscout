import { readFileSync } from "node:fs";
import type { IncomingEmail } from "@/lib/domain/email";
import { fixtureFileSchema, fixtureToIncomingEmail } from "@/lib/ingest/fixtureFile";
import { parseExposeUrl } from "@/lib/parsers/immowelt";

/**
 * Test helpers for Immowelt link resolution. Uses SYNTHETIC tracking tokens
 * only, laid into the structure of the reviewed real fixture. Test-only.
 */

export const EXPOSE_IDS = [
  "0fe5b1ed-db33-4796-bbd8-2c2ee9c9e459",
  "f2e06b10-a30a-4799-b472-374e5023223a",
  "bb8aa4d3-357f-4940-9232-e1bc74f095a3",
  "286a483b-704a-4cd4-b45c-e2603bdc0b25",
  "03a6cf24-7b46-4d3d-8dd8-0fb448ddf3a0",
  "baf7a139-5e15-488e-82d8-b939303bf33c",
] as const;

export const tracker = (token: string) => `https://click.by.immowelt.de/?qs=${token}`;
export const expose = (id: string) => `https://www.immowelt.de/expose/${id}`;

export function reviewedImmoweltEmail(): IncomingEmail {
  const file = fixtureFileSchema.parse(
    JSON.parse(readFileSync("fixtures/emails/immowelt/alert-01.json", "utf-8")),
  );
  return fixtureToIncomingEmail(file, new Date("2026-09-24T18:48:42.089Z"));
}

/**
 * The reviewed fixture turned back into "raw" form, mirroring the real
 * email's layout: every listing's expose URL becomes SYNTH-LISTING-<n>, and
 * other trackers precede each listing's price, title, rooms/area and location
 * lines as well as the Datenschutz/Abmelden footer links.
 */
export function syntheticRawImmoweltText(): string {
  let other = 0;
  let expectTitle = false;
  const otherTracker = () => `${tracker(`SYNTH-OTHER-${++other}`)} `;
  return reviewedImmoweltEmail()
    .text!.split("\n")
    .flatMap((line) => {
      const trimmed = line.replace(/\u00a0/g, " ").trim();
      const listing = parseExposeUrl(trimmed);
      if (listing) {
        const n = EXPOSE_IDS.indexOf(listing.sourceId as (typeof EXPOSE_IDS)[number]) + 1;
        return [line.replace(trimmed, tracker(`SYNTH-LISTING-${n}`))];
      }
      if (/Kaltmiete$/.test(trimmed)) {
        expectTitle = true;
        return [otherTracker(), line];
      }
      if (expectTitle && trimmed !== "") {
        expectTitle = false;
        return [otherTracker(), line];
      }
      const isContent =
        /Zimmer \. .+ m\u00b2$/.test(trimmed) || // rooms/area
        /,$/.test(trimmed) || // location (district line)
        trimmed === "Abmelden" ||
        trimmed.startsWith("Datenschutz");
      return isContent ? [otherTracker(), line] : [line];
    })
    .join("\n");
}

export interface FakeFetch {
  fetch: typeof fetch;
  /** qs values requested, in order. */
  requested: string[];
}

/** A fetch that answers per qs token: a Location to redirect to, or an error. */
export function fakeTracker(
  routes: Record<string, { location?: string; status?: number } | "network-error">,
): FakeFetch {
  const requested: string[] = [];
  const fetchImpl = (async (input: string | URL | Request, init?: RequestInit) => {
    if (init?.redirect !== "manual") throw new Error("resolver must use redirect: manual");
    const url = new URL(input instanceof Request ? input.url : input);
    const token = url.searchParams.get("qs") ?? "";
    requested.push(token);
    const route = routes[token];
    if (route === undefined) throw new Error(`unexpected request in test`);
    if (route === "network-error") throw new TypeError("fetch failed");
    return new Response(null, {
      status: route.status ?? 302,
      headers: route.location ? { location: route.location } : {},
    });
  }) as typeof fetch;
  return { fetch: fetchImpl, requested };
}

/** All six synthetic listing trackers redirect straight to their expose URL. */
export function allListingRoutes(): Record<string, { location: string }> {
  return Object.fromEntries(
    EXPOSE_IDS.map((id, index) => [`SYNTH-LISTING-${index + 1}`, { location: expose(id) }]),
  );
}
