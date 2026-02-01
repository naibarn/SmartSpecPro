import type { CreateExpressContextOptions } from "@trpc/server/adapters/express";
import type { User } from "../../drizzle/schema";
import type { TenantRequest } from "./tenant";
import { sdk } from "./sdk";
import { debugLog } from "./logger";

export type TrpcContext = {
  req: CreateExpressContextOptions["req"];
  res: CreateExpressContextOptions["res"];
  user: User | null;
  /** The user's bearer token from the request header (for passing to Python backend) */
  userToken: string | null;
  /** The current tenant ID from the tenant middleware */
  tenantId: number | null;
};

export async function createContext(
  opts: CreateExpressContextOptions
): Promise<TrpcContext> {
  let user: User | null = null;
  let userToken: string | null = null;

  // Extract bearer token from Authorization header
  const authHeader = opts.req.headers.authorization;
  if (authHeader?.startsWith("Bearer ")) {
    userToken = authHeader.substring(7);
  }

  try {
    user = await sdk.authenticateRequest(opts.req);
    debugLog("Context", "User authenticated", { id: user?.id, email: user?.email });
  } catch (error) {
    // Authentication is optional for public procedures.
    debugLog("Context", "Auth failed (optional)", error instanceof Error ? error.message : error);
    user = null;
    userToken = null; // Clear token if auth failed
  }

  // Extract tenantId from tenant middleware (TenantRequest)
  const tenantId = (opts.req as TenantRequest).tenant?.id ?? null;

  return {
    req: opts.req,
    res: opts.res,
    user,
    userToken,
    tenantId,
  };
}
