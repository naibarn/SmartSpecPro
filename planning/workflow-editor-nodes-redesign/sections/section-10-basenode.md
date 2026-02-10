Now I have all the context. Let me identify section-10-basenode in the index and extract the relevant content from the plan and TDD documents.

From `index.md`, section-10-basenode is described as:
- **Frontend BaseNode + useNodeRegistry**
- Depends on: section-02-registry
- Blocks: section-11-dynamic-config, section-12-execution-viz, section-14-editor-refactor
- Can be parallelized with section-09-sse-stream

Now I'll create the comprehensive section content:

---

# Frontend BaseNode + useNodeRegistry

## Overview

This section implements the frontend components that render workflow nodes dynamically based on the backend node registry. Instead of hardcoded node types, the frontend fetches node definitions from the Python backend API and uses a single `BaseNode` ReactFlow component to render all node types. This eliminates frontend/backend registry sync issues and enables real-time support for new node types without code changes.

## Dependencies

- **section-02-registry** — Backend node type registry and `/api/v1/workflow/node-types` endpoint must be implemented first
- Section can be parallelized with **section-09-sse-stream**
- Provides foundation for **section-11-dynamic-config** (config panel), **section-12-execution-viz** (execution overlays), and **section-14-editor-refactor** (editor integration)

## Core Concepts

### Node Type Registry on Frontend

The backend is the single source of truth for node definitions. The frontend fetches from `GET /api/v1/workflow/node-types` on app load and caches with TanStack Query. This response includes all core node types (llm_call, rag_query, conditional, loop, approval_gate, generate_image) plus auto-generated skill nodes.

Each `NodeTypeSpec` contains:
- `type` — unique identifier (e.g., "llm_call")
- `display_name`, `description` — UI labels
- `icon` — Lucide icon name
- `color` — Tailwind color name
- `category` — 'ai', 'flow_control', 'human', 'skills', 'media'
- `inputs` — array of `InputSpec` (name, data_type, ui_type, accepts_connection, etc.)
- `outputs` — array of `OutputSpec` (name, data_type)

### Single ReactFlow Node Type

All workflow nodes use a single ReactFlow node type: `'workflow'`. The logical node type is stored in `node.data.nodeType`. This avoids the brittle `id.split('-')[0]` pattern and simplifies the node type mapping:

```typescript
const nodeTypes: NodeTypes = { workflow: BaseNode };

// Example node creation:
const newNode: Node = {
  id: `llm_call-${Date.now()}`,
  type: 'workflow',              // ReactFlow type — always 'workflow'
  data: {
    nodeType: 'llm_call',        // Logical type from registry
    label: 'LLM Call',
    config: {},                  // User-configured values
  },
};
```

### Handle Color-Coding by Data Type

Handles are color-coded based on their `data_type` for visual distinction:

| Data Type | Color | Hex |
|-----------|-------|-----|
| text | blue | #3b82f6 |
| json | green | #10b981 |
| array | purple | #8b5cf6 |
| image | pink | #ec4899 |
| number | orange | #f59e0b |
| boolean | cyan | #06b6d4 |
| any | gray | #6b7280 |

## Tests (TDD First)

All tests must pass before implementation is considered complete.

### Frontend Tests

#### BaseNode Component Tests
File: `apps/web/client/src/components/workflow/nodes/__tests__/BaseNode.test.tsx`

Test cases:
1. **Node rendering** — Renders node label from `data.label`
2. **Icon rendering** — Renders correct icon for node type by looking up definition in registry
3. **Input handles** — Renders Handle components for inputs with `accepts_connection: true`
4. **Output handles** — Renders Handle components for all outputs
5. **Handle color-coding** — Handles colored by `data_type` (blue for text, green for json, etc.)
6. **Selected state** — Shows selected styling when node is selected in ReactFlow
7. **Config summary** — Renders a summary of configured values on node face

Key assertions:
- For an llm_call node, verify icon is "Zap" (or registered icon)
- For an llm_call node, verify color class includes "blue" (from color map)
- Verify input handles exist only for inputs with `accepts_connection: true`
- Verify output handles exist for all outputs
- Verify handle connections use correct color classes

#### useNodeRegistry Hook Tests
File: `apps/web/client/src/lib/workflow/__tests__/useNodeRegistry.test.ts`

Test cases:
1. **API fetch** — Hook fetches node types from `/api/v1/workflow/node-types`
2. **Caching** — Response is cached (second render doesn't refetch)
3. **getNodeType** — Returns definition for known type
4. **getNodeType (missing)** — Returns undefined for unknown type
5. **Error handling** — Handles API errors gracefully

Key implementations:
- Use TanStack Query `useQuery` with a stable queryKey: `['nodeRegistry']`
- Cache should remain valid for the session (or use a staleTime of 5 minutes)

#### Data Type Compatibility Tests
File: `apps/web/client/src/lib/workflow/__tests__/dataTypes.test.ts`

Test cases:
1. **text → text** — Valid connection
2. **text → any** — Valid connection (any accepts all)
3. **image → number** — Invalid connection (incompatible types)
4. **any → any** — Valid
5. **json → text** — Valid (auto-stringify)
6. **number → text** — Valid
7. **array → json** — Valid

## Implementation Files

### 1. **useNodeRegistry Hook**
File: `apps/web/client/src/lib/workflow/useNodeRegistry.ts`

Purpose: Fetch and cache node registry from backend.

Stub:
```typescript
import { useQuery } from '@tanstack/react-query';

interface NodeTypeSpec {
  type: string;
  display_name: string;
  description: string;
  icon: string;
  color: string;
  category: string;
  inputs: InputSpec[];
  outputs: OutputSpec[];
}

interface InputSpec {
  name: string;
  display_name: string;
  data_type: string;
  ui_type: string;
  required: boolean;
  accepts_connection: boolean;
}

interface OutputSpec {
  name: string;
  display_name: string;
  data_type: string;
}

export function useNodeRegistry() {
  const { data: nodeTypes, isLoading, error } = useQuery({
    queryKey: ['nodeRegistry'],
    queryFn: async () => {
      const response = await fetch('/api/v1/workflow/node-types');
      if (!response.ok) throw new Error('Failed to fetch node registry');
      return response.json() as NodeTypeSpec[];
    },
  });

  const getNodeType = (type: string): NodeTypeSpec | undefined => {
    // Implementation: lookup node by type in registry
  };

  return { nodeTypes, isLoading, error, getNodeType };
}
```

### 2. **Data Types and Compatibility**
File: `apps/web/client/src/lib/workflow/dataTypes.ts`

Purpose: Define data type system and port compatibility matrix.

Stub:
```typescript
export type DataType = 
  | 'text' 
  | 'json' 
  | 'array' 
  | 'image' 
  | 'number' 
  | 'boolean' 
  | 'any';

export const dataTypeCompatibility: Record<DataType, DataType[]> = {
  // Define which target types accept each source type
};

export function isCompatibleConnection(
  sourceType: DataType,
  targetType: DataType
): boolean {
  // Check if sourceType → targetType is valid
}
```

### 3. **Color Map**
File: `apps/web/client/src/lib/workflow/colorMap.ts`

Purpose: Map data types and node colors to Tailwind classes (no dynamic interpolation).

Implementation:
```typescript
export const dataTypeColorMap: Record<
  string,
  { border: string; bg: string; text: string }
> = {
  text: { 
    border: 'border-blue-400', 
    bg: 'bg-blue-50', 
    text: 'text-blue-600' 
  },
  json: { 
    border: 'border-green-400', 
    bg: 'bg-green-50', 
    text: 'text-green-600' 
  },
  array: { 
    border: 'border-purple-400', 
    bg: 'bg-purple-50', 
    text: 'text-purple-600' 
  },
  image: { 
    border: 'border-pink-400', 
    bg: 'bg-pink-50', 
    text: 'text-pink-600' 
  },
  number: { 
    border: 'border-orange-400', 
    bg: 'bg-orange-50', 
    text: 'text-orange-600' 
  },
  boolean: { 
    border: 'border-cyan-400', 
    bg: 'bg-cyan-50', 
    text: 'text-cyan-600' 
  },
  any: { 
    border: 'border-gray-400', 
    bg: 'bg-gray-50', 
    text: 'text-gray-600' 
  },
};

export const nodeColorMap: Record<
  string,
  { border: string; bg: string }
> = {
  blue: { border: 'border-blue-500', bg: 'bg-blue-100' },
  green: { border: 'border-green-500', bg: 'bg-green-100' },
  // ... all colors from node definitions
};
```

### 4. **BaseNode Component**
File: `apps/web/client/src/components/workflow/nodes/BaseNode.tsx`

Purpose: Single ReactFlow component that renders all node types.

Stub:
```typescript
import React from 'react';
import { Handle, Position, Node } from 'reactflow';
import { useNodeRegistry } from '@/lib/workflow/useNodeRegistry';
import { dataTypeColorMap, nodeColorMap } from '@/lib/workflow/colorMap';

interface WorkflowNodeData {
  nodeType: string;
  label: string;
  config: Record<string, unknown>;
}

export function BaseNode({ data, selected }: { 
  data: WorkflowNodeData; 
  selected: boolean;
}) {
  const { getNodeType } = useNodeRegistry();
  const nodeType = getNodeType(data.nodeType);

  if (!nodeType) {
    return <div className="p-4 bg-red-100 border border-red-500">Unknown node type</div>;
  }

  // Render inputs on left side
  // Render outputs on right side
  // Color-code handles by data_type
  // Show config summary
  // Apply color from node definition

  return (
    <div className={`p-4 border-2 rounded-lg ${nodeColorMap[nodeType.color].bg}`}>
      <div className="font-bold">{data.label}</div>
      {/* Handles and content here */}
    </div>
  );
}
```

### 5. **isValidConnection Utility**
File: `apps/web/client/src/lib/workflow/isValidConnection.ts`

Purpose: Callback for ReactFlow's `isValidConnection` to enforce port type compatibility.

Stub:
```typescript
import { Connection } from 'reactflow';
import { useNodeRegistry } from '@/lib/workflow/useNodeRegistry';
import { isCompatibleConnection } from '@/lib/workflow/dataTypes';

export function useIsValidConnection() {
  const { nodeTypes } = useNodeRegistry();

  const isValidConnection = (connection: Connection): boolean => {
    if (!connection.sourceNode || !connection.targetNode) return false;
    
    // Look up node types
    const sourceNodeType = /* lookup from registry */;
    const targetNodeType = /* lookup from registry */;
    
    // Look up port definitions
    const sourceOutputSpec = sourceNodeType?.outputs.find(
      (o) => o.name === connection.sourceHandle
    );
    const targetInputSpec = targetNodeType?.inputs.find(
      (i) => i.name === connection.targetHandle
    );

    if (!sourceOutputSpec || !targetInputSpec) return false;

    // Check type compatibility
    return isCompatibleConnection(
      sourceOutputSpec.data_type,
      targetInputSpec.data_type
    );
  };

  return { isValidConnection };
}
```

## Directory Structure

```
apps/web/client/src/
├── lib/workflow/
│   ├── useNodeRegistry.ts              # TanStack Query hook for registry
│   ├── dataTypes.ts                    # Data type compatibility matrix
│   ├── colorMap.ts                     # Static Tailwind color map
│   ├── isValidConnection.ts            # ReactFlow connection validator
│   └── __tests__/
│       ├── useNodeRegistry.test.ts
│       ├── dataTypes.test.ts
│       └── isValidConnection.test.ts
└── components/workflow/
    └── nodes/
        ├── BaseNode.tsx                # Single ReactFlow node component
        └── __tests__/
            └── BaseNode.test.tsx
```

## Implementation Details

### useNodeRegistry Hook

The hook uses TanStack Query to fetch and cache the node registry:
- Querykey: `['nodeRegistry']`
- Endpoint: `GET /api/v1/workflow/node-types`
- Stale time: 5 minutes (or session-long, depending on policy)
- Provides: `nodeTypes` array, `isLoading`, `error`, and `getNodeType(type)` helper

The hook should handle loading and error states gracefully so components using it can show appropriate UI.

### BaseNode Component

The component must:
1. Accept a `data` prop with `nodeType`, `label`, and `config` fields
2. Look up the node definition from the registry using `data.nodeType`
3. Render left-side Handles for inputs with `accepts_connection: true`
4. Render right-side Handles for all outputs
5. Color-code each Handle by the port's `data_type` (use color map)
6. Render the node body with the label and a summary of configured values
7. Apply the node's registered `color` to the node background
8. Show selected state (e.g., blue border) when `selected === true`
9. Show a fallback message if the node type is not found in the registry

Handle positions:
- Input Handles: `Position.Left`, positioned vertically
- Output Handles: `Position.Right`, positioned vertically
- Handle ID should correspond to the input/output name

### Data Type Compatibility

The compatibility matrix allows:
- `text` → `text`, `any`
- `json` → `json`, `text`, `any`
- `array` → `array`, `json`, `any`
- `image` → `image`, `any`
- `number` → `number`, `text`, `any`
- `boolean` → `boolean`, `any`
- `any` → all types

### Color Map

All node colors and data type colors are pre-defined in static maps. **Never use dynamic Tailwind class interpolation** (e.g., `` `border-${color}-400` ``). This ensures Tailwind JIT purge sees all classes at build time.

## Edge Cases and Error Handling

1. **Registry fetch failure** — Show error message in component
2. **Node type not in registry** — Render error state (red border, "Unknown node type")
3. **Handles on nodes without inputs/outputs** — Still render but with empty array
4. **Invalid connections** — `isValidConnection` prevents them at the ReactFlow level

## Testing Strategy

### Unit Tests

Each file has corresponding tests:

1. **useNodeRegistry.test.ts** — Mock fetch, verify hook returns correct data and caching behavior
2. **dataTypes.test.ts** — Test compatibility matrix for all type combinations
3. **BaseNode.test.tsx** — Render component with mock node definition, verify handles, colors, labels

### Integration Considerations

- BaseNode will be used in the WorkflowEditor canvas with ReactFlow's `<Nodes>` component
- The `isValidConnection` utility is passed to ReactFlow's `isValidConnection` prop
- Tests should mock the `useNodeRegistry` hook to avoid API calls in unit tests

## Dependencies

### External Libraries
- `react` — UI framework
- `reactflow` — Graph visualization
- `@tanstack/react-query` — Server state management (for caching registry)
- Tailwind CSS — Styling (via color map)

### Internal Dependencies
- Backend `/api/v1/workflow/node-types` endpoint (from section-02-registry)

## Next Steps (Dependent Sections)

Once this section is complete:
- **section-11-dynamic-config** — Builds on BaseNode by adding the config panel component
- **section-12-execution-viz** — Adds execution status overlays to BaseNode
- **section-14-editor-refactor** — Integrates BaseNode into the WorkflowEditor canvas