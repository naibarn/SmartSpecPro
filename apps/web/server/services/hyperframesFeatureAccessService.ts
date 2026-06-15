import {
  buildHyperframesCreditIdempotencyKey,
  type HyperframesBlocker,
  type HyperframesCostClass,
  type HyperframesCreditEstimate,
  type HyperframesPlatformPreset,
  type HyperframesQuotaDecision,
  type HyperframesRenderIntent,
  type MarketplaceAutoReviewCompositionMode,
} from "@shared/hyperframes/contracts";
import {
  buildHyperframesFeatureAccessProjection,
  type HyperframesFeatureAccessProjection,
  type HyperframesFeatureFlagState,
} from "@shared/hyperframes/featureAccess";
import { getHyperframesBlockerCopy } from "@shared/hyperframes/statusCopy";
import { getHyperframesPlatformPreset } from "@shared/hyperframes/templates";
import { getTenantFeatureFlags } from "./tenantFeatureFlagService";
import type { TenantFeatureFlags } from "../../shared/featureFlags";

export type HyperframesAuthContext = { userId: number; tenantId?: string };

export interface HyperframesAccessInput {
  auth: HyperframesAuthContext;
  productId?: string;
  runId?: string;
  flags?: Partial<HyperframesFeatureFlagState>;
  workerReady?: boolean;
  templateReady?: boolean;
  productAnchorReady?: boolean;
  characterAnchorRequired?: boolean;
  characterAnchorReady?: boolean;
  environmentAnchorRequired?: boolean;
  environmentAnchorReady?: boolean;
  complianceReviewRequired?: boolean;
  quotaDecision?: HyperframesQuotaDecision;
  canSaveToLibrary?: boolean;
  canInspectAsOperator?: boolean;
  canReplayAsOperator?: boolean;
  now?: Date;
}

export function readHyperframesFeatureFlags(
  _auth: HyperframesAuthContext,
  overrides: Partial<HyperframesFeatureFlagState> = {}
): HyperframesFeatureFlagState {
  const defaultFlags: HyperframesFeatureFlagState = {
    enabled: false,
    tenantAllowed: false,
    workerEnabled: false,
    librarySaveEnabled: false,
    operatorEnabled: false,
    templateAllowlist: [],
  };
  return { ...defaultFlags, ...overrides };
}

export function readHyperframesFeatureFlagsFromTenantConfig(
  auth: HyperframesAuthContext,
  tenantFlags: Pick<
    TenantFeatureFlags,
    | "marketplaceHyperframesEnabled"
    | "marketplaceHyperframesWorkerEnabled"
    | "marketplaceHyperframesLibrarySaveEnabled"
    | "marketplaceHyperframesOperatorEnabled"
  >,
  overrides: Partial<HyperframesFeatureFlagState> = {}
): HyperframesFeatureFlagState {
  const tenantEnabled = tenantFlags.marketplaceHyperframesEnabled === true;
  const baseFlags: HyperframesFeatureFlagState = {
    enabled: tenantEnabled,
    tenantAllowed: tenantEnabled,
    workerEnabled:
      tenantEnabled &&
      tenantFlags.marketplaceHyperframesWorkerEnabled === true,
    librarySaveEnabled:
      tenantEnabled &&
      tenantFlags.marketplaceHyperframesLibrarySaveEnabled === true,
    operatorEnabled:
      tenantEnabled &&
      tenantFlags.marketplaceHyperframesOperatorEnabled === true,
    templateAllowlist: [],
  };
  const merged = { ...baseFlags, ...overrides };
  const enabled = baseFlags.enabled && merged.enabled !== false;
  return {
    ...merged,
    enabled,
    tenantAllowed:
      enabled && baseFlags.tenantAllowed && merged.tenantAllowed !== false,
    workerEnabled:
      enabled && baseFlags.workerEnabled && merged.workerEnabled !== false,
    librarySaveEnabled:
      enabled &&
      baseFlags.librarySaveEnabled &&
      merged.librarySaveEnabled !== false,
    operatorEnabled:
      enabled &&
      baseFlags.operatorEnabled &&
      merged.operatorEnabled !== false,
  };
}

export async function readHyperframesFeatureFlagsForTenant(
  auth: HyperframesAuthContext,
  overrides: Partial<HyperframesFeatureFlagState> = {}
): Promise<HyperframesFeatureFlagState> {
  const tenantFlags = await getTenantFeatureFlags(auth.tenantId ?? "default");
  return readHyperframesFeatureFlagsFromTenantConfig(auth, tenantFlags, overrides);
}

function blocker(
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
    userActionRequired: [
      "missing_product_anchor",
      "missing_character_anchor",
      "missing_environment_anchor",
      "compliance_review_required",
      "insufficient_credit",
      "quota_blocked",
    ].includes(code),
  };
}

export function buildHyperframesCreditEstimate(input: {
  tenantId: string;
  userId?: number | string;
  runId?: string;
  renderIntent: HyperframesRenderIntent;
  compositionMode: MarketplaceAutoReviewCompositionMode;
  costClass: HyperframesCostClass;
  platformPreset?: HyperframesPlatformPreset;
  compositionInputHash?: string;
  templateVersion?: string;
  quotaDecision?: HyperframesQuotaDecision;
  freePreviewApplied?: boolean;
  workerComplexityMultiplier?: number;
}): HyperframesCreditEstimate {
  const preset = input.platformPreset ?? getHyperframesPlatformPreset("generic_vertical_9_16");
  const durationSeconds =
    input.renderIntent === "preview"
      ? Math.min(15, preset.durationSeconds)
      : input.renderIntent === "final"
        ? Math.min(60, preset.maxDurationSeconds)
        : Math.min(30, preset.maxDurationSeconds);
  const fps = input.renderIntent === "final" ? Math.min(preset.fps, 30) : Math.min(preset.fps, 24);
  const estimatedFrameCount = Math.ceil(durationSeconds * fps);
  const estimatedRenderPixels = preset.width * preset.height * estimatedFrameCount;
  const estimatedVideoBytes = Math.ceil(
    (preset.width * preset.height * fps * durationSeconds) / 18
  );
  const estimatedStorageBytes = estimatedVideoBytes + 4_000_000;
  const profileMultiplier =
    input.renderIntent === "final" ? 1.5 : input.renderIntent === "variant" ? 1.2 : 1;
  const costClassMultiplier =
    input.costClass === "composition_render"
      ? 1.25
      : input.costClass === "composition_variant_export"
        ? 1.15
        : input.costClass === "composition_snapshot_qa"
          ? 0.4
          : 0.65;
  const workerComplexityMultiplier = input.workerComplexityMultiplier ?? 1;
  const rawComputeUnits = estimatedRenderPixels / 1_000_000;
  const estimatedCredits = Math.ceil(
    rawComputeUnits *
      profileMultiplier *
      costClassMultiplier *
      workerComplexityMultiplier
  );
  const compositionInputHash = input.compositionInputHash ?? "pending_input_hash";
  const templateVersion = input.templateVersion ?? "1.0.0";
  const runId = input.runId ?? "pending_run";
  const idempotencyKey = buildHyperframesCreditIdempotencyKey({
    tenantId: input.tenantId,
    runId,
    renderIntent: input.renderIntent,
    compositionInputHash,
    templateVersion,
    platformPresetId: preset.presetId,
  });
  const quotaDecision =
    input.quotaDecision ??
    (input.renderIntent === "preview" ? "free_preview_allowed" : "allowed");
  return {
    estimateRef: `hf_estimate_${compositionInputHash}_${input.renderIntent}`,
    tenantId: input.tenantId,
    userId: input.userId,
    runId,
    renderIntent: input.renderIntent,
    compositionMode: input.compositionMode,
    costClass: input.costClass,
    width: preset.width,
    height: preset.height,
    fps,
    durationSeconds,
    estimatedFrameCount,
    estimatedRenderPixels,
    estimatedStorageBytes,
    profileMultiplier,
    costClassMultiplier,
    workerComplexityMultiplier,
    estimatedCredits,
    freePreviewApplied:
      input.freePreviewApplied ?? input.renderIntent === "preview",
    quotaDecision,
    idempotencyKey,
    compositionEstimateRef: idempotencyKey,
    compositionReservationRef:
      quotaDecision === "needs_authorization" ? `${idempotencyKey}:reserve` : null,
    compositionChargeRef:
      input.renderIntent === "final" ? `${idempotencyKey}:charge` : null,
    compositionRefundRef: null,
  };
}

export function resolveHyperframesFeatureAccess(
  input: HyperframesAccessInput
): HyperframesFeatureAccessProjection {
  const flags = readHyperframesFeatureFlags(input.auth, input.flags);
  const blockers: HyperframesBlocker[] = [];
  const workerReady = input.workerReady ?? flags.workerEnabled;
  if (!flags.enabled) blockers.push(blocker("feature_disabled", "info"));
  if (flags.enabled && !flags.tenantAllowed)
    blockers.push(blocker("tenant_not_allowed", "blocking"));
  if (flags.enabled && flags.tenantAllowed && !workerReady)
    blockers.push(blocker("worker_disabled", "blocking"));
  if (input.templateReady === false)
    blockers.push(blocker("template_unavailable", "blocking"));
  if (input.productAnchorReady === false)
    blockers.push(blocker("missing_product_anchor", "blocking"));
  if (input.characterAnchorRequired && input.characterAnchorReady === false)
    blockers.push(blocker("missing_character_anchor", "blocking"));
  if (input.environmentAnchorRequired && input.environmentAnchorReady === false)
    blockers.push(blocker("missing_environment_anchor", "blocking"));
  const warnings: HyperframesBlocker[] = [];
  if (input.complianceReviewRequired)
    warnings.push(blocker("compliance_review_required", "warning"));
  if (input.quotaDecision === "quota_blocked")
    blockers.push(blocker("quota_blocked", "blocking"));
  if (input.quotaDecision === "credit_blocked")
    blockers.push(blocker("insufficient_credit", "blocking"));

  const tenantId = input.auth.tenantId ?? "default";
  const estimate = buildHyperframesCreditEstimate({
    tenantId,
    userId: input.auth.userId,
    runId: input.runId,
    renderIntent: "preview",
    compositionMode: "storyboard_motion_preview",
    costClass: "composition_preview",
    quotaDecision: input.quotaDecision,
  });

  return buildHyperframesFeatureAccessProjection({
    tenantId,
    userId: input.auth.userId,
    flags: {
      ...flags,
      workerEnabled: workerReady,
    },
    blockers,
    warnings,
    creditAndQuota: {
      estimate,
      quotaDecision: estimate.quotaDecision,
      freePreviewAvailable:
        estimate.quotaDecision === "free_preview_allowed" ||
        estimate.quotaDecision === "allowed",
      noChargeReason:
        estimate.quotaDecision === "free_preview_allowed"
          ? "preview_only"
          : null,
    },
    canSaveToLibrary: input.canSaveToLibrary,
    canInspectAsOperator: input.canInspectAsOperator,
    canReplayAsOperator: input.canReplayAsOperator,
    nowIso: input.now?.toISOString(),
  });
}

export async function resolveHyperframesFeatureAccessForTenant(
  input: HyperframesAccessInput
): Promise<HyperframesFeatureAccessProjection> {
  const flags = await readHyperframesFeatureFlagsForTenant(
    input.auth,
    input.flags
  );
  return resolveHyperframesFeatureAccess({
    ...input,
    flags,
  });
}
