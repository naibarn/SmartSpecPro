import { and, count, eq, gt, lte, sql } from "drizzle-orm";
import { ephemeralAuthorizationSessions } from "../../drizzle/schema";
import { getDb, type DrizzleDB } from "../db";
import { hashJti } from "../_core/revocation";
import { decryptAuthorizationSession, encryptAuthorizationSession, EphemeralAuthorizationStoreError, getActiveAuthorizationSessionKeyId } from "./authorizationSessionCrypto";

export { EphemeralAuthorizationStoreError } from "./authorizationSessionCrypto";

const MAX_TTL_SECONDS = 30 * 24 * 60 * 60;

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
        sessionJson: encryptAuthorizationSession(session),
        expiresAt,
        createdAt: now,
        updatedAt: now,
      }).onConflictDoUpdate({
        target: ephemeralAuthorizationSessions.deviceCodeHash,
        set: {
          userCodeHash: session.userCode ? hashJti(session.userCode) : null,
          sessionJson: encryptAuthorizationSession(session),
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
      return row ? decryptAuthorizationSession<T>(row.sessionJson) : null;
    },

    async getByUserCode<T>(userCode: string): Promise<T | null> {
      const [row] = await withStoreError(() => db.select({ sessionJson: ephemeralAuthorizationSessions.sessionJson })
        .from(ephemeralAuthorizationSessions)
        .where(and(eq(ephemeralAuthorizationSessions.userCodeHash, hashJti(userCode)), gt(ephemeralAuthorizationSessions.expiresAt, new Date())))
        .limit(1));
      return row ? decryptAuthorizationSession<T>(row.sessionJson) : null;
    },

    async cleanupExpired(now = new Date()): Promise<number> {
      const deleted = await withStoreError(() => db.delete(ephemeralAuthorizationSessions)
        .where(lte(ephemeralAuthorizationSessions.expiresAt, now))
        .returning({ deviceCodeHash: ephemeralAuthorizationSessions.deviceCodeHash }));
      return deleted.length;
    },

    async rotateEncryptionKeyBatch(batchSize = 100): Promise<{ scanned: number; rotated: number }> {
      const activeKeyId = getActiveAuthorizationSessionKeyId();
      if (!Number.isInteger(batchSize) || batchSize < 1 || batchSize > 500) throw new Error("Invalid rotation batch size");
      return withStoreError(async () => {
        const rows = await db.select().from(ephemeralAuthorizationSessions)
          .where(and(gt(ephemeralAuthorizationSessions.expiresAt, new Date()), sql`${ephemeralAuthorizationSessions.sessionJson}->>'keyId' IS DISTINCT FROM ${activeKeyId}`))
          .limit(batchSize);
        let rotated = 0;
        for (const row of rows) {
          const payload = decryptAuthorizationSession<unknown>(row.sessionJson);
          const nextJson = encryptAuthorizationSession(payload);
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
      const activeKeyId = getActiveAuthorizationSessionKeyId();
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
