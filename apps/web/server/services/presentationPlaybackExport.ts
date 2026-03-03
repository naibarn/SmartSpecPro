import crypto from "crypto";

import {
  PRESENTATION_ERROR_CODE,
  PRESENTATION_EXPORT_SCHEMA_VERSION,
  PRESENTATION_RENDER_SCHEMA_VERSION,
  PRESENTATION_SLIDESHOW_SCHEMA_VERSION,
} from "@shared/presentation/constants";
import {
  presentationExportResultSchema,
  presentationExportStatusResultSchema,
  presentationPlayDeckPayloadSchema,
  presentationRenderSpecSchema,
  presentationSlideshowPayloadSchema,
  type PresentationExportResult,
  type PresentationExportStatusResult,
  type PresentationPlayDeckPayload,
  type PresentationRenderSpec,
  type PresentationSlideshowPayload,
  type ResolvedAudioTrack,
  type ResolvedProjectAudioTrack,
} from "@shared/presentation/contracts";
import { eq, inArray } from "drizzle-orm";
import type { PresentationDeck, PresentationSlide } from "../../drizzle/schema";
import { libraryItems } from "../../drizzle/schema";

import { getDb } from "../db";
import type { DrizzleDB } from "../db";
import { ENV } from "../_core/env";
import { signBearerToken } from "../_core/tokens";
import { storagePresignGet } from "../storage";
import {
  createExportRecord,
  updateExportRecord,
  getExportRecord,
  getExportRecordByIdempotencyKey,
  type CreateExportRecordInput,
} from "./presentationExportService";
import {
  getPresentationDeckDetail,
  type PresentationActor,
  type PresentationDeckDetail,
  PresentationServiceError,
} from "./presentationService";
import { degradeSlidesForExport } from "./presentationExportDegradation";
import {
  incrementPresentationMetric,
  recordPresentationFailureMetric,
  recordPresentationLog,
} from "./presentationObservability";

const DEFAULT_DURATION_MS = 3000;
const DEDUPE_WINDOW_MS = 15_000;
const THROTTLE_WINDOW_MS = 60_000;
const MAX_USER_REQUESTS_PER_WINDOW = 6;
const MAX_DECK_REQUESTS_PER_WINDOW = 4;
const EXPORT_STATUS_TTL_MS = 15 * 60_000;
const EXPORT_RESULT_TTL_MS = 15 * 60_000;
const MAX_DEDUPE_REGISTRY_ENTRIES = 5_000;
const MAX_STATUS_REGISTRY_ENTRIES = 5_000;
const MAX_RESULT_REGISTRY_ENTRIES = 5_000;
const MAX_THROTTLE_KEYS = 5_000;
const MAX_THROTTLE_WINDOW_ENTRIES_PER_KEY = 120;
const EXPORT_TASK_STALE_MS = 20 * 60_000;
const DEFAULT_PYTHON_BACKEND_URL = "http://localhost:8000";

interface PresentationExportStateRecord {
  exportId: number;
  createdAtMs: number;
}

interface PresentationExportStatusStateRecord {
  createdAtMs: number;
  value: PresentationExportStatusResult & { tenantId: string; userId: number };
}

interface PresentationExportResultStateRecord {
  createdAtMs: number;
  value: PresentationExportResult;
}

interface TriggerPresentationExportDependencies {
  getDeckDetail?: (deckId: number, actor: PresentationActor) => Promise<PresentationDeckDetail>;
  enqueueExportJob?: (
    renderSpec: PresentationRenderSpec,
    format: "png" | "jpg" | "pdf" | "mp4",
    quality?: "draft" | "standard" | "high",
    userToken?: string,
  ) => Promise<{ jobId: string }>;
  userToken?: string;
  now?: () => number;
  dedupeWindowMs?: number;
  throttleWindowMs?: number;
  statusTtlMs?: number;
  resultTtlMs?: number;
  maxUserRequestsPerMinute?: number;
  maxDeckRequestsPerMinute?: number;
  maxDedupeEntries?: number;
  maxStatusEntries?: number;
  maxResultEntries?: number;
  maxThrottleKeys?: number;
  maxThrottleWindowEntriesPerKey?: number;
  acceptedRenderSchemaVersions?: string[];
  recordMetric?: (metric: string, tags?: Record<string, string>) => void;
  recordLog?: (event: string, payload: Record<string, unknown>) => void;
}

interface BuildSlideshowOptions {
  deckId?: number;
  generatedAt?: Date;
  defaultDurationMs?: number;
}

interface BuildRenderSpecInput {
  deck: Pick<PresentationDeck, "id">;
  slides: PresentationSlide[];
  format: "png" | "jpg" | "pdf" | "mp4";
  width?: number;
  height?: number;
  fps?: number;
  /**
   * Per-slide resolved audio tracks, keyed by slide ID.
   * When present, the corresponding audioTrack is embedded into the render spec
   * so that `resolveAudioUrls` can resolve libraryItemId → presigned URL.
   * Populated by `resolveSlideAudioData` before calling `buildPresentationRenderSpec`.
   */
  slideAudioMap?: Map<number, ResolvedAudioTrack>;
  /**
   * Deck-level background audio track.
   * Contains either a resolved URL or a libraryItemId that `resolveAudioUrls` will resolve.
   */
  resolvedProjectAudioTrack?: ResolvedProjectAudioTrack | null;
}

export interface TriggerPresentationExportInput {
  deckId: number;
  format: "png" | "jpg" | "pdf" | "mp4";
  quality?: "draft" | "standard" | "high";
  idempotencyKey: string;
  width?: number;
  height?: number;
}

const dedupeRegistry = new Map<string, PresentationExportStateRecord>();
const statusRegistry = new Map<number, PresentationExportStatusStateRecord>();
const resultRegistry = new Map<number, PresentationExportResultStateRecord>();
const userWindowRegistry = new Map<string, number[]>();
const deckWindowRegistry = new Map<string, number[]>();

function nextId(prefix: string): string {
  return `${prefix}-${crypto.randomUUID()}`;
}

// Fallback in-memory ID counter for test environments without a DB connection.
let exportIdSequence = 0;
function nextExportId(): number {
  exportIdSequence += 1;
  return exportIdSequence;
}

function resolvePythonBackendBaseUrl(): string {
  const candidate =
    ENV.pythonBackendUrl?.trim()
    || process.env.PYTHON_BACKEND_URL?.trim()
    || process.env.VITE_PYTHON_BACKEND_URL?.trim()
    || DEFAULT_PYTHON_BACKEND_URL;
  return candidate.replace(/\/+$/, "");
}

function extractStorageKeyFromSourceUrl(sourceUrl: string): string | null {
  const trimmed = sourceUrl.trim();
  if (!trimmed) {
    return null;
  }

  const decodeKey = (raw: string): string | null => {
    const cleaned = raw.replace(/^\/+/, "").trim();
    if (!cleaned) {
      return null;
    }
    try {
      return decodeURIComponent(cleaned);
    } catch {
      return cleaned;
    }
  };

  if (trimmed.startsWith("/api/storage/files/")) {
    return decodeKey(trimmed.slice("/api/storage/files/".length));
  }
  if (trimmed.startsWith("/uploads/")) {
    return decodeKey(trimmed.slice("/uploads/".length));
  }
  if (trimmed.startsWith("/")) {
    return null;
  }
  if (/^https?:\/\//i.test(trimmed)) {
    try {
      const parsed = new URL(trimmed);
      if (parsed.pathname.startsWith("/api/storage/files/")) {
        return decodeKey(parsed.pathname.slice("/api/storage/files/".length));
      }
      if (parsed.pathname.startsWith("/uploads/")) {
        return decodeKey(parsed.pathname.slice("/uploads/".length));
      }
      return null;
    } catch {
      return null;
    }
  }

  return decodeKey(trimmed);
}

async function resolveAudioSourceUrl(sourceUrl: string | null): Promise<string | null> {
  if (!sourceUrl) {
    return null;
  }
  const trimmed = sourceUrl.trim();
  if (!trimmed) {
    return null;
  }

  const key = extractStorageKeyFromSourceUrl(trimmed);
  if (!key) {
    return trimmed;
  }

  try {
    const presigned = await storagePresignGet(key, 3600);
    return presigned?.url ?? trimmed;
  } catch {
    return trimmed;
  }
}

function resolveRenderDimensions(input: BuildRenderSpecInput): { width: number; height: number } {
  if (input.width && input.height) {
    return { width: input.width, height: input.height };
  }

  // Prefer deck canvas size from the first slide (ordered) when explicit size is not provided.
  const orderedSlides = [...input.slides].sort((a, b) => {
    if (a.orderIndex === b.orderIndex) return a.id - b.id;
    return a.orderIndex - b.orderIndex;
  });
  const firstSlideContent = orderedSlides[0]?.slideContent as Record<string, unknown> | undefined;
  const canvas = firstSlideContent?.canvas as Record<string, unknown> | undefined;
  const canvasWidth = Number(canvas?.width);
  const canvasHeight = Number(canvas?.height);

  if (Number.isFinite(canvasWidth) && Number.isFinite(canvasHeight) && canvasWidth > 0 && canvasHeight > 0) {
    return { width: Math.round(canvasWidth), height: Math.round(canvasHeight) };
  }

  return { width: input.width ?? 1920, height: input.height ?? 1080 };
}

function hasRenderableVideoElements(slides: PresentationSlide[]): boolean {
  for (const slide of slides) {
    const content =
      slide.slideContent && typeof slide.slideContent === "object" && !Array.isArray(slide.slideContent)
        ? (slide.slideContent as Record<string, unknown>)
        : null;
    const elements = Array.isArray(content?.elements) ? content.elements : [];
    for (const rawElement of elements) {
      if (!rawElement || typeof rawElement !== "object") continue;
      const element = rawElement as Record<string, unknown>;
      if (String(element.type ?? "").toLowerCase() !== "video") continue;
      const src = typeof element.src === "string" ? element.src.trim() : "";
      if (src.length > 0) {
        return true;
      }
    }
  }
  return false;
}

function pruneWindow(entries: number[], nowMs: number, windowMs: number): number[] {
  const floor = nowMs - windowMs;
  return entries.filter((ts) => ts > floor);
}

function trimRegistryByAge<K, V extends { createdAtMs: number }>(
  registry: Map<K, V>,
  nowMs: number,
  ttlMs: number,
): void {
  for (const [key, record] of registry.entries()) {
    if (nowMs - record.createdAtMs > ttlMs) {
      registry.delete(key);
    }
  }
}

function trimRegistryToMaxEntries<K, V extends { createdAtMs: number }>(
  registry: Map<K, V>,
  maxEntries: number,
): void {
  if (registry.size <= maxEntries) {
    return;
  }

  const sorted = [...registry.entries()].sort((a, b) => a[1].createdAtMs - b[1].createdAtMs);
  const deleteCount = registry.size - maxEntries;
  for (let index = 0; index < deleteCount; index += 1) {
    registry.delete(sorted[index][0]);
  }
}

function evictOldestThrottleKey(registry: Map<string, number[]>): void {
  let oldestKey: string | null = null;
  let oldestActivity = Number.POSITIVE_INFINITY;

  for (const [key, entries] of registry.entries()) {
    const latest = entries[entries.length - 1] ?? Number.NEGATIVE_INFINITY;
    if (latest < oldestActivity) {
      oldestActivity = latest;
      oldestKey = key;
    }
  }

  if (oldestKey !== null) {
    registry.delete(oldestKey);
  }
}

function compactThrottleRegistry(
  registry: Map<string, number[]>,
  nowMs: number,
  windowMs: number,
  maxKeys: number,
  maxEntriesPerKey: number,
): void {
  for (const [key, entries] of registry.entries()) {
    const active = pruneWindow(entries, nowMs, windowMs).slice(-maxEntriesPerKey);
    if (active.length === 0) {
      registry.delete(key);
      continue;
    }
    registry.set(key, active);
  }

  while (registry.size > maxKeys) {
    evictOldestThrottleKey(registry);
  }
}

function compactExportState(
  nowMs: number,
  options: {
    dedupeWindowMs: number;
    statusTtlMs: number;
    resultTtlMs: number;
    throttleWindowMs: number;
    maxDedupeEntries: number;
    maxStatusEntries: number;
    maxResultEntries: number;
    maxThrottleKeys: number;
    maxThrottleWindowEntriesPerKey: number;
  },
): void {
  trimRegistryByAge(dedupeRegistry, nowMs, options.dedupeWindowMs);
  trimRegistryByAge(statusRegistry, nowMs, options.statusTtlMs);
  trimRegistryByAge(resultRegistry, nowMs, options.resultTtlMs);

  for (const [dedupeKey, dedupeState] of dedupeRegistry.entries()) {
    if (!statusRegistry.has(dedupeState.exportId) || !resultRegistry.has(dedupeState.exportId)) {
      dedupeRegistry.delete(dedupeKey);
    }
  }

  trimRegistryToMaxEntries(dedupeRegistry, options.maxDedupeEntries);
  trimRegistryToMaxEntries(statusRegistry, options.maxStatusEntries);
  trimRegistryToMaxEntries(resultRegistry, options.maxResultEntries);

  compactThrottleRegistry(
    userWindowRegistry,
    nowMs,
    options.throttleWindowMs,
    options.maxThrottleKeys,
    options.maxThrottleWindowEntriesPerKey,
  );
  compactThrottleRegistry(
    deckWindowRegistry,
    nowMs,
    options.throttleWindowMs,
    options.maxThrottleKeys,
    options.maxThrottleWindowEntriesPerKey,
  );
}

function getDefaultStateOptions(nowMs: number) {
  return {
    dedupeWindowMs: DEDUPE_WINDOW_MS,
    statusTtlMs: EXPORT_STATUS_TTL_MS,
    resultTtlMs: EXPORT_RESULT_TTL_MS,
    throttleWindowMs: THROTTLE_WINDOW_MS,
    maxDedupeEntries: MAX_DEDUPE_REGISTRY_ENTRIES,
    maxStatusEntries: MAX_STATUS_REGISTRY_ENTRIES,
    maxResultEntries: MAX_RESULT_REGISTRY_ENTRIES,
    maxThrottleKeys: MAX_THROTTLE_KEYS,
    maxThrottleWindowEntriesPerKey: MAX_THROTTLE_WINDOW_ENTRIES_PER_KEY,
    nowMs,
  };
}

function enforceThrottle(
  key: string,
  limit: number,
  nowMs: number,
  windowMs: number,
  registry: Map<string, number[]>,
  maxKeys: number,
  maxEntriesPerKey: number,
): void {
  let active = pruneWindow(registry.get(key) ?? [], nowMs, windowMs).slice(-maxEntriesPerKey);
  if (active.length >= limit) {
    const oldest = active[0] ?? nowMs;
    const retryAfterSeconds = Math.max(1, Math.ceil((windowMs - (nowMs - oldest)) / 1000));
    throw new PresentationServiceError(
      PRESENTATION_ERROR_CODE.EXPORT_THROTTLED,
      `${PRESENTATION_ERROR_CODE.EXPORT_THROTTLED}: too many export requests`,
      { retryAfterSeconds },
    );
  }

  if (!registry.has(key) && registry.size >= maxKeys) {
    evictOldestThrottleKey(registry);
  }

  active.push(nowMs);
  active = active.slice(-maxEntriesPerKey);
  if (active.length === 0) {
    registry.delete(key);
  } else {
    registry.set(key, active);
  }
}

function resolveDedupeKey(input: TriggerPresentationExportInput, actor: PresentationActor): string {
  const key = input.idempotencyKey?.trim() || "no-idempotency-key";
  return `${actor.tenantId}:${actor.userId}:${input.deckId}:${input.format}:${key}`;
}

function isIdempotencyUniqueConstraintError(error: unknown): boolean {
  const err = error as {
    code?: string;
    constraint?: string;
    cause?: { code?: string; constraint?: string };
  };
  const code = err?.code ?? err?.cause?.code;
  const constraint = err?.constraint ?? err?.cause?.constraint;
  return code === "23505" && constraint === "presentation_exports_idempotency_key_unique";
}

function shouldMarkExportTaskStale(record: { updatedAt: Date }, pythonState: { state?: string; percent?: number; stage?: string }): boolean {
  const state = pythonState.state?.toLowerCase();
  const percent = typeof pythonState.percent === "number" ? pythonState.percent : 0;
  const stage = typeof pythonState.stage === "string" ? pythonState.stage.trim() : "";
  if (state !== "queued") return false;
  if (percent > 0 || stage.length > 0) return false;
  return Date.now() - record.updatedAt.getTime() >= EXPORT_TASK_STALE_MS;
}

function resolveDependencies(
  dependencies?: TriggerPresentationExportDependencies,
): Required<TriggerPresentationExportDependencies> {
  return {
    getDeckDetail: dependencies?.getDeckDetail ?? getPresentationDeckDetail,
    enqueueExportJob: dependencies?.enqueueExportJob ?? defaultEnqueueExportJob,
    userToken: dependencies?.userToken,
    now: dependencies?.now ?? Date.now,
    dedupeWindowMs: dependencies?.dedupeWindowMs ?? DEDUPE_WINDOW_MS,
    throttleWindowMs: dependencies?.throttleWindowMs ?? THROTTLE_WINDOW_MS,
    statusTtlMs: dependencies?.statusTtlMs ?? EXPORT_STATUS_TTL_MS,
    resultTtlMs: dependencies?.resultTtlMs ?? EXPORT_RESULT_TTL_MS,
    maxUserRequestsPerMinute: dependencies?.maxUserRequestsPerMinute ?? MAX_USER_REQUESTS_PER_WINDOW,
    maxDeckRequestsPerMinute: dependencies?.maxDeckRequestsPerMinute ?? MAX_DECK_REQUESTS_PER_WINDOW,
    maxDedupeEntries: dependencies?.maxDedupeEntries ?? MAX_DEDUPE_REGISTRY_ENTRIES,
    maxStatusEntries: dependencies?.maxStatusEntries ?? MAX_STATUS_REGISTRY_ENTRIES,
    maxResultEntries: dependencies?.maxResultEntries ?? MAX_RESULT_REGISTRY_ENTRIES,
    maxThrottleKeys: dependencies?.maxThrottleKeys ?? MAX_THROTTLE_KEYS,
    maxThrottleWindowEntriesPerKey:
      dependencies?.maxThrottleWindowEntriesPerKey ?? MAX_THROTTLE_WINDOW_ENTRIES_PER_KEY,
    acceptedRenderSchemaVersions: dependencies?.acceptedRenderSchemaVersions ?? [PRESENTATION_RENDER_SCHEMA_VERSION],
    recordMetric: dependencies?.recordMetric ?? ((metric: string) => incrementPresentationMetric(metric)),
    recordLog: dependencies?.recordLog ?? recordPresentationLog,
  };
}

/**
 * Resolve libraryItemId references in audio tracks to presigned GET URLs.
 * Returns a new render spec with audioTrack.url populated on each slide
 * and on the projectAudioTrack (if present). The libraryItemId field is
 * removed from the resolved track.
 *
 * Uses 1-hour presigned URLs — sufficient for the 12-minute Celery task limit.
 */
async function resolveAudioUrls(
  renderSpec: PresentationRenderSpec,
  db: DrizzleDB,
): Promise<PresentationRenderSpec> {
  const resolvedSlides = await Promise.all(
    renderSpec.slides.map(async (slide) => {
      if (!slide.audioTrack) return slide;
      // Audio tracks stored in DB may carry a libraryItemId (from AudioTrackInput) before
      // resolution. The render spec schema types this field as ResolvedAudioTrack (has `url`)
      // but at runtime an unresolved track will have `libraryItemId` instead.
      // This mismatch will be fully typed once section-09 finalises the slide audio data model.
      const hasLibraryItemId =
        "libraryItemId" in slide.audioTrack &&
        typeof (slide.audioTrack as Record<string, unknown>).libraryItemId === "number";
      if (!hasLibraryItemId) return slide;
      const libraryItemId = (slide.audioTrack as Record<string, unknown>).libraryItemId as number;
      const [item] = await db
        .select()
        .from(libraryItems)
        .where(eq(libraryItems.id, libraryItemId))
        .limit(1);
      const url = await resolveAudioSourceUrl(item?.sourceUrl ?? null);
      if (!url) return slide;
      const resolved: ResolvedAudioTrack = {
        url,
        volume: slide.audioTrack.volume,
        startAtMs: slide.audioTrack.startAtMs,
        endAtMs: slide.audioTrack.endAtMs,
      };
      return { ...slide, audioTrack: resolved };
    }),
  );

  let resolvedProjectAudioTrack = renderSpec.projectAudioTrack;
  if (resolvedProjectAudioTrack) {
    // Same libraryItemId resolution pattern as per-slide tracks above.
    const hasLibraryItemId =
      "libraryItemId" in resolvedProjectAudioTrack &&
      typeof (resolvedProjectAudioTrack as Record<string, unknown>).libraryItemId === "number";
    if (hasLibraryItemId) {
      const libraryItemId = (resolvedProjectAudioTrack as Record<string, unknown>)
        .libraryItemId as number;
      const [item] = await db
        .select()
        .from(libraryItems)
        .where(eq(libraryItems.id, libraryItemId))
        .limit(1);
      const url = await resolveAudioSourceUrl(item?.sourceUrl ?? null);
      if (url) {
        resolvedProjectAudioTrack = {
          url,
          volume: resolvedProjectAudioTrack.volume,
          startAtMs: resolvedProjectAudioTrack.startAtMs,
          endAtMs: resolvedProjectAudioTrack.endAtMs,
          loop: resolvedProjectAudioTrack.loop,
          fadeOutMs: resolvedProjectAudioTrack.fadeOutMs,
        } satisfies ResolvedProjectAudioTrack;
      }
    }
  }

  return { ...renderSpec, slides: resolvedSlides, projectAudioTrack: resolvedProjectAudioTrack };
}

async function defaultEnqueueExportJob(
  renderSpec: PresentationRenderSpec,
  format: "png" | "jpg" | "pdf" | "mp4",
  quality?: "draft" | "standard" | "high",
  userToken?: string,
): Promise<{ jobId: string }> {
  const db = await getDb();
  if (!db) {
    // No DB configured — return a stub job ID (test/local environment)
    return { jobId: nextId("presentation-job") };
  }

  const resolvedSpec = await resolveAudioUrls(renderSpec, db);

  const requestBody = {
    render_spec: resolvedSpec,
    format,
    quality: quality ?? "standard",
  };

  const token = userToken?.trim() || signBearerToken(
    { sub: "internal-render-service", scopes: ["internal:render"] },
    "30m",
  );

  const pythonBackendBaseUrl = resolvePythonBackendBaseUrl();
  const response = await fetch(`${pythonBackendBaseUrl}/api/v1/presentations/export`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(requestBody),
  });

  if (!response.ok) {
    throw new PresentationServiceError(
      PRESENTATION_ERROR_CODE.VALIDATION_FAILED,
      `${PRESENTATION_ERROR_CODE.VALIDATION_FAILED}: Python export bridge returned HTTP ${response.status}`,
    );
  }

  const json = (await response.json()) as { celery_task_id: string };
  return { jobId: json.celery_task_id };
}

function ensureRenderSchemaAccepted(
  renderSpec: PresentationRenderSpec,
  acceptedRenderSchemaVersions: string[],
): void {
  if (acceptedRenderSchemaVersions.includes(renderSpec.schemaVersion)) {
    return;
  }
  throw new PresentationServiceError(
    PRESENTATION_ERROR_CODE.RENDER_SCHEMA_MISMATCH,
    `${PRESENTATION_ERROR_CODE.RENDER_SCHEMA_MISMATCH}: unknown render schema "${renderSpec.schemaVersion}"`,
    {
      acceptedRenderSchemaVersions,
      schemaVersion: renderSpec.schemaVersion,
    },
  );
}

export function buildSlideshowPayload(
  slides: PresentationSlide[],
  options?: BuildSlideshowOptions,
): PresentationSlideshowPayload {
  const defaultDurationMs = options?.defaultDurationMs ?? DEFAULT_DURATION_MS;
  const deckId = options?.deckId ?? (slides[0]?.deckId ?? 1);
  const degraded = degradeSlidesForExport(slides, defaultDurationMs);

  return presentationSlideshowPayloadSchema.parse({
    schemaVersion: PRESENTATION_SLIDESHOW_SCHEMA_VERSION,
    deckId,
    generatedAt: options?.generatedAt ?? new Date(),
    slides: degraded.slides,
  });
}

/**
 * Builds a PresentationPlayDeckPayload from a deck detail + slideshow payload.
 * Resolves libraryItemId references in audio tracks to presigned S3/R2 URLs.
 * Called by the getPlayDeck tRPC procedure for play mode.
 * Falls back to returning the unmodified slideshow payload when no DB is available.
 */
export async function buildPlayDeckPayload(
  detail: PresentationDeckDetail,
  slideshowPayload: PresentationSlideshowPayload,
): Promise<PresentationPlayDeckPayload> {
  const db = await getDb();
  if (!db) {
    // DB unavailable — degrade gracefully: return payload without audio URL resolution.
    // Play mode will function but audio tracks will be absent. Warning logged for observability.
    console.warn("[buildPlayDeckPayload] DB unavailable — returning payload without audio resolution");
    return presentationPlayDeckPayloadSchema.parse(slideshowPayload);
  }

  // Collect all distinct libraryItemIds needed (slides + deck project audio) in one batch query.
  const dbSlideMap = new Map(detail.slides.map((s) => [s.id, s]));
  const slideItemIds = detail.slides
    .map((s) => s.audioTrack?.libraryItemId)
    .filter((id): id is number => id !== undefined && id !== null);
  const projectItemId = detail.deck.projectAudioTrack?.libraryItemId;
  const allItemIds = Array.from(new Set([...slideItemIds, ...(projectItemId ? [projectItemId] : [])]));

  // Single batch query instead of N per-slide queries
  const itemRows =
    allItemIds.length > 0
      ? await db.select().from(libraryItems).where(inArray(libraryItems.id, allItemIds))
      : [];
  const itemMap = new Map(itemRows.map((r) => [r.id, r]));

  // Resolve presigned URLs in parallel (one per distinct item)
  const urlCache = new Map<number, string | null>();
  await Promise.all(
    allItemIds.map(async (id) => {
      const item = itemMap.get(id);
      urlCache.set(id, await resolveAudioSourceUrl(item?.sourceUrl ?? null));
    }),
  );

  // Enrich each slideshow slide with resolved audio track from DB slide
  const enrichedSlides = slideshowPayload.slides.map((slide) => {
    const dbSlide = dbSlideMap.get(slide.slideId);
    if (!dbSlide?.audioTrack) return slide;
    const audioJson = dbSlide.audioTrack;
    const url = urlCache.get(audioJson.libraryItemId);
    if (!url) return slide;
    const resolved: ResolvedAudioTrack = {
      url,
      volume: audioJson.volume,
      startAtMs: audioJson.startAtMs,
      endAtMs: audioJson.endAtMs ?? undefined,
    };
    return { ...slide, audioTrack: resolved };
  });

  // Resolve deck-level project audio track
  let resolvedProjectAudioTrack: ResolvedProjectAudioTrack | null | undefined;
  const dbProjectAudio = detail.deck.projectAudioTrack;
  if (dbProjectAudio) {
    const url = urlCache.get(dbProjectAudio.libraryItemId);
    if (url) {
      resolvedProjectAudioTrack = {
        url,
        volume: dbProjectAudio.volume,
        startAtMs: dbProjectAudio.startAtMs ?? 0,
        endAtMs: dbProjectAudio.endAtMs ?? undefined,
        loop: dbProjectAudio.loop,
        fadeOutMs: dbProjectAudio.fadeOutMs ?? undefined,
      };
    }
  }

  return presentationPlayDeckPayloadSchema.parse({
    ...slideshowPayload,
    slides: enrichedSlides,
    ...(resolvedProjectAudioTrack !== undefined && { projectAudioTrack: resolvedProjectAudioTrack }),
  });
}

/**
 * Resolve libraryItemId references on a deck detail into audio track maps for render spec assembly.
 *
 * Performs a single batch DB query for all distinct libraryItemIds, then fetches
 * presigned URLs in parallel — the same pattern used by `buildPlayDeckPayload`.
 *
 * @returns slideAudioMap  — per-slide resolved audio track keyed by slideId
 * @returns resolvedProjectAudioTrack — deck-level background track, or null if absent/unresolvable
 */
async function resolveSlideAudioData(
  detail: PresentationDeckDetail,
  db: DrizzleDB,
): Promise<{
  slideAudioMap: Map<number, ResolvedAudioTrack>;
  resolvedProjectAudioTrack: ResolvedProjectAudioTrack | null;
}> {
  // Collect all distinct libraryItemIds needed in one batch query.
  const slideItemIds = detail.slides
    .map((s) => s.audioTrack?.libraryItemId)
    .filter((id): id is number => id !== undefined && id !== null);
  const projectItemId = detail.deck.projectAudioTrack?.libraryItemId;
  const allItemIds = Array.from(
    new Set([...slideItemIds, ...(projectItemId !== undefined && projectItemId !== null ? [projectItemId] : [])]),
  );

  const itemRows =
    allItemIds.length > 0
      ? await db.select().from(libraryItems).where(inArray(libraryItems.id, allItemIds))
      : [];
  const itemMap = new Map(itemRows.map((r) => [r.id, r]));

  // Resolve presigned URLs in parallel — one per distinct item.
  const urlCache = new Map<number, string | null>();
  await Promise.all(
    allItemIds.map(async (id) => {
      const item = itemMap.get(id);
      urlCache.set(id, await resolveAudioSourceUrl(item?.sourceUrl ?? null));
    }),
  );

  // Build per-slide audio track map.
  const slideAudioMap = new Map<number, ResolvedAudioTrack>();
  for (const slide of detail.slides) {
    const audioJson = slide.audioTrack;
    if (!audioJson) continue;
    const url = urlCache.get(audioJson.libraryItemId);
    if (!url) continue;
    slideAudioMap.set(slide.id, {
      url,
      volume: audioJson.volume,
      startAtMs: audioJson.startAtMs,
      endAtMs: audioJson.endAtMs ?? undefined,
    });
  }

  // Resolve deck-level project audio track.
  let resolvedProjectAudioTrack: ResolvedProjectAudioTrack | null = null;
  const dbProjectAudio = detail.deck.projectAudioTrack;
  if (dbProjectAudio) {
    const url = urlCache.get(dbProjectAudio.libraryItemId);
    if (url) {
      resolvedProjectAudioTrack = {
        url,
        volume: dbProjectAudio.volume,
        startAtMs: dbProjectAudio.startAtMs ?? 0,
        endAtMs: dbProjectAudio.endAtMs ?? undefined,
        loop: dbProjectAudio.loop,
        fadeOutMs: dbProjectAudio.fadeOutMs ?? undefined,
      };
    }
  }

  return { slideAudioMap, resolvedProjectAudioTrack };
}

export function buildPresentationRenderSpec(input: BuildRenderSpecInput): PresentationRenderSpec {
  const { width, height } = resolveRenderDimensions(input);
  const degraded = degradeSlidesForExport(input.slides, DEFAULT_DURATION_MS);
  const hasDynamicVideo = input.format === "mp4" && hasRenderableVideoElements(input.slides);

  // Enrich degraded slides with resolved audio tracks when available.
  // The slideAudioMap is keyed by slideId and contains already-resolved tracks
  // (url present) or tracks that still carry libraryItemId (resolved later by
  // resolveAudioUrls inside defaultEnqueueExportJob).
  const enrichedSlides = degraded.slides.map((slide) => {
    const audioTrack = input.slideAudioMap?.get(slide.slideId);
    if (!audioTrack) return slide;
    return { ...slide, audioTrack };
  });

  const slideshowPayload = presentationSlideshowPayloadSchema.parse({
    schemaVersion: PRESENTATION_SLIDESHOW_SCHEMA_VERSION,
    deckId: input.deck.id,
    generatedAt: new Date(),
    slides: enrichedSlides,
    ...(input.resolvedProjectAudioTrack !== undefined && {
      projectAudioTrack: input.resolvedProjectAudioTrack,
    }),
  });

  return presentationRenderSpecSchema.parse({
    schemaVersion: PRESENTATION_RENDER_SCHEMA_VERSION,
    deckId: input.deck.id,
    format: input.format,
    width,
    height,
    fps: input.fps ?? 30,
    slides: slideshowPayload.slides,
    ...(hasDynamicVideo ? { hasDynamicVideo: true } : {}),
    projectAudioTrack: slideshowPayload.projectAudioTrack,
    warnings: degraded.warnings,
  });
}

export async function triggerPresentationExport(
  input: TriggerPresentationExportInput,
  actor: PresentationActor,
  dependencies?: TriggerPresentationExportDependencies,
): Promise<PresentationExportResult> {
  const resolved = resolveDependencies(dependencies);
  const nowMs = resolved.now();
  compactExportState(nowMs, {
    dedupeWindowMs: resolved.dedupeWindowMs,
    statusTtlMs: resolved.statusTtlMs,
    resultTtlMs: resolved.resultTtlMs,
    throttleWindowMs: resolved.throttleWindowMs,
    maxDedupeEntries: resolved.maxDedupeEntries,
    maxStatusEntries: resolved.maxStatusEntries,
    maxResultEntries: resolved.maxResultEntries,
    maxThrottleKeys: resolved.maxThrottleKeys,
    maxThrottleWindowEntriesPerKey: resolved.maxThrottleWindowEntriesPerKey,
  });
  try {
    const db = await getDb(); // resolved once and reused throughout this call
    let dedupeKey = resolveDedupeKey(input, actor);
    const dedupeHit = dedupeRegistry.get(dedupeKey);
    if (dedupeHit && nowMs - dedupeHit.createdAtMs <= resolved.dedupeWindowMs) {
      const existing = statusRegistry.get(dedupeHit.exportId)?.value;
      const existingResult = resultRegistry.get(dedupeHit.exportId)?.value;
      if (existing !== undefined && existingResult !== undefined) {
        resolved.recordMetric("presentation.export.deduped", { format: input.format });
        resolved.recordLog("presentation_export_deduped", {
          tenantId: actor.tenantId,
          userId: actor.userId,
          deckId: input.deckId,
          format: input.format,
        });
        return presentationExportResultSchema.parse({
          ...existingResult,
          deduped: true,
          status: existing.status,
          message: "Duplicate export suppressed. Existing job is still active.",
        });
      }

      dedupeRegistry.delete(dedupeKey);
    }

    // DB-backed durable deduplication (catches duplicates across server restarts)
    {
      if (db) {
        const existingRecord = await getExportRecordByIdempotencyKey(dedupeKey, db);
        if (
          existingRecord &&
          (existingRecord.status === "queued" || existingRecord.status === "processing")
        ) {
          resolved.recordMetric("presentation.export.deduped", { format: input.format });
          const detail = await resolved.getDeckDetail(input.deckId, actor);
          const audioData = db ? await resolveSlideAudioData(detail, db) : { slideAudioMap: new Map(), resolvedProjectAudioTrack: null };
          const renderSpec = buildPresentationRenderSpec({
            deck: detail.deck,
            slides: detail.slides,
            format: input.format,
            width: input.width,
            height: input.height,
            slideAudioMap: audioData.slideAudioMap,
            resolvedProjectAudioTrack: audioData.resolvedProjectAudioTrack,
          });
          return presentationExportResultSchema.parse({
            schemaVersion: PRESENTATION_EXPORT_SCHEMA_VERSION,
            exportId: existingRecord.id,
            jobId: existingRecord.celeryTaskId ?? existingRecord.id.toString(),
            deckId: input.deckId,
            format: input.format,
            deduped: true,
            status: existingRecord.status,
            message: "Duplicate export suppressed. Existing job is still active.",
            renderSpec,
            warnings: [],
          });
        }
      }
    }

    enforceThrottle(
      `${actor.tenantId}:${actor.userId}`,
      resolved.maxUserRequestsPerMinute,
      nowMs,
      resolved.throttleWindowMs,
      userWindowRegistry,
      resolved.maxThrottleKeys,
      resolved.maxThrottleWindowEntriesPerKey,
    );
    enforceThrottle(
      `${actor.tenantId}:${input.deckId}`,
      resolved.maxDeckRequestsPerMinute,
      nowMs,
      resolved.throttleWindowMs,
      deckWindowRegistry,
      resolved.maxThrottleKeys,
      resolved.maxThrottleWindowEntriesPerKey,
    );

    const detail = await resolved.getDeckDetail(input.deckId, actor);
    const audioData = db ? await resolveSlideAudioData(detail, db) : { slideAudioMap: new Map(), resolvedProjectAudioTrack: null };
    const renderSpec = buildPresentationRenderSpec({
      deck: detail.deck,
      slides: detail.slides,
      format: input.format,
      width: input.width,
      height: input.height,
      slideAudioMap: audioData.slideAudioMap,
      resolvedProjectAudioTrack: audioData.resolvedProjectAudioTrack,
    });
    if (renderSpec.warnings.length > 0) {
      resolved.recordMetric("presentation.export.degradation_warning.total", {
        format: input.format,
      });
      resolved.recordLog("presentation_export_degradation", {
        tenantId: actor.tenantId,
        userId: actor.userId,
        deckId: input.deckId,
        format: input.format,
        warningCount: renderSpec.warnings.length,
        warningCodes: renderSpec.warnings.map((warning) => warning.code),
      });
    }
    ensureRenderSchemaAccepted(renderSpec, resolved.acceptedRenderSchemaVersions);

    // Create DB record before enqueueing (so we have an ID to return)
    let exportId: number;
    let dbRecordId: number | null = null;
    {
      if (db) {
        const createRecordInput: CreateExportRecordInput = {
          deckId: input.deckId,
          userId: actor.userId,
          tenantId: actor.tenantId,
          format: input.format,
          quality: input.quality,
          width: renderSpec.width,
          height: renderSpec.height,
          idempotencyKey: dedupeKey,
        };
        try {
          const record = await createExportRecord(createRecordInput, db);
          exportId = record.id;
          dbRecordId = record.id;
        } catch (error) {
          if (!isIdempotencyUniqueConstraintError(error)) {
            throw error;
          }

          const existingRecord = await getExportRecordByIdempotencyKey(dedupeKey, db);
          if (
            existingRecord
            && (existingRecord.status === "queued" || existingRecord.status === "processing")
          ) {
            return presentationExportResultSchema.parse({
              schemaVersion: PRESENTATION_EXPORT_SCHEMA_VERSION,
              exportId: existingRecord.id,
              jobId: existingRecord.celeryTaskId ?? existingRecord.id.toString(),
              deckId: input.deckId,
              format: input.format,
              deduped: true,
              status: existingRecord.status,
              message: "Duplicate export suppressed. Existing job is still active.",
              renderSpec,
              warnings: renderSpec.warnings,
            });
          }

          // Reuse-safe retry key: terminal rows (cancelled/error/done) keep history immutable.
          dedupeKey = `${dedupeKey}:retry:${crypto.randomUUID()}`;
          const retryRecord = await createExportRecord(
            { ...createRecordInput, idempotencyKey: dedupeKey },
            db,
          );
          exportId = retryRecord.id;
          dbRecordId = retryRecord.id;
        }
      } else {
        exportId = nextExportId();
      }
    }

    let queued: { jobId: string };
    try {
      queued = await resolved.enqueueExportJob(renderSpec, input.format, input.quality, resolved.userToken);
    } catch (enqueueError) {
      // Mark DB record as error if enqueue fails
      if (dbRecordId !== null && db) {
        await updateExportRecord(
          dbRecordId,
          {
            status: "error",
            errorMessage:
              enqueueError instanceof Error ? enqueueError.message : "Enqueue failed",
          },
          db,
        );
      }
      throw enqueueError;
    }

    // Update DB record with celery task ID
    if (dbRecordId !== null && db) {
      await updateExportRecord(dbRecordId, { celeryTaskId: queued.jobId }, db);
    }

    const status = presentationExportStatusResultSchema.parse({
      schemaVersion: PRESENTATION_EXPORT_SCHEMA_VERSION,
      exportId,
      status: "queued",
      format: input.format,
      updatedAt: new Date(nowMs),
      warnings: renderSpec.warnings,
    });
    statusRegistry.set(exportId, {
      createdAtMs: nowMs,
      value: {
        ...status,
        tenantId: actor.tenantId,
        userId: actor.userId,
      },
    });
    dedupeRegistry.set(dedupeKey, {
      exportId,
      createdAtMs: nowMs,
    });

    resolved.recordMetric("presentation.export.queued", { format: input.format });
    resolved.recordLog("presentation_export_queued", {
      exportId,
      jobId: queued.jobId,
      deckId: input.deckId,
      userId: actor.userId,
      tenantId: actor.tenantId,
      format: input.format,
    });

    const result = presentationExportResultSchema.parse({
      schemaVersion: PRESENTATION_EXPORT_SCHEMA_VERSION,
      exportId,
      deckId: input.deckId,
      format: input.format,
      deduped: false,
      status: "queued",
      message: "Export queued",
      renderSpec,
      warnings: renderSpec.warnings,
    });
    resultRegistry.set(exportId, {
      createdAtMs: nowMs,
      value: result,
    });
    compactExportState(nowMs, {
      dedupeWindowMs: resolved.dedupeWindowMs,
      statusTtlMs: resolved.statusTtlMs,
      resultTtlMs: resolved.resultTtlMs,
      throttleWindowMs: resolved.throttleWindowMs,
      maxDedupeEntries: resolved.maxDedupeEntries,
      maxStatusEntries: resolved.maxStatusEntries,
      maxResultEntries: resolved.maxResultEntries,
      maxThrottleKeys: resolved.maxThrottleKeys,
      maxThrottleWindowEntriesPerKey: resolved.maxThrottleWindowEntriesPerKey,
    });
    return result;
  } catch (error) {
    if (error instanceof PresentationServiceError) {
      recordPresentationFailureMetric(error.code);
      resolved.recordLog("presentation_export_failed", {
        tenantId: actor.tenantId,
        userId: actor.userId,
        deckId: input.deckId,
        format: input.format,
        errorCode: error.code,
        retryAfterSeconds: error.details?.retryAfterSeconds as number | undefined,
      });
    }
    throw error;
  }
}

export async function getPresentationExportStatus(
  exportId: number,
  actor?: PresentationActor,
  userToken?: string,
): Promise<PresentationExportStatusResult> {
  const defaults = getDefaultStateOptions(Date.now());
  compactExportState(defaults.nowMs, defaults);

  // DB-backed path: query live status from DB and Python if task is in-flight
  const db = await getDb();
  if (db) {
    const record = await getExportRecord(exportId, db);
    if (!record) {
      throw new PresentationServiceError(
        PRESENTATION_ERROR_CODE.NOT_FOUND,
        `${PRESENTATION_ERROR_CODE.NOT_FOUND}: export ${exportId} was not found`,
      );
    }
    if (actor && (record.tenantId !== actor.tenantId || record.userId !== actor.userId)) {
      throw new PresentationServiceError(
        PRESENTATION_ERROR_CODE.PERMISSION_DENIED,
        `${PRESENTATION_ERROR_CODE.PERMISSION_DENIED}: export status is tenant/user scoped`,
      );
    }

    let current = record;

    // Poll Python for live progress if the task is still in-flight
    if (record.celeryTaskId && (record.status === "queued" || record.status === "processing")) {
      try {
        const pythonBackendBaseUrl = resolvePythonBackendBaseUrl();
        const token = userToken?.trim() || signBearerToken(
          { sub: "internal-render-service", scopes: ["internal:render"] },
          "30m",
        );
        const response = await fetch(
          `${pythonBackendBaseUrl}/api/v1/presentations/export/${record.celeryTaskId}`,
          { headers: { Authorization: `Bearer ${token}` } },
        );
        if (response.ok) {
          const json = (await response.json()) as {
            state?: string;
            output_url?: string;
            error_message?: string;
            percent?: number;
            stage?: string;
          };
          if (json.state === "done" && json.output_url) {
            const updated = await updateExportRecord(
              record.id,
              { status: "done", outputUrl: json.output_url, progressPct: 100 },
              db,
            );
            if (updated) current = updated;
          } else if (json.state === "error") {
            const updated = await updateExportRecord(
              record.id,
              { status: "error", errorMessage: json.error_message ?? "Task failed" },
              db,
            );
            if (updated) current = updated;
          } else if (shouldMarkExportTaskStale(record, json)) {
            const updated = await updateExportRecord(
              record.id,
              {
                status: "error",
                errorMessage: "EXPORT_TASK_STALE: worker did not start task in time, please retry export",
              },
              db,
            );
            if (updated) current = updated;
          } else if (json.percent != null || json.stage != null) {
            const updated = await updateExportRecord(
              record.id,
              {
                status: "processing",
                progressPct: json.percent ?? record.progressPct,
                stage: json.stage ?? record.stage,
              },
              db,
            );
            if (updated) current = updated;
          }
        }
      } catch {
        // Python call failed — use existing DB state; do not throw
      }
    }

    return presentationExportStatusResultSchema.parse({
      schemaVersion: PRESENTATION_EXPORT_SCHEMA_VERSION,
      exportId: current.id,
      status: current.status,
      format: current.format,
      progressPct: current.progressPct,
      stage: current.stage,
      downloadUrl: current.outputUrl,
      errorMessage: current.errorMessage,
      outputBytes: current.outputBytes,
      updatedAt: current.updatedAt,
      warnings: [],
    });
  }

  // In-memory fallback (test environments without a DB connection)
  const status = statusRegistry.get(exportId)?.value;
  if (!status) {
    throw new PresentationServiceError(
      PRESENTATION_ERROR_CODE.NOT_FOUND,
      `${PRESENTATION_ERROR_CODE.NOT_FOUND}: export ${exportId} was not found`,
    );
  }
  if (actor && (status.tenantId !== actor.tenantId || status.userId !== actor.userId)) {
    throw new PresentationServiceError(
      PRESENTATION_ERROR_CODE.PERMISSION_DENIED,
      `${PRESENTATION_ERROR_CODE.PERMISSION_DENIED}: export status is tenant/user scoped`,
    );
  }

  return presentationExportStatusResultSchema.parse(status);
}

export function resetPresentationExportStateForTests(): void {
  dedupeRegistry.clear();
  statusRegistry.clear();
  resultRegistry.clear();
  userWindowRegistry.clear();
  deckWindowRegistry.clear();
  exportIdSequence = 0;
}

/**
 * Cancel an in-flight presentation export.
 *
 * Steps:
 * 1. Load the export record and verify tenant + user ownership.
 * 2. If the export is already in a terminal state (done/error/cancelled),
 *    return a failure result without modifying DB state.
 * 3. If a Celery task ID is present, call the Python backend to revoke the task.
 *    Python failure is non-fatal — we continue to mark the record cancelled.
 * 4. Update the DB record to status='cancelled'.
 * 5. Return { success: true, exportId }.
 */
export async function cancelPresentationExport(
  exportId: number,
  actor: PresentationActor,
  userToken?: string,
): Promise<{ success: boolean; exportId: number; message?: string }> {
  const db = await getDb();
  if (!db) {
    throw new PresentationServiceError(
      PRESENTATION_ERROR_CODE.VALIDATION_FAILED,
      `${PRESENTATION_ERROR_CODE.VALIDATION_FAILED}: database unavailable — cannot cancel export`,
    );
  }

  const record = await getExportRecord(exportId, db);
  if (!record) {
    throw new PresentationServiceError(
      PRESENTATION_ERROR_CODE.NOT_FOUND,
      `${PRESENTATION_ERROR_CODE.NOT_FOUND}: export ${exportId} was not found`,
    );
  }

  if (record.tenantId !== actor.tenantId || record.userId !== actor.userId) {
    throw new PresentationServiceError(
      PRESENTATION_ERROR_CODE.PERMISSION_DENIED,
      `${PRESENTATION_ERROR_CODE.PERMISSION_DENIED}: export cancellation is tenant/user scoped`,
    );
  }

  const terminalStatuses = new Set(["done", "error", "cancelled"]);
  if (terminalStatuses.has(record.status)) {
    return {
      success: false,
      exportId,
      message: "Export already completed",
    };
  }

  // Attempt to revoke the Celery task. Non-fatal if Python is unavailable.
  if (record.celeryTaskId) {
    try {
      const pythonBackendBaseUrl = resolvePythonBackendBaseUrl();
      const token = userToken?.trim() || signBearerToken(
        { sub: "internal-render-service", scopes: ["internal:render"] },
        "30m",
      );
      await fetch(
        `${pythonBackendBaseUrl}/api/v1/presentations/export/${record.celeryTaskId}/cancel`,
        {
          method: "POST",
          headers: { Authorization: `Bearer ${token}` },
        },
      );
    } catch {
      // Python revocation failed — proceed with local cancellation anyway.
    }
  }

  await updateExportRecord(exportId, { status: "cancelled" }, db);

  return { success: true, exportId };
}
