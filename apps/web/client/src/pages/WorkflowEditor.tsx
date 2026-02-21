/**
 * Workflow Editor - Visual Flow Builder (Registry-Driven Architecture)
 *
 * This is the fully integrated workflow editor using:
 * - Registry-driven node definitions (backend as source of truth)
 * - Dynamic form generation from InputSpec
 * - Real-time execution visualization with SSE
 * - Cost estimation and credit management
 * - Template marketplace
 */

import { useState, useCallback, useRef, useMemo, useEffect } from 'react';
import { useLocation, useRoute } from 'wouter';
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
  type ReactFlowInstance,
} from 'reactflow';
import 'reactflow/dist/style.css';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { trpc } from '@/lib/trpc';
import {
  GitBranch,
  Save,
  Play,
  ArrowLeft,
  Plus,
  X,
  AlertCircle,
  AlertTriangle,
  Loader2,
  FileJson,
  Wrench,
  ShoppingBag,
  ChevronLeft,
  ChevronRight,
  Sparkles,
  Trash2,
  PenLine,
  HelpCircle,
  Layers,
  Wand2,
  Clock,
  Terminal,
} from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { AutoCreateWorkflowModal } from '@/components/workflow/AutoCreateWorkflowModal';
import { AutoEditWorkflowModal } from '@/components/workflow/AutoEditWorkflowModal';
import { ConvertWithISCDialog } from '@/components/workflow/ConvertWithISCDialog';
import { WorkflowVersionHistory } from '@/components/workflow/WorkflowVersionHistory';

// Step 1: Import BaseNode and registry hook
import { BaseNode } from '@/components/workflow/nodes/BaseNode';
import GroupNode from '@/components/workflow/nodes/GroupNode';
import { useNodeRegistry } from '@/lib/workflow/useNodeRegistry';
import {
  isValidConnection as createIsValidConnection,
  getConnectionError,
} from '@/lib/workflow/isValidConnection';

// Step 4: Import DynamicNodeConfig
import { DynamicNodeConfig } from '@/components/workflow/config/DynamicNodeConfig';

// Step 6: Import Execution components
import { useExecutionStore } from '@/stores/executionStore';
import { ExecutionLogPanel } from '@/components/workflow/execution/ExecutionLogPanel';
import { ConsolePanel } from '@/components/workflow/execution/ConsolePanel';
import { CostEstimation } from '@/components/workflow/execution/CostEstimation';
import { WorkflowRunDialog } from '@/components/workflow/execution/WorkflowRunDialog';

// Step 10: Import TemplateBrowser
import { TemplateBrowser } from '@/components/workflow/TemplateBrowser';

// Import LLM Model Selector
import LLMModelSelector, { type LLMModel } from '@/components/workflow/LLMModelSelector';

// Node data structure for registry-driven nodes
interface WorkflowNodeData {
  nodeType: string;  // Logical type from registry (e.g., 'llm_call', 'rag_query')
  label: string;
  config: Record<string, unknown>;
}

// Step 1: Node types (workflow + group)
const nodeTypes: NodeTypes = {
  workflow: BaseNode,
  group: GroupNode as any,
};

function FlowEditor() {
  const [, setLocation] = useLocation();
  const [, routeParams] = useRoute('/workflows/editor/:id');
  const [workflowId, setWorkflowId] = useState<string | null>(null);
  const [workflowName, setWorkflowName] = useState('');
  const [workflowDescription, setWorkflowDescription] = useState('');
  const [defaultModel, setDefaultModel] = useState<string>(() => {
    // Load saved default model from localStorage on mount
    if (typeof window !== 'undefined') {
      return localStorage.getItem('workflow-default-model') || '';
    }
    return '';
  });

  // Save default model to localStorage whenever it changes
  const handleSetDefaultModel = useCallback((modelId: string) => {
    setDefaultModel(modelId);
    if (typeof window !== 'undefined') {
      localStorage.setItem('workflow-default-model', modelId);
    }
  }, []);
  const [nodes, setNodes, onNodesChange] = useNodesState<WorkflowNodeData>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);
  const reactFlowWrapper = useRef<HTMLDivElement>(null);
  const lastConnectionError = useRef<string | null>(null);
  const connectionCompleted = useRef(false);
  const [reactFlowInstance, setReactFlowInstance] = useState<ReactFlowInstance | null>(null);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [selectedEdgeId, setSelectedEdgeId] = useState<string | null>(null);
  const [validationErrors, setValidationErrors] = useState<string[]>([]);
  const [compilationWarnings, setCompilationWarnings] = useState<string[]>([]);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [sidebarWidth, setSidebarWidth] = useState(320);
  const sidebarDragRef = useRef(false);
  const sidebarDragStartX = useRef(0);
  const sidebarDragStartWidth = useRef(320);
  const [showTemplateBrowser, setShowTemplateBrowser] = useState(false);
  const [compiledManifest, setCompiledManifest] = useState<any>(null);
  // Context menu state
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; nodeId: string } | null>(null);
  const [edgeContextMenu, setEdgeContextMenu] = useState<{ x: number; y: number; edgeId: string } | null>(null);
  // Edit Node ID dialog
  const [editNodeIdDialog, setEditNodeIdDialog] = useState<{ nodeId: string } | null>(null);
  const [editNodeIdValue, setEditNodeIdValue] = useState('');
  // Help dialog
  const [helpDialog, setHelpDialog] = useState<string | null>(null); // nodeType string
  // Auto Create Workflow modal
  const [showAutoCreate, setShowAutoCreate] = useState(false);
  // Auto Edit Workflow modal
  const [showAutoEdit, setShowAutoEdit] = useState(false);
  const [showConvertDialog, setShowConvertDialog] = useState(false);
  const [showVersionHistory, setShowVersionHistory] = useState(false);
  const [showSaveDialog, setShowSaveDialog] = useState(false);
  const [saveChangeDescription, setSaveChangeDescription] = useState('');
  // Run dialog
  const [showRunDialog, setShowRunDialog] = useState(false);
  // Console panel
  const [showConsolePanel, setShowConsolePanel] = useState(false);
  const [consolePanelHeight, setConsolePanelHeight] = useState(200);
  const handleToggleConsolePanel = useCallback(() => setShowConsolePanel((v) => !v), []);

  // Step 2: Use node registry instead of hardcoded options
  const { nodeTypes: registryNodeTypes, isLoading: registryLoading, getNodeTypesByCategory } = useNodeRegistry();

  // Step 6: Execution store
  const {
    isExecuting,
    executionId,
    logs,
    startExecution,
    updateNodeStatus,
    addLog,
    completeExecution,
    resetExecution,
  } = useExecutionStore();

  // Get current user for credit balance
  const { data: user } = (trpc as any).auth.me.useQuery();

  // Fetch available LLM models
  const { data: availableModelsData, isLoading: modelsLoading } = (trpc as any).multiProvider.getAvailableModelsWithProviders.useQuery();

  // Transform models data for selector
  const llmModels: LLMModel[] = useMemo(() => {
    if (!availableModelsData) return [];
    return Object.values(availableModelsData).map((modelData: any) => ({
      modelId: modelData.modelId,
      modelName: modelData.modelName,
      providers: modelData.providers || [],
    }));
  }, [availableModelsData]);

  // tRPC mutations
  const compileMutation = (trpc as any).workflow.compile.useMutation();
  const executeMutation = (trpc as any).workflow.execute.useMutation();
  const saveWorkflowMutation = (trpc as any).workflow.save.useMutation();
  const numericWorkflowId = workflowId ? Number(workflowId) : null;
  const loadWorkflowQuery = (trpc as any).workflow.load.useQuery(
    { id: numericWorkflowId! },
    {
      enabled: !!numericWorkflowId && !isNaN(numericWorkflowId),
      // Prevent background refetches from overwriting unsaved canvas edits.
      // The canvas is the user's local working copy; server data is only the
      // initial snapshot. A refetch triggered by window focus or reconnect
      // would call setNodes/setEdges and discard any nodes the user has dragged
      // onto the canvas since the page loaded.
      staleTime: Infinity,
      refetchOnWindowFocus: false,
      refetchOnReconnect: false,
    }
  );
  const templatesQuery = (trpc as any).workflow.listSaved.useQuery({});

  // Track whether the canvas has been initialised from server data.
  // Only the very first successful load should populate nodes/edges.
  // Subsequent query data changes (e.g. a manual refetch after version restore)
  // must not silently clobber the user's unsaved work.
  const canvasInitialisedRef = useRef(false);

  // Load workflow from URL — supports both /editor/:id and /editor?id=xxx
  useEffect(() => {
    const idFromRoute = routeParams?.id;
    if (idFromRoute) {
      setWorkflowId(idFromRoute);
      // Reset initialisation flag when the workflow ID changes so a fresh
      // load populates the canvas for the new workflow.
      canvasInitialisedRef.current = false;
      return;
    }
    const idFromQuery = new URLSearchParams(window.location.search).get('id');
    if (idFromQuery) {
      setWorkflowId(idFromQuery);
      canvasInitialisedRef.current = false;
    }
  }, [routeParams?.id]);

  // Load workflow data when query returns — only on initial load.
  // Do NOT re-run when data changes due to background refetches; that would
  // overwrite nodes the user has added to the canvas since the initial load.
  useEffect(() => {
    if (loadWorkflowQuery.data && !canvasInitialisedRef.current) {
      canvasInitialisedRef.current = true;
      const workflow = loadWorkflowQuery.data;
      setWorkflowName(workflow.name || '');
      setWorkflowDescription(workflow.description || '');
      // Use workflow's defaultModel if available, otherwise use localStorage
      const savedModel = workflow.defaultModel || localStorage.getItem('workflow-default-model') || '';
      setDefaultModel(savedModel);
      if (workflow.workflowJson) {
        setNodes(workflow.workflowJson.nodes || []);
        setEdges(workflow.workflowJson.edges || []);
      }
    }
  }, [loadWorkflowQuery.data, setNodes, setEdges]);

  // Selected node
  const selectedNode = nodes.find(n => n.id === selectedNodeId);

  // Step 4: Compute connections for selected node
  const connections = useMemo(() => {
    if (!selectedNode) return {};
    return edges.reduce((acc, edge) => {
      if (edge.target === selectedNode.id && edge.targetHandle) {
        acc[edge.targetHandle] = true;
      }
      return acc;
    }, {} as Record<string, boolean>);
  }, [selectedNode, edges]);

  // Step 5: Port type validation
  const isValidConnection = useCallback(
    (connection: Connection) => {
      if (!registryNodeTypes) return true;
      const error = getConnectionError(connection, nodes, registryNodeTypes);
      lastConnectionError.current = error;
      return error === null;
    },
    [nodes, registryNodeTypes]
  );

  const onConnectStart = useCallback(() => {
    lastConnectionError.current = null;
    connectionCompleted.current = false;
  }, []);

  const onConnectEnd = useCallback(() => {
    if (!connectionCompleted.current && lastConnectionError.current) {
      toast.error(lastConnectionError.current, { duration: 5000 });
    }
  }, []);

  // Step 3: Node creation handler
  const onAddNode = useCallback(
    (nodeType: string) => {
      const spec = registryNodeTypes?.find(t => t.type === nodeType);
      if (!spec) return;

      // Calculate position - find empty space or center of current view
      let position: { x: number; y: number } = { x: 250, y: 250 };
      
      if (reactFlowInstance) {
        // Get current viewport center
        const { x, y, zoom } = reactFlowInstance.getViewport();
        const canvasWidth = reactFlowWrapper.current?.clientWidth || 800;
        const canvasHeight = reactFlowWrapper.current?.clientHeight || 600;
        
        // Calculate center of visible area in flow coordinates
        const centerX = (canvasWidth / 2 - x) / zoom;
        const centerY = (canvasHeight / 2 - y) / zoom;
        
        // Check for overlapping nodes and find empty space
        const existingNodes = reactFlowInstance.getNodes();
        let offsetX = 0;
        let offsetY = 0;
        const step = 220; // Node width + padding
        let found = false;
        
        // Try positions in a spiral pattern starting from center
        for (let i = 0; i < 20; i++) {
          const testX = centerX + offsetX;
          const testY = centerY + offsetY;
          
          // Check if this position overlaps with any existing node
          const overlaps = existingNodes.some((node: Node) => {
            const dx = Math.abs(node.position.x - testX);
            const dy = Math.abs(node.position.y - testY);
            return dx < 180 && dy < 100; // Node approximate size
          });
          
          if (!overlaps) {
            position = { x: testX, y: testY };
            found = true;
            break;
          }
          
          // Spiral pattern: right, down, left, left, up, up, right, right, right, down, down, down...
          if (i === 0) offsetX = step;
          else if (i === 1) { offsetX = 0; offsetY = step; }
          else if (i === 2) { offsetX = -step; offsetY = 0; }
          else if (i === 3) { offsetX = -step; }
          else if (i === 4) { offsetX = 0; offsetY = -step; }
          else if (i === 5) { offsetY = -step; }
          else if (i === 6) { offsetX = step; offsetY = 0; }
          else if (i === 7) { offsetX = step; }
          else if (i === 8) { offsetX = step; }
          else {
            // Expand spiral
            const spiralStep = Math.ceil((i - 8) / 4) * step;
            const direction = (i - 8) % 4;
            if (direction === 0) { offsetX = spiralStep; offsetY = -spiralStep + step; }
            else if (direction === 1) { offsetX = spiralStep; offsetY = spiralStep; }
            else if (direction === 2) { offsetX = -spiralStep; offsetY = spiralStep; }
            else { offsetX = -spiralStep; offsetY = -spiralStep; }
          }
        }
        
        if (!found) {
          // Fallback: place below the lowest node
          const lowestY = existingNodes.length > 0 
            ? Math.max(...existingNodes.map((n: Node) => n.position.y + 100))
            : 0;
          position = { x: centerX, y: lowestY + 150 };
        }
      } else {
        position = { x: 250, y: 250 };
      }

      const newNode: Node<WorkflowNodeData> = {
        id: `${nodeType}-${Date.now()}`,
        type: 'workflow',  // Always use 'workflow' type
        data: {
          nodeType,  // Logical type from registry
          label: spec.display_name,
          config: {},  // Empty config, filled via DynamicNodeConfig
        },
        position,
      };

      setNodes((nodes: Node<WorkflowNodeData>[]) => [...nodes, newNode]);
      
      // Select the new node automatically
      setSelectedNodeId(newNode.id);
      
      // If node was added via palette click (not drag), fit view to show the new node
      if (reactFlowInstance) {
        setTimeout(() => {
          reactFlowInstance.fitView({ 
            padding: 0.2, 
            duration: 300,
            nodes: [{ id: newNode.id }]
          });
        }, 50);
      }
    },
    [registryNodeTypes, reactFlowInstance, setNodes]
  );

  const onConnect = useCallback(
    (params: Connection) => {
      connectionCompleted.current = true;
      const newEdge = {
        ...params,
        type: 'smoothstep',
        animated: false,
        style: { stroke: '#3b82f6', strokeWidth: 2 },
        markerEnd: { type: MarkerType.ArrowClosed, color: '#3b82f6' },
      };
      setEdges((eds: Edge[]) => addEdge(newEdge, eds));
    },
    [setEdges]
  );

  // Handle edge reconnection (drag to change connection)
  const onReconnect = useCallback(
    (oldEdge: Edge, newConnection: Connection) => {
      // Validate connection has source and target
      if (!newConnection.source || !newConnection.target) {
        return;
      }
      setEdges((eds: Edge[]) => {
        // Remove old edge and add new connection
        const filtered = eds.filter((e) => e.id !== oldEdge.id);
        const newEdge: Edge = {
          id: `edge-${newConnection.source}-${newConnection.target}-${Date.now()}`,
          source: newConnection.source as string,
          target: newConnection.target as string,
          sourceHandle: newConnection.sourceHandle,
          targetHandle: newConnection.targetHandle,
          type: 'smoothstep',
          animated: false,
          style: { stroke: '#3b82f6', strokeWidth: 2 },
          markerEnd: { type: MarkerType.ArrowClosed, color: '#3b82f6' },
        };
        return [...filtered, newEdge];
      });
      toast.success('Connection updated');
    },
    [setEdges]
  );

  // Handle edge click to select
  const onEdgeClick = useCallback((_event: React.MouseEvent, edge: Edge) => {
    setSelectedEdgeId(edge.id);
    setSelectedNodeId(null); // Deselect node when clicking edge
  }, []);

  // Handle delete selected edge
  const handleDeleteSelectedEdge = useCallback(() => {
    if (selectedEdgeId) {
      setEdges((eds: Edge[]) => eds.filter((e) => e.id !== selectedEdgeId));
      setSelectedEdgeId(null);
      toast.success('Connection deleted');
    }
  }, [selectedEdgeId, setEdges]);

  // Delete key handler for edges
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if ((event.key === 'Delete' || event.key === 'Backspace') && selectedEdgeId && !isExecuting) {
        handleDeleteSelectedEdge();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedEdgeId, handleDeleteSelectedEdge, isExecuting]);

  const onDragOver = useCallback((event: React.DragEvent) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
  }, []);

  const onDrop = useCallback(
    (event: React.DragEvent) => {
      event.preventDefault();

      if (!reactFlowInstance || !reactFlowWrapper.current) return;

      const nodeType = event.dataTransfer.getData('application/reactflow');
      if (!nodeType) return;

      onAddNode(nodeType);
    },
    [reactFlowInstance, onAddNode]
  );

  const onDragStart = (event: React.DragEvent, nodeType: string) => {
    event.dataTransfer.setData('application/reactflow', nodeType);
    event.dataTransfer.effectAllowed = 'move';
  };

  const onNodeClick = useCallback((_: any, node: Node<WorkflowNodeData>) => {
    setSelectedNodeId(node.id);
    setContextMenu(null);
  }, []);

  // ---- Context menu ----
  const onNodeContextMenu = useCallback((event: React.MouseEvent, node: Node) => {
    event.preventDefault();
    setContextMenu({ x: event.clientX, y: event.clientY, nodeId: node.id });
    setEdgeContextMenu(null);
  }, []);

  // ---- Edge context menu ----
  const onEdgeContextMenu = useCallback((event: React.MouseEvent, edge: Edge) => {
    event.preventDefault();
    setEdgeContextMenu({ x: event.clientX, y: event.clientY, edgeId: edge.id });
    setSelectedEdgeId(edge.id);
    setContextMenu(null);
    setSelectedNodeId(null);
  }, []);

  // Handle delete edge from context menu
  const handleDeleteEdge = useCallback((edgeId: string) => {
    setEdges((eds: Edge[]) => eds.filter((e) => e.id !== edgeId));
    setEdgeContextMenu(null);
    setSelectedEdgeId(null);
    toast.success('Connection deleted');
  }, [setEdges]);

  const onPaneClick = useCallback(() => {
    setContextMenu(null);
    setEdgeContextMenu(null);
    setSelectedNodeId(null);
  }, []);

  // ---- Sidebar resize drag ----
  const onSidebarResizeMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    sidebarDragRef.current = true;
    sidebarDragStartX.current = e.clientX;
    sidebarDragStartWidth.current = sidebarWidth;

    const onMouseMove = (ev: MouseEvent) => {
      if (!sidebarDragRef.current) return;
      const delta = ev.clientX - sidebarDragStartX.current;
      const newWidth = Math.min(600, Math.max(200, sidebarDragStartWidth.current + delta));
      setSidebarWidth(newWidth);
    };
    const onMouseUp = () => {
      sidebarDragRef.current = false;
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
    document.body.style.cursor = 'ew-resize';
    document.body.style.userSelect = 'none';
  }, [sidebarWidth]);

  // ---- Delete node ----
  const handleDeleteNode = useCallback((nodeId: string) => {
    setNodes((nds: Node[]) => nds.filter(n => n.id !== nodeId));
    setEdges((eds: Edge[]) => eds.filter(e => e.source !== nodeId && e.target !== nodeId));
    if (selectedNodeId === nodeId) setSelectedNodeId(null);
    setContextMenu(null);
  }, [selectedNodeId, setNodes, setEdges]);

  // ---- Edit Node ID ----
  const openEditNodeId = useCallback((nodeId: string) => {
    setEditNodeIdValue(nodeId);
    setEditNodeIdDialog({ nodeId });
    setContextMenu(null);
  }, []);

  const handleEditNodeId = useCallback(() => {
    if (!editNodeIdDialog) return;
    const oldId = editNodeIdDialog.nodeId;
    const newId = editNodeIdValue.trim();
    if (!newId || newId === oldId) { setEditNodeIdDialog(null); return; }
    if (nodes.some(n => n.id === newId)) {
      toast.error('Node ID already exists');
      return;
    }
    setNodes((nds: Node[]) => nds.map(n => n.id === oldId ? { ...n, id: newId } : n));
    setEdges((eds: Edge[]) => eds.map(e => ({
      ...e,
      source: e.source === oldId ? newId : e.source,
      target: e.target === oldId ? newId : e.target,
    })));
    if (selectedNodeId === oldId) setSelectedNodeId(newId);
    setEditNodeIdDialog(null);
    toast.success('Node ID updated');
  }, [editNodeIdDialog, editNodeIdValue, nodes, selectedNodeId, setNodes, setEdges]);

  // ---- Help ----
  const openHelp = useCallback((nodeId: string) => {
    const node = nodes.find(n => n.id === nodeId);
    if (node) setHelpDialog(node.data.nodeType);
    setContextMenu(null);
  }, [nodes]);

  // ---- Group selected nodes ----
  const handleGroupSelected = useCallback(() => {
    const selected = nodes.filter(n => n.selected && n.type !== 'group');
    if (selected.length < 2) {
      toast.error('Select 2 or more nodes to create a group (hold Shift to multi-select)');
      setContextMenu(null);
      return;
    }
    const PAD_X = 24;
    const PAD_TOP = 44;
    const PAD_BOTTOM = 24;
    const NODE_W = 200;
    const NODE_H = 80;
    const minX = Math.min(...selected.map(n => n.position.x)) - PAD_X;
    const minY = Math.min(...selected.map(n => n.position.y)) - PAD_TOP;
    const maxX = Math.max(...selected.map(n => n.position.x + NODE_W)) + PAD_X;
    const maxY = Math.max(...selected.map(n => n.position.y + NODE_H)) + PAD_BOTTOM;
    const groupId = `group-${Date.now()}`;
    const groupNode: Node = {
      id: groupId,
      type: 'group',
      position: { x: minX, y: minY },
      style: { width: maxX - minX, height: maxY - minY },
      data: {
        label: 'Group',
        collapsed: false,
        onToggleCollapse: handleToggleGroupCollapse,
      },
    };
    setNodes((nds: Node[]) => [
      ...nds.filter(n => !selected.find(s => s.id === n.id)),
      groupNode,
      ...selected.map(n => ({
        ...n,
        parentNode: groupId,
        extent: 'parent' as const,
        position: { x: n.position.x - minX, y: n.position.y - minY },
      })),
    ]);
    setContextMenu(null);
    toast.success('Nodes grouped');
  }, [nodes, setNodes]);

  // ---- Toggle group collapse ----
  // Use a ref to access current nodes inside the edge updater without stale closure
  const nodesRef = useRef<Node[]>([]);
  useEffect(() => { nodesRef.current = nodes; }, [nodes]);

  const handleToggleGroupCollapse = useCallback((groupId: string) => {
    const currentNodes = nodesRef.current;
    const group = currentNodes.find(n => n.id === groupId);
    const collapsed = !group?.data?.collapsed;
    const childIds = new Set(currentNodes.filter(n => n.parentNode === groupId).map(n => n.id));

    setNodes((nds: Node[]) => nds.map(n => {
      if (n.id === groupId) return { ...n, data: { ...n.data, collapsed, onToggleCollapse: handleToggleGroupCollapse } };
      if (n.parentNode === groupId) return { ...n, hidden: collapsed };
      return n;
    }));

    setEdges((eds: Edge[]) => eds.map(e => ({
      ...e,
      hidden: collapsed ? (childIds.has(e.source) || childIds.has(e.target)) : false,
    })));
  }, [setNodes, setEdges]);

  // ---- Auto Create: apply generated workflow ----
  const handleAutoGenerated = useCallback((
    generatedNodes: Node[],
    generatedEdges: Edge[],
    mode: 'replace' | 'append',
  ) => {
    // Ensure all edges have unique IDs
    const timestamp = Date.now();
    const edgesWithIds = generatedEdges.map((edge, index) => ({
      ...edge,
      id: edge.id || `edge-${edge.source}-${edge.target}-${index}-${timestamp}`,
    }));

    if (mode === 'replace') {
      setNodes(generatedNodes);
      setEdges(edgesWithIds);
    } else {
      // Append: offset nodes to the right of existing content
      const offsetX = nodes.length > 0
        ? Math.max(...nodes.map(n => n.position.x)) + 350
        : 0;
      setNodes((nds: Node[]) => [
        ...nds,
        ...generatedNodes.map(n => ({
          ...n,
          id: `${n.id}-${timestamp}`,
          position: { x: n.position.x + offsetX, y: n.position.y },
        })),
      ]);
      // Remap edge source/target to match new node IDs and ensure unique edge IDs
      const nodeIdMap = new Map(generatedNodes.map(n => [n.id, `${n.id}-${timestamp}`]));
      const remappedEdges = edgesWithIds.map(edge => ({
        ...edge,
        id: `${edge.id}-${timestamp}`,
        source: nodeIdMap.get(edge.source) || edge.source,
        target: nodeIdMap.get(edge.target) || edge.target,
      }));
      setEdges((eds: Edge[]) => [...eds, ...remappedEdges]);
    }
    setCompiledManifest(null); // require re-compile after changes
    toast.success(`Added ${generatedNodes.length} nodes and ${generatedEdges.length} connections`);
  }, [nodes, setNodes, setEdges]);

  // ---- Auto Edit: apply AI-fixed workflow (always replaces canvas) ----
  const handleAutoEdited = useCallback(async (
    editedNodes: Node[],
    editedEdges: Edge[],
    _description: string,
    changes: string[],
  ) => {
    const timestamp = Date.now();
    const edgesWithIds = editedEdges.map((edge, index) => ({
      ...edge,
      id: edge.id || `edge-${edge.source}-${edge.target}-${index}-${timestamp}`,
    }));
    setNodes(editedNodes);
    setEdges(edgesWithIds);
    setCompiledManifest(null); // require re-compile after AI edits
    setValidationErrors([]);
    setCompilationWarnings([]);

    // Auto-save version snapshot so user can restore the pre-AI state via History
    if (workflowId) {
      try {
        const changeDesc = changes.length > 0
          ? `AI: ${changes.slice(0, 3).join("; ")}${changes.length > 3 ? ` (+${changes.length - 3} more)` : ""}`
          : "Improved by AI";
        await saveWorkflowMutation.mutateAsync({
          id: Number(workflowId),
          name: workflowName || "Untitled Workflow",
          description: workflowDescription,
          defaultModel: defaultModel || undefined,
          workflowJson: { nodes: editedNodes, edges: edgesWithIds },
          changeDescription: changeDesc,
        });
      } catch (err) {
        // Best-effort auto-save — user can always save manually
        console.warn("[AI Edit] Auto-save version snapshot failed:", err);
      }
    }
  }, [setNodes, setEdges, workflowId, workflowName, workflowDescription, defaultModel, saveWorkflowMutation]);

  const handleConfigChange = useCallback(
    (newConfig: Record<string, unknown>) => {
      if (!selectedNodeId) return;
      setNodes((nodes: Node<WorkflowNodeData>[]) =>
        nodes.map((n: Node<WorkflowNodeData>) =>
          n.id === selectedNodeId
            ? { ...n, data: { ...n.data, config: newConfig } }
            : n
        )
      );
    },
    [selectedNodeId, setNodes]
  );

  // Focus a node on the canvas by ID (pan + zoom + select)
  const focusNode = useCallback((nodeId: string) => {
    if (!reactFlowInstance) return;
    const node = nodes.find((n: Node) => n.id === nodeId);
    if (node) {
      reactFlowInstance.fitView({ nodes: [node], padding: 0.8, duration: 500 });
    }
    setSelectedNodeId(nodeId);
  }, [reactFlowInstance, nodes]);

  // Parse an error/warning message and render node IDs as clickable badges.
  // Backend error format: "... nodeId.handle -> nodeId.handle ..."
  // Node IDs have the pattern: word-chars + hyphen + digits (e.g. trigger_1-1771552294131)
  const renderErrorParts = useCallback((message: string, variant: 'error' | 'warning' = 'error') => {
    const badgeClass = variant === 'error'
      ? 'inline-flex items-center gap-0.5 mx-0.5 px-1.5 py-0 rounded bg-red-200 dark:bg-red-800 hover:bg-red-300 dark:hover:bg-red-700 text-red-900 dark:text-red-100 font-medium cursor-pointer hover:underline'
      : 'inline-flex items-center gap-0.5 mx-0.5 px-1.5 py-0 rounded bg-amber-200 dark:bg-amber-800 hover:bg-amber-300 dark:hover:bg-amber-700 text-amber-900 dark:text-amber-100 font-medium cursor-pointer hover:underline';

    const pattern = /([a-zA-Z][\w]*-\d+)\.([\w]+)/g;
    const segments: React.ReactNode[] = [];
    let last = 0;
    let m: RegExpExecArray | null;

    while ((m = pattern.exec(message)) !== null) {
      if (m.index > last) segments.push(message.slice(last, m.index));
      const nodeId = m[1];
      const handle = m[2];
      const nodeData = nodes.find((n: Node) => n.id === nodeId);
      const label = (nodeData?.data as any)?.label || nodeId;
      segments.push(
        <button
          key={m.index}
          onClick={() => focusNode(nodeId)}
          className={badgeClass}
          title={`Click to focus: ${nodeId}`}
        >
          <span>{label}</span>
          <span className="opacity-60 text-xs">.{handle}</span>
        </button>
      );
      last = m.index + m[0].length;
    }
    if (last < message.length) segments.push(message.slice(last));
    return segments.length > 1 ? <>{segments}</> : message;
  }, [nodes, focusNode]);

  // Step 7: Compile workflow
  const handleCompile = async () => {
    try {
      const result = await compileMutation.mutateAsync({
        nodes,
        edges,
        metadata: {
          name: workflowName || 'Untitled Workflow',
          description: workflowDescription,
          version: '1.0.0',
        },
      });

      if (result.success) {
        setCompiledManifest(result.manifest);
        setValidationErrors([]);
        const warns = (result as any).warnings as string[] | undefined;
        setCompilationWarnings(warns?.length ? warns : []);
        if (warns?.length) {
          toast.warning(`Compiled with ${warns.length} warning${warns.length > 1 ? 's' : ''} — check the panel above`);
        } else {
          toast.success('Workflow compiled successfully!');
        }
      } else {
        setCompilationWarnings([]);
        setValidationErrors(result.errors || [result.error || 'Unknown error']);
      }
    } catch (error: any) {
      setCompilationWarnings([]);
      setValidationErrors([error.message || 'Compilation failed']);
    }
  };

  // Step 9: Save workflow — opens dialog to capture optional change description
  const handleSave = () => {
    setSaveChangeDescription('');
    setShowSaveDialog(true);
  };

  const handleSaveConfirm = async () => {
    setShowSaveDialog(false);
    try {
      const result = await saveWorkflowMutation.mutateAsync({
        id: numericWorkflowId || undefined,
        name: workflowName || 'Untitled Workflow',
        description: workflowDescription,
        defaultModel: defaultModel || undefined,
        workflowJson: { nodes, edges },
        changeDescription: saveChangeDescription.trim() || undefined,
      });

      setWorkflowId(result.id);
      setSaveChangeDescription('');
      toast.success('Workflow saved successfully!');
    } catch (error: any) {
      toast.error(`Save failed: ${error.message}`);
    }
  };

  // SSE EventSource ref for cleanup
  const eventSourceRef = useRef<EventSource | null>(null);

  // Cleanup EventSource on unmount
  useEffect(() => {
    return () => {
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
        eventSourceRef.current = null;
      }
    };
  }, []);

  // Safe JSON parse helper
  const safeJsonParse = (data: string): any | null => {
    try {
      return JSON.parse(data);
    } catch {
      console.error('Failed to parse SSE event data:', data);
      return null;
    }
  };

  // Step 8: Execute workflow with SSE
  const handleExecute = () => {
    if (!compiledManifest) {
      toast.error('Please compile workflow first');
      return;
    }
    // Always open run dialog — collects form_input values if present,
    // or shows a simple confirmation if no inputs are needed.
    setShowRunDialog(true);
  };

  const handleRunWithInputs = async (inputData: Record<string, unknown>) => {
    setShowRunDialog(false);
    try {
      // Start execution
      const result = await executeMutation.mutateAsync({
        id: numericWorkflowId,
        workflowJson: {
          nodes,
          edges,
          _compiledMetadata: compiledManifest,
        },
        inputData,
      });

      // Initialize execution store
      startExecution(result.executionId);

      // Close existing EventSource if any
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
      }

      // Connect to SSE stream
      const eventSource = new EventSource(
        `/api/v1/workflows/execute/${encodeURIComponent(result.executionId)}/stream`,
        { withCredentials: true }
      );
      eventSourceRef.current = eventSource;

      eventSource.addEventListener('node_start', (event: MessageEvent) => {
        const data = safeJsonParse(event.data);
        if (!data) return;
        updateNodeStatus(data.nodeId, {
          status: 'running',
          startTime: Date.now(),
        });
        addLog({
          id: data.event_id,
          timestamp: Date.now(),
          nodeId: data.nodeId,
          nodeName: data.nodeName || data.nodeId,
          eventType: 'node_start',
          status: 'running',
        });
      });

      eventSource.addEventListener('node_complete', (event: MessageEvent) => {
        const data = safeJsonParse(event.data);
        if (!data) return;
        updateNodeStatus(data.nodeId, {
          status: 'success',
          endTime: Date.now(),
          output: data.output,
        });
        addLog({
          id: data.event_id,
          timestamp: Date.now(),
          nodeId: data.nodeId,
          nodeName: data.nodeName || data.nodeId,
          eventType: 'node_complete',
          status: 'success',
          duration: data.durationMs,
          output: data.output,
        });
      });

      eventSource.addEventListener('node_error', (event: MessageEvent) => {
        const data = safeJsonParse(event.data);
        if (!data) return;
        updateNodeStatus(data.nodeId, {
          status: 'failed',
          endTime: Date.now(),
          error: data.error,
        });
        addLog({
          id: data.event_id,
          timestamp: Date.now(),
          nodeId: data.nodeId,
          nodeName: data.nodeName || data.nodeId,
          eventType: 'node_error',
          status: 'failed',
          error: data.error,
        });
      });

      eventSource.addEventListener('workflow_complete', (event: MessageEvent) => {
        const { nodeStatuses: finalStatuses } = useExecutionStore.getState();
        const failedCount = Object.values(finalStatuses).filter(s => s.status === 'failed').length;
        completeExecution();
        eventSource.close();
        eventSourceRef.current = null;
        if (failedCount > 0) {
          toast.error(`Workflow completed with ${failedCount} node${failedCount > 1 ? 's' : ''} failed`);
        } else {
          toast.success('Workflow completed successfully');
        }
      });

      eventSource.addEventListener('workflow_error', (event: MessageEvent) => {
        const data = safeJsonParse(event.data);
        completeExecution();
        eventSource.close();
        eventSourceRef.current = null;
        const errorMsg = data?.error || 'Unknown workflow error';
        toast.error(`Workflow failed: ${errorMsg}`);
      });

      eventSource.onerror = () => {
        eventSource.close();
        eventSourceRef.current = null;
        completeExecution();
        toast.error('Execution stream connection lost');
      };
    } catch (error: any) {
      if (error.message?.includes('402') || error.message?.includes('Insufficient')) {
        setValidationErrors(['Insufficient credits to run workflow']);
      } else {
        setValidationErrors([`Execution failed: ${error.message}`]);
      }
    }
  };

  // Step 10: Template browser handlers
  const handleLoadTemplate = useCallback(
    (template: any) => {
      // Validate template structure before loading
      const wf = template?.workflowJson;
      if (!wf || typeof wf !== 'object') {
        setValidationErrors(['Invalid template: missing workflow data']);
        return;
      }
      const templateNodes = Array.isArray(wf.nodes) ? wf.nodes : [];
      const templateEdges = Array.isArray(wf.edges) ? wf.edges : [];
      if (templateNodes.length > 500) {
        setValidationErrors(['Template too large: maximum 500 nodes allowed']);
        return;
      }

      setNodes(templateNodes);
      setEdges(templateEdges);
      setWorkflowName(String(template.name || ''));
      setWorkflowDescription(String(template.description || ''));
      setShowTemplateBrowser(false);
      setWorkflowId(null); // Clear ID so it saves as new workflow
    },
    [setNodes, setEdges]
  );

  // Node search/filter
  const [nodeSearchTerm, setNodeSearchTerm] = useState('');

  // Filter function
  const filterNodes = (nodes: typeof registryNodeTypes) => {
    if (!nodeSearchTerm.trim()) return nodes;
    const search = nodeSearchTerm.toLowerCase();
    return nodes.filter(node =>
      node.display_name.toLowerCase().includes(search) ||
      node.type.toLowerCase().includes(search) ||
      node.description.toLowerCase().includes(search)
    );
  };

  // Categorize nodes for sidebar (with search filter)
  const aiNodes = filterNodes(getNodeTypesByCategory('ai'));
  const flowNodes = filterNodes(getNodeTypesByCategory('flow_control'));
  const humanNodes = filterNodes(getNodeTypesByCategory('human'));
  const mediaNodes = filterNodes(getNodeTypesByCategory('media'));
  const skillNodes = filterNodes(getNodeTypesByCategory('skills'));
  const triggerNodes = filterNodes(getNodeTypesByCategory('triggers'));
  const inputNodes = filterNodes(getNodeTypesByCategory('inputs'));
  const outputNodes = filterNodes(getNodeTypesByCategory('outputs'));
  const dataNodes = filterNodes(getNodeTypesByCategory('data'));
  // Combine both 'integrations' and 'integration' categories
  const integrationNodes = [
    ...filterNodes(getNodeTypesByCategory('integrations')),
    ...filterNodes(getNodeTypesByCategory('integration')),
  ];
  const observabilityNodes = filterNodes(getNodeTypesByCategory('observability'));
  const securityNodes = filterNodes(getNodeTypesByCategory('security'));

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50/30 to-purple-50/20 dark:from-gray-900 dark:via-gray-900 dark:to-gray-900">
      {/* Header */}
      <header className="bg-white/70 dark:bg-gray-800/70 backdrop-blur-xl border-b border-gray-200 dark:border-gray-700 sticky top-0 z-10">
        <div className="px-4 sm:px-6 lg:px-8 py-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setLocation('/workflows')}
              >
                <ArrowLeft className="h-4 w-4 mr-1" />
                Back
              </Button>
              <div className="flex items-center gap-2">
                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-500 to-purple-500 flex items-center justify-center">
                  <GitBranch className="h-5 w-5 text-white" />
                </div>
                <div>
                  <h1 className="text-lg font-bold">{workflowName || 'New Workflow'}</h1>
                  <p className="text-xs text-muted-foreground">
                    {isExecuting ? `Executing... (${executionId})` : 'Visual workflow builder'}
                  </p>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={handleCompile}
                disabled={compileMutation.isPending || isExecuting}
              >
                {compileMutation.isPending ? (
                  <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                ) : (
                  <Wrench className="h-4 w-4 mr-1" />
                )}
                Compile
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={handleSave}
                disabled={saveWorkflowMutation.isPending || isExecuting}
              >
                {saveWorkflowMutation.isPending ? (
                  <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                ) : (
                  <Save className="h-4 w-4 mr-1" />
                )}
                Save
              </Button>
              {workflowId && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setShowVersionHistory(true)}
                >
                  <Clock className="h-4 w-4 mr-1" />
                  History
                </Button>
              )}
              <Button
                variant="outline"
                size="sm"
                onClick={handleToggleConsolePanel}
                className={showConsolePanel ? "bg-gray-100 dark:bg-gray-700" : ""}
                title="Toggle console panel"
              >
                <Terminal className="h-4 w-4 mr-1" />
                Console
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={isExecuting || saveWorkflowMutation.isPending}
                onClick={async () => {
                  try {
                    const result = await saveWorkflowMutation.mutateAsync({
                      id: numericWorkflowId || undefined,
                      name: workflowName || 'Untitled Workflow',
                      description: workflowDescription,
                      defaultModel: defaultModel || undefined,
                      workflowJson: { nodes, edges },
                    });
                    setWorkflowId(String(result.id));
                    setShowConvertDialog(true);
                  } catch (err: any) {
                    toast.error(`Save failed: ${err.message}`);
                  }
                }}
                className="text-purple-600 hover:text-purple-700 hover:bg-purple-50"
              >
                {saveWorkflowMutation.isPending ? (
                  <><Wand2 className="h-4 w-4 mr-1 animate-pulse" />Saving…</>
                ) : (
                  <><Wand2 className="h-4 w-4 mr-1" />Convert to Skill</>
                )}
              </Button>
              <Button
                size="sm"
                onClick={handleExecute}
                disabled={executeMutation.isPending || isExecuting || !compiledManifest}
                className="bg-blue-600 hover:bg-blue-700 text-white"
              >
                {isExecuting ? (
                  <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                ) : (
                  <Play className="h-4 w-4 mr-1" />
                )}
                {isExecuting ? 'Running...' : 'Run'}
              </Button>
            </div>
          </div>
        </div>
      </header>

      {/* Validation Errors */}
      {validationErrors.length > 0 && (
        <div className="bg-red-50 dark:bg-red-900/20 border-b border-red-200 dark:border-red-800 px-4 py-2.5">
          <div className="flex items-start gap-2.5">
            <AlertCircle className="h-4 w-4 text-red-600 dark:text-red-400 flex-shrink-0 mt-0.5" />
            <div className="flex-1 min-w-0">
              <p className="text-xs font-semibold text-red-700 dark:text-red-300 mb-1.5 uppercase tracking-wide">
                Compilation Errors — fix these before running
              </p>
              <ul className="space-y-1">
                {validationErrors.map((error, i) => (
                  <li key={i} className="text-sm text-red-800 dark:text-red-200 flex items-start gap-1.5">
                    <span className="text-red-400 mt-0.5 flex-shrink-0">•</span>
                    <span className="leading-snug">{renderErrorParts(error, 'error')}</span>
                  </li>
                ))}
              </ul>
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              <button
                onClick={() => setShowAutoEdit(true)}
                className="flex items-center gap-1 text-xs font-medium px-2 py-1 rounded bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300 hover:bg-blue-200 dark:hover:bg-blue-800 transition-colors"
                title="Fix with AI"
              >
                <Wrench className="h-3 w-3" />
                Fix with AI
              </button>
              <button
                onClick={() => { setValidationErrors([]); setCompilationWarnings([]); }}
                className="text-red-500 hover:text-red-700 flex-shrink-0"
                title="Dismiss"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Compilation Warnings (shown after successful compile) */}
      {compilationWarnings.length > 0 && validationErrors.length === 0 && (
        <div className="bg-amber-50 dark:bg-amber-900/20 border-b border-amber-200 dark:border-amber-800 px-4 py-2.5">
          <div className="flex items-start gap-2.5">
            <AlertTriangle className="h-4 w-4 text-amber-600 dark:text-amber-400 flex-shrink-0 mt-0.5" />
            <div className="flex-1 min-w-0">
              <p className="text-xs font-semibold text-amber-700 dark:text-amber-300 mb-1.5 uppercase tracking-wide">
                {compilationWarnings.length} Warning{compilationWarnings.length > 1 ? 's' : ''} — workflow will run but may behave unexpectedly
              </p>
              <ul className="space-y-1">
                {compilationWarnings.map((warn, i) => (
                  <li key={i} className="text-sm text-amber-800 dark:text-amber-200 flex items-start gap-1.5">
                    <span className="text-amber-400 mt-0.5 flex-shrink-0">•</span>
                    <span className="leading-snug">{renderErrorParts(warn, 'warning')}</span>
                  </li>
                ))}
              </ul>
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              <button
                onClick={() => setShowAutoEdit(true)}
                className="flex items-center gap-1 text-xs font-medium px-2 py-1 rounded bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300 hover:bg-blue-200 dark:hover:bg-blue-800 transition-colors"
                title="Fix with AI"
              >
                <Wrench className="h-3 w-3" />
                Fix with AI
              </button>
              <button
                onClick={() => setCompilationWarnings([])}
                className="text-amber-500 hover:text-amber-700 flex-shrink-0"
                title="Dismiss"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="flex flex-col h-[calc(100vh-80px)] overflow-hidden">
        {/* ── Sidebar + Canvas + Right panel ── */}
        <div className="flex flex-1 min-h-0">
        {/* Left Sidebar - Node Palette (resizable) */}
        <div
          className="bg-white dark:bg-gray-800 border-r border-gray-200 dark:border-gray-700 overflow-y-auto relative flex-shrink-0"
          style={{ width: sidebarCollapsed ? 48 : sidebarWidth, transition: sidebarCollapsed ? 'width 0.3s' : 'none' }}
        >
          <button
            onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
            className="absolute top-2 right-2 z-10 p-1.5 rounded-lg bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
            title={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          >
            {sidebarCollapsed ? (
              <ChevronRight className="h-4 w-4" />
            ) : (
              <ChevronLeft className="h-4 w-4" />
            )}
          </button>

          {/* Resize handle — drag to widen/narrow sidebar */}
          {!sidebarCollapsed && (
            <div
              onMouseDown={onSidebarResizeMouseDown}
              className="absolute right-0 top-0 bottom-0 w-1.5 cursor-ew-resize hover:bg-blue-400 active:bg-blue-500 transition-colors z-20"
              title="Drag to resize sidebar"
            />
          )}

          {!sidebarCollapsed && (
            <>
              {/* Workflow Info */}
              <div className="p-4 border-b border-gray-200 dark:border-gray-700">
                <div className="mb-4">
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Workflow Name
                  </label>
                  <input
                    type="text"
                    value={workflowName}
                    onChange={(e) => setWorkflowName(e.target.value)}
                    placeholder="e.g., Social Media Post Creator"
                    className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                  />
                </div>

                <div className="mb-4">
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Description
                  </label>
                  <textarea
                    value={workflowDescription}
                    onChange={(e) => setWorkflowDescription(e.target.value)}
                    placeholder="Describe what this workflow does..."
                    rows={3}
                    className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Default LLM Model
                    <span className="text-xs text-gray-500 dark:text-gray-400 ml-2">(Optional)</span>
                  </label>
                  <LLMModelSelector
                    models={llmModels}
                    selectedModelId={defaultModel}
                    onSelect={handleSetDefaultModel}
                    isLoading={modelsLoading}
                    placeholder="Select default model for this workflow..."
                  />
                  <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                    Choose which LLM model to use when executing this workflow
                  </p>
                </div>
              </div>

              {/* Template Browser Button */}
              <div className="p-4 border-b border-gray-200 dark:border-gray-700">
                <Button
                  onClick={() => setShowTemplateBrowser(true)}
                  variant="outline"
                  className="w-full"
                  size="sm"
                >
                  <ShoppingBag className="h-4 w-4 mr-2" />
                  Browse Templates
                </Button>
                <Button
                  onClick={() => setShowAutoCreate(true)}
                  variant="outline"
                  className="w-full border-purple-300 text-purple-700 hover:bg-purple-50 dark:border-purple-700 dark:text-purple-300"
                  size="sm"
                >
                  <Sparkles className="h-4 w-4 mr-2" />
                  Auto Create with AI
                </Button>
                <Button
                  onClick={() => setShowAutoEdit(true)}
                  variant="outline"
                  className="w-full border-blue-300 text-blue-700 hover:bg-blue-50 dark:border-blue-700 dark:text-blue-300 mt-2"
                  size="sm"
                >
                  <Wrench className="h-4 w-4 mr-2" />
                  Improve Workflow with AI
                </Button>
              </div>

              {/* Node Palette - Step 2: Registry-driven */}
              <div className="p-4">
                <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-3 flex items-center gap-2">
                  <Plus className="h-4 w-4" />
                  Node Palette
                </h3>

                {/* Search/Filter Input */}
                <div className="mb-3 relative">
                  <input
                    type="text"
                    value={nodeSearchTerm}
                    onChange={(e) => setNodeSearchTerm(e.target.value)}
                    placeholder="Search nodes..."
                    className="w-full px-3 py-2 pl-9 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-500 dark:placeholder-gray-400 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                  <svg
                    className="absolute left-3 top-2.5 h-4 w-4 text-gray-400"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                    />
                  </svg>
                  {nodeSearchTerm && (
                    <button
                      onClick={() => setNodeSearchTerm('')}
                      className="absolute right-2 top-2 p-1 hover:bg-gray-200 dark:hover:bg-gray-600 rounded"
                      aria-label="Clear search"
                    >
                      <svg
                        className="h-4 w-4 text-gray-500"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M6 18L18 6M6 6l12 12"
                        />
                      </svg>
                    </button>
                  )}
                </div>

                {registryLoading ? (
                  <div className="text-sm text-gray-500 dark:text-gray-400">Loading nodes...</div>
                ) : (
                  <div className="space-y-4">
                    {/* AI Nodes */}
                    {aiNodes.length > 0 && (
                      <div>
                        <h4 className="text-xs font-semibold text-gray-600 dark:text-gray-400 mb-2">
                          AI Nodes
                        </h4>
                        <div className="space-y-2">
                          {aiNodes.map((node) => (
                            <div
                              key={node.type}
                              draggable
                              onDragStart={(e) => onDragStart(e, node.type)}
                              onClick={() => onAddNode(node.type)}
                              className="cursor-pointer flex items-center gap-2 px-3 py-2 rounded-lg border-2 bg-white dark:bg-gray-700 hover:bg-gray-50 dark:hover:bg-gray-600 transition-colors"
                            >
                              <div className="w-2 h-2 rounded-full bg-blue-500" />
                              <span className="text-sm font-medium text-gray-900 dark:text-white">
                                {node.display_name}
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Flow Control */}
                    {flowNodes.length > 0 && (
                      <div>
                        <h4 className="text-xs font-semibold text-gray-600 dark:text-gray-400 mb-2">
                          Flow Control
                        </h4>
                        <div className="space-y-2">
                          {flowNodes.map((node) => (
                            <div
                              key={node.type}
                              draggable
                              onDragStart={(e) => onDragStart(e, node.type)}
                              onClick={() => onAddNode(node.type)}
                              className="cursor-pointer flex items-center gap-2 px-3 py-2 rounded-lg border-2 bg-white dark:bg-gray-700 hover:bg-gray-50 dark:hover:bg-gray-600 transition-colors"
                            >
                              <div className="w-2 h-2 rounded-full bg-purple-500" />
                              <span className="text-sm font-medium text-gray-900 dark:text-white">
                                {node.display_name}
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Human Tasks */}
                    {humanNodes.length > 0 && (
                      <div>
                        <h4 className="text-xs font-semibold text-gray-600 dark:text-gray-400 mb-2">
                          Human Tasks
                        </h4>
                        <div className="space-y-2">
                          {humanNodes.map((node) => (
                            <div
                              key={node.type}
                              draggable
                              onDragStart={(e) => onDragStart(e, node.type)}
                              onClick={() => onAddNode(node.type)}
                              className="cursor-pointer flex items-center gap-2 px-3 py-2 rounded-lg border-2 bg-white dark:bg-gray-700 hover:bg-gray-50 dark:hover:bg-gray-600 transition-colors"
                            >
                              <div className="w-2 h-2 rounded-full bg-yellow-500" />
                              <span className="text-sm font-medium text-gray-900 dark:text-white">
                                {node.display_name}
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Media */}
                    {mediaNodes.length > 0 && (
                      <div>
                        <h4 className="text-xs font-semibold text-gray-600 dark:text-gray-400 mb-2">
                          Media Generation
                        </h4>
                        <div className="space-y-2">
                          {mediaNodes.map((node) => (
                            <div
                              key={node.type}
                              draggable
                              onDragStart={(e) => onDragStart(e, node.type)}
                              onClick={() => onAddNode(node.type)}
                              className="cursor-pointer flex items-center gap-2 px-3 py-2 rounded-lg border-2 bg-white dark:bg-gray-700 hover:bg-gray-50 dark:hover:bg-gray-600 transition-colors"
                            >
                              <div className="w-2 h-2 rounded-full bg-pink-500" />
                              <span className="text-sm font-medium text-gray-900 dark:text-white">
                                {node.display_name}
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Skills */}
                    {skillNodes.length > 0 && (
                      <div>
                        <h4 className="text-xs font-semibold text-gray-600 dark:text-gray-400 mb-2">
                          Skills
                        </h4>
                        <div className="space-y-2">
                          {skillNodes.map((node) => (
                            <div
                              key={node.type}
                              draggable
                              onDragStart={(e) => onDragStart(e, node.type)}
                              onClick={() => onAddNode(node.type)}
                              className="cursor-pointer flex items-center gap-2 px-3 py-2 rounded-lg border-2 bg-white dark:bg-gray-700 hover:bg-gray-50 dark:hover:bg-gray-600 transition-colors"
                            >
                              <div className="w-2 h-2 rounded-full bg-green-500" />
                              <span className="text-sm font-medium text-gray-900 dark:text-white">
                                {node.display_name}
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Triggers */}
                    {triggerNodes.length > 0 && (
                      <div>
                        <h4 className="text-xs font-semibold text-gray-600 dark:text-gray-400 mb-2">
                          Triggers
                        </h4>
                        <div className="space-y-2">
                          {triggerNodes.map((node) => (
                            <div
                              key={node.type}
                              draggable
                              onDragStart={(e) => onDragStart(e, node.type)}
                              onClick={() => onAddNode(node.type)}
                              className="cursor-pointer flex items-center gap-2 px-3 py-2 rounded-lg border-2 bg-white dark:bg-gray-700 hover:bg-gray-50 dark:hover:bg-gray-600 transition-colors"
                            >
                              <div className="w-2 h-2 rounded-full bg-indigo-500" />
                              <span className="text-sm font-medium text-gray-900 dark:text-white">
                                {node.display_name}
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Inputs */}
                    {inputNodes.length > 0 && (
                      <div>
                        <h4 className="text-xs font-semibold text-gray-600 dark:text-gray-400 mb-2">
                          Inputs
                        </h4>
                        <div className="space-y-2">
                          {inputNodes.map((node) => (
                            <div
                              key={node.type}
                              draggable
                              onDragStart={(e) => onDragStart(e, node.type)}
                              onClick={() => onAddNode(node.type)}
                              className="cursor-pointer flex items-center gap-2 px-3 py-2 rounded-lg border-2 bg-white dark:bg-gray-700 hover:bg-gray-50 dark:hover:bg-gray-600 transition-colors"
                            >
                              <div className="w-2 h-2 rounded-full bg-cyan-500" />
                              <span className="text-sm font-medium text-gray-900 dark:text-white">
                                {node.display_name}
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Outputs */}
                    {outputNodes.length > 0 && (
                      <div>
                        <h4 className="text-xs font-semibold text-gray-600 dark:text-gray-400 mb-2">
                          Outputs
                        </h4>
                        <div className="space-y-2">
                          {outputNodes.map((node) => (
                            <div
                              key={node.type}
                              draggable
                              onDragStart={(e) => onDragStart(e, node.type)}
                              onClick={() => onAddNode(node.type)}
                              className="cursor-pointer flex items-center gap-2 px-3 py-2 rounded-lg border-2 bg-white dark:bg-gray-700 hover:bg-gray-50 dark:hover:bg-gray-600 transition-colors"
                            >
                              <div className="w-2 h-2 rounded-full bg-teal-500" />
                              <span className="text-sm font-medium text-gray-900 dark:text-white">
                                {node.display_name}
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Data */}
                    {dataNodes.length > 0 && (
                      <div>
                        <h4 className="text-xs font-semibold text-gray-600 dark:text-gray-400 mb-2">
                          Data
                        </h4>
                        <div className="space-y-2">
                          {dataNodes.map((node) => (
                            <div
                              key={node.type}
                              draggable
                              onDragStart={(e) => onDragStart(e, node.type)}
                              onClick={() => onAddNode(node.type)}
                              className="cursor-pointer flex items-center gap-2 px-3 py-2 rounded-lg border-2 bg-white dark:bg-gray-700 hover:bg-gray-50 dark:hover:bg-gray-600 transition-colors"
                            >
                              <div className="w-2 h-2 rounded-full bg-amber-500" />
                              <span className="text-sm font-medium text-gray-900 dark:text-white">
                                {node.display_name}
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Integrations */}
                    {integrationNodes.length > 0 && (
                      <div>
                        <h4 className="text-xs font-semibold text-gray-600 dark:text-gray-400 mb-2">
                          Integrations
                        </h4>
                        <div className="space-y-2">
                          {integrationNodes.map((node) => (
                            <div
                              key={node.type}
                              draggable
                              onDragStart={(e) => onDragStart(e, node.type)}
                              onClick={() => onAddNode(node.type)}
                              className="cursor-pointer flex items-center gap-2 px-3 py-2 rounded-lg border-2 bg-white dark:bg-gray-700 hover:bg-gray-50 dark:hover:bg-gray-600 transition-colors"
                            >
                              <div className="w-2 h-2 rounded-full bg-orange-500" />
                              <span className="text-sm font-medium text-gray-900 dark:text-white">
                                {node.display_name}
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Observability */}
                    {observabilityNodes.length > 0 && (
                      <div>
                        <h4 className="text-xs font-semibold text-gray-600 dark:text-gray-400 mb-2">
                          Observability
                        </h4>
                        <div className="space-y-2">
                          {observabilityNodes.map((node) => (
                            <div
                              key={node.type}
                              draggable
                              onDragStart={(e) => onDragStart(e, node.type)}
                              onClick={() => onAddNode(node.type)}
                              className="cursor-pointer flex items-center gap-2 px-3 py-2 rounded-lg border-2 bg-white dark:bg-gray-700 hover:bg-gray-50 dark:hover:bg-gray-600 transition-colors"
                            >
                              <div className="w-2 h-2 rounded-full bg-blue-600" />
                              <span className="text-sm font-medium text-gray-900 dark:text-white">
                                {node.display_name}
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Security */}
                    {securityNodes.length > 0 && (
                      <div>
                        <h4 className="text-xs font-semibold text-gray-600 dark:text-gray-400 mb-2">
                          Security
                        </h4>
                        <div className="space-y-2">
                          {securityNodes.map((node) => (
                            <div
                              key={node.type}
                              draggable
                              onDragStart={(e) => onDragStart(e, node.type)}
                              onClick={() => onAddNode(node.type)}
                              className="cursor-pointer flex items-center gap-2 px-3 py-2 rounded-lg border-2 bg-white dark:bg-gray-700 hover:bg-gray-50 dark:hover:bg-gray-600 transition-colors"
                            >
                              <div className="w-2 h-2 rounded-full bg-red-600" />
                              <span className="text-sm font-medium text-gray-900 dark:text-white">
                                {node.display_name}
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* No results message */}
                    {nodeSearchTerm &&
                     aiNodes.length === 0 &&
                     flowNodes.length === 0 &&
                     humanNodes.length === 0 &&
                     mediaNodes.length === 0 &&
                     skillNodes.length === 0 &&
                     triggerNodes.length === 0 &&
                     inputNodes.length === 0 &&
                     outputNodes.length === 0 &&
                     dataNodes.length === 0 &&
                     integrationNodes.length === 0 &&
                     observabilityNodes.length === 0 &&
                     securityNodes.length === 0 && (
                      <div className="text-center py-8">
                        <svg
                          className="mx-auto h-12 w-12 text-gray-400"
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M9.172 16.172a4 4 0 015.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                          />
                        </svg>
                        <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
                          No nodes found for "{nodeSearchTerm}"
                        </p>
                        <button
                          onClick={() => setNodeSearchTerm('')}
                          className="mt-2 text-xs text-blue-600 dark:text-blue-400 hover:underline"
                        >
                          Clear search
                        </button>
                      </div>
                    )}
                  </div>
                )}

                <div className="mt-6 pt-6 border-t border-gray-200 dark:border-gray-700">
                  <h4 className="text-xs font-semibold text-gray-600 dark:text-gray-400 mb-2">
                    How to Use:
                  </h4>
                  <ol className="text-xs text-gray-600 dark:text-gray-400 space-y-1">
                    <li>1. Drag or click nodes to add to canvas</li>
                    <li>2. Connect nodes by dragging handles</li>
                    <li>3. Click node to configure</li>
                    <li>4. Compile, save, and run</li>
                  </ol>
                </div>
              </div>

              {/* JSON Viewer */}
              <div className="p-4 border-t border-gray-200 dark:border-gray-700">
                <details className="group">
                  <summary className="cursor-pointer text-sm font-medium text-gray-700 dark:text-gray-300 hover:text-blue-600 dark:hover:text-blue-400 flex items-center gap-2">
                    <FileJson className="h-4 w-4" />
                    View JSON
                  </summary>
                  <div className="mt-3">
                    <pre className="text-xs bg-gray-100 dark:bg-gray-900 p-3 rounded-lg overflow-auto max-h-64">
                      {JSON.stringify({ nodes, edges }, null, 2)}
                    </pre>
                  </div>
                </details>
              </div>
            </>
          )}
        </div>

        {/* ReactFlow Canvas */}
        <div className="flex-1 relative" ref={reactFlowWrapper}>
          <ReactFlow
            nodes={nodes}
            edges={edges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            onConnectStart={onConnectStart}
            onConnectEnd={onConnectEnd}
            onInit={setReactFlowInstance}
            onDrop={onDrop}
            onDragOver={onDragOver}
            onNodeClick={onNodeClick}
            onNodeContextMenu={onNodeContextMenu}
            onPaneClick={() => {
              onPaneClick();
              setSelectedEdgeId(null);
            }}
            onEdgeClick={onEdgeClick}
            onEdgeContextMenu={onEdgeContextMenu}
            onReconnect={onReconnect}
            onReconnectStart={onConnectStart}
            onReconnectEnd={onConnectEnd}
            reconnectRadius={10}
            nodeTypes={nodeTypes}
            isValidConnection={isValidConnection}
            deleteKeyCode={isExecuting ? null : ['Delete', 'Backspace']}
            multiSelectionKeyCode={['Shift', 'Meta']}
            defaultEdgeOptions={{
              type: 'smoothstep',
              animated: false,
              style: { stroke: '#3b82f6', strokeWidth: 2 },
              markerEnd: { type: MarkerType.ArrowClosed, color: '#3b82f6' },
              reconnectable: true,
              selected: false,
            }}
            edgesFocusable={!isExecuting}
            edgesUpdatable={!isExecuting}
            fitView
            className="bg-gray-50 dark:bg-gray-900"
          >
            <Controls className="bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600" />
            <MiniMap
              className="bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600"
              nodeColor={() => '#3b82f6'}
            />
            <Background variant={BackgroundVariant.Dots} gap={12} size={1} />

          </ReactFlow>
        </div>

        {/* Right Sidebar - Config Panel */}
        {selectedEdgeId && !selectedNode && (
          <div className="w-96 bg-white dark:bg-gray-800 border-l border-gray-200 dark:border-gray-700 overflow-y-auto">
            <div className="sticky top-0 bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 p-4 z-10">
              <div className="flex items-center justify-between mb-2">
                <h3 className="font-semibold text-gray-900 dark:text-white">
                  Connection
                </h3>
                <button
                  onClick={() => setSelectedEdgeId(null)}
                  className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
              {(() => {
                const edge = edges.find(e => e.id === selectedEdgeId);
                const sourceNode = nodes.find(n => n.id === edge?.source);
                const targetNode = nodes.find(n => n.id === edge?.target);
                return edge ? (
                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-gray-500">From:</span>
                      <code className="text-xs font-mono bg-blue-50 dark:bg-blue-900/30 px-2 py-0.5 rounded text-blue-700 dark:text-blue-300">
                        {sourceNode?.data?.label || edge.source}
                      </code>
                      <span className="text-xs text-gray-400">({edge.sourceHandle})</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-gray-500">To:</span>
                      <code className="text-xs font-mono bg-green-50 dark:bg-green-900/30 px-2 py-0.5 rounded text-green-700 dark:text-green-300">
                        {targetNode?.data?.label || edge.target}
                      </code>
                      <span className="text-xs text-gray-400">({edge.targetHandle})</span>
                    </div>
                  </div>
                ) : null;
              })()}
            </div>
            <div className="p-4 space-y-3">
              <p className="text-sm text-gray-600 dark:text-gray-400">
                Drag the connection endpoints to reconnect to different nodes.
              </p>
              <Button
                variant="destructive"
                size="sm"
                onClick={handleDeleteSelectedEdge}
                className="w-full"
              >
                <Trash2 className="h-4 w-4 mr-2" />
                Delete Connection
              </Button>
              <p className="text-xs text-gray-500">
                Or press Delete / Backspace key
              </p>
            </div>
          </div>
        )}

        {selectedNode && (
          <div className="w-96 bg-white dark:bg-gray-800 border-l border-gray-200 dark:border-gray-700 overflow-y-auto">
            <div className="sticky top-0 bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 p-4 z-10">
              <div className="flex items-center justify-between mb-2">
                <h3 className="font-semibold text-gray-900 dark:text-white">
                  Configure Node
                </h3>
                <button
                  onClick={() => setSelectedNodeId(null)}
                  className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
              <div className="flex items-center gap-2">
                <code className="text-xs font-mono bg-gray-100 dark:bg-gray-700 px-2 py-1 rounded text-gray-600 dark:text-gray-300">
                  ID: {selectedNode.id}
                </code>
                <span className="text-xs text-gray-500 dark:text-gray-400">
                  {selectedNode.data.nodeType}
                </span>
              </div>
            </div>

            <div className="p-4">
              {/* Step 4: Dynamic Node Config */}
              <DynamicNodeConfig
                nodeId={selectedNode.id}
                nodeType={selectedNode.data.nodeType}
                config={selectedNode.data.config}
                connections={connections}
                onConfigChange={handleConfigChange}
                llmModels={llmModels}
                llmModelsLoading={modelsLoading}
                defaultModelId={defaultModel || undefined}
              />

              {/* Step 6: Cost Estimation (when not executing) */}
              {!isExecuting && user && (
                <div className="mt-6 pt-6 border-t border-gray-200 dark:border-gray-700">
                  <CostEstimation
                    nodes={nodes}
                    edges={edges}
                    userBalance={user.credits || 0}
                  />
                </div>
              )}
            </div>
          </div>
        )}
        </div> {/* end flex-1 min-h-0 (sidebar + canvas + right panel) */}

        {/* ── Console Panel (collapsible bottom) ── */}
        <ConsolePanel
          nodes={nodes}
          isOpen={showConsolePanel}
          height={consolePanelHeight}
          onToggle={handleToggleConsolePanel}
          onHeightChange={setConsolePanelHeight}
        />
      </div>

      {/* Step 6: Execution Log Panel (bottom drawer when executing) */}
      {isExecuting && (
        <div className="fixed bottom-0 left-0 right-0 h-64 bg-white dark:bg-gray-800 border-t border-gray-200 dark:border-gray-700 z-20 overflow-y-auto">
          <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-700">
            <h3 className="font-semibold text-gray-900 dark:text-white">
              Execution Log
            </h3>
            <button
              onClick={resetExecution}
              className="text-sm text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white"
            >
              Close
            </button>
          </div>
          <ExecutionLogPanel />
        </div>
      )}

      {/* Step 10: Template Browser Modal */}
      {showTemplateBrowser && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl w-full max-w-6xl max-h-[90vh] overflow-hidden">
            <TemplateBrowser
              templates={templatesQuery.data || []}
              onLoadTemplate={handleLoadTemplate}
              onClose={() => setShowTemplateBrowser(false)}
            />
          </div>
        </div>
      )}

      {/* Run Dialog — collects form_input values before execution */}
      <WorkflowRunDialog
        open={showRunDialog}
        onClose={() => setShowRunDialog(false)}
        onRun={handleRunWithInputs}
        nodes={nodes}
        isRunning={isExecuting}
      />

      {/* ---- Context Menu ---- */}
      {contextMenu && (() => {
        const ctxNode = nodes.find(n => n.id === contextMenu.nodeId);
        return (
          <div
            className="fixed z-[9999] bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 shadow-xl rounded-lg py-1 min-w-[200px] text-sm"
            style={{ top: contextMenu.y, left: contextMenu.x }}
            onMouseLeave={() => setContextMenu(null)}
          >
            <button
              className="w-full flex items-center gap-2.5 px-3 py-2 text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20"
              onClick={() => handleDeleteNode(contextMenu.nodeId)}
            >
              <Trash2 className="h-4 w-4" /> Delete Node
            </button>
            <button
              className="w-full flex items-center gap-2.5 px-3 py-2 text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700"
              onClick={() => openEditNodeId(contextMenu.nodeId)}
            >
              <PenLine className="h-4 w-4" /> Edit Node ID
            </button>
            <button
              className="w-full flex items-center gap-2.5 px-3 py-2 text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700"
              onClick={() => openHelp(contextMenu.nodeId)}
            >
              <HelpCircle className="h-4 w-4" /> Help
            </button>
            {ctxNode?.type !== 'group' && (
              <button
                className="w-full flex items-center gap-2.5 px-3 py-2 text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700"
                onClick={handleGroupSelected}
              >
                <Layers className="h-4 w-4" /> Group Selected Nodes
              </button>
            )}
            <hr className="my-1 border-gray-200 dark:border-gray-600" />
            <button
              className="w-full flex items-center gap-2.5 px-3 py-2 text-purple-700 dark:text-purple-300 hover:bg-purple-50 dark:hover:bg-purple-900/20"
              onClick={() => { setShowAutoCreate(true); setContextMenu(null); }}
            >
              <Sparkles className="h-4 w-4" /> Auto Create Workflow
            </button>
            <button
              className="w-full flex items-center gap-2.5 px-3 py-2 text-blue-700 dark:text-blue-300 hover:bg-blue-50 dark:hover:bg-blue-900/20"
              onClick={() => { setShowAutoEdit(true); setContextMenu(null); }}
            >
              <Wrench className="h-4 w-4" /> Improve Workflow with AI
            </button>
          </div>
        );
      })()}

      {/* ---- Edge Context Menu ---- */}
      {edgeContextMenu && !isExecuting && (() => {
        const edge = edges.find(e => e.id === edgeContextMenu.edgeId);
        const sourceNode = nodes.find(n => n.id === edge?.source);
        const targetNode = nodes.find(n => n.id === edge?.target);
        return (
          <div
            className="fixed z-[9999] bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 shadow-xl rounded-lg py-1 min-w-[200px] text-sm"
            style={{ top: edgeContextMenu.y, left: edgeContextMenu.x }}
            onMouseLeave={() => setEdgeContextMenu(null)}
          >
            <div className="px-3 py-2 border-b border-gray-200 dark:border-gray-600">
              <div className="text-xs text-gray-500 dark:text-gray-400">Connection</div>
              <div className="flex items-center gap-1 text-xs mt-1">
                <span className="text-blue-600 dark:text-blue-400">{sourceNode?.data?.label || edge?.source}</span>
                <span className="text-gray-400">→</span>
                <span className="text-green-600 dark:text-green-400">{targetNode?.data?.label || edge?.target}</span>
              </div>
            </div>
            <button
              className="w-full flex items-center gap-2.5 px-3 py-2 text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20"
              onClick={() => edge && handleDeleteEdge(edge.id)}
            >
              <Trash2 className="h-4 w-4" /> Delete Connection
            </button>
            <button
              className="w-full flex items-center gap-2.5 px-3 py-2 text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700"
              onClick={() => setEdgeContextMenu(null)}
            >
              <X className="h-4 w-4" /> Cancel
            </button>
          </div>
        );
      })()}

      {/* ---- Edit Node ID Dialog ---- */}
      <Dialog open={!!editNodeIdDialog} onOpenChange={(o) => { if (!o) setEditNodeIdDialog(null); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <PenLine className="h-4 w-4" /> Edit Node ID
            </DialogTitle>
          </DialogHeader>
          <div className="py-2">
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
              New Node ID
            </label>
            <input
              type="text"
              value={editNodeIdValue}
              onChange={e => setEditNodeIdValue(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') handleEditNodeId(); }}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-800 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              autoFocus
            />
            <p className="text-xs text-gray-400 mt-1">
              Use lowercase letters, numbers, and underscores only.
            </p>
          </div>
          <DialogFooter>
            <button
              className="px-4 py-2 text-sm rounded-md border border-gray-300 hover:bg-gray-50"
              onClick={() => setEditNodeIdDialog(null)}
            >
              Cancel
            </button>
            <button
              className="px-4 py-2 text-sm rounded-md bg-blue-600 text-white hover:bg-blue-700"
              onClick={handleEditNodeId}
            >
              Save
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ---- Help Dialog ---- */}
      {helpDialog && (() => {
        const nodeDef = registryNodeTypes?.find(nt => nt.type === helpDialog);
        return (
          <Dialog open={!!helpDialog} onOpenChange={(o) => { if (!o) setHelpDialog(null); }}>
            <DialogContent className="max-w-lg max-h-[80vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <HelpCircle className="h-4 w-4 text-blue-500" />
                  {nodeDef?.display_name ?? helpDialog}
                </DialogTitle>
              </DialogHeader>
              {nodeDef ? (
                <div className="space-y-4 text-sm">
                  <p className="text-gray-600 dark:text-gray-300">{nodeDef.description}</p>

                  {nodeDef.inputs.length > 0 && (
                    <div>
                      <h4 className="font-semibold text-gray-800 dark:text-gray-100 mb-2">Inputs</h4>
                      <div className="space-y-1.5">
                        {nodeDef.inputs.map((inp: any) => (
                          <div key={inp.name} className="bg-gray-50 dark:bg-gray-700/50 rounded px-3 py-2">
                            <div className="flex items-center gap-2">
                              <code className="text-xs font-mono text-blue-600 dark:text-blue-400">{inp.name}</code>
                              <span className="text-xs bg-gray-200 dark:bg-gray-600 px-1.5 py-0.5 rounded">{inp.data_type}</span>
                              {inp.required && <span className="text-xs text-red-500">required</span>}
                              {inp.accepts_connection && <span className="text-xs text-green-600">connectable</span>}
                            </div>
                            <div className="text-xs text-gray-500 mt-0.5">{inp.display_name}{inp.placeholder ? ` — ${inp.placeholder}` : ''}</div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {nodeDef.outputs.length > 0 && (
                    <div>
                      <h4 className="font-semibold text-gray-800 dark:text-gray-100 mb-2">Outputs</h4>
                      <div className="space-y-1.5">
                        {nodeDef.outputs.map((out: any) => (
                          <div key={out.name} className="bg-gray-50 dark:bg-gray-700/50 rounded px-3 py-2">
                            <div className="flex items-center gap-2">
                              <code className="text-xs font-mono text-green-600 dark:text-green-400">{out.name}</code>
                              <span className="text-xs bg-gray-200 dark:bg-gray-600 px-1.5 py-0.5 rounded">{out.data_type}</span>
                            </div>
                            <div className="text-xs text-gray-500 mt-0.5">{out.display_name}</div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <p className="text-sm text-gray-500">Node type information not available.</p>
              )}
            </DialogContent>
          </Dialog>
        );
      })()}

      {/* ---- Auto Create Workflow Modal ---- */}
      <AutoCreateWorkflowModal
        open={showAutoCreate}
        onOpenChange={setShowAutoCreate}
        nodeTypes={registryNodeTypes?.map(nt => ({
          type: nt.type,
          display_name: nt.display_name,
          description: nt.description,
          inputs: (nt.inputs ?? []) as unknown as Record<string, unknown>[],
          outputs: (nt.outputs ?? []) as unknown as Record<string, unknown>[],
        }))}
        modelId={defaultModel || undefined}
        onGenerated={handleAutoGenerated}
      />

      {/* ---- Auto Edit Workflow Modal ---- */}
      <AutoEditWorkflowModal
        open={showAutoEdit}
        onOpenChange={setShowAutoEdit}
        currentNodes={nodes}
        currentEdges={edges}
        errors={validationErrors}
        warnings={compilationWarnings}
        nodeTypes={registryNodeTypes?.map(nt => ({
          type: nt.type,
          display_name: nt.display_name,
          description: nt.description,
          inputs: (nt.inputs ?? []) as unknown as Record<string, unknown>[],
          outputs: (nt.outputs ?? []) as unknown as Record<string, unknown>[],
        }))}
        modelId={defaultModel || undefined}
        onEdited={handleAutoEdited}
      />

      {/* ---- Convert to Skill (ISC) Dialog ---- */}
      {showConvertDialog && numericWorkflowId && (
        <ConvertWithISCDialog
          open={showConvertDialog}
          onClose={() => setShowConvertDialog(false)}
          workflowId={numericWorkflowId}
          defaultModel={defaultModel || ''}
        />
      )}

      {/* ---- Workflow Version History ---- */}
      {workflowId && showVersionHistory && (
        <WorkflowVersionHistory
          workflowId={parseInt(workflowId)}
          onClose={() => setShowVersionHistory(false)}
          onRestore={() => {
            setShowVersionHistory(false);
            // Reset the initialisation guard so the refetch result is applied
            // to the canvas (version restore is an intentional canvas reset).
            canvasInitialisedRef.current = false;
            loadWorkflowQuery.refetch();
          }}
        />
      )}

      {/* ---- Save with Change Description dialog ---- */}
      <Dialog open={showSaveDialog} onOpenChange={setShowSaveDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Save Workflow</DialogTitle>
            <DialogDescription>
              Optionally describe what changed in this version. Leave blank to save without a note.
            </DialogDescription>
          </DialogHeader>
          <div className="py-2">
            <Label htmlFor="change-description" className="text-sm font-medium">
              Change description <span className="text-muted-foreground">(optional)</span>
            </Label>
            <Input
              id="change-description"
              className="mt-1.5"
              placeholder="e.g. Added email notification node"
              maxLength={500}
              value={saveChangeDescription}
              onChange={(e) => setSaveChangeDescription(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleSaveConfirm();
              }}
              autoFocus
            />
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setShowSaveDialog(false)}>
              Cancel
            </Button>
            <Button onClick={handleSaveConfirm} disabled={saveWorkflowMutation.isPending}>
              {saveWorkflowMutation.isPending ? (
                <Loader2 className="h-4 w-4 mr-1 animate-spin" />
              ) : null}
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default function WorkflowEditor() {
  return (
    <ReactFlowProvider>
      <FlowEditor />
    </ReactFlowProvider>
  );
}
