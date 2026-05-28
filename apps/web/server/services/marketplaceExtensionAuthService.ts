import crypto from "crypto";
import type { Request } from "express";
import { and, eq } from "drizzle-orm";
import { getDb } from "../db";
import { authorizeRequest } from "../_core/authz";
import { hasScope, signBearerToken } from "../_core/tokens";
import { marketplaceExtensionPairings } from "../../drizzle/schema";
import { getMarketplaceCaptureConfig, isAllowedMarketplaceOrigin, marketplaceCaptureError } from "./marketplaceCaptureConfig";

export const MARKETPLACE_EXTENSION_SCOPES = [
  "marketplace:capture",
  "marketplace:read",
  "marketplace:write",
] as const;

let deviceBindingSchemaReady = false;
let deviceBindingSchemaReadyPromise: Promise<void> | null = null;

export interface MarketplaceAuthContext {
  userId: number;
  tenantId?: string;
  scopes: string[];
  origin?: string;
}

function normalizeDeviceId(deviceId: string | null | undefined) {
  const value = deviceId?.trim() ?? "";
  return /^mdev_[a-f0-9]{64}$/.test(value) ? value : null;
}

function hashDeviceId(deviceId: string) {
  return crypto.createHash("sha256").update(deviceId, "utf8").digest("hex");
}

function readExtensionOrigin(req: Request) {
  const browserOrigin = String(req.headers.origin ?? "").trim() || undefined;
  const headerOrigin = String(req.headers["x-marketplace-extension-origin"] ?? "").trim() || undefined;
  if (browserOrigin && headerOrigin && browserOrigin !== headerOrigin) {
    throw marketplaceCaptureError("extension_origin_mismatch", "Extension origin header does not match request origin", 403);
  }
  return browserOrigin || headerOrigin;
}

async function ensureDeviceBindingSchema() {
  if (deviceBindingSchemaReady) return;
  if (!deviceBindingSchemaReadyPromise) {
    deviceBindingSchemaReadyPromise = (async () => {
      const db = getDb();
      await db.execute(`
        ALTER TABLE IF EXISTS "marketplace_extension_pairings"
          ADD COLUMN IF NOT EXISTS "deviceIdHash" varchar(64);
      `);
      await db.execute(`
        ALTER TABLE IF EXISTS "marketplace_extension_pairings"
          ADD COLUMN IF NOT EXISTS "tokenJti" varchar(128);
      `);
      await db.execute(`
        CREATE INDEX IF NOT EXISTS "idx_marketplace_extension_pairings_device"
          ON "marketplace_extension_pairings" ("deviceIdHash", "status");
      `);
      deviceBindingSchemaReady = true;
    })().finally(() => {
      deviceBindingSchemaReadyPromise = null;
    });
  }
  await deviceBindingSchemaReadyPromise;
}

export async function issueMarketplaceExtensionToken(input: {
  userId: number;
  tenantId?: string | null;
  origin?: string | null;
  extensionId?: string | null;
  deviceId?: string | null;
}) {
  const config = getMarketplaceCaptureConfig();
  if (!config.enabled) {
    throw marketplaceCaptureError("marketplace_capture_disabled", "Marketplace capture is disabled", 503, true);
  }

  const origin = input.origin?.trim() || null;
  if (origin && !isAllowedMarketplaceOrigin(origin)) {
    throw marketplaceCaptureError("extension_origin_not_allowed", "Extension origin is not allowed", 403);
  }
  const deviceId = normalizeDeviceId(input.deviceId);
  if (!deviceId) {
    throw marketplaceCaptureError("extension_device_required", "Extension device binding is required. Generate a new token from the extension.", 400);
  }
  const deviceIdHash = hashDeviceId(deviceId);
  await ensureDeviceBindingSchema();

  const pairingId = `mep_${crypto.randomBytes(16).toString("hex")}`;
  const now = new Date();
  const expiresAt = new Date(now.getTime() + config.tokenTtlMs);
  const jti = `mcap_${crypto.randomBytes(16).toString("hex")}`;
  const db = getDb();
  await db.insert(marketplaceExtensionPairings).values({
    id: pairingId,
    userId: input.userId,
    tenantId: input.tenantId ?? null,
    origin,
    extensionId: input.extensionId ?? null,
    deviceIdHash,
    tokenJti: jti,
    status: "active",
    expiresAt,
    createdAt: now,
    updatedAt: now,
  });

  const scopes = [...MARKETPLACE_EXTENSION_SCOPES];
  const accessToken = signBearerToken({
    sub: String(input.userId),
    type: "access",
    tokenUse: "marketplace_extension",
    userId: input.userId,
    tenantId: input.tenantId ?? undefined,
    externalReference: pairingId,
    deviceIdHash,
    origin: origin ?? undefined,
    extensionId: input.extensionId ?? undefined,
    scopes,
    jti,
  }, config.tokenTtl as any);

  return {
    accessToken,
    tokenType: "Bearer" as const,
    scopes,
    pairingId,
    expiresAt: expiresAt.toISOString(),
  };
}

export async function requireMarketplaceAuth(
  req: Request,
  requiredScope: "marketplace:capture" | "marketplace:read" | "marketplace:write",
): Promise<MarketplaceAuthContext> {
  const config = getMarketplaceCaptureConfig();
  if (!config.enabled) {
    throw marketplaceCaptureError("marketplace_capture_disabled", "Marketplace capture is disabled", 503, true);
  }
  const origin = readExtensionOrigin(req);
  if (origin && !isAllowedMarketplaceOrigin(origin)) {
    throw marketplaceCaptureError("extension_origin_not_allowed", "Extension origin is not allowed", 403);
  }

  const auth = await authorizeRequest(req, { allowBearer: true, allowSession: false });
  if (!auth.ok || auth.mode !== "bearer" || !auth.userId) {
    throw marketplaceCaptureError("unauthorized", "Unauthorized", 401);
  }
  if (auth.tokenUse !== "marketplace_extension") {
    throw marketplaceCaptureError("invalid_extension_token", "Token is not a marketplace extension token", 401);
  }
  if (!hasScope(auth.scopes, requiredScope)) {
    throw marketplaceCaptureError("forbidden_scope", `Missing scope ${requiredScope}`, 403);
  }

  const claimsPairingId = String(auth.externalReference ?? "");
  if (!claimsPairingId) {
    throw marketplaceCaptureError("extension_pairing_required", "Extension pairing is required. Generate a new token from the extension.", 401);
  }
  const presentedDeviceId = normalizeDeviceId(String(req.headers["x-marketplace-device-id"] ?? ""));
  if (!presentedDeviceId) {
    throw marketplaceCaptureError("extension_device_required", "Extension device binding header is required. Generate a new token from this browser.", 401);
  }
  const presentedDeviceIdHash = hashDeviceId(presentedDeviceId);

  await ensureDeviceBindingSchema();
  const db = getDb();
  const [pairing] = await db
    .select()
    .from(marketplaceExtensionPairings)
    .where(and(
      eq(marketplaceExtensionPairings.id, claimsPairingId),
      eq(marketplaceExtensionPairings.userId, auth.userId),
    ))
    .limit(1);
  if (!pairing) {
    throw marketplaceCaptureError("extension_pairing_not_found", "Extension pairing was not found", 401);
  }
  if (!pairing.deviceIdHash || pairing.deviceIdHash !== presentedDeviceIdHash || auth.deviceIdHash !== pairing.deviceIdHash) {
    throw marketplaceCaptureError("extension_device_mismatch", "This token is bound to another browser installation. Generate a new token on this device.", 403);
  }
  if (!pairing.tokenJti || pairing.tokenJti !== auth.jti) {
    throw marketplaceCaptureError("extension_token_mismatch", "This extension token is no longer valid. Generate a new token.", 401);
  }
  if (auth.origin && origin !== auth.origin) {
    throw marketplaceCaptureError("extension_origin_mismatch", "Extension origin does not match this token", 403);
  }
  if (pairing.origin && origin !== pairing.origin) {
    throw marketplaceCaptureError("extension_origin_mismatch", "Extension origin does not match this token", 403);
  }
  if (pairing.status !== "active") {
    throw marketplaceCaptureError("extension_pairing_inactive", "Extension pairing is inactive", 403);
  }
  if (pairing.expiresAt && pairing.expiresAt.getTime() < Date.now()) {
    throw marketplaceCaptureError("extension_pairing_expired", "Extension pairing has expired", 401);
  }
  await db.update(marketplaceExtensionPairings)
    .set({ lastUsedAt: new Date(), updatedAt: new Date() })
    .where(eq(marketplaceExtensionPairings.id, claimsPairingId));

  return {
    userId: auth.userId,
    tenantId: auth.tenantId,
    scopes: auth.scopes,
    origin,
  };
}
