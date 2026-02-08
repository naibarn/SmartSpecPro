/**
 * Workflow Editor - Visual Flow Builder
 * Create and edit workflows using ReactFlow visual editor
 */

import { useState, useCallback, useRef } from 'react';
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
} from 'lucide-react';

// Custom Node Component
function CustomNode({ data }: { data: { label: string; icon: any; color: string } }) {
  const Icon = data.icon;
  return (
    <div
      className={`px-4 py-3 rounded-lg border-2 shadow-lg bg-white dark:bg-gray-800 border-${data.color}-400 dark:border-${data.color}-600 min-w-[180px]`}
    >
      <div className="flex items-center gap-2">
        <Icon className={`h-5 w-5 text-${data.color}-600 dark:text-${data.color}-400`} />
        <div className={`font-medium text-gray-900 dark:text-white`}>{data.label}</div>
      </div>
    </div>
  );
}

const nodeTypes: NodeTypes = {
  custom: CustomNode,
};

const initialNodes: Node[] = [
  {
    id: 'start',
    type: 'custom',
    position: { x: 250, y: 50 },
    data: { label: 'Start', icon: Play, color: 'green' },
  },
];

const initialEdges: Edge[] = [];

function FlowEditor() {
  const [, setLocation] = useLocation();
  const [workflowName, setWorkflowName] = useState('');
  const [workflowDescription, setWorkflowDescription] = useState('');
  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);
  const reactFlowWrapper = useRef<HTMLDivElement>(null);
  const [reactFlowInstance, setReactFlowInstance] = useState<any>(null);

  const nodeTypeOptions = [
    { id: 'llm', label: 'LLM Call', icon: MessageSquare, color: 'blue' },
    { id: 'approval', label: 'Approval Gate', icon: CheckCircle, color: 'yellow' },
    { id: 'conditional', label: 'Conditional', icon: GitMerge, color: 'purple' },
    { id: 'loop', label: 'Loop', icon: Repeat, color: 'green' },
    { id: 'generate_image', label: 'Generate Image', icon: Zap, color: 'pink' },
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

      const newNode: Node = {
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

  const handleSave = () => {
    const flow = {
      name: workflowName || 'Untitled Workflow',
      description: workflowDescription,
      nodes,
      edges,
    };
    console.log('Saving workflow:', flow);
    // TODO: Call tRPC mutation to save workflow
  };

  const handleRun = () => {
    console.log('Running workflow:', { nodes, edges });
    // TODO: Call tRPC mutation to execute workflow
  };

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      {/* Header */}
      <div className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 px-6 py-4">
        <div className="max-w-full mx-auto flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Button
              variant="ghost"
              onClick={() => setLocation('/workflows')}
              className="flex items-center gap-2"
            >
              <ArrowLeft className="h-5 w-5" />
              กลับ
            </Button>
            <div className="h-8 w-px bg-gray-300 dark:bg-gray-600"></div>
            <div>
              <h1 className="text-xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
                <GitBranch className="h-6 w-6" />
                {workflowName || 'เวิร์กโฟลว์ใหม่'}
              </h1>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <Button variant="outline" className="flex items-center gap-2">
              <Settings className="h-4 w-4" />
              ตั้งค่า
            </Button>
            <Button
              variant="outline"
              onClick={handleSave}
              className="flex items-center gap-2"
            >
              <Save className="h-4 w-4" />
              บันทึก
            </Button>
            <Button
              onClick={handleRun}
              className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white"
            >
              <Play className="h-4 w-4" />
              รันทดสอบ
            </Button>
          </div>
        </div>
      </div>

      <div className="flex h-[calc(100vh-80px)]">
        {/* Node Palette */}
        <div className="w-64 bg-white dark:bg-gray-800 border-r border-gray-200 dark:border-gray-700 p-4 overflow-y-auto">
          <div className="mb-6">
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              ชื่อเวิร์กโฟลว์
            </label>
            <input
              type="text"
              value={workflowName}
              onChange={(e) => setWorkflowName(e.target.value)}
              placeholder="เช่น สร้างโพสต์โซเชียล"
              className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>

          <div className="mb-6">
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              คำอธิบาย
            </label>
            <textarea
              value={workflowDescription}
              onChange={(e) => setWorkflowDescription(e.target.value)}
              placeholder="อธิบายสิ่งที่เวิร์กโฟลว์นี้ทำ..."
              rows={3}
              className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>

          <div className="border-t border-gray-200 dark:border-gray-700 pt-4">
            <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-3 flex items-center gap-2">
              <Plus className="h-4 w-4" />
              โหนด (Nodes)
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
                วิธีใช้งาน:
              </h4>
              <ol className="text-xs text-gray-600 dark:text-gray-400 space-y-1">
                <li>1. ลากโหนดมาวางใน Canvas</li>
                <li>2. เชื่อมโหนดด้วยการลากเส้น</li>
                <li>3. คลิกโหนดเพื่อตั้งค่า</li>
                <li>4. บันทึกและทดสอบ</li>
              </ol>
            </div>
          </div>

          {/* JSON Editor Toggle */}
          <div className="mt-6 pt-6 border-t border-gray-200 dark:border-gray-700">
            <details className="group">
              <summary className="cursor-pointer text-sm font-medium text-gray-700 dark:text-gray-300 hover:text-blue-600 dark:hover:text-blue-400 flex items-center gap-2">
                <Code className="h-4 w-4" />
                ดู JSON
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
