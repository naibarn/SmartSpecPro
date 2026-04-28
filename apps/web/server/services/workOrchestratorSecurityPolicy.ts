import crypto from "crypto";

import type {
  ContractCompatibilityState,
  ExecutionBudgetEnvelope,
  RuntimeDispatchPolicy,
  SkillStudioAction,
  SurfaceGovernancePolicy,
  TeamExecutionPlan,
  WorkIntakeActorContext,
  WorkOrchestratorSurface,
} from "../../shared/workOrchestrator";
import {
  getDefaultContractCompatibility,
  skillStudioActionValues,
} from "../../shared/workOrchestrator";
import type { WorkOrchestratorFeatureFlags } from "./workOrchestratorFeatureFlags";

export const WORK_ORCHESTRATOR_REASON_CODES = {
  featureFlagDisabled: "surface_feature_flag_disabled",
  authorityMissing: "surface_authority_missing",
  contractNotMigrated: "surface_contract_not_migrated",
  approvalRequired: "surface_approval_required",
  budgetExceeded: "budget_cap_exceeded",
  sourceDrift: "approval_source_drift",
} as const;

export interface EvaluateSurfaceGovernanceInput {
  surface: WorkOrchestratorSurface;
  action?: SkillStudioAction | null;
  actorContext: WorkIntakeActorContext;
  flags?: Partial<WorkOrchestratorFeatureFlags> | null;
}

export interface SurfaceGovernanceDecision {
  governance: SurfaceGovernancePolicy;
  blockedReason: string | null;
  authorityDecision: RuntimeDispatchPolicy["authorityDecision"];
  contractCompatibilityState: ContractCompatibilityState;
  reasonCodes: string[];
}

const DEFAULT_FLAGS: WorkOrchestratorFeatureFlags = {
  chatToRequestLaunch: true,
  workflowSurfacePlanning: true,
  skillStudioPlanning: true,
  learningLoopAutomation: true,
  privilegedSurfaceAutoExecution: false,
  approvalSnapshotEnforcement: true,
  launchEnforcement: false,
};

function mergeFlags(
  flags: Partial<WorkOrchestratorFeatureFlags> | null | undefined,
): WorkOrchestratorFeatureFlags {
  return {
    ...DEFAULT_FLAGS,
    ...(flags ?? {}),
  };
}

function minimumGateFor(
  surface: WorkOrchestratorSurface,
): SurfaceGovernancePolicy["minimumGate"] {
  switch (surface) {
    case "skill":
      return "manifest_risk_policy";
    case "agency":
      return "capability_risk_policy";
    case "workflow":
      return "feature_flag_runtime_permission_approval";
    case "browser":
      return "connector_domain_policy";
    case "document_management":
      return "bounded_write_scope";
    case "media_studio":
    case "video_editor":
      return "provider_allowlist_quota";
    case "manual":
      return "human_action";
    case "skill_studio":
      return "skill_studio_action_policy";
    case "work_os":
    default:
      return "explicit_approval";
  }
}

function requiredFeatureFlagsFor(
  surface: WorkOrchestratorSurface,
): string[] {
  switch (surface) {
    case "workflow":
      return ["WORK_ORCHESTRATOR_WORKFLOW_SURFACE_PLANNING"];
    case "skill_studio":
      return ["WORK_ORCHESTRATOR_SKILL_STUDIO_PLANNING"];
    default:
      return [];
  }
}

function requiredPermissionsFor(
  surface: WorkOrchestratorSurface,
  action?: SkillStudioAction | null,
): string[] {
  if (surface === "skill_studio") {
    return [
      `orchestrator.surface.skill_studio.${action ?? "create_private_or_pending_review"}`,
    ];
  }
  return surface === "manual"
    ? []
    : [`orchestrator.surface.${surface}`];
}

function approvalRequiredFor(
  surface: WorkOrchestratorSurface,
  action?: SkillStudioAction | null,
): boolean {
  if (surface === "skill" || surface === "agency") {
    return false;
  }
  if (surface === "skill_studio") {
    return skillStudioActionValues.includes(
      (action ?? "create_private_or_pending_review") as SkillStudioAction,
    );
  }
  return true;
}

function plannerVisibleFor(
  surface: WorkOrchestratorSurface,
  flags: WorkOrchestratorFeatureFlags,
): boolean {
  if (surface === "workflow") {
    return flags.workflowSurfacePlanning;
  }
  if (surface === "skill_studio") {
    return flags.skillStudioPlanning;
  }
  return true;
}

function autoExecutableByDefaultFor(
  surface: WorkOrchestratorSurface,
  flags: WorkOrchestratorFeatureFlags,
): boolean {
  if (surface === "skill" || surface === "agency") {
    return true;
  }
  if (
    surface === "browser" ||
    surface === "document_management" ||
    surface === "media_studio" ||
    surface === "video_editor"
  ) {
    return flags.privilegedSurfaceAutoExecution;
  }
  return false;
}

export function evaluateSurfaceGovernance(
  input: EvaluateSurfaceGovernanceInput,
): SurfaceGovernanceDecision {
  const flags = mergeFlags(input.flags);
  const plannerVisible = plannerVisibleFor(input.surface, flags);
  const requiredFeatureFlags = requiredFeatureFlagsFor(input.surface);
  const requiredPermissions = requiredPermissionsFor(input.surface, input.action);
  const governance: SurfaceGovernancePolicy = {
    surface: input.surface,
    action: input.action ?? null,
    plannerVisible,
    autoExecutableByDefault: autoExecutableByDefaultFor(input.surface, flags),
    approvalRequired: approvalRequiredFor(input.surface, input.action),
    minimumGate: minimumGateFor(input.surface),
    requiredFeatureFlags,
    requiredPermissions,
  };

  const contractCompatibility = getDefaultContractCompatibility(input.surface);
  const hasPermission =
    requiredPermissions.length === 0 ||
    requiredPermissions.every(permission =>
      input.actorContext.allowedSurfacePermissions.includes(permission),
    );
  const flagEnabled =
    requiredFeatureFlags.length === 0 ||
    requiredFeatureFlags.every(flagName => {
      if (flagName === "WORK_ORCHESTRATOR_WORKFLOW_SURFACE_PLANNING") {
        return flags.workflowSurfacePlanning;
      }
      if (flagName === "WORK_ORCHESTRATOR_SKILL_STUDIO_PLANNING") {
        return flags.skillStudioPlanning;
      }
      return true;
    });

  const reasonCodes: string[] = [];
  let blockedReason: string | null = null;
  let authorityDecision: RuntimeDispatchPolicy["authorityDecision"] = "allowed";

  if (!plannerVisible || !flagEnabled) {
    blockedReason = WORK_ORCHESTRATOR_REASON_CODES.featureFlagDisabled;
    authorityDecision = "blocked";
    reasonCodes.push(blockedReason);
  } else if (contractCompatibility.state !== "compatible") {
    blockedReason =
      contractCompatibility.reasonCode ??
      WORK_ORCHESTRATOR_REASON_CODES.contractNotMigrated;
    authorityDecision = "blocked";
    reasonCodes.push(blockedReason);
  } else if (!hasPermission) {
    blockedReason = WORK_ORCHESTRATOR_REASON_CODES.authorityMissing;
    authorityDecision = "blocked";
    reasonCodes.push(blockedReason);
  } else if (governance.approvalRequired && !governance.autoExecutableByDefault) {
    authorityDecision = "approval_required";
    reasonCodes.push(WORK_ORCHESTRATOR_REASON_CODES.approvalRequired);
  }

  return {
    governance,
    blockedReason,
    authorityDecision,
    contractCompatibilityState: contractCompatibility.state,
    reasonCodes,
  };
}

export function buildRequesterSafeDiagnostics(
  diagnostics: Record<string, unknown>,
): Record<string, unknown> {
  return {
    redacted: true,
    visibleReasonCodes: Array.isArray(diagnostics.visibleReasonCodes)
      ? diagnostics.visibleReasonCodes
      : [],
  };
}

export function buildStopPolicyFromBudget(
  budget: ExecutionBudgetEnvelope,
): {
  maxRounds: number;
  maxDurationMinutes: number;
  maxBudgetCredits: number;
  stopOnConsensus: false;
  stopOnArtifactReady: false;
  stopOnLeadSummary: false;
  requireFinalSummary: false;
  idleTimeoutSeconds: number;
} {
  return {
    maxRounds: budget.maxRounds ?? 20,
    maxDurationMinutes: budget.maxDurationMinutes ?? 30,
    maxBudgetCredits: Math.ceil(budget.maxBudgetCredits ?? 500),
    stopOnConsensus: false,
    stopOnArtifactReady: false,
    stopOnLeadSummary: false,
    requireFinalSummary: false,
    idleTimeoutSeconds: 120,
  };
}

function buildIdempotencyDigest(value: string): string {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function runtimeReservationDivisor(budget: ExecutionBudgetEnvelope): number {
  const rounds = Math.ceil(budget.maxRounds ?? 8);
  return Math.max(4, Math.min(8, Number.isFinite(rounds) ? rounds : 8));
}

function runtimeReservationMultiplier(input: {
  surface: WorkOrchestratorSurface;
  sideEffectClass: RuntimeDispatchPolicy["sideEffectClass"];
}): number {
  if (input.surface === "media_studio" || input.surface === "video_editor") {
    return 2;
  }
  if (input.surface === "agency" || input.surface === "workflow") {
    return 1.5;
  }
  switch (input.sideEffectClass) {
    case "irreversible":
    case "external_side_effect":
      return 1.5;
    case "bounded_write":
      return 1.25;
    case "read_only":
    default:
      return 1;
  }
}

function reserveRuntimeBudgetUnit(input: {
  max: number | null | undefined;
  divisor: number;
  multiplier: number;
  cap?: number;
}): number {
  const max = Math.floor(input.max ?? 0);
  if (max <= 0) {
    return 0;
  }
  const cap = Math.max(1, Math.floor(input.cap ?? max));
  return Math.max(
    1,
    Math.min(max, cap, Math.ceil((max / input.divisor) * input.multiplier)),
  );
}

export function buildRuntimeDispatchPolicy(input: {
  step: TeamExecutionPlan["steps"][number];
  budget: ExecutionBudgetEnvelope;
  attemptNumber?: number;
  inputFingerprint: string;
  actorContext?: WorkIntakeActorContext | null;
  flags?: Partial<WorkOrchestratorFeatureFlags> | null;
}): RuntimeDispatchPolicy {
  const sideEffectClass = (() => {
    const raw = String(input.step.metadata.sideEffectClass ?? "read_only");
    if (
      raw === "read_only" ||
      raw === "bounded_write" ||
      raw === "external_side_effect" ||
      raw === "irreversible"
    ) {
      return raw;
    }
    return "read_only";
  })();

  const maxAttemptsFromBudget =
    (input.budget.perSurfaceMaxAttempts as Partial<Record<string, number>>)[
      input.step.surface
    ] ??
    (sideEffectClass === "read_only" ? 2 : 1);

  const runtimeDecision = input.actorContext
    ? evaluateSurfaceGovernance({
        surface: input.step.surface,
        action: input.step.action ?? null,
        actorContext: input.actorContext,
        flags: input.flags,
      })
    : null;
  const authorityDecision =
    runtimeDecision?.authorityDecision ??
    (input.step.contractCompatibility.state === "compatible"
      ? input.step.governance.autoExecutableByDefault
        ? "allowed"
        : input.step.governance.approvalRequired
          ? "approval_required"
          : "allowed"
      : "blocked");
  const contractCompatibilityState =
    runtimeDecision?.contractCompatibilityState ??
    input.step.contractCompatibility.state;
  const deadLetterReasonCode =
    runtimeDecision?.blockedReason ??
    (authorityDecision === "approval_required"
      ? WORK_ORCHESTRATOR_REASON_CODES.approvalRequired
      : contractCompatibilityState === "compatible"
        ? WORK_ORCHESTRATOR_REASON_CODES.budgetExceeded
        : WORK_ORCHESTRATOR_REASON_CODES.contractNotMigrated);
  const reservationDivisor = runtimeReservationDivisor(input.budget);
  const reservationMultiplier = runtimeReservationMultiplier({
    surface: input.step.surface,
    sideEffectClass,
  });

  return {
    stepId: input.step.id,
    surface: input.step.surface,
    selectedCapabilityId: input.step.capabilityId ?? null,
    authorityDecision,
    contractCompatibilityState,
    sideEffectClass,
    idempotencyKey: buildIdempotencyDigest(
      `${input.step.id}:${input.inputFingerprint}:${input.attemptNumber ?? 1}`,
    ),
    inputHash: input.inputFingerprint,
    budgetReservation: {
      tokens: reserveRuntimeBudgetUnit({
        max: input.budget.maxTokens,
        divisor: reservationDivisor,
        multiplier: reservationMultiplier,
        cap:
          input.step.surface === "media_studio" ||
          input.step.surface === "video_editor"
            ? 4_000
            : input.step.surface === "document_management"
              ? 2_000
              : 3_000,
      }),
      toolCalls: reserveRuntimeBudgetUnit({
        max: input.budget.maxToolCalls,
        divisor: reservationDivisor,
        multiplier: reservationMultiplier,
        cap: input.step.surface === "document_management" ? 4 : 6,
      }),
      mediaJobs:
        input.step.surface === "video_editor"
          ? 8
          : input.step.surface === "media_studio"
            ? 1
          : 0,
      workflowRuns: input.step.surface === "workflow" ? 1 : 0,
      agencyRuns: input.step.surface === "agency" ? 1 : 0,
      costCredits: reserveRuntimeBudgetUnit({
        max: input.budget.maxBudgetCredits,
        divisor: reservationDivisor,
        multiplier: reservationMultiplier,
      }),
    },
    maxAttempts: Math.max(1, maxAttemptsFromBudget),
    timeoutSeconds: Math.max(
      30,
      Math.min(900, (input.budget.maxDurationMinutes ?? 10) * 60),
    ),
    retryBackoff: sideEffectClass === "read_only" ? "fixed" : "none",
    resumeCursor: null,
    cancelBehavior:
      sideEffectClass === "irreversible" ? "cannot_cancel" : "mark_cancel_requested",
    deadLetterPolicy: {
      reasonCode: deadLetterReasonCode,
      recoveryHint:
        sideEffectClass === "read_only"
          ? "Regenerate or retry after resolving the blocked reason."
          : "Review the step manually before another attempt.",
    },
  };
}

export function listSkillStudioGovernedActions(): SkillStudioAction[] {
  return [...skillStudioActionValues];
}
