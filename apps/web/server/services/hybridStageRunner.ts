import {
  HYBRID_PLAN_SCHEMA_VERSION,
  HYBRID_RESULT_SCHEMA_VERSION,
  HYBRID_RUNTIME_CONTRACT_VERSION,
  hybridRuntimeStageRequestSchema,
  hybridStageResultSchema,
  type HybridRuntimeStageRequest,
  type HybridStageResult,
} from "@shared/orchestration/hybridOrchestration";
import {
  AgentRuntimeClient,
  AgentRuntimeClientError,
  assertHybridRuntimeHealthCompatibility,
  type AgentRuntimeHealth,
} from "./agentRuntime/client";
import { assertHybridExecutorDefinition } from "./hybridExecutorRegistry";
import {
  createDbHybridOrchestrationRepository,
  type HybridOrchestrationRepository,
  type HybridStoreExecutionWithStages,
  type HybridStoreStage,
} from "./hybridOrchestrationStore";

export interface HybridStageRunnerClient {
  health(): Promise<AgentRuntimeHealth>;
  runHybridStage(request: HybridRuntimeStageRequest): Promise<HybridStageResult>;
}

export interface RunHybridStageInput {
  executionId: string;
  tenantId: string;
  userId: number;
  repository?: HybridOrchestrationRepository;
  client?: HybridStageRunnerClient;
  maxStageCredits?: number;
  maxTotalCredits?: number;
}

export interface RunHybridStageOutcome {
  executionId: string;
  stageId: string;
  status:
    | "completed"
    | "awaiting_approval"
    | "repair_required"
    | "commit_ready"
    | "failed"
    | "skipped";
  result: HybridStageResult | null;
  nextStageId: string | null;
  errorCode?: string | null;
}

const DEFAULT_MAX_STAGE_CREDITS = 10;
const DEFAULT_MAX_TOTAL_CREDITS = 50;

function activeStage(record: HybridStoreExecutionWithStages): HybridStoreStage | null {
  if (record.execution.currentStageId) {
    const byPlanId = record.stages.find((stage) => {
      const planStage = record.execution.plan.stages[stage.stageIndex];
      return planStage?.id === record.execution.currentStageId;
    });
    if (byPlanId) return byPlanId;
    const byRowId = record.stages.find(
      (stage) => stage.id === record.execution.currentStageId
    );
    if (byRowId) return byRowId;
  }
  return record.stages.find((stage) => stage.status === "running") ?? null;
}

function planStageId(
  record: HybridStoreExecutionWithStages,
  stage: HybridStoreStage
): string {
  return record.execution.plan.stages[stage.stageIndex]?.id ?? stage.id;
}

function nextStage(
  record: HybridStoreExecutionWithStages,
  stage: HybridStoreStage
): HybridStoreStage | null {
  return record.stages.find(
    (candidate) => candidate.stageIndex === stage.stageIndex + 1
  ) ?? null;
}

function nextStagePlanId(
  record: HybridStoreExecutionWithStages,
  stage: HybridStoreStage
): string | null {
  const next = nextStage(record, stage);
  return next ? planStageId(record, next) : null;
}

function buildStageRequest(
  record: HybridStoreExecutionWithStages,
  stage: HybridStoreStage
): HybridRuntimeStageRequest {
  return hybridRuntimeStageRequestSchema.parse({
    executionId: record.execution.id,
    stageId: planStageId(record, stage),
    stageType: stage.stageType,
    owner: stage.owner,
    tenantId: record.execution.tenantId,
    userId: record.execution.userId,
    objective: record.execution.objective,
    input: {
      plan: record.execution.plan,
      stage,
      previousResults: record.stages
        .filter((candidate) => candidate.stageIndex < stage.stageIndex)
        .map((candidate) => ({
          stageId: planStageId(record, candidate),
          result: candidate.resultEnvelope,
        })),
    },
    runtimeContractVersion: HYBRID_RUNTIME_CONTRACT_VERSION,
    planSchemaVersion: HYBRID_PLAN_SCHEMA_VERSION,
  });
}

function failedResult(
  record: HybridStoreExecutionWithStages,
  stage: HybridStoreStage,
  errorCode: string
): HybridStageResult {
  return hybridStageResultSchema.parse({
    executionId: record.execution.id,
    stageId: planStageId(record, stage),
    status: "failed",
    output: null,
    errorCode,
    traceRefs: [],
    actualCredits: 0,
    resultSchemaVersion: HYBRID_RESULT_SCHEMA_VERSION,
  });
}

function resultRequestsRepair(result: HybridStageResult): boolean {
  if (result.status !== "succeeded") return false;
  return result.output?.nextAction === "repair_required" || result.output?.verdict === "repair_required";
}

function resultCredits(result: HybridStageResult): number {
  return Number(result.actualCredits ?? result.estimatedCredits ?? 0);
}

async function failStage(
  repository: HybridOrchestrationRepository,
  record: HybridStoreExecutionWithStages,
  stage: HybridStoreStage,
  errorCode: string
): Promise<RunHybridStageOutcome> {
  const result = failedResult(record, stage, errorCode);
  await repository.updateStageResult(record.execution.id, stage.id, result);
  await repository.updateExecutionStatus(record.execution.id, "failed", planStageId(record, stage));
  return {
    executionId: record.execution.id,
    stageId: planStageId(record, stage),
    status: "failed",
    result,
    nextStageId: null,
    errorCode,
  };
}

export async function runNextHybridStage(
  input: RunHybridStageInput
): Promise<RunHybridStageOutcome> {
  const repository = input.repository ?? createDbHybridOrchestrationRepository();
  const client = input.client ?? new AgentRuntimeClient();
  const record = await repository.findExecutionById(input.executionId);
  if (
    !record ||
    record.execution.tenantId !== input.tenantId ||
    record.execution.userId !== input.userId
  ) {
    throw new Error("hybrid_execution_not_found");
  }

  const stage = activeStage(record);
  if (!stage) {
    await repository.updateExecutionStatus(record.execution.id, "completed", null);
    return {
      executionId: record.execution.id,
      stageId: "complete",
      status: "completed",
      result: null,
      nextStageId: null,
    };
  }

  if (record.execution.status === "cancelled" || stage.status === "cancelled") {
    return {
      executionId: record.execution.id,
      stageId: planStageId(record, stage),
      status: "skipped",
      result: null,
      nextStageId: null,
      errorCode: "hybrid_execution_cancelled",
    };
  }

  const definition = assertHybridExecutorDefinition({
    stageType: stage.stageType,
    owner: stage.owner,
  });

  if (
    record.execution.totalCreditsUsed >=
    (input.maxTotalCredits ?? DEFAULT_MAX_TOTAL_CREDITS)
  ) {
    return failStage(repository, record, stage, "hybrid_budget_exceeded");
  }

  if (definition.executorId === "human:approval") {
    await repository.updateStageStatus(record.execution.id, stage.id, "awaiting_approval");
    await repository.updateExecutionStatus(record.execution.id, "awaiting_approval", planStageId(record, stage));
    return {
      executionId: record.execution.id,
      stageId: planStageId(record, stage),
      status: "awaiting_approval",
      result: null,
      nextStageId: planStageId(record, stage),
    };
  }

  if (definition.executorId === "executor:commit") {
    await repository.updateExecutionStatus(record.execution.id, "committing", planStageId(record, stage));
    return {
      executionId: record.execution.id,
      stageId: planStageId(record, stage),
      status: "commit_ready",
      result: null,
      nextStageId: planStageId(record, stage),
    };
  }

  try {
    const health = await client.health();
    assertHybridRuntimeHealthCompatibility(health);
    if (!health.supportedHybridStageTypes.includes(stage.stageType)) {
      return failStage(repository, record, stage, "hybrid_stage_type_unsupported");
    }
  } catch (error) {
    const errorCode =
      error instanceof AgentRuntimeClientError
        ? error.code
        : "hybrid_adapter_unavailable";
    return failStage(repository, record, stage, errorCode);
  }

  await repository.updateStageStatus(record.execution.id, stage.id, "running");
  const request = buildStageRequest(record, stage);
  let result: HybridStageResult;
  try {
    result = hybridStageResultSchema.parse(await client.runHybridStage(request));
  } catch (error) {
    const errorCode =
      error instanceof AgentRuntimeClientError
        ? error.code
        : "hybrid_runtime_error";
    return failStage(repository, record, stage, errorCode);
  }

  if (resultCredits(result) > (input.maxStageCredits ?? DEFAULT_MAX_STAGE_CREDITS)) {
    return failStage(repository, record, stage, "hybrid_stage_budget_exceeded");
  }

  await repository.updateStageResult(record.execution.id, stage.id, result);
  if (result.status === "failed") {
    await repository.updateExecutionStatus(record.execution.id, "failed", planStageId(record, stage));
    return {
      executionId: record.execution.id,
      stageId: planStageId(record, stage),
      status: "failed",
      result,
      nextStageId: null,
      errorCode: result.errorCode ?? "hybrid_stage_failed",
    };
  }
  if (result.status === "requires_approval") {
    await repository.updateExecutionStatus(record.execution.id, "awaiting_approval", planStageId(record, stage));
    return {
      executionId: record.execution.id,
      stageId: planStageId(record, stage),
      status: "awaiting_approval",
      result,
      nextStageId: planStageId(record, stage),
    };
  }
  if (resultRequestsRepair(result)) {
    await repository.updateExecutionStatus(record.execution.id, "repairing", planStageId(record, stage));
    return {
      executionId: record.execution.id,
      stageId: planStageId(record, stage),
      status: "repair_required",
      result,
      nextStageId: planStageId(record, stage),
    };
  }

  const next = nextStage(record, stage);
  if (!next) {
    await repository.updateExecutionStatus(record.execution.id, "completed", null);
    return {
      executionId: record.execution.id,
      stageId: planStageId(record, stage),
      status: "completed",
      result,
      nextStageId: null,
    };
  }

  const nextId = planStageId(record, next);
  await repository.updateStageStatus(record.execution.id, next.id, "running");
  await repository.updateExecutionStatus(record.execution.id, "running_stage", nextId);
  return {
    executionId: record.execution.id,
    stageId: planStageId(record, stage),
    status: "completed",
    result,
    nextStageId: nextId,
  };
}
