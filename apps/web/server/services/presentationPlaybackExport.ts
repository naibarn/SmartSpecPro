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
  type PresentationTransition,
} from "@shared/presentation/contracts";
import type { PresentationDeck, PresentationSlide } from "../../drizzle/schema";

import {
  getPresentationDeckDetail,
  type PresentationActor,
  type PresentationDeckDetail,
  PresentationServiceError,
} from "./presentationService";
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

interface PresentationExportStateRecord {
  exportId: string;
  jobId: string;
  createdAtMs: number;
}

interface TriggerPresentationExportDependencies {
  getDeckDetail?: (deckId: number, actor: PresentationActor) => Promise<PresentationDeckDetail>;
  enqueueExportJob?: (renderSpec: PresentationRenderSpec, format: "png" | "mp4") => Promise<{ jobId: string }>;
  now?: () => number;
  dedupeWindowMs?: number;
  throttleWindowMs?: number;
  maxUserRequestsPerMinute?: number;
  maxDeckRequestsPerMinute?: number;
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
const statusRegistry = new Map<string, PresentationExportStatusResult & { tenantId: string; userId: number }>();
const resultRegistry = new Map<string, PresentationExportResult>();
const userWindowRegistry = new Map<string, number[]>();
const deckWindowRegistry = new Map<string, number[]>();

function nextId(prefix: string): string {
  return `${prefix}-${crypto.randomUUID()}`;
}

function normalizeTransition(raw: unknown): PresentationTransition {
  if (raw === undefined || raw === null || raw === "") {
    return "cut";
  }
  if (raw === "cut" || raw === "fade") {
    return raw;
  }

  throw new PresentationServiceError(
    PRESENTATION_ERROR_CODE.VALIDATION_FAILED,
    `${PRESENTATION_ERROR_CODE.VALIDATION_FAILED}: transition "${String(raw)}" is unsupported`,
  );
}

function normalizeDurationMs(raw: unknown, fallback: number): number {
  if (typeof raw === "number" && Number.isFinite(raw) && raw >= 250 && raw <= 120_000) {
    return Math.round(raw);
  }
  return fallback;
}

function sortedSlides(slides: PresentationSlide[]): PresentationSlide[] {
  return [...slides].sort((a, b) => {
    if (a.orderIndex === b.orderIndex) {
      return a.id - b.id;
    }
    return a.orderIndex - b.orderIndex;
  });
}

function pruneWindow(entries: number[], nowMs: number, windowMs: number): number[] {
  const floor = nowMs - windowMs;
  return entries.filter((ts) => ts > floor);
}

function enforceThrottle(
  key: string,
  limit: number,
  nowMs: number,
  windowMs: number,
  registry: Map<string, number[]>,
): void {
  const active = pruneWindow(registry.get(key) ?? [], nowMs, windowMs);
  if (active.length >= limit) {
    const oldest = active[0] ?? nowMs;
    const retryAfterSeconds = Math.max(1, Math.ceil((windowMs - (nowMs - oldest)) / 1000));
    throw new PresentationServiceError(
      PRESENTATION_ERROR_CODE.EXPORT_THROTTLED,
      `${PRESENTATION_ERROR_CODE.EXPORT_THROTTLED}: too many export requests`,
      { retryAfterSeconds },
    );
  }

  active.push(nowMs);
  registry.set(key, active);
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
    maxUserRequestsPerMinute: dependencies?.maxUserRequestsPerMinute ?? MAX_USER_REQUESTS_PER_WINDOW,
    maxDeckRequestsPerMinute: dependencies?.maxDeckRequestsPerMinute ?? MAX_DECK_REQUESTS_PER_WINDOW,
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
  const normalizedSlides = sortedSlides(slides).map((slide) => {
    const content =
      slide.slideContent && typeof slide.slideContent === "object" && !Array.isArray(slide.slideContent)
        ? (slide.slideContent as Record<string, unknown>)
        : {};
    const transition = normalizeTransition(content.transition);
    const durationMs = normalizeDurationMs(content.durationMs, defaultDurationMs);
    return {
      slideId: slide.id,
      orderIndex: slide.orderIndex,
      title: slide.title || `Slide ${slide.orderIndex + 1}`,
      durationMs,
      transition,
    };
  });

  return presentationSlideshowPayloadSchema.parse({
    schemaVersion: PRESENTATION_SLIDESHOW_SCHEMA_VERSION,
    deckId,
    generatedAt: options?.generatedAt ?? new Date(),
    slides: normalizedSlides,
  });
}

export function buildPresentationRenderSpec(input: BuildRenderSpecInput): PresentationRenderSpec {
  const slideshowPayload = buildSlideshowPayload(input.slides, {
    deckId: input.deck.id,
  });

  return presentationRenderSpecSchema.parse({
    schemaVersion: PRESENTATION_RENDER_SCHEMA_VERSION,
    deckId: input.deck.id,
    format: input.format,
    width: input.width ?? 1920,
    height: input.height ?? 1080,
    fps: input.fps ?? 30,
    slides: slideshowPayload.slides,
  });
}

export async function triggerPresentationExport(
  input: TriggerPresentationExportInput,
  actor: PresentationActor,
  dependencies?: TriggerPresentationExportDependencies,
): Promise<PresentationExportResult> {
  const resolved = resolveDependencies(dependencies);
  const nowMs = resolved.now();
  try {
    const dedupeKey = resolveDedupeKey(input, actor);
    const dedupeHit = dedupeRegistry.get(dedupeKey);
    if (dedupeHit && nowMs - dedupeHit.createdAtMs <= resolved.dedupeWindowMs) {
      const existing = statusRegistry.get(dedupeHit.exportId);
      const existingResult = resultRegistry.get(dedupeHit.exportId);
      if (existing && existingResult) {
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
    }

    enforceThrottle(
      `${actor.tenantId}:${actor.userId}`,
      resolved.maxUserRequestsPerMinute,
      nowMs,
      resolved.throttleWindowMs,
      userWindowRegistry,
    );
    enforceThrottle(
      `${actor.tenantId}:${input.deckId}`,
      resolved.maxDeckRequestsPerMinute,
      nowMs,
      resolved.throttleWindowMs,
      deckWindowRegistry,
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
    });
    statusRegistry.set(exportId, {
      ...status,
      tenantId: actor.tenantId,
      userId: actor.userId,
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
    });
    resultRegistry.set(exportId, result);
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
  const status = statusRegistry.get(exportId);
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
