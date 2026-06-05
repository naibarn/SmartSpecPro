import { TRPCError } from "@trpc/server";
import {
  applyHyperframesAutoPlanOverrides,
  buildDefaultHyperframesAutoPlanDefaults,
  buildHyperframesAutoStoryboardReviewPlan,
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
import { listMarketplaceAutoReviewRuns } from "./marketplaceAutoReviewService";

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
  if (compactText(run.idempotencyKey).startsWith("hf-auto-start:")) {
    return true;
  }
  if (compactText(run.renderJobId)) return true;

  const metadata = recordFromJsonLike(run.metadataJson);
  if (renderJobIdFrom(metadata?.hyperframesAutoPreview)) return true;

  const result = recordFromJsonLike(run.resultJson);
  if (renderJobIdFrom(result?.hyperframesAutoPreview)) return true;
  if (compactText(result?.hyperframesRenderJobId)) return true;
  if (renderJobIdFrom(result?.render)) return true;

  return false;
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
  const frameMultiplier =
    defaults.frameStrategy === "video_shot_start_stop" ? 1.15 : 1;
  return Number(
    (qualityMultiplier * shotMultiplier * frameMultiplier).toFixed(2)
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

export function buildHyperframesAutoPlanFromState(input: {
  auth: HyperframesAuthContext;
  productId: string;
  productBundle?: unknown;
  activeRun?: Record<string, unknown> | null;
  overrides?: Record<string, unknown> | null;
  accessInput?: Partial<HyperframesAccessInput>;
  access?: ReturnType<typeof resolveHyperframesFeatureAccess>;
  now?: Date;
}): HyperframesAutoStoryboardReviewPlan {
  const readiness = inferHyperframesProductReadiness(input.productBundle);
  const activeRunIsHyperframesAuto =
    isHyperframesAutoStoryboardReviewRun(input.activeRun);
  const activeRunId = activeRunIsHyperframesAuto
    ? compactText(input.activeRun?.id)
    : "";
  const autoDefaults = buildDefaultHyperframesAutoPlanDefaults();
  const defaults = applyHyperframesAutoPlanOverrides({
    defaults: autoDefaults,
    overrides: input.overrides,
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
  });
  return buildHyperframesAutoStoryboardReviewPlan({
    productId: input.productId,
    tenantId: input.auth.tenantId,
    userId: input.auth.userId,
    access,
    defaults: autoDefaults,
    blockers,
    overrides: input.overrides,
    creditEstimate,
    activeRunId: activeRunId || null,
    now: input.now,
  });
}

export async function getHyperframesAutoStoryboardReviewPlan(input: {
  productId: string;
  auth: HyperframesAuthContext;
  overrides?: Record<string, unknown> | null;
  accessInput?: Partial<HyperframesAccessInput>;
}): Promise<HyperframesAutoStoryboardReviewPlan> {
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
  const runs = await listMarketplaceAutoReviewRuns(
    { productId: input.productId, limit: 3, summary: true },
    input.auth
  );
  const activeRun =
    runs.find(run =>
      ["queued", "running", "waiting_provider"].includes(
        compactText((run as Record<string, unknown>).status)
      )
    ) ?? null;
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
  return buildHyperframesAutoPlanFromState({
    auth: input.auth,
    productId: input.productId,
    productBundle,
    activeRun: activeRun as Record<string, unknown> | null,
    overrides: input.overrides,
    accessInput: input.accessInput,
    access,
  });
}
