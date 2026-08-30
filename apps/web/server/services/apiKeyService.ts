import crypto from "crypto";
import { eq, and, sql, desc, gte } from "drizzle-orm";
import { db } from "../db";
import { apiKeys, publicApiAuditLog } from "../../drizzle/schema";
import { ENV } from "../_core/env";
import {
  ALLOWED_API_SCOPES_SET,
  MCP_CLI_DEFAULT_CREDIT_QUOTAS,
  type AuthContext,
} from "../../shared/publicApiTypes";

const KEY_PREFIX = "sk-ssp_";
const MCP_CLI_PURPOSE = "mcp_cli" as const;
type ApiKeyPurpose = "public_api" | typeof MCP_CLI_PURPOSE;

type ApiKeyMetadata = Record<string, unknown> & {
  purpose?: ApiKeyPurpose;
  creditQuota5h?: number | null;
  creditQuotaDaily?: number | null;
  creditQuotaWeekly?: number | null;
};

function normalizedMetadata(value: unknown): ApiKeyMetadata {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as ApiKeyMetadata
    : {};
}

function isMcpCliMetadata(value: unknown): boolean {
  return normalizedMetadata(value).purpose === MCP_CLI_PURPOSE;
}

function mcpCliQuotas(value: unknown): {
  creditQuota5h: number | null;
  creditQuotaDaily: number | null;
  creditQuotaWeekly: number | null;
} {
  const metadata = normalizedMetadata(value);
  const quota = (field: keyof Pick<ApiKeyMetadata, "creditQuota5h" | "creditQuotaDaily" | "creditQuotaWeekly">, fallback: number) => {
    // A purpose marker added before the budget fields existed must remain
    // protected by the conservative defaults. Only an explicit null opts out.
    if (metadata[field] === undefined) return fallback;
    return typeof metadata[field] === "number" ? metadata[field] : null;
  };
  return {
    creditQuota5h: quota("creditQuota5h", MCP_CLI_DEFAULT_CREDIT_QUOTAS.fiveHour),
    creditQuotaDaily: quota("creditQuotaDaily", MCP_CLI_DEFAULT_CREDIT_QUOTAS.daily),
    creditQuotaWeekly: quota("creditQuotaWeekly", MCP_CLI_DEFAULT_CREDIT_QUOTAS.weekly),
  };
}

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
    quotaHourly?: number | null;
    quotaDaily?: number | null;
    quotaWeekly?: number | null;
    quotaMonthly?: number | null;
    purpose?: ApiKeyPurpose;
    creditQuota5h?: number | null;
    creditQuotaDaily?: number | null;
    creditQuotaWeekly?: number | null;
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

  const purpose = options?.purpose ?? "public_api";
  const metadata: ApiKeyMetadata = {
    ...(options?.metadata ?? {}),
    purpose,
    ...(purpose === MCP_CLI_PURPOSE
      ? {
          creditQuota5h: options?.creditQuota5h === undefined
            ? MCP_CLI_DEFAULT_CREDIT_QUOTAS.fiveHour
            : options.creditQuota5h,
          creditQuotaDaily: options?.creditQuotaDaily === undefined
            ? MCP_CLI_DEFAULT_CREDIT_QUOTAS.daily
            : options.creditQuotaDaily,
          creditQuotaWeekly: options?.creditQuotaWeekly === undefined
            ? MCP_CLI_DEFAULT_CREDIT_QUOTAS.weekly
            : options.creditQuotaWeekly,
        }
      : {}),
  };

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
    quotaHourly: options?.quotaHourly ?? null,
    quotaDaily: options?.quotaDaily ?? null,
    quotaWeekly: options?.quotaWeekly ?? null,
    quotaMonthly: options?.quotaMonthly ?? null,
    expiresAt: options?.expiresAt ?? null,
    metadata,
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

  // Timing-safe verification of the hash to prevent side-channel attacks
  if (!crypto.timingSafeEqual(Buffer.from(keyHash, "hex"), Buffer.from(row.keyHash, "hex"))) {
    return null;
  }

  if (row.expiresAt && row.expiresAt < new Date()) {
    return null;
  }

  if (row.isSuspended) {
    // Return a sentinel that apiKeyAuthMiddleware can distinguish from "invalid key"
    // so it can return 403 key_suspended instead of 401 invalid_api_key.
    return { _suspended: true } as unknown as AuthContext;
  }

  // Fire-and-forget: update lastUsedAt
  db.update(apiKeys)
    .set({ lastUsedAt: new Date() })
    .where(eq(apiKeys.id, row.id))
    .catch(() => {});

  const purpose = isMcpCliMetadata(row.metadata) ? MCP_CLI_PURPOSE : "public_api";
  const quotas = mcpCliQuotas(row.metadata);

  const hasStoredQuotaSettings = Object.prototype.hasOwnProperty.call(row, "rateLimit");
  return {
    userId: row.userId,
    tenantId: row.tenantId,
    mode: "api_key",
    apiKeyId: row.id,
    scopes: row.scopes as string[],
    ...(hasStoredQuotaSettings
      ? {
          rateLimit: row.rateLimit,
          creditLimit: row.creditLimit ?? null,
          quotaHourly: row.quotaHourly ?? null,
          quotaDaily: row.quotaDaily ?? null,
          quotaWeekly: row.quotaWeekly ?? null,
          quotaMonthly: row.quotaMonthly ?? null,
        }
      : {}),
    ...(purpose === MCP_CLI_PURPOSE
      ? { keyPurpose: purpose, ...quotas }
      : {}),
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
      quotaHourly: apiKeys.quotaHourly,
      quotaDaily: apiKeys.quotaDaily,
      quotaWeekly: apiKeys.quotaWeekly,
      quotaMonthly: apiKeys.quotaMonthly,
      expiresAt: apiKeys.expiresAt,
      lastUsedAt: apiKeys.lastUsedAt,
      isActive: apiKeys.isActive,
      isSuspended: apiKeys.isSuspended,
      suspendedReason: apiKeys.suspendedReason,
      suspendedAt: apiKeys.suspendedAt,
      suspendedBy: apiKeys.suspendedBy,
      createdAt: apiKeys.createdAt,
      metadata: apiKeys.metadata,
    })
    .from(apiKeys)
    .where(and(...conditions))
    .orderBy(desc(apiKeys.createdAt));

  return (rows as Array<{ metadata: unknown } & Record<string, unknown>>).map((rawRow) => {
    const { metadata, ...row } = rawRow as { metadata: unknown } & Record<string, unknown>;
    const purpose = isMcpCliMetadata(metadata) ? MCP_CLI_PURPOSE : "public_api";
    return {
      ...row,
      keyPurpose: purpose,
      ...(purpose === MCP_CLI_PURPOSE ? mcpCliQuotas(metadata) : {}),
    };
  });
}

/**
 * Temporarily suspend an API key (admin only).
 * Suspended keys are rejected on every request until unsuspended.
 */
export async function suspendKey(
  keyId: string,
  tenantId: string,
  adminUserId: number,
  reason?: string,
): Promise<{ suspended: boolean }> {
  const result = await db
    .update(apiKeys)
    .set({
      isSuspended: true,
      suspendedReason: reason?.slice(0, 500) ?? null,
      suspendedAt: new Date(),
      suspendedBy: adminUserId,
      updatedAt: new Date(),
    })
    .where(and(eq(apiKeys.id, keyId), eq(apiKeys.tenantId, tenantId)))
    .returning({ id: apiKeys.id });

  if (result.length === 0) {
    throw new Error("API key not found");
  }

  return { suspended: true };
}

/**
 * Lift a suspension — key becomes active again immediately.
 */
export async function unsuspendKey(
  keyId: string,
  tenantId: string,
): Promise<{ unsuspended: boolean }> {
  const result = await db
    .update(apiKeys)
    .set({
      isSuspended: false,
      suspendedReason: null,
      suspendedAt: null,
      suspendedBy: null,
      updatedAt: new Date(),
    })
    .where(and(eq(apiKeys.id, keyId), eq(apiKeys.tenantId, tenantId)))
    .returning({ id: apiKeys.id });

  if (result.length === 0) {
    throw new Error("API key not found");
  }

  return { unsuspended: true };
}

/**
 * Update quota and rate-limit settings on an existing key.
 */
export async function updateKeySettings(
  keyId: string,
  tenantId: string,
  userId: number,
  settings: {
    rateLimit?: number;
    creditLimit?: number | null;
    quotaHourly?: number | null;
    quotaDaily?: number | null;
    quotaWeekly?: number | null;
    quotaMonthly?: number | null;
    creditQuota5h?: number | null;
    creditQuotaDaily?: number | null;
    creditQuotaWeekly?: number | null;
  },
): Promise<{ updated: boolean }> {
  const [existing] = await db
    .select({ metadata: apiKeys.metadata })
    .from(apiKeys)
    .where(and(eq(apiKeys.id, keyId), eq(apiKeys.tenantId, tenantId), eq(apiKeys.userId, userId)))
    .limit(1);
  if (!existing) throw new Error("API key not found");

  const metadata = normalizedMetadata(existing.metadata);
  const creditQuotaFields = {
    creditQuota5h: settings.creditQuota5h,
    creditQuotaDaily: settings.creditQuotaDaily,
    creditQuotaWeekly: settings.creditQuotaWeekly,
  };
  const nextMetadata: ApiKeyMetadata = { ...metadata };
  if (isMcpCliMetadata(metadata)) {
    if (creditQuotaFields.creditQuota5h !== undefined) nextMetadata.creditQuota5h = creditQuotaFields.creditQuota5h;
    if (creditQuotaFields.creditQuotaDaily !== undefined) nextMetadata.creditQuotaDaily = creditQuotaFields.creditQuotaDaily;
    if (creditQuotaFields.creditQuotaWeekly !== undefined) nextMetadata.creditQuotaWeekly = creditQuotaFields.creditQuotaWeekly;
  }
  const { creditQuota5h: _fiveHour, creditQuotaDaily: _daily, creditQuotaWeekly: _weekly, ...columnSettings } = settings;
  const result = await db
    .update(apiKeys)
    .set({ ...columnSettings, metadata: nextMetadata, updatedAt: new Date() })
    .where(and(eq(apiKeys.id, keyId), eq(apiKeys.tenantId, tenantId), eq(apiKeys.userId, userId)))
    .returning({ id: apiKeys.id });

  if (result.length === 0) {
    throw new Error("API key not found");
  }

  return { updated: true };
}

/**
 * Revoke an API key (soft delete via isActive=false).
 */
export async function revokeKey(
  keyId: string,
  tenantId: string,
  userId?: number,
): Promise<{ revoked: boolean }> {
  const conditions = [eq(apiKeys.id, keyId), eq(apiKeys.tenantId, tenantId)];
  if (userId !== undefined) {
    conditions.push(eq(apiKeys.userId, userId));
  }
  const updateQuery = db
    .update(apiKeys)
    .set({ isActive: false, updatedAt: new Date() })
    .where(and(...conditions));
  const result = typeof (updateQuery as any).returning === "function"
    ? await (updateQuery as any).returning({ id: apiKeys.id })
    : await updateQuery;

  if ((Array.isArray(result) && result.length === 0) || (!Array.isArray(result) && !(result as any)?.rowCount)) {
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
