/**
 * Memory Maintenance Jobs
 *
 * Recurring BullMQ jobs for chat-memory housekeeping:
 * - archive cleanup
 * - chunk cleanup
 * - orphaned embedding reconciliation
 * - memory eviction
 */

import { Queue, Worker } from "bullmq";
import { sql } from "drizzle-orm";

import { getDb } from "../db";
import { getRealtimeClient } from "../services/redisClients";
import { cleanupExpiredArchives } from "../services/memoryArchiveService";
import { enqueueEmbedding } from "../services/embeddingQueue";

const QUEUE_NAME = "memory-maintenance";
const RETENTION_CATEGORY = "chat_memory_retention";
const MIN_ARCHIVE_RETENTION_DAYS = 7;
const DEFAULT_RETENTION_DAYS = 90;
const EMBEDDING_ORPHAN_LIMIT = 200;
const MEMORY_EVICTION_THRESHOLD = 500;
const MEMORY_EVICTION_SIMILARITY_THRESHOLD = 0.95;

let maintenanceQueue: Queue | null = null;
let maintenanceWorker: Worker | null = null;

type QueryRow = Record<string, unknown>;

function normalizeRows(result: unknown): QueryRow[] {
  if (Array.isArray(result)) return result as QueryRow[];
  if (result && typeof result === "object" && Array.isArray((result as { rows?: unknown[] }).rows)) {
    return (result as { rows: unknown[] }).rows as QueryRow[];
  }
  return [];
}

function toStringOrEmpty(value: unknown): string {
  if (typeof value === "string") return value;
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return "";
}

function toNumberOrDefault(value: unknown, fallback: number): number {
  const parsed = typeof value === "number"
    ? value
    : typeof value === "string"
      ? Number.parseInt(value, 10)
      : Number.NaN;
  return Number.isFinite(parsed) ? parsed : fallback;
}

function getRowId(row: QueryRow): string {
  return toStringOrEmpty(row.id ?? row.ID ?? row.recordId ?? row.memoryId ?? row["tenantId"] ?? "");
}

async function getRetentionDays(
  db: Awaited<ReturnType<typeof getDb>>,
  tenantId: string,
  settingName: string,
): Promise<number> {
  if (!db) return DEFAULT_RETENTION_DAYS;

  const tenantKey = `tenant_${tenantId}_${settingName}`;
  const rows = normalizeRows(
    await db.execute(sql`
      SELECT "key", value
      FROM system_settings
      WHERE category = ${RETENTION_CATEGORY}
        AND "key" IN (${tenantKey}, ${settingName})
    `),
  );

  const tenantRow = rows.find((row) => row.key === tenantKey);
  const globalRow = rows.find((row) => row.key === settingName);
  const rawValue = tenantRow?.value ?? globalRow?.value;
  const parsed = toNumberOrDefault(rawValue, DEFAULT_RETENTION_DAYS);
  return parsed > 0 ? parsed : DEFAULT_RETENTION_DAYS;
}

function extractCount(result: unknown): number {
  if (Array.isArray(result)) return result.length;
  if (!result || typeof result !== "object") return 0;
  const rows = (result as { rows?: unknown[] }).rows;
  if (Array.isArray(rows)) return rows.length;
  const rowCount = (result as { rowCount?: number | null }).rowCount;
  return typeof rowCount === "number" ? rowCount : 0;
}

function getCountValue(row: QueryRow): number {
  return toNumberOrDefault(
    row.count ?? row.cnt ?? row.total ?? row.remainingCount ?? row.remaining_count,
    0,
  );
}

function pickMemoryText(title: unknown, content: unknown): string {
  const normalizedTitle = toStringOrEmpty(title);
  const normalizedContent = toStringOrEmpty(content);
  return [normalizedTitle, normalizedContent].filter(Boolean).join("\n\n");
}

function mergeMemoryContent(existing: string, incoming: string): string {
  if (!incoming.trim()) return existing;
  if (!existing.trim()) return incoming;
  if (existing.includes(incoming)) return existing;
  return `${existing}\n\n[compacted duplicate]\n${incoming}`;
}

/**
 * Archive cleanup: remove expired archives per tenant.
 */
export async function executeArchiveCleanup(): Promise<{
  tenantsProcessed: number;
  archivesDeleted: number;
  durationMs: number;
  errors: string[];
}> {
  const startMs = Date.now();
  const db = await getDb();
  const errors: string[] = [];

  if (!db) {
    return { tenantsProcessed: 0, archivesDeleted: 0, durationMs: 0, errors: ["database unavailable"] };
  }

  const tenantRows = normalizeRows(
    await db.execute(sql`
      SELECT DISTINCT "tenantId"
      FROM memory_archive_metadata
      ORDER BY "tenantId"
    `),
  );

  let tenantsProcessed = 0;
  let archivesDeleted = 0;

  for (const row of tenantRows) {
    const tenantId = toStringOrEmpty(row.tenantId);
    if (!tenantId) continue;

    try {
      const retentionDays = Math.max(
        MIN_ARCHIVE_RETENTION_DAYS,
        await getRetentionDays(db, tenantId, "chat_archive_retention_days"),
      );
      const deleted = await cleanupExpiredArchives(tenantId, retentionDays);
      archivesDeleted += deleted;
      tenantsProcessed += 1;
    } catch (error) {
      const message = `archive cleanup failed for ${tenantId}: ${error instanceof Error ? error.message : String(error)}`;
      errors.push(message);
      console.error("[memoryMaintenance] archive_cleanup_failed", {
        tenantId,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  const durationMs = Date.now() - startMs;
  console.log("[memoryMaintenance] archive_cleanup_completed", {
    tenantsProcessed,
    archivesDeleted,
    durationMs,
    errors: errors.length > 0 ? errors : undefined,
  });

  return { tenantsProcessed, archivesDeleted, durationMs, errors };
}

/**
 * Chunk cleanup: remove old message chunks per tenant.
 */
export async function executeChunkCleanup(): Promise<{
  tenantsProcessed: number;
  totalDeleted: number;
  durationMs: number;
  errors: string[];
}> {
  const startMs = Date.now();
  const db = await getDb();
  const errors: string[] = [];

  if (!db) {
    return { tenantsProcessed: 0, totalDeleted: 0, durationMs: 0, errors: ["database unavailable"] };
  }

  const tenantRows = normalizeRows(
    await db.execute(sql`
      SELECT DISTINCT "tenantId"
      FROM message_chunks
      ORDER BY "tenantId"
    `),
  );

  let tenantsProcessed = 0;
  let totalDeleted = 0;

  for (const row of tenantRows) {
    const tenantId = toStringOrEmpty(row.tenantId);
    if (!tenantId) continue;

    try {
      const retentionDays = await getRetentionDays(db, tenantId, "chat_chunk_retention_days");
      const result = await db.execute(sql`
        DELETE FROM message_chunks
        WHERE "tenantId" = ${tenantId}
          AND "createdAt" < NOW() - make_interval(days => ${retentionDays})
        RETURNING id
      `);

      totalDeleted += extractCount(result);
      tenantsProcessed += 1;
    } catch (error) {
      const message = `chunk cleanup failed for ${tenantId}: ${error instanceof Error ? error.message : String(error)}`;
      errors.push(message);
      console.error("[memoryMaintenance] chunk_cleanup_failed", {
        tenantId,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  const durationMs = Date.now() - startMs;
  console.log("[memoryMaintenance] chunk_cleanup_completed", {
    tenantsProcessed,
    totalDeleted,
    durationMs,
    errors: errors.length > 0 ? errors : undefined,
  });

  return { tenantsProcessed, totalDeleted, durationMs, errors };
}

/**
 * Requeue orphaned embeddings for chunks and scoped memories.
 */
export async function executeEmbeddingReconciliation(): Promise<{
  orphanedChunks: number;
  orphanedMemories: number;
  requeuedTotal: number;
  durationMs: number;
  warnings: string[];
  errors: string[];
}> {
  const startMs = Date.now();
  const db = await getDb();
  const warnings: string[] = [];
  const errors: string[] = [];

  if (!db) {
    return {
      orphanedChunks: 0,
      orphanedMemories: 0,
      requeuedTotal: 0,
      durationMs: 0,
      warnings: ["database unavailable"],
      errors: ["database unavailable"],
    };
  }

  try {
    const chunkRows = normalizeRows(
      await db.execute(sql`
        SELECT id, content
        FROM message_chunks
        WHERE embedding IS NULL
          AND "createdAt" < NOW() - INTERVAL '1 hour'
        ORDER BY "createdAt" ASC
        LIMIT ${EMBEDDING_ORPHAN_LIMIT}
      `),
    );

    const memoryRows = normalizeRows(
      await db.execute(sql`
        SELECT id, title, content
        FROM scoped_memories
        WHERE embedding IS NULL
          AND "createdAt" < NOW() - INTERVAL '1 hour'
          AND "ownerType" = 'user'
        ORDER BY "createdAt" ASC
        LIMIT ${EMBEDDING_ORPHAN_LIMIT}
      `),
    );

    for (const row of chunkRows) {
      const recordId = getRowId(row);
      if (!recordId) continue;
      await enqueueEmbedding({
        type: "message_chunk",
        recordId,
        text: toStringOrEmpty(row.content),
      });
    }

    for (const row of memoryRows) {
      const recordId = getRowId(row);
      if (!recordId) continue;
      await enqueueEmbedding({
        type: "scoped_memory",
        recordId,
        text: pickMemoryText(row.title, row.content),
      });
    }

    const orphanedChunks = chunkRows.length;
    const orphanedMemories = memoryRows.length;
    const requeuedTotal = orphanedChunks + orphanedMemories;
    if (requeuedTotal > 50) {
      warnings.push("high orphan count");
      console.warn("[memoryMaintenance] WARN high_orphan_count", {
        orphanedChunks,
        orphanedMemories,
      });
    }

    const durationMs = Date.now() - startMs;
    console.log("[memoryMaintenance] embedding_reconciliation_completed", {
      orphanedChunks,
      orphanedMemories,
      requeuedTotal,
      durationMs,
      warnings: warnings.length > 0 ? warnings : undefined,
      errors: errors.length > 0 ? errors : undefined,
    });

    return { orphanedChunks, orphanedMemories, requeuedTotal, durationMs, warnings, errors };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    errors.push(message);
    console.error("[memoryMaintenance] embedding_reconciliation_failed", { error: message });
    return {
      orphanedChunks: 0,
      orphanedMemories: 0,
      requeuedTotal: 0,
      durationMs: Date.now() - startMs,
      warnings,
      errors,
    };
  }
}

async function compactMemoryPairs(
  db: Awaited<ReturnType<typeof getDb>>,
  tenantId: string,
  ownerId: string,
): Promise<number> {
  const pairRows = normalizeRows(
    await db.execute(sql`
      SELECT
        a.id AS "aId",
        a.title AS "aTitle",
        a.content AS "aContent",
        COALESCE(a."importance", 5) AS "aImportance",
        COALESCE(a."reinforcementCount", 0) AS "aReinforcementCount",
        b.id AS "bId",
        b.title AS "bTitle",
        b.content AS "bContent",
        COALESCE(b."importance", 5) AS "bImportance",
        COALESCE(b."reinforcementCount", 0) AS "bReinforcementCount",
        1 - (a.embedding <=> b.embedding) AS similarity
      FROM scoped_memories a, scoped_memories b
      WHERE a."tenantId" = ${tenantId}
        AND b."tenantId" = ${tenantId}
        AND a."ownerType" = 'user'
        AND b."ownerType" = 'user'
        AND a."ownerId" = ${ownerId}
        AND b."ownerId" = ${ownerId}
        AND a.id < b.id
        AND a.embedding IS NOT NULL
        AND b.embedding IS NOT NULL
        AND 1 - (a.embedding <=> b.embedding) > ${MEMORY_EVICTION_SIMILARITY_THRESHOLD}
      ORDER BY similarity DESC
      LIMIT 50
    `),
  );

  const processedIds = new Set<string>();
  const cache = new Map<string, { title: string; content: string; importance: number; reinforcementCount: number }>();
  let compacted = 0;

  const materialize = (prefix: "a" | "b", row: QueryRow) => {
    const id = toStringOrEmpty(row[`${prefix}Id`]);
    const title = toStringOrEmpty(row[`${prefix}Title`]);
    const content = toStringOrEmpty(row[`${prefix}Content`]);
    const importance = toNumberOrDefault(row[`${prefix}Importance`], 5);
    const reinforcementCount = toNumberOrDefault(row[`${prefix}ReinforcementCount`], 0);
    return { id, title, content, importance, reinforcementCount };
  };

  for (const row of pairRows) {
    const a = materialize("a", row);
    const b = materialize("b", row);
    if (!a.id || !b.id) continue;
    if (processedIds.has(a.id) || processedIds.has(b.id)) continue;

    const chooseA =
      a.importance > b.importance ||
      (a.importance === b.importance && a.reinforcementCount >= b.reinforcementCount);
    const keep = chooseA ? a : b;
    const discard = chooseA ? b : a;

    const currentKeep = cache.get(keep.id) ?? keep;
    const mergedContent = mergeMemoryContent(currentKeep.content, discard.content);

    await db.execute(sql`
      UPDATE scoped_memories
      SET content = ${mergedContent},
          "reinforcementCount" = COALESCE("reinforcementCount", 0) + 1,
          "updatedAt" = NOW()
      WHERE id = ${keep.id}
        AND "tenantId" = ${tenantId}
    `);

    await db.execute(sql`
      DELETE FROM scoped_memories
      WHERE id = ${discard.id}
        AND "tenantId" = ${tenantId}
    `);

    processedIds.add(a.id);
    processedIds.add(b.id);
    cache.set(keep.id, {
      ...currentKeep,
      content: mergedContent,
      reinforcementCount: currentKeep.reinforcementCount + 1,
    });
    compacted += 1;
  }

  return compacted;
}

/**
 * Memory eviction: expire, decay, compact, warn.
 */
export async function executeMemoryEviction(): Promise<{
  usersProcessed: number;
  expiredDeleted: number;
  decayedDeleted: number;
  compacted: number;
  durationMs: number;
  warnings: string[];
  errors: string[];
}> {
  const startMs = Date.now();
  const db = await getDb();
  const warnings: string[] = [];
  const errors: string[] = [];

  if (!db) {
    return {
      usersProcessed: 0,
      expiredDeleted: 0,
      decayedDeleted: 0,
      compacted: 0,
      durationMs: 0,
      warnings: ["database unavailable"],
      errors: ["database unavailable"],
    };
  }

  const eligibleRows = normalizeRows(
    await db.execute(sql`
      SELECT "tenantId", "ownerId", COUNT(*)::int AS count
      FROM scoped_memories
      WHERE "ownerType" = 'user'
      GROUP BY "tenantId", "ownerId"
      HAVING COUNT(*) >= ${MEMORY_EVICTION_THRESHOLD}
      ORDER BY "tenantId", "ownerId"
    `),
  );

  let usersProcessed = 0;
  let expiredDeleted = 0;
  let decayedDeleted = 0;
  let compacted = 0;

  for (const row of eligibleRows) {
    const tenantId = toStringOrEmpty(row.tenantId);
    const ownerId = toStringOrEmpty(row.ownerId);
    if (!tenantId || !ownerId) continue;

    try {
      const expiredResult = await db.execute(sql`
        DELETE FROM scoped_memories
        WHERE "tenantId" = ${tenantId}
          AND "ownerType" = 'user'
          AND "ownerId" = ${ownerId}
          AND "expiresAt" IS NOT NULL
          AND "expiresAt" < NOW()
        RETURNING id
      `);
      expiredDeleted += extractCount(expiredResult);

      const decayedResult = await db.execute(sql`
        DELETE FROM scoped_memories
        WHERE "tenantId" = ${tenantId}
          AND "ownerType" = 'user'
          AND "ownerId" = ${ownerId}
          AND COALESCE("importance", 5) < 3
          AND COALESCE("reinforcementCount", 0) = 0
          AND ("lastAccessedAt" IS NULL OR "lastAccessedAt" < NOW() - INTERVAL '30 days')
        RETURNING id
      `);
      decayedDeleted += extractCount(decayedResult);

      const userCompacted = await compactMemoryPairs(db, tenantId, ownerId);
      compacted += userCompacted;

      const remainingRows = normalizeRows(
        await db.execute(sql`
          SELECT COUNT(*)::int AS count
          FROM scoped_memories
          WHERE "tenantId" = ${tenantId}
            AND "ownerType" = 'user'
            AND "ownerId" = ${ownerId}
        `),
      );
      const remainingCount = getCountValue(remainingRows[0] ?? {});
      if (remainingCount >= MEMORY_EVICTION_THRESHOLD) {
        warnings.push(`user ${ownerId} still over threshold`);
        console.warn("[memoryMaintenance] memory_eviction_warning", {
          tenantId,
          userId: ownerId,
          remainingCount,
        });
      }

      usersProcessed += 1;
      console.log("[memoryMaintenance] memory_eviction", {
        tenantId,
        userId: ownerId,
        expired: extractCount(expiredResult),
        decayed: extractCount(decayedResult),
        compacted: userCompacted,
        remainingCount,
      });
    } catch (error) {
      const message = `memory eviction failed for ${tenantId}/${ownerId}: ${error instanceof Error ? error.message : String(error)}`;
      errors.push(message);
      console.error("[memoryMaintenance] memory_eviction_failed", {
        tenantId,
        userId: ownerId,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  const durationMs = Date.now() - startMs;
  console.log("[memoryMaintenance] memory_eviction_completed", {
    usersProcessed,
    expiredDeleted,
    decayedDeleted,
    compacted,
    durationMs,
    warnings: warnings.length > 0 ? warnings : undefined,
    errors: errors.length > 0 ? errors : undefined,
  });

  return { usersProcessed, expiredDeleted, decayedDeleted, compacted, durationMs, warnings, errors };
}

async function runMaintenanceJob(jobName: string): Promise<void> {
  switch (jobName) {
    case "archive-cleanup":
      await executeArchiveCleanup();
      return;
    case "chunk-cleanup":
      await executeChunkCleanup();
      return;
    case "embedding-reconciliation":
      await executeEmbeddingReconciliation();
      return;
    case "eviction":
      await executeMemoryEviction();
      return;
    default:
      console.warn("[memoryMaintenance] unknown_job", { jobName });
  }
}

export async function initializeMemoryMaintenanceJobs(): Promise<void> {
  if (maintenanceQueue) return;

  const redis = getRealtimeClient();

  maintenanceQueue = new Queue(QUEUE_NAME, {
    connection: redis.duplicate(),
    defaultJobOptions: {
      removeOnComplete: { count: 100 },
      removeOnFail: { count: 50 },
    },
  });

  await maintenanceQueue.upsertJobScheduler(
    "memory-archive-cleanup",
    { pattern: "0 3 * * *" },
    { name: "archive-cleanup" },
  );
  await maintenanceQueue.upsertJobScheduler(
    "memory-chunk-cleanup",
    { pattern: "30 3 * * *" },
    { name: "chunk-cleanup" },
  );
  await maintenanceQueue.upsertJobScheduler(
    "memory-embedding-reconciliation",
    { pattern: "0 4 * * *" },
    { name: "embedding-reconciliation" },
  );
  await maintenanceQueue.upsertJobScheduler(
    "memory-eviction",
    { pattern: "0 5 * * *" },
    { name: "eviction" },
  );

  maintenanceWorker = new Worker(
    QUEUE_NAME,
    async (job) => {
      await runMaintenanceJob(job.name);
    },
    {
      connection: redis.duplicate(),
      concurrency: 1,
    },
  );

  console.log("[memoryMaintenance] memory maintenance jobs initialized");
}

export async function shutdownMemoryMaintenanceJobs(): Promise<void> {
  if (maintenanceWorker) {
    await maintenanceWorker.close();
    maintenanceWorker = null;
  }
  if (maintenanceQueue) {
    await maintenanceQueue.close();
    maintenanceQueue = null;
  }
}
