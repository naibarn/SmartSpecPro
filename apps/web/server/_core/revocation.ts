import { createHash } from "node:crypto";
import { and, eq, gt, isNull, or, sql } from "drizzle-orm";
import { revokedTokenJtis } from "../../drizzle/schema";
import { getDb, type DrizzleDB } from "../db";

export type JtiRevocationRecord = {
  jtiHash: string;
  expiresAt: Date | null;
};

export interface JtiRevocationStore {
  upsert(records: JtiRevocationRecord[]): Promise<void>;
  hasActive(jtiHash: string, now: Date): Promise<boolean>;
}

const MAX_JTI_BYTES = 512;

export function hashJti(jti: string): string {
  if (!jti || Buffer.byteLength(jti, "utf8") > MAX_JTI_BYTES) {
    throw new Error("Invalid token identifier");
  }
  return createHash("sha256").update(jti, "utf8").digest("hex");
}

function mergeRecords(records: JtiRevocationRecord[]): JtiRevocationRecord[] {
  const merged = new Map<string, JtiRevocationRecord>();
  for (const record of records) {
    const previous = merged.get(record.jtiHash);
    if (!previous || previous.expiresAt !== null && record.expiresAt === null ||
        previous.expiresAt && record.expiresAt && record.expiresAt > previous.expiresAt) {
      merged.set(record.jtiHash, record);
    }
  }
  return [...merged.values()];
}

/** PostgreSQL is the only runtime authority. Upserts are atomic across instances. */
export function createPostgresJtiRevocationStore(db: DrizzleDB): JtiRevocationStore {
  return {
    async upsert(records) {
      const values = mergeRecords(records);
      if (values.length === 0) return;
      await db.insert(revokedTokenJtis).values(values).onConflictDoUpdate({
        target: revokedTokenJtis.jtiHash,
        set: {
          // Preserve a permanent legacy revoke and never shorten a concurrent revoke.
          expiresAt: sql`CASE
            WHEN ${revokedTokenJtis.expiresAt} IS NULL OR EXCLUDED."expires_at" IS NULL THEN NULL
            ELSE GREATEST(${revokedTokenJtis.expiresAt}, EXCLUDED."expires_at")
          END`,
        },
      });
    },
    async hasActive(jtiHash, now) {
      const [record] = await db
        .select({ jtiHash: revokedTokenJtis.jtiHash })
        .from(revokedTokenJtis)
        .where(and(
          eq(revokedTokenJtis.jtiHash, jtiHash),
          or(isNull(revokedTokenJtis.expiresAt), gt(revokedTokenJtis.expiresAt, now)),
        ))
        .limit(1);
      return Boolean(record);
    },
  };
}

export function createJtiRevocationService(store: JtiRevocationStore, clock: () => number = Date.now) {
  return {
    async revokeJti(jti: string, expiresAtMs: number): Promise<void> {
      if (!Number.isFinite(expiresAtMs)) throw new Error("Invalid token expiration");
      // Preserve the prior one-second minimum for callers racing token expiry.
      const expiry = new Date(Math.max(clock() + 1_000, expiresAtMs));
      await store.upsert([{ jtiHash: hashJti(jti), expiresAt: expiry }]);
    },
    async isJtiRevoked(jti: string): Promise<boolean> {
      let digest: string;
      try {
        digest = hashJti(jti);
      } catch {
        return true;
      }
      try {
        return await store.hasActive(digest, new Date(clock()));
      } catch {
        // A revocation-store outage must never turn into an authorization allow.
        return true;
      }
    },
  };
}

export async function revokeJti(jti: string, expiresAtMs: number): Promise<void> {
  const service = createJtiRevocationService(createPostgresJtiRevocationStore(getDb()));
  await service.revokeJti(jti, expiresAtMs);
}

export async function isJtiRevoked(jti: string): Promise<boolean> {
  try {
    const service = createJtiRevocationService(createPostgresJtiRevocationStore(getDb()));
    return await service.isJtiRevoked(jti);
  } catch {
    // Database initialization/connectivity errors also fail closed.
    return true;
  }
}

/** Used by the controlled Redis-to-PostgreSQL importer; raw JTIs are never stored. */
export async function importJtiRevocationRecords(records: JtiRevocationRecord[]): Promise<void> {
  await createPostgresJtiRevocationStore(getDb()).upsert(records);
}

// Kept as a compatibility no-op for any external maintenance caller.
export function cleanupMem(): void {}
