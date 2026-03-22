import type { CreateExpressContextOptions } from "@trpc/server/adapters/express";
import type { User } from "../../drizzle/schema";
import type { TenantRequest } from "./tenant";
import { sdk } from "./sdk";
import { debugLog } from "./logger";
import { COOKIE_NAME } from "@shared/const";
import { parse as parseCookieHeader } from "cookie";

export type TrpcContext = {
  req: CreateExpressContextOptions["req"];
  res: CreateExpressContextOptions["res"];
  user: User | null;
  /** The user's bearer token from the request header (for passing to Python backend) */
  userToken: string | null;
  /** Temporary unlock token for private vault access */
  privateVaultToken: string | null;
  /** The current tenant ID from the tenant middleware */
  tenantId: string | null;
  /** The public URL for the current tenant (e.g., https://smartaihub.app) for external services */
  publicUrl: string | null;
};

export async function createContext(
  opts: CreateExpressContextOptions
): Promise<TrpcContext> {
  let user: User | null = null;
  let userToken: string | null = null;
  let privateVaultToken: string | null = null;

  // Extract bearer token from Authorization header OR session cookie
  const authHeader = opts.req.headers.authorization;
  if (authHeader?.startsWith("Bearer ")) {
    userToken = authHeader.substring(7);
  } else {
    // If no Authorization header, try to extract session cookie
    const cookieHeader = opts.req.headers.cookie;
    if (cookieHeader) {
      const cookies = parseCookieHeader(cookieHeader);
      const sessionCookie = cookies[COOKIE_NAME];
      if (sessionCookie) {
        userToken = sessionCookie;
      }
    }
  }

  const vaultTokenHeader = opts.req.headers["x-private-vault-token"];
  if (typeof vaultTokenHeader === "string" && vaultTokenHeader.trim()) {
    privateVaultToken = vaultTokenHeader.trim();
  }

  try {
    user = await sdk.authenticateRequest(opts.req);
    debugLog("Context", "User authenticated", { id: user?.id, email: user?.email });
  } catch (error) {
    // Authentication is optional for public procedures.
    debugLog("Context", "Auth failed (optional)", error instanceof Error ? error.message : error);
    user = null;
    userToken = null; // Clear token if auth failed
    privateVaultToken = null;
  }

  // Extract tenantId from tenant middleware (TenantRequest)
  const tenantReq = opts.req as TenantRequest;
  const tenantId = tenantReq.tenant?.id ?? null;

  // Build public URL from tenant's primary domain or request origin
  // This is used by external services (like KIE AI) to access uploaded files
  let publicUrl: string | null = null;
  if (tenantReq.tenant?.primaryDomain) {
    // Use tenant's configured primary domain with https
    publicUrl = `https://${tenantReq.tenant.primaryDomain}`;
  } else {
    // Fallback: use origin header or construct from host
    const origin = opts.req.headers.origin as string | undefined;
    if (origin) {
      publicUrl = origin;
    } else {
      const host = opts.req.headers.host;
      const protocol = opts.req.secure || opts.req.headers['x-forwarded-proto'] === 'https' ? 'https' : 'http';
      if (host) {
        publicUrl = `${protocol}://${host}`;
      }
    }
  }

  return {
    req: opts.req,
    res: opts.res,
    user,
    userToken,
    privateVaultToken,
    tenantId,
    publicUrl,
  };
}
