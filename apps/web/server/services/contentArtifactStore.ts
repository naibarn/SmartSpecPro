/**
 * Content Artifact Store — Spec 038 Section 09
 *
 * CRUD operations for content_artifacts table.
 */

import { db } from "../db";
import { contentArtifacts } from "../../drizzle/schema";
import { eq, and, lt, sql } from "drizzle-orm";
import { calculateNextRefreshAt } from "./contentStalenessChecker";
import type { QualityReport } from "./contentOutputProcessor";

export interface SaveArtifactInput {
  tenantId: string;
  userId: number;
  skillSlug: string;
  outputFormat: string;
  contentJson: unknown;
  qualityScore: QualityReport;
  refreshCadenceDays?: number;
}

export async function saveArtifact(input: SaveArtifactInput) {
  const now = new Date();
  const cadence = input.refreshCadenceDays ?? 30;
  const nextRefresh = calculateNextRefreshAt(now, cadence);

  const [artifact] = await db
    .insert(contentArtifacts)
    .values({
      tenantId: input.tenantId,
      userId: input.userId,
      skillSlug: input.skillSlug,
      outputFormat: input.outputFormat,
      contentJson: input.contentJson,
      qualityScore: input.qualityScore,
      lastVerifiedAt: now,
      refreshCadenceDays: cadence,
      nextRefreshAt: nextRefresh,
      status: "active",
    })
    .returning();

  return artifact;
}

export async function getArtifactById(id: number, tenantId?: string) {
  const conditions = [eq(contentArtifacts.id, id)];
  if (tenantId) {
    conditions.push(eq(contentArtifacts.tenantId, tenantId));
  }
  const [artifact] = await db
    .select()
    .from(contentArtifacts)
    .where(and(...conditions))
    .limit(1);
  return artifact ?? null;
}

export async function listArtifacts(filters: {
  tenantId: string;
  status?: "active" | "stale" | "archived";
  skillSlug?: string;
  limit?: number;
  offset?: number;
}) {
  const conditions = [eq(contentArtifacts.tenantId, filters.tenantId)];
  if (filters.status) {
    conditions.push(eq(contentArtifacts.status, filters.status));
  }
  if (filters.skillSlug) {
    conditions.push(eq(contentArtifacts.skillSlug, filters.skillSlug));
  }

  return db
    .select()
    .from(contentArtifacts)
    .where(and(...conditions))
    .limit(filters.limit ?? 50)
    .offset(filters.offset ?? 0)
    .orderBy(contentArtifacts.createdAt);
}

export async function getStaleArtifacts(tenantId: string) {
  return db
    .select()
    .from(contentArtifacts)
    .where(
      and(
        eq(contentArtifacts.tenantId, tenantId),
        eq(contentArtifacts.status, "stale")
      )
    )
    .orderBy(contentArtifacts.nextRefreshAt);
}

/**
 * Mark artifacts as stale where nextRefreshAt < NOW() and status = 'active'.
 * Returns count of newly stale items.
 */
export async function checkAndMarkStaleContent(): Promise<number> {
  const result = await db
    .update(contentArtifacts)
    .set({ status: "stale", updatedAt: new Date() })
    .where(
      and(
        eq(contentArtifacts.status, "active"),
        lt(contentArtifacts.nextRefreshAt, sql`NOW()`)
      )
    )
    .returning({ id: contentArtifacts.id });

  return result.length;
}

export async function refreshArtifact(id: number, tenantId?: string) {
  const artifact = await getArtifactById(id, tenantId);
  if (!artifact) return null;

  const now = new Date();
  const nextRefresh = calculateNextRefreshAt(
    now,
    artifact.refreshCadenceDays ?? 30
  );

  const [updated] = await db
    .update(contentArtifacts)
    .set({
      status: "active",
      lastVerifiedAt: now,
      nextRefreshAt: nextRefresh,
      updatedAt: now,
    })
    .where(eq(contentArtifacts.id, id))
    .returning();

  return updated;
}

export async function archiveArtifact(id: number, tenantId?: string) {
  const conditions = [eq(contentArtifacts.id, id)];
  if (tenantId) {
    conditions.push(eq(contentArtifacts.tenantId, tenantId));
  }
  const [updated] = await db
    .update(contentArtifacts)
    .set({ status: "archived", updatedAt: new Date() })
    .where(and(...conditions))
    .returning();
  return updated ?? null;
}
