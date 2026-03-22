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
import { AutoCreateAgencyModal } from "@/components/agency/AutoCreateAgencyModal";
import { useAgencyValidation } from "@/hooks/useAgencyValidation";
import { useAgencyHistory } from "@/hooks/useAgencyHistory";
import { Loader2, Network, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";

const DEFAULT_AGENT_DATA: AgencyNodeData = {
  nodeType: "agent",
  name: "New Agent",
  description: "",
  instructions: "",
  model: "",
  modelSettings: {},
  isEntryPoint: false,
  isOptional: false,
  tools: [],
};

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

function AgencyCanvas() {
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

      setNodes((nds) =>
        nds.map((n) => {
          if (n.data.nodeType !== "router") return n;
          const routerEdgesRemoved = removedEdges.filter((e) => e.source === n.id);
          if (routerEdgesRemoved.length === 0) return n;
          // Build set of "target|handleId" to match routes
          const removedKeys = new Set(routerEdgesRemoved.map((e) =>
            `${e.target}|${e.sourceHandle ?? "default"}`
          ));
          const routes: Array<{ condition: string; targetNodeId: string; label?: string; handleId?: string }> =
            (n.data.nodeConfig?.routes as any) ?? [];
          const filtered = routes.filter((r) =>
            !removedKeys.has(`${r.targetNodeId}|${r.handleId ?? "default"}`)
          );
          if (filtered.length === routes.length) return n;
          return {
            ...n,
            data: {
              ...n.data,
              nodeConfig: { ...(n.data.nodeConfig ?? {}), routes: filtered },
            },
          };
        }),
      );
    },
    [onEdgesChangeBase, edges, setNodes],
  );
  const [agencyName, setAgencyName] = useState("Untitled Agency");
  const [agencyStatus, setAgencyStatus] = useState<"draft" | "published" | "archived">("draft");
  const [defaultModel, setDefaultModel] = useState("");
  const [creatorFeeCredits, setCreatorFeeCredits] = useState(0);
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
  const [autoCreateOpen, setAutoCreateOpen] = useState(false);
  const canvasInitRef = useRef(false);
  const nodeCounterRef = useRef(0);

  // Validation + history
  const validationErrors = useAgencyValidation(nodes, edges);
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

    setAgencyName(agencyData.name ?? "Untitled Agency");
    setAgencyStatus(agencyData.status ?? "draft");
    setDefaultModel(agencyData.defaultModel ?? "");
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
          },
        };
      },
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

  // Handlers
  const onConnect = useCallback(
    (connection: Connection) => {
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

      // Auto-add route when edge is drawn FROM a Router node
      if (connection.source && connection.target) {
        setNodes((nds) =>
          nds.map((n) => {
            if (n.id !== connection.source || n.data.nodeType !== "router") return n;
            const routes: Array<{ condition: string; targetNodeId: string; label?: string; handleId?: string }> =
              (n.data.nodeConfig?.routes as any) ?? [];
            // Don't add duplicate for same target+handle
            if (routes.some((r) => r.targetNodeId === connection.target && r.handleId === (handleId ?? "default"))) return n;

            // Auto-set condition/label based on handle
            let autoCondition = "";
            let autoLabel = "";
            if (handleId === "true") {
              autoLabel = "True";
              autoCondition = "true";
            } else if (handleId === "false") {
              autoLabel = "False";
              autoCondition = "false";
            } else {
              autoLabel = "Default";
            }

            // If "default" handle → also set as defaultTarget
            const updates: Record<string, unknown> = {
              routes: [...routes, { condition: autoCondition, targetNodeId: connection.target!, label: autoLabel, handleId: handleId ?? "default" }],
            };
            if (handleId === "default" || (!handleId)) {
              updates.defaultTarget = connection.target!;
            }

            return {
              ...n,
              data: {
                ...n.data,
                nodeConfig: {
                  ...(n.data.nodeConfig ?? {}),
                  ...updates,
                },
              },
            };
          }),
        );
      }
    },
    [setEdges, setNodes],
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
        name: templateData.name || "New Agent",
        description: templateData.description || "",
        instructions: templateData.instructions || "",
        model: templateData.defaultModel || defaultModel || "",
        modelSettings: {},
        isEntryPoint: templateData.isEntryPoint || false,
        isOptional: false,
        tools: (templateData.defaultTools as AgencyNodeData["tools"]) || [],
        nodeConfig: templateData.nodeConfig || {},
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
  }, [setNodes, defaultModel, rfInstance]);

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
    addNodeFromTemplate({ nodeType: "agent", name: "New Agent" });
  }, [addNodeFromTemplate]);

  const handleNodeDataChange = useCallback(
    (nodeId: string, updates: Partial<AgencyNodeData>) => {
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
  const utils = trpc.useUtils();
  const createMutation = (trpc as any).agency.create.useMutation();
  const saveBuilderMutation = (trpc as any).agency.saveBuilder.useMutation();
  const updateMutation = (trpc as any).agency.update.useMutation();

  const serializeGraph = useCallback(() => {
    const agents = nodes.map((n) => ({
      name: n.data.name,
      description: n.data.description || undefined,
      nodeType: n.data.nodeType ?? "agent",
      instructions: n.data.instructions || undefined,
      model: n.data.model || (["agent", "supervisor"].includes(n.data.nodeType ?? "agent") ? (defaultModel || undefined) : undefined),
      modelSettings: n.data.modelSettings,
      isEntryPoint: n.data.isEntryPoint ?? false,
      isOptional: n.data.isOptional ?? false,
      position: n.position,
      nodeConfig: n.data.nodeConfig || undefined,
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
    }));

    const communicationFlows = edges.map((e) => ({
      fromAgentName: nodes.find((n) => n.id === e.source)?.data.name ?? "",
      toAgentName: nodes.find((n) => n.id === e.target)?.data.name ?? "",
      flowType: (e.data?.flowType ?? "delegation") as "delegation" | "handoff" | "parallel",
    }));

    return { agents, communicationFlows };
  }, [nodes, edges, defaultModel]);

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
          creatorFeeCredits,
        });

        toast.success("Agency created");
        setLocation(`/agencies/${result.id}/edit`);
      } else {
        // Use saveBuilder to persist the full graph
        await saveBuilderMutation.mutateAsync({
          id: agencyId,
          name: agencyName,
          defaultModel: defaultModel || null,
          agents,
          communicationFlows,
        });
        // Save creator fee via update
        await updateMutation.mutateAsync({
          id: agencyId,
          creatorFeeCredits,
        });
        // Invalidate caches so reload shows fresh data
        (utils as any).agency.getById.invalidate({ id: agencyId });
        (utils as any).agency.list.invalidate();
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
    defaultModel,
    creatorFeeCredits,
    createMutation,
    saveBuilderMutation,
    updateMutation,
    setLocation,
    utils,
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
    const agentSupervisorNodes = nodes.filter((n) =>
      ["agent", "supervisor"].includes(n.data.nodeType ?? "agent"),
    );
    const missingModel = agentSupervisorNodes.find((n) => !n.data.model);
    if (missingModel) {
      toast.error(`"${missingModel.data.name}" needs a model`);
      return;
    }
    const missingInstructions = agentSupervisorNodes.find((n) => !n.data.instructions);
    if (missingInstructions) {
      toast.error(`"${missingInstructions.data.name}" needs instructions`);
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
    setTimeout(() => rfInstance.fitView({ padding: 0.2 }), 50);
    toast.success("Layout applied");
  }, [nodes, edges, setNodes, rfInstance.fitView]);

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
        onAutoCreate={() => setAutoCreateOpen(true)}
        readOnly={!canEdit}
      />

      {/* Version history drawer */}
      {!isNew && agencyId && (
        <AgencyVersionHistory
          agencyId={agencyId}
          open={versionHistoryOpen}
          onOpenChange={setVersionHistoryOpen}
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

          {/* Empty canvas onboarding overlay — pointer-events-none everywhere
              except the buttons, so drag & drop passes through to canvas */}
          {nodes.length === 0 && (
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-10">
              <div className="text-center">
                <Network className="mx-auto h-12 w-12 text-slate-300 mb-4" />
                <h3 className="text-lg font-semibold text-slate-600 mb-1">Build your Agent Network</h3>
                <p className="text-sm text-slate-400 mb-6">
                  Drag nodes from the left panel — or let AI design it for you
                </p>
                <div className="flex items-center justify-center gap-3 pointer-events-auto">
                  <Button
                    className="bg-purple-600 hover:bg-purple-700 text-white gap-2"
                    onClick={() => setAutoCreateOpen(true)}
                  >
                    <Sparkles className="h-4 w-4" />
                    AI Agency Creator
                  </Button>
                  <Button variant="outline" onClick={handleAddAgent}>
                    + Add First Agent
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
            + Add Agent
          </button>
        )}

        {/* Property Panel — polymorphic for all 7 node types (hidden in read-only mode) */}
        {canEdit && selectedNode && (
          <NodePropertyPanel
            node={selectedNode.data}
            nodeId={selectedNode.id}
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
