import crypto from "crypto";
import { and, desc, eq } from "drizzle-orm";
import { getDb } from "../db";
import {
  mcpMediaTasks as mcpMediaTasksTable,
  mcpProviderTemplates,
  type McpMediaTask,
  userMcpConnections,
} from "../../drizzle/schema";
import type { MediaTask } from "./mediaGenerationService";
import type { MediaTaskTransportMetadata } from "../../shared/mcpConnectTypes";
import { recordMcpUsageEvent } from "./mcpConnectionService";
import { buildMcpObservabilityEvent, logMcpObservabilityEvent } from "./mcpObservability";
import { decrypt } from "./crypto";
import { storagePut } from "../storage";
import { normalizeMcpProviderModelIdForProvider } from "./mcpProviderModelAliases";

export interface McpMediaGenerationRequest {
  tenantId: string;
  prompt: string;
  model: string;
  metadata: MediaTaskTransportMetadata;
  parameters?: Record<string, unknown>;
}

const memoryMcpMediaTasks = new Map<string, MediaTask>();
const inFlightMcpIdempotency = new Map<string, Promise<MediaTask>>();
const MCP_OUTPUT_FETCH_TIMEOUT_MS = 60_000;
const MCP_OUTPUT_MAX_BYTES_BY_TYPE: Record<MediaTask["mediaType"], number> = {
  image: 75 * 1024 * 1024,
  video: 1024 * 1024 * 1024,
  audio: 150 * 1024 * 1024,
};
const MCP_OUTPUT_CONTENT_TYPES: Record<MediaTask["mediaType"], Record<string, string>> = {
  image: {
    "image/jpeg": "jpg",
    "image/jpg": "jpg",
    "image/png": "png",
    "image/webp": "webp",
    "image/gif": "gif",
  },
  video: {
    "video/mp4": "mp4",
    "video/webm": "webm",
    "video/quicktime": "mov",
    "video/x-msvideo": "avi",
  },
  audio: {
    "audio/mpeg": "mp3",
    "audio/mp3": "mp3",
    "audio/wav": "wav",
    "audio/x-wav": "wav",
    "audio/ogg": "ogg",
    "audio/mp4": "m4a",
  },
};

function redactParameters(parameters: Record<string, unknown> = {}) {
  const redacted: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(parameters)) {
    if (/token|secret|url|prompt|response/i.test(key)) continue;
    redacted[key] = value;
  }
  return redacted;
}

function normalizeMcpResolution(
  resolution: unknown,
  providerKey?: string | null,
  assetType?: MediaTaskTransportMetadata["assetType"],
): string | undefined {
  if (typeof resolution !== "string" || !resolution.trim()) return undefined;
  const value = resolution.trim();
  if (
    (providerKey === "magnific" || providerKey === "higgsfield") &&
    assetType === "image" &&
    /^[124]k$/i.test(value)
  ) {
    return value.toLowerCase();
  }
  return value;
}

function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  return "Unknown error";
}

function sanitizeMcpConnectionErrorMessage(error: unknown): string {
  const message = errorMessage(error)
    .replace(/Bearer\s+[A-Za-z0-9._~+/-]+=*/gi, "Bearer [redacted]")
    .replace(/access[_-]?token["'\s:=]+[A-Za-z0-9._~+/-]+=*/gi, "accessToken [redacted]")
    .trim();
  return message.slice(0, 128);
}

function isMcpProviderAuthError(error: unknown): boolean {
  const message = errorMessage(error);
  return /invalid or expired token|token (?:has )?expired|expired token|invalid token|requires re-?authentication|unauthori[sz]ed|forbidden|\b401\b|\b403\b/i.test(message);
}

async function markMcpConnectionRequiresReauth(params: {
  tenantId: string;
  connectionId?: string | null;
  error: unknown;
}) {
  if (!params.connectionId) return;
  const now = new Date();
  await getDb()
    .update(userMcpConnections)
    .set({
      status: "requires_reauth",
      lastErrorCode: sanitizeMcpConnectionErrorMessage(params.error),
      lastErrorAt: now,
      lastHealthCheckAt: now,
      updatedAt: now,
    })
    .where(and(
      eq(userMcpConnections.id, params.connectionId),
      eq(userMcpConnections.tenantId, params.tenantId),
    ));
}

function readStringArrayParameter(parameters: Record<string, unknown>, keys: string[]): string[] {
  for (const key of keys) {
    const value = parameters[key];
    if (Array.isArray(value)) {
      return value.map((item) => String(item ?? "").trim()).filter(Boolean);
    }
    if (typeof value === "string" && value.trim()) {
      return [value.trim()];
    }
  }
  return [];
}

function buildMagnificReferencesFromIdentifiers(identifiers: string[]): Array<{ type: "image"; identifier: string }> {
  return identifiers
    .map((identifier) => identifier.trim())
    .filter(Boolean)
    .map((identifier) => ({ type: "image" as const, identifier }));
}

function buildHiggsfieldMediasFromIdentifiers(
  identifiers: string[],
  roles?: string[],
): Array<{ value: string; role: string }> {
  return identifiers
    .map((identifier, index) => ({
      identifier: identifier.trim(),
      role: normalizeHiggsfieldMediaRole(roles?.[index]),
    }))
    .filter((entry) => Boolean(entry.identifier))
    .map((entry) => ({ value: entry.identifier, role: entry.role }));
}

function normalizeHiggsfieldMediaRole(role: unknown): string {
  const value = typeof role === "string" ? role.trim().toLowerCase() : "";
  if (value === "character") return "character";
  return "image";
}

function referenceImageManifestFromParameters(
  parameters: Record<string, unknown>,
): Array<{ url: string; role: string }> {
  const raw =
    parameters.referenceImageManifest ?? parameters.reference_image_manifest;
  if (!Array.isArray(raw)) return [];
  return raw
    .map((entry) => {
      if (!entry || typeof entry !== "object") return null;
      const record = entry as Record<string, unknown>;
      const url = typeof record.url === "string" ? record.url.trim() : "";
      const role = typeof record.role === "string" ? record.role.trim() : "";
      if (!url || !role) return null;
      return { url, role };
    })
    .filter((entry): entry is { url: string; role: string } => Boolean(entry));
}

function rolesForReferenceImageUrls(
  urls: string[],
  parameters: Record<string, unknown>,
): string[] {
  const manifest = referenceImageManifestFromParameters(parameters);
  if (manifest.length === 0) return urls.map(() => "image");
  return urls.map((url, index) => {
    const manifestEntry =
      manifest.find((entry) => entry.url === url) ?? manifest[index];
    return normalizeHiggsfieldMediaRole(manifestEntry?.role);
  });
}

export function buildMcpToolArguments(
  assetType: MediaTaskTransportMetadata["assetType"],
  prompt: string,
  parameters: Record<string, unknown> = {},
  providerKey?: string | null,
  argumentShape?: string | null,
): Record<string, unknown> {
  const referenceImageUrls = readStringArrayParameter(parameters, [
    "referenceImageUrls",
    "reference_image_urls",
    "image_urls",
    "imageUrls",
  ]);
  const referenceVideoUrls = readStringArrayParameter(parameters, [
    "referenceVideoUrls",
    "reference_video_urls",
    "video_urls",
    "videoUrls",
    "referenceVideoUrl",
    "reference_video_url",
  ]);
  const aspectRatio = typeof parameters.aspectRatio === "string"
    ? parameters.aspectRatio
    : typeof parameters.aspect_ratio === "string"
      ? parameters.aspect_ratio
      : undefined;
  const resolution = normalizeMcpResolution(
    parameters.resolution,
    providerKey,
    assetType,
  );
  if (providerKey === "higgsfield" || argumentShape === "higgsfield.generate_image") {
    const rawModel = typeof parameters.providerModelId === "string"
      ? parameters.providerModelId
      : typeof parameters.model === "string"
        ? parameters.model
        : undefined;
    const model = normalizeMcpProviderModelIdForProvider({
      providerKey,
      providerModelId: rawModel,
      assetType,
      argumentShape,
    });
    const params = Object.fromEntries(Object.entries({
      model,
      prompt,
      count: assetType === "image" ? (typeof parameters.numImages === "number" ? parameters.numImages : 1) : undefined,
      duration: assetType === "video" ? parameters.duration : undefined,
      aspect_ratio: aspectRatio,
      resolution,
      quality: parameters.quality,
      generate_audio: parameters.generate_audio,
      video_urls: referenceVideoUrls.length > 0 ? referenceVideoUrls : undefined,
      medias: Array.isArray(parameters.medias) && parameters.medias.length > 0
        ? parameters.medias
        : undefined,
    }).filter(([, value]) => value !== undefined && value !== null && value !== ""));
    return { params };
  }
  if (assetType === "video") {
    return {
      video: {
        model: typeof parameters.providerModelId === "string"
          ? parameters.providerModelId
          : typeof parameters.model === "string"
            ? parameters.model
            : undefined,
        prompt,
        aspectRatio,
        imageUrls: referenceImageUrls.length > 0 ? referenceImageUrls : undefined,
        reference_image_urls: referenceImageUrls.length > 0 ? referenceImageUrls : undefined,
        videoUrls: referenceVideoUrls.length > 0 ? referenceVideoUrls : undefined,
        reference_video_urls: referenceVideoUrls.length > 0 ? referenceVideoUrls : undefined,
      },
    };
  }
  if (providerKey === "magnific" || argumentShape === "magnific.images_generate") {
    return Object.fromEntries(Object.entries({
      mode: typeof parameters.providerModelId === "string"
        ? parameters.providerModelId
        : typeof parameters.model === "string"
          ? parameters.model
          : undefined,
      prompt,
      aspectRatio,
      count: typeof parameters.numImages === "number" ? parameters.numImages : undefined,
      resolution,
      references: Array.isArray(parameters.references) ? parameters.references : undefined,
    }).filter(([, value]) => value !== undefined && value !== null && value !== "" && !(Array.isArray(value) && value.length === 0)));
  }
  return Object.fromEntries(Object.entries({
    model: typeof parameters.providerModelId === "string"
      ? parameters.providerModelId
      : typeof parameters.model === "string"
        ? parameters.model
        : undefined,
    prompt,
    aspectRatio,
    count: typeof parameters.numImages === "number" ? parameters.numImages : undefined,
    resolution,
  }).filter(([, value]) => value !== undefined && value !== null && value !== ""));
}

export function parseMcpJsonResponse(text: string): any {
  const trimmed = text.trim();
  if (trimmed.startsWith("{")) return JSON.parse(trimmed);
  const dataLine = trimmed.match(/(?:^|\r?\n)data:\s*(.+)(?:\r?\n|$)/)?.[1];
  if (!dataLine) throw new Error("MCP provider returned an unsupported response format");
  return JSON.parse(dataLine);
}

function findProviderIdentifier(value: unknown): string | null {
  if (!value || typeof value !== "object") return null;
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = findProviderIdentifier(item);
      if (found) return found;
    }
    return null;
  }
  const record = value as Record<string, unknown>;
  for (const key of ["creationIdentifier", "identifier", "creationId", "media_id", "mediaId", "jobId", "operationId", "id"]) {
    if (typeof record[key] === "string" && record[key]) return record[key];
  }
  for (const nested of Object.values(record)) {
    const found = findProviderIdentifier(nested);
    if (found) return found;
  }
  return null;
}

function safeProviderSummary(result: unknown): Record<string, unknown> {
  const summary: Record<string, unknown> = {};
  if (result && typeof result === "object") {
    const record = result as Record<string, unknown>;
    summary.hasContent = Array.isArray(record.content);
    summary.isError = Boolean(record.isError);
    summary.providerIdentifier = findProviderIdentifier(result) ?? undefined;
  }
  return summary;
}

function parseJsonLikeText(value: string): unknown {
  const trimmed = value.trim();
  if (!trimmed || (!trimmed.startsWith("{") && !trimmed.startsWith("["))) return null;
  try {
    return JSON.parse(trimmed);
  } catch {
    return null;
  }
}

function collectProviderUrls(value: unknown, urls: string[] = [], visited = new Set<unknown>()): string[] {
  if (typeof value === "string") {
    const trimmed = value.trim();
    const parsed = parseJsonLikeText(trimmed);
    if (parsed) {
      collectProviderUrls(parsed, urls, visited);
      return urls;
    }
    const matches = trimmed.match(/https?:\/\/[^\s"'<>\\)]+/g) ?? [];
    for (const match of matches) {
      if (!urls.includes(match)) urls.push(match);
    }
    return urls;
  }
  if (!value || typeof value !== "object" || visited.has(value)) return urls;
  visited.add(value);
  if (Array.isArray(value)) {
    for (const item of value) collectProviderUrls(item, urls, visited);
    return urls;
  }
  for (const nested of Object.values(value as Record<string, unknown>)) {
    collectProviderUrls(nested, urls, visited);
  }
  return urls;
}

function isManagedStorageUrl(url: string): boolean {
  return url.startsWith("/api/storage/files/") || url.startsWith("/uploads/");
}

function normalizeContentType(value: string | null): string {
  return (value ?? "").split(";")[0]?.trim().toLowerCase() ?? "";
}

function inferContentTypeFromUrl(url: string, mediaType: MediaTask["mediaType"]): string | null {
  const cleanPath = (() => {
    try {
      return new URL(url).pathname.toLowerCase();
    } catch {
      return url.toLowerCase();
    }
  })();
  const mappings = MCP_OUTPUT_CONTENT_TYPES[mediaType];
  for (const [contentType, extension] of Object.entries(mappings)) {
    if (cleanPath.endsWith(`.${extension}`)) return contentType === "image/jpg" ? "image/jpeg" : contentType;
  }
  if (mediaType === "image" && cleanPath.endsWith(".jpeg")) return "image/jpeg";
  if (mediaType === "video" && cleanPath.endsWith(".mov")) return "video/quicktime";
  if (mediaType === "audio" && cleanPath.endsWith(".m4a")) return "audio/mp4";
  return null;
}

function resolveMcpOutputContentType(
  responseContentType: string | null,
  url: string,
  mediaType: MediaTask["mediaType"],
): { contentType: string; extension: string } {
  const normalized = normalizeContentType(responseContentType);
  const allowed = MCP_OUTPUT_CONTENT_TYPES[mediaType];
  const fallback = inferContentTypeFromUrl(url, mediaType);
  const contentType = normalized && allowed[normalized]
    ? normalized
    : fallback ?? (mediaType === "video" ? "video/mp4" : mediaType === "audio" ? "audio/mpeg" : "image/png");
  return {
    contentType: contentType === "image/jpg" ? "image/jpeg" : contentType,
    extension: allowed[contentType] ?? "bin",
  };
}

async function readResponseBytesWithLimit(response: Response, maxBytes: number): Promise<Buffer> {
  const contentLength = Number(response.headers.get("content-length") ?? 0);
  if (Number.isFinite(contentLength) && contentLength > maxBytes) {
    throw new Error("MCP provider output is too large to save");
  }
  const buffer = Buffer.from(await response.arrayBuffer());
  if (buffer.length === 0) {
    throw new Error("MCP provider output download was empty");
  }
  if (buffer.length > maxBytes) {
    throw new Error("MCP provider output is too large to save");
  }
  return buffer;
}

async function fetchMcpProviderOutput(
  url: string,
  mediaType: MediaTask["mediaType"],
  fetchImpl: typeof fetch = fetch,
): Promise<{ buffer: Buffer; contentType: string; extension: string }> {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error("MCP provider output URL is invalid");
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error("MCP provider output URL must be http or https");
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), MCP_OUTPUT_FETCH_TIMEOUT_MS);
  try {
    const response = await fetchImpl(url, {
      signal: controller.signal,
      headers: {
        accept: `${mediaType}/*,application/octet-stream;q=0.8,*/*;q=0.5`,
      },
    });
    if (!response.ok) {
      throw new Error(`MCP provider output download failed: ${response.status}`);
    }
    const { contentType, extension } = resolveMcpOutputContentType(
      response.headers.get("content-type"),
      response.url || url,
      mediaType,
    );
    const buffer = await readResponseBytesWithLimit(response, MCP_OUTPUT_MAX_BYTES_BY_TYPE[mediaType]);
    return { buffer, contentType, extension };
  } finally {
    clearTimeout(timeout);
  }
}

type InternalizeMcpProviderUrlsDeps = {
  fetchImpl?: typeof fetch;
  putObject?: typeof storagePut;
};

export async function internalizeMcpProviderOutputUrls(params: {
  urls: string[];
  task: MediaTask;
  metadata?: MediaTaskTransportMetadata;
  deps?: InternalizeMcpProviderUrlsDeps;
}): Promise<{
  urls: string[];
  artifacts: Array<{
    sourceHost?: string;
    storageKey?: string;
    url: string;
    contentType?: string;
    byteSize?: number;
    sha256?: string;
  }>;
}> {
  const uniqueUrls = params.urls.filter((url, index, urls) => urls.indexOf(url) === index);
  const putObject = params.deps?.putObject ?? storagePut;
  const storedUrls: string[] = [];
  const artifacts: Array<{
    sourceHost?: string;
    storageKey?: string;
    url: string;
    contentType?: string;
    byteSize?: number;
    sha256?: string;
  }> = [];

  for (const [index, url] of uniqueUrls.entries()) {
    if (isManagedStorageUrl(url)) {
      storedUrls.push(url);
      artifacts.push({
        url,
        storageKey: decodeURIComponent(url.replace(/^\/(?:api\/storage\/files|uploads)\//, "")),
      });
      continue;
    }

    const { buffer, contentType, extension } = await fetchMcpProviderOutput(
      url,
      params.task.mediaType,
      params.deps?.fetchImpl,
    );
    const sha256 = crypto.createHash("sha256").update(buffer).digest("hex");
    const tenantId = params.metadata?.tenantId ?? "unknown-tenant";
    const actorUserId = params.metadata?.actorUserId ?? params.task.userId ?? "unknown-user";
    const key = `mcp-media/${tenantId}/${actorUserId}/${params.task.id}/output-${index}-${sha256.slice(0, 12)}.${extension}`;
    const stored = await putObject(key, buffer, contentType);
    storedUrls.push(stored.url);
    artifacts.push({
      sourceHost: new URL(url).hostname,
      storageKey: stored.key,
      url: stored.url,
      contentType,
      byteSize: buffer.length,
      sha256,
    });
  }

  return { urls: storedUrls, artifacts };
}

export const internalizeMcpProviderUrlsForTest = internalizeMcpProviderOutputUrls;
export const isMcpProviderAuthErrorForTest = isMcpProviderAuthError;
export const sanitizeMcpConnectionErrorMessageForTest = sanitizeMcpConnectionErrorMessage;
export const higgsfieldMediaRolesForReferenceImagesForTest =
  rolesForReferenceImageUrls;
export const withCompletedProviderResultForTest = withCompletedProviderResult;
export const prepareMcpToolArgumentsForTest = prepareMcpToolArguments;

function findProviderStatus(value: unknown, visited = new Set<unknown>()): string | null {
  if (!value || typeof value !== "object" || visited.has(value)) return null;
  visited.add(value);
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = findProviderStatus(item, visited);
      if (found) return found;
    }
    return null;
  }
  const record = value as Record<string, unknown>;
  for (const key of ["status", "state", "statusText", "status_text", "phase"]) {
    const raw = record[key];
    if (typeof raw === "string" && raw.trim()) return raw.trim();
  }
  for (const nested of Object.values(record)) {
    const found = findProviderStatus(nested, visited);
    if (found) return found;
  }
  return null;
}

function normalizeProviderStatus(value: unknown): MediaTask["status"] | null {
  const raw = findProviderStatus(value)?.toLowerCase() ?? "";
  if (!raw) {
    const urls = collectProviderUrls(value);
    return urls.length > 0 ? "completed" : null;
  }
  if (/complete|completed|success|succeeded|finished|done/.test(raw)) return "completed";
  if (/fail|failed|error|rejected|cancel|cancelled|canceled/.test(raw)) return "failed";
  if (/queue|queued|pending|process|processing|progress|running|submitted|created|in_progress/.test(raw)) return "processing";
  return null;
}

function providerStatusToolName(metadata: MediaTaskTransportMetadata): string {
  return metadata.providerKey === "higgsfield" ? "job_status" : "creation_status";
}

function providerStatusArgumentCandidates(metadata: MediaTaskTransportMetadata, providerJobId: string): Record<string, unknown>[] {
  if (metadata.providerKey === "higgsfield") {
    return [
      { jobId: providerJobId },
      { jobId: providerJobId, sync: true },
      { job_id: providerJobId, sync: true },
      { id: providerJobId, sync: true },
      { params: { job_id: providerJobId, sync: true } },
    ];
  }
  return [
    { creationIdentifier: providerJobId },
    { identifier: providerJobId },
    { id: providerJobId },
  ];
}

async function withCompletedProviderResult(task: MediaTask, providerStatusResult: unknown): Promise<MediaTask> {
  const providerUrls = collectProviderUrls(providerStatusResult);
  const metadata = (task.parameters?.transportMetadata ?? task.resultData?.transportMetadata) as MediaTaskTransportMetadata | undefined;
  const { urls, artifacts } = await internalizeMcpProviderOutputUrls({
    urls: providerUrls,
    task,
    metadata,
  });
  const resultUrl = urls[0];
  const mediaUrlKey = task.mediaType === "video" ? "videoUrl" : task.mediaType === "audio" ? "audioUrl" : "imageUrl";
  const resultData = {
    ...(task.resultData ?? {}),
    ...(resultUrl ? { resultUrl, [mediaUrlKey]: resultUrl } : {}),
    outputUrls: urls,
    previewUrls: urls.slice(1),
    providerStatus: {
      redacted: true,
      ...safeProviderSummary(providerStatusResult),
    },
    providerOutputArtifacts: artifacts,
    providerSummary: {
      ...(typeof task.resultData?.providerSummary === "object" && task.resultData?.providerSummary ? task.resultData.providerSummary : {}),
      status: "completed",
      providerKey: metadata?.providerKey,
      toolName: metadata?.toolName,
      providerModelId: metadata?.providerModelId,
      outputCount: urls.length,
      outputsStored: urls.length > 0,
    },
  };
  return {
    ...task,
    status: "completed",
    // Normalize the top-level `resultUrl` here too, not just inside
    // `resultData` — this is the field every poller (character portrait,
    // storyboard start-frame, angle-variations, repair) reads directly as
    // `task.resultUrl`. Without this, the in-memory fast path in
    // `getMcpMediaTask` (which returns this object as-is once status is no
    // longer "processing"/"pending", bypassing `rowToMediaTask`'s own
    // `readFirstMcpMediaUrl(resultData)` derivation used by `listTasks`)
    // would report `status: "completed"` with no `resultUrl`, even though
    // the History tab — which always re-derives from `resultData` via
    // `rowToMediaTask` — shows the image correctly. Keeping both call paths
    // aligned on the same normalized field prevents that split-brain state.
    ...(resultUrl ? { resultUrl } : {}),
    resultData,
    completedAt: task.completedAt ?? new Date().toISOString(),
  };
}

function withFailedProviderResult(task: MediaTask, providerStatusResult: unknown): MediaTask {
  return {
    ...task,
    status: "failed",
    resultData: {
      ...(task.resultData ?? {}),
      providerStatus: providerStatusResult,
      providerSummary: {
        ...(typeof task.resultData?.providerSummary === "object" && task.resultData?.providerSummary ? task.resultData.providerSummary : {}),
        status: "failed",
      },
    },
    errorMessage: task.errorMessage ?? "MCP provider reported generation failed",
    completedAt: task.completedAt ?? new Date().toISOString(),
  };
}

function withOutputPersistenceFailure(task: MediaTask, providerStatusResult: unknown, error: unknown): MediaTask {
  return {
    ...task,
    status: "failed",
    resultData: {
      ...(task.resultData ?? {}),
      providerStatus: {
        redacted: true,
        ...safeProviderSummary(providerStatusResult),
      },
      providerSummary: {
        ...(typeof task.resultData?.providerSummary === "object" && task.resultData?.providerSummary ? task.resultData.providerSummary : {}),
        status: "failed",
        outputPersistenceFailed: true,
      },
    },
    errorMessage: error instanceof Error
      ? `MCP generated media could not be saved to managed storage: ${error.message}`
      : "MCP generated media could not be saved to managed storage",
    completedAt: task.completedAt ?? new Date().toISOString(),
  };
}

async function getMcpConnectionRuntime(params: { tenantId: string; connectionId?: string | null }) {
  if (!params.connectionId) throw new Error("MCP connection id is required");
  const db = getDb();
  const [row] = await db
    .select({ connection: userMcpConnections, template: mcpProviderTemplates })
    .from(userMcpConnections)
    .innerJoin(mcpProviderTemplates, eq(userMcpConnections.providerTemplateId, mcpProviderTemplates.id))
    .where(and(
      eq(userMcpConnections.id, params.connectionId),
      eq(userMcpConnections.tenantId, params.tenantId),
    ))
    .limit(1);
  if (!row || row.connection.status !== "connected" || !row.connection.encryptedTokenRef) {
    throw new Error("MCP connection is not connected");
  }
  if (row.connection.tokenExpiresAt && row.connection.tokenExpiresAt.getTime() <= Date.now()) {
    const error = new Error("MCP connection token has expired; reconnect the provider account");
    await markMcpConnectionRequiresReauth({
      tenantId: params.tenantId,
      connectionId: params.connectionId,
      error,
    });
    throw error;
  }
  const decrypted = decrypt(row.connection.encryptedTokenRef);
  const session = decrypted ? JSON.parse(decrypted) as { accessToken?: string; tokenType?: string } : null;
  if (!session?.accessToken) throw new Error("MCP connection token is unavailable");
  return {
    mcpUrl: row.template.mcpUrl,
    accessToken: session.accessToken,
    tokenType: session.tokenType || "Bearer",
  };
}

async function callMcpTool(params: {
  mcpUrl: string;
  accessToken: string;
  tokenType: string;
  toolName: string;
  arguments: Record<string, unknown>;
}) {
  const response = await fetch(params.mcpUrl, {
    method: "POST",
    headers: {
      accept: "application/json, text/event-stream",
      "content-type": "application/json",
      authorization: `${params.tokenType.toLowerCase() === "bearer" ? "Bearer" : params.tokenType} ${params.accessToken}`,
    },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: crypto.randomUUID(),
      method: "tools/call",
      params: {
        name: params.toolName,
        arguments: params.arguments,
      },
    }),
  });
  const text = await response.text();
  if (!response.ok) {
    throw new Error(`MCP provider request failed: ${response.status}`);
  }
  const json = parseMcpJsonResponse(text);
  if (json.error) {
    throw new Error(`MCP provider tool error: ${json.error.message ?? json.error.code ?? "unknown"}`);
  }
  if (json.result?.isError) {
    const message = Array.isArray(json.result.content)
      ? json.result.content.map((item: any) => item?.text).filter(Boolean).join(" ")
      : "";
    throw new Error(`MCP provider tool error: ${message || "provider returned isError"}`);
  }
  return json.result;
}

async function uploadMagnificReferenceImages(params: {
  runtime: {
    mcpUrl: string;
    accessToken: string;
    tokenType: string;
  };
  urls: string[];
}): Promise<Array<{ type: "image"; identifier: string }>> {
  const identifiers: string[] = [];
  for (const url of params.urls) {
    const result = await callMcpTool({
      ...params.runtime,
      toolName: "creations_upload_image",
      arguments: { url },
    });
    const identifier = findProviderIdentifier(result);
    if (!identifier) {
      throw new Error("Magnific reference upload did not return a creation identifier");
    }
    identifiers.push(identifier);
  }
  return buildMagnificReferencesFromIdentifiers(identifiers);
}

async function importHiggsfieldReferenceImages(params: {
  runtime: {
    mcpUrl: string;
    accessToken: string;
    tokenType: string;
  };
  urls: string[];
  roles?: string[];
}): Promise<Array<{ value: string; role: string }>> {
  const identifiers: string[] = [];
  for (const url of params.urls) {
    const result = await callMcpTool({
      ...params.runtime,
      toolName: "media_import_url",
      arguments: { url, type: "image" },
    });
    const identifier = findProviderIdentifier(result);
    if (!identifier) {
      throw new Error("Higgsfield reference import did not return a media id");
    }
    identifiers.push(identifier);
  }
  return buildHiggsfieldMediasFromIdentifiers(identifiers, params.roles);
}

async function prepareMcpToolArguments(params: {
  runtime: {
    mcpUrl: string;
    accessToken: string;
    tokenType: string;
  };
  metadata: MediaTaskTransportMetadata;
  toolArguments: Record<string, unknown>;
  parameters: Record<string, unknown>;
}): Promise<Record<string, unknown>> {
  const referenceImageUrls = readStringArrayParameter(params.parameters, [
    "referenceImageUrls",
    "reference_image_urls",
    "image_urls",
    "imageUrls",
  ]);
  if (referenceImageUrls.length === 0) {
    return params.toolArguments;
  }

  if (
    params.metadata.providerKey === "higgsfield" &&
    (
      (params.metadata.assetType === "image" && params.metadata.toolName === "generate_image") ||
      // Video path (Vertical Drama fix — see `mcpMediaAdapter.test.ts`): this
      // branch used to be image-only, so `generate_video` requests silently
      // fell through to `return params.toolArguments` unchanged below,
      // dropping every reference/start-frame image even though the caller
      // (`generateVideoClip`) had already resolved and passed them as
      // `referenceImageUrls` — confirmed via `mcp_media_tasks.parameters
      // .referenceImageCount: 0` in production. The model's own configJson
      // (`generateType: "image-to-video"`, `supportsReferenceImages: true`)
      // confirms Higgsfield's video tool DOES accept `medias`, same as its
      // image tool.
      (params.metadata.assetType === "video" && params.metadata.toolName === "generate_video")
    )
  ) {
    const importUrls = referenceImageUrls.slice(0, 20);
    const importedMedias = await importHiggsfieldReferenceImages({
      runtime: params.runtime,
      urls: importUrls,
      roles: rolesForReferenceImageUrls(importUrls, params.parameters),
    });
    const currentParams = params.toolArguments.params && typeof params.toolArguments.params === "object"
      ? params.toolArguments.params as Record<string, unknown>
      : {};
    const existingMedias = Array.isArray(currentParams.medias) ? currentParams.medias : [];
    return {
      ...params.toolArguments,
      params: {
        ...currentParams,
        medias: [...existingMedias, ...importedMedias],
      },
    };
  }

  if (
    params.metadata.providerKey !== "magnific" ||
    params.metadata.assetType !== "image" ||
    params.metadata.toolName !== "images_generate"
  ) {
    return params.toolArguments;
  }

  const references = await uploadMagnificReferenceImages({
    runtime: params.runtime,
    urls: referenceImageUrls.slice(0, 12),
  });
  return {
    ...params.toolArguments,
    references,
  };
}

export async function submitMcpMediaGeneration(request: McpMediaGenerationRequest): Promise<MediaTask> {
  const idempotencyLockKey = buildMcpIdempotencyLockKey({
    tenantId: request.tenantId,
    userId: request.metadata.actorUserId ?? 0,
    idempotencyKey: request.metadata.idempotencyKey,
  });
  if (idempotencyLockKey) {
    const inFlight = inFlightMcpIdempotency.get(idempotencyLockKey);
    if (inFlight) return inFlight;
    const submission = submitMcpMediaGenerationUnlocked(request);
    inFlightMcpIdempotency.set(idempotencyLockKey, submission);
    try {
      return await submission;
    } finally {
      inFlightMcpIdempotency.delete(idempotencyLockKey);
    }
  }
  return submitMcpMediaGenerationUnlocked(request);
}

async function submitMcpMediaGenerationUnlocked(request: McpMediaGenerationRequest): Promise<MediaTask> {
  const existing = await findMcpMediaTaskByIdempotency({
    tenantId: request.tenantId,
    userId: request.metadata.actorUserId ?? 0,
    idempotencyKey: request.metadata.idempotencyKey,
  });
  if (existing) return existing;

  const now = new Date().toISOString();
  const taskId = request.metadata.idempotencyKey
    ? `mcp_${crypto.createHash("sha256").update(`${request.tenantId}:${request.metadata.actorUserId}:${request.metadata.idempotencyKey}`).digest("hex").slice(0, 32)}`
    : `mcp_${crypto.randomUUID()}`;
  const toolName = request.metadata.providerKey === "higgsfield"
    ? request.metadata.assetType === "image" ? "generate_image" : "generate_video"
    : request.metadata.assetType === "image" ? "images_generate" : "video_generate";
  const resolvedToolName = request.metadata.toolName || toolName;
  const rawProviderModelId = request.metadata.providerModelId || request.model;
  const providerModelId = normalizeMcpProviderModelIdForProvider({
    providerKey: request.metadata.providerKey,
    providerModelId: rawProviderModelId,
    assetType: request.metadata.assetType,
    argumentShape: request.metadata.argumentShape,
  }) ?? rawProviderModelId;
  const toolArguments = buildMcpToolArguments(
    request.metadata.assetType,
    request.prompt,
    { ...(request.parameters ?? {}), model: providerModelId, providerModelId },
    request.metadata.providerKey,
    request.metadata.argumentShape,
  );
  const metadata: MediaTaskTransportMetadata = {
    ...request.metadata,
    toolName: resolvedToolName,
    providerModelId,
    schemaHash: crypto.createHash("sha256").update(`${resolvedToolName}:${providerModelId}`).digest("hex"),
    attemptCount: 1,
  };
  await recordMcpUsageEvent({
    tenantId: request.tenantId,
    connectionId: metadata.connectionId,
    ownerUserId: metadata.ownerUserId,
    actorUserId: metadata.actorUserId,
    groupId: metadata.sharedGroupId,
    mediaTaskId: taskId,
    eventType: "generation_start",
    assetType: metadata.assetType,
    providerKey: metadata.providerKey,
    status: "submitted",
    redactedSummary: redactParameters(request.parameters),
    schemaHash: metadata.schemaHash,
  });
  let providerResult: unknown;
  let providerJobId = `provider_${crypto.randomUUID()}`;
  try {
    const runtime = await getMcpConnectionRuntime({
      tenantId: request.tenantId,
      connectionId: metadata.connectionId,
    });
    const preparedToolArguments = await prepareMcpToolArguments({
      runtime,
      metadata,
      toolArguments,
      parameters: { ...(request.parameters ?? {}), model: providerModelId, providerModelId },
    });
    providerResult = await callMcpTool({
      ...runtime,
      toolName: resolvedToolName,
      arguments: preparedToolArguments,
    });
    providerJobId = findProviderIdentifier(providerResult) ?? providerJobId;
    metadata.providerJobId = providerJobId;
    await recordMcpUsageEvent({
      tenantId: request.tenantId,
      connectionId: metadata.connectionId,
      ownerUserId: metadata.ownerUserId,
      actorUserId: metadata.actorUserId,
      groupId: metadata.sharedGroupId,
      mediaTaskId: taskId,
      eventType: "provider_request_sent",
      assetType: metadata.assetType,
      providerKey: metadata.providerKey,
      status: "submitted",
      redactedSummary: safeProviderSummary(providerResult),
      schemaHash: metadata.schemaHash,
    });
  } catch (error) {
    if (isMcpProviderAuthError(error)) {
      await markMcpConnectionRequiresReauth({
        tenantId: request.tenantId,
        connectionId: metadata.connectionId,
        error,
      });
    }
    await recordMcpUsageEvent({
      tenantId: request.tenantId,
      connectionId: metadata.connectionId,
      ownerUserId: metadata.ownerUserId,
      actorUserId: metadata.actorUserId,
      groupId: metadata.sharedGroupId,
      mediaTaskId: taskId,
      eventType: "provider_request_failed",
      assetType: metadata.assetType,
      providerKey: metadata.providerKey,
      status: "failed",
      redactedSummary: {
        errorClass: error instanceof Error ? error.name : "UnknownError",
      },
      schemaHash: metadata.schemaHash,
    });
    logMcpObservabilityEvent(buildMcpObservabilityEvent({
      event: "provider_request_failed",
      metadata,
      jobId: taskId,
      status: "failed",
      error,
      details: redactParameters(request.parameters),
    }));
    throw error;
  }
  const task: MediaTask = {
    id: taskId,
    taskId: providerJobId,
    userId: String(metadata.actorUserId ?? ""),
    mediaType: metadata.assetType,
    status: "processing",
    model: request.model,
    prompt: request.prompt,
    parameters: {
      ...request.parameters,
      transportMetadata: metadata,
    },
    resultData: {
      transportMetadata: metadata,
      creditSource: "provider_account",
      providerSummary: {
        providerKey: metadata.providerKey,
        toolName: resolvedToolName,
        providerModelId,
        status: "submitted",
        ...safeProviderSummary(providerResult),
      },
    },
    creditsUsed: 0,
    createdAt: now,
    startedAt: now,
  };
  memoryMcpMediaTasks.set(task.id, task);
  await persistMcpMediaTask(task);
  logMcpObservabilityEvent(buildMcpObservabilityEvent({
    event: "generation_start",
    metadata,
    jobId: task.id,
    providerJobId,
    status: "submitted",
    details: redactParameters(request.parameters),
  }));
  return task;
}

function buildMcpIdempotencyLockKey(params: {
  tenantId: string;
  userId: number;
  idempotencyKey?: string;
}) {
  if (!params.idempotencyKey || !params.userId) return "";
  return `${params.tenantId}:${params.userId}:${params.idempotencyKey}`;
}

export async function getMcpMediaTask(taskId: string, userId: number): Promise<MediaTask | null> {
  const memoryTask = memoryMcpMediaTasks.get(taskId);
  if (memoryTask?.userId === String(userId)) return refreshMcpMediaTaskStatus(memoryTask);
  try {
    const db = getDb();
    const [row] = await db
      .select()
      .from(mcpMediaTasksTable)
      .where(and(eq(mcpMediaTasksTable.id, taskId), eq(mcpMediaTasksTable.userId, userId)))
      .limit(1);
    return row ? refreshMcpMediaTaskStatus(rowToMediaTask(row)) : null;
  } catch {
    return null;
  }
}

export async function listMcpMediaTasks(params: {
  userId: number;
  mediaType?: "image" | "video" | "audio";
  status?: string;
  limit?: number;
}): Promise<MediaTask[]> {
  try {
    const db = getDb();
    const conditions = [eq(mcpMediaTasksTable.userId, params.userId)];
    if (params.mediaType) conditions.push(eq(mcpMediaTasksTable.mediaType, params.mediaType));
    if (params.status) conditions.push(eq(mcpMediaTasksTable.status, params.status));
    const rows = await db
      .select()
      .from(mcpMediaTasksTable)
      .where(and(...conditions))
      .orderBy(desc(mcpMediaTasksTable.createdAt))
      .limit(params.limit ?? 50);
    return Promise.all(rows.map((row) => refreshMcpMediaTaskStatus(rowToMediaTask(row))));
  } catch {
    const tasks = Array.from(memoryMcpMediaTasks.values())
    .filter((task) => task.userId === String(params.userId))
    .filter((task) => !params.mediaType || task.mediaType === params.mediaType)
    .filter((task) => !params.status || task.status === params.status)
    .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))
    .slice(0, params.limit ?? 50);
    return Promise.all(tasks.map((task) => refreshMcpMediaTaskStatus(task)));
  }
}

export async function refreshMcpMediaTaskStatus(task: MediaTask): Promise<MediaTask> {
  if (task.status !== "processing" && task.status !== "pending") return task;
  const metadata = (task.parameters?.transportMetadata ?? task.resultData?.transportMetadata) as MediaTaskTransportMetadata | undefined;
  const tenantId = metadata?.tenantId;
  const providerJobId = metadata?.providerJobId ?? task.taskId;
  if (!metadata || !tenantId || !metadata.connectionId || !providerJobId) return task;

  const toolName = providerStatusToolName(metadata);
  let providerStatusResult: unknown = null;
  let lastError: unknown = null;
  try {
    const runtime = await getMcpConnectionRuntime({ tenantId, connectionId: metadata.connectionId });
    for (const args of providerStatusArgumentCandidates(metadata, providerJobId)) {
      try {
        providerStatusResult = await callMcpTool({ ...runtime, toolName, arguments: args });
        lastError = null;
        break;
      } catch (error) {
        lastError = error;
      }
    }
    if (lastError) throw lastError;
  } catch (error) {
    logMcpObservabilityEvent(buildMcpObservabilityEvent({
      event: "provider_request_failed",
      metadata,
      jobId: task.id,
      providerJobId,
      status: "processing",
      error,
    }));
    return task;
  }

  const normalizedStatus = normalizeProviderStatus(providerStatusResult);
  if (normalizedStatus !== "completed" && normalizedStatus !== "failed") return task;
  let nextTask: MediaTask;
  if (normalizedStatus === "completed") {
    try {
      nextTask = await withCompletedProviderResult(task, providerStatusResult);
    } catch (error) {
      logMcpObservabilityEvent(buildMcpObservabilityEvent({
        event: "provider_request_failed",
        metadata,
        jobId: task.id,
        providerJobId,
        status: "failed",
        error,
        details: { stage: "output_persistence" },
      }));
      nextTask = withOutputPersistenceFailure(task, providerStatusResult, error);
    }
  } else {
    nextTask = withFailedProviderResult(task, providerStatusResult);
  }
  memoryMcpMediaTasks.set(nextTask.id, nextTask);
  await persistMcpMediaTask(nextTask);
  await recordMcpUsageEvent({
    tenantId,
    connectionId: metadata.connectionId,
    ownerUserId: metadata.ownerUserId,
    actorUserId: metadata.actorUserId,
    groupId: metadata.sharedGroupId,
    mediaTaskId: task.id,
    eventType: normalizedStatus === "completed" ? "generation_complete" : "generation_failed",
    assetType: metadata.assetType,
    providerKey: metadata.providerKey,
    status: normalizedStatus === "completed" ? "success" : "failed",
    redactedSummary: {
      providerJobId,
      outputCount: collectProviderUrls(providerStatusResult).length,
    },
    schemaHash: metadata.schemaHash,
  });
  return nextTask;
}

export async function cancelMcpMediaGeneration(task: MediaTask): Promise<MediaTask> {
  const metadata = (task.parameters?.transportMetadata ?? task.resultData?.transportMetadata) as MediaTaskTransportMetadata | undefined;
  if (metadata?.tenantId) {
    await recordMcpUsageEvent({
      tenantId: metadata.tenantId as unknown as string,
      connectionId: metadata.connectionId,
      ownerUserId: metadata.ownerUserId,
      actorUserId: metadata.actorUserId,
      groupId: metadata.sharedGroupId,
      mediaTaskId: task.id,
      eventType: "generation_cancel",
      assetType: metadata.assetType,
      providerKey: metadata.providerKey,
      status: "provider_cancel_attempted",
    });
  }
  const cancelled = { ...task, status: "cancelled" as const, completedAt: new Date().toISOString() };
  memoryMcpMediaTasks.set(task.id, cancelled);
  await persistMcpMediaTask(cancelled);
  logMcpObservabilityEvent(buildMcpObservabilityEvent({
    event: "generation_cancel",
    metadata,
    jobId: task.id,
    providerJobId: task.taskId,
    status: "cancelled",
  }));
  return cancelled;
}

async function findMcpMediaTaskByIdempotency(params: {
  tenantId: string;
  userId: number;
  idempotencyKey?: string;
}): Promise<MediaTask | null> {
  if (!params.idempotencyKey || !params.userId) return null;
  const memoryTask = Array.from(memoryMcpMediaTasks.values()).find((task) => {
    const metadata = (task.parameters?.transportMetadata ?? task.resultData?.transportMetadata) as MediaTaskTransportMetadata | undefined;
    return (
      task.userId === String(params.userId) &&
      metadata?.tenantId === params.tenantId &&
      metadata?.idempotencyKey === params.idempotencyKey
    );
  });
  if (memoryTask) return memoryTask;
  try {
    const db = getDb();
    const [row] = await db
      .select()
      .from(mcpMediaTasksTable)
      .where(and(
        eq(mcpMediaTasksTable.tenantId, params.tenantId),
        eq(mcpMediaTasksTable.userId, params.userId),
        eq(mcpMediaTasksTable.idempotencyKey, params.idempotencyKey),
      ))
      .limit(1);
    return row ? rowToMediaTask(row) : null;
  } catch {
    return null;
  }
}

async function persistMcpMediaTask(task: MediaTask): Promise<void> {
  const metadata = (task.parameters?.transportMetadata ?? task.resultData?.transportMetadata) as MediaTaskTransportMetadata | undefined;
  const tenantId = metadata?.tenantId;
  const userId = Number(task.userId);
  if (!tenantId || !Number.isFinite(userId)) return;
  try {
    const db = getDb();
    await db.insert(mcpMediaTasksTable).values({
      id: task.id,
      tenantId,
      userId,
      connectionId: metadata.connectionId ?? null,
      shareId: metadata.shareId ?? null,
      providerTaskId: task.taskId ?? metadata.providerJobId ?? null,
      idempotencyKey: metadata.idempotencyKey ?? null,
      mediaType: task.mediaType,
      status: task.status,
      model: task.model,
      prompt: task.prompt,
      parameters: task.parameters ?? {},
      resultData: task.resultData ?? {},
      errorMessage: task.errorMessage ?? null,
      createdAt: new Date(task.createdAt),
      startedAt: task.startedAt ? new Date(task.startedAt) : null,
      completedAt: task.completedAt ? new Date(task.completedAt) : null,
      updatedAt: new Date(),
    }).onConflictDoUpdate({
      target: mcpMediaTasksTable.id,
      set: {
        status: task.status,
        parameters: task.parameters ?? {},
        resultData: task.resultData ?? {},
        errorMessage: task.errorMessage ?? null,
        completedAt: task.completedAt ? new Date(task.completedAt) : null,
        updatedAt: new Date(),
      },
    });
  } catch {
    // Memory fallback keeps local dev/test flows usable when DATABASE_URL is not configured.
  }
}

function readFirstMcpMediaUrl(value: unknown, visited = new WeakSet<object>()): string | undefined {
  if (!value) return undefined;
  if (typeof value === "string") {
    const trimmed = value.trim();
    return /^https?:\/\//i.test(trimmed) ||
      trimmed.startsWith("/api/storage/") ||
      trimmed.startsWith("/uploads/")
      ? trimmed
      : undefined;
  }
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = readFirstMcpMediaUrl(item, visited);
      if (found) return found;
    }
    return undefined;
  }
  if (typeof value !== "object") return undefined;

  const record = value as Record<string, unknown>;
  if (visited.has(record)) return undefined;
  visited.add(record);

  for (const key of [
    "resultUrl",
    "result_url",
    "imageUrl",
    "image_url",
    "videoUrl",
    "video_url",
    "audioUrl",
    "audio_url",
    "outputUrls",
    "output_urls",
    "url",
  ]) {
    const found = readFirstMcpMediaUrl(record[key], visited);
    if (found) return found;
  }

  return undefined;
}

function rowToMediaTask(row: McpMediaTask): MediaTask {
  const resultUrl = readFirstMcpMediaUrl(row.resultData);
  return {
    id: row.id,
    taskId: row.providerTaskId ?? undefined,
    userId: String(row.userId),
    mediaType: row.mediaType as MediaTask["mediaType"],
    status: row.status as MediaTask["status"],
    model: row.model,
    prompt: row.prompt,
    parameters: row.parameters,
    ...(resultUrl ? { resultUrl } : {}),
    resultData: row.resultData,
    errorMessage: row.errorMessage ?? undefined,
    creditsUsed: 0,
    createdAt: row.createdAt.toISOString(),
    startedAt: row.startedAt?.toISOString(),
    completedAt: row.completedAt?.toISOString(),
  };
}
