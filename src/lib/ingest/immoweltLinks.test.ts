import { describe, expect, it } from "vitest";
import {
  findListingTrackingLinks,
  ImmoweltResolutionError,
  parseTrackingUrl,
  resolveImmoweltListingLinks,
  resolveTrackingUrl,
} from "@/lib/ingest/immoweltLinks";
import {
  allListingRoutes,
  EXPOSE_IDS,
  expose,
  fakeTracker,
  reviewedImmoweltEmail,
  syntheticRawImmoweltText,
  tracker,
} from "@/lib/ingest/testing/immowelt";

const ID = EXPOSE_IDS[0];

async function errorOf(promise: Promise<unknown>): Promise<Error> {
  const error = await promise.then(
    () => null,
    (e: unknown) => e,
  );
  if (!(error instanceof Error)) throw new Error("expected a rejection");
  return error;
}

describe("parseTrackingUrl", () => {
  it("accepts exactly https://click.by.immowelt.de/?qs=<token>", () => {
    expect(parseTrackingUrl(tracker("SYNTH-1"))?.searchParams.get("qs")).toBe("SYNTH-1");
  });

  it.each([
    ["http", "http://click.by.immowelt.de/?qs=SYNTH-1"],
    ["other host", "https://www.immowelt.de/?qs=SYNTH-1"],
    ["look-alike domain", "https://click.by.immowelt.de.evil.example/?qs=SYNTH-1"],
    ["look-alike subdomain", "https://evilclick.by.immowelt.de/?qs=SYNTH-1"],
    ["credentials", "https://user:pw@click.by.immowelt.de/?qs=SYNTH-1"],
    ["explicit port", "https://click.by.immowelt.de:8443/?qs=SYNTH-1"],
    ["other path", "https://click.by.immowelt.de/redirect?qs=SYNTH-1"],
    ["missing qs", "https://click.by.immowelt.de/"],
    ["empty qs", "https://click.by.immowelt.de/?qs="],
    ["not a URL", "Mehr Informationen"],
  ])("rejects %s", (_, url) => {
    expect(parseTrackingUrl(url)).toBeNull();
  });
});

describe("resolveTrackingUrl", () => {
  it("returns the canonical expose URL from the redirect Location, without fetching it", async () => {
    const fake = fakeTracker({ "SYNTH-1": { location: expose(ID) } });
    expect(await resolveTrackingUrl(new URL(tracker("SYNTH-1")), fake)).toBe(expose(ID));
    expect(fake.requested).toEqual(["SYNTH-1"]); // the expose page itself is never requested
  });

  it("strips query and fragment from the canonical URL", async () => {
    const fake = fakeTracker({ "SYNTH-1": { location: `${expose(ID)}?utm_source=mail#bilder`, status: 301 } });
    expect(await resolveTrackingUrl(new URL(tracker("SYNTH-1")), fake)).toBe(expose(ID));
  });

  it("follows another valid tracker hop, including a relative Location", async () => {
    const fake = fakeTracker({
      "SYNTH-1": { location: "/?qs=SYNTH-HOP" }, // relative to click.by.immowelt.de
      "SYNTH-HOP": { location: expose(ID), status: 307 },
    });
    expect(await resolveTrackingUrl(new URL(tracker("SYNTH-1")), fake)).toBe(expose(ID));
    expect(fake.requested).toEqual(["SYNTH-1", "SYNTH-HOP"]);
  });

  it.each([
    ["unexpected redirect host", "https://www.example.com/landing"],
    ["arbitrary immowelt page", "https://www.immowelt.de/suche/leipzig"],
    ["malformed expose uuid", "https://www.immowelt.de/expose/not-a-uuid"],
    ["extra expose path", `${expose(ID)}/bilder`],
    ["relative expose path on the tracker host", `/expose/${ID}`],
    ["http expose", `http://www.immowelt.de/expose/${ID}`],
  ])("rejects an %s", async (_, location) => {
    const fake = fakeTracker({ "SYNTH-1": { location } });
    const error = await errorOf(resolveTrackingUrl(new URL(tracker("SYNTH-1")), fake));
    expect(error).toBeInstanceOf(ImmoweltResolutionError);
  });

  it("rejects a non-redirect response and a redirect without Location", async () => {
    const ok = fakeTracker({ "SYNTH-1": { status: 200 } });
    expect(await errorOf(resolveTrackingUrl(new URL(tracker("SYNTH-1")), ok))).toBeInstanceOf(
      ImmoweltResolutionError,
    );
    const empty = fakeTracker({ "SYNTH-1": { status: 302 } });
    expect(await errorOf(resolveTrackingUrl(new URL(tracker("SYNTH-1")), empty))).toBeInstanceOf(
      ImmoweltResolutionError,
    );
  });

  it("stops a redirect loop at the redirect limit", async () => {
    const fake = fakeTracker({ "SYNTH-LOOP": { location: tracker("SYNTH-LOOP") } });
    const error = await errorOf(resolveTrackingUrl(new URL(tracker("SYNTH-LOOP")), { ...fake, maxRedirects: 5 }));
    expect(error.message).toContain("too many redirects");
    expect(fake.requested).toHaveLength(5);
  });

  it("turns a network error into a safe error without the token", async () => {
    const fake = fakeTracker({ "SYNTH-SECRET-TOKEN": "network-error" });
    const error = await errorOf(resolveTrackingUrl(new URL(tracker("SYNTH-SECRET-TOKEN")), fake));
    expect(error.message).toBe("Immowelt listing redirect could not be resolved (network error)");
    expect(JSON.stringify({ message: error.message, cause: error.cause, stack: error.stack })).not.toContain(
      "SYNTH-SECRET-TOKEN",
    );
  });

  it("times out a hanging request with a safe error", async () => {
    const hanging = ((_: unknown, init?: RequestInit) =>
      new Promise((_, reject) => {
        init?.signal?.addEventListener("abort", () => reject(init.signal?.reason));
      })) as typeof fetch;
    const error = await errorOf(
      resolveTrackingUrl(new URL(tracker("SYNTH-SECRET-TOKEN")), { fetch: hanging, timeoutMs: 20 }),
    );
    expect(error.message).toBe("Immowelt listing redirect could not be resolved (timeout)");
    expect(error.message).not.toContain("SYNTH");
  });

  it("cancels the response body instead of reading it", async () => {
    let cancelled = false;
    const body = new ReadableStream({ cancel: () => void (cancelled = true) });
    const withBody = (async () =>
      new Response(body, { status: 302, headers: { location: expose(ID) } })) as typeof fetch;
    await resolveTrackingUrl(new URL(tracker("SYNTH-1")), { fetch: withBody });
    expect(cancelled).toBe(true);
  });
});

describe("findListingTrackingLinks / resolveImmoweltListingLinks", () => {
  it("finds only the tracker directly above each Mehr Informationen (6, not all trackers)", () => {
    const raw = syntheticRawImmoweltText();
    expect(raw.match(/click\.by\.immowelt\.de/g)?.length).toBeGreaterThan(6);
    expect(findListingTrackingLinks(raw).map((link) => link.url.searchParams.get("qs"))).toEqual(
      EXPOSE_IDS.map((_, index) => `SYNTH-LISTING-${index + 1}`),
    );
  });

  it("resolves exactly the six listing links and leaves every other tracker untouched", async () => {
    const raw = syntheticRawImmoweltText();
    const fake = fakeTracker(allListingRoutes());

    const { text, resolutions } = await resolveImmoweltListingLinks(raw, fake);

    expect(resolutions).toBe(6);
    expect(fake.requested).toHaveLength(6);
    expect(fake.requested.every((token) => token.startsWith("SYNTH-LISTING-"))).toBe(true);
    for (const id of EXPOSE_IDS) expect(text).toContain(`${expose(id)} \nMehr Informationen`);
    expect(text).not.toContain("SYNTH-LISTING");
    expect(text.match(/SYNTH-OTHER-\d+/g)).toEqual(raw.match(/SYNTH-OTHER-\d+/g)); // untouched
    // Nothing else changed: same lines except the six resolved ones.
    const before = raw.split("\n");
    const after = text.split("\n");
    expect(after).toHaveLength(before.length);
    expect(after.filter((line, i) => line !== before[i])).toHaveLength(6);
  });

  it("does not depend on blank-line counts", async () => {
    const text = [
      "1.199 € Kaltmiete",
      "Titel",
      tracker("SYNTH-A"),
      "",
      "   ",
      "\u00a0",
      " Mehr Informationen ",
      tracker("SYNTH-B"),
      "Mehr Informationen",
    ].join("\n");
    const fake = fakeTracker({ "SYNTH-A": { location: expose(EXPOSE_IDS[0]) }, "SYNTH-B": { location: expose(EXPOSE_IDS[1]) } });
    const result = await resolveImmoweltListingLinks(text, fake);
    expect(result.resolutions).toBe(2);
    expect(result.text).toContain(expose(EXPOSE_IDS[0]));
    expect(result.text).toContain(expose(EXPOSE_IDS[1]));
  });

  it("makes zero requests for the already resolved reviewed fixture", async () => {
    const text = reviewedImmoweltEmail().text!;
    const fake = fakeTracker({});
    expect(await resolveImmoweltListingLinks(text, fake)).toEqual({ text, resolutions: 0 });
    expect(fake.requested).toEqual([]);
  });

  it("handles a mix of resolved and unresolved listings", async () => {
    const raw = syntheticRawImmoweltText().replace(tracker("SYNTH-LISTING-2"), expose(EXPOSE_IDS[1]));
    const fake = fakeTracker(allListingRoutes());
    const { resolutions, text } = await resolveImmoweltListingLinks(raw, fake);
    expect(resolutions).toBe(5);
    expect(fake.requested).not.toContain("SYNTH-LISTING-2");
    for (const id of EXPOSE_IDS) expect(text).toContain(expose(id));
  });

  it("requests an identical tracking link only once", async () => {
    const text = [tracker("SYNTH-SAME"), "Mehr Informationen", "", tracker("SYNTH-SAME"), "Mehr Informationen"].join("\n");
    const fake = fakeTracker({ "SYNTH-SAME": { location: expose(ID) } });
    const result = await resolveImmoweltListingLinks(text, fake);
    expect(fake.requested).toEqual(["SYNTH-SAME"]);
    expect(result.text.split(expose(ID)).length - 1).toBe(2);
  });

  it("fails as a whole when one of six resolutions fails, returning no partial text", async () => {
    const routes = { ...allListingRoutes(), "SYNTH-LISTING-4": "network-error" as const };
    const error = await errorOf(resolveImmoweltListingLinks(syntheticRawImmoweltText(), fakeTracker(routes)));
    expect(error).toBeInstanceOf(ImmoweltResolutionError);
    expect(error.message).not.toContain("SYNTH");
  });

  it("fails instead of silently dropping a listing with an unsupported link", async () => {
    const text = ["https://click.by.immowelt.de/other?qs=SYNTH-1", "Mehr Informationen"].join("\n");
    const fake = fakeTracker({});
    const error = await errorOf(resolveImmoweltListingLinks(text, fake));
    expect(error.message).toContain("unsupported listing link");
    expect(fake.requested).toEqual([]);
  });
});
