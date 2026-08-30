import crypto from "crypto";
import { and, desc, eq, inArray, lt } from "drizzle-orm";
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
import {
  buildMcpObservabilityEvent,
  logMcpObservabilityEvent,
} from "./mcpObservability";
import { decrypt } from "./crypto";
import { assertR2StorageActive, storagePut } from "../storage";
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
/** A "processing"/"pending" MCP task older than this is eligible for the
 * stale reconciler to trigger a provider status refresh (see
 * `reconcileStaleMcpMediaTasks`). Kept generous relative to normal
 * generation times (video jobs typically resolve in minutes) so we only
 * sweep tasks that are genuinely stuck, not ones merely mid-flight. */
const MCP_STALE_TASK_THRESHOLD_MS = Math.max(
  60_000,
  Number(process.env.MCP_MEDIA_TASK_STALE_THRESHOLD_MS ?? 15 * 60_000)
);
/** Hard ceiling: once a task has been "processing"/"pending" for this long
 * with no resolution (provider unreachable, connection broken, or the
 * provider silently dropped the job without ever returning a terminal
 * status), stop waiting and mark it failed so the UI never shows eternal
 * "กำลังประมวลผล" (2026-07-07 stuck-task incident: a Higgsfield video task
 * sat in "processing" for 6+ hours after a server restart). */
const MCP_TASK_HARD_TIMEOUT_MS = Math.max(
  60 * 60_000,
  Number(process.env.MCP_MEDIA_TASK_HARD_TIMEOUT_MS ?? 24 * 60 * 60_000)
);
const MCP_IMAGE_TASK_HARD_TIMEOUT_MS = Math.max(
  60 * 60_000,
  Number(process.env.MCP_MEDIA_IMAGE_TASK_HARD_TIMEOUT_MS ?? 2 * 60 * 60_000)
);
const MCP_AUDIO_TASK_HARD_TIMEOUT_MS = Math.max(
  60 * 60_000,
  Number(process.env.MCP_MEDIA_AUDIO_TASK_HARD_TIMEOUT_MS ?? 2 * 60 * 60_000)
);
function getMcpTaskHardTimeoutMs(mediaType: MediaTask["mediaType"]): number {
  if (mediaType === "image") return MCP_IMAGE_TASK_HARD_TIMEOUT_MS;
  if (mediaType === "audio") return MCP_AUDIO_TASK_HARD_TIMEOUT_MS;
  return MCP_TASK_HARD_TIMEOUT_MS;
}
export const getMcpTaskHardTimeoutMsForTest = (
  mediaType: MediaTask["mediaType"]
): number => getMcpTaskHardTimeoutMs(mediaType);
/**
 * Past the per-type hard timeout, `refreshMcpMediaTaskStatus` now confirms
 * with the provider before writing a terminal failure (2026-07-31
 * false-failure fix: character 69 asset 154 had a genuinely completed
 * provider result overwritten by a clock-only timeout). If the provider is
 * merely unreachable (network/HTTP failure, or it keeps reporting the job
 * as still in progress with no verdict), we must not fail the task on the
 * spot — the whole point is to stop guessing and ask — but we also must not
 * retry an abandoned job forever. This multiplier bounds that grace window:
 * once a task is this many multiples of its own hard timeout past creation,
 * it is force-failed even if the provider never answers.
 *
 * Chosen as 2x (not a fixed extra duration) so it stays derived from the
 * existing per-type constants with no new env knob to maintain, and gives
 * the stale-task sweeper (`reconcileStaleMcpMediaTasks`, default hourly,
 * minimum 15-minute stale threshold) a full additional hard-timeout window
 * of repeated chances — many sweep passes — to observe the provider recover
 * from a transient outage, matching the proven case where the underlying
 * disruption was transient rather than a real provider failure. A task can
 * only ever occupy this grace window once before being force-failed, so it
 * is bounded and cannot retry forever.
 */
const MCP_TASK_ABSOLUTE_GIVE_UP_MULTIPLIER = 2;
export const getMcpTaskAbsoluteGiveUpMsForTest = (
  mediaType: MediaTask["mediaType"]
): number =>
  getMcpTaskHardTimeoutMs(mediaType) * MCP_TASK_ABSOLUTE_GIVE_UP_MULTIPLIER;
const MCP_OUTPUT_MAX_BYTES_BY_TYPE: Record<MediaTask["mediaType"], number> = {
  image: 75 * 1024 * 1024,
  video: 1024 * 1024 * 1024,
  audio: 150 * 1024 * 1024,
};
const MCP_OUTPUT_CONTENT_TYPES: Record<
  MediaTask["mediaType"],
  Record<string, string>
> = {
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
  assetType?: MediaTaskTransportMetadata["assetType"]
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
    .replace(
      /access[_-]?token["'\s:=]+[A-Za-z0-9._~+/-]+=*/gi,
      "accessToken [redacted]"
    )
    .trim();
  return message.slice(0, 128);
}

function isMcpProviderAuthError(error: unknown): boolean {
  const message = errorMessage(error);
  // A provider may use HTTP 403 for quota, entitlement, moderation, or model
  // restrictions. Those failures do not invalidate the OAuth session and must
  // not demote a healthy connection to requires_reauth. Only definitive
  // credential signals are safe to persist as an authentication failure.
  return /invalid or expired token|token (?:has )?expired|expired token|invalid token|requires re-?authentication|reauth(?:entication)? required|unauthori[sz]ed|\b401\b/i.test(
    message
  );
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
    .where(
      and(
        eq(userMcpConnections.id, params.connectionId),
        eq(userMcpConnections.tenantId, params.tenantId)
      )
    );
}

function readStringArrayParameter(
  parameters: Record<string, unknown>,
  keys: string[]
): string[] {
  for (const key of keys) {
    const value = parameters[key];
    if (Array.isArray(value)) {
      return value.map(item => String(item ?? "").trim()).filter(Boolean);
    }
    if (typeof value === "string" && value.trim()) {
      return [value.trim()];
    }
  }
  return [];
}

function buildMagnificReferencesFromIdentifiers(
  identifiers: string[]
): Array<{ type: "image"; identifier: string }> {
  return identifiers
    .map(identifier => identifier.trim())
    .filter(Boolean)
    .map(identifier => ({ type: "image" as const, identifier }));
}

function buildHiggsfieldMediasFromIdentifiers(
  identifiers: string[],
  roles?: string[]
): Array<{ value: string; role: string }> {
  return identifiers
    .map((identifier, index) => ({
      identifier: identifier.trim(),
      role: normalizeHiggsfieldMediaRole(roles?.[index]),
    }))
    .filter(entry => Boolean(entry.identifier))
    .map(entry => ({ value: entry.identifier, role: entry.role }));
}

function normalizeHiggsfieldMediaRole(role: unknown): string {
  const value = typeof role === "string" ? role.trim().toLowerCase() : "";
  if (value === "character") return "character";
  return "image";
}

function referenceImageManifestFromParameters(
  parameters: Record<string, unknown>
): Array<{ url: string; role: string }> {
  const raw =
    parameters.referenceImageManifest ?? parameters.reference_image_manifest;
  if (!Array.isArray(raw)) return [];
  return raw
    .map(entry => {
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
  parameters: Record<string, unknown>
): string[] {
  const manifest = referenceImageManifestFromParameters(parameters);
  if (manifest.length === 0) return urls.map(() => "image");
  return urls.map((url, index) => {
    const manifestEntry =
      manifest.find(entry => entry.url === url) ?? manifest[index];
    return normalizeHiggsfieldMediaRole(manifestEntry?.role);
  });
}

export function buildMcpToolArguments(
  assetType: MediaTaskTransportMetadata["assetType"],
  prompt: string,
  parameters: Record<string, unknown> = {},
  providerKey?: string | null,
  argumentShape?: string | null
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
  const aspectRatio =
    typeof parameters.aspectRatio === "string"
      ? parameters.aspectRatio
      : typeof parameters.aspect_ratio === "string"
        ? parameters.aspect_ratio
        : undefined;
  const resolution = normalizeMcpResolution(
    parameters.resolution,
    providerKey,
    assetType
  );
  if (
    providerKey === "higgsfield" ||
    argumentShape === "higgsfield.generate_image"
  ) {
    const rawModel =
      typeof parameters.providerModelId === "string"
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
    const params = Object.fromEntries(
      Object.entries({
        model,
        prompt,
        count:
          assetType === "image"
            ? typeof parameters.numImages === "number"
              ? parameters.numImages
              : 1
            : undefined,
        duration: assetType === "video" ? parameters.duration : undefined,
        aspect_ratio: aspectRatio,
        resolution,
        quality: parameters.quality,
        generate_audio: parameters.generate_audio,
        video_urls:
          referenceVideoUrls.length > 0 ? referenceVideoUrls : undefined,
        medias:
          Array.isArray(parameters.medias) && parameters.medias.length > 0
            ? parameters.medias
            : undefined,
      }).filter(
        ([, value]) => value !== undefined && value !== null && value !== ""
      )
    );
    return { params };
  }
  if (assetType === "video") {
    return {
      video: {
        model:
          typeof parameters.providerModelId === "string"
            ? parameters.providerModelId
            : typeof parameters.model === "string"
              ? parameters.model
              : undefined,
        prompt,
        aspectRatio,
        imageUrls:
          referenceImageUrls.length > 0 ? referenceImageUrls : undefined,
        reference_image_urls:
          referenceImageUrls.length > 0 ? referenceImageUrls : undefined,
        videoUrls:
          referenceVideoUrls.length > 0 ? referenceVideoUrls : undefined,
        reference_video_urls:
          referenceVideoUrls.length > 0 ? referenceVideoUrls : undefined,
      },
    };
  }
  if (
    providerKey === "magnific" ||
    argumentShape === "magnific.images_generate"
  ) {
    return Object.fromEntries(
      Object.entries({
        mode:
          typeof parameters.providerModelId === "string"
            ? parameters.providerModelId
            : typeof parameters.model === "string"
              ? parameters.model
              : undefined,
        prompt,
        aspectRatio,
        count:
          typeof parameters.numImages === "number"
            ? parameters.numImages
            : undefined,
        resolution,
        references: Array.isArray(parameters.references)
          ? parameters.references
          : undefined,
      }).filter(
        ([, value]) =>
          value !== undefined &&
          value !== null &&
          value !== "" &&
          !(Array.isArray(value) && value.length === 0)
      )
    );
  }
  return Object.fromEntries(
    Object.entries({
      model:
        typeof parameters.providerModelId === "string"
          ? parameters.providerModelId
          : typeof parameters.model === "string"
            ? parameters.model
            : undefined,
      prompt,
      aspectRatio,
      count:
        typeof parameters.numImages === "number"
          ? parameters.numImages
          : undefined,
      resolution,
    }).filter(
      ([, value]) => value !== undefined && value !== null && value !== ""
    )
  );
}

export function parseMcpJsonResponse(text: string): any {
  const trimmed = text.trim();
  if (trimmed.startsWith("{")) return JSON.parse(trimmed);
  const dataLine = trimmed.match(/(?:^|\r?\n)data:\s*(.+)(?:\r?\n|$)/)?.[1];
  if (!dataLine)
    throw new Error("MCP provider returned an unsupported response format");
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
  for (const key of [
    "creationIdentifier",
    "identifier",
    "creationId",
    "media_id",
    "mediaId",
    "jobId",
    "operationId",
    "id",
  ]) {
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
  if (!trimmed || (!trimmed.startsWith("{") && !trimmed.startsWith("[")))
    return null;
  try {
    return JSON.parse(trimmed);
  } catch {
    return null;
  }
}

function collectProviderUrls(
  value: unknown,
  urls: string[] = [],
  visited = new Set<unknown>()
): string[] {
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

function inferContentTypeFromUrl(
  url: string,
  mediaType: MediaTask["mediaType"]
): string | null {
  const cleanPath = (() => {
    try {
      return new URL(url).pathname.toLowerCase();
    } catch {
      return url.toLowerCase();
    }
  })();
  const mappings = MCP_OUTPUT_CONTENT_TYPES[mediaType];
  for (const [contentType, extension] of Object.entries(mappings)) {
    if (cleanPath.endsWith(`.${extension}`))
      return contentType === "image/jpg" ? "image/jpeg" : contentType;
  }
  if (mediaType === "image" && cleanPath.endsWith(".jpeg")) return "image/jpeg";
  if (mediaType === "video" && cleanPath.endsWith(".mov"))
    return "video/quicktime";
  if (mediaType === "audio" && cleanPath.endsWith(".m4a")) return "audio/mp4";
  return null;
}

function resolveMcpOutputContentType(
  responseContentType: string | null,
  url: string,
  mediaType: MediaTask["mediaType"]
): { contentType: string; extension: string } {
  const normalized = normalizeContentType(responseContentType);
  const allowed = MCP_OUTPUT_CONTENT_TYPES[mediaType];
  const fallback = inferContentTypeFromUrl(url, mediaType);
  const contentType =
    normalized && allowed[normalized]
      ? normalized
      : (fallback ??
        (mediaType === "video"
          ? "video/mp4"
          : mediaType === "audio"
            ? "audio/mpeg"
            : "image/png"));
  return {
    contentType: contentType === "image/jpg" ? "image/jpeg" : contentType,
    extension: allowed[contentType] ?? "bin",
  };
}

async function readResponseBytesWithLimit(
  response: Response,
  maxBytes: number
): Promise<Buffer> {
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
  fetchImpl: typeof fetch = fetch
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
  const timeout = setTimeout(
    () => controller.abort(),
    MCP_OUTPUT_FETCH_TIMEOUT_MS
  );
  try {
    const response = await fetchImpl(url, {
      signal: controller.signal,
      headers: {
        accept: `${mediaType}/*,application/octet-stream;q=0.8,*/*;q=0.5`,
      },
    });
    if (!response.ok) {
      throw new Error(
        `MCP provider output download failed: ${response.status}`
      );
    }
    const { contentType, extension } = resolveMcpOutputContentType(
      response.headers.get("content-type"),
      response.url || url,
      mediaType
    );
    const buffer = await readResponseBytesWithLimit(
      response,
      MCP_OUTPUT_MAX_BYTES_BY_TYPE[mediaType]
    );
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
  const uniqueUrls = params.urls.filter(
    (url, index, urls) => urls.indexOf(url) === index
  );
  const putObject = params.deps?.putObject ?? storagePut;
  if (!params.deps?.putObject) {
    await assertR2StorageActive();
  }
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
        storageKey: decodeURIComponent(
          url.replace(/^\/(?:api\/storage\/files|uploads)\//, "")
        ),
      });
      continue;
    }

    const { buffer, contentType, extension } = await fetchMcpProviderOutput(
      url,
      params.task.mediaType,
      params.deps?.fetchImpl
    );
    const sha256 = crypto.createHash("sha256").update(buffer).digest("hex");
    const tenantId = params.metadata?.tenantId ?? "unknown-tenant";
    const actorUserId =
      params.metadata?.actorUserId ?? params.task.userId ?? "unknown-user";
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

export const internalizeMcpProviderUrlsForTest =
  internalizeMcpProviderOutputUrls;
export const isMcpProviderAuthErrorForTest = isMcpProviderAuthError;
export const sanitizeMcpConnectionErrorMessageForTest =
  sanitizeMcpConnectionErrorMessage;
export const higgsfieldMediaRolesForReferenceImagesForTest =
  rolesForReferenceImageUrls;
export const withCompletedProviderResultForTest = withCompletedProviderResult;
export const prepareMcpToolArgumentsForTest = prepareMcpToolArguments;

function findProviderStatus(
  value: unknown,
  visited = new Set<unknown>()
): string | null {
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
  if (/complete|completed|success|succeeded|finished|done/.test(raw))
    return "completed";
  if (/fail|failed|error|rejected|cancel|cancelled|canceled/.test(raw))
    return "failed";
  if (
    /queue|queued|pending|process|processing|progress|running|submitted|created|in_progress/.test(
      raw
    )
  )
    return "processing";
  return null;
}

function providerStatusToolName(metadata: MediaTaskTransportMetadata): string {
  return metadata.providerKey === "higgsfield"
    ? "job_status"
    : "creation_status";
}

function providerStatusArgumentCandidates(
  metadata: MediaTaskTransportMetadata,
  providerJobId: string
): Record<string, unknown>[] {
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

async function withCompletedProviderResult(
  task: MediaTask,
  providerStatusResult: unknown,
  deps?: InternalizeMcpProviderUrlsDeps,
): Promise<MediaTask> {
  const providerUrls = collectProviderUrls(providerStatusResult);
  const metadata = (task.parameters?.transportMetadata ??
    task.resultData?.transportMetadata) as
    | MediaTaskTransportMetadata
    | undefined;
  const { urls, artifacts } = await internalizeMcpProviderOutputUrls({
    urls: providerUrls,
    task,
    metadata,
    deps,
  });
  const resultUrl = urls[0];
  const mediaUrlKey =
    task.mediaType === "video"
      ? "videoUrl"
      : task.mediaType === "audio"
        ? "audioUrl"
        : "imageUrl";
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
      ...(typeof task.resultData?.providerSummary === "object" &&
      task.resultData?.providerSummary
        ? task.resultData.providerSummary
        : {}),
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

function withFailedProviderResult(
  task: MediaTask,
  providerStatusResult: unknown
): MediaTask {
  return {
    ...task,
    status: "failed",
    resultData: {
      ...(task.resultData ?? {}),
      providerStatus: providerStatusResult,
      providerSummary: {
        ...(typeof task.resultData?.providerSummary === "object" &&
        task.resultData?.providerSummary
          ? task.resultData.providerSummary
          : {}),
        status: "failed",
      },
    },
    errorMessage:
      task.errorMessage ?? "MCP provider reported generation failed",
    completedAt: task.completedAt ?? new Date().toISOString(),
  };
}

function withOutputPersistenceFailure(
  task: MediaTask,
  providerStatusResult: unknown,
  error: unknown
): MediaTask {
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
        ...(typeof task.resultData?.providerSummary === "object" &&
        task.resultData?.providerSummary
          ? task.resultData.providerSummary
          : {}),
        status: "failed",
        outputPersistenceFailed: true,
      },
    },
    errorMessage:
      error instanceof Error
        ? `MCP generated media could not be saved to managed storage: ${error.message}`
        : "MCP generated media could not be saved to managed storage",
    completedAt: task.completedAt ?? new Date().toISOString(),
  };
}

async function getMcpConnectionRuntime(params: {
  tenantId: string;
  connectionId?: string | null;
}) {
  if (!params.connectionId) throw new Error("MCP connection id is required");
  const db = getDb();
  const [row] = await db
    .select({ connection: userMcpConnections, template: mcpProviderTemplates })
    .from(userMcpConnections)
    .innerJoin(
      mcpProviderTemplates,
      eq(userMcpConnections.providerTemplateId, mcpProviderTemplates.id)
    )
    .where(
      and(
        eq(userMcpConnections.id, params.connectionId),
        eq(userMcpConnections.tenantId, params.tenantId)
      )
    )
    .limit(1);
  if (
    !row ||
    row.connection.status !== "connected" ||
    !row.connection.encryptedTokenRef
  ) {
    throw new Error("MCP connection is not connected");
  }
  if (
    row.connection.tokenExpiresAt &&
    row.connection.tokenExpiresAt.getTime() <= Date.now()
  ) {
    const error = new Error(
      "MCP connection token has expired; reconnect the provider account"
    );
    await markMcpConnectionRequiresReauth({
      tenantId: params.tenantId,
      connectionId: params.connectionId,
      error,
    });
    throw error;
  }
  const decrypted = decrypt(row.connection.encryptedTokenRef);
  const session = decrypted
    ? (JSON.parse(decrypted) as { accessToken?: string; tokenType?: string })
    : null;
  if (!session?.accessToken)
    throw new Error("MCP connection token is unavailable");
  return {
    mcpUrl: row.template.mcpUrl,
    accessToken: session.accessToken,
    tokenType: session.tokenType || "Bearer",
  };
}

/**
 * Distinguishes a definitive provider-side tool error (the MCP server
 * understood the request and reported the job/tool call itself failed —
 * e.g. Higgsfield's `job_status` returning `isError: true` with "Something
 * went wrong. Please try again." for a job it no longer recognizes) from a
 * transient/network failure (HTTP 5xx, timeout, connection reset). Only the
 * former is a reliable terminal signal — a request that never reached the
 * provider or bounced off a proxy must NOT be treated as "job doesn't
 * exist", or every network blip would wrongly fail real in-progress jobs.
 */
class McpToolError extends Error {
  readonly isToolLevelError = true;
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
    throw new McpToolError(
      `MCP provider tool error: ${json.error.message ?? json.error.code ?? "unknown"}`
    );
  }
  if (json.result?.isError) {
    const message = Array.isArray(json.result.content)
      ? json.result.content
          .map((item: any) => item?.text)
          .filter(Boolean)
          .join(" ")
      : "";
    throw new McpToolError(
      `MCP provider tool error: ${message || "provider returned isError"}`
    );
  }
  return json.result;
}

/** Max attempts for a reference-image IMPORT/UPLOAD call (never for the paid
 *  generation call itself — see `callMcpToolWithTransientRetry`). */
const MCP_REFERENCE_IMPORT_MAX_ATTEMPTS = 3;
const MCP_REFERENCE_IMPORT_RETRY_BASE_MS = 1200;

/**
 * Transient provider-side failures seen while the provider fetches OUR
 * reference-image URL (Higgsfield `media_import_url` / Magnific
 * `creations_upload_image`). Our storage URL is public and serves these files
 * in well under a second (verified 2026-07-16: HTTP 200, ~1.2MB, ~0.3s from an
 * unauthenticated client), and the same URLs import fine on other runs — so
 * these messages are the provider's own fetcher hiccuping, and re-issuing the
 * identical import usually succeeds. A PERMANENT problem (bad/unsupported URL,
 * auth, quota) surfaces as a different message and must NOT be retried.
 */
function isTransientMcpImportError(error: unknown): boolean {
  const message = error instanceof Error ? error.message.toLowerCase() : "";
  if (!message) return false;
  return (
    message.includes("timeout") ||
    message.includes("timed out") ||
    message.includes("aborted") ||
    message.includes("something went wrong") ||
    message.includes("please try again") ||
    message.includes("failed: 502") ||
    message.includes("failed: 503") ||
    message.includes("failed: 504")
  );
}

/**
 * Retry wrapper for reference-image import/upload tool calls ONLY.
 *
 * Safe to retry because these tools just pull a URL into the provider's media
 * library — they don't render anything, so a duplicate import costs no provider
 * credits. Deliberately NOT used for the generation submit call, where a retry
 * could double-charge the connected provider account.
 */
async function callMcpToolWithTransientRetry(params: {
  mcpUrl: string;
  accessToken: string;
  tokenType: string;
  toolName: string;
  arguments: Record<string, unknown>;
}) {
  let lastError: unknown;
  for (
    let attempt = 1;
    attempt <= MCP_REFERENCE_IMPORT_MAX_ATTEMPTS;
    attempt += 1
  ) {
    try {
      return await callMcpTool(params);
    } catch (error) {
      lastError = error;
      if (
        attempt === MCP_REFERENCE_IMPORT_MAX_ATTEMPTS ||
        !isTransientMcpImportError(error)
      ) {
        throw error;
      }
      await new Promise(resolve =>
        setTimeout(resolve, MCP_REFERENCE_IMPORT_RETRY_BASE_MS * attempt)
      );
    }
  }
  throw lastError;
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
    const result = await callMcpToolWithTransientRetry({
      ...params.runtime,
      toolName: "creations_upload_image",
      arguments: { url },
    });
    const identifier = findProviderIdentifier(result);
    if (!identifier) {
      throw new Error(
        "Magnific reference upload did not return a creation identifier"
      );
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
    const result = await callMcpToolWithTransientRetry({
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
    ((params.metadata.assetType === "image" &&
      params.metadata.toolName === "generate_image") ||
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
      (params.metadata.assetType === "video" &&
        params.metadata.toolName === "generate_video"))
  ) {
    const importUrls = referenceImageUrls.slice(0, 20);
    const importedMedias = await importHiggsfieldReferenceImages({
      runtime: params.runtime,
      urls: importUrls,
      roles: rolesForReferenceImageUrls(importUrls, params.parameters),
    });
    const currentParams =
      params.toolArguments.params &&
      typeof params.toolArguments.params === "object"
        ? (params.toolArguments.params as Record<string, unknown>)
        : {};
    const existingMedias = Array.isArray(currentParams.medias)
      ? currentParams.medias
      : [];
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

export async function submitMcpMediaGeneration(
  request: McpMediaGenerationRequest
): Promise<MediaTask> {
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

async function submitMcpMediaGenerationUnlocked(
  request: McpMediaGenerationRequest
): Promise<MediaTask> {
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
  const toolName =
    request.metadata.providerKey === "higgsfield"
      ? request.metadata.assetType === "image"
        ? "generate_image"
        : "generate_video"
      : request.metadata.assetType === "image"
        ? "images_generate"
        : "video_generate";
  const resolvedToolName = request.metadata.toolName || toolName;
  const rawProviderModelId = request.metadata.providerModelId || request.model;
  const providerModelId =
    normalizeMcpProviderModelIdForProvider({
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
    request.metadata.argumentShape
  );
  const metadata: MediaTaskTransportMetadata = {
    ...request.metadata,
    toolName: resolvedToolName,
    providerModelId,
    schemaHash: crypto
      .createHash("sha256")
      .update(`${resolvedToolName}:${providerModelId}`)
      .digest("hex"),
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
      parameters: {
        ...(request.parameters ?? {}),
        model: providerModelId,
        providerModelId,
      },
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
    logMcpObservabilityEvent(
      buildMcpObservabilityEvent({
        event: "provider_request_failed",
        metadata,
        jobId: taskId,
        status: "failed",
        error,
        details: redactParameters(request.parameters),
      })
    );
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
  logMcpObservabilityEvent(
    buildMcpObservabilityEvent({
      event: "generation_start",
      metadata,
      jobId: task.id,
      providerJobId,
      status: "submitted",
      details: redactParameters(request.parameters),
    })
  );
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

export async function getMcpMediaTask(
  taskId: string,
  userId: number,
  tenantId?: string,
): Promise<MediaTask | null> {
  const memoryTask = memoryMcpMediaTasks.get(taskId);
  const memoryTenantId = (memoryTask?.parameters?.transportMetadata as MediaTaskTransportMetadata | undefined)?.tenantId
    ?? (memoryTask?.resultData?.transportMetadata as MediaTaskTransportMetadata | undefined)?.tenantId;
  if (memoryTask?.userId === String(userId) && (!tenantId || memoryTenantId === tenantId))
    return refreshMcpMediaTaskStatus(memoryTask);
  try {
    const db = getDb();
    const [row] = await db
      .select()
      .from(mcpMediaTasksTable)
      .where(
        and(
          eq(mcpMediaTasksTable.id, taskId),
          eq(mcpMediaTasksTable.userId, userId),
          ...(tenantId ? [eq(mcpMediaTasksTable.tenantId, tenantId)] : []),
        )
      )
      .limit(1);
    return row ? refreshMcpMediaTaskStatus(rowToMediaTask(row)) : null;
  } catch {
    return null;
  }
}

export async function listMcpMediaTasks(params: {
  userId: number;
  tenantId?: string;
  mediaType?: "image" | "video" | "audio";
  status?: string;
  limit?: number;
}): Promise<MediaTask[]> {
  try {
    const db = getDb();
    const conditions = [
      eq(mcpMediaTasksTable.userId, params.userId),
      ...(params.tenantId ? [eq(mcpMediaTasksTable.tenantId, params.tenantId)] : []),
    ];
    if (params.mediaType)
      conditions.push(eq(mcpMediaTasksTable.mediaType, params.mediaType));
    if (params.status)
      conditions.push(eq(mcpMediaTasksTable.status, params.status));
    const rows = await db
      .select()
      .from(mcpMediaTasksTable)
      .where(and(...conditions))
      .orderBy(desc(mcpMediaTasksTable.createdAt))
      .limit(params.limit ?? 50);
    return Promise.all(
      rows.map(row => refreshMcpMediaTaskStatus(rowToMediaTask(row)))
    );
  } catch {
    const tasks = Array.from(memoryMcpMediaTasks.values())
      .filter(task => task.userId === String(params.userId))
      .filter(task => {
        if (!params.tenantId) return true;
        const metadata = (task.parameters?.transportMetadata ?? task.resultData?.transportMetadata) as MediaTaskTransportMetadata | undefined;
        return metadata?.tenantId === params.tenantId;
      })
      .filter(task => !params.mediaType || task.mediaType === params.mediaType)
      .filter(task => !params.status || task.status === params.status)
      .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))
      .slice(0, params.limit ?? 50);
    return Promise.all(tasks.map(task => refreshMcpMediaTaskStatus(task)));
  }
}

export async function refreshMcpMediaTaskStatus(
  task: MediaTask
): Promise<MediaTask> {
  // Completed tasks can come from the in-memory fast path and skip
  // rowToMediaTask(), which normally derives resultUrl from resultData.
  if (task.status !== "processing" && task.status !== "pending") {
    return normalizeMcpTaskResultUrl(task);
  }
  const metadata = (task.parameters?.transportMetadata ??
    task.resultData?.transportMetadata) as
    | MediaTaskTransportMetadata
    | undefined;
  const tenantId = metadata?.tenantId;
  const providerJobId = metadata?.providerJobId ?? task.taskId;

  const createdAtMs = Date.parse(task.createdAt);
  const hardTimeoutMs = getMcpTaskHardTimeoutMs(task.mediaType);
  const isPastHardTimeout =
    Number.isFinite(createdAtMs) && Date.now() - createdAtMs > hardTimeoutMs;
  // Bounded escape hatch for a hard-timed-out task the provider genuinely
  // never answers about (see `MCP_TASK_ABSOLUTE_GIVE_UP_MULTIPLIER` doc) —
  // only consulted once `isPastHardTimeout` is already true.
  const isPastAbsoluteGiveUp =
    Number.isFinite(createdAtMs) &&
    Date.now() - createdAtMs >
      hardTimeoutMs * MCP_TASK_ABSOLUTE_GIVE_UP_MULTIPLIER;

  const writeHardTimeoutFailure = async (): Promise<MediaTask> => {
    const timedOutTask: MediaTask = {
      ...task,
      status: "failed",
      errorMessage: "หมดเวลารอผลจากผู้ให้บริการ",
      completedAt: task.completedAt ?? new Date().toISOString(),
      resultData: {
        ...(task.resultData ?? {}),
        providerSummary: {
          ...(typeof task.resultData?.providerSummary === "object" &&
          task.resultData?.providerSummary
            ? task.resultData.providerSummary
            : {}),
          status: "failed",
          hardTimeout: true,
        },
      },
    };
    memoryMcpMediaTasks.set(timedOutTask.id, timedOutTask);
    await persistMcpMediaTask(timedOutTask);
    if (metadata && tenantId && metadata.connectionId) {
      await recordMcpUsageEvent({
        tenantId,
        connectionId: metadata.connectionId,
        ownerUserId: metadata.ownerUserId,
        actorUserId: metadata.actorUserId,
        groupId: metadata.sharedGroupId,
        mediaTaskId: task.id,
        eventType: "generation_failed",
        assetType: metadata.assetType,
        providerKey: metadata.providerKey,
        status: "failed",
        redactedSummary: { providerJobId, hardTimeout: true },
        schemaHash: metadata.schemaHash,
      });
    }
    return timedOutTask;
  };

  // A hard-timed-out task with no way to ever reach the provider (no
  // metadata/connection/job id) has nothing left to confirm with — preserve
  // the previous immediate-failure behavior rather than leaving it stuck
  // "processing" forever.
  if (
    isPastHardTimeout &&
    (!metadata || !tenantId || !metadata.connectionId || !providerJobId)
  ) {
    return writeHardTimeoutFailure();
  }

  if (!metadata || !tenantId || !metadata.connectionId || !providerJobId) {
    return normalizeMcpTaskResultUrl(task);
  }

  const toolName = providerStatusToolName(metadata);
  let providerStatusResult: unknown = null;
  let lastError: unknown = null;
  // Every candidate argument shape must be rejected with a *tool-level*
  // error (the MCP server understood the call and the provider itself
  // rejected it) for this to count as a definitive "provider doesn't know
  // this job" signal below. A single network/HTTP failure anywhere in the
  // loop means we couldn't reliably reach the provider at all, so it must
  // NOT be treated as terminal.
  let allAttemptsWereToolLevelErrors = true;
  try {
    const runtime = await getMcpConnectionRuntime({
      tenantId,
      connectionId: metadata.connectionId,
    });
    for (const args of providerStatusArgumentCandidates(
      metadata,
      providerJobId
    )) {
      try {
        providerStatusResult = await callMcpTool({
          ...runtime,
          toolName,
          arguments: args,
        });
        lastError = null;
        break;
      } catch (error) {
        lastError = error;
        if (!(error instanceof McpToolError))
          allAttemptsWereToolLevelErrors = false;
      }
    }
    if (lastError) throw lastError;
  } catch (error) {
    logMcpObservabilityEvent(
      buildMcpObservabilityEvent({
        event: "provider_request_failed",
        metadata,
        jobId: task.id,
        providerJobId,
        status: "processing",
        error,
      })
    );
    if (error instanceof McpToolError && allAttemptsWereToolLevelErrors) {
      // The provider positively rejected every well-formed status lookup
      // for this job (e.g. Higgsfield `job_status` returning `isError: true`
      // for a job it no longer recognizes) — this is a terminal outcome, not
      // a transient blip. Mark the task failed so it never shows eternal
      // "processing" in the UI.
      const nextTask = withFailedProviderResult(task, {
        providerRejected: true,
        message: "ไม่พบงานนี้ฝั่งผู้ให้บริการ — กรุณาสั่งสร้างใหม่",
      });
      nextTask.errorMessage =
        "ไม่พบงานนี้ฝั่งผู้ให้บริการ — กรุณาสั่งสร้างใหม่";
      memoryMcpMediaTasks.set(nextTask.id, nextTask);
      await persistMcpMediaTask(nextTask);
      await recordMcpUsageEvent({
        tenantId,
        connectionId: metadata.connectionId,
        ownerUserId: metadata.ownerUserId,
        actorUserId: metadata.actorUserId,
        groupId: metadata.sharedGroupId,
        mediaTaskId: task.id,
        eventType: "generation_failed",
        assetType: metadata.assetType,
        providerKey: metadata.providerKey,
        status: "failed",
        redactedSummary: { providerJobId, providerRejected: true },
        schemaHash: metadata.schemaHash,
      });
      return nextTask;
    }
    // The provider was merely unreachable (network/HTTP failure, or a
    // connection runtime we couldn't obtain) rather than giving a definitive
    // verdict — must NOT be treated as terminal. If this task is hard-timed
    // out, only force-fail once the bounded absolute give-up window has also
    // elapsed; otherwise leave it for the next sweeper pass to try again.
    if (isPastHardTimeout && isPastAbsoluteGiveUp)
      return writeHardTimeoutFailure();
    return task;
  }

  const normalizedStatus = normalizeProviderStatus(providerStatusResult);
  if (normalizedStatus !== "completed" && normalizedStatus !== "failed") {
    // Reachable, but the provider has no definitive verdict yet (e.g. still
    // "processing" on its side) — same bounded give-up discipline as the
    // unreachable case above applies once hard-timed-out.
    if (isPastHardTimeout && isPastAbsoluteGiveUp)
      return writeHardTimeoutFailure();
    return task;
  }
  let nextTask: MediaTask;
  if (normalizedStatus === "completed") {
    try {
      nextTask = await withCompletedProviderResult(task, providerStatusResult);
    } catch (error) {
      logMcpObservabilityEvent(
        buildMcpObservabilityEvent({
          event: "provider_request_failed",
          metadata,
          jobId: task.id,
          providerJobId,
          status: "failed",
          error,
          details: { stage: "output_persistence" },
        })
      );
      nextTask = withOutputPersistenceFailure(
        task,
        providerStatusResult,
        error
      );
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
    eventType:
      normalizedStatus === "completed"
        ? "generation_complete"
        : "generation_failed",
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

export async function cancelMcpMediaGeneration(
  task: MediaTask
): Promise<MediaTask> {
  const metadata = (task.parameters?.transportMetadata ??
    task.resultData?.transportMetadata) as
    | MediaTaskTransportMetadata
    | undefined;
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
  const cancelled = {
    ...task,
    status: "cancelled" as const,
    completedAt: new Date().toISOString(),
  };
  memoryMcpMediaTasks.set(task.id, cancelled);
  await persistMcpMediaTask(cancelled);
  logMcpObservabilityEvent(
    buildMcpObservabilityEvent({
      event: "generation_cancel",
      metadata,
      jobId: task.id,
      providerJobId: task.taskId,
      status: "cancelled",
    })
  );
  return cancelled;
}

async function findMcpMediaTaskByIdempotency(params: {
  tenantId: string;
  userId: number;
  idempotencyKey?: string;
}): Promise<MediaTask | null> {
  if (!params.idempotencyKey || !params.userId) return null;
  const memoryTask = Array.from(memoryMcpMediaTasks.values()).find(task => {
    const metadata = (task.parameters?.transportMetadata ??
      task.resultData?.transportMetadata) as
      | MediaTaskTransportMetadata
      | undefined;
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
      .where(
        and(
          eq(mcpMediaTasksTable.tenantId, params.tenantId),
          eq(mcpMediaTasksTable.userId, params.userId),
          eq(mcpMediaTasksTable.idempotencyKey, params.idempotencyKey)
        )
      )
      .limit(1);
    return row ? rowToMediaTask(row) : null;
  } catch {
    return null;
  }
}

async function persistMcpMediaTask(task: MediaTask): Promise<void> {
  const metadata = (task.parameters?.transportMetadata ??
    task.resultData?.transportMetadata) as
    | MediaTaskTransportMetadata
    | undefined;
  const tenantId = metadata?.tenantId;
  const userId = Number(task.userId);
  if (!tenantId || !Number.isFinite(userId)) return;
  try {
    const db = getDb();
    await db
      .insert(mcpMediaTasksTable)
      .values({
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
      })
      .onConflictDoUpdate({
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

function readFirstMcpMediaUrl(
  value: unknown,
  visited = new WeakSet<object>()
): string | undefined {
  if (!value) return undefined;
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (
      /^https?:\/\//i.test(trimmed) ||
      trimmed.startsWith("/api/storage/") ||
      trimmed.startsWith("/uploads/")
    ) {
      return trimmed;
    }
    if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
      try {
        return readFirstMcpMediaUrl(JSON.parse(trimmed), visited);
      } catch {
        return undefined;
      }
    }
    return undefined;
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
    "result",
    "output",
    "response",
    "data",
    "taskResult",
    "resultJson",
    "url",
  ]) {
    const found = readFirstMcpMediaUrl(record[key], visited);
    if (found) return found;
  }

  for (const nested of Object.values(record)) {
    const found = readFirstMcpMediaUrl(nested, visited);
    if (found) return found;
  }

  return undefined;
}

function normalizeMcpTaskResultUrl(task: MediaTask): MediaTask {
  if (task.resultUrl?.trim()) return task;
  const resultUrl = readFirstMcpMediaUrl(task.resultData);
  return resultUrl ? { ...task, resultUrl } : task;
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

const MCP_STALE_RECONCILER_BATCH_SIZE = 25;
const MCP_STALE_RECONCILER_CONCURRENCY = 4;
const MCP_STALE_RECONCILER_INTERVAL_MS = Math.max(
  60_000,
  Number(process.env.MCP_MEDIA_TASK_RECONCILER_INTERVAL_MS ?? 60 * 60_000)
);

/**
 * Marker key `verticalDramaCharacters.ts`'s `generatePortraitCandidateBatch`
 * writes into every submitted candidate task's `extraParams`
 * (`__vd_portrait_candidate_asset_link_id`), used below to detect a
 * force-failed MCP task is a Vertical Drama character portrait candidate.
 * Read via a small local helper (mirroring, not importing, that router's
 * private `readMediaTaskInternalParameter`) rather than importing the router
 * module — this module is loaded at server bootstrap
 * (`startMcpStaleMediaTaskReconciler`) and must not pull tRPC router wiring
 * (`adminProcedure`, etc.) into that path.
 */
function readVdPortraitCandidateTaskMarker(
  parameters: Record<string, unknown> | undefined,
  key: string
): string | undefined {
  if (!parameters) return undefined;
  const direct = parameters[key];
  if (typeof direct === "string") return direct;
  const extra = parameters.extraParams;
  if (extra && typeof extra === "object" && !Array.isArray(extra)) {
    const value = (extra as Record<string, unknown>)[key];
    if (typeof value === "string") return value;
  }
  return undefined;
}

function readSkillBillingRunId(
  parameters: Record<string, unknown> | undefined,
): string | undefined {
  if (!parameters) return undefined;
  const direct = parameters.skill_billing_run_id;
  if (typeof direct === "string" && direct.trim()) return direct;
  const extra = parameters.extraParams;
  if (extra && typeof extra === "object" && !Array.isArray(extra)) {
    const value = (extra as Record<string, unknown>).skill_billing_run_id;
    if (typeof value === "string" && value.trim()) return value;
  }
  return undefined;
}

/**
 * When the stale-task sweep force-fails an `mcp_media_tasks` row that is a
 * Vertical Drama character portrait-candidate submission, cascade the
 * failure into the durable VD asset row AND refund the reserved credits —
 * the SAME two calls `settlePortraitCandidate`'s failed branch
 * (`verticalDramaCharacters.ts`) makes, just triggered by this background
 * sweep instead of a browser poll (2026-07-16 stuck-candidate incident: the
 * reserved credit and the "กำลังสร้าง…" card both hung forever once a tab
 * closed/timed out and nothing else ever re-ran that cascade — plan.md Set A
 * gaps 5 & 6).
 *
 * Lazy dynamic imports for both downstream calls: `routers/media.ts` pulls
 * in `adminProcedure`/full tRPC router wiring (and itself imports this
 * module for MCP transport, so a static import here would be circular);
 * `verticalDramaCharacterStock.ts` has no such cycle today, but is imported
 * lazily too for symmetry and to keep this sweep's own static import graph
 * minimal (same "worker/scheduler-safe" convention `settlePortraitCandidate`
 * already uses for `reconcileTaskCredits`).
 *
 * A no-op for any non-VD task (no marker) and safe to call more than once
 * for the same task: `reconcileTaskCredits` is idempotent via its own Redis
 * key, and `markPortraitCandidateSubmissionFailed` only acts on a candidate
 * still awaiting its task ("submitting"/"queued") — an already
 * failed/completed/selected/superseded candidate is left untouched.
 */
async function cascadeFailedVdPortraitCandidateTask(
  task: MediaTask
): Promise<void> {
  const skillRunId = readSkillBillingRunId(task.parameters);
  const taskTransportMetadata = (task.parameters?.transportMetadata ??
    task.resultData?.transportMetadata) as MediaTaskTransportMetadata | undefined;
  const taskTenantId = taskTransportMetadata?.tenantId;
  let skillCreditsReconciled = false;
  if (skillRunId) {
    try {
      const { reconcileTaskCredits } = await import("../routers/media");
      await reconcileTaskCredits({
        task: task as any,
        userId: Number(task.userId),
        tenantId: taskTenantId,
      });
      skillCreditsReconciled = true;
    } catch (error) {
      console.warn("[mcp-media] skill credit reconcile failed", {
        taskId: task.id,
        error: error instanceof Error ? error.message : error,
      });
    }
  }

  const assetLinkIdRaw = readVdPortraitCandidateTaskMarker(
    task.parameters,
    "__vd_portrait_candidate_asset_link_id"
  );
  if (!assetLinkIdRaw) return; // Not a VD portrait-candidate task — no-op.

  const seriesIdRaw = readVdPortraitCandidateTaskMarker(
    task.parameters,
    "__vd_series_id"
  );
  const metadata = taskTransportMetadata;
  const tenantId = metadata?.tenantId;
  const userId = Number(task.userId);
  const seriesId = seriesIdRaw ? Number(seriesIdRaw) : NaN;
  const assetLinkId = Number(assetLinkIdRaw);
  if (
    !tenantId ||
    !Number.isFinite(userId) ||
    !Number.isFinite(seriesId) ||
    !Number.isFinite(assetLinkId)
  ) {
    console.warn(
      "[mcp-media] VD portrait-candidate cascade skipped — incomplete task markers",
      {
        taskId: task.id,
      }
    );
    return;
  }

  if (!skillCreditsReconciled) {
    try {
      const { reconcileTaskCredits } = await import("../routers/media");
      await reconcileTaskCredits({
        task: task as any,
        userId,
        tenantId: taskTenantId,
      });
    } catch (error) {
      console.warn("[mcp-media] VD portrait-candidate credit reconcile failed", {
        taskId: task.id,
        error: error instanceof Error ? error.message : error,
      });
    }
  }

  try {
    const { verticalDramaCharacterStockService } =
      await import("./verticalDramaCharacterStock");
    await verticalDramaCharacterStockService.markPortraitCandidateSubmissionFailed(
      {
        tenantId,
        userId,
        seriesId,
        assetLinkId,
        errorMessage: task.errorMessage ?? "หมดเวลารอผลจากผู้ให้บริการ",
      }
    );
  } catch (error) {
    console.warn(
      "[mcp-media] VD portrait-candidate cascade failed to mark asset row failed",
      {
        taskId: task.id,
        error: error instanceof Error ? error.message : error,
      }
    );
  }
}

/**
 * Sweeps MCP media tasks stuck in "processing"/"pending" for longer than
 * `MCP_STALE_TASK_THRESHOLD_MS` and forces a provider status refresh for
 * each one (the same `refreshMcpMediaTaskStatus` path used on-demand by
 * `getTask`/`listTasks`), so a task never depends on the user happening to
 * open the media history/detail view for its status to ever update.
 *
 * This closes the gap from the 2026-07-07 incident: a video task created
 * shortly after a server restart sat in "processing" for 6+ hours because
 * nothing re-polled it in the background — the in-memory task map is lost
 * on restart, and without an active viewer, no on-demand refresh path was
 * ever triggered. `refreshMcpMediaTaskStatus` itself falls back to reading
 * the DB row, so restart survivability was already fine; what was missing
 * was *something* calling it periodically for tasks nobody is watching.
 *
 * Bounded concurrency + per-task error tolerance: a slow/broken provider
 * call for one task must not block or fail the sweep for the rest.
 */
export async function reconcileStaleMcpMediaTasks(): Promise<{
  scanned: number;
  changed: number;
}> {
  let scanned = 0;
  let changed = 0;
  try {
    const db = getDb();
    const staleCutoff = new Date(Date.now() - MCP_STALE_TASK_THRESHOLD_MS);
    const rows = await db
      .select()
      .from(mcpMediaTasksTable)
      .where(
        and(
          inArray(mcpMediaTasksTable.status, ["processing", "pending"]),
          lt(mcpMediaTasksTable.updatedAt, staleCutoff)
        )
      )
      .orderBy(mcpMediaTasksTable.updatedAt)
      .limit(MCP_STALE_RECONCILER_BATCH_SIZE);

    for (let i = 0; i < rows.length; i += MCP_STALE_RECONCILER_CONCURRENCY) {
      const chunk = rows.slice(i, i + MCP_STALE_RECONCILER_CONCURRENCY);
      const results = await Promise.allSettled(
        chunk.map(row => refreshMcpMediaTaskStatus(rowToMediaTask(row)))
      );
      for (const [index, result] of results.entries()) {
        scanned += 1;
        if (
          result.status === "fulfilled" &&
          result.value.status !== "processing" &&
          result.value.status !== "pending"
        ) {
          changed += 1;
          if (result.value.status === "failed") {
            await cascadeFailedVdPortraitCandidateTask(result.value);
          }
        } else if (result.status === "rejected") {
          console.warn("[mcp-media] stale task reconciler failed for task", {
            taskId: chunk[index]?.id,
            error:
              result.reason instanceof Error
                ? result.reason.message
                : result.reason,
          });
        }
      }
    }
  } catch (error) {
    console.warn("[mcp-media] stale task reconciler sweep failed", {
      error: error instanceof Error ? error.message : error,
    });
  }
  return { scanned, changed };
}

let mcpStaleTaskReconcilerTimer: ReturnType<typeof setInterval> | null = null;

export function startMcpStaleMediaTaskReconciler(): void {
  if (mcpStaleTaskReconcilerTimer) return;
  mcpStaleTaskReconcilerTimer = setInterval(() => {
    void reconcileStaleMcpMediaTasks().catch(error => {
      console.warn("[mcp-media] stale task reconciler tick failed", {
        error: error instanceof Error ? error.message : error,
      });
    });
  }, MCP_STALE_RECONCILER_INTERVAL_MS);
  // Run one pass shortly after startup too, so tasks left stuck across a
  // restart (the exact 2026-07-07 scenario) don't wait a full interval.
  setTimeout(() => {
    void reconcileStaleMcpMediaTasks().catch(error => {
      console.warn("[mcp-media] stale task reconciler startup pass failed", {
        error: error instanceof Error ? error.message : error,
      });
    });
  }, 30_000);
}

export function stopMcpStaleMediaTaskReconciler(): void {
  if (!mcpStaleTaskReconcilerTimer) return;
  clearInterval(mcpStaleTaskReconcilerTimer);
  mcpStaleTaskReconcilerTimer = null;
}
