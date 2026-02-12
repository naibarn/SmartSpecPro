import crypto from "crypto";
import { and, desc, eq, gt, inArray, isNull, or } from "drizzle-orm";

import { getDb } from "../db";
import { storagePut } from "../storage";
import {
  validateLibraryUrl,
  type LibraryUrlRejectReason,
} from "./libraryUrlPolicy";
import { isSvgUpload, sanitizeUploadedSvg } from "./uploadContentSafety";
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
): {
  effectivePermissionLevel: LibraryPermissionLevel | null;
  hasDirectShare: boolean;
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
      hasGroupShare: false,
    };
  }

  const directMatches = relevant.filter(
    (permission) =>
      permission.subjectType === "user" &&
      permission.subjectId === String(actor.userId),
  );
  const groupMatches = relevant.filter(
    (permission) =>
      permission.subjectType === "tenant_role" &&
      Boolean(actor.role) &&
      permission.subjectId === actor.role,
  );

  const highest = selectHighestPermissionLevel([
    ...directMatches.map((permission) => permission.permissionLevel),
    ...groupMatches.map((permission) => permission.permissionLevel),
  ]);

  return {
    effectivePermissionLevel: highest,
    hasDirectShare: directMatches.length > 0,
    hasGroupShare: groupMatches.length > 0,
  };
}

async function getUserPermissionLevel(
  db: DbClient,
  itemId: number,
  actor: LibraryActor,
): Promise<LibraryPermissionLevel | null> {
  const actorTenantId = normalizeLibraryTenantId(actor.tenantId);
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
        ),
        or(isNull(libraryPermissions.expiresAt), gt(libraryPermissions.expiresAt, new Date())),
      ),
    )
    .limit(50);

  return selectHighestPermissionLevel(rows.map((row) => row.permissionLevel));
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
  return permissionLevel === "write" || permissionLevel === "owner";
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
    hasGroupShare: boolean;
  },
): LibraryDocumentAccessSource {
  if (item.ownerUserId === actor.userId) {
    return "owner";
  }

  if (permissionInfo.hasDirectShare) {
    return "shared_direct";
  }

  if (permissionInfo.hasGroupShare || item.visibility === "team" || item.visibility === "public") {
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
        ),
        or(isNull(libraryPermissions.expiresAt), gt(libraryPermissions.expiresAt, new Date())),
      ),
    );

  const visible = itemRows
    .filter((item) => itemMatchesDocumentFilters(item, input.filters))
    .filter((item) => itemMatchesDocumentQuery(item, query))
    .map((item) => {
      const permissionInfo = getPermissionLevelForItem(permissionRows, item.id, actor);
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

  const visibleScored = filteredItems
    .filter((item) => {
      const permissionInfo = getPermissionLevelForItem(permissionRows, item.id, actor);
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
