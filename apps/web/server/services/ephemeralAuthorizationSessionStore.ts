import { and, count, eq, gt, lte, sql } from "drizzle-orm";
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { ephemeralAuthorizationSessions } from "../../drizzle/schema";
import { getDb, type DrizzleDB } from "../db";
import { hashJti } from "../_core/revocation";

const MAX_TTL_SECONDS = 30 * 24 * 60 * 60;

export class EphemeralAuthorizationStoreError extends Error {
  readonly code = "ephemeral_authorization_store_unavailable";
}

type EncryptedSession = { version: 1; keyId: string; iv: string; tag: string; ciphertext: string };

function encryptionKeyring(): { activeKeyId: string; keys: Map<string, Buffer> } {
  const activeKeyId = process.env.AUTH_SESSION_ENCRYPTION_ACTIVE_KEY_ID?.trim();
  const raw = process.env.AUTH_SESSION_ENCRYPTION_KEYS_JSON;
  if (!activeKeyId || !raw) throw new EphemeralAuthorizationStoreError("Authorization session encryption keyring is not configured");
  try {
    const parsed = JSON.parse(raw) as Record<string, string>;
    const keys = new Map<string, Buffer>();
    for (const [keyId, encoded] of Object.entries(parsed)) {
      const key = Buffer.from(encoded, "base64");
      if (!/^[A-Za-z0-9_-]{1,32}$/.test(keyId) || key.length !== 32 || key.toString("base64") !== encoded) {
        throw new Error("invalid keyring entry");
      }
      keys.set(keyId, key);
    }
    if (!keys.has(activeKeyId)) throw new Error("active key missing");
    return { activeKeyId, keys };
  } catch {
    throw new EphemeralAuthorizationStoreError("Authorization session encryption keyring is invalid");
  }
}

function encryptSession(value: unknown): EncryptedSession {
  const { activeKeyId, keys } = encryptionKeyring();
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", keys.get(activeKeyId)!, iv);
  const ciphertext = Buffer.concat([cipher.update(JSON.stringify(value), "utf8"), cipher.final()]);
  return { version: 1, keyId: activeKeyId, iv: iv.toString("base64url"), tag: cipher.getAuthTag().toString("base64url"), ciphertext: ciphertext.toString("base64url") };
}

function decryptSession<T>(value: unknown): T {
  const envelope = value as EncryptedSession;
  if (!envelope || envelope.version !== 1 || !envelope.keyId || !envelope.iv || !envelope.tag || !envelope.ciphertext) {
    throw new EphemeralAuthorizationStoreError("Stored authorization session has an invalid envelope");
  }
  try {
    const key = encryptionKeyring().keys.get(envelope.keyId);
    if (!key) throw new Error("key unavailable");
    const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(envelope.iv, "base64url"));
    decipher.setAuthTag(Buffer.from(envelope.tag, "base64url"));
    const plaintext = Buffer.concat([decipher.update(Buffer.from(envelope.ciphertext, "base64url")), decipher.final()]);
    return JSON.parse(plaintext.toString("utf8")) as T;
  } catch {
    throw new EphemeralAuthorizationStoreError("Stored authorization session could not be decrypted");
  }
}

export function createEphemeralAuthorizationSessionStore(db: DrizzleDB) {
  async function withStoreError<T>(work: () => Promise<T>): Promise<T> {
    try { return await work(); } catch (error) {
      if (error instanceof EphemeralAuthorizationStoreError) throw error;
      throw new EphemeralAuthorizationStoreError("PostgreSQL ephemeral authorization store operation failed");
    }
  }
  return {
    async save<T extends { deviceCode: string; userCode?: string | null }>(session: T, ttlSeconds: number): Promise<void> {
      if (!Number.isInteger(ttlSeconds) || ttlSeconds <= 0 || ttlSeconds > MAX_TTL_SECONDS) {
        throw new Error("Ephemeral authorization session TTL is outside policy bounds");
      }
      const now = new Date();
      const expiresAt = new Date(now.getTime() + ttlSeconds * 1000);
      await withStoreError(() => db.insert(ephemeralAuthorizationSessions).values({
        deviceCodeHash: hashJti(session.deviceCode),
        userCodeHash: session.userCode ? hashJti(session.userCode) : null,
        sessionJson: encryptSession(session),
        expiresAt,
        createdAt: now,
        updatedAt: now,
      }).onConflictDoUpdate({
        target: ephemeralAuthorizationSessions.deviceCodeHash,
        set: {
          userCodeHash: session.userCode ? hashJti(session.userCode) : null,
          sessionJson: encryptSession(session),
          expiresAt,
          updatedAt: now,
        },
      }));
    },

    async getByDeviceCode<T>(deviceCode: string): Promise<T | null> {
      const [row] = await withStoreError(() => db.select({ sessionJson: ephemeralAuthorizationSessions.sessionJson })
        .from(ephemeralAuthorizationSessions)
        .where(and(eq(ephemeralAuthorizationSessions.deviceCodeHash, hashJti(deviceCode)), gt(ephemeralAuthorizationSessions.expiresAt, new Date())))
        .limit(1));
      return row ? decryptSession<T>(row.sessionJson) : null;
    },

    async getByUserCode<T>(userCode: string): Promise<T | null> {
      const [row] = await withStoreError(() => db.select({ sessionJson: ephemeralAuthorizationSessions.sessionJson })
        .from(ephemeralAuthorizationSessions)
        .where(and(eq(ephemeralAuthorizationSessions.userCodeHash, hashJti(userCode)), gt(ephemeralAuthorizationSessions.expiresAt, new Date())))
        .limit(1));
      return row ? decryptSession<T>(row.sessionJson) : null;
    },

    async cleanupExpired(now = new Date()): Promise<number> {
      const deleted = await withStoreError(() => db.delete(ephemeralAuthorizationSessions)
        .where(lte(ephemeralAuthorizationSessions.expiresAt, now))
        .returning({ deviceCodeHash: ephemeralAuthorizationSessions.deviceCodeHash }));
      return deleted.length;
    },

    async rotateEncryptionKeyBatch(batchSize = 100): Promise<{ scanned: number; rotated: number }> {
      const { activeKeyId } = encryptionKeyring();
      if (!Number.isInteger(batchSize) || batchSize < 1 || batchSize > 500) throw new Error("Invalid rotation batch size");
      return withStoreError(async () => {
        const rows = await db.select().from(ephemeralAuthorizationSessions)
          .where(and(gt(ephemeralAuthorizationSessions.expiresAt, new Date()), sql`${ephemeralAuthorizationSessions.sessionJson}->>'keyId' IS DISTINCT FROM ${activeKeyId}`))
          .limit(batchSize);
        let rotated = 0;
        for (const row of rows) {
          const payload = decryptSession<unknown>(row.sessionJson);
          const nextJson = encryptSession(payload);
          const [updated] = await db.update(ephemeralAuthorizationSessions).set({
            sessionJson: nextJson,
            updatedAt: new Date(),
          }).where(and(
            eq(ephemeralAuthorizationSessions.deviceCodeHash, row.deviceCodeHash),
            eq(ephemeralAuthorizationSessions.updatedAt, row.updatedAt),
            sql`${ephemeralAuthorizationSessions.sessionJson}->>'keyId' IS DISTINCT FROM ${activeKeyId}`,
          )).returning({ deviceCodeHash: ephemeralAuthorizationSessions.deviceCodeHash });
          if (updated) rotated += 1;
        }
        return { scanned: rows.length, rotated };
      });
    },

    async countSessionsNeedingKeyRotation(): Promise<number> {
      const { activeKeyId } = encryptionKeyring();
      const [result] = await withStoreError(() => db.select({ total: count() })
        .from(ephemeralAuthorizationSessions)
        .where(and(gt(ephemeralAuthorizationSessions.expiresAt, new Date()), sql`${ephemeralAuthorizationSessions.sessionJson}->>'keyId' IS DISTINCT FROM ${activeKeyId}`)));
      return Number(result?.total ?? 0);
    },
  };
}

export const ephemeralAuthorizationSessionStore = {
  save: <T extends { deviceCode: string; userCode?: string | null }>(session: T, ttlSeconds: number) =>
    createEphemeralAuthorizationSessionStore(getDb()).save(session, ttlSeconds),
  getByDeviceCode: <T>(deviceCode: string) =>
    createEphemeralAuthorizationSessionStore(getDb()).getByDeviceCode<T>(deviceCode),
  getByUserCode: <T>(userCode: string) =>
    createEphemeralAuthorizationSessionStore(getDb()).getByUserCode<T>(userCode),
  rotateEncryptionKeyBatch: (batchSize?: number) =>
    createEphemeralAuthorizationSessionStore(getDb()).rotateEncryptionKeyBatch(batchSize),
  countSessionsNeedingKeyRotation: () =>
    createEphemeralAuthorizationSessionStore(getDb()).countSessionsNeedingKeyRotation(),
};
