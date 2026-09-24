import { describe, expect, it } from "vitest";
import { readSupabaseEnv } from "@/lib/db/env";

describe("readSupabaseEnv", () => {
  it("returns trimmed values", () => {
    expect(
      readSupabaseEnv({
        SUPABASE_URL: " https://example.supabase.co ",
        SUPABASE_SECRET_KEY: "sb_secret_abc",
      }),
    ).toEqual({ url: "https://example.supabase.co", secretKey: "sb_secret_abc" });
  });

  it("names every missing variable", () => {
    expect(() => readSupabaseEnv({})).toThrow(
      "Missing environment variable(s): SUPABASE_URL, SUPABASE_SECRET_KEY",
    );
    expect(() =>
      readSupabaseEnv({ SUPABASE_URL: "https://example.supabase.co", SUPABASE_SECRET_KEY: " " }),
    ).toThrow("Missing environment variable(s): SUPABASE_SECRET_KEY");
  });

  it("rejects a publishable key in place of the secret key", () => {
    expect(() =>
      readSupabaseEnv({
        SUPABASE_URL: "https://example.supabase.co",
        SUPABASE_SECRET_KEY: "sb_publishable_abc",
      }),
    ).toThrow("publishable key");
  });

  it("refuses to run with a public copy of the secret key", () => {
    expect(() =>
      readSupabaseEnv({
        SUPABASE_URL: "https://example.supabase.co",
        SUPABASE_SECRET_KEY: "sb_secret_abc",
        NEXT_PUBLIC_SUPABASE_SECRET_KEY: "sb_secret_abc",
      }),
    ).toThrow("must never be public");
  });
});
