import crypto from "crypto";

import type { WorkAutomationLaunchPolicy } from "./workAutomationPolicyService";
import type {
  CapabilityCatalogEntry,
  CapabilityPlan,
  CompiledWorkBrief,
  ExecutionBudgetEnvelope,
  PreflightRevisionFingerprint,
  TeamExecutionPlan,
  TeamResolutionDecision,
} from "../../shared/workOrchestrator";

export interface CreatePreflightPlanInput {
  brief: CompiledWorkBrief;
  capabilityCatalog: readonly CapabilityCatalogEntry[];
  preflightRevision: PreflightRevisionFingerprint;
  teamResolution: TeamResolutionDecision;
  policy: WorkAutomationLaunchPolicy;
  createdAt?: Date | string;
}

export interface CreatePreflightPlanResult {
  capabilityPlan: CapabilityPlan;
  executionPlan: TeamExecutionPlan;
  budget: ExecutionBudgetEnvelope;
  blockedAlternatives: Record<string, string[]>;
}

function toIsoDate(value: Date | string | undefined): string {
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "string" && value.trim()) return new Date(value).toISOString();
  return new Date().toISOString();
}

function deriveBudget(
  policy: WorkAutomationLaunchPolicy,
): ExecutionBudgetEnvelope {
  const stepCount = Math.max(1, policy.stepBlueprints.length);
  const mediaStepCount = policy.stepBlueprints.filter(
    step => step.surface === "media_studio" || step.surface === "video_editor",
  ).length;
  const workflowStepCount = policy.stepBlueprints.filter(
    step => String(step.surface) === "workflow",
  ).length;
  const agencyStepCount = policy.stepBlueprints.filter(
    step => step.surface === "agency",
  ).length;
  const hasSideEffects = policy.stepBlueprints.some(
    step =>
      step.sideEffectClass === "bounded_write" ||
      step.sideEffectClass === "external_write" ||
      step.sideEffectClass === "irreversible",
  );

  return {
    maxRounds: Math.max(12, stepCount * 3),
    maxTokens: stepCount * 4000,
    maxToolCalls: stepCount * 4,
    maxMediaJobs: mediaStepCount,
    maxWorkflowRuns: workflowStepCount,
    maxAgencyRuns: agencyStepCount,
    maxDurationMinutes: Math.max(15, stepCount * 5),
    maxBudgetCredits: stepCount * 60,
    maxRetries: hasSideEffects ? 1 : 2,
    perSurfaceMaxAttempts: {
      skill: 2,
      agency: 2,
      browser: 1,
      document_management: 1,
      media_studio: 1,
      video_editor: 1,
      workflow: 1,
      skill_studio: 1,
      work_os: 1,
      manual: 1,
    },
    mediaRenderQuota: mediaStepCount,
    retryDisposition: hasSideEffects ? "single_attempt" : "safe_retry",
    sideEffectRetryPolicy: hasSideEffects ? "verify_then_retry" : "automatic",
    onExceeded: "pause_for_approval",
  };
}

function buildCapabilityIndex(
  catalog: readonly CapabilityCatalogEntry[],
): Map<string, CapabilityCatalogEntry> {
  return new Map(catalog.map(entry => [entry.surface, entry]));
}

export function createPreflightPlan(
  input: CreatePreflightPlanInput,
): CreatePreflightPlanResult {
  const createdAt = toIsoDate(input.createdAt);
  const budget = deriveBudget(input.policy);
  const capabilityIndex = buildCapabilityIndex(input.capabilityCatalog);
  const blockedAlternatives: Record<string, string[]> = {};

  const capabilityPlanSteps = input.policy.stepBlueprints.map(step => {
    const selectedCapability = capabilityIndex.get(step.surface) ?? null;
    const alternativeCapabilityIds = input.capabilityCatalog
      .filter(entry => step.allowedSurfaces.includes(entry.surface as never))
      .map(entry => entry.id);

    blockedAlternatives[step.stepKey] = input.capabilityCatalog
      .filter(
        entry =>
          step.allowedSurfaces.includes(entry.surface as never) &&
          entry.blockedReason,
      )
      .map(entry => String(entry.blockedReason));

    return {
      stepId: `${input.preflightRevision.fingerprint}:${step.stepKey}`,
      title: step.title,
      selectedCapabilityId: selectedCapability?.id ?? null,
      selectedSurface: step.surface,
      blockedReasonCodes: selectedCapability?.blockedReason
        ? [selectedCapability.blockedReason]
        : [],
      alternativeCapabilityIds,
    };
  });

  const capabilityPlan: CapabilityPlan = {
    id: crypto.randomUUID(),
    version: "capability-plan.v1",
    selectedCapabilityIds: capabilityPlanSteps
      .map(step => step.selectedCapabilityId)
      .filter((value): value is string => Boolean(value)),
    summary: `Capability plan for ${input.policy.templateTitle}`,
    steps: capabilityPlanSteps,
    createdAt,
  };

  const executionPlan: TeamExecutionPlan = {
    id: crypto.randomUUID(),
    version: "team-execution-plan.v1",
    brief: input.brief,
    budget,
    teamResolution: input.teamResolution,
    preflightRevision: input.preflightRevision,
    createdAt,
    steps: input.policy.stepBlueprints.map(step => {
      const selectedCapability = capabilityIndex.get(step.surface) ?? null;
      return {
        id: `${input.preflightRevision.fingerprint}:${step.stepKey}`,
        stepKey: step.stepKey,
        title: step.title,
        objective: step.title,
        surface: step.surface,
        action: null,
        capabilityId: selectedCapability?.id ?? null,
        governance: selectedCapability?.governance ?? {
          surface: step.surface,
          plannerVisible: true,
          autoExecutableByDefault: false,
          approvalRequired: step.requiresApproval,
          minimumGate: "explicit_approval",
          requiredFeatureFlags: [],
          requiredPermissions: [],
        },
        contractCompatibility:
          selectedCapability?.contractCompatibility ?? {
            state: "preview_only",
            reasonCode: "missing_capability_catalog_entry",
            migrationRequired: false,
          },
        expectedArtifacts: [step.evidenceType],
        optional: false,
        metadata: {
          stepKey: step.stepKey,
          riskTier: step.riskTier,
          checkpointKey: step.checkpointKey,
          requiresApproval: step.requiresApproval,
          allowedSurfaces: step.allowedSurfaces,
          sideEffectClass:
            step.sideEffectClass === "external_write"
              ? "external_side_effect"
              : step.sideEffectClass,
        },
      };
    }),
  };

  return {
    capabilityPlan,
    executionPlan,
    budget,
    blockedAlternatives,
  };
}
