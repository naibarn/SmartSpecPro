import { z } from "zod";
import {
  AgentCapabilityManifestSchema,
  AgentRuntimeEntryPointSchema,
  AgentRuntimeOriginSurfaceSchema,
  AgentRuntimeSurfaceSchema,
  type AgentCapabilityManifest,
  type AgentRuntimeEntryPoint,
  type AgentRuntimeOriginSurface,
  type AgentRuntimeSurface,
} from "./types";

export const RUNTIME_SKILL_MANIFEST_SCHEMA_VERSION = 1;

export const SKILL_CAPABILITY_SIDE_EFFECT_CLASSES = [
  "read_only",
  "sandbox_write",
  "connector_write",
  "network_mutation",
] as const;

export const SKILL_CAPABILITY_DATA_SENSITIVITIES = [
  "public",
  "internal",
  "sensitive",
  "restricted",
] as const;

export const SKILL_CAPABILITY_EXECUTION_MODES = [
  "llm_only",
  "structured_output",
  "prompt_only",
  "automation_write",
] as const;

export const SKILL_CAPABILITY_RISK_TIERS = [
  "low",
  "medium",
  "high",
  "critical",
] as const;

export const SKILL_CAPABILITY_LATENCY_BUDGETS = [
  "interactive",
  "extended",
  "background",
] as const;

export const SKILL_CAPABILITY_TOKEN_BUDGETS = [
  "small",
  "medium",
  "large",
  "xlarge",
] as const;

export const SkillCapabilitySideEffectClassSchema = z.enum(
  SKILL_CAPABILITY_SIDE_EFFECT_CLASSES
);
export const SkillCapabilityDataSensitivitySchema = z.enum(
  SKILL_CAPABILITY_DATA_SENSITIVITIES
);
export const SkillCapabilityExecutionModeSchema = z.enum(
  SKILL_CAPABILITY_EXECUTION_MODES
);
export const SkillCapabilityRiskTierSchema = z.enum(
  SKILL_CAPABILITY_RISK_TIERS
);
export const SkillCapabilityLatencyBudgetSchema = z.enum(
  SKILL_CAPABILITY_LATENCY_BUDGETS
);
export const SkillCapabilityTokenBudgetSchema = z.enum(
  SKILL_CAPABILITY_TOKEN_BUDGETS
);

const StringListSchema = z.array(z.string().min(1));
const StructuredShapeSchema = z.record(z.unknown());

export const SkillCapabilityManifestSchema = z
  .object({
    skillSlug: z.string().min(1),
    skillName: z.string().min(1),
    manifestSchemaVersion: z
      .number()
      .int()
      .positive()
      .default(RUNTIME_SKILL_MANIFEST_SCHEMA_VERSION),
    purpose: z.string().min(1),
    surfaceSupport: z.array(AgentRuntimeSurfaceSchema).min(1),
    supportedOriginSurfaces: z.array(AgentRuntimeOriginSurfaceSchema),
    supportedEntryPoints: z.array(AgentRuntimeEntryPointSchema),
    taskTypes: StringListSchema.min(1),
    requiredContext: StringListSchema,
    preferredContext: StringListSchema,
    inputs: StructuredShapeSchema,
    outputs: StructuredShapeSchema,
    supportedArtifactTypes: StringListSchema,
    evidenceRequired: StringListSchema,
    reviewChecklist: StringListSchema.min(1),
    failureModes: StringListSchema.min(1),
    doNotUseWhen: StringListSchema.min(1),
    requiredConnectors: StringListSchema,
    writeScope: StringListSchema,
    sideEffectClass: SkillCapabilitySideEffectClassSchema,
    dataSensitivity: SkillCapabilityDataSensitivitySchema,
    executionMode: SkillCapabilityExecutionModeSchema,
    isReadOnly: z.boolean(),
    riskTier: SkillCapabilityRiskTierSchema,
    latencyBudget: SkillCapabilityLatencyBudgetSchema,
    tokenBudget: SkillCapabilityTokenBudgetSchema,
    defaultToolBudget: z.number().int().nonnegative(),
    humanApprovalRequired: z.boolean(),
    allowedModelFamilies: StringListSchema.min(1),
    completionSignals: StringListSchema.min(1),
    selectionSignals: StringListSchema.min(1),
    negativeSignals: StringListSchema.min(1),
    requiredEvidenceKinds: StringListSchema,
    reviewerProfile: z.string().min(1),
    repairStrategy: z.string().min(1),
    supportsRepairLoop: z.boolean(),
    ownerTeam: z.string().min(1),
    ownerCodeownersPath: z.string().min(1),
    ownerReviewCadence: z.string().min(1),
  })
  .superRefine((value, ctx) => {
    if (value.isReadOnly && value.sideEffectClass !== "read_only") {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "readonly_skill_requires_read_only_side_effect_class",
        path: ["sideEffectClass"],
      });
    }

    if (!value.isReadOnly && value.sideEffectClass === "read_only") {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "mutating_skill_requires_non_read_only_side_effect_class",
        path: ["sideEffectClass"],
      });
    }

    if (value.sideEffectClass !== "read_only" && value.writeScope.length === 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "mutating_skill_requires_write_scope",
        path: ["writeScope"],
      });
    }

    if (
      value.sideEffectClass === "connector_write" &&
      value.requiredConnectors.length === 0
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "connector_write_skill_requires_required_connectors",
        path: ["requiredConnectors"],
      });
    }

    if (
      value.surfaceSupport.includes("skill") &&
      value.supportedOriginSurfaces.length === 0
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "skill_surface_requires_supported_origin_surfaces",
        path: ["supportedOriginSurfaces"],
      });
    }

    if (
      value.surfaceSupport.includes("skill") &&
      value.supportedEntryPoints.length === 0
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "skill_surface_requires_supported_entry_points",
        path: ["supportedEntryPoints"],
      });
    }
  });

export type SkillCapabilitySideEffectClass = z.infer<
  typeof SkillCapabilitySideEffectClassSchema
>;
export type SkillCapabilityDataSensitivity = z.infer<
  typeof SkillCapabilityDataSensitivitySchema
>;
export type SkillCapabilityExecutionMode = z.infer<
  typeof SkillCapabilityExecutionModeSchema
>;
export type SkillCapabilityRiskTier = z.infer<
  typeof SkillCapabilityRiskTierSchema
>;
export type SkillCapabilityLatencyBudget = z.infer<
  typeof SkillCapabilityLatencyBudgetSchema
>;
export type SkillCapabilityTokenBudget = z.infer<
  typeof SkillCapabilityTokenBudgetSchema
>;
export type SkillCapabilityManifest = z.infer<
  typeof SkillCapabilityManifestSchema
>;

export interface SkillCapabilitySupportCheckInput {
  surface: AgentRuntimeSurface;
  originSurface?: AgentRuntimeOriginSurface | null;
  entryPoint?: AgentRuntimeEntryPoint | null;
}

export function supportsSkillCapabilityCaller(
  manifest: Pick<
    SkillCapabilityManifest,
    "surfaceSupport" | "supportedOriginSurfaces" | "supportedEntryPoints"
  >,
  caller: SkillCapabilitySupportCheckInput
): boolean {
  if (!manifest.surfaceSupport.includes(caller.surface)) {
    return false;
  }

  if (caller.originSurface) {
    if (
      manifest.supportedOriginSurfaces.length > 0 &&
      !manifest.supportedOriginSurfaces.includes(caller.originSurface)
    ) {
      return false;
    }
  }

  if (caller.entryPoint) {
    if (
      manifest.supportedEntryPoints.length > 0 &&
      !manifest.supportedEntryPoints.includes(caller.entryPoint)
    ) {
      return false;
    }
  }

  return true;
}

export function toAgentCapabilityManifest(
  manifest: SkillCapabilityManifest
): AgentCapabilityManifest {
  return AgentCapabilityManifestSchema.parse({
    slug: manifest.skillSlug,
    manifestSchemaVersion: manifest.manifestSchemaVersion,
    name: manifest.skillName,
    purpose: manifest.purpose,
    supportedSurfaces: manifest.surfaceSupport,
    supportedOriginSurfaces: manifest.supportedOriginSurfaces,
    supportedEntryPoints: manifest.supportedEntryPoints,
    taskTypes: manifest.taskTypes,
    requiredContext: manifest.requiredContext,
    preferredContext: manifest.preferredContext,
    inputSchema: manifest.inputs,
    outputSchema: manifest.outputs,
    supportedArtifactTypes: manifest.supportedArtifactTypes,
    requiredEvidenceKinds: manifest.requiredEvidenceKinds,
    reviewChecklist: manifest.reviewChecklist,
    failureModes: manifest.failureModes,
    doNotUseWhen: manifest.doNotUseWhen,
  });
}

export {
  AgentCapabilityManifestSchema,
  type AgentCapabilityManifest,
};
