import type { Edge, Node } from "@xyflow/react";

export type WorkflowNodeKind =
  "input" | "analysis" | "agent" | "media" | "approval" | "output";

export type WorkflowNodeCategory =
  | "agent"
  | "skill"
  | "flow"
  | "logic"
  | "ui"
  | "tool"
  | "ai";

export type CanonicalNodeTypeRegistryDto = {
  identity: { typeId: string; version: string };
};

export type WorkflowFlowType = "main" | "subflow";

export type WorkflowPort = {
  name: string;
  type: string;
};

export type WorkflowGraphNodeData = {
  label: string;
  description?: string;
  kind: WorkflowNodeKind;
  /** Stable semantic node type. `kind` remains the React Flow rendering family. */
  typeId?: string;
  typeVersion?: string;
  binding?: { kind: string; ref: string };
  /** Legacy migration-only field; new authoring code must not populate it. */
  nodeType?: string;
  config: Record<string, unknown>;
  inputs?: WorkflowPort[];
  outputs?: WorkflowPort[];
  category?: WorkflowNodeCategory;
  presetId?: string;
  flowType?: WorkflowFlowType;
  subflowId?: string;
  subflowParentId?: string;
  skillId?: string;
  inputSchema?: Record<string, unknown>;
  uiSchema?: Record<string, unknown>;
  outputPreview?: Record<string, unknown>;
  onResizeNode?: (nodeId: string, width: number, height: number) => void;
};

export type WorkflowGraphNode = Node<WorkflowGraphNodeData>;
export type WorkflowGraphEdge = Edge;

export type WorkflowGraphState = {
  nodes: WorkflowGraphNode[];
  edges: WorkflowGraphEdge[];
  viewport: { x: number; y: number; zoom: number };
  activeFlowId?: string;
  activeFlowType?: WorkflowFlowType;
  activeSubflowParentId?: string;
};

export type WorkflowSemanticDefinition = {
  nodes: Array<{
    id: string;
    type: string;
    inputs: WorkflowPort[];
    outputs: WorkflowPort[];
    position?: { x: number; y: number };
    width?: number;
    height?: number;
    data?: WorkflowGraphNodeData;
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
  graphRevision?: number;
  activeFlowId?: string;
  activeFlowType?: WorkflowFlowType;
  activeSubflowParentId?: string;
};

type CanonicalWorkflowDefinitionProjection = {
  schemaVersion: "2";
  interface?: {
    inputs?: Record<string, unknown>;
    outputs?: Record<string, unknown>;
  };
  nodes: Array<{
    id: string;
    typeId: string;
    typeVersion: string;
    label?: string;
    binding?: { kind: string; ref: string };
    config: Record<string, unknown>;
    position?: { x: number; y: number };
    size?: { width: number; height: number };
  }>;
  edges: Array<{
    id?: string;
    fromNodeId: string;
    fromPortId: string;
    toNodeId: string;
    toPortId: string;
  }>;
};

function canonicalNodeKind(typeId: string): WorkflowNodeKind {
  if (typeId === "human.approval") return "approval";
  if (typeId === "ai.model" || typeId === "ai.agent" || typeId === "automation.computer_use") return "agent";
  if (typeId.startsWith("flow.")) return typeId === "flow.subflow" ? "media" : "analysis";
  if (typeId === "human.input" || typeId === "core.trigger") return "input";
  return "analysis";
}

function canonicalNodeCategory(typeId: string): WorkflowNodeCategory {
  if (typeId.startsWith("ai.")) return "ai";
  if (typeId.startsWith("human.")) return "logic";
  if (typeId.startsWith("flow.")) return "flow";
  if (typeId.startsWith("data.")) return typeId === "data.retrieval" ? "skill" : "tool";
  if (typeId === "core.trigger" || typeId === "human.input") return "ui";
  return "tool";
}

export function fromCanonicalWorkflowDefinition(
  definition: CanonicalWorkflowDefinitionProjection
): WorkflowGraphState {
  const nodes = definition.nodes.map((node, index) => ({
    id: node.id,
    type: canonicalNodeKind(node.typeId),
    position: node.position ?? { x: 160 + (index % 3) * 300, y: 100 + Math.floor(index / 3) * 190 },
    ...(node.size?.width ? { width: node.size.width } : {}),
    ...(node.size?.height ? { height: node.size.height } : {}),
    data: {
      label: node.label ?? node.typeId,
      kind: canonicalNodeKind(node.typeId),
      category: canonicalNodeCategory(node.typeId),
      typeId: node.typeId,
      typeVersion: node.typeVersion,
      ...(node.binding ? { binding: structuredClone(node.binding) } : {}),
      config: structuredClone(node.config),
      inputs: [{ name: "input", type: "any" }],
      outputs: [{ name: "output", type: "any" }],
    },
    } satisfies WorkflowGraphNode));
  const nodeIds = new Set(nodes.map(node => node.id));
  return {
    nodes,
    edges: definition.edges
      .filter(edge => nodeIds.has(edge.fromNodeId) && nodeIds.has(edge.toNodeId))
      .map((edge, index) => ({
        id: edge.id ?? edgeId(edge.fromNodeId, edge.toNodeId, String(index)),
        source: edge.fromNodeId,
        target: edge.toNodeId,
        sourceHandle: `${edge.fromPortId}:any`,
        targetHandle: `${edge.toPortId}:any`,
        type: "smoothstep",
        style: { stroke: "hsl(222 89% 55%)", strokeWidth: 2.5 },
      })),
    viewport: { x: 0, y: 0, zoom: 0.86 },
    activeFlowId: "main",
    activeFlowType: "main",
  };
}

export type WorkflowConnection = {
  source?: string | null;
  target?: string | null;
  sourceHandle?: string | null;
  targetHandle?: string | null;
};

export type WorkflowConnectionError = {
  code:
    | "missing_source"
    | "missing_target"
    | "self_edge"
    | "duplicate_edge"
    | "incompatible_ports"
    | "cycle_detected";
  message: string;
};

export type WorkflowNodePreset = {
  id: string;
  typeId: string;
  typeVersion: string;
  category: WorkflowNodeCategory;
  kind: WorkflowNodeKind;
  label: string;
  description: string;
  inputs: WorkflowPort[];
  outputs: WorkflowPort[];
  config: Record<string, unknown>;
  binding?: { kind: string; ref: string };
  /** Legacy migration-only field retained for reading old graph data. */
  nodeType?: string;
  flowType?: WorkflowFlowType;
  subflowId?: string;
  skillId?: string;
};

export const WORKFLOW_NODE_PRESETS: WorkflowNodePreset[] = [
  { id: "core-trigger", typeId: "core.trigger", typeVersion: "1.0.0", category: "ui", kind: "input", label: "Trigger", description: "Start a workflow from an approved trigger source", inputs: [], outputs: [{ name: "output", type: "object" }], config: {} },
  { id: "data-transform", typeId: "data.transform", typeVersion: "1.0.0", category: "tool", kind: "analysis", label: "Transform Data", description: "Map, pick or merge typed values", inputs: [{ name: "input", type: "any" }], outputs: [{ name: "output", type: "any" }], config: { operation: "passthrough" } },
  { id: "ai-model", typeId: "ai.model", typeVersion: "1.0.0", category: "ai", kind: "agent", label: "AI Model", description: "Run an approved model with typed input", inputs: [{ name: "input", type: "any" }], outputs: [{ name: "output", type: "any" }], config: { model: "", prompt: "{{input}}", responseFormat: "text" }, binding: { kind: "model", ref: "" } },
  { id: "ai-agent", typeId: "ai.agent", typeVersion: "1.0.0", category: "agent", kind: "agent", label: "AI Agent", description: "Run a governed goal-directed agent", inputs: [{ name: "input", type: "any" }], outputs: [{ name: "output", type: "any" }], config: { prompt: "" }, binding: { kind: "agent", ref: "" } },
  { id: "core-capability", typeId: "core.capability", typeVersion: "1.0.0", category: "tool", kind: "analysis", label: "Capability", description: "Run one governed Skill, tool, API or business capability", inputs: [{ name: "input", type: "any" }], outputs: [{ name: "output", type: "any" }], config: {}, binding: { kind: "capability", ref: "" } },
  { id: "data-retrieval", typeId: "data.retrieval", typeVersion: "1.0.0", category: "skill", kind: "analysis", label: "Retrieve Context", description: "Retrieve and rank context with provenance", inputs: [{ name: "input", type: "any" }], outputs: [{ name: "output", type: "any" }], config: {}, binding: { kind: "retrieval-source", ref: "" } },
  { id: "flow-subflow", typeId: "flow.subflow", typeVersion: "1.0.0", category: "flow", kind: "media", label: "Subflow", description: "Invoke a reusable workflow interface", inputs: [{ name: "input", type: "any" }], outputs: [{ name: "output", type: "any" }], config: {}, flowType: "subflow", binding: { kind: "workflow", ref: "" } },
  { id: "flow-router", typeId: "flow.router", typeVersion: "1.0.0", category: "logic", kind: "analysis", label: "Route", description: "Choose an outgoing route from typed values", inputs: [{ name: "input", type: "any" }], outputs: [{ name: "output", type: "any" }], config: { mode: "condition" } },
  { id: "flow-join", typeId: "flow.join", typeVersion: "1.0.0", category: "logic", kind: "analysis", label: "Join", description: "Synchronize workflow branches", inputs: [{ name: "input", type: "any" }], outputs: [{ name: "output", type: "any" }], config: {} },
  { id: "flow-loop", typeId: "flow.loop", typeVersion: "1.0.0", category: "logic", kind: "analysis", label: "Loop", description: "Repeat bounded workflow work", inputs: [{ name: "input", type: "any" }], outputs: [{ name: "output", type: "any" }], config: {} },
  { id: "human-approval", typeId: "human.approval", typeVersion: "1.0.0", category: "logic", kind: "approval", label: "Human Approval", description: "Pause for an explicit human decision", inputs: [{ name: "input", type: "any" }], outputs: [{ name: "output", type: "any" }], config: {} },
  { id: "human-input", typeId: "human.input", typeVersion: "1.0.0", category: "ui", kind: "input", label: "Human Input", description: "Collect typed human input", inputs: [{ name: "input", type: "any" }], outputs: [{ name: "output", type: "any" }], config: {} },
  { id: "flow-wait", typeId: "flow.wait", typeVersion: "1.0.0", category: "flow", kind: "media", label: "Wait", description: "Suspend until a timer or callback", inputs: [{ name: "input", type: "any" }], outputs: [{ name: "output", type: "any" }], config: {} },
  { id: "automation-computer-use", typeId: "automation.computer_use", typeVersion: "1.0.0", category: "tool", kind: "agent", label: "Computer Use", description: "Run a governed browser or desktop session", inputs: [{ name: "input", type: "any" }], outputs: [{ name: "output", type: "any" }], config: {}, binding: { kind: "computer-use-profile", ref: "" } },
  { id: "data-artifact", typeId: "data.artifact", typeVersion: "1.0.0", category: "tool", kind: "analysis", label: "Artifact", description: "Materialize or export a managed artifact", inputs: [{ name: "input", type: "any" }], outputs: [{ name: "output", type: "any" }], config: {} },
  { id: "quality-verifier", typeId: "quality.verifier", typeVersion: "1.0.0", category: "tool", kind: "analysis", label: "Verifier", description: "Produce typed verification evidence", inputs: [{ name: "input", type: "any" }], outputs: [{ name: "output", type: "any" }], config: {}, binding: { kind: "verifier", ref: "" } },
];

export function projectCanonicalNodePresets(
  manifests: readonly CanonicalNodeTypeRegistryDto[]
): WorkflowNodePreset[] {
  const versions = new Map(
    manifests.map(manifest => [manifest.identity.typeId, manifest.identity.version])
  );
  return WORKFLOW_NODE_PRESETS
    .filter(preset => versions.has(preset.typeId))
    .map(preset => ({
      ...preset,
      typeVersion: versions.get(preset.typeId) ?? preset.typeVersion,
    }));
}

const INITIAL_NODE_DEFS: Array<{
  id: string;
  type: WorkflowNodeKind;
  label: string;
  description: string;
  position: { x: number; y: number };
  config?: Record<string, unknown>;
  typeId?: string;
  typeVersion?: string;
  binding?: { kind: string; ref: string };
  inputs?: WorkflowPort[];
  outputs?: WorkflowPort[];
  category?: WorkflowNodeCategory;
  presetId?: string;
  flowType?: WorkflowFlowType;
  subflowId?: string;
  subflowParentId?: string;
  nodeType?: string;
}> = [
  {
    id: "project-input",
    type: "input",
    label: "Project Input",
    description: "Assets, brief and metadata",
    position: { x: 300, y: 40 },
    outputs: [{ name: "document", type: "string" }],
    category: "ui",
    presetId: "project-input",
    typeId: "core.trigger",
    typeVersion: "1.0.0",
    binding: { kind: "trigger-source", ref: "project-input" },
    flowType: "main",
  },
  {
    id: "analyze-assets",
    type: "analysis",
    label: "Analyze Assets",
    description: "Images, files and metadata",
    position: { x: 300, y: 210 },
    inputs: [{ name: "document", type: "string" }],
    outputs: [{ name: "assets", type: "object" }],
    category: "agent",
    presetId: "analyze-assets",
    typeId: "data.retrieval",
    typeVersion: "1.0.0",
    binding: { kind: "retrieval-source", ref: "assets" },
    flowType: "main",
  },
  {
    id: "script-agent",
    type: "agent",
    label: "Script Agent",
    description: "Create script from brief",
    position: { x: 70, y: 410 },
    config: { executionMode: "passthrough" },
    inputs: [{ name: "assets", type: "object" }],
    outputs: [{ name: "script", type: "string" }],
    category: "agent",
    presetId: "script-agent",
    typeId: "ai.agent",
    typeVersion: "1.0.0",
    binding: { kind: "agent", ref: "script-agent" },
    flowType: "main",
  },
  {
    id: "existing-script",
    type: "agent",
    label: "Use existing script",
    description: "Use provided script if available",
    position: { x: 530, y: 410 },
    config: { executionMode: "passthrough" },
    inputs: [{ name: "assets", type: "object" }],
    outputs: [{ name: "script", type: "string" }],
    category: "agent",
    presetId: "existing-script",
    typeId: "ai.agent",
    typeVersion: "1.0.0",
    binding: { kind: "agent", ref: "existing-script" },
    flowType: "main",
  },
  {
    id: "video-production",
    type: "media",
    label: "Produce video",
    description: "Storyboard, media and edit",
    position: { x: 300, y: 610 },
    config: { executionMode: "passthrough" },
    inputs: [{ name: "script", type: "string" }],
    outputs: [{ name: "video", type: "artifact" }],
    category: "flow",
    presetId: "video-production",
    typeId: "flow.subflow",
    typeVersion: "1.0.0",
    binding: { kind: "workflow", ref: "video-production-subflow" },
    flowType: "subflow",
    subflowId: "video-production-subflow",
  },
  {
    id: "human-approval",
    type: "approval",
    label: "Human approval",
    description: "Review before delivery",
    position: { x: 300, y: 810 },
    config: { executionMode: "passthrough" },
    inputs: [{ name: "video", type: "artifact" }],
    outputs: [{ name: "approved", type: "artifact" }],
    category: "logic",
    presetId: "human-approval",
    typeId: "human.approval",
    typeVersion: "1.0.0",
    flowType: "main",
  },
  {
    id: "result-view",
    type: "output",
    label: "Results",
    description: "Preview and artifacts",
    position: { x: 300, y: 1010 },
    inputs: [{ name: "approved", type: "artifact" }],
    category: "ui",
    presetId: "result-view",
    typeId: "data.artifact",
    typeVersion: "1.0.0",
    flowType: "main",
  },
];

function edgeId(source: string, target: string, index = "") {
  return `${source}->${target}${index ? `-${index}` : ""}`;
}

export function buildInitialWorkflowGraph(): WorkflowGraphState {
  const nodes = INITIAL_NODE_DEFS.map(definition => ({
    id: definition.id,
    type: definition.type,
    position: definition.position,
    width: 260,
    height: 150,
    data: {
      label: definition.label,
      description: definition.description,
      kind: definition.type,
      ...(definition.nodeType ? { nodeType: definition.nodeType } : {}),
      ...(definition.typeId ? { typeId: definition.typeId } : {}),
      ...(definition.typeVersion ? { typeVersion: definition.typeVersion } : {}),
      ...(definition.binding ? { binding: structuredClone(definition.binding) } : {}),
      config: definition.config ?? {},
        inputs: definition.inputs ?? [],
        outputs: definition.outputs ?? [],
        ...(definition.category ? { category: definition.category } : {}),
        ...(definition.presetId ? { presetId: definition.presetId } : {}),
        ...(definition.flowType ? { flowType: definition.flowType } : {}),
        ...(definition.subflowId ? { subflowId: definition.subflowId } : {}),
        ...(definition.subflowParentId ? { subflowParentId: definition.subflowParentId } : {}),
      },
  })) satisfies WorkflowGraphNode[];
  const edges = [
    ["project-input", "analyze-assets"],
    ["analyze-assets", "script-agent"],
    ["analyze-assets", "existing-script"],
    ["script-agent", "video-production"],
    ["existing-script", "video-production"],
    ["video-production", "human-approval"],
    ["human-approval", "result-view"],
  ].map(([source, target], index) => ({
    id: edgeId(source, target, String(index)),
    source,
    target,
    type: "smoothstep",
    style: { stroke: "hsl(222 89% 55%)", strokeWidth: 2.5 },
  }));
  return {
    nodes,
    edges,
    viewport: { x: 0, y: 0, zoom: 0.86 },
    activeFlowId: "main",
    activeFlowType: "main",
  };
}

function firstPortHandle(
  nodes: WorkflowGraphNode[],
  nodeId: string,
  direction: "inputs" | "outputs"
) {
  const port = nodes.find(node => node.id === nodeId)?.data[direction]?.[0];
  return port ? `${port.name}:${port.type}` : undefined;
}

export function toSemanticWorkflowDefinition(
  graph: WorkflowGraphState,
  graphRevision?: number
): WorkflowSemanticDefinition {
  return {
    nodes: graph.nodes.map(node => ({
      id: node.id,
      type: node.type ?? node.data.kind,
      inputs: node.data.inputs ?? [],
      outputs: node.data.outputs ?? [],
      position: { x: node.position.x, y: node.position.y },
      ...(node.width ? { width: node.width } : {}),
      ...(node.height ? { height: node.height } : {}),
      data: structuredClone(node.data),
    })),
    edges: graph.edges.map(edge => ({
      id: edge.id,
      from: edge.source,
      to: edge.target,
      sourceHandle: edge.sourceHandle,
      targetHandle: edge.targetHandle,
      label: typeof edge.label === "string" ? edge.label : null,
    })),
    viewport: graph.viewport,
    ...(graph.activeFlowId ? { activeFlowId: graph.activeFlowId } : {}),
    ...(graph.activeFlowType ? { activeFlowType: graph.activeFlowType } : {}),
    ...(graph.activeSubflowParentId ? { activeSubflowParentId: graph.activeSubflowParentId } : {}),
    ...(graphRevision === undefined ? {} : { graphRevision }),
  };
}

export function fromSemanticWorkflowDefinition(
  definition: WorkflowSemanticDefinition
): WorkflowGraphState {
  if ((definition as unknown as { schemaVersion?: unknown }).schemaVersion === "2")
    return fromCanonicalWorkflowDefinition(definition as unknown as CanonicalWorkflowDefinitionProjection);
  const nodes = definition.nodes.map((node, index) => {
    const data = node.data;
    return {
      id: node.id,
      type: node.type,
      position: node.position ?? {
        x: 120 + (index % 3) * 300,
        y: 80 + Math.floor(index / 3) * 190,
      },
      ...(node.width ? { width: node.width } : {}),
      ...(node.height ? { height: node.height } : {}),
      data: {
        label: data?.label ?? node.id,
        ...(data?.description === undefined
          ? {}
          : { description: data.description }),
        kind: data?.kind ?? (node.type as WorkflowNodeKind),
        config: data?.config ?? {},
        ...(data?.typeId === undefined ? {} : { typeId: data.typeId }),
        ...(data?.typeVersion === undefined ? {} : { typeVersion: data.typeVersion }),
        ...(data?.binding === undefined ? {} : { binding: structuredClone(data.binding) }),
        ...(data?.inputs === undefined && node.inputs?.length === 0
          ? {}
          : { inputs: data?.inputs ?? node.inputs ?? [] }),
        ...(data?.outputs === undefined && node.outputs?.length === 0
          ? {}
          : { outputs: data?.outputs ?? node.outputs ?? [] }),
        ...(data?.category === undefined ? {} : { category: data.category }),
        ...(data?.nodeType === undefined ? {} : { nodeType: data.nodeType }),
        ...(data?.presetId === undefined ? {} : { presetId: data.presetId }),
        ...(data?.flowType === undefined ? {} : { flowType: data.flowType }),
        ...(data?.subflowId === undefined ? {} : { subflowId: data.subflowId }),
        ...(data?.subflowParentId === undefined ? {} : { subflowParentId: data.subflowParentId }),
        ...(data?.skillId === undefined ? {} : { skillId: data.skillId }),
        ...(data?.inputSchema === undefined ? {} : { inputSchema: data.inputSchema }),
        ...(data?.uiSchema === undefined ? {} : { uiSchema: data.uiSchema }),
        ...(data?.outputPreview === undefined ? {} : { outputPreview: data.outputPreview }),
      },
    } satisfies WorkflowGraphNode;
  });
  const nodeIds = new Set(nodes.map(node => node.id));
  const edges = definition.edges
    .filter(edge => nodeIds.has(edge.from) && nodeIds.has(edge.to))
    .map((edge, index) => ({
      id: edge.id ?? edgeId(edge.from, edge.to, String(index)),
      source: edge.from,
      target: edge.to,
      sourceHandle: edge.sourceHandle ?? undefined,
      targetHandle: edge.targetHandle ?? undefined,
      label: edge.label ?? undefined,
      type: "smoothstep",
      style: { stroke: "hsl(222 89% 55%)", strokeWidth: 2.5 },
    }));
  return {
    nodes,
    edges,
    viewport: definition.viewport ?? { x: 0, y: 0, zoom: 0.86 },
    ...(definition.activeFlowId ? { activeFlowId: definition.activeFlowId } : {}),
    ...(definition.activeFlowType ? { activeFlowType: definition.activeFlowType } : {}),
    ...(definition.activeSubflowParentId ? { activeSubflowParentId: definition.activeSubflowParentId } : {}),
  };
}

function portType(handle: string | null | undefined): string | null {
  if (!handle) return null;
  const separator = handle.indexOf(":");
  return separator === -1 ? null : handle.slice(separator + 1);
}

function hasPath(
  edges: WorkflowGraphEdge[],
  start: string,
  target: string
): boolean {
  const outgoing = new Map<string, string[]>();
  for (const edge of edges) {
    outgoing.set(edge.source, [
      ...(outgoing.get(edge.source) ?? []),
      edge.target,
    ]);
  }
  const stack = [start];
  const visited = new Set<string>();
  while (stack.length) {
    const current = stack.pop()!;
    if (current === target) return true;
    if (visited.has(current)) continue;
    visited.add(current);
    stack.push(...(outgoing.get(current) ?? []));
  }
  return false;
}

export function validateWorkflowConnection(
  connection: WorkflowConnection,
  graph: WorkflowGraphState
): WorkflowConnectionError | null {
  if (!connection.source)
    return { code: "missing_source", message: "เลือกโหนดต้นทางก่อน" };
  if (!connection.target)
    return { code: "missing_target", message: "เลือกโหนดปลายทางก่อน" };
  if (connection.source === connection.target)
    return { code: "self_edge", message: "โหนดไม่สามารถเชื่อมเข้าหาตัวเองได้" };
  if (
    graph.edges.some(
      edge =>
        edge.source === connection.source && edge.target === connection.target
    )
  ) {
    return { code: "duplicate_edge", message: "เส้นเชื่อมนี้มีอยู่แล้ว" };
  }
  const sourceNode = graph.nodes.find(node => node.id === connection.source);
  const targetNode = graph.nodes.find(node => node.id === connection.target);
  const sourceType = portType(connection.sourceHandle);
  const targetType = portType(connection.targetHandle);
  if (
    sourceType &&
    targetType &&
    sourceType !== targetType &&
    sourceType !== "any" &&
    targetType !== "any"
  ) {
    return {
      code: "incompatible_ports",
      message: `ชนิดข้อมูลไม่ตรงกัน: ${sourceType} → ${targetType}`,
    };
  }
  if (
    sourceNode &&
    targetNode &&
    sourceType &&
    targetType &&
    sourceType !== targetType &&
    sourceType !== "any" &&
    targetType !== "any"
  ) {
    return {
      code: "incompatible_ports",
      message: `ชนิดข้อมูลของ ${sourceNode.data.label} และ ${targetNode.data.label} ไม่ตรงกัน`,
    };
  }
  if (hasPath(graph.edges, connection.target, connection.source)) {
    return {
      code: "cycle_detected",
      message: "เส้นเชื่อมนี้จะทำให้ workflow เกิดวงจร",
    };
  }
  return null;
}

export function duplicateWorkflowNode(
  graph: WorkflowGraphState,
  nodeId: string
): WorkflowGraphState {
  const source = graph.nodes.find(node => node.id === nodeId);
  if (!source) return graph;
  let copyId = `${nodeId}-copy`;
  let suffix = 2;
  while (graph.nodes.some(node => node.id === copyId))
    copyId = `${nodeId}-copy-${suffix++}`;
  const copy: WorkflowGraphNode = {
    ...source,
    id: copyId,
    position: { x: source.position.x + 48, y: source.position.y + 48 },
    data: { ...source.data, config: structuredClone(source.data.config) },
    selected: true,
  };
  return {
    ...graph,
    nodes: graph.nodes.map(node => ({ ...node, selected: false })).concat(copy),
  };
}

export function addWorkflowNode(
  graph: WorkflowGraphState,
  input: Pick<WorkflowGraphNodeData, "kind" | "label" | "description"> &
    Partial<
      Pick<
        WorkflowGraphNodeData,
        | "category"
        | "presetId"
        | "typeId"
        | "typeVersion"
        | "binding"
        | "flowType"
        | "subflowId"
        | "subflowParentId"
        | "nodeType"
        | "skillId"
        | "inputs"
        | "outputs"
        | "config"
      >
    > & { position?: { x: number; y: number } }
): { graph: WorkflowGraphState; node: WorkflowGraphNode } {
  let id = `${input.kind}-${graph.nodes.length + 1}`;
  let suffix = graph.nodes.length + 1;
  while (graph.nodes.some(node => node.id === id))
    id = `${input.kind}-${++suffix}`;
  const node: WorkflowGraphNode = {
    id,
    type: input.kind,
    position: input.position ?? { x: 420, y: 240 },
    width: 260,
    height: 150,
    selected: true,
    data: {
      label: input.label,
      description: input.description,
      kind: input.kind,
      ...(input.nodeType ? { nodeType: input.nodeType } : {}),
      ...(input.typeId ? { typeId: input.typeId } : {}),
      ...(input.typeVersion ? { typeVersion: input.typeVersion } : {}),
      ...(input.binding ? { binding: structuredClone(input.binding) } : {}),
      ...(input.category ? { category: input.category } : {}),
      ...(input.presetId ? { presetId: input.presetId } : {}),
      ...(input.flowType ? { flowType: input.flowType } : {}),
      ...(input.subflowId ? { subflowId: input.subflowId } : {}),
      ...(input.subflowParentId ? { subflowParentId: input.subflowParentId } : {}),
      ...(input.skillId ? { skillId: input.skillId } : {}),
      config: input.config ?? {},
      inputs: input.inputs ?? [{ name: "input", type: "any" }],
      outputs: input.outputs ?? [{ name: "output", type: "any" }],
    },
  };
  return {
    node,
    graph: {
      ...graph,
      nodes: [...graph.nodes.map(item => ({ ...item, selected: false })), node],
    },
  };
}

export function addWorkflowPreset(
  graph: WorkflowGraphState,
  presetId: string,
  position?: { x: number; y: number }
) {
  const preset = WORKFLOW_NODE_PRESETS.find(item => item.id === presetId);
  if (!preset) return addWorkflowNode(graph, { kind: "agent", label: "AI Agent", description: "", typeId: "ai.agent", typeVersion: "1.0.0" });
  return addWorkflowNode(graph, {
    kind: preset.kind,
    label: preset.label,
    description: preset.description,
    category: preset.category,
    typeId: preset.typeId,
    typeVersion: preset.typeVersion,
    binding: preset.binding,
    ...(preset.nodeType ? { nodeType: preset.nodeType } : {}),
    presetId: preset.id,
    flowType: preset.flowType,
    subflowId: preset.subflowId,
    skillId: preset.skillId,
    inputs: preset.inputs,
    outputs: preset.outputs,
    config: structuredClone(preset.config),
    ...(position ? { position } : {}),
  });
}

export function deleteWorkflowNode(
  graph: WorkflowGraphState,
  nodeId: string
): WorkflowGraphState {
  return {
    ...graph,
    nodes: graph.nodes.filter(node => node.id !== nodeId),
    edges: graph.edges.filter(
      edge => edge.source !== nodeId && edge.target !== nodeId
    ),
  };
}
