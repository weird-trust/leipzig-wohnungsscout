import { describe, expect, it } from "vitest";
import { basicAuthPassword, checkBasicAuth } from "@/lib/auth/basicAuth";

const header = (credentials: string) =>
  `Basic ${Buffer.from(credentials, "utf-8").toString("base64")}`;

describe("basicAuthPassword", () => {
  it("extracts the password and ignores the username", () => {
    expect(basicAuthPassword(header("irgendwer:geheim"))).toBe("geheim");
    expect(basicAuthPassword(header(":geheim"))).toBe("geheim");
  });

  it("keeps colons and UTF-8 in the password", () => {
    expect(basicAuthPassword(header("u:Grüße:123"))).toBe("Grüße:123");
  });

  it.each([
    ["no header", null],
    ["other scheme", "Bearer abc"],
    ["no colon", header("nurname")],
    ["invalid base64", "Basic ###"],
  ])("returns null for %s", (_, value) => {
    expect(basicAuthPassword(value)).toBeNull();
  });
});

describe("checkBasicAuth", () => {
  it("allows the correct password", () => {
    expect(checkBasicAuth(header("x:geheim"), "geheim")).toBe("allow");
  });

  it("denies a wrong or missing password", () => {
    expect(checkBasicAuth(header("x:falsch"), "geheim")).toBe("deny");
    expect(checkBasicAuth(header("x:geheim2"), "geheim")).toBe("deny");
    expect(checkBasicAuth(null, "geheim")).toBe("deny");
  });

  it("fails closed when no password is configured", () => {
    expect(checkBasicAuth(header("x:"), undefined)).toBe("misconfigured");
    expect(checkBasicAuth(header("x:"), "")).toBe("misconfigured");
    expect(checkBasicAuth(null, undefined)).toBe("misconfigured");
  });
});
