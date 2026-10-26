import { TRPCError } from "@trpc/server";
import type { TokenClaims } from "../_core/tokens";
import { isJtiRevoked } from "../_core/revocation";

export const DEVELOPMENT_RUN_SCOPE = "development:run";
type Request = { headers?: { authorization?: string } };

/** Called after normal SDK user authentication. Signature/expiry and durable
 * revocation are rechecked; unverified JWT decoding never grants authority. */
async function scopedBearer(req?: Request): Promise<TokenClaims | null> {
  const header = req?.headers?.authorization;
  if (!header?.startsWith("Bearer ")) return null;
  let claims: TokenClaims;
  try {
    const { verifyBearerToken } = await import("../_core/tokens");
    claims = await verifyBearerToken(header.slice(7).trim());
    if (claims.jti && await isJtiRevoked(claims.jti)) throw new Error("revoked");
  } catch {
    throw new TRPCError({ code: "UNAUTHORIZED", message: "DEVELOPMENT_BEARER_INVALID" });
  }
  // Existing normal Owner sessions are distinct from scoped OAuth access tokens.
  if (!claims.type && !Array.isArray(claims.scopes) && claims.userId == null) return null;
  if (claims.type !== "access" || !Array.isArray(claims.scopes))
    throw new TRPCError({ code: "FORBIDDEN", message: "DEVELOPMENT_ACCESS_TOKEN_REQUIRED" });
  return claims;
}

export async function requireDevelopmentBearerScope(req?: Request): Promise<void> {
  const claims = await scopedBearer(req);
  if (claims && !claims.scopes!.includes(DEVELOPMENT_RUN_SCOPE))
    throw new TRPCError({ code: "FORBIDDEN", message: "DEVELOPMENT_RUN_SCOPE_REQUIRED" });
}

/** Development/MCP consent never authorizes production Admin mutations. Normal
 * authenticated Owner browser sessions retain their existing Admin controls. */
export async function rejectScopedAdminMutation(req?: Request): Promise<void> {
  if (await scopedBearer(req))
    throw new TRPCError({ code: "FORBIDDEN", message: "SCOPED_TOKEN_ADMIN_MUTATION_DENIED" });
}
