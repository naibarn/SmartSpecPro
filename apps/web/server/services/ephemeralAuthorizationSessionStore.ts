import { and, eq, gt, lte } from "drizzle-orm";
import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { ephemeralAuthorizationSessions } from "../../drizzle/schema";
import { getDb, type DrizzleDB } from "../db";
import { hashJti } from "../_core/revocation";

const MAX_TTL_SECONDS = 30 * 24 * 60 * 60;

export class EphemeralAuthorizationStoreError extends Error {
  readonly code = "ephemeral_authorization_store_unavailable";
}

type EncryptedSession = { version: 1; iv: string; tag: string; ciphertext: string };

function encryptionKey(): Buffer {
  const secret = process.env.JWT_SECRET;
  if (!secret || secret.length < 32) throw new EphemeralAuthorizationStoreError("Authorization session encryption key is not configured");
  return createHash("sha256").update(secret, "utf8").digest();
}

function encryptSession(value: unknown): EncryptedSession {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(JSON.stringify(value), "utf8"), cipher.final()]);
  return { version: 1, iv: iv.toString("base64url"), tag: cipher.getAuthTag().toString("base64url"), ciphertext: ciphertext.toString("base64url") };
}

function decryptSession<T>(value: unknown): T {
  const envelope = value as EncryptedSession;
  if (!envelope || envelope.version !== 1 || !envelope.iv || !envelope.tag || !envelope.ciphertext) {
    throw new EphemeralAuthorizationStoreError("Stored authorization session has an invalid envelope");
  }
  try {
    const decipher = createDecipheriv("aes-256-gcm", encryptionKey(), Buffer.from(envelope.iv, "base64url"));
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
  };
}

export const ephemeralAuthorizationSessionStore = {
  save: <T extends { deviceCode: string; userCode?: string | null }>(session: T, ttlSeconds: number) =>
    createEphemeralAuthorizationSessionStore(getDb()).save(session, ttlSeconds),
  getByDeviceCode: <T>(deviceCode: string) =>
    createEphemeralAuthorizationSessionStore(getDb()).getByDeviceCode<T>(deviceCode),
  getByUserCode: <T>(userCode: string) =>
    createEphemeralAuthorizationSessionStore(getDb()).getByUserCode<T>(userCode),
};
