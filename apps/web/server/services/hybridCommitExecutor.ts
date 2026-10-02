import {
  HYBRID_RESULT_SCHEMA_VERSION,
  hybridStageResultSchema,
  type HybridStageResult,
} from "@shared/orchestration/hybridOrchestration";
import { assertHybridExecutorDefinition } from "./hybridExecutorRegistry";
import {
  createDbHybridOrchestrationRepository,
  type HybridOrchestrationRepository,
  type HybridStoreExecutionWithStages,
  type HybridStoreStage,
} from "./hybridOrchestrationStore";

export interface HybridCommitExecutorSideEffect {
  idempotencyKey: string;
  output: Record<string, unknown>;
}

export interface HybridCommitExecutorAdapter {
  commit(input: {
    execution: HybridStoreExecutionWithStages["execution"];
    stage: HybridStoreStage;
    idempotencyKey: string;
  }): Promise<HybridCommitExecutorSideEffect>;
}

export interface CommitHybridExecutionInput {
  executionId: string;
  tenantId: string;
  userId: number;
  approvalDecision: "approved" | "rejected" | null;
  repository?: HybridOrchestrationRepository;
  adapter?: HybridCommitExecutorAdapter;
}

export interface CommitHybridExecutionOutcome {
  status: "completed" | "blocked" | "failed" | "idempotent_replay";
  executionId: string;
  stageId: string | null;
  idempotencyKey: string | null;
  result: HybridStageResult | null;
  errorCode?: string | null;
}

const committedKeys = new Set<string>();

function activeCommitStage(record: HybridStoreExecutionWithStages): HybridStoreStage | null {
  return record.stages.find((stage) => {
    const planStage = record.execution.plan.stages[stage.stageIndex];
    return stage.stageType === "commit" || planStage?.type === "commit";
  }) ?? null;
}

function planStageId(record: HybridStoreExecutionWithStages, stage: HybridStoreStage): string {
  return record.execution.plan.stages[stage.stageIndex]?.id ?? stage.id;
}

function defaultAdapter(): HybridCommitExecutorAdapter {
  return {
    async commit({ execution, stage, idempotencyKey }) {
      return {
        idempotencyKey,
        output: {
          artifactKind: "hybrid_commit_summary",
          executionId: execution.id,
          stageId: stage.id,
          message: "Hybrid first-slice commit recorded without external publishing.",
        },
      };
    },
  };
}

function buildResult(input: {
  record: HybridStoreExecutionWithStages;
  stage: HybridStoreStage;
  status: "succeeded" | "failed";
  output: Record<string, unknown> | null;
  errorCode?: string | null;
}): HybridStageResult {
  return {
    executionId: input.record.execution.id,
    stageId: planStageId(input.record, input.stage),
    status: input.status,
    output: input.output,
    errorCode: input.errorCode ?? null,
    traceRefs: [],
    actualCredits: 0,
    executorCost: 0,
    resultSchemaVersion: HYBRID_RESULT_SCHEMA_VERSION,
  };
}

export function resetHybridCommitIdempotencyForTests(): void {
  committedKeys.clear();
}

export async function commitHybridExecution(
  input: CommitHybridExecutionInput
): Promise<CommitHybridExecutionOutcome> {
  const repository = input.repository ?? createDbHybridOrchestrationRepository();
  const record = await repository.findExecutionById(input.executionId);
  if (
    !record ||
    record.execution.tenantId !== input.tenantId ||
    record.execution.userId !== input.userId
  ) {
    throw new Error("hybrid_execution_not_found");
  }

  const stage = activeCommitStage(record);
  if (!stage) {
    throw new Error("hybrid_commit_stage_not_found");
  }

  const definition = assertHybridExecutorDefinition({
    stageType: "commit",
    owner: stage.owner,
  });
  if (definition.executorId !== "executor:commit") {
    throw new Error("hybrid_commit_executor_not_allowed");
  }
  if (definition.requiresApproval && input.approvalDecision !== "approved") {
    await repository.updateExecutionStatus(record.execution.id, "awaiting_approval", planStageId(record, stage));
    return {
      status: "blocked",
      executionId: record.execution.id,
      stageId: planStageId(record, stage),
      idempotencyKey: stage.idempotencyKey,
      result: null,
      errorCode: "hybrid_commit_approval_required",
    };
  }

  if (committedKeys.has(stage.idempotencyKey)) {
    const parsedResult = hybridStageResultSchema.safeParse(stage.resultEnvelope);
    return {
      status: "idempotent_replay",
      executionId: record.execution.id,
      stageId: planStageId(record, stage),
      idempotencyKey: stage.idempotencyKey,
      result: parsedResult.success ? parsedResult.data : null,
    };
  }

  await repository.updateExecutionStatus(record.execution.id, "committing", planStageId(record, stage));
  try {
    const sideEffect = await (input.adapter ?? defaultAdapter()).commit({
      execution: record.execution,
      stage,
      idempotencyKey: stage.idempotencyKey,
    });
    committedKeys.add(sideEffect.idempotencyKey);
    const result = buildResult({
      record,
      stage,
      status: "succeeded",
      output: {
        ...sideEffect.output,
        idempotencyKey: sideEffect.idempotencyKey,
      },
    });
    await repository.updateStageResult(record.execution.id, stage.id, result);
    await repository.updateExecutionStatus(record.execution.id, "completed", null);
    return {
      status: "completed",
      executionId: record.execution.id,
      stageId: planStageId(record, stage),
      idempotencyKey: sideEffect.idempotencyKey,
      result,
    };
  } catch {
    const result = buildResult({
      record,
      stage,
      status: "failed",
      output: null,
      errorCode: "hybrid_commit_executor_failed",
    });
    await repository.updateStageResult(record.execution.id, stage.id, result);
    await repository.updateExecutionStatus(record.execution.id, "failed", planStageId(record, stage));
    return {
      status: "failed",
      executionId: record.execution.id,
      stageId: planStageId(record, stage),
      idempotencyKey: stage.idempotencyKey,
      result,
      errorCode: "hybrid_commit_executor_failed",
    };
  }
}
