import { createHash } from "node:crypto";
import { and, eq, gt, sql } from "drizzle-orm";
import { authLoginFailureCounters } from "../../drizzle/schema";
import { normalizeAuthEmail } from "./emailNormalization";
import { getDb, type DrizzleDB } from "../db";

export const LOGIN_FAILURE_THRESHOLD = 5;
export const LOGIN_FAILURE_WINDOW_SECONDS = 15 * 60;

function hashEmail(email: string): string {
  const normalized = normalizeAuthEmail(email);
  if (!normalized || Buffer.byteLength(normalized, "utf8") > 320) throw new Error("Invalid login identity");
  return createHash("sha256").update(normalized, "utf8").digest("hex");
}

export function createLoginFailureCounterStore(db: DrizzleDB) {
  return {
    async isLocked(email: string, now = new Date()): Promise<boolean> {
      const [row] = await db.select({ failureCount: authLoginFailureCounters.failureCount })
        .from(authLoginFailureCounters)
        .where(and(
          eq(authLoginFailureCounters.emailHash, hashEmail(email)),
          gt(authLoginFailureCounters.expiresAt, now),
        )).limit(1);
      return (row?.failureCount ?? 0) >= LOGIN_FAILURE_THRESHOLD;
    },

    async recordFailure(email: string, now = new Date()): Promise<number> {
      const expiresAt = new Date(now.getTime() + LOGIN_FAILURE_WINDOW_SECONDS * 1000);
      const [row] = await db.insert(authLoginFailureCounters).values({
        emailHash: hashEmail(email),
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
        .where(eq(authLoginFailureCounters.emailHash, hashEmail(email)));
    },
  };
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
