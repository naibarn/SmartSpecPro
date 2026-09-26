import { createHash } from "node:crypto";
import Ajv2020 from "ajv/dist/2020.js";

import {
  canonicalNodeTypeRegistry,
  NodeTypeRegistry,
  projectNodePortContract,
  validateNodeInstance,
  type DataGovernanceDeclaration,
  type JsonSchema202012,
  type NodeBindingRef,
  type NodeInstance,
  type NodePort,
  type NodeTypeManifest,
  type NodePortProjectionInput,
} from "./workflowNodeContracts";
import type { JobDefinition } from "./jobControlPlaneTypes";

export type WorkflowInputDefinition = {
  schema: JsonSchema202012;
  required?: boolean;
  default?: unknown;
  artifactMode?: boolean;
  uiHints?: Record<string, unknown>;
};

export type WorkflowOutputSource =
  | { kind: "workflow-input"; inputId: string }
  | { kind: "literal"; value: unknown }
  | { kind: "variable"; variableId: string }
  | { kind: "context"; scope: "tenant" | "user" | "workspace" | "project"; key?: string }
  | { kind: "secret-ref"; secretRef: string }
  | { kind: "artifact-ref"; artifactRef: string }
  | { kind: "previous-run"; workflowId: string; outputId: string; selector: string }
  | { kind: "node-output"; nodeId: string; portId: string };

export type WorkflowDefinitionV2 = {
  schemaVersion: "2";
  workflowId: string;
  version: string;
  interface: {
    inputs: Record<string, WorkflowInputDefinition>;
    outputs: Record<string, { schema: JsonSchema202012; source: WorkflowOutputSource; uiHints?: Record<string, unknown> }>;
  };
  nodes: NodeInstance[];
  edges: Array<{
    id?: string;
    fromNodeId: string;
    fromPortId: string;
    toNodeId: string;
    toPortId: string;
    channel: "data" | "control" | "error" | "event";
  }>;
  bindings?: WorkflowBinding[];
  scopes?: ExecutionScope[];
  policies?: PolicyAttachment[];
  instrumentation?: InstrumentationAttachment[];
  variables?: Array<{ id: string; schema: JsonSchema202012; default?: unknown }>;
  metadata?: Record<string, unknown>;
};

export type WorkflowBindingSource = Exclude<WorkflowOutputSource, { kind: "node-output" }> | { kind: "config"; key: string };
export type WorkflowBinding = {
  id: string;
  targetNodeId: string;
  targetPortId: string;
  source: WorkflowBindingSource;
};

export type ExecutionScope = {
  id: string;
  kind: "concurrency" | "error-boundary" | "transaction-saga";
  nodeIds: string[];
  config: Record<string, unknown>;
};

export type PolicyAttachment = {
  id: string;
  kind: "retry" | "timeout" | "checkpoint" | "cache" | "budget" | "fallback";
  targetNodeIds: string[];
  config: Record<string, unknown>;
};

export type InstrumentationAttachment = {
  id: string;
  kind: "trace" | "log" | "metric" | "audit" | "status";
  targetNodeIds?: string[];
  config: Record<string, unknown>;
};

export type CompiledInputBinding =
  | { source: "edge"; fromNodeId: string; fromPortId: string; toPortId: string }
  | { source: "non-edge"; bindingId: string; toPortId: string; valueSource: WorkflowBindingSource };

export type CompiledNode = {
  nodeId: string;
  typeId: string;
  typeVersion: string;
  manifestDigest: string;
  binding?: NodeBindingRef;
  resolvedConfig: Record<string, unknown>;
  inputBindings: CompiledInputBinding[];
  runtimeRequirement: Record<string, unknown>;
  executionDeclaration: Record<string, unknown>;
  securityRequirement: Record<string, unknown>;
  dataGovernance?: DataGovernanceDeclaration;
  portContract: { inputs: NodePort[]; outputs: NodePort[] };
};

export type ExecutionPlan = {
  contractVersion: "spec-215-v3";
  planId: string;
  workflowId: string;
  workflowVersion: string;
  interface: WorkflowDefinitionV2["interface"];
  nodes: CompiledNode[];
  dependencies: Array<{ nodeId: string; dependsOn: string[] }>;
  scopes: ExecutionScope[];
  policies: PolicyAttachment[];
  instrumentation: InstrumentationAttachment[];
  lock: {
    definitionHash: string;
    compilerContractVersion: "spec-215-v3";
    nodeManifestDigests: string[];
    schemaDialect: "json-schema-2020-12";
    policyContractVersion: "spec-215-policy-v1";
  };
  createdAt: string;
};

export type WorkflowRun = {
  workflowRunId: string;
  workflowId: string;
  planId: string;
  activationContext: string;
  inputSnapshotRef: string;
  status: "pending" | "running" | "waiting" | "suspended" | "completed" | "failed" | "cancelled";
};

export type NodeRun = {
  nodeRunId: string;
  workflowRunId: string;
  nodeId: string;
  status: "pending" | "ready" | "running" | "waiting" | "completed" | "failed" | "cancelled" | "skipped";
  committedAttemptId?: string;
  outputSnapshotRef?: string;
};

export type NodeAttempt = {
  attemptId: string;
  nodeRunId: string;
  attemptNumber: number;
  inputSnapshotRef: string;
  outputSnapshotRef?: string;
};

export function buildFeature195NodeAttemptJob(input: {
  tenantId: string;
  actorId: number;
  plan: ExecutionPlan;
  run: WorkflowRun;
  nodeRun: NodeRun;
  attempt: NodeAttempt;
}): JobDefinition {
  if (input.attempt.nodeRunId !== input.nodeRun.nodeRunId)
    throw new WorkflowCompilerRuntimeError("NODE_ATTEMPT_INVALID");
  const compiledNode = input.plan.nodes.find(node => node.nodeId === input.nodeRun.nodeId);
  if (!compiledNode) throw new WorkflowCompilerRuntimeError("NODE_RUN_INVALID");
  return {
    contractVersion: "feature-186-v1",
    tenantId: input.tenantId,
    requestedByUserId: input.actorId,
    jobType: "workflow.node.execute",
    executionClass: "long",
    input: {
      planId: input.plan.planId,
      workflowRunId: input.run.workflowRunId,
      nodeRunId: input.nodeRun.nodeRunId,
      attemptId: input.attempt.attemptId,
      nodeId: compiledNode.nodeId,
      typeId: compiledNode.typeId,
      typeVersion: compiledNode.typeVersion,
      manifestDigest: compiledNode.manifestDigest,
      inputSnapshotRef: input.attempt.inputSnapshotRef,
    },
    idempotencyKey: `workflow-node:${input.run.workflowRunId}:${input.nodeRun.nodeRunId}:${input.attempt.attemptId}`,
    retryPolicy: {
      maxAttempts: 2,
      baseDelayMs: 2_000,
      maxDelayMs: 120_000,
      jitter: "bounded",
      deadlineMs: 7_200_000,
      allowedErrorClasses: ["timeout", "unavailable", "capacity"],
    },
    timeoutPolicy: { softTimeoutMs: 300_000, hardTimeoutMs: 7_200_000 },
    requiredCapabilities: {
      workflow: input.plan.workflowId,
      nodeType: compiledNode.typeId,
      manifestDigest: compiledNode.manifestDigest,
    },
  };
}

export class WorkflowCompilerRuntimeError extends Error {
  constructor(public readonly code: string, message = code) {
    super(message);
    this.name = "WorkflowCompilerRuntimeError";
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

function stableStringify(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  if (!value || typeof value !== "object") return JSON.stringify(value);
  return `{${Object.entries(value as Record<string, unknown>)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, child]) => `${JSON.stringify(key)}:${stableStringify(child)}`)
    .join(",")}}`;
}

function digest(value: unknown): string {
  return createHash("sha256").update(stableStringify(value), "utf8").digest("hex");
}

function assertObject(value: unknown, code: string): asserts value is Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new WorkflowCompilerRuntimeError(code);
}

function assertString(value: unknown, code: string): asserts value is string {
  if (typeof value !== "string" || !value.trim()) throw new WorkflowCompilerRuntimeError(code);
}

const workflowSchemaValidator = new Ajv2020({ allErrors: true, strict: false });

function assertJsonSchema(value: unknown, code: string): asserts value is JsonSchema202012 {
  assertObject(value, code);
  try {
    workflowSchemaValidator.compile(value);
  } catch {
    throw new WorkflowCompilerRuntimeError(code);
  }
}

function deepFreeze<T>(value: T): T {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  Object.freeze(value);
  for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child);
  return value;
}

function assertUniqueIds(values: readonly { id: string }[], code: string): void {
  if (!Array.isArray(values) || values.some(value => !value || typeof value.id !== "string" || !value.id.trim()) || new Set(values.map(value => value.id)).size !== values.length)
    throw new WorkflowCompilerRuntimeError(code);
}

function assertWorkflowInterface(definition: WorkflowDefinitionV2): void {
  if (!definition.variables || !Array.isArray(definition.variables)) {
    if (definition.variables !== undefined) throw new WorkflowCompilerRuntimeError("WORKFLOW_VARIABLE_INVALID");
  }
  for (const input of Object.values(definition.interface?.inputs ?? {})) {
    assertObject(input, "WORKFLOW_INPUT_INVALID");
    assertJsonSchema(input.schema, "WORKFLOW_INPUT_SCHEMA_INVALID");
    if (Object.hasOwn(input, "default") && !workflowSchemaValidator.compile(input.schema)(input.default))
      throw new WorkflowCompilerRuntimeError("WORKFLOW_INPUT_DEFAULT_INVALID");
  }
  for (const variable of definition.variables ?? []) {
    assertObject(variable, "WORKFLOW_VARIABLE_INVALID");
    assertString(variable.id, "WORKFLOW_VARIABLE_INVALID");
    assertJsonSchema(variable.schema, "WORKFLOW_VARIABLE_INVALID");
    if (Object.hasOwn(variable, "default") && !workflowSchemaValidator.compile(variable.schema)(variable.default))
      throw new WorkflowCompilerRuntimeError("WORKFLOW_VARIABLE_INVALID");
  }
  assertUniqueIds(definition.variables ?? [], "WORKFLOW_VARIABLE_INVALID");
  assertObject(definition.interface?.inputs, "WORKFLOW_INTERFACE_INVALID");
  assertObject(definition.interface?.outputs, "WORKFLOW_INTERFACE_INVALID");
  for (const [id, input] of Object.entries(definition.interface.inputs)) {
    assertString(id, "WORKFLOW_INTERFACE_INVALID");
    assertObject(input, "WORKFLOW_INPUT_INVALID");
    assertJsonSchema(input.schema, "WORKFLOW_INPUT_SCHEMA_INVALID");
  }
  for (const [id, output] of Object.entries(definition.interface.outputs)) {
    assertString(id, "WORKFLOW_INTERFACE_INVALID");
    assertObject(output, "WORKFLOW_OUTPUT_INVALID");
    assertJsonSchema(output.schema, "WORKFLOW_OUTPUT_SCHEMA_INVALID");
    assertObject(output.source, "WORKFLOW_OUTPUT_SOURCE_INVALID");
    if (output.source.kind === "node-output") {
      assertString(output.source.nodeId, "WORKFLOW_OUTPUT_SOURCE_INVALID");
      assertString(output.source.portId, "WORKFLOW_OUTPUT_SOURCE_INVALID");
    } else {
      assertBindingSource(output.source, definition);
    }
  }
}

function assertBindingSource(source: WorkflowBindingSource, definition: WorkflowDefinitionV2): void {
  assertObject(source, "WORKFLOW_BINDING_SOURCE_INVALID");
  if (source.kind === "workflow-input") {
    if (!definition.interface.inputs[source.inputId])
      throw new WorkflowCompilerRuntimeError("WORKFLOW_BINDING_SOURCE_INVALID");
  } else if (source.kind === "variable") {
    if (!(definition.variables ?? []).some(variable => variable.id === source.variableId))
      throw new WorkflowCompilerRuntimeError("WORKFLOW_BINDING_SOURCE_INVALID");
  } else if (source.kind === "literal") {
    if (!Object.hasOwn(source, "value")) throw new WorkflowCompilerRuntimeError("WORKFLOW_BINDING_SOURCE_INVALID");
  } else if (source.kind === "config") {
    assertString(source.key, "WORKFLOW_BINDING_SOURCE_INVALID");
  } else if (source.kind === "context") {
    if (!(["tenant", "user", "workspace", "project"].includes(source.scope) || !source.scope))
      throw new WorkflowCompilerRuntimeError("WORKFLOW_BINDING_SOURCE_INVALID");
    if (source.key !== undefined) assertString(source.key, "WORKFLOW_BINDING_SOURCE_INVALID");
  } else if (source.kind === "secret-ref" && !source.secretRef.trim()) {
    throw new WorkflowCompilerRuntimeError("WORKFLOW_BINDING_SOURCE_INVALID");
  } else if (source.kind === "artifact-ref" && !source.artifactRef.trim()) {
    throw new WorkflowCompilerRuntimeError("WORKFLOW_BINDING_SOURCE_INVALID");
  } else if (source.kind === "previous-run" && (!source.workflowId.trim() || !source.outputId.trim() || !source.selector.trim())) {
    throw new WorkflowCompilerRuntimeError("WORKFLOW_BINDING_SOURCE_INVALID");
  } else if (source.kind !== "secret-ref" && source.kind !== "artifact-ref" &&
      source.kind !== "previous-run" && source.kind !== "workflow-input" && source.kind !== "variable" &&
      source.kind !== "literal" && source.kind !== "context" && source.kind !== "config") {
    throw new WorkflowCompilerRuntimeError("WORKFLOW_BINDING_SOURCE_INVALID");
  }
}

function assertAttachments(definition: WorkflowDefinitionV2, nodeIds: Set<string>): void {
  const attachmentValidator = new Ajv2020({ allErrors: true, strict: false });
  const configSchemas: Record<string, Record<string, unknown>> = {
    "scope:concurrency": { type: "object", additionalProperties: false, properties: { maxConcurrent: { type: "integer", minimum: 1 }, policy: { enum: ["queue", "reject"] } } },
    "scope:error-boundary": { type: "object", additionalProperties: false, properties: { onFailure: { enum: ["fail", "continue", "compensate"] } } },
    "scope:transaction-saga": { type: "object", additionalProperties: false, properties: { compensationRequired: { type: "boolean" } } },
    "policy:retry": { type: "object", additionalProperties: false, properties: { maxAttempts: { type: "integer", minimum: 1 }, baseDelayMs: { type: "integer", minimum: 0 }, maxDelayMs: { type: "integer", minimum: 0 }, jitter: { enum: ["none", "bounded", "full"] }, allowedErrorClasses: { type: "array", items: { type: "string" } } } },
    "policy:timeout": { type: "object", additionalProperties: false, properties: { softTimeoutMs: { type: "integer", minimum: 1 }, hardTimeoutMs: { type: "integer", minimum: 1 } } },
    "policy:checkpoint": { type: "object", additionalProperties: false, properties: { mode: { enum: ["automatic", "manual"] } } },
    "policy:cache": { type: "object", additionalProperties: false, properties: { ttlMs: { type: "integer", minimum: 1 }, key: { type: "string", maxLength: 256 } } },
    "policy:budget": { type: "object", additionalProperties: false, properties: { maxCredits: { type: "number", minimum: 0 }, maxDurationMs: { type: "integer", minimum: 1 } } },
    "policy:fallback": { type: "object", additionalProperties: false, properties: { strategy: { enum: ["next", "default", "stop"] } } },
    "instrumentation:trace": { type: "object", additionalProperties: false, properties: { sampleRate: { type: "number", minimum: 0, maximum: 1 }, attributes: { type: "object" } } },
    "instrumentation:log": { type: "object", additionalProperties: false, properties: { level: { enum: ["debug", "info", "warn", "error"] }, fields: { type: "array", items: { type: "string" } } } },
    "instrumentation:metric": { type: "object", additionalProperties: false, properties: { name: { type: "string" }, unit: { type: "string" }, labels: { type: "array", items: { type: "string" } } } },
    "instrumentation:audit": { type: "object", additionalProperties: false, properties: { eventType: { type: "string" }, fields: { type: "array", items: { type: "string" } } } },
    "instrumentation:status": { type: "object", additionalProperties: false, properties: { detail: { type: "string" }, includeProgress: { type: "boolean" } } },
  };
  const assertAttachmentConfig = (kind: string, config: unknown, code: string): void => {
    const schema = configSchemas[kind];
    if (!schema || !attachmentValidator.compile(schema)(config)) throw new WorkflowCompilerRuntimeError(code);
  };
  const objectArray = (values: unknown, code: string): asserts values is Array<Record<string, unknown>> => {
    if (!Array.isArray(values)) throw new WorkflowCompilerRuntimeError(code);
    for (const value of values) assertObject(value, code);
  };
  objectArray(definition.scopes ?? [], "WORKFLOW_SCOPE_INVALID");
  objectArray(definition.policies ?? [], "WORKFLOW_POLICY_INVALID");
  objectArray(definition.instrumentation ?? [], "WORKFLOW_INSTRUMENTATION_INVALID");
  assertUniqueIds((definition.scopes ?? []), "WORKFLOW_SCOPE_INVALID");
  assertUniqueIds((definition.policies ?? []), "WORKFLOW_POLICY_INVALID");
  assertUniqueIds((definition.instrumentation ?? []), "WORKFLOW_INSTRUMENTATION_INVALID");
  for (const scope of definition.scopes ?? []) {
    if (!["concurrency", "error-boundary", "transaction-saga"].includes(scope.kind) || !Array.isArray(scope.nodeIds) ||
        !scope.nodeIds.length || scope.nodeIds.some(id => !nodeIds.has(id)) || !scope.config || typeof scope.config !== "object" || Array.isArray(scope.config))
      throw new WorkflowCompilerRuntimeError("WORKFLOW_SCOPE_INVALID");
    assertAttachmentConfig(`scope:${scope.kind}`, scope.config, "WORKFLOW_SCOPE_INVALID");
  }
  for (const policy of definition.policies ?? []) {
    if (!["retry", "timeout", "checkpoint", "cache", "budget", "fallback"].includes(policy.kind) ||
        !Array.isArray(policy.targetNodeIds) || !policy.targetNodeIds.length || policy.targetNodeIds.some(id => !nodeIds.has(id)) ||
        !policy.config || typeof policy.config !== "object" || Array.isArray(policy.config))
      throw new WorkflowCompilerRuntimeError("WORKFLOW_POLICY_INVALID");
    assertAttachmentConfig(`policy:${policy.kind}`, policy.config, "WORKFLOW_POLICY_INVALID");
  }
  for (const item of definition.instrumentation ?? []) {
    if (!["trace", "log", "metric", "audit", "status"].includes(item.kind) ||
        (item.targetNodeIds !== undefined && (!Array.isArray(item.targetNodeIds) || item.targetNodeIds.some(id => !nodeIds.has(id)))) ||
        !item.config || typeof item.config !== "object" || Array.isArray(item.config))
      throw new WorkflowCompilerRuntimeError("WORKFLOW_INSTRUMENTATION_INVALID");
    assertAttachmentConfig(`instrumentation:${item.kind}`, item.config, "WORKFLOW_INSTRUMENTATION_INVALID");
  }
}

function assertNoCycles(nodeIds: readonly string[], edges: WorkflowDefinitionV2["edges"]): void {
  const outgoing = new Map<string, string[]>();
  for (const edge of edges) outgoing.set(edge.fromNodeId, [...(outgoing.get(edge.fromNodeId) ?? []), edge.toNodeId]);
  const visiting = new Set<string>();
  const visited = new Set<string>();
  const visit = (nodeId: string): void => {
    if (visiting.has(nodeId)) throw new WorkflowCompilerRuntimeError("WORKFLOW_CYCLE_DETECTED");
    if (visited.has(nodeId)) return;
    visiting.add(nodeId);
    for (const child of outgoing.get(nodeId) ?? []) visit(child);
    visiting.delete(nodeId);
    visited.add(nodeId);
  };
  for (const nodeId of nodeIds) visit(nodeId);
}

export function compileWorkflowDefinition(
  definition: WorkflowDefinitionV2,
  resolvedPortsByNode: Record<string, NodePortProjectionInput["resolvedPorts"]> = {},
  registry: NodeTypeRegistry = canonicalNodeTypeRegistry
): ExecutionPlan {
  if (!definition || definition.schemaVersion !== "2")
    throw new WorkflowCompilerRuntimeError("WORKFLOW_DEFINITION_VERSION_UNSUPPORTED");
  assertString(definition.workflowId, "WORKFLOW_DEFINITION_INVALID");
  assertString(definition.version, "WORKFLOW_DEFINITION_INVALID");
  if (!Array.isArray(definition.nodes) || !Array.isArray(definition.edges))
    throw new WorkflowCompilerRuntimeError("WORKFLOW_DEFINITION_INVALID");
  if (definition.bindings !== undefined && !Array.isArray(definition.bindings))
    throw new WorkflowCompilerRuntimeError("WORKFLOW_BINDING_INVALID");
  assertWorkflowInterface(definition);
  assertUniqueIds(definition.nodes, "WORKFLOW_NODE_ID_DUPLICATE");
  assertUniqueIds(definition.edges.filter(edge => edge.id).map(edge => ({ id: edge.id! })), "WORKFLOW_EDGE_ID_DUPLICATE");
  const nodeMap = new Map(definition.nodes.map(node => [node.id, node]));
  const manifests = new Map<string, NodeTypeManifest>();
  const projectedPortsByNode = new Map<string, { inputs: NodePort[]; outputs: NodePort[] }>();
  for (const node of definition.nodes) {
    assertObject(node, "WORKFLOW_NODE_INVALID");
    try {
      validateNodeInstance(node, registry);
    } catch (error) {
      throw error;
    }
    const manifest = registry.get(node.typeId, node.typeVersion);
    if (!manifest) throw new WorkflowCompilerRuntimeError("NODE_TYPE_UNKNOWN");
    manifests.set(node.id, manifest);
    const projectionInput: NodePortProjectionInput = {
      ...(node.binding ? { binding: node.binding } : {}),
      config: node.config,
      ...(resolvedPortsByNode[node.id] ? { resolvedPorts: resolvedPortsByNode[node.id] } : {}),
    };
    projectedPortsByNode.set(node.id, projectNodePortContract(manifest, projectionInput));
  }
  const port = (nodeId: string, portId: string, direction: "input" | "output"): NodePort => {
    const node = nodeMap.get(nodeId);
    const manifest = manifests.get(nodeId);
    if (!node || !manifest) throw new WorkflowCompilerRuntimeError("WORKFLOW_EDGE_NODE_INVALID");
    const found = projectedPortsByNode.get(nodeId)![direction === "input" ? "inputs" : "outputs"].find(item => item.id === portId);
    if (!found) throw new WorkflowCompilerRuntimeError("WORKFLOW_EDGE_PORT_INVALID");
    return found;
  };
  for (const edge of definition.edges) {
    assertObject(edge, "WORKFLOW_EDGE_INVALID");
    assertString(edge.fromNodeId, "WORKFLOW_EDGE_INVALID");
    assertString(edge.fromPortId, "WORKFLOW_EDGE_INVALID");
    assertString(edge.toNodeId, "WORKFLOW_EDGE_INVALID");
    assertString(edge.toPortId, "WORKFLOW_EDGE_INVALID");
    if (!["data", "control", "error", "event"].includes(edge.channel))
      throw new WorkflowCompilerRuntimeError("WORKFLOW_EDGE_INVALID");
    if (!nodeMap.has(edge.fromNodeId) || !nodeMap.has(edge.toNodeId))
      throw new WorkflowCompilerRuntimeError("WORKFLOW_EDGE_NODE_INVALID");
    if (edge.fromNodeId === edge.toNodeId)
      throw new WorkflowCompilerRuntimeError("WORKFLOW_CYCLE_DETECTED");
    const sourcePort = port(edge.fromNodeId, edge.fromPortId, "output");
    const targetPort = port(edge.toNodeId, edge.toPortId, "input");
    if (edge.channel !== sourcePort.channel || edge.channel !== targetPort.channel)
      throw new WorkflowCompilerRuntimeError("WORKFLOW_EDGE_CHANNEL_INVALID");
  }
  assertNoCycles(definition.nodes.map(node => node.id), definition.edges);
  for (const binding of definition.bindings ?? []) {
    assertObject(binding, "WORKFLOW_BINDING_INVALID");
    assertString(binding.id, "WORKFLOW_BINDING_INVALID");
    assertString(binding.targetNodeId, "WORKFLOW_BINDING_INVALID");
    assertString(binding.targetPortId, "WORKFLOW_BINDING_INVALID");
    if (!nodeMap.has(binding.targetNodeId))
      throw new WorkflowCompilerRuntimeError("WORKFLOW_BINDING_TARGET_INVALID");
    port(binding.targetNodeId, binding.targetPortId, "input");
    assertBindingSource(binding.source, definition);
  }
  assertUniqueIds(definition.bindings ?? [], "WORKFLOW_BINDING_INVALID");
  assertAttachments(definition, new Set(nodeMap.keys()));
  for (const node of definition.nodes) {
    const ports = projectedPortsByNode.get(node.id)!;
    const inputPorts = ports.inputs;
    const inputs = [
      ...definition.edges.filter(edge => edge.toNodeId === node.id).map(edge => ({ portId: edge.toPortId, source: "edge" })),
      ...(definition.bindings ?? []).filter(binding => binding.targetNodeId === node.id).map(binding => ({ portId: binding.targetPortId, source: "non-edge" })),
    ];
    for (const inputPort of inputPorts) {
      const matching = inputs.filter(item => item.portId === inputPort.id);
      if (inputPort.required && matching.length === 0)
        throw new WorkflowCompilerRuntimeError("WORKFLOW_REQUIRED_INPUT_MISSING");
      const maxSources = inputPort.cardinality === "many" || inputPort.connectionPolicy === "multi" ? Infinity : 1;
      if (matching.length > maxSources || (matching.length > 1 && matching.some(item => item.source !== matching[0].source)))
        throw new WorkflowCompilerRuntimeError("WORKFLOW_INPUT_CARDINALITY_INVALID");
    }
  }
  for (const output of Object.values(definition.interface.outputs)) {
    if (output.source.kind === "node-output") {
      if (!nodeMap.has(output.source.nodeId))
        throw new WorkflowCompilerRuntimeError("WORKFLOW_OUTPUT_SOURCE_INVALID");
      port(output.source.nodeId, output.source.portId, "output");
    }
  }
  const compiledNodes = definition.nodes.map(node => {
    const manifest = manifests.get(node.id)!;
    const inputBindings: CompiledInputBinding[] = [
      ...definition.edges
        .filter(edge => edge.toNodeId === node.id)
        .map(edge => ({ source: "edge" as const, fromNodeId: edge.fromNodeId, fromPortId: edge.fromPortId, toPortId: edge.toPortId })),
      ...(definition.bindings ?? [])
        .filter(binding => binding.targetNodeId === node.id)
        .map(binding => ({ source: "non-edge" as const, bindingId: binding.id, toPortId: binding.targetPortId, valueSource: binding.source })),
    ];
    return {
      nodeId: node.id,
      typeId: node.typeId,
      typeVersion: node.typeVersion,
      manifestDigest: manifest.identity.manifestDigest,
      ...(node.binding ? { binding: structuredClone(node.binding) } : {}),
      resolvedConfig: structuredClone(node.config),
      portContract: projectedPortsByNode.get(node.id)!,
      inputBindings,
      runtimeRequirement: structuredClone(manifest.runtimeRequirement),
      executionDeclaration: structuredClone(manifest.execution),
      securityRequirement: structuredClone(manifest.security),
      ...(manifest.dataGovernance
        ? { dataGovernance: structuredClone(manifest.dataGovernance) }
        : {}),
    } satisfies CompiledNode;
  });
  const lock = {
    definitionHash: digest(definition),
    compilerContractVersion: "spec-215-v3" as const,
    nodeManifestDigests: compiledNodes.map(node => node.manifestDigest),
    schemaDialect: "json-schema-2020-12" as const,
    policyContractVersion: "spec-215-policy-v1" as const,
  };
  const planBody = {
    contractVersion: "spec-215-v3" as const,
    workflowId: definition.workflowId,
    workflowVersion: definition.version,
    interface: definition.interface,
    nodes: compiledNodes,
    dependencies: definition.nodes.map(node => ({
      nodeId: node.id,
      dependsOn: definition.edges.filter(edge => edge.toNodeId === node.id).map(edge => edge.fromNodeId),
    })),
    scopes: definition.scopes ?? [],
    policies: definition.policies ?? [],
    instrumentation: definition.instrumentation ?? [],
    lock,
  };
  const plan = {
    ...planBody,
    planId: digest(planBody).slice(0, 32),
    createdAt: "1970-01-01T00:00:00.000Z",
  } satisfies ExecutionPlan;
  return deepFreeze(plan);
}

export function createWorkflowRun(plan: ExecutionPlan, activationContext: string, inputSnapshotRef: string): WorkflowRun {
  assertString(activationContext, "WORKFLOW_ACTIVATION_INVALID");
  assertString(inputSnapshotRef, "WORKFLOW_INPUT_SNAPSHOT_INVALID");
  return {
    workflowRunId: digest({ planId: plan.planId, activationContext, inputSnapshotRef }).slice(0, 32),
    workflowId: plan.workflowId,
    planId: plan.planId,
    activationContext,
    inputSnapshotRef,
    status: "running",
  };
}

export function createNodeRun(run: WorkflowRun, nodeId: string): NodeRun {
  assertString(nodeId, "NODE_RUN_INVALID");
  return {
    nodeRunId: digest({ workflowRunId: run.workflowRunId, nodeId }).slice(0, 32),
    workflowRunId: run.workflowRunId,
    nodeId,
    status: "ready",
  };
}

export function commitNodeAttempt(nodeRun: NodeRun, attempt: NodeAttempt, outputSnapshotRef: string): NodeRun {
  if (nodeRun.committedAttemptId)
    throw new WorkflowCompilerRuntimeError("NODE_RUN_ALREADY_COMMITTED");
  if (attempt.nodeRunId !== nodeRun.nodeRunId || !outputSnapshotRef.trim())
    throw new WorkflowCompilerRuntimeError("NODE_ATTEMPT_INVALID");
  return {
    ...nodeRun,
    status: "completed",
    committedAttemptId: attempt.attemptId,
    outputSnapshotRef,
  };
}
