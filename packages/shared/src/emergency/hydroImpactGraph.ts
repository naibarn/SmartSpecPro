/**
 * Deterministic structural hydro-topology traversal for Spec 262.
 *
 * This module deliberately describes only a possible connection in an
 * approved topology. It does not model arrival time, depth, damage, geometry,
 * source authorization, or public disclosure.
 */

export const HYDRO_IMPACT_GRAPH_POLICY_VERSION = "spec262-hydro-impact-graph-v1";

export type HydroEdgeKind = "RIVER" | "REVERSIBLE_CANAL" | "DIVERSION" | "CONTROLLED_LINK";
export type HydroFlowDirection = "FORWARD" | "REVERSE" | "UNKNOWN";
export type HydraulicOperation = "OPEN" | "CLOSED" | "UNKNOWN";
export type HydroTraversalDirection = "DOWNSTREAM" | "UPSTREAM";
export type HydroImpactRelationType = "POTENTIAL_DOWNSTREAM_IMPACT" | "POTENTIAL_UPSTREAM_RELEVANCE";
export type HydroImpactStatus = "COMPLETE" | "PARTIAL" | "UNKNOWN";
export type HydroImpactReason =
  | "NO_CONNECTED_PATH"
  | "DUPLICATE_NODE_ID"
  | "SOURCE_NODE_NOT_FOUND"
  | "TARGET_NODE_NOT_FOUND"
  | "INVALID_EDGE_IGNORED"
  | "UNKNOWN_FLOW_DIRECTION"
  | "UNKNOWN_OPERATION_STATE"
  | "CLOSED_OPERATION"
  | "NODE_BUDGET_EXCEEDED"
  | "EDGE_BUDGET_EXCEEDED"
  | "DEPTH_BUDGET_EXCEEDED";

export interface HydroImpactNode {
  readonly id: string;
  readonly basinRef: string;
  readonly subBasinRef?: string;
  /** Presentation metadata only; it never alters hydrologic traversal. */
  readonly provinceRef?: string;
  readonly sourceRef: string;
  readonly sourceRevision: string;
}

/**
 * `fromNodeId` and `toNodeId` are static provider topology. `direction` is
 * the time-effective flow direction and may reverse without editing geometry.
 */
export interface HydroImpactEdge {
  readonly id: string;
  readonly fromNodeId: string;
  readonly toNodeId: string;
  readonly kind: HydroEdgeKind;
  readonly direction: HydroFlowDirection;
  readonly operation: HydraulicOperation;
  readonly sourceRef: string;
  readonly sourceRevision: string;
}

export interface HydroImpactGraph {
  readonly topologyRevision: string;
  readonly nodes: readonly HydroImpactNode[];
  readonly edges: readonly HydroImpactEdge[];
}

export interface HydroImpactLimits {
  readonly maxNodes?: number;
  readonly maxEdges?: number;
  readonly maxDepth?: number;
}

export interface HydroImpactReachabilityRequest {
  readonly graph: HydroImpactGraph;
  readonly sourceNodeId: string;
  readonly direction: HydroTraversalDirection;
  /** Limits the reported targets but never creates a graph connection. */
  readonly targetNodeIds?: readonly string[];
  readonly limits?: HydroImpactLimits;
}

export interface HydroImpactRelation {
  readonly relation: HydroImpactRelationType;
  readonly sourceNodeId: string;
  readonly targetNodeId: string;
  readonly hopCount: number;
  /** Existing provider edge refs make the structural assertion explainable. */
  readonly edgeIds: readonly string[];
  readonly topologyRevision: string;
  readonly sourceRefs: readonly string[];
  readonly provinceCrossing: boolean;
  /** A connection alone is not a measured or forecast impact. */
  readonly certainty: "STRUCTURAL_POSSIBILITY_ONLY";
}

export interface HydroImpactReachabilityResult {
  readonly policyVersion: typeof HYDRO_IMPACT_GRAPH_POLICY_VERSION;
  readonly topologyRevision: string;
  readonly status: HydroImpactStatus;
  readonly relations: readonly HydroImpactRelation[];
  readonly reasons: readonly HydroImpactReason[];
}

interface TraversalStep {
  readonly nodeId: string;
  readonly depth: number;
  readonly edgeIds: readonly string[];
  readonly sourceRefs: readonly string[];
}

const DEFAULT_MAX_NODES = 500;
const DEFAULT_MAX_EDGES = 2_000;
const DEFAULT_MAX_DEPTH = 32;
const MAX_LIMIT = 10_000;
const nodeIdPattern = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,127}$/;

function isValidIdentifier(value: unknown): value is string {
  return typeof value === "string" && nodeIdPattern.test(value);
}

function readLimit(value: number | undefined, fallback: number): number {
  if (!Number.isInteger(value) || value === undefined || value < 1) return fallback;
  return Math.min(value, MAX_LIMIT);
}

function sortUnique(values: Iterable<string>): readonly string[] {
  return [...new Set(values)].sort((left, right) => left.localeCompare(right));
}

function isValidNode(node: HydroImpactNode): boolean {
  return isValidIdentifier(node.id) && isValidIdentifier(node.basinRef) && isValidIdentifier(node.sourceRef) && isValidIdentifier(node.sourceRevision) &&
    (node.subBasinRef === undefined || isValidIdentifier(node.subBasinRef)) &&
    (node.provinceRef === undefined || isValidIdentifier(node.provinceRef));
}

function isValidEdge(edge: HydroImpactEdge, nodes: ReadonlyMap<string, HydroImpactNode>, edgeIds: ReadonlySet<string>): boolean {
  return isValidIdentifier(edge.id) && !edgeIds.has(edge.id) && nodes.has(edge.fromNodeId) && nodes.has(edge.toNodeId) && edge.fromNodeId !== edge.toNodeId &&
    (edge.kind === "RIVER" || edge.kind === "REVERSIBLE_CANAL" || edge.kind === "DIVERSION" || edge.kind === "CONTROLLED_LINK") &&
    (edge.direction === "FORWARD" || edge.direction === "REVERSE" || edge.direction === "UNKNOWN") &&
    (edge.operation === "OPEN" || edge.operation === "CLOSED" || edge.operation === "UNKNOWN") &&
    isValidIdentifier(edge.sourceRef) && isValidIdentifier(edge.sourceRevision);
}

function directedEndpoints(edge: HydroImpactEdge): readonly [from: string, to: string] | undefined {
  if (edge.direction === "UNKNOWN") return undefined;
  return edge.direction === "FORWARD"
    ? [edge.fromNodeId, edge.toNodeId]
    : [edge.toNodeId, edge.fromNodeId];
}

function nextNodeFor(edge: HydroImpactEdge, nodeId: string, direction: HydroTraversalDirection): string | undefined {
  const endpoints = directedEndpoints(edge);
  if (!endpoints) return undefined;
  const [downstreamFrom, downstreamTo] = endpoints;
  if (direction === "DOWNSTREAM") return downstreamFrom === nodeId ? downstreamTo : undefined;
  return downstreamTo === nodeId ? downstreamFrom : undefined;
}

function relationType(direction: HydroTraversalDirection): HydroImpactRelationType {
  return direction === "DOWNSTREAM" ? "POTENTIAL_DOWNSTREAM_IMPACT" : "POTENTIAL_UPSTREAM_RELEVANCE";
}

/**
 * Traverses only explicit, currently open directed edges. It is bounded and
 * cycle-safe; unknown/closed/invalid branches yield an explicit partial state
 * and cannot become an inferred connection.
 */
export function evaluateHydroImpactReachability(request: HydroImpactReachabilityRequest): HydroImpactReachabilityResult {
  const nodes = new Map<string, HydroImpactNode>();
  const duplicateNodeIds = new Set<string>();
  for (const node of request.graph.nodes) {
    if (!isValidNode(node)) continue;
    if (nodes.has(node.id)) duplicateNodeIds.add(node.id);
    else nodes.set(node.id, node);
  }
  for (const id of duplicateNodeIds) nodes.delete(id);

  const reasons = new Set<HydroImpactReason>();
  if (duplicateNodeIds.size > 0) reasons.add("DUPLICATE_NODE_ID");
  if (duplicateNodeIds.has(request.sourceNodeId)) {
    return {
      policyVersion: HYDRO_IMPACT_GRAPH_POLICY_VERSION,
      topologyRevision: request.graph.topologyRevision,
      status: "UNKNOWN",
      relations: [],
      reasons: [...reasons],
    };
  }
  const source = nodes.get(request.sourceNodeId);
  if (!source) {
    return {
      policyVersion: HYDRO_IMPACT_GRAPH_POLICY_VERSION,
      topologyRevision: request.graph.topologyRevision,
      status: "UNKNOWN",
      relations: [],
      reasons: [...reasons, "SOURCE_NODE_NOT_FOUND"],
    };
  }

  const targetNodeIds = request.targetNodeIds === undefined ? undefined : new Set(request.targetNodeIds);
  if (targetNodeIds && [...targetNodeIds].some(targetId => !nodes.has(targetId))) reasons.add("TARGET_NODE_NOT_FOUND");

  const validEdges: HydroImpactEdge[] = [];
  const seenEdgeIds = new Set<string>();
  const invalidEdgesByNode = new Map<string, number>();
  for (const edge of request.graph.edges) {
    if (isValidEdge(edge, nodes, seenEdgeIds)) {
      validEdges.push(edge);
      seenEdgeIds.add(edge.id);
      continue;
    }
    for (const nodeId of [edge.fromNodeId, edge.toNodeId]) {
      if (nodes.has(nodeId)) invalidEdgesByNode.set(nodeId, (invalidEdgesByNode.get(nodeId) ?? 0) + 1);
    }
  }

  const edgesByNode = new Map<string, HydroImpactEdge[]>();
  for (const edge of validEdges) {
    for (const nodeId of [edge.fromNodeId, edge.toNodeId]) {
      const current = edgesByNode.get(nodeId) ?? [];
      current.push(edge);
      edgesByNode.set(nodeId, current);
    }
  }
  for (const edges of edgesByNode.values()) edges.sort((left, right) => left.id.localeCompare(right.id));

  const maxNodes = readLimit(request.limits?.maxNodes, DEFAULT_MAX_NODES);
  const maxEdges = readLimit(request.limits?.maxEdges, DEFAULT_MAX_EDGES);
  const maxDepth = readLimit(request.limits?.maxDepth, DEFAULT_MAX_DEPTH);
  const queue: TraversalStep[] = [{ nodeId: source.id, depth: 0, edgeIds: [], sourceRefs: [] }];
  const visited = new Set<string>([source.id]);
  const relations: HydroImpactRelation[] = [];
  let examinedEdges = 0;

  for (let cursor = 0; cursor < queue.length; cursor += 1) {
    const current = queue[cursor]!;
    if (invalidEdgesByNode.has(current.nodeId)) reasons.add("INVALID_EDGE_IGNORED");
    const edges = edgesByNode.get(current.nodeId) ?? [];
    for (const edge of edges) {
      if (examinedEdges >= maxEdges) {
        reasons.add("EDGE_BUDGET_EXCEEDED");
        break;
      }
      examinedEdges += 1;

      if (edge.direction === "UNKNOWN") reasons.add("UNKNOWN_FLOW_DIRECTION");
      if (edge.operation === "UNKNOWN") reasons.add("UNKNOWN_OPERATION_STATE");
      if (edge.operation === "CLOSED") reasons.add("CLOSED_OPERATION");
      if (edge.direction === "UNKNOWN" || edge.operation !== "OPEN") continue;

      const nextNodeId = nextNodeFor(edge, current.nodeId, request.direction);
      if (!nextNodeId || visited.has(nextNodeId)) continue;
      if (current.depth >= maxDepth) {
        reasons.add("DEPTH_BUDGET_EXCEEDED");
        continue;
      }
      if (visited.size >= maxNodes) {
        reasons.add("NODE_BUDGET_EXCEEDED");
        continue;
      }

      const nextNode = nodes.get(nextNodeId)!;
      const nextStep: TraversalStep = {
        nodeId: nextNodeId,
        depth: current.depth + 1,
        edgeIds: [...current.edgeIds, edge.id],
        sourceRefs: sortUnique([...current.sourceRefs, edge.sourceRef]),
      };
      visited.add(nextNodeId);
      queue.push(nextStep);

      if (targetNodeIds === undefined || targetNodeIds.has(nextNodeId)) {
        relations.push({
          relation: relationType(request.direction),
          sourceNodeId: source.id,
          targetNodeId: nextNodeId,
          hopCount: nextStep.depth,
          edgeIds: nextStep.edgeIds,
          topologyRevision: request.graph.topologyRevision,
          sourceRefs: nextStep.sourceRefs,
          provinceCrossing: source.provinceRef !== undefined && nextNode.provinceRef !== undefined && source.provinceRef !== nextNode.provinceRef,
          certainty: "STRUCTURAL_POSSIBILITY_ONLY",
        });
      }
    }
  }

  if (relations.length === 0 && reasons.size === 0) reasons.add("NO_CONNECTED_PATH");
  const orderedRelations = relations.sort((left, right) => left.hopCount - right.hopCount || left.targetNodeId.localeCompare(right.targetNodeId));
  const orderedReasons = sortUnique(reasons);
  return {
    policyVersion: HYDRO_IMPACT_GRAPH_POLICY_VERSION,
    topologyRevision: request.graph.topologyRevision,
    status: orderedReasons.length === 0 || (orderedReasons.length === 1 && orderedReasons[0] === "NO_CONNECTED_PATH") ? "COMPLETE" : "PARTIAL",
    relations: orderedRelations,
    reasons: orderedReasons,
  };
}
