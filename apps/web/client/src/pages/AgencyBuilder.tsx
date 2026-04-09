import { useState, useCallback, useMemo, useEffect, useRef } from "react";
import { useRoute, useLocation } from "wouter";
import ReactFlow, {
  ReactFlowProvider,
  addEdge,
  useNodesState,
  useEdgesState,
  useReactFlow,
  Controls,
  MiniMap,
  Background,
  BackgroundVariant,
  MarkerType,
  type Node,
  type Edge,
  type Connection,
  type NodeTypes,
  type EdgeTypes,
} from "reactflow";
import "reactflow/dist/style.css";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import { pickEnabledModelId } from "@/lib/enabledModelSelection";
import { useAuth } from "@/contexts/AuthContext";
import { BaseAgencyNode } from "@/components/agency/nodes/BaseAgencyNode";
import type { AgencyNodeData } from "@/components/agency/nodes/types";
import { CommunicationEdge } from "@/components/agency/CommunicationEdge";
import { NodePropertyPanel } from "@/components/agency/NodePropertyPanel";
import { AgencyToolbar } from "@/components/agency/AgencyToolbar";
import { AgencySidebar } from "@/components/agency/AgencySidebar";
import { AgencyVersionHistory } from "@/components/agency/AgencyVersionHistory";
import { RunHistoryPanel } from "@/components/agency/RunHistoryPanel";
import { AutoCreateAgencyModal } from "@/components/agency/AutoCreateAgencyModal";
import {
  applySpecialEdgeConnection,
  buildSpecialFlowEdges,
  isSpecialFlowNodeType,
  removeNodeConfigReferences,
  removeSpecialEdgeTargets,
  specialEdgesEquivalent,
} from "@/components/agency/nodeGraphSync";
import { useAgencyValidation } from "@/hooks/useAgencyValidation";
import { useAgencyHistory } from "@/hooks/useAgencyHistory";
import { Loader2, Network, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { getNodeSupport } from "@/components/agency/hybridNodeSupport";
import { useScopedTranslation } from "@/i18n/useScopedTranslation";
import { useTenantFeatureFlags } from "@/hooks/useTenantFeatureFlag";

type AgencyWorkflowEngine = "agency_swarm" | "adk2";
type AgencyCompileMode = "legacy_agency" | "strict" | "assist";
type AgencyCompatibilityMode = "preserve_agency_swarm" | "hybrid";

interface AgencySubgraphDocument {
  id: string;
  name: string;
  engine: AgencyWorkflowEngine;
  entryNodeIds: string[];
  exitNodeIds: string[];
  nodeIds: string[];
  boundaryPolicy?: Record<string, unknown> | null;
}

interface ViewportState {
  x: number;
  y: number;
  zoom: number;
}

interface UpgradeAnalysisState {
  current: any | null;
  proposed: any | null;
  proposedSubgraphs: AgencySubgraphDocument[];
}

function buildSubgraphDocument(
  nodes: Node<AgencyNodeData>[],
  edges: Edge[],
  id: string,
  name: string,
  engine: AgencyWorkflowEngine,
): AgencySubgraphDocument {
  const nodeIds = nodes.map((node) => node.id);
  const outgoing = new Set(edges.map((edge) => edge.source));
  return {
    id,
    name,
    engine,
    entryNodeIds: nodes
      .filter((node) => node.data.isEntryPoint)
      .map((node) => node.id),
    exitNodeIds: nodes
      .filter((node) => !outgoing.has(node.id))
      .map((node) => node.id),
    nodeIds,
    boundaryPolicy: null,
  };
}

function dedupeIds(values: string[]): string[] {
  return [...new Set(values.filter((value) => value.length > 0))];
}

function buildSyncedSubgraphDocuments(
  subgraphs: AgencySubgraphDocument[],
  nodes: Node<AgencyNodeData>[],
  edges: Edge[],
  defaultEngine: AgencyWorkflowEngine,
): AgencySubgraphDocument[] {
  const fallbackSubgraphId = subgraphs[0]?.id ?? "sg_root_legacy";
  const baseSubgraphs = subgraphs.length > 0
    ? subgraphs
    : [buildSubgraphDocument(nodes, edges, fallbackSubgraphId, "Primary Subgraph", defaultEngine)];

  return baseSubgraphs.map((subgraph, index) => {
    const effectiveSubgraphId = subgraph.id || `sg_${index + 1}`;
    const assignedNodeIds = nodes
      .filter((node) => (node.data.subgraphId ?? fallbackSubgraphId) === effectiveSubgraphId)
      .map((node) => node.id);
    const assignedNodeSet = new Set(assignedNodeIds);

    const internalOutgoing = new Set(
      edges
        .filter((edge) => assignedNodeSet.has(edge.source) && assignedNodeSet.has(edge.target))
        .map((edge) => edge.source),
    );
    const incomingBoundaryTargets = edges
      .filter((edge) => assignedNodeSet.has(edge.target) && !assignedNodeSet.has(edge.source))
      .map((edge) => edge.target);
    const outgoingBoundarySources = edges
      .filter((edge) => assignedNodeSet.has(edge.source) && !assignedNodeSet.has(edge.target))
      .map((edge) => edge.source);

    return {
      ...subgraph,
      id: effectiveSubgraphId,
      name: subgraph.name || `Subgraph ${index + 1}`,
      engine: subgraph.engine ?? defaultEngine,
      nodeIds: dedupeIds(assignedNodeIds),
      entryNodeIds: dedupeIds([
        ...nodes
          .filter((node) => node.data.isEntryPoint && assignedNodeSet.has(node.id))
          .map((node) => node.id),
        ...incomingBoundaryTargets,
      ]),
      exitNodeIds: dedupeIds([
        ...assignedNodeIds.filter((nodeId) => !internalOutgoing.has(nodeId)),
        ...outgoingBoundarySources,
      ]),
      boundaryPolicy: subgraph.boundaryPolicy ?? null,
    };
  });
}

function autoLayout(nodes: Node<AgencyNodeData>[], edges: Edge[]): Node<AgencyNodeData>[] {
  if (nodes.length === 0) return nodes;

  // Simple top-to-bottom tree layout without dagre
  const adjacency = new Map<string, string[]>();
  const hasIncoming = new Set<string>();

  for (const edge of edges) {
    if (!adjacency.has(edge.source)) adjacency.set(edge.source, []);
    adjacency.get(edge.source)!.push(edge.target);
    hasIncoming.add(edge.target);
  }

  // Find roots (no incoming edges)
  const roots = nodes.filter((n) => !hasIncoming.has(n.id)).map((n) => n.id);
  if (roots.length === 0) roots.push(nodes[0].id);

  // BFS to assign levels (with visited tracking to handle cycles)
  const levels = new Map<string, number>();
  const visited = new Set<string>();
  const queue = roots.map((id) => ({ id, level: 0 }));
  for (const root of roots) {
    levels.set(root, 0);
    visited.add(root);
  }

  while (queue.length > 0) {
    const { id, level } = queue.shift()!;
    for (const child of adjacency.get(id) ?? []) {
      if (!visited.has(child)) {
        visited.add(child);
        levels.set(child, level + 1);
        queue.push({ id: child, level: level + 1 });
      }
    }
  }

  // Assign default level to unvisited nodes
  for (const node of nodes) {
    if (!levels.has(node.id)) {
      levels.set(node.id, 0);
    }
  }

  // Group by level
  const levelGroups = new Map<number, string[]>();
  for (const [id, level] of levels) {
    if (!levelGroups.has(level)) levelGroups.set(level, []);
    levelGroups.get(level)!.push(id);
  }

  const NODE_WIDTH = 240;
  const NODE_HEIGHT = 100;
  const H_GAP = 40;
  const V_GAP = 60;

  const nodeMap = new Map(nodes.map((n) => [n.id, n]));
  const updated: Node<AgencyNodeData>[] = [];

  for (const [level, ids] of levelGroups) {
    const totalWidth = ids.length * NODE_WIDTH + (ids.length - 1) * H_GAP;
    const startX = -totalWidth / 2;

    ids.forEach((id, i) => {
      const node = nodeMap.get(id);
      if (node) {
        updated.push({
          ...node,
          position: {
            x: startX + i * (NODE_WIDTH + H_GAP),
            y: level * (NODE_HEIGHT + V_GAP),
          },
        });
        nodeMap.delete(id);
      }
    });
  }

  // Include any remaining nodes
  for (const node of nodeMap.values()) {
    updated.push(node);
  }

  return updated;
}

function resolveNodeEngine(
  node: Node<AgencyNodeData>,
  subgraphs: AgencySubgraphDocument[],
  defaultEngine: AgencyWorkflowEngine,
): AgencyWorkflowEngine {
  if (node.data.subgraphId) {
    const subgraph = subgraphs.find((entry) => entry.id === node.data.subgraphId);
    if (subgraph) {
      return subgraph.engine;
    }
  }
  return node.data.engineHint ?? defaultEngine;
}

function createCommunicationEdge(
  source: string,
  target: string,
  options?: {
    sourceHandle?: string | null;
    color?: string;
    flowType?: "delegation" | "handoff" | "parallel";
  },
): Edge {
  const color = options?.color ?? "#3b82f6";
  return {
    id: `e-${source}-${target}-${options?.sourceHandle ?? "out"}-${Date.now().toString(36)}`,
    source,
    target,
    sourceHandle: options?.sourceHandle ?? undefined,
    type: "communication",
    data: { flowType: options?.flowType ?? "delegation" },
    markerEnd: { type: MarkerType.ArrowClosed, color },
    style: { stroke: color, strokeWidth: 2 },
  };
}

function getSubgraphOverlayLayout(
  nodes: Node<AgencyNodeData>[],
  subgraphs: AgencySubgraphDocument[],
) {
  const NODE_WIDTH = 260;
  const NODE_HEIGHT = 110;
  const PADDING = 48;

  return subgraphs.map((subgraph) => {
    const assignedNodes = nodes.filter((node) => (node.data.subgraphId ?? subgraphs[0]?.id) === subgraph.id);
    if (assignedNodes.length === 0) {
      return null;
    }

    const minX = Math.min(...assignedNodes.map((node) => node.position.x));
    const minY = Math.min(...assignedNodes.map((node) => node.position.y));
    const maxX = Math.max(...assignedNodes.map((node) => node.position.x + NODE_WIDTH));
    const maxY = Math.max(...assignedNodes.map((node) => node.position.y + NODE_HEIGHT));

    return {
      ...subgraph,
      x: minX - PADDING,
      y: minY - PADDING,
      width: Math.max(220, maxX - minX + PADDING * 2),
      height: Math.max(180, maxY - minY + PADDING * 2),
    };
  }).filter((entry): entry is NonNullable<typeof entry> => entry !== null);
}

function AgencyCanvas() {
  const { t } = useScopedTranslation("agency");
  const [, setLocation] = useLocation();
  const [matched, params] = useRoute("/agencies/:id/edit");
  const agencyId = (params as Record<string, string>)?.id as string | undefined;
  const isNew = agencyId === "new";

  const [nodes, setNodes, onNodesChange] = useNodesState<AgencyNodeData>([]);
  const [edges, setEdges, onEdgesChangeBase] = useEdgesState([]);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);

  // Wrap onEdgesChange to auto-remove Router routes when edges are deleted
  const onEdgesChange = useCallback(
    (changes: any[]) => {
      onEdgesChangeBase(changes);

      // Find removed edges
      const removals = changes.filter((c: any) => c.type === "remove");
      if (removals.length === 0) return;

      // Get the IDs of removed edges, then find which were from router nodes
      const removedIds = new Set(removals.map((r: any) => r.id));
      const removedEdges = edges.filter((e) => removedIds.has(e.id));

      if (removedEdges.length === 0) return;

      setNodes((currentNodes) => removeSpecialEdgeTargets(currentNodes, removedEdges as Edge[]));
    },
    [onEdgesChangeBase, edges, setNodes],
  );
  const [agencyName, setAgencyName] = useState("");
  const [agencyStatus, setAgencyStatus] = useState<"draft" | "published" | "archived">("draft");
  const [defaultModel, setDefaultModel] = useState("");
  const [documentVersion, setDocumentVersion] = useState(1);
  const [defaultEngine, setDefaultEngine] = useState<AgencyWorkflowEngine>("agency_swarm");
  const [compileMode, setCompileMode] = useState<AgencyCompileMode>("legacy_agency");
  const [compatibilityMode, setCompatibilityMode] = useState<AgencyCompatibilityMode>("preserve_agency_swarm");
  const [subgraphs, setSubgraphs] = useState<AgencySubgraphDocument[]>([]);
  const [compilePreview, setCompilePreview] = useState<any>(null);
  const [viewport, setViewport] = useState<ViewportState>({ x: 0, y: 0, zoom: 1 });
  const [upgradeDialogOpen, setUpgradeDialogOpen] = useState(false);
  const [upgradeAnalysis, setUpgradeAnalysis] = useState<UpgradeAnalysisState | null>(null);
  const [upgradeAnalysisLoading, setUpgradeAnalysisLoading] = useState(false);
  const [creatorFeeCredits, setCreatorFeeCredits] = useState(0);
  const tenantFlags = useTenantFeatureFlags();
  const hybridRuntimeEnabled = tenantFlags.agencyHybridAdk;
  const hybridKillSwitchActive = tenantFlags.agencyHybridAdkKillSwitch;
  const { data: llmModelsData } = trpc.llmProviders.availableModels.useQuery(undefined, {
    staleTime: 60_000,
  });
  const enabledAgencyModelIds = useMemo(
    () => (llmModelsData?.models ?? []).map((model) => model.id),
    [llmModelsData?.models],
  );
  const defaultAgencyModelId = useMemo(() => {
    const defaultModelOption = llmModelsData?.models?.find((model) => model.isDefault);
    return defaultModelOption?.id || llmModelsData?.models?.[0]?.id || "";
  }, [llmModelsData?.models]);
  // useReactFlow() is more reliable than onInit — always returns the live instance from context
  const rfInstance = useReactFlow();
  const [versionHistoryOpen, setVersionHistoryOpen] = useState(false);
  const [runHistoryOpen, setRunHistoryOpen] = useState(false);
  const [autoCreateOpen, setAutoCreateOpen] = useState(false);
  const canvasInitRef = useRef(false);
  const nodeCounterRef = useRef(0);
  const primarySubgraphId = subgraphs[0]?.id ?? "sg_root_legacy";
  const syncedSubgraphs = useMemo(
    () => buildSyncedSubgraphDocuments(subgraphs, nodes, edges, defaultEngine),
    [defaultEngine, edges, nodes, subgraphs],
  );
  const hybridDocumentEnabled = useMemo(
    () => (
      documentVersion >= 2
      || compatibilityMode === "hybrid"
      || defaultEngine === "adk2"
      || subgraphs.some((subgraph) => subgraph.engine === "adk2")
      || subgraphs.length > 1
    ),
    [compatibilityMode, defaultEngine, documentVersion, subgraphs],
  );

  // Validation + history
  const validationErrors = useAgencyValidation(nodes, edges, {
    subgraphs: syncedSubgraphs.map((subgraph) => ({
      id: subgraph.id,
      name: subgraph.name,
      engine: subgraph.engine,
    })),
    defaultEngine,
  });
  const { snapshot, undo, redo, canUndo, canRedo } = useAgencyHistory();

  // Keep validation errors synced onto node data.
  // IMPORTANT: must return `nds` (same reference) when nothing changed to prevent
  // infinite re-render loop: setNodes → nodes change → useMemo recomputes Map →
  // effect fires → setNodes → ...
  useEffect(() => {
    setNodes((nds) => {
      let changed = false;
      const updated = nds.map((n) => {
        const errs = validationErrors.get(n.id) ?? [];
        if (JSON.stringify(n.data.validationErrors) === JSON.stringify(errs)) return n;
        changed = true;
        return { ...n, data: { ...n.data, validationErrors: errs } };
      });
      return changed ? updated : nds; // return original ref when no change → React bails out
    });
  }, [validationErrors, setNodes]);

  useEffect(() => {
    setEdges((currentEdges) => {
      const nextEdges = buildSpecialFlowEdges(nodes, currentEdges);
      return specialEdgesEquivalent(currentEdges, nextEdges) ? currentEdges : nextEdges;
    });
  }, [nodes, setEdges]);

  const subgraphOverlayLayout = useMemo(
    () => getSubgraphOverlayLayout(nodes, syncedSubgraphs),
    [nodes, syncedSubgraphs],
  );

  const liveValidationSummary = useMemo(() => (
    nodes.flatMap((node) => {
      const messages = validationErrors.get(node.id) ?? [];
      return messages.map((message) => ({
        nodeId: node.id,
        nodeName: node.data.name,
        severity: message.includes("not supported") ? "error" as const : "warning" as const,
        message,
      }));
    })
  ), [nodes, validationErrors]);

  const liveCapabilityWarnings = useMemo(() => (
    nodes.flatMap((node) => {
      const engine = resolveNodeEngine(node, syncedSubgraphs, defaultEngine);
      const support = getNodeSupport(node.data.nodeType ?? "agent", engine);
      if (support !== "emulated" && support !== "compatible") {
        return [];
      }
      return [{
        nodeId: node.id,
        nodeName: node.data.name,
        severity: "warning" as const,
        message: `${node.data.name} runs as ${support} on ${engine}.`,
      }];
    })
  ), [defaultEngine, nodes, syncedSubgraphs]);

  // Snapshot on meaningful changes (debounced inside the hook)
  useEffect(() => {
    if (nodes.length > 0 || edges.length > 0) {
      snapshot(nodes, edges);
    }
  }, [nodes, edges, snapshot]);

  // Auth check
  const { isLoading: authLoading, isAuthenticated } = useAuth();
  useEffect(() => {
    if (!authLoading && !isAuthenticated) {
      setLocation("/login");
    }
  }, [authLoading, isAuthenticated, setLocation]);

  // Load existing agency
  const { data: agencyData, isLoading: agencyLoading } = (
    trpc as any
  ).agency.getById.useQuery(
    { id: agencyId },
    {
      enabled: !!agencyId && !isNew,
      staleTime: Infinity,
      refetchOnWindowFocus: false,
      refetchOnReconnect: false,
    },
  );

  // Permission: can the current user edit this agency?
  const canEdit = isNew || (agencyData?.canEdit ?? true);

  // Hydrate canvas from loaded data
  useEffect(() => {
    if (!agencyData || canvasInitRef.current) return;
    canvasInitRef.current = true;

    setAgencyName(agencyData.name ?? "");
    setAgencyStatus(agencyData.status ?? "draft");
    setDefaultModel(agencyData.defaultModel ?? "");
    setDocumentVersion(agencyData.documentVersion ?? 1);
    setDefaultEngine(agencyData.defaultEngine ?? "agency_swarm");
    setCompileMode(agencyData.compileMode ?? "legacy_agency");
    setCompatibilityMode(agencyData.compatibilityMode ?? "preserve_agency_swarm");
    setSubgraphs(agencyData.subgraphs ?? []);
    setCreatorFeeCredits(agencyData.creatorFeeCredits ?? 0);

    // Convert agents to nodes
    const rawAgents = agencyData.agents ?? [];
    const agentNodes: Node<AgencyNodeData>[] = rawAgents.map(
      (agent: any, idx: number) => {
        let pos = agent.position ?? { x: 0, y: 0 };
        // Auto-layout: if all positions are identical (e.g. all {0,0}),
        // spread nodes vertically so they don't overlap
        const allSamePos = rawAgents.length > 1 && rawAgents.every(
          (a: any) => (a.position?.x ?? 0) === (rawAgents[0].position?.x ?? 0)
            && (a.position?.y ?? 0) === (rawAgents[0].position?.y ?? 0),
        );
        if (allSamePos) {
          pos = { x: 400, y: 80 + idx * 200 };
        }
        return {
          id: agent.id,
          type: "agency",
          position: pos,
          data: {
            nodeType: agent.nodeType ?? "agent",
            name: agent.name,
            description: agent.description ?? "",
            instructions: agent.instructions ?? "",
            model: agent.model ?? "",
            modelRequirements: agent.nodeConfig?.modelRequirements ?? undefined,
            modelSettings: agent.modelSettings ?? {},
            isEntryPoint: agent.isEntryPoint ?? false,
            isOptional: agent.isOptional ?? false,
            nodeConfig: agent.nodeConfig ?? {},
            tools: (agencyData.agentToolAssignments ?? [])
              .filter((t: any) => t.agentId === agent.id)
              .map((t: any) => ({ toolId: t.toolId, toolName: t.toolName ?? t.toolId, toolConfig: t.toolConfig ?? {} })),
            examples: agent.examples ?? undefined,
            outputSchema: agent.outputSchema ?? undefined,
            parallelToolCalls: agent.parallelToolCalls,
            maxTurns: agent.maxTurns,
            subgraphId: agent.subgraphId ?? null,
            engineHint: agent.engineHint ?? null,
            runtimeConfig: agent.runtimeConfig ?? null,
          },
        };
      },
    );

    // Convert flows to edges, then rehydrate special flow handles from nodeConfig.
    const flowEdges: Edge[] = (agencyData.communicationFlows ?? []).map(
      (flow: any) => ({
        id: flow.id,
        source: flow.fromAgentId,
        target: flow.toAgentId,
        type: "communication",
        data: { flowType: flow.flowType ?? "delegation" },
        markerEnd: { type: MarkerType.ArrowClosed },
      }),
    );

    setNodes(agentNodes);
    setEdges(buildSpecialFlowEdges(agentNodes, flowEdges));
    nodeCounterRef.current = agentNodes.length;
  }, [agencyData, setNodes, setEdges]);

  useEffect(() => {
    if (!llmModelsData?.models) {
      return;
    }

    if (enabledAgencyModelIds.length === 0) {
      if (defaultModel) {
        setDefaultModel("");
      }
      return;
    }

    const nextModelId = pickEnabledModelId({
      preferredId: defaultModel,
      allowedIds: enabledAgencyModelIds,
      fallbackIds: [defaultAgencyModelId],
    });

    if (nextModelId !== defaultModel) {
      setDefaultModel(nextModelId);
    }
  }, [defaultAgencyModelId, defaultModel, enabledAgencyModelIds, llmModelsData?.models]);

  // Node and edge types (memoized to prevent React Flow re-renders)
  const nodeTypes: NodeTypes = useMemo(
    () => ({ agency: BaseAgencyNode }),
    [],
  );

  const edgeTypes: EdgeTypes = useMemo(
    () => ({ communication: CommunicationEdge as any }),
    [],
  );

  const insertEngineBoundaryBridge = useCallback((connection: Connection) => {
    if (!connection.source || !connection.target) {
      return false;
    }

    const sourceNode = nodes.find((node) => node.id === connection.source);
    const targetNode = nodes.find((node) => node.id === connection.target);
    if (!sourceNode || !targetNode) {
      return false;
    }

    if (sourceNode.data.nodeType === "engine_boundary" || targetNode.data.nodeType === "engine_boundary") {
      return false;
    }

    const sourceSubgraphId = sourceNode.data.subgraphId ?? primarySubgraphId;
    const targetSubgraphId = targetNode.data.subgraphId ?? primarySubgraphId;
    const sourceEngine = resolveNodeEngine(sourceNode, syncedSubgraphs, defaultEngine);
    const targetEngine = resolveNodeEngine(targetNode, syncedSubgraphs, defaultEngine);

    if (sourceEngine === targetEngine || sourceSubgraphId === targetSubgraphId) {
      return false;
    }

    const boundaryId = typeof crypto !== "undefined" && crypto.randomUUID
      ? crypto.randomUUID()
      : `boundary-${Date.now().toString(36)}`;
    const boundaryName = `Boundary ${sourceNode.data.name} -> ${targetNode.data.name}`;
    const sourceCenterX = sourceNode.position.x + 130;
    const sourceCenterY = sourceNode.position.y + 55;
    const targetCenterX = targetNode.position.x + 130;
    const targetCenterY = targetNode.position.y + 55;

    const boundaryNode: Node<AgencyNodeData> = {
      id: boundaryId,
      type: "agency",
      position: {
        x: Math.round((sourceCenterX + targetCenterX) / 2 - 120),
        y: Math.round((sourceCenterY + targetCenterY) / 2 - 45),
      },
      data: {
        nodeType: "engine_boundary",
        name: boundaryName,
        description: `Bridge from ${sourceSubgraphId} (${sourceEngine}) to ${targetSubgraphId} (${targetEngine})`,
        nodeConfig: {
          bridgeMode: "sync",
          inputContract: `${sourceSubgraphId}_to_${targetSubgraphId}_input`,
          outputContract: `${sourceSubgraphId}_to_${targetSubgraphId}_output`,
          sourceSubgraphId,
          sourceEngine,
          targetSubgraphId,
          targetEngine,
        },
        subgraphId: sourceSubgraphId,
        engineHint: sourceEngine,
        runtimeConfig: {
          timeoutMs: 120000,
        },
      },
    };

    setNodes((currentNodes) => {
      const withBoundary = [...currentNodes, boundaryNode];
      if (isSpecialFlowNodeType(sourceNode.data.nodeType)) {
        return applySpecialEdgeConnection(withBoundary, {
          ...connection,
          target: boundaryId,
        });
      }
      return withBoundary;
    });

    setEdges((currentEdges) => {
      const nextEdges = [...currentEdges];
      if (!isSpecialFlowNodeType(sourceNode.data.nodeType)) {
        nextEdges.push(createCommunicationEdge(
          sourceNode.id,
          boundaryId,
          { sourceHandle: connection.sourceHandle ?? null },
        ));
      }
      nextEdges.push(createCommunicationEdge(boundaryId, targetNode.id, { color: "#7c3aed" }));
      return nextEdges;
    });

    setSelectedNodeId(boundaryId);
    toast.info("Inserted an engine boundary for the cross-engine handoff.");
    return true;
  }, [defaultEngine, nodes, primarySubgraphId, setEdges, setNodes, syncedSubgraphs]);

  // Handlers
  const onConnect = useCallback(
    (connection: Connection) => {
      const sourceNode = nodes.find((node) => node.id === connection.source);
      if (insertEngineBoundaryBridge(connection)) {
        return;
      }
      if (isSpecialFlowNodeType(sourceNode?.data.nodeType)) {
        setNodes((currentNodes) => applySpecialEdgeConnection(currentNodes, connection));
        return;
      }

      // Determine edge color based on Router handle
      const handleId = connection.sourceHandle; // "true" | "false" | "default" | null
      let edgeColor = "#3b82f6"; // default blue
      if (handleId === "true") edgeColor = "#22c55e"; // green
      else if (handleId === "false") edgeColor = "#ef4444"; // red

      const newEdge = {
        ...connection,
        id: `e-${connection.source}-${connection.target}-${handleId ?? "out"}-${Date.now()}`,
        type: "communication",
        data: { flowType: "delegation" as const },
        markerEnd: { type: MarkerType.ArrowClosed, color: edgeColor },
        style: { stroke: edgeColor, strokeWidth: 2 },
      };
      setEdges((eds) => addEdge(newEdge, eds));
    },
    [insertEngineBoundaryBridge, nodes, setEdges, setNodes],
  );

  const onNodeClick = useCallback((_: any, node: Node) => {
    setSelectedNodeId(node.id);
  }, []);

  const onPaneClick = useCallback(() => {
    setSelectedNodeId(null);
  }, []);

  // -- Add node from sidebar (click or drag) --
  const NODE_WIDTH = 260;
  const NODE_HEIGHT = 100;
  const NODE_GAP = 40;

  const addNodeFromTemplate = useCallback((templateData: {
    nodeType?: string; name?: string; description?: string;
    instructions?: string; defaultModel?: string; isEntryPoint?: boolean;
    defaultTools?: unknown[]; nodeConfig?: Record<string, unknown>;
  }) => {
    const newNodeId = typeof crypto !== 'undefined' && crypto.randomUUID
      ? crypto.randomUUID()
      : `agent-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;

    // Find a non-overlapping position below the lowest existing node
    const currentNodes = rfInstance.getNodes();
    let posX = 400;
    let posY = 80;

    if (currentNodes.length > 0) {
      // Find the bottom-most node and place new one below it
      let maxBottom = -Infinity;
      let bottomNodeX = 400;
      for (const n of currentNodes) {
        const bottom = n.position.y + NODE_HEIGHT;
        if (bottom > maxBottom) {
          maxBottom = bottom;
          bottomNodeX = n.position.x;
        }
      }
      posX = bottomNodeX;
      posY = maxBottom + NODE_GAP + 60;
    }

    const newNode: Node<AgencyNodeData> = {
      id: newNodeId,
      type: "agency",
      position: { x: posX, y: posY },
      data: {
        nodeType: (templateData.nodeType as AgencyNodeData["nodeType"]) ?? "agent",
        name: templateData.name || t("builder.defaults.newAgent"),
        description: templateData.description || "",
        instructions: templateData.instructions || "",
        model: templateData.defaultModel || undefined,
        modelRequirements: templateData.defaultModel ? undefined : { strategy: "balanced" },
        modelSettings: {},
        isEntryPoint: templateData.isEntryPoint || false,
        isOptional: false,
        tools: (templateData.defaultTools as AgencyNodeData["tools"]) || [],
        nodeConfig: templateData.nodeConfig || {},
        subgraphId: hybridDocumentEnabled ? primarySubgraphId : null,
        engineHint: hybridDocumentEnabled ? (syncedSubgraphs[0]?.engine ?? defaultEngine) : null,
        runtimeConfig: null,
      },
    };

    setNodes((nds) => {
      // First node auto-becomes entry point
      if (nds.length === 0) {
        newNode.data.isEntryPoint = true;
      }
      if (newNode.data.isEntryPoint) {
        return [...nds.map(n => ({ ...n, data: { ...n.data, isEntryPoint: false } })), newNode];
      }
      return [...nds, newNode];
    });
    setSelectedNodeId(newNode.id);

    // Scroll viewport to center on the new node
    setTimeout(() => {
      rfInstance.setCenter(posX + NODE_WIDTH / 2, posY + NODE_HEIGHT / 2, {
        zoom: rfInstance.getZoom(),
        duration: 300,
      });
    }, 50);
  }, [setNodes, defaultModel, rfInstance, t, defaultEngine, hybridDocumentEnabled, primarySubgraphId, syncedSubgraphs]);

  // Drag & drop — React props on <ReactFlow> matching WorkflowEditor pattern
  const onDragOver = useCallback((event: React.DragEvent) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
  }, []);

  const onDrop = useCallback(
    (event: React.DragEvent) => {
      event.preventDefault();
      const templateDataStr = event.dataTransfer.getData("application/templateData");
      if (!templateDataStr) return;

      try {
        const parsedTemplate = JSON.parse(templateDataStr);
        addNodeFromTemplate(parsedTemplate);
      } catch {
        // ignore malformed data
      }
    },
    [addNodeFromTemplate],
  );

  const handleAddAgent = useCallback(() => {
    addNodeFromTemplate({ nodeType: "agent", name: t("builder.defaults.newAgent") });
  }, [addNodeFromTemplate, t]);

  const handleNodeDataChange = useCallback(
    (nodeId: string, updates: Partial<AgencyNodeData>) => {
      const resolvedEngineHint = typeof updates.subgraphId === "string"
        ? (syncedSubgraphs.find((subgraph) => subgraph.id === updates.subgraphId)?.engine ?? updates.engineHint ?? defaultEngine)
        : updates.engineHint;
      setNodes((nds) =>
        nds.map((node) => {
          if (node.id !== nodeId) {
            // If entry point toggled on for this node, toggle off others
            if (updates.isEntryPoint) {
              return {
                ...node,
                data: { ...node.data, isEntryPoint: false },
              };
            }
            return node;
          }
          return {
            ...node,
            data: {
              ...node.data,
              ...updates,
              ...(typeof resolvedEngineHint !== "undefined" ? { engineHint: resolvedEngineHint } : {}),
            },
          };
        }),
      );
    },
    [defaultEngine, setNodes, syncedSubgraphs],
  );

  const handleDeleteNode = useCallback(
    (nodeId: string) => {
      setNodes((currentNodes) => removeNodeConfigReferences(
        currentNodes.filter((node) => node.id !== nodeId),
        nodeId,
      ));
      setEdges((eds) =>
        eds.filter((e) => e.source !== nodeId && e.target !== nodeId),
      );
      setSelectedNodeId(null);
    },
    [setNodes, setEdges],
  );

  // Save mutations
  const utils = trpc.useUtils();
  const createMutation = (trpc as any).agency.create.useMutation();
  const saveBuilderMutation = (trpc as any).agency.saveBuilder.useMutation();
  const updateMutation = (trpc as any).agency.update.useMutation();
  const compilePreviewMutationFactory = (trpc as any).agency.compilePreview?.useMutation;
  const compilePreviewMutation = compilePreviewMutationFactory
    ? compilePreviewMutationFactory()
    : {
      mutateAsync: async () => null,
      isPending: false,
    };

  const serializeGraph = useCallback(() => {
    const effectiveSubgraphs = syncedSubgraphs;
    const fallbackSubgraphId = effectiveSubgraphs[0]?.id;
    const subgraphEngineMap = new Map(
      effectiveSubgraphs.map((subgraph) => [subgraph.id, subgraph.engine] as const),
    );

    const normalizedAgents = nodes.map((n) => {
      const resolvedSubgraphId = n.data.subgraphId ?? fallbackSubgraphId ?? undefined;
      const resolvedEngineHint = resolvedSubgraphId
        ? (subgraphEngineMap.get(resolvedSubgraphId) ?? n.data.engineHint ?? defaultEngine)
        : (n.data.engineHint ?? undefined);

      return {
        id: n.id,
        name: n.data.name,
        description: n.data.description || undefined,
        nodeType: n.data.nodeType ?? "agent",
        instructions: n.data.instructions || undefined,
        model: n.data.modelRequirements
          ? undefined
          : (n.data.model || (["agent", "supervisor"].includes(n.data.nodeType ?? "agent") ? (defaultModel || undefined) : undefined)),
        modelSettings: n.data.modelSettings,
        isEntryPoint: n.data.isEntryPoint ?? false,
        isOptional: n.data.isOptional ?? false,
        position: n.position,
        nodeConfig: {
          ...(n.data.nodeConfig || {}),
          ...(n.data.modelRequirements ? { modelRequirements: n.data.modelRequirements } : {}),
        } as Record<string, unknown>,
        toolIds: (n.data.tools ?? []).map((t) => t.toolId),
        toolConfigs: (n.data.tools ?? []).reduce(
          (acc, t) => {
            if (t.toolConfig && Object.keys(t.toolConfig).length > 0) acc[t.toolId] = t.toolConfig;
            return acc;
          },
          {} as Record<string, Record<string, unknown>>,
        ),
        examples: n.data.examples?.length ? n.data.examples : undefined,
        outputSchema: n.data.outputSchema ?? undefined,
        parallelToolCalls: n.data.parallelToolCalls,
        maxTurns: n.data.maxTurns,
        subgraphId: resolvedSubgraphId,
        engineHint: resolvedEngineHint,
        runtimeConfig: n.data.runtimeConfig ?? undefined,
      };
    });

    const communicationFlows = edges.map((e) => ({
      fromAgentName: nodes.find((n) => n.id === e.source)?.data.name ?? "",
      toAgentName: nodes.find((n) => n.id === e.target)?.data.name ?? "",
      flowType: (e.data?.flowType ?? "delegation") as "delegation" | "handoff" | "parallel",
    }));

    return {
      agents: normalizedAgents,
      communicationFlows,
      documentVersion,
      defaultEngine,
      compileMode,
      compatibilityMode,
      subgraphs: effectiveSubgraphs,
    };
  }, [
    nodes,
    edges,
    defaultModel,
    documentVersion,
    defaultEngine,
    compileMode,
    compatibilityMode,
    syncedSubgraphs,
  ]);

  const persistBuilderDraft = useCallback(async ({
    showToast,
    draftOverride,
    changeDescription,
  }: {
    showToast: boolean;
    draftOverride?: ReturnType<typeof serializeGraph>;
    changeDescription?: string;
  }) => {
    try {
      const {
        agents,
        communicationFlows,
        documentVersion: nextDocumentVersion,
        defaultEngine: nextDefaultEngine,
        compileMode: nextCompileMode,
        compatibilityMode: nextCompatibilityMode,
        subgraphs: nextSubgraphs,
      } = draftOverride ?? serializeGraph();

      if (isNew) {
        const effectiveName = agencyName || t("builder.defaults.untitledAgency");
        const slug = effectiveName
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, "-")
          .replace(/^-|-$/g, "")
          || `agency-${Date.now()}`;

        const result = await createMutation.mutateAsync({
          name: effectiveName,
          slug,
          agents,
          communicationFlows,
          creatorFeeCredits,
        });

        await saveBuilderMutation.mutateAsync({
          id: result.id,
          name: effectiveName,
          defaultModel: defaultModel || null,
          documentVersion: nextDocumentVersion,
          defaultEngine: nextDefaultEngine,
          compileMode: nextCompileMode,
          compatibilityMode: nextCompatibilityMode,
          subgraphs: nextSubgraphs,
          agents,
          communicationFlows,
          changeDescription: changeDescription ?? (nextDocumentVersion >= 2 ? "Initial hybrid draft import" : undefined),
        });

        if (showToast) {
          toast.success(t("builder.toast.created"));
        }
        setLocation(`/agencies/${result.id}/edit`);
        return { success: true as const, agencyId: result.id };
      } else {
        await saveBuilderMutation.mutateAsync({
          id: agencyId,
          name: agencyName || t("builder.defaults.untitledAgency"),
          defaultModel: defaultModel || null,
          documentVersion: nextDocumentVersion,
          defaultEngine: nextDefaultEngine,
          compileMode: nextCompileMode,
          compatibilityMode: nextCompatibilityMode,
          subgraphs: nextSubgraphs,
          agents,
          communicationFlows,
          changeDescription,
        });
        // Save creator fee via update
        await updateMutation.mutateAsync({
          id: agencyId,
          creatorFeeCredits,
        });
        // Invalidate caches so reload shows fresh data
        (utils as any).agency.getById.invalidate({ id: agencyId });
        (utils as any).agency.list.invalidate();
        if (showToast) {
          toast.success(t("builder.toast.saved"));
        }
        return { success: true as const, agencyId };
      }
    } catch (err: any) {
      toast.error(err?.message ?? t("builder.toast.saveFailed"));
      return { success: false as const, agencyId: null };
    }
  }, [
    serializeGraph,
    isNew,
    agencyId,
    agencyName,
    defaultModel,
    creatorFeeCredits,
    createMutation,
    saveBuilderMutation,
    updateMutation,
    setLocation,
    utils,
    t,
  ]);

  const handleSave = useCallback(async () => {
    await persistBuilderDraft({ showToast: true });
  }, [persistBuilderDraft]);

  const handleCreateSubgraph = useCallback(() => {
    const nextIndex = syncedSubgraphs.length + 1;
    const nextId = `sg_${Date.now().toString(36)}`;
    setSubgraphs((current) => [
      ...buildSyncedSubgraphDocuments(current, nodes, edges, defaultEngine),
      {
        id: nextId,
        name: `Subgraph ${nextIndex}`,
        engine: defaultEngine,
        entryNodeIds: [],
        exitNodeIds: [],
        nodeIds: [],
        boundaryPolicy: null,
      },
    ]);
  }, [defaultEngine, edges, nodes, syncedSubgraphs.length]);

  const handleSubgraphChange = useCallback((
    subgraphId: string,
    updates: Partial<AgencySubgraphDocument>,
  ) => {
    setSubgraphs((current) => current.map((subgraph) => (
      subgraph.id === subgraphId
        ? {
          ...subgraph,
          ...updates,
          boundaryPolicy: updates.boundaryPolicy ?? subgraph.boundaryPolicy ?? null,
        }
        : subgraph
    )));

    if (updates.engine) {
      setNodes((currentNodes) => currentNodes.map((node) => (
        node.data.subgraphId === subgraphId
          ? {
            ...node,
            data: {
              ...node.data,
              engineHint: updates.engine!,
            },
          }
          : node
      )));
    }
  }, [setNodes]);

  const handleSubgraphBoundaryChange = useCallback((
    subgraphId: string,
    key: string,
    value: string,
  ) => {
    setSubgraphs((current) => current.map((subgraph) => {
      if (subgraph.id !== subgraphId) {
        return subgraph;
      }

      const nextBoundaryPolicy = {
        ...(subgraph.boundaryPolicy ?? {}),
        [key]: value.trim() ? value : null,
      };

      return {
        ...subgraph,
        boundaryPolicy: nextBoundaryPolicy,
      };
    }));
  }, []);

  const handleDeleteSubgraph = useCallback((subgraphId: string) => {
    if (syncedSubgraphs.length <= 1) {
      toast.error("At least one subgraph is required.");
      return;
    }

    const fallbackSubgraph = syncedSubgraphs.find((subgraph) => subgraph.id !== subgraphId);
    if (!fallbackSubgraph) {
      return;
    }

    setNodes((currentNodes) => currentNodes.map((node) => (
      node.data.subgraphId === subgraphId
        ? {
          ...node,
          data: {
            ...node.data,
            subgraphId: fallbackSubgraph.id,
            engineHint: fallbackSubgraph.engine,
          },
        }
        : node
    )));
    setSubgraphs((current) => current.filter((subgraph) => subgraph.id !== subgraphId));
  }, [setNodes, syncedSubgraphs]);

  const handleAssignNodeToSubgraph = useCallback((nodeId: string, subgraphId: string) => {
    const targetSubgraph = syncedSubgraphs.find((subgraph) => subgraph.id === subgraphId);
    if (!targetSubgraph) {
      return;
    }

    setNodes((currentNodes) => currentNodes.map((node) => (
      node.id === nodeId
        ? {
          ...node,
          data: {
            ...node.data,
            subgraphId,
            engineHint: targetSubgraph.engine,
          },
        }
        : node
      )));
  }, [setNodes, syncedSubgraphs]);

  const buildHybridUpgradeDraft = useCallback(() => {
    const current = serializeGraph();
    const rootSubgraphId = current.subgraphs[0]?.id ?? "sg_root_hybrid";
    const nextSubgraphs = current.subgraphs.length > 0
      ? current.subgraphs
      : [
        buildSubgraphDocument(
          nodes,
          edges,
          rootSubgraphId,
          "Primary Subgraph",
          defaultEngine,
        ),
      ];

    return {
      ...current,
      documentVersion: 2 as const,
      compileMode: "strict" as const,
      compatibilityMode: "hybrid" as const,
      subgraphs: nextSubgraphs,
      agents: current.agents.map((agent) => ({
        ...agent,
        subgraphId: agent.subgraphId ?? rootSubgraphId,
        engineHint: agent.engineHint ?? nextSubgraphs[0]?.engine ?? defaultEngine,
      })),
    };
  }, [defaultEngine, edges, nodes, serializeGraph]);

  const applyHybridUpgrade = useCallback(async (analysis?: UpgradeAnalysisState | null) => {
    const nextDraft = buildHybridUpgradeDraft();
    const nextSubgraphs = analysis?.proposedSubgraphs ?? nextDraft.subgraphs;
    const rootSubgraphId = nextSubgraphs[0]?.id ?? "sg_root_hybrid";

    if (!isNew) {
      const persisted = await persistBuilderDraft({
        showToast: false,
        draftOverride: {
          ...nextDraft,
          subgraphs: nextSubgraphs,
        },
        changeDescription: "Upgrade to Hybrid Workflow",
      });
      if (!persisted.success) {
        return;
      }
    }

    setDocumentVersion(2);
    setCompileMode("strict");
    setCompatibilityMode("hybrid");
    setSubgraphs(nextSubgraphs);
    setCompilePreview(null);
    setNodes((nds) => nds.map((node) => ({
      ...node,
        data: {
          ...node.data,
          subgraphId: node.data.subgraphId ?? rootSubgraphId,
          engineHint: node.data.engineHint ?? nextSubgraphs[0]?.engine ?? defaultEngine,
        },
      })));
    setUpgradeDialogOpen(false);
    toast.success("Hybrid workflow editing enabled for this draft.");
  }, [buildHybridUpgradeDraft, defaultEngine, isNew, persistBuilderDraft, setNodes]);

  const handleUpgradeToHybrid = useCallback(async () => {
    const currentDraft = serializeGraph();
    const proposedDraft = buildHybridUpgradeDraft();

    setUpgradeDialogOpen(true);
    setUpgradeAnalysisLoading(true);
    setUpgradeAnalysis({
      current: null,
      proposed: null,
      proposedSubgraphs: proposedDraft.subgraphs,
    });

    try {
      const currentPreview = await compilePreviewMutation.mutateAsync({
        name: agencyName || t("builder.defaults.untitledAgency"),
        ...currentDraft,
      });
      const proposedPreview = await compilePreviewMutation.mutateAsync({
        name: agencyName || t("builder.defaults.untitledAgency"),
        ...proposedDraft,
      });

      setUpgradeAnalysis({
        current: currentPreview,
        proposed: proposedPreview,
        proposedSubgraphs: proposedDraft.subgraphs,
      });
    } catch (err: any) {
      toast.error(err?.message ?? "Unable to analyze hybrid upgrade");
    } finally {
      setUpgradeAnalysisLoading(false);
    }
  }, [agencyName, buildHybridUpgradeDraft, compilePreviewMutation, serializeGraph, t]);

  const runCompilePreview = useCallback(async ({
    showSuccessToast = true,
    showFailureToast = true,
  }: {
    showSuccessToast?: boolean;
    showFailureToast?: boolean;
  } = {}) => {
    try {
      const nextPreview = await compilePreviewMutation.mutateAsync({
        name: agencyName || t("builder.defaults.untitledAgency"),
        ...serializeGraph(),
      });
      setCompilePreview(nextPreview);
      if (nextPreview?.status === "failed") {
        if (showFailureToast) {
          toast.error("Compile preview found blocking issues.");
        }
      } else if (showSuccessToast) {
        toast.success("Compile preview is ready.");
      }
      return nextPreview;
    } catch (err: any) {
      if (showFailureToast) {
        toast.error(err?.message ?? "Compile preview failed");
      }
      return null;
    }
  }, [agencyName, compilePreviewMutation, serializeGraph, t]);

  const handleCompilePreview = useCallback(async () => {
    await runCompilePreview();
  }, [runCompilePreview]);

  const handlePublish = useCallback(async () => {
    // Validation
    const entryPoints = nodes.filter((n) => n.data.isEntryPoint);
    if (entryPoints.length === 0) {
      toast.error(t("builder.toast.entryPointRequired"));
      return;
    }
    if (edges.length === 0 && nodes.length > 1) {
      toast.error(t("builder.toast.addFlows"));
      return;
    }
    const agentSupervisorNodes = nodes.filter((n) =>
      ["agent", "supervisor"].includes(n.data.nodeType ?? "agent"),
    );
    const missingModel = agentSupervisorNodes.find((n) => !n.data.model);
    if (missingModel) {
      toast.error(t("builder.toast.needsModel", { name: missingModel.data.name }));
      return;
    }
    const missingInstructions = agentSupervisorNodes.find((n) => !n.data.instructions);
    if (missingInstructions) {
      toast.error(t("builder.toast.needsInstructions", { name: missingInstructions.data.name }));
      return;
    }

    try {
      if (isNew) {
        toast.error(t("builder.toast.saveBeforePublishing"));
        return;
      }
      const nextPreview = await runCompilePreview({ showSuccessToast: false, showFailureToast: true });
      if (!nextPreview || nextPreview.status === "failed") {
        return;
      }
      const persisted = await persistBuilderDraft({ showToast: false });
      if (!persisted.success) {
        return;
      }
      await updateMutation.mutateAsync({
        id: agencyId,
        status: "published",
      });
      setAgencyStatus("published");
      toast.success(t("builder.toast.published"));
    } catch (err: any) {
      toast.error(err?.message ?? t("builder.toast.publishFailed"));
    }
  }, [agencyId, edges, isNew, nodes, persistBuilderDraft, runCompilePreview, t, updateMutation]);

  const handleAutoLayout = useCallback(() => {
    const layouted = autoLayout(nodes, edges);
    setNodes(layouted);
    setTimeout(() => rfInstance.fitView({ padding: 0.2 }), 50);
    toast.success(t("builder.toast.layoutApplied"));
  }, [nodes, edges, setNodes, rfInstance.fitView, t]);

  const handleTest = useCallback(async () => {
    if (!agencyId || isNew) {
      toast.error(t("builder.toast.saveBeforeTesting"));
      return;
    }
    const nextPreview = await runCompilePreview({ showSuccessToast: false, showFailureToast: true });
    if (!nextPreview || nextPreview.status === "failed") {
      return;
    }
    const persisted = await persistBuilderDraft({ showToast: false });
    if (!persisted.success || !persisted.agencyId) {
      return;
    }
    setLocation(`/agencies/${persisted.agencyId}`);
  }, [agencyId, isNew, persistBuilderDraft, runCompilePreview, setLocation, t]);

  const handleBack = useCallback(() => {
    setLocation("/agencies");
  }, [setLocation]);

  // Keyboard shortcuts (disabled in read-only mode except Escape)
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setSelectedNodeId(null);
        return;
      }
      if (!canEdit) return;

      const tag = (e.target as HTMLElement)?.tagName;
      const inInput = tag === "INPUT" || tag === "TEXTAREA" || (e.target as HTMLElement)?.isContentEditable;

      if ((e.key === "Delete" || e.key === "Backspace") && !inInput && selectedNodeId) {
        handleDeleteNode(selectedNodeId);
        return;
      }
      if (e.ctrlKey || e.metaKey) {
        if (e.key === "z" && !e.shiftKey) {
          e.preventDefault();
          undo(setNodes, setEdges);
        } else if (e.key === "y" || (e.key === "z" && e.shiftKey)) {
          e.preventDefault();
          redo(setNodes, setEdges);
        } else if (e.key === "s") {
          e.preventDefault();
          handleSave();
        } else if (e.key === "Enter") {
          e.preventDefault();
          handlePublish();
        } else if (e.key === "a" && !inInput) {
          e.preventDefault();
          setNodes((nds) => nds.map((n) => ({ ...n, selected: true })));
        }
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [canEdit, selectedNodeId, handleDeleteNode, undo, redo, setNodes, setEdges, handleSave, handlePublish]);

  const selectedNode = selectedNodeId
    ? nodes.find((n) => n.id === selectedNodeId)
    : null;

  const isSaving =
    createMutation.isPending ||
    saveBuilderMutation.isPending ||
    updateMutation.isPending;

  if (authLoading || (!isNew && agencyLoading)) {
    return (
      <div className="flex h-screen items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="flex h-screen flex-col">
      <AgencyToolbar
        agencyName={agencyName}
        agencyStatus={agencyStatus}
        isSaving={isSaving}
        defaultModel={defaultModel}
        onDefaultModelChange={setDefaultModel}
        creatorFeeCredits={creatorFeeCredits}
        onCreatorFeeChange={setCreatorFeeCredits}
        onSave={handleSave}
        onPublish={handlePublish}
        onAutoLayout={handleAutoLayout}
        onTest={handleTest}
        onBack={handleBack}
        onNameChange={setAgencyName}
        canUndo={canUndo}
        canRedo={canRedo}
        onUndo={() => undo(setNodes, setEdges)}
        onRedo={() => redo(setNodes, setEdges)}
        onHistory={() => setVersionHistoryOpen(true)}
        onRunHistory={() => setRunHistoryOpen(true)}
        onAutoCreate={() => setAutoCreateOpen(true)}
        readOnly={!canEdit}
      />

      <div className="border-b bg-slate-50/80 px-4 py-3" data-testid="agency-hybrid-banner">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div className="space-y-1">
            <p className="text-sm font-medium text-slate-800">
              {hybridDocumentEnabled ? "Hybrid Workflow Runtime" : "Legacy Agency Mode"}
            </p>
            <p className="text-xs text-slate-600">
              {hybridKillSwitchActive
                ? "Hybrid ADK compile and run paths are temporarily disabled by kill switch."
                : hybridDocumentEnabled
                  ? "This draft can compile across Agency Swarm and ADK-backed subgraphs."
                  : "Legacy agencies stay in Agency Swarm compatibility mode until you explicitly upgrade."}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {!hybridRuntimeEnabled && !hybridDocumentEnabled && (
              <span className="rounded-full bg-slate-200 px-3 py-1 text-xs font-medium text-slate-700">
                Hybrid runtime disabled
              </span>
            )}
            {hybridRuntimeEnabled && !hybridKillSwitchActive && !hybridDocumentEnabled && canEdit && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                data-testid="agency-hybrid-upgrade"
                onClick={handleUpgradeToHybrid}
              >
                Upgrade to Hybrid Workflow
              </Button>
            )}
            {hybridRuntimeEnabled && hybridDocumentEnabled && (
              <div className="flex flex-wrap items-center gap-2" data-testid="agency-hybrid-controls">
                <label className="flex items-center gap-2 text-xs text-slate-700">
                  <span>Hybrid Default Engine</span>
                  <select
                    className="rounded border border-slate-300 bg-white px-2 py-1 text-xs"
                    value={defaultEngine}
                    onChange={(event) => {
                      const nextEngine = event.target.value as AgencyWorkflowEngine;
                      setDefaultEngine(nextEngine);
                      if (syncedSubgraphs.length === 1) {
                        handleSubgraphChange(syncedSubgraphs[0].id, { engine: nextEngine });
                      }
                    }}
                    disabled={!canEdit || hybridKillSwitchActive}
                    data-testid="agency-default-engine-select"
                  >
                    <option value="agency_swarm">Agency Swarm</option>
                    <option value="adk2">Google ADK</option>
                  </select>
                </label>
                <label className="flex items-center gap-2 text-xs text-slate-700">
                  <span>Compile Mode</span>
                  <select
                    className="rounded border border-slate-300 bg-white px-2 py-1 text-xs"
                    value={compileMode}
                    onChange={(event) => setCompileMode(event.target.value as AgencyCompileMode)}
                    disabled={!canEdit || hybridKillSwitchActive}
                    data-testid="agency-compile-mode-select"
                  >
                    <option value="legacy_agency">Legacy</option>
                    <option value="strict">Strict</option>
                    <option value="assist">Assist</option>
                  </select>
                </label>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={handleCompilePreview}
                  disabled={compilePreviewMutation.isPending || hybridKillSwitchActive}
                  data-testid="agency-compile-preview"
                >
                  {compilePreviewMutation.isPending ? "Compiling..." : "Compile Preview"}
                </Button>
              </div>
            )}
          </div>
        </div>

        {hybridDocumentEnabled && (
          <div className="mt-3 rounded-lg border border-slate-200 bg-white p-3" data-testid="agency-subgraph-manager">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <p className="text-sm font-medium text-slate-800">Subgraph Layout</p>
                <p className="text-xs text-slate-500">
                  Assign nodes to execution groups, choose engines, and declare boundary contracts before compile.
                </p>
              </div>
              {canEdit && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={handleCreateSubgraph}
                  disabled={hybridKillSwitchActive}
                  data-testid="agency-add-subgraph"
                >
                  Add Subgraph
                </Button>
              )}
            </div>

            <div className="mt-3 grid gap-3 lg:grid-cols-2">
              {syncedSubgraphs.map((subgraph) => {
                const selectedNodeAssigned = selectedNode?.data.subgraphId === subgraph.id;
                const boundaryPolicy = (subgraph.boundaryPolicy ?? {}) as Record<string, unknown>;
                return (
                  <div
                    key={subgraph.id}
                    className="rounded-lg border border-slate-200 bg-slate-50/80 p-3"
                    data-testid={`agency-subgraph-${subgraph.id}`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1 space-y-2">
                        <input
                          className="w-full rounded border border-slate-300 bg-white px-2 py-1 text-sm font-medium text-slate-800"
                          value={subgraph.name}
                          onChange={(event) => handleSubgraphChange(subgraph.id, { name: event.target.value })}
                          disabled={!canEdit || hybridKillSwitchActive}
                        />
                        <div className="flex flex-wrap items-center gap-2 text-[11px] text-slate-600">
                          <span className="rounded-full bg-white px-2 py-1">Nodes: {subgraph.nodeIds.length}</span>
                          <span className="rounded-full bg-white px-2 py-1">Entries: {subgraph.entryNodeIds.length}</span>
                          <span className="rounded-full bg-white px-2 py-1">Exits: {subgraph.exitNodeIds.length}</span>
                          {selectedNodeAssigned && (
                            <span className="rounded-full bg-indigo-100 px-2 py-1 text-indigo-700">
                              Selected node
                            </span>
                          )}
                        </div>
                      </div>
                      {canEdit && syncedSubgraphs.length > 1 && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="text-xs text-red-600 hover:bg-red-50 hover:text-red-700"
                          onClick={() => handleDeleteSubgraph(subgraph.id)}
                        >
                          Remove
                        </Button>
                      )}
                    </div>

                    <div className="mt-3 grid gap-2 md:grid-cols-2">
                      <label className="space-y-1 text-xs text-slate-600">
                        <span>Engine</span>
                        <select
                          className="w-full rounded border border-slate-300 bg-white px-2 py-1 text-xs"
                          value={subgraph.engine}
                          onChange={(event) => handleSubgraphChange(subgraph.id, { engine: event.target.value as AgencyWorkflowEngine })}
                          disabled={!canEdit || hybridKillSwitchActive}
                        >
                          <option value="agency_swarm">Agency Swarm</option>
                          <option value="adk2">Google ADK</option>
                        </select>
                      </label>
                      <label className="space-y-1 text-xs text-slate-600">
                        <span>Bridge Mode</span>
                        <input
                          className="w-full rounded border border-slate-300 bg-white px-2 py-1 text-xs"
                          value={typeof boundaryPolicy.bridgeMode === "string" ? boundaryPolicy.bridgeMode : ""}
                          onChange={(event) => handleSubgraphBoundaryChange(subgraph.id, "bridgeMode", event.target.value)}
                          disabled={!canEdit || hybridKillSwitchActive}
                          placeholder="sync"
                        />
                      </label>
                      <label className="space-y-1 text-xs text-slate-600">
                        <span>Input Contract</span>
                        <input
                          className="w-full rounded border border-slate-300 bg-white px-2 py-1 text-xs"
                          value={typeof boundaryPolicy.inputContract === "string" ? boundaryPolicy.inputContract : ""}
                          onChange={(event) => handleSubgraphBoundaryChange(subgraph.id, "inputContract", event.target.value)}
                          disabled={!canEdit || hybridKillSwitchActive}
                          placeholder={`${subgraph.id}_input`}
                        />
                      </label>
                      <label className="space-y-1 text-xs text-slate-600">
                        <span>Output Contract</span>
                        <input
                          className="w-full rounded border border-slate-300 bg-white px-2 py-1 text-xs"
                          value={typeof boundaryPolicy.outputContract === "string" ? boundaryPolicy.outputContract : ""}
                          onChange={(event) => handleSubgraphBoundaryChange(subgraph.id, "outputContract", event.target.value)}
                          disabled={!canEdit || hybridKillSwitchActive}
                          placeholder={`${subgraph.id}_output`}
                        />
                      </label>
                    </div>

                    {selectedNode && canEdit && (
                      <div className="mt-3 flex items-center justify-between rounded border border-dashed border-slate-300 bg-white px-3 py-2 text-xs text-slate-600">
                        <span className="truncate">
                          Selected node: <span className="font-medium text-slate-800">{selectedNode.data.name}</span>
                        </span>
                        <Button
                          type="button"
                          variant={selectedNodeAssigned ? "secondary" : "outline"}
                          size="sm"
                          className="h-7 text-xs"
                          onClick={() => handleAssignNodeToSubgraph(selectedNode.id, subgraph.id)}
                          disabled={hybridKillSwitchActive}
                        >
                          {selectedNodeAssigned ? "Assigned" : "Move Here"}
                        </Button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {hybridDocumentEnabled && (liveValidationSummary.length > 0 || liveCapabilityWarnings.length > 0) && (
          <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50/80 p-3" data-testid="agency-live-hybrid-warnings">
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-full bg-white px-2 py-1 text-xs font-medium text-amber-800">
                Live Checks
              </span>
              <span className="text-xs text-amber-900">
                {liveValidationSummary.length} validation issue(s), {liveCapabilityWarnings.length} compatibility note(s)
              </span>
            </div>
            <div className="mt-3 grid gap-2 lg:grid-cols-2">
              {liveValidationSummary.map((warning) => (
                <div
                  key={`validation-${warning.nodeId}-${warning.message}`}
                  className={`rounded border px-3 py-2 text-xs ${
                    warning.severity === "error"
                      ? "border-red-200 bg-red-50 text-red-700"
                      : "border-amber-200 bg-white/90 text-amber-800"
                  }`}
                >
                  <span className="font-medium">{warning.nodeName}</span>
                  {" "}
                  {warning.message}
                </div>
              ))}
              {liveCapabilityWarnings.map((warning) => (
                <div
                  key={`capability-${warning.nodeId}-${warning.message}`}
                  className="rounded border border-violet-200 bg-white/90 px-3 py-2 text-xs text-violet-800"
                >
                  <span className="font-medium">{warning.nodeName}</span>
                  {" "}
                  {warning.message}
                </div>
              ))}
            </div>
          </div>
        )}

        {compilePreview && (
          <div
            className="mt-3 rounded-lg border border-slate-200 bg-white p-3"
            data-testid="agency-compile-diagnostics"
          >
            <div className="flex flex-wrap items-center gap-2 text-xs text-slate-700">
              <span className="rounded-full bg-slate-100 px-2 py-1 font-medium">
                Status: {compilePreview.status}
              </span>
              <span className="rounded-full bg-slate-100 px-2 py-1">
                Engines: {(compilePreview.planSummary?.engineMix ?? []).join(", ") || "agency_swarm"}
              </span>
              <span className="rounded-full bg-slate-100 px-2 py-1">
                Subgraphs: {compilePreview.planSummary?.subgraphCount ?? 0}
              </span>
              <span className="rounded-full bg-slate-100 px-2 py-1">
                Bridges: {compilePreview.planSummary?.bridgeCount ?? 0}
              </span>
            </div>
            <div className="mt-3 space-y-2">
              {(compilePreview.diagnostics ?? []).length === 0 ? (
                <p className="text-xs text-slate-600">No compile diagnostics.</p>
              ) : (
                (compilePreview.diagnostics ?? []).map((diagnostic: any, index: number) => (
                  <div
                    key={`${diagnostic.code}-${index}`}
                    className={`rounded border px-3 py-2 text-xs ${
                      diagnostic.severity === "error"
                        ? "border-red-200 bg-red-50 text-red-700"
                        : diagnostic.severity === "warning"
                          ? "border-amber-200 bg-amber-50 text-amber-700"
                          : "border-slate-200 bg-slate-50 text-slate-700"
                    }`}
                  >
                    <span className="font-medium">{diagnostic.code}</span>
                    {" "}
                    {diagnostic.message}
                  </div>
                ))
              )}
            </div>
            {(compilePreview.compiledSubgraphs ?? []).length > 0 && (
              <div className="mt-4 grid gap-2 lg:grid-cols-2">
                {(compilePreview.compiledSubgraphs ?? []).map((subgraph: any) => (
                  <div key={subgraph.id} className="rounded border border-slate-200 bg-slate-50 p-3 text-xs text-slate-700">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium text-slate-800">{subgraph.name}</span>
                      <span className="rounded-full bg-white px-2 py-1">{subgraph.engine}</span>
                      <span className="rounded-full bg-white px-2 py-1">{subgraph.loweringStrategy}</span>
                    </div>
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {(subgraph.capabilities ?? []).map((capability: any) => (
                        <span
                          key={`${subgraph.id}-${capability.nodeId}`}
                          className={`rounded-full px-2 py-1 ${
                            capability.support === "unsupported"
                              ? "bg-red-100 text-red-700"
                              : capability.support === "emulated"
                                ? "bg-amber-100 text-amber-700"
                                : "bg-emerald-100 text-emerald-700"
                          }`}
                        >
                          {capability.nodeType}:{capability.support}
                        </span>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Version history drawer */}
      {!isNew && agencyId && (
        <AgencyVersionHistory
          agencyId={agencyId}
          open={versionHistoryOpen}
          onOpenChange={setVersionHistoryOpen}
        />
      )}

      {/* Run history drawer */}
      {!isNew && agencyId && (
        <RunHistoryPanel
          agencyId={agencyId}
          open={runHistoryOpen}
          onClose={() => setRunHistoryOpen(false)}
        />
      )}

      {/* AI Agency Creator modal */}
      <AutoCreateAgencyModal
        open={autoCreateOpen}
        onOpenChange={setAutoCreateOpen}
        defaultModel={defaultModel}
        onCreated={(newAgencyId) => {
          setAutoCreateOpen(false);
          setLocation(`/agencies/${newAgencyId}/edit`);
        }}
      />

      <AlertDialog open={upgradeDialogOpen} onOpenChange={setUpgradeDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Upgrade to Hybrid Workflow</AlertDialogTitle>
            <AlertDialogDescription>
              Review the compile impact before converting this agency to Agency Document v2 with subgraphs and engine-aware execution.
            </AlertDialogDescription>
          </AlertDialogHeader>

          <div className="space-y-3 text-sm text-slate-700">
            {upgradeAnalysisLoading && (
              <div className="flex items-center gap-2 rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                Analyzing current draft and proposed hybrid compile previews...
              </div>
            )}

            {upgradeAnalysis && (
              <div className="grid gap-3 md:grid-cols-2">
                <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Current</p>
                  <div className="mt-2 space-y-1 text-xs">
                    <p>Status: {upgradeAnalysis.current?.status ?? "pending"}</p>
                    <p>Engines: {(upgradeAnalysis.current?.planSummary?.engineMix ?? [defaultEngine]).join(", ")}</p>
                    <p>Subgraphs: {upgradeAnalysis.current?.planSummary?.subgraphCount ?? syncedSubgraphs.length}</p>
                    <p>Diagnostics: {(upgradeAnalysis.current?.diagnostics ?? []).length}</p>
                  </div>
                </div>
                <div className="rounded-lg border border-violet-200 bg-violet-50 p-3">
                  <p className="text-xs font-semibold uppercase tracking-wide text-violet-600">Proposed Hybrid</p>
                  <div className="mt-2 space-y-1 text-xs text-violet-900">
                    <p>Status: {upgradeAnalysis.proposed?.status ?? "pending"}</p>
                    <p>Engines: {(upgradeAnalysis.proposed?.planSummary?.engineMix ?? [defaultEngine]).join(", ")}</p>
                    <p>Subgraphs: {upgradeAnalysis.proposed?.planSummary?.subgraphCount ?? upgradeAnalysis.proposedSubgraphs.length}</p>
                    <p>Diagnostics: {(upgradeAnalysis.proposed?.diagnostics ?? []).length}</p>
                  </div>
                </div>
              </div>
            )}

            {upgradeAnalysis?.proposedSubgraphs?.length ? (
              <div className="rounded-lg border border-slate-200 bg-white p-3">
                <p className="text-xs font-medium text-slate-700">Proposed subgraphs</p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {upgradeAnalysis.proposedSubgraphs.map((subgraph) => (
                    <span key={subgraph.id} className="rounded-full border border-slate-200 bg-slate-50 px-2 py-1 text-[11px] text-slate-700">
                      {subgraph.name} ({subgraph.engine})
                    </span>
                  ))}
                </div>
              </div>
            ) : null}
          </div>

          <AlertDialogFooter>
            <AlertDialogCancel disabled={upgradeAnalysisLoading || saveBuilderMutation.isPending}>
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={(event) => {
                event.preventDefault();
                void applyHybridUpgrade(upgradeAnalysis);
              }}
              disabled={upgradeAnalysisLoading || saveBuilderMutation.isPending}
            >
              {saveBuilderMutation.isPending ? "Saving..." : "Confirm Upgrade"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <div className="flex flex-1 overflow-hidden relative">
        {canEdit && <AgencySidebar onNodeAdd={addNodeFromTemplate} />}

        {/* Canvas */}
        <div className="flex-1 relative h-full">
          <ReactFlow
            nodes={nodes}
            edges={edges}
            onNodesChange={canEdit ? onNodesChange : undefined}
            onEdgesChange={canEdit ? onEdgesChange : undefined}
            onConnect={canEdit ? onConnect : undefined}
            onNodeClick={onNodeClick}
            onPaneClick={onPaneClick}
            onMove={(_, nextViewport) => setViewport(nextViewport)}
            onDragOver={canEdit ? onDragOver : undefined}
            onDrop={canEdit ? onDrop : undefined}
            nodeTypes={nodeTypes}
            edgeTypes={edgeTypes}
            nodesDraggable={canEdit}
            nodesConnectable={canEdit}
            elementsSelectable={canEdit}
            fitView
            defaultEdgeOptions={{
              type: "communication",
              markerEnd: { type: MarkerType.ArrowClosed },
            }}
          >
            <Controls />
            <MiniMap
              nodeColor={(node) =>
                node.data?.isEntryPoint ? "#22c55e" : "#94a3b8"
              }
              zoomable
              pannable
            />
            <Background variant={BackgroundVariant.Dots} gap={16} size={1} />
          </ReactFlow>

          {hybridDocumentEnabled && subgraphOverlayLayout.length > 0 && (
            <div className="pointer-events-none absolute inset-0 z-[1]">
              {subgraphOverlayLayout.map((subgraph) => (
                <div
                  key={`overlay-${subgraph.id}`}
                  className="absolute rounded-2xl border border-dashed border-violet-300 bg-violet-100/25 shadow-[inset_0_0_0_1px_rgba(139,92,246,0.08)]"
                  style={{
                    left: subgraph.x * viewport.zoom + viewport.x,
                    top: subgraph.y * viewport.zoom + viewport.y,
                    width: subgraph.width * viewport.zoom,
                    height: subgraph.height * viewport.zoom,
                  }}
                >
                  <div className="absolute left-3 top-3 rounded-full border border-violet-200 bg-white/95 px-2 py-1 text-[11px] font-medium text-violet-700 shadow-sm">
                    {subgraph.name} · {subgraph.engine}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Empty canvas onboarding overlay — pointer-events-none everywhere
              except the buttons, so drag & drop passes through to canvas */}
          {nodes.length === 0 && (
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-10">
              <div className="text-center">
                <Network className="mx-auto h-12 w-12 text-slate-300 mb-4" />
                <h3 className="text-lg font-semibold text-slate-600 mb-1">{t("builder.empty.title")}</h3>
                <p className="text-sm text-slate-400 mb-6">
                  {t("builder.empty.description")}
                </p>
                <div className="flex items-center justify-center gap-3 pointer-events-auto">
                  <Button
                    className="bg-purple-600 hover:bg-purple-700 text-white gap-2"
                    onClick={() => setAutoCreateOpen(true)}
                  >
                    <Sparkles className="h-4 w-4" />
                    {t("builder.empty.aiCreator")}
                  </Button>
                  <Button variant="outline" onClick={handleAddAgent}>
                    {t("builder.empty.addFirstAgent")}
                  </Button>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Add Agent FAB (hidden when canvas is empty — overlay handles it) */}
        {canEdit && nodes.length > 0 && (
          <button
            type="button"
            onClick={handleAddAgent}
            className="absolute bottom-6 left-1/2 z-10 -translate-x-1/2 rounded-full bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow-lg transition-transform hover:scale-105"
            data-testid="add-agent-btn"
          >
            {t("builder.empty.addAgent")}
          </button>
        )}

        {/* Property Panel — polymorphic for all 7 node types (hidden in read-only mode) */}
        {canEdit && selectedNode && (
          <NodePropertyPanel
            node={selectedNode.data}
            nodeId={selectedNode.id}
            subgraphs={syncedSubgraphs.map((subgraph) => ({
              id: subgraph.id,
              name: subgraph.name,
              engine: subgraph.engine,
            }))}
            defaultEngine={defaultEngine}
            siblingNodes={nodes
              .filter((n) => n.id !== selectedNode.id)
              .map((n) => ({ id: n.id, name: n.data.name, nodeType: n.data.nodeType ?? "agent" }))}
            onChange={(updates) =>
              handleNodeDataChange(selectedNode.id, updates)
            }
            onClose={() => setSelectedNodeId(null)}
            onDelete={() => handleDeleteNode(selectedNode.id)}
          />
        )}
      </div>
    </div>
  );
}

export default function AgencyBuilder() {
  return (
    <ReactFlowProvider>
      <AgencyCanvas />
    </ReactFlowProvider>
  );
}
