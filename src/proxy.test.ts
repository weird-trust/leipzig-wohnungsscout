import { unstable_doesMiddlewareMatch } from "next/experimental/testing/server";
import { NextRequest } from "next/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { config, proxy } from "@/proxy";

const matches = (url: string) => unstable_doesMiddlewareMatch({ config, url });

function request(authorization?: string): NextRequest {
  return new NextRequest("http://localhost/", {
    headers: authorization ? { authorization } : {},
  });
}

const basic = (password: string) => `Basic ${Buffer.from(`scout:${password}`).toString("base64")}`;

describe("proxy matcher", () => {
  it.each(["/", "/?tab=favorites", "/apartments/abc", "/api/anything-else", "/api/email"])(
    "protects %s",
    (url) => {
      expect(matches(url)).toBe(true);
    },
  );

  it.each(["/api/email/incoming", "/_next/static/chunk.js", "/_next/image", "/favicon.ico"])(
    "leaves %s alone",
    (url) => {
      expect(matches(url)).toBe(false);
    },
  );

  it("only exempts the exact webhook path", () => {
    expect(matches("/api/email/incomingx")).toBe(true);
  });
});

describe("proxy", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("challenges requests without credentials", () => {
    vi.stubEnv("DASHBOARD_PASSWORD", "geheim");
    const response = proxy(request());
    expect(response.status).toBe(401);
    expect(response.headers.get("www-authenticate")).toMatch(/^Basic realm="Wohnungsscout"/);
  });

  it("rejects a wrong password", () => {
    vi.stubEnv("DASHBOARD_PASSWORD", "geheim");
    expect(proxy(request(basic("falsch"))).status).toBe(401);
  });

  it("lets the correct password through", () => {
    vi.stubEnv("DASHBOARD_PASSWORD", "geheim");
    const response = proxy(request(basic("geheim")));
    expect(response.status).toBe(200);
    expect(response.headers.get("x-middleware-next")).toBe("1");
  });

  it("fails closed without a configured password, in production too", () => {
    vi.stubEnv("DASHBOARD_PASSWORD", "");
    vi.stubEnv("NODE_ENV", "production");
    const response = proxy(request(basic("")));
    expect(response.status).toBe(503);
  });
});
