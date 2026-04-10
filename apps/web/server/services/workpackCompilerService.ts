import {
  type WorkpackExecutionPlan,
  type WorkpackRuntimePath,
  type WorkpackStep,
  workpackExecutionPlanSchema,
} from "../../shared/workpackContracts";
import { buildExecutionPlan, type TaskExecutionPlan } from "./taskExecutionPlanner";
import {
  createWorkpackId,
  getWorkpackDetail,
  saveTelemetryEvent,
  updateWorkpack,
  updateWorkpackVersion,
  withWorkpackPersistenceTransaction,
} from "./workpackPersistence";

function nowIso(): string {
  return new Date().toISOString();
}

function chooseRuntimePath(step: WorkpackStep, plannerPlan: TaskExecutionPlan): WorkpackRuntimePath {
  if (step.localityHint === "desktop") return "desktop_local";
  if (plannerPlan.taskType === "agency" && step.requiredConnectorFamilies.length > 1) return "agency";
  if (plannerPlan.taskType === "responses" && step.sideEffectClass === "read_only") return "browser";
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

function fallbackChainForRuntime(runtimePath: WorkpackRuntimePath, plannerPlan: TaskExecutionPlan): WorkpackRuntimePath[] {
  switch (runtimePath) {
    case "browser":
      return plannerPlan.complexity === "complex" ? ["hybrid", "agency"] : ["hybrid"];
    case "desktop_local":
      return ["worker_fabric"];
    case "workflow":
      return ["skill"];
    case "hybrid":
      return plannerPlan.complexity === "complex" ? ["agency", "workflow"] : ["workflow", "agency"];
    case "worker_fabric":
      return ["agency"];
    case "agency":
      return ["hybrid"];
    case "skill":
    default:
      return [];
  }
}

function refineStepPolicy(step: WorkpackStep, plannerPlan: TaskExecutionPlan): WorkpackStep {
  const preferredRuntimePath = chooseRuntimePath(step, plannerPlan);
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
      : fallbackChainForRuntime(preferredRuntimePath, plannerPlan),
    requiresApproval: step.requiresApproval || sideEffectClass === "financial" || sideEffectClass === "irreversible",
    idempotency,
    metadata: {
      ...step.metadata,
      plannerTaskType: plannerPlan.taskType,
      plannerComplexity: plannerPlan.complexity,
      plannerStrategy: plannerPlan.strategy,
      autonomyBlocked:
        sideEffectClass !== "read_only"
        && idempotency.retryDisposition === "blocked"
        && (sideEffectClass === "financial" || sideEffectClass === "irreversible" || !connectorBackedWrite),
    },
  };
}

function buildWorkpackPlannerPlan(input: {
  workpackId: string;
  title: string;
  goal: string;
  domainPack: string;
  steps: WorkpackStep[];
  localFileHeavy: boolean;
}): TaskExecutionPlan {
  const sourceType = input.localFileHeavy
    ? "browser_automation"
    : input.steps.some((step) => step.preferredRuntimePath === "agency")
      ? "agency"
      : input.steps.some((step) => step.preferredRuntimePath === "browser" || step.requiredConnectorFamilies.length > 0)
        ? "responses"
        : "skill";
  const preferredStrategy = input.steps.some((step) => step.sideEffectClass === "financial" || step.sideEffectClass === "irreversible")
    ? "best"
    : input.steps.length > 3
      ? "fastest"
      : "cheapest";
  return buildExecutionPlan({
    sourceType,
    skillSlug: `workpack-${input.domainPack}`,
    conversationModel: input.title,
    hasTools: input.steps.some((step) => step.requiredConnectorFamilies.length > 0 || step.preferredRuntimePath !== "skill"),
    hasMultipleSteps: input.steps.length > 1,
    executionPolicy: {
      preferredStrategy,
      budgetClass: preferredStrategy === "best" ? "premium" : preferredStrategy === "fastest" ? "standard" : "economy",
      requirements: sourceType === "responses"
        ? { supportsResponses: true }
        : {},
      thinking_level_hint: input.steps.length > 4 ? "high" : "medium",
    } as any,
  });
}

export async function compileWorkpackExecutionPlan(input: {
  workpackId: string;
  requestedBy?: number | null;
}): Promise<WorkpackExecutionPlan> {
  const detail = await getWorkpackDetail(input.workpackId);
  if (!detail) {
    throw new Error(`Unknown workpack: ${input.workpackId}`);
  }

  const generatedAt = nowIso();
  const plannerPlan = buildWorkpackPlannerPlan({
    workpackId: detail.workpack.id,
    title: detail.workpack.title,
    goal: detail.workpack.goal,
    domainPack: detail.workpack.domainPack,
    steps: detail.playbook.steps,
    localFileHeavy: detail.playbook.localFileIntelligence.available,
  });
  const steps = detail.playbook.steps.map((step) => refineStepPolicy(step, plannerPlan));
  const plan = workpackExecutionPlanSchema.parse({
    workpackId: detail.workpack.id,
    versionId: detail.version.id,
    generatedAt,
    routeReason: `${detail.workpack.domainPack} workpack routed by planner taskType=${plannerPlan.taskType} complexity=${plannerPlan.complexity} strategy=${plannerPlan.strategy}`,
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

  await withWorkpackPersistenceTransaction(async (session) => {
    await updateWorkpackVersion(detail.version.id, (version) => ({
      ...version,
      executionPlan: plan,
      compilerMetadata: {
        ...version.compilerMetadata,
        compiledAt: generatedAt,
        compiledBy: input.requestedBy ?? null,
        plannerPlan,
      },
    }), session);
    await updateWorkpack(detail.workpack.id, (workpack) => ({
      ...workpack,
      lifecycleState: workpack.lifecycleState === "clarification_needed" ? "clarification_needed" : "ready",
      runtimePreferenceHints: Array.from(new Set(plan.steps.map((step) => step.preferredRuntimePath))),
      updatedAt: generatedAt,
    }), session);
    await saveTelemetryEvent({
      id: createWorkpackId("evt"),
      tenantId: detail.workpack.tenantId,
      workpackId: detail.workpack.id,
      versionId: detail.version.id,
      eventName: "rollout_opened",
      detail: "Execution plan compiled and ready for simulation",
      createdAt: generatedAt,
    }, session);
  });

  return plan;
}

export function isExecutionPlanAutonomySafe(plan: WorkpackExecutionPlan): boolean {
  return plan.steps.every((step) => (
    (!step.requiresApproval || step.sideEffectClass === "read_only")
    && step.idempotency.replayMode !== "dry_run"
    && (step.sideEffectClass === "read_only" || step.idempotency.retryDisposition !== "blocked")
  ));
}
