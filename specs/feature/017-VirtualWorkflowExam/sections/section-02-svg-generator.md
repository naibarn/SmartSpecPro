Now I have all the information needed. Let me compose the complete section content for `section-02-svg-generator`.

# Section 02: SVG Diagram Generator Utility

## Overview

This section delivers a pure TypeScript utility function that converts a `WorkflowJson` object into a compact SVG topology diagram. The generated SVG is stored in the `previewSvg` column of `workflowTemplates` during the seeding step (Section 04). This section has no dependencies and can be implemented in parallel with sections 01, 03, and 07.

## Dependencies

- **Depends on**: None (fully independent utility)
- **Blocks**: Section 04 (Seeder Script) — the seeder calls `generateWorkflowSvg` per template
- **Does not block**: Sections 01, 03, 05, 06, 07 (those can proceed independently)

## Files to Create

| File | Purpose |
|---|---|
| `apps/web/server/lib/workflowSvgGenerator.ts` | Main implementation |
| `apps/web/server/lib/__tests__/workflowSvgGenerator.test.ts` | Unit tests |

---

## Tests First

Create the test file before implementing the utility. The tests must fail initially, then pass after the implementation is complete.

**File:** `apps/web/server/lib/__tests__/workflowSvgGenerator.test.ts`

```typescript
import { describe, it, expect } from "vitest";
import { generateWorkflowSvg } from "../workflowSvgGenerator";

describe("generateWorkflowSvg", () => {
  // Empty workflow — must return valid SVG, not throw
  it("returns a valid SVG string for empty workflow", () => {
    // stub: call generateWorkflowSvg({ nodes: [], edges: [] })
    // expect result to be a string starting with '<svg'
  });

  // Single trigger node — label must appear in output
  it("includes node label in SVG for single trigger node", () => {
    // stub: call with one schedule_trigger node labelled "Start daily run"
    // expect SVG output to contain "Start daily run"
  });

  // Linear workflow (A → B → C) — 3 rects, 2 arrows
  it("renders 3 rectangles and 2 path elements for A→B→C linear workflow", () => {
    // stub: 3 nodes connected in sequence
    // expect SVG to contain 3 <rect elements and 2 <path or <marker elements
  });

  // Parallel topology (A→B, A→C, B→D, C→D) — must not throw, 4 rects
  it("renders 4 rectangles for parallel workflow without throwing", () => {
    // stub: 4 nodes with a fork-and-join topology
    // expect SVG to contain 4 <rect elements
  });

  // Unknown nodeType → gray fallback color
  it("uses gray fill for unknown nodeType", () => {
    // stub: node with nodeType "completely_unknown_type"
    // expect SVG to contain fill="#6B7280"
  });

  // Known category colors
  it("uses green fill for schedule_trigger nodeType", () => {
    // expect fill="#10B981"
  });

  it("uses blue fill for llm_call nodeType", () => {
    // expect fill="#3B82F6"
  });

  it("uses purple fill for conditional nodeType", () => {
    // expect fill="#8B5CF6"
  });

  // Cycle handling — must not throw, must render as DAG
  it("does not throw when edges form a cycle", () => {
    // stub: nodes A → B → A (back-edge)
    // expect no thrown error and a valid SVG string
  });

  // Label truncation — labels > 18 chars are truncated
  it("truncates node labels longer than 18 characters", () => {
    // stub: node with label "This label is definitely too long to fit"
    // expect the full string NOT to appear in SVG output
  });

  // DOMParser validity — output must be well-formed XML
  it("produces well-formed SVG XML parseable by DOMParser", () => {
    // Use DOMParser (available in Node via happy-dom/jsdom or import from 'node:...')
    // or use a basic tag-balance check as fallback
    // stub: parse the output and expect no parse errors
  });
});
```

Run tests with:
```bash
cd apps/web && pnpm test server/lib/__tests__/workflowSvgGenerator.test.ts
```

---

## Implementation

### File: `apps/web/server/lib/workflowSvgGenerator.ts`

This is a pure, synchronous function with no external dependencies. It does not import from the NodeRegistry at runtime — it uses a static color lookup table built from the known node type categories.

### Type Definitions

The function accepts the same `WorkflowJson` type used throughout the workflow system. If a shared `WorkflowJson` type is already exported from the workflow types file (check `apps/web/server/routers/workflow.ts` or `packages/shared/`), import it. If not, define it locally:

```typescript
interface WorkflowNodeData {
  nodeType: string;
  label: string;
  config?: Record<string, unknown>;
}

interface WorkflowNode {
  id: string;
  type: string;
  position: { x: number; y: number };
  data: WorkflowNodeData;
}

interface WorkflowEdge {
  id: string;
  source: string;
  target: string;
  sourceHandle?: string;
  targetHandle?: string;
}

interface WorkflowJson {
  nodes: WorkflowNode[];
  edges: WorkflowEdge[];
}
```

### Color Map

Define a static lookup map at module scope. Map each `nodeType` string to a hex fill color using the category classification below. Any nodeType not found in the map defaults to gray.

| Category | Fill Color | Node Types |
|---|---|---|
| `triggers` | `#10B981` (green) | `schedule_trigger`, `webhook_trigger`, `manual_trigger`, `event_trigger` |
| `ai` | `#3B82F6` (blue) | `llm_call`, `rag_query`, `embedding_generator`, `multi_model_router`, `prompt_template`, `output_parser` |
| `flow_control` | `#8B5CF6` (purple) | `conditional`, `loop`, `parallel`, `join`, `subworkflow`, `retry`, `circuit_breaker`, `try_catch`, `delay` |
| `data` | `#F97316` (orange) | `database_query`, `transformer`, `filter`, `aggregator`, `csv_parser`, `template_engine`, `read_file`, `write_file` |
| `integrations` | `#06B6D4` (cyan) | `http_request`, `graphql_request`, `websocket_client`, `storage_action` |
| `outputs` | `#EF4444` (red) | `send_email`, `send_notification` |
| `observability` | `#6B7280` (gray) | `metrics_collector`, `logger_node`, `secrets_vault` |
| `skills/media/human` | `#F59E0B` (amber) | `generate_image`, `skill`, `approval_gate` |
| default | `#6B7280` (gray) | any unknown type |

```typescript
const NODE_TYPE_COLORS: Record<string, string> = {
  // triggers — green
  schedule_trigger: "#10B981",
  webhook_trigger: "#10B981",
  manual_trigger: "#10B981",
  event_trigger: "#10B981",
  // ai — blue
  llm_call: "#3B82F6",
  rag_query: "#3B82F6",
  // ... (fill in all 57 types)
};

const DEFAULT_COLOR = "#6B7280";

function getNodeColor(nodeType: string): string {
  return NODE_TYPE_COLORS[nodeType] ?? DEFAULT_COLOR;
}
```

### Algorithm

The function uses a left-to-right topological layout on an 800×400 canvas.

#### Step 1: Cycle-safe Topological Sort

Use Kahn's algorithm (BFS-based). If cycles are detected (remaining nodes after BFS completes), strip the back-edges from consideration and append the remaining nodes in their original order. This guarantees the function never throws on cyclic graphs.

```typescript
function topoSort(nodes: WorkflowNode[], edges: WorkflowEdge[]): WorkflowNode[] {
  /**
   * Returns nodes in topological order using Kahn's algorithm.
   * If cycles are present, back-edges are skipped and remaining nodes
   * are appended in original order (DAG fallback).
   */
}
```

#### Step 2: Assign Column and Row Positions

After topological sort, assign a column index to each node. A node's column equals its longest path length from any root (trigger) node. Within each column, nodes are stacked vertically.

```typescript
function assignGridPositions(
  sortedNodes: WorkflowNode[],
  edges: WorkflowEdge[]
): Map<string, { col: number; row: number }> {
  /**
   * Returns a Map of nodeId → {col, row}.
   * col = longest path from source; row = stack position within column.
   * Column width: 200px. Row height: 80px.
   */
}
```

#### Step 3: Render Nodes

Each node is rendered as a rounded rectangle (140×50 px, `rx="8"`). The fill color is determined by `getNodeColor(node.data.nodeType)`. The label is the `data.label` truncated to 18 characters (append `…` if truncated). Text is white, centered.

```typescript
function renderNode(
  node: WorkflowNode,
  x: number,
  y: number
): string {
  /**
   * Returns SVG markup for a single node: <g> containing <rect> and <text>.
   * Truncates data.label to 18 chars.
   */
}
```

#### Step 4: Render Edges

Each edge is a cubic bezier `<path>` from center-right of the source node to center-left of the target node. Use an SVG `<marker>` definition (arrowhead) referenced by the paths.

Control point offset: `cx1 = sourceX + 60`, `cx2 = targetX - 60` where sourceX/targetX are the right/left edge x-coordinates of the respective nodes.

```typescript
function renderEdge(
  edgeId: string,
  sourceX: number, sourceY: number,
  targetX: number, targetY: number
): string {
  /**
   * Returns a <path> SVG element with cubic bezier curve and marker-end arrow.
   * d="M sx,sy C cx1,sy cx2,ty tx,ty"
   */
}
```

#### Step 5: Scale to Fit Canvas

After computing all positions, determine the bounding box of all rendered nodes. Scale and translate the entire content group to fit within an 800×400 viewport with 40px padding on all sides.

```typescript
function fitToViewport(
  contentSvg: string,
  boundingBox: { minX: number; minY: number; maxX: number; maxY: number },
  viewportW: number,
  viewportH: number,
  padding: number
): string {
  /**
   * Wraps contentSvg in a <g transform="translate(...) scale(...)"> to fit the viewport.
   */
}
```

#### Step 6: Assemble Final SVG

```typescript
export function generateWorkflowSvg(workflowJson: WorkflowJson): string {
  /**
   * Entry point. Accepts WorkflowJson, returns an inline SVG string.
   * Output format: <svg xmlns="http://www.w3.org/2000/svg" width="800" height="400" ...>
   *   <defs>...</defs>
   *   <g transform="...">
   *     {edges}
   *     {nodes}
   *   </g>
   * </svg>
   *
   * Edges are rendered before nodes so nodes appear on top.
   * For empty workflows (0 nodes), returns a minimal valid SVG with a gray background rect.
   */
}
```

### Edge Cases

- **Empty workflow (0 nodes)**: Return a minimal valid SVG — a gray rounded rectangle with text "No nodes" centered in the 800×400 canvas.
- **Single node**: No edges to render. Center the node in the canvas.
- **All nodes in one column**: Scale vertically to fit.
- **Very long label**: Truncate at 18 chars, append `…`.
- **Cycle in edges**: The topological sort's fallback handles this — back-edges are skipped.
- **Missing position data**: The SVG generator computes its own layout from the topology — it does not use `node.position` (which is the ReactFlow canvas position). This keeps the SVG preview independent of how the user has arranged nodes in the editor.

### Output Requirements

The returned string must:
- Start with `<svg` (no HTML wrapper, no XML declaration, no `<!DOCTYPE>`)
- Include `xmlns="http://www.w3.org/2000/svg"` on the root element
- Include `width="800" height="400"` or equivalent viewBox
- Contain one `<rect>` per node
- Contain one `<path>` per edge
- Contain one `<marker>` definition for the arrowhead (defined once in `<defs>`)
- Be well-formed XML — all tags closed, all attributes quoted

---

## Running the Tests

After implementing the utility, run:

```bash
cd apps/web && pnpm test server/lib/__tests__/workflowSvgGenerator.test.ts
```

To run the full web test suite and check for regressions:

```bash
cd apps/web && pnpm test
```

Type-check only:

```bash
cd apps/web && pnpm check
```

---

## Verification Checklist

- [ ] `generateWorkflowSvg({ nodes: [], edges: [] })` returns a string starting with `<svg`
- [ ] Single `schedule_trigger` node: SVG output contains `fill="#10B981"`
- [ ] Single `llm_call` node: SVG output contains `fill="#3B82F6"`
- [ ] Node label `"This is a very long label"` is truncated to `"This is a very lon…"` in the output
- [ ] Cyclic edge (A → B → A) does not cause the function to throw or loop infinitely
- [ ] Parallel fork-join topology (4 nodes): SVG contains exactly 4 `<rect` occurrences
- [ ] Unknown nodeType `"fake_node"`: SVG contains `fill="#6B7280"` (gray fallback)
- [ ] All unit tests pass with `pnpm test`
- [ ] TypeScript strict mode check passes with `pnpm check`
- [ ] No runtime imports from NodeRegistry or database (pure, side-effect-free function)

---

## Implementation Notes (Actual)

### Deviations from Plan
1. **Types exported** — `WorkflowJson`, `WorkflowNode`, `WorkflowEdge`, `WorkflowNodeData` are exported for Section 04 consumption (plan had them as local interfaces).
2. **Index signature on WorkflowNodeData** — Added `[key: string]: unknown` for compatibility with DB schema's `Record<string, any>` data field.
3. **Optional fields** — Added `parentId?` to `WorkflowNode` and `type?` to `WorkflowEdge` for DB schema compatibility.
4. **No separate `fitToViewport`** — Scaling logic is inlined in `generateWorkflowSvg` for simplicity.
5. **No `<g>` wrapper** per node — Nodes rendered as adjacent `<rect>` + `<text>` elements directly.

### Files Created
- `apps/web/server/lib/workflowSvgGenerator.ts` — Main implementation (~230 lines)
- `apps/web/server/lib/__tests__/workflowSvgGenerator.test.ts` — 11 unit tests

### Test Results
- All 11 tests pass