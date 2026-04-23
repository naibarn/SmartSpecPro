import { TRPCError } from "@trpc/server";
import { desc, eq, isNull } from "drizzle-orm";

import { getDb } from "../db";
import {
  librarySavedViews,
  type LibrarySavedView,
} from "../../drizzle/schema";
import type { LibraryActor } from "./libraryService";
import { listLibraryDocuments } from "./libraryService";
import {
  librarySavedViewPresentationDefinitionSchema,
  librarySavedViewQueryDefinitionSchema,
  type LibraryArchiveSavedViewInput,
  type LibraryCreateSavedViewInput,
  type LibraryExecuteSavedViewInput,
  type LibrarySavedViewDetail,
  type LibrarySavedViewExecutionResult,
  type LibrarySavedViewListInput,
  type LibrarySavedViewQueryDefinition,
  type LibrarySavedViewRef,
  type LibrarySavedViewSummary,
  type LibraryUpdateSavedViewInput,
} from "../../shared/librarySavedViews";

type DbClient = NonNullable<Awaited<ReturnType<typeof getDb>>>;

function normalizeTenantId(tenantId: string | number): string {
  const normalized = String(tenantId).trim();
  if (!normalized) {
    throw new Error("Invalid tenant ID");
  }
  return normalized;
}

function slugifySavedView(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 160) || "saved-view";
}

function canReadSavedView(row: LibrarySavedView, actor: LibraryActor): boolean {
  return row.ownerUserId === actor.userId || row.visibilityMode === "team";
}

function canManageSavedView(row: LibrarySavedView, actor: LibraryActor): boolean {
  return row.ownerUserId === actor.userId || actor.role === "admin";
}

function toSavedViewSummary(row: LibrarySavedView): LibrarySavedViewSummary {
  return {
    id: row.id,
    slug: row.slug,
    title: row.title,
    description: row.description ?? null,
    visibilityMode: row.visibilityMode,
    scopeMode: row.scopeMode,
    updatedAt: row.updatedAt,
  };
}

function toSavedViewDetail(row: LibrarySavedView): LibrarySavedViewDetail {
  return {
    ...toSavedViewSummary(row),
    ownerUserId: row.ownerUserId,
    managingGroupId: row.managingGroupId ?? null,
    queryDefinition: librarySavedViewQueryDefinitionSchema.parse(
      row.queryDefinition ?? {},
    ),
    presentationDefinition: librarySavedViewPresentationDefinitionSchema.parse(
      row.presentationDefinition ?? {},
    ),
    archivedAt: row.archivedAt ?? null,
    createdAt: row.createdAt,
  };
}

async function resolveSavedViewRow(
  ref: LibrarySavedViewRef,
  actor: LibraryActor,
  options: {
    requireManage?: boolean;
    includeArchived?: boolean;
  } = {},
  dbClient?: DbClient,
): Promise<LibrarySavedView | null> {
  const db = dbClient ?? await getDb();
  const tenantId = normalizeTenantId(actor.tenantId);
  const rows = "id" in ref
    ? await db
      .select()
      .from(librarySavedViews)
      .where(eq(librarySavedViews.id, ref.id))
      .limit(1)
    : await db
      .select()
      .from(librarySavedViews)
      .where(eq(librarySavedViews.slug, ref.slug))
      .limit(1);

  const row = rows.find((candidate) => candidate.tenantId === tenantId) ?? null;
  if (!row) {
    return null;
  }
  if (!options.includeArchived && row.archivedAt) {
    return null;
  }
  if (options.requireManage ? !canManageSavedView(row, actor) : !canReadSavedView(row, actor)) {
    return null;
  }
  return row;
}

async function buildUniqueSavedViewSlug(
  db: DbClient,
  tenantId: string,
  preferredSlug: string | undefined,
  title: string,
): Promise<string> {
  const baseSlug = slugifySavedView(preferredSlug || title);
  const rows = await db
    .select({ slug: librarySavedViews.slug })
    .from(librarySavedViews)
    .where(eq(librarySavedViews.tenantId, tenantId));

  const taken = new Set(rows.map((row) => row.slug));
  if (!taken.has(baseSlug)) {
    return baseSlug;
  }

  for (let index = 2; index <= 1000; index += 1) {
    const candidate = `${baseSlug}-${index}`;
    if (!taken.has(candidate)) {
      return candidate;
    }
  }

  throw new TRPCError({
    code: "CONFLICT",
    message: "Unable to allocate a unique saved-view slug",
  });
}

export async function listLibrarySavedViews(
  input: LibrarySavedViewListInput | undefined,
  actor: LibraryActor,
  dbClient?: DbClient,
): Promise<LibrarySavedViewSummary[]> {
  const db = dbClient ?? await getDb();
  const tenantId = normalizeTenantId(actor.tenantId);
  const rows = await db
    .select()
    .from(librarySavedViews)
    .where(eq(librarySavedViews.tenantId, tenantId))
    .orderBy(desc(librarySavedViews.updatedAt));

  const filtered = rows
    .filter((row) => !row.archivedAt)
    .filter((row) => canReadSavedView(row, actor))
    .filter((row) => !input?.visibilityMode || row.visibilityMode === input.visibilityMode)
    .filter((row) => {
      const query = input?.query?.trim().toLowerCase();
      if (!query) return true;
      return row.title.toLowerCase().includes(query)
        || row.slug.toLowerCase().includes(query)
        || (row.description ?? "").toLowerCase().includes(query);
    });

  const offset = Math.max(0, input?.offset ?? 0);
  const limit = Math.min(Math.max(input?.limit ?? 25, 1), 50);
  return filtered.slice(offset, offset + limit).map(toSavedViewSummary);
}

export async function getLibrarySavedView(
  ref: LibrarySavedViewRef,
  actor: LibraryActor,
  dbClient?: DbClient,
): Promise<LibrarySavedViewDetail | null> {
  const row = await resolveSavedViewRow(ref, actor, {}, dbClient);
  return row ? toSavedViewDetail(row) : null;
}

export async function createLibrarySavedView(
  input: LibraryCreateSavedViewInput,
  actor: LibraryActor,
  dbClient?: DbClient,
): Promise<LibrarySavedViewDetail> {
  const db = dbClient ?? await getDb();
  const tenantId = normalizeTenantId(actor.tenantId);
  const slug = await buildUniqueSavedViewSlug(db, tenantId, input.slug, input.title);
  const now = new Date();

  const [created] = await db
    .insert(librarySavedViews)
    .values({
      tenantId,
      ownerUserId: actor.userId,
      slug,
      title: input.title.trim(),
      description: input.description?.trim() || null,
      visibilityMode: input.visibilityMode,
      scopeMode: input.scopeMode,
      queryDefinition: librarySavedViewQueryDefinitionSchema.parse(
        input.queryDefinition,
      ),
      presentationDefinition:
        librarySavedViewPresentationDefinitionSchema.parse(
          input.presentationDefinition,
        ),
      createdAt: now,
      updatedAt: now,
    })
    .returning();

  return toSavedViewDetail(created);
}

export async function updateLibrarySavedView(
  input: LibraryUpdateSavedViewInput,
  actor: LibraryActor,
  dbClient?: DbClient,
): Promise<LibrarySavedViewDetail> {
  const db = dbClient ?? await getDb();
  const existing = await resolveSavedViewRow(
    input.ref,
    actor,
    { requireManage: true },
    db,
  );
  if (!existing) {
    throw new TRPCError({
      code: "NOT_FOUND",
      message: "Saved view not found",
    });
  }
  if (
    input.expectedUpdatedAt
    && existing.updatedAt.getTime() !== input.expectedUpdatedAt.getTime()
  ) {
    throw new TRPCError({
      code: "CONFLICT",
      message: "Saved view has changed since it was loaded",
    });
  }

  const patch: Partial<typeof librarySavedViews.$inferInsert> = {
    updatedAt: new Date(),
  };

  if (input.title !== undefined) patch.title = input.title.trim();
  if (input.description !== undefined) patch.description = input.description?.trim() || null;
  if (input.visibilityMode !== undefined) patch.visibilityMode = input.visibilityMode;
  if (input.scopeMode !== undefined) patch.scopeMode = input.scopeMode;
  if (input.queryDefinition !== undefined) {
    patch.queryDefinition = librarySavedViewQueryDefinitionSchema.parse(
      input.queryDefinition,
    );
  }
  if (input.presentationDefinition !== undefined) {
    patch.presentationDefinition =
      librarySavedViewPresentationDefinitionSchema.parse(
        input.presentationDefinition,
      );
  }

  const [updated] = await db
    .update(librarySavedViews)
    .set(patch)
    .where(eq(librarySavedViews.id, existing.id))
    .returning();

  return toSavedViewDetail(updated);
}

export async function archiveLibrarySavedView(
  input: LibraryArchiveSavedViewInput,
  actor: LibraryActor,
  dbClient?: DbClient,
): Promise<{ success: true }> {
  const db = dbClient ?? await getDb();
  const existing = await resolveSavedViewRow(
    input,
    actor,
    { requireManage: true },
    db,
  );
  if (!existing) {
    throw new TRPCError({
      code: "NOT_FOUND",
      message: "Saved view not found",
    });
  }

  await db
    .update(librarySavedViews)
    .set({
      archivedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(librarySavedViews.id, existing.id));

  return { success: true };
}

export async function executeLibrarySavedView(
  input: LibraryExecuteSavedViewInput,
  actor: LibraryActor,
  dbClient?: DbClient,
): Promise<LibrarySavedViewExecutionResult> {
  const row = await resolveSavedViewRow(input.ref, actor, {}, dbClient);
  if (!row) {
    throw new TRPCError({
      code: "NOT_FOUND",
      message: "Saved view not found",
    });
  }

  const queryDefinition: LibrarySavedViewQueryDefinition =
    librarySavedViewQueryDefinitionSchema.parse(row.queryDefinition ?? {});
  const scope = queryDefinition.scope ?? row.scopeMode;

  if (scope === "private_vault" && !actor.privateVaultUnlocked) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Private vault is locked",
    });
  }

  const limit = Math.min(
    Math.max(input.limitOverride ?? queryDefinition.limit ?? 50, 1),
    200,
  );
  const result = await listLibraryDocuments(
    {
      query: queryDefinition.query,
      scope,
      sort: queryDefinition.sort ?? "updated_desc",
      limit,
      offset: 0,
      folderId: queryDefinition.folderId ?? undefined,
      filters: queryDefinition.filters,
    },
    actor,
    dbClient,
  );

  return {
    view: toSavedViewSummary(row),
    total: result.total,
    items: result.results.map((item) => ({
      id: item.id,
      title: item.title,
      itemType: item.item_type,
      status: item.status,
      visibility: item.visibility,
      updatedAt: new Date(item.updated_at),
    })),
  };
}
