import { createHash, randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { getDb } from "../db";

export interface SlidingWindowDecision {
  allowed: boolean;
  count: number;
  remaining: number;
  retryAfterSeconds: number | null;
}

function subjectHash(subject: string): string {
  return createHash("sha256").update(subject).digest("hex");
}

/** Consume one slot atomically across all web instances using PostgreSQL. */
export async function consumeSlidingWindow(
  namespace: string,
  subject: string,
  limit: number,
  windowSeconds: number,
  amount = 1,
): Promise<SlidingWindowDecision> {
  if (!Number.isSafeInteger(limit) || limit < 1 || !Number.isSafeInteger(windowSeconds) || windowSeconds < 1 || !Number.isSafeInteger(amount) || amount < 1) {
    throw new Error("RATE_LIMIT_CONFIGURATION_INVALID");
  }
  const hash = subjectHash(subject);
  const db = getDb();
  return db.transaction(async (tx) => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtextextended(${`${namespace}:${hash}`}, 0))`);
    await tx.execute(sql`
      DELETE FROM rate_limit_events
      WHERE namespace = ${namespace}
        AND subject_hash = ${hash}
        AND occurred_at <= now() - (${windowSeconds} * interval '1 second')
    `);
    const countResult = await tx.execute(sql<Array<{ count: string; oldest: Date | null }>>`
      SELECT count(*)::text AS count, min(occurred_at) AS oldest
      FROM rate_limit_events
      WHERE namespace = ${namespace}
        AND subject_hash = ${hash}
        AND occurred_at > now() - (${windowSeconds} * interval '1 second')
    `);
    const count = Number(countResult[0]?.count ?? 0);
    if (count + amount > limit) {
      const oldest = countResult[0]?.oldest ? new Date(countResult[0].oldest).getTime() : Date.now();
      const retryAfterSeconds = Math.max(1, Math.ceil((oldest + windowSeconds * 1000 - Date.now()) / 1000));
      return { allowed: false, count, remaining: 0, retryAfterSeconds };
    }

    for (let i = 0; i < amount; i += 1) {
      await tx.execute(sql`
        INSERT INTO rate_limit_events (namespace, subject_hash, occurred_at)
        VALUES (${namespace}, ${hash}, now())
      `);
    }
    return { allowed: true, count: count + amount, remaining: Math.max(0, limit - count - amount), retryAfterSeconds: null };
  });
}

export async function readUsageSince(namespace: string, subject: string, since: Date): Promise<number> {
  const result = await getDb().execute(sql<Array<{ units: string }>>`
    SELECT COALESCE(sum(units), 0)::text AS units
    FROM rate_limit_events
    WHERE namespace = ${namespace}
      AND subject_hash = ${subjectHash(subject)}
      AND occurred_at >= ${since}
  `);
  return Number(result[0]?.units ?? 0);
}

export async function readUsageBetween(namespace: string, subject: string, start: Date, end: Date): Promise<number> {
  if (!Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime()) || start >= end) {
    throw new Error("RATE_LIMIT_USAGE_RANGE_INVALID");
  }
  const result = await getDb().execute(sql<Array<{ units: string }>>`
    SELECT COALESCE(sum(units), 0)::text AS units
    FROM rate_limit_events
    WHERE namespace = ${namespace}
      AND subject_hash = ${subjectHash(subject)}
      AND occurred_at >= ${start}
      AND occurred_at < ${end}
  `);
  return Number(result[0]?.units ?? 0);
}

export async function readNamespaceEventCountsSince(since: Date): Promise<Array<{ namespace: string; count: number }>> {
  const result = await getDb().execute(sql<Array<{ namespace: string; count: string }>>`
    SELECT namespace, count(*)::text AS count
    FROM rate_limit_events
    WHERE occurred_at >= ${since}
    GROUP BY namespace
    ORDER BY count(*) DESC, namespace ASC
  `);
  return result.map((row) => ({ namespace: row.namespace, count: Number(row.count) }));
}

export async function readSlidingWindow(namespace: string, subject: string, windowSeconds: number): Promise<{ count: number; retryAfterSeconds: number | null }> {
  const hash = subjectHash(subject);
  const result = await getDb().execute(sql<Array<{ count: string; oldest: Date | null }>>`
    SELECT count(*)::text AS count, min(occurred_at) AS oldest
    FROM rate_limit_events
    WHERE namespace = ${namespace} AND subject_hash = ${hash}
      AND occurred_at > now() - (${windowSeconds} * interval '1 second')
  `);
  const count = Number(result[0]?.count ?? 0);
  const oldest = result[0]?.oldest ? new Date(result[0].oldest).getTime() : null;
  return {
    count,
    retryAfterSeconds: oldest == null ? null : Math.max(1, Math.ceil((oldest + windowSeconds * 1000 - Date.now()) / 1000)),
  };
}

export async function recordUsage(namespace: string, subject: string, units: number): Promise<void> {
  if (!Number.isSafeInteger(units) || units < 1) return;
  await getDb().execute(sql`
    INSERT INTO rate_limit_events (namespace, subject_hash, units, occurred_at)
    VALUES (${namespace}, ${subjectHash(subject)}, ${units}, now())
  `);
  if (Math.random() < 0.01) {
    try {
      await getDb().execute(sql`DELETE FROM rate_limit_events WHERE occurred_at < now() - interval '8 days'`);
    } catch {
      // Pruning is best-effort; quota recording itself has already succeeded.
    }
  }
}

export async function recordSequentialValue(
  namespace: string,
  subject: string,
  value: string,
  limit: number,
  windowSeconds: number,
): Promise<string[]> {
  const hash = subjectHash(subject);
  const valueHash = subjectHash(value);
  const decision = await getDb().transaction(async (tx) => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtextextended(${`${namespace}:${hash}`}, 0))`);
    await tx.execute(sql`DELETE FROM rate_limit_events WHERE namespace = ${namespace} AND subject_hash = ${hash} AND occurred_at <= now() - (${windowSeconds} * interval '1 second')`);
    await tx.execute(sql`INSERT INTO rate_limit_events (namespace, subject_hash, value_hash, occurred_at) VALUES (${namespace}, ${hash}, ${valueHash}, now())`);
    const result = await tx.execute(sql<Array<{ value_hash: string }>>`
      SELECT value_hash FROM rate_limit_events
      WHERE namespace = ${namespace} AND subject_hash = ${hash} AND occurred_at > now() - (${windowSeconds} * interval '1 second')
      ORDER BY occurred_at DESC LIMIT ${limit}
    `);
    return result.map((row) => row.value_hash);
  });
  return decision;
}

export async function consumeFixedWindow(
  namespace: string,
  subject: string,
  limit: number,
  bucketStart: Date,
): Promise<{ allowed: boolean; used: number }> {
  if (!Number.isSafeInteger(limit) || limit < 1) throw new Error("RATE_LIMIT_CONFIGURATION_INVALID");
  const hash = subjectHash(subject);
  return getDb().transaction(async (tx) => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtextextended(${`${namespace}:${hash}`}, 0))`);
    await tx.execute(sql`
      DELETE FROM rate_limit_events
      WHERE namespace = ${namespace}
        AND subject_hash = ${hash}
        AND occurred_at < ${bucketStart}
    `);
    const result = await tx.execute(sql<Array<{ units: string }>>`
      SELECT COALESCE(sum(units), 0)::text AS units
      FROM rate_limit_events
      WHERE namespace = ${namespace} AND subject_hash = ${hash} AND occurred_at >= ${bucketStart}
    `);
    const used = Number(result[0]?.units ?? 0);
    if (used >= limit) return { allowed: false, used };
    await tx.execute(sql`
      INSERT INTO rate_limit_events (namespace, subject_hash, units, occurred_at)
      VALUES (${namespace}, ${hash}, 1, now())
    `);
    return { allowed: true, used: used + 1 };
  });
}

export interface UsageCap {
  namespace: string;
  subject: string;
  limit: number;
}

/**
 * Atomically consume the same units from several independent usage caps.
 * All caps are checked before any usage rows are inserted, so a rejected
 * request cannot partially spend a session/day/month allowance.
 */
export async function consumeUsageCaps(
  caps: UsageCap[],
  units: number,
): Promise<{ allowed: boolean; exceeded?: UsageCap; used?: number }> {
  if (!Number.isSafeInteger(units) || units < 1 || caps.length === 0) {
    throw new Error("USAGE_CAP_CONFIGURATION_INVALID");
  }
  for (const cap of caps) {
    if (!cap.namespace || cap.namespace.length > 80 || !cap.subject || !Number.isSafeInteger(cap.limit) || cap.limit < 1) {
      throw new Error("USAGE_CAP_CONFIGURATION_INVALID");
    }
  }
  const scoped = caps.map((cap) => ({ ...cap, hash: subjectHash(cap.subject) }));
  const lockKeys = scoped
    .map((cap) => `${cap.namespace}:${cap.hash}`)
    .sort();

  const decision = await getDb().transaction(async (tx) => {
    // Acquire locks in a stable order to avoid deadlocks for overlapping caps.
    for (const key of lockKeys) {
      await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtextextended(${key}, 0))`);
    }
    for (const cap of scoped) {
      const result = await tx.execute(sql<Array<{ units: string }>>`
        SELECT COALESCE(sum(units), 0)::text AS units
        FROM rate_limit_events
        WHERE namespace = ${cap.namespace} AND subject_hash = ${cap.hash}
      `);
      const used = Number(result[0]?.units ?? 0);
      if (used + units > cap.limit) return { allowed: false, exceeded: cap, used };
    }
    for (const cap of scoped) {
      await tx.execute(sql`
        INSERT INTO rate_limit_events (namespace, subject_hash, units, occurred_at)
        VALUES (${cap.namespace}, ${cap.hash}, ${units}, now())
      `);
    }
    return { allowed: true };
  });
  if (Math.random() < 0.01) {
    try {
      await getDb().execute(sql`DELETE FROM rate_limit_events WHERE occurred_at < now() - interval '40 days'`);
    } catch {
      // Expired usage rows no longer affect caps; pruning is best-effort.
    }
  }
  return decision;
}

export async function acquireRateLimitSlot(
  namespace: string,
  subject: string,
  limit: number,
  ttlSeconds: number,
): Promise<string | null> {
  const hash = subjectHash(subject);
  const slotId = randomUUID();
  return getDb().transaction(async (tx) => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtextextended(${`${namespace}:${hash}`}, 0))`);
    await tx.execute(sql`DELETE FROM rate_limit_slots WHERE namespace = ${namespace} AND subject_hash = ${hash} AND expires_at <= now()`);
    const result = await tx.execute(sql<Array<{ count: string }>>`
      SELECT count(*)::text AS count FROM rate_limit_slots
      WHERE namespace = ${namespace} AND subject_hash = ${hash} AND expires_at > now()
    `);
    if (Number(result[0]?.count ?? 0) >= limit) return null;
    await tx.execute(sql`
      INSERT INTO rate_limit_slots (id, namespace, subject_hash, expires_at)
      VALUES (${slotId}::uuid, ${namespace}, ${hash}, now() + (${ttlSeconds} * interval '1 second'))
    `);
    return slotId;
  });
}

export async function releaseRateLimitSlot(slotId: string): Promise<void> {
  await getDb().execute(sql`DELETE FROM rate_limit_slots WHERE id = ${slotId}::uuid`);
}

/** Atomically claim a namespaced idempotency key until its TTL expires. */
export async function claimTtlDedupeKey(
  namespace: string,
  key: string,
  ttlSeconds: number,
): Promise<boolean> {
  if (!Number.isSafeInteger(ttlSeconds) || ttlSeconds < 1) {
    throw new Error("DEDUPE_TTL_CONFIGURATION_INVALID");
  }
  const hash = subjectHash(key);
  const inserted = await getDb().execute(sql<Array<{ key_hash: string }>>`
    INSERT INTO runtime_dedupe_keys (namespace, key_hash, expires_at)
    VALUES (${namespace}, ${hash}, now() + (${ttlSeconds} * interval '1 second'))
    ON CONFLICT (namespace, key_hash) DO UPDATE SET
      expires_at = EXCLUDED.expires_at,
      created_at = now()
    WHERE runtime_dedupe_keys.expires_at <= now()
    RETURNING key_hash
  `);
  if (Math.random() < 0.01) {
    try {
      await getDb().execute(sql`DELETE FROM runtime_dedupe_keys WHERE expires_at <= now()`);
    } catch {
      // Expired keys no longer block claims; pruning is best-effort.
    }
  }
  return inserted.length > 0;
}
