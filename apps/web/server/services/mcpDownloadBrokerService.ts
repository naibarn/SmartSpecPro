import path from "node:path";
import crypto from "node:crypto";

import type { Readable } from "node:stream";

import { getLibraryItemById, type LibraryActor } from "./libraryService";
import { getMcpMediaTask } from "./mcpMediaAdapter";
import { getHermesMediaTask } from "./hermesMediaAdapter";
import type { MediaTask } from "./mediaGenerationService";
import { storageStreamFile } from "../storage";
import {
  normalizeManagedMediaKey,
} from "./managedMediaAccessService";
import { canReadManagedStorageKey } from "./managedStorageAuthorizationService";
import { createInternalTokenFromAuth, signBearerToken, verifyBearerToken, type TokenClaims } from "../_core/tokens";
import { getCacheClient } from "./redisClients";

const MCP_DOWNLOAD_AUDIENCE = "smartspec-mcp-download";
const MCP_DOWNLOAD_TTL = "5m";
const MCP_DOWNLOAD_TTL_SECONDS = 5 * 60;
const MCP_DOWNLOAD_GRANT_PREFIX = "ssp:f145:mcp:download:grant:";

type DownloadResourceType = "library_item" | "media_task" | "storage_key";

interface McpDownloadClaims extends TokenClaims {
  aud: string;
  tokenUse: "mcp_download";
  resourceType: DownloadResourceType;
  resourceId: string;
  fileName: string;
  contentType: string;
  storageKey?: string;
}

export interface McpDownloadViewer {
  tenantId: string;
  userId: number;
  role?: string | null;
}

export interface McpDownloadResolution {
  stream: NodeJS.ReadableStream | ReadableStream;
  contentType: string;
  contentLength?: number;
  totalLength?: number;
  rangeStart?: number;
  rangeEnd?: number;
  isPartial: boolean;
  fileName: string;
}

function safeFileName(value: unknown, fallback: string): string {
  const normalized = String(value ?? "")
    .replace(/[\\/\0\r\n]+/g, "_")
    .replace(/[^a-zA-Z0-9._ -]+/g, "_")
    .trim()
    .slice(0, 180);
  return normalized || fallback;
}

function storageKeyFromManagedReference(value: unknown): string | null {
  if (typeof value !== "string" || !value.trim()) return null;
  const raw = value.trim();
  if (raw.startsWith("/api/storage/files/")) {
    return normalizeManagedMediaKey(raw.slice("/api/storage/files/".length));
  }
  if (raw.startsWith("/uploads/")) {
    return normalizeManagedMediaKey(raw.slice("/uploads/".length));
  }
  if (!raw.includes("://")) return normalizeManagedMediaKey(raw);
  return null;
}

function findStorageKey(value: unknown, depth = 0): string | null {
  if (depth > 5 || value == null) return null;
  const direct = storageKeyFromManagedReference(value);
  if (direct) return direct;
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = findStorageKey(item, depth + 1);
      if (found) return found;
    }
    return null;
  }
  if (typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  for (const key of ["storageKey", "storage_key", "storageRef", "objectKey", "url", "resultUrl", "result_url"]) {
    const found = findStorageKey(record[key], depth + 1);
    if (found) return found;
  }
  return null;
}

function librarySourceKey(item: { sourceUrl?: string | null; metadata?: Record<string, unknown> }): string | null {
  const metadata = item.metadata ?? {};
  return findStorageKey(metadata.source_key)
    ?? findStorageKey(metadata.storageKey)
    ?? storageKeyFromManagedReference(item.sourceUrl);
}

async function issueDownloadRef(input: {
  viewer: McpDownloadViewer;
  resourceType: DownloadResourceType;
  resourceId: string;
  fileName: string;
  contentType: string;
}): Promise<string> {
  const token = signBearerToken(
    {
      sub: String(input.viewer.userId),
      tenantId: input.viewer.tenantId,
      aud: MCP_DOWNLOAD_AUDIENCE,
      type: "access",
      tokenUse: "mcp_download",
      resourceType: input.resourceType,
      resourceId: input.resourceId,
      fileName: safeFileName(input.fileName, "download.bin"),
      contentType: input.contentType || "application/octet-stream",
      storageKey: input.resourceType === "storage_key" ? input.resourceId : undefined,
      scopes: ["media:download"],
      jti: `mcp_download_${crypto.randomUUID()}`,
    } as McpDownloadClaims,
    MCP_DOWNLOAD_TTL,
  );
  const claims = await verifyBearerToken(token) as McpDownloadClaims;
  if (!claims.jti) throw new Error("download_ref_invalid");
  await getCacheClient().set(
    `${MCP_DOWNLOAD_GRANT_PREFIX}${crypto.createHash("sha256").update(claims.jti).digest("hex")}`,
    JSON.stringify({ tenantId: input.viewer.tenantId, userId: input.viewer.userId, resourceType: input.resourceType, resourceId: input.resourceId }),
    "EX",
    MCP_DOWNLOAD_TTL_SECONDS,
  );
  return token;
}

function actorForViewer(viewer: McpDownloadViewer): LibraryActor {
  return {
    tenantId: viewer.tenantId,
    userId: viewer.userId,
    role: viewer.role === "admin" ? "admin" : "user",
  };
}

export async function createLibraryDownloadRef(
  itemId: number,
  viewer: McpDownloadViewer,
): Promise<{ downloadRef: string; expiresInSeconds: number; fileName: string; contentType: string }> {
  const item = await getLibraryItemById(itemId, actorForViewer(viewer));
  if (!item || item.deletedAt) throw new Error("library_file_unavailable");
  const storageKey = librarySourceKey(item);
  if (!storageKey) throw new Error("library_file_unavailable");
  const metadata = item.metadata ?? {};
  const fileName = safeFileName(
    metadata.original_filename ?? metadata.fileName ?? metadata.filename ?? item.title,
    `library-${item.id}`,
  );
  const contentType = typeof metadata.mime_type === "string"
    ? metadata.mime_type
    : typeof metadata.content_type === "string"
      ? metadata.content_type
      : "application/octet-stream";
  return {
    downloadRef: await issueDownloadRef({
      viewer,
      resourceType: "library_item",
      resourceId: String(item.id),
      fileName,
      contentType,
    }),
    expiresInSeconds: 300,
    fileName,
    contentType,
  };
}

async function resolveMediaTask(taskId: string, viewer: McpDownloadViewer): Promise<MediaTask | null> {
  if (taskId.startsWith("mcp_")) {
    return getMcpMediaTask(taskId, viewer.userId, viewer.tenantId);
  }
  if (taskId.startsWith("hermes_")) {
    return getHermesMediaTask(taskId, viewer.userId, { tenantId: viewer.tenantId });
  }
  try {
    const { mediaGenerationService } = await import("./mediaGenerationService");
    return await mediaGenerationService.getTask(
      taskId,
      createInternalTokenFromAuth({ userId: viewer.userId, tenantId: viewer.tenantId }, ["media:read"]),
      { userId: viewer.userId, tenantId: viewer.tenantId, source: "mcp.download_broker" },
    );
  } catch {
    return null;
  }
}

export async function createMediaTaskDownloadRef(
  taskId: string,
  viewer: McpDownloadViewer,
): Promise<{ downloadRef: string; expiresInSeconds: number; fileName: string; contentType: string }> {
  const task = await resolveMediaTask(taskId, viewer);
  if (!task || task.status !== "completed") throw new Error("media_file_unavailable");
  const storageKey = findStorageKey(task.resultUrl) ?? findStorageKey(task.resultData);
  if (!storageKey) throw new Error("media_file_unavailable");
  const extension = path.extname(storageKey).replace(/[^a-z0-9.]/gi, "") ||
    (task.mediaType === "video" ? ".mp4" : task.mediaType === "audio" ? ".mp3" : ".png");
  const fileName = `${task.id}${extension}`;
  const contentType = task.mediaType === "video"
    ? "video/mp4"
    : task.mediaType === "audio"
      ? "audio/mpeg"
      : "image/png";
  return {
    downloadRef: await issueDownloadRef({
      viewer,
      resourceType: "media_task",
      resourceId: task.id,
      fileName,
      contentType,
    }),
    expiresInSeconds: 300,
    fileName,
    contentType,
  };
}

export async function createManagedStorageDownloadRef(
  storageKey: string,
  viewer: McpDownloadViewer,
): Promise<{ downloadRef: string; expiresInSeconds: number; fileName: string; contentType: string }> {
  const normalizedKey = normalizeManagedMediaKey(storageKey);
  if (!normalizedKey || !(await canReadManagedStorageKey(normalizedKey, viewer))) {
    throw new Error("media_file_unavailable");
  }
  const fileName = safeFileName(path.basename(normalizedKey), "reference.bin");
  const extension = path.extname(normalizedKey).toLowerCase();
  const contentType = extension === ".jpg" || extension === ".jpeg"
    ? "image/jpeg"
    : extension === ".webp"
      ? "image/webp"
      : extension === ".gif"
        ? "image/gif"
        : extension === ".webm"
          ? "video/webm"
          : extension === ".mp4"
            ? "video/mp4"
            : "image/png";
  return {
    downloadRef: await issueDownloadRef({
      viewer,
      resourceType: "storage_key",
      resourceId: normalizedKey,
      fileName,
      contentType,
    }),
    expiresInSeconds: MCP_DOWNLOAD_TTL_SECONDS,
    fileName,
    contentType,
  };
}

async function resolveResourceStorageKey(
  claims: McpDownloadClaims,
  viewer: McpDownloadViewer,
): Promise<string | null> {
  if (claims.resourceType === "library_item") {
    const item = await getLibraryItemById(Number(claims.resourceId), actorForViewer(viewer));
    return item && !item.deletedAt ? librarySourceKey(item) : null;
  }
  if (claims.resourceType === "storage_key") {
    const storageKey = normalizeManagedMediaKey(claims.storageKey ?? claims.resourceId);
    if (!storageKey || !(await canReadManagedStorageKey(storageKey, viewer))) return null;
    return storageKey;
  }
  const task = await resolveMediaTask(claims.resourceId, viewer);
  if (!task || task.status !== "completed") return null;
  return findStorageKey(task.resultUrl) ?? findStorageKey(task.resultData);
}

export async function resolveMcpDownloadRef(
  token: string,
  range: string | undefined,
): Promise<McpDownloadResolution> {
  let claims: McpDownloadClaims;
  try {
    claims = await verifyBearerToken(token) as McpDownloadClaims;
  } catch {
    throw new Error("download_ref_invalid");
  }
  if (
    claims.aud !== MCP_DOWNLOAD_AUDIENCE
    || claims.tokenUse !== "mcp_download"
    || !claims.tenantId
    || !claims.sub
    || !claims.resourceId
    || (claims.resourceType !== "library_item" && claims.resourceType !== "media_task" && claims.resourceType !== "storage_key")
  ) {
    throw new Error("download_ref_invalid");
  }
  if (!claims.jti) throw new Error("download_ref_invalid");
  const viewer = {
    tenantId: claims.tenantId,
    userId: Number(claims.sub),
  } satisfies McpDownloadViewer;
  if (!Number.isInteger(viewer.userId) || viewer.userId <= 0) throw new Error("download_ref_invalid");
  const grantKey = `${MCP_DOWNLOAD_GRANT_PREFIX}${crypto.createHash("sha256").update(claims.jti).digest("hex")}`;
  let grantRaw: string | null;
  try {
    grantRaw = await getCacheClient().get(grantKey);
  } catch {
    throw new Error("download_grant_unavailable");
  }
  if (!grantRaw) throw new Error("download_ref_revoked");
  try {
    const grant = JSON.parse(grantRaw) as Record<string, unknown>;
    if (
      grant.tenantId !== viewer.tenantId
      || grant.userId !== viewer.userId
      || grant.resourceType !== claims.resourceType
      || grant.resourceId !== claims.resourceId
    ) throw new Error("download_ref_revoked");
  } catch (error) {
    if (error instanceof Error && error.message === "download_ref_revoked") throw error;
    throw new Error("download_ref_revoked");
  }
  const storageKey = await resolveResourceStorageKey(claims, viewer);
  if (!storageKey) throw new Error("download_ref_revoked");
  const result = await storageStreamFile(storageKey, range);
  if (!result) throw new Error("download_file_unavailable");
  return {
    ...result,
    fileName: safeFileName(claims.fileName, "download.bin"),
    contentType: claims.contentType || result.contentType || "application/octet-stream",
  };
}
