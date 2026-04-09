import {
  AGENCY_DEFAULT_COMPILE_MODE,
  AGENCY_DEFAULT_COMPATIBILITY_MODE,
  AGENCY_DEFAULT_ENGINE,
  type AgencyBuilderDocument,
  type AgencyBuilderEdgeDocument,
  type AgencyBuilderNodeDocument,
  type AgencyCompileMode,
  type AgencyCompatibilityMode,
  type AgencySubgraphDocument,
  type AgencyWorkflowEngine,
  normalizeAgencyDocumentSnapshot,
} from "./agencyBuilderDocument";

type CompileSeverity = "error" | "warning" | "info";
type CapabilitySupport = "native" | "compatible" | "emulated" | "unsupported";

export interface AgencyCompileDiagnostic {
  severity: CompileSeverity;
  code: string;
  message: string;
  nodeId?: string;
  edgeId?: string;
  subgraphId?: string;
  engine?: AgencyWorkflowEngine;
}

export interface AgencyCanonicalNodeIR {
  id: string;
  name: string;
  type: string;
  subgraphId: string;
  isEntryPoint: boolean;
  engineHint: AgencyWorkflowEngine | null;
  config: Record<string, unknown> | null;
  runtimeConfig: Record<string, unknown> | null;
}

export interface AgencyCanonicalEdgeIR {
  id: string;
  sourceNodeId: string;
  targetNodeId: string;
  flowType: string;
}

export interface AgencyCanonicalIR {
  irVersion: "1.0";
  workflow: {
    name: string;
    documentVersion: number;
    defaultEngine: AgencyWorkflowEngine;
    compileMode: AgencyCompileMode;
    compatibilityMode: AgencyCompatibilityMode;
  };
  graph: {
    nodes: AgencyCanonicalNodeIR[];
    edges: AgencyCanonicalEdgeIR[];
    entryNodes: string[];
    exitNodes: string[];
  };
  subgraphs: AgencySubgraphDocument[];
}

export interface AgencyCompiledSubgraphPreview {
  id: string;
  name: string;
  engine: AgencyWorkflowEngine;
  nodeIds: string[];
  entryNodeIds: string[];
  exitNodeIds: string[];
  loweringStrategy:
    | "agency_swarm_adapter"
    | "agency_swarm_orchestrator"
    | "adk_graph"
    | "adk_dynamic";
  capabilities: Array<{
    nodeId: string;
    nodeType: string;
    support: CapabilitySupport;
  }>;
  emulatedNodeIds: string[];
}

export interface AgencyBridgeContractPreview {
  id: string;
  fromSubgraphId: string;
  toSubgraphId: string;
  fromEngine: AgencyWorkflowEngine;
  toEngine: AgencyWorkflowEngine;
  edgeIds: string[];
  implicit: boolean;
  bridgeMode: string;
  inputContract: string;
  outputContract: string;
  approvalOwner: string | null;
  boundaryNodeId: string | null;
  boundaryNodeName: string | null;
  contract: {
    payload: true;
    artifactRefs: true;
    metadata: true;
    traceContext: true;
    billingContext: true;
  };
}

export interface AgencyExecutionPlanStep {
  kind: "run_subgraph" | "bridge";
  subgraphId?: string;
  bridgeId?: string;
}

export interface AgencyCompilePreview {
  status: "success" | "failed";
  ir: AgencyCanonicalIR;
  diagnostics: AgencyCompileDiagnostic[];
  compiledSubgraphs: AgencyCompiledSubgraphPreview[];
  bridges: AgencyBridgeContractPreview[];
  executionPlan: AgencyExecutionPlanStep[];
  planSummary: {
    engineMix: AgencyWorkflowEngine[];
    subgraphCount: number;
    bridgeCount: number;
    usesHybrid: boolean;
    warningCount: number;
    errorCount: number;
  };
}

export interface CompileAgencyDocumentOptions {
  hybridEnabled?: boolean;
  killSwitchActive?: boolean;
}

interface CapabilityRule {
  agency_swarm: CapabilitySupport;
  adk2: CapabilitySupport;
}

const SIMPLE_AGENCY_NODE_TYPES = new Set([
  "agent",
  "supervisor",
  "autonomous_agent",
]);

const ADK_DYNAMIC_NODE_TYPES = new Set([
  "router",
  "conditional_branch",
  "parallel_fan_out",
  "loop_retry",
  "autonomous_agent",
]);

const NODE_CAPABILITY_RULES: Record<string, CapabilityRule> = {
  agent: { agency_swarm: "native", adk2: "native" },
  supervisor: { agency_swarm: "native", adk2: "emulated" },
  autonomous_agent: { agency_swarm: "compatible", adk2: "emulated" },
  router: { agency_swarm: "emulated", adk2: "native" },
  aggregator: { agency_swarm: "emulated", adk2: "native" },
  parallel_fan_out: { agency_swarm: "emulated", adk2: "native" },
  knowledge_base: { agency_swarm: "compatible", adk2: "compatible" },
  skill_call: { agency_swarm: "compatible", adk2: "compatible" },
  skill_discovery: { agency_swarm: "compatible", adk2: "compatible" },
  data_transform: { agency_swarm: "native", adk2: "native" },
  human_approval: { agency_swarm: "compatible", adk2: "native" },
  browser_session: { agency_swarm: "native", adk2: "unsupported" },
  conditional_branch: { agency_swarm: "compatible", adk2: "native" },
  loop_retry: { agency_swarm: "compatible", adk2: "native" },
  error_handler: { agency_swarm: "compatible", adk2: "emulated" },
  engine_boundary: { agency_swarm: "native", adk2: "native" },
};

function getNodeId(node: AgencyBuilderNodeDocument): string {
  return node.id && node.id.length > 0 ? node.id : node.name;
}

function normalizeDocument(document: AgencyBuilderDocument): AgencyBuilderDocument {
  return normalizeAgencyDocumentSnapshot(document, document.name);
}

function buildNodeMembership(
  nodes: AgencyBuilderNodeDocument[],
  subgraphs: AgencySubgraphDocument[],
  diagnostics: AgencyCompileDiagnostic[],
): Map<string, string> {
  const membership = new Map<string, string>();
  const subgraphIds = new Set(subgraphs.map((subgraph) => subgraph.id));

  for (const subgraph of subgraphs) {
    for (const nodeId of subgraph.nodeIds) {
      if (membership.has(nodeId) && membership.get(nodeId) !== subgraph.id) {
        diagnostics.push({
          severity: "error",
          code: "node_multiple_subgraphs",
          message: `Node ${nodeId} belongs to multiple subgraphs.`,
          nodeId,
          subgraphId: subgraph.id,
        });
        continue;
      }
      membership.set(nodeId, subgraph.id);
    }
  }

  for (const node of nodes) {
    const nodeId = getNodeId(node);
    if (node.subgraphId && !subgraphIds.has(node.subgraphId)) {
      diagnostics.push({
        severity: "error",
        code: "missing_subgraph",
        message: `Node ${node.name} references missing subgraph ${node.subgraphId}.`,
        nodeId,
        subgraphId: node.subgraphId,
      });
    }
    if (node.subgraphId) {
      membership.set(nodeId, node.subgraphId);
    }
  }

  const fallbackSubgraphId = subgraphs[0]?.id;
  for (const node of nodes) {
    const nodeId = getNodeId(node);
    if (!membership.has(nodeId) && fallbackSubgraphId) {
      membership.set(nodeId, fallbackSubgraphId);
      diagnostics.push({
        severity: "warning",
        code: "node_assigned_to_default_subgraph",
        message: `Node ${node.name} was assigned to default subgraph ${fallbackSubgraphId} for compile preview.`,
        nodeId,
        subgraphId: fallbackSubgraphId,
      });
    }
  }

  return membership;
}

function inferSubgraphLoweringStrategy(
  engine: AgencyWorkflowEngine,
  nodeTypes: string[],
): AgencyCompiledSubgraphPreview["loweringStrategy"] {
  if (engine === "adk2") {
    return nodeTypes.some((nodeType) => ADK_DYNAMIC_NODE_TYPES.has(nodeType))
      ? "adk_dynamic"
      : "adk_graph";
  }

  return nodeTypes.every((nodeType) => SIMPLE_AGENCY_NODE_TYPES.has(nodeType))
    ? "agency_swarm_adapter"
    : "agency_swarm_orchestrator";
}

function getCapabilitySupport(
  nodeType: string,
  engine: AgencyWorkflowEngine,
): CapabilitySupport {
  const rule = NODE_CAPABILITY_RULES[nodeType];
  if (!rule) return "unsupported";
  return engine === "adk2" ? rule.adk2 : rule.agency_swarm;
}

function dedupeStrings(values: string[]): string[] {
  return [...new Set(values.filter((value) => value.length > 0))];
}

function topologicallyOrderSubgraphs(
  subgraphs: AgencySubgraphDocument[],
  bridges: AgencyBridgeContractPreview[],
): AgencySubgraphDocument[] {
  const indegree = new Map<string, number>();
  const adjacency = new Map<string, string[]>();

  for (const subgraph of subgraphs) {
    indegree.set(subgraph.id, 0);
    adjacency.set(subgraph.id, []);
  }

  for (const bridge of bridges) {
    adjacency.get(bridge.fromSubgraphId)?.push(bridge.toSubgraphId);
    indegree.set(
      bridge.toSubgraphId,
      (indegree.get(bridge.toSubgraphId) ?? 0) + 1,
    );
  }

  const queue = subgraphs
    .filter((subgraph) => (indegree.get(subgraph.id) ?? 0) === 0)
    .map((subgraph) => subgraph.id);
  const orderedIds: string[] = [];

  while (queue.length > 0) {
    const subgraphId = queue.shift()!;
    orderedIds.push(subgraphId);
    for (const nextId of adjacency.get(subgraphId) ?? []) {
      indegree.set(nextId, (indegree.get(nextId) ?? 1) - 1);
      if ((indegree.get(nextId) ?? 0) === 0) {
        queue.push(nextId);
      }
    }
  }

  if (orderedIds.length !== subgraphs.length) {
    return subgraphs;
  }

  const orderMap = new Map(orderedIds.map((id, index) => [id, index]));
  return [...subgraphs].sort(
    (left, right) =>
      (orderMap.get(left.id) ?? Number.MAX_SAFE_INTEGER)
      - (orderMap.get(right.id) ?? Number.MAX_SAFE_INTEGER),
  );
}

export function buildCanonicalAgencyIR(
  document: AgencyBuilderDocument,
  diagnostics: AgencyCompileDiagnostic[] = [],
): AgencyCanonicalIR {
  const normalized = normalizeDocument(document);
  const membership = buildNodeMembership(normalized.nodes, normalized.subgraphs, diagnostics);
  const nodeNameToId = new Map(
    normalized.nodes.map((node) => [node.name, getNodeId(node)]),
  );

  const nodes: AgencyCanonicalNodeIR[] = normalized.nodes.map((node) => ({
    id: getNodeId(node),
    name: node.name,
    type: node.nodeType ?? "agent",
    subgraphId: membership.get(getNodeId(node)) ?? normalized.subgraphs[0]?.id ?? "sg_root_legacy",
    isEntryPoint: Boolean(node.isEntryPoint),
    engineHint: node.engineHint ?? null,
    config: node.nodeConfig ?? null,
    runtimeConfig: node.runtimeConfig ?? null,
  }));

  const edges: AgencyCanonicalEdgeIR[] = normalized.edges.map((edge, index) => ({
    id: `edge_${index + 1}`,
    sourceNodeId: nodeNameToId.get(edge.fromAgentName) ?? edge.fromAgentName,
    targetNodeId: nodeNameToId.get(edge.toAgentName) ?? edge.toAgentName,
    flowType: edge.flowType ?? "delegation",
  }));

  const sourceNodeIds = new Set(edges.map((edge) => edge.sourceNodeId));
  const targetNodeIds = new Set(edges.map((edge) => edge.targetNodeId));

  return {
    irVersion: "1.0",
    workflow: {
      name: normalized.name,
      documentVersion: normalized.documentVersion,
      defaultEngine: normalized.defaultEngine,
      compileMode: normalized.settings.compileMode,
      compatibilityMode: normalized.settings.compatibilityMode,
    },
    graph: {
      nodes,
      edges,
      entryNodes: nodes.filter((node) => node.isEntryPoint).map((node) => node.id),
      exitNodes: nodes
        .filter((node) => !sourceNodeIds.has(node.id) || !targetNodeIds.has(node.id))
        .map((node) => node.id),
    },
    subgraphs: normalized.subgraphs,
  };
}

function buildBridgeId(fromSubgraphId: string, toSubgraphId: string): string {
  return `bridge_${fromSubgraphId}_to_${toSubgraphId}`;
}

function buildBridgePreview(
  fromSubgraph: AgencySubgraphDocument,
  toSubgraph: AgencySubgraphDocument,
  edgeIds: string[],
  explicitBoundary: boolean,
  boundaryConfig?: Record<string, unknown> | null,
  boundaryNode?: AgencyCanonicalNodeIR | null,
): AgencyBridgeContractPreview {
  const fromPolicy = fromSubgraph.boundaryPolicy ?? {};
  const toPolicy = toSubgraph.boundaryPolicy ?? {};
  const mergedPolicy = {
    ...fromPolicy,
    ...toPolicy,
    ...(boundaryConfig ?? {}),
  } as Record<string, unknown>;

  return {
    id: buildBridgeId(fromSubgraph.id, toSubgraph.id),
    fromSubgraphId: fromSubgraph.id,
    toSubgraphId: toSubgraph.id,
    fromEngine: fromSubgraph.engine,
    toEngine: toSubgraph.engine,
    edgeIds,
    implicit: !explicitBoundary,
    bridgeMode: String(mergedPolicy.bridgeMode ?? "sync"),
    inputContract: String(
      mergedPolicy.inputContract
      ?? `${fromSubgraph.id}_to_${toSubgraph.id}_input`,
    ),
    outputContract: String(
      mergedPolicy.outputContract
      ?? `${fromSubgraph.id}_to_${toSubgraph.id}_output`,
    ),
    approvalOwner:
      typeof mergedPolicy.approvalOwner === "string"
        ? mergedPolicy.approvalOwner
        : null,
    boundaryNodeId: boundaryNode?.id ?? null,
    boundaryNodeName: boundaryNode?.name ?? null,
    contract: {
      payload: true,
      artifactRefs: true,
      metadata: true,
      traceContext: true,
      billingContext: true,
    },
  };
}

export function compileAgencyDocument(
  document: AgencyBuilderDocument,
  options: CompileAgencyDocumentOptions = {},
): AgencyCompilePreview {
  const diagnostics: AgencyCompileDiagnostic[] = [];
  const normalized = normalizeDocument(document);
  const ir = buildCanonicalAgencyIR(normalized, diagnostics);

  const nodeMap = new Map(ir.graph.nodes.map((node) => [node.id, node]));
  const subgraphMap = new Map(ir.subgraphs.map((subgraph) => [subgraph.id, subgraph]));
  const compiledSubgraphs: AgencyCompiledSubgraphPreview[] = [];
  const bridgeEdgeMap = new Map<
    string,
    {
      fromSubgraphId: string;
      toSubgraphId: string;
      edgeIds: string[];
      explicitBoundary: boolean;
      boundaryConfig?: Record<string, unknown> | null;
      boundaryNode?: AgencyCanonicalNodeIR | null;
    }
  >();

  if (ir.workflow.compileMode === AGENCY_DEFAULT_COMPILE_MODE) {
    const usesAdk = ir.subgraphs.some((subgraph) => subgraph.engine === "adk2");
    if (usesAdk) {
      diagnostics.push({
        severity: "error",
        code: "legacy_mode_disallows_adk",
        message: "legacy_agency compile mode cannot target ADK subgraphs.",
      });
    }
  }

  const usesHybrid = ir.subgraphs.some((subgraph) => subgraph.engine !== AGENCY_DEFAULT_ENGINE)
    || new Set(ir.subgraphs.map((subgraph) => subgraph.engine)).size > 1;

  if ((usesHybrid || ir.subgraphs.some((subgraph) => subgraph.engine === "adk2")) && !options.hybridEnabled) {
    diagnostics.push({
      severity: "error",
      code: "hybrid_feature_flag_required",
      message: "Hybrid Agency Runtime is disabled for this tenant.",
    });
  }

  if ((usesHybrid || ir.subgraphs.some((subgraph) => subgraph.engine === "adk2")) && options.killSwitchActive) {
    diagnostics.push({
      severity: "error",
      code: "hybrid_runtime_kill_switch_active",
      message: "Hybrid Agency Runtime is temporarily disabled by kill switch.",
    });
  }

  for (const subgraph of ir.subgraphs) {
    const subgraphNodes = ir.graph.nodes.filter((node) => node.subgraphId === subgraph.id);
    const capabilities = subgraphNodes.map((node) => ({
      nodeId: node.id,
      nodeType: node.type,
      support: getCapabilitySupport(node.type, subgraph.engine),
    }));

    for (const capability of capabilities) {
      if (capability.support === "unsupported") {
        diagnostics.push({
          severity: "error",
          code: "unsupported_node_engine_pair",
          message: `Node ${capability.nodeType}#${capability.nodeId} is not supported in ${subgraph.engine}.`,
          nodeId: capability.nodeId,
          subgraphId: subgraph.id,
          engine: subgraph.engine,
        });
      } else if (capability.support === "emulated") {
        diagnostics.push({
          severity: "warning",
          code: "emulated_node_engine_pair",
          message: `Node ${capability.nodeType}#${capability.nodeId} is emulated in ${subgraph.engine}.`,
          nodeId: capability.nodeId,
          subgraphId: subgraph.id,
          engine: subgraph.engine,
        });
      }
    }

    compiledSubgraphs.push({
      id: subgraph.id,
      name: subgraph.name,
      engine: subgraph.engine,
      nodeIds: subgraphNodes.map((node) => node.id),
      entryNodeIds: subgraph.entryNodeIds,
      exitNodeIds: subgraph.exitNodeIds,
      loweringStrategy: inferSubgraphLoweringStrategy(
        subgraph.engine,
        subgraphNodes.map((node) => node.type),
      ),
      capabilities,
      emulatedNodeIds: capabilities
        .filter((capability) => capability.support === "emulated")
        .map((capability) => capability.nodeId),
    });
  }

  const incomingEdgesByNode = new Map<string, AgencyCanonicalEdgeIR[]>();
  const outgoingEdgesByNode = new Map<string, AgencyCanonicalEdgeIR[]>();
  for (const edge of ir.graph.edges) {
    incomingEdgesByNode.set(edge.targetNodeId, [
      ...(incomingEdgesByNode.get(edge.targetNodeId) ?? []),
      edge,
    ]);
    outgoingEdgesByNode.set(edge.sourceNodeId, [
      ...(outgoingEdgesByNode.get(edge.sourceNodeId) ?? []),
      edge,
    ]);
  }

  for (const boundaryNode of ir.graph.nodes.filter((node) => node.type === "engine_boundary")) {
    const fromSubgraph = subgraphMap.get(boundaryNode.subgraphId);
    const incomingEdges = incomingEdgesByNode.get(boundaryNode.id) ?? [];
    const outgoingEdges = outgoingEdgesByNode.get(boundaryNode.id) ?? [];
    const boundaryConfig = boundaryNode.config ?? {};
    const configuredTargetSubgraphId = typeof boundaryConfig.targetSubgraphId === "string"
      && boundaryConfig.targetSubgraphId.length > 0
      ? boundaryConfig.targetSubgraphId
      : null;

    if (!fromSubgraph) {
      diagnostics.push({
        severity: "error",
        code: "boundary_missing_source_subgraph",
        message: `Engine boundary ${boundaryNode.name} is not assigned to a valid source subgraph.`,
        nodeId: boundaryNode.id,
      });
      continue;
    }

    if (incomingEdges.length === 0 || outgoingEdges.length === 0) {
      diagnostics.push({
        severity: "error",
        code: "boundary_requires_both_sides",
        message: `Engine boundary ${boundaryNode.name} must have both incoming and outgoing edges.`,
        nodeId: boundaryNode.id,
        subgraphId: fromSubgraph.id,
      });
      continue;
    }

    const inferredTargetSubgraphIds = dedupeStrings(
      outgoingEdges
        .map((candidateEdge) => nodeMap.get(candidateEdge.targetNodeId)?.subgraphId ?? "")
        .filter((subgraphId) => subgraphId !== fromSubgraph.id),
    );
    const targetSubgraphId = configuredTargetSubgraphId ?? inferredTargetSubgraphIds[0] ?? null;
    if (!targetSubgraphId) {
      diagnostics.push({
        severity: "error",
        code: "boundary_target_subgraph_required",
        message: `Engine boundary ${boundaryNode.name} requires a target subgraph.`,
        nodeId: boundaryNode.id,
        subgraphId: fromSubgraph.id,
      });
      continue;
    }

    const toSubgraph = subgraphMap.get(targetSubgraphId);
    if (!toSubgraph) {
      diagnostics.push({
        severity: "error",
        code: "boundary_target_subgraph_missing",
        message: `Engine boundary ${boundaryNode.name} references missing target subgraph ${targetSubgraphId}.`,
        nodeId: boundaryNode.id,
        subgraphId: fromSubgraph.id,
      });
      continue;
    }

    for (const candidateEdge of incomingEdges) {
      const incomingNode = nodeMap.get(candidateEdge.sourceNodeId);
      if (incomingNode && incomingNode.subgraphId !== fromSubgraph.id) {
        diagnostics.push({
          severity: "error",
          code: "boundary_source_mismatch",
          message: `Boundary ${boundaryNode.name} must receive inputs from its source subgraph ${fromSubgraph.id}.`,
          edgeId: candidateEdge.id,
          nodeId: boundaryNode.id,
          subgraphId: fromSubgraph.id,
        });
      }
    }

    for (const candidateEdge of outgoingEdges) {
      const outgoingNode = nodeMap.get(candidateEdge.targetNodeId);
      if (outgoingNode && outgoingNode.subgraphId !== toSubgraph.id) {
        diagnostics.push({
          severity: "error",
          code: "boundary_target_mismatch",
          message: `Boundary ${boundaryNode.name} must hand off into target subgraph ${toSubgraph.id}.`,
          edgeId: candidateEdge.id,
          nodeId: boundaryNode.id,
          subgraphId: toSubgraph.id,
        });
      }
    }

    if (fromSubgraph.engine === toSubgraph.engine) {
      diagnostics.push({
        severity: "info",
        code: "boundary_within_same_engine",
        message: `Boundary ${boundaryNode.name} connects subgraphs on the same engine ${fromSubgraph.engine}.`,
        nodeId: boundaryNode.id,
        subgraphId: fromSubgraph.id,
        engine: fromSubgraph.engine,
      });
    }

    const bridgeKey = buildBridgeId(fromSubgraph.id, toSubgraph.id);
    const bridgeEntry = bridgeEdgeMap.get(bridgeKey) ?? {
      fromSubgraphId: fromSubgraph.id,
      toSubgraphId: toSubgraph.id,
      edgeIds: [],
      explicitBoundary: true,
      boundaryConfig,
      boundaryNode,
    };
    bridgeEntry.edgeIds = dedupeStrings([
      ...bridgeEntry.edgeIds,
      ...incomingEdges.map((candidateEdge) => candidateEdge.id),
      ...outgoingEdges.map((candidateEdge) => candidateEdge.id),
    ]);
    bridgeEntry.explicitBoundary = true;
    bridgeEntry.boundaryConfig = boundaryConfig;
    bridgeEntry.boundaryNode = boundaryNode;
    bridgeEdgeMap.set(bridgeKey, bridgeEntry);
  }

  for (const edge of ir.graph.edges) {
    const sourceNode = nodeMap.get(edge.sourceNodeId);
    const targetNode = nodeMap.get(edge.targetNodeId);
    if (!sourceNode || !targetNode) {
      diagnostics.push({
        severity: "error",
        code: "edge_references_unknown_node",
        message: `Edge ${edge.id} references an unknown node.`,
        edgeId: edge.id,
      });
      continue;
    }

    const fromSubgraph = subgraphMap.get(sourceNode.subgraphId);
    const toSubgraph = subgraphMap.get(targetNode.subgraphId);
    if (!fromSubgraph || !toSubgraph) {
      diagnostics.push({
        severity: "error",
        code: "edge_missing_subgraph_context",
        message: `Edge ${edge.id} references a node outside a declared subgraph.`,
        edgeId: edge.id,
      });
      continue;
    }

    if (sourceNode.type === "engine_boundary" || targetNode.type === "engine_boundary") {
      continue;
    }

    if (fromSubgraph.id === toSubgraph.id) {
      continue;
    }

    const bridgeKey = buildBridgeId(fromSubgraph.id, toSubgraph.id);
    const existingBridge = bridgeEdgeMap.get(bridgeKey);
    const explicitBoundary = Boolean(
      existingBridge?.explicitBoundary
      || fromSubgraph.boundaryPolicy
      || toSubgraph.boundaryPolicy,
    );
    const crossesEngine = fromSubgraph.engine !== toSubgraph.engine;
    if (crossesEngine && !explicitBoundary && ir.workflow.compileMode !== "assist") {
      diagnostics.push({
        severity: "error",
        code: "cross_engine_boundary_required",
        message: `Cross-engine edge ${edge.id} requires a boundary contract between ${fromSubgraph.id} and ${toSubgraph.id}.`,
        edgeId: edge.id,
        subgraphId: fromSubgraph.id,
      });
    } else if (crossesEngine && !explicitBoundary) {
      diagnostics.push({
        severity: "warning",
        code: "implicit_boundary_inserted",
        message: `Compile preview inserted an implicit boundary between ${fromSubgraph.name} and ${toSubgraph.name}.`,
        edgeId: edge.id,
        subgraphId: fromSubgraph.id,
      });
    }

    const approvalNodes = [sourceNode, targetNode].filter((node) => node.type === "human_approval");
    const policy = {
      ...(fromSubgraph.boundaryPolicy ?? {}),
      ...(toSubgraph.boundaryPolicy ?? {}),
      ...(existingBridge?.boundaryConfig ?? {}),
    } as Record<string, unknown>;
    if (crossesEngine && approvalNodes.length > 0 && typeof policy.approvalOwner !== "string") {
      diagnostics.push({
        severity: "error",
        code: "boundary_approval_owner_required",
        message: `Cross-engine human approval between ${fromSubgraph.id} and ${toSubgraph.id} requires boundaryPolicy.approvalOwner.`,
        edgeId: edge.id,
      });
    }

    const bridgeEntry = bridgeEdgeMap.get(bridgeKey) ?? {
      fromSubgraphId: fromSubgraph.id,
      toSubgraphId: toSubgraph.id,
      edgeIds: [],
      explicitBoundary,
    };
    bridgeEntry.edgeIds = dedupeStrings([...bridgeEntry.edgeIds, edge.id]);
    bridgeEntry.explicitBoundary = bridgeEntry.explicitBoundary || explicitBoundary;
    bridgeEdgeMap.set(bridgeKey, bridgeEntry);
  }

  const incomingEnginesByNode = new Map<string, Set<AgencyWorkflowEngine>>();
  for (const edge of ir.graph.edges) {
    const sourceNode = nodeMap.get(edge.sourceNodeId);
    const targetNode = nodeMap.get(edge.targetNodeId);
    if (!sourceNode || !targetNode) continue;
    if (sourceNode.type === "engine_boundary" || targetNode.type === "engine_boundary") continue;
    const sourceSubgraph = subgraphMap.get(sourceNode.subgraphId);
    if (!sourceSubgraph) continue;
    const engines = incomingEnginesByNode.get(targetNode.id) ?? new Set<AgencyWorkflowEngine>();
    engines.add(sourceSubgraph.engine);
    incomingEnginesByNode.set(targetNode.id, engines);
  }

  for (const [nodeId, engines] of incomingEnginesByNode.entries()) {
    const targetNode = nodeMap.get(nodeId);
    if (targetNode?.type === "engine_boundary") continue;
    if (engines.size <= 1) continue;
    diagnostics.push({
      severity: "error",
      code: "cross_engine_join_requires_explicit_contract",
      message: `Node ${nodeId} receives inputs from multiple engines and requires an explicit join contract.`,
      nodeId,
    });
  }

  const bridges = [...bridgeEdgeMap.values()].map((bridgeEntry) => {
    const fromSubgraph = subgraphMap.get(bridgeEntry.fromSubgraphId);
    const toSubgraph = subgraphMap.get(bridgeEntry.toSubgraphId);
    if (!fromSubgraph || !toSubgraph) {
      return null;
    }
    return buildBridgePreview(
      fromSubgraph,
      toSubgraph,
      bridgeEntry.edgeIds,
      bridgeEntry.explicitBoundary,
      bridgeEntry.boundaryConfig ?? null,
      bridgeEntry.boundaryNode ?? null,
    );
  }).filter((bridge): bridge is AgencyBridgeContractPreview => bridge !== null);

  const orderedSubgraphs = topologicallyOrderSubgraphs(ir.subgraphs, bridges);
  const executionPlan: AgencyExecutionPlanStep[] = [];
  for (const subgraph of orderedSubgraphs) {
    executionPlan.push({ kind: "run_subgraph", subgraphId: subgraph.id });
    const outgoingBridges = bridges.filter((bridge) => bridge.fromSubgraphId === subgraph.id);
    for (const bridge of outgoingBridges) {
      executionPlan.push({ kind: "bridge", bridgeId: bridge.id });
    }
  }

  const warningCount = diagnostics.filter((diagnostic) => diagnostic.severity === "warning").length;
  const errorCount = diagnostics.filter((diagnostic) => diagnostic.severity === "error").length;

  return {
    status: errorCount > 0 ? "failed" : "success",
    ir,
    diagnostics,
    compiledSubgraphs,
    bridges,
    executionPlan,
    planSummary: {
      engineMix: [...new Set(ir.subgraphs.map((subgraph) => subgraph.engine))],
      subgraphCount: ir.subgraphs.length,
      bridgeCount: bridges.length,
      usesHybrid,
      warningCount,
      errorCount,
    },
  };
}

export function compileAgencyBuilderRows(input: {
  name: string;
  documentVersion?: number | null;
  defaultEngine?: AgencyWorkflowEngine | null;
  compileMode?: AgencyCompileMode | null;
  compatibilityMode?: AgencyCompatibilityMode | null;
  agents: AgencyBuilderNodeDocument[];
  communicationFlows: AgencyBuilderEdgeDocument[];
  subgraphs?: AgencySubgraphDocument[] | null;
}, options: CompileAgencyDocumentOptions = {}): AgencyCompilePreview {
  const document = {
    name: input.name,
    documentVersion: input.documentVersion ?? 1,
    defaultEngine: input.defaultEngine ?? AGENCY_DEFAULT_ENGINE,
    nodes: input.agents,
    edges: input.communicationFlows,
    subgraphs: input.subgraphs ?? [],
    settings: {
      compileMode: input.compileMode ?? AGENCY_DEFAULT_COMPILE_MODE,
      compatibilityMode: input.compatibilityMode ?? AGENCY_DEFAULT_COMPATIBILITY_MODE,
      traceLevel: "standard",
    },
  } satisfies AgencyBuilderDocument;

  return compileAgencyDocument(document, options);
}
