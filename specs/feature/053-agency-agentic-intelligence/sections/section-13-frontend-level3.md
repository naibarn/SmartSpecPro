# Section 13: Frontend Level 3 -- Autonomous Agent UI Components

## Section ID
`section-13-frontend-level3`

## Dependencies
- **section-10-autonomous-executor** -- Defines the autonomous executor backend (planner, executor, reflector) and the `autonomous_agent` node type that this section provides UI for. SSE event types (`autonomous_plan_created`, `autonomous_subtask_complete`, `autonomous_reflection`) are consumed here.
- **section-12-long-term-memory** -- Defines the tRPC memory CRUD procedures (`listAgentMemories`, `deleteAgentMemory`, `resetAgentMemories`) that the `MemoryViewer` component calls.
- **section-03-frontend-level1** -- Establishes the UI pattern for Intelligence config (nodeConfig read/write via `ncGet`/`ncSet`, collapsible sections, Zod validation in `superRefine`). This section follows the same patterns.
- **section-09-db-migration** -- Creates the `agency_agent_memories` Drizzle table that tRPC memory procedures query.

## Overview

This section adds four frontend components for Level 3 Autonomous Agent functionality:

1. **AutonomousAgentNode.tsx** -- A new ReactFlow node card for the `autonomous_agent` node type with distinctive purple styling.
2. **AutonomousConfigPanel.tsx** -- A full configuration panel for autonomous node settings (plan depth, iterations, delegation, quality threshold, etc.).
3. **ExecutionTimeline.tsx** -- A real-time execution view showing the autonomous agent's plan, sub-task progress, and reflections via SSE events.
4. **MemoryViewer.tsx** -- An admin panel for viewing, filtering, and managing long-term agent memories via tRPC CRUD.

Additionally, this section registers the `autonomous_agent` node type in the frontend dispatcher (`BaseAgencyNode.tsx`), the types file, the Zod validation schema in `agency.ts`, and the `NodePropertyPanel.tsx` dispatcher.

---

## Files to Create

### 1. `apps/web/client/src/components/agency/nodes/AutonomousAgentNode.tsx`

**Purpose:** ReactFlow node card for `autonomous_agent` type. Visually distinct from standard agent nodes.

**Design:**
- Purple gradient border (`border-purple-300`, selected: `ring-purple-500`)
- `BrainCircuit` icon from lucide-react (or fallback to `Brain` + `Cpu`)
- Shows: name, model, delegation mode badge, tool count
- Entry point indicator (green left border, same pattern as `AgentNodeCard`)
- Validation error dot (red `AlertCircle` icon)

**Props:** Same `NodeProps<AgencyNodeData>` pattern as all other node cards.

**Structure (stub):**
```typescript
import { memo } from "react";
import { Handle, Position } from "reactflow";
import type { NodeProps } from "reactflow";
import { Badge } from "@/components/ui/badge";
import { BrainCircuit, Wrench, AlertCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import type { AgencyNodeData } from "./types";

export const AutonomousAgentNode = memo(function AutonomousAgentNode({
  data,
  selected,
}: NodeProps<AgencyNodeData>) {
  // Read nodeConfig fields for display
  // Render card with purple border, BrainCircuit icon, delegation mode badge
  // Handle + source/target positions identical to AgentNodeCard
});
```

**Key display elements:**
- Delegation mode as a small badge: `"self"` | `"delegate"` | `"auto"` (read from `nodeConfig.delegationMode`)
- Memory enabled indicator: small `Database` icon when `nodeConfig.enableLongTermMemory` is true

---

### 2. `apps/web/client/src/components/agency/AutonomousConfigPanel.tsx`

**Purpose:** Configuration panel rendered inside `NodePropertyPanel` when the selected node has `nodeType === "autonomous_agent"`.

**Props interface:**
```typescript
interface AutonomousConfigPanelProps {
  node: AgencyNodeData;
  onChange: (updates: Partial<AgencyNodeData>) => void;
}
```

**Configuration fields (all stored in `nodeConfig`):**

| Field | UI Control | Range | Default |
|-------|-----------|-------|---------|
| `maxPlanDepth` | Slider | 1-5 | 3 |
| `maxTotalIterations` | Slider | 1-50 | 20 |
| `delegationMode` | Select dropdown | `self_only`, `delegate_to_agents`, `auto` | `auto` |
| `reflectAfterSteps` | Slider | 1-10 | 3 |
| `enableLongTermMemory` | Switch toggle | boolean | false |
| `decompositionStrategy` | Select dropdown | `sequential`, `parallel`, `adaptive` | `adaptive` |
| `qualityThreshold` | Slider (step 0.05) | 0-1 | 0.8 |
| `budgetAllocation` | Select dropdown | `equal`, `proportional`, `dynamic` | `dynamic` |

**Layout guidance:**
- Group related fields: "Planning" (maxPlanDepth, decompositionStrategy, maxTotalIterations), "Execution" (delegationMode, reflectAfterSteps, budgetAllocation), "Memory" (enableLongTermMemory), "Quality" (qualityThreshold)
- Use the same Label/Select/Switch component imports as `NodePropertyPanel`
- Include a cost estimate label: "Autonomous agents may use 10-20x more credits per run" (amber warning box, same style as section-03's cost warning)
- Read/write via `ncGet`/`ncSet` pattern (or direct `nodeConfig` spread)

**State management:**
```typescript
const ncGet = (key: string, fallback: unknown) =>
  (node.nodeConfig as Record<string, unknown>)?.[key] ?? fallback;

const ncSet = (key: string, value: unknown) => ({
  nodeConfig: { ...(node.nodeConfig ?? {}), [key]: value },
});
```

---

### 3. `apps/web/client/src/components/agency/ExecutionTimeline.tsx`

**Purpose:** Real-time execution visualization for autonomous agent runs. Displays the plan, sub-task progress, and reflections as they happen via SSE events.

**Props interface:**
```typescript
interface ExecutionTimelineProps {
  agencyId: string;
  runId: string;
  /** SSE event stream URL or use existing agency chat SSE hook */
  events?: Array<{
    type: string;
    data: Record<string, unknown>;
    timestamp: string;
  }>;
}
```

**Sections to display:**

1. **Plan Overview** -- Rendered when `autonomous_plan_created` event arrives. Shows sub-task count, plan version. Expandable to show individual sub-tasks with dependencies.

2. **Sub-task Progress** -- Each `autonomous_subtask_complete` event adds a row:
   - Sub-task ID / description
   - Status badge: `complete` (green), `failed` (red), `in_progress` (blue spinner)
   - Tokens used for this sub-task
   - Expandable reasoning trace (if `showReasoning` enabled)

3. **Reflection Summary** -- Rendered when `autonomous_reflection` event arrives:
   - Quality score as a progress bar (0-1, color-coded: red < 0.5, amber 0.5-0.8, green >= 0.8)
   - `isComplete` indicator
   - `replanRequired` flag (if true, show "Re-planning..." indicator)

4. **Token Usage Meter** -- Running total of tokens used, with budget percentage if budget is set

**UI components to use:**
- `ScrollArea` for the timeline container
- `Badge` for status indicators
- `Progress` from `@/components/ui/progress` (or simple div with percentage width) for quality score
- Lucide icons: `CheckCircle2`, `XCircle`, `Loader2`, `BrainCircuit`, `BarChart3`

**Data flow:** The component receives events from the parent (likely the agency chat view that already has SSE connectivity). It does NOT establish its own SSE connection. Events are filtered by `type` prefix `autonomous_*`.

---

### 4. `apps/web/client/src/components/agency/MemoryViewer.tsx`

**Purpose:** Admin panel for viewing and managing agent long-term memories. Uses tRPC procedures from section-12.

**Props interface:**
```typescript
interface MemoryViewerProps {
  agencyId: string;
  agentNodeId: string;
  /** Current user ID for permission checks */
  userId: number;
  /** Whether user is domain_admin (can delete others' memories) */
  isAdmin?: boolean;
}
```

**tRPC hooks used:**
```typescript
const memoriesQuery = trpc.agency.listAgentMemories.useQuery({
  agencyId,
  agentNodeId,
  memoryType: selectedType, // optional filter
  page: currentPage,
  limit: 20,
});

const deleteMutation = trpc.agency.deleteAgentMemory.useMutation();
const resetMutation = trpc.agency.resetAgentMemories.useMutation();
```

**UI elements:**

1. **Filter bar** -- Memory type filter dropdown: All | Constraint | Preference | Fact | Skill

2. **Memory list** -- Each memory row shows:
   - Type badge (color-coded: constraint=red, preference=blue, fact=green, skill=purple)
   - Content text (truncated, expandable)
   - Confidence bar (0-1 visual indicator)
   - Use count
   - Last used date
   - Delete button (trash icon, shown for own memories or if admin)

3. **Sort controls** -- Sort by: confidence (desc), use_count (desc), created_at (desc)

4. **Reset button** -- "Reset All Memories" button with confirmation dialog. Calls `resetAgentMemories`. Only shown for own memories or admin.

5. **Empty state** -- "No memories recorded yet" with `Database` icon when list is empty

**Confirmation dialog pattern:**
```typescript
// Use existing AlertDialog from @/components/ui/alert-dialog
// "Are you sure you want to reset all memories for this agent? This action cannot be undone."
```

---

## Files to Modify

### 5. `apps/web/client/src/components/agency/nodes/types.ts`

**Change:** Add `"autonomous_agent"` to the `AgencyNodeType` union.

```typescript
export type AgencyNodeType =
  | "agent"
  | "supervisor"
  | "router"
  | "aggregator"
  | "knowledge_base"
  | "skill_call"
  | "human_approval"
  | "browser_session"
  | "autonomous_agent";  // <-- add this
```

---

### 6. `apps/web/client/src/components/agency/nodes/BaseAgencyNode.tsx`

**Change:** Import `AutonomousAgentNode` and add a case to the switch.

```typescript
import { AutonomousAgentNode } from "./AutonomousAgentNode";

// Inside the switch statement:
case "autonomous_agent":
  return <AutonomousAgentNode {...props} />;
```

Place this case before the `default` clause.

---

### 7. `apps/web/client/src/components/agency/NodePropertyPanel.tsx`

**Change:** Add a dispatch case for `autonomous_agent` that renders `AutonomousConfigPanel` instead of the `AgentSupervisorForm`. The autonomous agent config panel includes its own model picker, instructions area, and tools section (same as agent/supervisor) plus the autonomous-specific fields.

At the top-level dispatch (where `nodeType` determines which form to render), add:

```typescript
case "autonomous_agent":
  return <AutonomousConfigPanel node={node} onChange={onChange} />;
```

Alternatively, render `AutonomousConfigPanel` as an additional section within a shared agent form, depending on the existing panel architecture. The autonomous node needs the same base fields (name, description, instructions, model, tools) plus the autonomous-specific config.

**Recommended approach:** Render the standard agent/supervisor form fields (name, description, instructions, model, tools) followed by the `AutonomousConfigPanel` component for the autonomous-specific config fields. This avoids duplicating the base form.

Import:
```typescript
import { AutonomousConfigPanel } from "./AutonomousConfigPanel";
```

---

### 8. `apps/web/server/routers/agency.ts`

**Change 1:** Add `"autonomous_agent"` to the `nodeType` Zod enum in the `saveBuilder` procedure.

```typescript
nodeType: z.enum([
  "agent", "supervisor", "router", "aggregator",
  "knowledge_base", "skill_call", "human_approval", "browser_session",
  "autonomous_agent",  // <-- add this
]).default("agent"),
```

**Change 2:** Add Zod validation for autonomous nodeConfig fields inside the existing `superRefine` block:

```typescript
if (data.nodeType === "autonomous_agent") {
  // Require model and instructions (same as agent/supervisor)
  if (!data.model) ctx.addIssue({ code: "custom", path: ["model"], message: "model is required for autonomous_agent" });
  if (!data.instructions) ctx.addIssue({ code: "custom", path: ["instructions"], message: "instructions are required for autonomous_agent" });

  const nc = data.nodeConfig as Record<string, unknown> | undefined;

  const maxPlanDepth = nc?.maxPlanDepth;
  if (maxPlanDepth !== undefined) {
    const n = Number(maxPlanDepth);
    if (!Number.isInteger(n) || n < 1 || n > 5) {
      ctx.addIssue({ code: "custom", path: ["nodeConfig", "maxPlanDepth"], message: "maxPlanDepth must be 1-5" });
    }
  }

  const maxTotalIterations = nc?.maxTotalIterations;
  if (maxTotalIterations !== undefined) {
    const n = Number(maxTotalIterations);
    if (!Number.isInteger(n) || n < 1 || n > 50) {
      ctx.addIssue({ code: "custom", path: ["nodeConfig", "maxTotalIterations"], message: "maxTotalIterations must be 1-50" });
    }
  }

  const delegationMode = nc?.delegationMode;
  if (delegationMode !== undefined && !["self_only", "delegate_to_agents", "auto"].includes(String(delegationMode))) {
    ctx.addIssue({ code: "custom", path: ["nodeConfig", "delegationMode"], message: "delegationMode must be 'self_only', 'delegate_to_agents', or 'auto'" });
  }

  const reflectAfterSteps = nc?.reflectAfterSteps;
  if (reflectAfterSteps !== undefined) {
    const n = Number(reflectAfterSteps);
    if (!Number.isInteger(n) || n < 1 || n > 10) {
      ctx.addIssue({ code: "custom", path: ["nodeConfig", "reflectAfterSteps"], message: "reflectAfterSteps must be 1-10" });
    }
  }

  const qualityThreshold = nc?.qualityThreshold;
  if (qualityThreshold !== undefined) {
    const n = Number(qualityThreshold);
    if (isNaN(n) || n < 0 || n > 1) {
      ctx.addIssue({ code: "custom", path: ["nodeConfig", "qualityThreshold"], message: "qualityThreshold must be 0-1" });
    }
  }

  const decompositionStrategy = nc?.decompositionStrategy;
  if (decompositionStrategy !== undefined && !["sequential", "parallel", "adaptive"].includes(String(decompositionStrategy))) {
    ctx.addIssue({ code: "custom", path: ["nodeConfig", "decompositionStrategy"], message: "decompositionStrategy must be 'sequential', 'parallel', or 'adaptive'" });
  }

  const budgetAllocation = nc?.budgetAllocation;
  if (budgetAllocation !== undefined && !["equal", "proportional", "dynamic"].includes(String(budgetAllocation))) {
    ctx.addIssue({ code: "custom", path: ["nodeConfig", "budgetAllocation"], message: "budgetAllocation must be 'equal', 'proportional', or 'dynamic'" });
  }

  const enableLongTermMemory = nc?.enableLongTermMemory;
  if (enableLongTermMemory !== undefined && typeof enableLongTermMemory !== "boolean") {
    ctx.addIssue({ code: "custom", path: ["nodeConfig", "enableLongTermMemory"], message: "enableLongTermMemory must be a boolean" });
  }
}
```

**Change 3:** Allow `autonomous_agent` as a valid entry point. Modify the existing entry point check:

```typescript
// Change from:
if (data.isEntryPoint && !["agent", "supervisor"].includes(data.nodeType)) {
// To:
if (data.isEntryPoint && !["agent", "supervisor", "autonomous_agent"].includes(data.nodeType)) {
```

---

## Files to Create (Tests)

### 9. `apps/web/client/src/components/agency/__tests__/AutonomousConfigPanel.test.tsx`

**Test setup:** Follow the same pattern as `AgenticConfig.test.tsx` (section-03). Use jsdom environment, mock trpc, ToolPicker, ModelPicker, GuardrailsPanel.

**Required test cases:**

```typescript
test('renders all autonomous config fields')
```
- Render with `nodeType: "autonomous_agent"`, open the autonomous config section
- Assert presence of: maxPlanDepth slider, maxTotalIterations slider, delegationMode dropdown, reflectAfterSteps slider, qualityThreshold slider, decompositionStrategy dropdown, budgetAllocation dropdown, enableLongTermMemory switch

```typescript
test('maxPlanDepth slider range is 1-5')
```
- Find the maxPlanDepth range input and assert `min="1"` and `max="5"`

```typescript
test('maxTotalIterations slider range is 1-50')
```
- Find the range input and assert `min="1"` and `max="50"`

```typescript
test('delegation mode dropdown has 3 options')
```
- Open the delegationMode select, assert 3 items: "Self Only", "Delegate to Agents", "Auto"

```typescript
test('quality threshold slider range is 0-1')
```
- Find the range input and assert `min="0"`, `max="1"`, `step="0.05"`

```typescript
test('shows cost estimate label')
```
- Assert text containing "10-20x more credits" is visible

**Mocking setup:**
```typescript
vi.mock("@/lib/trpc", () => ({
  trpc: {
    library: {
      listDocuments: { useQuery: () => ({ data: null, isLoading: false }) },
      search: { useQuery: () => ({ data: null, isLoading: false }) },
    },
  },
}));
vi.mock("../ToolPicker", () => ({ ToolPicker: () => null }));
vi.mock("../ModelPicker", () => ({ ModelPicker: () => null }));
vi.mock("../guardrails/GuardrailsPanel", () => ({ GuardrailsPanel: () => null }));
```

---

### 10. `apps/web/client/src/components/agency/__tests__/MemoryViewer.test.tsx`

**Test setup:** jsdom environment, mock trpc with agency.listAgentMemories, deleteAgentMemory, resetAgentMemories.

**Required test cases:**

```typescript
test('renders memory list with type badges')
```
- Mock `listAgentMemories` to return sample data with different memory types
- Assert each memory's type badge is rendered with correct text

```typescript
test('filters by memory type')
```
- Render with mock data containing multiple types
- Select "Constraint" filter
- Assert query is refetched with `memoryType: "constraint"`

```typescript
test('delete button calls deleteAgentMemory mutation')
```
- Click delete button on a memory row
- Assert `deleteAgentMemory.mutate` was called with the memory's `id`

```typescript
test('reset button calls resetAgentMemories mutation')
```
- Click "Reset All" button, confirm in dialog
- Assert `resetAgentMemories.mutate` was called with `{ agencyId, agentNodeId }`

```typescript
test('shows confirmation dialog before reset')
```
- Click "Reset All" button
- Assert confirmation dialog text is visible before mutation fires

```typescript
test('empty state shows "No memories" message')
```
- Mock `listAgentMemories` to return empty array
- Assert "No memories" text is visible

**Mocking setup:**
```typescript
const mockMutate = vi.fn();
vi.mock("@/lib/trpc", () => ({
  trpc: {
    agency: {
      listAgentMemories: {
        useQuery: vi.fn(() => ({
          data: { items: [], total: 0 },
          isLoading: false,
        })),
      },
      deleteAgentMemory: {
        useMutation: () => ({ mutate: mockMutate, isPending: false }),
      },
      resetAgentMemories: {
        useMutation: () => ({ mutate: mockMutate, isPending: false }),
      },
    },
  },
}));
```

---

## Implementation Guidance

### Node Type Registration Checklist

When adding `autonomous_agent` as a new node type, these files must all be updated in this section:

1. `/home/dev/projects/SmartSpecPro/apps/web/client/src/components/agency/nodes/types.ts` -- Add to `AgencyNodeType` union
2. `/home/dev/projects/SmartSpecPro/apps/web/client/src/components/agency/nodes/BaseAgencyNode.tsx` -- Add switch case + import
3. `/home/dev/projects/SmartSpecPro/apps/web/client/src/components/agency/NodePropertyPanel.tsx` -- Add dispatch for config panel
4. `/home/dev/projects/SmartSpecPro/apps/web/server/routers/agency.ts` -- Add to `nodeType` Zod enum + validation + entry point check

The backend registration of `autonomous_agent` in the Python orchestrator and Drizzle schema is handled by section-10 (autonomous executor) and section-09 (DB migration) respectively.

### Agency Builder Node Palette

The `AgencyBuilder` component (or its sidebar `AgencySidebar.tsx`) must also include the new node type in its palette so users can drag it onto the canvas. Check the sidebar component for the node type list and add an entry for `autonomous_agent` with:
- Label: "Autonomous Agent"
- Icon: `BrainCircuit`
- Color: purple
- Description: "AI agent that plans, delegates, and self-evaluates"

File to check: `/home/dev/projects/SmartSpecPro/apps/web/client/src/components/agency/AgencySidebar.tsx`

### SSE Event Consumption Pattern

The `ExecutionTimeline` component does NOT establish its own SSE connection. It receives events from the parent component (the agency chat view) which already has SSE connectivity via the existing agency run streaming infrastructure. Events are passed as props or through a shared context/store.

The relevant SSE event types to handle:
- `autonomous_plan_created` -- `{ planVersion: number, subtaskCount: number }`
- `autonomous_subtask_complete` -- `{ subtaskId: string, status: string, tokensUsed: number }`
- `autonomous_reflection` -- `{ qualityScore: number, isComplete: boolean, replanRequired: boolean }`

### Memory Viewer Integration Point

The `MemoryViewer` is intended to be rendered:
1. Inside the `NodePropertyPanel` when viewing an `autonomous_agent` node with `enableLongTermMemory: true` -- as a collapsible section at the bottom
2. As a standalone admin view accessible from the agency detail page

For the panel integration, add a collapsible "Memories" section in the `AutonomousConfigPanel` that renders `MemoryViewer` when `enableLongTermMemory` is true.

### Consistency with Section-03 Patterns

- Use `ncGet(node, key, defaultValue)` / `ncSet(node, key, value)` for all nodeConfig field access (same pattern as section-03's Intelligence UI)
- Use the same amber warning box style for cost warnings
- Follow the same collapsible section pattern with chevron toggle icons
- Slider labels should display current value next to the slider (e.g., "Max Plan Depth: 3")

### Key File Paths (Absolute)

- `/home/dev/projects/SmartSpecPro/apps/web/client/src/components/agency/nodes/AutonomousAgentNode.tsx` -- create
- `/home/dev/projects/SmartSpecPro/apps/web/client/src/components/agency/AutonomousConfigPanel.tsx` -- create
- `/home/dev/projects/SmartSpecPro/apps/web/client/src/components/agency/ExecutionTimeline.tsx` -- create
- `/home/dev/projects/SmartSpecPro/apps/web/client/src/components/agency/MemoryViewer.tsx` -- create
- `/home/dev/projects/SmartSpecPro/apps/web/client/src/components/agency/__tests__/AutonomousConfigPanel.test.tsx` -- create
- `/home/dev/projects/SmartSpecPro/apps/web/client/src/components/agency/__tests__/MemoryViewer.test.tsx` -- create
- `/home/dev/projects/SmartSpecPro/apps/web/client/src/components/agency/nodes/types.ts` -- modify (add type)
- `/home/dev/projects/SmartSpecPro/apps/web/client/src/components/agency/nodes/BaseAgencyNode.tsx` -- modify (add case)
- `/home/dev/projects/SmartSpecPro/apps/web/client/src/components/agency/NodePropertyPanel.tsx` -- modify (add dispatch)
- `/home/dev/projects/SmartSpecPro/apps/web/server/routers/agency.ts` -- modify (Zod enum + validation)
- `/home/dev/projects/SmartSpecPro/apps/web/client/src/components/agency/AgencySidebar.tsx` -- modify (add to palette)