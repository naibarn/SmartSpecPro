import { z } from "zod";
import {
  HYPERFRAMES_MARKETPLACE_CONTRACT_VERSION,
  HyperframesBlockerSchema,
  HyperframesCreditEstimateSchema,
  HyperframesQuotaDecisionSchema,
} from "./contracts";

export const HyperframesFeatureFlagStateSchema = z
  .object({
    enabled: z.boolean(),
    tenantAllowed: z.boolean(),
    workerEnabled: z.boolean(),
    librarySaveEnabled: z.boolean(),
    operatorEnabled: z.boolean(),
    templateAllowlist: z.array(z.string().min(1)).default([]),
  })
  .strict();

export const HyperframesCapabilityProjectionSchema = z
  .object({
    canAccessAuto: z.boolean(),
    canStartAuto: z.boolean(),
    canPreview: z.boolean(),
    canCancel: z.boolean(),
    canSaveToLibrary: z.boolean(),
    canUseStandardOrder: z.boolean(),
    canInspectAsOperator: z.boolean(),
    canReplayAsOperator: z.boolean(),
  })
  .strict();

export const HyperframesFeatureAccessProjectionSchema = z
  .object({
    schemaVersion: z.literal(1).default(1),
    contractVersion: z.literal(HYPERFRAMES_MARKETPLACE_CONTRACT_VERSION),
    tenantId: z.string().min(1),
    userId: z.union([z.string(), z.number()]).optional(),
    accessState: z.enum(["enabled", "blocked", "disabled", "unavailable"]),
    flags: HyperframesFeatureFlagStateSchema,
    capabilities: HyperframesCapabilityProjectionSchema,
    blockers: z.array(HyperframesBlockerSchema).default([]),
    warnings: z.array(HyperframesBlockerSchema).default([]),
    creditAndQuota: z
      .object({
        estimate: HyperframesCreditEstimateSchema.nullable().optional(),
        quotaDecision: HyperframesQuotaDecisionSchema,
        freePreviewAvailable: z.boolean(),
        noChargeReason: z.string().max(120).nullable().optional(),
      })
      .strict(),
    standardOrderAvailable: z.boolean(),
    safeSummary: z.string().max(800),
    evaluatedAt: z.string().min(1),
  })
  .strict();

export type HyperframesFeatureFlagState = z.infer<
  typeof HyperframesFeatureFlagStateSchema
>;
export type HyperframesFeatureAccessProjection = z.infer<
  typeof HyperframesFeatureAccessProjectionSchema
>;

export function buildHyperframesFeatureAccessProjection(input: {
  tenantId?: string | null;
  userId?: string | number | null;
  flags: HyperframesFeatureFlagState;
  blockers?: HyperframesFeatureAccessProjection["blockers"];
  warnings?: HyperframesFeatureAccessProjection["warnings"];
  creditAndQuota?: Partial<HyperframesFeatureAccessProjection["creditAndQuota"]>;
  canStartAuto?: boolean;
  canPreview?: boolean;
  canCancel?: boolean;
  canSaveToLibrary?: boolean;
  canInspectAsOperator?: boolean;
  canReplayAsOperator?: boolean;
  nowIso?: string;
}): HyperframesFeatureAccessProjection {
  const tenantId = input.tenantId || "default";
  const blockers = input.blockers ?? [];
  const globallyEnabled = input.flags.enabled && input.flags.tenantAllowed;
  const workerReady = input.flags.workerEnabled;
  const accessState = !input.flags.enabled
    ? "disabled"
    : !input.flags.tenantAllowed
      ? "unavailable"
      : blockers.length > 0 || !workerReady
        ? "blocked"
        : "enabled";
  const canAccessAuto = globallyEnabled;
  const canStartAuto =
    canAccessAuto &&
    workerReady &&
    blockers.length === 0 &&
    (input.canStartAuto ?? true);
  const projection = {
    contractVersion: HYPERFRAMES_MARKETPLACE_CONTRACT_VERSION,
    tenantId,
    userId: input.userId ?? undefined,
    accessState,
    flags: input.flags,
    capabilities: {
      canAccessAuto,
      canStartAuto,
      canPreview: canStartAuto && (input.canPreview ?? true),
      canCancel: canAccessAuto && (input.canCancel ?? true),
      canSaveToLibrary:
        canAccessAuto &&
        input.flags.librarySaveEnabled &&
        (input.canSaveToLibrary ?? false),
      canUseStandardOrder: true,
      canInspectAsOperator:
        input.flags.operatorEnabled && (input.canInspectAsOperator ?? false),
      canReplayAsOperator:
        input.flags.operatorEnabled && (input.canReplayAsOperator ?? false),
    },
    blockers,
    warnings: input.warnings ?? [],
    creditAndQuota: {
      estimate: input.creditAndQuota?.estimate ?? null,
      quotaDecision: input.creditAndQuota?.quotaDecision ?? "no_charge",
      freePreviewAvailable: input.creditAndQuota?.freePreviewAvailable ?? true,
      noChargeReason: input.creditAndQuota?.noChargeReason ?? null,
    },
    standardOrderAvailable: true,
    safeSummary:
      accessState === "enabled"
        ? "Auto Storyboard Review is ready."
        : "Standard Order remains available while Auto is unavailable.",
    evaluatedAt: input.nowIso ?? new Date().toISOString(),
  };
  return HyperframesFeatureAccessProjectionSchema.parse(projection);
}
