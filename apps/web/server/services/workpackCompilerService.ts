import {
  type WorkpackExecutionPlan,
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

function refineStepPolicy(step: WorkpackStep, plannerPlan: TaskExecutionPlan): WorkpackStep {
  const runtimeIntent = plannerPlan.runtimeIntent;
  const preferredRuntimePath = runtimeIntent?.primaryPath ?? step.preferredRuntimePath;
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
    allowedFallbackPaths: runtimeIntent?.fallbackPaths.length
      ? [...runtimeIntent.fallbackPaths]
      : step.allowedFallbackPaths,
    requiresApproval:
      step.requiresApproval
      || runtimeIntent?.stepUpBoundary === "approval"
      || sideEffectClass === "financial"
      || sideEffectClass === "irreversible",
    idempotency,
    metadata: {
      ...step.metadata,
      plannerTaskType: plannerPlan.taskType,
      plannerComplexity: plannerPlan.complexity,
      plannerStrategy: plannerPlan.strategy,
      plannerRuntimeIntent: runtimeIntent ?? null,
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

function buildStepPlannerPlan(input: {
  workpackId: string;
  title: string;
  goal: string;
  domainPack: string;
  step: WorkpackStep;
  localFileHeavy: boolean;
  totalSteps: number;
}): TaskExecutionPlan {
  const sourceType = input.step.localityHint === "desktop"
    ? "browser_automation"
    : input.step.preferredRuntimePath === "agency"
      ? "agency"
      : input.step.preferredRuntimePath === "browser" || input.step.requiredConnectorFamilies.length > 0
        ? "responses"
        : "skill";
  const preferredStrategy = input.step.sideEffectClass === "financial" || input.step.sideEffectClass === "irreversible"
    ? "best"
    : input.totalSteps > 3 || input.step.requiredConnectorFamilies.length > 1
      ? "fastest"
      : "cheapest";

  return buildExecutionPlan({
    sourceType,
    skillSlug: `workpack-${input.domainPack}`,
    conversationModel: `${input.title}:${input.step.title}`,
    hasTools: input.step.requiredConnectorFamilies.length > 0 || input.step.preferredRuntimePath !== "skill" || input.localFileHeavy,
    hasMultipleSteps: input.totalSteps > 1,
    runtimeHints: {
      preferredPath: input.step.preferredRuntimePath,
      allowedFallbackPaths: input.step.allowedFallbackPaths,
      connectorCount: input.step.requiredConnectorFamilies.length,
      localityHint: input.step.localityHint,
      sideEffectClass: input.step.sideEffectClass,
      requiresApproval: input.step.requiresApproval,
      prefersBrowser:
        input.step.preferredRuntimePath === "browser"
        || input.step.requiredConnectorFamilies.includes("vendor_portal"),
      prefersWorkflow: input.step.preferredRuntimePath === "workflow",
      requiresDeterministic: input.step.preferredRuntimePath === "workflow" || input.step.preferredRuntimePath === "skill",
    },
    executionPolicy: {
      preferredStrategy,
      budgetClass: preferredStrategy === "best" ? "premium" : preferredStrategy === "fastest" ? "standard" : "economy",
      requirements: sourceType === "responses"
        ? { supportsResponses: true }
        : {},
      thinking_level_hint:
        input.step.sideEffectClass === "financial" || input.step.sideEffectClass === "irreversible"
          ? "high"
          : input.step.requiredConnectorFamilies.length > 1
            ? "medium"
            : "low",
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
  const stepPlannerPlans = detail.playbook.steps.map((step) => buildStepPlannerPlan({
    workpackId: detail.workpack.id,
    title: detail.workpack.title,
    goal: detail.workpack.goal,
    domainPack: detail.workpack.domainPack,
    step,
    localFileHeavy: detail.playbook.localFileIntelligence.available,
    totalSteps: detail.playbook.steps.length,
  }));
  const steps = detail.playbook.steps.map((step, index) => refineStepPolicy(step, stepPlannerPlans[index] ?? plannerPlan));
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
        stepPlannerPlans,
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
