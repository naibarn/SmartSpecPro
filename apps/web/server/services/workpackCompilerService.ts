import {
  type WorkpackExecutionPlan,
  type WorkpackRuntimePath,
  type WorkpackStep,
  workpackExecutionPlanSchema,
} from "../../shared/workpackContracts";
import { createWorkpackId, getWorkpackDetail, saveTelemetryEvent, updateWorkpack, updateWorkpackVersion } from "./workpackPersistence";

function nowIso(): string {
  return new Date().toISOString();
}

function chooseRuntimePath(step: WorkpackStep): WorkpackRuntimePath {
  if (step.localityHint === "desktop") return "desktop_local";
  if (
    step.requiredConnectorFamilies.includes("vendor_portal")
    && (
      step.sideEffectClass === "read_only"
      || step.title.toLowerCase().includes("compare")
      || step.title.toLowerCase().includes("review")
    )
  ) {
    return "browser";
  }
  if (step.sideEffectClass === "read_only" && step.requiredConnectorFamilies.length === 0) return "skill";
  if (step.requiredConnectorFamilies.length > 1) return "hybrid";
  if (step.preferredRuntimePath === "workflow") return "workflow";
  return step.preferredRuntimePath;
}

function fallbackChainForRuntime(runtimePath: WorkpackRuntimePath): WorkpackRuntimePath[] {
  switch (runtimePath) {
    case "browser":
      return ["hybrid"];
    case "desktop_local":
      return ["worker_fabric"];
    case "workflow":
      return ["skill"];
    case "hybrid":
      return ["workflow", "agency"];
    case "worker_fabric":
      return ["agency"];
    case "agency":
      return ["hybrid"];
    case "skill":
    default:
      return [];
  }
}

function refineStepPolicy(step: WorkpackStep): WorkpackStep {
  const preferredRuntimePath = chooseRuntimePath(step);
  const sideEffectClass = step.sideEffectClass;
  const connectorBackedWrite = step.requiredConnectorFamilies.length > 0;
  const idempotency = sideEffectClass === "read_only"
    ? {
        mode: "none" as const,
        effectKey: null,
        retryDisposition: "safe_retry" as const,
        replayMode: "inspection_only" as const,
      }
    : sideEffectClass === "financial" || sideEffectClass === "irreversible" || !connectorBackedWrite
      ? {
          mode: "single_attempt" as const,
          effectKey: step.idempotency.effectKey ?? null,
          retryDisposition: "blocked" as const,
          replayMode: "requires_fresh_run" as const,
        }
      : {
          mode: "connector_key" as const,
          effectKey: step.idempotency.effectKey ?? `${preferredRuntimePath}:${step.id}`,
          retryDisposition: "safe_retry" as const,
          replayMode: "requires_fresh_run" as const,
        };

  return {
    ...step,
    preferredRuntimePath,
    allowedFallbackPaths: step.allowedFallbackPaths.length > 0
      ? step.allowedFallbackPaths
      : fallbackChainForRuntime(preferredRuntimePath),
    requiresApproval: step.requiresApproval || sideEffectClass === "financial" || sideEffectClass === "irreversible",
    idempotency,
    metadata: {
      ...step.metadata,
      autonomyBlocked:
        sideEffectClass !== "read_only"
        && idempotency.retryDisposition === "blocked"
        && (sideEffectClass === "financial" || sideEffectClass === "irreversible" || !connectorBackedWrite),
    },
  };
}

export function compileWorkpackExecutionPlan(input: {
  workpackId: string;
  requestedBy?: number | null;
}): WorkpackExecutionPlan {
  const detail = getWorkpackDetail(input.workpackId);
  if (!detail) {
    throw new Error(`Unknown workpack: ${input.workpackId}`);
  }

  const generatedAt = nowIso();
  const steps = detail.playbook.steps.map(refineStepPolicy);
  const plan = workpackExecutionPlanSchema.parse({
    workpackId: detail.workpack.id,
    versionId: detail.version.id,
    generatedAt,
    routeReason: `${detail.workpack.domainPack} workpack routed into bounded runtime paths`,
    fixtureRequirements: {
      requiresFixtures: detail.version.fixtureCatalog.length > 0,
      requiresMaskedInputs: detail.version.fixtureCatalog.some((fixture) => fixture.governance.redactionState !== "de_identified"),
    },
    evidenceRequirements: {
      requiredTraceDetail: steps.some((step) => step.sideEffectClass !== "read_only") ? "full" : "standard",
      promotionNeedsReplay: true,
    },
    steps,
  });

  updateWorkpackVersion(detail.version.id, (version) => ({
    ...version,
    executionPlan: plan,
    compilerMetadata: {
      ...version.compilerMetadata,
      compiledAt: generatedAt,
      compiledBy: input.requestedBy ?? null,
    },
  }));
  updateWorkpack(detail.workpack.id, (workpack) => ({
    ...workpack,
    lifecycleState: workpack.lifecycleState === "clarification_needed" ? "clarification_needed" : "ready",
    runtimePreferenceHints: Array.from(new Set(plan.steps.map((step) => step.preferredRuntimePath))),
    updatedAt: generatedAt,
  }));
  saveTelemetryEvent({
    id: createWorkpackId("evt"),
    tenantId: detail.workpack.tenantId,
    workpackId: detail.workpack.id,
    versionId: detail.version.id,
    eventName: "rollout_opened",
    detail: "Execution plan compiled and ready for simulation",
    createdAt: generatedAt,
  });

  return plan;
}

export function isExecutionPlanAutonomySafe(plan: WorkpackExecutionPlan): boolean {
  return plan.steps.every((step) => step.sideEffectClass === "read_only" || step.idempotency.retryDisposition !== "blocked");
}
