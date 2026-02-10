import { and, asc, eq, inArray, sql } from "drizzle-orm";

import { type DrizzleDB } from "../db";
import {
  libraryIndexJobs,
  mediaCallbackDlq,
  mediaCallbackEvents,
} from "../../drizzle/schema";

export interface LibraryOpsDlqEntry {
  id: number;
  eventId: number | null;
  status: "pending" | "reprocessed" | "discarded";
}

export interface LibraryOpsRepository {
  getDlqEntryById(id: number): Promise<LibraryOpsDlqEntry | null>;
  markDlqEntryReprocessed(id: number, resolvedAt: Date): Promise<void>;
  moveEventToRetryPending(eventId: number, retryAt: Date): Promise<void>;
}

export interface ReprocessDlqResult {
  success: boolean;
  status: "reprocessed" | "not_found" | "already_handled";
  dlqId: number;
  eventMovedToRetry: boolean;
}

export function createLibraryOpsRepository(db: DrizzleDB): LibraryOpsRepository {
  return {
    getDlqEntryById: async (id) => {
      const rows = await db
        .select({
          id: mediaCallbackDlq.id,
          eventId: mediaCallbackDlq.eventId,
          status: mediaCallbackDlq.status,
        })
        .from(mediaCallbackDlq)
        .where(eq(mediaCallbackDlq.id, id))
        .limit(1);

      if (!rows.length) return null;
      return rows[0];
    },
    markDlqEntryReprocessed: async (id, resolvedAt) => {
      await db
        .update(mediaCallbackDlq)
        .set({
          status: "reprocessed",
          resolvedAt,
        })
        .where(eq(mediaCallbackDlq.id, id));
    },
    moveEventToRetryPending: async (eventId, retryAt) => {
      await db
        .update(mediaCallbackEvents)
        .set({
          status: "retry_pending",
          nextRetryAt: retryAt,
          errorMessage: null,
          updatedAt: retryAt,
        })
        .where(eq(mediaCallbackEvents.id, eventId));
    },
  };
}

export async function reprocessCallbackDlqEntry(
  repo: LibraryOpsRepository,
  dlqId: number,
): Promise<ReprocessDlqResult> {
  const entry = await repo.getDlqEntryById(dlqId);
  if (!entry) {
    return {
      success: false,
      status: "not_found",
      dlqId,
      eventMovedToRetry: false,
    };
  }

  if (entry.status !== "pending") {
    return {
      success: false,
      status: "already_handled",
      dlqId,
      eventMovedToRetry: false,
    };
  }

  const now = new Date();
  await repo.markDlqEntryReprocessed(dlqId, now);

  if (entry.eventId) {
    await repo.moveEventToRetryPending(entry.eventId, now);
  }

  return {
    success: true,
    status: "reprocessed",
    dlqId,
    eventMovedToRetry: Boolean(entry.eventId),
  };
}

export async function retryFailedLibraryIndexJobs(
  db: DrizzleDB,
  input: {
    jobIds?: number[];
    limit?: number;
  },
): Promise<{ retried: number; jobIds: number[] }> {
  const limit = Math.min(Math.max(input.limit ?? 100, 1), 500);

  let targetIds = (input.jobIds ?? []).filter((id) => Number.isInteger(id) && id > 0);
  if (!targetIds.length) {
    const rows = await db
      .select({ id: libraryIndexJobs.id })
      .from(libraryIndexJobs)
      .where(eq(libraryIndexJobs.status, "failed"))
      .orderBy(asc(libraryIndexJobs.id))
      .limit(limit);
    targetIds = rows.map((row) => row.id);
  } else if (targetIds.length > limit) {
    targetIds = targetIds.slice(0, limit);
  }

  if (!targetIds.length) {
    return { retried: 0, jobIds: [] };
  }

  const now = new Date();
  const updated = await db
    .update(libraryIndexJobs)
    .set({
      status: "retry_pending",
      nextRetryAt: now,
      lastError: null,
      updatedAt: now,
    })
    .where(
      and(
        inArray(libraryIndexJobs.id, targetIds),
        eq(libraryIndexJobs.status, "failed"),
      ),
    )
    .returning({ id: libraryIndexJobs.id });

  return {
    retried: updated.length,
    jobIds: updated.map((row) => row.id),
  };
}

export async function getLibraryOpsSummary(db: DrizzleDB): Promise<{
  callbackDlqPending: number;
  callbackRetryPending: number;
  indexRetryPending: number;
  indexFailed: number;
}> {
  const [dlqPending] = await db
    .select({ count: sql<number>`count(*)` })
    .from(mediaCallbackDlq)
    .where(eq(mediaCallbackDlq.status, "pending"));

  const [callbackRetryPending] = await db
    .select({ count: sql<number>`count(*)` })
    .from(mediaCallbackEvents)
    .where(eq(mediaCallbackEvents.status, "retry_pending"));

  const [indexRetryPending] = await db
    .select({ count: sql<number>`count(*)` })
    .from(libraryIndexJobs)
    .where(eq(libraryIndexJobs.status, "retry_pending"));

  const [indexFailed] = await db
    .select({ count: sql<number>`count(*)` })
    .from(libraryIndexJobs)
    .where(eq(libraryIndexJobs.status, "failed"));

  return {
    callbackDlqPending: Number(dlqPending?.count || 0),
    callbackRetryPending: Number(callbackRetryPending?.count || 0),
    indexRetryPending: Number(indexRetryPending?.count || 0),
    indexFailed: Number(indexFailed?.count || 0),
  };
}

