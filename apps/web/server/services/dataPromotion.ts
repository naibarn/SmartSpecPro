import { createHash, randomUUID } from "node:crypto";
import { and, eq, sql } from "drizzle-orm";

import { getDb } from "../db";
import { dataPromotionBatches, dataPromotions } from "../../drizzle/schema";
import { assertPromotionChangeFeed, validateChangeBatch, type PromotionChangeFeed } from "./promotionChangeFeed";

export type PromotionActor = { actorId: number; authorizationScope: string };
export type PromotionAdapter = {
  applyBatch(input: { promotionId: string; batchId: string; changes: Awaited<ReturnType<PromotionChangeFeed["readBatch"]>>["changes"] }): Promise<{ targetWatermark: string; rowCount: number; digest: string }>;
};

const PROMOTION_BATCH_LEASE_MS = 60_000;

type PromotionBatchLease = {
  id: string;
  promotionId: string;
  startWatermark: string | null;
  fencingVersion: number;
  leaseToken: string;
};

function leaseTokenHash(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

function errorText(error: unknown, fallback: string): string {
  return (error instanceof Error ? error.message : fallback).replace(/[\u0000-\u001f\u007f]/g, " ").slice(0, 1000);
}

function isAmbiguousError(error: unknown): boolean {
  return Boolean(error && typeof error === "object" && (error as { ambiguous?: boolean }).ambiguous === true);
}

function hash(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value), "utf8").digest("hex");
}

export async function createPromotion(input: PromotionActor & {
  environment: string;
  sourceIdentity: string;
  targetIdentity: string;
  mode: "logical_replication" | "ordered_change_feed";
  manifestVersion: string;
  schemaVersion: string;
  controlId?: string;
}) {
  if (input.sourceIdentity === input.targetIdentity) throw new Error("PROMOTION_IDENTITY_MISMATCH");
  const database = await getDb();
  if (!database) throw new Error("DATABASE_UNAVAILABLE");
  const id = randomUUID();
  const [promotion] = await database.insert(dataPromotions).values({
    id, controlId: input.controlId ?? null, environment: input.environment,
    sourceIdentity: input.sourceIdentity, targetIdentity: input.targetIdentity,
    mode: input.mode, phase: "snapshot", manifestVersion: input.manifestVersion,
    schemaVersion: input.schemaVersion, fencingVersion: 0, validationState: "unknown",
    credentialState: "not_copied",
  }).returning();
  return promotion;
}

export async function recordPromotionBatch(input: {
  promotionId: string;
  batchKey: string;
  tableName: string;
  operation: string;
  partitionKey?: string;
  startWatermark?: string;
}) {
  const database = await getDb();
  if (!database) throw new Error("DATABASE_UNAVAILABLE");
  const id = randomUUID();
  await database.insert(dataPromotionBatches).values({
    id, promotionId: input.promotionId, batchKey: input.batchKey,
    tableName: input.tableName, partitionKey: input.partitionKey ?? null,
    operation: input.operation, startWatermark: input.startWatermark ?? null,
    status: "pending", attempt: 0,
  }).onConflictDoNothing();
  const [batch] = await database.select().from(dataPromotionBatches)
    .where(and(eq(dataPromotionBatches.promotionId, input.promotionId), eq(dataPromotionBatches.batchKey, input.batchKey))).limit(1);
  if (!batch) throw new Error("PROMOTION_BATCH_NOT_FOUND");
  return batch;
}

/**
 * Claim one ordered promotion batch without holding a database transaction
 * across feed/target calls. A stale running lease is ambiguous because the
 * previous runner may already have committed the target, so it is quarantined
 * instead of being replayed blindly.
 */
async function acquirePromotionBatch(input: { promotionId: string; batchKey: string }): Promise<PromotionBatchLease | { completed: true; batch: any }> {
  const database = await getDb();
  if (!database) throw new Error("DATABASE_UNAVAILABLE");
  return database.transaction(async (tx: any) => {
    const [promotion] = await tx.select({ id: dataPromotions.id, sourceWatermark: dataPromotions.sourceWatermark })
      .from(dataPromotions).where(eq(dataPromotions.id, input.promotionId)).for("update").limit(1);
    if (!promotion) throw new Error("PROMOTION_NOT_FOUND");

    await tx.insert(dataPromotionBatches).values({
      id: randomUUID(), promotionId: input.promotionId, batchKey: input.batchKey,
      tableName: "change-feed", operation: "apply", startWatermark: promotion.sourceWatermark ?? null,
      status: "pending", attempt: 0,
    }).onConflictDoNothing();
    const [batch] = await tx.select().from(dataPromotionBatches)
      .where(and(eq(dataPromotionBatches.promotionId, input.promotionId), eq(dataPromotionBatches.batchKey, input.batchKey)))
      .for("update").limit(1);
    if (!batch) throw new Error("PROMOTION_BATCH_NOT_FOUND");
    if (batch.status === "completed") return { completed: true, batch };
    if (batch.status === "quarantined") throw new Error("PROMOTION_BATCH_QUARANTINED");
    if (batch.status === "running") {
      const leaseIsLive = batch.leaseExpiresAt && batch.leaseExpiresAt.getTime() > Date.now();
      if (leaseIsLive) throw new Error("PROMOTION_BATCH_IN_PROGRESS");
      await tx.update(dataPromotionBatches).set({
        status: "quarantined", safeError: "PROMOTION_BATCH_LEASE_EXPIRED_AMBIGUOUS",
        leaseTokenHash: null, leaseExpiresAt: null, updatedAt: new Date(),
      }).where(and(eq(dataPromotionBatches.id, batch.id), eq(dataPromotionBatches.status, "running")));
      throw new Error("PROMOTION_BATCH_LEASE_EXPIRED_AMBIGUOUS");
    }
    if (batch.status !== "pending" && batch.status !== "failed") throw new Error("PROMOTION_BATCH_NOT_RUNNABLE");
    if ((batch.startWatermark ?? null) !== (promotion.sourceWatermark ?? null)) {
      await tx.update(dataPromotionBatches).set({
        status: "quarantined", safeError: "PROMOTION_CHECKPOINT_CONFLICT", updatedAt: new Date(),
      }).where(eq(dataPromotionBatches.id, batch.id));
      throw new Error("PROMOTION_CHECKPOINT_CONFLICT");
    }

    const leaseToken = randomUUID();
    const [claimed] = await tx.update(dataPromotionBatches).set({
      status: "running", attempt: sql`${dataPromotionBatches.attempt} + 1`,
      leaseTokenHash: leaseTokenHash(leaseToken),
      leaseExpiresAt: new Date(Date.now() + PROMOTION_BATCH_LEASE_MS),
      fencingVersion: sql`${dataPromotionBatches.fencingVersion} + 1`,
      safeError: null, updatedAt: new Date(),
    }).where(and(
      eq(dataPromotionBatches.id, batch.id),
      eq(dataPromotionBatches.status, batch.status),
      eq(dataPromotionBatches.fencingVersion, batch.fencingVersion),
    )).returning({ id: dataPromotionBatches.id, promotionId: dataPromotionBatches.promotionId, startWatermark: dataPromotionBatches.startWatermark, fencingVersion: dataPromotionBatches.fencingVersion });
    if (!claimed) throw new Error("PROMOTION_BATCH_STATE_CONFLICT");
    return { ...claimed, leaseToken };
  });
}

async function failPromotionBatch(input: { lease: PromotionBatchLease; reason: string; quarantine: boolean }): Promise<void> {
  const database = await getDb();
  if (!database) throw new Error("DATABASE_UNAVAILABLE");
  await database.update(dataPromotionBatches).set({
    status: input.quarantine ? "quarantined" : "failed",
    safeError: input.reason.slice(0, 1000), leaseTokenHash: null, leaseExpiresAt: null, updatedAt: new Date(),
  }).where(and(
    eq(dataPromotionBatches.id, input.lease.id), eq(dataPromotionBatches.status, "running"),
    eq(dataPromotionBatches.fencingVersion, input.lease.fencingVersion),
    eq(dataPromotionBatches.leaseTokenHash, leaseTokenHash(input.lease.leaseToken)),
  ));
}

async function completePromotionBatch(input: {
  lease: PromotionBatchLease;
  source: Awaited<ReturnType<PromotionChangeFeed["readBatch"]>>;
  result: { targetWatermark: string; rowCount: number; digest: string };
}) {
  const database = await getDb();
  if (!database) throw new Error("DATABASE_UNAVAILABLE");
  return database.transaction(async (tx: any) => {
    const [promotion] = await tx.select({ sourceWatermark: dataPromotions.sourceWatermark })
      .from(dataPromotions).where(eq(dataPromotions.id, input.lease.promotionId)).for("update").limit(1);
    if (!promotion || (promotion.sourceWatermark ?? null) !== (input.lease.startWatermark ?? null)) {
      await tx.update(dataPromotionBatches).set({
        status: "quarantined", safeError: "PROMOTION_CHECKPOINT_CONFLICT",
        leaseTokenHash: null, leaseExpiresAt: null, updatedAt: new Date(),
      }).where(and(eq(dataPromotionBatches.id, input.lease.id), eq(dataPromotionBatches.status, "running")));
      throw new Error("PROMOTION_CHECKPOINT_CONFLICT");
    }
    const [updated] = await tx.update(dataPromotionBatches).set({
      endWatermark: input.result.targetWatermark,
      rowCount: input.result.rowCount,
      digest: input.result.digest,
      status: "completed",
      checkpointJson: { sourceNextWatermark: input.source.nextWatermark, targetWatermark: input.result.targetWatermark },
      leaseTokenHash: null, leaseExpiresAt: null, updatedAt: new Date(),
    }).where(and(
      eq(dataPromotionBatches.id, input.lease.id), eq(dataPromotionBatches.status, "running"),
      eq(dataPromotionBatches.fencingVersion, input.lease.fencingVersion),
      eq(dataPromotionBatches.leaseTokenHash, leaseTokenHash(input.lease.leaseToken)),
    )).returning();
    if (!updated) throw new Error("PROMOTION_BATCH_STATE_CONFLICT");
    const sameCheckpoint = input.lease.startWatermark === null
      ? sql`"sourceWatermark" IS NULL`
      : eq(dataPromotions.sourceWatermark, input.lease.startWatermark);
    const [advanced] = await tx.update(dataPromotions).set({
      sourceWatermark: input.source.nextWatermark,
      targetWatermark: input.result.targetWatermark,
      updatedAt: new Date(), fencingVersion: sql`${dataPromotions.fencingVersion} + 1`,
    }).where(and(eq(dataPromotions.id, input.lease.promotionId), sameCheckpoint)).returning({ id: dataPromotions.id });
    if (!advanced) throw new Error("PROMOTION_CHECKPOINT_STATE_CONFLICT");
    return updated;
  });
}

/**
 * Apply a bounded feed batch. The external target transaction is owned by the
 * adapter; the local checkpoint advances only after the adapter confirms its
 * target watermark. Ambiguous adapter responses are quarantined.
 */
export async function applyPromotionBatch(input: {
  promotionId: string;
  batchKey: string;
  feed: PromotionChangeFeed;
  adapter: PromotionAdapter;
  limit?: number;
}) {
  assertPromotionChangeFeed(input.feed);
  const database = await getDb();
  if (!database) throw new Error("DATABASE_UNAVAILABLE");
  const acquired = await acquirePromotionBatch({ promotionId: input.promotionId, batchKey: input.batchKey });
  if ("completed" in acquired) return acquired.batch;
  const source = await input.feed.readBatch({ afterWatermark: acquired.startWatermark ?? undefined, limit: Math.min(Math.max(input.limit ?? 100, 1), 1000) }).catch(async error => {
    await failPromotionBatch({ lease: acquired, reason: errorText(error, "Promotion feed failed"), quarantine: isAmbiguousError(error) });
    throw error;
  });
  try {
    validateChangeBatch(source.changes, acquired.startWatermark ?? undefined);
  } catch (error) {
    await failPromotionBatch({ lease: acquired, reason: errorText(error, "Invalid promotion change batch"), quarantine: true });
    throw error;
  }
  if (typeof source.nextWatermark !== "string" || !source.nextWatermark.trim()) {
    await failPromotionBatch({ lease: acquired, reason: "PROMOTION_NEXT_WATERMARK_REQUIRED", quarantine: true });
    throw new Error("PROMOTION_NEXT_WATERMARK_REQUIRED");
  }
  let result: Awaited<ReturnType<PromotionAdapter["applyBatch"]>>;
  try {
    result = await input.adapter.applyBatch({ promotionId: input.promotionId, batchId: acquired.id, changes: source.changes });
  } catch (error) {
    await failPromotionBatch({ lease: acquired, reason: errorText(error, "Promotion adapter failed"), quarantine: isAmbiguousError(error) });
    throw error;
  }
  if (!result.targetWatermark?.trim() || !Number.isSafeInteger(result.rowCount) || result.rowCount < 0 || (result.digest !== undefined && (typeof result.digest !== "string" || result.digest.length > 128))) {
    await failPromotionBatch({ lease: acquired, reason: "PROMOTION_RESULT_INVALID", quarantine: true });
    throw new Error("PROMOTION_RESULT_INVALID");
  }
  return completePromotionBatch({ lease: acquired, source, result: { ...result, digest: result.digest || hash(source.changes) } });
}

export async function quarantinePromotionBatch(input: { batchId: string; reason: string }) {
  const database = await getDb();
  if (!database) throw new Error("DATABASE_UNAVAILABLE");
  const [row] = await database.update(dataPromotionBatches).set({ status: "quarantined", safeError: input.reason.slice(0, 1000), leaseTokenHash: null, leaseExpiresAt: null, updatedAt: new Date() })
    .where(eq(dataPromotionBatches.id, input.batchId)).returning();
  return row ?? null;
}
