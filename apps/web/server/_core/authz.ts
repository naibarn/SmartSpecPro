import type { Request } from "express";
import { ENV } from "./env";
import { sdk } from "./sdk";
import { verifyBearerToken } from "./tokens";
import { isJtiRevoked } from "./revocation";
import { validateKey } from "../services/apiKeyService";
import { getRedisClient } from "../services/redis";
import { getCachedMcpServerToken, getCachedPreferredInternalToken } from "../services/appRuntimeConfig";
import { verifyDelegatedWorkerBearerToken } from "../services/workerDelegationService";

export type AuthResult =
  | {
      ok: true;
      mode: "bearer";
      sub: string;
      scopes: string[];
      tenantId?: string;
      userId?: number;
      apiKeyId?: string;
      tokenUse?: string;
      externalReference?: string;
      jti?: string;
      deviceIdHash?: string;
    }
  | {
      ok: true;
      mode: "session";
      user: any;
      sub: string;
      scopes: string[];
      tenantId?: string;
      userId?: number;
    }
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
  | {
      ok: true;
      mode: "delegated_worker";
      sub: string;
      scopes: string[];
      tenantId: string;
      userId: number;
      ownerUserId: number;
      workerId: string;
      workerJobId: string;
      delegatedSessionId: string;
      runtimeType: string;
      scopeProfile: string;
      teamId?: string;
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
  const mcpServerToken = getCachedMcpServerToken() || ENV.mcpServerToken;
  const gatewayToken = getCachedPreferredInternalToken() || ENV.webGatewayToken;
  if (mcpServerToken && token === mcpServerToken) return ["mcp:read", "mcp:write"];
  if (gatewayToken && token === gatewayToken) return ["llm:chat", "mcp:read", "mcp:write"];
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
        // Brute-force protection: check if IP is blocked
        const clientIp = (req as any).ip || "unknown";
        try {
          const redis = getRedisClient();
          if (redis) {
            const failKey = `auth:apikey:fail:${clientIp}`;
            const failCount = parseInt(await redis.get(failKey) || "0", 10);
            if (failCount >= 20) {
              return { ok: false, error: "Too many failed attempts. Try again later." };
            }
          }
        } catch {}

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

        // Track failed attempt
        try {
          const redis = getRedisClient();
          if (redis) {
            const failKey = `auth:apikey:fail:${clientIp}`;
            await redis.incr(failKey);
            await redis.expire(failKey, 300); // 5 minute window
          }
        } catch {}

        return { ok: false, error: "Invalid API key" };
      }

      // Static token shortcut (if configured)
      const staticScopes = scopesForStaticToken(token);
      if (staticScopes.length) {
        return {
          ok: true,
          mode: "bearer",
          sub: "static",
          scopes: staticScopes,
        };
      }

      // Signed JWT bearer token (short-lived)
      try {
        const previewClaims = await verifyBearerToken(token);
        if ((previewClaims as any).tokenUse === "worker_gateway_delegate") {
          const delegatedAuth = await verifyDelegatedWorkerBearerToken(token);
          return {
            ok: true,
            mode: "delegated_worker",
            sub: delegatedAuth.subject,
            scopes: delegatedAuth.scopes,
            tenantId: delegatedAuth.tenantId,
            userId: delegatedAuth.userId,
            ownerUserId: delegatedAuth.ownerUserId,
            workerId: delegatedAuth.workerId,
            workerJobId: delegatedAuth.workerJobId,
            delegatedSessionId: delegatedAuth.delegatedSessionId,
            runtimeType: delegatedAuth.runtimeType,
            scopeProfile: delegatedAuth.scopeProfile,
            ...(delegatedAuth.teamId ? { teamId: delegatedAuth.teamId } : {}),
          };
        }
        const claims = previewClaims;
        if ((claims as any).type === "refresh") {
          return { ok: false, error: "Refresh token cannot authenticate requests" };
        }
        const jti = String((claims as any).jti || "");
        if (jti) {
          const revoked = await isJtiRevoked(jti);
          if (revoked) return { ok: false, error: "Token revoked" };
        }
        // sub may be absent in session JWTs that use openId claim instead
        const sub = claims.sub != null
          ? String(claims.sub)
          : String((claims as any).openId || (claims as any).id || "");
        const tenantId = typeof (claims as any).tenantId === "string"
          ? (claims as any).tenantId.trim()
          : "";
        const userIdCandidate = (claims as any).userId ?? Number.parseInt(sub, 10);
        const userId = Number.isInteger(userIdCandidate) && Number(userIdCandidate) > 0
          ? Number(userIdCandidate)
          : undefined;
        const apiKeyId = typeof (claims as any).apiKeyId === "string"
          ? (claims as any).apiKeyId.trim()
          : "";
        const tokenUse = typeof (claims as any).tokenUse === "string"
          ? (claims as any).tokenUse.trim()
          : "";
        const externalReference = typeof (claims as any).externalReference === "string"
          ? (claims as any).externalReference.trim()
          : "";
        const deviceIdHash = typeof (claims as any).deviceIdHash === "string"
          ? (claims as any).deviceIdHash.trim()
          : "";
        return {
          ok: true,
          mode: "bearer",
          sub,
          scopes: claims.scopes || [],
          ...(tenantId ? { tenantId } : {}),
          ...(userId ? { userId } : {}),
          ...(apiKeyId ? { apiKeyId } : {}),
          ...(tokenUse ? { tokenUse } : {}),
          ...(externalReference ? { externalReference } : {}),
          ...(jti ? { jti } : {}),
          ...(deviceIdHash ? { deviceIdHash } : {}),
        };
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
      const tenantId = String((user as any)?.currentTenantId || "").trim();
      const userId = Number.parseInt(String((user as any)?.id || ""), 10);
      return {
        ok: true,
        mode: "session",
        user,
        sub,
        scopes,
        ...(tenantId ? { tenantId } : {}),
        ...(Number.isInteger(userId) && userId > 0 ? { userId } : {}),
      };
    } catch (e: any) {
      return { ok: false, error: e?.message || "Unauthorized" };
    }
  }

  return { ok: false, error: "Unauthorized" };
}
