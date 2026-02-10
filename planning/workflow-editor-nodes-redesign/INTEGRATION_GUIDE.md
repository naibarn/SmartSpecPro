# WorkflowEditor Integration Guide

This guide documents how to integrate all components from Sections 01-13 into the main WorkflowEditor.

## Architecture Overview

The refactored WorkflowEditor uses a **registry-driven architecture** where:
- Backend Python is the single source of truth for node definitions
- Frontend fetches node types dynamically via TanStack Query
- Single ReactFlow node type (`'workflow'`) handles all node rendering via BaseNode
- Configuration forms are generated dynamically from InputSpec definitions
- Execution status is managed via Zustand store and updated via SSE

## Integration Steps

### Step 1: Update ReactFlow Node Types

**Before:**
```typescript
const nodeTypes = {
  llm_call: LLMNode,
  rag_query: RAGNode,
  conditional: ConditionalNode,
  loop: LoopNode,
  approval_gate: ApprovalNode,
};
```

**After:**
```typescript
import { BaseNode } from '@/components/workflow/nodes/BaseNode';

const nodeTypes: NodeTypes = {
  workflow: BaseNode,  // Single node type for all
};
```

### Step 2: Replace Hardcoded Node Sidebar

**Before:**
```typescript
const availableNodes = [
  { type: 'llm_call', name: 'LLM Call', icon: 'Zap' },
  { type: 'rag_query', name: 'RAG Query', icon: 'Database' },
  // ... hardcoded array
];
```

**After:**
```typescript
import { useNodeRegistry } from '@/lib/workflow/useNodeRegistry';

function WorkflowEditor() {
  const { nodeTypes, isLoading, getNodeTypesByCategory } = useNodeRegistry();

  const aiNodes = getNodeTypesByCategory('ai');
  const flowNodes = getNodeTypesByCategory('flow_control');
  const humanNodes = getNodeTypesByCategory('human');
  const mediaNodes = getNodeTypesByCategory('media');
  const skillNodes = getNodeTypesByCategory('skills');

  return (
    <Sidebar>
      <NodeCategory title="AI Nodes" nodes={aiNodes} onAddNode={onAddNode} />
      <NodeCategory title="Flow Control" nodes={flowNodes} onAddNode={onAddNode} />
      <NodeCategory title="Human Tasks" nodes={humanNodes} onAddNode={onAddNode} />
      <NodeCategory title="Media" nodes={mediaNodes} onAddNode={onAddNode} />
      <NodeCategory title="Skills" nodes={skillNodes} onAddNode={onAddNode} />
    </Sidebar>
  );
}
```

### Step 3: Node Creation Handler

```typescript
const onAddNode = (nodeType: string) => {
  const spec = nodeTypes.find(t => t.type === nodeType);
  if (!spec) return;

  const newNode: Node = {
    id: `${nodeType}-${Date.now()}`,
    type: 'workflow',  // Always use 'workflow' type
    data: {
      nodeType,  // Logical type from registry
      label: spec.display_name,
      config: {},  // Empty config, filled via DynamicNodeConfig
    },
    position: { x: 100, y: 100 },  // Or calculate from viewport
  };

  setNodes((nodes) => [...nodes, newNode]);
};
```

### Step 4: Integrate DynamicNodeConfig Panel

```typescript
import { DynamicNodeConfig } from '@/components/workflow/config/DynamicNodeConfig';

function WorkflowEditor() {
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const selectedNode = nodes.find(n => n.id === selectedNodeId);

  // Compute connections for the selected node
  const connections = useMemo(() => {
    if (!selectedNode) return {};
    return edges.reduce((acc, edge) => {
      if (edge.target === selectedNode.id && edge.targetHandle) {
        acc[edge.targetHandle] = true;
      }
      return acc;
    }, {} as Record<string, boolean>);
  }, [selectedNode, edges]);

  return (
    <>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodeClick={(_, node) => setSelectedNodeId(node.id)}
        // ... other props
      />

      {/* Right Drawer */}
      {selectedNode && (
        <RightDrawer onClose={() => setSelectedNodeId(null)}>
          <DynamicNodeConfig
            nodeId={selectedNode.id}
            nodeType={selectedNode.data.nodeType}
            config={selectedNode.data.config}
            connections={connections}
            onConfigChange={(newConfig) => {
              setNodes((nodes) =>
                nodes.map((n) =>
                  n.id === selectedNode.id
                    ? { ...n, data: { ...n.data, config: newConfig } }
                    : n
                )
              );
            }}
          />
        </RightDrawer>
      )}
    </>
  );
}
```

### Step 5: Port Type Validation

```typescript
import { useIsValidConnection } from '@/lib/workflow/isValidConnection';

function WorkflowEditor() {
  const { isValidConnection } = useIsValidConnection(nodes);

  return (
    <ReactFlow
      nodes={nodes}
      edges={edges}
      isValidConnection={isValidConnection}
      // ... other props
    />
  );
}
```

### Step 6: Integrate Execution Visualization

```typescript
import { useExecutionStore } from '@/stores/executionStore';
import { ExecutionOverlay } from '@/components/workflow/execution/ExecutionOverlay';
import { ExecutionLogPanel } from '@/components/workflow/execution/ExecutionLogPanel';
import { CostEstimation } from '@/components/workflow/execution/CostEstimation';

function WorkflowEditor() {
  const { isExecuting, getNodeStatus } = useExecutionStore();

  // Render execution overlays on canvas
  const renderNode = (node: Node) => {
    return (
      <div className="relative">
        <BaseNode {...node} />
        {isExecuting && (
          <ExecutionOverlay
            nodeId={node.id}
            status={getNodeStatus(node.id)}
          />
        )}
      </div>
    );
  };

  return (
    <>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={{ workflow: renderNode }}
        // ... other props
      />

      {/* Execution Log Panel */}
      <BottomDrawer open={isExecuting}>
        <ExecutionLogPanel />
      </BottomDrawer>

      {/* Cost Estimation (in right drawer when not executing) */}
      {!isExecuting && selectedNode && (
        <RightDrawer>
          <DynamicNodeConfig {...configProps} />
          <CostEstimation
            nodes={nodes}
            edges={edges}
            userBalance={user.creditBalance}
            onRunClick={handleRun}
          />
        </RightDrawer>
      )}
    </>
  );
}
```

### Step 7: Compile Workflow

```typescript
import { api } from '@/lib/trpc';

function WorkflowEditor() {
  const compileMutation = api.workflow.compile.useMutation();

  const handleCompile = async () => {
    try {
      const result = await compileMutation.mutateAsync({
        nodes: nodes,
        edges: edges,
        metadata: {
          name: workflowName,
          version: '1.0.0',
          description: workflowDescription,
        },
      });

      if (result.success) {
        // Store compiled manifest
        setCompiledManifest(result.manifest);
        toast.success('Workflow compiled successfully!');
      } else {
        toast.error(result.error || 'Compilation failed');
      }
    } catch (error) {
      toast.error('Compilation failed: ' + error.message);
    }
  };

  return (
    <Header>
      <Button onClick={handleCompile} variant="secondary">
        Compile
      </Button>
    </Header>
  );
}
```

### Step 8: Execute Workflow

```typescript
function WorkflowEditor() {
  const { startExecution, updateNodeStatus, addLog, completeExecution } = useExecutionStore();
  const executeMutation = api.workflow.execute.useMutation();

  const handleExecute = async () => {
    if (!compiledManifest) {
      toast.error('Please compile workflow first');
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
        `/api/v1/workflows/execute/${result.executionId}/stream`
      );

      eventSource.addEventListener('node_start', (event) => {
        const data = JSON.parse(event.data);
        updateNodeStatus(data.nodeId, {
          status: 'running',
          startTime: Date.now(),
        });
        addLog({
          id: data.event_id,
          timestamp: Date.now(),
          nodeId: data.nodeId,
          nodeName: data.nodeName,
          eventType: 'node_start',
          status: 'running',
        });
      });

      eventSource.addEventListener('node_complete', (event) => {
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
          nodeName: data.nodeName,
          eventType: 'node_complete',
          status: 'success',
          duration: data.durationMs,
          output: data.output,
        });
      });

      eventSource.addEventListener('workflow_complete', (event) => {
        const data = JSON.parse(event.data);
        completeExecution();
        eventSource.close();
        toast.success('Workflow completed successfully!');
      });

      eventSource.onerror = () => {
        eventSource.close();
        completeExecution();
        toast.error('Execution stream error');
      };
    } catch (error) {
      if (error.message.includes('402') || error.message.includes('Insufficient')) {
        toast.error('Insufficient credits to run workflow');
      } else {
        toast.error('Execution failed: ' + error.message);
      }
    }
  };

  return (
    <Header>
      <Button onClick={handleExecute} variant="primary" disabled={isExecuting}>
        {isExecuting ? 'Running...' : 'Run Workflow'}
      </Button>
    </Header>
  );
}
```

### Step 9: Save/Load Workflow

```typescript
function WorkflowEditor() {
  const saveWorkflowMutation = api.workflow.save.useMutation();
  const loadWorkflowQuery = api.workflow.load.useQuery(
    { id: workflowIdFromUrl },
    { enabled: !!workflowIdFromUrl }
  );

  const handleSave = async () => {
    try {
      const result = await saveWorkflowMutation.mutateAsync({
        id: workflowId,
        name: workflowName,
        description: workflowDescription,
        workflowJson: { nodes, edges },
      });

      setWorkflowId(result.id);
      toast.success('Workflow saved successfully!');
    } catch (error) {
      toast.error('Save failed: ' + error.message);
    }
  };

  // Load workflow on mount if ID in URL
  useEffect(() => {
    if (loadWorkflowQuery.data) {
      const workflow = loadWorkflowQuery.data;
      setNodes(workflow.workflowJson.nodes);
      setEdges(workflow.workflowJson.edges);
      setWorkflowName(workflow.name);
      setWorkflowDescription(workflow.description);
    }
  }, [loadWorkflowQuery.data]);

  return (
    <Header>
      <Button onClick={handleSave} variant="secondary">
        Save
      </Button>
    </Header>
  );
}
```

### Step 10: Template Browser Integration

```typescript
import { TemplateBrowser } from '@/components/workflow/TemplateBrowser';

function WorkflowEditor() {
  const [showTemplateBrowser, setShowTemplateBrowser] = useState(false);
  const templatesQuery = api.workflow.listSaved.useQuery({ status: 'published' });

  const handleLoadTemplate = (template: WorkflowTemplate) => {
    setNodes(template.workflowJson.nodes);
    setEdges(template.workflowJson.edges);
    setWorkflowName(template.name);
    setWorkflowDescription(template.description);
    setShowTemplateBrowser(false);
    toast.success(`Loaded template: ${template.name}`);
  };

  return (
    <>
      <Sidebar>
        <Button onClick={() => setShowTemplateBrowser(true)}>
          Browse Templates
        </Button>
      </Sidebar>

      <Modal open={showTemplateBrowser} onClose={() => setShowTemplateBrowser(false)}>
        <TemplateBrowser
          templates={templatesQuery.data || []}
          onLoadTemplate={handleLoadTemplate}
          onClose={() => setShowTemplateBrowser(false)}
        />
      </Modal>
    </>
  );
}
```

## Component Dependencies

```
WorkflowEditor (main)
├── useNodeRegistry (fetch node definitions)
├── useExecutionStore (execution state)
├── api.workflow.* (tRPC procedures)
├── ReactFlow
│   ├── nodeTypes: { workflow: BaseNode }
│   ├── isValidConnection (port type validation)
│   └── onNodeClick → setSelectedNodeId
├── Sidebar
│   └── NodeCategory (per category from registry)
├── RightDrawer (when node selected)
│   ├── DynamicNodeConfig
│   └── CostEstimation (when not executing)
├── BottomDrawer (when executing)
│   └── ExecutionLogPanel
├── ExecutionOverlay (per node, when executing)
└── TemplateBrowser (modal)
```

## File Checklist

- [ ] Update `apps/web/client/src/pages/WorkflowEditor.tsx` with all integrations
- [ ] Import all components from sections 10-13
- [ ] Replace hardcoded node types with `useNodeRegistry`
- [ ] Wire up `DynamicNodeConfig` to selected node
- [ ] Add execution visualization (overlay + log panel)
- [ ] Integrate cost estimation
- [ ] Add workflow save/load via tRPC
- [ ] Add template browser modal
- [ ] Implement SSE client for real-time updates
- [ ] Add compile handler with error display
- [ ] Add execute handler with credit check

## Testing Checklist

- [ ] Node sidebar shows all node types from registry
- [ ] Adding node creates correct structure (type='workflow', data.nodeType set)
- [ ] Clicking node opens config panel
- [ ] Config changes update node.data.config
- [ ] Port connections validate type compatibility
- [ ] Compile button calls backend and shows errors
- [ ] Cost estimation shows before execution
- [ ] Run button disabled if insufficient credits
- [ ] Execution overlays appear on running nodes
- [ ] Execution log updates in real-time
- [ ] Workflow can be saved and loaded
- [ ] Templates can be browsed and loaded
