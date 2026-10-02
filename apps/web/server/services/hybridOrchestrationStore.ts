import { and, asc, eq } from "drizzle-orm";
import { z } from "zod";

import {
  HYBRID_PLAN_SCHEMA_VERSION,
  HYBRID_RESULT_SCHEMA_VERSION,
  HYBRID_RUNTIME_CONTRACT_VERSION,
  hybridExecutionStatusSchema,
  hybridOriginSurfaceSchema,
  hybridStageOwnerSchema,
  hybridStageResultSchema,
  hybridStageTypeSchema,
  hybridOrchestrationPlanSchema,
  type HybridExecutionStageStatus,
  type HybridExecutionStatus,
  type HybridOrchestrationPlan,
  type HybridOriginSurface,
  type HybridStageResult,
  type HybridStageType,
  type HybridStageOwner,
} from "@shared/orchestration/hybridOrchestration";
import {
  hybridExecutions,
  hybridExecutionStages,
  type HybridExecutionRow,
  type HybridExecutionStageRow,
  type InsertHybridExecutionRow,
  type InsertHybridExecutionStageRow,
} from "../../drizzle/schema";
import { getDb, type DrizzleDB } from "../db";

const jsonRecordSchema = z.record(z.unknown());

export interface HybridStoreExecution {
  id: string;
  tenantId: string;
  userId: number;
  conversationId: string | null;
  legacyAgencyId: string | null;
  originSurface: HybridOriginSurface;
  status: HybridExecutionStatus;
  objective: string;
  routingDecision: Record<string, unknown>;
  plan: HybridOrchestrationPlan;
  result: Record<string, unknown>;
  currentStageId: string | null;
  totalCreditsUsed: number;
  runtimeContractVersion: typeof HYBRID_RUNTIME_CONTRACT_VERSION;
  planSchemaVersion: typeof HYBRID_PLAN_SCHEMA_VERSION;
  resultSchemaVersion: typeof HYBRID_RESULT_SCHEMA_VERSION;
  runtimeSdkVersion: string | null;
  runtimeAdapterVersion: string | null;
  previewId: string | null;
  previewIdempotencyKey: string | null;
  createdAt: Date;
  updatedAt: Date;
  expiresAt: Date | null;
}

export interface HybridStoreStage {
  id: string;
  tenantId: string;
  executionId: string;
  stageIndex: number;
  stageType: HybridStageType;
  owner: HybridStageOwner;
  executorId: string | null;
  status: HybridExecutionStageStatus;
  inputEnvelope: Record<string, unknown>;
  resultEnvelope: Record<string, unknown>;
  errorCode: string | null;
  idempotencyKey: string;
  traceRefs: string[];
  startedAt: Date | null;
  completedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface HybridStoreExecutionWithStages {
  execution: HybridStoreExecution;
  stages: HybridStoreStage[];
}

export interface CreateHybridExecutionInput {
  id?: string;
  tenantId: string;
  userId: number;
  conversationId?: string | null;
  legacyAgencyId?: string | null;
  originSurface: HybridOriginSurface;
  status?: HybridExecutionStatus;
  objective: string;
  routingDecision?: Record<string, unknown>;
  plan: HybridOrchestrationPlan;
  previewId?: string | null;
  previewIdempotencyKey: string;
  expiresAt?: Date | null;
}

export interface HybridOrchestrationRepository {
  findExecutionByPreviewIdempotencyKey(tenantId: string, previewIdempotencyKey: string): Promise<HybridStoreExecutionWithStages | null>;
  findExecutionById(executionId: string): Promise<HybridStoreExecutionWithStages | null>;
  insertExecution(row: InsertHybridExecutionRow, stages: InsertHybridExecutionStageRow[]): Promise<HybridStoreExecutionWithStages>;
  updateExecutionStatus(executionId: string, status: HybridExecutionStatus, currentStageId?: string | null): Promise<void>;
  updateStageStatus(executionId: string, stageId: string, status: HybridExecutionStageStatus, errorCode?: string | null): Promise<void>;
  updateStageResult(executionId: string, stageId: string, result: HybridStageResult): Promise<void>;
}

function numberFromNumeric(value: unknown): number {
  if (typeof value === "number") return value;
  if (typeof value === "string") return Number(value);
  return 0;
}

function mapExecutionRow(row: HybridExecutionRow): HybridStoreExecution {
  return {
    id: row.id,
    tenantId: row.tenantId,
    userId: row.userId,
    conversationId: row.conversationId ?? null,
    legacyAgencyId: row.legacyAgencyId ?? null,
    originSurface: hybridOriginSurfaceSchema.parse(row.originSurface),
    status: hybridExecutionStatusSchema.parse(row.status),
    objective: row.objective,
    routingDecision: jsonRecordSchema.parse(row.routingDecisionJson ?? {}),
    plan: hybridOrchestrationPlanSchema.parse(row.planJson),
    result: jsonRecordSchema.parse(row.resultJson ?? {}),
    currentStageId: row.currentStageId ?? null,
    totalCreditsUsed: numberFromNumeric(row.totalCreditsUsed),
    runtimeContractVersion: HYBRID_RUNTIME_CONTRACT_VERSION,
    planSchemaVersion: HYBRID_PLAN_SCHEMA_VERSION,
    resultSchemaVersion: HYBRID_RESULT_SCHEMA_VERSION,
    runtimeSdkVersion: row.runtimeSdkVersion ?? null,
    runtimeAdapterVersion: row.runtimeAdapterVersion ?? null,
    previewId: row.previewId ?? null,
    previewIdempotencyKey: row.previewIdempotencyKey ?? null,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    expiresAt: row.expiresAt ?? null,
  };
}

function mapStageRow(row: HybridExecutionStageRow): HybridStoreStage {
  return {
    id: row.id,
    tenantId: row.tenantId,
    executionId: row.executionId,
    stageIndex: row.stageIndex,
    stageType: hybridStageTypeSchema.parse(row.stageType),
    owner: hybridStageOwnerSchema.parse(row.owner),
    executorId: row.executorId ?? null,
    status: z.enum(["pending", "running", "awaiting_approval", "completed", "blocked", "skipped", "failed", "cancelled"]).parse(row.status),
    inputEnvelope: jsonRecordSchema.parse(row.inputEnvelopeJson ?? {}),
    resultEnvelope: jsonRecordSchema.parse(row.resultEnvelopeJson ?? {}),
    errorCode: row.errorCode ?? null,
    idempotencyKey: row.idempotencyKey,
    traceRefs: z.array(z.string()).parse(row.traceRefsJson ?? []),
    startedAt: row.startedAt ?? null,
    completedAt: row.completedAt ?? null,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

async function readWithStages(db: DrizzleDB, executionId: string): Promise<HybridStoreExecutionWithStages | null> {
  const [execution] = await db
    .select()
    .from(hybridExecutions)
    .where(eq(hybridExecutions.id, executionId))
    .limit(1);
  if (!execution) return null;

  const stages = await db
    .select()
    .from(hybridExecutionStages)
    .where(eq(hybridExecutionStages.executionId, execution.id))
    .orderBy(asc(hybridExecutionStages.stageIndex));

  return {
    execution: mapExecutionRow(execution),
    stages: stages.map(mapStageRow),
  };
}

export function createDbHybridOrchestrationRepository(db: DrizzleDB = getDb()): HybridOrchestrationRepository {
  return {
    async findExecutionByPreviewIdempotencyKey(tenantId, previewIdempotencyKey) {
      const [execution] = await db
        .select()
        .from(hybridExecutions)
        .where(and(
          eq(hybridExecutions.tenantId, tenantId),
          eq(hybridExecutions.previewIdempotencyKey, previewIdempotencyKey),
        ))
        .limit(1);
      return execution ? readWithStages(db, execution.id) : null;
    },

    async findExecutionById(executionId) {
      return readWithStages(db, executionId);
    },

    async insertExecution(row, stages) {
      const [inserted] = await db.insert(hybridExecutions).values(row).returning();
      await db.insert(hybridExecutionStages).values(stages.map((stage) => ({
        ...stage,
        executionId: inserted.id,
      })));
      const readBack = await readWithStages(db, inserted.id);
      if (!readBack) {
        throw new Error("Hybrid execution insert failed");
      }
      return readBack;
    },

    async updateExecutionStatus(executionId, status, currentStageId = null) {
      await db
        .update(hybridExecutions)
        .set({ status, currentStageId, updatedAt: new Date() })
        .where(eq(hybridExecutions.id, executionId));
    },

    async updateStageStatus(executionId, stageId, status, errorCode = null) {
      const now = new Date();
      await db
        .update(hybridExecutionStages)
        .set({
          status,
          errorCode,
          startedAt: status === "running" ? now : undefined,
          completedAt: ["completed", "failed", "cancelled", "skipped"].includes(status) ? now : undefined,
          updatedAt: now,
        })
        .where(and(
          eq(hybridExecutionStages.executionId, executionId),
          eq(hybridExecutionStages.id, stageId),
        ));
    },

    async updateStageResult(executionId, stageId, result) {
      const parsed = hybridStageResultSchema.parse(result);
      await db
        .update(hybridExecutionStages)
        .set({
          status: parsed.status === "failed" ? "failed" : "completed",
          resultEnvelopeJson: parsed,
          errorCode: parsed.errorCode ?? null,
          traceRefsJson: parsed.traceRefs ?? [],
          completedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(and(
          eq(hybridExecutionStages.executionId, executionId),
          eq(hybridExecutionStages.id, stageId),
        ));
    },
  };
}

export function buildPreviewIdempotencyKey(input: { tenantId: string; userId: number; previewId: string }): string {
  return `${input.tenantId}:${input.userId}:${input.previewId}`;
}

export async function createHybridExecutionFromPreview(
  input: CreateHybridExecutionInput,
  repository: HybridOrchestrationRepository = createDbHybridOrchestrationRepository(),
): Promise<HybridStoreExecutionWithStages> {
  const existing = await repository.findExecutionByPreviewIdempotencyKey(input.tenantId, input.previewIdempotencyKey);
  if (existing) {
    return existing;
  }

  const plan = hybridOrchestrationPlanSchema.parse(input.plan);
  const currentStage = plan.stages[0] ?? null;
  const executionId = input.id;
  const executionRow: InsertHybridExecutionRow = {
    id: executionId,
    tenantId: input.tenantId,
    userId: input.userId,
    conversationId: input.conversationId ?? null,
    legacyAgencyId: input.legacyAgencyId ?? null,
    originSurface: input.originSurface,
    status: input.status ?? "running_stage",
    objective: input.objective,
    routingDecisionJson: input.routingDecision ?? {},
    planJson: plan,
    resultJson: {},
    currentStageId: currentStage?.id ?? null,
    totalCreditsUsed: "0",
    runtimeContractVersion: HYBRID_RUNTIME_CONTRACT_VERSION,
    planSchemaVersion: HYBRID_PLAN_SCHEMA_VERSION,
    resultSchemaVersion: HYBRID_RESULT_SCHEMA_VERSION,
    previewId: input.previewId ?? null,
    previewIdempotencyKey: input.previewIdempotencyKey,
    expiresAt: input.expiresAt ?? null,
  };

  const stageRows: InsertHybridExecutionStageRow[] = plan.stages.map((stage, index) => ({
    tenantId: input.tenantId,
    executionId: executionId ?? "pending",
    stageIndex: index,
    stageType: stage.type,
    owner: stage.owner,
    executorId: `${stage.owner}:${stage.type}`,
    status: index === 0 ? "running" : "pending",
    inputEnvelopeJson: {},
    resultEnvelopeJson: {},
    idempotencyKey: `${input.previewIdempotencyKey}:stage:${index}`,
    traceRefsJson: [],
    startedAt: index === 0 ? new Date() : null,
  }));

  return repository.insertExecution(executionRow, stageRows);
}

export async function getHybridExecutionFromStore(
  input: { executionId: string; tenantId: string; userId: number },
  repository: HybridOrchestrationRepository = createDbHybridOrchestrationRepository(),
): Promise<HybridStoreExecutionWithStages | null> {
  const record = await repository.findExecutionById(input.executionId);
  if (!record) return null;
  if (record.execution.tenantId !== input.tenantId || record.execution.userId !== input.userId) {
    return null;
  }
  return record;
}

export function createMemoryHybridOrchestrationRepository(): HybridOrchestrationRepository {
  const executions = new Map<string, HybridStoreExecution>();
  const stagesByExecution = new Map<string, HybridStoreStage[]>();

  return {
    async findExecutionByPreviewIdempotencyKey(tenantId, previewIdempotencyKey) {
      const execution = [...executions.values()].find(
        (entry) => entry.tenantId === tenantId && entry.previewIdempotencyKey === previewIdempotencyKey,
      );
      if (!execution) return null;
      return {
        execution,
        stages: stagesByExecution.get(execution.id) ?? [],
      };
    },
    async findExecutionById(executionId) {
      const execution = executions.get(executionId);
      if (!execution) return null;
      return {
        execution,
        stages: stagesByExecution.get(executionId) ?? [],
      };
    },
    async insertExecution(row, stageRows) {
      const now = new Date();
      const execution: HybridStoreExecution = mapExecutionRow({
        ...row,
        id: row.id ?? `exec-${executions.size + 1}`,
        conversationId: row.conversationId ?? null,
        legacyAgencyId: row.legacyAgencyId ?? null,
        currentStageId: row.currentStageId ?? null,
        runtimeSdkVersion: row.runtimeSdkVersion ?? null,
        runtimeAdapterVersion: row.runtimeAdapterVersion ?? null,
        previewId: row.previewId ?? null,
        previewIdempotencyKey: row.previewIdempotencyKey ?? null,
        createdAt: now,
        updatedAt: now,
        expiresAt: row.expiresAt ?? null,
      } as HybridExecutionRow);
      const stages = stageRows.map((stage, index) => mapStageRow({
        ...stage,
        id: stage.id ?? `stage-${index + 1}`,
        executionId: execution.id,
        executorId: stage.executorId ?? null,
        errorCode: stage.errorCode ?? null,
        startedAt: stage.startedAt ?? null,
        completedAt: stage.completedAt ?? null,
        createdAt: now,
        updatedAt: now,
      } as HybridExecutionStageRow));
      executions.set(execution.id, execution);
      stagesByExecution.set(execution.id, stages);
      return { execution, stages };
    },
    async updateExecutionStatus(executionId, status, currentStageId = null) {
      const execution = executions.get(executionId);
      if (!execution) return;
      executions.set(executionId, {
        ...execution,
        status,
        currentStageId,
        updatedAt: new Date(),
      });
    },
    async updateStageStatus(executionId, stageId, status, errorCode = null) {
      const stages = stagesByExecution.get(executionId) ?? [];
      const now = new Date();
      stagesByExecution.set(executionId, stages.map((stage) => (
        stage.id === stageId
          ? {
              ...stage,
              status,
              errorCode,
              startedAt: status === "running" ? (stage.startedAt ?? now) : stage.startedAt,
              completedAt: ["completed", "failed", "cancelled", "skipped"].includes(status) ? now : stage.completedAt,
              updatedAt: now,
            }
          : stage
      )));
    },
    async updateStageResult(executionId, stageId, result) {
      const parsed = hybridStageResultSchema.parse(result);
      const stages = stagesByExecution.get(executionId) ?? [];
      stagesByExecution.set(executionId, stages.map((stage) => (
        stage.id === stageId
          ? {
              ...stage,
              status: parsed.status === "failed" ? "failed" : "completed",
              resultEnvelope: parsed,
              errorCode: parsed.errorCode ?? null,
              traceRefs: parsed.traceRefs ?? [],
              completedAt: new Date(),
              updatedAt: new Date(),
            }
          : stage
      )));
    },
  };
}
