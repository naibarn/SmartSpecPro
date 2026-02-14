import crypto from "crypto";
import { TRPCError } from "@trpc/server";
import { and, count, desc, eq, gt, inArray, isNotNull, isNull, or } from "drizzle-orm";

import { getDb } from "../db";
import { storagePut, storageDelete } from "../storage";
import {
  validateLibraryUrl,
  type LibraryUrlRejectReason,
} from "./libraryUrlPolicy";
import { isSvgUpload, sanitizeUploadedSvg } from "./uploadContentSafety";
import {
  libraryChunks,
  libraryContentVersions,
  libraryIndexJobs,
  libraryItems,
  libraryLinks,
  libraryPermissions,
  userGroups,
  users,
  type LibraryContentVersion,
} from "../../drizzle/schema";
import { getUserGroups as getGroupsServiceUserGroups } from "./groupsService";
import type { EffectivePermission, PermissionSource } from "../../shared/types/library";

export type LibraryPermissionLevel = "read" | "write" | "delete" | "owner";
export type LibraryVisibility = "private" | "team" | "public";
export type LibraryItemStatus = "draft" | "ready" | "indexing" | "archived" | "failed";
export type LibraryTenantId = string | number;

export interface LibraryActor {
  userId: number;
  tenantId: LibraryTenantId;
  role?: string | null;
}

export interface LibrarySourceLinkInput {
  linkType: string;
  linkId: string;
  providerTaskId?: string | null;
}

export interface DriveFileInput {
  driveFileId: string;
  name: string;
  mimeType: string;
  modifiedTime: string;
  size?: number;
  iconLink?: string;
  webViewLink?: string;
  owners?: Array<{ emailAddress: string; displayName?: string }>;
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
  subjectType: "user" | "tenant_role" | "group";
  subjectId: string;
  permissionLevel: LibraryPermissionLevel;
  expiresAt?: Date | null;
}

export interface LibraryItemDto {
  id: number;
  tenantId: string;
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

export interface CreateLibraryItemResult {
  item: LibraryItemDto;
  idempotent: boolean;
}

export class LibraryUrlValidationError extends Error {
  readonly field: "sourceUrl" | "thumbnailUrl";
  readonly reason: LibraryUrlRejectReason;
  readonly clientMessage: string;

  constructor(
    field: "sourceUrl" | "thumbnailUrl",
    reason: LibraryUrlRejectReason,
    clientMessage: string,
  ) {
    super(clientMessage);
    this.name = "LibraryUrlValidationError";
    this.field = field;
    this.reason = reason;
    this.clientMessage = clientMessage;
  }
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

export interface UploadLibraryFileInput {
  fileName: string;
  fileType: string;
  fileBase64: string;
  title?: string;
  visibility?: LibraryVisibility;
}

export interface UploadLibraryFileResult {
  item: LibraryItemDto;
  indexJob: {
    jobId: number;
    status: string;
    created: boolean;
  };
}

export interface LibrarySearchResultV1 {
  item_id: number;
  item_type: string;
  title: string;
  source_url: string | null;
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

export type LibraryDocumentScope = "all" | "my_library" | "shared_with_me" | "shared_groups";
export type LibraryDocumentSort = "updated_desc" | "created_desc";
export type LibraryDocumentAccessSource = "owner" | "shared_direct" | "shared_group";

export interface LibraryDocumentFilters {
  itemType?: string;
  ownerUserId?: number;
  status?: LibraryItemStatus;
  fromDate?: Date;
  toDate?: Date;
}

export interface LibraryDocumentListInput {
  query?: string;
  scope?: LibraryDocumentScope;
  sort?: LibraryDocumentSort;
  limit?: number;
  offset?: number;
  filters?: LibraryDocumentFilters;
}

export interface LibraryDocumentListItem {
  id: number;
  item_type: string;
  source: string;
  title: string;
  description: string | null;
  status: LibraryItemStatus;
  visibility: LibraryVisibility;
  source_url: string | null;
  thumbnail_url: string | null;
  owner_user_id: number;
  metadata: Record<string, unknown>;
  access_source: LibraryDocumentAccessSource;
  permission_level: LibraryPermissionLevel;
  created_at: string;
  updated_at: string;
}

export interface LibraryDocumentListResponse {
  total: number;
  limit: number;
  offset: number;
  has_more: boolean;
  scope: LibraryDocumentScope;
  results: LibraryDocumentListItem[];
}

export interface LibraryMarkdownContentResult {
  item_id: number;
  content: string;
  updated_at: string;
}

export interface SaveLibraryMarkdownInput {
  itemId: number;
  content: string;
  expectedUpdatedAt?: Date;
  changeDescription?: string;
}

export interface SaveLibraryMarkdownResult {
  item: LibraryItemDto;
  indexJob: {
    jobId: number;
    status: string;
    created: boolean;
  };
}

type DbClient = NonNullable<Awaited<ReturnType<typeof getDb>>>;
type LibraryItemRow = typeof libraryItems.$inferSelect;

function normalizeLibraryTenantId(tenantId: LibraryTenantId): string {
  const normalized = String(tenantId).trim();
  if (!normalized) {
    throw new Error("Invalid tenant ID");
  }
  return normalized;
}

function validateLibraryItemUrlField(
  field: "sourceUrl" | "thumbnailUrl",
  value: string | null | undefined,
): string | null {
  if (value === undefined || value === null) {
    return null;
  }

  const context = field === "sourceUrl" ? "library_source_url" : "library_thumbnail_url";
  const result = validateLibraryUrl(value, context);
  if (!result.ok) {
    throw new LibraryUrlValidationError(
      field,
      result.reason,
      `Invalid ${field}: ${result.message}`,
    );
  }

  return result.normalizedUrl;
}

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

const MAX_LIBRARY_UPLOAD_BYTES = 30 * 1024 * 1024;
const ALLOWED_LIBRARY_UPLOAD_EXTENSIONS = new Set([
  "jpg", "jpeg", "png", "gif", "webp", "svg", "bmp",
  "mp4", "webm", "mov", "avi", "mkv",
  "mp3", "wav", "m4a", "ogg", "aac",
  "pdf",
  "txt", "md", "markdown", "csv", "json", "html", "htm", "xml",
  "doc", "docx", "ppt", "pptx", "xls", "xlsx",
]);

const ALLOWED_LIBRARY_UPLOAD_MIME_PREFIXES = [
  "image/",
  "video/",
  "audio/",
  "text/",
];

const ALLOWED_LIBRARY_UPLOAD_MIME_TYPES = new Set([
  "application/pdf",
  "application/json",
  "application/xml",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-powerpoint",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
]);

function extractFileExtension(fileName: string): string {
  const ext = fileName.split(".").pop() || "";
  return ext.replace(/[^a-zA-Z0-9]/g, "").toLowerCase();
}

function inferLibraryItemType(fileType: string, extension: string): string {
  const normalizedFileType = fileType.toLowerCase();

  if (normalizedFileType.startsWith("image/")) return "image";
  if (normalizedFileType.startsWith("video/")) return "video";
  if (normalizedFileType.startsWith("audio/")) return "audio";
  if (extension === "md" || extension === "markdown") return "md";
  if (
    extension === "pdf" ||
    extension === "doc" ||
    extension === "docx" ||
    extension === "ppt" ||
    extension === "pptx" ||
    extension === "xls" ||
    extension === "xlsx"
  ) {
    return "document";
  }
  if (
    normalizedFileType.startsWith("text/") ||
    extension === "txt" ||
    extension === "csv" ||
    extension === "json" ||
    extension === "xml" ||
    extension === "html" ||
    extension === "htm"
  ) {
    return "text";
  }
  return "file";
}

function isAllowedLibraryUploadMime(fileType: string): boolean {
  const normalizedFileType = fileType.toLowerCase();
  if (ALLOWED_LIBRARY_UPLOAD_MIME_TYPES.has(normalizedFileType)) return true;
  return ALLOWED_LIBRARY_UPLOAD_MIME_PREFIXES.some((prefix) => normalizedFileType.startsWith(prefix));
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

interface LibraryPermissionRow {
  libraryItemId: number;
  subjectType: string;
  subjectId: string;
  permissionLevel: string;
  expiresAt: Date | null;
}

function rankPermissionLevel(permissionLevel: string | null | undefined): number {
  switch (permissionLevel) {
    case "owner":
      return 4;
    case "delete":
      return 3;
    case "write":
      return 2;
    case "read":
      return 1;
    default:
      return 0;
  }
}

function selectHighestPermissionLevel(permissionLevels: string[]): LibraryPermissionLevel | null {
  let highest: LibraryPermissionLevel | null = null;
  let highestRank = 0;

  for (const permissionLevel of permissionLevels) {
    const rank = rankPermissionLevel(permissionLevel);
    if (rank > highestRank) {
      highestRank = rank;
      highest = permissionLevel as LibraryPermissionLevel;
    }
  }

  return highest;
}

function getPermissionLevelForItem(
  permissions: LibraryPermissionRow[],
  itemId: number,
  actor: LibraryActor,
  userGroupIds?: number[],
): {
  effectivePermissionLevel: LibraryPermissionLevel | null;
  hasDirectShare: boolean;
  hasTenantRoleShare: boolean;
  hasGroupShare: boolean;
} {
  const now = new Date();
  const relevant = permissions.filter((permission) => {
    if (permission.libraryItemId !== itemId) return false;
    if (permission.expiresAt && permission.expiresAt <= now) return false;
    return true;
  });

  if (!relevant.length) {
    return {
      effectivePermissionLevel: null,
      hasDirectShare: false,
      hasTenantRoleShare: false,
      hasGroupShare: false,
    };
  }

  const directMatches = relevant.filter(
    (permission) =>
      permission.subjectType === "user" &&
      permission.subjectId === String(actor.userId),
  );
  const tenantRoleMatches = relevant.filter(
    (permission) =>
      permission.subjectType === "tenant_role" &&
      Boolean(actor.role) &&
      permission.subjectId === actor.role,
  );
  const groupMatches = userGroupIds?.length
    ? relevant.filter(
        (permission) =>
          permission.subjectType === "group" &&
          userGroupIds.includes(Number(permission.subjectId)),
      )
    : [];

  const highest = selectHighestPermissionLevel([
    ...directMatches.map((permission) => permission.permissionLevel),
    ...tenantRoleMatches.map((permission) => permission.permissionLevel),
    ...groupMatches.map((permission) => permission.permissionLevel),
  ]);

  return {
    effectivePermissionLevel: highest,
    hasDirectShare: directMatches.length > 0,
    hasTenantRoleShare: tenantRoleMatches.length > 0,
    hasGroupShare: groupMatches.length > 0,
  };
}

async function getUserPermissionLevel(
  db: DbClient,
  itemId: number,
  actor: LibraryActor,
): Promise<LibraryPermissionLevel | null> {
  const actorTenantId = normalizeLibraryTenantId(actor.tenantId);

  // Fetch user's groups (cached in groupsService, 1-min TTL)
  const userGroupsList = await getUserGroups(actor.userId, actorTenantId, db);
  const groupIds = userGroupsList.map((g) => String(g.id));

  const rows = await db
    .select({
      subjectType: libraryPermissions.subjectType,
      subjectId: libraryPermissions.subjectId,
      permissionLevel: libraryPermissions.permissionLevel,
      expiresAt: libraryPermissions.expiresAt,
    })
    .from(libraryPermissions)
    .where(
      and(
        eq(libraryPermissions.libraryItemId, itemId),
        eq(libraryPermissions.tenantId, actorTenantId),
        or(
          and(
            eq(libraryPermissions.subjectType, "user"),
            eq(libraryPermissions.subjectId, String(actor.userId)),
          ),
          and(
            eq(libraryPermissions.subjectType, "tenant_role"),
            eq(libraryPermissions.subjectId, actor.role || ""),
          ),
          ...(groupIds.length > 0
            ? [
                and(
                  eq(libraryPermissions.subjectType, "group"),
                  inArray(libraryPermissions.subjectId, groupIds),
                ),
              ]
            : []),
        ),
        or(isNull(libraryPermissions.expiresAt), gt(libraryPermissions.expiresAt, new Date())),
      ),
    )
    .limit(50);

  return selectHighestPermissionLevel(rows.map((row) => row.permissionLevel));
}

/**
 * Get all active groups for a user in their tenant.
 * Thin wrapper around groupsService.getUserGroups().
 * Caching is handled in groupsService layer (Redis, 1-minute TTL).
 */
async function getUserGroups(
  userId: number,
  tenantId: string,
  dbClient?: DbClient
): Promise<Array<{ id: number; name: string; role: string }>> {
  const groups = await getGroupsServiceUserGroups(
    { userId, tenantId },
    dbClient
  );
  return groups.map(g => ({
    id: g.id,
    name: g.name,
    role: g.role
  }));
}

/**
 * Get user's effective permission for an item across all sources.
 * Returns the highest permission level and all sources that grant access.
 * No caching - queries database on every call for immediate permission changes.
 */
export async function getUserEffectivePermission(
  itemId: number,
  actor: LibraryActor,
  dbClient?: DbClient,
): Promise<EffectivePermission> {
  const db = await resolveDb(dbClient);
  const actorTenantId = normalizeLibraryTenantId(actor.tenantId);

  const sources: PermissionSource[] = [];
  let highestLevel: 'read' | 'write' | 'delete' | 'owner' | null = null;
  let highestRank = 0;

  // 1. Check ownership
  const itemRows = await db
    .select()
    .from(libraryItems)
    .where(
      and(
        eq(libraryItems.id, itemId),
        eq(libraryItems.tenantId, actorTenantId)
      )
    )
    .limit(1);

  const item = itemRows[0];

  if (!item) {
    return {
      effectivePermissionLevel: null,
      sources: []
    };
  }

  // Explicit tenant isolation check (defense-in-depth)
  if (item.tenantId !== actorTenantId) {
    return {
      effectivePermissionLevel: null,
      sources: []
    };
  }

  if (item.ownerUserId === actor.userId) {
    sources.push({ type: 'owner' });
    highestLevel = 'owner';
    highestRank = 4;
  }

  // 2. Get user's groups (cached in groupsService)
  const userGroups = await getUserGroups(actor.userId, actorTenantId);
  const groupIds = userGroups.map(g => g.id);

  // 3. Fetch all permissions for this item
  const permissions = await db
    .select()
    .from(libraryPermissions)
    .where(
      and(
        eq(libraryPermissions.libraryItemId, itemId),
        eq(libraryPermissions.tenantId, actorTenantId),
        or(
          isNull(libraryPermissions.expiresAt),
          gt(libraryPermissions.expiresAt, new Date())
        )
      )
    );

  // 4. Process direct user share
  const directShare = permissions.find(
    (p: { subjectType: string; subjectId: string }) =>
      p.subjectType === 'user' && p.subjectId === String(actor.userId)
  );
  if (directShare) {
    sources.push({
      type: 'direct',
      permissionLevel: directShare.permissionLevel as 'read' | 'write' | 'delete' | 'owner',
      subjectId: directShare.subjectId
    });
    const rank = rankPermissionLevel(directShare.permissionLevel);
    if (rank > highestRank) {
      highestLevel = directShare.permissionLevel as 'read' | 'write' | 'delete' | 'owner';
      highestRank = rank;
    }
  }

  // 5. Process group shares (NEW)
  const groupShares = permissions.filter(
    (p: { subjectType: string; subjectId: string }) =>
      p.subjectType === 'group' && groupIds.includes(Number(p.subjectId))
  );
  for (const groupShare of groupShares) {
    const group = userGroups.find(g => g.id === Number(groupShare.subjectId));

    // SKIP permissions for deleted groups (defensive coding)
    if (!group) {
      continue;
    }

    sources.push({
      type: 'group',
      permissionLevel: groupShare.permissionLevel as 'read' | 'write' | 'delete' | 'owner',
      subjectId: groupShare.subjectId,
      groupName: group.name
    });
    const rank = rankPermissionLevel(groupShare.permissionLevel);
    if (rank > highestRank) {
      highestLevel = groupShare.permissionLevel as 'read' | 'write' | 'delete' | 'owner';
      highestRank = rank;
    }
  }

  // 6. Process tenant role share
  const roleShare = permissions.find(
    (p: { subjectType: string; subjectId: string | null }) =>
      p.subjectType === 'tenant_role' && p.subjectId !== null && p.subjectId === actor.role
  );
  if (roleShare) {
    sources.push({
      type: 'tenant_role',
      permissionLevel: roleShare.permissionLevel as 'read' | 'write' | 'delete' | 'owner',
      subjectId: roleShare.subjectId
    });
    const rank = rankPermissionLevel(roleShare.permissionLevel);
    if (rank > highestRank) {
      highestLevel = roleShare.permissionLevel as 'read' | 'write' | 'delete' | 'owner';
      highestRank = rank;
    }
  }

  return {
    effectivePermissionLevel: highestLevel,
    sources
  };
}

export function canReadLibraryItem(
  item: Pick<LibraryItemRow, "tenantId" | "ownerUserId" | "visibility">,
  actor: LibraryActor,
  permissionLevel: LibraryPermissionLevel | null,
): boolean {
  if (normalizeLibraryTenantId(item.tenantId) !== normalizeLibraryTenantId(actor.tenantId)) return false;
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
  if (normalizeLibraryTenantId(item.tenantId) !== normalizeLibraryTenantId(actor.tenantId)) return false;
  if (actor.role === "admin") return true;
  if (item.ownerUserId === actor.userId) return true;
  return permissionLevel === "write" || permissionLevel === "delete" || permissionLevel === "owner";
}

async function getLibraryItemRowById(
  db: DbClient,
  itemId: number,
  tenantId: LibraryTenantId,
): Promise<LibraryItemRow | null> {
  const normalizedTenantId = normalizeLibraryTenantId(tenantId);
  const rows = await db
    .select()
    .from(libraryItems)
    .where(
      and(
        eq(libraryItems.id, itemId),
        eq(libraryItems.tenantId, normalizedTenantId),
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
  const actorTenantId = normalizeLibraryTenantId(actor.tenantId);
  const now = new Date();

  const validatedSourceUrl = validateLibraryItemUrlField("sourceUrl", input.sourceUrl);
  const validatedThumbnailUrl = validateLibraryItemUrlField("thumbnailUrl", input.thumbnailUrl);

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
      if (normalizeLibraryTenantId(found.tenantId) !== actorTenantId) {
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
      tenantId: actorTenantId,
      ownerUserId: actor.userId,
      itemType: input.itemType,
      source: input.source,
      title: input.title,
      description: input.description ?? null,
      status: input.status ?? "ready",
      visibility: input.visibility ?? "private",
      metadata: normalizeLibraryMetadata(input.metadata),
      sourceUrl: validatedSourceUrl,
      thumbnailUrl: validatedThumbnailUrl,
      createdAt: now,
      updatedAt: now,
    })
    .returning();

  const created = inserted[0];
  if (!created) {
    throw new Error("Failed to create library item");
  }

  if (input.sourceLink) {
    const linkCreatedAt = new Date();
    await db
      .insert(libraryLinks)
      .values({
        libraryItemId: created.id,
        linkType: input.sourceLink.linkType,
        linkId: input.sourceLink.linkId,
        providerTaskId: input.sourceLink.providerTaskId ?? null,
        createdAt: linkCreatedAt,
      })
      .onConflictDoNothing();
  }

  return {
    item: toLibraryItemDto(created),
    idempotent: false,
  };
}

function mapDriveMimeToItemType(mimeType: string): string {
  const m = mimeType.toLowerCase();
  if (m.includes("document") || m.includes("word") || m.includes("msword")) return "document";
  if (m.includes("spreadsheet") || m.includes("excel") || m.includes("ms-excel")) return "spreadsheet";
  if (m.includes("presentation") || m.includes("powerpoint") || m.includes("ms-powerpoint")) return "presentation";
  if (m === "application/pdf") return "pdf";
  if (m.startsWith("text/")) return "text";
  return "file";
}

export async function createVirtualDriveReference(
  driveFile: DriveFileInput,
  actor: LibraryActor,
  dbClient?: DbClient,
): Promise<CreateLibraryItemResult> {
  const db = await resolveDb(dbClient);
  const actorTenantId = normalizeLibraryTenantId(actor.tenantId);

  // Dedup check via library_links (tenant-scoped)
  const existing = await db
    .select({ item: libraryItems })
    .from(libraryLinks)
    .innerJoin(libraryItems, eq(libraryLinks.libraryItemId, libraryItems.id))
    .where(
      and(
        eq(libraryLinks.linkType, "google_drive_file"),
        eq(libraryLinks.linkId, driveFile.driveFileId),
        eq(libraryLinks.tenantId, actorTenantId),
        isNull(libraryItems.deletedAt),
      ),
    )
    .limit(1);

  if (existing[0]?.item) {
    return {
      item: toLibraryItemDto(existing[0].item),
      idempotent: true,
    };
  }

  const itemType = mapDriveMimeToItemType(driveFile.mimeType);
  const now = new Date();

  const inserted = await db
    .insert(libraryItems)
    .values({
      tenantId: actorTenantId,
      ownerUserId: actor.userId,
      itemType,
      source: "google_drive",
      title: driveFile.name,
      status: "indexing",
      visibility: "private",
      sourceUrl: null,
      thumbnailUrl: driveFile.iconLink ?? null,
      metadata: normalizeLibraryMetadata({
        driveFileId: driveFile.driveFileId,
        driveMimeType: driveFile.mimeType,
        driveModifiedTime: driveFile.modifiedTime,
        driveSize: driveFile.size ?? null,
        driveWebViewLink: driveFile.webViewLink ?? null,
        driveOwners: driveFile.owners ?? null,
        syncStatus: "pending",
      }),
      createdAt: now,
      updatedAt: now,
    })
    .returning();

  const created = inserted[0];
  if (!created) {
    throw new Error("Failed to create virtual Drive reference");
  }

  // Insert library_link for dedup
  await db
    .insert(libraryLinks)
    .values({
      libraryItemId: created.id,
      linkType: "google_drive_file",
      linkId: driveFile.driveFileId,
      tenantId: actorTenantId,
      createdAt: now,
    })
    .onConflictDoNothing();

  // Enqueue index job
  await enqueueLibraryIndexJob(
    {
      libraryItemId: created.id,
      tenantId: actorTenantId,
      jobType: "google_drive_sync",
    },
    db,
  );

  return {
    item: toLibraryItemDto(created),
    idempotent: false,
  };
}

export async function uploadLibraryFile(
  input: UploadLibraryFileInput,
  actor: LibraryActor,
  dbClient?: DbClient,
): Promise<UploadLibraryFileResult> {
  const db = await resolveDb(dbClient);
  const tenantId = normalizeLibraryTenantId(actor.tenantId);
  const fileName = input.fileName.trim();
  const fileType = (input.fileType || "application/octet-stream").trim().toLowerCase();

  if (!fileName) {
    throw new Error("File name is required");
  }

  const ext = extractFileExtension(fileName);
  if (!isAllowedLibraryUploadMime(fileType) && !ALLOWED_LIBRARY_UPLOAD_EXTENSIONS.has(ext)) {
    throw new Error("File type is not supported for library upload");
  }

  if (ext && !ALLOWED_LIBRARY_UPLOAD_EXTENSIONS.has(ext)) {
    throw new Error(`File extension .${ext} is not allowed`);
  }

  const b64 = input.fileBase64.includes(",")
    ? input.fileBase64.split(",", 2)[1]
    : input.fileBase64;
  let fileBuffer: Buffer<ArrayBufferLike> = Buffer.from(b64, "base64");

  if (!fileBuffer.length) {
    throw new Error("Uploaded file is empty");
  }

  if (fileBuffer.length > MAX_LIBRARY_UPLOAD_BYTES) {
    throw new Error("File too large (max 30MB)");
  }

  const svgUpload = isSvgUpload(fileType, ext);
  if (svgUpload) {
    const sanitized = sanitizeUploadedSvg(fileBuffer);
    if (!sanitized.safe) {
      throw new Error("Unsafe SVG content is not allowed");
    }
    fileBuffer = sanitized.sanitizedBuffer;
  }

  const fileId = crypto.randomUUID().replace(/-/g, "");
  const key = `library/uploads/${tenantId}/${actor.userId}/${fileId}${ext ? `.${ext}` : ""}`;
  const storage = await storagePut(key, fileBuffer, fileType);

  const inferredItemType = inferLibraryItemType(fileType, ext);
  const created = await createLibraryItem(
    {
      itemType: inferredItemType,
      source: "document_upload",
      title: input.title?.trim() || fileName,
      description: null,
      status: "indexing",
      visibility: input.visibility ?? "private",
      metadata: {
        file_name: fileName,
        file_type: fileType,
        extension: ext || null,
        file_size_bytes: fileBuffer.length,
        source_type: "document_upload",
        svg_sanitized: svgUpload || undefined,
      },
      sourceUrl: storage.url,
      thumbnailUrl: inferredItemType === "image" ? storage.url : null,
      sourceLink: {
        linkType: "upload_key",
        linkId: storage.key,
      },
    },
    actor,
    db,
  );

  const indexJob = await enqueueLibraryIndexJob(
    {
      libraryItemId: created.item.id,
      tenantId,
      jobType: "initial_index",
    },
    db,
  );

  return {
    item: created.item,
    indexJob,
  };
}

export async function getLibraryItemById(
  itemId: number,
  actor: LibraryActor,
  dbClient?: DbClient,
): Promise<LibraryItemDto | null> {
  const db = await resolveDb(dbClient);
  const actorTenantId = normalizeLibraryTenantId(actor.tenantId);
  const item = await getLibraryItemRowById(db, itemId, actorTenantId);

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
  const actorTenantId = normalizeLibraryTenantId(actor.tenantId);
  const existing = await getLibraryItemRowById(db, itemId, actorTenantId);

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
  if (input.sourceUrl !== undefined) {
    updatePayload.sourceUrl = input.sourceUrl === null
      ? null
      : validateLibraryItemUrlField("sourceUrl", input.sourceUrl);
  }
  if (input.thumbnailUrl !== undefined) {
    updatePayload.thumbnailUrl = input.thumbnailUrl === null
      ? null
      : validateLibraryItemUrlField("thumbnailUrl", input.thumbnailUrl);
  }

  const updated = await db
    .update(libraryItems)
    .set(updatePayload)
    .where(and(eq(libraryItems.id, itemId), eq(libraryItems.tenantId, actorTenantId)))
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
  const actorTenantId = normalizeLibraryTenantId(actor.tenantId);
  const existing = await getLibraryItemRowById(db, itemId, actorTenantId);

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
      deletedBy: actor.userId,
      status: "archived",
      updatedAt: new Date(),
    })
    .where(and(eq(libraryItems.id, itemId), eq(libraryItems.tenantId, actorTenantId)))
    .returning({ id: libraryItems.id });

  return Boolean(deleted[0]?.id);
}

export async function shareLibraryItem(
  input: ShareLibraryItemInput,
  actor: LibraryActor,
  dbClient?: DbClient,
): Promise<boolean> {
  const db = await resolveDb(dbClient);
  const actorTenantId = normalizeLibraryTenantId(actor.tenantId);
  const existing = await getLibraryItemRowById(db, input.itemId, actorTenantId);

  if (!existing) {
    return false;
  }

  const permission = await getUserPermissionLevel(db, existing.id, actor);
  if (!canManageLibraryItem(existing, actor, permission)) {
    return false;
  }

  // Prevent privilege escalation: actor cannot grant higher permission than they have
  // Owner and admin bypass this check (they can grant any level)
  if (existing.ownerUserId !== actor.userId && actor.role !== "admin") {
    const actorRank = rankPermissionLevel(permission);
    const grantRank = rankPermissionLevel(input.permissionLevel);
    if (grantRank > actorRank) {
      return false;
    }
  }

  // NEW: Validate group shares
  if (input.subjectType === 'group') {
    // 1. Validate group exists
    const groupRows = await db
      .select()
      .from(userGroups)
      .where(
        and(
          eq(userGroups.id, Number(input.subjectId)),
          isNull(userGroups.deletedAt)
        )
      )
      .limit(1);

    const group = groupRows[0];

    if (!group) {
      throw new Error('Group not found or has been deleted');
    }

    // 2. Validate group is in same tenant (cross-tenant isolation)
    if (group.tenantId !== actorTenantId) {
      throw new Error('Cannot share with groups from other tenants');
    }

    // 3. Validate item is in same tenant as group
    if (existing.tenantId !== group.tenantId) {
      throw new Error('Cannot share items across tenant boundaries');
    }
  }

  const now = new Date();
  await db
    .insert(libraryPermissions)
    .values({
      tenantId: actorTenantId,
      libraryItemId: input.itemId,
      subjectType: input.subjectType,
      subjectId: input.subjectId,
      permissionLevel: input.permissionLevel,
      grantedByUserId: actor.userId,
      expiresAt: input.expiresAt ?? null,
      createdAt: now,
      updatedAt: now,
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
  input: { libraryItemId: number; tenantId: LibraryTenantId; jobType?: string },
  dbClient?: DbClient,
): Promise<{ jobId: number; status: string; created: boolean }> {
  const db = await resolveDb(dbClient);
  const jobType = input.jobType ?? "initial_index";
  const tenantId = normalizeLibraryTenantId(input.tenantId);

  const existing = await db
    .select({
      id: libraryIndexJobs.id,
      status: libraryIndexJobs.status,
    })
    .from(libraryIndexJobs)
    .where(
      and(
        eq(libraryIndexJobs.libraryItemId, input.libraryItemId),
        eq(libraryIndexJobs.tenantId, tenantId),
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

  const now = new Date();
  const inserted = await db
    .insert(libraryIndexJobs)
    .values({
      tenantId,
      libraryItemId: input.libraryItemId,
      jobType,
      status: "pending",
      attemptCount: 0,
      maxAttempts: 5,
      runAt: now,
      createdAt: now,
      updatedAt: now,
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
    .where(and(eq(libraryItems.id, input.libraryItemId), eq(libraryItems.tenantId, tenantId)));

  return {
    jobId: created.id,
    status: created.status,
    created: true,
  };
}

function getDocumentAccessSource(
  item: Pick<LibraryItemRow, "ownerUserId" | "visibility">,
  actor: LibraryActor,
  permissionInfo: {
    hasDirectShare: boolean;
    hasTenantRoleShare: boolean;
    hasGroupShare: boolean;
  },
): LibraryDocumentAccessSource {
  if (item.ownerUserId === actor.userId) {
    return "owner";
  }

  if (permissionInfo.hasDirectShare) {
    return "shared_direct";
  }

  if (permissionInfo.hasGroupShare || permissionInfo.hasTenantRoleShare || item.visibility === "team" || item.visibility === "public") {
    return "shared_group";
  }

  return "shared_group";
}

function matchesDocumentScope(
  scope: LibraryDocumentScope,
  accessSource: LibraryDocumentAccessSource,
): boolean {
  if (scope === "all") return true;
  if (scope === "my_library") return accessSource === "owner";
  if (scope === "shared_with_me") return accessSource === "shared_direct";
  if (scope === "shared_groups") return accessSource === "shared_group";
  return true;
}

function itemMatchesDocumentFilters(
  item: LibraryItemRow,
  filters?: LibraryDocumentFilters,
): boolean {
  if (!filters) return true;

  if (filters.itemType && item.itemType !== filters.itemType) return false;
  if (filters.ownerUserId !== undefined && item.ownerUserId !== filters.ownerUserId) return false;
  if (filters.status && item.status !== filters.status) return false;
  if (filters.fromDate && item.createdAt < filters.fromDate) return false;
  if (filters.toDate && item.createdAt > filters.toDate) return false;
  return true;
}

function itemMatchesDocumentQuery(item: LibraryItemRow, query: string): boolean {
  if (!query) return true;
  const normalizedQuery = query.toLowerCase();
  const metadata = normalizeLibraryMetadata(item.metadata as Record<string, unknown>);
  const haystack = [
    item.title,
    item.description || "",
    item.itemType,
    item.source,
    JSON.stringify(metadata),
  ]
    .join(" ")
    .toLowerCase();

  return haystack.includes(normalizedQuery);
}

export class LibraryMarkdownVersionConflictError extends Error {
  readonly currentUpdatedAt: Date;

  constructor(currentUpdatedAt: Date) {
    super("Library markdown version conflict");
    this.name = "LibraryMarkdownVersionConflictError";
    this.currentUpdatedAt = currentUpdatedAt;
  }
}

export async function listLibraryDocuments(
  input: LibraryDocumentListInput,
  actor: LibraryActor,
  dbClient?: DbClient,
): Promise<LibraryDocumentListResponse> {
  const db = await resolveDb(dbClient);
  const actorTenantId = normalizeLibraryTenantId(actor.tenantId);

  const scope = input.scope ?? "all";
  const sort = input.sort ?? "updated_desc";
  const limit = Math.min(Math.max(input.limit ?? 30, 1), 100);
  const offset = Math.max(input.offset ?? 0, 0);
  const query = (input.query ?? "").trim();

  // Get user's groups (cached in groupsService, 1-min TTL)
  const userGroupsList = await getUserGroups(actor.userId, actorTenantId);
  const groupIds = userGroupsList.map(g => String(g.id));
  const groupIdNums = userGroupsList.map(g => g.id);

  const itemRows = await db
    .select()
    .from(libraryItems)
    .where(and(eq(libraryItems.tenantId, actorTenantId), isNull(libraryItems.deletedAt)))
    .orderBy(desc(libraryItems.updatedAt), desc(libraryItems.createdAt), desc(libraryItems.id));

  if (!itemRows.length) {
    return {
      total: 0,
      limit,
      offset,
      has_more: false,
      scope,
      results: [],
    };
  }

  const itemIds = itemRows.map((item) => item.id);
  const permissionRows: LibraryPermissionRow[] = await db
    .select({
      libraryItemId: libraryPermissions.libraryItemId,
      subjectType: libraryPermissions.subjectType,
      subjectId: libraryPermissions.subjectId,
      permissionLevel: libraryPermissions.permissionLevel,
      expiresAt: libraryPermissions.expiresAt,
    })
    .from(libraryPermissions)
    .where(
      and(
        eq(libraryPermissions.tenantId, actorTenantId),
        inArray(libraryPermissions.libraryItemId, itemIds),
        or(
          and(
            eq(libraryPermissions.subjectType, "user"),
            eq(libraryPermissions.subjectId, String(actor.userId)),
          ),
          and(
            eq(libraryPermissions.subjectType, "tenant_role"),
            eq(libraryPermissions.subjectId, actor.role || ""),
          ),
          ...(groupIds.length > 0 ? [
            and(
              eq(libraryPermissions.subjectType, "group"),
              inArray(libraryPermissions.subjectId, groupIds),
            )
          ] : []),
        ),
        or(isNull(libraryPermissions.expiresAt), gt(libraryPermissions.expiresAt, new Date())),
      ),
    );

  const visible = itemRows
    .filter((item) => itemMatchesDocumentFilters(item, input.filters))
    .filter((item) => itemMatchesDocumentQuery(item, query))
    .map((item) => {
      const permissionInfo = getPermissionLevelForItem(permissionRows, item.id, actor, groupIdNums);
      if (!canReadLibraryItem(item, actor, permissionInfo.effectivePermissionLevel)) {
        return null;
      }

      const accessSource = getDocumentAccessSource(item, actor, permissionInfo);
      if (!matchesDocumentScope(scope, accessSource)) {
        return null;
      }

      const metadata = normalizeLibraryMetadata(item.metadata as Record<string, unknown>);
      return {
        id: item.id,
        item_type: item.itemType,
        source: item.source,
        title: item.title,
        description: item.description,
        status: item.status,
        visibility: item.visibility,
        source_url: item.sourceUrl,
        thumbnail_url: item.thumbnailUrl,
        owner_user_id: item.ownerUserId,
        metadata,
        access_source: accessSource,
        permission_level: item.ownerUserId === actor.userId
          ? "owner"
          : permissionInfo.effectivePermissionLevel ?? "read",
        created_at: item.createdAt.toISOString(),
        updated_at: item.updatedAt.toISOString(),
      } satisfies LibraryDocumentListItem;
    })
    .filter((item): item is LibraryDocumentListItem => item !== null);

  visible.sort((a, b) => {
    if (sort === "created_desc") {
      const createdDiff = new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
      if (createdDiff !== 0) return createdDiff;
      return b.id - a.id;
    }

    const updatedDiff = new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime();
    if (updatedDiff !== 0) return updatedDiff;
    const createdDiff = new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    if (createdDiff !== 0) return createdDiff;
    return b.id - a.id;
  });

  const paged = visible.slice(offset, offset + limit);
  return {
    total: visible.length,
    limit,
    offset,
    has_more: offset + paged.length < visible.length,
    scope,
    results: paged,
  };
}

export async function getLibraryMarkdownContent(
  itemId: number,
  actor: LibraryActor,
  dbClient?: DbClient,
): Promise<LibraryMarkdownContentResult | null> {
  const db = await resolveDb(dbClient);
  const actorTenantId = normalizeLibraryTenantId(actor.tenantId);
  const item = await getLibraryItemRowById(db, itemId, actorTenantId);

  if (!item) {
    return null;
  }

  const permissionLevel = await getUserPermissionLevel(db, item.id, actor);
  if (!canReadLibraryItem(item, actor, permissionLevel)) {
    return null;
  }

  const rows = await db
    .select({
      content: libraryChunks.content,
    })
    .from(libraryChunks)
    .where(
      and(
        eq(libraryChunks.tenantId, actorTenantId),
        eq(libraryChunks.libraryItemId, item.id),
        eq(libraryChunks.chunkIndex, 0),
      ),
    )
    .limit(1);

  return {
    item_id: item.id,
    content: rows[0]?.content ?? "",
    updated_at: item.updatedAt.toISOString(),
  };
}

async function createContentVersion(
  db: DbClient,
  input: {
    tenantId: string;
    libraryItemId: number;
    content: string;
    contentType: string;
    createdByUserId: number;
    changeDescription?: string;
  },
): Promise<LibraryContentVersion | null> {
  const contentHash = crypto
    .createHash("sha256")
    .update(input.content, "utf8")
    .digest("hex");
  const contentSizeBytes = Buffer.byteLength(input.content, "utf8");

  // Get next version number
  const latestVersion = await db
    .select({ versionNumber: libraryContentVersions.versionNumber })
    .from(libraryContentVersions)
    .where(eq(libraryContentVersions.libraryItemId, input.libraryItemId))
    .orderBy(desc(libraryContentVersions.versionNumber))
    .limit(1);

  const nextVersionNumber = latestVersion[0]
    ? latestVersion[0].versionNumber + 1
    : 1;

  // Check if identical content already exists (deduplication)
  const existingWithHash = await db
    .select({ id: libraryContentVersions.id })
    .from(libraryContentVersions)
    .where(
      and(
        eq(libraryContentVersions.libraryItemId, input.libraryItemId),
        eq(libraryContentVersions.contentHash, contentHash),
      ),
    )
    .limit(1);

  if (existingWithHash[0]) {
    return null;
  }

  const [version] = await db
    .insert(libraryContentVersions)
    .values({
      tenantId: input.tenantId,
      libraryItemId: input.libraryItemId,
      versionNumber: nextVersionNumber,
      contentHash,
      content: input.content,
      contentType: input.contentType,
      contentSizeBytes,
      changeDescription: input.changeDescription,
      createdByUserId: input.createdByUserId,
    })
    .returning();

  return version ?? null;
}

export async function saveLibraryMarkdown(
  input: SaveLibraryMarkdownInput,
  actor: LibraryActor,
  dbClient?: DbClient,
): Promise<SaveLibraryMarkdownResult | null> {
  const db = await resolveDb(dbClient);
  const actorTenantId = normalizeLibraryTenantId(actor.tenantId);
  const existing = await getLibraryItemRowById(db, input.itemId, actorTenantId);
  if (!existing) {
    return null;
  }

  const permissionLevel = await getUserPermissionLevel(db, existing.id, actor);
  if (!canManageLibraryItem(existing, actor, permissionLevel)) {
    return null;
  }

  if (input.expectedUpdatedAt) {
    const expectedUpdatedAt = input.expectedUpdatedAt.getTime();
    if (existing.updatedAt.getTime() !== expectedUpdatedAt) {
      throw new LibraryMarkdownVersionConflictError(existing.updatedAt);
    }
  }

  const normalizedContent = input.content.replace(/\r\n/g, "\n");
  const now = new Date();

  // Save current content as version before overwriting
  const currentChunk = await db
    .select()
    .from(libraryChunks)
    .where(
      and(
        eq(libraryChunks.libraryItemId, existing.id),
        eq(libraryChunks.chunkIndex, 0),
      ),
    )
    .limit(1);

  if (currentChunk[0] && currentChunk[0].content) {
    await createContentVersion(db, {
      tenantId: actorTenantId,
      libraryItemId: existing.id,
      content: currentChunk[0].content,
      contentType: currentChunk[0].contentType,
      createdByUserId: actor.userId,
      changeDescription: input.changeDescription,
    });
  }

  await db
    .insert(libraryChunks)
    .values({
      tenantId: actorTenantId,
      libraryItemId: existing.id,
      chunkIndex: 0,
      content: normalizedContent,
      contentType: "markdown_source",
      tokenCount: null,
      vectorRefId: null,
      metadata: {
        source: "document_management_editor",
      },
      createdAt: now,
    })
    .onConflictDoUpdate({
      target: [libraryChunks.libraryItemId, libraryChunks.chunkIndex],
      set: {
        content: normalizedContent,
        contentType: "markdown_source",
        tokenCount: null,
        vectorRefId: null,
        metadata: {
          source: "document_management_editor",
        },
      },
    });

  const updatedRows = await db
    .update(libraryItems)
    .set({
      status: "indexing",
      metadata: normalizeLibraryMetadata({
        ...(existing.metadata as Record<string, unknown>),
        markdown_last_saved_at: now.toISOString(),
      }),
      updatedAt: now,
    })
    .where(and(eq(libraryItems.id, existing.id), eq(libraryItems.tenantId, actorTenantId)))
    .returning();

  const updated = updatedRows[0];
  if (!updated) {
    throw new Error("Failed to save markdown content");
  }

  const indexJob = await enqueueLibraryIndexJob(
    {
      libraryItemId: existing.id,
      tenantId: actorTenantId,
      jobType: "markdown_update",
    },
    db,
  );

  return {
    item: toLibraryItemDto(updated),
    indexJob,
  };
}

export async function getContentVersionHistory(
  itemId: number,
  actor: LibraryActor,
  options?: { limit?: number; offset?: number },
  dbClient?: DbClient,
): Promise<LibraryContentVersion[]> {
  const db = await resolveDb(dbClient);
  const actorTenantId = normalizeLibraryTenantId(actor.tenantId);

  const existing = await getLibraryItemRowById(db, itemId, actorTenantId);
  if (!existing) {
    return [];
  }

  const permissionLevel = await getUserPermissionLevel(db, existing.id, actor);
  if (!canReadLibraryItem(existing, actor, permissionLevel)) {
    return [];
  }

  const limit = Math.min(Math.max(options?.limit ?? 50, 1), 100);
  const offset = Math.max(options?.offset ?? 0, 0);

  return db
    .select()
    .from(libraryContentVersions)
    .where(eq(libraryContentVersions.libraryItemId, itemId))
    .orderBy(desc(libraryContentVersions.createdAt))
    .limit(limit)
    .offset(offset);
}

export async function getContentVersionById(
  versionId: number,
  actor: LibraryActor,
  dbClient?: DbClient,
): Promise<LibraryContentVersion | null> {
  const db = await resolveDb(dbClient);
  const actorTenantId = normalizeLibraryTenantId(actor.tenantId);

  const [version] = await db
    .select()
    .from(libraryContentVersions)
    .where(
      and(
        eq(libraryContentVersions.id, versionId),
        eq(libraryContentVersions.tenantId, actorTenantId),
      ),
    )
    .limit(1);

  if (!version) {
    return null;
  }

  const existing = await getLibraryItemRowById(
    db,
    version.libraryItemId,
    actorTenantId,
  );
  if (!existing) {
    return null;
  }

  const permissionLevel = await getUserPermissionLevel(db, existing.id, actor);
  if (!canReadLibraryItem(existing, actor, permissionLevel)) {
    return null;
  }

  return version;
}

export async function restoreContentVersion(
  versionId: number,
  actor: LibraryActor,
  dbClient?: DbClient,
): Promise<SaveLibraryMarkdownResult | null> {
  const db = await resolveDb(dbClient);
  const actorTenantId = normalizeLibraryTenantId(actor.tenantId);

  const version = await getContentVersionById(versionId, actor, db);
  if (!version) {
    return null;
  }

  const existing = await getLibraryItemRowById(
    db,
    version.libraryItemId,
    actorTenantId,
  );
  if (!existing) {
    return null;
  }

  const permissionLevel = await getUserPermissionLevel(db, existing.id, actor);
  if (!canManageLibraryItem(existing, actor, permissionLevel)) {
    return null;
  }

  return saveLibraryMarkdown(
    {
      itemId: version.libraryItemId,
      content: version.content,
      changeDescription: `Restored from version ${version.versionNumber}`,
    },
    actor,
    db,
  );
}

export async function searchLibraryItems(
  input: LibrarySearchInput,
  actor: LibraryActor,
  dbClient?: DbClient,
): Promise<LibrarySearchResponseV1> {
  const db = await resolveDb(dbClient);
  const actorTenantId = normalizeLibraryTenantId(actor.tenantId);

  const limit = Math.min(Math.max(input.limit ?? 20, 1), 100);
  const offset = Math.max(input.offset ?? 0, 0);
  const query = (input.query ?? "").trim();
  const queryTokens = tokenize(query);

  const itemRows = await db
    .select()
    .from(libraryItems)
    .where(and(eq(libraryItems.tenantId, actorTenantId), isNull(libraryItems.deletedAt)))
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

  // Get user's groups for group permission filtering
  const userGroups = await getUserGroups(actor.userId, actorTenantId);
  const groupIds = userGroups.map(g => String(g.id));

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
          eq(libraryChunks.tenantId, actorTenantId),
          inArray(libraryChunks.libraryItemId, itemIds),
        ),
      ),
    db
      .select({
        libraryItemId: libraryPermissions.libraryItemId,
        subjectType: libraryPermissions.subjectType,
        subjectId: libraryPermissions.subjectId,
        permissionLevel: libraryPermissions.permissionLevel,
        expiresAt: libraryPermissions.expiresAt,
      })
      .from(libraryPermissions)
      .where(
        and(
          eq(libraryPermissions.tenantId, actorTenantId),
          or(
            and(
              eq(libraryPermissions.subjectType, "user"),
              eq(libraryPermissions.subjectId, String(actor.userId)),
            ),
            and(
              eq(libraryPermissions.subjectType, "tenant_role"),
              eq(libraryPermissions.subjectId, actor.role || ""),
            ),
            // NEW: Include group permissions
            ...(groupIds.length > 0 ? [
              and(
                eq(libraryPermissions.subjectType, "group"),
                inArray(libraryPermissions.subjectId, groupIds),
              )
            ] : [])
          ),
          inArray(libraryPermissions.libraryItemId, itemIds),
          or(isNull(libraryPermissions.expiresAt), gt(libraryPermissions.expiresAt, new Date())),
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

  const groupIdNums = userGroups.map(g => g.id);

  const visibleScored = filteredItems
    .filter((item) => {
      const permissionInfo = getPermissionLevelForItem(permissionRows, item.id, actor, groupIdNums);
      return canReadLibraryItem(item, actor, permissionInfo.effectivePermissionLevel);
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
    source_url: entry.item.sourceUrl,
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

// ── ShareFile: Share Management ──

export async function removeLibraryShare(
  input: { itemId: number; subjectType: string; subjectId: string },
  actor: LibraryActor,
  dbClient?: DbClient,
): Promise<boolean> {
  const db = await resolveDb(dbClient);
  const actorTenantId = normalizeLibraryTenantId(actor.tenantId);

  const permission = await getUserEffectivePermission(input.itemId, actor, db);
  const level = permission.effectivePermissionLevel;
  if (level !== "delete" && level !== "owner") {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "You need delete or owner permission to manage shares",
    });
  }

  const deleted = await db
    .delete(libraryPermissions)
    .where(
      and(
        eq(libraryPermissions.libraryItemId, input.itemId),
        eq(libraryPermissions.subjectType, input.subjectType),
        eq(libraryPermissions.subjectId, input.subjectId),
        eq(libraryPermissions.tenantId, actorTenantId),
      ),
    )
    .returning({ id: libraryPermissions.id });

  if (!deleted[0]) {
    throw new TRPCError({
      code: "NOT_FOUND",
      message: "Share not found",
    });
  }

  return true;
}

export async function updateLibrarySharePermission(
  input: { itemId: number; subjectType: string; subjectId: string; permissionLevel: string },
  actor: LibraryActor,
  dbClient?: DbClient,
): Promise<boolean> {
  const db = await resolveDb(dbClient);
  const actorTenantId = normalizeLibraryTenantId(actor.tenantId);

  const permission = await getUserEffectivePermission(input.itemId, actor, db);
  const level = permission.effectivePermissionLevel;
  if (level !== "delete" && level !== "owner") {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "You need delete or owner permission to manage shares",
    });
  }

  const updated = await db
    .update(libraryPermissions)
    .set({
      permissionLevel: input.permissionLevel,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(libraryPermissions.libraryItemId, input.itemId),
        eq(libraryPermissions.subjectType, input.subjectType),
        eq(libraryPermissions.subjectId, input.subjectId),
        eq(libraryPermissions.tenantId, actorTenantId),
      ),
    )
    .returning({ id: libraryPermissions.id });

  if (!updated[0]) {
    throw new TRPCError({
      code: "NOT_FOUND",
      message: "Share not found",
    });
  }

  return true;
}

export interface LibraryShareEntry {
  id: number;
  subjectType: string;
  subjectId: string;
  permissionLevel: string;
  expiresAt: Date | null;
  userName?: string | null;
  groupName?: string | null;
  roleName?: string | null;
}

export async function getLibraryItemShares(
  itemId: number,
  actor: LibraryActor,
  dbClient?: DbClient,
): Promise<{ shares: LibraryShareEntry[] }> {
  const db = await resolveDb(dbClient);
  const actorTenantId = normalizeLibraryTenantId(actor.tenantId);

  const permission = await getUserEffectivePermission(itemId, actor, db);
  if (!permission.effectivePermissionLevel) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "You don't have access to this item",
    });
  }

  const permRows = await db
    .select({
      id: libraryPermissions.id,
      subjectType: libraryPermissions.subjectType,
      subjectId: libraryPermissions.subjectId,
      permissionLevel: libraryPermissions.permissionLevel,
      expiresAt: libraryPermissions.expiresAt,
    })
    .from(libraryPermissions)
    .where(
      and(
        eq(libraryPermissions.libraryItemId, itemId),
        eq(libraryPermissions.tenantId, actorTenantId),
      ),
    )
    .limit(200);

  // Batch resolve names for shares (one query per subject type)
  const userSubjectIds = permRows
    .filter((p) => p.subjectType === "user")
    .map((p) => Number(p.subjectId));
  const groupSubjectIds = permRows
    .filter((p) => p.subjectType === "group")
    .map((p) => Number(p.subjectId));

  const [userNameRows, groupNameRows] = await Promise.all([
    userSubjectIds.length > 0
      ? db
          .select({ id: users.id, name: users.name })
          .from(users)
          .where(inArray(users.id, userSubjectIds))
      : Promise.resolve([]),
    groupSubjectIds.length > 0
      ? db
          .select({ id: userGroups.id, name: userGroups.name })
          .from(userGroups)
          .where(and(inArray(userGroups.id, groupSubjectIds), isNull(userGroups.deletedAt)))
      : Promise.resolve([]),
  ]);

  const userNameMap = new Map(userNameRows.map((r) => [r.id, r.name]));
  const groupNameMap = new Map(groupNameRows.map((r) => [r.id, r.name]));

  const shares: LibraryShareEntry[] = permRows.map((p) => {
    const base: LibraryShareEntry = {
      id: p.id,
      subjectType: p.subjectType,
      subjectId: p.subjectId,
      permissionLevel: p.permissionLevel,
      expiresAt: p.expiresAt,
    };

    if (p.subjectType === "user") {
      return { ...base, userName: userNameMap.get(Number(p.subjectId)) ?? null };
    }

    if (p.subjectType === "group") {
      return { ...base, groupName: groupNameMap.get(Number(p.subjectId)) ?? "Deleted Group" };
    }

    // tenant_role
    return { ...base, roleName: p.subjectId };
  });

  return { shares };
}

// ── ShareFile: Trash Management ──

const MS_PER_DAY = 86_400_000;
const TRASH_PURGE_DAYS = 90;

export interface TrashListItem {
  id: number;
  title: string;
  itemType: string;
  source: string;
  thumbnailUrl: string | null;
  deletedAt: Date | null;
  deletedBy: number | null;
  daysInTrash: number;
  daysUntilPurge: number;
}

export async function listLibraryTrash(
  input: { limit?: number; offset?: number },
  actor: LibraryActor,
  dbClient?: DbClient,
): Promise<{ items: TrashListItem[]; total: number }> {
  const db = await resolveDb(dbClient);
  const actorTenantId = normalizeLibraryTenantId(actor.tenantId);
  const limit = input.limit ?? 50;
  const offset = input.offset ?? 0;

  const whereCondition = and(
    eq(libraryItems.tenantId, actorTenantId),
    isNotNull(libraryItems.deletedAt),
    or(
      eq(libraryItems.ownerUserId, actor.userId),
      eq(libraryItems.deletedBy, actor.userId),
    ),
  );

  const [totalRow] = await db
    .select({ total: count() })
    .from(libraryItems)
    .where(whereCondition);

  const rows = await db
    .select({
      id: libraryItems.id,
      title: libraryItems.title,
      itemType: libraryItems.itemType,
      source: libraryItems.source,
      thumbnailUrl: libraryItems.thumbnailUrl,
      deletedAt: libraryItems.deletedAt,
      deletedBy: libraryItems.deletedBy,
    })
    .from(libraryItems)
    .where(whereCondition)
    .orderBy(desc(libraryItems.deletedAt))
    .limit(limit)
    .offset(offset);

  const now = Date.now();
  const items: TrashListItem[] = rows.map((r) => {
    const deletedAtMs = r.deletedAt ? new Date(r.deletedAt).getTime() : now;
    const daysInTrash = Math.floor((now - deletedAtMs) / MS_PER_DAY);
    return {
      ...r,
      daysInTrash,
      daysUntilPurge: Math.max(0, TRASH_PURGE_DAYS - daysInTrash),
    };
  });

  return { items, total: Number(totalRow?.total ?? 0) };
}

export async function restoreFromLibraryTrash(
  itemId: number,
  actor: LibraryActor,
  dbClient?: DbClient,
): Promise<boolean> {
  const db = await resolveDb(dbClient);
  const actorTenantId = normalizeLibraryTenantId(actor.tenantId);

  return await db.transaction(async (tx) => {
    const rows = await tx
      .select({
        id: libraryItems.id,
        ownerUserId: libraryItems.ownerUserId,
        deletedBy: libraryItems.deletedBy,
      })
      .from(libraryItems)
      .where(
        and(
          eq(libraryItems.id, itemId),
          eq(libraryItems.tenantId, actorTenantId),
          isNotNull(libraryItems.deletedAt),
        ),
      )
      .limit(1);

    const item = rows[0];
    if (!item) {
      throw new TRPCError({
        code: "NOT_FOUND",
        message: "Item not found in trash",
      });
    }

    if (item.ownerUserId !== actor.userId && item.deletedBy !== actor.userId) {
      throw new TRPCError({
        code: "FORBIDDEN",
        message: "Only the item owner or the person who deleted it can restore",
      });
    }

    await tx
      .update(libraryItems)
      .set({
        deletedAt: null,
        deletedBy: null,
        status: "ready",
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(libraryItems.id, itemId),
          eq(libraryItems.tenantId, actorTenantId),
        ),
      );

    return true;
  });
}

/**
 * Cascade-delete all child records for a library item, then delete the item itself.
 * Shared by permanentDeleteLibraryItem (user-initiated) and auto-purge job (system).
 * Order: links -> chunks -> index jobs -> permissions -> item
 */
export async function cascadeDeleteLibraryItem(
  tx: Parameters<Parameters<DbClient["transaction"]>[0]>[0],
  itemId: number,
): Promise<void> {
  await tx.delete(libraryLinks).where(eq(libraryLinks.libraryItemId, itemId));
  await tx.delete(libraryChunks).where(eq(libraryChunks.libraryItemId, itemId));
  await tx.delete(libraryIndexJobs).where(eq(libraryIndexJobs.libraryItemId, itemId));
  await tx.delete(libraryPermissions).where(eq(libraryPermissions.libraryItemId, itemId));
  await tx.delete(libraryItems).where(eq(libraryItems.id, itemId));
}

export async function permanentDeleteLibraryItem(
  itemId: number,
  actor: LibraryActor,
  dbClient?: DbClient,
): Promise<{ daysInTrash: number }> {
  const db = await resolveDb(dbClient);
  const actorTenantId = normalizeLibraryTenantId(actor.tenantId);

  const rows = await db
    .select({
      id: libraryItems.id,
      ownerUserId: libraryItems.ownerUserId,
      deletedAt: libraryItems.deletedAt,
      sourceUrl: libraryItems.sourceUrl,
      thumbnailUrl: libraryItems.thumbnailUrl,
    })
    .from(libraryItems)
    .where(
      and(
        eq(libraryItems.id, itemId),
        eq(libraryItems.tenantId, actorTenantId),
        isNotNull(libraryItems.deletedAt),
      ),
    )
    .limit(1);

  const item = rows[0];
  if (!item) {
    throw new TRPCError({
      code: "NOT_FOUND",
      message: "Item not found in trash",
    });
  }

  const isOwner = item.ownerUserId === actor.userId;
  const daysInTrash = item.deletedAt
    ? Math.floor((Date.now() - new Date(item.deletedAt).getTime()) / MS_PER_DAY)
    : 0;
  const isAdminWithExpired =
    (actor.role === "admin" || actor.role === "domain_admin") && daysInTrash >= TRASH_PURGE_DAYS;

  if (!isOwner && !isAdminWithExpired) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Only the item owner can permanently delete, or admins for items 90+ days in trash",
    });
  }

  // Collect storage keys before cascade delete removes them
  const uploadKeyRows = await db
    .select({ linkId: libraryLinks.linkId })
    .from(libraryLinks)
    .where(
      and(
        eq(libraryLinks.libraryItemId, itemId),
        eq(libraryLinks.linkType, "upload_key"),
      ),
    );

  await db.transaction(async (tx) => {
    await cascadeDeleteLibraryItem(tx, itemId);
  });

  // Best-effort storage cleanup — don't fail the operation if storage delete errors
  for (const { linkId } of uploadKeyRows) {
    try {
      await storageDelete(linkId);
    } catch (err) {
      console.error(
        `[permanent-delete] Storage cleanup failed for key ${linkId}:`,
        err instanceof Error ? err.message : err,
      );
    }
  }

  return { daysInTrash };
}

/**
 * Remove all Google Drive virtual references and associated data for a user.
 * Called during disconnect cleanup. Cascading FK deletes handle chunks and links.
 */
export async function removeGoogleDriveData(
  userId: number,
  tenantId: string,
): Promise<{ itemsDeleted: number; chunksDeleted: number; linksDeleted: number }> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  // Find all Google Drive items for this user
  const driveItems = await db
    .select({ id: libraryItems.id })
    .from(libraryItems)
    .where(
      and(
        eq(libraryItems.source, "google_drive"),
        eq(libraryItems.ownerUserId, userId),
        eq(libraryItems.tenantId, tenantId),
      ),
    );

  const itemIds = driveItems.map((i) => i.id);
  if (itemIds.length === 0) {
    return { itemsDeleted: 0, chunksDeleted: 0, linksDeleted: 0 };
  }

  // Count chunks and links before cascade delete (for audit)
  const [chunkRow] = await db
    .select({ cnt: count(libraryChunks.id) })
    .from(libraryChunks)
    .where(inArray(libraryChunks.libraryItemId, itemIds));

  const [linkRow] = await db
    .select({ cnt: count(libraryLinks.id) })
    .from(libraryLinks)
    .where(inArray(libraryLinks.libraryItemId, itemIds));

  const chunksDeleted = chunkRow?.cnt ?? 0;
  const linksDeleted = linkRow?.cnt ?? 0;

  // Delete items in batches (cascades to chunks and links via FK)
  const BATCH_SIZE = 500;
  for (let i = 0; i < itemIds.length; i += BATCH_SIZE) {
    const batch = itemIds.slice(i, i + BATCH_SIZE);
    await db.delete(libraryItems).where(inArray(libraryItems.id, batch));
  }

  return { itemsDeleted: itemIds.length, chunksDeleted, linksDeleted };
}
