# Section 09: Frontend Builder -- AgencyBuilder React Flow Canvas

## Implementation Status: COMPLETE

## Overview

This section implements the **AgencyBuilder** page, a visual graph editor for creating and editing multi-agent agencies. It uses React Flow v11 (`reactflow` package) to render an interactive canvas where users can add agent nodes, connect them with communication edges, and configure agent properties through a side panel.

The AgencyBuilder follows the same architectural pattern as the existing `WorkflowEditor.tsx`, which uses `ReactFlowProvider`, `useNodesState`/`useEdgesState`, custom node and edge types, and a right-side property panel.

## Dependencies

- **Section 08 (Frontend Chat):** Provides routing setup, `useAgencyStream` hook, and `useAgencyQuery` hook.
- **Section 06 (Node.js Integration):** Provides the `agency` tRPC router with CRUD mutations.
- **Section 02 (Database Schema):** Defines the agency-related tables.

## Files Created

| File | Purpose |
|------|---------|
| `apps/web/client/src/pages/AgencyBuilder.tsx` | Main page component with React Flow canvas |
| `apps/web/client/src/components/agency/AgentNode.tsx` | Custom React Flow node for agents |
| `apps/web/client/src/components/agency/CommunicationEdge.tsx` | Custom React Flow edge for communication flows |
| `apps/web/client/src/components/agency/AgentPropertyPanel.tsx` | Right-side panel for editing agent properties |
| `apps/web/client/src/components/agency/ToolPicker.tsx` | Modal/dropdown for selecting tools |
| `apps/web/client/src/components/agency/AgencyToolbar.tsx` | Top toolbar with save/publish/test actions |
| `apps/web/client/src/components/agency/__tests__/AgencyBuilder.test.tsx` | Tests for AgencyBuilder page (4 tests) |
| `apps/web/client/src/components/agency/__tests__/AgentNode.test.tsx` | Tests for AgentNode component (6 tests) |
| `apps/web/client/src/components/agency/__tests__/AgentPropertyPanel.test.tsx` | Tests for property panel (10 tests) |

## Files Modified

| File | Change |
|------|--------|
| `apps/web/client/src/App.tsx` | Added lazy import and route for `/agencies/:id/edit` (placed before `/agencies/:id` for wouter matching) |
| `apps/web/server/routers/agency.ts` | Added `saveBuilder` mutation for full graph persistence (deviation from plan -- needed for save functionality) |

## Tests (Write First)

All tests use Vitest with `@testing-library/react` in jsdom environment. React Flow components need to be mocked since they require a browser DOM with full layout capabilities.

### AgencyBuilder Page Tests

File: `/home/dev/projects/SmartSpecPro/apps/web/client/src/components/agency/__tests__/AgencyBuilder.test.tsx`

```typescript
/**
 * @vitest-environment jsdom
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

// Mock reactflow — React Flow requires a full browser DOM with layout,
// so we mock it to test component logic without canvas rendering.
vi.mock("reactflow", () => ({
  __esModule: true,
  default: ({ children, nodes, edges }: any) => (
    <div data-testid="react-flow-canvas" data-nodes={JSON.stringify(nodes)} data-edges={JSON.stringify(edges)}>
      {children}
    </div>
  ),
  ReactFlowProvider: ({ children }: any) => <div>{children}</div>,
  useNodesState: vi.fn(() => [[], vi.fn(), vi.fn()]),
  useEdgesState: vi.fn(() => [[], vi.fn(), vi.fn()]),
  Controls: () => <div data-testid="rf-controls" />,
  MiniMap: () => <div data-testid="rf-minimap" />,
  Background: () => <div data-testid="rf-background" />,
  BackgroundVariant: { Dots: "dots" },
  MarkerType: { ArrowClosed: "arrowclosed" },
  Handle: ({ type, position }: any) => <div data-testid={`handle-${type}-${position}`} />,
  Position: { Top: "top", Bottom: "bottom", Left: "left", Right: "right" },
  addEdge: vi.fn((connection, edges) => [...edges, { id: "e-new", ...connection }]),
}));

// Mock tRPC hooks (provided by section-06)
vi.mock("@/lib/trpc", () => ({
  trpc: {
    agency: {
      getById: { useQuery: vi.fn() },
      update: { useMutation: vi.fn() },
      create: { useMutation: vi.fn() },
    },
  },
}));

describe("AgencyBuilder", () => {
  it("renders React Flow canvas with initial empty state");
  it("adding agent node creates AgentNode component");
  it("connecting two nodes creates CommunicationEdge");
  it("selecting node opens AgentPropertyPanel");
  it("property panel updates agent name, model, instructions");
  it("save action persists agency config via tRPC mutation");
  it("publish action changes agency status to published");
});
```

The test file mocks `reactflow` since it requires a full browser layout engine. The key behavioral checks are:

1. **Empty state rendering:** When the page loads without an existing agency ID, the canvas should display an empty React Flow container with controls and minimap visible.
2. **Agent node creation:** When the user clicks "Add Agent" from the toolbar or drags from the palette, a new `AgentNode` should appear in the `nodes` state array.
3. **Edge creation:** When `onConnect` fires (user drags from one agent node handle to another), a new `CommunicationEdge` should be added to the `edges` state array.
4. **Node selection and property panel:** Clicking a node should set `selectedNodeId` and render the `AgentPropertyPanel`. The panel should display the selected agent's name, model, and instructions.
5. **Property editing:** Changing the agent name in the property panel should update the node's data in the `nodes` state.
6. **Save persistence:** Clicking save should call the `agency.update` tRPC mutation with the current nodes and edges serialized as the agency configuration.
7. **Publish action:** Clicking publish should call `agency.update` with `status: "published"`.

### AgentNode Component Tests

File: `/home/dev/projects/SmartSpecPro/apps/web/client/src/components/agency/__tests__/AgentNode.test.tsx`

```typescript
/**
 * @vitest-environment jsdom
 */

import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";

vi.mock("reactflow", () => ({
  Handle: ({ type, position }: any) => <div data-testid={`handle-${type}-${position}`} />,
  Position: { Top: "top", Bottom: "bottom", Left: "left", Right: "right" },
}));

describe("AgentNode", () => {
  it("renders agent name and model");
  it("shows entry point badge when isEntryPoint is true");
  it("shows optional badge when isOptional is true");
  it("displays tool count indicator");
  it("renders source and target handles for connections");
  it("highlights when selected");
});
```

### AgentPropertyPanel Tests

File: `/home/dev/projects/SmartSpecPro/apps/web/client/src/components/agency/__tests__/AgentPropertyPanel.test.tsx`

```typescript
/**
 * @vitest-environment jsdom
 */

import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

describe("AgentPropertyPanel", () => {
  it("displays selected agent name in editable field");
  it("displays model selector with current model");
  it("displays instructions textarea");
  it("calls onChange when name field changes");
  it("calls onChange when model is selected");
  it("calls onChange when instructions change");
  it("shows isEntryPoint toggle");
  it("shows isOptional toggle");
  it("shows tool list with remove buttons");
  it("opens ToolPicker when add tool button is clicked");
});
```

## Implementation Details

### 1. AgencyBuilder Page

File: `/home/dev/projects/SmartSpecPro/apps/web/client/src/pages/AgencyBuilder.tsx`

This is the main page component. It follows the same structure as the existing `WorkflowEditor.tsx`:

```typescript
/**
 * AgencyBuilder - Visual canvas for designing multi-agent agencies.
 *
 * Uses React Flow to render agents as nodes and communication flows as edges.
 * Supports drag-and-drop agent creation, edge connections, auto-layout,
 * and property editing via a side panel.
 */

import { useState, useCallback, useRef, useMemo, useEffect } from "react";
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
  type ReactFlowInstance,
} from "reactflow";
import "reactflow/dist/style.css";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import { AgentNode, type AgentNodeData } from "@/components/agency/AgentNode";
import { CommunicationEdge } from "@/components/agency/CommunicationEdge";
import { AgentPropertyPanel } from "@/components/agency/AgentPropertyPanel";
import { AgencyToolbar } from "@/components/agency/AgencyToolbar";
```

**Key design decisions mirroring WorkflowEditor:**

- The default export wraps the inner `AgencyCanvas` component in `<ReactFlowProvider>` (same pattern as `WorkflowEditor` at line 2323-2328 of the existing file).
- State is managed with `useNodesState<AgentNodeData>` and `useEdgesState` from `reactflow`.
- Custom node and edge types are registered via the `nodeTypes` and `edgeTypes` maps passed to `<ReactFlow>`.
- A `selectedNodeId` state controls whether the right-side `AgentPropertyPanel` renders.

**Canvas state shape:**

```typescript
interface AgentNodeData {
  name: string;
  description: string;
  instructions: string;
  model: string;
  modelSettings: { max_tokens?: number; temperature?: number; top_p?: number };
  isEntryPoint: boolean;
  isOptional: boolean;
  tools: Array<{ toolId: string; toolName: string }>;
}

// Nodes: Node<AgentNodeData>[]
// Edges: Edge[] with data: { flowType: "delegation" | "handoff" }
```

**Node type registration:**

```typescript
const nodeTypes: NodeTypes = useMemo(() => ({
  agent: AgentNode,
}), []);

const edgeTypes = useMemo(() => ({
  communication: CommunicationEdge,
}), []);
```

**Loading existing agency for edit:**

When the route is `/agencies/:id/edit`, the component fetches the agency via `trpc.agency.getById.useQuery({ id })` and hydrates the nodes and edges state from the agency's agent and communication flow data. The agency config stored in the database maps directly:
- Each `agency_agents` row becomes a `Node<AgentNodeData>` with `position` from the agent's `position` JSON column.
- Each `agency_communication_flows` row becomes an `Edge` connecting `fromAgentId` to `toAgentId`.

**Save handler:**

The save action serializes the current `nodes` and `edges` back into the agency schema format and calls `trpc.agency.update.mutate()`. The serialization maps:
- `Node.id` to agent IDs
- `Node.data` to agent properties
- `Node.position` to the position JSON column
- `Edge.source`/`Edge.target` to communication flow `fromAgentId`/`toAgentId`
- `Edge.data.flowType` to the flow type

**Publish handler:**

Publish validates the agency (at least one entry point agent, at least one edge, all agents have models and instructions) and then calls `trpc.agency.update.mutate({ id, status: "published" })`.

**Auto-layout:**

The auto-layout feature uses the `dagre` library (already transitively available via `dagre-d3-es` in the lockfile). When triggered from the toolbar, it computes a top-to-bottom directed layout of the agent nodes and updates their positions.

```typescript
function autoLayout(nodes: Node[], edges: Edge[]): Node[] {
  // Create dagre graph, set nodes and edges, run layout
  // Return nodes with updated positions
}
```

**Adding agents:**

New agents are added either:
1. From a toolbar "Add Agent" button (creates node at a default position)
2. By dragging from a palette panel (uses `onDrop` handler, same pattern as WorkflowEditor at line 1830)

Each new agent gets a UUID, a default name ("Agent N"), and `isEntryPoint: false` by default. The first agent added is automatically set as the entry point.

### 2. AgentNode Component

File: `/home/dev/projects/SmartSpecPro/apps/web/client/src/components/agency/AgentNode.tsx`

Custom React Flow node component. Renders a card-style node showing:
- Agent name (bold, top)
- Model name (smaller, below name)
- Tool count badge
- Entry point badge (green) or optional badge (yellow) when applicable
- Source handle (bottom) and target handle (top) for edge connections
- Selected highlight ring

```typescript
/**
 * AgentNode - Custom React Flow node for rendering an agent in the builder canvas.
 *
 * Displays agent metadata (name, model, tools, flags) and provides
 * connection handles for creating communication edges.
 */

import { memo } from "react";
import { Handle, Position } from "reactflow";
import type { NodeProps } from "reactflow";
import { Badge } from "@/components/ui/badge";
import { Users, Wrench } from "lucide-react";

export interface AgentNodeData {
  name: string;
  description: string;
  instructions: string;
  model: string;
  modelSettings: { max_tokens?: number; temperature?: number; top_p?: number };
  isEntryPoint: boolean;
  isOptional: boolean;
  tools: Array<{ toolId: string; toolName: string }>;
}

export const AgentNode = memo(function AgentNode({ data, selected }: NodeProps<AgentNodeData>) {
  // Render card with handles, badges, and agent info
});
```

The node renders a `Handle` at `Position.Top` (target) and `Position.Bottom` (source) so edges connect top-to-bottom in the default layout direction. The visual style follows the existing `BaseNode` pattern from the workflow editor, using Tailwind utility classes for styling and a colored left border to indicate agent role.

### 3. CommunicationEdge Component

File: `/home/dev/projects/SmartSpecPro/apps/web/client/src/components/agency/CommunicationEdge.tsx`

Custom React Flow edge component. Renders a smooth step path with:
- A direction arrow (via `MarkerType.ArrowClosed`)
- A label showing the flow type ("delegation" or "handoff")
- A color that distinguishes delegation (blue) from handoff (purple)

```typescript
/**
 * CommunicationEdge - Custom React Flow edge for agent communication flows.
 *
 * Displays flow type label and directional arrow.
 */

import { memo } from "react";
import { getBezierPath, EdgeLabelRenderer } from "reactflow";
import type { EdgeProps } from "reactflow";

export interface CommunicationEdgeData {
  flowType: "delegation" | "handoff";
}

export const CommunicationEdge = memo(function CommunicationEdge(props: EdgeProps<CommunicationEdgeData>) {
  // Render bezier path with label overlay
});
```

When the user creates a new edge by dragging between handles, the `onConnect` handler in `AgencyBuilder` fires and creates an edge with `type: "communication"` and `data: { flowType: "delegation" }` by default. The flow type can be changed by clicking on the edge label to toggle between delegation and handoff.

### 4. AgentPropertyPanel Component

File: `/home/dev/projects/SmartSpecPro/apps/web/client/src/components/agency/AgentPropertyPanel.tsx`

Right-side panel that appears when a node is selected. Contains form controls for editing the selected agent. This follows the same pattern as the right sidebar in WorkflowEditor (line 1872+ of the existing file).

```typescript
/**
 * AgentPropertyPanel - Side panel for editing selected agent properties.
 *
 * Displays editable fields for name, description, instructions, model,
 * model settings, flags (entry point, optional), and tools.
 */

import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { ToolPicker } from "./ToolPicker";

interface AgentPropertyPanelProps {
  agent: AgentNodeData;
  onChange: (updates: Partial<AgentNodeData>) => void;
  onClose: () => void;
  onDelete: () => void;
}
```

**Fields:**
- **Name** (Input): Agent display name
- **Description** (Textarea): Short description
- **Instructions** (Textarea, larger): Agent system prompt / instructions
- **Model** (Select/Combobox): LLM model selection. Uses the existing model list from `trpc.llmProviders.listModels` or equivalent
- **Model Settings** (collapsible section): max_tokens (number input), temperature (slider 0-2), top_p (slider 0-1)
- **Entry Point** (Switch): Toggle. Only one agent can be entry point per agency -- toggling this on disables it for all other agents
- **Optional** (Switch): Toggle for marking agent as optional (can be skipped on failure)
- **Tools** (list + add button): Shows assigned tools with remove buttons. "Add Tool" button opens the `ToolPicker`
- **Delete Agent** (destructive button at bottom)

When `onChange` fires, the `AgencyBuilder` page updates the corresponding node's `data` in the `nodes` state.

### 5. ToolPicker Component

File: `/home/dev/projects/SmartSpecPro/apps/web/client/src/components/agency/ToolPicker.tsx`

Modal or popover for selecting tools from the tenant's available tools. Fetches tools via `trpc.agency.listTools` (or whatever the tRPC procedure name ends up being from section-06).

```typescript
/**
 * ToolPicker - Modal for selecting tools to assign to an agent.
 *
 * Displays available tools grouped by type (builtin, skill, sandbox, custom)
 * with risk level indicators. Supports search filtering.
 */

interface ToolPickerProps {
  open: boolean;
  onClose: () => void;
  onSelect: (tool: { toolId: string; toolName: string }) => void;
  excludeToolIds: string[]; // Tools already assigned to this agent
}
```

Tools are displayed in a grid or list, grouped by `toolType` (builtin, skill, sandbox, custom). Each tool card shows:
- Tool name
- Description (truncated)
- Risk level badge (green for low, yellow for medium, red for high)
- "Requires approval" indicator when applicable

### 6. AgencyToolbar Component

File: `/home/dev/projects/SmartSpecPro/apps/web/client/src/components/agency/AgencyToolbar.tsx`

Top toolbar for the builder page. Contains action buttons and agency metadata.

```typescript
/**
 * AgencyToolbar - Top action bar for the AgencyBuilder.
 *
 * Contains save, publish, test, auto-layout, and back navigation actions.
 */

interface AgencyToolbarProps {
  agencyName: string;
  agencyStatus: "draft" | "published" | "archived";
  isSaving: boolean;
  onSave: () => void;
  onPublish: () => void;
  onAutoLayout: () => void;
  onTest: () => void;
  onBack: () => void;
}
```

**Buttons:**
- Back arrow (navigates to `/agencies`)
- Agency name (editable inline)
- Status badge (draft/published/archived)
- Auto-layout button (runs dagre layout)
- Save button (calls save handler, shows spinner while saving)
- Publish button (validates then publishes)
- Test button (opens agency chat in a side panel or navigates to `/agencies/:id`)

### 7. Route Registration

File to modify: `/home/dev/projects/SmartSpecPro/apps/web/client/src/App.tsx`

Add the lazy import alongside existing lazy imports (around line 78, after other page imports):

```typescript
const AgencyBuilder = lazy(() => import("./pages/AgencyBuilder"));
```

Add the route in the `<Switch>` block alongside existing routes:

```typescript
<Route path="/agencies/:id/edit" component={AgencyBuilder} />
```

Note: The `/agencies` and `/agencies/:id` routes are added by section-08 (Frontend Chat). This section only adds the `/agencies/:id/edit` route for the builder.

## Validation Checklist

After implementation, verify:

1. Navigate to `/agencies/:id/edit` -- the React Flow canvas renders with controls and minimap
2. Click "Add Agent" -- a new agent node appears on the canvas
3. Drag from one node's bottom handle to another node's top handle -- a communication edge appears with a "delegation" label
4. Click a node -- the `AgentPropertyPanel` opens on the right showing the agent's properties
5. Edit the agent name in the property panel -- the node label updates on the canvas
6. Click Save -- the agency config is persisted via tRPC (verify network request in devtools)
7. Click Publish -- the agency status changes to "published" (verify the status badge updates)
8. Auto-layout button rearranges nodes in a top-to-bottom directed graph
9. Canvas supports zoom, pan, and minimap navigation
10. AgencyBuilder canvas renders at 30+ FPS with 10 agent nodes

## Architectural Notes

**React Flow version:** The project root `package.json` has both `reactflow` v11.11.4 and `@xyflow/react` v12.10.0 installed. The existing `WorkflowEditor.tsx` uses the `reactflow` (v11) import path. The AgencyBuilder should use the same `reactflow` v11 import path for consistency, unless the team decides to migrate both to `@xyflow/react` v12 simultaneously.

**State management:** Canvas state (nodes, edges) is local to the component via `useNodesState`/`useEdgesState`. There is no global store. This matches the WorkflowEditor pattern. Persistence is on-demand (save button), not auto-save.

**Entry point enforcement:** Only one agent can be the entry point. When the user toggles `isEntryPoint` on for an agent, the builder must automatically toggle it off for any other agent that was previously the entry point. This logic lives in the `AgencyBuilder` page's `handleNodeDataChange` function.

**Undo/redo:** React Flow v11 does not provide built-in undo/redo. If undo/redo is needed, it would require a custom history stack (deferred -- not in scope for this section).

**Performance:** The target is 30+ FPS with 10 agents. React Flow handles this well with node memoization (`memo()` on `AgentNode` and `CommunicationEdge`). The `nodeTypes` and `edgeTypes` objects must be memoized with `useMemo` to prevent unnecessary re-renders.