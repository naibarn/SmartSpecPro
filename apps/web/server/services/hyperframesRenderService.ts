import { and, eq, inArray } from "drizzle-orm";
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
import { marketplaceAutoReviewOutboxJobs } from "../../drizzle/schema";
import type { HyperframesAuthContext } from "./hyperframesFeatureAccessService";

export const HYPERFRAMES_OUTBOX_JOB_TYPES = [
  "hyperframes_asset_stage",
  "hyperframes_lint",
  "hyperframes_snapshot",
  "hyperframes_render",
  "hyperframes_inspect",
  "hyperframes_finalize",
] as const;

export type HyperframesOutboxJobType = (typeof HYPERFRAMES_OUTBOX_JOB_TYPES)[number];

export interface HyperframesRenderJobPayload {
  productId: string;
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
  outputArtifactRef?: HyperframesArtifactRef | null;
  outputUrl?: string | null;
  thumbnailUrl?: string | null;
  qaStatus?: "passed" | "passed_with_warnings" | "failed" | null;
}

function nowIso(): string {
  return new Date().toISOString();
}

const HYPERFRAMES_CANCELLABLE_OUTBOX_STATUSES = [
  "queued",
  "pending",
  "retry",
  "locked",
  "running",
] as const;

export function mapOutboxStatusToRenderStatus(
  status: string,
  lastError?: string | null
): HyperframesRenderStatus {
  if (status === "queued" || status === "pending" || status === "retry") return "queued";
  if (status === "locked" || status === "running") return "rendering";
  if (status === "completed") return "completed";
  if (status === "cancel_requested") return "cancel_requested";
  if (status === "cancelled") return "cancelled";
  if (status === "dead_lettered") return "dead_lettered";
  if (status === "failed") {
    const error = lastError ?? "";
    if (
      /runtime execution is not implemented|runtime.*not ready|dependency\/runtime|dependency.*deferred|runtime rollout/i.test(
        error
      )
    ) {
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

export function buildHyperframesRenderJobPayload(input: {
  composition: HyperframesCompositionInput;
  traceId?: string;
  correlationId?: string;
}): HyperframesRenderJobPayload {
  const compositionHtmlHash = stableHash({
    template: input.composition.template,
    copy: input.composition.copy,
    platform: input.composition.platformPreset.presetId,
  });
  return {
    productId: input.composition.provenance.productId,
    compositionInputHash: input.composition.provenance.compositionInputHash,
    compositionHtmlHash,
    templateId: input.composition.template.templateId,
    templateVersion: input.composition.template.templateVersion,
    templateContentHash: input.composition.template.templateContentHash,
    platformPresetId: input.composition.platformPreset.presetId,
    platformPresetVersion: input.composition.platformPreset.platformPresetVersion,
    renderIntent: input.composition.renderIntent,
    compositionMode: input.composition.compositionMode,
    runtimeProfileHash: stableHash({
      fps: input.composition.platformPreset.fps,
      width: input.composition.platformPreset.width,
      height: input.composition.platformPreset.height,
      renderEngine: input.composition.renderEngine,
    }),
    launchMode: "auto_storyboard_review",
    traceId: input.traceId ?? `trace_${stableHash(input.composition.provenance)}`,
    correlationId:
      input.correlationId ?? `corr_${stableHash(input.composition.provenance)}`,
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
  outputUrl?: string | null;
  outputRefs?: HyperframesOutputRef[];
  artifactRefs?: HyperframesArtifactRef[];
  libraryItemId?: string | number | null;
  updatedAt?: string;
}): HyperframesRenderStatusProjection {
  const copy = getHyperframesStatusCopy(input.status, "th");
  return HyperframesRenderStatusProjectionSchema.parse({
    contractVersion: HYPERFRAMES_MARKETPLACE_CONTRACT_VERSION,
    renderJobId: input.renderJobId,
    tenantId: input.tenantId,
    productId: input.productId,
    runId: input.runId,
    launchMode: "auto_storyboard_review",
    status: input.status,
    progressPercent: progressForStatus(input.status),
    statusCopyId: copy.copyId,
    safeMessage: copy.description,
    safeDiagnostics: input.safeDiagnostics ?? [],
    nextAction: copy.nextAction,
    repairActions: repairActionsForStatus(input.status),
    polling: createDefaultHyperframesPollingGuidance(input.status, {
      etag: stableHash({ status: input.status, updatedAt: input.updatedAt }),
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
    qaStatus: input.payload?.qaStatus ?? undefined,
    outputRefs: input.outputRefs ?? (input.outputUrl
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
          },
        ]
      : []),
    artifactRefs: input.artifactRefs ?? [],
    updatedAt: input.updatedAt ?? nowIso(),
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
  });
  const renderJobId = `hf_${stableHash(idempotencyKey)}`;
  const db = await getDb();
  if (db) {
    await db
      .insert(marketplaceAutoReviewOutboxJobs)
      .values({
        id: renderJobId,
        runId,
        tenantId,
        userId: input.auth.userId,
        jobType: input.jobType ?? "hyperframes_render",
        idempotencyKey,
        status: "queued",
        priority: input.priority ?? 70,
        attempts: 0,
        maxAttempts: input.maxAttempts ?? 3,
        payloadJson: payload,
        scheduledAt: new Date(),
        createdAt: new Date(),
        updatedAt: new Date(),
      })
      .onConflictDoNothing();
  }
  return buildHyperframesRenderProjection({
    tenantId,
    productId: input.composition.provenance.productId,
    runId,
    renderJobId,
    status: "queued",
    payload,
  });
}

export async function getHyperframesRenderProjection(input: {
  auth: HyperframesAuthContext;
  renderJobId: string;
  productId?: string;
  runId?: string;
  operatorTenantAccess?: boolean;
}): Promise<HyperframesRenderStatusProjection> {
  const tenantId = input.auth.tenantId ?? "default";
  const db = await getDb();
  if (db) {
    const [job] = await db
      .select()
      .from(marketplaceAutoReviewOutboxJobs)
      .where(
        input.operatorTenantAccess
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
    if (job) {
      const payload = (job.payloadJson ?? {}) as Partial<HyperframesRenderJobPayload>;
      const requestedProductId = input.productId?.trim();
      const payloadProductId =
        typeof payload.productId === "string" ? payload.productId.trim() : "";
      if (input.runId && input.runId !== job.runId) {
        return buildHyperframesRenderProjection({
          tenantId,
          productId: input.productId ?? "unknown_product",
          runId: input.runId,
          renderJobId: input.renderJobId,
          status: "not_available",
        });
      }
      if (input.auth.tenantId && job.tenantId && input.auth.tenantId !== job.tenantId) {
        return buildHyperframesRenderProjection({
          tenantId,
          productId: input.productId ?? "unknown_product",
          runId: input.runId ?? job.runId,
          renderJobId: input.renderJobId,
          status: "not_available",
        });
      }
      if (requestedProductId && payloadProductId && requestedProductId !== payloadProductId) {
        return buildHyperframesRenderProjection({
          tenantId,
          productId: requestedProductId,
          runId: input.runId ?? job.runId,
          renderJobId: input.renderJobId,
          status: "not_available",
        });
      }
      const outputRefs = outputRefsFromPayload({
        payload,
        renderJobId: job.id,
      });
      return buildHyperframesRenderProjection({
        tenantId: job.tenantId ?? tenantId,
        productId: requestedProductId || payloadProductId || "unknown_product",
        runId: job.runId,
        renderJobId: job.id,
        status: mapOutboxStatusToRenderStatus(job.status, job.lastError),
        payload,
        safeDiagnostics: job.lastError ? [job.lastError.slice(0, 240)] : [],
        outputRefs: outputRefs.outputRefs,
        artifactRefs: outputRefs.artifactRefs,
        updatedAt: job.updatedAt?.toISOString?.() ?? nowIso(),
      });
    }
  }
  return buildHyperframesRenderProjection({
    tenantId,
    productId: input.productId ?? "unknown_product",
    runId: input.runId ?? "unknown_run",
    renderJobId: input.renderJobId,
    status: "not_available",
  });
}

export async function cancelHyperframesRenderJob(input: {
  auth: HyperframesAuthContext;
  renderJobId: string;
  productId?: string;
  runId?: string;
  operatorTenantAccess?: boolean;
}): Promise<HyperframesRenderStatusProjection> {
  const tenantId = input.auth.tenantId ?? "default";
  const db = await getDb();
  if (db) {
    await db
      .update(marketplaceAutoReviewOutboxJobs)
      .set({
        status: "cancel_requested",
        updatedAt: new Date(),
      })
      .where(
        input.operatorTenantAccess
          ? and(
              eq(marketplaceAutoReviewOutboxJobs.id, input.renderJobId),
              eq(marketplaceAutoReviewOutboxJobs.tenantId, tenantId),
              inArray(
                marketplaceAutoReviewOutboxJobs.status,
                HYPERFRAMES_CANCELLABLE_OUTBOX_STATUSES
              )
            )
          : and(
              eq(marketplaceAutoReviewOutboxJobs.id, input.renderJobId),
              eq(marketplaceAutoReviewOutboxJobs.userId, input.auth.userId),
              inArray(
                marketplaceAutoReviewOutboxJobs.status,
                HYPERFRAMES_CANCELLABLE_OUTBOX_STATUSES
              )
            )
      );
  }
  return getHyperframesRenderProjection(input);
}
