import { useState, useCallback, useMemo, useEffect, useRef } from "react";
import { useRoute, useLocation } from "wouter";
import ReactFlow, {
  ReactFlowProvider,
  addEdge,
  useNodesState,
  useEdgesState,
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
  type ReactFlowInstance,
} from "reactflow";
import "reactflow/dist/style.css";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/contexts/AuthContext";
import { AgentNode, type AgentNodeData } from "@/components/agency/AgentNode";
import { CommunicationEdge } from "@/components/agency/CommunicationEdge";
import { AgentPropertyPanel } from "@/components/agency/AgentPropertyPanel";
import { AgencyToolbar } from "@/components/agency/AgencyToolbar";
import { Loader2 } from "lucide-react";

const DEFAULT_AGENT_DATA: AgentNodeData = {
  name: "New Agent",
  description: "",
  instructions: "",
  model: "",
  modelSettings: {},
  isEntryPoint: false,
  isOptional: false,
  tools: [],
};

function autoLayout(nodes: Node<AgentNodeData>[], edges: Edge[]): Node<AgentNodeData>[] {
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
  const updated: Node<AgentNodeData>[] = [];

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

function AgencyCanvas() {
  const [, setLocation] = useLocation();
  const [matched, params] = useRoute("/agencies/:id/edit");
  const agencyId = (params as Record<string, string>)?.id as string | undefined;
  const isNew = agencyId === "new";

  const [nodes, setNodes, onNodesChange] = useNodesState<AgentNodeData>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [agencyName, setAgencyName] = useState("Untitled Agency");
  const [agencyStatus, setAgencyStatus] = useState<"draft" | "published" | "archived">("draft");
  const [rfInstance, setRfInstance] = useState<ReactFlowInstance | null>(null);
  const canvasInitRef = useRef(false);
  const nodeCounterRef = useRef(0);

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

  // Hydrate canvas from loaded data
  useEffect(() => {
    if (!agencyData || canvasInitRef.current) return;
    canvasInitRef.current = true;

    setAgencyName(agencyData.name ?? "Untitled Agency");
    setAgencyStatus(agencyData.status ?? "draft");

    // Convert agents to nodes
    const agentNodes: Node<AgentNodeData>[] = (agencyData.agents ?? []).map(
      (agent: any) => ({
        id: agent.id,
        type: "agent",
        position: agent.position ?? { x: 0, y: 0 },
        data: {
          name: agent.name,
          description: agent.description ?? "",
          instructions: agent.instructions ?? "",
          model: agent.model ?? "",
          modelSettings: agent.modelSettings ?? {},
          isEntryPoint: agent.isEntryPoint ?? false,
          isOptional: agent.isOptional ?? false,
          tools: (agencyData.agentToolAssignments ?? [])
            .filter((t: any) => t.agentId === agent.id)
            .map((t: any) => ({ toolId: t.toolId, toolName: t.toolName ?? t.toolId })),
        },
      }),
    );

    // Convert flows to edges
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
    setEdges(flowEdges);
    nodeCounterRef.current = agentNodes.length;
  }, [agencyData, setNodes, setEdges]);

  // Node and edge types (memoized to prevent React Flow re-renders)
  const nodeTypes: NodeTypes = useMemo(
    () => ({ agent: AgentNode }),
    [],
  );

  const edgeTypes: EdgeTypes = useMemo(
    () => ({ communication: CommunicationEdge as any }),
    [],
  );

  // Handlers
  const onConnect = useCallback(
    (connection: Connection) => {
      const newEdge = {
        ...connection,
        id: `e-${connection.source}-${connection.target}-${Date.now()}`,
        type: "communication",
        data: { flowType: "delegation" as const },
        markerEnd: { type: MarkerType.ArrowClosed, color: "#3b82f6" },
      };
      setEdges((eds) => addEdge(newEdge, eds));
    },
    [setEdges],
  );

  const onNodeClick = useCallback((_: any, node: Node) => {
    setSelectedNodeId(node.id);
  }, []);

  const onPaneClick = useCallback(() => {
    setSelectedNodeId(null);
  }, []);

  const handleAddAgent = useCallback(() => {
    nodeCounterRef.current += 1;
    const counter = nodeCounterRef.current;
    setNodes((nds) => {
      const isFirst = nds.length === 0;
      const newNode: Node<AgentNodeData> = {
        id: crypto.randomUUID(),
        type: "agent",
        position: {
          x: 100 + (counter % 4) * 280,
          y: 100 + Math.floor(counter / 4) * 160,
        },
        data: {
          ...DEFAULT_AGENT_DATA,
          name: `Agent ${counter}`,
          isEntryPoint: isFirst,
        },
      };
      setSelectedNodeId(newNode.id);
      return [...nds, newNode];
    });
  }, [setNodes]);

  const handleNodeDataChange = useCallback(
    (nodeId: string, updates: Partial<AgentNodeData>) => {
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
          return { ...node, data: { ...node.data, ...updates } };
        }),
      );
    },
    [setNodes],
  );

  const handleDeleteNode = useCallback(
    (nodeId: string) => {
      setNodes((nds) => nds.filter((n) => n.id !== nodeId));
      setEdges((eds) =>
        eds.filter((e) => e.source !== nodeId && e.target !== nodeId),
      );
      setSelectedNodeId(null);
    },
    [setNodes, setEdges],
  );

  // Save mutations
  const createMutation = (trpc as any).agency.create.useMutation();
  const saveBuilderMutation = (trpc as any).agency.saveBuilder.useMutation();
  const updateMutation = (trpc as any).agency.update.useMutation();

  const serializeGraph = useCallback(() => {
    const agents = nodes.map((n) => ({
      name: n.data.name,
      description: n.data.description || undefined,
      instructions: n.data.instructions,
      model: n.data.model,
      modelSettings: n.data.modelSettings,
      isEntryPoint: n.data.isEntryPoint,
      isOptional: n.data.isOptional,
      position: n.position,
      toolIds: n.data.tools.map((t) => t.toolId),
    }));

    const communicationFlows = edges.map((e) => ({
      fromAgentName: nodes.find((n) => n.id === e.source)?.data.name ?? "",
      toAgentName: nodes.find((n) => n.id === e.target)?.data.name ?? "",
      flowType: (e.data?.flowType ?? "delegation") as "delegation" | "handoff",
    }));

    return { agents, communicationFlows };
  }, [nodes, edges]);

  const handleSave = useCallback(async () => {
    try {
      const { agents, communicationFlows } = serializeGraph();

      if (isNew) {
        const slug = agencyName
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, "-")
          .replace(/^-|-$/g, "")
          || `agency-${Date.now()}`;

        const result = await createMutation.mutateAsync({
          name: agencyName,
          slug,
          agents,
          communicationFlows,
        });

        toast.success("Agency created");
        setLocation(`/agencies/${result.id}/edit`);
      } else {
        // Use saveBuilder to persist the full graph
        await saveBuilderMutation.mutateAsync({
          id: agencyId,
          name: agencyName,
          agents,
          communicationFlows,
        });
        toast.success("Agency saved");
      }
    } catch (err: any) {
      toast.error(err?.message ?? "Failed to save agency");
    }
  }, [
    serializeGraph,
    isNew,
    agencyId,
    agencyName,
    createMutation,
    saveBuilderMutation,
    setLocation,
  ]);

  const handlePublish = useCallback(async () => {
    // Validation
    const entryPoints = nodes.filter((n) => n.data.isEntryPoint);
    if (entryPoints.length === 0) {
      toast.error("At least one agent must be the entry point");
      return;
    }
    if (edges.length === 0 && nodes.length > 1) {
      toast.error("Add communication flows between agents");
      return;
    }
    const missingModel = nodes.find((n) => !n.data.model);
    if (missingModel) {
      toast.error(`Agent "${missingModel.data.name}" needs a model`);
      return;
    }
    const missingInstructions = nodes.find((n) => !n.data.instructions);
    if (missingInstructions) {
      toast.error(`Agent "${missingInstructions.data.name}" needs instructions`);
      return;
    }

    try {
      if (isNew) {
        toast.error("Save the agency first before publishing");
        return;
      }
      await updateMutation.mutateAsync({
        id: agencyId,
        status: "published",
      });
      setAgencyStatus("published");
      toast.success("Agency published");
    } catch (err: any) {
      toast.error(err?.message ?? "Failed to publish agency");
    }
  }, [nodes, edges, isNew, agencyId, updateMutation]);

  const handleAutoLayout = useCallback(() => {
    const layouted = autoLayout(nodes, edges);
    setNodes(layouted);
    setTimeout(() => rfInstance?.fitView({ padding: 0.2 }), 50);
    toast.success("Layout applied");
  }, [nodes, edges, setNodes, rfInstance]);

  const handleTest = useCallback(() => {
    if (agencyId && !isNew) {
      setLocation(`/agencies/${agencyId}`);
    } else {
      toast.error("Save the agency first to test it");
    }
  }, [agencyId, isNew, setLocation]);

  const handleBack = useCallback(() => {
    setLocation("/agencies");
  }, [setLocation]);

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
        onSave={handleSave}
        onPublish={handlePublish}
        onAutoLayout={handleAutoLayout}
        onTest={handleTest}
        onBack={handleBack}
        onNameChange={setAgencyName}
      />

      <div className="flex flex-1 overflow-hidden">
        {/* Canvas */}
        <div className="flex-1">
          <ReactFlow
            nodes={nodes}
            edges={edges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            onNodeClick={onNodeClick}
            onPaneClick={onPaneClick}
            onInit={setRfInstance}
            nodeTypes={nodeTypes}
            edgeTypes={edgeTypes}
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
        </div>

        {/* Add Agent FAB */}
        <button
          type="button"
          onClick={handleAddAgent}
          className="absolute bottom-6 left-1/2 z-10 -translate-x-1/2 rounded-full bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow-lg transition-transform hover:scale-105"
          data-testid="add-agent-btn"
        >
          + Add Agent
        </button>

        {/* Property Panel */}
        {selectedNode && (
          <AgentPropertyPanel
            agent={selectedNode.data}
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
