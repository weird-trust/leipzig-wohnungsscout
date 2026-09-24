import { NextResponse, type NextRequest } from "next/server";
import { BASIC_AUTH_REALM, checkBasicAuth } from "@/lib/auth/basicAuth";

/** Basic Auth in front of everything except the inbound email webhook and static assets. */
export function proxy(request: NextRequest): NextResponse {
  const decision = checkBasicAuth(
    request.headers.get("authorization"),
    process.env.DASHBOARD_PASSWORD,
  );

  if (decision === "allow") return NextResponse.next();

  if (decision === "misconfigured") {
    return new NextResponse(
      "DASHBOARD_PASSWORD is not set. Access is refused until it is configured (see .env.example).",
      { status: 503, headers: { "Content-Type": "text/plain; charset=utf-8" } },
    );
  }

  return new NextResponse("Authentication required.", {
    status: 401,
    headers: {
      "WWW-Authenticate": `Basic realm="${BASIC_AUTH_REALM}", charset="UTF-8"`,
      "Content-Type": "text/plain; charset=utf-8",
    },
  });
}

export const config = {
  matcher: [
    // Everything except the Resend webhook (authenticated by its own
    // signature later) and Next's static assets.
    "/((?!api/email/incoming(?:/|$)|_next/static|_next/image|favicon\\.ico).*)",
  ],
};
