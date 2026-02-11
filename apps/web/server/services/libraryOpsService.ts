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
  tenantId: string | null;
  status: "pending" | "reprocessed" | "discarded";
}

export interface LibraryOpsTenantScope {
  tenantId?: string | null;
}

export interface LibraryOpsRepository {
  getDlqEntryById(id: number, scope?: LibraryOpsTenantScope): Promise<LibraryOpsDlqEntry | null>;
  markDlqEntryReprocessed(id: number, resolvedAt: Date, scope?: LibraryOpsTenantScope): Promise<void>;
  moveEventToRetryPending(eventId: number, retryAt: Date, scope?: LibraryOpsTenantScope): Promise<void>;
}

export interface ReprocessDlqResult {
  success: boolean;
  status: "reprocessed" | "not_found" | "already_handled";
  dlqId: number;
  eventMovedToRetry: boolean;
}

export interface LibraryOpsScopeInput {
  tenantId?: string | null;
}

function normalizeTenantId(scope?: LibraryOpsTenantScope): string | null {
  const tenantId = scope?.tenantId;
  if (tenantId === null || tenantId === undefined) return null;
  const normalized = String(tenantId).trim();
  return normalized.length ? normalized : null;
}

export function createLibraryOpsRepository(db: DrizzleDB): LibraryOpsRepository {
  return {
    getDlqEntryById: async (id, scope) => {
      const tenantId = normalizeTenantId(scope);
      const where = [eq(mediaCallbackDlq.id, id)];
      if (tenantId) {
        where.push(eq(mediaCallbackDlq.tenantId, tenantId));
      }

      const rows = await db
        .select({
          id: mediaCallbackDlq.id,
          eventId: mediaCallbackDlq.eventId,
          tenantId: mediaCallbackDlq.tenantId,
          status: mediaCallbackDlq.status,
        })
        .from(mediaCallbackDlq)
        .where(and(...where))
        .limit(1);

      if (!rows.length) return null;
      return rows[0];
    },
    markDlqEntryReprocessed: async (id, resolvedAt, scope) => {
      const tenantId = normalizeTenantId(scope);
      const where = [eq(mediaCallbackDlq.id, id)];
      if (tenantId) {
        where.push(eq(mediaCallbackDlq.tenantId, tenantId));
      }

      await db
        .update(mediaCallbackDlq)
        .set({
          status: "reprocessed",
          resolvedAt,
        })
        .where(and(...where));
    },
    moveEventToRetryPending: async (eventId, retryAt, scope) => {
      const tenantId = normalizeTenantId(scope);
      const where = [eq(mediaCallbackEvents.id, eventId)];
      if (tenantId) {
        where.push(eq(mediaCallbackEvents.tenantId, tenantId));
      }

      await db
        .update(mediaCallbackEvents)
        .set({
          status: "retry_pending",
          nextRetryAt: retryAt,
          errorMessage: null,
          updatedAt: retryAt,
        })
        .where(and(...where));
    },
  };
}

export async function reprocessCallbackDlqEntry(
  repo: LibraryOpsRepository,
  dlqId: number,
  scope?: LibraryOpsTenantScope,
): Promise<ReprocessDlqResult> {
  const normalizedScope: LibraryOpsTenantScope = {
    tenantId: normalizeTenantId(scope),
  };

  const entry = await repo.getDlqEntryById(dlqId, normalizedScope);
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
  await repo.markDlqEntryReprocessed(dlqId, now, normalizedScope);

  if (entry.eventId) {
    await repo.moveEventToRetryPending(entry.eventId, now, normalizedScope);
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
    tenantId?: string | null;
  },
): Promise<{ retried: number; jobIds: number[] }> {
  const limit = Math.min(Math.max(input.limit ?? 100, 1), 500);
  const tenantId = input.tenantId ? String(input.tenantId).trim() : null;

  let targetIds = (input.jobIds ?? []).filter((id) => Number.isInteger(id) && id > 0);
  if (!targetIds.length) {
    const failedWhere = [eq(libraryIndexJobs.status, "failed")];
    if (tenantId) {
      failedWhere.push(eq(libraryIndexJobs.tenantId, tenantId));
    }
    const rows = await db
      .select({ id: libraryIndexJobs.id, tenantId: libraryIndexJobs.tenantId })
      .from(libraryIndexJobs)
      .where(and(...failedWhere))
      .orderBy(asc(libraryIndexJobs.id))
      .limit(limit);
    targetIds = rows.map((row) => row.id);
  } else if (targetIds.length > limit) {
    targetIds = targetIds.slice(0, limit);
  }

  if (targetIds.length) {
    const scopedWhere = [
      inArray(libraryIndexJobs.id, targetIds),
      eq(libraryIndexJobs.status, "failed"),
    ];
    if (tenantId) {
      scopedWhere.push(eq(libraryIndexJobs.tenantId, tenantId));
    }

    const scopedRows = await db
      .select({ id: libraryIndexJobs.id })
      .from(libraryIndexJobs)
      .where(and(...scopedWhere))
      .limit(limit);

    targetIds = scopedRows.map((row) => row.id);
  }

  if (!targetIds.length) {
    return { retried: 0, jobIds: [] };
  }

  const now = new Date();
  const updateWhere = [
    inArray(libraryIndexJobs.id, targetIds),
    eq(libraryIndexJobs.status, "failed"),
  ];
  if (tenantId) {
    updateWhere.push(eq(libraryIndexJobs.tenantId, tenantId));
  }

  const updated = await db
    .update(libraryIndexJobs)
    .set({
      status: "retry_pending",
      nextRetryAt: now,
      lastError: null,
      updatedAt: now,
    })
    .where(
      and(...updateWhere),
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
}>;
export async function getLibraryOpsSummary(
  db: DrizzleDB,
  scope?: LibraryOpsScopeInput,
): Promise<{
  callbackDlqPending: number;
  callbackRetryPending: number;
  indexRetryPending: number;
  indexFailed: number;
}> {
  const tenantId = scope?.tenantId ? String(scope.tenantId).trim() : null;

  const dlqWhere = [eq(mediaCallbackDlq.status, "pending")];
  if (tenantId) {
    dlqWhere.push(eq(mediaCallbackDlq.tenantId, tenantId));
  }
  const [dlqPending] = await db
    .select({ count: sql<number>`count(*)` })
    .from(mediaCallbackDlq)
    .where(and(...dlqWhere))
    .limit(1);

  const callbackRetryWhere = [eq(mediaCallbackEvents.status, "retry_pending")];
  if (tenantId) {
    callbackRetryWhere.push(eq(mediaCallbackEvents.tenantId, tenantId));
  }
  const [callbackRetryPending] = await db
    .select({ count: sql<number>`count(*)` })
    .from(mediaCallbackEvents)
    .where(and(...callbackRetryWhere))
    .limit(1);

  const indexRetryWhere = [eq(libraryIndexJobs.status, "retry_pending")];
  if (tenantId) {
    indexRetryWhere.push(eq(libraryIndexJobs.tenantId, tenantId));
  }
  const [indexRetryPending] = await db
    .select({ count: sql<number>`count(*)` })
    .from(libraryIndexJobs)
    .where(and(...indexRetryWhere))
    .limit(1);

  const indexFailedWhere = [eq(libraryIndexJobs.status, "failed")];
  if (tenantId) {
    indexFailedWhere.push(eq(libraryIndexJobs.tenantId, tenantId));
  }
  const [indexFailed] = await db
    .select({ count: sql<number>`count(*)` })
    .from(libraryIndexJobs)
    .where(and(...indexFailedWhere))
    .limit(1);

  return {
    callbackDlqPending: Number(dlqPending?.count || 0),
    callbackRetryPending: Number(callbackRetryPending?.count || 0),
    indexRetryPending: Number(indexRetryPending?.count || 0),
    indexFailed: Number(indexFailed?.count || 0),
  };
}
