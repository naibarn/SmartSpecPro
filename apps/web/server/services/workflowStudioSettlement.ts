import { and, eq, sql } from "drizzle-orm";

import {
  workerJobAttempts,
  workerJobs,
  workflowStudioCheckpoints,
  workflowStudioNodeAttempts,
  workflowStudioNodeRuns,
  workflowStudioRuns,
} from "../../drizzle/schema";
import { getDb } from "../db";
import {
  buildFeature195NodeAttemptJob,
  stableWorkflowDigest,
  type WorkflowRun,
} from "./workflowCompilerRuntimeContracts";
import type { PinnedWorkflowRunPlan } from "./workflowStudioRuntime";
import { registerJobSettlementHook } from "./jobSettlementHooks";

export class WorkflowSettlementError extends Error {
  constructor(readonly code: string) {
    super(code);
    this.name = "WorkflowSettlementError";
  }
}

function readPinnedPlan(
  run: typeof workflowStudioRuns.$inferSelect
): PinnedWorkflowRunPlan {
  if (!run.executionPlanJson || !run.planHash)
    throw new WorkflowSettlementError("WORKFLOW_PLAN_LOCK_MISSING");
  const snapshot = run.executionPlanJson as unknown as PinnedWorkflowRunPlan;
  if (
    stableWorkflowDigest(snapshot) !== run.planHash ||
    snapshot.mode !== run.mode ||
    snapshot.inputFingerprint !== run.inputFingerprint ||
    stableWorkflowDigest(snapshot.selectedNodeIds) !==
      stableWorkflowDigest(run.selectedNodeIdsJson) ||
    snapshot.targetNodeId !== (run.targetNodeId ?? undefined) ||
    snapshot.checkpointId !== (run.checkpointId ?? undefined)
  )
    throw new WorkflowSettlementError("WORKFLOW_PLAN_LOCK_MISMATCH");
  return snapshot;
}

/** Dispatches durable ready rows through the single Feature 195 job gateway. */
export async function dispatchReadyWorkflowNodes(
  runId: string,
  tenantId: string
): Promise<string[]> {
  const [
    { createControlPlaneJob },
    { defaultJobExecutorRegistry },
    { isWorkflowNodeTaskDispatcherConfigured },
  ] = await Promise.all([
    import("./jobControlPlaneGateway"),
    import("./jobExecutorRegistry"),
    import("./workflowNodeTaskExecutor"),
  ]);
  const db = getDb();
  const [run] = await db
    .select()
    .from(workflowStudioRuns)
    .where(
      and(
        eq(workflowStudioRuns.id, runId),
        eq(workflowStudioRuns.tenantId, tenantId)
      )
    )
    .limit(1);
  if (!run || ["failed", "cancelled", "canceled"].includes(run.status))
    throw new WorkflowSettlementError("WORKFLOW_RUN_TERMINAL");
  const snapshot = readPinnedPlan(run);
  const plan = snapshot.workflowPlan;
  if (!isWorkflowNodeTaskDispatcherConfigured())
    throw new WorkflowSettlementError("WORKFLOW_NODE_DISPATCHER_UNAVAILABLE");
  const nodeRows = await db
    .select()
    .from(workflowStudioNodeRuns)
    .where(
      and(
        eq(workflowStudioNodeRuns.runId, run.id),
        eq(workflowStudioNodeRuns.tenantId, run.tenantId)
      )
    );
  const nodeById = new Map(nodeRows.map(row => [row.nodeId, row]));
  const createdJobIds: string[] = [];
  const workflowRun = {
    workflowRunId: run.id,
    workflowId: plan.workflowId,
    planId: plan.planId,
    activationContext: run.idempotencyKey,
    inputSnapshotRef: `workflow-input:${run.inputFingerprint}`,
    status: "running",
  } satisfies WorkflowRun;

  for (const nodeRun of nodeRows.filter(
    row =>
      (row.status === "ready" || row.status === "dispatching") &&
      run.selectedNodeIdsJson.includes(row.nodeId)
  )) {
    const dependencies =
      plan.dependencies.find(item => item.nodeId === nodeRun.nodeId)
        ?.dependsOn ?? [];
    const parentRows = dependencies.map(nodeId => nodeById.get(nodeId));
    if (
      parentRows.some(
        parent =>
          !parent ||
          parent.status !== "completed" ||
          parent.outputArtifactRefsJson.length === 0
      )
    )
      continue;
    const inputArtifactRefs =
      dependencies.length === 0
        ? [`workflow-input:${run.inputFingerprint}`]
        : parentRows.flatMap(parent => parent!.outputArtifactRefsJson);
    if (nodeRun.status === "ready") {
      const [claimed] = await db
        .update(workflowStudioNodeRuns)
        .set({
          status: "dispatching",
          inputArtifactRefsJson: inputArtifactRefs,
          revision: nodeRun.revision + 1,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(workflowStudioNodeRuns.id, nodeRun.id),
            eq(workflowStudioNodeRuns.tenantId, run.tenantId),
            eq(workflowStudioNodeRuns.runId, run.id),
            eq(workflowStudioNodeRuns.status, "ready")
          )
        )
        .returning({ id: workflowStudioNodeRuns.id });
      if (!claimed) continue;
    }
    const priorAttempts = await db
      .select()
      .from(workflowStudioNodeAttempts)
      .where(
        and(
          eq(workflowStudioNodeAttempts.nodeRunId, nodeRun.id),
          eq(workflowStudioNodeAttempts.tenantId, run.tenantId)
        )
      );
    const attemptNumber =
      Math.max(0, ...priorAttempts.map(attempt => attempt.attemptNumber)) + 1;
    const attemptId = `${run.id}:${nodeRun.nodeId}:attempt-${attemptNumber}`;
    if (
      !plan.nodes.some(item => item.nodeId === nodeRun.nodeId) ||
      !defaultJobExecutorRegistry.has("workflow.node.execute", "feature-186-v1")
    )
      throw new WorkflowSettlementError("WORKFLOW_NODE_EXECUTOR_UNAVAILABLE");
    const jobDefinition = buildFeature195NodeAttemptJob({
      tenantId: run.tenantId,
      actorId: run.actorUserId,
      plan,
      run: workflowRun,
      nodeRun: {
        nodeRunId: nodeRun.id,
        workflowRunId: run.id,
        nodeId: nodeRun.nodeId,
        status: "ready",
      },
      attempt: {
        attemptId,
        nodeRunId: nodeRun.id,
        attemptNumber,
        inputSnapshotRef: `workflow-input:${stableWorkflowDigest({ fingerprint: run.inputFingerprint, inputArtifactRefs })}`,
      },
    });
    jobDefinition.input.inputArtifactRefs = inputArtifactRefs;
    const job = await createControlPlaneJob({
      context: {
        tenantId: run.tenantId,
        actorType: "user",
        actorId: run.actorUserId,
        authorizationScope: "workflow-studio.run",
        correlationId: `${run.id}:${nodeRun.id}`,
        idempotencyKey: jobDefinition.idempotencyKey,
      },
      definition: jobDefinition,
      executorRegistry: defaultJobExecutorRegistry,
      createOptions: {
        admissionMode: "durable_queue",
        runtimeType: "node_job_worker",
      },
    });
    await db
      .insert(workflowStudioNodeAttempts)
      .values({
        tenantId: run.tenantId,
        runId: run.id,
        nodeRunId: nodeRun.id,
        attemptNumber,
        idempotencyKey: jobDefinition.idempotencyKey,
        workerJobId: job.jobId,
        status: "admitted",
      })
      .onConflictDoNothing();
    await db
      .update(workflowStudioNodeRuns)
      .set({
        status: "admitted",
        revision: nodeRun.revision + 1,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(workflowStudioNodeRuns.id, nodeRun.id),
          eq(workflowStudioNodeRuns.tenantId, run.tenantId),
          eq(workflowStudioNodeRuns.runId, run.id),
          eq(workflowStudioNodeRuns.status, "dispatching")
        )
      );
    await db
      .update(workflowStudioRuns)
      .set({
        canonicalJobRefsJson: sql`"canonicalJobRefsJson" || CASE WHEN "canonicalJobRefsJson" ? ${job.jobId} THEN '[]'::jsonb ELSE jsonb_build_array(${job.jobId}) END`,
        updatedAt: new Date(),
      })
      .where(eq(workflowStudioRuns.id, run.id));
    createdJobIds.push(job.jobId);
  }
  return createdJobIds;
}

/**
 * Projects canonical Feature 195 terminal truth into Spec 215 logical state.
 * Call only after the physical job has settled; duplicate calls are harmless.
 */
export async function settleWorkflowNodeJob(jobId: string): Promise<{
  settled: boolean;
  readyNodeIds: string[];
}> {
  const db = getDb();
  return db.transaction(async tx => {
    const [job] = await tx
      .select()
      .from(workerJobs)
      .where(eq(workerJobs.id, jobId))
      .limit(1)
      .for("update");
    if (!job || job.jobType !== "workflow.node.execute")
      throw new WorkflowSettlementError("WORKFLOW_JOB_NOT_FOUND");
    if (job.status !== "succeeded")
      throw new WorkflowSettlementError("WORKFLOW_JOB_NOT_SUCCEEDED");

    const [logicalAttempt] = await tx
      .select()
      .from(workflowStudioNodeAttempts)
      .where(eq(workflowStudioNodeAttempts.workerJobId, job.id))
      .limit(1)
      .for("update");
    if (!logicalAttempt)
      throw new WorkflowSettlementError("WORKFLOW_ATTEMPT_NOT_FOUND");
    const payloadRunId =
      typeof job.inputJson.workflowRunId === "string"
        ? job.inputJson.workflowRunId
        : "";
    const [physicalAttempt] = await tx
      .select()
      .from(workerJobAttempts)
      .where(
        and(
          eq(workerJobAttempts.workerJobId, job.id),
          eq(workerJobAttempts.attempt, job.attempt)
        )
      )
      .limit(1);
    if (
      !physicalAttempt ||
      physicalAttempt.leaseGeneration !== job.fencingVersion
    )
      throw new WorkflowSettlementError("WORKFLOW_FENCE_MISMATCH");
    if (
      logicalAttempt.workerAttemptId &&
      logicalAttempt.workerAttemptId !== physicalAttempt.id
    )
      throw new WorkflowSettlementError("WORKFLOW_ATTEMPT_FENCE_CHANGED");
    if (logicalAttempt.status === "succeeded")
      return { settled: false, readyNodeIds: [] };
    if (
      logicalAttempt.tenantId !== job.tenantId ||
      logicalAttempt.runId !== payloadRunId ||
      (job.workflowRunId && job.workflowRunId !== payloadRunId)
    )
      throw new WorkflowSettlementError("WORKFLOW_ATTEMPT_SCOPE_MISMATCH");

    const [run] = await tx
      .select()
      .from(workflowStudioRuns)
      .where(
        and(
          eq(workflowStudioRuns.id, logicalAttempt.runId),
          eq(workflowStudioRuns.tenantId, job.tenantId)
        )
      )
      .limit(1)
      .for("update");
    const [nodeRun] = await tx
      .select()
      .from(workflowStudioNodeRuns)
      .where(
        and(
          eq(workflowStudioNodeRuns.id, logicalAttempt.nodeRunId),
          eq(workflowStudioNodeRuns.runId, logicalAttempt.runId),
          eq(workflowStudioNodeRuns.tenantId, job.tenantId)
        )
      )
      .limit(1)
      .for("update");
    if (!run || !nodeRun)
      throw new WorkflowSettlementError("WORKFLOW_LOGICAL_STATE_MISSING");
    if (["failed", "cancelled", "canceled"].includes(run.status))
      throw new WorkflowSettlementError("WORKFLOW_RUN_TERMINAL");
    if (!run.selectedNodeIdsJson.includes(nodeRun.nodeId))
      throw new WorkflowSettlementError("WORKFLOW_PLAN_LOCK_MISSING");
    const snapshot = readPinnedPlan(run);
    const plan = snapshot.workflowPlan;
    if (plan.planId !== String(job.inputJson.planId))
      throw new WorkflowSettlementError("WORKFLOW_PLAN_LOCK_MISMATCH");
    if (!job.resultRef)
      throw new WorkflowSettlementError("WORKFLOW_OUTPUT_REFERENCE_REQUIRED");
    const outputDigest =
      typeof job.outputJson?.outputDigest === "string"
        ? job.outputJson.outputDigest
        : "";
    if (!/^[a-f0-9]{64}$/i.test(outputDigest))
      throw new WorkflowSettlementError("WORKFLOW_OUTPUT_DIGEST_REQUIRED");

    const now = new Date();
    await tx
      .update(workflowStudioNodeAttempts)
      .set({
        workerAttemptId: physicalAttempt.id,
        leaseGeneration: physicalAttempt.leaseGeneration,
        status: "succeeded",
        resultRef: job.resultRef,
        resultDigest: outputDigest,
        finishedAt: now,
      })
      .where(eq(workflowStudioNodeAttempts.id, logicalAttempt.id));
    await tx
      .update(workflowStudioNodeRuns)
      .set({
        status: "completed",
        revision: nodeRun.revision + 1,
        outputArtifactRefsJson: [job.resultRef],
        outputDigest,
        selectedPort:
          typeof job.outputJson?.selectedPort === "string"
            ? job.outputJson.selectedPort
            : null,
        updatedAt: now,
      })
      .where(eq(workflowStudioNodeRuns.id, nodeRun.id));

    const allNodes = await tx
      .select()
      .from(workflowStudioNodeRuns)
      .where(
        and(
          eq(workflowStudioNodeRuns.runId, run.id),
          eq(workflowStudioNodeRuns.tenantId, run.tenantId)
        )
      );
    const completed = new Set(
      allNodes.filter(row => row.status === "completed").map(row => row.nodeId)
    );
    completed.add(nodeRun.nodeId);
    const completedNodeIds = [...completed].sort();
    const artifactRefs = allNodes
      .filter(row => completed.has(row.nodeId))
      .flatMap(row => row.outputArtifactRefsJson)
      .sort();
    const artifactRefsByNode = allNodes
      .filter(row => completed.has(row.nodeId))
      .map(row => ({
        nodeId: row.nodeId,
        refs: [...row.outputArtifactRefsJson].sort(),
        digest: row.outputDigest,
      }))
      .sort((left, right) => left.nodeId.localeCompare(right.nodeId));
    if (artifactRefsByNode.some(row => !row.digest))
      throw new WorkflowSettlementError("WORKFLOW_OUTPUT_DIGEST_REQUIRED");
    const checkpointDigest = stableWorkflowDigest({
      runId: run.id,
      planHash: run.planHash,
      completedNodeIds,
      artifactRefsByNode,
    });
    let [checkpoint] = await tx
      .select()
      .from(workflowStudioCheckpoints)
      .where(
        and(
          eq(workflowStudioCheckpoints.runId, run.id),
          eq(workflowStudioCheckpoints.tenantId, run.tenantId),
          eq(workflowStudioCheckpoints.digest, checkpointDigest)
        )
      )
      .limit(1);
    if (!checkpoint) {
      [checkpoint] = await tx
        .insert(workflowStudioCheckpoints)
        .values({
          tenantId: run.tenantId,
          runId: run.id,
          definitionId: run.definitionId,
          versionId: run.versionId,
          contentHash: run.contentHash,
          inputFingerprint: run.inputFingerprint,
          completedNodeIdsJson: completedNodeIds,
          outputJson: {
            planHash: run.planHash,
            artifactRefsByNode,
          },
          artifactRefsJson: artifactRefs,
          digest: checkpointDigest,
          status: "ready",
        })
        .returning();
    }
    if (checkpoint) {
      await tx
        .update(workflowStudioRuns)
        .set({ checkpointId: checkpoint.id, updatedAt: now })
        .where(eq(workflowStudioRuns.id, run.id));
    }
    const readyNodeIds = plan.dependencies
      .filter(
        item =>
          run.selectedNodeIdsJson.includes(item.nodeId) &&
          !completed.has(item.nodeId)
      )
      .filter(
        item =>
          item.dependsOn.length > 0 &&
          item.dependsOn.every(parent => completed.has(parent))
      )
      .map(item => item.nodeId);
    for (const readyNodeId of readyNodeIds) {
      const successor = allNodes.find(row => row.nodeId === readyNodeId);
      await tx
        .update(workflowStudioNodeRuns)
        .set({
          status: "ready",
          revision: (successor?.revision ?? 0) + 1,
          updatedAt: now,
        })
        .where(
          and(
            eq(workflowStudioNodeRuns.runId, run.id),
            eq(workflowStudioNodeRuns.tenantId, run.tenantId),
            eq(workflowStudioNodeRuns.nodeId, readyNodeId),
            eq(workflowStudioNodeRuns.status, "pending")
          )
        );
    }
    const remaining = allNodes.filter(
      row =>
        row.id !== nodeRun.id &&
        !["completed", "skipped", "cancelled"].includes(row.status)
    );
    if (remaining.length === 0) {
      await tx
        .update(workflowStudioRuns)
        .set({
          status: "completed",
          finishedAt: now,
          updatedAt: now,
          runRevision: run.runRevision + 1,
        })
        .where(eq(workflowStudioRuns.id, run.id));
    }
    return { settled: true, readyNodeIds };
  });
}

async function settleWorkflowNodeFailure(jobId: string): Promise<void> {
  const db = getDb();
  await db.transaction(async tx => {
    const [job] = await tx.select().from(workerJobs).where(eq(workerJobs.id, jobId)).limit(1).for("update");
    if (!job || job.jobType !== "workflow.node.execute")
      throw new WorkflowSettlementError("WORKFLOW_JOB_NOT_FOUND");
    if (!["retry_scheduled", "failed", "cancelled", "expired"].includes(job.status))
      throw new WorkflowSettlementError("WORKFLOW_JOB_NOT_FAILED");
    const [attempt] = await tx.select().from(workflowStudioNodeAttempts)
      .where(eq(workflowStudioNodeAttempts.workerJobId, job.id)).limit(1).for("update");
    const runId = typeof job.inputJson.workflowRunId === "string" ? job.inputJson.workflowRunId : "";
    if (!attempt || attempt.tenantId !== job.tenantId || attempt.runId !== runId)
      throw new WorkflowSettlementError("WORKFLOW_ATTEMPT_SCOPE_MISMATCH");
    const [run] = await tx.select().from(workflowStudioRuns)
      .where(and(eq(workflowStudioRuns.id, runId), eq(workflowStudioRuns.tenantId, job.tenantId))).limit(1).for("update");
    const [nodeRun] = await tx.select().from(workflowStudioNodeRuns)
      .where(and(eq(workflowStudioNodeRuns.id, attempt.nodeRunId), eq(workflowStudioNodeRuns.runId, runId), eq(workflowStudioNodeRuns.tenantId, job.tenantId))).limit(1).for("update");
    if (!run || !nodeRun) throw new WorkflowSettlementError("WORKFLOW_LOGICAL_STATE_MISSING");
    if (["failed", "cancelled", "canceled", "completed"].includes(run.status)) return;
    if (job.status === "retry_scheduled" && attempt.status === "retry_scheduled" && nodeRun.status === "waiting") return;
    if (["failed", "cancelled", "expired"].includes(attempt.status) && ["failed", "cancelled"].includes(nodeRun.status)) return;
    const now = new Date();
    if (job.status === "retry_scheduled") {
      await tx.update(workflowStudioNodeAttempts).set({
        status: "retry_scheduled",
        workerAttemptId: null,
        leaseGeneration: null,
        errorJson: { code: job.errorCode ?? "RETRY_SCHEDULED" },
        finishedAt: null,
      }).where(eq(workflowStudioNodeAttempts.id, attempt.id));
      await tx.update(workflowStudioNodeRuns).set({ status: "waiting", revision: nodeRun.revision + 1, errorJson: null, updatedAt: now })
        .where(eq(workflowStudioNodeRuns.id, nodeRun.id));
      return;
    }
    const [physicalAttempt] = await tx.select().from(workerJobAttempts)
      .where(and(eq(workerJobAttempts.workerJobId, job.id), eq(workerJobAttempts.attempt, job.attempt))).limit(1);
    const cancelled = job.status === "cancelled";
    await tx.update(workflowStudioNodeAttempts).set({
      ...(physicalAttempt ? { workerAttemptId: physicalAttempt.id, leaseGeneration: physicalAttempt.leaseGeneration } : {}),
      status: job.status,
      errorJson: { code: job.errorCode ?? job.status },
      finishedAt: now,
    }).where(eq(workflowStudioNodeAttempts.id, attempt.id));
    await tx.update(workflowStudioNodeRuns).set({
      status: cancelled ? "cancelled" : "failed",
      revision: nodeRun.revision + 1,
      errorJson: { code: job.errorCode ?? job.status },
      updatedAt: now,
    }).where(eq(workflowStudioNodeRuns.id, nodeRun.id));
    await tx.update(workflowStudioRuns).set({
      status: cancelled ? "cancelled" : "failed",
      errorJson: { code: job.errorCode ?? job.status },
      finishedAt: now,
      runRevision: run.runRevision + 1,
      updatedAt: now,
    }).where(eq(workflowStudioRuns.id, run.id));
  });
}

registerJobSettlementHook("workflow.node.execute", async jobId => {
  const [job] = await getDb()
    .select({ inputJson: workerJobs.inputJson, status: workerJobs.status, tenantId: workerJobs.tenantId })
    .from(workerJobs)
    .where(eq(workerJobs.id, jobId))
    .limit(1);
  if (job && job.status !== "succeeded") {
    await settleWorkflowNodeFailure(jobId);
    return;
  }
  await settleWorkflowNodeJob(jobId);
  const workflowRunId =
    typeof job?.inputJson.workflowRunId === "string"
      ? job.inputJson.workflowRunId
      : "";
  if (workflowRunId && job?.tenantId)
    await dispatchReadyWorkflowNodes(workflowRunId, job.tenantId);
});
