Now I have all the context I need. Let me extract the relevant content for section-14-editor-refactor. This section focuses on refactoring the frontend WorkflowEditor to use the new architecture with BaseNode, DynamicNodeConfig, template browser, and execution visualization.

## Section 14: Frontend WorkflowEditor Refactor

**Scope:** Update `WorkflowEditor.tsx` to integrate all frontend components built in sections 10-13. Replace hardcoded nodes and workflows with registry-driven and template-driven architecture. Integrate execution visualization and cost estimation.

**Dependencies:** 
- section-10-basenode (BaseNode component)
- section-11-dynamic-config (DynamicNodeConfig, ExpressionInput, ConditionBuilder)
- section-12-execution-viz (ExecutionOverlay, ExecutionLogPanel, CostEstimation, executionStore)
- section-13-template-browser (TemplateBrowser, TemplateCard, SaveTemplateModal, workflowTemplates router)

---

## Tests (TDD First)

Extract all tests from `claude-plan-tdd.md` for section 14:

```typescript
// apps/web/client/src/pages/__tests__/WorkflowEditor.test.tsx

// Test: WorkflowEditor — uses single 'workflow' ReactFlow type (BaseNode for all)
// Test: WorkflowEditor — node sidebar populated from useNodeRegistry (not hardcoded)
// Test: WorkflowEditor — adding a node creates node with data.nodeType field
// Test: WorkflowEditor — clicking a node opens DynamicNodeConfig panel
// Test: WorkflowEditor — isValidConnection checks port type compatibility
// Test: WorkflowEditor — Compile button visible and calls compileMutation
// Test: WorkflowEditor — Run button triggers cost estimation first
// Test: WorkflowEditor — example workflows loaded from TemplateBrowser (not hardcoded array)
// Test: WorkflowEditor — save workflow calls workflow.save tRPC procedure
// Test: WorkflowEditor — load workflow from URL params calls workflow.load
```

---

## Implementation Details

### 14.1 Current WorkflowEditor State

The existing `WorkflowEditor.tsx` (`apps/web/client/src/pages/WorkflowEditor.tsx`):
- Uses hardcoded node types array (5 nodes: `llm_call`, `rag_query`, `conditional`, `loop`, `approval_gate`)
- ReactFlow configured with separate node types for each type (not single BaseNode)
- Sidebar shows hardcoded example workflows (2 workflows)
- No DynamicNodeConfig — node config is not implemented
- No execution visualization
- Compile button exists but is secondary to Run button
- Cost estimation not integrated

### 14.2 Refactoring Goals

1. **Single ReactFlow node type:** Replace multiple node type handlers with single `BaseNode` from section 10
2. **Registry-driven sidebar:** Fetch node types from `useNodeRegistry` hook instead of hardcoded array
3. **Template-driven examples:** Replace hardcoded example workflows with `TemplateBrowser` component
4. **Config panel integration:** When node selected, open `DynamicNodeConfig` with proper input binding
5. **Execution visualization:** Integrate `ExecutionOverlay`, `ExecutionLogPanel`, `CostEstimation` components
6. **Cost estimation:** Show estimated cost before Run, check balance
7. **Workflow persistence:** Use tRPC `workflow` router (section 8) for save/load operations

### 14.3 New WorkflowEditor Architecture

**Layout:**
```
┌─────────────────────────────────────────┐
│          Header + Compile/Run/Save      │
├──────────────────┬──────────────────────┤
│                  │                      │
│  Node Sidebar    │  ReactFlow Canvas    │ Execution Viz
│  (from registry) │  (BaseNode x all)    │ (overlay + log)
│                  │                      │
│  Template        │                      │
│  Browser         │                      │
│  (examples)      │                      │
└──────────────────┴──────────────────────┘
       Right Drawer (when node selected)
       ├─ DynamicNodeConfig form
       ├─ Validation errors
       └─ CostEstimation preview
```

### 14.4 Key Components and Props

**WorkflowEditor main state:**
```typescript
// Workflow state (ReactFlow manages this)
const [nodes, setNodes, onNodesChange] = useNodesState<WorkflowNode>([]);
const [edges, setEdges, onEdgesChange] = useEdgesState<WorkflowEdge>([]);
const [viewport, setViewport] = useState<Viewport>({ x: 0, y: 0, zoom: 1 });

// Node registry (from section 10 hook)
const { nodeTypes: registryNodeTypes, isLoading: registryLoading } = useNodeRegistry();

// Selected node for config panel
const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
const selectedNode = nodes.find(n => n.id === selectedNodeId);

// Execution state (from section 12 store)
const { isExecuting, nodeStatuses, logs } = useExecutionStore();
const { startExecution, updateNodeStatus, addLog, completeExecution } = useExecutionStore();

// Cost estimation (from section 12 component)
const [estimatedCost, setEstimatedCost] = useState<number | null>(null);
const [userBalance, setUserBalance] = useState<number>(0);

// Workflow persistence (from section 8 tRPC router)
const { mutate: saveWorkflow } = useSaveWorkflow();
const { mutate: loadWorkflow } = useLoadWorkflow();
```

**Node creation from sidebar:**
When user clicks a node type in the sidebar:
```typescript
const onAddNode = (nodeType: string) => {
  const spec = registryNodeTypes.find(t => t.type === nodeType);
  if (!spec) return;

  const newNode: WorkflowNode = {
    id: `${nodeType}-${Date.now()}`,
    type: 'workflow',  // Single ReactFlow type for ALL
    data: {
      nodeType,        // Logical type from registry
      label: spec.display_name,
      config: {},      // User config (filled in DynamicNodeConfig)
    },
    position: { x: 250, y: 250 },
  };
  
  setNodes([...nodes, newNode]);
};
```

**Node selection and config panel:**
```typescript
const onNodeClick = (event: React.MouseEvent, node: Node) => {
  setSelectedNodeId(node.id);
  // Right drawer opens showing DynamicNodeConfig for this node
};

// In render:
{selectedNode && (
  <RightDrawer>
    <DynamicNodeConfig
      node={selectedNode}
      nodeTypeSpec={registryNodeTypes.find(t => t.type === selectedNode.data.nodeType)}
      onChange={(updatedConfig) => {
        setNodes(nodes.map(n => 
          n.id === selectedNode.id 
            ? { ...n, data: { ...n.data, config: updatedConfig } }
            : n
        ));
      }}
    />
    <CostEstimation
      estimatedCost={estimatedCost}
      userBalance={userBalance}
      onEstimateClick={handleEstimateCost}
    />
  </RightDrawer>
)}
```

**Port type validation:**
```typescript
const isValidConnection = (connection: Connection): boolean => {
  const { source, sourceHandle, target, targetHandle } = connection;
  
  // Find source node's output spec
  const sourceNode = nodes.find(n => n.id === source);
  const sourceNodeType = registryNodeTypes.find(t => t.type === sourceNode?.data.nodeType);
  const sourceOutput = sourceNodeType?.outputs.find(o => o.name === sourceHandle);
  
  // Find target node's input spec
  const targetNode = nodes.find(n => n.id === target);
  const targetNodeType = registryNodeTypes.find(t => t.type === targetNode?.data.nodeType);
  const targetInput = targetNodeType?.inputs.find(i => i.name === targetHandle);
  
  if (!sourceOutput || !targetInput) return false;
  
  // Check type compatibility (from section 10)
  return isCompatibleConnection(sourceOutput.data_type, targetInput.data_type);
};
```

**Compile button (always visible):**
```typescript
const handleCompile = async () => {
  try {
    const compiled = await compileMutation({
      nodes,
      edges,
    });
    setCompiledState(compiled);
    toast.success('Workflow compiled successfully');
  } catch (error) {
    toast.error('Compilation failed: ' + error.message);
  }
};

// In header:
<Button onClick={handleCompile} variant="secondary">
  Compile
</Button>
```

**Cost estimation and Run:**
```typescript
const handleEstimateCost = async () => {
  if (!compiledState) {
    toast.error('Compile workflow first');
    return;
  }
  
  const cost = await estimateCostMutation({
    compiledWorkflow: compiledState,
  });
  
  setEstimatedCost(cost.estimatedCredits);
  setUserBalance(cost.userBalance);
  
  if (cost.estimatedCredits > cost.userBalance) {
    toast.warning('Insufficient balance for this workflow');
    return;
  }
};

const handleRun = async () => {
  await handleEstimateCost();
  
  if (estimatedCost === null || estimatedCost > userBalance) {
    return;
  }
  
  try {
    startExecution();
    const executionId = await executeMutation({
      compiledWorkflow: compiledState,
    });
    
    // Connect SSE stream
    const eventSource = new EventSource(
      `/api/v1/workflow/execute/${executionId}/stream`,
      { withCredentials: true }
    );
    
    eventSource.addEventListener('node_start', (e) => {
      const data = JSON.parse(e.data);
      updateNodeStatus(data.nodeId, 'running');
      addLog({ timestamp: data.timestamp, message: `${data.nodeName} started` });
    });
    
    eventSource.addEventListener('node_complete', (e) => {
      const data = JSON.parse(e.data);
      updateNodeStatus(data.nodeId, 'success');
      addLog({ timestamp: data.timestamp, message: `${data.nodeName} completed` });
    });
    
    eventSource.addEventListener('workflow_complete', (e) => {
      completeExecution();
      eventSource.close();
      toast.success('Workflow completed');
    });
    
  } catch (error) {
    completeExecution();
    toast.error('Execution failed: ' + error.message);
  }
};
```

**Template browser (instead of hardcoded examples):**
```typescript
// Replace the hardcoded example workflows section with:
<TemplateBrowser
  onUseTemplate={async (templateId) => {
    const template = await useTemplateMutation(templateId);
    setNodes(template.nodes);
    setEdges(template.edges);
    toast.success('Template loaded');
  }}
/>
```

**Save workflow:**
```typescript
const handleSaveWorkflow = async (name: string, description: string) => {
  try {
    await saveWorkflow({
      name,
      description,
      workflowJson: {
        nodes,
        edges,
        viewport,
      },
    });
    toast.success('Workflow saved');
  } catch (error) {
    toast.error('Save failed: ' + error.message);
  }
};
```

**Load workflow from URL:**
```typescript
useEffect(() => {
  const params = new URLSearchParams(window.location.search);
  const workflowId = params.get('id');
  
  if (workflowId) {
    loadWorkflow(workflowId, {
      onSuccess: (workflow) => {
        setNodes(workflow.workflowJson.nodes);
        setEdges(workflow.workflowJson.edges);
      },
    });
  }
}, []);
```

### 14.5 Sidebar Node Type List

The sidebar should:
1. Fetch `nodeTypes` from `useNodeRegistry()` hook
2. Group by category (ai, flow_control, human, skills, media)
3. Show icon + name for each node type
4. Draggable or clickable "add node" action
5. Include both core nodes and auto-generated skill nodes

```typescript
const NodeSidebar = ({ registryNodeTypes, onAddNode }) => {
  const categories = {
    'ai': { label: 'AI', icon: 'Lightbulb' },
    'flow_control': { label: 'Flow Control', icon: 'GitBranch' },
    'human': { label: 'Human', icon: 'Users' },
    'media': { label: 'Media', icon: 'Image' },
    'skills': { label: 'Skills', icon: 'Zap' },
  };
  
  const grouped = groupBy(registryNodeTypes, 'category');
  
  return (
    <div className="w-64 bg-gray-50 border-r p-4">
      {Object.entries(grouped).map(([category, nodes]) => (
        <div key={category} className="mb-4">
          <h3 className="font-semibold text-sm mb-2">
            {categories[category]?.label || category}
          </h3>
          {nodes.map(node => (
            <button
              key={node.type}
              onClick={() => onAddNode(node.type)}
              className="w-full text-left px-3 py-2 rounded hover:bg-gray-200 text-sm flex items-center gap-2"
            >
              <Icon name={node.icon} size={16} />
              {node.display_name}
            </button>
          ))}
        </div>
      ))}
    </div>
  );
};
```

### 14.6 File Changes Summary

**Modified files:**
- `/apps/web/client/src/pages/WorkflowEditor.tsx` — Complete refactor (major changes)
- `/apps/web/client/src/pages/__tests__/WorkflowEditor.test.tsx` — Tests (new/updated)

**No new files needed** — all supporting components built in sections 10-13

**Dependencies on other sections:**
- Section 10: `BaseNode` component, `useNodeRegistry` hook, `isValidConnection` function
- Section 11: `DynamicNodeConfig`, `ExpressionInput`, `ConditionBuilder` components
- Section 12: `ExecutionOverlay`, `ExecutionLogPanel`, `CostEstimation` components, `executionStore`
- Section 13: `TemplateBrowser`, `TemplateCard`, `SaveTemplateModal` components, `workflowTemplates` tRPC router
- Section 8: `workflow` tRPC router (`save`, `load`, `list`, `delete` procedures)

### 14.7 Integration Points

**Backend APIs to call:**
- `GET /api/v1/workflow/node-types` (section 2) — Fetched via `useNodeRegistry`
- `POST /api/v1/workflow/compile` (section 7) — Compile workflow before run
- `POST /api/v1/workflow/estimate-cost` (section 8) — Estimate cost before run
- `POST /api/v1/workflow/execute` (section 8) — Start execution
- `GET /api/v1/workflow/execute/{id}/stream` (section 9) — SSE event stream
- `GET /api/v1/workflow/list` (section 8) — List user workflows
- tRPC: `workflow.save`, `workflow.load`, `workflow.list` — CRUD workflows (section 8)
- tRPC: `workflowTemplates.list`, `workflowTemplates.useTemplate` — Template browser (section 13)

### 14.8 UI/UX Behavior

**Node creation:**
- User clicks node type in sidebar → node appears on canvas at center
- Each node gets unique ID: `{nodeType}-{timestamp}`
- Node labeled with `display_name` from registry

**Node selection and configuration:**
- User clicks node → right drawer slides in with `DynamicNodeConfig`
- Config form populated from node's `data.config` dict
- User changes values → saved immediately to node
- For connected inputs (with handles), form control hidden, connection indicator shown

**Compilation:**
- User clicks Compile button
- Frontend calls `POST /api/v1/workflow/compile` with full node graph
- Backend validates and returns compiled state
- If validation fails, error toast shows specific issue

**Cost estimation:**
- User clicks Run button
- Cost estimation modal appears or tooltip shows estimated cost
- If balance insufficient, Run button disabled
- Otherwise, Run proceeds

**Execution:**
- User clicks Run
- SSE connection established to `/api/v1/workflow/execute/{id}/stream`
- Canvas enters "execution mode": nodes show status overlays
- Log panel populates in real-time with execution events
- Nodes turn green (success), red (failed), or gray (skipped)
- On completion, show summary toast and enable further edits

**Template browser:**
- Sidebar has "Templates" section below node types
- Search + category filters
- Click "Use Template" → workflow loads on canvas

**Save workflow:**
- Header has "Save" button
- Opens modal with name, description, and "Publish as Template" checkbox
- Saves to `workflows` table for user
- Optional: also publishes to `workflow_templates` marketplace

### 14.9 Error Handling

- **Uncompiled workflow Run:** Show toast "Compile workflow first"
- **Insufficient balance:** Disable Run button, show warning
- **Compilation errors:** Parse backend error message, highlight problematic node on canvas
- **Execution errors:** Log error in log panel, highlight failed node red, show error details
- **Network/SSE errors:** Show retry toast, attempt reconnect with Last-Event-ID

### 14.10 Performance Considerations

- `useNodeRegistry` hook caches registry for 5+ minutes (TanStack Query default)
- Sidebar node list is static (registry fetched once at mount)
- DynamicNodeConfig lazy-loads async options (models, collections, approvers) only when dropdown opened
- Canvas re-renders only when nodes/edges change or execution status changes
- ExecutionLogPanel auto-scrolls to latest but doesn't re-render all past logs

---

## Summary

Section 14 is the integration layer that brings together all frontend components from sections 10-13 into a cohesive editor experience. The refactoring replaces hardcoded arrays with dynamic registry-driven and template-driven content, adds real-time execution visualization, and introduces workflow persistence. The single `BaseNode` component simplifies the canvas logic, while the `DynamicNodeConfig` panel provides flexible node configuration without hardcoding UI for each node type.