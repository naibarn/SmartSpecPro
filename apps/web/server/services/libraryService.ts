import crypto from "crypto";
import { TRPCError } from "@trpc/server";
import { and, count, desc, eq, gt, inArray, isNotNull, isNull, ne, or, sql } from "drizzle-orm";

import { debugLog } from "../_core/logger";
import { getDb } from "../db";
import { getAppRuntimeConfig } from "./appRuntimeConfig";
import { storagePut, storageGet, storageDelete } from "../storage";
import { encrypt as encryptSecret, decrypt as decryptSecret } from "./crypto";
import {
  validateLibraryUrl,
  type LibraryUrlRejectReason,
} from "./libraryUrlPolicy";
import {
  buildLibraryIndexJobPayload,
  shouldThrottleLibraryEnqueue,
  type LibraryIndexDomain,
  type LibraryIndexOperation,
} from "./libraryIndexJobContract";
import { normalizeMediaPrompt } from "./mediaPromptNormalization";
import { isSvgUpload, sanitizeUploadedSvg } from "./uploadContentSafety";
import {
  galleryItems,
  libraryChunks,
  libraryContentVersions,
  libraryIndexJobs,
  libraryItems,
  libraryLinks,
  libraryPermissions,
  libraryPublicShareLinks,
  presentationAssetLinks,
  presentationDecks,
  userGroups,
  users,
  type LibraryContentVersion,
} from "../../drizzle/schema";
import { getUserGroups as getGroupsServiceUserGroups } from "./groupsService";
import {
  calculateLibraryUploadCreditCost,
  deductCredits,
  hasEnoughCredits,
  refundCredits,
} from "./creditService";
import {
  calculateOcrCredits,
  classifyOcrFileClass,
  getDocumentOcrSettings,
  getDocumentOcrCreditsPerUnit,
  isOcrExtractor,
  resolveOcrPageCount,
  resolveOcrProvider,
} from "./documentOcrSettings";
import { getFinanceOcrDebugTraceId, recordFinanceOcrDebugStep } from "./financeOcrDebug";
import {
  buildUploadPipelineState,
  computeLibraryUploadChecksum,
  enrichLibraryUploadContent,
  type LibraryUploadEnrichmentResult,
  type LibraryUploadPipelineStage,
  validateLibraryUploadSignature,
} from "./libraryUploadPipeline";
import {
  buildLibraryKnowledgeRefreshMetadata,
  type LibraryKnowledgeRefreshReason,
} from "./libraryKnowledgeBackfillService";
import { dispatchLibraryKnowledgeRefreshWorker } from "./libraryKnowledgeRefreshWorker";
import { getTenantFeatureFlags } from "./tenantFeatureFlagService";
import { getTraceId } from "./traceContext";
import {
  dispatchVectorOperation,
  getEffectiveVectorProviderConfig,
  getVectorProviderConfigFromEnv,
  resolveVectorProvider,
} from "./vectorProvider";
import type { EffectivePermission, PermissionSource } from "../../shared/types/library";

export type LibraryPermissionLevel = "read" | "write" | "delete" | "owner";
export type LibraryVisibility = "private" | "team" | "public";
export type LibraryItemStatus = "draft" | "ready" | "indexing" | "archived" | "failed";
export type LibraryTenantId = string | number;
export type LibraryRecentDaysFilter = 1 | 3 | 7 | 15 | 30;

export interface LibraryActor {
  userId: number;
  tenantId: LibraryTenantId;
  role?: string | null;
  privateVaultUnlocked?: boolean;
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
  projectId?: string | null;
  metadata?: Record<string, unknown>;
  sourceUrl?: string | null;
  thumbnailUrl?: string | null;
  sourceLink?: LibrarySourceLinkInput;
  parentId?: number | null;
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

export interface PublicShareLinkInput {
  itemId: number;
}

export interface PublicShareLinkDto {
  id: number;
  itemId: number;
  token: string;
  expiresAt: Date | null;
  revokedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface PublicShareLinkState {
  canManage: boolean;
  link: PublicShareLinkDto | null;
}

export interface LibraryGalleryPublicationState {
  canManage: boolean;
  canPublish: boolean;
  isPublished: boolean;
  galleryItemId: number | null;
  supported: boolean;
  reason: string | null;
}

export interface PublishLibraryItemToGalleryResult {
  success: true;
  galleryItemId: number;
  created: boolean;
}

export interface PublicShareDocumentResult {
  item: {
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
    createdAt: Date;
    updatedAt: Date;
  };
  markdownContent: string | null;
  downloadUrl: string | null;
}

export interface LibraryItemDto {
  id: number;
  tenantId: string;
  ownerUserId: number;
  projectId?: string | null;
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
  projectId?: string | null;
  tags?: string[];
  status?: LibraryItemStatus;
  fromDate?: Date;
  toDate?: Date;
  recentDays?: LibraryRecentDaysFilter;
}

export interface LibrarySearchInput {
  query?: string;
  limit?: number;
  offset?: number;
  filters?: LibrarySearchFilters;
  scope?: LibraryDocumentScope;
  folderId?: number | null;
}

export interface UploadLibraryFileInput {
  fileName: string;
  fileType: string;
  fileBase64: string;
  title?: string;
  visibility?: LibraryVisibility;
  projectId?: string | null;
  parentId?: number | null;
  metadata?: Record<string, unknown>;
  billingMetadata?: Record<string, unknown>;
}

export interface UploadLibraryFileResult {
  item: LibraryItemDto;
  storageKey: string;
  indexJob: LibraryEnqueueResult;
  duplicateOfItemId?: number | null;
  billing: {
    creditsCharged: number;
    category: string;
    fileSizeBytes: number;
    baseCredits: number;
    stepCredits: number;
    extraSteps: number;
    sizeStepMb: number;
  };
}

export interface LibraryUploadStatusDto {
  itemId: number;
  item: LibraryItemDto;
  stage: LibraryUploadPipelineStage;
  stageMessage: string | null;
  parserJobId: string | null;
  parserStatus: string | null;
  indexJobId: number | null;
  indexJobStatus: string | null;
  checksumSha256: string | null;
  extractor: string | null;
  searchQuality: "full_text" | "metadata_only";
  parseError: string | null;
  warnings: string[];
  duplicateOfItemId: number | null;
  readyForSearch: boolean;
  updatedAt: string;
}

export interface ReplaceLibraryFileInput {
  itemId: number;
  fileName: string;
  fileType: string;
  fileBase64: string;
  changeDescription?: string;
  metadata?: Record<string, unknown>;
}

export interface ReplaceLibraryFileResult {
  item: LibraryItemDto;
  indexJob: LibraryEnqueueResult;
  versionNumber: number;
}

export interface LibraryVectorCleanupTargets {
  vectorRefIds: string[];
  indexNames: string[];
}

export interface LibrarySearchResultV1 {
  item_id: number;
  item_type: string;
  title: string;
  description: string | null;
  source_url: string | null;
  thumbnail_url: string | null;
  status: string;
  source: string;
  provider_name: string | null;
  model_name: string | null;
  owner_user_id: number;
  parent_id: number | null;
  metadata: Record<string, unknown>;
  access_source: LibraryDocumentAccessSource;
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

const DEFAULT_LIBRARY_PGVECTOR_SEARCH_TIMEOUT_MS = 1_500;
const DEFAULT_LIBRARY_PGVECTOR_CANDIDATE_LIMIT = 1_000;
const MAX_LIBRARY_PGVECTOR_QUERY_LENGTH = 2_000;

function parseBoundedIntegerEnv(params: {
  name: string;
  fallback: number;
  min: number;
  max: number;
}): number {
  const raw = process.env[params.name];
  if (!raw) return params.fallback;

  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed)) return params.fallback;
  return Math.min(Math.max(parsed, params.min), params.max);
}

const LIBRARY_PGVECTOR_SEARCH_TIMEOUT_MS = parseBoundedIntegerEnv({
  name: "LIBRARY_PGVECTOR_SEARCH_TIMEOUT_MS",
  fallback: DEFAULT_LIBRARY_PGVECTOR_SEARCH_TIMEOUT_MS,
  min: 100,
  max: 10_000,
});

const LIBRARY_PGVECTOR_CANDIDATE_LIMIT = parseBoundedIntegerEnv({
  name: "LIBRARY_PGVECTOR_CANDIDATE_LIMIT",
  fallback: DEFAULT_LIBRARY_PGVECTOR_CANDIDATE_LIMIT,
  min: 1,
  max: 5_000,
});

export type LibraryDocumentScope = "all" | "my_library" | "private_vault" | "shared_with_me" | "shared_groups";
export type LibraryDocumentSort = "updated_desc" | "created_desc";
export type LibraryDocumentAccessSource = "owner" | "shared_direct" | "shared_group";

export interface LibraryDocumentFilters {
  itemType?: string;
  ownerUserId?: number;
  projectId?: string | null;
  status?: LibraryItemStatus;
  fromDate?: Date;
  toDate?: Date;
  recentDays?: LibraryRecentDaysFilter;
}

export interface LibraryDocumentListInput {
  query?: string;
  scope?: LibraryDocumentScope;
  sort?: LibraryDocumentSort;
  limit?: number;
  offset?: number;
  filters?: LibraryDocumentFilters;
  /** null = root level, number = inside that folder. Only applied for my_library scope. */
  folderId?: number | null;
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
  parent_id: number | null;
  metadata: Record<string, unknown>;
  access_source: LibraryDocumentAccessSource;
  permission_level: LibraryPermissionLevel;
  shared_out_count: number;
  has_shared_out: boolean;
  created_at: string;
  updated_at: string;
}

async function fetchPgvectorLibraryScores(params: {
  tenantId: string;
  query: string;
  itemIds: number[];
}): Promise<Map<number, number> | null> {
  if (!params.query.trim() || params.itemIds.length === 0) {
    return new Map();
  }

  const runtime = await getAppRuntimeConfig();
  const proxyToken = runtime.proxyToken;
  if (!proxyToken) {
    return null;
  }

  try {
    const controller = new AbortController();
    const timeoutHandle = setTimeout(() => controller.abort(), LIBRARY_PGVECTOR_SEARCH_TIMEOUT_MS);
    let response: Response;
    try {
      response = await fetch(`${runtime.pythonBackendUrl}/api/internal/library/search`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-proxy-token": proxyToken,
        },
        body: JSON.stringify({
          tenant_id: params.tenantId,
          query: params.query.slice(0, MAX_LIBRARY_PGVECTOR_QUERY_LENGTH),
          candidate_item_ids: params.itemIds.slice(0, LIBRARY_PGVECTOR_CANDIDATE_LIMIT),
        }),
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timeoutHandle);
    }

    if (!response.ok) {
      console.warn("[library.search] pgvector native search failed:", response.status);
      return null;
    }

    const payload = (await response.json()) as {
      success?: boolean;
      results?: Array<{ item_id: number; vector_score: number }>;
    };

    return new Map(
      (payload.results || []).map((row) => [Number(row.item_id), Number(row.vector_score) || 0]),
    );
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      console.warn("[library.search] pgvector native search timed out");
      return null;
    }
    console.warn("[library.search] pgvector native search error:", error);
    return null;
  }
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
  knowledgeRefreshReason?: LibraryKnowledgeRefreshReason;
}

export interface SaveLibraryMarkdownResult {
  item: LibraryItemDto;
  indexJob: LibraryEnqueueResult;
}

export interface LibraryEnqueueResult {
  jobId: number;
  status: string;
  created: boolean;
  payloadVersion: "v2";
  dedupeKey: string;
  throttled?: boolean;
  error?: string;
}

type LibraryKnowledgeRefreshExecutionStatus =
  | "pending"
  | "processing"
  | "retry_pending"
  | "completed"
  | "failed"
  | "skipped";

type DbClient = NonNullable<Awaited<ReturnType<typeof getDb>>>;
type DbTransaction = Parameters<Parameters<DbClient["transaction"]>[0]>[0];
type DbLike = DbClient | DbTransaction;
type LibraryItemRow = typeof libraryItems.$inferSelect;
type LibraryPublicShareLinkRow = typeof libraryPublicShareLinks.$inferSelect;

const PUBLIC_SHARE_TOKEN_BYTES = 32;
const PUBLIC_SHARE_DEFAULT_TTL_DAYS = 7;

function normalizeLibraryTenantId(tenantId: LibraryTenantId): string {
  const normalized = String(tenantId).trim();
  if (!normalized) {
    throw new Error("Invalid tenant ID");
  }
  return normalized;
}

function hashPublicShareToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

function isPublicShareLinkActive(row: Pick<LibraryPublicShareLinkRow, "expiresAt" | "revokedAt">): boolean {
  if (row.revokedAt) {
    return false;
  }
  if (!row.expiresAt) {
    return true;
  }
  return row.expiresAt > new Date();
}

function serializePublicShareLink(row: LibraryPublicShareLinkRow): PublicShareLinkDto {
  const token = decryptSecret(row.tokenEncrypted);
  return {
    id: row.id,
    itemId: row.libraryItemId,
    token,
    expiresAt: row.expiresAt ?? null,
    revokedAt: row.revokedAt ?? null,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

async function getActivePublicShareLinkRow(
  db: DbClient,
  itemId: number,
  tenantId: string,
): Promise<LibraryPublicShareLinkRow | null> {
  const rows = await db
    .select()
    .from(libraryPublicShareLinks)
    .where(
      and(
        eq(libraryPublicShareLinks.tenantId, tenantId),
        eq(libraryPublicShareLinks.libraryItemId, itemId),
        isNull(libraryPublicShareLinks.revokedAt),
        or(
          isNull(libraryPublicShareLinks.expiresAt),
          gt(libraryPublicShareLinks.expiresAt, new Date()),
        ),
      ),
    )
    .orderBy(desc(libraryPublicShareLinks.createdAt))
    .limit(1);

  return rows[0] ?? null;
}

function getPublicShareOwnerUserId(
  item: Pick<LibraryItemRow, "ownerUserId" | "metadata">,
): number | null {
  const metadata = normalizeLibraryMetadata(item.metadata as Record<string, unknown>);
  const candidates = [
    metadata.uploaded_by_user_id,
    metadata.uploadedByUserId,
    metadata.created_by_user_id,
    metadata.createdByUserId,
    metadata.owner_user_id,
    metadata.ownerUserId,
  ];

  for (const candidate of candidates) {
    if (typeof candidate === "number" && Number.isFinite(candidate) && candidate > 0) {
      return candidate;
    }
    if (typeof candidate === "string" && candidate.trim()) {
      const parsed = Number(candidate);
      if (Number.isFinite(parsed) && parsed > 0) {
        return parsed;
      }
    }
  }

  return item.ownerUserId;
}

async function assertCanManagePublicShare(
  item: Pick<LibraryItemRow, "id" | "ownerUserId" | "tenantId" | "metadata">,
  actor: LibraryActor,
  dbClient?: DbClient,
): Promise<void> {
  if (normalizeLibraryTenantId(item.tenantId) !== normalizeLibraryTenantId(actor.tenantId)) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "You do not have access to this item",
    });
  }

  if (isPrivateVaultLibraryItem(item)) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Private vault items cannot be shared publicly",
    });
  }

  if (getPublicShareOwnerUserId(item) === actor.userId) {
    return;
  }

  const db = await resolveDb(dbClient);
  const permissionLevel = await getUserPermissionLevel(db, item.id, actor);
  if (!canManageLibraryItem(item, actor, permissionLevel)) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Only users who can manage this file can create public share links",
    });
  }
}

async function resolvePublicShareDownloadUrl(item: LibraryItemRow): Promise<string | null> {
  const metadata = normalizeLibraryMetadata(item.metadata as Record<string, unknown>);
  const sourceKey = typeof metadata.source_key === "string" ? metadata.source_key : null;
  if (sourceKey) {
    try {
      const resolved = await storageGet(sourceKey);
      if (resolved.url) {
        return resolved.url;
      }
    } catch {
      // fall back to stored source URL
    }
  }

  return item.sourceUrl ?? null;
}

function isPrivateVaultLibraryItem(item: Pick<LibraryItemRow, "metadata">): boolean {
  const metadata = normalizeLibraryMetadata(item.metadata as Record<string, unknown>);
  return metadata.private_vault === true || metadata.privateVault === true || metadata.vault === true;
}

function isPrivateVaultMetadata(metadata: unknown): boolean {
  const normalized = normalizeLibraryMetadata(metadata as Record<string, unknown>);
  return normalized.private_vault === true || normalized.privateVault === true || normalized.vault === true;
}

function hasPrivateVaultAccess(
  actor: LibraryActor,
): boolean {
  return actor.privateVaultUnlocked === true;
}

function getLibraryQueueBackpressureState() {
  const enabled = ["1", "true", "yes", "on"].includes(
    (process.env.LIBRARY_INDEX_BACKPRESSURE_ENABLED || "").toLowerCase(),
  );
  const currentQueueLagMinutes = Number(process.env.LIBRARY_INDEX_QUEUE_LAG_MINUTES || "0");
  const maxQueueLagMinutes = Number(process.env.LIBRARY_INDEX_MAX_QUEUE_LAG_MINUTES || "15");
  return {
    enabled,
    currentQueueLagMinutes,
    maxQueueLagMinutes,
  };
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
    projectId: row.projectId ?? null,
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

const MAX_LIBRARY_UPLOAD_BYTES = 50 * 1024 * 1024;
const ALLOWED_LIBRARY_UPLOAD_EXTENSIONS = new Set([
  "jpg", "jpeg", "png", "gif", "webp", "svg", "bmp",
  "mp4", "webm", "mov", "avi", "mkv",
  "mp3", "wav", "m4a", "ogg", "aac",
  "pdf",
  "txt", "md", "markdown", "csv", "json", "html", "htm", "xml",
  "doc", "docx", "ppt", "pptx", "xls", "xlsx",
  "zip", "rar", "7z",
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
  "application/zip",
  "application/x-zip-compressed",
  "application/vnd.rar",
  "application/x-rar-compressed",
  "application/x-7z-compressed",
]);
const TEXT_LIKE_LIBRARY_UPLOAD_EXTENSIONS = new Set([
  "txt", "md", "markdown", "csv", "json", "xml", "html", "htm",
  "js", "jsx", "ts", "tsx", "css", "scss", "less",
  "py", "rb", "java", "c", "cpp", "cs", "go", "rs",
  "sql", "sh", "yaml", "yml", "toml", "ini",
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

function isMarkdownLibraryUpload(extension: string): boolean {
  return extension === "md" || extension === "markdown";
}

function extractTextLikeUploadContent(
  fileBuffer: Buffer<ArrayBufferLike>,
  fileType: string,
  extension: string,
): string | null {
  const normalizedFileType = fileType.toLowerCase();
  const isTextLikeMime =
    normalizedFileType.startsWith("text/")
    || normalizedFileType === "application/json"
    || normalizedFileType === "application/xml";
  const isTextLikeExtension = TEXT_LIKE_LIBRARY_UPLOAD_EXTENSIONS.has(extension);

  if (!isTextLikeMime && !isTextLikeExtension) {
    return null;
  }

  const text = fileBuffer.toString("utf8").replace(/\r\n/g, "\n").trim();
  return text.length > 0 ? text : null;
}

function extractTextLikeUploadMetadata(metadata?: Record<string, unknown> | null): string | null {
  if (!metadata || typeof metadata !== "object") {
    return null;
  }

  const candidates = [
    metadata.extracted_text,
    metadata.ocr_text,
    metadata.text,
    metadata.full_text,
  ];

  for (const candidate of candidates) {
    if (typeof candidate === "string") {
      const trimmed = candidate.trim();
      if (trimmed.length > 0) {
        return trimmed;
      }
    }
  }

  return null;
}

async function upsertLibrarySourceTextChunk(
  db: DbClient,
  params: {
    tenantId: string;
    libraryItemId: number;
    content: string;
    source: string;
    projectId?: string | null;
  },
): Promise<void> {
  const resolvedProjectId = params.projectId ?? await resolveLibraryItemProjectId(db, params.libraryItemId, params.tenantId);

  await db
    .insert(libraryChunks)
    .values({
      tenantId: params.tenantId,
      libraryItemId: params.libraryItemId,
      projectId: resolvedProjectId ?? null,
      chunkIndex: 0,
      content: params.content,
      contentType: "markdown_source",
      tokenCount: null,
      vectorRefId: null,
      vectorIndexName: resolveLibraryVectorIndexName(),
      metadata: {
        source: params.source,
      },
      createdAt: new Date(),
    })
    .onConflictDoUpdate({
      target: [libraryChunks.libraryItemId, libraryChunks.chunkIndex],
      set: {
        projectId: resolvedProjectId ?? null,
        content: params.content,
        contentType: "markdown_source",
        tokenCount: null,
        vectorRefId: null,
        vectorIndexName: resolveLibraryVectorIndexName(),
        metadata: {
          source: params.source,
        },
      },
    });
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

    if (key === "prompt" && typeof value === "string") {
      const normalizedPrompt = normalizeMediaPrompt(value);
      if (normalizedPrompt.length > 0) {
        output.prompt = normalizedPrompt;
      }
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

function buildLibraryUploadMetadata(
  baseMetadata: Record<string, unknown> | undefined,
  uploadFields: {
    fileName: string;
    fileType: string;
    extension: string;
    fileSizeBytes: number;
    checksumSha256: string;
    extractedText: string | null;
    extractor: string | null;
    searchQuality: "full_text" | "metadata_only";
    stage: LibraryUploadPipelineStage;
    stageMessage?: string;
    parseError?: string | null;
    warnings?: string[];
    svgSanitized?: boolean;
    duplicateOfItemId?: number | null;
    extraMetadata?: Record<string, unknown>;
  },
): Record<string, unknown> {
  const pipeline = buildUploadPipelineState(uploadFields.stage, {
    checksumSha256: uploadFields.checksumSha256,
    extractor: uploadFields.extractor,
    searchQuality: uploadFields.searchQuality,
    parseError: uploadFields.parseError ?? null,
    warnings: uploadFields.warnings ?? [],
    stageMessage: uploadFields.stageMessage,
  });

  return normalizeLibraryMetadata({
    ...(baseMetadata || {}),
    file_name: uploadFields.fileName,
    file_type: uploadFields.fileType,
    extension: uploadFields.extension || null,
    file_size_bytes: uploadFields.fileSizeBytes,
    source_type: "document_upload",
    extracted_text: uploadFields.extractedText || undefined,
    extraction_method: uploadFields.extractor || undefined,
    content_checksum_sha256: uploadFields.checksumSha256,
    search_quality: uploadFields.searchQuality,
    upload_pipeline: pipeline,
    upload_pipeline_updated_at: pipeline.updatedAt,
    parse_error: uploadFields.parseError || undefined,
    parse_warnings: uploadFields.warnings?.length ? uploadFields.warnings : undefined,
    duplicate_of_item_id: uploadFields.duplicateOfItemId ?? undefined,
    svg_sanitized: uploadFields.svgSanitized || undefined,
    ...(uploadFields.extraMetadata || {}),
  });
}

type OcrChargePlan = {
  amount: number;
  pageCount: number;
  creditsPerUnit: number;
  billingUnit: "image" | "page";
  provider: string | null;
  extractor: string | null;
  idempotencyKey: string;
  description: string;
  metadata: Record<string, unknown>;
};

async function buildOcrChargePlan(params: {
  extractor: string | null;
  metadata: Record<string, unknown>;
  mimeType: string;
  fileName: string;
  fileSizeBytes: number;
  libraryItemId: number;
  tenantId: LibraryTenantId;
  userId: number;
  source: "library_upload" | "library_replace";
  traceId?: string | null;
}): Promise<OcrChargePlan | null> {
  if (!isOcrExtractor(params.extractor)) return null;
  const settings = await getDocumentOcrSettings();
  const fileClass = classifyOcrFileClass({
    mimeType: params.mimeType,
    fileName: params.fileName,
  });
  const provider = resolveOcrProvider(params.metadata, params.extractor);
  const creditsPerUnit = getDocumentOcrCreditsPerUnit({
    settings,
    providerId: provider,
    fileClass,
  });
  if (creditsPerUnit <= 0) return null;
  const pageCount = resolveOcrPageCount(params.metadata, params.mimeType);
  const amount = calculateOcrCredits(pageCount, creditsPerUnit);
  if (amount <= 0) return null;
  const billingUnit = fileClass === "pdf" ? "page" : "image";
  const unitCount = fileClass === "pdf" ? pageCount : 1;
  const description = `OCR (${provider || "document_ocr"}): ${params.fileName} · ${unitCount} ${billingUnit}${unitCount === 1 ? "" : "s"}`;
  return {
    amount,
    pageCount,
    creditsPerUnit,
    billingUnit,
    provider,
    extractor: params.extractor,
    idempotencyKey: `ocr:${params.source}:${params.libraryItemId}`,
    description,
    metadata: {
      service: "library.ocr",
      source: params.source,
      libraryItemId: params.libraryItemId,
      fileName: params.fileName,
      fileType: params.mimeType,
      fileSizeBytes: params.fileSizeBytes,
      fileClass,
      pageCount,
      billingUnit,
      creditsPerUnit,
      ocrProvider: provider,
      extractor: params.extractor,
      traceId: params.traceId ?? null,
    },
  };
}

function getUploadPipelineMetadata(
  metadata: Record<string, unknown> | null | undefined,
): Record<string, unknown> {
  if (!metadata || Array.isArray(metadata)) {
    return {};
  }

  const pipeline = metadata.upload_pipeline;
  if (!pipeline || Array.isArray(pipeline) || typeof pipeline !== "object") {
    return {};
  }

  return pipeline as Record<string, unknown>;
}

async function resolveLibraryItemProjectId(
  db: DbClient,
  libraryItemId: number,
  tenantId: string,
): Promise<string | null> {
  const rows = await db
    .select({
      projectId: libraryItems.projectId,
    })
    .from(libraryItems)
    .where(and(eq(libraryItems.id, libraryItemId), eq(libraryItems.tenantId, tenantId)))
    .limit(1);

  return rows[0]?.projectId ?? null;
}

function normalizeVectorIndexName(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export function resolveLibraryVectorIndexName(): string {
  const candidates = [
    process.env.LIBRARY_VECTOR_INDEX_NAME,
    process.env.VECTORIZE_LIBRARY_INDEX,
    process.env.VECTORIZE_DOCS_INDEX,
    "library-index",
  ];

  for (const candidate of candidates) {
    const normalized = normalizeVectorIndexName(candidate);
    if (normalized) {
      return normalized;
    }
  }

  return "library-index";
}

function extractKnowledgeRefreshMetadata(
  sourceMetadata: Record<string, unknown> | undefined,
): { reason: LibraryKnowledgeRefreshReason } | null {
  const raw = sourceMetadata?.knowledgeRefresh;
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return null;
  }

  const reason = (raw as { reason?: unknown }).reason;
  if (
    reason === "markdown_save"
    || reason === "item_update"
    || reason === "restore"
    || reason === "permission_change"
  ) {
    return { reason };
  }

  return null;
}

function buildLibraryIndexJobPersistence(
  payload: ReturnType<typeof buildLibraryIndexJobPayload>,
  now: Date,
): Pick<
  typeof libraryIndexJobs.$inferInsert,
  | "payloadVersion"
  | "payloadJson"
  | "source"
  | "sourceMetadataJson"
  | "dedupeKey"
  | "knowledgeRefreshReason"
  | "knowledgeRefreshStatus"
  | "knowledgeRefreshAttemptCount"
  | "knowledgeRefreshRequestedAt"
  | "knowledgeRefreshCompletedAt"
  | "knowledgeRefreshError"
> {
  const refreshMetadata = extractKnowledgeRefreshMetadata(payload.sourceMetadata);
  const refreshStatus: LibraryKnowledgeRefreshExecutionStatus | null = refreshMetadata
    ? "pending"
    : null;

  return {
    payloadVersion: payload.version,
    payloadJson: payload as unknown as Record<string, unknown>,
    source: payload.source,
    sourceMetadataJson: payload.sourceMetadata,
    dedupeKey: payload.dedupeKey,
    knowledgeRefreshReason: refreshMetadata?.reason ?? null,
    knowledgeRefreshStatus: refreshStatus,
    knowledgeRefreshAttemptCount: 0,
    knowledgeRefreshRequestedAt: refreshMetadata ? now : null,
    knowledgeRefreshCompletedAt: null,
    knowledgeRefreshError: null,
  };
}

async function maybeDispatchLibraryKnowledgeRefreshWorker(input: {
  jobId: number;
  libraryItemId: number;
  tenantId: string;
  knowledgeRefreshStatus: LibraryKnowledgeRefreshExecutionStatus | null;
}): Promise<void> {
  if (!input.knowledgeRefreshStatus) {
    return;
  }

  try {
    await dispatchLibraryKnowledgeRefreshWorker({
      jobIds: [input.jobId],
      libraryItemId: input.libraryItemId,
      tenantId: input.tenantId,
    });
  } catch (error) {
    console.warn("[library] failed to dispatch knowledge refresh worker", {
      tenantId: input.tenantId,
      libraryItemId: input.libraryItemId,
      jobId: input.jobId,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

function resolveProcessingMimeType(
  declaredMimeType: string,
  sniffedMimeType: string | null,
): string {
  const normalizedDeclared = declaredMimeType.trim().toLowerCase();
  const normalizedSniffed = typeof sniffedMimeType === "string" ? sniffedMimeType.trim().toLowerCase() : "";
  return normalizedSniffed || normalizedDeclared || "application/octet-stream";
}

function extractVectorIndexNames(metadata: Record<string, unknown> | null | undefined): string[] {
  if (!metadata || Array.isArray(metadata)) {
    return [];
  }

  const candidates = [
    metadata.vectorIndexName,
    metadata.vector_index_name,
    metadata.indexName,
    metadata.collectionName,
    metadata.collection_name,
  ];

  const unique = new Set<string>();
  for (const candidate of candidates) {
    const normalized = normalizeVectorIndexName(candidate);
    if (normalized) {
      unique.add(normalized);
    }
  }

  return Array.from(unique);
}

function getLibraryVectorIndexCandidates(): string[] {
  const envCandidates = [
    process.env.LIBRARY_VECTOR_INDEX_NAME,
    process.env.VECTORIZE_LIBRARY_INDEX,
    process.env.VECTORIZE_DOCS_INDEX,
    "library-index",
    "docs-index-prod",
  ];

  const unique = new Set<string>();
  for (const candidate of envCandidates) {
    const normalized = normalizeVectorIndexName(candidate);
    if (normalized) {
      unique.add(normalized);
    }
  }

  return Array.from(unique);
}

export async function collectLibraryVectorCleanupTargets(
  itemIds: number | number[],
  tenantId: LibraryTenantId,
  dbClient?: DbClient,
): Promise<LibraryVectorCleanupTargets> {
  const db = await resolveDb(dbClient);
  const normalizedTenantId = normalizeLibraryTenantId(tenantId);
  const normalizedItemIds = Array.isArray(itemIds)
    ? Array.from(new Set(itemIds.filter((value) => Number.isFinite(value))))
    : [itemIds];

  if (normalizedItemIds.length === 0) {
    return { vectorRefIds: [], indexNames: [] };
  }

  const [chunkRows, itemRows] = await Promise.all([
    db
      .select({
        vectorRefId: libraryChunks.vectorRefId,
        vectorIndexName: libraryChunks.vectorIndexName,
        metadata: libraryChunks.metadata,
      })
      .from(libraryChunks)
      .where(
        and(
          eq(libraryChunks.tenantId, normalizedTenantId),
          inArray(libraryChunks.libraryItemId, normalizedItemIds),
        ),
      ),
    db
      .select({
        metadata: libraryItems.metadata,
      })
      .from(libraryItems)
      .where(
        and(
          eq(libraryItems.tenantId, normalizedTenantId),
          inArray(libraryItems.id, normalizedItemIds),
        ),
      ),
  ]);

  const vectorRefIds = new Set<string>();
  const indexNames = new Set<string>();

  for (const row of chunkRows) {
    if (typeof row.vectorRefId === "string") {
      const trimmed = row.vectorRefId.trim();
      if (trimmed) {
        vectorRefIds.add(trimmed);
      }
    }
    if (typeof row.vectorIndexName === "string") {
      const trimmedIndex = row.vectorIndexName.trim();
      if (trimmedIndex) {
        indexNames.add(trimmedIndex);
      }
    }
    for (const indexName of extractVectorIndexNames(row.metadata as Record<string, unknown> | null | undefined)) {
      indexNames.add(indexName);
    }
  }

  for (const row of itemRows) {
    for (const indexName of extractVectorIndexNames(row.metadata as Record<string, unknown> | null | undefined)) {
      indexNames.add(indexName);
    }
  }

  return {
    vectorRefIds: Array.from(vectorRefIds),
    indexNames: Array.from(indexNames),
  };
}

export async function cleanupLibraryVectorArtifacts(
  params: {
    tenantId: LibraryTenantId;
    vectorRefIds: string[];
    indexNames?: string[];
  },
): Promise<void> {
  const vectorRefIds = Array.from(
    new Set(
      params.vectorRefIds
        .map((value) => (typeof value === "string" ? value.trim() : ""))
        .filter((value) => value.length > 0),
    ),
  );

  if (vectorRefIds.length === 0) {
    return;
  }

  const explicitIndexNames = Array.from(
    new Set(
      (params.indexNames ?? [])
        .map((value) => (typeof value === "string" ? value.trim() : ""))
        .filter((value) => value.length > 0),
    ),
  );
  const candidateIndexNames = explicitIndexNames.length > 0
    ? explicitIndexNames
    : getLibraryVectorIndexCandidates();
  if (candidateIndexNames.length === 0) {
    return;
  }

  let providerConfig = getVectorProviderConfigFromEnv();
  try {
    providerConfig = await getEffectiveVectorProviderConfig({
      tenantId: normalizeLibraryTenantId(params.tenantId),
    });
  } catch {
    // Fall back to env-based config for best-effort cleanup.
  }

  for (const indexName of candidateIndexNames) {
    try {
      await dispatchVectorOperation({
        operation: "delete",
        indexName,
        ids: vectorRefIds,
        providerConfig,
      });
    } catch (error) {
      console.warn(
        `[library.delete] Vector cleanup failed for index ${indexName}:`,
        error instanceof Error ? error.message : String(error),
      );
    }
  }
}

async function findDuplicateUploadedLibraryItem(
  db: DbClient,
  params: {
    tenantId: string;
    userId: number;
    checksumSha256: string;
    excludeItemId?: number;
  },
): Promise<LibraryItemRow | null> {
  const predicates = [
    eq(libraryItems.tenantId, params.tenantId),
    eq(libraryItems.ownerUserId, params.userId),
    eq(libraryItems.source, "document_upload"),
    isNull(libraryItems.deletedAt),
    sql`coalesce(${libraryItems.metadata}->>'content_checksum_sha256', '') = ${params.checksumSha256}`,
  ];

  if (params.excludeItemId) {
    predicates.push(ne(libraryItems.id, params.excludeItemId));
  }

  const rows = await db
    .select()
    .from(libraryItems)
    .where(and(...predicates))
    .limit(1);

  return rows[0] ?? null;
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

const ALLOWED_LIBRARY_RECENT_DAYS = new Set<LibraryRecentDaysFilter>([1, 3, 7, 15, 30]);
const DAY_MS = 86_400_000;

function getRecentCutoffDate(recentDays?: LibraryRecentDaysFilter): Date | null {
  if (recentDays === undefined) return null;
  if (!ALLOWED_LIBRARY_RECENT_DAYS.has(recentDays)) return null;
  return new Date(Date.now() - recentDays * DAY_MS);
}

function getLibraryItemLastActivityAt(item: Pick<LibraryItemRow, "createdAt" | "updatedAt">): Date {
  return item.updatedAt > item.createdAt ? item.updatedAt : item.createdAt;
}

function itemMatchesFilters(item: LibraryItemRow, filters?: LibrarySearchFilters): boolean {
  if (!filters) return true;

  if (filters.itemType && item.itemType !== filters.itemType) return false;
  if (filters.ownerUserId !== undefined && item.ownerUserId !== filters.ownerUserId) return false;
  if (filters.projectId !== undefined && item.projectId !== filters.projectId) return false;
  if (filters.status && item.status !== filters.status) return false;
  if (filters.fromDate && item.createdAt < filters.fromDate) return false;
  if (filters.toDate && item.createdAt > filters.toDate) return false;
  const recentCutoff = getRecentCutoffDate(filters.recentDays);
  if (recentCutoff && getLibraryItemLastActivityAt(item) < recentCutoff) return false;

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
  item: Pick<LibraryItemRow, "tenantId" | "ownerUserId" | "visibility" | "metadata">,
  actor: LibraryActor,
  permissionLevel: LibraryPermissionLevel | null,
): boolean {
  if (normalizeLibraryTenantId(item.tenantId) !== normalizeLibraryTenantId(actor.tenantId)) return false;
  if (isPrivateVaultLibraryItem(item)) {
    return item.ownerUserId === actor.userId && hasPrivateVaultAccess(actor);
  }
  if (actor.role === "admin") return true;
  if (item.ownerUserId === actor.userId) return true;
  if (item.visibility === "public") return true;
  if (item.visibility === "team") return true;
  return permissionLevel !== null;
}

export function canManageLibraryItem(
  item: Pick<LibraryItemRow, "tenantId" | "ownerUserId" | "metadata">,
  actor: LibraryActor,
  permissionLevel: LibraryPermissionLevel | null,
): boolean {
  if (normalizeLibraryTenantId(item.tenantId) !== normalizeLibraryTenantId(actor.tenantId)) return false;
  if (isPrivateVaultLibraryItem(item)) {
    return item.ownerUserId === actor.userId && hasPrivateVaultAccess(actor);
  }
  if (actor.role === "admin") return true;
  if (item.ownerUserId === actor.userId) return true;
  return permissionLevel === "write" || permissionLevel === "delete" || permissionLevel === "owner";
}

const LIBRARY_GALLERY_LINK_TYPE = "gallery_item";

function mapLibraryItemTypeToGalleryType(
  itemType: string,
): "image" | "video" | null {
  if (itemType === "image") return "image";
  if (itemType === "video") return "video";
  return null;
}

function readNumericMetadata(
  metadata: Record<string, unknown>,
  ...keys: string[]
): number | null {
  for (const key of keys) {
    const value = metadata[key];
    const parsed = typeof value === "number"
      ? value
      : typeof value === "string"
        ? Number.parseFloat(value)
        : NaN;
    if (Number.isFinite(parsed) && parsed > 0) {
      return parsed;
    }
  }
  return null;
}

function resolveGalleryAspectRatio(
  itemType: "image" | "video",
  metadata: Record<string, unknown>,
): "1:1" | "9:16" | "16:9" {
  const explicit = typeof metadata.aspectRatio === "string"
    ? metadata.aspectRatio
    : typeof metadata.aspect_ratio === "string"
      ? metadata.aspect_ratio
      : null;
  if (explicit === "1:1" || explicit === "9:16" || explicit === "16:9") {
    return explicit;
  }

  const width = readNumericMetadata(metadata, "width", "image_width", "video_width");
  const height = readNumericMetadata(metadata, "height", "image_height", "video_height");
  if (width && height) {
    const ratio = width / height;
    if (ratio <= 0.75) return "9:16";
    if (ratio >= 1.4) return "16:9";
    return "1:1";
  }

  return itemType === "video" ? "16:9" : "1:1";
}

async function getLibraryGalleryLinkRow(
  db: DbLike,
  libraryItemId: number,
) {
  const rows = await db
    .select({
      id: libraryLinks.id,
      linkId: libraryLinks.linkId,
      galleryItemId: galleryItems.id,
      isPublished: galleryItems.isPublished,
    })
    .from(libraryLinks)
    .leftJoin(galleryItems, eq(galleryItems.id, sql<number>`${libraryLinks.linkId}::int`))
    .where(
      and(
        eq(libraryLinks.libraryItemId, libraryItemId),
        eq(libraryLinks.linkType, LIBRARY_GALLERY_LINK_TYPE),
      ),
    )
    .limit(1);

  return rows[0] ?? null;
}

async function removeGalleryPublicationLink(
  db: DbLike,
  libraryItemId: number,
): Promise<void> {
  const galleryLink = await getLibraryGalleryLinkRow(db, libraryItemId);
  if (!galleryLink) {
    return;
  }

  if (galleryLink.galleryItemId) {
    await db.delete(galleryItems).where(eq(galleryItems.id, galleryLink.galleryItemId));
  }

  await db.delete(libraryLinks).where(eq(libraryLinks.id, galleryLink.id));
}

function buildGalleryPayloadFromLibraryItem(
  item: LibraryItemRow,
): typeof galleryItems.$inferInsert {
  const metadata = normalizeLibraryMetadata(item.metadata as Record<string, unknown>);
  const galleryType = mapLibraryItemTypeToGalleryType(item.itemType);
  if (!galleryType) {
    throw new Error("Only image and video files can be published to the Gallery");
  }
  if (!item.sourceUrl) {
    throw new Error("This file does not have a public source URL yet");
  }

  const numericTenantId = Number.parseInt(String(item.tenantId), 10);
  const model = typeof metadata.model === "string"
    ? metadata.model
    : typeof metadata.model_name === "string"
      ? metadata.model_name
      : null;
  const tags = normalizeTagList(metadata.tags);
  const description = item.description
    || (typeof metadata.prompt === "string" ? metadata.prompt : null)
    || null;

  return {
    tenantId: Number.isFinite(numericTenantId) ? numericTenantId : undefined,
    type: galleryType,
    title: item.title,
    description,
    aspectRatio: resolveGalleryAspectRatio(galleryType, metadata),
    fileUrl: item.sourceUrl,
    thumbnailUrl: item.thumbnailUrl || item.sourceUrl,
    model,
    tags,
    isPublished: true,
    authorId: item.ownerUserId,
  };
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

function canActorPublishLibraryItem(
  item: LibraryItemRow,
  actor: LibraryActor,
): boolean {
  return actor.role === "admin" || item.ownerUserId === actor.userId;
}

export async function getLibraryGalleryPublicationState(
  itemId: number,
  actor: LibraryActor,
  dbClient?: DbClient,
): Promise<LibraryGalleryPublicationState | null> {
  const db = await resolveDb(dbClient);
  const actorTenantId = normalizeLibraryTenantId(actor.tenantId);
  const item = await getLibraryItemRowById(db, itemId, actorTenantId);

  if (!item) {
    return null;
  }

  const permission = await getUserPermissionLevel(db, item.id, actor);
  const canManage = canManageLibraryItem(item, actor, permission);
  const galleryType = mapLibraryItemTypeToGalleryType(item.itemType);
  const galleryLink = await getLibraryGalleryLinkRow(db, item.id);

  let reason: string | null = null;
  if (!canManage) {
    reason = "Only users who can manage this file can publish it";
  } else if (!canActorPublishLibraryItem(item, actor)) {
    reason = "Only the file owner or an admin can publish to the Gallery";
  } else if (isPrivateVaultLibraryItem(item)) {
    reason = "Private vault files cannot be published to the Gallery";
  } else if (!galleryType) {
    reason = "Only image and video files can be published to the Gallery";
  } else if (!item.sourceUrl) {
    reason = "This file is missing a public source URL";
  }

  return {
    canManage,
    canPublish: reason === null,
    isPublished: Boolean(galleryLink?.galleryItemId && galleryLink.isPublished),
    galleryItemId: galleryLink?.galleryItemId ?? null,
    supported: galleryType !== null,
    reason,
  };
}

export async function publishLibraryItemToGallery(
  itemId: number,
  actor: LibraryActor,
  dbClient?: DbClient,
): Promise<PublishLibraryItemToGalleryResult> {
  const db = await resolveDb(dbClient);
  const actorTenantId = normalizeLibraryTenantId(actor.tenantId);
  const item = await getLibraryItemRowById(db, itemId, actorTenantId);

  if (!item) {
    throw new Error("Library item not found");
  }

  const permission = await getUserPermissionLevel(db, item.id, actor);
  if (!canManageLibraryItem(item, actor, permission)) {
    throw new Error("You do not have permission to manage this file");
  }
  if (!canActorPublishLibraryItem(item, actor)) {
    throw new Error("Only the file owner or an admin can publish to the Gallery");
  }
  if (isPrivateVaultLibraryItem(item)) {
    throw new Error("Private vault files cannot be published to the Gallery");
  }

  const payload = buildGalleryPayloadFromLibraryItem(item);

  const result = await db.transaction(async (tx) => {
    const galleryLink = await getLibraryGalleryLinkRow(tx, item.id);

    if (galleryLink?.galleryItemId) {
      await tx
        .update(galleryItems)
        .set({
          ...payload,
          updatedAt: new Date(),
        })
        .where(eq(galleryItems.id, galleryLink.galleryItemId));

      return {
        success: true as const,
        galleryItemId: galleryLink.galleryItemId,
        created: false,
      };
    }

    const inserted = await tx
      .insert(galleryItems)
      .values(payload)
      .returning({ id: galleryItems.id });

    const createdGalleryItemId = inserted[0]?.id;
    if (!createdGalleryItemId) {
      throw new Error("Failed to publish file to the Gallery");
    }

    if (galleryLink?.id) {
      await tx
        .update(libraryLinks)
        .set({
          linkId: String(createdGalleryItemId),
          tenantId: actorTenantId,
          createdAt: new Date(),
        })
        .where(eq(libraryLinks.id, galleryLink.id));
    } else {
      await tx.insert(libraryLinks).values({
        libraryItemId: item.id,
        linkType: LIBRARY_GALLERY_LINK_TYPE,
        linkId: String(createdGalleryItemId),
        tenantId: actorTenantId,
        createdAt: new Date(),
      });
    }

    return {
      success: true as const,
      galleryItemId: createdGalleryItemId,
      created: true,
    };
  });
  return result;
}

export async function unpublishLibraryItemFromGallery(
  itemId: number,
  actor: LibraryActor,
  dbClient?: DbClient,
): Promise<{ success: true }> {
  const db = await resolveDb(dbClient);
  const actorTenantId = normalizeLibraryTenantId(actor.tenantId);
  const item = await getLibraryItemRowById(db, itemId, actorTenantId);

  if (!item) {
    throw new Error("Library item not found");
  }

  const permission = await getUserPermissionLevel(db, item.id, actor);
  if (!canManageLibraryItem(item, actor, permission)) {
    throw new Error("You do not have permission to manage this file");
  }
  if (!canActorPublishLibraryItem(item, actor)) {
    throw new Error("Only the file owner or an admin can unpublish from the Gallery");
  }

  await db.transaction(async (tx) => {
    await removeGalleryPublicationLink(tx, item.id);
  });

  return { success: true };
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

  if (isPrivateVaultMetadata(input.metadata) && !hasPrivateVaultAccess(actor)) {
    throw new Error("Private vault is locked");
  }

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
      parentId: input.parentId ?? null,
      itemType: input.itemType,
      source: input.source,
      projectId: input.projectId ?? null,
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
  await safeEnqueueLibraryIndexJob(
    {
      libraryItemId: created.id,
      tenantId: actorTenantId,
      jobType: "google_drive_sync",
      domain: "library",
      operation: "index",
      source: "ingestion.google_drive_sync",
      sourceMetadata: {
        ingestion: "google_drive",
      },
      allowThrottle: true,
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

  if (isPrivateVaultMetadata(input.metadata) && !hasPrivateVaultAccess(actor)) {
    throw new Error("Private vault is locked");
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
    throw new Error("File too large (max 50MB)");
  }

  const svgUpload = isSvgUpload(fileType, ext);
  if (svgUpload) {
    const sanitized = sanitizeUploadedSvg(fileBuffer);
    if (!sanitized.safe) {
      throw new Error("Unsafe SVG content is not allowed");
    }
    fileBuffer = sanitized.sanitizedBuffer;
  }

  const { sniffedMime } = validateLibraryUploadSignature(fileBuffer, fileType, ext);
  const effectiveFileType = resolveProcessingMimeType(fileType, sniffedMime);
  const checksumSha256 = computeLibraryUploadChecksum(fileBuffer);
  const duplicate = await findDuplicateUploadedLibraryItem(db, {
    tenantId,
    userId: actor.userId,
    checksumSha256,
  });
  if (duplicate) {
    return {
      item: toLibraryItemDto(duplicate),
      storageKey: String((duplicate.metadata ?? {}).source_key || ""),
      duplicateOfItemId: duplicate.id,
      indexJob: {
        jobId: 0,
        status: "duplicate_reused",
        created: false,
        payloadVersion: "v2",
        dedupeKey: `library-upload:duplicate:${duplicate.id}`,
      },
      billing: {
        creditsCharged: 0,
        category: "duplicate_reused",
        fileSizeBytes: Number((duplicate.metadata ?? {}).file_size_bytes || fileBuffer.length),
        baseCredits: 0,
        stepCredits: 0,
        extraSteps: 0,
        sizeStepMb: 0,
      },
    };
  }

  const billing = await calculateLibraryUploadCreditCost(effectiveFileType, fileBuffer.length);
  const fallbackText = extractTextLikeUploadMetadata(input.metadata)
    ?? extractTextLikeUploadContent(fileBuffer, effectiveFileType, ext);
  const debugTraceId = getFinanceOcrDebugTraceId(
    typeof input.metadata?.finance_debug_trace_id === "string"
      ? input.metadata.finance_debug_trace_id
      : typeof input.metadata?.debug_trace_id === "string"
        ? input.metadata.debug_trace_id
        : null,
  );

  const fileId = crypto.randomUUID().replace(/-/g, "");
  const key = `library/uploads/${tenantId}/${actor.userId}/${fileId}${ext ? `.${ext}` : ""}`;
  const storage = await storagePut(key, fileBuffer, effectiveFileType);
  let enrichment: LibraryUploadEnrichmentResult | null = null;
  let extractedText: string | null = null;
  let created: Awaited<ReturnType<typeof createLibraryItem>> | null = null;
  try {
    const featureFlags = await getTenantFeatureFlags(String(tenantId));
    enrichment = await enrichLibraryUploadContent({
      fileBuffer,
      fileName,
      fileType: effectiveFileType,
      extension: ext,
      fallbackText,
      sourceUrl: storage.url,
      metadata: input.metadata,
      externalProcessingAllowed: featureFlags.documentOcrExternalProcessing,
      tenantId: String(tenantId),
    });
    extractedText = enrichment.extractedText;
    debugLog("finance_ocr", "library upload enrichment", {
      traceId: getTraceId() ?? "unknown",
      debugTraceId,
      fileName,
      fileType: effectiveFileType,
      extension: ext,
      fallbackTextLength: fallbackText?.length ?? 0,
      extractedTextLength: extractedText?.length ?? 0,
      extractor: enrichment.extractor,
      searchQuality: enrichment.searchQuality,
      warningCount: enrichment.warnings.length,
      sourceUrlPresent: Boolean(storage.url),
    });
    recordFinanceOcrDebugStep("library_upload_enrichment", {
      traceId: debugTraceId ?? getTraceId() ?? "unknown",
      fileName,
      fileType: effectiveFileType,
      extension: ext,
      fallbackTextLength: fallbackText?.length ?? 0,
      extractedTextLength: extractedText?.length ?? 0,
      extractor: enrichment.extractor,
      searchQuality: enrichment.searchQuality,
      warningCount: enrichment.warnings.length,
      sourceUrlPresent: Boolean(storage.url),
    });

    const inferredProcessingItemType = inferLibraryItemType(effectiveFileType, ext);
    created = await createLibraryItem(
      {
        itemType: inferredProcessingItemType,
        source: "document_upload",
        title: input.title?.trim() || fileName,
        description: null,
        status: "indexing",
        visibility: input.visibility ?? "private",
        projectId: input.projectId ?? null,
        parentId: input.parentId ?? null,
        metadata: {
          ...buildLibraryUploadMetadata(input.metadata, {
            fileName,
            fileType: effectiveFileType,
            extension: ext,
            fileSizeBytes: fileBuffer.length,
            checksumSha256,
            extractedText,
            extractor: enrichment.extractor,
            searchQuality: enrichment.searchQuality,
            stage: "indexing",
            stageMessage: enrichment.stageMessage,
            warnings: enrichment.warnings,
            svgSanitized: svgUpload,
            extraMetadata: enrichment.extraMetadata,
          }),
          uploaded_by_user_id: actor.userId,
          source_key: storage.key,
        },
        sourceUrl: storage.url,
        thumbnailUrl: inferredProcessingItemType === "image" ? storage.url : null,
        sourceLink: {
          linkType: "upload_key",
          linkId: storage.key,
        },
      },
      actor,
      db,
    );
  } catch (error) {
    await storageDelete(storage.key).catch(() => {});
    throw error;
  }
  debugLog("finance_ocr", "library upload persisted", {
    traceId: getTraceId() ?? "unknown",
    debugTraceId,
    libraryItemId: created.item.id,
    fileName,
    fileType: effectiveFileType,
    extension: ext,
    extractedTextLength: extractedText?.length ?? 0,
    metadataHasExtractedText: Boolean((created.item.metadata ?? {}).extracted_text),
    metadataKeys: Object.keys((created.item.metadata ?? {}) as Record<string, unknown>).slice(0, 16),
  });
  recordFinanceOcrDebugStep("library_upload_persisted", {
    traceId: debugTraceId ?? getTraceId() ?? "unknown",
    libraryItemId: created.item.id,
    fileName,
    fileType: effectiveFileType,
    extension: ext,
    extractedTextLength: extractedText?.length ?? 0,
    metadataHasExtractedText: Boolean((created.item.metadata ?? {}).extracted_text),
  });

  if (extractedText) {
    await upsertLibrarySourceTextChunk(db, {
      tenantId,
      libraryItemId: created.item.id,
      content: extractedText,
      source: isMarkdownLibraryUpload(ext) ? "document_upload_markdown" : "document_upload_extracted",
      projectId: input.projectId ?? null,
    });
    debugLog("finance_ocr", "library upload chunk upserted", {
      traceId: getTraceId() ?? "unknown",
      debugTraceId,
      libraryItemId: created.item.id,
      fileName,
      extractedTextLength: extractedText.length,
      chunkSource: isMarkdownLibraryUpload(ext) ? "document_upload_markdown" : "document_upload_extracted",
    });
    recordFinanceOcrDebugStep("library_upload_chunk_upserted", {
      traceId: debugTraceId ?? getTraceId() ?? "unknown",
      libraryItemId: created.item.id,
      fileName,
      extractedTextLength: extractedText.length,
      chunkSource: isMarkdownLibraryUpload(ext) ? "document_upload_markdown" : "document_upload_extracted",
    });
  } else {
    debugLog("finance_ocr", "library upload no extracted text", {
      traceId: getTraceId() ?? "unknown",
      debugTraceId,
      libraryItemId: created.item.id,
      fileName,
      fileType: effectiveFileType,
      extension: ext,
      searchQuality: enrichment.searchQuality,
      warningCount: enrichment.warnings.length,
    });
    recordFinanceOcrDebugStep("library_upload_no_extracted_text", {
      traceId: debugTraceId ?? getTraceId() ?? "unknown",
      libraryItemId: created.item.id,
      fileName,
      fileType: effectiveFileType,
      extension: ext,
      searchQuality: enrichment.searchQuality,
      warningCount: enrichment.warnings.length,
    });
  }

  const ocrChargePlan = await buildOcrChargePlan({
    extractor: enrichment.extractor,
    metadata: (created.item.metadata ?? {}) as Record<string, unknown>,
    mimeType: effectiveFileType,
    fileName,
    fileSizeBytes: fileBuffer.length,
    libraryItemId: created.item.id,
    tenantId,
    userId: actor.userId,
    source: "library_upload",
    traceId: getTraceId(),
  });

  const totalCharge = billing.totalCredits + (ocrChargePlan?.amount ?? 0);
  if (totalCharge > 0) {
    const hasCredits = await hasEnoughCredits(actor.userId, totalCharge);
    if (!hasCredits) {
      throw new Error(`Insufficient credits. Required: ${totalCharge}`);
    }
  }

  let ocrCharged = false;
  let uploadCharged = false;
  try {
    if (ocrChargePlan) {
      await deductCredits({
        userId: actor.userId,
        amount: ocrChargePlan.amount,
        tenantId,
        sourceType: "other",
        description: ocrChargePlan.description,
        idempotencyKey: ocrChargePlan.idempotencyKey,
        metadata: {
          ...ocrChargePlan.metadata,
          ...(input.billingMetadata ?? {}),
        },
      });
      ocrCharged = true;
    }

    if (billing.totalCredits > 0) {
      await deductCredits({
        userId: actor.userId,
        amount: billing.totalCredits,
        tenantId,
        sourceType: "indexing",
        description: `Library upload (${billing.category}): ${fileName}`,
        idempotencyKey: `library-upload:${created.item.id}`,
        metadata: {
          service: "library.upload_file",
          libraryItemId: created.item.id,
          fileName,
          fileType,
          fileSizeBytes: fileBuffer.length,
          billingCategory: billing.category,
          billingBaseCredits: billing.baseCredits,
          billingStepCredits: billing.stepCredits,
          billingExtraSteps: billing.extraSteps,
          billingSizeStepMb: billing.sizeStepMb,
          ...(input.billingMetadata ?? {}),
        },
      });
      uploadCharged = true;
    }
  } catch (error) {
    if (ocrCharged && ocrChargePlan) {
      await refundCredits({
        userId: actor.userId,
        amount: ocrChargePlan.amount,
        description: `Refund OCR charge (library upload): ${fileName}`,
        sourceType: "other",
        metadata: {
          ...ocrChargePlan.metadata,
          refundReason: "library_upload_billing_failed",
        },
      }).catch(() => {});
    }
    if (uploadCharged && billing.totalCredits > 0) {
      await refundCredits({
        userId: actor.userId,
        amount: billing.totalCredits,
        description: `Refund library upload billing: ${fileName}`,
        sourceType: "indexing",
        metadata: {
          service: "library.upload_file",
          libraryItemId: created.item.id,
          fileName,
          fileType,
          fileSizeBytes: fileBuffer.length,
          billingCategory: billing.category,
          billingBaseCredits: billing.baseCredits,
          billingStepCredits: billing.stepCredits,
          billingExtraSteps: billing.extraSteps,
          billingSizeStepMb: billing.sizeStepMb,
          refundReason: "library_upload_billing_failed",
        },
      }).catch(() => {});
    }
    // Roll back uploaded artifact when post-upload billing fails (e.g., concurrent balance race).
    try {
      const softDeleted = await softDeleteLibraryItem(created.item.id, actor, db);
      if (softDeleted) {
        await permanentDeleteLibraryItem(created.item.id, actor, db);
      } else {
        await storageDelete(storage.key).catch(() => {});
      }
    } catch {
      await storageDelete(storage.key).catch(() => {});
    }
    throw error;
  }

  const indexJob = await safeEnqueueLibraryIndexJob(
    {
      libraryItemId: created.item.id,
      tenantId,
      jobType: "initial_index",
      domain: "library",
      operation: "index",
      source: "library.upload",
      sourceMetadata: {
        ingestion: "document_upload",
        fileType,
      },
      allowThrottle: true,
    },
    db,
  );

  return {
    item: created.item,
    storageKey: storage.key,
    duplicateOfItemId: null,
    indexJob,
    billing: {
      creditsCharged: billing.totalCredits,
      category: billing.category,
      fileSizeBytes: fileBuffer.length,
      baseCredits: billing.baseCredits,
      stepCredits: billing.stepCredits,
      extraSteps: billing.extraSteps,
      sizeStepMb: billing.sizeStepMb,
    },
  };
}

export async function replaceLibraryFile(
  input: ReplaceLibraryFileInput,
  actor: LibraryActor,
  dbClient?: DbClient,
): Promise<ReplaceLibraryFileResult> {
  const db = await resolveDb(dbClient);
  const tenantId = normalizeLibraryTenantId(actor.tenantId);
  const fileName = input.fileName.trim();
  const fileType = (input.fileType || "application/octet-stream").trim().toLowerCase();

  if (!fileName) {
    throw new Error("File name is required");
  }

  // 1. Get existing item and check permissions
  const existing = await getLibraryItemRowById(db, input.itemId, tenantId);
  if (!existing) {
    throw new Error("Library item not found");
  }

  const permissionLevel = await getUserPermissionLevel(db, existing.id, actor);
  if (!canManageLibraryItem(existing, actor, permissionLevel)) {
    throw new Error("You do not have permission to update this item");
  }

  // 2. Validate new file
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
    throw new Error("File too large (max 50MB)");
  }

  const svgUpload = isSvgUpload(fileType, ext);
  if (svgUpload) {
    const sanitized = sanitizeUploadedSvg(fileBuffer);
    if (!sanitized.safe) {
      throw new Error("Unsafe SVG content is not allowed");
    }
    fileBuffer = sanitized.sanitizedBuffer;
  }

  const { sniffedMime } = validateLibraryUploadSignature(fileBuffer, fileType, ext);
  const effectiveFileType = resolveProcessingMimeType(fileType, sniffedMime);
  const checksumSha256 = computeLibraryUploadChecksum(fileBuffer);
  const duplicate = await findDuplicateUploadedLibraryItem(db, {
    tenantId,
    userId: actor.userId,
    checksumSha256,
    excludeItemId: existing.id,
  });
  if (duplicate) {
    throw new Error("An identical file already exists in your library. Reuse the existing item instead of uploading a duplicate.");
  }

  const billing = await calculateLibraryUploadCreditCost(effectiveFileType, fileBuffer.length);
  const fallbackText = extractTextLikeUploadMetadata(input.metadata)
    ?? extractTextLikeUploadContent(fileBuffer, effectiveFileType, ext);
  const debugTraceId = getFinanceOcrDebugTraceId(
    typeof input.metadata?.finance_debug_trace_id === "string"
      ? input.metadata.finance_debug_trace_id
      : typeof input.metadata?.debug_trace_id === "string"
        ? input.metadata.debug_trace_id
        : null,
  );
  let debitTransactionId: number | null = null;
  let ocrDebitTransactionId: number | null = null;
  let ocrChargePlan: OcrChargePlan | null = null;
  if (billing.totalCredits > 0) {
    const hasCredits = await hasEnoughCredits(actor.userId, billing.totalCredits);
    if (!hasCredits) {
      throw new Error(`Insufficient credits. Required: ${billing.totalCredits}`);
    }

    const debit = await deductCredits({
      userId: actor.userId,
      amount: billing.totalCredits,
      tenantId,
      sourceType: "indexing",
      description: `Library replace (${billing.category}): ${fileName}`,
      metadata: {
        service: "library.replace_file",
        libraryItemId: existing.id,
        fileName,
        fileType: effectiveFileType,
        fileSizeBytes: fileBuffer.length,
        billingCategory: billing.category,
        billingBaseCredits: billing.baseCredits,
        billingStepCredits: billing.stepCredits,
        billingExtraSteps: billing.extraSteps,
        billingSizeStepMb: billing.sizeStepMb,
      },
    });
    debitTransactionId = debit.transactionId;
  }

  let newKey: string | null = null;
  try {
    // 3. Get current file's storage key
    const currentLinks = await db
      .select()
      .from(libraryLinks)
      .where(
        and(
          eq(libraryLinks.libraryItemId, existing.id),
          eq(libraryLinks.linkType, "upload_key"),
        ),
      )
      .limit(1);

    const currentStorageKey = currentLinks[0]?.linkId ?? null;
    const oldMetadata = (existing.metadata ?? {}) as Record<string, unknown>;

    // 4. Archive current file as version snapshot
    const snapshotContent = JSON.stringify({
      file_name: oldMetadata.file_name ?? existing.title,
      file_type: oldMetadata.file_type ?? "application/octet-stream",
      file_size_bytes: oldMetadata.file_size_bytes ?? 0,
      original_source_url: existing.sourceUrl ?? null,
    });

    const version = await createContentVersion(db, {
      tenantId,
      libraryItemId: existing.id,
      content: snapshotContent,
      contentType: "file_snapshot",
      createdByUserId: actor.userId,
      changeDescription: input.changeDescription || `Replaced with ${fileName}`,
      snapshotObjectKey: currentStorageKey ?? undefined,
    });

    if (!version) {
      throw new Error("Failed to create version snapshot before replacing file");
    }
    const versionNumber = version.versionNumber;

    // 5. Upload new file
    const fileId = crypto.randomUUID().replace(/-/g, "");
    newKey = `library/uploads/${tenantId}/${actor.userId}/${fileId}${ext ? `.${ext}` : ""}`;
    const storage = await storagePut(newKey, fileBuffer, effectiveFileType);
    const inferredItemType = inferLibraryItemType(effectiveFileType, ext);
    const featureFlags = await getTenantFeatureFlags(String(tenantId));
    const enrichment = await enrichLibraryUploadContent({
      fileBuffer,
      fileName,
      fileType: effectiveFileType,
      extension: ext,
      fallbackText,
      sourceUrl: storage.url,
      metadata: input.metadata,
      externalProcessingAllowed: featureFlags.documentOcrExternalProcessing,
      tenantId: String(tenantId),
    });
    const extractedText = enrichment.extractedText;
    debugLog("finance_ocr", "library replace enrichment", {
      traceId: getTraceId() ?? "unknown",
      debugTraceId,
      libraryItemId: existing.id,
      fileName,
      fileType: effectiveFileType,
      extension: ext,
      fallbackTextLength: fallbackText?.length ?? 0,
      extractedTextLength: extractedText?.length ?? 0,
      extractor: enrichment.extractor,
      searchQuality: enrichment.searchQuality,
      warningCount: enrichment.warnings.length,
      sourceUrlPresent: Boolean(storage.url),
    });
    recordFinanceOcrDebugStep("library_replace_enrichment", {
      traceId: debugTraceId ?? getTraceId() ?? "unknown",
      libraryItemId: existing.id,
      fileName,
      fileType: effectiveFileType,
      extension: ext,
      fallbackTextLength: fallbackText?.length ?? 0,
      extractedTextLength: extractedText?.length ?? 0,
      extractor: enrichment.extractor,
      searchQuality: enrichment.searchQuality,
      warningCount: enrichment.warnings.length,
      sourceUrlPresent: Boolean(storage.url),
    });

    // Steps 6-7 in a transaction so item + link updates are atomic
    const updated = await db.transaction(async (tx) => {
      // 6. Update library item
      const now = new Date();
      const updatedRows = await tx
        .update(libraryItems)
        .set({
          sourceUrl: storage.url,
          thumbnailUrl: inferredItemType === "image" ? storage.url : existing.thumbnailUrl,
          itemType: inferredItemType,
          status: "indexing",
          metadata: {
            ...buildLibraryUploadMetadata({ ...oldMetadata, ...(input.metadata || {}) }, {
              fileName,
              fileType: effectiveFileType,
              extension: ext,
              fileSizeBytes: fileBuffer.length,
              checksumSha256,
              extractedText,
              extractor: enrichment.extractor,
              searchQuality: enrichment.searchQuality,
              stage: "indexing",
              stageMessage: enrichment.stageMessage,
              warnings: enrichment.warnings,
              svgSanitized: svgUpload,
              extraMetadata: enrichment.extraMetadata,
            }),
            uploaded_by_user_id: actor.userId,
            source_key: storage.key,
          },
          updatedAt: now,
        })
        .where(and(eq(libraryItems.id, existing.id), eq(libraryItems.tenantId, tenantId)))
        .returning();

      const txUpdated = updatedRows[0];
      if (!txUpdated) {
        throw new Error("Failed to update library item");
      }

      // 7. Update library link
      if (currentLinks[0]) {
        await tx
          .update(libraryLinks)
          .set({ linkId: storage.key })
          .where(eq(libraryLinks.id, currentLinks[0].id));
      } else {
        await tx.insert(libraryLinks).values({
          libraryItemId: existing.id,
          linkType: "upload_key",
          linkId: storage.key,
          tenantId,
        });
      }

      return txUpdated;
    });
    debugLog("finance_ocr", "library replace persisted", {
      traceId: getTraceId() ?? "unknown",
      debugTraceId,
      libraryItemId: existing.id,
      fileName,
      fileType: effectiveFileType,
      extension: ext,
      extractedTextLength: extractedText?.length ?? 0,
      metadataHasExtractedText: Boolean((updated.metadata ?? {}).extracted_text),
      metadataKeys: Object.keys((updated.metadata ?? {}) as Record<string, unknown>).slice(0, 16),
    });
    recordFinanceOcrDebugStep("library_replace_persisted", {
      traceId: debugTraceId ?? getTraceId() ?? "unknown",
      libraryItemId: existing.id,
      fileName,
      fileType: effectiveFileType,
      extension: ext,
      extractedTextLength: extractedText?.length ?? 0,
      metadataHasExtractedText: Boolean((updated.metadata ?? {}).extracted_text),
      metadataKeys: Object.keys((updated.metadata ?? {}) as Record<string, unknown>).slice(0, 16),
    });

    if (extractedText) {
      await upsertLibrarySourceTextChunk(db, {
        tenantId,
        libraryItemId: existing.id,
        content: extractedText,
        source: isMarkdownLibraryUpload(ext) ? "document_replace_markdown" : "document_replace_extracted",
      });
      debugLog("finance_ocr", "library replace chunk upserted", {
        traceId: getTraceId() ?? "unknown",
        debugTraceId,
        libraryItemId: existing.id,
        fileName,
        extractedTextLength: extractedText.length,
        chunkSource: isMarkdownLibraryUpload(ext) ? "document_replace_markdown" : "document_replace_extracted",
      });
      recordFinanceOcrDebugStep("library_replace_chunk_upserted", {
        traceId: debugTraceId ?? getTraceId() ?? "unknown",
        libraryItemId: existing.id,
        fileName,
        extractedTextLength: extractedText.length,
        chunkSource: isMarkdownLibraryUpload(ext) ? "document_replace_markdown" : "document_replace_extracted",
      });
    } else {
      await db
        .delete(libraryChunks)
        .where(
          and(
            eq(libraryChunks.libraryItemId, existing.id),
            eq(libraryChunks.contentType, "markdown_source"),
          ),
        );
      debugLog("finance_ocr", "library replace no extracted text", {
        traceId: getTraceId() ?? "unknown",
        debugTraceId,
        libraryItemId: existing.id,
        fileName,
        fileType: effectiveFileType,
        extension: ext,
        searchQuality: enrichment.searchQuality,
        warningCount: enrichment.warnings.length,
      });
      recordFinanceOcrDebugStep("library_replace_no_extracted_text", {
        traceId: debugTraceId ?? getTraceId() ?? "unknown",
        libraryItemId: existing.id,
        fileName,
        fileType: effectiveFileType,
        extension: ext,
        searchQuality: enrichment.searchQuality,
        warningCount: enrichment.warnings.length,
      });
    }

    ocrChargePlan = await buildOcrChargePlan({
      extractor: enrichment.extractor,
      metadata: (updated.metadata ?? {}) as Record<string, unknown>,
      mimeType: effectiveFileType,
      fileName,
      fileSizeBytes: fileBuffer.length,
      libraryItemId: existing.id,
      tenantId,
      userId: actor.userId,
      source: "library_replace",
      traceId: getTraceId(),
    });

    if (ocrChargePlan) {
      const hasCredits = await hasEnoughCredits(actor.userId, ocrChargePlan.amount);
      if (!hasCredits) {
        throw new Error(`Insufficient credits. Required: ${ocrChargePlan.amount}`);
      }
      const ocrDebit = await deductCredits({
        userId: actor.userId,
        amount: ocrChargePlan.amount,
        tenantId,
        sourceType: "other",
        description: ocrChargePlan.description,
        idempotencyKey: ocrChargePlan.idempotencyKey,
        metadata: ocrChargePlan.metadata,
      });
      ocrDebitTransactionId = ocrDebit.transactionId;
    }

    // 8. Enqueue re-indexing (outside transaction — job queue insert)
    const indexJob = await safeEnqueueLibraryIndexJob(
      {
        libraryItemId: existing.id,
        tenantId,
        jobType: "file_replace",
        domain: "library",
        operation: "index",
        source: "library.replace_file",
        sourceMetadata: {
          ingestion: "file_replace",
          fileType,
          previousVersion: versionNumber,
        },
        allowThrottle: true,
      },
      db,
    );

    return {
      item: toLibraryItemDto(updated),
      indexJob,
      versionNumber,
    };
  } catch (err) {
    if (newKey) {
      // Clean up the orphaned uploaded file
      await storageDelete(newKey).catch(() => {});
    }
    if (ocrChargePlan && ocrDebitTransactionId) {
      await refundCredits({
        userId: actor.userId,
        amount: ocrChargePlan.amount,
        description: `Refund OCR charge (library replace): ${fileName}`,
        originalTransactionId: ocrDebitTransactionId,
        sourceType: "other",
        metadata: {
          ...ocrChargePlan.metadata,
          refundReason: "library_replace_failed",
        },
      }).catch(() => {});
    }
    if (billing.totalCredits > 0 && debitTransactionId) {
      await refundCredits({
        userId: actor.userId,
        amount: billing.totalCredits,
        description: `Refund for failed library replace: ${fileName}`,
        originalTransactionId: debitTransactionId,
        sourceType: "indexing",
        metadata: {
          service: "library.replace_file",
          libraryItemId: existing.id,
          billingCategory: billing.category,
        },
      }).catch((refundError) => {
        console.error(
          `[library.replaceFile] Failed to refund credits for item ${existing.id}:`,
          refundError instanceof Error ? refundError.message : refundError,
        );
      });
    }
    throw err;
  }
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

export async function getLibraryUploadStatuses(
  itemIds: number[],
  actor: LibraryActor,
  dbClient?: DbClient,
): Promise<LibraryUploadStatusDto[]> {
  const db = await resolveDb(dbClient);
  const actorTenantId = normalizeLibraryTenantId(actor.tenantId);
  const normalizedIds = Array.from(new Set(itemIds.filter((value) => Number.isFinite(value) && value > 0)));

  if (normalizedIds.length === 0) {
    return [];
  }

  const rows = await db
    .select()
    .from(libraryItems)
    .where(
      and(
        eq(libraryItems.tenantId, actorTenantId),
        inArray(libraryItems.id, normalizedIds),
        isNull(libraryItems.deletedAt),
      ),
    );

  const results: LibraryUploadStatusDto[] = [];
  for (const row of rows) {
    const permission = await getUserPermissionLevel(db, row.id, actor);
    if (!canReadLibraryItem(row, actor, permission)) {
      continue;
    }

    const latestJob = await db
      .select()
      .from(libraryIndexJobs)
      .where(eq(libraryIndexJobs.libraryItemId, row.id))
      .orderBy(desc(libraryIndexJobs.createdAt))
      .limit(1);

    const metadata = normalizeLibraryMetadata(row.metadata ?? {});
    const pipeline = getUploadPipelineMetadata(metadata);
    const itemDto = toLibraryItemDto(row);
    const indexJob = latestJob[0] ?? null;
    const parserWarnings = Array.isArray(pipeline.warnings)
      ? pipeline.warnings.filter((value): value is string => typeof value === "string" && value.trim().length > 0)
      : [];

    const stage = row.status === "ready"
      ? "ready"
      : row.status === "failed"
        ? "failed"
        : indexJob && ["pending", "processing", "retry_pending"].includes(indexJob.status)
          ? "indexing"
          : (typeof pipeline.stage === "string" ? pipeline.stage : "uploaded");

    const searchQuality = metadata.search_quality === "full_text" ? "full_text" : "metadata_only";

    results.push({
      itemId: row.id,
      item: itemDto,
      stage: stage as LibraryUploadPipelineStage,
      stageMessage: typeof pipeline.stageMessage === "string"
        ? pipeline.stageMessage
        : row.status === "ready"
          ? "Ready for search."
          : row.status === "failed"
            ? "Upload processing failed."
            : indexJob
              ? "File uploaded. Indexing is still in progress."
              : "File uploaded and waiting for processing.",
      parserJobId: typeof pipeline.parserJobId === "string" ? pipeline.parserJobId : null,
      parserStatus: typeof pipeline.parserStatus === "string" ? pipeline.parserStatus : null,
      indexJobId: indexJob?.id ?? null,
      indexJobStatus: indexJob?.status ?? null,
      checksumSha256: typeof pipeline.checksumSha256 === "string"
        ? pipeline.checksumSha256
        : typeof metadata.content_checksum_sha256 === "string"
          ? metadata.content_checksum_sha256
          : null,
      extractor: typeof pipeline.extractor === "string"
        ? pipeline.extractor
        : typeof metadata.extraction_method === "string"
          ? metadata.extraction_method
          : null,
      searchQuality,
      parseError: typeof pipeline.parseError === "string"
        ? pipeline.parseError
        : typeof metadata.parse_error === "string"
          ? metadata.parse_error
          : null,
      warnings: parserWarnings,
      duplicateOfItemId: typeof metadata.duplicate_of_item_id === "number" ? metadata.duplicate_of_item_id : null,
      readyForSearch: row.status === "ready",
      updatedAt: typeof pipeline.updatedAt === "string" ? pipeline.updatedAt : row.updatedAt.toISOString(),
    });
  }

  results.sort((a, b) => normalizedIds.indexOf(a.itemId) - normalizedIds.indexOf(b.itemId));
  return results;
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

  const updatedFieldKeys = Object.keys(input);
  await safeEnqueueLibraryIndexJob(
    {
      libraryItemId: updated[0].id,
      tenantId: actorTenantId,
      jobType: "update_index",
      domain: "library",
      operation: "index",
      source: "library.update",
      sourceMetadata: {
        fields: updatedFieldKeys,
        ...buildLibraryKnowledgeRefreshMetadata({
          reason: "item_update",
          actorUserId: actor.userId,
          fieldKeys: updatedFieldKeys,
        }),
      },
      allowThrottle: true,
    },
    db,
  );

  // Recompute allowed_scopes if visibility changed
  if (input.visibility !== undefined) {
    await recomputeAndPropagateScopes(itemId, actorTenantId, db);
  }

  return toLibraryItemDto(updated[0]);
}

function isPresentationTempUploadMetadata(
  metadata: unknown,
  expectedDeckId: number,
): boolean {
  if (!metadata || typeof metadata !== "object") {
    return false;
  }
  const source = metadata as Record<string, unknown>;
  if (source.presentation_upload !== true) {
    return false;
  }
  const deckId = Number(source.presentation_deck_id);
  return Number.isFinite(deckId) && deckId === expectedDeckId;
}

async function softDeleteDeckScopedPresentationUploads(
  presentationItemId: number,
  actor: LibraryActor,
  db: DbClient,
): Promise<void> {
  const actorTenantId = normalizeLibraryTenantId(actor.tenantId);
  const deckRows = await db
    .select({ id: presentationDecks.id })
    .from(presentationDecks)
    .where(
      and(
        eq(presentationDecks.libraryItemId, presentationItemId),
        eq(presentationDecks.tenantId, actorTenantId),
      ),
    )
    .limit(1);

  const deck = deckRows[0];
  if (!deck) {
    return;
  }

  const linkedRows = await db
    .select({
      id: libraryItems.id,
      metadata: libraryItems.metadata,
    })
    .from(presentationAssetLinks)
    .innerJoin(libraryItems, eq(libraryItems.id, presentationAssetLinks.libraryItemId))
    .where(
      and(
        eq(presentationAssetLinks.deckId, deck.id),
        eq(presentationAssetLinks.tenantId, actorTenantId),
        eq(libraryItems.tenantId, actorTenantId),
        isNull(libraryItems.deletedAt),
      ),
    );

  const now = new Date();
  const uploadItemIds = linkedRows
    .filter((row) => isPresentationTempUploadMetadata(row.metadata, deck.id))
    .map((row) => row.id);

  if (!uploadItemIds.length) {
    return;
  }

  await db
    .update(libraryItems)
    .set({
      deletedAt: now,
      deletedBy: actor.userId,
      status: "archived",
      updatedAt: now,
    })
    .where(
      and(
        inArray(libraryItems.id, uploadItemIds),
        eq(libraryItems.tenantId, actorTenantId),
      ),
    );

  for (const uploadItemId of uploadItemIds) {
    await safeEnqueueLibraryIndexJob(
      {
        libraryItemId: uploadItemId,
        tenantId: actorTenantId,
        jobType: "delete_index",
        domain: "library",
        operation: "delete",
        source: "library.delete.presentation_upload",
        allowThrottle: false,
      },
      db,
    );
  }
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

  if (!deleted[0]?.id) {
    return false;
  }

  await safeEnqueueLibraryIndexJob(
    {
      libraryItemId: itemId,
      tenantId: actorTenantId,
      jobType: "delete_index",
      domain: "library",
      operation: "delete",
      source: "library.delete",
      sourceMetadata: {
        ...buildLibraryKnowledgeRefreshMetadata({
          reason: "item_update",
          actorUserId: actor.userId,
          fieldKeys: ["deletedAt", "status"],
        }),
      },
      allowThrottle: false,
    },
    db,
  );

  if (existing.itemType === "presentation") {
    await softDeleteDeckScopedPresentationUploads(itemId, actor, db);
  }

  return true;
}

// ── Scope Propagation ──
// Permission levels that grant read access (used for scope computation)
const SCOPE_READ_LEVELS = new Set(["read", "write", "delete", "owner"]);

/**
 * Recompute allowed_scopes for a library item from its permissions,
 * visibility, and owner. Then propagate to all chunks.
 *
 * Steps:
 * 1. Fetch the item (owner_user_id, visibility, tenant_id)
 * 2. Fetch all non-expired library_permissions for the item
 * 3. Build the allowed_scopes array
 * 4. UPDATE libraryItems SET allowedScopes = newScopes
 * 5. UPDATE libraryChunks SET allowedScopes = newScopes
 * 6. Fire-and-forget call to Python backend for vector store propagation
 */
async function recomputeAndPropagateScopes(
  itemId: number,
  tenantId: string,
  dbClient?: DbClient,
): Promise<void> {
  const db = await resolveDb(dbClient);

  // 1. Fetch the item
  const items = await db
    .select({
      id: libraryItems.id,
      ownerUserId: libraryItems.ownerUserId,
      visibility: libraryItems.visibility,
      tenantId: libraryItems.tenantId,
    })
    .from(libraryItems)
    .where(and(eq(libraryItems.id, itemId), isNull(libraryItems.deletedAt)))
    .limit(1);

  const item = items[0];
  if (!item) return;

  // 2. Fetch all non-expired permissions
  const perms = await db
    .select({
      subjectType: libraryPermissions.subjectType,
      subjectId: libraryPermissions.subjectId,
      permissionLevel: libraryPermissions.permissionLevel,
    })
    .from(libraryPermissions)
    .where(
      and(
        eq(libraryPermissions.libraryItemId, itemId),
        or(
          isNull(libraryPermissions.expiresAt),
          gt(libraryPermissions.expiresAt, new Date()),
        ),
      ),
    );

  // 3. Build allowed_scopes
  const scopes = new Set<string>();
  scopes.add(`u:${item.ownerUserId}`);

  for (const perm of perms) {
    if (!SCOPE_READ_LEVELS.has(perm.permissionLevel)) continue;

    if (perm.subjectType === "user") {
      scopes.add(`u:${perm.subjectId}`);
    } else if (perm.subjectType === "group") {
      scopes.add(`g:${perm.subjectId}`);
    } else if (perm.subjectType === "tenant_role") {
      scopes.add(`t:${perm.subjectId}`);
    }
  }

  if (item.visibility === "public") {
    scopes.add("p:global");
  } else if (item.visibility === "team") {
    scopes.add(`t:${item.tenantId}`);
  }

  const scopeList = Array.from(scopes).sort();

  // 4. Update item's allowedScopes
  await db
    .update(libraryItems)
    .set({ allowedScopes: scopeList })
    .where(eq(libraryItems.id, itemId));

  // 5. Update all chunks' allowedScopes (tenant-filtered for defense-in-depth)
  await db
    .update(libraryChunks)
    .set({ allowedScopes: scopeList })
    .where(
      and(
        eq(libraryChunks.libraryItemId, itemId),
        eq(libraryChunks.tenantId, tenantId),
      ),
    );

  // 6. Fire-and-forget: call Python backend for vector store propagation
  const runtime = await getAppRuntimeConfig();
  const pyBackendUrl = runtime.pythonBackendUrl;
  const proxyToken = runtime.proxyToken;
  if (proxyToken) {
    fetch(`${pyBackendUrl}/api/internal/library/propagate-scopes`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-proxy-token": proxyToken,
      },
      body: JSON.stringify({
        item_id: itemId,
        tenant_id: tenantId,
        new_allowed_scopes: scopeList,
      }),
    }).catch((err: unknown) => {
      console.warn("[recomputeAndPropagateScopes] Python propagation failed:", err);
    });
  }
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

  if (isPrivateVaultLibraryItem(existing)) {
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

  // Recompute allowed_scopes after sharing
  await recomputeAndPropagateScopes(input.itemId, actorTenantId, db);

  await safeEnqueueLibraryIndexJob(
    {
      libraryItemId: input.itemId,
      tenantId: actorTenantId,
      jobType: "update_index",
      domain: "library",
      operation: "index",
      source: "library.share",
      sourceMetadata: {
        shares: {
          subjectType: input.subjectType,
          subjectId: input.subjectId,
          permissionLevel: input.permissionLevel,
        },
        ...buildLibraryKnowledgeRefreshMetadata({
          reason: "permission_change",
          actorUserId: actor.userId,
          fieldKeys: ["shares"],
        }),
      },
      allowThrottle: true,
    },
    db,
  );

  return true;
}

export async function getPublicShareLinkState(
  input: PublicShareLinkInput,
  actor: LibraryActor,
  dbClient?: DbClient,
): Promise<PublicShareLinkState> {
  const db = await resolveDb(dbClient);
  const actorTenantId = normalizeLibraryTenantId(actor.tenantId);
  const item = await getLibraryItemRowById(db, input.itemId, actorTenantId);

  if (!item) {
    return { canManage: false, link: null };
  }

  if (isPrivateVaultLibraryItem(item)) {
    return { canManage: false, link: null };
  }

  if (getPublicShareOwnerUserId(item) === actor.userId) {
    const active = await getActivePublicShareLinkRow(db, item.id, actorTenantId);
    return {
      canManage: true,
      link: active ? serializePublicShareLink(active) : null,
    };
  }

  const permissionLevel = await getUserPermissionLevel(db, item.id, actor);
  if (!canManageLibraryItem(item, actor, permissionLevel)) {
    return { canManage: false, link: null };
  }

  const active = await getActivePublicShareLinkRow(db, item.id, actorTenantId);
  return {
    canManage: true,
    link: active ? serializePublicShareLink(active) : null,
  };
}

export async function createPublicShareLink(
  input: PublicShareLinkInput,
  actor: LibraryActor,
  dbClient?: DbClient,
): Promise<PublicShareLinkDto> {
  const db = await resolveDb(dbClient);
  const actorTenantId = normalizeLibraryTenantId(actor.tenantId);
  const item = await getLibraryItemRowById(db, input.itemId, actorTenantId);

  if (!item) {
    throw new TRPCError({
      code: "NOT_FOUND",
      message: "Library item not found",
    });
  }

  await assertCanManagePublicShare(item, actor, db);

  const active = await getActivePublicShareLinkRow(db, item.id, actorTenantId);
  if (active) {
    return serializePublicShareLink(active);
  }

  const token = crypto.randomBytes(PUBLIC_SHARE_TOKEN_BYTES).toString("base64url");
  const now = new Date();
  const expiresAt = new Date(now);
  expiresAt.setDate(expiresAt.getDate() + PUBLIC_SHARE_DEFAULT_TTL_DAYS);

  const [row] = await db
    .insert(libraryPublicShareLinks)
    .values({
      tenantId: actorTenantId,
      libraryItemId: item.id,
      tokenHash: hashPublicShareToken(token),
      tokenEncrypted: encryptSecret(token),
      createdByUserId: actor.userId,
      expiresAt,
      revokedAt: null,
      createdAt: now,
      updatedAt: now,
    })
    .returning();

  if (!row) {
    throw new Error("Failed to create public share link");
  }

  return serializePublicShareLink(row);
}

export async function revokePublicShareLink(
  input: PublicShareLinkInput,
  actor: LibraryActor,
  dbClient?: DbClient,
): Promise<PublicShareLinkDto | null> {
  const db = await resolveDb(dbClient);
  const actorTenantId = normalizeLibraryTenantId(actor.tenantId);
  const item = await getLibraryItemRowById(db, input.itemId, actorTenantId);

  if (!item) {
    throw new TRPCError({
      code: "NOT_FOUND",
      message: "Library item not found",
    });
  }

  await assertCanManagePublicShare(item, actor, db);

  const active = await getActivePublicShareLinkRow(db, item.id, actorTenantId);
  if (!active) {
    return null;
  }

  const now = new Date();
  const [row] = await db
    .update(libraryPublicShareLinks)
    .set({
      revokedAt: now,
      updatedAt: now,
    })
    .where(eq(libraryPublicShareLinks.id, active.id))
    .returning();

  return row ? serializePublicShareLink(row) : null;
}

function isMarkdownLikeLibraryItemForPublicShare(item: Pick<LibraryItemRow, "itemType" | "sourceUrl" | "metadata">): boolean {
  const metadata = normalizeLibraryMetadata(item.metadata as Record<string, unknown>);
  const metadataExtension = typeof metadata.extension === "string" ? metadata.extension.toLowerCase().replace(/^\./, "") : "";
  const sourceUrl = item.sourceUrl || "";
  const extFromUrl = sourceUrl ? sourceUrl.split("?")[0].split(".").pop()?.toLowerCase() || "" : "";
  const ext = metadataExtension || extFromUrl || item.itemType.toLowerCase();
  return ext === "md" || ext === "markdown" || item.itemType.toLowerCase() === "markdown";
}

export async function resolvePublicShareLink(
  token: string,
  dbClient?: DbClient,
): Promise<PublicShareDocumentResult | null> {
  const db = await resolveDb(dbClient);
  const normalizedToken = token.trim();
  if (!normalizedToken) {
    return null;
  }

  const tokenHash = hashPublicShareToken(normalizedToken);
  const [linkRow] = await db
    .select()
    .from(libraryPublicShareLinks)
    .where(eq(libraryPublicShareLinks.tokenHash, tokenHash))
    .limit(1);

  if (!linkRow || !isPublicShareLinkActive(linkRow)) {
    return null;
  }

  const item = await getLibraryItemRowById(db, linkRow.libraryItemId, linkRow.tenantId);
  if (!item || isPrivateVaultLibraryItem(item)) {
    return null;
  }

  const downloadUrl = await resolvePublicShareDownloadUrl(item);
  const markdownContent = isMarkdownLikeLibraryItemForPublicShare(item)
    ? (await getLibraryMarkdownContent(item.id, {
        userId: item.ownerUserId,
        tenantId: item.tenantId,
        role: "user",
      }, db))?.content ?? null
    : null;

  return {
    item: {
      id: item.id,
      tenantId: item.tenantId,
      ownerUserId: item.ownerUserId,
      itemType: item.itemType,
      source: item.source,
      title: item.title,
      description: item.description,
      status: item.status,
      visibility: item.visibility,
      metadata: normalizeLibraryMetadata(item.metadata as Record<string, unknown>),
      sourceUrl: downloadUrl,
      thumbnailUrl: item.thumbnailUrl,
      createdAt: item.createdAt,
      updatedAt: item.updatedAt,
    },
    markdownContent,
    downloadUrl,
  };
}

export async function enqueueLibraryIndexJob(
  input: {
    libraryItemId: number;
    tenantId: LibraryTenantId;
    projectId?: string | null;
    jobType?: string;
    domain?: LibraryIndexDomain;
    operation?: LibraryIndexOperation;
    source?: string;
    sourceMetadata?: Record<string, unknown>;
    allowThrottle?: boolean;
  },
  dbClient?: DbClient,
): Promise<LibraryEnqueueResult> {
  const db = await resolveDb(dbClient);
  const jobType = input.jobType ?? "initial_index";
  const tenantId = normalizeLibraryTenantId(input.tenantId);
  const resolvedProjectId = input.projectId ?? await resolveLibraryItemProjectId(db, input.libraryItemId, tenantId);
  const payload = buildLibraryIndexJobPayload({
    domain: input.domain || "library",
    operation: input.operation || "index",
    tenantId,
    entityId: `library:${input.libraryItemId}`,
    source: input.source || `library.${jobType}`,
    sourceMetadata: {
      ...(input.sourceMetadata ?? {}),
      projectId: resolvedProjectId ?? undefined,
    },
  });

  if (
    input.allowThrottle &&
    shouldThrottleLibraryEnqueue(getLibraryQueueBackpressureState())
  ) {
    return {
      jobId: 0,
      status: "throttled",
      created: false,
      payloadVersion: payload.version,
      dedupeKey: payload.dedupeKey,
      throttled: true,
    };
  }

  const now = new Date();
  const persistence = buildLibraryIndexJobPersistence(payload, now);

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
    await db
      .update(libraryIndexJobs)
      .set({
        ...persistence,
        updatedAt: now,
      })
      .where(eq(libraryIndexJobs.id, existing[0].id));

    await maybeDispatchLibraryKnowledgeRefreshWorker({
      jobId: existing[0].id,
      libraryItemId: input.libraryItemId,
      tenantId,
      knowledgeRefreshStatus: (persistence.knowledgeRefreshStatus ?? null) as
        | LibraryKnowledgeRefreshExecutionStatus
        | null,
    });

    return {
      jobId: existing[0].id,
      status: existing[0].status,
      created: false,
      payloadVersion: payload.version,
      dedupeKey: payload.dedupeKey,
    };
  }

  const inserted = await db
    .insert(libraryIndexJobs)
    .values({
      tenantId,
      libraryItemId: input.libraryItemId,
      projectId: resolvedProjectId ?? null,
      jobType,
      ...persistence,
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

  await maybeDispatchLibraryKnowledgeRefreshWorker({
    jobId: created.id,
    libraryItemId: input.libraryItemId,
    tenantId,
    knowledgeRefreshStatus: (persistence.knowledgeRefreshStatus ?? null) as
      | LibraryKnowledgeRefreshExecutionStatus
      | null,
  });

  return {
    jobId: created.id,
    status: created.status,
    created: true,
    payloadVersion: payload.version,
    dedupeKey: payload.dedupeKey,
  };
}

export async function safeEnqueueLibraryIndexJob(
  input: Parameters<typeof enqueueLibraryIndexJob>[0],
  dbClient?: DbClient,
): Promise<LibraryEnqueueResult> {
  try {
    return await enqueueLibraryIndexJob(input, dbClient);
  } catch (error) {
    const tenantId = normalizeLibraryTenantId(input.tenantId);
    const payload = buildLibraryIndexJobPayload({
      domain: input.domain || "library",
      operation: input.operation || "index",
      tenantId,
      entityId: `library:${input.libraryItemId}`,
      source: input.source || `library.${input.jobType || "initial_index"}`,
      sourceMetadata: input.sourceMetadata,
    });
    return {
      jobId: 0,
      status: "enqueue_error",
      created: false,
      payloadVersion: payload.version,
      dedupeKey: payload.dedupeKey,
      error: error instanceof Error ? error.message : String(error),
    };
  }
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
  permissionInfo: {
    hasDirectShare: boolean;
    hasGroupShare: boolean;
  },
): boolean {
  if (scope === "all") return true;
  if (scope === "my_library") return accessSource === "owner";
  if (scope === "private_vault") return accessSource === "owner";
  // Shared-with-me should include only explicit direct user shares.
  if (scope === "shared_with_me") return permissionInfo.hasDirectShare;
  // Shared-groups should include only explicit group shares from other users.
  if (scope === "shared_groups") return permissionInfo.hasGroupShare && accessSource !== "owner";
  return true;
}

function itemMatchesDocumentFilters(
  item: LibraryItemRow,
  filters?: LibraryDocumentFilters,
): boolean {
  if (!filters) return true;

  if (filters.itemType && item.itemType !== filters.itemType) return false;
  if (filters.ownerUserId !== undefined && item.ownerUserId !== filters.ownerUserId) return false;
  if (filters.projectId !== undefined && item.projectId !== filters.projectId) return false;
  if (filters.status && item.status !== filters.status) return false;
  if (filters.fromDate && item.createdAt < filters.fromDate) return false;
  if (filters.toDate && item.createdAt > filters.toDate) return false;
  const recentCutoff = getRecentCutoffDate(filters.recentDays);
  if (recentCutoff && getLibraryItemLastActivityAt(item) < recentCutoff) return false;
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

function matchesPrivateVaultScope(item: LibraryItemRow, scope: LibraryDocumentScope): boolean {
  const isVaultItem = isPrivateVaultLibraryItem(item);
  if (scope === "private_vault") {
    return isVaultItem;
  }
  return !isVaultItem;
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
  const limit = Math.min(Math.max(input.limit ?? 30, 1), 50);
  const offset = Math.max(input.offset ?? 0, 0);
  const query = (input.query ?? "").trim();

  // Get user's groups (cached in groupsService, 1-min TTL)
  const userGroupsList = await getUserGroups(actor.userId, actorTenantId);
  const groupIds = userGroupsList.map(g => String(g.id));
  const groupIdNums = userGroupsList.map(g => g.id);

  // For my_library scope, apply folder-level filtering (folderId: null = root, number = folder children)
  const applyFolderFilter = (input.scope === "my_library" || input.scope === undefined || input.scope === "all")
    && "folderId" in input;
  const folderCondition = applyFolderFilter
    ? (input.folderId == null ? isNull(libraryItems.parentId) : eq(libraryItems.parentId, input.folderId))
    : undefined;

  const itemRows = await db
    .select()
    .from(libraryItems)
    .where(and(
      eq(libraryItems.tenantId, actorTenantId),
      isNull(libraryItems.deletedAt),
      folderCondition,
    ))
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

  const afterFilters = itemRows.filter((item) => itemMatchesDocumentFilters(item, input.filters));
  const afterQuery = afterFilters.filter((item) => itemMatchesDocumentQuery(item, query));
  const scopedItems = afterQuery.filter((item) => matchesPrivateVaultScope(item, scope));

  const visible = scopedItems.reduce<LibraryDocumentListItem[]>((acc, item) => {
      const permissionInfo = getPermissionLevelForItem(permissionRows, item.id, actor, groupIdNums);
      const canRead = canReadLibraryItem(item, actor, permissionInfo.effectivePermissionLevel);
      if (!canRead) {
        return acc;
      }

      const accessSource = getDocumentAccessSource(item, actor, permissionInfo);
      if (!matchesDocumentScope(scope, accessSource, {
        hasDirectShare: permissionInfo.hasDirectShare,
        hasGroupShare: permissionInfo.hasGroupShare,
      })) {
        return acc;
      }

      const metadata = normalizeLibraryMetadata(item.metadata as Record<string, unknown>);
      acc.push({
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
        parent_id: item.parentId ?? null,
        metadata,
        access_source: accessSource,
        permission_level: item.ownerUserId === actor.userId
          ? "owner"
          : permissionInfo.effectivePermissionLevel ?? "read",
        shared_out_count: 0,
        has_shared_out: false as boolean,
        created_at: item.createdAt.toISOString(),
        updated_at: item.updatedAt.toISOString(),
      });
      return acc;
    }, []);

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

  if (paged.length > 0) {
    const pagedItemIds = paged.map((item) => item.id);
    const ownerUserIdByItemId = new Map<number, number>(
      paged.map((item) => [item.id, item.owner_user_id]),
    );
    const activeShareRows = await db
      .select({
        libraryItemId: libraryPermissions.libraryItemId,
        subjectType: libraryPermissions.subjectType,
        subjectId: libraryPermissions.subjectId,
        permissionLevel: libraryPermissions.permissionLevel,
      })
      .from(libraryPermissions)
      .where(
        and(
          eq(libraryPermissions.tenantId, actorTenantId),
          inArray(libraryPermissions.libraryItemId, pagedItemIds),
          or(
            eq(libraryPermissions.subjectType, "user"),
            eq(libraryPermissions.subjectType, "group"),
          ),
          or(isNull(libraryPermissions.expiresAt), gt(libraryPermissions.expiresAt, new Date())),
        ),
      );

    const shareCountByItemId = new Map<number, number>();
    for (const row of activeShareRows) {
      const itemId = Number(row.libraryItemId);
      if (row.permissionLevel === "owner") {
        continue;
      }
      const ownerUserId = ownerUserIdByItemId.get(itemId);
      if (
        row.subjectType === "user"
        && ownerUserId !== undefined
        && Number(row.subjectId) === ownerUserId
      ) {
        continue;
      }
      shareCountByItemId.set(itemId, (shareCountByItemId.get(itemId) ?? 0) + 1);
    }

    for (const item of paged) {
      const explicitShareCount = shareCountByItemId.get(item.id) ?? 0;
      item.shared_out_count = explicitShareCount;
      item.has_shared_out = explicitShareCount > 0;
    }
  }

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

  // Read the markdown_source chunk specifically — NOT indexed text chunks.
  // The indexer writes text chunks starting at chunk_index 0 when no
  // markdown_source exists, which would return metadata-derived text instead
  // of the actual user-authored markdown content.
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
        eq(libraryChunks.contentType, "markdown_source"),
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
    snapshotObjectKey?: string;
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
  // Skip dedup for file snapshots since different files can have same metadata
  if (input.contentType !== "file_snapshot") {
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
      snapshotObjectKey: input.snapshotObjectKey ?? null,
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

  // Save current content as version before overwriting.
  // Filter by contentType="markdown_source" (not chunkIndex=0) so we don't
  // accidentally capture a text/embedding chunk if the indexer ran concurrently.
  const currentChunk = await db
    .select()
    .from(libraryChunks)
    .where(
      and(
        eq(libraryChunks.libraryItemId, existing.id),
        eq(libraryChunks.contentType, "markdown_source"),
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
      vectorIndexName: resolveLibraryVectorIndexName(),
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
        vectorIndexName: resolveLibraryVectorIndexName(),
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

  const indexJob = await safeEnqueueLibraryIndexJob(
    {
      libraryItemId: existing.id,
      tenantId: actorTenantId,
      jobType: "markdown_update",
      domain: "library",
      operation: "index",
      source: "library.markdown_update",
      sourceMetadata: {
        ingestion: "document_management_editor",
        ...buildLibraryKnowledgeRefreshMetadata({
          reason: input.knowledgeRefreshReason ?? "markdown_save",
          actorUserId: actor.userId,
          fieldKeys: ["content"],
        }),
      },
      allowThrottle: true,
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
    .where(
      and(
        eq(libraryContentVersions.libraryItemId, itemId),
        eq(libraryContentVersions.tenantId, actorTenantId),
      ),
    )
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

export async function getVersionSnapshotDownloadUrl(
  versionId: number,
  actor: LibraryActor,
  dbClient?: DbClient,
): Promise<{ url: string; fileName: string; fileType: string } | null> {
  const version = await getContentVersionById(versionId, actor, dbClient);
  if (!version) {
    return null;
  }
  if (version.contentType !== "file_snapshot" || !version.snapshotObjectKey) {
    return null;
  }

  let resolved: { key: string; url: string };
  try {
    resolved = await storageGet(version.snapshotObjectKey);
  } catch {
    throw new Error("The archived file could not be found in storage");
  }

  let meta: Record<string, unknown> = {};
  try {
    meta = JSON.parse(version.content);
  } catch {
    // ignore
  }

  return {
    url: resolved.url,
    fileName: (meta.file_name as string) || "download",
    fileType: (meta.file_type as string) || "application/octet-stream",
  };
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

  // Handle file snapshot restore
  if (version.contentType === "file_snapshot" && version.snapshotObjectKey) {
    const oldMetadata = (existing.metadata ?? {}) as Record<string, unknown>;

    // Resolve the snapshot key to a URL — verify the file still exists
    let restoredUrl: { key: string; url: string };
    try {
      restoredUrl = await storageGet(version.snapshotObjectKey);
    } catch {
      throw new Error("The archived file could not be found in storage. It may have been deleted.");
    }

    // Restore file metadata from the version
    let restoredMeta: Record<string, unknown> = {};
    try {
      restoredMeta = JSON.parse(version.content);
    } catch {
      restoredMeta = oldMetadata;
    }

    // Archive current file as a version before restoring (outside tx — same pattern as replaceLibraryFile)
    const currentLinks = await db
      .select()
      .from(libraryLinks)
      .where(
        and(
          eq(libraryLinks.libraryItemId, existing.id),
          eq(libraryLinks.linkType, "upload_key"),
        ),
      )
      .limit(1);

    const currentStorageKey = currentLinks[0]?.linkId ?? null;
    const currentFileType = typeof oldMetadata.file_type === "string"
      ? oldMetadata.file_type
      : "application/octet-stream";
    const currentSnapshotContent = JSON.stringify({
      file_name: oldMetadata.file_name ?? existing.title,
      file_type: currentFileType,
      file_size_bytes: oldMetadata.file_size_bytes ?? 0,
      original_source_url: existing.sourceUrl ?? null,
    });

    await createContentVersion(db, {
      tenantId: actorTenantId,
      libraryItemId: existing.id,
      content: currentSnapshotContent,
      contentType: "file_snapshot",
      createdByUserId: actor.userId,
      changeDescription: `Archived before restoring version ${version.versionNumber}`,
      snapshotObjectKey: currentStorageKey ?? undefined,
    });

    // Item + link updates in a transaction for atomicity
    const updated = await db.transaction(async (tx) => {
      const now = new Date();
      const updatedRows = await tx
        .update(libraryItems)
        .set({
          sourceUrl: restoredUrl.url,
          thumbnailUrl:
            existing.itemType === "image" ? restoredUrl.url : existing.thumbnailUrl,
          status: "indexing",
          metadata: normalizeLibraryMetadata({
            ...oldMetadata,
            file_name: restoredMeta.file_name ?? oldMetadata.file_name,
            file_type: restoredMeta.file_type ?? oldMetadata.file_type,
            file_size_bytes: restoredMeta.file_size_bytes ?? oldMetadata.file_size_bytes,
          }),
          updatedAt: now,
        })
        .where(
          and(
            eq(libraryItems.id, existing.id),
            eq(libraryItems.tenantId, actorTenantId),
          ),
        )
        .returning();

      const txUpdated = updatedRows[0];
      if (!txUpdated) {
        throw new Error("Failed to restore file version");
      }

      // Update or insert library link to point to the restored key
      if (currentLinks[0]) {
        await tx
          .update(libraryLinks)
          .set({ linkId: version.snapshotObjectKey! })
          .where(eq(libraryLinks.id, currentLinks[0].id));
      } else {
        await tx.insert(libraryLinks).values({
          libraryItemId: existing.id,
          linkType: "upload_key",
          linkId: version.snapshotObjectKey!,
          tenantId: actorTenantId,
        });
      }

      return txUpdated;
    });

    // Re-enqueue indexing (outside transaction — job queue insert)
    const indexJob = await safeEnqueueLibraryIndexJob(
      {
        libraryItemId: existing.id,
        tenantId: actorTenantId,
        jobType: "file_replace",
        domain: "library",
        operation: "index",
        source: "library.restore_file_version",
        sourceMetadata: {
          ingestion: "file_version_restore",
          restoredVersionNumber: version.versionNumber,
          ...buildLibraryKnowledgeRefreshMetadata({
            reason: "restore",
            actorUserId: actor.userId,
            fieldKeys: ["sourceUrl", "metadata"],
          }),
        },
        allowThrottle: true,
      },
      db,
    );

    return {
      item: toLibraryItemDto(updated),
      indexJob,
    };
  }

  // Default: markdown version restore
  return saveLibraryMarkdown(
    {
      itemId: version.libraryItemId,
      content: version.content,
      changeDescription: `Restored from version ${version.versionNumber}`,
      knowledgeRefreshReason: "restore",
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

  const limit = Math.min(Math.max(input.limit ?? 20, 1), 50);
  const offset = Math.max(input.offset ?? 0, 0);
  const query = (input.query ?? "").trim();
  const queryTokens = tokenize(query);
  const scope = input.scope ?? "all";

  const applyFolderFilter =
    (scope === "my_library" || scope === "all")
    && "folderId" in input;
  const folderCondition = applyFolderFilter
    ? (input.folderId == null ? isNull(libraryItems.parentId) : eq(libraryItems.parentId, input.folderId))
    : undefined;

  const itemRows = await db
    .select()
    .from(libraryItems)
    .where(
      and(
        eq(libraryItems.tenantId, actorTenantId),
        isNull(libraryItems.deletedAt),
        folderCondition,
      ),
    )
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

  const providerConfig = await getEffectiveVectorProviderConfig({
    tenantId: actorTenantId,
  });
  const resolvedProvider = resolveVectorProvider("search", providerConfig);

  // Get user's groups for group permission filtering
  const userGroups = await getUserGroups(actor.userId, actorTenantId);
  const groupIds = userGroups.map(g => String(g.id));

  const permissionRows = await db
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
    );

  const groupIdNums = userGroups.map(g => g.id);
  const scopedItems = filteredItems.filter((item) => matchesPrivateVaultScope(item, scope));

  const visibleEntries = scopedItems.reduce<Array<{
    item: LibraryItemRow;
    accessSource: LibraryDocumentAccessSource;
    permissionInfo: ReturnType<typeof getPermissionLevelForItem>;
  }>>((acc, item) => {
    const permissionInfo = getPermissionLevelForItem(permissionRows, item.id, actor, groupIdNums);
    if (!canReadLibraryItem(item, actor, permissionInfo.effectivePermissionLevel)) {
      return acc;
    }

    const accessSource = getDocumentAccessSource(item, actor, permissionInfo);
    if (
      !matchesDocumentScope(scope, accessSource, {
        hasDirectShare: permissionInfo.hasDirectShare,
        hasGroupShare: permissionInfo.hasGroupShare,
      })
    ) {
      return acc;
    }

    acc.push({
      item,
      accessSource,
      permissionInfo,
    });
    return acc;
  }, []);

  const visibleItemIds = visibleEntries.map((entry) => entry.item.id);
  const pgvectorCandidateIds = visibleItemIds.slice(0, LIBRARY_PGVECTOR_CANDIDATE_LIMIT);
  const shouldTryNativePgvector =
    query.length > 0 &&
    resolvedProvider.provider === "pgvector" &&
    Boolean((await getAppRuntimeConfig()).proxyToken);

  let pgvectorScores: Map<number, number> | null = null;
  let chunkRows: Array<{ libraryItemId: number; content: string; vectorRefId: string | null }> = [];

  if (query.length > 0) {
    if (shouldTryNativePgvector) {
      pgvectorScores = await fetchPgvectorLibraryScores({
        tenantId: actorTenantId,
        query,
        itemIds: pgvectorCandidateIds,
      });
    }

    if (!shouldTryNativePgvector || pgvectorScores === null) {
      const chunkCandidateIds = shouldTryNativePgvector ? pgvectorCandidateIds : visibleItemIds;
      if (chunkCandidateIds.length > 0) {
        chunkRows = await db
          .select({
            libraryItemId: libraryChunks.libraryItemId,
            content: libraryChunks.content,
            vectorRefId: libraryChunks.vectorRefId,
          })
          .from(libraryChunks)
          .where(
            and(
              eq(libraryChunks.tenantId, actorTenantId),
              inArray(libraryChunks.libraryItemId, chunkCandidateIds),
            ),
          );
      }
    }
  }

  const chunksByItem = new Map<number, Array<{ content: string; vectorRefId: string | null }>>();
  for (const chunk of chunkRows) {
    const list = chunksByItem.get(chunk.libraryItemId) ?? [];
    list.push({
      content: chunk.content,
      vectorRefId: chunk.vectorRefId,
    });
    chunksByItem.set(chunk.libraryItemId, list);
  }

  const visibleScored = visibleEntries
    .map((entry) => {
      const item = entry.item;
      const metadata = normalizeLibraryMetadata(item.metadata as Record<string, unknown>);
      const chunks = chunksByItem.get(item.id) ?? [];

      const itemText = [
        item.title,
        item.description ?? "",
        JSON.stringify(metadata),
      ].join(" ");

      const keywordScore = query ? computeTokenOverlapScore(queryTokens, itemText) : 0;
      const fallbackVectorScore = query
        ? chunks
            .filter((chunk) => Boolean(chunk.vectorRefId))
            .reduce((maxScore, chunk) => {
              const score = computeTokenOverlapScore(queryTokens, chunk.content);
              return score > maxScore ? score : maxScore;
            }, 0)
        : 0;
      const vectorScore = query
        ? pgvectorScores
          ? (pgvectorScores.get(item.id) ?? 0)
          : fallbackVectorScore
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
        accessSource: entry.accessSource,
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
    description: entry.item.description ?? null,
    source_url: entry.item.sourceUrl,
    thumbnail_url: entry.item.thumbnailUrl,
    status: entry.item.status,
    source: entry.item.source,
    provider_name: entry.providerName,
    model_name: entry.modelName,
    owner_user_id: entry.item.ownerUserId,
    parent_id: entry.item.parentId ?? null,
    metadata: normalizeLibraryMetadata(entry.item.metadata as Record<string, unknown>),
    access_source: entry.accessSource,
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

  // Recompute allowed_scopes after unsharing (immediate revocation)
  await recomputeAndPropagateScopes(input.itemId, actorTenantId, db);

  await safeEnqueueLibraryIndexJob(
    {
      libraryItemId: input.itemId,
      tenantId: actorTenantId,
      jobType: "update_index",
      domain: "library",
      operation: "index",
      source: "library.unshare",
      sourceMetadata: {
        shares: {
          subjectType: input.subjectType,
          subjectId: input.subjectId,
          action: "remove",
        },
        ...buildLibraryKnowledgeRefreshMetadata({
          reason: "permission_change",
          actorUserId: actor.userId,
          fieldKeys: ["shares"],
        }),
      },
      allowThrottle: true,
    },
    db,
  );

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

  // Recompute allowed_scopes after permission level change
  await recomputeAndPropagateScopes(input.itemId, actorTenantId, db);

  await safeEnqueueLibraryIndexJob(
    {
      libraryItemId: input.itemId,
      tenantId: actorTenantId,
      jobType: "update_index",
      domain: "library",
      operation: "index",
      source: "library.update_share_permission",
      sourceMetadata: {
        shares: {
          subjectType: input.subjectType,
          subjectId: input.subjectId,
          permissionLevel: input.permissionLevel,
        },
        ...buildLibraryKnowledgeRefreshMetadata({
          reason: "permission_change",
          actorUserId: actor.userId,
          fieldKeys: ["shares"],
        }),
      },
      allowThrottle: true,
    },
    db,
  );

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

  const restored = await db.transaction(async (tx) => {
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

  await safeEnqueueLibraryIndexJob(
    {
      libraryItemId: itemId,
      tenantId: actorTenantId,
      jobType: "update_index",
      domain: "library",
      operation: "index",
      source: "library.restore_from_trash",
      sourceMetadata: {
        ...buildLibraryKnowledgeRefreshMetadata({
          reason: "restore",
          actorUserId: actor.userId,
          fieldKeys: ["deletedAt", "status"],
        }),
      },
      allowThrottle: true,
    },
    db,
  );

  return restored;
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

  // Collect cleanup targets before cascade delete removes them
  const [uploadKeyRows, vectorCleanupTargets] = await Promise.all([
    db
      .select({ linkId: libraryLinks.linkId })
      .from(libraryLinks)
      .where(
        and(
          eq(libraryLinks.libraryItemId, itemId),
          eq(libraryLinks.linkType, "upload_key"),
        ),
      ),
    collectLibraryVectorCleanupTargets(itemId, actorTenantId, db).catch(() => ({
      vectorRefIds: [],
      indexNames: [],
    })),
  ]);

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

  try {
    await cleanupLibraryVectorArtifacts({
      tenantId: actorTenantId,
      vectorRefIds: vectorCleanupTargets.vectorRefIds,
      indexNames: vectorCleanupTargets.indexNames,
    });
  } catch (err) {
    console.error(
      `[permanent-delete] Vector cleanup failed for item ${itemId}:`,
      err instanceof Error ? err.message : err,
    );
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

  const vectorCleanupTargets = await collectLibraryVectorCleanupTargets(itemIds, tenantId, db).catch(() => ({
    vectorRefIds: [],
    indexNames: [],
  }));

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

  await cleanupLibraryVectorArtifacts({
    tenantId,
    vectorRefIds: vectorCleanupTargets.vectorRefIds,
    indexNames: vectorCleanupTargets.indexNames,
  }).catch((err) => {
    console.error(
      `[google-drive-cleanup] Vector cleanup failed for tenant ${tenantId}:`,
      err instanceof Error ? err.message : err,
    );
  });

  return { itemsDeleted: itemIds.length, chunksDeleted, linksDeleted };
}

// ─── Folder support ──────────────────────────────────────────────────────────

export interface LibraryFolderAncestor {
  id: number;
  title: string;
}

export async function findOwnedLibraryFolderByName(
  input: { name: string; parentId?: number | null },
  actor: LibraryActor,
  dbClient?: DbClient,
): Promise<LibraryItemDto | null> {
  const db = await resolveDb(dbClient);
  const actorTenantId = normalizeLibraryTenantId(actor.tenantId);
  const normalizedName = input.name.trim();
  if (!normalizedName) {
    throw new Error("Folder name is required");
  }

  const rows = await db
    .select()
    .from(libraryItems)
    .where(
      and(
        eq(libraryItems.tenantId, actorTenantId),
        eq(libraryItems.ownerUserId, actor.userId),
        eq(libraryItems.itemType, "folder"),
        eq(libraryItems.title, normalizedName),
        input.parentId == null ? isNull(libraryItems.parentId) : eq(libraryItems.parentId, input.parentId),
        isNull(libraryItems.deletedAt),
      ),
    )
    .orderBy(libraryItems.id)
    .limit(1);

  if (!rows[0]) {
    return null;
  }

  return toLibraryItemDto(rows[0]);
}

/**
 * Create a folder item (itemType="folder") in the library.
 */
export async function createLibraryFolder(
  input: { name: string; parentId?: number | null },
  actor: LibraryActor,
  dbClient?: DbClient,
): Promise<CreateLibraryItemResult> {
  return createLibraryItem(
    {
      itemType: "folder",
      source: "document_management",
      title: input.name.trim(),
      description: null,
      status: "ready",
      visibility: "private",
      parentId: input.parentId ?? null,
      metadata: { source_type: "folder" },
    },
    actor,
    dbClient,
  );
}

export async function ensureOwnedLibraryFolder(
  input: { name: string; parentId?: number | null },
  actor: LibraryActor,
  dbClient?: DbClient,
): Promise<CreateLibraryItemResult> {
  const existing = await findOwnedLibraryFolderByName(input, actor, dbClient);
  if (existing) {
    return { item: existing, idempotent: true };
  }

  return createLibraryFolder(input, actor, dbClient);
}

/**
 * Returns the number of non-deleted direct children inside a folder.
 */
export async function getLibraryFolderChildCount(
  folderId: number,
  tenantId: LibraryTenantId,
  dbClient?: DbClient,
): Promise<number> {
  const db = await resolveDb(dbClient);
  const actorTenantId = normalizeLibraryTenantId(tenantId);
  const [row] = await db
    .select({ cnt: count(libraryItems.id) })
    .from(libraryItems)
    .where(
      and(
        eq(libraryItems.tenantId, actorTenantId),
        eq(libraryItems.parentId, folderId),
        isNull(libraryItems.deletedAt),
      ),
    );
  return Number(row?.cnt ?? 0);
}

/**
 * Returns the ancestor chain from root to the given folder (for breadcrumb).
 * The folder itself is included as the last element.
 */
export async function getLibraryFolderAncestors(
  folderId: number,
  tenantId: LibraryTenantId,
  dbClient?: DbClient,
): Promise<LibraryFolderAncestor[]> {
  const db = await resolveDb(dbClient);
  const actorTenantId = normalizeLibraryTenantId(tenantId);

  const ancestors: LibraryFolderAncestor[] = [];
  let currentId: number | null = folderId;

  // Walk up the tree (max 20 levels to prevent runaway loops)
  for (let depth = 0; depth < 20 && currentId != null; depth++) {
    const idToFetch: number = currentId;
    const rows: Array<{ id: number; title: string; parentId: number | null }> = await db
      .select({ id: libraryItems.id, title: libraryItems.title, parentId: libraryItems.parentId })
      .from(libraryItems)
      .where(and(eq(libraryItems.id, idToFetch), eq(libraryItems.tenantId, actorTenantId)))
      .limit(1);

    const row = rows[0];
    if (!row) break;
    ancestors.unshift({ id: row.id, title: row.title });
    currentId = row.parentId ?? null;
  }

  return ancestors;
}

/**
 * Batch soft-delete multiple library items.
 * Returns how many were successfully deleted.
 */
export async function batchSoftDeleteLibraryItems(
  itemIds: number[],
  actor: LibraryActor,
  dbClient?: DbClient,
): Promise<number> {
  if (itemIds.length === 0) return 0;
  const db = await resolveDb(dbClient);
  const actorTenantId = normalizeLibraryTenantId(actor.tenantId);
  const now = new Date();

  const existingRows = await db
    .select({
      id: libraryItems.id,
      itemType: libraryItems.itemType,
    })
    .from(libraryItems)
    .where(
      and(
        inArray(libraryItems.id, itemIds),
        eq(libraryItems.tenantId, actorTenantId),
        isNull(libraryItems.deletedAt),
      ),
    );
  const presentationItemIds = existingRows
    .filter((row) => row.itemType === "presentation")
    .map((row) => row.id);

  const result = await db
    .update(libraryItems)
    .set({ deletedAt: now, deletedBy: actor.userId, status: "archived", updatedAt: now })
    .where(
      and(
        inArray(libraryItems.id, itemIds),
        eq(libraryItems.tenantId, actorTenantId),
        isNull(libraryItems.deletedAt),
      ),
    )
    .returning({ id: libraryItems.id });

  for (const presentationItemId of presentationItemIds) {
    await softDeleteDeckScopedPresentationUploads(presentationItemId, actor, db);
  }

  return result.length;
}

/**
 * Share all non-folder items in a specific owned folder (recursive) with a group.
 * Returns the number of items that were newly shared (or already had a share updated).
 */
export async function shareLibraryToGroup(
  input: { folderId: number; groupId: number; permissionLevel: LibraryPermissionLevel },
  actor: LibraryActor,
  dbClient?: DbClient,
): Promise<{ shared: number }> {
  const db = await resolveDb(dbClient);
  const actorTenantId = normalizeLibraryTenantId(actor.tenantId);

  // Verify group exists and belongs to same tenant
  const [group] = await db
    .select({ id: userGroups.id })
    .from(userGroups)
    .where(
      and(
        eq(userGroups.id, input.groupId),
        eq(userGroups.tenantId, actorTenantId),
        isNull(userGroups.deletedAt),
      ),
    )
    .limit(1);

  if (!group) {
    throw new Error("Group not found or does not belong to this tenant");
  }

  const [folder] = await db
    .select({ id: libraryItems.id })
    .from(libraryItems)
    .where(
      and(
        eq(libraryItems.id, input.folderId),
        eq(libraryItems.tenantId, actorTenantId),
        eq(libraryItems.ownerUserId, actor.userId),
        eq(libraryItems.itemType, "folder"),
        isNull(libraryItems.deletedAt),
      ),
    )
    .limit(1);

  if (!folder) {
    throw new Error("Folder not found or you do not have permission to share it");
  }

  // Collect all descendant folders owned by actor (BFS) so sharing is folder-recursive.
  const folderIds: number[] = [input.folderId];
  let frontier: number[] = [input.folderId];
  while (frontier.length > 0) {
    const children = await db
      .select({ id: libraryItems.id })
      .from(libraryItems)
      .where(
        and(
          eq(libraryItems.tenantId, actorTenantId),
          eq(libraryItems.ownerUserId, actor.userId),
          eq(libraryItems.itemType, "folder"),
          inArray(libraryItems.parentId, frontier),
          isNull(libraryItems.deletedAt),
        ),
      );

    const next = children
      .map((row) => row.id)
      .filter((id) => !folderIds.includes(id));

    if (next.length === 0) {
      break;
    }

    folderIds.push(...next);
    frontier = next;
  }

  // Fetch all owned non-deleted non-folder items inside the selected folder tree.
  const ownedItems = await db
    .select({ id: libraryItems.id })
    .from(libraryItems)
    .where(
      and(
        eq(libraryItems.tenantId, actorTenantId),
        eq(libraryItems.ownerUserId, actor.userId),
        ne(libraryItems.itemType, "folder"),
        inArray(libraryItems.parentId, folderIds),
        isNull(libraryItems.deletedAt),
      ),
    );

  if (ownedItems.length === 0) return { shared: 0 };

  const subjectId = String(input.groupId);
  const now = new Date();

  // Upsert permission rows for each item
  const BATCH = 100;
  let shared = 0;
  for (let i = 0; i < ownedItems.length; i += BATCH) {
    const batch = ownedItems.slice(i, i + BATCH);
    await db
      .insert(libraryPermissions)
      .values(
        batch.map((item) => ({
          tenantId: actorTenantId,
          libraryItemId: item.id,
          subjectType: "group" as const,
          subjectId,
          permissionLevel: input.permissionLevel,
          grantedByUserId: actor.userId,
          createdAt: now,
          updatedAt: now,
        })),
      )
      .onConflictDoUpdate({
        target: [libraryPermissions.libraryItemId, libraryPermissions.subjectType, libraryPermissions.subjectId],
        set: { permissionLevel: input.permissionLevel, updatedAt: now },
      });
    shared += batch.length;
  }

  return { shared };
}
