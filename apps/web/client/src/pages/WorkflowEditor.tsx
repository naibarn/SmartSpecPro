/**
 * Workflow Editor - Visual Flow Builder
 * Create and edit workflows using ReactFlow visual editor
 */

import { useState, useCallback, useRef, useMemo } from 'react';
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
  Settings,
  Code,
  Zap,
  MessageSquare,
  CheckCircle,
  Repeat,
  GitMerge,
  Home,
  X,
  AlertCircle,
  CheckCircle2,
  Loader2,
  FileJson,
} from 'lucide-react';

// Node type definitions
interface NodeData {
  label: string;
  icon: any;
  color: string;
  config?: {
    model?: string;
    prompt?: string;
    temperature?: number;
    maxTokens?: number;
    approvers?: string[];
    timeout?: number;
    condition?: string;
    maxIterations?: number;
    imageModel?: string;
    imagePrompt?: string;
  };
}

// Custom Node Component
function CustomNode({ data, selected }: { data: NodeData; selected: boolean }) {
  const Icon = data.icon;
  return (
    <div
      className={`px-4 py-3 rounded-lg border-2 shadow-lg bg-white dark:bg-gray-800 min-w-[180px] transition-all ${
        selected
          ? 'border-blue-500 dark:border-blue-400 ring-2 ring-blue-200 dark:ring-blue-800'
          : `border-${data.color}-400 dark:border-${data.color}-600`
      }`}
    >
      <div className="flex items-center gap-2">
        <Icon className={`h-5 w-5 text-${data.color}-600 dark:text-${data.color}-400`} />
        <div className="font-medium text-gray-900 dark:text-white">{data.label}</div>
      </div>
      {data.config && Object.keys(data.config).length > 0 && (
        <div className="mt-1 text-xs text-gray-500 dark:text-gray-400">
          <Settings className="h-3 w-3 inline mr-1" />
          Configured
        </div>
      )}
    </div>
  );
}

const nodeTypes: NodeTypes = {
  custom: CustomNode,
};

// Example workflows
const exampleWorkflows = [
  {
    id: 'social-media-post',
    name: 'Social Media Post Creator',
    description: 'Generate social media post with image',
    nodes: [
      {
        id: 'start',
        type: 'custom',
        position: { x: 100, y: 50 },
        data: {
          label: 'Start',
          icon: Play,
          color: 'green',
        },
      },
      {
        id: 'llm-1',
        type: 'custom',
        position: { x: 100, y: 150 },
        data: {
          label: 'Generate Caption',
          icon: MessageSquare,
          color: 'blue',
          config: {
            model: 'gpt-4',
            prompt: 'Create an engaging social media caption',
            temperature: 0.7,
            maxTokens: 150,
          },
        },
      },
      {
        id: 'approval-1',
        type: 'custom',
        position: { x: 100, y: 280 },
        data: {
          label: 'Review Caption',
          icon: CheckCircle,
          color: 'yellow',
          config: {
            approvers: ['admin'],
            timeout: 30,
          },
        },
      },
      {
        id: 'image-1',
        type: 'custom',
        position: { x: 100, y: 410 },
        data: {
          label: 'Generate Image',
          icon: Zap,
          color: 'pink',
          config: {
            imageModel: 'dall-e-3',
            imagePrompt: 'Based on the caption',
          },
        },
      },
    ],
    edges: [
      { id: 'e1', source: 'start', target: 'llm-1', animated: true },
      { id: 'e2', source: 'llm-1', target: 'approval-1' },
      { id: 'e3', source: 'approval-1', target: 'image-1' },
    ],
  },
  {
    id: 'content-summarizer',
    name: 'Content Summarizer',
    description: 'Summarize long content with conditional formatting',
    nodes: [
      {
        id: 'start',
        type: 'custom',
        position: { x: 250, y: 50 },
        data: { label: 'Start', icon: Play, color: 'green' },
      },
      {
        id: 'llm-summarize',
        type: 'custom',
        position: { x: 250, y: 150 },
        data: {
          label: 'Summarize Content',
          icon: MessageSquare,
          color: 'blue',
          config: {
            model: 'gpt-4',
            prompt: 'Summarize the following content',
            temperature: 0.3,
          },
        },
      },
      {
        id: 'conditional-1',
        type: 'custom',
        position: { x: 250, y: 280 },
        data: {
          label: 'Check Length',
          icon: GitMerge,
          color: 'purple',
          config: {
            condition: 'length > 500',
          },
        },
      },
      {
        id: 'llm-short',
        type: 'custom',
        position: { x: 100, y: 410 },
        data: {
          label: 'Short Format',
          icon: MessageSquare,
          color: 'blue',
        },
      },
      {
        id: 'llm-long',
        type: 'custom',
        position: { x: 400, y: 410 },
        data: {
          label: 'Long Format',
          icon: MessageSquare,
          color: 'blue',
        },
      },
    ],
    edges: [
      { id: 'e1', source: 'start', target: 'llm-summarize', animated: true },
      { id: 'e2', source: 'llm-summarize', target: 'conditional-1' },
      { id: 'e3', source: 'conditional-1', target: 'llm-short', label: 'short' },
      { id: 'e4', source: 'conditional-1', target: 'llm-long', label: 'long' },
    ],
  },
];

// Node Configuration Panel Component
function NodeConfigPanel({
  node,
  onClose,
  onSave,
}: {
  node: Node<NodeData> | null;
  onClose: () => void;
  onSave: (config: any) => void;
}) {
  const [config, setConfig] = useState(node?.data?.config || {});

  if (!node) return null;

  const handleSave = () => {
    onSave(config);
    onClose();
  };

  const nodeType = node.id.split('-')[0];

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center">
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl w-full max-w-md max-h-[80vh] overflow-y-auto">
        <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-700">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
            Configure: {node.data.label}
          </h3>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="p-4 space-y-4">
          {/* LLM Node Configuration */}
          {nodeType === 'llm' && (
            <>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Model
                </label>
                <select
                  value={config.model || 'gpt-4'}
                  onChange={(e) => setConfig({ ...config, model: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                >
                  <option value="gpt-4">GPT-4</option>
                  <option value="gpt-3.5-turbo">GPT-3.5 Turbo</option>
                  <option value="claude-3-opus">Claude 3 Opus</option>
                  <option value="claude-3-sonnet">Claude 3 Sonnet</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Prompt
                </label>
                <textarea
                  value={config.prompt || ''}
                  onChange={(e) => setConfig({ ...config, prompt: e.target.value })}
                  rows={4}
                  placeholder="Enter your prompt..."
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Temperature: {config.temperature || 0.7}
                </label>
                <input
                  type="range"
                  min="0"
                  max="1"
                  step="0.1"
                  value={config.temperature || 0.7}
                  onChange={(e) =>
                    setConfig({ ...config, temperature: parseFloat(e.target.value) })
                  }
                  className="w-full"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Max Tokens
                </label>
                <input
                  type="number"
                  value={config.maxTokens || 2000}
                  onChange={(e) =>
                    setConfig({ ...config, maxTokens: parseInt(e.target.value) })
                  }
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                />
              </div>
            </>
          )}

          {/* Approval Gate Configuration */}
          {nodeType === 'approval' && (
            <>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Approvers (comma-separated)
                </label>
                <input
                  type="text"
                  value={(config.approvers || []).join(', ')}
                  onChange={(e) =>
                    setConfig({
                      ...config,
                      approvers: e.target.value.split(',').map((s) => s.trim()),
                    })
                  }
                  placeholder="admin, manager, reviewer"
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Timeout (minutes)
                </label>
                <input
                  type="number"
                  value={config.timeout || 30}
                  onChange={(e) =>
                    setConfig({ ...config, timeout: parseInt(e.target.value) })
                  }
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                />
              </div>
            </>
          )}

          {/* Conditional Configuration */}
          {nodeType === 'conditional' && (
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Condition Expression
              </label>
              <input
                type="text"
                value={config.condition || ''}
                onChange={(e) => setConfig({ ...config, condition: e.target.value })}
                placeholder="e.g., output.length > 100"
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
              />
              <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                Use 'output' to reference previous step output
              </p>
            </div>
          )}

          {/* Loop Configuration */}
          {nodeType === 'loop' && (
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Max Iterations
              </label>
              <input
                type="number"
                value={config.maxIterations || 10}
                onChange={(e) =>
                  setConfig({ ...config, maxIterations: parseInt(e.target.value) })
                }
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
              />
            </div>
          )}

          {/* Generate Image Configuration */}
          {nodeType === 'generate' && (
            <>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Image Model
                </label>
                <select
                  value={config.imageModel || 'dall-e-3'}
                  onChange={(e) => setConfig({ ...config, imageModel: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                >
                  <option value="dall-e-3">DALL-E 3</option>
                  <option value="stable-diffusion">Stable Diffusion</option>
                  <option value="midjourney">Midjourney</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Image Prompt
                </label>
                <textarea
                  value={config.imagePrompt || ''}
                  onChange={(e) => setConfig({ ...config, imagePrompt: e.target.value })}
                  rows={3}
                  placeholder="Describe the image to generate..."
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                />
              </div>
            </>
          )}
        </div>

        <div className="flex items-center justify-end gap-3 p-4 border-t border-gray-200 dark:border-gray-700">
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={handleSave} className="bg-blue-600 hover:bg-blue-700 text-white">
            Save Configuration
          </Button>
        </div>
      </div>
    </div>
  );
}

// Validation functions
function validateWorkflow(nodes: Node[], edges: Edge[]): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  // Check for at least one node
  if (nodes.length === 0) {
    errors.push('Workflow must have at least one node');
  }

  // Check for start node
  const hasStartNode = nodes.some((n) => n.id === 'start' || n.id.startsWith('start'));
  if (!hasStartNode) {
    errors.push('Workflow must have a start node');
  }

  // Check for cycles (simple check)
  const adjacencyList = new Map<string, string[]>();
  edges.forEach((edge) => {
    if (!adjacencyList.has(edge.source)) {
      adjacencyList.set(edge.source, []);
    }
    adjacencyList.get(edge.source)!.push(edge.target);
  });

  // Check for disconnected nodes
  const connectedNodes = new Set<string>();
  edges.forEach((edge) => {
    connectedNodes.add(edge.source);
    connectedNodes.add(edge.target);
  });

  const disconnectedNodes = nodes.filter(
    (n) => n.id !== 'start' && !connectedNodes.has(n.id)
  );
  if (disconnectedNodes.length > 0) {
    errors.push(
      `Disconnected nodes: ${disconnectedNodes.map((n) => n.data.label).join(', ')}`
    );
  }

  // Check node configurations
  nodes.forEach((node) => {
    const nodeType = node.id.split('-')[0];
    if (nodeType === 'llm' && (!node.data.config?.model || !node.data.config?.prompt)) {
      errors.push(`LLM node "${node.data.label}" missing configuration`);
    }
    if (
      nodeType === 'approval' &&
      (!node.data.config?.approvers || node.data.config.approvers.length === 0)
    ) {
      errors.push(`Approval node "${node.data.label}" missing approvers`);
    }
  });

  return { valid: errors.length === 0, errors };
}

function FlowEditor() {
  const [, setLocation] = useLocation();
  const [workflowName, setWorkflowName] = useState('');
  const [workflowDescription, setWorkflowDescription] = useState('');
  const [nodes, setNodes, onNodesChange] = useNodesState<NodeData>([
    {
      id: 'start',
      type: 'custom',
      position: { x: 250, y: 50 },
      data: { label: 'Start', icon: Play, color: 'green' },
    },
  ]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);
  const reactFlowWrapper = useRef<HTMLDivElement>(null);
  const [reactFlowInstance, setReactFlowInstance] = useState<any>(null);
  const [selectedNode, setSelectedNode] = useState<Node<NodeData> | null>(null);
  const [showConfig, setShowConfig] = useState(false);
  const [validationErrors, setValidationErrors] = useState<string[]>([]);

  // tRPC mutations
  const compileMutation = trpc.workflow.compile.useMutation();
  const executeMutation = trpc.workflow.execute.useMutation();

  const nodeTypeOptions = [
    { id: 'llm', label: 'LLM Call', icon: MessageSquare, color: 'blue' },
    { id: 'approval', label: 'Approval Gate', icon: CheckCircle, color: 'yellow' },
    { id: 'conditional', label: 'Conditional', icon: GitMerge, color: 'purple' },
    { id: 'loop', label: 'Loop', icon: Repeat, color: 'green' },
    { id: 'generate', label: 'Generate Image', icon: Zap, color: 'pink' },
  ];

  const onConnect = useCallback(
    (params: Connection) => setEdges((eds) => addEdge(params, eds)),
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

      const type = event.dataTransfer.getData('application/reactflow');
      if (!type) return;

      const nodeData = nodeTypeOptions.find((n) => n.id === type);
      if (!nodeData) return;

      const reactFlowBounds = reactFlowWrapper.current.getBoundingClientRect();
      const position = reactFlowInstance.project({
        x: event.clientX - reactFlowBounds.left,
        y: event.clientY - reactFlowBounds.top,
      });

      const newNode: Node<NodeData> = {
        id: `${type}-${Date.now()}`,
        type: 'custom',
        position,
        data: {
          label: nodeData.label,
          icon: nodeData.icon,
          color: nodeData.color,
        },
      };

      setNodes((nds) => nds.concat(newNode));
    },
    [reactFlowInstance, nodeTypeOptions, setNodes]
  );

  const onDragStart = (event: React.DragEvent, nodeType: string) => {
    event.dataTransfer.setData('application/reactflow', nodeType);
    event.dataTransfer.effectAllowed = 'move';
  };

  const onNodeClick = useCallback((_: any, node: Node<NodeData>) => {
    if (node.id !== 'start') {
      setSelectedNode(node);
      setShowConfig(true);
    }
  }, []);

  const handleSaveConfig = (config: any) => {
    if (!selectedNode) return;
    setNodes((nds) =>
      nds.map((n) => (n.id === selectedNode.id ? { ...n, data: { ...n.data, config } } : n))
    );
  };

  const loadExample = (exampleId: string) => {
    const example = exampleWorkflows.find((w) => w.id === exampleId);
    if (!example) return;

    setWorkflowName(example.name);
    setWorkflowDescription(example.description);
    setNodes(example.nodes as Node<NodeData>[]);
    setEdges(example.edges);
  };

  const handleSave = async () => {
    // Validate workflow
    const validation = validateWorkflow(nodes, edges);
    setValidationErrors(validation.errors);

    if (!validation.valid) {
      return;
    }

    try {
      const result = await compileMutation.mutateAsync({
        nodes: nodes.map((n) => ({
          id: n.id,
          type: n.id.split('-')[0],
          position: n.position,
          data: n.data,
        })),
        edges: edges.map((e) => ({
          id: e.id,
          source: e.source,
          target: e.target,
        })),
        metadata: {
          name: workflowName || 'Untitled Workflow',
          description: workflowDescription,
          version: '1.0.0',
        },
      });

      if (result.success) {
        alert('Workflow compiled and saved successfully!');
      } else {
        alert(`Compilation failed: ${result.error}`);
      }
    } catch (error: any) {
      alert(`Error: ${error.message}`);
    }
  };

  const handleRun = async () => {
    // Validate before running
    const validation = validateWorkflow(nodes, edges);
    if (!validation.valid) {
      setValidationErrors(validation.errors);
      return;
    }

    try {
      const result = await executeMutation.mutateAsync({
        manifest: {
          nodes: nodes.map((n) => ({
            id: n.id,
            type: n.id.split('-')[0],
            data: n.data,
          })),
          edges: edges.map((e) => ({
            source: e.source,
            target: e.target,
          })),
        },
        inputs: {},
      });

      if (result.execution_id) {
        alert(`Workflow started! Execution ID: ${result.execution_id}`);
        setLocation('/workflows');
      }
    } catch (error: any) {
      alert(`Execution failed: ${error.message}`);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      {/* Header */}
      <div className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 px-6 py-4">
        <div className="max-w-full mx-auto flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Button
              variant="ghost"
              onClick={() => setLocation('/dashboard')}
              className="flex items-center gap-2"
            >
              <Home className="h-5 w-5" />
              Dashboard
            </Button>
            <div className="h-8 w-px bg-gray-300 dark:bg-gray-600"></div>
            <Button
              variant="ghost"
              onClick={() => setLocation('/workflows')}
              className="flex items-center gap-2"
            >
              <ArrowLeft className="h-5 w-5" />
              Workflows
            </Button>
            <div className="h-8 w-px bg-gray-300 dark:bg-gray-600"></div>
            <div>
              <h1 className="text-xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
                <GitBranch className="h-6 w-6" />
                {workflowName || 'New Workflow'}
              </h1>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <Button
              variant="outline"
              onClick={handleSave}
              disabled={compileMutation.isPending}
              className="flex items-center gap-2"
            >
              {compileMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Save className="h-4 w-4" />
              )}
              Save
            </Button>
            <Button
              onClick={handleRun}
              disabled={executeMutation.isPending}
              className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white"
            >
              {executeMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Play className="h-4 w-4" />
              )}
              Run Test
            </Button>
          </div>
        </div>
      </div>

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
        {/* Sidebar */}
        <div className="w-80 bg-white dark:bg-gray-800 border-r border-gray-200 dark:border-gray-700 overflow-y-auto">
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

          {/* Example Workflows */}
          <div className="p-4 border-b border-gray-200 dark:border-gray-700">
            <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-3 flex items-center gap-2">
              <FileJson className="h-4 w-4" />
              Example Workflows
            </h3>
            <div className="space-y-2">
              {exampleWorkflows.map((example) => (
                <button
                  key={example.id}
                  onClick={() => loadExample(example.id)}
                  className="w-full text-left px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
                >
                  <div className="text-sm font-medium text-gray-900 dark:text-white">
                    {example.name}
                  </div>
                  <div className="text-xs text-gray-600 dark:text-gray-400 mt-1">
                    {example.description}
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* Node Palette */}
          <div className="p-4">
            <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-3 flex items-center gap-2">
              <Plus className="h-4 w-4" />
              Node Palette
            </h3>
            <div className="space-y-2">
              {nodeTypeOptions.map((node) => {
                const Icon = node.icon;
                return (
                  <div
                    key={node.id}
                    draggable
                    onDragStart={(e) => onDragStart(e, node.id)}
                    className={`cursor-grab active:cursor-grabbing flex items-center gap-3 px-3 py-2 rounded-lg border-2 border-${node.color}-200 dark:border-${node.color}-800 bg-${node.color}-50 dark:bg-${node.color}-900/20 hover:bg-${node.color}-100 dark:hover:bg-${node.color}-900/30 transition-colors`}
                  >
                    <Icon className={`h-5 w-5 text-${node.color}-600 dark:text-${node.color}-400`} />
                    <span className={`text-sm font-medium text-${node.color}-900 dark:text-${node.color}-100`}>
                      {node.label}
                    </span>
                  </div>
                );
              })}
            </div>

            <div className="mt-6 pt-6 border-t border-gray-200 dark:border-gray-700">
              <h4 className="text-xs font-semibold text-gray-600 dark:text-gray-400 mb-2">
                How to Use:
              </h4>
              <ol className="text-xs text-gray-600 dark:text-gray-400 space-y-1">
                <li>1. Drag nodes to canvas</li>
                <li>2. Connect nodes by dragging</li>
                <li>3. Click node to configure</li>
                <li>4. Save and test</li>
              </ol>
            </div>
          </div>

          {/* JSON Viewer */}
          <div className="p-4 border-t border-gray-200 dark:border-gray-700">
            <details className="group">
              <summary className="cursor-pointer text-sm font-medium text-gray-700 dark:text-gray-300 hover:text-blue-600 dark:hover:text-blue-400 flex items-center gap-2">
                <Code className="h-4 w-4" />
                View JSON
              </summary>
              <div className="mt-3">
                <pre className="text-xs bg-gray-100 dark:bg-gray-900 p-3 rounded-lg overflow-auto max-h-64">
                  {JSON.stringify({ nodes, edges }, null, 2)}
                </pre>
              </div>
            </details>
          </div>
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
            fitView
            className="bg-gray-50 dark:bg-gray-900"
          >
            <Controls className="bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600" />
            <MiniMap
              className="bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600"
              nodeColor={(node) => {
                const color = node.data?.color || 'gray';
                const colorMap: Record<string, string> = {
                  blue: '#3b82f6',
                  yellow: '#eab308',
                  purple: '#a855f7',
                  green: '#22c55e',
                  pink: '#ec4899',
                  gray: '#6b7280',
                };
                return colorMap[color] || '#6b7280';
              }}
            />
            <Background variant={BackgroundVariant.Dots} gap={12} size={1} />
          </ReactFlow>
        </div>
      </div>

      {/* Node Configuration Panel */}
      {showConfig && (
        <NodeConfigPanel
          node={selectedNode}
          onClose={() => {
            setShowConfig(false);
            setSelectedNode(null);
          }}
          onSave={handleSaveConfig}
        />
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
