import { and, desc, eq } from "drizzle-orm";

import type { DrizzleDB } from "../db";
import { presentationExports } from "../../drizzle/schema";

export type PresentationExport = typeof presentationExports.$inferSelect;

export interface CreateExportRecordInput {
  deckId: number;
  userId: number | null;
  tenantId: string;
  format: "png" | "jpg" | "pdf" | "mp4";
  width: number;
  height: number;
  fps?: number;
  quality?: "draft" | "standard" | "high";
  idempotencyKey: string;
}

export interface UpdateExportRecordInput {
  status?: "queued" | "processing" | "done" | "error" | "cancelled";
  progressPct?: number;
  stage?: string | null;
  errorMessage?: string | null;
  outputUrl?: string | null;
  outputStorageKey?: string | null;
  outputBytes?: number | null;
  celeryTaskId?: string | null;
}

/**
 * Insert a new export record with status='queued' and progressPct=0.
 * @returns The newly created record.
 */
export async function createExportRecord(
  input: CreateExportRecordInput,
  db: DrizzleDB,
): Promise<PresentationExport> {
  const rows = await db
    .insert(presentationExports)
    .values({
      deckId: input.deckId,
      userId: input.userId ?? null,
      tenantId: input.tenantId,
      format: input.format,
      quality: input.quality ?? null,
      width: input.width,
      height: input.height,
      fps: input.fps ?? null,
      status: "queued",
      progressPct: 0,
      idempotencyKey: input.idempotencyKey,
    })
    .returning();
  return rows[0]!;
}

/**
 * Partially update an export record.
 * Only the fields present in `updates` are written.
 * @returns The updated record, or null if not found.
 */
export async function updateExportRecord(
  id: number,
  updates: UpdateExportRecordInput,
  db: DrizzleDB,
): Promise<PresentationExport | null> {
  const rows = await db
    .update(presentationExports)
    .set({ ...updates, updatedAt: new Date() })
    .where(eq(presentationExports.id, id))
    .returning();
  return rows[0] ?? null;
}

/**
 * Fetch a single export record by its primary key.
 * @returns The record or null if not found.
 */
export async function getExportRecord(
  id: number,
  db: DrizzleDB,
): Promise<PresentationExport | null> {
  const rows = await db
    .select()
    .from(presentationExports)
    .where(eq(presentationExports.id, id))
    .limit(1);
  return rows[0] ?? null;
}

/**
 * Look up an export record by its idempotency key.
 * Used to detect duplicate export requests across server restarts.
 * @returns The record or null if not found.
 */
export async function getExportRecordByIdempotencyKey(
  key: string,
  db: DrizzleDB,
): Promise<PresentationExport | null> {
  const rows = await db
    .select()
    .from(presentationExports)
    .where(eq(presentationExports.idempotencyKey, key))
    .limit(1);
  return rows[0] ?? null;
}

/**
 * Look up an export record by its Celery task ID.
 * Used for reverse-lookup during status polling.
 * @returns The record or null if not found.
 */
export async function getExportRecordByCeleryTaskId(
  taskId: string,
  db: DrizzleDB,
): Promise<PresentationExport | null> {
  const rows = await db
    .select()
    .from(presentationExports)
    .where(eq(presentationExports.celeryTaskId, taskId))
    .limit(1);
  return rows[0] ?? null;
}

/**
 * Fetch recent export records for a given deck, scoped to a tenant and user.
 * Results are ordered newest-first and capped by `limit`.
 * @returns Array of export records (may be empty).
 */
export async function getExportsByDeckId(
  deckId: number,
  tenantId: string,
  userId: number,
  limit: number,
  db: DrizzleDB,
): Promise<PresentationExport[]> {
  return db
    .select()
    .from(presentationExports)
    .where(
      and(
        eq(presentationExports.deckId, deckId),
        eq(presentationExports.tenantId, tenantId),
        eq(presentationExports.userId, userId),
      ),
    )
    .orderBy(desc(presentationExports.createdAt))
    .limit(limit);
}
