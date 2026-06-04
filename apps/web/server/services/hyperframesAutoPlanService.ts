import { TRPCError } from "@trpc/server";
import {
  buildHyperframesAutoStoryboardReviewPlan,
  type HyperframesAutoStoryboardReviewPlan,
} from "@shared/hyperframes/autoPlan";
import { type HyperframesBlocker } from "@shared/hyperframes/contracts";
import { getHyperframesBlockerCopy } from "@shared/hyperframes/statusCopy";
import {
  resolveHyperframesFeatureAccess,
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
  now?: Date;
}): HyperframesAutoStoryboardReviewPlan {
  const readiness = inferHyperframesProductReadiness(input.productBundle);
  const access = resolveHyperframesFeatureAccess({
    auth: input.auth,
    productId: input.productId,
    runId: compactText(input.activeRun?.id) || undefined,
    ...readiness,
    ...input.accessInput,
    now: input.now,
  });
  const blockers: HyperframesBlocker[] = [];
  if (!readiness.productAnchorReady) {
    blockers.push(buildBlocker("missing_product_anchor"));
  }
  return buildHyperframesAutoStoryboardReviewPlan({
    productId: input.productId,
    tenantId: input.auth.tenantId,
    userId: input.auth.userId,
    access,
    blockers,
    overrides: input.overrides,
    activeRunId: compactText(input.activeRun?.id) || null,
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
  return buildHyperframesAutoPlanFromState({
    auth: input.auth,
    productId: input.productId,
    productBundle,
    activeRun: activeRun as Record<string, unknown> | null,
    overrides: input.overrides,
    accessInput: input.accessInput,
  });
}
