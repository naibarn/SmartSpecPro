import { and, desc, eq, gt, inArray, isNull, or } from "drizzle-orm";

import { getDb } from "../db";
import {
  libraryChunks,
  libraryIndexJobs,
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

export interface LibrarySearchFilters {
  itemType?: string;
  model?: string;
  ownerUserId?: number;
  tags?: string[];
  status?: LibraryItemStatus;
  fromDate?: Date;
  toDate?: Date;
}

export interface LibrarySearchInput {
  query?: string;
  limit?: number;
  offset?: number;
  filters?: LibrarySearchFilters;
}

export interface LibrarySearchResultV1 {
  item_id: number;
  item_type: string;
  title: string;
  thumbnail_url: string | null;
  status: string;
  source: string;
  provider_name: string | null;
  model_name: string | null;
  owner_user_id: number;
  created_at: string;
  updated_at: string;
  combined_score: number;
  keyword_score: number;
  vector_score: number;
  attach_payload: {
    item_id: number;
    item_type: string;
    title: string;
    source: string;
  };
}

export interface LibrarySearchResponseV1 {
  version: "library_search_v1";
  query: string;
  total: number;
  limit: number;
  offset: number;
  has_more: boolean;
  results: LibrarySearchResultV1[];
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

function tokenize(value: string): string[] {
  return value
    .toLowerCase()
    .split(/[^a-z0-9]+/g)
    .map((token) => token.trim())
    .filter((token) => token.length > 1);
}

function computeTokenOverlapScore(queryTokens: string[], content: string): number {
  if (!queryTokens.length) return 0;
  const contentTokens = new Set(tokenize(content));
  if (!contentTokens.size) return 0;

  let hits = 0;
  for (const token of queryTokens) {
    if (contentTokens.has(token)) hits += 1;
  }

  return hits / queryTokens.length;
}

function itemMatchesFilters(item: LibraryItemRow, filters?: LibrarySearchFilters): boolean {
  if (!filters) return true;

  if (filters.itemType && item.itemType !== filters.itemType) return false;
  if (filters.ownerUserId !== undefined && item.ownerUserId !== filters.ownerUserId) return false;
  if (filters.status && item.status !== filters.status) return false;
  if (filters.fromDate && item.createdAt < filters.fromDate) return false;
  if (filters.toDate && item.createdAt > filters.toDate) return false;

  const metadata = normalizeLibraryMetadata(item.metadata as Record<string, unknown>);
  if (filters.model) {
    const model = typeof metadata.model === "string" ? metadata.model : null;
    const modelName = typeof metadata.model_name === "string" ? metadata.model_name : null;
    if (model !== filters.model && modelName !== filters.model) return false;
  }

  if (filters.tags && filters.tags.length > 0) {
    const metadataTags = Array.isArray(metadata.tags) ? metadata.tags.map((tag) => String(tag)) : [];
    const tagsSet = new Set(metadataTags.map((tag) => tag.toLowerCase()));
    const required = filters.tags.map((tag) => tag.toLowerCase());
    if (!required.every((tag) => tagsSet.has(tag))) return false;
  }

  return true;
}

function hasActivePermissionForItem(
  permissions: Array<{ libraryItemId: number; permissionLevel: string; expiresAt: Date | null }>,
  itemId: number,
): boolean {
  const now = new Date();
  return permissions.some((permission) => {
    if (permission.libraryItemId !== itemId) return false;
    if (!permission.permissionLevel) return false;
    if (permission.expiresAt && permission.expiresAt <= now) return false;
    return true;
  });
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

export async function enqueueLibraryIndexJob(
  input: { libraryItemId: number; tenantId: number; jobType?: string },
  dbClient?: DbClient,
): Promise<{ jobId: number; status: string; created: boolean }> {
  const db = await resolveDb(dbClient);
  const jobType = input.jobType ?? "initial_index";

  const existing = await db
    .select({
      id: libraryIndexJobs.id,
      status: libraryIndexJobs.status,
    })
    .from(libraryIndexJobs)
    .where(
      and(
        eq(libraryIndexJobs.libraryItemId, input.libraryItemId),
        eq(libraryIndexJobs.tenantId, input.tenantId),
        eq(libraryIndexJobs.jobType, jobType),
        inArray(libraryIndexJobs.status, ["pending", "processing", "retry_pending"]),
      ),
    )
    .limit(1);

  if (existing[0]) {
    return {
      jobId: existing[0].id,
      status: existing[0].status,
      created: false,
    };
  }

  const inserted = await db
    .insert(libraryIndexJobs)
    .values({
      tenantId: input.tenantId,
      libraryItemId: input.libraryItemId,
      jobType,
      status: "pending",
      attemptCount: 0,
      maxAttempts: 5,
      runAt: new Date(),
    })
    .returning({
      id: libraryIndexJobs.id,
      status: libraryIndexJobs.status,
    });

  const created = inserted[0];
  if (!created) {
    throw new Error("Failed to enqueue library index job");
  }

  await db
    .update(libraryItems)
    .set({
      status: "indexing",
      updatedAt: new Date(),
    })
    .where(and(eq(libraryItems.id, input.libraryItemId), eq(libraryItems.tenantId, input.tenantId)));

  return {
    jobId: created.id,
    status: created.status,
    created: true,
  };
}

export async function searchLibraryItems(
  input: LibrarySearchInput,
  actor: LibraryActor,
  dbClient?: DbClient,
): Promise<LibrarySearchResponseV1> {
  const db = await resolveDb(dbClient);

  const limit = Math.min(Math.max(input.limit ?? 20, 1), 100);
  const offset = Math.max(input.offset ?? 0, 0);
  const query = (input.query ?? "").trim();
  const queryTokens = tokenize(query);

  const itemRows = await db
    .select()
    .from(libraryItems)
    .where(and(eq(libraryItems.tenantId, actor.tenantId), isNull(libraryItems.deletedAt)))
    .orderBy(desc(libraryItems.createdAt));

  const filteredItems = itemRows.filter((item) => itemMatchesFilters(item, input.filters));
  const itemIds = filteredItems.map((item) => item.id);

  if (itemIds.length === 0) {
    return {
      version: "library_search_v1",
      query,
      total: 0,
      limit,
      offset,
      has_more: false,
      results: [],
    };
  }

  const [chunkRows, permissionRows] = await Promise.all([
    db
      .select({
        libraryItemId: libraryChunks.libraryItemId,
        content: libraryChunks.content,
        vectorRefId: libraryChunks.vectorRefId,
      })
      .from(libraryChunks)
      .where(
        and(
          eq(libraryChunks.tenantId, actor.tenantId),
          inArray(libraryChunks.libraryItemId, itemIds),
        ),
      ),
    db
      .select({
        libraryItemId: libraryPermissions.libraryItemId,
        permissionLevel: libraryPermissions.permissionLevel,
        expiresAt: libraryPermissions.expiresAt,
      })
      .from(libraryPermissions)
      .where(
        and(
          eq(libraryPermissions.tenantId, actor.tenantId),
          eq(libraryPermissions.subjectType, "user"),
          eq(libraryPermissions.subjectId, String(actor.userId)),
          inArray(libraryPermissions.libraryItemId, itemIds),
        ),
      ),
  ]);

  const chunksByItem = new Map<number, Array<{ content: string; vectorRefId: string | null }>>();
  for (const chunk of chunkRows) {
    const list = chunksByItem.get(chunk.libraryItemId) ?? [];
    list.push({
      content: chunk.content,
      vectorRefId: chunk.vectorRefId,
    });
    chunksByItem.set(chunk.libraryItemId, list);
  }

  const visibleScored = filteredItems
    .filter((item) => {
      const permissionLevel = hasActivePermissionForItem(permissionRows, item.id) ? "read" : null;
      return canReadLibraryItem(item, actor, permissionLevel);
    })
    .map((item) => {
      const metadata = normalizeLibraryMetadata(item.metadata as Record<string, unknown>);
      const chunks = chunksByItem.get(item.id) ?? [];

      const itemText = [
        item.title,
        item.description ?? "",
        JSON.stringify(metadata),
      ].join(" ");

      const keywordScore = query ? computeTokenOverlapScore(queryTokens, itemText) : 0;
      const vectorScore = query
        ? chunks
            .filter((chunk) => Boolean(chunk.vectorRefId))
            .reduce((maxScore, chunk) => {
              const score = computeTokenOverlapScore(queryTokens, chunk.content);
              return score > maxScore ? score : maxScore;
            }, 0)
        : 0;

      const combinedScore = query
        ? Number((0.45 * keywordScore + 0.55 * vectorScore).toFixed(6))
        : 0;

      const providerName = typeof metadata.provider_name === "string"
        ? metadata.provider_name
        : typeof metadata.provider === "string"
          ? metadata.provider
          : null;

      const modelName = typeof metadata.model_name === "string"
        ? metadata.model_name
        : typeof metadata.model === "string"
          ? metadata.model
          : null;

      return {
        item,
        keywordScore,
        vectorScore,
        combinedScore,
        providerName,
        modelName,
      };
    })
    .filter((entry) => {
      if (!query) return true;
      return entry.keywordScore > 0 || entry.vectorScore > 0;
    });

  visibleScored.sort((a, b) => {
    if (b.combinedScore !== a.combinedScore) return b.combinedScore - a.combinedScore;
    if (b.keywordScore !== a.keywordScore) return b.keywordScore - a.keywordScore;
    if (b.vectorScore !== a.vectorScore) return b.vectorScore - a.vectorScore;
    if (b.item.createdAt.getTime() !== a.item.createdAt.getTime()) {
      return b.item.createdAt.getTime() - a.item.createdAt.getTime();
    }
    return a.item.id - b.item.id;
  });

  const paged = visibleScored.slice(offset, offset + limit);
  const results: LibrarySearchResultV1[] = paged.map((entry) => ({
    item_id: entry.item.id,
    item_type: entry.item.itemType,
    title: entry.item.title,
    thumbnail_url: entry.item.thumbnailUrl,
    status: entry.item.status,
    source: entry.item.source,
    provider_name: entry.providerName,
    model_name: entry.modelName,
    owner_user_id: entry.item.ownerUserId,
    created_at: entry.item.createdAt.toISOString(),
    updated_at: entry.item.updatedAt.toISOString(),
    combined_score: entry.combinedScore,
    keyword_score: Number(entry.keywordScore.toFixed(6)),
    vector_score: Number(entry.vectorScore.toFixed(6)),
    attach_payload: {
      item_id: entry.item.id,
      item_type: entry.item.itemType,
      title: entry.item.title,
      source: entry.item.source,
    },
  }));

  const total = visibleScored.length;
  return {
    version: "library_search_v1",
    query,
    total,
    limit,
    offset,
    has_more: offset + results.length < total,
    results,
  };
}
