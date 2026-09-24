import "server-only";

import { headers } from "next/headers";
import { checkBasicAuth } from "@/lib/auth/basicAuth";

/**
 * Re-checks dashboard auth inside Server Actions. Actions are POSTs to the
 * page route, so the proxy normally covers them; this keeps them safe if a
 * matcher change ever stops doing so.
 */
export async function assertDashboardAuth(): Promise<void> {
  const authorization = (await headers()).get("authorization");
  if (checkBasicAuth(authorization, process.env.DASHBOARD_PASSWORD) !== "allow") {
    throw new Error("Unauthorized");
  }
}
