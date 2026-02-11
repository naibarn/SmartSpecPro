import { and, asc, eq, isNotNull, isNull, sql } from "drizzle-orm";

import { type DrizzleDB } from "../db";
import {
  libraryItems,
  libraryLinks,
  mediaCallbackDlq,
  mediaCallbackEvents,
} from "../../drizzle/schema";

interface ProviderTaskTenantLinkRow {
  providerTaskId: string | null;
  tenantId: string | null;
}

export interface ProviderTaskTenantResolution {
  resolved: Record<string, string>;
  ambiguousProviderTaskIds: string[];
}

export interface CallbackTenantAttributionReport {
  dryRun: boolean;
  events: {
    missingBefore: number;
    missingAfter: number;
    backfilled: number;
    candidateFromLibraryLinks: number;
  };
  dlq: {
    missingBefore: number;
    missingAfter: number;
    backfilled: number;
    candidateFromEventLink: number;
    candidateFromLibraryLinks: number;
  };
  ambiguousProviderTaskIds: string[];
  unresolvedSamples: {
    events: Array<{ id: number; providerTaskId: string | null }>;
    dlq: Array<{ id: number; providerTaskId: string | null }>;
  };
}

function extractRows(result: any): any[] {
  if (Array.isArray(result)) return result;
  if (result && Array.isArray(result.rows)) return result.rows;
  return [];
}

function parseCountResult(result: any): number {
  const rows = extractRows(result);
  const rawCount = rows?.[0]?.count;
  return Number(rawCount || 0);
}

export function buildProviderTaskTenantResolution(
  rows: ProviderTaskTenantLinkRow[],
): ProviderTaskTenantResolution {
  const tenantSets = new Map<string, Set<string>>();

  for (const row of rows) {
    const providerTaskId = row.providerTaskId ? String(row.providerTaskId).trim() : "";
    const tenantId = row.tenantId ? String(row.tenantId).trim() : "";
    if (!providerTaskId || !tenantId) {
      continue;
    }

    let set = tenantSets.get(providerTaskId);
    if (!set) {
      set = new Set<string>();
      tenantSets.set(providerTaskId, set);
    }
    set.add(tenantId);
  }

  const resolved: Record<string, string> = {};
  const ambiguousProviderTaskIds: string[] = [];

  for (const [providerTaskId, tenantIds] of tenantSets.entries()) {
    if (tenantIds.size === 1) {
      resolved[providerTaskId] = Array.from(tenantIds)[0];
      continue;
    }

    ambiguousProviderTaskIds.push(providerTaskId);
  }

  ambiguousProviderTaskIds.sort((a, b) => a.localeCompare(b));

  return {
    resolved,
    ambiguousProviderTaskIds,
  };
}

async function countMissingCallbackTenants(db: DrizzleDB): Promise<{ events: number; dlq: number }> {
  const [eventCount] = await db
    .select({ count: sql<number>`count(*)` })
    .from(mediaCallbackEvents)
    .where(isNull(mediaCallbackEvents.tenantId))
    .limit(1);

  const [dlqCount] = await db
    .select({ count: sql<number>`count(*)` })
    .from(mediaCallbackDlq)
    .where(isNull(mediaCallbackDlq.tenantId))
    .limit(1);

  return {
    events: Number(eventCount?.count || 0),
    dlq: Number(dlqCount?.count || 0),
  };
}

async function getUnresolvedSamples(
  db: DrizzleDB,
  sampleLimit: number,
): Promise<CallbackTenantAttributionReport["unresolvedSamples"]> {
  const events = await db
    .select({
      id: mediaCallbackEvents.id,
      providerTaskId: mediaCallbackEvents.providerTaskId,
    })
    .from(mediaCallbackEvents)
    .where(isNull(mediaCallbackEvents.tenantId))
    .orderBy(asc(mediaCallbackEvents.id))
    .limit(sampleLimit);

  const dlq = await db
    .select({
      id: mediaCallbackDlq.id,
      providerTaskId: mediaCallbackDlq.providerTaskId,
    })
    .from(mediaCallbackDlq)
    .where(isNull(mediaCallbackDlq.tenantId))
    .orderBy(asc(mediaCallbackDlq.id))
    .limit(sampleLimit);

  return {
    events,
    dlq,
  };
}

async function countEventBackfillCandidates(db: DrizzleDB): Promise<number> {
  const result = await db.execute(sql`
    WITH provider_task_tenant AS (
      SELECT
        ll.provider_task_id AS provider_task_id,
        COUNT(DISTINCT li.tenant_id) AS tenant_count
      FROM library_links ll
      INNER JOIN library_items li ON li.id = ll.library_item_id
      WHERE ll.provider_task_id IS NOT NULL
        AND li.deleted_at IS NULL
      GROUP BY ll.provider_task_id
    ),
    resolved AS (
      SELECT provider_task_id
      FROM provider_task_tenant
      WHERE tenant_count = 1
    )
    SELECT COUNT(*)::int AS count
    FROM media_callback_events e
    INNER JOIN resolved r ON r.provider_task_id = e.provider_task_id
    WHERE e."tenant_id" IS NULL
  `);

  return parseCountResult(result);
}

async function countDlqBackfillCandidatesByEvent(db: DrizzleDB): Promise<number> {
  const result = await db.execute(sql`
    SELECT COUNT(*)::int AS count
    FROM media_callback_dlq d
    INNER JOIN media_callback_events e ON e.id = d.event_id
    WHERE d."tenant_id" IS NULL
      AND e."tenant_id" IS NOT NULL
  `);

  return parseCountResult(result);
}

async function countDlqBackfillCandidatesByTaskMap(db: DrizzleDB): Promise<number> {
  const result = await db.execute(sql`
    WITH provider_task_tenant AS (
      SELECT
        ll.provider_task_id AS provider_task_id,
        COUNT(DISTINCT li.tenant_id) AS tenant_count
      FROM library_links ll
      INNER JOIN library_items li ON li.id = ll.library_item_id
      WHERE ll.provider_task_id IS NOT NULL
        AND li.deleted_at IS NULL
      GROUP BY ll.provider_task_id
    ),
    resolved AS (
      SELECT provider_task_id
      FROM provider_task_tenant
      WHERE tenant_count = 1
    )
    SELECT COUNT(*)::int AS count
    FROM media_callback_dlq d
    INNER JOIN resolved r ON r.provider_task_id = d.provider_task_id
    WHERE d."tenant_id" IS NULL
  `);

  return parseCountResult(result);
}

export async function runCallbackTenantAttributionBackfill(
  db: DrizzleDB,
  options?: { dryRun?: boolean; sampleLimit?: number },
): Promise<CallbackTenantAttributionReport> {
  const dryRun = options?.dryRun !== false;
  const sampleLimit = Math.min(Math.max(options?.sampleLimit ?? 25, 1), 100);

  const before = await countMissingCallbackTenants(db);

  const linkRows = await db
    .select({
      providerTaskId: libraryLinks.providerTaskId,
      tenantId: libraryItems.tenantId,
    })
    .from(libraryLinks)
    .innerJoin(libraryItems, eq(libraryLinks.libraryItemId, libraryItems.id))
    .where(and(isNotNull(libraryLinks.providerTaskId), isNull(libraryItems.deletedAt)));

  const tenantResolution = buildProviderTaskTenantResolution(linkRows);

  const [eventCandidates, dlqCandidatesByEvent, dlqCandidatesByTaskMap] = await Promise.all([
    countEventBackfillCandidates(db),
    countDlqBackfillCandidatesByEvent(db),
    countDlqBackfillCandidatesByTaskMap(db),
  ]);

  let eventsBackfilled = 0;
  let dlqBackfilled = 0;

  if (!dryRun) {
    const updateEventsResult = await db.execute(sql`
      WITH provider_task_tenant AS (
        SELECT
          ll.provider_task_id AS provider_task_id,
          MIN(li.tenant_id) AS tenant_id,
          COUNT(DISTINCT li.tenant_id) AS tenant_count
        FROM library_links ll
        INNER JOIN library_items li ON li.id = ll.library_item_id
        WHERE ll.provider_task_id IS NOT NULL
          AND li.deleted_at IS NULL
        GROUP BY ll.provider_task_id
      ),
      resolved AS (
        SELECT provider_task_id, tenant_id
        FROM provider_task_tenant
        WHERE tenant_count = 1
      )
      UPDATE media_callback_events e
      SET
        "tenant_id" = r.tenant_id,
        updated_at = NOW()
      FROM resolved r
      WHERE e."tenant_id" IS NULL
        AND e.provider_task_id = r.provider_task_id
      RETURNING e.id
    `);
    eventsBackfilled += extractRows(updateEventsResult).length;

    const updateDlqFromEventResult = await db.execute(sql`
      UPDATE media_callback_dlq d
      SET "tenant_id" = e."tenant_id"
      FROM media_callback_events e
      WHERE d."tenant_id" IS NULL
        AND d.event_id = e.id
        AND e."tenant_id" IS NOT NULL
      RETURNING d.id
    `);
    dlqBackfilled += extractRows(updateDlqFromEventResult).length;

    const updateDlqFromTaskMapResult = await db.execute(sql`
      WITH provider_task_tenant AS (
        SELECT
          ll.provider_task_id AS provider_task_id,
          MIN(li.tenant_id) AS tenant_id,
          COUNT(DISTINCT li.tenant_id) AS tenant_count
        FROM library_links ll
        INNER JOIN library_items li ON li.id = ll.library_item_id
        WHERE ll.provider_task_id IS NOT NULL
          AND li.deleted_at IS NULL
        GROUP BY ll.provider_task_id
      ),
      resolved AS (
        SELECT provider_task_id, tenant_id
        FROM provider_task_tenant
        WHERE tenant_count = 1
      )
      UPDATE media_callback_dlq d
      SET "tenant_id" = r.tenant_id
      FROM resolved r
      WHERE d."tenant_id" IS NULL
        AND d.provider_task_id = r.provider_task_id
      RETURNING d.id
    `);
    dlqBackfilled += extractRows(updateDlqFromTaskMapResult).length;
  }

  const after = dryRun
    ? before
    : await countMissingCallbackTenants(db);

  const unresolvedSamples = await getUnresolvedSamples(db, sampleLimit);

  return {
    dryRun,
    events: {
      missingBefore: before.events,
      missingAfter: after.events,
      backfilled: eventsBackfilled,
      candidateFromLibraryLinks: eventCandidates,
    },
    dlq: {
      missingBefore: before.dlq,
      missingAfter: after.dlq,
      backfilled: dlqBackfilled,
      candidateFromEventLink: dlqCandidatesByEvent,
      candidateFromLibraryLinks: dlqCandidatesByTaskMap,
    },
    ambiguousProviderTaskIds: tenantResolution.ambiguousProviderTaskIds,
    unresolvedSamples,
  };
}
