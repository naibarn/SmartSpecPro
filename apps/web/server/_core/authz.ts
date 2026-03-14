import type { Request } from "express";
import { ENV } from "./env";
import { sdk } from "./sdk";
import { verifyBearerToken } from "./tokens";
import { isJtiRevoked } from "./revocation";
import { validateKey } from "../services/apiKeyService";

export type AuthResult =
  | { ok: true; mode: "bearer"; sub: string; scopes: string[] }
  | { ok: true; mode: "session"; user: any; sub: string; scopes: string[] }
  | {
      ok: true;
      mode: "api_key";
      sub: string;
      scopes: string[];
      tenantId: string;
      apiKeyId: string;
      userId: number;
      rateLimit: number;
      creditLimit: number | null;
      quotaHourly: number | null;
      quotaDaily: number | null;
      quotaWeekly: number | null;
      quotaMonthly: number | null;
    }
  | { ok: false; error: string };

function parseBearer(req: Request): string | null {
  // Standard: Authorization: Bearer <token>
  const h = String(req.headers["authorization"] || "").trim();
  if (h.toLowerCase().startsWith("bearer ")) return h.slice(7).trim();

  // Alternative: X-Api-Key: <token>  (used by n8n, Zapier, Make, OpenAPI gateways)
  const xApiKey = String(req.headers["x-api-key"] || "").trim();
  if (xApiKey) return xApiKey;

  return null;
}

function scopesForStaticToken(token: string): string[] {
  // Least-privilege defaults for server-to-server tokens
  if (ENV.mcpServerToken && token === ENV.mcpServerToken) return ["mcp:read", "mcp:write"];
  if (ENV.webGatewayToken && token === ENV.webGatewayToken) return ["llm:chat", "mcp:read", "mcp:write"];
  return [];
}

export async function authorizeRequest(
  req: Request,
  opts: { allowBearer: boolean; allowSession: boolean }
): Promise<AuthResult> {
  // 1) Bearer token (server-to-server / desktop proxy)
  if (opts.allowBearer) {
    const token = parseBearer(req);
    if (token) {
      // API key detection (sk-ssp_ prefix)
      if (token.startsWith("sk-ssp_")) {
        const authCtx = await validateKey(token);
        if (authCtx) {
          // Suspended keys return a sentinel object with _suspended flag
          if ((authCtx as any)._suspended) {
            return { ok: false, error: "key_suspended" };
          }
          return {
            ok: true,
            mode: "api_key",
            sub: String(authCtx.userId),
            scopes: authCtx.scopes ?? [],
            tenantId: authCtx.tenantId,
            apiKeyId: authCtx.apiKeyId ?? "",
            userId: authCtx.userId,
            rateLimit: authCtx.rateLimit ?? 60,
            creditLimit: authCtx.creditLimit ?? null,
            quotaHourly: authCtx.quotaHourly ?? null,
            quotaDaily: authCtx.quotaDaily ?? null,
            quotaWeekly: authCtx.quotaWeekly ?? null,
            quotaMonthly: authCtx.quotaMonthly ?? null,
          };
        }
        return { ok: false, error: "Invalid API key" };
      }

      // Static token shortcut (if configured)
      const staticScopes = scopesForStaticToken(token);
      if (staticScopes.length) {
        return { ok: true, mode: "bearer", sub: "static", scopes: staticScopes };
      }

      // Signed JWT bearer token (short-lived)
      try {
        const claims = await verifyBearerToken(token);
        const jti = String((claims as any).jti || "");
        if (jti) {
          const revoked = await isJtiRevoked(jti);
          if (revoked) return { ok: false, error: "Token revoked" };
        }
        // sub may be absent in session JWTs that use openId claim instead
        const sub = claims.sub != null
          ? String(claims.sub)
          : String((claims as any).openId || (claims as any).id || "");
        return { ok: true, mode: "bearer", sub, scopes: claims.scopes || [] };
      } catch (e: any) {
        return { ok: false, error: e?.message || "Invalid token" };
      }
    }
  }

  // 2) Session cookie (browser UI)
  if (opts.allowSession) {
    try {
      const user = await sdk.authenticateRequest(req);
      const sub = String((user as any)?.id || (user as any)?.openId || (user as any)?.open_id || "");
      if (!sub) return { ok: false, error: "Unauthorized" };

      // Session users are interactive owners/users; allow tools but enforce per-tool policy elsewhere
      const scopes = ["llm:chat", "mcp:read", "mcp:write"];
      return { ok: true, mode: "session", user, sub, scopes };
    } catch (e: any) {
      return { ok: false, error: e?.message || "Unauthorized" };
    }
  }

  return { ok: false, error: "Unauthorized" };
}
