/**
 * Video Intelligence Platform (feature 133, section-05-db-tables-brand-kit)
 * — thin, tenant+owner-scoped data-access layer over `video_projects`,
 * `video_project_revisions`, and `brand_kits`. Keeps raw Drizzle queries out
 * of the section-07 router.
 *
 * Every exported function takes an explicit auth scope
 * `{ tenantId, userId }` and filters on BOTH `tenantId` and `userId` (spec
 * §17.1 tenant+owner isolation) — a foreign-tenant/foreign-user id always
 * resolves to `null`/`false`/`[]`, never another user's row. No cross-tenant
 * read is ever possible through this repo.
 *
 * The optimistic-concurrency document save (`saveVideoProjectDocument`) and
 * revision restore (`restoreVideoProjectRevision`) are the substantive logic
 * here: both wrap the revision-snapshot insert + `video_projects` update in
 * `db.transaction(...)` so a crash can never leave `revision` and the
 * snapshot table out of sync. A stale `baseRevision` throws
 * `VideoProjectRevisionConflictError` — the section-07 router maps this to
 * a tRPC `CONFLICT` (same "specific error class" convention as
 * `PresentationServiceError` / `presentationService.ts`'s version-conflict
 * precedent, kept intentionally small since this section owns no tRPC
 * layer).
 */
import { and, desc, eq, sql } from "drizzle-orm";
import { db } from "../db";
import {
  videoProjects,
  videoProjectRevisions,
  brandKits,
  libraryItems,
  type VideoProjectRow,
  type InsertVideoProjectRow,
  type VideoProjectRevisionRow,
  type BrandKitRow,
  type InsertBrandKitRow,
} from "../../drizzle/schema";
import { mergeQaLedger, type QaLedgerEntry } from "../../shared/videoIntelligence/qaLedger";

export type ProjectAuthScope = { tenantId: string; userId: number };

/**
 * Thrown by `saveVideoProjectDocument` when the caller's `baseRevision`
 * doesn't match the current `video_projects.revision` — an optimistic-
 * concurrency conflict. The section-07 router maps this to a tRPC
 * `CONFLICT`. Never swallow this error.
 */
export class VideoProjectRevisionConflictError extends Error {
  readonly code = "VIDEO_PROJECT_REVISION_CONFLICT";
  readonly projectId: number;
  readonly expectedRevision: number;
  readonly actualRevision: number;

  constructor(projectId: number, expectedRevision: number, actualRevision: number) {
    super(
      `VIDEO_PROJECT_REVISION_CONFLICT: project ${projectId} expected base revision ${expectedRevision} but current revision is ${actualRevision}`,
    );
    this.name = "VideoProjectRevisionConflictError";
    this.projectId = projectId;
    this.expectedRevision = expectedRevision;
    this.actualRevision = actualRevision;
  }
}

/** Thrown when the referenced project/revision doesn't exist for this tenant+user scope. */
export class VideoProjectNotFoundError extends Error {
  readonly code = "VIDEO_PROJECT_NOT_FOUND";

  constructor(message: string) {
    super(message);
    this.name = "VideoProjectNotFoundError";
  }
}

function projectScopeWhere(scope: ProjectAuthScope, id: number) {
  return and(
    eq(videoProjects.id, id),
    eq(videoProjects.tenantId, scope.tenantId),
    eq(videoProjects.userId, scope.userId),
  );
}

/** Insert a new project row scoped to tenant+user. Returns the created row. */
export async function insertVideoProject(
  scope: ProjectAuthScope,
  values: Omit<InsertVideoProjectRow, "tenantId" | "userId">,
): Promise<VideoProjectRow> {
  const rows = await db
    .insert(videoProjects)
    .values({ ...values, tenantId: scope.tenantId, userId: scope.userId })
    .returning();
  return rows[0] as VideoProjectRow;
}

/**
 * Clones an owner-scoped project for the repeat-use catalog workflow. The
 * authored document, brief, source refs and brand-kit attachment are kept;
 * lifecycle state and render/review pointers are reset so the clone cannot
 * appear to have a completed render or inherit an in-flight job.
 */
export async function duplicateVideoProject(
  scope: ProjectAuthScope,
  args: { projectId: number; name?: string },
): Promise<VideoProjectRow> {
  return db.transaction(async tx => {
    const rows = await tx
      .select()
      .from(videoProjects)
      .where(projectScopeWhere(scope, args.projectId))
      .limit(1);
    const source = rows[0] as VideoProjectRow | undefined;
    if (!source) {
      throw new VideoProjectNotFoundError(`video_project ${args.projectId} not found for this tenant+user scope`);
    }

    const requestedName = args.name?.trim();
    const name = (requestedName || `${source.name} (copy)`).slice(0, 200);
    const cloned = await tx
      .insert(videoProjects)
      .values({
        tenantId: scope.tenantId,
        userId: scope.userId,
        studioType: source.studioType,
        name,
        status: "brief",
        automationMode: source.automationMode,
        brief: source.brief,
        document: source.document,
        revision: 1,
        brandKitId: source.brandKitId,
        sourceRefs: source.sourceRefs,
        qaLedger: null,
        renderJobId: null,
        previewJobId: null,
        resultLibraryItemId: null,
      } as never)
      .returning();
    return cloned[0] as VideoProjectRow;
  });
}

/** Owner-scoped single fetch; returns null when not found or foreign-tenant/foreign-user. */
export async function getVideoProject(
  scope: ProjectAuthScope,
  id: number,
): Promise<VideoProjectRow | null> {
  const rows = await db
    .select()
    .from(videoProjects)
    .where(projectScopeWhere(scope, id))
    .limit(1);
  return (rows[0] as VideoProjectRow | undefined) ?? null;
}

/** Owner-scoped list (optionally filtered by studioType/status). */
export async function listVideoProjects(
  scope: ProjectAuthScope,
  filter?: { studioType?: string; status?: string },
): Promise<VideoProjectRow[]> {
  const conditions = [
    eq(videoProjects.tenantId, scope.tenantId),
    eq(videoProjects.userId, scope.userId),
  ];
  if (filter?.studioType) conditions.push(eq(videoProjects.studioType, filter.studioType));
  if (filter?.status) conditions.push(eq(videoProjects.status, filter.status));

  return db
    .select()
    .from(videoProjects)
    .where(and(...conditions))
    .orderBy(desc(videoProjects.updatedAt)) as unknown as Promise<VideoProjectRow[]>;
}

/** A `listVideoProjectsByProduct` row: project fields + the resolved library-item preview. */
export type VideoProjectByProductRow = {
  id: number;
  name: string;
  studioType: string;
  status: string;
  updatedAt: VideoProjectRow["updatedAt"];
  createdAt: VideoProjectRow["createdAt"];
  resultLibraryItemId: number | null;
  resultThumbnailUrl: string | null;
  resultVideoUrl: string | null;
};

/**
 * Owner-scoped list of projects whose `sourceRefs.productIds` contains the
 * given marketplace `productId`, newest-first. LEFT JOINs `library_items`
 * (via `resultLibraryItemId`) to surface the rendered preview's thumbnail
 * and source URL for the "prior projects from this product" UI.
 */
export async function listVideoProjectsByProduct(
  scope: ProjectAuthScope,
  args: { productId: string; limit?: number },
): Promise<VideoProjectByProductRow[]> {
  const limit = Math.max(1, Math.min(args.limit ?? 20, 50));

  const rows = await db
    .select({
      id: videoProjects.id,
      name: videoProjects.name,
      studioType: videoProjects.studioType,
      status: videoProjects.status,
      updatedAt: videoProjects.updatedAt,
      createdAt: videoProjects.createdAt,
      resultLibraryItemId: videoProjects.resultLibraryItemId,
      resultThumbnailUrl: libraryItems.thumbnailUrl,
      resultVideoUrl: libraryItems.sourceUrl,
    })
    .from(videoProjects)
    .leftJoin(libraryItems, eq(videoProjects.resultLibraryItemId, libraryItems.id))
    .where(
      and(
        eq(videoProjects.tenantId, scope.tenantId),
        eq(videoProjects.userId, scope.userId),
        sql`${videoProjects.sourceRefs} -> 'productIds' @> ${JSON.stringify([args.productId])}::jsonb`,
      ),
    )
    .orderBy(desc(videoProjects.updatedAt))
    .limit(limit);

  return rows as VideoProjectByProductRow[];
}

/**
 * Optimistic-concurrency document save:
 *  - reject (throw `VideoProjectRevisionConflictError`) if `baseRevision`
 *    doesn't match the current `video_projects.revision`
 *  - on success: write a `video_project_revisions` snapshot of the NEW
 *    document, bump `video_projects.revision` to `baseRevision + 1`, update
 *    `document` + `updatedAt`
 * Returns the new revision number. Wrapped in `db.transaction(...)` so the
 * snapshot insert and the revision bump can never diverge.
 */
export async function saveVideoProjectDocument(
  scope: ProjectAuthScope,
  args: { id: number; baseRevision: number; document: unknown; reason?: string },
): Promise<{ revision: number }> {
  const { id, baseRevision, document, reason } = args;

  return db.transaction(async tx => {
    const rows = await tx.select().from(videoProjects).where(projectScopeWhere(scope, id)).limit(1);
    const current = rows[0] as VideoProjectRow | undefined;
    if (!current) {
      throw new VideoProjectNotFoundError(`video_project ${id} not found for this tenant+user scope`);
    }
    if (current.revision !== baseRevision) {
      throw new VideoProjectRevisionConflictError(id, baseRevision, current.revision);
    }

    const nextRevision = baseRevision + 1;

    await tx.insert(videoProjectRevisions).values({
      projectId: id,
      revision: nextRevision,
      document: document as any,
      createdBy: scope.userId,
      reason: reason ?? null,
    });

    await tx
      .update(videoProjects)
      .set({ document: document as any, revision: nextRevision, updatedAt: new Date() })
      .where(projectScopeWhere(scope, id));

    return { revision: nextRevision };
  });
}

/**
 * List revision metadata newest-first. Ownership is enforced by checking the
 * parent project belongs to this tenant+user scope before ever querying
 * `video_project_revisions` (that table has no tenantId/userId columns of
 * its own — it inherits scoping from its parent project).
 */
export async function listVideoProjectRevisions(
  scope: ProjectAuthScope,
  projectId: number,
): Promise<VideoProjectRevisionRow[]> {
  const owned = await getVideoProject(scope, projectId);
  if (!owned) return [];

  return db
    .select()
    .from(videoProjectRevisions)
    .where(eq(videoProjectRevisions.projectId, projectId))
    .orderBy(desc(videoProjectRevisions.revision)) as unknown as Promise<VideoProjectRevisionRow[]>;
}

/**
 * Restore: copy the target revision's document back onto the project and
 * bump revision (never reuse an old number — the new revision is
 * `current.revision + 1`, not the restored revision's own number). Writes a
 * new `video_project_revisions` row too. Wrapped in `db.transaction(...)`.
 */
export async function restoreVideoProjectRevision(
  scope: ProjectAuthScope,
  args: { projectId: number; revision: number; reason?: string },
): Promise<{ revision: number }> {
  const { projectId, revision, reason } = args;

  return db.transaction(async tx => {
    const projectRows = await tx
      .select()
      .from(videoProjects)
      .where(projectScopeWhere(scope, projectId))
      .limit(1);
    const current = projectRows[0] as VideoProjectRow | undefined;
    if (!current) {
      throw new VideoProjectNotFoundError(`video_project ${projectId} not found for this tenant+user scope`);
    }

    const revisionRows = await tx
      .select()
      .from(videoProjectRevisions)
      .where(
        and(
          eq(videoProjectRevisions.projectId, projectId),
          eq(videoProjectRevisions.revision, revision),
        ),
      )
      .limit(1);
    const target = revisionRows[0] as VideoProjectRevisionRow | undefined;
    if (!target) {
      throw new VideoProjectNotFoundError(
        `video_project_revision ${revision} not found for project ${projectId}`,
      );
    }

    const nextRevision = current.revision + 1;

    await tx.insert(videoProjectRevisions).values({
      projectId,
      revision: nextRevision,
      document: target.document,
      createdBy: scope.userId,
      reason: reason ?? `restore:${revision}`,
    });

    await tx
      .update(videoProjects)
      .set({ document: target.document, revision: nextRevision, updatedAt: new Date() })
      .where(projectScopeWhere(scope, projectId));

    return { revision: nextRevision };
  });
}

function brandKitScopeWhere(scope: ProjectAuthScope, id: number) {
  return and(
    eq(brandKits.id, id),
    eq(brandKits.tenantId, scope.tenantId),
    eq(brandKits.userId, scope.userId),
  );
}

/** Insert a new brand kit row scoped to tenant+user. */
export async function insertBrandKit(
  scope: ProjectAuthScope,
  values: Omit<InsertBrandKitRow, "tenantId" | "userId">,
): Promise<BrandKitRow> {
  const rows = await db
    .insert(brandKits)
    .values({ ...values, tenantId: scope.tenantId, userId: scope.userId })
    .returning();
  return rows[0] as BrandKitRow;
}

/** Owner-scoped single fetch; returns null when not found or foreign-tenant/foreign-user. */
export async function getBrandKit(scope: ProjectAuthScope, id: number): Promise<BrandKitRow | null> {
  const rows = await db.select().from(brandKits).where(brandKitScopeWhere(scope, id)).limit(1);
  return (rows[0] as BrandKitRow | undefined) ?? null;
}

/** Owner-scoped list of all brand kits for this tenant+user. */
export async function listBrandKits(scope: ProjectAuthScope): Promise<BrandKitRow[]> {
  return db
    .select()
    .from(brandKits)
    .where(and(eq(brandKits.tenantId, scope.tenantId), eq(brandKits.userId, scope.userId)))
    .orderBy(desc(brandKits.updatedAt)) as unknown as Promise<BrandKitRow[]>;
}

/** Owner-scoped partial update; returns null when the row isn't owned by this scope. */
export async function updateBrandKit(
  scope: ProjectAuthScope,
  id: number,
  patch: Partial<Omit<InsertBrandKitRow, "tenantId" | "userId" | "id">>,
): Promise<BrandKitRow | null> {
  const rows = await db
    .update(brandKits)
    .set({ ...patch, updatedAt: new Date() })
    .where(brandKitScopeWhere(scope, id))
    .returning();
  return (rows[0] as BrandKitRow | undefined) ?? null;
}

/** Owner-scoped delete; returns false when nothing was deleted (foreign row). */
export async function deleteBrandKit(scope: ProjectAuthScope, id: number): Promise<boolean> {
  const rows = await db.delete(brandKits).where(brandKitScopeWhere(scope, id)).returning({ id: brandKits.id });
  return rows.length > 0;
}

/**
 * ADDITIVE — added by section-07 (`videoProjects.ts` router, §4.1/§4.4).
 * Owner-scoped partial update of non-document top-level `video_projects`
 * columns (`brief` / `status` / `renderJobId` / `previewJobId` /
 * `automationMode`). Deliberately does NOT touch `document`/`revision`
 * (unlike `saveVideoProjectDocument`'s optimistic-concurrency path) — these
 * are lighter-weight fields with no revision history of their own, so a
 * plain owner-scoped update is the correct primitive (no baseRevision check
 * needed). No existing export in this file was modified to add this.
 */
export async function updateVideoProjectFields(
  scope: ProjectAuthScope,
  id: number,
  patch: Partial<{
    brief: unknown;
    status: string;
    renderJobId: string | null;
    previewJobId: string | null;
    automationMode: string;
    // implementation-progress.md gap #1 (CLOSED, 2nd pass): `sourceRefs` was
    // previously write-once at `create` — a Catalog Studio project created
    // without a product could never satisfy `queueRender(profile: "final")`'s
    // `VI_MISSING_SOURCE_REFS` gate (routers/videoProjects.ts), with no
    // repair path short of delete+recreate. Additive field on an existing,
    // already-owner-scoped patch primitive — no other patch key's behavior
    // changes.
    sourceRefs: { productIds?: string[] } | null;
    // Post-render lifecycle (CMD-2 backend gap closure): written by
    // `dispatchLaneARemotionRenderJob` (`videoIntelligenceJobs.ts`) once a
    // FINAL render's produced video has been saved as a `library_items` row
    // — links the finished video back onto its owning project. A preview
    // render's terminal transition MUST NOT patch this field (it would
    // silently overwrite a prior final result with `null`/nothing to show).
    resultLibraryItemId: number | null;
    // ADDITIVE — CMD-2 brand-kit reachability closure (`routers/videoProjects.ts`
    // `setBrandKit`). Mirrors `document.brandKitId` (the field the compiler
    // and scene planner actually read — `resolveBrandKitForDocument`) onto
    // this denormalized column so `list`/`get` queries and any future
    // brand-kit-scoped listing never need to parse `document` just to know
    // which brand kit a project uses. `document.brandKitId` stays the
    // authoritative field; this column is always written in the SAME
    // mutation as the document update, so it can never observably diverge
    // from a caller's point of view.
    brandKitId: number | null;
  }>,
): Promise<VideoProjectRow | null> {
  const rows = await db
    .update(videoProjects)
    .set({ ...patch, updatedAt: new Date() } as Partial<VideoProjectRow>)
    .where(projectScopeWhere(scope, id))
    .returning();
  return (rows[0] as VideoProjectRow | undefined) ?? null;
}

/**
 * ADDITIVE — added by section-07 (§4.1's `delete({ projectId })` CRUD op).
 * Owner-scoped hard delete; cascades to `video_project_revisions` via its
 * FK's `onDelete: "cascade"` (section-05 schema). Returns false when nothing
 * was deleted (foreign-owner row, mirrors `deleteBrandKit`'s convention).
 */
export async function deleteVideoProject(scope: ProjectAuthScope, id: number): Promise<boolean> {
  const rows = await db
    .delete(videoProjects)
    .where(projectScopeWhere(scope, id))
    .returning({ id: videoProjects.id });
  return rows.length > 0;
}

/**
 * ADDITIVE — Feature 142, section-04. Owner-scoped read-modify-write of
 * `video_projects.qaLedger`, wrapped in `db.transaction(...)` so a
 * concurrent append can never interleave and lose an entry. Does NOT touch
 * `document`, `revision`, or `video_project_revisions` — reviews are not
 * documents (spec §6.2 / traps #3).
 */
export async function appendQaLedgerEntry(
  scope: ProjectAuthScope,
  projectId: number,
  entry: QaLedgerEntry,
): Promise<{ entryCount: number; totalCount: number }> {
  return db.transaction(async tx => {
    const rows = await tx
      .select()
      .from(videoProjects)
      .where(projectScopeWhere(scope, projectId))
      .limit(1);
    const current = rows[0] as VideoProjectRow | undefined;
    if (!current) {
      throw new VideoProjectNotFoundError(
        `video_project ${projectId} not found for this tenant+user scope`,
      );
    }

    const merged = mergeQaLedger(current.qaLedger, entry);

    await tx
      .update(videoProjects)
      .set({ qaLedger: merged as unknown as Record<string, unknown>, updatedAt: new Date() })
      .where(projectScopeWhere(scope, projectId));

    return { entryCount: merged.entries.length, totalCount: merged.totalCount };
  });
}
