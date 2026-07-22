import { TRPCError } from "@trpc/server";
import {
  applyHyperframesAutoPlanOverrides,
  buildDefaultHyperframesAutoPlanDefaults,
  buildHyperframesAutoStoryboardReviewPlan,
  resolveHyperframesAutoPlanImageJobCount,
  HYPERFRAMES_SEQUENTIAL_STORYBOARD_COMPLEXITY_FACTOR,
  HYPERFRAMES_BASE_AUTO_PLAN_OVERRIDE_VALUES,
  type HyperframesAutoStoryboardReviewPlan,
  type HyperframesAutoPlanDefaults,
} from "@shared/hyperframes/autoPlan";
import { type HyperframesBlocker } from "@shared/hyperframes/contracts";
import { getHyperframesBlockerCopy } from "@shared/hyperframes/statusCopy";
import {
  buildHyperframesCreditEstimate,
  resolveHyperframesFeatureAccess,
  resolveHyperframesFeatureAccessForTenant,
  type HyperframesAccessInput,
  type HyperframesAuthContext,
} from "./hyperframesFeatureAccessService";
import { getMarketplaceProductWithAccess } from "./marketplaceProductService";
import {
  computeMarketplaceAutoReviewChildSubjectPolicy,
  getSequentialReferenceImageModelCap,
  listMarketplaceAutoReviewRuns,
  // Feature 136 section 09 (§5.2) — SVC's single-sourced start-frame
  // capability predicate (G4 precedent: exported directly, not merely
  // `...ForTest`, for exactly this cross-module call).
  marketplaceAutoReviewVideoModelSupportsStartFrame,
} from "./marketplaceAutoReviewService";
import { getTenantFeatureFlags } from "./tenantFeatureFlagService";
import {
  buildSequentialEvidencePreview,
  computeSequentialReferenceCapacity,
  type SequentialEvidencePreview,
  type SequentialReferenceCapacity,
} from "@shared/marketplaceCapture/sequentialEvidencePreview";

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function compactText(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function recordFromJsonLike(value: unknown): Record<string, unknown> | null {
  if (isRecord(value)) return value;
  const text = compactText(value);
  if (!text || !text.startsWith("{")) return null;
  try {
    const parsed = JSON.parse(text) as unknown;
    return isRecord(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function renderJobIdFrom(value: unknown): string {
  const record = recordFromJsonLike(value);
  return record ? compactText(record.renderJobId) : "";
}

function stringList(value: unknown): string[] {
  return Array.isArray(value)
    ? value.map(item => compactText(item)).filter(Boolean)
    : [];
}

function resumeCandidateFrameUrlsFromReviewSummaries(
  reviews: unknown
): string[] {
  const reviewList = Array.isArray(reviews) ? reviews.map(item => recordFromJsonLike(item)) : [];
  return reviewList.flatMap(review => [
    ...stringList(review?.storyboardFrameUrls),
    ...stringList(review?.resultUrls),
    ...stringList(review?.startFrameUrls),
    ...stringList(review?.stopFrameUrls),
    ...stringList(review?.thumbnailUrls),
    compactText(review?.storyboardGridUrl),
  ]);
}

function storyboardReadyResumeCandidate(
  run: Record<string, unknown>
): boolean {
  const metadata = recordFromJsonLike(run.metadataJson);
  const result = recordFromJsonLike(run.resultJson);
  const storyboardReviewId =
    compactText(run.storyboardReviewId) ||
    compactText(result?.storyboardReviewId) ||
    compactText(linksFromRunState(run).storyboardReview);
  if (storyboardReviewId) return false;

  const frameUrls = [
    ...stringList(metadata?.storyboardFrameUrls),
    ...stringList(metadata?.startFrameUrls),
    ...stringList(metadata?.stopFrameUrls),
    ...resumeCandidateFrameUrlsFromReviewSummaries(
      metadata?.imageAttemptReviews
    ),
    ...stringList(result?.frameUrls),
    ...stringList(result?.storyboardFrameUrls),
    ...stringList(result?.startFrameUrls),
    ...stringList(result?.stopFrameUrls),
    ...resumeCandidateFrameUrlsFromReviewSummaries(result?.imageAttemptReviews),
  ];
  if (frameUrls.length === 0) return false;

  const currentStage = compactText(run.currentStage);
  const runStatus = compactText(run.status);
  const resumableStatuses = new Set([
    "",
    "queued",
    "running",
    "waiting_provider",
    "repairing",
    "repair_required",
    "qa_pending",
    "completed_with_warnings",
  ]);
  const imageStageStatus = stageStatusFromRunSummary(run, "image_generation");
  const storyboardStageStatus = stageStatusFromRunSummary(
    run,
    "storyboard_review"
  );
  return (
    ["image_generation", "storyboard_review"].includes(currentStage) ||
    resumableStatuses.has(runStatus) ||
    resumableStatuses.has(imageStageStatus) ||
    resumableStatuses.has(storyboardStageStatus)
  );
}

function linksFromRunState(runState: unknown): Record<string, unknown> {
  const run = isRecord(runState) ? runState : {};
  return isRecord(run.links) ? run.links : {};
}

function arrayLength(value: unknown): number {
  return Array.isArray(value) ? value.length : 0;
}

function buildBlocker(
  code: HyperframesBlocker["code"],
  severity: HyperframesBlocker["severity"] = "blocking"
): HyperframesBlocker {
  const copy = getHyperframesBlockerCopy(code, "th");
  return {
    code,
    severity,
    copyId: copy.copyId,
    safeMessage: copy.description,
    nextAction: copy.nextAction,
    userActionRequired: true,
  };
}

function isHyperframesAutoStoryboardReviewRun(
  run?: Record<string, unknown> | null
): boolean {
  if (!run) return false;
  const idempotencyKey = compactText(run.idempotencyKey);
  if (
    idempotencyKey.startsWith("hf-auto-start:") ||
    idempotencyKey.startsWith("mar-run:")
  ) {
    return true;
  }
  if (idempotencyKey !== "marketplace-auto-review:legacy") return false;

  if (compactText(run.renderJobId)) return true;

  const metadata = recordFromJsonLike(run.metadataJson);
  if (renderJobIdFrom(metadata?.hyperframesAutoPreview)) return true;

  const result = recordFromJsonLike(run.resultJson);
  if (renderJobIdFrom(result?.hyperframesAutoPreview)) return true;
  if (compactText(result?.hyperframesRenderJobId)) return true;
  if (renderJobIdFrom(result?.render)) return true;

  return storyboardReadyResumeCandidate(run);
}

function autoPlanWorkerComplexityMultiplier(
  defaults: HyperframesAutoPlanDefaults
): number {
  const qualityMultiplier =
    defaults.qualityMode === "high"
      ? 1.35
      : defaults.qualityMode === "fast"
        ? 0.8
        : 1;
  const shotMultiplier = defaults.shotCount / 9;
  // Feature 136 (section 10, §5.4) — `storyboard_3x3_split` and `auto` stay
  // exactly 1; `video_shot_start_stop` keeps its existing 1.15 (the `1.21`
  // regression pin at hyperframesAutoPlanService.test.ts must not move).
  const frameMultiplier =
    defaults.frameStrategy === "video_shot_start_stop"
      ? 1.15
      : defaults.frameStrategy === "sequential_shot_storyboard"
        ? HYPERFRAMES_SEQUENTIAL_STORYBOARD_COMPLEXITY_FACTOR
        : 1;
  return Number(
    (qualityMultiplier * shotMultiplier * frameMultiplier).toFixed(2)
  );
}

/**
 * Feature 136 (section 10, §5.4) — thin test-only wrapper over the
 * module-private `autoPlanWorkerComplexityMultiplier`, exported for pure unit
 * tests that don't need a full `buildHyperframesAutoPlanFromState` call.
 */
export function resolveHyperframesAutoPlanWorkerComplexityMultiplierForTest(
  defaults: HyperframesAutoPlanDefaults
): number {
  return autoPlanWorkerComplexityMultiplier(defaults);
}

function stringListFrom(value: unknown): string[] {
  return Array.isArray(value)
    ? value.map(item => compactText(item)).filter(Boolean)
    : [];
}

function stageStatusFromRunSummary(
  run: Record<string, unknown> | null | undefined,
  stageKey: string
): string {
  const stages = Array.isArray(run?.stages) ? run?.stages : [];
  const stage = stages.find(item => {
    if (!isRecord(item)) return false;
    return compactText(item.stageKey) === stageKey;
  });
  return isRecord(stage) ? compactText(stage.status) : "";
}

function isResumableAutoStoryboardReviewRun(
  run?: Record<string, unknown> | null
): boolean {
  if (!isHyperframesAutoStoryboardReviewRun(run)) return false;
  if (compactText(run?.storyboardReviewId)) return false;

  const storyboardFrames = [
    ...stringListFrom(run?.metadataJson && isRecord(run.metadataJson)
      ? run.metadataJson.storyboardFrameUrls
      : undefined),
    ...stringListFrom(run?.resultJson && isRecord(run.resultJson)
      ? run.resultJson.frameUrls
      : undefined),
    ...stringListFrom(run?.resultJson && isRecord(run.resultJson)
      ? run.resultJson.storyboardFrameUrls
      : undefined),
  ];
  if (storyboardFrames.length === 0) return false;

  const storyboardStageStatus = stageStatusFromRunSummary(
    run,
    "storyboard_review"
  );
  const imageStageStatus = stageStatusFromRunSummary(run, "image_generation");
  const resumableStatuses = new Set([
    "",
    "queued",
    "running",
    "waiting_provider",
    "repair_required",
    "completed_with_warnings",
  ]);

  return (
    resumableStatuses.has(storyboardStageStatus) ||
    resumableStatuses.has(imageStageStatus) ||
    compactText(run?.currentStage) === "storyboard_review"
  );
}

export function inferHyperframesProductReadiness(
  productBundle: unknown
): Pick<
  HyperframesAccessInput,
  | "productAnchorReady"
  | "characterAnchorRequired"
  | "characterAnchorReady"
  | "environmentAnchorRequired"
  | "environmentAnchorReady"
  | "complianceReviewRequired"
> {
  const bundle = isRecord(productBundle) ? productBundle : {};
  const product = isRecord(bundle.product)
    ? bundle.product
    : isRecord(bundle.item)
      ? bundle.item
      : bundle;
  const images = [
    ...((Array.isArray(bundle.images) ? bundle.images : []) as unknown[]),
    ...((Array.isArray(product.imagesJson) ? product.imagesJson : []) as unknown[]),
    ...((Array.isArray(product.selectedImageUrls)
      ? product.selectedImageUrls
      : []) as unknown[]),
  ];
  const metadata = isRecord(product.metadataJson) ? product.metadataJson : {};
  const category = [
    compactText(product.productCategory),
    compactText(product.category),
    compactText(metadata.category),
  ]
    .join(" ")
    .toLowerCase();
  const requiresComplianceReview =
    /(whitening|medical|supplement|medicine|safety|baby|mother|cosmetic|skincare|อาหารเสริม|รักษา|ขาว)/i.test(
      category
    ) ||
    arrayLength(metadata.blockedClaims) > 0 ||
    Boolean(metadata.complianceReviewRequired);

  return {
    productAnchorReady: images.length > 0 || Boolean(product.mainImageUrl),
    characterAnchorRequired: false,
    characterAnchorReady: true,
    environmentAnchorRequired: false,
    environmentAnchorReady: true,
    complianceReviewRequired: requiresComplianceReview,
  };
}

/**
 * Feature 136 (section 01, §5.8) — strips a flag-off sequential
 * `frameStrategy` override so `plan.defaults.frameStrategy` never carries
 * the value when the tenant flag is off, and reports that it did so (so the
 * caller can append a non-fatal warning). Binding decision §3.2: the plan
 * query never throws for flag-off sequential requests; it sanitizes and
 * warns instead, keeping the plan startable as 3x3.
 */
function sanitizeSequentialStoryboardOverrides(input: {
  overrides?: Record<string, unknown> | null;
  sequentialStoryboardEnabled: boolean;
}): { overrides?: Record<string, unknown> | null; sequentialBlocked: boolean } {
  const overrides = input.overrides;
  const isPlainRecord =
    Boolean(overrides) && typeof overrides === "object" && !Array.isArray(overrides);
  if (
    isPlainRecord &&
    (overrides as Record<string, unknown>).frameStrategy ===
      "sequential_shot_storyboard" &&
    !input.sequentialStoryboardEnabled
  ) {
    const { frameStrategy: _frameStrategy, ...rest } = overrides as Record<
      string,
      unknown
    >;
    return { overrides: rest, sequentialBlocked: true };
  }
  return { overrides, sequentialBlocked: false };
}

export function buildHyperframesAutoPlanFromState(input: {
  auth: HyperframesAuthContext;
  productId: string;
  productBundle?: unknown;
  activeRun?: Record<string, unknown> | null;
  overrides?: Record<string, unknown> | null;
  accessInput?: Partial<HyperframesAccessInput>;
  access?: ReturnType<typeof resolveHyperframesFeatureAccess>;
  sequentialStoryboardEnabled?: boolean;
  // Feature 136 section 09 (§5.2) — same trick as `sequentialStoryboardEnabled`
  // above: keeps this builder sync and DB-free. `undefined` (legacy callers,
  // or a non-sequential/non-full_video request the caller chose not to
  // resolve) never blocks — only an explicit `false` does.
  videoModelSupportsStartFrame?: boolean;
  now?: Date;
}): HyperframesAutoStoryboardReviewPlan {
  const readiness = inferHyperframesProductReadiness(input.productBundle);
  const activeRunIsHyperframesAuto =
    isHyperframesAutoStoryboardReviewRun(input.activeRun);
  const activeRunId = activeRunIsHyperframesAuto
    ? compactText(input.activeRun?.id)
    : "";
  // Sanitize once, use the sanitized overrides EVERYWHERE below — both the
  // local `applyHyperframesAutoPlanOverrides` call and the pass-through to
  // `buildHyperframesAutoStoryboardReviewPlan` (which re-applies overrides
  // itself, autoPlan.ts). Passing the raw overrides to either spot would
  // leak the blocked sequential strategy back into `defaults`.
  const { overrides: sanitizedOverrides, sequentialBlocked } =
    sanitizeSequentialStoryboardOverrides({
      overrides: input.overrides,
      sequentialStoryboardEnabled: input.sequentialStoryboardEnabled ?? false,
    });
  const autoDefaults = buildDefaultHyperframesAutoPlanDefaults();
  const defaults = applyHyperframesAutoPlanOverrides({
    defaults: autoDefaults,
    overrides: sanitizedOverrides,
  });
  const access =
    input.access ??
    resolveHyperframesFeatureAccess({
      auth: input.auth,
      productId: input.productId,
      runId: activeRunId || undefined,
      ...readiness,
      ...input.accessInput,
      now: input.now,
    });
  const blockers: HyperframesBlocker[] = [];
  if (!readiness.productAnchorReady) {
    blockers.push(buildBlocker("missing_product_anchor"));
  }
  if (input.activeRun && !activeRunIsHyperframesAuto) {
    blockers.push(buildBlocker("active_standard_run"));
  }
  // Feature 136 section 09 (§5.2) — a REAL blocker (not a warning): unlike
  // the sequential-disabled case above, the model is genuinely unusable for
  // this plan, so `canStart` must become `false` (autoPlan.ts:
  // `canStart = access.capabilities.canStartAuto && blockers.length === 0`).
  if (
    defaults.outputMode === "full_video" &&
    defaults.frameStrategy === "sequential_shot_storyboard" &&
    input.videoModelSupportsStartFrame === false
  ) {
    blockers.push(
      buildBlocker("sequential_video_model_no_start_frame", "blocking")
    );
  }
  const warnings: HyperframesBlocker[] = [];
  if (sequentialBlocked) {
    // Warning, NOT blocker — an entry in blockers[] would flip canStart to
    // false (autoPlan.ts canStart evidence) and the sanitized plan must stay
    // startable as 3x3 (binding decision §3.2).
    warnings.push(buildBlocker("sequential_storyboard_disabled", "warning"));
  }
  const tenantId = input.auth.tenantId ?? "default";
  const creditEstimate = buildHyperframesCreditEstimate({
    tenantId,
    userId: input.auth.userId,
    runId: activeRunId || undefined,
    renderIntent: defaults.renderIntent,
    compositionMode: defaults.compositionMode,
    costClass: "composition_preview",
    platformPreset: defaults.platformPreset,
    quotaDecision: access.creditAndQuota.quotaDecision,
    workerComplexityMultiplier: autoPlanWorkerComplexityMultiplier(defaults),
    // Feature 136 (section 10, §5.4) — reads the locally merged,
    // section-01-sanitized `defaults` (not `autoDefaults`), so a flag-off
    // sequential request (already stripped by
    // `sanitizeSequentialStoryboardOverrides` above) resolves to 1.
    imageJobCount: resolveHyperframesAutoPlanImageJobCount(defaults),
  });
  return buildHyperframesAutoStoryboardReviewPlan({
    productId: input.productId,
    tenantId: input.auth.tenantId,
    userId: input.auth.userId,
    access,
    defaults: autoDefaults,
    blockers,
    warnings,
    overrides: sanitizedOverrides,
    creditEstimate,
    activeRunId: activeRunId || null,
    now: input.now,
  });
}

async function getHyperframesAutoStoryboardReviewPlanInternal(input: {
  productId: string;
  auth: HyperframesAuthContext;
  overrides?: Record<string, unknown> | null;
  accessInput?: Partial<HyperframesAccessInput>;
}): Promise<{
  plan: HyperframesAutoStoryboardReviewPlan;
  productBundle: unknown;
  sequentialStoryboardEnabled: boolean;
}> {
  let productBundle: unknown;
  try {
    productBundle = await getMarketplaceProductWithAccess(
      input.productId,
      input.auth
    );
  } catch (error) {
    if (error instanceof TRPCError) throw error;
    throw error;
  }
  const recentRuns = await listMarketplaceAutoReviewRuns(
    { productId: input.productId, limit: 3, summary: true },
    input.auth
  );
  const findActiveRun = (runs: Record<string, unknown>[]) =>
    runs.find(run =>
      ["queued", "running", "waiting_provider"].includes(
        compactText((run as Record<string, unknown>).status)
      ) ||
      isResumableAutoStoryboardReviewRun(run as Record<string, unknown>)
    ) ?? null;
  let activeRun = findActiveRun(recentRuns as Record<string, unknown>[]);
  if (!activeRun) {
    const broaderRuns = await listMarketplaceAutoReviewRuns(
      { productId: input.productId, limit: 10, summary: true },
      input.auth
    );
    activeRun = findActiveRun(broaderRuns as Record<string, unknown>[]);
  }
  const readiness = inferHyperframesProductReadiness(productBundle);
  const access = await resolveHyperframesFeatureAccessForTenant({
    auth: input.auth,
    productId: input.productId,
    runId: isHyperframesAutoStoryboardReviewRun(
      activeRun as Record<string, unknown> | null
    )
      ? compactText((activeRun as Record<string, unknown> | null)?.id) ||
        undefined
      : undefined,
    ...readiness,
    ...input.accessInput,
  });
  // Feature 136 (section 01, §5.8) — resolve the sequential-storyboard flag
  // once here. This duplicates the single-row tenant read already inside
  // resolveHyperframesFeatureAccessForTenant above (accepted cost per spec;
  // HyperframesFeatureAccessProjection stays `.strict()` and is out of scope
  // for widening in this section).
  const tenantFlags = await getTenantFeatureFlags(
    input.auth.tenantId ?? "default"
  );
  // Feature 136 section 09 (§5.2) — resolve the start-frame capability flag
  // ONLY when the raw requested overrides look like sequential + full_video,
  // so every other plan request never even calls the (cheap, sync) model
  // lookup and the plan output stays byte-identical for them. This is a
  // best-effort PRE-check against the raw override strings — the
  // AUTHORITATIVE decision still happens inside `buildHyperframesAutoPlanFromState`
  // off the fully-resolved `defaults`, so a divergence here can only ever
  // skip the optimization, never cause an incorrect block.
  const rawOverrides = isRecord(input.overrides) ? input.overrides : null;
  const requestedFrameStrategyLooksSequential =
    compactText(rawOverrides?.frameStrategy) === "sequential_shot_storyboard";
  const requestedOutputModeLooksFullVideo =
    compactText(rawOverrides?.outputMode) === "full_video";
  const videoModelSupportsStartFrame =
    requestedFrameStrategyLooksSequential && requestedOutputModeLooksFullVideo
      ? marketplaceAutoReviewVideoModelSupportsStartFrame(
          compactText(rawOverrides?.videoModel) ||
            HYPERFRAMES_BASE_AUTO_PLAN_OVERRIDE_VALUES.videoModel
        )
      : undefined;
  const plan = buildHyperframesAutoPlanFromState({
    auth: input.auth,
    productId: input.productId,
    productBundle,
    activeRun: activeRun as Record<string, unknown> | null,
    overrides: input.overrides,
    accessInput: input.accessInput,
    access,
    sequentialStoryboardEnabled: tenantFlags.marketplaceSequentialStoryboard,
    videoModelSupportsStartFrame,
  });
  return {
    plan,
    productBundle,
    sequentialStoryboardEnabled: tenantFlags.marketplaceSequentialStoryboard,
  };
}

export async function getHyperframesAutoStoryboardReviewPlan(input: {
  productId: string;
  auth: HyperframesAuthContext;
  overrides?: Record<string, unknown> | null;
  accessInput?: Partial<HyperframesAccessInput>;
}): Promise<HyperframesAutoStoryboardReviewPlan> {
  const { plan } = await getHyperframesAutoStoryboardReviewPlanInternal(input);
  return plan;
}

/* -------------------------------------------------------------------------- */
/* Feature 136 (Marketplace Auto Review: Sequential Shot Storyboard) —        */
/* section 05 §5.5-§5.7 — deterministic, text-only plan-time evidence         */
/* preview + reference capacity. Fail-open: derivation errors never make the */
/* plan query throw (binding decision — "the plan query never throws for     */
/* visibility"). No LLM, no vision, no network (spec §5.5 cost rule).        */
/* -------------------------------------------------------------------------- */

function specsRecordToStringMap(value: unknown): Record<string, string> {
  if (!isRecord(value)) return {};
  const result: Record<string, string> = {};
  for (const [key, raw] of Object.entries(value)) {
    if (!key) continue;
    result[key] =
      typeof raw === "string" ? raw : raw == null ? "" : JSON.stringify(raw);
  }
  return result;
}

/**
 * Loose, defensive field extraction from the already-fetched product bundle
 * (mirrors `inferHyperframesProductReadiness`'s duck-typed `bundle.product`
 * / `bundle.item` style) — text-level only, no `AutoReviewPlan` scaffold
 * needed at plan time.
 */
function productTruthTextFieldsFromBundle(productBundle: unknown): {
  productName: string;
  description: string;
  specs: Record<string, string>;
  categoryText?: string;
} {
  const bundle = isRecord(productBundle) ? productBundle : {};
  const product = isRecord(bundle.product)
    ? bundle.product
    : isRecord(bundle.item)
      ? bundle.item
      : bundle;
  const metadata = isRecord(product.metadataJson) ? product.metadataJson : {};
  const specsSource = isRecord(product.specsJson)
    ? product.specsJson
    : isRecord(metadata.specs)
      ? metadata.specs
      : {};
  const categoryText =
    compactText(product.productCategory) ||
    compactText(product.category) ||
    compactText(metadata.category) ||
    undefined;
  return {
    productName:
      compactText(product.productName) || compactText(product.title) || "",
    description:
      compactText(product.descriptionText) ||
      compactText(product.description) ||
      "",
    specs: specsRecordToStringMap(specsSource),
    categoryText,
  };
}

/** Angle candidates beyond the primary product image, in the SAME order the
 *  bundle exposes them. Untagged at plan time (no angle labels have been
 *  assigned yet — that happens via `referenceAnchors.productAngleImages` at
 *  start time), so each candidate gets a stable `angle-N` placeholder label
 *  (spec §5.6: "labels, OR angle-N placeholders when untagged"). */
function planTimeProductAngleCandidates(
  productBundle: unknown
): Array<{ ref: string; angleLabel: string }> {
  const bundle = isRecord(productBundle) ? productBundle : {};
  const product = isRecord(bundle.product)
    ? bundle.product
    : isRecord(bundle.item)
      ? bundle.item
      : bundle;
  const images = Array.isArray(bundle.images)
    ? bundle.images
    : Array.isArray(product.imagesJson)
      ? product.imagesJson
      : Array.isArray(product.selectedImageUrls)
        ? product.selectedImageUrls
        : [];
  return images.slice(1).map((_, index) => ({
    ref: `angle-${index + 1}`,
    angleLabel: `angle-${index + 1}`,
  }));
}

export async function getHyperframesAutoStoryboardReviewPlanWithEvidence(input: {
  productId: string;
  auth: HyperframesAuthContext;
  overrides?: Record<string, unknown> | null;
  accessInput?: Partial<HyperframesAccessInput>;
}): Promise<{
  plan: HyperframesAutoStoryboardReviewPlan;
  evidencePreview?: SequentialEvidencePreview;
  referenceCapacity?: SequentialReferenceCapacity;
}> {
  const { plan, productBundle, sequentialStoryboardEnabled } =
    await getHyperframesAutoStoryboardReviewPlanInternal(input);

  if (
    !sequentialStoryboardEnabled ||
    plan.defaults.frameStrategy !== "sequential_shot_storyboard"
  ) {
    return { plan };
  }

  try {
    const fields = productTruthTextFieldsFromBundle(productBundle);
    const productChildRelated = computeMarketplaceAutoReviewChildSubjectPolicy({
      categoryText: fields.categoryText,
      productTexts: [
        fields.productName,
        fields.description,
        ...Object.values(fields.specs),
      ],
    }).productChildRelated;

    const evidencePreview = buildSequentialEvidencePreview({
      productName: fields.productName,
      description: fields.description,
      specs: fields.specs,
      categoryText: fields.categoryText,
      confirmedAttributes: plan.defaults.confirmedAttributes,
      forbiddenClaims: plan.defaults.forbiddenClaims,
      productChildRelated,
    });

    // Plan-time snapshot only (no run/character-anchor context exists yet):
    // guardian/environment presence and hard-requirement are both false —
    // this mirrors what `computeMarketplaceAutoReviewChildSubjectPolicy`
    // itself already resolves pre-skill (`childDepictionPlanned` is always
    // false before a run), so the two previews never contradict each other.
    const referenceCapacity = computeSequentialReferenceCapacity({
      modelCap: getSequentialReferenceImageModelCap(plan.defaults.imageModel),
      angleCandidates: planTimeProductAngleCandidates(productBundle),
      guardianRequired: false,
      guardianPresent: false,
      environmentPresent: false,
    });

    return { plan, evidencePreview, referenceCapacity };
  } catch (error) {
    console.warn(
      "[hyperframesAutoPlanService] sequential_evidence_preview_derivation_failed",
      {
        productId: input.productId,
        error: error instanceof Error ? error.message : String(error),
      }
    );
    return { plan };
  }
}
