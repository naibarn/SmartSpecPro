import crypto from "crypto";
import { eq, and, sql, desc, gte } from "drizzle-orm";
import { db } from "../db";
import { apiKeys, publicApiAuditLog } from "../../drizzle/schema";
import { ENV } from "../_core/env";
import {
  ALLOWED_API_SCOPES_SET,
  type AuthContext,
} from "../../shared/publicApiTypes";

const KEY_PREFIX = "sk-ssp_";

/** Compute HMAC-SHA256 hash of raw key using server pepper. */
function computeKeyHash(rawKey: string): string {
  return crypto
    .createHmac("sha256", ENV.apiKeyHmacSecret)
    .update(rawKey)
    .digest("hex");
}

/** Generate a raw API key with tenant short ID embedded. */
function generateRawKey(tenantId: string): string {
  const tenantShortId = tenantId.slice(0, 8);
  const randomPart = crypto
    .randomBytes(24)
    .toString("base64url")
    .replace(/=/g, "");
  return `${KEY_PREFIX}${tenantShortId}_${randomPart}`;
}

/**
 * Assert that API_KEY_HMAC_SECRET is configured.
 * Call during server startup to fail fast.
 */
export function assertHmacSecretConfigured(): void {
  if (!ENV.apiKeyHmacSecret || ENV.apiKeyHmacSecret.length < 32) {
    throw new Error(
      "FATAL: API_KEY_HMAC_SECRET must be set to a string of at least 32 characters",
    );
  }
}

/**
 * Create a new API key.
 * Returns the raw key exactly once — it is never stored.
 */
export async function createKey(
  tenantId: string,
  userId: number,
  name: string,
  scopes: string[],
  options?: {
    expiresAt?: Date;
    rateLimit?: number;
    creditLimit?: number;
    metadata?: Record<string, unknown>;
  },
): Promise<{ id: string; rawKey: string; keyPrefix: string }> {
  // Validate scopes
  for (const scope of scopes) {
    if (!ALLOWED_API_SCOPES_SET.has(scope)) {
      throw new Error(`Invalid scope: ${scope}`);
    }
  }

  const rawKey = generateRawKey(tenantId);
  const keyHash = computeKeyHash(rawKey);
  const keyPrefix = rawKey.slice(0, 16);
  const id = crypto.randomUUID();

  await db.insert(apiKeys).values({
    id,
    tenantId,
    userId,
    name: name.slice(0, 100),
    keyPrefix,
    keyHash,
    scopes,
    rateLimit: options?.rateLimit ?? 60,
    creditLimit: options?.creditLimit ?? null,
    expiresAt: options?.expiresAt ?? null,
    metadata: options?.metadata ?? null,
    isActive: true,
  });

  return { id, rawKey, keyPrefix };
}

/**
 * Validate a raw API key and return an AuthContext if valid.
 * This is the hot path — called on every API request.
 */
export async function validateKey(
  rawKey: string,
): Promise<AuthContext | null> {
  if (!rawKey.startsWith(KEY_PREFIX)) {
    return null;
  }

  const keyHash = computeKeyHash(rawKey);

  const [row] = await db
    .select()
    .from(apiKeys)
    .where(and(eq(apiKeys.keyHash, keyHash), eq(apiKeys.isActive, true)))
    .limit(1);

  if (!row) {
    return null;
  }

  if (row.expiresAt && row.expiresAt < new Date()) {
    return null;
  }

  // Fire-and-forget: update lastUsedAt
  db.update(apiKeys)
    .set({ lastUsedAt: new Date() })
    .where(eq(apiKeys.id, row.id))
    .catch(() => {});

  return {
    userId: row.userId,
    tenantId: row.tenantId,
    mode: "api_key",
    apiKeyId: row.id,
    scopes: row.scopes as string[],
    rateLimit: row.rateLimit,
  };
}

/**
 * List API keys for a tenant, optionally filtered by user.
 * Never returns keyHash.
 */
export async function listKeys(tenantId: string, userId?: number) {
  const conditions = [eq(apiKeys.tenantId, tenantId)];
  if (userId !== undefined) {
    conditions.push(eq(apiKeys.userId, userId));
  }

  const rows = await db
    .select({
      id: apiKeys.id,
      name: apiKeys.name,
      keyPrefix: apiKeys.keyPrefix,
      scopes: apiKeys.scopes,
      rateLimit: apiKeys.rateLimit,
      creditLimit: apiKeys.creditLimit,
      expiresAt: apiKeys.expiresAt,
      lastUsedAt: apiKeys.lastUsedAt,
      isActive: apiKeys.isActive,
      createdAt: apiKeys.createdAt,
    })
    .from(apiKeys)
    .where(and(...conditions))
    .orderBy(desc(apiKeys.createdAt));

  return rows;
}

/**
 * Revoke an API key (soft delete via isActive=false).
 */
export async function revokeKey(
  keyId: string,
  tenantId: string,
): Promise<{ revoked: boolean }> {
  const result = await db
    .update(apiKeys)
    .set({ isActive: false, updatedAt: new Date() })
    .where(and(eq(apiKeys.id, keyId), eq(apiKeys.tenantId, tenantId)));

  if (result.rowCount === 0) {
    throw new Error("API key not found");
  }

  return { revoked: true };
}

/**
 * Get usage stats for an API key from the audit log.
 */
export async function getKeyUsageStats(keyId: string, tenantId: string) {
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  const [totals] = await db
    .select({
      totalRequests: sql<number>`count(*)::int`,
      totalCreditsUsed: sql<number>`coalesce(sum("creditsUsed"), 0)::int`,
      errorCount: sql<number>`count(*) filter (where "statusCode" >= 400)::int`,
    })
    .from(publicApiAuditLog)
    .where(
      and(
        eq(publicApiAuditLog.apiKeyId, keyId),
        eq(publicApiAuditLog.tenantId, tenantId),
        gte(publicApiAuditLog.createdAt, thirtyDaysAgo),
      ),
    );

  const dailyStats = await db
    .select({
      date: sql<string>`date_trunc('day', "createdAt")::date::text`,
      requests: sql<number>`count(*)::int`,
      credits: sql<number>`coalesce(sum("creditsUsed"), 0)::int`,
    })
    .from(publicApiAuditLog)
    .where(
      and(
        eq(publicApiAuditLog.apiKeyId, keyId),
        eq(publicApiAuditLog.tenantId, tenantId),
        gte(publicApiAuditLog.createdAt, thirtyDaysAgo),
      ),
    )
    .groupBy(sql`date_trunc('day', "createdAt")`)
    .orderBy(sql`date_trunc('day', "createdAt")`);

  return {
    totalRequests: totals?.totalRequests ?? 0,
    totalCreditsUsed: totals?.totalCreditsUsed ?? 0,
    errorCount: totals?.errorCount ?? 0,
    dailyStats,
  };
}

// Re-export for testing
export { computeKeyHash as _computeKeyHash };
