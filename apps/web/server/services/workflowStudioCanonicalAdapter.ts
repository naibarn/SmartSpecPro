import {
  getNodeTypeManifest,
  searchNodeTypes,
  validateNodeInstance,
  type NodeBindingRef,
  type NodeInstance,
  type NodeTypeManifest,
} from "./workflowNodeContracts";
import {
  compileWorkflowDefinition,
  type WorkflowDefinitionV2,
} from "./workflowCompilerRuntimeContracts";

export type LegacyStudioGraph = {
  nodes: Array<{
    id: string;
    type: string;
    position?: { x: number; y: number };
    width?: number;
    height?: number;
    data?: Record<string, unknown>;
  }>;
  edges: Array<{
    id?: string;
    from: string;
    to: string;
    sourceHandle?: string | null;
    targetHandle?: string | null;
    label?: string | null;
  }>;
  viewport?: { x: number; y: number; zoom: number };
};

export type StudioCanonicalGraph = {
  definition: WorkflowDefinitionV2;
  ui: {
    viewport?: { x: number; y: number; zoom: number };
    labels: Record<string, string>;
  };
};

export class WorkflowStudioCanonicalAdapterError extends Error {
  constructor(public readonly code: string, message = code) {
    super(message);
    this.name = "WorkflowStudioCanonicalAdapterError";
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

const LEGACY_SHELL_TYPES = new Set(["input", "form", "output", "result"]);

const LEGACY_TYPE_MAP: Record<string, string> = {
  agent: "ai.agent",
  "script-agent": "ai.agent",
  llm: "ai.model",
  prompt: "ai.model",
  model: "ai.model",
  skill: "core.capability",
  http: "core.capability",
  retrieval: "data.retrieval",
  search: "data.retrieval",
  condition: "flow.router",
  switch: "flow.router",
  approval: "human.approval",
  "human-approval": "human.approval",
  transform: "data.transform",
  "file-transform": "data.transform",
  subflow: "flow.subflow",
  wait: "flow.wait",
  "computer-use": "automation.computer_use",
  artifact: "data.artifact",
  verifier: "quality.verifier",
};

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function object(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? structuredClone(value as Record<string, unknown>)
    : {};
}

function legacyNodeType(node: LegacyStudioGraph["nodes"][number]): string {
  const data = object(node.data);
  return text(data.typeId) || text(data.nodeType) || node.type.trim().toLowerCase();
}

function canonicalTypeId(
  node: LegacyStudioGraph["nodes"][number]
): string | null {
  const legacyType = legacyNodeType(node);
  if (LEGACY_SHELL_TYPES.has(legacyType)) return null;
  try {
    getNodeTypeManifest(legacyType, "1.0.0");
    return legacyType;
  } catch {
    // Continue through the closed migration table for legacy Studio payloads.
  }
  const typeId = LEGACY_TYPE_MAP[legacyType];
  if (!typeId) {
    throw new WorkflowStudioCanonicalAdapterError(
      "WORKFLOW_STUDIO_NODE_UNSUPPORTED",
      `Unsupported Studio node type: ${legacyType}`
    );
  }
  return typeId;
}

function bindingFor(
  typeId: string,
  config: Record<string, unknown>
): NodeBindingRef | undefined {
  const explicit = config.binding;
  if (explicit && typeof explicit === "object" && !Array.isArray(explicit)) {
    return structuredClone(explicit as NodeBindingRef);
  }
  const ref = text(
    typeId === "ai.model"
      ? config.modelRef ?? config.model
      : typeId === "ai.agent"
        ? config.agentRef ?? config.agentId
        : typeId === "core.capability"
          ? config.capabilityRef ?? config.skillId ?? config.toolId ?? config.url
          : typeId === "data.retrieval"
            ? config.retrievalRef ?? config.sourceId
            : typeId === "flow.subflow"
              ? config.subflowId ?? config.workflowId
              : typeId === "automation.computer_use"
                ? config.computerUseProfileRef ?? config.profileId
                : typeId === "quality.verifier"
                  ? config.verifierRef ?? config.verifierId
                  : ""
  );
  if (!ref) return undefined;
  const kind: NodeBindingRef["kind"] =
    typeId === "ai.model"
      ? "model"
      : typeId === "ai.agent"
        ? "agent"
        : typeId === "data.retrieval"
          ? "retrieval-source"
          : typeId === "flow.subflow"
            ? "workflow"
            : typeId === "automation.computer_use"
              ? "computer-use-profile"
              : typeId === "quality.verifier"
                ? "verifier"
                : "capability";
  return { kind, ref };
}

function portId(handle: string | null | undefined, fallback: "input" | "output"): string {
  const raw = text(handle);
  return raw ? raw.split(":", 1)[0] : fallback;
}

function inputDefinitions(inputNode: LegacyStudioGraph["nodes"][number] | undefined) {
  const config = object(inputNode?.data && object(inputNode.data).config);
  const fields = Array.isArray(config.fields) ? config.fields : [];
  const entries = fields
    .filter(item => item && typeof item === "object")
    .map(item => item as Record<string, unknown>)
    .filter(item => text(item.name));
  const fieldNames = entries.map(field => text(field.name));
  if (new Set(fieldNames).size !== fieldNames.length)
    throw new WorkflowStudioCanonicalAdapterError("WORKFLOW_STUDIO_INPUT_MAPPING_AMBIGUOUS");
  if (!entries.length) {
    return {
      request: { schema: { type: "string" }, required: true },
    };
  }
  return Object.fromEntries(
    entries.map(field => [
      text(field.name),
      {
        schema: field.schema && typeof field.schema === "object"
          ? structuredClone(field.schema as Record<string, unknown>)
          : { type: text(field.type) || "string" },
        required: field.required === true,
      },
    ])
  );
}

function outputKey(outputNode: LegacyStudioGraph["nodes"][number] | undefined): string {
  const config = object(outputNode?.data && object(outputNode.data).config);
  return text(config.outputKey) || "result";
}

function nodeConfig(node: LegacyStudioGraph["nodes"][number]): Record<string, unknown> {
  const data = object(node.data);
  const config = object(data.config);
  delete config.binding;
  delete config.model;
  delete config.modelRef;
  delete config.agentRef;
  delete config.agentId;
  delete config.capabilityRef;
  delete config.skillId;
  delete config.toolId;
  delete config.url;
  delete config.retrievalRef;
  delete config.sourceId;
  delete config.subflowId;
  delete config.workflowId;
  delete config.computerUseProfileRef;
  delete config.profileId;
  delete config.verifierRef;
  delete config.verifierId;
  return config;
}

function buildNode(
  node: LegacyStudioGraph["nodes"][number],
  typeId: string
): NodeInstance {
  const data = object(node.data);
  const config = nodeConfig(node);
  const manifest = getNodeTypeManifest(typeId, "1.0.0");
  const binding = bindingFor(typeId, {
    ...object(data.config),
    ...(data.binding ? { binding: data.binding } : {}),
  });
  const instance: NodeInstance = {
    id: node.id,
    typeId,
    typeVersion: manifest.identity.version,
    ...(text(data.presetId) ? { presetId: text(data.presetId) } : {}),
    ...(text(data.label) ? { label: text(data.label) } : {}),
    ...(binding ? { binding } : {}),
    config,
    ...(data.metadata && typeof data.metadata === "object"
      ? { metadata: structuredClone(data.metadata as Record<string, unknown>) }
      : {}),
    ...(node.position ? { position: structuredClone(node.position) } : {}),
    ...(node.width || node.height
      ? { size: { width: node.width ?? 0, height: node.height ?? 0 } }
      : {}),
  };
  validateNodeInstance(instance);
  return instance;
}

export function listCanonicalNodeTypes(input?: { query?: string }): NodeTypeManifest[] {
  return searchNodeTypes({ query: input?.query }).map(manifest => structuredClone(manifest));
}

export function assertCanonicalStudioDefinition(
  definition: WorkflowDefinitionV2
): true {
  compileWorkflowDefinition(definition);
  return true;
}

export function toCanonicalWorkflowDefinition(input: {
  graph: LegacyStudioGraph;
  workflowId: string;
  version: string;
}): StudioCanonicalGraph {
  const byId = new Map(input.graph.nodes.map(node => [node.id, node]));
  if (byId.size !== input.graph.nodes.length || [...byId.keys()].some(id => !id.trim()))
    throw new WorkflowStudioCanonicalAdapterError("WORKFLOW_STUDIO_NODE_INVALID");
  const semanticNodes = input.graph.nodes
    .map(node => ({ node, typeId: canonicalTypeId(node) }))
    .filter((entry): entry is { node: LegacyStudioGraph["nodes"][number]; typeId: string } => Boolean(entry.typeId));
  const nodeIds = new Set(semanticNodes.map(entry => entry.node.id));
  const nodes = semanticNodes.map(entry => buildNode(entry.node, entry.typeId));
  const shellType = (node: LegacyStudioGraph["nodes"][number]): string => {
    const data = object(node.data);
    if (text(data.typeId).includes(".") || text(data.nodeType).includes(".")) return "semantic";
    return text(data.nodeType) || node.type.trim().toLowerCase();
  };
  const shellNodes = input.graph.nodes.filter(node => LEGACY_SHELL_TYPES.has(shellType(node)));
  const inputNodes = shellNodes.filter(node => ["input", "form"].includes(shellType(node)));
  const outputNodes = shellNodes.filter(node => ["output", "result"].includes(shellType(node)));
  if (shellNodes.length !== input.graph.nodes.filter(node => !nodeIds.has(node.id)).length || !outputNodes.length)
    throw new WorkflowStudioCanonicalAdapterError("WORKFLOW_STUDIO_SHELL_INVALID");
  const inputRecords = inputNodes.map(node => inputDefinitions(node));
  const inputKeys = inputRecords.flatMap(record => Object.keys(record));
  if (new Set(inputKeys).size !== inputKeys.length)
    throw new WorkflowStudioCanonicalAdapterError("WORKFLOW_STUDIO_INPUT_MAPPING_AMBIGUOUS");
  const inputs = Object.assign({}, ...inputRecords);
  const outputKeys = outputNodes.map(outputKey);
  if (new Set(outputKeys).size !== outputKeys.length)
    throw new WorkflowStudioCanonicalAdapterError("WORKFLOW_STUDIO_OUTPUT_MAPPING_AMBIGUOUS");
  const bindings: NonNullable<WorkflowDefinitionV2["bindings"]> = [];
  const edges: WorkflowDefinitionV2["edges"] = [];
  const outputSources: Record<string, WorkflowDefinitionV2["interface"]["outputs"][string]> = {};
  for (const edge of input.graph.edges) {
    const from = byId.get(edge.from);
    const to = byId.get(edge.to);
    if (!from || !to) throw new WorkflowStudioCanonicalAdapterError("WORKFLOW_STUDIO_EDGE_DANGLING");
    const fromSemantic = nodeIds.has(edge.from);
    const toSemantic = nodeIds.has(edge.to);
    const fromShell = shellType(from);
    const toShell = shellType(to);
    if (!fromSemantic && !["input", "form"].includes(fromShell))
      throw new WorkflowStudioCanonicalAdapterError("WORKFLOW_STUDIO_EDGE_SOURCE_UNSUPPORTED");
    if (!toSemantic && !["output", "result"].includes(toShell))
      throw new WorkflowStudioCanonicalAdapterError("WORKFLOW_STUDIO_EDGE_TARGET_UNSUPPORTED");
    if (fromSemantic && toSemantic) {
      edges.push({
      id: edge.id,
      fromNodeId: edge.from,
      fromPortId: portId(edge.sourceHandle, "output"),
      toNodeId: edge.to,
      toPortId: portId(edge.targetHandle, "input"),
      channel: "data" as const,
      });
      continue;
    }
    if (!fromSemantic && toSemantic) {
      const sourceInputId = portId(edge.sourceHandle, "input");
      const inputId = Object.hasOwn(inputs, sourceInputId)
        ? sourceInputId
        : Object.keys(inputs).length === 1 ? Object.keys(inputs)[0] : "";
      if (!inputId) throw new WorkflowStudioCanonicalAdapterError("WORKFLOW_STUDIO_INPUT_MAPPING_AMBIGUOUS");
      bindings.push({
        id: edge.id ? `binding-${edge.id}` : `binding-${edge.from}-${edge.to}-${inputId}`,
        targetNodeId: edge.to,
        targetPortId: portId(edge.targetHandle, "input"),
        source: { kind: "workflow-input", inputId },
      });
      continue;
    }
    if (fromSemantic && !toSemantic) {
      const outputId = outputKey(to);
      if (outputSources[outputId])
        throw new WorkflowStudioCanonicalAdapterError("WORKFLOW_STUDIO_OUTPUT_MAPPING_AMBIGUOUS");
      outputSources[outputId] = {
        schema: { type: "object" },
        source: { kind: "node-output", nodeId: edge.from, portId: portId(edge.sourceHandle, "output") },
      };
      continue;
    }
    throw new WorkflowStudioCanonicalAdapterError("WORKFLOW_STUDIO_EDGE_UNSUPPORTED");
  }
  for (const outputNode of outputNodes) {
    const outputId = outputKey(outputNode);
    if (!outputSources[outputId])
      throw new WorkflowStudioCanonicalAdapterError("WORKFLOW_STUDIO_OUTPUT_SOURCE_MISSING");
  }
  if (!Object.keys(outputSources).length)
    throw new WorkflowStudioCanonicalAdapterError("WORKFLOW_STUDIO_OUTPUT_SOURCE_MISSING");
  const definition: WorkflowDefinitionV2 = {
    schemaVersion: "2",
    workflowId: input.workflowId,
    version: input.version,
    interface: {
      inputs,
      outputs: outputSources,
    },
    nodes,
    edges,
    ...(bindings.length ? { bindings } : {}),
    scopes: [],
    policies: [],
    instrumentation: [],
  };
  assertCanonicalStudioDefinition(definition);
  return {
    definition,
    ui: {
      ...(input.graph.viewport ? { viewport: structuredClone(input.graph.viewport) } : {}),
      labels: Object.fromEntries(
        input.graph.nodes
          .map(node => [node.id, text(object(node.data).label)])
          .filter((entry): entry is [string, string] => Boolean(entry[1]))
      ),
    },
  };
}
