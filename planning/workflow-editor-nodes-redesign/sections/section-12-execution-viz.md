Now I have all the context I need. Let me extract the relevant information for section-12-execution-viz from the plan and TDD documents.

From the index.md, section-12 is:
- **Execution Visualization** 
- Depends on: 09, 10
- Blocks: 14
- Create ExecutionOverlay, ExecutionLogPanel, CostEstimation components + Zustand store + SSE integration

Let me now generate the section content:

---

# Frontend Execution Visualization

## Overview

This section implements real-time execution visualization for the workflow editor canvas. Users can watch nodes execute in real-time with status overlays, review a detailed execution log, and see cost estimations before running workflows.

**Dependencies:**
- Section 09 (SSE Execution Stream) — Real-time event streaming from backend
- Section 10 (BaseNode + useNodeRegistry) — Node definitions and rendering

**Blocks:**
- Section 14 (Editor Refactor) — Requires these components to integrate into main editor

## Components Overview

### ExecutionOverlay
Visual node status indicators that render over workflow canvas nodes during execution.

**Responsibilities:**
- Render status badges/borders on nodes based on execution state
- Update when SSE events arrive
- CSS animations for running state (pulsing border, no dynamic Tailwind)
- Color-coded styling: pending (default), running (blue pulsing), success (green), failed (red), skipped (gray dashed)

**File:** `/home/dev/projects/SmartSpecPro/apps/web/client/src/components/workflow/execution/ExecutionOverlay.tsx`

### ExecutionLogPanel
Side drawer showing chronological execution log with expandable details.

**Responsibilities:**
- Display entries in execution order (timestamp, node name, status, duration)
- Show expandable node for detailed output/error inspection
- Provide copy-to-clipboard for outputs
- Auto-scroll to latest entry
- Handle different log entry types (node_start, node_complete, node_error, workflow_complete, workflow_error)

**File:** `/home/dev/projects/SmartSpecPro/apps/web/client/src/components/workflow/execution/ExecutionLogPanel.tsx`

### CostEstimation
Component that displays pre-execution cost estimates and warnings.

**Responsibilities:**
- Show estimated credit cost breakdown by node type
- Display user's current balance
- Show warnings when estimated cost exceeds balance or is close
- Disable Run button if insufficient credits
- Integrate with ExecutionStore to get workflow graph

**File:** `/home/dev/projects/SmartSpecPro/apps/web/client/src/components/workflow/execution/CostEstimation.tsx`

### executionStore (Zustand)
State management for execution lifecycle and real-time updates.

**Responsibilities:**
- Track execution mode (isExecuting, executionId)
- Maintain node status map (nodeId → {status, startTime, endTime, output, error})
- Log entry array (chronological list of execution events)
- Provide actions: startExecution, updateNodeStatus, addLog, completeExecution, resetExecution
- Expose selectors for UI components (getNodeStatus, getLogs, canExecute, etc.)

**File:** `/home/dev/projects/SmartSpecPro/apps/web/client/src/stores/executionStore.ts`

### SSE Client Integration
Utility for connecting to the backend SSE endpoint and dispatching events to executionStore.

**Responsibilities:**
- Establish EventSource connection to `GET /execute/{executionId}/stream`
- Handle reconnection with Last-Event-ID
- Parse incoming SSE events and dispatch to store
- Close connection on workflow completion or error
- Error boundary for connection failures

**Note:** SSE client is typically integrated into WorkflowEditor (section 14), but may be extracted as a separate hook or utility here.

---

## Tests

### ExecutionOverlay Tests

```typescript
// apps/web/client/src/components/workflow/execution/__tests__/ExecutionOverlay.test.tsx

// Test: pending node shows default styling
// Test: running node shows blue pulsing border (CSS animation, not dynamic Tailwind)
// Test: success node shows green border with checkmark icon
// Test: failed node shows red border with X icon
// Test: skipped node shows gray dashed border
// Test: status updates when prop changes
// Test: CSS animation classes are static (no dynamic interpolation like border-${color}-400)
```

### ExecutionLogPanel Tests

```typescript
// apps/web/client/src/components/workflow/execution/__tests__/ExecutionLogPanel.test.tsx

// Test: renders chronological log entries in order (oldest first)
// Test: each entry displays timestamp, node name, status icon, and duration
// Test: entries are expandable to show detailed output
// Test: error entries display error message prominently
// Test: "Copy output" button copies to clipboard
// Test: auto-scrolls to latest entry when new log arrives
// Test: supports all event types (node_start, node_complete, node_error, workflow_complete)
// Test: handles empty log gracefully (no entries message)
// Test: node_complete entry shows duration in ms
```

### CostEstimation Tests

```typescript
// apps/web/client/src/components/workflow/execution/__tests__/CostEstimation.test.tsx

// Test: displays estimated total credits for workflow
// Test: shows breakdown by node type (LLM: X credits, Image: Y credits, etc.)
// Test: displays user's current balance
// Test: shows warning when estimate > balance (Run button disabled)
// Test: shows warning when estimate > 70% of balance (yellow)
// Test: disables Run button when estimate > balance
// Test: recalculates on graph changes (node added/removed/config changed)
// Test: handles workflows with no cost nodes (zero estimate)
```

### executionStore Tests

```typescript
// apps/web/client/src/stores/__tests__/executionStore.test.ts

// Test: initial state has isExecuting = false, empty nodeStatuses, empty logs
// Test: startExecution(id) sets isExecuting = true and executionId
// Test: updateNodeStatus(nodeId, status) updates node status map
// Test: addLog(entry) appends to logs array
// Test: completeExecution() sets isExecuting = false
// Test: resetExecution() clears all state
// Test: getNodeStatus(nodeId) returns current status or 'pending' if not found
// Test: getLogs() returns all log entries
// Test: multiple concurrent updates don't lose data
```

---

## Implementation Details

### ExecutionOverlay Component

The ExecutionOverlay wraps nodes and applies status-based styling:

```typescript
type ExecutionStatus = 'pending' | 'running' | 'success' | 'failed' | 'skipped';

interface ExecutionOverlayProps {
  nodeId: string;
  status: ExecutionStatus;
}

const statusStyles: Record<ExecutionStatus, string> = {
  pending: '', // default, no overlay
  running: 'border-2 border-blue-500 animate-pulse', // CSS keyframes defined in tailwind config
  success: 'border-2 border-green-500',
  failed: 'border-2 border-red-500',
  skipped: 'border-2 border-gray-400 border-dashed',
};
```

**Key design:**
- Do NOT use dynamic Tailwind classes like `border-${color}-500`
- All border and animation classes are static, predefined strings
- `animate-pulse` is a standard Tailwind utility (pulsing is a CSS keyframe, not dynamic)
- Component is overlay only — does not affect node size or layout
- Success/failed overlays show icons (✓ or ✕) via additional child elements

### ExecutionLogPanel Component

The log panel shows entries in chronological order with expandable details:

```typescript
interface LogEntry {
  id: string;
  timestamp: number; // milliseconds since epoch
  nodeId: string;
  nodeName: string;
  eventType: 'node_start' | 'node_complete' | 'node_error' | 'workflow_complete' | 'workflow_error';
  status: 'pending' | 'running' | 'success' | 'failed' | 'skipped';
  duration?: number; // milliseconds
  output?: Record<string, unknown>;
  error?: string;
}
```

**Rendering:**
- Each entry is a row with timestamp (HH:mm:ss.SSS format), status icon, node name, duration
- Clicking expands to show `output` (JSON viewer) or error message
- Copy button uses `navigator.clipboard.writeText()` to copy JSON stringified output
- Auto-scroll via `useEffect` listening to logs array length

### CostEstimation Component

Pre-execution cost estimate with balance check:

```typescript
interface CostEstimateProps {
  nodes: Node[];
  edges: Edge[];
  disabled?: boolean; // e.g., if already executing
}

interface CostBreakdown {
  llmNodes: { count: number; estimatedCredits: number };
  imageNodes: { count: number; estimatedCredits: number };
  skillNodes: { count: number; estimatedCredits: number };
  totalEstimated: number;
  userBalance: number;
}
```

**Logic:**
- Count LLM nodes → multiply by estimated tokens (prompt length × 2 for response) × model cost per token
- Count image/media nodes → multiply by provider + size fixed cost
- Count skill nodes → estimate based on skill category
- Check `userBalance >= totalEstimated` to enable/disable Run button
- Show warning states:
  - `totalEstimated > userBalance` → red warning, disable button
  - `totalEstimated > 0.7 * userBalance` → yellow warning, button enabled

### executionStore Zustand Store

Central state for execution lifecycle:

```typescript
interface ExecutionState {
  // Execution context
  isExecuting: boolean;
  executionId: string | null;

  // Node statuses
  nodeStatuses: Record<string, {
    status: ExecutionStatus;
    startTime: number;
    endTime?: number;
    output?: Record<string, unknown>;
    error?: string;
  }>;

  // Log entries
  logs: LogEntry[];

  // Actions
  actions: {
    startExecution: (executionId: string) => void;
    updateNodeStatus: (nodeId: string, status: ExecutionStatus, data?: any) => void;
    addLog: (entry: LogEntry) => void;
    completeExecution: () => void;
    resetExecution: () => void;
  };

  // Selectors
  selectors: {
    getNodeStatus: (nodeId: string) => ExecutionStatus;
    getLogs: () => LogEntry[];
    getNodeOutput: (nodeId: string) => Record<string, unknown> | undefined;
    canExecute: () => boolean;
  };
}
```

**Store initialization:**
```typescript
const useExecutionStore = create<ExecutionState>((set, get) => ({
  isExecuting: false,
  executionId: null,
  nodeStatuses: {},
  logs: [],

  actions: {
    startExecution: (id) => set({ isExecuting: true, executionId: id }),
    updateNodeStatus: (nodeId, status, data) => set((state) => ({
      nodeStatuses: {
        ...state.nodeStatuses,
        [nodeId]: { status, startTime: Date.now(), ...data },
      },
    })),
    addLog: (entry) => set((state) => ({
      logs: [...state.logs, entry],
    })),
    completeExecution: () => set({ isExecuting: false }),
    resetExecution: () => set({ isExecuting: false, executionId: null, nodeStatuses: {}, logs: [] }),
  },

  selectors: {
    getNodeStatus: (nodeId) => get().nodeStatuses[nodeId]?.status || 'pending',
    getLogs: () => get().logs,
    getNodeOutput: (nodeId) => get().nodeStatuses[nodeId]?.output,
    canExecute: () => !get().isExecuting,
  },
}));
```

### SSE Client Integration

The SSE connection is established when the user clicks "Run" and the workflow starts executing:

```typescript
// Pseudo-code: typically called from WorkflowEditor (section 14)
async function connectSSE(executionId: string) {
  const store = useExecutionStore.getState();
  store.actions.startExecution(executionId);

  const eventSource = new EventSource(
    `/api/v1/workflow/execute/${executionId}/stream`,
    { withCredentials: true }
  );

  eventSource.addEventListener('node_start', (event) => {
    const data = JSON.parse(event.data);
    store.actions.updateNodeStatus(data.nodeId, 'running');
    store.actions.addLog({
      id: `${data.nodeId}-start`,
      timestamp: data.timestamp,
      nodeId: data.nodeId,
      nodeName: data.nodeName,
      eventType: 'node_start',
      status: 'running',
    });
  });

  eventSource.addEventListener('node_complete', (event) => {
    const data = JSON.parse(event.data);
    store.actions.updateNodeStatus(data.nodeId, 'success', {
      endTime: data.timestamp,
      output: data.output,
    });
    store.actions.addLog({
      id: `${data.nodeId}-complete`,
      timestamp: data.timestamp,
      nodeId: data.nodeId,
      nodeName: data.nodeName,
      eventType: 'node_complete',
      status: 'success',
      duration: data.durationMs,
      output: data.output,
    });
  });

  eventSource.addEventListener('node_error', (event) => {
    const data = JSON.parse(event.data);
    store.actions.updateNodeStatus(data.nodeId, 'failed', {
      endTime: data.timestamp,
      error: data.error,
    });
    // Mark subsequent nodes as skipped
    store.actions.addLog({
      id: `${data.nodeId}-error`,
      timestamp: data.timestamp,
      nodeId: data.nodeId,
      nodeName: data.nodeName,
      eventType: 'node_error',
      status: 'failed',
      error: data.error,
    });
  });

  eventSource.addEventListener('workflow_complete', (event) => {
    const data = JSON.parse(event.data);
    store.actions.completeExecution();
    store.actions.addLog({
      id: 'workflow-complete',
      timestamp: data.timestamp,
      nodeId: '',
      nodeName: 'Workflow',
      eventType: 'workflow_complete',
      status: 'success',
    });
    eventSource.close();
  });

  eventSource.addEventListener('workflow_error', (event) => {
    const data = JSON.parse(event.data);
    store.actions.completeExecution();
    store.actions.addLog({
      id: 'workflow-error',
      timestamp: data.timestamp,
      nodeId: '',
      nodeName: 'Workflow',
      eventType: 'workflow_error',
      status: 'failed',
      error: data.error,
    });
    eventSource.close();
  });

  eventSource.onerror = () => {
    console.error('SSE connection error');
    eventSource.close();
  };
}
```

---

## Styling Notes

**No Dynamic Tailwind Classes**

All status-related colors and animations must use static, predefined class strings. This ensures Tailwind's JIT compiler includes them at build time.

**Valid:**
```typescript
const statusClasses: Record<string, string> = {
  running: 'border-2 border-blue-500 animate-pulse',
  success: 'border-2 border-green-500',
  failed: 'border-2 border-red-500',
  skipped: 'border-2 border-gray-400 border-dashed',
};
```

**Invalid (will not work):**
```typescript
const statusClasses = {
  running: `border-2 border-${statusColor}-500`, // Dynamic!
};
```

---

## File Structure

```
apps/web/client/src/
├── components/workflow/execution/
│   ├── ExecutionOverlay.tsx
│   ├── ExecutionLogPanel.tsx
│   ├── CostEstimation.tsx
│   └── __tests__/
│       ├── ExecutionOverlay.test.tsx
│       ├── ExecutionLogPanel.test.tsx
│       └── CostEstimation.test.tsx
└── stores/
    ├── executionStore.ts
    └── __tests__/
        └── executionStore.test.ts
```

---

## API Contracts

These components consume APIs implemented in **Section 09 (SSE Execution Stream)**:

- `GET /api/v1/workflow/execute/{executionId}/stream` — EventSource connection with cookie-based auth
- Event payload format: `{ nodeId, nodeName, timestamp, durationMs?, output?, error? }`

And rely on data structures from **Section 10 (BaseNode + useNodeRegistry)**:

- `Node` type with `data.nodeType` field
- Node registry lookup for cost estimation

---

## Notes for Implementers

1. **Test order:** Write tests FIRST, then implement to pass those tests. See test section above.
2. **CSS animations:** Use only standard Tailwind utilities like `animate-pulse`. Define custom animations in `tailwind.config.ts` if needed, but never interpolate class names at runtime.
3. **Store integration:** Ensure all components that need execution state use the store via `useExecutionStore()` hook. Avoid prop drilling.
4. **Performance:** Log panel with many entries (1000+) may slow down. Consider virtualization (e.g., `react-window`) if log grows large.
5. **Accessibility:** Ensure status overlays have proper aria labels for screen readers. Execution log timestamps should use full datetime (not just time).
6. **Error UX:** When SSE connection fails, show a reconnection toast or warning in the log. Auto-retry after 3 seconds.

---

## Dependencies Met

- ✓ Section 09 provides SSE `/execute/{id}/stream` endpoint and event format
- ✓ Section 10 provides BaseNode rendering and node type definitions

## Next Steps (Section 14)

Section 14 (Editor Refactor) integrates these components into `WorkflowEditor.tsx`:
- Add ExecutionOverlay rendering to BaseNode during execution mode
- Add ExecutionLogPanel as a right drawer when isExecuting
- Add CostEstimation component above Run button
- Connect SSE client to start on Run button click
- Reset execution store when starting a new execution