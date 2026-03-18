import { eq, and } from "drizzle-orm";
import { getDb } from "../db";
import { userLlmApiKeys } from "../../drizzle/schema";
import { encrypt, decrypt } from "./crypto";

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
  if (!apiKey || apiKey.length < 8) {
    throw new Error("API key must be at least 8 characters");
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
