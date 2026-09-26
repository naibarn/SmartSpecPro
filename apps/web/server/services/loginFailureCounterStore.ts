import { createHash } from "node:crypto";
import { and, eq, gt, inArray, isNull, or, sql } from "drizzle-orm";
import { authLoginFailureCounters } from "../../drizzle/schema";
import { normalizeAuthEmail } from "./emailNormalization";
import { getDb, type DrizzleDB } from "../db";

export const LOGIN_FAILURE_THRESHOLD = 5;
export const LOGIN_FAILURE_WINDOW_SECONDS = 15 * 60;

export function hashNormalizedAuthEmail(email: string): string {
  const normalized = normalizeAuthEmail(email);
  if (!normalized || Buffer.byteLength(normalized, "utf8") > 320) throw new Error("Invalid login identity");
  return createHash("sha256").update(normalized, "utf8").digest("hex");
}

export type LoginFailureCounterImport = { email: string; failureCount: number; expiresAt: Date | null };

export function createLoginFailureCounterStore(db: DrizzleDB) {
  return {
    async isLocked(email: string, now = new Date()): Promise<boolean> {
      const [row] = await db.select({ failureCount: authLoginFailureCounters.failureCount })
        .from(authLoginFailureCounters)
        .where(and(
          eq(authLoginFailureCounters.emailHash, hashNormalizedAuthEmail(email)),
          or(isNull(authLoginFailureCounters.expiresAt), gt(authLoginFailureCounters.expiresAt, now)),
        )).limit(1);
      return (row?.failureCount ?? 0) >= LOGIN_FAILURE_THRESHOLD;
    },

    async recordFailure(email: string, now = new Date()): Promise<number> {
      const expiresAt = new Date(now.getTime() + LOGIN_FAILURE_WINDOW_SECONDS * 1000);
      const [row] = await db.insert(authLoginFailureCounters).values({
        emailHash: hashNormalizedAuthEmail(email),
        failureCount: 1,
        expiresAt,
        updatedAt: now,
      }).onConflictDoUpdate({
        target: authLoginFailureCounters.emailHash,
        set: {
          failureCount: sql`CASE
            WHEN ${authLoginFailureCounters.expiresAt} <= ${now.toISOString()}::timestamptz THEN 1
            ELSE ${authLoginFailureCounters.failureCount} + 1
          END`,
          expiresAt,
          updatedAt: now,
        },
      }).returning({ failureCount: authLoginFailureCounters.failureCount });
      return row.failureCount;
    },

    async clear(email: string): Promise<void> {
      await db.delete(authLoginFailureCounters)
        .where(eq(authLoginFailureCounters.emailHash, hashNormalizedAuthEmail(email)));
    },

    async importActive(records: LoginFailureCounterImport[]): Promise<void> {
      const merged = new Map<string, { emailHash: string; failureCount: number; expiresAt: Date | null; updatedAt: Date }>();
      const now = new Date();
      for (const record of records) {
        if (!Number.isSafeInteger(record.failureCount) || record.failureCount < 1) continue;
        if (record.expiresAt && record.expiresAt <= now) continue;
        const emailHash = hashNormalizedAuthEmail(record.email);
        const prior = merged.get(emailHash);
        merged.set(emailHash, {
          emailHash,
          failureCount: Math.max(prior?.failureCount ?? 0, record.failureCount),
          expiresAt: prior?.expiresAt === null || record.expiresAt === null
            ? null
            : prior?.expiresAt && record.expiresAt
              ? new Date(Math.max(prior.expiresAt.getTime(), record.expiresAt.getTime()))
              : prior?.expiresAt ?? record.expiresAt,
          updatedAt: now,
        });
      }
      for (let offset = 0; offset < merged.size; offset += 250) {
        const batch = [...merged.values()].slice(offset, offset + 250);
        if (!batch.length) continue;
        await db.insert(authLoginFailureCounters).values(batch).onConflictDoUpdate({
          target: authLoginFailureCounters.emailHash,
          set: {
            failureCount: sql`GREATEST(${authLoginFailureCounters.failureCount}, EXCLUDED."failure_count")`,
            expiresAt: sql`CASE WHEN ${authLoginFailureCounters.expiresAt} IS NULL OR EXCLUDED."expires_at" IS NULL THEN NULL ELSE GREATEST(${authLoginFailureCounters.expiresAt}, EXCLUDED."expires_at") END`,
            updatedAt: now,
          },
        });
      }
    },
  };
}

export async function importLoginFailureCounters(records: LoginFailureCounterImport[]): Promise<void> {
  const db = getDb();
  await createLoginFailureCounterStore(db).importActive(records);
  const now = new Date();
  for (let offset = 0; offset < records.length; offset += 250) {
    const batch = records.slice(offset, offset + 250).filter((row) => row.expiresAt === null || row.expiresAt > now);
    if (!batch.length) continue;
    const hashes = batch.map((row) => hashNormalizedAuthEmail(row.email));
    const stored = await db.select({ emailHash: authLoginFailureCounters.emailHash, failureCount: authLoginFailureCounters.failureCount, expiresAt: authLoginFailureCounters.expiresAt })
      .from(authLoginFailureCounters).where(inArray(authLoginFailureCounters.emailHash, hashes));
    const byHash = new Map(stored.map((row) => [row.emailHash, row]));
    for (const record of batch) {
      const row = byHash.get(hashNormalizedAuthEmail(record.email));
      if (!row || row.failureCount < record.failureCount ||
          record.expiresAt === null && row.expiresAt !== null ||
          record.expiresAt !== null && row.expiresAt !== null && row.expiresAt < record.expiresAt) {
        throw new Error("Imported account lockout reconciliation failed");
      }
    }
  }
}

export async function isAccountLocked(email: string): Promise<boolean> {
  return createLoginFailureCounterStore(getDb()).isLocked(email);
}

export async function recordFailedLogin(email: string): Promise<number> {
  return createLoginFailureCounterStore(getDb()).recordFailure(email);
}

export async function clearFailedLoginCounter(email: string): Promise<void> {
  return createLoginFailureCounterStore(getDb()).clear(email);
}
