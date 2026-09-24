import { describe, expect, it } from "vitest";
import { readResendEnv } from "@/lib/ingest/env";
import { fixtureFileSchema, fixtureToIncomingEmail, incomingEmailToFixture } from "@/lib/ingest/fixtureFile";

describe("readResendEnv", () => {
  it("returns trimmed values", () => {
    expect(readResendEnv({ RESEND_API_KEY: " re_1 ", RESEND_WEBHOOK_SECRET: "whsec_x" })).toEqual({
      apiKey: "re_1",
      webhookSecret: "whsec_x",
    });
  });

  it("names every missing variable", () => {
    expect(() => readResendEnv({})).toThrow(
      "Missing environment variable(s): RESEND_API_KEY, RESEND_WEBHOOK_SECRET.",
    );
  });

  it("refuses public copies of the secrets", () => {
    expect(() =>
      readResendEnv({
        RESEND_API_KEY: "re_1",
        RESEND_WEBHOOK_SECRET: "whsec_x",
        NEXT_PUBLIC_RESEND_API_KEY: "re_1",
      }),
    ).toThrow("must never be public");
  });
});

describe("fixture files", () => {
  const fixture = fixtureFileSchema.parse({
    from: "Ich <ich@example.org>",
    subject: "Neue Wohnungen",
    text: "Angebot",
    html: null,
  });

  it("derives a deterministic provider id so re-ingesting is a duplicate", () => {
    const now = new Date("2026-09-24T08:00:00Z");
    const a = fixtureToIncomingEmail(fixture, now);
    const b = fixtureToIncomingEmail(fixture, now);
    expect(a.providerMessageId).toMatch(/^fixture:[0-9a-f]{16}$/);
    expect(a.providerMessageId).toBe(b.providerMessageId);
    expect(a.to).toEqual([]);
    expect(a.receivedAt).toEqual(now);
  });

  it("round-trips a captured email", () => {
    const email = {
      providerMessageId: "email_1",
      receivedAt: new Date("2026-09-24T08:00:00.000Z"),
      from: "a@example.org",
      to: ["b@example.org"],
      subject: null,
      text: "x",
      html: "<p>x</p>",
    };
    const file = fixtureFileSchema.parse(JSON.parse(JSON.stringify(incomingEmailToFixture(email))));
    expect(fixtureToIncomingEmail(file, new Date(0))).toEqual(email);
  });

  it("rejects malformed fixtures", () => {
    expect(fixtureFileSchema.safeParse({ from: 1, subject: null, text: null, html: null }).success).toBe(false);
    expect(fixtureFileSchema.safeParse({ from: null, subject: null, text: null }).success).toBe(false);
  });
});
