import type { Express, Request, Response } from "express";
import { and, desc, eq } from "drizzle-orm";

import { getDb } from "../db";
import { sendApiError } from "../middleware/publicApiHeaders";
import { contentProtectionAssets } from "../../drizzle/schema";
import { getContentProtectionOverview, safeAssetView } from "../routers/contentProtection";

type RequestAuth = {
  ok: true;
  mode?: string;
  tenantId?: string;
  userId?: number;
  user?: { id?: number; currentTenantId?: string; role?: string };
  scopes?: string[];
};

function authFromRequest(req: Request): { tenantId: string; userId: number; admin: boolean } | null {
  const auth = (req as Request & { auth?: RequestAuth }).auth;
  if (!auth?.ok) return null;
  const tenantId = String(auth.tenantId || auth.user?.currentTenantId || "").trim();
  const userId = Number(auth.userId || auth.user?.id || 0);
  if (!tenantId || !Number.isSafeInteger(userId) || userId <= 0) return null;
  return { tenantId, userId, admin: auth.user?.role === "admin" || auth.user?.role === "system_agent" };
}

function parseLimit(raw: unknown): number {
  const value = Number(raw ?? 50);
  return Number.isInteger(value) && value >= 1 && value <= 100 ? value : 50;
}

function parseOffset(raw: unknown): number {
  const value = Number(raw ?? 0);
  return Number.isInteger(value) && value >= 0 && value <= 100_000 ? value : 0;
}

function featureEnabled(): boolean {
  // The public API route must remain unavailable until the tenant feature flag
  // is explicitly enabled. Tenant enforcement is repeated at the tRPC layer.
  return process.env.CONTENT_PROTECTION_API_ENABLED === "true";
}

function fail(res: Response, status: number, code: string, message: string): void {
  sendApiError(res, status, code, message);
}

export function publicEvidenceVerificationKeys(): {
  format: "sah-evidence-keys-v1";
  keys: Array<{ keyId: string; algorithm: string; publicKey: string; validFrom: string; retiredAt?: string }>;
} {
  const raw = process.env.CONTENT_PROTECTION_PUBLIC_KEYS_JSON;
  if (!raw) return { format: "sah-evidence-keys-v1", keys: [] };
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return { format: "sah-evidence-keys-v1", keys: [] };
    const keys = parsed.flatMap(item => {
      if (!item || typeof item !== "object") return [];
      const value = item as Record<string, unknown>;
      if (typeof value.keyId !== "string" || typeof value.algorithm !== "string" || typeof value.publicKey !== "string" || typeof value.validFrom !== "string") return [];
      return [{
        keyId: value.keyId.slice(0, 160),
        algorithm: value.algorithm.slice(0, 80),
        publicKey: value.publicKey.slice(0, 4096),
        validFrom: value.validFrom.slice(0, 64),
        ...(typeof value.retiredAt === "string" ? { retiredAt: value.retiredAt.slice(0, 64) } : {}),
      }];
    });
    return { format: "sah-evidence-keys-v1", keys };
  } catch {
    return { format: "sah-evidence-keys-v1", keys: [] };
  }
}

export function registerContentProtectionRoutes(app: Express): void {
  app.get("/.well-known/smartaihub-evidence-keys.json", (_req, res) => {
    res.setHeader("Cache-Control", "public, max-age=300");
    res.json(publicEvidenceVerificationKeys());
  });

  app.get("/v1/content-protection/overview", async (req, res) => {
    const auth = authFromRequest(req);
    if (!auth) return fail(res, 401, "invalid_api_key", "Authentication required");
    if (!featureEnabled()) return fail(res, 404, "feature_disabled", "Content protection is not enabled");
    try {
      return res.json(await getContentProtectionOverview(auth));
    } catch {
      return fail(res, 500, "internal_error", "Unable to load content protection overview");
    }
  });

  app.get("/v1/content-protection/assets", async (req, res) => {
    const auth = authFromRequest(req);
    if (!auth) return fail(res, 401, "invalid_api_key", "Authentication required");
    if (!featureEnabled()) return fail(res, 404, "feature_disabled", "Content protection is not enabled");
    try {
      const database = await getDb();
      const predicates = [eq(contentProtectionAssets.tenantId, auth.tenantId)];
      if (!auth.admin) predicates.push(eq(contentProtectionAssets.ownerUserId, auth.userId));
      const rows = await database.select().from(contentProtectionAssets)
        .where(and(...predicates))
        .orderBy(desc(contentProtectionAssets.createdAt))
        .limit(parseLimit(req.query.limit))
        .offset(parseOffset(req.query.offset));
      return res.json({ data: rows.map(safeAssetView) });
    } catch {
      return fail(res, 500, "internal_error", "Unable to load protected assets");
    }
  });

  app.get("/v1/content-protection/assets/:assetId", async (req, res) => {
    const auth = authFromRequest(req);
    if (!auth) return fail(res, 401, "invalid_api_key", "Authentication required");
    if (!featureEnabled()) return fail(res, 404, "feature_disabled", "Content protection is not enabled");
    if (!/^[0-9a-f-]{36}$/i.test(req.params.assetId)) return fail(res, 400, "invalid_request", "Invalid asset identifier");
    try {
      const database = await getDb();
      const predicates = [eq(contentProtectionAssets.id, req.params.assetId), eq(contentProtectionAssets.tenantId, auth.tenantId)];
      if (!auth.admin) predicates.push(eq(contentProtectionAssets.ownerUserId, auth.userId));
      const [row] = await database.select().from(contentProtectionAssets).where(and(...predicates)).limit(1);
      if (!row) return fail(res, 404, "not_found", "Protected asset not found");
      return res.json(safeAssetView(row));
    } catch {
      return fail(res, 500, "internal_error", "Unable to load protected asset");
    }
  });
}
