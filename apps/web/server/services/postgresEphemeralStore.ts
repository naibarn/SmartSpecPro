import { createHash } from "node:crypto";
import { sql } from "drizzle-orm";
import { getDb } from "../db";

function hashKey(key: string): string {
  return createHash("sha256").update(key).digest("hex");
}

export async function readEphemeralValue<T>(namespace: string, key: string): Promise<T | null> {
  const result = await getDb().execute(sql<Array<{ value: T }>>`
    SELECT value FROM runtime_ephemeral_values
    WHERE namespace = ${namespace} AND key_hash = ${hashKey(key)} AND expires_at > now()
  `);
  return result[0]?.value ?? null;
}

/** Read a bounded namespace projection for owner-filtered history surfaces. */
export async function listEphemeralValues<T>(
  namespace: string,
  limit = 500,
): Promise<T[]> {
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 5_000) {
    throw new Error("EPHEMERAL_VALUE_LIMIT_INVALID");
  }
  const result = await getDb().execute(sql<Array<{ value: T }>>`
    SELECT value FROM runtime_ephemeral_values
    WHERE namespace = ${namespace} AND expires_at > now()
    ORDER BY created_at DESC
    LIMIT ${limit}
  `);
  return result.map(row => row.value);
}

export async function deleteEphemeralValue(namespace: string, key: string): Promise<void> {
  await getDb().execute(sql`
    DELETE FROM runtime_ephemeral_values
    WHERE namespace = ${namespace} AND key_hash = ${hashKey(key)}
  `);
}

export async function incrementEphemeralValue(
  namespace: string,
  key: string,
  ttlSeconds: number,
): Promise<number> {
  if (!Number.isSafeInteger(ttlSeconds) || ttlSeconds < 1) {
    throw new Error("EPHEMERAL_VALUE_TTL_INVALID");
  }
  const result = await getDb().execute(sql<Array<{ value: number }>>`
    INSERT INTO runtime_ephemeral_values (namespace, key_hash, value, expires_at)
    VALUES (${namespace}, ${hashKey(key)}, '1'::jsonb, now() + (${ttlSeconds} * interval '1 second'))
    ON CONFLICT (namespace, key_hash) DO UPDATE SET
      value = CASE
        WHEN runtime_ephemeral_values.expires_at <= now() THEN '1'::jsonb
        ELSE to_jsonb(COALESCE(NULLIF(runtime_ephemeral_values.value #>> '{}', '')::bigint, 0) + 1)
      END,
      expires_at = now() + (${ttlSeconds} * interval '1 second'),
      created_at = now()
    RETURNING (value #>> '{}')::bigint AS value
  `);
  return Number(result[0]?.value ?? 0);
}

export async function readEphemeralValueWithTtl<T>(namespace: string, key: string): Promise<{ value: T; ttlSeconds: number } | null> {
  const result = await getDb().execute(sql<Array<{ value: T; ttl_seconds: number }>>`
    SELECT value, GREATEST(0, CEIL(EXTRACT(EPOCH FROM (expires_at - now()))))::int AS ttl_seconds
    FROM runtime_ephemeral_values
    WHERE namespace = ${namespace} AND key_hash = ${hashKey(key)} AND expires_at > now()
  `);
  const row = result[0];
  return row ? { value: row.value, ttlSeconds: row.ttl_seconds } : null;
}

export async function putEphemeralValue(
  namespace: string,
  key: string,
  value: unknown,
  ttlSeconds: number,
): Promise<void> {
  if (!Number.isSafeInteger(ttlSeconds) || ttlSeconds < 1) {
    throw new Error("EPHEMERAL_VALUE_TTL_INVALID");
  }
  await getDb().execute(sql`
    INSERT INTO runtime_ephemeral_values (namespace, key_hash, value, expires_at)
    VALUES (${namespace}, ${hashKey(key)}, ${JSON.stringify(value)}::jsonb, now() + (${ttlSeconds} * interval '1 second'))
    ON CONFLICT (namespace, key_hash) DO UPDATE SET
      value = EXCLUDED.value,
      expires_at = EXCLUDED.expires_at,
      created_at = now()
  `);
}

export async function putEphemeralValueIfOwned(
  namespace: string,
  key: string,
  owner: unknown,
  value: unknown,
  ttlSeconds: number,
): Promise<boolean> {
  if (!Number.isSafeInteger(ttlSeconds) || ttlSeconds < 1) {
    throw new Error("EPHEMERAL_VALUE_TTL_INVALID");
  }
  const result = await getDb().execute(sql<Array<{ key_hash: string }>>`
    UPDATE runtime_ephemeral_values
    SET value = ${JSON.stringify(value)}::jsonb,
        expires_at = now() + (${ttlSeconds} * interval '1 second'),
        created_at = now()
    WHERE namespace = ${namespace} AND key_hash = ${hashKey(key)}
      AND value = ${JSON.stringify(owner)}::jsonb AND expires_at > now()
    RETURNING key_hash
  `);
  return result.length > 0;
}

export async function deleteEphemeralValueIfOwned(namespace: string, key: string, owner: unknown): Promise<boolean> {
  const result = await getDb().execute(sql<Array<{ key_hash: string }>>`
    DELETE FROM runtime_ephemeral_values
    WHERE namespace = ${namespace} AND key_hash = ${hashKey(key)}
      AND value = ${JSON.stringify(owner)}::jsonb
    RETURNING key_hash
  `);
  return result.length > 0;
}

export async function putEphemeralValueIfAbsent(
  namespace: string,
  key: string,
  value: unknown,
  ttlSeconds: number,
): Promise<boolean> {
  if (!Number.isSafeInteger(ttlSeconds) || ttlSeconds < 1) {
    throw new Error("EPHEMERAL_VALUE_TTL_INVALID");
  }
  const result = await getDb().execute(sql<Array<{ key_hash: string }>>`
    INSERT INTO runtime_ephemeral_values (namespace, key_hash, value, expires_at)
    VALUES (${namespace}, ${hashKey(key)}, ${JSON.stringify(value)}::jsonb, now() + (${ttlSeconds} * interval '1 second'))
    ON CONFLICT (namespace, key_hash) DO UPDATE SET
      value = EXCLUDED.value,
      expires_at = EXCLUDED.expires_at,
      created_at = now()
    WHERE runtime_ephemeral_values.expires_at <= now()
    RETURNING key_hash
  `);
  if (Math.random() < 0.01) {
    try {
      await getDb().execute(sql`DELETE FROM runtime_ephemeral_values WHERE expires_at <= now()`);
    } catch {
      // Expired values do not affect reads or new claims; pruning is best-effort.
    }
  }
  return result.length > 0;
}
