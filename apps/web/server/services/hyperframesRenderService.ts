import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import {
  HYPERFRAMES_MARKETPLACE_CONTRACT_VERSION,
  HyperframesArtifactRefSchema,
  HyperframesRenderStatusProjectionSchema,
  buildHyperframesRenderJobIdempotencyKey,
  createDefaultHyperframesPollingGuidance,
  stableHash,
  type HyperframesArtifactRef,
  type HyperframesCompositionInput,
  type HyperframesOutputRef,
  type HyperframesRenderStatus,
  type HyperframesRenderStatusProjection,
  type HyperframesRepairAction,
} from "@shared/hyperframes/contracts";
import { getHyperframesStatusCopy } from "@shared/hyperframes/statusCopy";
import { getDb } from "../db";
import {
  marketplaceAutoReviewOutboxJobs,
  marketplaceAutoReviewRuns,
  marketplaceProducts,
  workerArtifacts,
  workerJobs,
} from "../../drizzle/schema";
import type { HyperframesAuthContext } from "./hyperframesFeatureAccessService";
import { getMarketplaceProductWithAccess } from "./marketplaceProductService";
import { redactHyperframesDiagnostics } from "./hyperframesCompositionSanitizer";

export const HYPERFRAMES_OUTBOX_JOB_TYPES = [
  "hyperframes_asset_stage",
  "hyperframes_lint",
  "hyperframes_snapshot",
  "hyperframes_render",
  "hyperframes_inspect",
  "hyperframes_finalize",
] as const;

export type HyperframesOutboxJobType = (typeof HYPERFRAMES_OUTBOX_JOB_TYPES)[number];

const HYPERFRAMES_FINAL_COMPOSITE_RENDERER_POLICY_VERSION =
  "official_html_css_browser_final_composite_v1";

export interface HyperframesRenderJobPayload {
  productId: string;
  productTitle?: string;
  compositionInputHash: string;
  compositionHtmlHash: string;
  templateId: string;
  templateVersion: string;
  templateContentHash: string;
  platformPresetId: string;
  platformPresetVersion: string;
  renderIntent: string;
  compositionMode: string;
  runtimeProfileHash: string;
  launchMode: "auto_storyboard_review";
  traceId: string;
  correlationId: string;
  fps?: number;
  quality?: string;
  compositionInput?: HyperframesCompositionInput;
  compositionHtml?: string;
  finalCompositeConfig?: Record<string, unknown>;
  creativePlanHash?: string;
  presetManifestHash?: string;
  audioEventMapHash?: string;
  fallbackQuality?: "full" | "partial" | "not_supported";
  overlayPresetId?: string;
  subtitlePresetId?: string;
  audioPackPresetId?: string;
  musicPresetId?: string;
  sfxPresetIds?: string[];
  presetVersions?: Record<string, string>;
  rendererPolicyVersion?: string;
  outputArtifactRef?: HyperframesArtifactRef | null;
  outputUrl?: string | null;
  thumbnailUrl?: string | null;
  qaStatus?: "passed" | "passed_with_warnings" | "failed" | null;
  playableProbe?: {
    passed?: boolean;
    durationSec?: number | null;
    hasVideo?: boolean;
    hasAudio?: boolean;
    errorMessage?: string;
  } | null;
  audioMixReport?: {
    preserveNativeAudio?: boolean;
    nativeInputWithAudioCount?: number;
    outputAudioPolicy?: string;
  } | null;
}

function nowIso(): string {
  return new Date().toISOString();
}

function isManualStoryboardHyperframesIdentity(input: {
  productId?: string | null;
  runId?: string | null;
}): boolean {
  const productId = typeof input.productId === "string" ? input.productId.trim() : "";
  const runId = typeof input.runId === "string" ? input.runId.trim() : "";
  return (
    /^manual(?:_storyboard)?_product_/i.test(productId) ||
    /^manual(?:_storyboard)?_run_/i.test(runId)
  );
}

async function ensureManualStoryboardOutboxParents(input: {
  db: Awaited<ReturnType<typeof getDb>>;
  auth: HyperframesAuthContext;
  productId: string;
  runId: string;
  payload: HyperframesRenderJobPayload;
  now: Date;
}): Promise<void> {
  if (!input.db || !isManualStoryboardHyperframesIdentity(input)) return;

  const productTitle =
    typeof input.payload.productTitle === "string" && input.payload.productTitle.trim()
      ? input.payload.productTitle.trim()
      : "Manual Storyboard Project";
  const sourceUrl = `manual-storyboard://${input.runId}`;
  const idempotencyKey = `manual-storyboard:${input.runId}`;

  await input.db
    .insert(marketplaceProducts)
    .values({
      id: input.productId,
      captureId: null,
      userId: input.auth.userId,
      tenantId: input.auth.tenantId ?? null,
      platform: "shopee",
      sourceUrl,
      externalProductId: null,
      externalShopId: null,
      productName: productTitle,
      descriptionText: "User-managed Storyboard Review project.",
      descriptionJson: {
        manualStoryboardReview: true,
        runId: input.runId,
      },
      specsJson: {},
      platformRawJson: {
        manualStoryboardReview: true,
        runId: input.runId,
        hyperframesRenderOnly: true,
      },
      status: "active",
      createdAt: input.now,
      updatedAt: input.now,
    })
    .onConflictDoNothing();

  await input.db
    .insert(marketplaceAutoReviewRuns)
    .values({
      id: input.runId,
      tenantId: input.auth.tenantId ?? null,
      userId: input.auth.userId,
      productId: input.productId,
      productionRunId: input.runId,
      outputMode: "storyboard_video",
      frameStrategy: "manual_storyboard",
      status: "completed",
      currentStage: "storyboard_review",
      stageIndex: 1,
      stageCount: 1,
      selectedConceptId: null,
      storyboardReviewId: input.runId,
      videoEditorProjectId: null,
      renderJobId: null,
      resultLibraryItemId: null,
      resultJson: {
        storyboardReviewId: input.runId,
        manualStoryboardReview: true,
      },
      metadataJson: {
        manualStoryboardReview: true,
        source: "hyperframes_final_composite",
      },
      errorMessage: null,
      idempotencyKey,
      createdAt: input.now,
      updatedAt: input.now,
      completedAt: input.now,
    })
    .onConflictDoNothing();
}

const DEFAULT_HYPERFRAMES_QUEUED_STALE_MS = 2 * 60 * 1000;

function hyperframesQueuedStaleMs(): number {
  return DEFAULT_HYPERFRAMES_QUEUED_STALE_MS;
}

function dateAgeMs(value: unknown, nowMs = Date.now()): number | null {
  if (value instanceof Date) {
    const ms = value.getTime();
    return Number.isFinite(ms) ? Math.max(0, nowMs - ms) : null;
  }
  if (typeof value === "string" || typeof value === "number") {
    const ms = new Date(value).getTime();
    return Number.isFinite(ms) ? Math.max(0, nowMs - ms) : null;
  }
  return null;
}

const HYPERFRAMES_CANCELLABLE_OUTBOX_STATUSES = [
  "queued",
  "pending",
  "retry",
  "locked",
  "running",
] as const;

const HYPERFRAMES_USER_RETRYABLE_RENDER_STATUSES = new Set([
  "failed_transient",
]);

const HYPERFRAMES_USER_RETRYABLE_OUTBOX_STATUSES = ["failed"] as const;

const HYPERFRAMES_RUNTIME_CONFIGURATION_BLOCKER_RE =
  /HTML\/CSS\/browser runtime is required|official HTML\/CSS\/browser runtime is not ready|readiness flag is not enabled|Chrome\/headless browser runtime is not available|Thai-capable render font is not available|requires Node >=22\.22|blocked until production rollout gates pass|blocked by explicit runtime readiness env|runtime package\/binary is not available|runtime package @hyperframes\/producer is not installed|FFmpeg binary is not available|FFprobe binary is not available|official runtime mode is not configured|missing render media asset|video_missing_muted|data-has-audio|FFmpeg not found|FFprobe not found/i;

const HYPERFRAMES_RUNTIME_TRANSIENT_FAILURE_RE =
  /runtime configuration failure:\s*Command failed|runtime transient failure|runtime execution is not implemented|runtime.*not ready|dependency\/runtime|dependency.*deferred|runtime rollout|FrameCapture|Sub-composition timelines not registered|video elements did not decode|Runtime\.callFunctionOn timed out|protocolTimeout|browser-timeout|player-ready-timeout|timed out waiting for local HyperFrames render slot|timed out|ETIMEDOUT|SIGTERM|SIGKILL|process signal|process killed|Command failed/i;

const HYPERFRAMES_CANCELLABLE_RENDER_STATUSES = new Set<HyperframesRenderStatus>([
  "queued",
  "staging_assets",
  "linting",
  "snapshotting",
  "inspecting",
  "rendering",
  "qa_checking",
]);

const HYPERFRAMES_ACTIVE_RENDER_STATUSES = new Set<HyperframesRenderStatus>([
  "queued",
  "staging_assets",
  "linting",
  "snapshotting",
  "inspecting",
  "rendering",
  "qa_checking",
]);

export function mapOutboxStatusToRenderStatus(
  status: string,
  lastError?: string | null,
  jobType?: string | null
): HyperframesRenderStatus {
  if (status === "queued" || status === "pending" || status === "retry") return "queued";
  if (status === "locked" || status === "running") {
    switch (jobType) {
      case "hyperframes_asset_stage":
        return "staging_assets";
      case "hyperframes_lint":
        return "linting";
      case "hyperframes_snapshot":
        return "snapshotting";
      case "hyperframes_inspect":
        return "inspecting";
      case "hyperframes_finalize":
        return "qa_checking";
      case "hyperframes_render":
      default:
        return "rendering";
    }
  }
  if (status === "completed") return "completed";
  if (status === "cancel_requested") return "cancel_requested";
  if (status === "cancelled") return "cancelled";
  if (status === "dead_lettered") return "dead_lettered";
  if (status === "failed") {
    const error = lastError ?? "";
    if (HYPERFRAMES_RUNTIME_CONFIGURATION_BLOCKER_RE.test(error)) {
      return "blocked_needs_user";
    }
    if (HYPERFRAMES_RUNTIME_TRANSIENT_FAILURE_RE.test(error)) {
      return "failed_transient";
    }
    return /stale|template|policy|tenant|qa/i.test(error)
      ? "failed_permanent"
      : "failed_transient";
  }
  return "queued";
}

function repairActionsForStatus(status: HyperframesRenderStatus): HyperframesRepairAction[] {
  if (status === "stale_input_hash") {
    return [
      {
        actionId: "repair_regenerate_from_current_plan",
        actionType: "regenerate_from_current_plan",
        label: "Regenerate from current plan",
        safeDescription: "Rebuild the composition from the latest product and run state.",
        requiresOperator: false,
        auditRequired: true,
        disabledReason: null,
      },
    ];
  }
  if (status === "failed_transient") {
    return [
      {
        actionId: "repair_retry_worker_step",
        actionType: "retry_worker_step",
        label: "Retry worker step",
        safeDescription: "Retry the last worker step within bounded retry policy.",
        requiresOperator: false,
        auditRequired: true,
        disabledReason: null,
      },
    ];
  }
  if (status === "dead_lettered") {
    return [
      {
        actionId: "operator_replay_dead_letter",
        actionType: "retry_worker_step",
        label: "Operator replay",
        safeDescription: "Operator can replay after verifying input hash and template state.",
        requiresOperator: true,
        auditRequired: true,
        disabledReason: null,
      },
    ];
  }
  return [];
}

function progressForStatus(status: HyperframesRenderStatus): number {
  const progress: Partial<Record<HyperframesRenderStatus, number>> = {
    not_available: 0,
    queued: 5,
    staging_assets: 20,
    linting: 30,
    snapshotting: 40,
    inspecting: 50,
    rendering: 70,
    qa_checking: 85,
    ready_for_review: 95,
    completed: 100,
    saved_to_library: 100,
    cancel_requested: 60,
    cancelled: 100,
    failed_transient: 60,
    failed_permanent: 100,
    failed: 100,
    dead_lettered: 100,
    template_disabled: 100,
    stale_input_hash: 100,
  };
  return progress[status] ?? 0;
}

function safeMessageForRenderError(
  status: HyperframesRenderStatus,
  lastError?: string | null
): string | undefined {
  const error = lastError ?? "";
  if (status === "blocked_needs_user") {
    if (/FFmpeg not found|FFprobe not found|FFmpeg binary is not available|FFprobe binary is not available/i.test(error)) {
      return "HyperFrames render ไม่พร้อม เพราะ worker หา ffmpeg/ffprobe ไม่เจอ ให้ตรวจ runtime PATH หรือ binary config แล้วกด Render ใหม่";
    }
    if (/readiness flag is not enabled|Chrome\/headless browser runtime is not available|Thai-capable render font is not available/i.test(error)) {
      return "Final Composite ยัง render ไม่ได้เพราะ official HTML/CSS/browser runtime ใน worker ไม่พร้อม ให้รัน hyperframes:doctor ใน worker image ตรวจ Chrome, ffmpeg/ffprobe, font ไทย แล้วตั้ง HYPERFRAMES_OFFICIAL_RUNTIME_READY=1 เมื่อ doctor ผ่าน";
    }
    if (/missing render media asset/i.test(error)) {
      return "HyperFrames render ไม่พร้อม เพราะไฟล์วิดีโอหรือ asset ที่อ้างอิงหายไป ให้ตรวจคลิปของแต่ละ shot แล้วกด Render ใหม่";
    }
    if (/HTML\/CSS\/browser runtime is required|official HTML\/CSS\/browser runtime is not ready/i.test(error)) {
      return "Final Composite ต้องใช้ official HyperFrames HTML/CSS/browser runtime เท่านั้น ระบบปิด ASS fallback แล้วเพื่อให้ผลลัพธ์ตรงกับ preview ให้ตรวจ Chrome/producer runtime แล้วกด Render ใหม่";
    }
  }
  return undefined;
}

const HYPERFRAMES_PRIVATE_OUTPUT_PATH_RE =
  /^\/(?:home|tmp|var|srv|app|workspace|mnt)\//i;
const HYPERFRAMES_PRIVATE_STORAGE_REF_RE = /\bmarketplace-auto-review\//i;
const HYPERFRAMES_SENSITIVE_OUTPUT_URL_PARAM_RE =
  /^(?:x-amz-|awsaccesskeyid$|sig$|signature$|token$|key$|secret$|password$|passwd$|pwd$|session$|jwt$|policy$|authorization$|auth$|bearer$|expires?$|credential$|access[_-]?(?:key|token)$|refresh[_-]?token$|id[_-]?token$)/i;
const HYPERFRAMES_PUBLIC_RELATIVE_OUTPUT_PATH_RE =
  /^\/(?:media|uploads|static\/media)\//i;
const HYPERFRAMES_PUBLIC_STORAGE_API_OUTPUT_PATH_RE =
  /^\/api\/storage\/files\/[^?#]+/i;

function hasSensitiveHyperframesOutputUrlParams(url: URL): boolean {
  for (const key of url.searchParams.keys()) {
    if (HYPERFRAMES_SENSITIVE_OUTPUT_URL_PARAM_RE.test(key)) return true;
  }
  return false;
}

function redactHyperframesOutputUrlForUser(
  value: string | null | undefined
): string | null {
  const raw = typeof value === "string" ? value.trim() : "";
  if (!raw) return null;
  if (raw.startsWith("/") && !raw.startsWith("//")) {
    try {
      const url = new URL(raw, "https://smartspec.local");
      if (hasSensitiveHyperframesOutputUrlParams(url)) return null;
      if (
        !HYPERFRAMES_PUBLIC_RELATIVE_OUTPUT_PATH_RE.test(url.pathname) &&
        !HYPERFRAMES_PUBLIC_STORAGE_API_OUTPUT_PATH_RE.test(url.pathname)
      ) {
        return null;
      }
      return url.pathname;
    } catch {
      return null;
    }
  }
  if (
    HYPERFRAMES_PRIVATE_OUTPUT_PATH_RE.test(raw) ||
    HYPERFRAMES_PRIVATE_STORAGE_REF_RE.test(raw)
  ) {
    return null;
  }
  try {
    const url = new URL(raw);
    if (url.protocol !== "https:") return null;
    if (url.username || url.password) return null;
    if (hasSensitiveHyperframesOutputUrlParams(url)) return null;
    url.search = "";
    url.hash = "";
    return url.toString();
  } catch {
    return null;
  }
}

export function buildHyperframesRenderJobPayload(input: {
  composition: HyperframesCompositionInput & {
    compositionHtml?: string;
    finalCompositeConfig?: Record<string, unknown>;
  };
  traceId?: string;
  correlationId?: string;
}): HyperframesRenderJobPayload {
  const compositionHtmlHash = input.composition.compositionHtml
    ? stableHash({
        compositionHtml: input.composition.compositionHtml,
        template: input.composition.template,
        platform: input.composition.platformPreset.presetId,
      })
    : stableHash({
        template: input.composition.template,
        copy: input.composition.copy,
        platform: input.composition.platformPreset.presetId,
      });
  const finalCompositeConfig =
    input.composition.finalCompositeConfig &&
    typeof input.composition.finalCompositeConfig === "object"
      ? input.composition.finalCompositeConfig
      : {};
  const overlayPresetId =
    typeof finalCompositeConfig.overlayPreset === "string"
      ? finalCompositeConfig.overlayPreset
      : undefined;
  const subtitlePresetId =
    typeof finalCompositeConfig.subtitlePreset === "string"
      ? finalCompositeConfig.subtitlePreset
      : undefined;
  const audioPackPresetId =
    typeof finalCompositeConfig.audioPackPresetId === "string"
      ? finalCompositeConfig.audioPackPresetId
      : undefined;
  const musicPresetId =
    typeof finalCompositeConfig.musicPresetId === "string"
      ? finalCompositeConfig.musicPresetId
      : undefined;
  const sfxPresetIds = Array.isArray(finalCompositeConfig.sfxPresetIds)
    ? finalCompositeConfig.sfxPresetIds.map(id => String(id ?? "").trim()).filter(Boolean)
    : [];
  const presetIds = [
    overlayPresetId,
    subtitlePresetId,
    audioPackPresetId,
    musicPresetId,
    ...sfxPresetIds,
  ].filter((id): id is string => Boolean(id));
  const presetVersions = Object.fromEntries(presetIds.map(id => [id, "1"]));
  const presetManifestHash =
    presetIds.length > 0 ? stableHash({ presetIds, presetVersions }) : undefined;
  const audioEventMapHash =
    typeof finalCompositeConfig.audioEventMapHash === "string"
      ? finalCompositeConfig.audioEventMapHash
      : Array.isArray(finalCompositeConfig.audioEvents) && finalCompositeConfig.audioEvents.length > 0
        ? stableHash({
            audioPackPresetId,
            musicPresetId,
            sfxPresetIds,
            audioEvents: finalCompositeConfig.audioEvents,
            validation: finalCompositeConfig.audioAssetValidation,
          })
        : undefined;
  const creativePlanHash = stableHash({
    compositionInputHash: input.composition.provenance.compositionInputHash,
    presetManifestHash,
    audioEventMapHash,
    finalCompositeConfig,
  });
  const rendererPolicyVersion =
    input.composition.compositionMode === "captioned_final_composite"
      ? HYPERFRAMES_FINAL_COMPOSITE_RENDERER_POLICY_VERSION
      : undefined;
  const runtimeProfileHash = stableHash({
    fps: input.composition.platformPreset.fps,
    width: input.composition.platformPreset.width,
    height: input.composition.platformPreset.height,
    renderEngine: input.composition.renderEngine,
    rendererPolicyVersion,
  });
  return {
    productId: input.composition.provenance.productId,
    productTitle:
      typeof input.composition.productTruth.title === "string"
        ? input.composition.productTruth.title
        : undefined,
    compositionInputHash: input.composition.provenance.compositionInputHash,
    compositionHtmlHash,
    templateId: input.composition.template.templateId,
    templateVersion: input.composition.template.templateVersion,
    templateContentHash: input.composition.template.templateContentHash,
    platformPresetId: input.composition.platformPreset.presetId,
    platformPresetVersion: input.composition.platformPreset.platformPresetVersion,
    renderIntent: input.composition.renderIntent,
    compositionMode: input.composition.compositionMode,
    runtimeProfileHash,
    launchMode: "auto_storyboard_review",
    traceId: input.traceId ?? `trace_${stableHash(input.composition.provenance)}`,
    correlationId:
      input.correlationId ?? `corr_${stableHash(input.composition.provenance)}`,
    fps: input.composition.platformPreset.fps,
    quality: input.composition.renderIntent === "final" ? "high" : "standard",
    compositionInput: input.composition,
    compositionHtml: input.composition.compositionHtml,
    finalCompositeConfig,
    creativePlanHash,
    presetManifestHash,
    audioEventMapHash,
    fallbackQuality:
      typeof finalCompositeConfig.fallbackCapability === "object" &&
      finalCompositeConfig.fallbackCapability &&
      "fallbackQuality" in finalCompositeConfig.fallbackCapability
        ? (finalCompositeConfig.fallbackCapability as Record<string, unknown>).fallbackQuality as never
        : undefined,
    overlayPresetId,
    subtitlePresetId,
    audioPackPresetId,
    musicPresetId,
    sfxPresetIds,
    presetVersions,
    rendererPolicyVersion,
  };
}

export function buildHyperframesRenderProjection(input: {
  tenantId: string;
  productId: string;
  runId: string;
  renderJobId: string;
  status: HyperframesRenderStatus;
  payload?: Partial<HyperframesRenderJobPayload>;
  safeDiagnostics?: string[];
  safeMessage?: string;
  outputUrl?: string | null;
  outputRefs?: HyperframesOutputRef[];
  artifactRefs?: HyperframesArtifactRef[];
  libraryItemId?: string | number | null;
  permissions?: Partial<{
    canCancel: boolean;
    canRepair: boolean;
  }>;
  canMutate?: boolean;
  createdAt?: string;
  updatedAt?: string;
}): HyperframesRenderStatusProjection {
  const outputRefs = input.outputRefs ?? (input.outputUrl
    ? [
        {
          outputId: `${input.renderJobId}_output`,
          kind: input.libraryItemId ? "library_item" : "preview_video",
          url: input.outputUrl,
          storageRef: null,
          contentHash: undefined,
          libraryItemId: input.libraryItemId ?? null,
          accessibleLabel: input.libraryItemId
            ? "HyperFrames Library video"
            : "HyperFrames preview video",
        } satisfies HyperframesOutputRef,
      ]
    : []);
  const completedFinalNeedsPlayableOutput =
    input.status === "completed" && input.payload?.renderIntent === "final";
  const hasPlayableFinalOutput = outputRefs.some(ref =>
    ref.kind === "final_video" &&
    Boolean(ref.url) &&
    Boolean(ref.contentHash)
  );
  const finalProbePassed = input.payload?.playableProbe?.passed === true;
  const projectedStatus: HyperframesRenderStatus =
    completedFinalNeedsPlayableOutput && (!hasPlayableFinalOutput || !finalProbePassed)
      ? "failed_permanent"
      : input.status;
  const copy = getHyperframesStatusCopy(projectedStatus, "th");
  const repairActions = repairActionsForStatus(projectedStatus);
  const canMutate = Boolean(input.canMutate);
  const safeDiagnostics = [
    ...(completedFinalNeedsPlayableOutput && (!hasPlayableFinalOutput || !finalProbePassed)
      ? [
          "HyperFrames final render completed without a verified playable final video output.",
        ]
      : []),
    ...(input.safeDiagnostics ?? []),
  ];
  return HyperframesRenderStatusProjectionSchema.parse({
    contractVersion: HYPERFRAMES_MARKETPLACE_CONTRACT_VERSION,
    renderJobId: input.renderJobId,
    tenantId: input.tenantId,
    productId: input.productId,
    runId: input.runId,
    launchMode: "auto_storyboard_review",
    status: projectedStatus,
    progressPercent: progressForStatus(projectedStatus),
    statusCopyId: copy.copyId,
    safeMessage: input.safeMessage ?? copy.description,
    safeDiagnostics: safeDiagnostics.map(redactHyperframesDiagnostics),
    nextAction: copy.nextAction,
    repairActions,
    permissions: {
      canCancel:
        input.permissions?.canCancel ??
        (canMutate && HYPERFRAMES_CANCELLABLE_RENDER_STATUSES.has(projectedStatus)),
      canRepair:
        input.permissions?.canRepair ??
        (canMutate &&
          repairActions.some(
            action => !action.requiresOperator && !action.disabledReason
          )),
    },
    polling: createDefaultHyperframesPollingGuidance(projectedStatus, {
      etag: stableHash({ status: projectedStatus, updatedAt: input.updatedAt }),
    }),
    templateId: input.payload?.templateId,
    templateVersion: input.payload?.templateVersion,
    templateContentHash: input.payload?.templateContentHash,
    platformPresetId: input.payload?.platformPresetId as never,
    platformPresetVersion: input.payload?.platformPresetVersion,
    renderIntent: input.payload?.renderIntent as never,
    compositionMode: input.payload?.compositionMode as never,
    compositionInputHash: input.payload?.compositionInputHash,
    compositionHtmlHash: input.payload?.compositionHtmlHash,
    runtimeProfileHash: input.payload?.runtimeProfileHash,
    creativePlanHash: input.payload?.creativePlanHash,
    presetManifestHash: input.payload?.presetManifestHash,
    audioEventMapHash: input.payload?.audioEventMapHash,
    fallbackQuality: input.payload?.fallbackQuality,
    hasAudio: input.payload?.playableProbe?.hasAudio,
    hasNativeAudio:
      Number(input.payload?.audioMixReport?.nativeInputWithAudioCount ?? 0) > 0,
    playableProbe: input.payload?.playableProbe ?? {},
    audioMixReport: input.payload?.audioMixReport ?? {},
    qaStatus: input.payload?.qaStatus ?? undefined,
    outputRefs,
    artifactRefs: input.artifactRefs ?? [],
    createdAt: input.createdAt,
    updatedAt: input.updatedAt ?? nowIso(),
  });
}

export function redactHyperframesRenderProjectionForUser(
  render: HyperframesRenderStatusProjection
): HyperframesRenderStatusProjection {
  return HyperframesRenderStatusProjectionSchema.parse({
    ...render,
    outputRefs: render.outputRefs.map(ref => ({
      ...ref,
      url: redactHyperframesOutputUrlForUser(ref.url),
      storageRef: null,
      thumbnailUrl: redactHyperframesOutputUrlForUser(ref.thumbnailUrl),
    })),
    safeDiagnostics: render.safeDiagnostics.map(redactHyperframesDiagnostics),
    artifactRefs: [],
    redaction: {
      rawHtmlHidden: true,
      signedUrlsHidden: true,
      workerLogsHidden: true,
      storageKeysHidden: true,
    },
  });
}

function outputRefsFromPayload(input: {
  payload: Partial<HyperframesRenderJobPayload>;
  renderJobId: string;
  libraryItemId?: string | number | null;
}): {
  outputRefs: HyperframesOutputRef[];
  artifactRefs: HyperframesArtifactRef[];
} {
  const parsedArtifact = HyperframesArtifactRefSchema.safeParse(
    input.payload.outputArtifactRef
  );
  if (!parsedArtifact.success) return { outputRefs: [], artifactRefs: [] };
  const artifact = parsedArtifact.data;
  const renderIntent = input.payload.renderIntent;
  const outputKind =
    input.libraryItemId != null
      ? "library_item"
      : renderIntent === "final" || renderIntent === "variant"
        ? "final_video"
        : "preview_video";
  return {
    artifactRefs: [artifact],
    outputRefs: [
      {
        outputId: artifact.artifactId || `${input.renderJobId}_output`,
        kind: outputKind,
        url: input.payload.outputUrl ?? null,
        storageRef: artifact.storageRef,
        thumbnailUrl: input.payload.thumbnailUrl ?? null,
        contentHash: artifact.contentHash,
        libraryItemId: input.libraryItemId ?? null,
        accessibleLabel:
          input.libraryItemId != null
            ? "HyperFrames Library video"
            : "HyperFrames rendered output",
      },
    ],
  };
}

function hasCompletedHyperframesOutput(
  outputRefs: HyperframesOutputRef[]
): boolean {
  return outputRefs.some(ref => Boolean(ref.url) && Boolean(ref.contentHash));
}

function mapWorkerJobStatusToHyperframesRenderStatus(
  status: string,
  failureReason?: string | null,
): HyperframesRenderStatus {
  if (status === "queued") return "queued";
  if (status === "claimed" || status === "preparing" || status === "running") {
    return "rendering";
  }
  if (status === "uploading" || status === "publishing") {
    return "saving_to_library";
  }
  if (status === "indexing") return "qa_checking";
  if (status === "completed") return "completed";
  if (status === "canceled") return "cancelled";
  if (status === "expired") return "failed_transient";
  if (status === "failed") {
    const reason = failureReason ?? "";
    if (HYPERFRAMES_RUNTIME_CONFIGURATION_BLOCKER_RE.test(reason)) {
      return "blocked_needs_user";
    }
    return HYPERFRAMES_RUNTIME_TRANSIENT_FAILURE_RE.test(reason)
      ? "failed_transient"
      : "failed_permanent";
  }
  return "failed_transient";
}

function payloadFromWorkerJobInput(inputJson: Record<string, unknown> | null | undefined): Partial<HyperframesRenderJobPayload> {
  const renderConfig =
    inputJson &&
    typeof inputJson.renderConfig === "object" &&
    inputJson.renderConfig &&
    !Array.isArray(inputJson.renderConfig)
      ? inputJson.renderConfig as Record<string, unknown>
      : {};
  const renderPayload =
    renderConfig.renderPayload &&
    typeof renderConfig.renderPayload === "object" &&
    !Array.isArray(renderConfig.renderPayload)
      ? renderConfig.renderPayload as Partial<HyperframesRenderJobPayload>
      : {};
  return {
    ...renderPayload,
    renderIntent: renderPayload.renderIntent ?? "final",
    compositionMode: renderPayload.compositionMode ?? "captioned_final_composite",
    launchMode: "auto_storyboard_review",
  };
}

function sourceRunIdFromWorkerJobInput(inputJson: Record<string, unknown> | null | undefined): string {
  const source =
    inputJson &&
    typeof inputJson.source === "object" &&
    inputJson.source &&
    !Array.isArray(inputJson.source)
      ? inputJson.source as Record<string, unknown>
      : {};
  return typeof source.runId === "string" ? source.runId.trim() : "";
}

function outputRefsFromWorkerArtifacts(input: {
  renderJobId: string;
  payload: Partial<HyperframesRenderJobPayload>;
  artifacts: Array<Record<string, any>>;
}): {
  outputRefs: HyperframesOutputRef[];
  artifactRefs: HyperframesArtifactRef[];
} {
  const refs: HyperframesOutputRef[] = [];
  const artifacts: HyperframesArtifactRef[] = [];
  for (const artifact of input.artifacts) {
    const metadata = artifact.metadataJson && typeof artifact.metadataJson === "object"
      ? artifact.metadataJson as Record<string, unknown>
      : {};
    const contentHash =
      typeof metadata.contentHash === "string"
        ? metadata.contentHash
        : typeof metadata.checksumSha256 === "string"
          ? metadata.checksumSha256
          : undefined;
    const url =
      typeof metadata.url === "string"
        ? metadata.url
        : typeof metadata.downloadUrl === "string"
          ? metadata.downloadUrl
          : null;
    const artifactRef = HyperframesArtifactRefSchema.safeParse({
      artifactId: artifact.id,
      kind:
        artifact.artifactType === "final_video" ||
        artifact.artifactType === "hyperframes_final_composite"
          ? "hyperframes_render_mp4"
          : artifact.artifactType,
      storageRef: artifact.storageRef,
      contentHash,
      mimeType:
        typeof metadata.contentType === "string"
          ? metadata.contentType
          : "video/mp4",
      sizeBytes:
        typeof metadata.sizeBytes === "number"
          ? metadata.sizeBytes
          : undefined,
      retentionClass:
        artifact.publishedItemId != null ? "library" : "review",
      redacted: true,
    });
    if (artifactRef.success) {
      artifacts.push(artifactRef.data);
    }
    refs.push({
      outputId: artifact.id ?? `${input.renderJobId}_output`,
      kind:
        artifact.publishedItemId != null
          ? "library_item"
          : input.payload.renderIntent === "final"
            ? "final_video"
            : "preview_video",
      url,
      storageRef: artifact.storageRef ?? null,
      thumbnailUrl:
        typeof metadata.thumbnailUrl === "string"
          ? metadata.thumbnailUrl
          : null,
      contentHash,
      libraryItemId: artifact.publishedItemId ?? null,
      accessibleLabel: "HyperFrames worker rendered output",
    });
  }
  return { outputRefs: refs, artifactRefs: artifacts };
}

function hasMarketplaceProductMutationAccess(
  access: Awaited<ReturnType<typeof getMarketplaceProductWithAccess>>
): boolean {
  const product = access.product as {
    accessType?: string | null;
    groupShare?: { permission?: string | null } | null;
  };
  return (
    product.accessType === "owner" ||
    product.groupShare?.permission === "read_update"
  );
}

export async function queueHyperframesRenderJob(input: {
  auth: HyperframesAuthContext;
  composition: HyperframesCompositionInput;
  jobType?: HyperframesOutboxJobType;
  priority?: number;
  maxAttempts?: number;
}): Promise<HyperframesRenderStatusProjection> {
  const tenantId = input.auth.tenantId ?? "default";
  const runId = input.composition.provenance.runId ?? "pending_run";
  const payload = buildHyperframesRenderJobPayload({ composition: input.composition });
  const idempotencyKey = buildHyperframesRenderJobIdempotencyKey({
    tenantId,
    runId,
    templateId: payload.templateId,
    templateVersion: payload.templateVersion,
    platformPresetId: input.composition.platformPreset.presetId,
    renderIntent: input.composition.renderIntent,
    compositionInputHash: payload.compositionInputHash,
    runtimeProfileHash: payload.runtimeProfileHash,
  });
  const renderJobId = `hf_${stableHash(idempotencyKey)}`;
  const db = await getDb();
  const jobType = input.jobType ?? "hyperframes_render";
  const now = new Date();
  if (db) {
    await ensureManualStoryboardOutboxParents({
      db,
      auth: input.auth,
      productId: input.composition.provenance.productId,
      runId,
      payload,
      now,
    });
    const insertedRows = await db
      .insert(marketplaceAutoReviewOutboxJobs)
      .values({
        id: renderJobId,
        runId,
        tenantId,
        userId: input.auth.userId,
        jobType,
        idempotencyKey,
        status: "queued",
        priority: input.priority ?? 70,
        attempts: 0,
        maxAttempts: input.maxAttempts ?? 3,
        payloadJson: payload,
        scheduledAt: now,
        createdAt: now,
        updatedAt: now,
      })
      .onConflictDoNothing()
      .returning({ id: marketplaceAutoReviewOutboxJobs.id });
    if (insertedRows.length === 0) {
      const [existingJob] = await db
        .select()
        .from(marketplaceAutoReviewOutboxJobs)
        .where(eq(marketplaceAutoReviewOutboxJobs.id, renderJobId))
        .limit(1);
      if (existingJob) {
        const existingStatus = mapOutboxStatusToRenderStatus(
          existingJob.status,
          existingJob.lastError,
          existingJob.jobType
        );
        const shouldRequeue =
          existingStatus === "failed_transient" ||
          existingStatus === "blocked_needs_user" ||
          existingJob.status === "cancelled" ||
          existingJob.status === "dead_lettered";
        if (shouldRequeue) {
          await db
            .update(marketplaceAutoReviewOutboxJobs)
            .set({
              status: "queued",
              priority: input.priority ?? existingJob.priority ?? 70,
              attempts: 0,
              maxAttempts: input.maxAttempts ?? existingJob.maxAttempts ?? 3,
              lockedBy: null,
              lockedUntil: null,
              completedAt: null,
              lastError: null,
              payloadJson: payload,
              scheduledAt: now,
              updatedAt: now,
            })
            .where(eq(marketplaceAutoReviewOutboxJobs.id, renderJobId));
        } else if (existingStatus === "failed_permanent") {
          throw new TRPCError({
            code: "PRECONDITION_FAILED",
            message:
              "ไม่ได้ส่ง Render เพราะ prompt/config ชุดเดิมเคย fail แบบถาวรแล้ว ให้แก้ prompt/settings หรือกด Generate Prompt ใหม่ก่อน render อีกครั้ง",
          });
        } else {
          return getHyperframesRenderProjection({
            auth: input.auth,
            renderJobId,
            productId: input.composition.provenance.productId,
            runId,
          });
        }
      }
    }
  }
  return buildHyperframesRenderProjection({
    tenantId,
    productId: input.composition.provenance.productId,
    runId,
    renderJobId,
    status: "queued",
    payload,
    canMutate: true,
  });
}

export async function getHyperframesRenderProjection(input: {
  auth: HyperframesAuthContext;
  renderJobId?: string;
  productId?: string;
  runId?: string;
  operatorTenantAccess?: boolean;
}): Promise<HyperframesRenderStatusProjection> {
  const tenantId = input.auth.tenantId ?? "default";
  const db = await getDb();
  let renderJobId = input.renderJobId?.trim() || "";
  if (db) {
    if (!renderJobId && input.runId) {
      const workerFilters = [
        sql`(${workerJobs.workflowRunId} = ${input.runId} OR ${workerJobs.inputJson}->'source'->>'runId' = ${input.runId})`,
        eq(workerJobs.jobType, "hyperframes_final_composite"),
      ];
      if (input.operatorTenantAccess || input.auth.tenantId) {
        workerFilters.push(eq(workerJobs.tenantId, tenantId));
      } else {
        workerFilters.push(eq(workerJobs.requestedByUserId, input.auth.userId));
      }
      const [latestWorkerJob] = await db
        .select({ id: workerJobs.id })
        .from(workerJobs)
        .where(and(...workerFilters))
        .orderBy(desc(workerJobs.createdAt))
        .limit(1);
      renderJobId = latestWorkerJob?.id ?? renderJobId;
    }

    if (renderJobId) {
      const workerFilters = [
        eq(workerJobs.id, renderJobId),
        eq(workerJobs.jobType, "hyperframes_final_composite"),
      ];
      if (input.operatorTenantAccess || input.auth.tenantId) {
        workerFilters.push(eq(workerJobs.tenantId, tenantId));
      } else {
        workerFilters.push(eq(workerJobs.requestedByUserId, input.auth.userId));
      }
      const [workerJob] = await db
        .select()
        .from(workerJobs)
        .where(and(...workerFilters))
        .limit(1);
      if (
        workerJob &&
        workerJob.jobType === "hyperframes_final_composite" &&
        workerJob.runtimeType === "desktop_zeroclaw_managed"
      ) {
        const payload = payloadFromWorkerJobInput(workerJob.inputJson);
        const sourceRunId = sourceRunIdFromWorkerJobInput(workerJob.inputJson);
        const requestedProductId = input.productId?.trim();
        const payloadProductId =
          typeof payload.productId === "string" ? payload.productId.trim() : "";
        if (
          input.runId &&
          input.runId !== workerJob.workflowRunId &&
          input.runId !== sourceRunId
        ) {
          return buildHyperframesRenderProjection({
            tenantId,
            productId: input.productId ?? "unknown_product",
            runId: input.runId,
            renderJobId,
            status: "not_available",
          });
        }
        if (requestedProductId && payloadProductId && requestedProductId !== payloadProductId) {
          return buildHyperframesRenderProjection({
            tenantId,
            productId: requestedProductId,
            runId: input.runId ?? workerJob.workflowRunId ?? "unknown_run",
            renderJobId,
            status: "not_available",
          });
        }
        const artifacts = await db
          .select()
          .from(workerArtifacts)
          .where(eq(workerArtifacts.workerJobId, workerJob.id))
          .orderBy(desc(workerArtifacts.createdAt));
        const outputRefs = outputRefsFromWorkerArtifacts({
          renderJobId: workerJob.id,
          payload,
          artifacts,
        });
        const renderStatus = mapWorkerJobStatusToHyperframesRenderStatus(
          workerJob.status,
          workerJob.failureReason,
        );
        const queuedAgeMs = dateAgeMs(workerJob.createdAt);
        const queuedStale =
          renderStatus === "queued" &&
          !workerJob.workerId &&
          queuedAgeMs != null &&
          queuedAgeMs >= hyperframesQueuedStaleMs();
        const projectedStatus = queuedStale ? "failed_transient" : renderStatus;
        const safeDiagnostics = [
          "HyperFrames Final Composite is tracked by worker_jobs.hyperframes_final_composite.",
          ...(workerJob.workerId ? [`Claimed by worker ${workerJob.workerId}.`] : []),
          ...(queuedStale
            ? [
                "Worker job has stayed queued longer than expected without being claimed.",
              ]
            : []),
          ...(workerJob.failureReason ? [workerJob.failureReason.slice(0, 240)] : []),
        ];
        const canMutate =
          Boolean(input.operatorTenantAccess) ||
          workerJob.requestedByUserId === input.auth.userId;
        return buildHyperframesRenderProjection({
          tenantId: workerJob.tenantId ?? tenantId,
          productId: requestedProductId || payloadProductId || input.productId || "unknown_product",
          runId: sourceRunId || workerJob.workflowRunId || input.runId || "unknown_run",
          renderJobId: workerJob.id,
          status: projectedStatus,
          payload,
          safeMessage: queuedStale
            ? "HyperFrames Final Composite ยังรอ worker นานกว่าปกติ สามารถเปลี่ยน worker หรือ retry ได้"
            : safeMessageForRenderError(projectedStatus, workerJob.failureReason),
          safeDiagnostics,
          outputRefs: outputRefs.outputRefs,
          artifactRefs: outputRefs.artifactRefs,
          canMutate,
          createdAt: workerJob.createdAt?.toISOString?.() ?? undefined,
          updatedAt:
            workerJob.finishedAt?.toISOString?.() ??
            workerJob.startedAt?.toISOString?.() ??
            workerJob.createdAt?.toISOString?.() ??
            nowIso(),
        });
      }
    }

    if (!renderJobId && input.runId) {
      const filters = [
        eq(marketplaceAutoReviewOutboxJobs.runId, input.runId),
        inArray(marketplaceAutoReviewOutboxJobs.jobType, [
          "hyperframes_render",
          "hyperframes_finalize",
        ]),
        sql`${marketplaceAutoReviewOutboxJobs.payloadJson}->>'renderIntent' = 'final'`,
      ];
      if (input.operatorTenantAccess || input.auth.tenantId) {
        filters.push(eq(marketplaceAutoReviewOutboxJobs.tenantId, tenantId));
      } else {
        filters.push(eq(marketplaceAutoReviewOutboxJobs.userId, input.auth.userId));
      }
      if (input.productId) {
        filters.push(sql`${marketplaceAutoReviewOutboxJobs.payloadJson}->>'productId' = ${input.productId}`);
      }
      const [latestJob] = await db
        .select({ id: marketplaceAutoReviewOutboxJobs.id })
        .from(marketplaceAutoReviewOutboxJobs)
        .where(and(...filters))
        .orderBy(
          desc(marketplaceAutoReviewOutboxJobs.updatedAt),
          desc(marketplaceAutoReviewOutboxJobs.createdAt)
        )
        .limit(1);
      renderJobId = latestJob?.id ?? "";
    }
    const [job] = await db
      .select()
      .from(marketplaceAutoReviewOutboxJobs)
      .where(
        input.operatorTenantAccess
          ? and(
              eq(marketplaceAutoReviewOutboxJobs.id, renderJobId),
              eq(marketplaceAutoReviewOutboxJobs.tenantId, tenantId)
            )
          : input.productId && input.auth.tenantId
            ? and(
                eq(marketplaceAutoReviewOutboxJobs.id, renderJobId),
                eq(marketplaceAutoReviewOutboxJobs.tenantId, tenantId)
              )
          : and(
              eq(marketplaceAutoReviewOutboxJobs.id, renderJobId),
              eq(marketplaceAutoReviewOutboxJobs.userId, input.auth.userId)
            )
      )
      .limit(1);
    if (job) {
      const payload = (job.payloadJson ?? {}) as Partial<HyperframesRenderJobPayload>;
      const requestedProductId = input.productId?.trim();
      const payloadProductId =
        typeof payload.productId === "string" ? payload.productId.trim() : "";
      let canMutate = Boolean(input.operatorTenantAccess || job.userId === input.auth.userId);
      if (!input.operatorTenantAccess && requestedProductId) {
        try {
          const productAccess = await getMarketplaceProductWithAccess(
            requestedProductId,
            input.auth
          );
          canMutate = canMutate || hasMarketplaceProductMutationAccess(productAccess);
        } catch {
          return buildHyperframesRenderProjection({
            tenantId,
            productId: requestedProductId,
            runId: input.runId ?? job.runId,
            renderJobId,
            status: "not_available",
          });
        }
      }
      if (input.runId && input.runId !== job.runId) {
        return buildHyperframesRenderProjection({
          tenantId,
          productId: input.productId ?? "unknown_product",
          runId: input.runId,
          renderJobId,
          status: "not_available",
        });
      }
      if (input.auth.tenantId && job.tenantId && input.auth.tenantId !== job.tenantId) {
        return buildHyperframesRenderProjection({
          tenantId,
          productId: input.productId ?? "unknown_product",
          runId: input.runId ?? job.runId,
          renderJobId,
          status: "not_available",
        });
      }
      if (requestedProductId && payloadProductId && requestedProductId !== payloadProductId) {
        return buildHyperframesRenderProjection({
          tenantId,
          productId: requestedProductId,
          runId: input.runId ?? job.runId,
          renderJobId,
          status: "not_available",
        });
      }
      const outputRefs = outputRefsFromPayload({
        payload,
        renderJobId: job.id,
      });
      const renderStatus = mapOutboxStatusToRenderStatus(
        job.status,
        job.lastError,
        job.jobType
      );
      const hasCompletedOutput = hasCompletedHyperframesOutput(
        outputRefs.outputRefs
      );
      const effectiveRenderStatus =
        hasCompletedOutput && HYPERFRAMES_ACTIVE_RENDER_STATUSES.has(renderStatus)
          ? "completed"
          : renderStatus;
      const hasSafeFinalVideoOutput = outputRefs.outputRefs.some(ref =>
        ref.kind === "final_video" &&
        Boolean(ref.url) &&
        Boolean(ref.contentHash)
      );
      const finalProbePassed = payload.playableProbe?.passed === true;
      const completedFinalMissingPlayableOutput =
        effectiveRenderStatus === "completed" &&
        payload.renderIntent === "final" &&
        (!hasSafeFinalVideoOutput || !finalProbePassed);
      const queuedAgeMs = dateAgeMs(job.updatedAt);
      const queuedStale =
        effectiveRenderStatus === "queued" &&
        Number(job.attempts ?? 0) === 0 &&
        !job.lockedBy &&
        queuedAgeMs != null &&
        queuedAgeMs >= hyperframesQueuedStaleMs();
      const projectedStatus = completedFinalMissingPlayableOutput
        ? "failed_permanent"
        : queuedStale
        ? "failed_transient"
        : effectiveRenderStatus;
      const safeDiagnostics = [
        ...(completedFinalMissingPlayableOutput
          ? [
              "HyperFrames final render completed without a verified playable final video output.",
            ]
          : []),
        ...(hasCompletedOutput && renderStatus !== "completed"
          ? [
              "HyperFrames output artifact exists even though the worker queue status is stale; projection is closed as completed.",
            ]
          : []),
        ...(queuedStale
          ? [
              "HyperFrames render job has stayed queued longer than expected without a worker lock or attempt.",
            ]
          : []),
        ...(job.lastError ? [job.lastError.slice(0, 240)] : []),
      ];
      return buildHyperframesRenderProjection({
        tenantId: job.tenantId ?? tenantId,
        productId: requestedProductId || payloadProductId || "unknown_product",
        runId: job.runId,
        renderJobId: job.id,
        status: projectedStatus,
        payload,
        safeMessage: queuedStale
          ? payload.renderIntent === "final"
            ? "HyperFrames Final Composite ยังไม่เริ่มหลังรอนานกว่าปกติ ระบบจะให้ retry งาน worker ได้โดยไม่ต้องแก้ blocker"
            : "HyperFrames preview ยังไม่เริ่มหลังรอนานกว่าปกติ ระบบจะให้ retry งาน worker ได้โดยไม่ต้องแก้ blocker"
          : safeMessageForRenderError(projectedStatus, job.lastError),
        safeDiagnostics,
        outputRefs: outputRefs.outputRefs,
        artifactRefs: outputRefs.artifactRefs,
        canMutate,
        createdAt: job.createdAt?.toISOString?.() ?? undefined,
        updatedAt: job.updatedAt?.toISOString?.() ?? nowIso(),
      });
    }
  }
  return buildHyperframesRenderProjection({
    tenantId,
    productId: input.productId ?? "unknown_product",
    runId: input.runId ?? "unknown_run",
    renderJobId: renderJobId || `hf_latest_${stableHash({
      tenantId,
      productId: input.productId ?? "",
      runId: input.runId ?? "",
    }).slice(0, 24)}`,
    status: "not_available",
  });
}

export async function retryHyperframesRenderJob(input: {
  auth: HyperframesAuthContext;
  renderJobId: string;
  productId?: string;
  runId?: string;
  operatorTenantAccess?: boolean;
}): Promise<HyperframesRenderStatusProjection> {
  const tenantId = input.auth.tenantId ?? "default";
  const db = await getDb();
  if (!db) return getHyperframesRenderProjection(input);

  const [job] = await db
    .select()
    .from(marketplaceAutoReviewOutboxJobs)
    .where(
      input.operatorTenantAccess
        ? and(
            eq(marketplaceAutoReviewOutboxJobs.id, input.renderJobId),
            eq(marketplaceAutoReviewOutboxJobs.tenantId, tenantId)
          )
        : input.productId && input.auth.tenantId
          ? and(
              eq(marketplaceAutoReviewOutboxJobs.id, input.renderJobId),
              eq(marketplaceAutoReviewOutboxJobs.tenantId, tenantId)
            )
          : and(
              eq(marketplaceAutoReviewOutboxJobs.id, input.renderJobId),
              eq(marketplaceAutoReviewOutboxJobs.userId, input.auth.userId)
            )
    )
    .limit(1);

  if (!job) return getHyperframesRenderProjection(input);

  const payload = (job.payloadJson ?? {}) as Partial<HyperframesRenderJobPayload>;
  const requestedProductId = input.productId?.trim();
  const payloadProductId =
    typeof payload.productId === "string" ? payload.productId.trim() : "";
  let canMutate = Boolean(input.operatorTenantAccess || job.userId === input.auth.userId);
  if (requestedProductId) {
    if (payloadProductId && requestedProductId !== payloadProductId) {
      return buildHyperframesRenderProjection({
        tenantId,
        productId: requestedProductId,
        runId: input.runId ?? job.runId,
        renderJobId: input.renderJobId,
        status: "not_available",
      });
    }
    try {
      const productAccess = await getMarketplaceProductWithAccess(
        requestedProductId,
        input.auth
      );
      canMutate = canMutate || hasMarketplaceProductMutationAccess(productAccess);
    } catch {
      return buildHyperframesRenderProjection({
        tenantId,
        productId: requestedProductId,
        runId: input.runId ?? job.runId,
        renderJobId: input.renderJobId,
        status: "not_available",
      });
    }
  }
  if (!canMutate) return getHyperframesRenderProjection(input);

  if (input.runId && input.runId !== job.runId) {
    return buildHyperframesRenderProjection({
      tenantId,
      productId: requestedProductId ?? payloadProductId ?? "unknown_product",
      runId: input.runId,
      renderJobId: input.renderJobId,
      status: "not_available",
    });
  }

  const renderStatus = mapOutboxStatusToRenderStatus(
    job.status,
    job.lastError,
    job.jobType
  );
  if (!HYPERFRAMES_USER_RETRYABLE_RENDER_STATUSES.has(renderStatus)) {
    return getHyperframesRenderProjection(input);
  }

  const mutationScope =
    input.operatorTenantAccess || (input.productId && input.auth.tenantId)
      ? eq(marketplaceAutoReviewOutboxJobs.tenantId, tenantId)
      : eq(marketplaceAutoReviewOutboxJobs.userId, input.auth.userId);
  const updatedRows = await db
    .update(marketplaceAutoReviewOutboxJobs)
    .set({
      status: "retry",
      lockedBy: null,
      lockedUntil: null,
      completedAt: null,
      lastError: null,
      scheduledAt: new Date(),
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(marketplaceAutoReviewOutboxJobs.id, input.renderJobId),
        eq(marketplaceAutoReviewOutboxJobs.runId, job.runId),
        mutationScope,
        inArray(
          marketplaceAutoReviewOutboxJobs.status,
          HYPERFRAMES_USER_RETRYABLE_OUTBOX_STATUSES
        ),
        job.updatedAt
          ? eq(marketplaceAutoReviewOutboxJobs.updatedAt, job.updatedAt)
          : undefined
      )
    )
    .returning({ id: marketplaceAutoReviewOutboxJobs.id });
  if (updatedRows.length === 0) {
    throw new TRPCError({
      code: "CONFLICT",
      message:
        "HyperFrames render changed before retry could be queued. Refresh status and try again.",
    });
  }

  return getHyperframesRenderProjection(input);
}

export async function cancelHyperframesRenderJob(input: {
  auth: HyperframesAuthContext;
  renderJobId: string;
  productId?: string;
  runId?: string;
  operatorTenantAccess?: boolean;
}): Promise<HyperframesRenderStatusProjection> {
  const current = await getHyperframesRenderProjection(input);
  if (!current.permissions.canCancel) return current;
  const tenantId = input.auth.tenantId ?? "default";
  const db = await getDb();
  if (db) {
    const mutationScope =
      input.operatorTenantAccess || (input.productId && input.auth.tenantId)
        ? eq(marketplaceAutoReviewOutboxJobs.tenantId, tenantId)
        : eq(marketplaceAutoReviewOutboxJobs.userId, input.auth.userId);
    const updatedRows = await db
      .update(marketplaceAutoReviewOutboxJobs)
      .set({
        status: "cancel_requested",
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(marketplaceAutoReviewOutboxJobs.id, input.renderJobId),
          eq(marketplaceAutoReviewOutboxJobs.runId, current.runId),
          mutationScope,
          inArray(
            marketplaceAutoReviewOutboxJobs.status,
            HYPERFRAMES_CANCELLABLE_OUTBOX_STATUSES
          )
        )
      )
      .returning({ id: marketplaceAutoReviewOutboxJobs.id });
    if (updatedRows.length === 0) {
      throw new TRPCError({
        code: "CONFLICT",
        message:
          "HyperFrames render changed before cancellation could be queued. Refresh status and try again.",
      });
    }
  }
  return getHyperframesRenderProjection(input);
}
