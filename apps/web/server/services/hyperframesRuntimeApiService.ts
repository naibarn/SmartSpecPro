import { TRPCError } from "@trpc/server";
import {
  HYPERFRAMES_MARKETPLACE_CONTRACT_VERSION,
  buildHyperframesLibraryIdempotencyKey,
  createDefaultHyperframesPollingGuidance,
  type HyperframesArtifactRef,
  type HyperframesRenderStatusProjection,
  type HyperframesRenderIntent,
  type MarketplaceAutoReviewCompositionMode,
} from "@shared/hyperframes/contracts";
import { listHyperframesTemplateRegistry } from "./hyperframesTemplateRegistry";
import {
  getHyperframesAutoStoryboardReviewPlan,
} from "./hyperframesAutoPlanService";
import {
  buildHyperframesCreditEstimate,
  resolveHyperframesFeatureAccess,
  type HyperframesAuthContext,
} from "./hyperframesFeatureAccessService";
import {
  getMarketplaceAutoReviewRun,
  startMarketplaceAutoReviewRun,
} from "./marketplaceAutoReviewService";
import { getMarketplaceProductWithAccess } from "./marketplaceProductService";
import { buildHyperframesCompositionInput } from "./hyperframesCompositionService";
import {
  buildHyperframesRenderJobPayload,
  buildHyperframesRenderProjection,
  cancelHyperframesRenderJob,
  getHyperframesRenderProjection,
  queueHyperframesRenderJob,
} from "./hyperframesRenderService";
import { finalizeHyperframesRenderToLibrary } from "./hyperframesLibraryFinalizeService";

const INVALIDATES = [
  "marketplaceCapture.listAutoReviewRuns",
  "marketplaceCapture.getProduct",
  "marketplaceCapture.getAutoReviewRun",
  "marketplaceCapture.getAutoStoryboardReviewPlan",
  "marketplaceCapture.getHyperframesRenderJob",
  "media.library",
  "media.panel",
];

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function cleanText(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function stringList(value: unknown): string[] {
  return Array.isArray(value)
    ? value.map(item => cleanText(item)).filter(Boolean)
    : [];
}

export function isHyperframesRunEligibleForPreview(runState: unknown): {
  eligible: boolean;
  reason: string;
} {
  const run = isRecord(runState) ? runState : {};
  const metadata = isRecord(run.metadataJson) ? run.metadataJson : {};
  const result = isRecord(run.resultJson) ? run.resultJson : {};
  const links = isRecord(run.links) ? run.links : {};
  const storyboardReviewId =
    cleanText(run.storyboardReviewId) ||
    cleanText(result.storyboardReviewId) ||
    cleanText(links.storyboardReview);
  const frameUrls = [
    ...stringList(metadata.storyboardFrameUrls),
    ...stringList(result.frameUrls),
    ...stringList(result.storyboardFrameUrls),
  ];
  const timeline = isRecord(run.timeline) ? run.timeline : {};
  const items = Array.isArray(timeline.items) ? timeline.items : [];
  const storyboardStageCompleted = items.some(item => {
    const record = isRecord(item) ? item : {};
    return (
      cleanText(record.stageKey) === "storyboard_review" &&
      ["completed", "completed_with_warnings", "skipped"].includes(
        cleanText(record.status)
      )
    );
  });
  if (storyboardReviewId || frameUrls.length > 0 || storyboardStageCompleted) {
    return { eligible: true, reason: "storyboard_ready" };
  }
  return {
    eligible: false,
    reason: "storyboard_review_not_ready",
  };
}

function unavailableRenderProjection(input: {
  auth: HyperframesAuthContext;
  productId: string;
  runId: string;
  renderJobId: string;
  status?: HyperframesRenderStatusProjection["status"];
  diagnostics?: string[];
}) {
  return buildHyperframesRenderProjection({
    tenantId: input.auth.tenantId ?? "default",
    productId: input.productId,
    runId: input.runId,
    renderJobId: input.renderJobId,
    status: input.status ?? "not_available",
    safeDiagnostics: input.diagnostics,
  });
}

function findLibraryOutputArtifact(
  render: HyperframesRenderStatusProjection
): HyperframesArtifactRef | null {
  const output = render.outputRefs.find(ref => ref.contentHash);
  if (!output?.contentHash) return null;
  return (
    render.artifactRefs.find(
      ref =>
        (ref.kind === "hyperframes_render_mp4" ||
          ref.kind === "hyperframes_render_webm") &&
        ref.contentHash === output.contentHash &&
        ref.retentionClass === "library"
    ) ?? null
  );
}

export function buildHyperframesFinalizeInputFromCompletedRender(input: {
  auth: HyperframesAuthContext;
  productId: string;
  runId: string;
  renderJobId: string;
  idempotencyKey: string;
  render: HyperframesRenderStatusProjection;
}) {
  const render = input.render;
  if (render.status !== "completed" && render.status !== "ready_for_review") {
    throw new TRPCError({
      code: "PRECONDITION_FAILED",
      message: "HyperFrames render must be completed before saving to Library.",
    });
  }
  if (render.renderIntent === "preview" || render.renderIntent === "snapshot") {
    throw new TRPCError({
      code: "PRECONDITION_FAILED",
      message: "Preview-only HyperFrames outputs cannot be saved as durable Library videos.",
    });
  }
  const outputArtifactRef = findLibraryOutputArtifact(render);
  const output = render.outputRefs.find(
    ref => ref.contentHash === outputArtifactRef?.contentHash
  );
  if (!outputArtifactRef || !output?.contentHash) {
    throw new TRPCError({
      code: "PRECONDITION_FAILED",
      message: "HyperFrames render output artifact is missing or not QA-ready.",
    });
  }
  const compositionInputHash = render.compositionInputHash;
  if (
    !compositionInputHash ||
    !render.compositionHtmlHash ||
    !render.templateId ||
    !render.templateVersion ||
    !render.templateContentHash ||
    !render.platformPresetId ||
    !render.platformPresetVersion ||
    !render.renderIntent ||
    !render.compositionMode ||
    !render.runtimeProfileHash
  ) {
    throw new TRPCError({
      code: "PRECONDITION_FAILED",
      message: "HyperFrames render metadata is incomplete for Library finalization.",
    });
  }
  if (render.qaStatus !== "passed" && render.qaStatus !== "passed_with_warnings") {
    throw new TRPCError({
      code: "PRECONDITION_FAILED",
      message: "HyperFrames render QA must pass before saving to Library.",
    });
  }
  const expectedKey = buildHyperframesLibraryIdempotencyKey({
    tenantId: input.auth.tenantId ?? "default",
    runId: input.runId,
    renderIntent: render.renderIntent,
    compositionInputHash,
    outputHash: outputArtifactRef.contentHash,
  });
  if (input.idempotencyKey !== expectedKey) {
    throw new TRPCError({
      code: "PRECONDITION_FAILED",
      message: "HyperFrames Library idempotency key does not match the completed output.",
    });
  }
  return {
    auth: input.auth,
    productId: input.productId,
    runId: input.runId,
    renderJobId: input.renderJobId,
    idempotencyKey: input.idempotencyKey,
    payload: {
      productId: input.productId,
      compositionInputHash,
      compositionHtmlHash: render.compositionHtmlHash,
      templateId: render.templateId,
      templateVersion: render.templateVersion,
      templateContentHash: render.templateContentHash,
      platformPresetId: render.platformPresetId,
      platformPresetVersion: render.platformPresetVersion,
      renderIntent: render.renderIntent,
      compositionMode: render.compositionMode,
      runtimeProfileHash: render.runtimeProfileHash,
      launchMode: "auto_storyboard_review" as const,
      traceId: `trace_${input.renderJobId}`,
      correlationId: `corr_${input.renderJobId}`,
      outputArtifactRef,
      outputUrl: output.url ?? null,
      thumbnailUrl: output.thumbnailUrl ?? null,
      qaStatus: render.qaStatus,
    },
    outputArtifactRef,
    outputUrl: output.url ?? null,
    thumbnailUrl: output.thumbnailUrl ?? null,
    qaStatus: render.qaStatus,
  };
}

export async function getAutoStoryboardReviewPlanForApi(input: {
  productId: string;
  auth: HyperframesAuthContext;
  includeTemplates?: boolean;
}) {
  const plan = await getHyperframesAutoStoryboardReviewPlan({
    productId: input.productId,
    auth: input.auth,
  });
  return {
    contractVersion:
      HYPERFRAMES_MARKETPLACE_CONTRACT_VERSION as typeof HYPERFRAMES_MARKETPLACE_CONTRACT_VERSION,
    access: plan.access,
    plan,
    templates: input.includeTemplates
      ? listHyperframesTemplateRegistry({
          compositionMode: plan.defaults.compositionMode,
          renderIntent: plan.defaults.renderIntent,
        })
      : [],
  };
}

export async function startAutoStoryboardReviewForApi(input: {
  productId: string;
  auth: HyperframesAuthContext;
  expectedPlanHash?: string;
  overrides?: Record<string, unknown>;
  runtime?: Record<string, unknown>;
}) {
  const plan = await getHyperframesAutoStoryboardReviewPlan({
    productId: input.productId,
    auth: input.auth,
    overrides: input.overrides,
  });
  if (input.expectedPlanHash && input.expectedPlanHash !== plan.planHash) {
    throw new TRPCError({
      code: "PRECONDITION_FAILED",
      message: "Auto Storyboard Review plan is stale. Refresh the plan and try again.",
    });
  }
  if (!plan.canStart) {
    return {
      contractVersion:
        HYPERFRAMES_MARKETPLACE_CONTRACT_VERSION as typeof HYPERFRAMES_MARKETPLACE_CONTRACT_VERSION,
      launchMode: "auto_storyboard_review" as const,
      plan,
      run: null,
      render: null,
      chargeSummary: {
        chargeRequired: false,
        quotaDecision: plan.quotaDecision,
        noChargeReason: "feature_disabled" as const,
      },
      polling: createDefaultHyperframesPollingGuidance("not_available"),
      invalidates: [],
    };
  }
  const run = await startMarketplaceAutoReviewRun(
    {
      productId: input.productId,
      creationIntent: "auto_review_video",
      outputMode: plan.defaults.outputMode,
      frameStrategy: plan.defaults.frameStrategy,
      audioStrategy: plan.defaults.audioStrategy,
      shotCount: plan.defaults.shotCount,
      overlayTextMode: plan.defaults.overlayTextMode,
      imageModel: plan.defaults.imageModel,
      qualityMode: "balanced",
    },
    input.auth,
    input.runtime ?? {}
  );
  const runRecord = (run ?? {}) as Record<string, unknown>;
  const runId = String(runRecord.id ?? "");
  const eligibility = isHyperframesRunEligibleForPreview(runRecord);
  if (!eligibility.eligible) {
    return {
      contractVersion:
        HYPERFRAMES_MARKETPLACE_CONTRACT_VERSION as typeof HYPERFRAMES_MARKETPLACE_CONTRACT_VERSION,
      launchMode: "auto_storyboard_review" as const,
      plan,
      run: runRecord,
      render: null,
      chargeSummary: {
        chargeRequired: false,
        creditEstimate: plan.creditEstimate ?? undefined,
        quotaDecision: plan.quotaDecision,
        noChargeReason: "not_applicable" as const,
        idempotencyKey: plan.creditEstimate?.idempotencyKey,
      },
      polling: createDefaultHyperframesPollingGuidance("not_available"),
      invalidates: INVALIDATES,
    };
  }
  const productBundle = await getMarketplaceProductWithAccess(input.productId, input.auth);
  const composition = buildHyperframesCompositionInput({
    tenantId: input.auth.tenantId ?? "default",
    userId: input.auth.userId,
    productId: input.productId,
    runId,
    productState: productBundle,
    runState: runRecord,
  });
  const render = await queueHyperframesRenderJob({
    auth: input.auth,
    composition,
  });
  return {
    contractVersion:
      HYPERFRAMES_MARKETPLACE_CONTRACT_VERSION as typeof HYPERFRAMES_MARKETPLACE_CONTRACT_VERSION,
    launchMode: "auto_storyboard_review" as const,
    plan,
    run: runRecord,
    render,
    chargeSummary: {
      chargeRequired: false,
      creditEstimate: plan.creditEstimate ?? undefined,
      quotaDecision: plan.quotaDecision,
      noChargeReason: "preview_only" as const,
      idempotencyKey: plan.creditEstimate?.idempotencyKey,
    },
    polling: render.polling,
    invalidates: INVALIDATES,
  };
}

export async function createHyperframesPreviewForApi(input: {
  productId: string;
  runId: string;
  auth: HyperframesAuthContext;
  expectedCompositionInputHash?: string;
}) {
  const access = resolveHyperframesFeatureAccess({
    auth: input.auth,
    productId: input.productId,
    runId: input.runId,
  });
  if (!access.capabilities.canPreview) {
    const render = buildHyperframesRenderProjection({
      tenantId: input.auth.tenantId ?? "default",
      productId: input.productId,
      runId: input.runId,
      renderJobId: `hf_unavailable_${input.runId}`,
      status: "not_available",
    });
    return {
      contractVersion:
        HYPERFRAMES_MARKETPLACE_CONTRACT_VERSION as typeof HYPERFRAMES_MARKETPLACE_CONTRACT_VERSION,
      render,
      chargeSummary: {
        chargeRequired: false,
        quotaDecision: access.creditAndQuota.quotaDecision,
        noChargeReason: "feature_disabled" as const,
      },
      polling: render.polling,
      invalidates: [],
    };
  }
  const [productBundle, runRecord] = await Promise.all([
    getMarketplaceProductWithAccess(input.productId, input.auth),
    getMarketplaceAutoReviewRun(input.runId, input.auth),
  ]);
  const runProductId = cleanText((runRecord as Record<string, unknown>).productId);
  if (runProductId && runProductId !== input.productId) {
    throw new TRPCError({
      code: "NOT_FOUND",
      message: "Auto review run was not found for this product.",
    });
  }
  const eligibility = isHyperframesRunEligibleForPreview(runRecord);
  if (!eligibility.eligible) {
    const render = unavailableRenderProjection({
      auth: input.auth,
      productId: input.productId,
      runId: input.runId,
      renderJobId: `hf_pending_${input.runId}`,
      status: "blocked_needs_user",
      diagnostics: [
        "Storyboard Review output is not ready yet; HyperFrames preview will queue after storyboard evidence exists.",
      ],
    });
    return {
      contractVersion:
        HYPERFRAMES_MARKETPLACE_CONTRACT_VERSION as typeof HYPERFRAMES_MARKETPLACE_CONTRACT_VERSION,
      render,
      chargeSummary: {
        chargeRequired: false,
        quotaDecision: "no_charge" as const,
        noChargeReason: "not_applicable" as const,
      },
      polling: render.polling,
      invalidates: [],
    };
  }
  const composition = buildHyperframesCompositionInput({
    tenantId: input.auth.tenantId ?? "default",
    userId: input.auth.userId,
    productId: input.productId,
    runId: input.runId,
    productState: productBundle,
    runState: runRecord,
  });
  if (
    input.expectedCompositionInputHash &&
    input.expectedCompositionInputHash !==
      composition.provenance.compositionInputHash
  ) {
    const render = buildHyperframesRenderProjection({
      tenantId: input.auth.tenantId ?? "default",
      productId: input.productId,
      runId: input.runId,
      renderJobId: `hf_stale_${input.runId}`,
      status: "stale_input_hash",
      payload: buildHyperframesRenderJobPayload({ composition }),
    });
    return {
      contractVersion:
        HYPERFRAMES_MARKETPLACE_CONTRACT_VERSION as typeof HYPERFRAMES_MARKETPLACE_CONTRACT_VERSION,
      render,
      chargeSummary: {
        chargeRequired: false,
        quotaDecision: "no_charge" as const,
        noChargeReason: "not_applicable" as const,
      },
      polling: render.polling,
      invalidates: [],
    };
  }
  const render = await queueHyperframesRenderJob({ auth: input.auth, composition });
  return {
    contractVersion:
      HYPERFRAMES_MARKETPLACE_CONTRACT_VERSION as typeof HYPERFRAMES_MARKETPLACE_CONTRACT_VERSION,
    render,
    chargeSummary: {
      chargeRequired: false,
      creditEstimate: buildHyperframesCreditEstimate({
        tenantId: input.auth.tenantId ?? "default",
        userId: input.auth.userId,
        runId: input.runId,
        renderIntent: "preview",
        compositionMode: "storyboard_motion_preview",
        costClass: "composition_preview",
        compositionInputHash: composition.provenance.compositionInputHash,
        templateVersion: composition.template.templateVersion,
      }),
      quotaDecision: "free_preview_allowed" as const,
      noChargeReason: "preview_only" as const,
    },
    polling: render.polling,
    invalidates: INVALIDATES,
  };
}

export async function getHyperframesRenderJobForApi(input: {
  auth: HyperframesAuthContext;
  renderJobId: string;
  productId?: string;
  runId?: string;
}) {
  const render = await getHyperframesRenderProjection(input);
  return {
    contractVersion:
      HYPERFRAMES_MARKETPLACE_CONTRACT_VERSION as typeof HYPERFRAMES_MARKETPLACE_CONTRACT_VERSION,
    render,
    polling: render.polling,
    notModified: false,
  };
}

export async function listHyperframesTemplatesForApi(input: {
  auth: HyperframesAuthContext;
  includeDisabled?: boolean;
  compositionMode?: MarketplaceAutoReviewCompositionMode;
  renderIntent?: HyperframesRenderIntent;
}) {
  const access = resolveHyperframesFeatureAccess({ auth: input.auth });
  return {
    contractVersion:
      HYPERFRAMES_MARKETPLACE_CONTRACT_VERSION as typeof HYPERFRAMES_MARKETPLACE_CONTRACT_VERSION,
    access,
    templates: listHyperframesTemplateRegistry({
      includeDisabled: input.includeDisabled,
      compositionMode: input.compositionMode,
      renderIntent: input.renderIntent,
      allowlist: access.flags.templateAllowlist,
    }),
  };
}

export async function cancelHyperframesRenderJobForApi(input: {
  auth: HyperframesAuthContext;
  renderJobId: string;
  productId?: string;
  runId?: string;
}) {
  const render = await cancelHyperframesRenderJob(input);
  return {
    contractVersion:
      HYPERFRAMES_MARKETPLACE_CONTRACT_VERSION as typeof HYPERFRAMES_MARKETPLACE_CONTRACT_VERSION,
    render,
    polling: render.polling,
  };
}

export async function saveHyperframesRenderToLibraryForApi(input: {
  auth: HyperframesAuthContext;
  productId: string;
  runId: string;
  renderJobId: string;
  idempotencyKey: string;
}) {
  const access = resolveHyperframesFeatureAccess({
    auth: input.auth,
    productId: input.productId,
    runId: input.runId,
    canSaveToLibrary: true,
  });
  if (!access.capabilities.canSaveToLibrary) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "HyperFrames Library save is not available for this tenant.",
    });
  }
  const renderJob = await getHyperframesRenderProjection(input);
  const finalizeInput = buildHyperframesFinalizeInputFromCompletedRender({
    auth: input.auth,
    productId: input.productId,
    runId: input.runId,
    renderJobId: input.renderJobId,
    idempotencyKey: input.idempotencyKey,
    render: renderJob,
  });
  const finalized = await finalizeHyperframesRenderToLibrary(finalizeInput);
  return {
    contractVersion:
      HYPERFRAMES_MARKETPLACE_CONTRACT_VERSION as typeof HYPERFRAMES_MARKETPLACE_CONTRACT_VERSION,
    created: finalized.created,
    libraryItem: finalized.libraryItem,
    render: finalized.render,
    chargeSummary: {
      chargeRequired: false,
      quotaDecision: "no_charge" as const,
      noChargeReason: finalized.created ? ("already_charged" as const) : ("already_charged" as const),
      idempotencyKey: finalized.metadata.idempotencyKey,
    },
    polling: finalized.render.polling,
    invalidates: INVALIDATES,
  };
}
