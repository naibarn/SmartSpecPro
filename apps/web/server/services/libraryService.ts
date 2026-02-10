import { and, eq, gt, isNull, or } from "drizzle-orm";

import { getDb } from "../db";
import {
  libraryItems,
  libraryLinks,
  libraryPermissions,
} from "../../drizzle/schema";

export type LibraryPermissionLevel = "read" | "write" | "owner";
export type LibraryVisibility = "private" | "team" | "public";
export type LibraryItemStatus = "draft" | "ready" | "indexing" | "archived" | "failed";

export interface LibraryActor {
  userId: number;
  tenantId: number;
  role?: string | null;
}

export interface LibrarySourceLinkInput {
  linkType: string;
  linkId: string;
  providerTaskId?: string | null;
}

export interface CreateLibraryItemInput {
  itemType: string;
  source: string;
  title: string;
  description?: string | null;
  status?: LibraryItemStatus;
  visibility?: LibraryVisibility;
  metadata?: Record<string, unknown>;
  sourceUrl?: string | null;
  thumbnailUrl?: string | null;
  sourceLink?: LibrarySourceLinkInput;
}

export interface UpdateLibraryItemInput {
  title?: string;
  description?: string | null;
  status?: LibraryItemStatus;
  visibility?: LibraryVisibility;
  metadata?: Record<string, unknown>;
  sourceUrl?: string | null;
  thumbnailUrl?: string | null;
}

export interface ShareLibraryItemInput {
  itemId: number;
  subjectType: "user" | "tenant_role";
  subjectId: string;
  permissionLevel: LibraryPermissionLevel;
  expiresAt?: Date | null;
}

export interface LibraryItemDto {
  id: number;
  tenantId: number;
  ownerUserId: number;
  itemType: string;
  source: string;
  title: string;
  description: string | null;
  status: LibraryItemStatus;
  visibility: LibraryVisibility;
  metadata: Record<string, unknown>;
  sourceUrl: string | null;
  thumbnailUrl: string | null;
  deletedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

interface CreateLibraryItemResult {
  item: LibraryItemDto;
  idempotent: boolean;
}

type DbClient = NonNullable<Awaited<ReturnType<typeof getDb>>>;
type LibraryItemRow = typeof libraryItems.$inferSelect;

function toLibraryItemDto(row: LibraryItemRow): LibraryItemDto {
  return {
    id: row.id,
    tenantId: row.tenantId,
    ownerUserId: row.ownerUserId,
    itemType: row.itemType,
    source: row.source,
    title: row.title,
    description: row.description,
    status: row.status,
    visibility: row.visibility,
    metadata: normalizeLibraryMetadata(row.metadata as Record<string, unknown>),
    sourceUrl: row.sourceUrl,
    thumbnailUrl: row.thumbnailUrl,
    deletedAt: row.deletedAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

async function resolveDb(dbClient?: DbClient): Promise<DbClient> {
  if (dbClient) {
    return dbClient;
  }

  const db = await getDb();
  if (!db) {
    throw new Error("Database not available");
  }

  return db;
}

function normalizeTagList(value: unknown): string[] {
  const asArray = Array.isArray(value)
    ? value
    : typeof value === "string"
      ? value.split(",")
      : [];

  const unique = new Set<string>();
  for (const entry of asArray) {
    if (typeof entry !== "string") continue;
    const normalized = entry.trim();
    if (normalized) {
      unique.add(normalized);
    }
  }

  return Array.from(unique);
}

export function normalizeLibraryMetadata(
  metadata: Record<string, unknown> | null | undefined,
): Record<string, unknown> {
  if (!metadata || Array.isArray(metadata)) {
    return {};
  }

  const output: Record<string, unknown> = {};
  for (const key of Object.keys(metadata).sort()) {
    const value = metadata[key];
    if (value === undefined || value === null) {
      continue;
    }

    if (key === "tags") {
      output.tags = normalizeTagList(value);
      continue;
    }

    if (typeof value === "string") {
      const trimmed = value.trim();
      if (trimmed.length > 0) {
        output[key] = trimmed;
      }
      continue;
    }

    if (typeof value === "number" || typeof value === "boolean") {
      output[key] = value;
      continue;
    }

    if (Array.isArray(value)) {
      output[key] = value;
      continue;
    }

    if (typeof value === "object") {
      output[key] = value;
    }
  }

  return output;
}

async function getUserPermissionLevel(
  db: DbClient,
  itemId: number,
  actor: LibraryActor,
): Promise<LibraryPermissionLevel | null> {
  const rows = await db
    .select({
      permissionLevel: libraryPermissions.permissionLevel,
    })
    .from(libraryPermissions)
    .where(
      and(
        eq(libraryPermissions.libraryItemId, itemId),
        eq(libraryPermissions.tenantId, actor.tenantId),
        eq(libraryPermissions.subjectType, "user"),
        eq(libraryPermissions.subjectId, String(actor.userId)),
        or(isNull(libraryPermissions.expiresAt), gt(libraryPermissions.expiresAt, new Date())),
      ),
    )
    .limit(1);

  const permission = rows[0]?.permissionLevel;
  if (permission === "read" || permission === "write" || permission === "owner") {
    return permission;
  }

  return null;
}

export function canReadLibraryItem(
  item: Pick<LibraryItemRow, "tenantId" | "ownerUserId" | "visibility">,
  actor: LibraryActor,
  permissionLevel: LibraryPermissionLevel | null,
): boolean {
  if (item.tenantId !== actor.tenantId) return false;
  if (actor.role === "admin") return true;
  if (item.ownerUserId === actor.userId) return true;
  if (item.visibility === "public") return true;
  if (item.visibility === "team") return true;
  return permissionLevel !== null;
}

export function canManageLibraryItem(
  item: Pick<LibraryItemRow, "tenantId" | "ownerUserId">,
  actor: LibraryActor,
  permissionLevel: LibraryPermissionLevel | null,
): boolean {
  if (item.tenantId !== actor.tenantId) return false;
  if (actor.role === "admin") return true;
  if (item.ownerUserId === actor.userId) return true;
  return permissionLevel === "write" || permissionLevel === "owner";
}

async function getLibraryItemRowById(
  db: DbClient,
  itemId: number,
  tenantId: number,
): Promise<LibraryItemRow | null> {
  const rows = await db
    .select()
    .from(libraryItems)
    .where(
      and(
        eq(libraryItems.id, itemId),
        eq(libraryItems.tenantId, tenantId),
        isNull(libraryItems.deletedAt),
      ),
    )
    .limit(1);

  return rows[0] ?? null;
}

export async function createLibraryItem(
  input: CreateLibraryItemInput,
  actor: LibraryActor,
  dbClient?: DbClient,
): Promise<CreateLibraryItemResult> {
  const db = await resolveDb(dbClient);

  if (input.sourceLink) {
    const existing = await db
      .select({
        item: libraryItems,
      })
      .from(libraryLinks)
      .innerJoin(libraryItems, eq(libraryLinks.libraryItemId, libraryItems.id))
      .where(
        and(
          eq(libraryLinks.linkType, input.sourceLink.linkType),
          eq(libraryLinks.linkId, input.sourceLink.linkId),
          isNull(libraryItems.deletedAt),
        ),
      )
      .limit(1);

    const found = existing[0]?.item;
    if (found) {
      if (found.tenantId !== actor.tenantId) {
        throw new Error("Source link already belongs to another tenant");
      }

      return {
        item: toLibraryItemDto(found),
        idempotent: true,
      };
    }
  }

  const inserted = await db
    .insert(libraryItems)
    .values({
      tenantId: actor.tenantId,
      ownerUserId: actor.userId,
      itemType: input.itemType,
      source: input.source,
      title: input.title,
      description: input.description ?? null,
      status: input.status ?? "ready",
      visibility: input.visibility ?? "private",
      metadata: normalizeLibraryMetadata(input.metadata),
      sourceUrl: input.sourceUrl ?? null,
      thumbnailUrl: input.thumbnailUrl ?? null,
    })
    .returning();

  const created = inserted[0];
  if (!created) {
    throw new Error("Failed to create library item");
  }

  if (input.sourceLink) {
    await db
      .insert(libraryLinks)
      .values({
        libraryItemId: created.id,
        linkType: input.sourceLink.linkType,
        linkId: input.sourceLink.linkId,
        providerTaskId: input.sourceLink.providerTaskId ?? null,
      })
      .onConflictDoNothing();
  }

  return {
    item: toLibraryItemDto(created),
    idempotent: false,
  };
}

export async function getLibraryItemById(
  itemId: number,
  actor: LibraryActor,
  dbClient?: DbClient,
): Promise<LibraryItemDto | null> {
  const db = await resolveDb(dbClient);
  const item = await getLibraryItemRowById(db, itemId, actor.tenantId);

  if (!item) {
    return null;
  }

  const permission = await getUserPermissionLevel(db, item.id, actor);
  if (!canReadLibraryItem(item, actor, permission)) {
    return null;
  }

  return toLibraryItemDto(item);
}

export async function updateLibraryItem(
  itemId: number,
  input: UpdateLibraryItemInput,
  actor: LibraryActor,
  dbClient?: DbClient,
): Promise<LibraryItemDto | null> {
  const db = await resolveDb(dbClient);
  const existing = await getLibraryItemRowById(db, itemId, actor.tenantId);

  if (!existing) {
    return null;
  }

  const permission = await getUserPermissionLevel(db, existing.id, actor);
  if (!canManageLibraryItem(existing, actor, permission)) {
    return null;
  }

  const updatePayload: Partial<typeof libraryItems.$inferInsert> = {
    updatedAt: new Date(),
  };

  if (input.title !== undefined) updatePayload.title = input.title;
  if (input.description !== undefined) updatePayload.description = input.description;
  if (input.status !== undefined) updatePayload.status = input.status;
  if (input.visibility !== undefined) updatePayload.visibility = input.visibility;
  if (input.metadata !== undefined) updatePayload.metadata = normalizeLibraryMetadata(input.metadata);
  if (input.sourceUrl !== undefined) updatePayload.sourceUrl = input.sourceUrl;
  if (input.thumbnailUrl !== undefined) updatePayload.thumbnailUrl = input.thumbnailUrl;

  const updated = await db
    .update(libraryItems)
    .set(updatePayload)
    .where(and(eq(libraryItems.id, itemId), eq(libraryItems.tenantId, actor.tenantId)))
    .returning();

  if (!updated[0]) {
    return null;
  }

  return toLibraryItemDto(updated[0]);
}

export async function softDeleteLibraryItem(
  itemId: number,
  actor: LibraryActor,
  dbClient?: DbClient,
): Promise<boolean> {
  const db = await resolveDb(dbClient);
  const existing = await getLibraryItemRowById(db, itemId, actor.tenantId);

  if (!existing) {
    return false;
  }

  const permission = await getUserPermissionLevel(db, existing.id, actor);
  if (!canManageLibraryItem(existing, actor, permission)) {
    return false;
  }

  const deleted = await db
    .update(libraryItems)
    .set({
      deletedAt: new Date(),
      status: "archived",
      updatedAt: new Date(),
    })
    .where(and(eq(libraryItems.id, itemId), eq(libraryItems.tenantId, actor.tenantId)))
    .returning({ id: libraryItems.id });

  return Boolean(deleted[0]?.id);
}

export async function shareLibraryItem(
  input: ShareLibraryItemInput,
  actor: LibraryActor,
  dbClient?: DbClient,
): Promise<boolean> {
  const db = await resolveDb(dbClient);
  const existing = await getLibraryItemRowById(db, input.itemId, actor.tenantId);

  if (!existing) {
    return false;
  }

  const permission = await getUserPermissionLevel(db, existing.id, actor);
  if (!canManageLibraryItem(existing, actor, permission)) {
    return false;
  }

  await db
    .insert(libraryPermissions)
    .values({
      tenantId: actor.tenantId,
      libraryItemId: input.itemId,
      subjectType: input.subjectType,
      subjectId: input.subjectId,
      permissionLevel: input.permissionLevel,
      grantedByUserId: actor.userId,
      expiresAt: input.expiresAt ?? null,
    })
    .onConflictDoUpdate({
      target: [libraryPermissions.libraryItemId, libraryPermissions.subjectType, libraryPermissions.subjectId],
      set: {
        permissionLevel: input.permissionLevel,
        grantedByUserId: actor.userId,
        expiresAt: input.expiresAt ?? null,
        updatedAt: new Date(),
      },
    });

  return true;
}
