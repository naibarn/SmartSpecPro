import { eq, and } from "drizzle-orm";
import { getDb } from "../db";
import { systemSettings, userLlmApiKeys } from "../../drizzle/schema";
import { encrypt, decrypt } from "./crypto";
import { debugLog } from "../_core/logger";
import { auditLogger } from "./auditLogger";

const USER_LLM_API_KEYS_SETTING = {
  category: "ai",
  key: "allowUserOwnLlmApiKeys",
} as const;

function parseBooleanSetting(value: string | null | undefined): boolean {
  return value?.trim().toLowerCase() === "true";
}

/**
 * Set (upsert) a user's LLM API key for a specific provider.
 * The key is encrypted at rest using AES-256-GCM via crypto.ts.
 */
export async function setUserApiKey(
  userId: number,
  tenantId: string | null,
  provider: string,
  apiKey: string,
): Promise<{ provider: string; keyHint: string }> {
  if (!apiKey || apiKey.length < 20) {
    throw new Error("API key must be at least 20 characters");
  }

  const db = await getDb();
  if (!db) throw new Error("Database not initialized");

  const apiKeyEncrypted = encrypt(apiKey);
  const keyHint = apiKey.slice(-4);

  await db
    .insert(userLlmApiKeys)
    .values({
      userId,
      tenantId,
      provider,
      apiKeyEncrypted,
      keyHint,
    })
    .onConflictDoUpdate({
      target: [userLlmApiKeys.userId, userLlmApiKeys.provider],
      set: {
        apiKeyEncrypted,
        keyHint,
        updatedAt: new Date(),
      },
    });

  debugLog("userApiKeyService", "User LLM API key set", { userId, provider, action: "llm_key_set" });
  auditLogger.log({
    eventType: "user_llm_key_set",
    userId,
    endpoint: "userApiKeyService.setUserApiKey",
    requestPayload: { provider, tenantId, keyHintLast4: keyHint },
  });
  return { provider, keyHint };
}

/**
 * List all API key providers configured by a user (keyHint only, no secrets).
 */
export async function getUserApiKeys(
  userId: number,
): Promise<Array<{ provider: string; keyHint: string | null }>> {
  const db = await getDb();
  if (!db) throw new Error("Database not initialized");

  return db
    .select({
      provider: userLlmApiKeys.provider,
      keyHint: userLlmApiKeys.keyHint,
    })
    .from(userLlmApiKeys)
    .where(eq(userLlmApiKeys.userId, userId));
}

/**
 * Returns whether the platform allows users to manage their own LLM API keys.
 * Defaults to false when the setting is unset.
 */
export async function isUserLlmApiKeySelfServiceEnabled(): Promise<boolean> {
  const db = await getDb();
  if (!db) throw new Error("Database not initialized");

  const rows = await db
    .select({ value: systemSettings.value })
    .from(systemSettings)
    .where(
      and(
        eq(systemSettings.category, USER_LLM_API_KEYS_SETTING.category),
        eq(systemSettings.key, USER_LLM_API_KEYS_SETTING.key),
      ),
    )
    .limit(1);

  return parseBooleanSetting(rows[0]?.value);
}

/**
 * Delete a user's API key for a specific provider.
 * No-op if the entry does not exist.
 */
export async function deleteUserApiKey(
  userId: number,
  provider: string,
): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not initialized");

  await db
    .delete(userLlmApiKeys)
    .where(
      and(
        eq(userLlmApiKeys.userId, userId),
        eq(userLlmApiKeys.provider, provider),
      ),
    );
  debugLog("userApiKeyService", "User LLM API key deleted", { userId, provider, action: "llm_key_delete" });
  auditLogger.log({
    eventType: "user_llm_key_deleted",
    userId,
    endpoint: "userApiKeyService.deleteUserApiKey",
    requestPayload: { provider },
  });
}

/**
 * Decrypt and return a user's API key for a specific provider.
 * Returns null if no key exists or decryption fails.
 *
 * INTERNAL ONLY — never expose via tRPC or HTTP endpoint.
 */
export async function decryptUserApiKey(
  userId: number,
  provider: string,
): Promise<string | null> {
  const db = await getDb();
  if (!db) throw new Error("Database not initialized");

  const rows = await db
    .select({ apiKeyEncrypted: userLlmApiKeys.apiKeyEncrypted })
    .from(userLlmApiKeys)
    .where(
      and(
        eq(userLlmApiKeys.userId, userId),
        eq(userLlmApiKeys.provider, provider),
      ),
    )
    .limit(1);

  if (rows.length === 0) return null;

  const decrypted = decrypt(rows[0].apiKeyEncrypted);
  if (!decrypted) return null;

  return decrypted;
}
