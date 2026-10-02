import Ajv2020 from "ajv/dist/2020.js";

import {
  buildFeature195NodeAttemptJob,
  compileWorkflowDefinition,
  createNodeRun,
  createWorkflowRun,
  stableWorkflowDigest,
  type ExecutionPlan,
  type WorkflowDefinitionV2,
} from "./workflowCompilerRuntimeContracts";
import type { JobDefinition } from "./jobControlPlaneTypes";

const workflowInputSchemaValidator = new Ajv2020({ allErrors: true, strict: false });

export const WORKFLOW_RUN_MODES = [
  "full",
  "run_until",
  "run_from",
  "run_node",
  "run_subflow",
] as const;
export type WorkflowRunMode = (typeof WORKFLOW_RUN_MODES)[number];

export class WorkflowRuntimeError extends Error {
  readonly code:
    | "INVALID_RUN_MODE"
    | "TARGET_NODE_REQUIRED"
    | "TARGET_NODE_INVALID"
    | "CHECKPOINT_REQUIRED"
    | "DEFINITION_INVALID"
    | "INPUT_INVALID";

  constructor(code: WorkflowRuntimeError["code"], message = code) {
    super(message);
    this.name = "WorkflowRuntimeError";
    this.code = code;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export type NormalizedWorkflowRunRequest = {
  mode: WorkflowRunMode;
  input: Record<string, unknown>;
  targetNodeId?: string;
  checkpointId?: string;
};

export function normalizeWorkflowRunRequest(input: {
  mode?: string;
  input: Record<string, unknown>;
  targetNodeId?: string;
  checkpointId?: string;
}): NormalizedWorkflowRunRequest {
  if (!WORKFLOW_RUN_MODES.includes(input.mode as WorkflowRunMode))
    throw new WorkflowRuntimeError("INVALID_RUN_MODE");
  if (!input.input || typeof input.input !== "object" || Array.isArray(input.input))
    throw new WorkflowRuntimeError("INPUT_INVALID");
  const mode = input.mode as WorkflowRunMode;
  if (mode !== "full" && !input.targetNodeId?.trim())
    throw new WorkflowRuntimeError("TARGET_NODE_REQUIRED");
  if (mode === "run_from" && !input.checkpointId?.trim())
    throw new WorkflowRuntimeError("CHECKPOINT_REQUIRED");
  return {
    mode,
    input: structuredClone(input.input),
    ...(input.targetNodeId?.trim() ? { targetNodeId: input.targetNodeId.trim() } : {}),
    ...(input.checkpointId?.trim() ? { checkpointId: input.checkpointId.trim() } : {}),
  };
}

export function workflowControlActionBlocker(
  action: "approve" | "reject" | "submit_input" | "retry" | "cancel" | "resume"
): string | undefined {
  if (action === "cancel") return undefined;
  if (action === "approve" || action === "reject" || action === "submit_input")
    return "WORKFLOW_HUMAN_ATTENTION_BRIDGE_UNAVAILABLE";
  return "WORKFLOW_NODE_SCOPED_RETRY_UNAVAILABLE";
}

export type WorkflowExecutionPlan = {
  contractVersion: "spec-215-v3";
  planId: string;
  jobType: "workflow.node.execute";
  executionClass: "long";
  idempotencyKey: string;
  workflowPlan: ExecutionPlan;
  jobs: JobDefinition[];
  initialJobs: JobDefinition[];
  input: {
    tenantId: string;
    actorId: number;
    workflowRunId: string;
    definitionId: string;
    versionId: string;
    contentHash: string;
    mode: WorkflowRunMode;
    targetNodeId?: string;
    checkpointId?: string;
    completedNodeIds?: string[];
    input: Record<string, unknown>;
    selectedNodeIds: string[];
  };
  retryPolicy: JobDefinition["retryPolicy"];
  timeoutPolicy: JobDefinition["timeoutPolicy"];
  requiredCapabilities: Record<string, unknown>;
};

export type PinnedWorkflowRunPlan = {
  workflowPlan: ExecutionPlan;
  selectedNodeIds: string[];
  nodeInputArtifactRefs: Record<string, string[]>;
  mode: WorkflowRunMode;
  targetNodeId?: string;
  checkpointId?: string;
  inputFingerprint: string;
};

export function workflowRunIntentMatches(
  existing: {
    contentHash: string;
    versionId: string;
    inputFingerprint: string;
    mode: string;
    targetNodeId: string | null;
    checkpointId: string | null;
    selectedNodeIdsJson: string[];
    planHash: string | null;
  },
  requested: {
    contentHash: string;
    versionId: string;
    inputFingerprint: string;
    mode: string;
    targetNodeId?: string;
    checkpointId?: string;
    selectedNodeIds: string[];
    planHash: string;
  }
): boolean {
  return existing.contentHash === requested.contentHash &&
    existing.versionId === requested.versionId &&
    existing.inputFingerprint === requested.inputFingerprint &&
    existing.mode === requested.mode &&
    (existing.targetNodeId ?? undefined) === requested.targetNodeId &&
    (existing.checkpointId ?? undefined) === requested.checkpointId &&
    stableWorkflowDigest(existing.selectedNodeIdsJson) === stableWorkflowDigest(requested.selectedNodeIds) &&
    existing.planHash === requested.planHash;
}

export function pinWorkflowRunPlan(input: {
  plan: WorkflowExecutionPlan;
  inputFingerprint: string;
}): PinnedWorkflowRunPlan {
  return {
    workflowPlan: input.plan.workflowPlan,
    selectedNodeIds: [...input.plan.input.selectedNodeIds],
    nodeInputArtifactRefs: Object.fromEntries(input.plan.jobs.map(job => [
      String(job.input.nodeId),
      Array.isArray(job.input.inputArtifactRefs)
        ? [...job.input.inputArtifactRefs].filter((ref): ref is string => typeof ref === "string")
        : [],
    ])),
    mode: input.plan.input.mode,
    ...(input.plan.input.targetNodeId ? { targetNodeId: input.plan.input.targetNodeId } : {}),
    ...(input.plan.input.checkpointId ? { checkpointId: input.plan.input.checkpointId } : {}),
    inputFingerprint: input.inputFingerprint,
  };
}

function fingerprint(value: unknown): string {
  return stableWorkflowDigest(value);
}

export function workflowInputFingerprint(input: Record<string, unknown>): string {
  return fingerprint(input);
}

function resolveWorkflowInputSnapshot(
  definitions: WorkflowDefinitionV2["interface"]["inputs"],
  supplied: Record<string, unknown>
): Record<string, unknown> {
  const resolved: Record<string, unknown> = {};
  for (const [inputId, definition] of Object.entries(definitions)) {
    let value: unknown;
    if (Object.hasOwn(supplied, inputId)) value = supplied[inputId];
    else if (Object.hasOwn(definition, "default")) value = structuredClone(definition.default);
    else if (definition.required !== false)
      throw new WorkflowRuntimeError("INPUT_INVALID", `WORKFLOW_INPUT_REQUIRED:${inputId}`);
    else continue;

    const validate = workflowInputSchemaValidator.compile(definition.schema);
    if (!validate(value))
      throw new WorkflowRuntimeError("INPUT_INVALID", `WORKFLOW_INPUT_SCHEMA_INVALID:${inputId}`);
    resolved[inputId] = structuredClone(value);
  }
  if (Object.keys(supplied).some(inputId => !Object.hasOwn(definitions, inputId)))
    throw new WorkflowRuntimeError("INPUT_INVALID", "WORKFLOW_INPUT_UNKNOWN");
  return resolved;
}

function topologicalNodeIds(plan: ExecutionPlan): string[] {
  const dependencies = new Map(plan.dependencies.map(item => [item.nodeId, [...item.dependsOn]]));
  const ordered: string[] = [];
  const remaining = new Set(plan.nodes.map(node => node.nodeId));
  while (remaining.size) {
    const next = [...remaining].find(nodeId =>
      (dependencies.get(nodeId) ?? []).every(parent => ordered.includes(parent))
    );
    if (!next) throw new WorkflowRuntimeError("DEFINITION_INVALID", "WORKFLOW_CYCLE_DETECTED");
    ordered.push(next);
    remaining.delete(next);
  }
  return ordered;
}

function selectNodeIds(
  plan: ExecutionPlan,
  mode: WorkflowRunMode,
  targetNodeId?: string,
  completedNodeIds: ReadonlySet<string> = new Set()
): Set<string> {
  const ordered = topologicalNodeIds(plan);
  if (!targetNodeId || mode === "full") return new Set(ordered);
  const targetIndex = ordered.indexOf(targetNodeId);
  if (targetIndex < 0) throw new WorkflowRuntimeError("TARGET_NODE_INVALID");
  if (mode === "run_until") return new Set(ordered.slice(0, targetIndex + 1));
  if (mode === "run_node") return new Set([targetNodeId]);
  if (mode === "run_from") return new Set(ordered.slice(targetIndex).filter(nodeId => !completedNodeIds.has(nodeId)));
  const descendants = new Set<string>([targetNodeId]);
  let changed = true;
  while (changed) {
    changed = false;
    for (const item of plan.dependencies) {
      if (descendants.has(item.nodeId)) continue;
      if (item.dependsOn.some(parent => descendants.has(parent))) {
        descendants.add(item.nodeId);
        changed = true;
      }
    }
  }
  return descendants;
}

/** Returns selected nodes whose full predecessor set has committed outputs. */
export function getReadyWorkflowNodeIds(input: {
  plan: ExecutionPlan;
  selectedNodeIds: readonly string[];
  completedNodeIds: ReadonlySet<string>;
}): string[] {
  const selected = new Set(input.selectedNodeIds);
  return input.plan.dependencies
    .filter(item => selected.has(item.nodeId) && !input.completedNodeIds.has(item.nodeId))
    .filter(item => item.dependsOn.every(parent => input.completedNodeIds.has(parent)))
    .map(item => item.nodeId);
}

export function buildWorkflowExecutionPlan(input: {
  tenantId: string;
  actorId: number;
  runId: string;
  definitionId: string;
  versionId: string;
  contentHash: string;
  definition: WorkflowDefinitionV2;
  input: Record<string, unknown>;
  mode: WorkflowRunMode;
  targetNodeId?: string;
  checkpointId?: string;
  completedNodeIds?: string[];
  completedOutputRefs?: Record<string, string[]>;
  idempotencyKey: string;
}): WorkflowExecutionPlan {
  const request = normalizeWorkflowRunRequest(input);
  let workflowPlan: ExecutionPlan;
  try {
    workflowPlan = compileWorkflowDefinition(input.definition);
  } catch (error) {
    throw new WorkflowRuntimeError(
      "DEFINITION_INVALID",
      error instanceof Error ? error.message : "DEFINITION_INVALID"
    );
  }
  const resolvedInput = resolveWorkflowInputSnapshot(
    workflowPlan.interface.inputs,
    request.input
  );
  const nodeIds = new Set(workflowPlan.nodes.map(node => node.nodeId));
  if (request.targetNodeId && !nodeIds.has(request.targetNodeId))
    throw new WorkflowRuntimeError("TARGET_NODE_INVALID");
  const selectedNodeIds = selectNodeIds(
    workflowPlan,
    request.mode,
    request.targetNodeId,
    new Set(input.completedNodeIds ?? [])
  );
  if (!selectedNodeIds.size) throw new WorkflowRuntimeError("TARGET_NODE_INVALID");
  const generatedRun = createWorkflowRun(
    workflowPlan,
    input.runId,
    `workflow-input:${workflowInputFingerprint(resolvedInput)}`
  );
  const run = { ...generatedRun, workflowRunId: input.runId };
  const ordered = topologicalNodeIds(workflowPlan);
  const jobs = ordered
    .filter(nodeId => selectedNodeIds.has(nodeId))
    .map(nodeId => {
      const nodeRun = createNodeRun(run, nodeId);
      const dependencies = workflowPlan.dependencies.find(item => item.nodeId === nodeId)?.dependsOn ?? [];
      const inputArtifactRefs = dependencies.length
        ? dependencies.flatMap(parent => input.completedOutputRefs?.[parent] ?? [])
        : [`workflow-input:${workflowInputFingerprint(resolvedInput)}`];
      return buildFeature195NodeAttemptJob({
        tenantId: input.tenantId,
        actorId: input.actorId,
        plan: workflowPlan,
        run,
        nodeRun,
        attempt: {
          attemptId: `attempt-${stableWorkflowDigest({ runId: input.runId, nodeId, attemptNumber: 1 }).slice(0, 40)}`,
          nodeRunId: nodeRun.nodeRunId,
          attemptNumber: 1,
          inputSnapshotRef: `workflow-input:${stableWorkflowDigest({
            inputFingerprint: workflowInputFingerprint(resolvedInput),
            inputArtifactRefs,
          })}`,
          inputArtifactRefs,
        },
      });
    });
  const readyNodeIds = new Set(getReadyWorkflowNodeIds({
    plan: workflowPlan,
    selectedNodeIds: ordered.filter(nodeId => selectedNodeIds.has(nodeId)),
    completedNodeIds: new Set(input.completedNodeIds ?? []),
  }));
  const initialJobs = jobs.filter(job => readyNodeIds.has(String(job.input.nodeId)));
  const firstJob = jobs[0];
  return {
    contractVersion: "spec-215-v3",
    planId: workflowPlan.planId,
    jobType: "workflow.node.execute",
    executionClass: "long",
    idempotencyKey: `${input.idempotencyKey}:workflow`,
    workflowPlan,
    jobs,
    initialJobs,
    input: {
      tenantId: input.tenantId,
      actorId: input.actorId,
      workflowRunId: run.workflowRunId,
      definitionId: input.definitionId,
      versionId: input.versionId,
      contentHash: input.contentHash,
      mode: request.mode,
      ...(request.targetNodeId ? { targetNodeId: request.targetNodeId } : {}),
      ...(request.checkpointId ? { checkpointId: request.checkpointId } : {}),
      ...(input.completedNodeIds?.length ? { completedNodeIds: [...input.completedNodeIds] } : {}),
      input: resolvedInput,
      selectedNodeIds: ordered.filter(nodeId => selectedNodeIds.has(nodeId)),
    },
    retryPolicy: firstJob.retryPolicy,
    timeoutPolicy: firstJob.timeoutPolicy,
    requiredCapabilities: {
      workflow: workflowPlan.workflowId,
      nodeTypes: jobs.map(job => job.requiredCapabilities),
    },
  };
}
