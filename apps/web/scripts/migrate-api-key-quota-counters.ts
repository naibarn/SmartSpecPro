import { inArray, sql } from "drizzle-orm";
import { getDb } from "../server/db";
import { getRedisClient } from "../server/services/redis";
import {
  buildLegacyQuotaImportPlan,
  currentQuotaPeriod,
  legacyCounterKey,
  legacyWarningKey,
  type LegacyQuotaWindow,
} from "../server/services/apiKeyQuotaMigration";
import { apiKeys } from "../drizzle/schema";

const APPLY = process.argv.includes("--apply");
const ROLLBACK_TO_REDIS = process.argv.includes("--rollback-to-redis");
const SCAN_COUNT = 500;
let activeRedis: ReturnType<typeof getRedisClient> | null = null;
let activeDb: ReturnType<typeof getDb> | null = null;

const REDIS_MAX_SCRIPT = `
local existing = tonumber(redis.call('GET', KEYS[1]) or '0') or 0
local incoming = tonumber(ARGV[1])
if incoming > existing then
  redis.call('SET', KEYS[1], incoming, 'EX', ARGV[2])
  return incoming
end
local ttl = redis.call('TTL', KEYS[1])
if ttl < tonumber(ARGV[2]) then redis.call('EXPIRE', KEYS[1], ARGV[2]) end
return existing
`;

function rowsOf<T>(result: unknown): T[] {
  if (Array.isArray(result)) return result as T[];
  const rows = (result as { rows?: unknown } | null)?.rows;
  return Array.isArray(rows) ? (rows as T[]) : [];
}

async function migratePostgresCountersBackToRedis(
  db: ReturnType<typeof getDb>,
  redis: ReturnType<typeof getRedisClient>
): Promise<void> {
  if (
    APPLY &&
    (process.env.G3_QUOTA_PG_WRITERS_PAUSED !== "true" ||
      process.env.G3_QUOTA_ROLLBACK_CONFIRM !==
        "restore-pg-api-key-quotas-to-redis")
  ) {
    throw new Error(
      "Rollback apply requires G3_QUOTA_PG_WRITERS_PAUSED=true and the exact G3_QUOTA_ROLLBACK_CONFIRM value"
    );
  }

  const selected = await db.execute(sql`
    SELECT "apiKeyId", "window", "periodKey", "requestCount", "warnedAt", "expiresAt"
    FROM api_key_quota_counters
    WHERE "expiresAt" > now()
  `);
  const now = new Date();
  const activeRows = rowsOf<{
    apiKeyId: string;
    window: LegacyQuotaWindow;
    periodKey: string;
    requestCount: number | string;
    warnedAt: Date | string | null;
    expiresAt: Date | string;
  }>(selected).filter(
    row => row.periodKey === currentQuotaPeriod(row.window, now)
  );
  console.log(
    JSON.stringify({
      mode: APPLY ? "rollback-to-redis-apply" : "rollback-to-redis-dry-run",
      active_postgresql_rows: activeRows.length,
      warned_rows: activeRows.filter(row => row.warnedAt !== null).length,
      identifiers_logged: false,
    })
  );
  if (!APPLY) return;

  for (const row of activeRows) {
    const remainingSeconds = Math.ceil(
      (new Date(row.expiresAt).getTime() - now.getTime()) / 1000
    );
    const ttl = Math.max(1, remainingSeconds);
    const counterKey = legacyCounterKey(
      row.apiKeyId,
      row.window,
      row.periodKey
    );
    const restoredCount = Number(
      await redis.eval(REDIS_MAX_SCRIPT, 1, counterKey, row.requestCount, ttl)
    );
    if (
      !Number.isSafeInteger(restoredCount) ||
      restoredCount < Number(row.requestCount)
    ) {
      throw new Error("Redis rollback counter verification failed");
    }
    if (row.warnedAt !== null) {
      await redis.set(
        legacyWarningKey(row.apiKeyId, row.window, row.periodKey),
        "1",
        "EX",
        ttl
      );
      if (
        (await redis.get(
          legacyWarningKey(row.apiKeyId, row.window, row.periodKey)
        )) !== "1"
      ) {
        throw new Error("Redis rollback warning verification failed");
      }
    }
  }
  console.log(
    JSON.stringify({ restored_rows: activeRows.length, max_preserving: true })
  );
}

async function readCounterSnapshot(): Promise<{
  counterKeys: Array<{ key: string; value: string | null; ttlSeconds: number }>;
  warningKeys: Array<{ key: string; value: string | null }>;
}> {
  const redis = getRedisClient();
  const readPattern = async (match: string, includeTtl: boolean) => {
    let cursor = "0";
    const entries: Array<{
      key: string;
      value: string | null;
      ttlSeconds?: number;
    }> = [];
    do {
      const [next, keys] = await redis.scan(
        cursor,
        "MATCH",
        match,
        "COUNT",
        SCAN_COUNT
      );
      cursor = next;
      const pipeline = redis.pipeline();
      for (const key of keys) {
        pipeline.get(key);
        if (includeTtl) pipeline.ttl(key);
      }
      const results = keys.length ? await pipeline.exec() : [];
      if (!results)
        throw new Error("Redis snapshot pipeline returned no result");
      for (let index = 0; index < keys.length; index++) {
        const [valueError, value] = results[index * (includeTtl ? 2 : 1)];
        if (valueError) throw valueError;
        const entry: {
          key: string;
          value: string | null;
          ttlSeconds?: number;
        } = {
          key: keys[index],
          value: value as string | null,
        };
        if (includeTtl) {
          const [ttlError, ttl] = results[index * 2 + 1];
          if (ttlError) throw ttlError;
          entry.ttlSeconds = Number(ttl);
        }
        entries.push(entry);
      }
    } while (cursor !== "0");
    return entries;
  };

  const [counters, warnings] = await Promise.all([
    readPattern("quota:apikey:*", true),
    readPattern("quota:warn:*", false),
  ]);
  return {
    counterKeys: counters
      .filter(
        (entry): entry is typeof entry & { ttlSeconds: number } =>
          typeof entry.ttlSeconds === "number"
      )
      .filter(entry => entry.value !== null && entry.ttlSeconds !== -2),
    warningKeys: warnings,
  };
}

async function main(): Promise<void> {
  if (APPLY && ROLLBACK_TO_REDIS) {
    if (
      process.env.G3_QUOTA_PG_WRITERS_PAUSED !== "true" ||
      process.env.G3_QUOTA_ROLLBACK_CONFIRM !==
        "restore-pg-api-key-quotas-to-redis"
    ) {
      throw new Error(
        "Rollback apply requires G3_QUOTA_PG_WRITERS_PAUSED=true and the exact G3_QUOTA_ROLLBACK_CONFIRM value"
      );
    }
  }
  if (
    APPLY &&
    !ROLLBACK_TO_REDIS &&
    (process.env.G3_QUOTA_WRITERS_PAUSED !== "true" ||
      process.env.G3_QUOTA_IMPORT_CONFIRM !== "apply-active-api-key-quotas")
  ) {
    throw new Error(
      "Apply requires G3_QUOTA_WRITERS_PAUSED=true and the exact G3_QUOTA_IMPORT_CONFIRM value"
    );
  }

  const redis = getRedisClient();
  const db = getDb();
  activeRedis = redis;
  activeDb = db;
  if (ROLLBACK_TO_REDIS) {
    await migratePostgresCountersBackToRedis(db, redis);
    await redis.quit();
    await db.$client.end({ timeout: 5 });
    activeRedis = null;
    activeDb = null;
    return;
  }
  const { counterKeys, warningKeys } = await readCounterSnapshot();
  const apiKeyIds = Array.from(
    new Set(
      counterKeys
        .map(({ key }) => key.split(":")[2])
        .filter((id): id is string => Boolean(id))
    )
  );
  const keyRows = apiKeyIds.length
    ? await db
        .select({ id: apiKeys.id, tenantId: apiKeys.tenantId })
        .from(apiKeys)
        .where(inArray(apiKeys.id, apiKeyIds))
    : [];
  const tenantByApiKeyId = new Map(keyRows.map(row => [row.id, row.tenantId]));

  const plan = buildLegacyQuotaImportPlan({
    counterKeys,
    warningKeys,
    tenantByApiKeyId,
    now: new Date(),
  });
  const blockers =
    plan.malformedKeys + plan.orphanWarnings + plan.unknownApiKeys;
  console.log(
    JSON.stringify({
      mode: APPLY ? "apply" : "dry-run",
      scanned_counter_keys: counterKeys.length,
      scanned_warning_keys: warningKeys.length,
      active_rows: plan.rows.length,
      active_warning_flags: plan.rows.filter(row => row.warned).length,
      stale_period_counters_ignored: plan.staleCounters,
      malformed_keys: plan.malformedKeys,
      orphan_warning_flags: plan.orphanWarnings,
      counters_for_unknown_api_keys: plan.unknownApiKeys,
      blockers,
      identifiers_logged: false,
    })
  );

  if (blockers > 0) {
    throw new Error(
      "Quota counter snapshot is ambiguous; no rows were imported"
    );
  }
  if (!APPLY) {
    await redis.quit();
    await db.$client.end({ timeout: 5 });
    activeRedis = null;
    activeDb = null;
    return;
  }

  await db.transaction(async tx => {
    await tx.execute(sql`SET LOCAL lock_timeout = '5s'`);
    await tx.execute(sql`SET LOCAL statement_timeout = '60s'`);
    for (const row of plan.rows) {
      const result = await tx.execute(sql`
        SELECT pg_advisory_xact_lock(hashtextextended(${row.apiKeyId}, 0))
      `);
      void result;
      const upsert = await tx.execute(sql`
        INSERT INTO api_key_quota_counters
          ("tenantId", "apiKeyId", "window", "periodKey", "requestCount", "warnedAt", "expiresAt", "updatedAt")
        VALUES (
          ${row.tenantId}, ${row.apiKeyId}, ${row.window}, ${row.periodKey},
          ${row.requestCount}, ${row.warned ? new Date().toISOString() : null},
          ${row.expiresAt.toISOString()}, now()
        )
        ON CONFLICT ("apiKeyId", "window", "periodKey")
        DO UPDATE SET
          "requestCount" = GREATEST(api_key_quota_counters."requestCount", EXCLUDED."requestCount"),
          "warnedAt" = COALESCE(api_key_quota_counters."warnedAt", EXCLUDED."warnedAt"),
          "expiresAt" = GREATEST(api_key_quota_counters."expiresAt", EXCLUDED."expiresAt"),
          "updatedAt" = now()
        WHERE api_key_quota_counters."tenantId" = EXCLUDED."tenantId"
        RETURNING 1
      `);
      const inserted = Array.isArray(upsert) ? upsert : upsert.rows;
      if (!inserted.length) {
        throw new Error(
          "Quota import tenant ownership mismatch; transaction rolled back"
        );
      }
    }
  });
  console.log(
    JSON.stringify({ imported_rows: plan.rows.length, idempotent: true })
  );
  await redis.quit();
  await db.$client.end({ timeout: 5 });
  activeRedis = null;
  activeDb = null;
}

main().catch(error => {
  console.error(
    "Quota counter migration failed; details omitted to avoid identifier leakage.",
    JSON.stringify({
      name: error instanceof Error ? error.name : "unknown",
      code:
        typeof error === "object" && error !== null && "cause" in error
          ? (error as { cause?: { code?: unknown } }).cause?.code
          : undefined,
    })
  );
  activeRedis?.disconnect();
  if (activeDb) void activeDb.$client.end({ timeout: 2 });
  process.exitCode = 1;
});
