import { createHash, randomUUID } from "node:crypto";

import { and, eq, isNull, lte, or, sql } from "drizzle-orm";

import { db, getDb } from "../db";
import {
  workerJobDispatches,
  workerJobOutbox,
  workerJobs,
} from "../../drizzle/schema";
import { appendJobEvent } from "./jobControlPlane";
import type { DispatchRef, DispatchRequest } from "./jobControlPlaneTypes";
import type { JobTransportAdapter } from "./jobTransportAdapters";

const PUBLISHER_LEASE_MS = 30_000;
const MAX_PUBLISH_ATTEMPTS = 8;

type OutboxResult = {
  outboxId: string;
  state: "published" | "retry_scheduled" | "quarantined" | "skipped";
  dispatchRef?: DispatchRef;
};

export type JobAdapterResolver = (input: { runtimeType: string; executionClass: string; jobType: string }) => JobTransportAdapter | undefined;

function hashToken(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

function backoff(attempts: number): number {
  return Math.min(15 * 60_000, 1000 * 2 ** Math.max(0, attempts - 1));
}

export async function publishJobOutboxRow(
  outboxId: string,
  adapter: JobTransportAdapter,
  now = new Date(),
): Promise<OutboxResult> {
  getDb();
  const publisherToken = randomUUID();
  const publisherLeaseTokenHash = hashToken(publisherToken);
  const claimed = await db.transaction(async tx => {
    const query = tx as any;
    const [row] = await query
      .update(workerJobOutbox)
      .set({
        publisherLeaseTokenHash,
        publisherLeaseExpiresAt: new Date(now.getTime() + PUBLISHER_LEASE_MS),
        publisherFencingVersion: sql`${workerJobOutbox.publisherFencingVersion} + 1`,
        publishAttempts: sql`${workerJobOutbox.publishAttempts} + 1`,
        updatedAt: now,
      })
      .where(and(
        eq(workerJobOutbox.id, outboxId),
        isNull(workerJobOutbox.publishedAt),
        isNull(workerJobOutbox.cancelledAt),
        isNull(workerJobOutbox.quarantinedAt),
        lte(workerJobOutbox.nextAttemptAt, now),
        or(
          isNull(workerJobOutbox.publisherLeaseExpiresAt),
          lte(workerJobOutbox.publisherLeaseExpiresAt, now),
        ),
      ))
      .returning();
    if (row) {
      await appendJobEvent(query, {
        workerJobId: row.workerJobId,
        eventType: "DISPATCH_ATTEMPTED",
        eventIdempotencyKey: `dispatch-attempt:${row.id}:${row.publisherFencingVersion}`,
        payloadJson: { outboxId: row.id, publishAttempt: row.publishAttempts },
      });
    }
    return row ?? null;
  });

  if (!claimed) return { outboxId, state: "skipped" };

  const [job] = await db.select().from(workerJobs).where(eq(workerJobs.id, claimed.workerJobId)).limit(1);
  if (!job) return quarantineOutbox(outboxId, publisherLeaseTokenHash, "canonical_job_missing", now);
  if (!adapter.supports({ jobType: job.jobType, executionClass: job.executionClass, contractVersion: claimed.envelopeVersion })) {
    return quarantineOutbox(outboxId, publisherLeaseTokenHash, "adapter_contract_unsupported", now);
  }

  const envelope = claimed.envelopeJson ?? {};
  const request: DispatchRequest = {
    jobId: claimed.workerJobId,
    businessAttempt: Number(envelope.businessAttempt ?? job.attempt),
    attemptId: typeof envelope.attemptId === "string" ? envelope.attemptId : undefined,
    outboxId: claimed.id,
    dedupeKey: claimed.dedupeKey,
    contractVersion: claimed.envelopeVersion,
    routingMetadata: typeof envelope.routingMetadata === "object" && envelope.routingMetadata !== null
      ? envelope.routingMetadata as Record<string, unknown>
      : {},
  };

  let reference: DispatchRef;
  try {
    reference = await adapter.publish(request);
  } catch (error) {
    const message = error instanceof Error ? error.message.slice(0, 2000) : "transport_publish_failed";
    return recordPublishFailure(outboxId, publisherLeaseTokenHash, message, claimed.publishAttempts, now);
  }
  if (
    reference.jobId !== claimed.workerJobId ||
    reference.attemptId !== (request.attemptId ?? undefined) ||
    reference.dedupeKey !== claimed.dedupeKey ||
    reference.adapter !== adapter.name ||
    reference.referenceNamespace !== adapter.referenceNamespace ||
    !reference.dispatchId
  ) {
    return quarantineOutbox(outboxId, publisherLeaseTokenHash, "adapter_reference_mismatch", now);
  }

  let cancellationWon = false;
  await db.transaction(async tx => {
    const query = tx as any;
    await query.insert(workerJobDispatches).values({
      id: reference.dispatchId || randomUUID(),
      workerJobId: reference.jobId,
      attemptId: reference.attemptId ?? null,
      adapter: reference.adapter,
      referenceNamespace: reference.referenceNamespace,
      dispatchKind: "publish",
      dedupeKey: reference.dedupeKey,
      providerJobId: reference.providerJobId ?? null,
      queueJobId: reference.queueJobId ?? null,
      celeryTaskId: reference.celeryTaskId ?? null,
      workflowInstanceId: reference.workflowInstanceId ?? null,
      containerInstanceId: reference.containerInstanceId ?? null,
      publicationStatus: "published",
      publishedAt: now,
    }).onConflictDoNothing();
    await appendJobEvent(query, {
      workerJobId: claimed.workerJobId,
      eventType: "DISPATCHED",
      attemptId: reference.attemptId,
      eventIdempotencyKey: `dispatched:${claimed.dedupeKey}`,
      payloadJson: {
        adapter: reference.adapter,
        referenceNamespace: reference.referenceNamespace,
        dispatchId: reference.dispatchId,
        queueJobId: reference.queueJobId,
        celeryTaskId: reference.celeryTaskId,
      },
    });
    const [published] = await query.update(workerJobOutbox).set({
      publishedAt: now,
      publisherLeaseTokenHash: null,
      publisherLeaseExpiresAt: null,
      updatedAt: now,
    }).where(and(
      eq(workerJobOutbox.id, claimed.id),
      eq(workerJobOutbox.publisherLeaseTokenHash, publisherLeaseTokenHash),
      eq(workerJobOutbox.publisherFencingVersion, claimed.publisherFencingVersion + 1),
      isNull(workerJobOutbox.cancelledAt),
    )).returning({ id: workerJobOutbox.id });
    cancellationWon = !published;
  });

  if (cancellationWon && adapter.cancel) {
    try {
      await adapter.cancel(reference);
    } catch (error) {
      console.warn("feature_186_transport_cancel_after_race_failed", {
        outboxId,
        adapter: adapter.name,
        error: error instanceof Error ? error.message.slice(0, 500) : "unknown_error",
      });
    }
  }

  return { outboxId, state: "published", dispatchRef: reference };
}

async function recordPublishFailure(
  outboxId: string,
  tokenHash: string,
  message: string,
  attempts: number,
  now: Date,
): Promise<OutboxResult> {
  const quarantined = attempts >= MAX_PUBLISH_ATTEMPTS;
  await db.transaction(async tx => {
    const query = tx as any;
    const [row] = await query.select().from(workerJobOutbox).where(eq(workerJobOutbox.id, outboxId)).limit(1);
    if (!row) return;
    await query.update(workerJobOutbox).set({
      failedReason: message,
      quarantinedAt: quarantined ? now : null,
      operatorReviewReason: quarantined ? message : null,
      nextAttemptAt: new Date(now.getTime() + backoff(attempts)),
      publisherLeaseTokenHash: null,
      publisherLeaseExpiresAt: null,
      updatedAt: now,
    }).where(and(eq(workerJobOutbox.id, outboxId), eq(workerJobOutbox.publisherLeaseTokenHash, tokenHash)));
    await appendJobEvent(query, {
      workerJobId: row.workerJobId,
      eventType: "DISPATCH_FAILED",
      eventIdempotencyKey: `dispatch-failed:${outboxId}:${attempts}`,
      payloadJson: { outboxId, reason: message, quarantined },
    });
  });
  return { outboxId, state: quarantined ? "quarantined" : "retry_scheduled" };
}

async function quarantineOutbox(outboxId: string, tokenHash: string, reason: string, now: Date): Promise<OutboxResult> {
  await db.transaction(async tx => {
    const query = tx as any;
    const [row] = await query.select().from(workerJobOutbox).where(eq(workerJobOutbox.id, outboxId)).limit(1);
    await query.update(workerJobOutbox).set({
      quarantinedAt: now,
      operatorReviewReason: reason,
      failedReason: reason,
      publisherLeaseTokenHash: null,
      publisherLeaseExpiresAt: null,
      updatedAt: now,
    }).where(and(eq(workerJobOutbox.id, outboxId), eq(workerJobOutbox.publisherLeaseTokenHash, tokenHash)));
    if (row) await appendJobEvent(query, {
      workerJobId: row.workerJobId,
      eventType: "DISPATCH_FAILED",
      eventIdempotencyKey: `dispatch-quarantined:${outboxId}`,
      payloadJson: { outboxId, reason, quarantined: true },
    });
  });
  return { outboxId, state: "quarantined" };
}

async function quarantineUnclaimedOutbox(outboxId: string, reason: string, now: Date): Promise<OutboxResult> {
  await db.transaction(async tx => {
    const query = tx as any;
    const [row] = await query.select().from(workerJobOutbox).where(eq(workerJobOutbox.id, outboxId)).limit(1);
    const [updated] = await query.update(workerJobOutbox).set({
      quarantinedAt: now,
      operatorReviewReason: reason,
      failedReason: reason,
      updatedAt: now,
    }).where(and(
      eq(workerJobOutbox.id, outboxId),
      isNull(workerJobOutbox.publishedAt),
    )).returning({ id: workerJobOutbox.id });
    if (row && updated) await appendJobEvent(query, {
      workerJobId: row.workerJobId,
      eventType: "DISPATCH_FAILED",
      eventIdempotencyKey: `dispatch-quarantined:${outboxId}:unclaimed`,
      payloadJson: { outboxId, reason, quarantined: true },
    });
  });
  return { outboxId, state: "quarantined" };
}

export async function publishPendingJobOutbox(
  adapters: ReadonlyMap<string, JobTransportAdapter>,
  limit = 50,
  now = new Date(),
  resolveAdapter?: JobAdapterResolver,
): Promise<OutboxResult[]> {
  getDb();
  const rows = await db.select({ id: workerJobOutbox.id, runtimeType: workerJobs.runtimeType, executionClass: workerJobs.executionClass, jobType: workerJobs.jobType })
    .from(workerJobOutbox)
    .innerJoin(workerJobs, eq(workerJobOutbox.workerJobId, workerJobs.id))
    .where(and(
      isNull(workerJobOutbox.publishedAt),
      isNull(workerJobOutbox.cancelledAt),
      isNull(workerJobOutbox.quarantinedAt),
      lte(workerJobOutbox.nextAttemptAt, now),
    ))
    .limit(limit);
  const results: OutboxResult[] = [];
  for (const row of rows) {
    const adapter = resolveAdapter?.(row) ?? adapters.get(row.runtimeType) ?? adapters.get("default");
    if (!adapter) {
      results.push(await quarantineUnclaimedOutbox(row.id, "adapter_not_registered", now));
      continue;
    }
    results.push(await publishJobOutboxRow(row.id, adapter, now));
  }
  return results;
}
