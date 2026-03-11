/**
 * Task Run Store
 *
 * Persistence helpers for task_runs and task_step_attempts tables.
 * These are the write-path functions that connect the planner/resolver
 * to the database. Route wiring (calling these from llmRoutes, etc.)
 * is deferred to later sections.
 */

import { eq, sql } from "drizzle-orm";
import { getDb } from "../db";
import { taskRuns, taskStepAttempts } from "../../drizzle/schema";
import type { TaskExecutionPlan, TaskBillingMetadata } from "./taskExecutionPlanner";
import { validatePlanVersion } from "./taskExecutionPlanner";
import type { ModelResolutionSnapshot } from "./modelResolver";
import type { ArtifactIntent, ExecutionRoute } from "./artifactRouter";

// ── Create task run ──────────────────────────────────────────────────

export interface CreateTaskRunInput {
  userId: number;
  tenantId?: string;
  plan: TaskExecutionPlan;
  sourceType: string;
  skillSlug?: string;
  conversationId?: number;
  /** Section 04: artifact routing metadata */
  artifactIntent?: ArtifactIntent;
  executionRoute?: ExecutionRoute;
  routeReason?: string;
}

export async function createTaskRun(input: CreateTaskRunInput): Promise<{ id: number }> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const [row] = await db
    .insert(taskRuns)
    .values({
      userId: input.userId,
      tenantId: input.tenantId,
      taskType: input.plan.taskType,
      sourceType: input.sourceType,
      planJson: input.plan,
      skillSlug: input.skillSlug,
      conversationId: input.conversationId,
      artifactIntent: input.artifactIntent,
      executionRoute: input.executionRoute,
      routeReason: input.routeReason,
    })
    .returning({ id: taskRuns.id });

  return row;
}

// ── Update task run status ───────────────────────────────────────────

export async function updateTaskRunStatus(
  taskRunId: number,
  status: "running" | "completed" | "failed" | "cancelled",
  errorMessage?: string,
): Promise<void> {
  const db = await getDb();
  if (!db) return;

  const updates: Record<string, unknown> = {
    status,
    updatedAt: new Date(),
  };
  if (status === "completed" || status === "failed" || status === "cancelled") {
    updates.completedAt = new Date();
  }
  if (errorMessage) {
    updates.errorMessage = errorMessage;
  }

  await db.update(taskRuns).set(updates).where(eq(taskRuns.id, taskRunId));
}

// ── Create step attempt ──────────────────────────────────────────────

export interface CreateStepAttemptInput {
  taskRunId: number;
  attemptIndex: number;
  snapshot: ModelResolutionSnapshot;
  strategy: string;
}

export async function createStepAttempt(input: CreateStepAttemptInput): Promise<{ id: number }> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const [row] = await db
    .insert(taskStepAttempts)
    .values({
      taskRunId: input.taskRunId,
      attemptIndex: input.attemptIndex,
      resolvedModelSnapshot: input.snapshot,
      effectiveModel: input.snapshot.modelId,
      provider: input.snapshot.providerName,
      strategy: input.strategy,
      status: "running",
      fallbackReason: input.snapshot.fallbackReason,
    })
    .returning({ id: taskStepAttempts.id });

  return row;
}

// ── Complete step attempt ────────────────────────────────────────────

export interface CompleteStepAttemptInput {
  stepAttemptId: number;
  inputTokens: number;
  outputTokens: number;
  creditsUsed: number;
  costUsd: string;
  durationMs: number;
  status: "completed" | "failed";
  errorMessage?: string;
}

export async function completeStepAttempt(input: CompleteStepAttemptInput): Promise<void> {
  const db = await getDb();
  if (!db) return;

  await db
    .update(taskStepAttempts)
    .set({
      inputTokens: input.inputTokens,
      outputTokens: input.outputTokens,
      creditsUsed: input.creditsUsed,
      costUsd: input.costUsd,
      durationMs: input.durationMs,
      status: input.status,
      errorMessage: input.errorMessage,
    })
    .where(eq(taskStepAttempts.id, input.stepAttemptId));

  // Accumulate credits on the parent task run
  if (input.creditsUsed > 0) {
    await db
      .update(taskRuns)
      .set({
        totalCreditsUsed: sql`${taskRuns.totalCreditsUsed} + ${input.creditsUsed}`,
        updatedAt: new Date(),
      })
      .where(
        eq(
          taskRuns.id,
          db
            .select({ taskRunId: taskStepAttempts.taskRunId })
            .from(taskStepAttempts)
            .where(eq(taskStepAttempts.id, input.stepAttemptId)),
        ),
      );
  }
}

// ── Load plan with validation ────────────────────────────────────────

export async function loadValidatedPlan(
  taskRunId: number,
): Promise<TaskExecutionPlan | null> {
  const db = await getDb();
  if (!db) return null;

  const [row] = await db
    .select({ planJson: taskRuns.planJson })
    .from(taskRuns)
    .where(eq(taskRuns.id, taskRunId));

  if (!row) return null;
  if (!validatePlanVersion(row.planJson)) return null;

  return row.planJson as TaskExecutionPlan;
}

// ── Link artifact to task run (Section 04) ───────────────────────────

export async function linkArtifactToTaskRun(
  taskRunId: number,
  artifact: { presentationDeckId?: number; artifactMessageId?: number },
): Promise<void> {
  const hasDeckId = artifact.presentationDeckId != null;
  const hasMsgId = artifact.artifactMessageId != null;
  if (!hasDeckId && !hasMsgId) return;

  const db = await getDb();
  if (!db) return;

  const updates: Record<string, unknown> = { updatedAt: new Date() };
  if (hasDeckId) updates.presentationDeckId = artifact.presentationDeckId;
  if (hasMsgId) updates.artifactMessageId = artifact.artifactMessageId;

  await db.update(taskRuns).set(updates).where(eq(taskRuns.id, taskRunId));
}

// ── Build billing metadata from task context ─────────────────────────

export function buildBillingMetadata(
  taskRunId: number,
  plan: TaskExecutionPlan,
  snapshot: ModelResolutionSnapshot,
  sourceType: string,
): TaskBillingMetadata {
  return {
    taskRunId,
    strategy: plan.strategy,
    effectiveModel: snapshot.modelId,
    provider: snapshot.providerName,
    attemptIndex: snapshot.attemptIndex,
    sourceType,
    taskType: plan.taskType,
  };
}
