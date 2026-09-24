import { describe, expect, it } from "vitest";
import { parseFavoriteInput, parseStatusInput } from "@/lib/dashboard/actionInput";

const ID = "6F1C2C43-6C2A-4A55-9A52-0D3F3F4B2A11";

function form(entries: Record<string, string | Blob>): FormData {
  const data = new FormData();
  for (const [key, value] of Object.entries(entries)) data.append(key, value);
  return data;
}

describe("parseStatusInput", () => {
  it("accepts a valid id and status, normalizing the id", () => {
    expect(parseStatusInput(form({ id: ID, status: "viewing" }))).toEqual({
      ok: true,
      value: { id: ID.toLowerCase(), status: "viewing" },
    });
  });

  it.each([
    ["missing id", { status: "seen" }],
    ["non-uuid id", { id: "1; drop table", status: "seen" }],
    ["favorite as a status", { id: ID, status: "favorite" }],
    ["unknown status", { id: ID, status: "archived" }],
    ["missing status", { id: ID }],
    ["file instead of text", { id: ID, status: new Blob(["seen"]) }],
  ])("rejects %s", (_, entries) => {
    expect(parseStatusInput(form(entries)).ok).toBe(false);
  });

  it("ignores extra fields such as a favorite flag", () => {
    const result = parseStatusInput(form({ id: ID, status: "applied", favorite: "true" }));
    expect(result).toEqual({ ok: true, value: { id: ID.toLowerCase(), status: "applied" } });
  });
});

describe("parseFavoriteInput", () => {
  it.each([
    ["true", true],
    ["false", false],
  ])("parses favorite=%s", (value, expected) => {
    expect(parseFavoriteInput(form({ id: ID, favorite: value }))).toEqual({
      ok: true,
      value: { id: ID.toLowerCase(), isFavorite: expected },
    });
  });

  it.each([
    ["missing value", { id: ID }],
    ["loose truthy value", { id: ID, favorite: "1" }],
    ["invalid id", { id: "abc", favorite: "true" }],
  ])("rejects %s", (_, entries) => {
    expect(parseFavoriteInput(form(entries)).ok).toBe(false);
  });

  it("ignores a status field, so favoriting cannot change the status", () => {
    const result = parseFavoriteInput(form({ id: ID, favorite: "true", status: "rejected" }));
    expect(result).toEqual({ ok: true, value: { id: ID.toLowerCase(), isFavorite: true } });
  });
});
