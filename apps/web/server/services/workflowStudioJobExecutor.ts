import type { JobResult } from "./jobControlPlaneTypes";
import { createHash, randomUUID } from "node:crypto";
import { and, desc, eq } from "drizzle-orm";

import {
  workflowStudioCheckpoints,
  workflowStudioRunEvents,
  workflowStudioRuns,
} from "../../drizzle/schema";
import { getDb } from "../db";
import { invokeLLM } from "../_core/llm";
import { validateSsrfUrlWithRuntime } from "./ssrfValidator";

const BUILTIN_CAPABILITIES = new Set([
  "input",
  "form",
  "output",
  "result",
  "analysis",
  "transform",
  "condition",
  "switch",
  "approval",
  "human-approval",
  "file-transform",
]);

export function assertWorkflowStepCapability(input: {
  capability: string;
  config: Record<string, unknown>;
}): true {
  const capability = input.capability.trim().toLowerCase();
  if (BUILTIN_CAPABILITIES.has(capability) || input.config.executionMode === "passthrough") return true;
  if (capability === "llm" || capability === "prompt" || capability === "model") {
    if (typeof input.config.model !== "string" || !input.config.model.trim())
      throw new Error("WORKFLOW_LLM_MODEL_REQUIRED");
    if (typeof input.config.prompt !== "string" || !input.config.prompt.trim())
      throw new Error("WORKFLOW_LLM_PROMPT_REQUIRED");
    return true;
  }
  if (capability === "skill") {
    if (typeof input.config.skillId !== "string" || !input.config.skillId.trim())
      throw new Error("WORKFLOW_SKILL_REQUIRED");
    return true;
  }
  if (capability === "http") {
    if (typeof input.config.url !== "string" || !input.config.url.trim())
      throw new Error("WORKFLOW_HTTP_URL_REQUIRED");
    return true;
  }
  throw new Error("WORKFLOW_CAPABILITY_ADAPTER_REQUIRED");
}

function stringifyTemplateValue(value: unknown): string {
  if (typeof value === "string") return value;
  if (value === undefined || value === null) return "";
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function resolveTemplate(template: string, input: unknown): string {
  return template.replace(/{{\s*(?:input(?:\.([a-zA-Z0-9_.-]+))?|value)\s*}}/g, (_match, path?: string) => {
    if (!path) return stringifyTemplateValue(input);
    let value: unknown = input;
    for (const part of path.split(".")) {
      if (!value || typeof value !== "object") return "";
      value = (value as Record<string, unknown>)[part];
    }
    return stringifyTemplateValue(value);
  });
}

function readNestedValue(input: unknown, path: string): unknown {
  let value = input;
  for (const part of path.split(".")) {
    if (!value || typeof value !== "object") return undefined;
    value = (value as Record<string, unknown>)[part];
  }
  return value;
}

function compareCondition(input: unknown, config: Record<string, unknown>): boolean {
  const rawExpression = typeof config.expression === "string" ? config.expression : "{{input}}";
  const expression = resolveTemplate(rawExpression, input);
  const left = expression === stringifyTemplateValue(input) ? input : expression;
  const operator = typeof config.operator === "string" ? config.operator : "truthy";
  const right = config.rightValue;
  if (operator === "exists") return left !== undefined && left !== null && left !== "";
  if (operator === "truthy") return Boolean(left);
  if (operator === "contains") return String(left).includes(String(right ?? ""));
  if (operator === "not_equals") return String(left) !== String(right ?? "");
  return String(left) === String(right ?? "");
}

export function resolveWorkflowStepOutput(input: {
  nodeId: string;
  capability: string;
  input: Record<string, unknown>;
  config: Record<string, unknown>;
}): Record<string, unknown> {
  assertWorkflowStepCapability(input);
  const capability = input.capability.trim().toLowerCase();
  if (capability === "condition")
    return { value: input.input, selectedPort: compareCondition(input.input, input.config) ? "yes" : "no" };
  if (capability === "switch") {
    const cases = Array.isArray(input.config.cases) ? input.config.cases : [];
    const valuePath = typeof input.config.valuePath === "string" ? input.config.valuePath : "";
    const value = valuePath ? readNestedValue(input.input, valuePath) : input.input;
    const matched = cases.find((candidate) => {
      if (!candidate || typeof candidate !== "object") return false;
      const item = candidate as Record<string, unknown>;
      return String(value) === String(item.value ?? "");
    }) as Record<string, unknown> | undefined;
    return { value: input.input, selectedPort: String(matched?.name ?? "default") };
  }
  if (capability === "output" || capability === "result")
    return { ...input.input, outputNodeId: input.nodeId };
  if (capability === "analysis")
    return { summary: input.input, nodeId: input.nodeId };
  if (capability === "transform" || capability === "file-transform") {
    const operation = String(input.config.operation ?? "passthrough");
    if (operation === "pick" && typeof input.config.path === "string")
      return { value: readNestedValue(input.input, input.config.path), nodeId: input.nodeId };
    return { ...input.input, nodeId: input.nodeId };
  }
  return { ...input.input };
}

type WorkflowStepExecutionInput = {
  nodeId: string;
  capability: string;
  input: Record<string, unknown>;
  config: Record<string, unknown>;
  workflowRunId: string;
  tenantId: string;
  actorId: number;
  lease: { jobId: string; attemptId: string };
  reporter: {
    assertActive: (lease: { jobId: string; attemptId: string }) => Promise<void>;
    waitForExternal?: (lease: { jobId: string; attemptId: string }, input: { operationKey: string; resumeAfter: string }) => Promise<void>;
  };
  controlPlane?: unknown;
};

async function executeWorkflowStep(input: WorkflowStepExecutionInput): Promise<{ value: Record<string, unknown>; deferred?: boolean }> {
  const capability = input.capability.trim().toLowerCase();
  if (capability !== "llm" && capability !== "prompt" && capability !== "model" && capability !== "http" && capability !== "skill" && capability !== "human-approval") {
    return { value: resolveWorkflowStepOutput(input) };
  }
  assertWorkflowStepCapability(input);
  if (capability === "human-approval") {
    if (!input.reporter.waitForExternal) throw new Error("WORKFLOW_APPROVAL_RUNTIME_REQUIRED");
    await input.reporter.waitForExternal(input.lease, {
      operationKey: `workflow:${input.workflowRunId}:${input.nodeId}:approval`,
      resumeAfter: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
    });
    return { value: { ...input.input, approval: "waiting", nodeId: input.nodeId }, deferred: true };
  }
  if (capability === "llm" || capability === "prompt" || capability === "model") {
    const prompt = resolveTemplate(String(input.config.prompt), input.input);
    const response = await invokeLLM({
      model: String(input.config.model),
      messages: [{ role: "user", content: prompt }],
      maxTokens: Number(input.config.maxTokens ?? 1024),
    });
    const message = response.choices[0]?.message?.content;
    const text = Array.isArray(message)
      ? message.map(part => "text" in part ? part.text : "").join("")
      : String(message ?? "");
    const output: Record<string, unknown> = { text, output: text, usage: response.usage ?? {}, nodeId: input.nodeId };
    if (input.config.responseFormat === "json") {
      try { output.output = JSON.parse(text); } catch { throw new Error("WORKFLOW_LLM_JSON_INVALID"); }
    }
    return { value: output };
  }
  if (capability === "http") {
    const url = String(input.config.url);
    await validateSsrfUrlWithRuntime(url);
    const method = String(input.config.method ?? "POST").toUpperCase();
    const bodyTemplate = String(input.config.bodyTemplate ?? "{{input}}");
    const rendered = resolveTemplate(bodyTemplate, input.input);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), Math.min(120_000, Math.max(1_000, Number(input.config.timeoutSeconds ?? 30) * 1000)));
    try {
      const response = await fetch(url, {
        method,
        signal: controller.signal,
        headers: { "content-type": "application/json", ...(input.config.headers && typeof input.config.headers === "object" ? input.config.headers as Record<string, string> : {}) },
        ...(method === "GET" || method === "HEAD" ? {} : { body: rendered }),
      });
      const text = (await response.text()).slice(0, 1_000_000);
      let parsed: unknown = text;
      try { parsed = JSON.parse(text); } catch { /* keep text response */ }
      if (!response.ok) throw new Error(`WORKFLOW_HTTP_${response.status}`);
      return { value: { response: parsed, status: response.status, nodeId: input.nodeId } };
    } finally { clearTimeout(timer); }
  }
  const skillId = String(input.config.skillId);
  const { executeSkillJob } = await import("./skillJobExecutor");
  const result = await executeSkillJob({
    context: { tenantId: input.tenantId, requestedByUserId: input.actorId, input: {
      skillId,
      userId: input.actorId,
      tenantId: input.tenantId,
      params: { prompt: resolveTemplate(String(input.config.prompt ?? "{{input}}"), input.input), extraParams: input.config.skillInput && typeof input.config.skillInput === "object" ? input.config.skillInput : {}, runId: `${input.workflowRunId}:${input.nodeId}` },
      runId: `${input.workflowRunId}:${input.nodeId}`,
    } },
    lease: input.lease as any,
    reporter: input.reporter as any,
    controlPlane: input.controlPlane as any,
  });
  return { value: result.output ?? { result, nodeId: input.nodeId } };
}

export async function projectWorkflowStudioRun(input: {
  tenantId: string;
  runId: string;
  jobId: string;
  status: "completed" | "partial" | "failed";
  output?: Record<string, unknown>;
  error?: Record<string, unknown>;
  completedNodeIds?: string[];
}): Promise<void> {
  const db = getDb();
  const [run] = await db
    .select()
    .from(workflowStudioRuns)
    .where(
      and(
        eq(workflowStudioRuns.id, input.runId),
        eq(workflowStudioRuns.tenantId, input.tenantId)
      )
    )
    .limit(1);
  if (!run) return;
  const [lastEvent] = await db
    .select({ sequence: workflowStudioRunEvents.sequence })
    .from(workflowStudioRunEvents)
    .where(
      and(
        eq(workflowStudioRunEvents.runId, input.runId),
        eq(workflowStudioRunEvents.tenantId, input.tenantId)
      )
    )
    .orderBy(desc(workflowStudioRunEvents.sequence))
    .limit(1);
  const sequence = (lastEvent?.sequence ?? 0) + 1;
  const eventType =
    input.status === "failed"
      ? "FAILED"
      : input.status === "partial"
        ? "PARTIAL_STOP"
        : "COMPLETED";
  const checkpointId = input.status === "partial" ? randomUUID() : undefined;
  if (checkpointId) {
    const checkpointPayload = {
      runId: input.runId,
      versionId: run.versionId,
      contentHash: run.contentHash,
      inputFingerprint: run.inputFingerprint,
      completedNodeIds: input.completedNodeIds ?? [],
      output: input.output ?? {},
    };
    await db.insert(workflowStudioCheckpoints).values({
      id: checkpointId,
      tenantId: input.tenantId,
      runId: input.runId,
      definitionId: run.definitionId,
      versionId: run.versionId,
      contentHash: run.contentHash,
      inputFingerprint: run.inputFingerprint,
      completedNodeIdsJson: input.completedNodeIds ?? [],
      outputJson: input.output ?? {},
      artifactRefsJson: [],
      digest: createHash("sha256")
        .update(JSON.stringify(checkpointPayload), "utf8")
        .digest("hex"),
      status: "ready",
    });
  }
  await db
    .update(workflowStudioRuns)
    .set({
      status: input.status,
      ...(input.output ? { outputJson: input.output } : {}),
      ...(input.error ? { errorJson: input.error } : {}),
      ...(checkpointId ? { checkpointId } : {}),
      startedAt: run.startedAt ?? new Date(),
      finishedAt: input.status === "failed" ? null : new Date(),
      runRevision: run.runRevision + 1,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(workflowStudioRuns.id, input.runId),
        eq(workflowStudioRuns.tenantId, input.tenantId)
      )
    );
  await db
    .insert(workflowStudioRunEvents)
    .values({
      runId: input.runId,
      tenantId: input.tenantId,
      sequence,
      eventType,
      eventIdempotencyKey: `${eventType.toLowerCase()}:${input.jobId}`,
      payloadJson: {
        jobId: input.jobId,
        ...(input.output ? { output: input.output } : {}),
        ...(input.error ? { error: input.error } : {}),
      },
    })
    .onConflictDoNothing();
}

export async function executeWorkflowStudioJob(input: {
  context: { input: Record<string, unknown>; tenantId?: string; requestedByUserId?: number };
  lease: { jobId: string; attemptId: string };
  reporter: {
    assertActive: (lease: {
      jobId: string;
      attemptId: string;
    }) => Promise<void>;
    progress: (
      lease: { jobId: string; attemptId: string },
      update: { progress: number; stage: string; message: string }
    ) => Promise<void>;
    waitForExternal?: (lease: { jobId: string; attemptId: string }, input: { operationKey: string; resumeAfter: string }) => Promise<void>;
  };
  controlPlane?: unknown;
}): Promise<JobResult> {
  const payload = input.context.input;
  const steps = Array.isArray(payload.steps) ? payload.steps : [];
  if (!payload.workflowRunId || steps.length === 0)
    throw new Error("WORKFLOW_EXECUTION_PLAN_INVALID");
  let value = (
    payload.input &&
    typeof payload.input === "object" &&
    !Array.isArray(payload.input)
      ? payload.input
      : {}
  ) as Record<string, unknown>;
  const outputs: Record<string, unknown> = {};
  const skipped = new Set<string>();
  for (const [index, step] of steps.entries()) {
    if (!step || typeof step !== "object")
      throw new Error("WORKFLOW_EXECUTION_STEP_INVALID");
    const current = step as {
      nodeId?: unknown;
      capability?: unknown;
      config?: unknown;
      routes?: unknown;
    };
    const nodeId = typeof current.nodeId === "string" ? current.nodeId : "";
    const capability =
      typeof current.capability === "string" ? current.capability : "";
    const config =
      current.config &&
      typeof current.config === "object" &&
      !Array.isArray(current.config)
        ? (current.config as Record<string, unknown>)
        : {};
    if (!nodeId || !capability)
      throw new Error("WORKFLOW_EXECUTION_STEP_INVALID");
    if (skipped.has(nodeId)) {
      await input.reporter.progress(input.lease, {
        progress: Math.round(((index + 1) / steps.length) * 100),
        stage: `workflow:${nodeId}`,
        message: `Workflow step ${nodeId} skipped by a branch`,
      });
      continue;
    }
    await input.reporter.assertActive(input.lease);
    const execution = await executeWorkflowStep({
      nodeId,
      capability,
      config,
      input: value,
      workflowRunId: String(payload.workflowRunId),
      tenantId: String(payload.tenantId ?? input.context.tenantId ?? ""),
      actorId: Number(payload.actorId ?? input.context.requestedByUserId ?? 0),
      lease: input.lease,
      reporter: input.reporter,
      controlPlane: input.controlPlane,
    });
    const output = execution.value;
    outputs[nodeId] = output;
    value = output;
    const selectedPort = typeof output.selectedPort === "string" ? output.selectedPort : undefined;
    if (selectedPort && Array.isArray(current.routes)) {
      for (const route of current.routes) {
        if (!route || typeof route !== "object") continue;
        const targetNodeId = typeof (route as { targetNodeId?: unknown }).targetNodeId === "string"
          ? String((route as { targetNodeId: string }).targetNodeId)
          : "";
        const sourceHandle = typeof (route as { sourceHandle?: unknown }).sourceHandle === "string"
          ? String((route as { sourceHandle: string }).sourceHandle).split(":", 1)[0]
          : undefined;
        if (targetNodeId && sourceHandle && sourceHandle !== selectedPort) skipped.add(targetNodeId);
      }
    }
    await input.reporter.progress(input.lease, {
      progress: Math.round(((index + 1) / steps.length) * 100),
      stage: `workflow:${nodeId}`,
      message: `Workflow step ${nodeId} completed`,
    });
    if (execution.deferred) {
      return { deferred: true, output: { workflowRunId: payload.workflowRunId, outputs, waitingFor: nodeId } };
    }
  }
  return { output: { workflowRunId: payload.workflowRunId, outputs } };
}
