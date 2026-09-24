import { describe, expect, it } from "vitest";
import type { NewInboundEmail } from "@/lib/domain/email";
import {
  createInboundEmail,
  findEmailByProviderMessageId,
  updateEmailParseResult,
} from "@/lib/db/emails";
import { DbError } from "@/lib/db/errors";
import { callArgs, createFakeDb } from "@/lib/db/testing/fakeDb";
import { emailRow } from "@/lib/db/testing/rows";

const incoming: NewInboundEmail = {
  providerMessageId: "msg-1",
  detectedSource: "other",
  from: "Suchauftrag <alert@example.com>",
  to: ["wohnungen@inbound.example.com"],
  subject: "Neue Wohnungen",
  text: "3-Zimmer-Wohnung in Gohlis",
  html: null,
  receivedAt: new Date("2026-09-20T09:59:00Z"),
};

const uniqueViolation = { code: "23505", message: "duplicate key value" };

describe("createInboundEmail", () => {
  it("inserts a new email and reports created = true", async () => {
    const { db, queries } = createFakeDb([{ data: emailRow(), error: null }]);

    const result = await createInboundEmail(db, incoming);

    expect(result.created).toBe(true);
    expect(result.email.providerMessageId).toBe("msg-1");
    expect(result.email.parseStatus).toBe("pending");
    expect(queries).toHaveLength(1);
    expect(callArgs(queries[0], "insert")?.[0]).toMatchObject({
      provider_message_id: "msg-1",
    });
  });

  it("returns the existing email on a duplicate provider message id", async () => {
    const existing = emailRow({ parse_status: "parsed", parser_version: "generic@0.1.0" });
    const { db, queries } = createFakeDb([
      { data: null, error: uniqueViolation },
      { data: existing, error: null },
    ]);

    const result = await createInboundEmail(db, incoming);

    expect(result.created).toBe(false);
    expect(result.email.parseStatus).toBe("parsed");
    expect(callArgs(queries[1], "eq")).toEqual(["provider_message_id", "msg-1"]);
  });

  it("fails if the duplicate cannot be found afterwards", async () => {
    const { db } = createFakeDb([
      { data: null, error: uniqueViolation },
      { data: null, error: null },
    ]);

    await expect(createInboundEmail(db, incoming)).rejects.toThrow(DbError);
  });

  it("rethrows other database errors", async () => {
    const { db, queries } = createFakeDb([
      { data: null, error: { code: "23514", message: "check constraint" } },
    ]);

    await expect(createInboundEmail(db, incoming)).rejects.toThrow(
      "createInboundEmail failed: check constraint",
    );
    expect(queries).toHaveLength(1);
  });
});

describe("findEmailByProviderMessageId", () => {
  it("returns null when nothing matches", async () => {
    const { db } = createFakeDb([{ data: null, error: null }]);
    expect(await findEmailByProviderMessageId(db, "unbekannt")).toBeNull();
  });
});

describe("updateEmailParseResult", () => {
  it("writes only the parse fields for the given email", async () => {
    const { db, queries } = createFakeDb([
      { data: emailRow({ parse_status: "unrecognized", parser_version: "generic@0.1.0" }), error: null },
    ]);

    const email = await updateEmailParseResult(db, "email-id", {
      parseStatus: "unrecognized",
      parserVersion: "generic@0.1.0",
      parseError: null,
    });

    expect(email.parseStatus).toBe("unrecognized");
    expect(callArgs(queries[0], "update")?.[0]).toEqual({
      parse_status: "unrecognized",
      parser_version: "generic@0.1.0",
      parse_error: null,
    });
    expect(callArgs(queries[0], "eq")).toEqual(["id", "email-id"]);
  });
});
