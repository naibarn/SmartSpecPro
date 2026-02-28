/**
 * Agency Data Retention Archival Service
 *
 * Manages agency data lifecycle:
 * - Hot (0-7 days): Full speed queryable
 * - Cold (8-30 days): Marked as archived (isArchived=true on conversations)
 * - Purge (30+ days): Deleted from database
 *
 * Per-tenant retention overrides stored in system_settings:
 *   category: "agency_retention", key: "tenant_{tenantId}_purge_days"
 *
 * Uses setInterval for scheduling (BullMQ not available in this codebase).
 */

import { db } from "../db";
import { sql } from "drizzle-orm";
import { auditLogger } from "./auditLogger";

const DEFAULT_ARCHIVE_DAYS = 7;
const DEFAULT_PURGE_DAYS = 30;

export async function archiveOldRecords(): Promise<{ archivedCount: number }> {
  /**
   * Mark agency_conversations as archived where updatedAt < now - ARCHIVE_DAYS.
   * Does NOT delete any data.
   */
  const result = await db.instance.execute(sql`
    UPDATE agency_conversations
    SET "isArchived" = true
    WHERE "isArchived" = false
      AND "updatedAt" < NOW() - INTERVAL '${sql.raw(String(DEFAULT_ARCHIVE_DAYS))} days'
  `);

  const archivedCount = (result as any).rowCount ?? 0;
  return { archivedCount };
}

export async function purgeOldRecords(
  tenantId?: string,
): Promise<{ purgedCount: number }> {
  /**
   * Delete agency_messages and agency_runs where created_at < now - PURGE_DAYS.
   * Respects per-tenant overrides from system_settings.
   * Deletes in batches to avoid long transactions.
   */
  let purgeDays = DEFAULT_PURGE_DAYS;

  if (tenantId) {
    const config = await getRetentionConfig(tenantId);
    purgeDays = config.purgeDays;
  }

  // Delete in batches of 1000 to avoid long transactions
  const BATCH_SIZE = 1000;
  let totalPurged = 0;
  let deleted = 0;

  // Batch-delete old agency_messages
  // Note: agency_messages has no tenant_id — filter through conversation → agency
  do {
    const msgResult = await db.instance.execute(sql`
      DELETE FROM agency_messages
      WHERE ctid IN (
        SELECT m.ctid FROM agency_messages m
        ${tenantId ? sql`
          JOIN agency_conversations c ON c.id = m.conversation_id
          JOIN agencies a ON a.id = c.agency_id
        ` : sql``}
        WHERE m.created_at < NOW() - INTERVAL '${sql.raw(String(purgeDays))} days'
        ${tenantId ? sql`AND a.tenant_id = ${tenantId}` : sql``}
        LIMIT ${BATCH_SIZE}
      )
    `);
    deleted = (msgResult as any).rowCount ?? 0;
    totalPurged += deleted;
  } while (deleted >= BATCH_SIZE);

  // Batch-delete old agency_runs
  do {
    const runResult = await db.instance.execute(sql`
      DELETE FROM agency_runs
      WHERE ctid IN (
        SELECT ctid FROM agency_runs
        WHERE created_at < NOW() - INTERVAL '${sql.raw(String(purgeDays))} days'
        ${tenantId ? sql`AND tenant_id = ${tenantId}` : sql``}
        LIMIT ${BATCH_SIZE}
      )
    `);
    deleted = (runResult as any).rowCount ?? 0;
    totalPurged += deleted;
  } while (deleted >= BATCH_SIZE);

  return { purgedCount: totalPurged };
}

export async function getRetentionConfig(tenantId: string): Promise<{
  archiveDays: number;
  purgeDays: number;
}> {
  /**
   * Read per-tenant retention override from system_settings.
   * Falls back to DEFAULT_ARCHIVE_DAYS and DEFAULT_PURGE_DAYS.
   */
  let archiveDays = DEFAULT_ARCHIVE_DAYS;
  let purgeDays = DEFAULT_PURGE_DAYS;

  try {
    const archiveResult = await db.instance.execute(sql`
      SELECT value FROM system_settings
      WHERE category = 'agency_retention'
        AND key = ${`tenant_${tenantId}_archive_days`}
      LIMIT 1
    `);
    const archiveRows = (archiveResult as any).rows ?? [];
    if (archiveRows.length > 0 && archiveRows[0].value) {
      const parsed = parseInt(archiveRows[0].value, 10);
      if (!isNaN(parsed) && parsed > 0) archiveDays = parsed;
    }

    const purgeResult = await db.instance.execute(sql`
      SELECT value FROM system_settings
      WHERE category = 'agency_retention'
        AND key = ${`tenant_${tenantId}_purge_days`}
      LIMIT 1
    `);
    const purgeRows = (purgeResult as any).rows ?? [];
    if (purgeRows.length > 0 && purgeRows[0].value) {
      const parsed = parseInt(purgeRows[0].value, 10);
      if (!isNaN(parsed) && parsed > 0) purgeDays = parsed;
    }
  } catch {
    // Fall back to defaults on any DB error
  }

  return { archiveDays, purgeDays };
}

/**
 * Run the full archival cycle: archive then purge, then log audit event.
 */
export async function runArchivalCycle(): Promise<void> {
  const start = Date.now();

  const archiveResult = await archiveOldRecords();
  const purgeResult = await purgeOldRecords();

  const durationMs = Date.now() - start;

  auditLogger.log({
    eventType: "agency_archival",
    userId: null,
    metadata: {
      archivedCount: archiveResult.archivedCount,
      purgedCount: purgeResult.purgedCount,
      durationMs,
    },
  });
}
