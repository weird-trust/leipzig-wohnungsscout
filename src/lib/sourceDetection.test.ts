import { describe, expect, it } from "vitest";
import type { IncomingEmail } from "@/lib/domain/email";
import {
  detectSource,
  linkHostnames,
  senderDomain,
  sourceForHostname,
} from "@/lib/sourceDetection";

// Synthetic emails: only domains are realistic, not the platforms' formats.
function email(overrides: Partial<IncomingEmail>): IncomingEmail {
  return {
    providerMessageId: "email-1",
    to: [],
    from: null,
    subject: null,
    text: null,
    html: null,
    receivedAt: new Date("2026-09-24T08:00:00Z"),
    ...overrides,
  };
}

describe("sourceForHostname", () => {
  it.each([
    ["immobilienscout24.de", "immoscout"],
    ["www.immobilienscout24.de", "immoscout"],
    ["immowelt.de", "immowelt"],
    ["mail.immowelt.de", "immowelt"],
    ["www.kleinanzeigen.de", "kleinanzeigen"],
    ["www.wg-gesucht.de", "wg-gesucht"],
    ["LWB.DE", "lwb"],
    ["suchauftrag.ohne-makler.net", "ohne-makler"],
    ["www.ohne-makler.net", "ohne-makler"],
  ] as const)("%s → %s", (hostname, expected) => {
    expect(sourceForHostname(hostname)).toBe(expected);
  });

  it.each(["notimmowelt.de", "immowelt.de.example.com", "example.com", "lwb.com", "ohne-makler.net.example.com", "ohnemakler.net"])(
    "does not match %s",
    (hostname) => {
      expect(sourceForHostname(hostname)).toBeNull();
    },
  );
});

describe("senderDomain", () => {
  it.each([
    ["Immowelt <alert@mail.immowelt.de>", "mail.immowelt.de"],
    ["alert@immowelt.de", "immowelt.de"],
    ["  ALERT@Immowelt.DE ", "immowelt.de"],
    ["Kein Absender", null],
  ])("%j → %j", (from, expected) => {
    expect(senderDomain(from)).toBe(expected);
  });
});

describe("linkHostnames", () => {
  it("finds hostnames in plain text and HTML, ignoring ports and paths", () => {
    const body =
      'Neue Wohnung: https://www.immowelt.de/expose/abc?x=1 ' +
      '<a href="http://Link.Example.com:8080/track">hier</a>';
    expect(linkHostnames(body)).toEqual(["www.immowelt.de", "link.example.com"]);
  });
});

describe("detectSource", () => {
  it("uses the sender domain first", () => {
    const result = detectSource(
      email({
        from: "Suchauftrag <noreply@immowelt.de>",
        text: "https://www.kleinanzeigen.de/s-anzeige/1",
      }),
    );
    expect(result).toEqual({ source: "immowelt", matchedBy: "sender" });
  });

  it("falls back to links for forwarded alerts", () => {
    const result = detectSource(
      email({
        from: "Ich <ich@example.org>",
        subject: "Fwd: Neue Wohnungen in Leipzig",
        html:
          '<a href="https://www.immobilienscout24.de/expose/1">3 Zimmer, 98 m²</a>' +
          '<a href="https://www.immobilienscout24.de/expose/2">4 Zimmer, 110 m²</a>' +
          '<a href="https://www.lwb.de/impressum">LWB</a>',
      }),
    );
    expect(result).toEqual({ source: "immoscout", matchedBy: "links" });
  });

  it("counts links from both text and HTML bodies", () => {
    const result = detectSource(
      email({
        text: "https://www.wg-gesucht.de/1 https://www.lwb.de/2",
        html: '<a href="https://www.wg-gesucht.de/1">Angebot</a>',
      }),
    );
    expect(result.source).toBe("wg-gesucht");
  });

  it("returns other when platforms tie", () => {
    const result = detectSource(
      email({ text: "https://www.immowelt.de/1 und https://www.kleinanzeigen.de/2" }),
    );
    expect(result).toEqual({ source: "other", matchedBy: "none" });
  });

  it("returns other for unknown senders without platform links", () => {
    const result = detectSource(
      email({ from: "Hausverwaltung <info@example.com>", text: "Besichtigung am Montag" }),
    );
    expect(result).toEqual({ source: "other", matchedBy: "none" });
  });

  it("returns other for an empty email", () => {
    expect(detectSource(email({})).source).toBe("other");
  });
});
