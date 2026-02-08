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
import { useLocation } from 'wouter';
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
} from 'reactflow';
import 'reactflow/dist/style.css';
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
  Loader2,
  FileJson,
  Wrench,
  ShoppingBag,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';

// Step 1: Import BaseNode and registry hook
import { BaseNode } from '@/components/workflow/nodes/BaseNode';
import { useNodeRegistry } from '@/lib/workflow/useNodeRegistry';
import { isValidConnection as createIsValidConnection } from '@/lib/workflow/isValidConnection';

// Step 4: Import DynamicNodeConfig
import { DynamicNodeConfig } from '@/components/workflow/config/DynamicNodeConfig';

// Step 6: Import Execution components
import { useExecutionStore } from '@/stores/executionStore';
import { ExecutionOverlay } from '@/components/workflow/execution/ExecutionOverlay';
import { ExecutionLogPanel } from '@/components/workflow/execution/ExecutionLogPanel';
import { CostEstimation } from '@/components/workflow/execution/CostEstimation';

// Step 10: Import TemplateBrowser
import { TemplateBrowser } from '@/components/workflow/TemplateBrowser';

// Node data structure for registry-driven nodes
interface WorkflowNodeData {
  nodeType: string;  // Logical type from registry (e.g., 'llm_call', 'rag_query')
  label: string;
  config: Record<string, unknown>;
}

// Step 1: Single node type for all workflow nodes
const nodeTypes: NodeTypes = {
  workflow: BaseNode,
};

function FlowEditor() {
  const [, setLocation] = useLocation();
  const [workflowId, setWorkflowId] = useState<string | null>(null);
  const [workflowName, setWorkflowName] = useState('');
  const [workflowDescription, setWorkflowDescription] = useState('');
  const [nodes, setNodes, onNodesChange] = useNodesState<WorkflowNodeData>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);
  const reactFlowWrapper = useRef<HTMLDivElement>(null);
  const [reactFlowInstance, setReactFlowInstance] = useState<any>(null);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [validationErrors, setValidationErrors] = useState<string[]>([]);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [showTemplateBrowser, setShowTemplateBrowser] = useState(false);
  const [compiledManifest, setCompiledManifest] = useState<any>(null);

  // Step 2: Use node registry instead of hardcoded options
  const { nodeTypes: registryNodeTypes, isLoading: registryLoading, getNodeTypesByCategory } = useNodeRegistry();

  // Step 6: Execution store
  const {
    isExecuting,
    executionId,
    nodeStatuses,
    logs,
    startExecution,
    updateNodeStatus,
    addLog,
    completeExecution,
    resetExecution,
  } = useExecutionStore();

  // Get current user for credit balance
  const { data: user } = (trpc as any).auth.me.useQuery();

  // tRPC mutations
  const compileMutation = (trpc as any).workflow.compile.useMutation();
  const executeMutation = (trpc as any).workflow.execute.useMutation();
  const saveWorkflowMutation = (trpc as any).workflow.save.useMutation();
  const loadWorkflowQuery = (trpc as any).workflow.load.useQuery(
    { id: workflowId! },
    { enabled: !!workflowId }
  );
  const templatesQuery = (trpc as any).workflow.listSaved.useQuery({ status: 'published' });

  // Load workflow from URL parameter
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const idFromUrl = urlParams.get('id');
    if (idFromUrl) {
      setWorkflowId(idFromUrl);
    }
  }, []);

  // Load workflow data when query returns
  useEffect(() => {
    if (loadWorkflowQuery.data) {
      const workflow = loadWorkflowQuery.data;
      setWorkflowName(workflow.name || '');
      setWorkflowDescription(workflow.description || '');
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
      return createIsValidConnection(connection, nodes, registryNodeTypes);
    },
    [nodes, registryNodeTypes]
  );

  // Step 3: Node creation handler
  const onAddNode = useCallback(
    (nodeType: string) => {
      const spec = registryNodeTypes?.find(t => t.type === nodeType);
      if (!spec) return;

      const position = reactFlowInstance
        ? reactFlowInstance.project({ x: 250, y: 250 })
        : { x: 250, y: 250 };

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
    },
    [registryNodeTypes, reactFlowInstance, setNodes]
  );

  const onConnect = useCallback(
    (params: Connection) => {
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
  }, []);

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
        alert('Workflow compiled successfully!');
      } else {
        setValidationErrors(result.errors || [result.error || 'Unknown error']);
      }
    } catch (error: any) {
      setValidationErrors([error.message || 'Compilation failed']);
    }
  };

  // Step 9: Save workflow
  const handleSave = async () => {
    try {
      const result = await saveWorkflowMutation.mutateAsync({
        id: workflowId || undefined,
        name: workflowName || 'Untitled Workflow',
        description: workflowDescription,
        workflowJson: { nodes, edges },
      });

      setWorkflowId(result.id);
      alert('Workflow saved successfully!');
    } catch (error: any) {
      alert(`Save failed: ${error.message}`);
    }
  };

  // Step 8: Execute workflow with SSE
  const handleExecute = async () => {
    if (!compiledManifest) {
      alert('Please compile workflow first');
      return;
    }

    try {
      // Start execution
      const result = await executeMutation.mutateAsync({
        id: workflowId,
        workflowJson: {
          nodes,
          edges,
          _compiledMetadata: compiledManifest,
        },
      });

      // Initialize execution store
      startExecution(result.executionId);

      // Connect to SSE stream
      const eventSource = new EventSource(
        `/api/v1/workflows/execute/${result.executionId}/stream`,
        { withCredentials: true }
      );

      eventSource.addEventListener('node_start', (event: MessageEvent) => {
        const data = JSON.parse(event.data);
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
        const data = JSON.parse(event.data);
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
        const data = JSON.parse(event.data);
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
        completeExecution();
        eventSource.close();
        alert('Workflow completed successfully!');
      });

      eventSource.addEventListener('workflow_error', (event: MessageEvent) => {
        const data = JSON.parse(event.data);
        completeExecution();
        eventSource.close();
        alert(`Workflow failed: ${data.error}`);
      });

      eventSource.onerror = () => {
        eventSource.close();
        completeExecution();
        alert('Execution stream error');
      };
    } catch (error: any) {
      if (error.message?.includes('402') || error.message?.includes('Insufficient')) {
        alert('Insufficient credits to run workflow');
      } else {
        alert(`Execution failed: ${error.message}`);
      }
    }
  };

  // Step 10: Template browser handlers
  const handleLoadTemplate = useCallback(
    (template: any) => {
      setNodes(template.workflowJson.nodes || []);
      setEdges(template.workflowJson.edges || []);
      setWorkflowName(template.name || '');
      setWorkflowDescription(template.description || '');
      setShowTemplateBrowser(false);
      setWorkflowId(null); // Clear ID so it saves as new workflow
      alert(`Loaded template: ${template.name}`);
    },
    [setNodes, setEdges]
  );

  // Categorize nodes for sidebar
  const aiNodes = getNodeTypesByCategory('ai');
  const flowNodes = getNodeTypesByCategory('flow_control');
  const humanNodes = getNodeTypesByCategory('human');
  const mediaNodes = getNodeTypesByCategory('media');
  const skillNodes = getNodeTypesByCategory('skills');

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
        <div className="bg-red-50 dark:bg-red-900/20 border-b border-red-200 dark:border-red-800 px-6 py-3">
          <div className="max-w-full mx-auto">
            <div className="flex items-start gap-3">
              <AlertCircle className="h-5 w-5 text-red-600 dark:text-red-400 flex-shrink-0 mt-0.5" />
              <div className="flex-1">
                <h3 className="text-sm font-semibold text-red-900 dark:text-red-100 mb-1">
                  Validation Errors
                </h3>
                <ul className="text-sm text-red-800 dark:text-red-200 space-y-1">
                  {validationErrors.map((error, i) => (
                    <li key={i}>• {error}</li>
                  ))}
                </ul>
              </div>
              <button
                onClick={() => setValidationErrors([])}
                className="text-red-600 dark:text-red-400 hover:text-red-800 dark:hover:text-red-200"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="flex h-[calc(100vh-80px)]">
        {/* Left Sidebar - Node Palette */}
        <div className={`${sidebarCollapsed ? 'w-12' : 'w-80'} bg-white dark:bg-gray-800 border-r border-gray-200 dark:border-gray-700 overflow-y-auto transition-all duration-300 relative`}>
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

                <div>
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
              </div>

              {/* Node Palette - Step 2: Registry-driven */}
              <div className="p-4">
                <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-3 flex items-center gap-2">
                  <Plus className="h-4 w-4" />
                  Node Palette
                </h3>

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
            onInit={setReactFlowInstance}
            onDrop={onDrop}
            onDragOver={onDragOver}
            onNodeClick={onNodeClick}
            nodeTypes={nodeTypes}
            isValidConnection={isValidConnection}
            defaultEdgeOptions={{
              type: 'smoothstep',
              animated: false,
              style: { stroke: '#3b82f6', strokeWidth: 2 },
              markerEnd: { type: MarkerType.ArrowClosed, color: '#3b82f6' },
            }}
            fitView
            className="bg-gray-50 dark:bg-gray-900"
          >
            <Controls className="bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600" />
            <MiniMap
              className="bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600"
              nodeColor={() => '#3b82f6'}
            />
            <Background variant={BackgroundVariant.Dots} gap={12} size={1} />

            {/* Step 6: Execution Overlays */}
            {isExecuting && nodes.map((node) => {
              const status = nodeStatuses[node.id];
              if (!status) return null;

              return (
                <div
                  key={`overlay-${node.id}`}
                  style={{
                    position: 'absolute',
                    left: node.position.x,
                    top: node.position.y,
                    pointerEvents: 'none',
                  }}
                >
                  <ExecutionOverlay
                    nodeId={node.id}
                    status={status.status}
                  />
                </div>
              );
            })}
          </ReactFlow>
        </div>

        {/* Right Sidebar - Config Panel */}
        {selectedNode && (
          <div className="w-96 bg-white dark:bg-gray-800 border-l border-gray-200 dark:border-gray-700 overflow-y-auto">
            <div className="sticky top-0 bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 p-4 flex items-center justify-between z-10">
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

            <div className="p-4">
              {/* Step 4: Dynamic Node Config */}
              <DynamicNodeConfig
                nodeId={selectedNode.id}
                nodeType={selectedNode.data.nodeType}
                config={selectedNode.data.config}
                connections={connections}
                onConfigChange={handleConfigChange}
              />

              {/* Step 6: Cost Estimation (when not executing) */}
              {!isExecuting && user && (
                <div className="mt-6 pt-6 border-t border-gray-200 dark:border-gray-700">
                  <CostEstimation
                    nodes={nodes}
                    edges={edges}
                    userBalance={user.creditBalance || 0}
                  />
                </div>
              )}
            </div>
          </div>
        )}
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
