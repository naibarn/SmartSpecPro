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
  presentationRenderSpecSchema,
  presentationSlideshowPayloadSchema,
  type PresentationExportResult,
  type PresentationExportStatusResult,
  type PresentationRenderSpec,
  type PresentationSlideshowPayload,
} from "@shared/presentation/contracts";
import type { PresentationDeck, PresentationSlide } from "../../drizzle/schema";

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

interface PresentationExportStateRecord {
  exportId: string;
  jobId: string;
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
  enqueueExportJob?: (renderSpec: PresentationRenderSpec, format: "png" | "mp4") => Promise<{ jobId: string }>;
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
  format: "png" | "mp4";
  width?: number;
  height?: number;
  fps?: number;
}

export interface TriggerPresentationExportInput {
  deckId: number;
  format: "png" | "mp4";
  idempotencyKey?: string;
}

const dedupeRegistry = new Map<string, PresentationExportStateRecord>();
const statusRegistry = new Map<string, PresentationExportStatusStateRecord>();
const resultRegistry = new Map<string, PresentationExportResultStateRecord>();
const userWindowRegistry = new Map<string, number[]>();
const deckWindowRegistry = new Map<string, number[]>();

function nextId(prefix: string): string {
  return `${prefix}-${crypto.randomUUID()}`;
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

function resolveDependencies(
  dependencies?: TriggerPresentationExportDependencies,
): Required<TriggerPresentationExportDependencies> {
  return {
    getDeckDetail: dependencies?.getDeckDetail ?? getPresentationDeckDetail,
    enqueueExportJob: dependencies?.enqueueExportJob ?? defaultEnqueueExportJob,
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

async function defaultEnqueueExportJob(
  renderSpec: PresentationRenderSpec,
  format: "png" | "mp4",
): Promise<{ jobId: string }> {
  const jobId = nextId("presentation-job");
  void renderSpec;
  void format;
  return { jobId };
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

export function buildPresentationRenderSpec(input: BuildRenderSpecInput): PresentationRenderSpec {
  const degraded = degradeSlidesForExport(input.slides, DEFAULT_DURATION_MS);
  const slideshowPayload = presentationSlideshowPayloadSchema.parse({
    schemaVersion: PRESENTATION_SLIDESHOW_SCHEMA_VERSION,
    deckId: input.deck.id,
    generatedAt: new Date(),
    slides: degraded.slides,
  });

  return presentationRenderSpecSchema.parse({
    schemaVersion: PRESENTATION_RENDER_SCHEMA_VERSION,
    deckId: input.deck.id,
    format: input.format,
    width: input.width ?? 1920,
    height: input.height ?? 1080,
    fps: input.fps ?? 30,
    slides: slideshowPayload.slides,
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
    const dedupeKey = resolveDedupeKey(input, actor);
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
    const renderSpec = buildPresentationRenderSpec({
      deck: detail.deck,
      slides: detail.slides,
      format: input.format,
    });
    ensureRenderSchemaAccepted(renderSpec, resolved.acceptedRenderSchemaVersions);

    const queued = await resolved.enqueueExportJob(renderSpec, input.format);
    const exportId = nextId("presentation-export");
    const status = presentationExportStatusResultSchema.parse({
      schemaVersion: PRESENTATION_EXPORT_SCHEMA_VERSION,
      exportId,
      jobId: queued.jobId,
      status: "queued",
      format: input.format,
      updatedAt: new Date(nowMs),
      message: "Export queued",
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
      jobId: queued.jobId,
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
      jobId: queued.jobId,
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

export function getPresentationExportStatus(
  exportId: string,
  actor?: PresentationActor,
): PresentationExportStatusResult {
  const defaults = getDefaultStateOptions(Date.now());
  compactExportState(defaults.nowMs, defaults);

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
}
