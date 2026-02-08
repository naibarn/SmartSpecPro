# Section 09: ReactFlow Editor Setup

**Phase**: 3 - Virtual Flow Builder
**Estimated Time**: 4-5 days
**Priority**: High
**Dependencies**: None

---

## Overview

Set up ReactFlow drag-and-drop visual workflow editor with node palette, connection validation, and auto-layout.

---

## Goals

- ✅ ReactFlow canvas with drag-and-drop
- ✅ Node palette (LLM, Tool, Approval, Conditional, Loop)
- ✅ Connection validation (type checking)
- ✅ Auto-layout with ELK.js
- ✅ Save/load flows

---

## Implementation

```tsx
// client/src/components/WorkflowBuilder.tsx
import ReactFlow, { Background, Controls } from 'reactflow';
import 'reactflow/dist/style.css';

const nodeTypes = {
  llm: LLMNode,
  approval: ApprovalNode,
  tool: ToolNode,
  conditional: ConditionalNode,
  loop: LoopNode
};

export function WorkflowBuilder() {
  const [nodes, setNodes] = useState([]);
  const [edges, setEdges] = useState([]);

  const onConnect = useCallback((connection) => {
    if (validateConnection(connection)) {
      setEdges((eds) => addEdge(connection, eds));
    }
  }, []);

  return (
    <ReactFlow
      nodes={nodes}
      edges={edges}
      nodeTypes={nodeTypes}
      onConnect={onConnect}
    >
      <Background />
      <Controls />
      <NodePalette />
    </ReactFlow>
  );
}
```

**Auto-layout**:
```typescript
import ELK from 'elkjs/lib/elk.bundled.js';

async function autoLayout(nodes, edges) {
  const elk = new ELK();
  const graph = {
    id: 'root',
    layoutOptions: { 'elk.algorithm': 'layered' },
    children: nodes.map(n => ({ id: n.id, width: 150, height: 50 })),
    edges: edges.map(e => ({ id: e.id, sources: [e.source], targets: [e.target] }))
  };

  const layout = await elk.layout(graph);
  // Apply positions to nodes
}
```

---

## Completion Checklist

- [ ] ReactFlow setup complete
- [ ] Node palette works
- [ ] Connection validation works
- [ ] Auto-layout works
- [ ] Save/load flows works

**Estimated Completion**: 4-5 days
