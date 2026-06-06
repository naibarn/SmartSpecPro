import { TRPCError } from "@trpc/server";
import {
  HYPERFRAMES_MARKETPLACE_CONTRACT_VERSION,
  buildHyperframesLibraryIdempotencyKey,
  createDefaultHyperframesPollingGuidance,
  type HyperframesArtifactRef,
  type HyperframesChargeSummary,
  type HyperframesRenderStatusProjection,
  type HyperframesRenderIntent,
  type MarketplaceAutoReviewCompositionMode,
} from "@shared/hyperframes/contracts";
import {
  RepairHyperframesRenderJobOutputSchema,
  type RepairHyperframesRenderJobOutput,
} from "@shared/hyperframes/runtimeApiSchemas";
import { listHyperframesTemplateRegistry } from "./hyperframesTemplateRegistry";
import {
  getHyperframesAutoStoryboardReviewPlan,
} from "./hyperframesAutoPlanService";
import {
  buildHyperframesCreditEstimate,
  resolveHyperframesFeatureAccessForTenant,
  type HyperframesAuthContext,
} from "./hyperframesFeatureAccessService";
import {
  getMarketplaceAutoReviewRun,
  startMarketplaceAutoReviewRun,
  type MarketplaceAutoReviewReferenceAnchorsInput,
} from "./marketplaceAutoReviewService";
import { getMarketplaceProductWithAccess } from "./marketplaceProductService";
import { buildHyperframesCompositionInput } from "./hyperframesCompositionService";
import {
  buildHyperframesRenderJobPayload,
  buildHyperframesRenderProjection,
  cancelHyperframesRenderJob,
  getHyperframesRenderProjection,
  queueHyperframesRenderJob,
  redactHyperframesRenderProjectionForUser,
  retryHyperframesRenderJob,
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

function buildAutoStoryboardProductReferenceAnchors(
  productBundle: unknown
): MarketplaceAutoReviewReferenceAnchorsInput | null {
  const bundle = isRecord(productBundle) ? productBundle : {};
  const images = Array.isArray(bundle.images) ? bundle.images : [];
  const image = images.find(item => cleanText((item as Record<string, unknown>)?.url));
  if (!isRecord(image)) return null;
  const url = cleanText(image.url);
  if (!url) return null;
  const id = cleanText(image.id);
  const hash = cleanText(image.sha256) || cleanText(image.hash);
  const ref = hash
    ? `product-image-sha256:${hash}`
    : id
      ? `marketplace-product-image:${id}`
      : `product-image-url:${url}`;
  return {
    schemaVersion: 1,
    creationIntent: "auto_review_video",
    requiredRoles: ["product"],
    lockPolicy: {
      mode: "auto_product_anchor_from_product_default",
      bindingPolicy:
        "system_selected_hero_or_first_product_image_is_primary_generation_truth",
      product: "preserve_exact_visible_product_identity",
      character: "not_required_for_auto_product_review",
      environment: "not_required_for_auto_product_review",
      auditMetadataRequired: true,
    },
    productImageUrl: url,
    productImageId: id || null,
    productImageRef: ref,
    productImageSource: cleanText(image.source) || "marketplace_product_image",
    productImageSourceUrl:
      cleanText(image.sourceUrl) || cleanText(image.originalSourceUrl) || null,
    productImageStorageKey:
      cleanText(image.storageKey) || cleanText(image.key) || null,
    productImageHash: hash || null,
    productImageIndex: 0,
    auditMetadata: {
      product: {
        id: id || null,
        source: cleanText(image.source) || "marketplace_product_image",
        referenceFormat: "single_product_image",
        selectedBy: "auto_storyboard_review_backend_fallback",
      },
    },
    fileEvidence: {
      productImage: {
        url,
        id: id || null,
        hash: hash || null,
        index: 0,
      },
    },
    sourceRefs: [
      ...(id ? [`product-image:${id}`] : []),
      ...(hash ? [`product-image-sha256:${hash}`] : []),
    ],
  };
}

function renderJobIdFromRunState(runState: unknown): string {
  const run = isRecord(runState) ? runState : {};
  const metadata = isRecord(run.metadataJson) ? run.metadataJson : {};
  const result = isRecord(run.resultJson) ? run.resultJson : {};
  const metadataPreview = isRecord(metadata.hyperframesAutoPreview)
    ? metadata.hyperframesAutoPreview
    : {};
  const resultPreview = isRecord(result.hyperframesAutoPreview)
    ? result.hyperframesAutoPreview
    : {};
  const resultRender = isRecord(result.render) ? result.render : {};
  return (
    cleanText(run.renderJobId) ||
    cleanText(metadataPreview.renderJobId) ||
    cleanText(resultPreview.renderJobId) ||
    cleanText(result.hyperframesRenderJobId) ||
    cleanText(resultRender.renderJobId)
  );
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

function isLibraryVideoArtifact(ref: HyperframesArtifactRef): boolean {
  return (
    (ref.kind === "hyperframes_render_mp4" ||
      ref.kind === "hyperframes_render_webm") &&
    ref.retentionClass === "library"
  );
}

function findLibraryOutputPair(render: HyperframesRenderStatusProjection): {
  output: HyperframesRenderStatusProjection["outputRefs"][number];
  artifact: HyperframesArtifactRef;
} | null {
  const libraryOutputCandidates = render.outputRefs.filter(
    ref =>
      (ref.kind === "final_video" || ref.kind === "library_item") &&
      Boolean(ref.contentHash)
  );

  for (const output of libraryOutputCandidates) {
    const artifact = render.artifactRefs.find(
      ref => ref.contentHash === output.contentHash && isLibraryVideoArtifact(ref)
    );
    if (artifact) {
      return { output, artifact };
    }
  }

  return null;
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
  const libraryOutput = findLibraryOutputPair(render);
  if (!libraryOutput?.output.contentHash) {
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
    outputHash: libraryOutput.artifact.contentHash,
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
      outputArtifactRef: libraryOutput.artifact,
      outputUrl: libraryOutput.output.url ?? null,
      thumbnailUrl: libraryOutput.output.thumbnailUrl ?? null,
      qaStatus: render.qaStatus,
    },
    outputArtifactRef: libraryOutput.artifact,
    outputUrl: libraryOutput.output.url ?? null,
    thumbnailUrl: libraryOutput.output.thumbnailUrl ?? null,
    qaStatus: render.qaStatus,
  };
}

export function buildHyperframesLibrarySaveChargeSummary(input: {
  created: boolean;
  idempotencyKey: string;
}): HyperframesChargeSummary {
  return {
    chargeRequired: false,
    quotaDecision: "no_charge",
    noChargeReason: input.created
      ? "not_billable"
      : "duplicate_library_finalize",
    idempotencyKey: input.idempotencyKey,
  };
}

export async function getAutoStoryboardReviewPlanForApi(input: {
  productId: string;
  auth: HyperframesAuthContext;
  includeTemplates?: boolean;
  overrides?: Record<string, unknown>;
}) {
  const plan = await getHyperframesAutoStoryboardReviewPlan({
    productId: input.productId,
    auth: input.auth,
    overrides: input.overrides,
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

function toMarketplaceAutoReviewQualityMode(
  qualityMode: "fast" | "balanced" | "high"
): "fast_draft" | "balanced" | "premium_strict_qa" {
  if (qualityMode === "fast") return "fast_draft";
  if (qualityMode === "high") return "premium_strict_qa";
  return "balanced";
}

async function buildStartAutoStoryboardReviewResumeResponse(input: {
  productId: string;
  auth: HyperframesAuthContext;
  plan: Awaited<ReturnType<typeof getHyperframesAutoStoryboardReviewPlan>>;
}) {
  const activeRunId = cleanText(input.plan.activeRunId);
  if (!activeRunId) return null;
  const activeRun = await getMarketplaceAutoReviewRun(activeRunId, input.auth);
  const activeRunRecord = (activeRun ?? {}) as Record<string, unknown>;
  const activeRunProductId = cleanText(activeRunRecord.productId);
  if (activeRunProductId && activeRunProductId !== input.productId) {
    throw new TRPCError({
      code: "NOT_FOUND",
      message: "Auto review run was not found for this product.",
    });
  }
  const renderJobId = renderJobIdFromRunState(activeRunRecord);
  const render = renderJobId
    ? redactHyperframesRenderProjectionForUser(
        await getHyperframesRenderProjection({
          auth: input.auth,
          productId: input.productId,
          runId: activeRunId,
          renderJobId,
        })
      )
    : null;
  return {
    contractVersion:
      HYPERFRAMES_MARKETPLACE_CONTRACT_VERSION as typeof HYPERFRAMES_MARKETPLACE_CONTRACT_VERSION,
    launchMode: "auto_storyboard_review" as const,
    plan: input.plan,
    run: activeRunRecord,
    render,
    chargeSummary: {
      chargeRequired: false,
      quotaDecision: input.plan.quotaDecision,
      noChargeReason: "not_applicable" as const,
    },
    polling:
      render?.polling ?? createDefaultHyperframesPollingGuidance("not_available"),
    invalidates: INVALIDATES,
  };
}

export async function startAutoStoryboardReviewForApi(input: {
  productId: string;
  auth: HyperframesAuthContext;
  expectedPlanHash?: string;
  idempotencyKey?: string;
  overrides?: Record<string, unknown>;
  referenceAnchors?: MarketplaceAutoReviewReferenceAnchorsInput | null;
  runtime?: Record<string, unknown>;
}) {
  const plan = await getHyperframesAutoStoryboardReviewPlan({
    productId: input.productId,
    auth: input.auth,
    overrides: input.overrides,
  });
  if (input.expectedPlanHash && input.expectedPlanHash !== plan.planHash) {
    const resumeResponse =
      plan.primaryAction.actionId === "resume_auto_storyboard_review"
        ? await buildStartAutoStoryboardReviewResumeResponse({
            productId: input.productId,
            auth: input.auth,
            plan,
          })
        : null;
    if (resumeResponse) return resumeResponse;
    throw new TRPCError({
      code: "PRECONDITION_FAILED",
      message: "Auto Storyboard Review plan is stale. Refresh the plan and try again.",
    });
  }
  if (
    plan.primaryAction.actionId === "resume_auto_storyboard_review" &&
    plan.activeRunId
  ) {
    const resumeResponse = await buildStartAutoStoryboardReviewResumeResponse({
      productId: input.productId,
      auth: input.auth,
      plan,
    });
    if (resumeResponse) return resumeResponse;
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
  const productBundle = await getMarketplaceProductWithAccess(
    input.productId,
    input.auth
  );
  const referenceAnchors =
    input.referenceAnchors ??
    buildAutoStoryboardProductReferenceAnchors(productBundle);
  const run = await startMarketplaceAutoReviewRun(
    {
      productId: input.productId,
      idempotencyKey: input.idempotencyKey,
      creationIntent: "auto_review_video",
      outputMode: plan.defaults.outputMode,
      frameStrategy: plan.defaults.frameStrategy,
      audioStrategy: plan.defaults.audioStrategy,
      shotCount: plan.defaults.shotCount,
      overlayTextMode: plan.defaults.overlayTextMode,
      imageModel: plan.defaults.imageModel,
      qualityMode: toMarketplaceAutoReviewQualityMode(plan.defaults.qualityMode),
      referenceAnchors,
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
  const access = await resolveHyperframesFeatureAccessForTenant({
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
  const publicRender = redactHyperframesRenderProjectionForUser(render);
  return {
    contractVersion:
      HYPERFRAMES_MARKETPLACE_CONTRACT_VERSION as typeof HYPERFRAMES_MARKETPLACE_CONTRACT_VERSION,
    render: publicRender,
    polling: publicRender.polling,
    notModified: false,
  };
}

export async function repairHyperframesRenderJobForApi(input: {
  auth: HyperframesAuthContext;
  renderJobId: string;
  productId: string;
  runId: string;
  actionId: string;
  actionType:
    | "regenerate_from_current_plan"
    | "recreate_snapshot"
    | "retry_worker_step"
    | "rerun_layout_inspect"
    | "cancel_render"
    | "open_standard_order";
  expectedCompositionInputHash?: string;
}): Promise<RepairHyperframesRenderJobOutput> {
  const current = await getHyperframesRenderProjection(input);
  if (!current.permissions.canRepair) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "You do not have permission to repair this HyperFrames render.",
    });
  }
  const action = current.repairActions.find(
    item =>
      item.actionId === input.actionId && item.actionType === input.actionType
  );
  if (!action) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "HyperFrames repair action is no longer available. Refresh status and try again.",
    });
  }
  if (action.requiresOperator) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "This HyperFrames repair action requires operator support.",
    });
  }
  if (action.disabledReason) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: action.disabledReason,
    });
  }

  if (action.actionType === "retry_worker_step") {
    if (
      input.expectedCompositionInputHash &&
      current.compositionInputHash &&
      input.expectedCompositionInputHash !== current.compositionInputHash
    ) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message:
          "HyperFrames render input changed. Refresh status before retrying this worker step.",
      });
    }
    const repaired = await retryHyperframesRenderJob(input);
    const publicRender = redactHyperframesRenderProjectionForUser(repaired);
    return RepairHyperframesRenderJobOutputSchema.parse({
      contractVersion:
        HYPERFRAMES_MARKETPLACE_CONTRACT_VERSION as typeof HYPERFRAMES_MARKETPLACE_CONTRACT_VERSION,
      render: publicRender,
      polling: publicRender.polling,
      invalidates: INVALIDATES,
    });
  }

  if (action.actionType === "regenerate_from_current_plan") {
    return RepairHyperframesRenderJobOutputSchema.parse(
      await createHyperframesPreviewForApi({
        productId: input.productId,
        runId: input.runId,
        auth: input.auth,
      })
    );
  }

  throw new TRPCError({
    code: "BAD_REQUEST",
    message: "This HyperFrames repair action is not supported for self-service repair yet.",
  });
}

export async function listHyperframesTemplatesForApi(input: {
  auth: HyperframesAuthContext;
  includeDisabled?: boolean;
  compositionMode?: MarketplaceAutoReviewCompositionMode;
  renderIntent?: HyperframesRenderIntent;
}) {
  const access = await resolveHyperframesFeatureAccessForTenant({ auth: input.auth });
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
  const current = await getHyperframesRenderProjection(input);
  if (!current.permissions.canCancel) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "You do not have permission to cancel this HyperFrames render.",
    });
  }
  const render = await cancelHyperframesRenderJob(input);
  const publicRender = redactHyperframesRenderProjectionForUser(render);
  return {
    contractVersion:
      HYPERFRAMES_MARKETPLACE_CONTRACT_VERSION as typeof HYPERFRAMES_MARKETPLACE_CONTRACT_VERSION,
    render: publicRender,
    polling: publicRender.polling,
  };
}

export async function saveHyperframesRenderToLibraryForApi(input: {
  auth: HyperframesAuthContext;
  productId: string;
  runId: string;
  renderJobId: string;
  idempotencyKey: string;
}) {
  const access = await resolveHyperframesFeatureAccessForTenant({
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
  const publicRender = redactHyperframesRenderProjectionForUser(finalized.render);
  return {
    contractVersion:
      HYPERFRAMES_MARKETPLACE_CONTRACT_VERSION as typeof HYPERFRAMES_MARKETPLACE_CONTRACT_VERSION,
    created: finalized.created,
    libraryItem: finalized.libraryItem,
    render: publicRender,
    chargeSummary: buildHyperframesLibrarySaveChargeSummary({
      created: finalized.created,
      idempotencyKey: finalized.metadata.idempotencyKey,
    }),
    polling: publicRender.polling,
    invalidates: INVALIDATES,
  };
}
