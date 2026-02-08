Now I have full context. Let me produce the section content.

# Section 12 -- Frontend Updates

## Overview

This section updates the workflow editor frontend to support the expanded node set from Section 11 (Node Registry Expansion). The architecture is **registry-driven**: the Python backend is the single source of truth for node definitions, the frontend fetches them via `GET /api/v1/workflows/node-types`, and renders the palette, canvas nodes, and config panels dynamically. This means most of the work is data-driven and the frontend changes are minimal.

**What gets done:**

1. Update the `NodeTypeSpec.category` TypeScript union type to include four new categories: `reliability`, `security`, `communication`, `code`
2. Add color definitions for new data types (`file`, `secret`) to the color map
3. Add palette sections in `WorkflowEditor.tsx` for the four new categories
4. Update the "no results" search check to include new categories
5. Add the two new data types (`file`, `secret`) to the `DataType` union and compatibility matrix

**What does NOT change:**

- `BaseNode.tsx` -- already fully dynamic, renders any node from the registry with no category-specific logic
- `DynamicNodeConfig.tsx` -- already generates forms from `InputSpec` definitions
- `isValidConnection.ts` -- already validates port types from registry specs
- SSE event handling -- the event format (`node_start`, `node_complete`, `node_error`, `workflow_complete`) is unchanged; new node types produce the same events
- `ExecutionOverlay.tsx` / `ExecutionLogPanel.tsx` -- status visualization is node-type-agnostic

---

## Dependencies

| Section | Dependency | Description |
|---------|-----------|-------------|
| Section 11 | **Required** | Backend node registry must include new categories and node types for them to appear in the frontend palette |
| Section 14 | **Required** | `GET /api/v1/workflows/node-types` endpoint must return the expanded registry |
| Sections 4-9 | **Soft** | Node executor implementations; frontend can display nodes before executors are complete (executor stubs are fine) |

---

## Files to Create/Modify

| File | Action | Description |
|------|--------|-------------|
| `/home/dev/projects/SmartSpecPro/apps/web/client/src/lib/workflow/useNodeRegistry.ts` | **MODIFY** | Expand `category` union type |
| `/home/dev/projects/SmartSpecPro/apps/web/client/src/lib/workflow/colorMap.ts` | **MODIFY** | Add `file` and `secret` data type colors |
| `/home/dev/projects/SmartSpecPro/apps/web/client/src/lib/workflow/dataTypes.ts` | **MODIFY** | Add `file` and `secret` to `DataType` union and compatibility matrix |
| `/home/dev/projects/SmartSpecPro/apps/web/client/src/pages/WorkflowEditor.tsx` | **MODIFY** | Add palette sections for 4 new categories |
| `/home/dev/projects/SmartSpecPro/apps/web/client/src/lib/workflow/__tests__/colorMap.test.ts` | **CREATE** | Tests for color map completeness |
| `/home/dev/projects/SmartSpecPro/apps/web/client/src/lib/workflow/__tests__/dataTypes.test.ts` | **CREATE** | Tests for new data types and compatibility |

---

## Tests (Write First)

### Test File: `/home/dev/projects/SmartSpecPro/apps/web/client/src/lib/workflow/__tests__/colorMap.test.ts`

```typescript
/**
 * Tests for colorMap.ts -- verifying all category colors and data type colors
 * are defined for the expanded node set.
 */
import { describe, it, expect } from "vitest";
import {
  dataTypeColorMap,
  nodeColorMap,
  getDataTypeColor,
  getNodeColor,
} from "../colorMap";

describe("dataTypeColorMap", () => {
  it("should have color definitions for all 9 data types", () => {
    const expectedTypes = [
      "text",
      "json",
      "array",
      "image",
      "number",
      "boolean",
      "any",
      "file",
      "secret",
    ];
    for (const type of expectedTypes) {
      expect(dataTypeColorMap[type]).toBeDefined();
      expect(dataTypeColorMap[type].border).toBeTruthy();
      expect(dataTypeColorMap[type].bg).toBeTruthy();
      expect(dataTypeColorMap[type].text).toBeTruthy();
      expect(dataTypeColorMap[type].dot).toBeTruthy();
    }
  });

  it("should use static Tailwind classes (no dynamic interpolation)", () => {
    for (const [, colors] of Object.entries(dataTypeColorMap)) {
      // All classes must be full static strings like "border-blue-400"
      expect(colors.border).toMatch(/^border-\w+-\d+$/);
      expect(colors.bg).toMatch(/^bg-\w+-\d+$/);
      expect(colors.text).toMatch(/^text-\w+-\d+$/);
      expect(colors.dot).toMatch(/^bg-\w+-\d+$/);
    }
  });

  it("getDataTypeColor should fall back to 'any' for unknown types", () => {
    const result = getDataTypeColor("nonexistent_type");
    expect(result).toEqual(dataTypeColorMap.any);
  });

  it("getDataTypeColor should return correct colors for file type", () => {
    const result = getDataTypeColor("file");
    expect(result).toBeDefined();
    expect(result.border).toContain("border-");
  });

  it("getDataTypeColor should return correct colors for secret type", () => {
    const result = getDataTypeColor("secret");
    expect(result).toBeDefined();
    expect(result.border).toContain("border-");
  });
});

describe("nodeColorMap", () => {
  it("should have color definitions for all node color names", () => {
    // All colors used by existing + new categories
    const expectedColors = [
      "blue",
      "green",
      "purple",
      "pink",
      "orange",
      "cyan",
      "yellow",
      "red",
      "gray",
    ];
    for (const color of expectedColors) {
      expect(nodeColorMap[color]).toBeDefined();
      expect(nodeColorMap[color].border).toBeTruthy();
      expect(nodeColorMap[color].bg).toBeTruthy();
      expect(nodeColorMap[color].text).toBeTruthy();
    }
  });

  it("getNodeColor should fall back to gray for unknown colors", () => {
    const result = getNodeColor("nonexistent_color");
    expect(result).toEqual(nodeColorMap.gray);
  });
});
```

### Test File: `/home/dev/projects/SmartSpecPro/apps/web/client/src/lib/workflow/__tests__/dataTypes.test.ts`

```typescript
/**
 * Tests for dataTypes.ts -- verifying expanded data type system.
 */
import { describe, it, expect } from "vitest";
import {
  dataTypeCompatibility,
  isCompatibleConnection,
  getDataTypeDescription,
} from "../dataTypes";
import type { DataType } from "../dataTypes";

describe("DataType union", () => {
  it("should include file and secret in compatibility matrix", () => {
    expect(dataTypeCompatibility["file"]).toBeDefined();
    expect(dataTypeCompatibility["secret"]).toBeDefined();
  });
});

describe("isCompatibleConnection with new types", () => {
  it("file should connect to file ports", () => {
    expect(isCompatibleConnection("file", "file")).toBe(true);
  });

  it("file should connect to any ports", () => {
    expect(isCompatibleConnection("file", "any")).toBe(true);
  });

  it("file should NOT connect to text ports", () => {
    expect(isCompatibleConnection("file", "text")).toBe(false);
  });

  it("secret should connect to secret ports", () => {
    expect(isCompatibleConnection("secret", "secret")).toBe(true);
  });

  it("secret should connect to text ports (for injection)", () => {
    expect(isCompatibleConnection("secret", "text")).toBe(true);
  });

  it("secret should connect to any ports", () => {
    expect(isCompatibleConnection("secret", "any")).toBe(true);
  });

  it("any should connect to file and secret ports", () => {
    expect(isCompatibleConnection("any", "file")).toBe(true);
    expect(isCompatibleConnection("any", "secret")).toBe(true);
  });
});

describe("getDataTypeDescription", () => {
  it("should return description for file type", () => {
    const desc = getDataTypeDescription("file" as DataType);
    expect(desc).toBeTruthy();
    expect(desc).not.toBe("Unknown data type");
  });

  it("should return description for secret type", () => {
    const desc = getDataTypeDescription("secret" as DataType);
    expect(desc).toBeTruthy();
    expect(desc).not.toBe("Unknown data type");
  });
});
```

---

## Implementation Steps

### Step 1: Expand the `DataType` Union and Compatibility Matrix

**File:** `/home/dev/projects/SmartSpecPro/apps/web/client/src/lib/workflow/dataTypes.ts`

Section 11 adds two new port data types on the backend: `file` (for Storage Action nodes) and `secret` (for Secrets Vault nodes, which must never be logged). The frontend `DataType` union must match.

```typescript
/**
 * Data type system for workflow node connections.
 *
 * Defines the type system used for port compatibility validation.
 */

export type DataType =
  | "text"
  | "json"
  | "array"
  | "image"
  | "number"
  | "boolean"
  | "file"
  | "secret"
  | "any";

/**
 * Port type compatibility matrix.
 *
 * Maps each source data type to the target data types it can connect to.
 */
export const dataTypeCompatibility: Record<DataType, Set<DataType>> = {
  text: new Set<DataType>(["text", "any"]),
  json: new Set<DataType>(["json", "text", "any"]),
  array: new Set<DataType>(["array", "json", "any"]),
  image: new Set<DataType>(["image", "any"]),
  number: new Set<DataType>(["number", "text", "any"]),
  boolean: new Set<DataType>(["boolean", "any"]),
  file: new Set<DataType>(["file", "any"]),
  secret: new Set<DataType>(["secret", "text", "any"]),
  any: new Set<DataType>([
    "text",
    "json",
    "array",
    "image",
    "number",
    "boolean",
    "file",
    "secret",
    "any",
  ]),
};

/**
 * Check if a connection between two port types is valid.
 */
export function isCompatibleConnection(
  sourceType: DataType,
  targetType: DataType
): boolean {
  const compatibleTargets = dataTypeCompatibility[sourceType];
  return compatibleTargets ? compatibleTargets.has(targetType) : false;
}

/**
 * Get a human-readable description of a data type.
 */
export function getDataTypeDescription(dataType: DataType): string {
  const descriptions: Record<DataType, string> = {
    text: "Plain text or string value",
    json: "JSON object with structured data",
    array: "Array or list of items",
    image: "Image data (URL or binary)",
    number: "Numeric value",
    boolean: "True or false value",
    file: "File reference (URL or storage key)",
    secret: "Encrypted secret value (scrubbed from logs)",
    any: "Any data type (accepts all connections)",
  };

  return descriptions[dataType] || "Unknown data type";
}
```

**Key decisions:**
- `secret` can connect to `text` ports because secrets need to be injected into places that accept text (e.g., HTTP Request auth headers). The scrubbing happens at the executor/runtime level, not the type system.
- `file` does NOT connect to `text` because file references are structured objects (not arbitrary strings). If a user needs the URL as text, they should use a data transform node.

---

### Step 2: Add Data Type Colors to Color Map

**File:** `/home/dev/projects/SmartSpecPro/apps/web/client/src/lib/workflow/colorMap.ts`

Add `file` and `secret` entries to `dataTypeColorMap`. The `nodeColorMap` already has all needed colors (`orange`, `red`, `cyan`, `purple` for the four new categories), so no changes are needed there.

Add the following entries after the existing `any` entry in `dataTypeColorMap`:

```typescript
// Add to dataTypeColorMap (after 'any' entry):

  file: {
    border: "border-amber-400",
    bg: "bg-amber-50",
    text: "text-amber-600",
    dot: "bg-amber-500",
  },
  secret: {
    border: "border-rose-400",
    bg: "bg-rose-50",
    text: "text-rose-600",
    dot: "bg-rose-500",
  },
```

The complete updated `dataTypeColorMap` will have 9 entries: `text`, `json`, `array`, `image`, `number`, `boolean`, `any`, `file`, `secret`.

**Color choices rationale:**
- `file` uses `amber` -- warm and distinct from `orange` (used by `number` data type), conveys "document/file" semantics
- `secret` uses `rose` -- a shade of red/pink that signals "sensitive/warning" but is distinct from `red` (used by node-level colors for security category)

---

### Step 3: Update Category Type in `useNodeRegistry.ts`

**File:** `/home/dev/projects/SmartSpecPro/apps/web/client/src/lib/workflow/useNodeRegistry.ts`

Expand the `category` union type in `NodeTypeSpec` to include the four new categories.

**Current (line 37):**
```typescript
category: "ai" | "flow_control" | "human" | "skills" | "media" | "triggers" | "inputs" | "outputs" | "data";
```

**Updated:**
```typescript
category:
  | "ai"
  | "flow_control"
  | "human"
  | "skills"
  | "media"
  | "triggers"
  | "inputs"
  | "outputs"
  | "data"
  | "reliability"
  | "security"
  | "communication"
  | "code";
```

Also update the `DataType` import to include the new types. The import on line 9 (`import type { DataType } from "./dataTypes"`) does not need changes since `DataType` is used as a type reference and the expanded union will propagate automatically.

**No other changes to this file.** The `getNodeTypesByCategory` function already accepts `NodeTypeSpec["category"]` as its parameter type, so it will automatically accept the new category strings after the type is updated. The `useQuery` hook, `fetchNodeRegistry`, and `getNodeType` functions are all category-agnostic.

---

### Step 4: Add New Category Palette Sections to WorkflowEditor

**File:** `/home/dev/projects/SmartSpecPro/apps/web/client/src/pages/WorkflowEditor.tsx`

This is the largest change. We need to:
1. Add category filter variables for the four new categories
2. Add palette sections for each new category
3. Update the "no results" search check

#### 4a. Add Category Filter Variables

Add these after the existing `dataNodes` variable (currently line 485):

```typescript
// Add after line 485 (const dataNodes = ...)
const reliabilityNodes = filterNodes(getNodeTypesByCategory('reliability'));
const securityNodes = filterNodes(getNodeTypesByCategory('security'));
const communicationNodes = filterNodes(getNodeTypesByCategory('communication'));
const codeNodes = filterNodes(getNodeTypesByCategory('code'));
```

#### 4b. Add Palette Sections

Add four new category sections in the node palette. Insert them after the existing `{/* Data */}` section block (after line 925) and before the `{/* No results message */}` block. Each follows the exact same pattern as existing sections, with a category-appropriate dot color:

```tsx
{/* Reliability */}
{reliabilityNodes.length > 0 && (
  <div>
    <h4 className="text-xs font-semibold text-gray-600 dark:text-gray-400 mb-2">
      Reliability
    </h4>
    <div className="space-y-2">
      {reliabilityNodes.map((node) => (
        <div
          key={node.type}
          draggable
          onDragStart={(e) => onDragStart(e, node.type)}
          onClick={() => onAddNode(node.type)}
          className="cursor-pointer flex items-center gap-2 px-3 py-2 rounded-lg border-2 bg-white dark:bg-gray-700 hover:bg-gray-50 dark:hover:bg-gray-600 transition-colors"
        >
          <div className="w-2 h-2 rounded-full bg-orange-500" />
          <span className="text-sm font-medium text-gray-900 dark:text-white">
            {node.display_name}
          </span>
        </div>
      ))}
    </div>
  </div>
)}

{/* Security */}
{securityNodes.length > 0 && (
  <div>
    <h4 className="text-xs font-semibold text-gray-600 dark:text-gray-400 mb-2">
      Security
    </h4>
    <div className="space-y-2">
      {securityNodes.map((node) => (
        <div
          key={node.type}
          draggable
          onDragStart={(e) => onDragStart(e, node.type)}
          onClick={() => onAddNode(node.type)}
          className="cursor-pointer flex items-center gap-2 px-3 py-2 rounded-lg border-2 bg-white dark:bg-gray-700 hover:bg-gray-50 dark:hover:bg-gray-600 transition-colors"
        >
          <div className="w-2 h-2 rounded-full bg-red-500" />
          <span className="text-sm font-medium text-gray-900 dark:text-white">
            {node.display_name}
          </span>
        </div>
      ))}
    </div>
  </div>
)}

{/* Communication */}
{communicationNodes.length > 0 && (
  <div>
    <h4 className="text-xs font-semibold text-gray-600 dark:text-gray-400 mb-2">
      Communication
    </h4>
    <div className="space-y-2">
      {communicationNodes.map((node) => (
        <div
          key={node.type}
          draggable
          onDragStart={(e) => onDragStart(e, node.type)}
          onClick={() => onAddNode(node.type)}
          className="cursor-pointer flex items-center gap-2 px-3 py-2 rounded-lg border-2 bg-white dark:bg-gray-700 hover:bg-gray-50 dark:hover:bg-gray-600 transition-colors"
        >
          <div className="w-2 h-2 rounded-full bg-cyan-500" />
          <span className="text-sm font-medium text-gray-900 dark:text-white">
            {node.display_name}
          </span>
        </div>
      ))}
    </div>
  </div>
)}

{/* Code */}
{codeNodes.length > 0 && (
  <div>
    <h4 className="text-xs font-semibold text-gray-600 dark:text-gray-400 mb-2">
      Code
    </h4>
    <div className="space-y-2">
      {codeNodes.map((node) => (
        <div
          key={node.type}
          draggable
          onDragStart={(e) => onDragStart(e, node.type)}
          onClick={() => onAddNode(node.type)}
          className="cursor-pointer flex items-center gap-2 px-3 py-2 rounded-lg border-2 bg-white dark:bg-gray-700 hover:bg-gray-50 dark:hover:bg-gray-600 transition-colors"
        >
          <div className="w-2 h-2 rounded-full bg-purple-500" />
          <span className="text-sm font-medium text-gray-900 dark:text-white">
            {node.display_name}
          </span>
        </div>
      ))}
    </div>
  </div>
)}
```

**Dot colors per category (matching Section 11 color assignments):**
- Reliability: `bg-orange-500` (orange)
- Security: `bg-red-500` (red)
- Communication: `bg-cyan-500` (cyan)
- Code: `bg-purple-500` (purple)

#### 4c. Update "No Results" Search Check

Update the "no results" conditional (currently around lines 928-962) to include the four new category arrays. The condition currently checks `aiNodes.length === 0 && flowNodes.length === 0 && ...` for all existing categories. Add the four new categories:

```tsx
{/* No results message */}
{nodeSearchTerm &&
 aiNodes.length === 0 &&
 flowNodes.length === 0 &&
 humanNodes.length === 0 &&
 mediaNodes.length === 0 &&
 skillNodes.length === 0 &&
 triggerNodes.length === 0 &&
 inputNodes.length === 0 &&
 outputNodes.length === 0 &&
 dataNodes.length === 0 &&
 reliabilityNodes.length === 0 &&
 securityNodes.length === 0 &&
 communicationNodes.length === 0 &&
 codeNodes.length === 0 && (
  // ... existing "no results" UI unchanged
)}
```

---

### Step 5: No Changes Required to Other Files

**`BaseNode.tsx`** -- No changes. It already:
- Looks up the node type from the registry using `getNodeType(data.nodeType)`
- Reads the `color` property from the node spec and maps it via `nodeColorMap`
- Dynamically renders input/output handles from `nodeTypeDef.inputs` and `nodeTypeDef.outputs`
- Resolves Lucide icons dynamically from `nodeTypeDef.icon`
- All of this works for any category because it is registry-driven

**`CustomNode.tsx`** -- File does not exist (confirmed by read error), so no changes needed. All nodes use `BaseNode` via the `workflow` node type.

**`DynamicNodeConfig.tsx`** -- No changes. It generates configuration forms from `InputSpec` definitions, which are category-agnostic.

**`isValidConnection.ts`** -- No changes. It validates connections using the `DataType` union from `dataTypes.ts`, which will automatically pick up the `file` and `secret` types after Step 1.

**SSE event handling** -- No changes. The SSE event types (`node_start`, `node_complete`, `node_error`, `workflow_complete`, `workflow_error`) are the same regardless of which node types are executing. New reliability nodes (retry, circuit breaker) and security nodes (audit, logging) emit the same event structure.

---

## Refactoring Consideration: Extracting NodePaletteSection

The `WorkflowEditor.tsx` file currently has a large amount of repetitive JSX for each category section (each is ~20 lines of identical structure with only the category name, dot color, and data array changing). After this change there will be **13 category sections** with identical structure. A future refactoring could extract a `NodePaletteSection` component:

```tsx
// Future refactoring (not part of this section -- do NOT implement now)
interface NodePaletteSectionProps {
  title: string;
  dotColor: string;  // e.g., "bg-blue-500"
  nodes: NodeTypeSpec[];
  onDragStart: (e: React.DragEvent, nodeType: string) => void;
  onAddNode: (nodeType: string) => void;
}

function NodePaletteSection({ title, dotColor, nodes, onDragStart, onAddNode }: NodePaletteSectionProps) {
  if (nodes.length === 0) return null;
  return (
    <div>
      <h4 className="text-xs font-semibold text-gray-600 dark:text-gray-400 mb-2">
        {title}
      </h4>
      <div className="space-y-2">
        {nodes.map((node) => (
          <div
            key={node.type}
            draggable
            onDragStart={(e) => onDragStart(e, node.type)}
            onClick={() => onAddNode(node.type)}
            className="cursor-pointer flex items-center gap-2 px-3 py-2 rounded-lg border-2 bg-white dark:bg-gray-700 hover:bg-gray-50 dark:hover:bg-gray-600 transition-colors"
          >
            <div className={`w-2 h-2 rounded-full ${dotColor}`} />
            <span className="text-sm font-medium text-gray-900 dark:text-white">
              {node.display_name}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
```

This would reduce the palette rendering to ~13 one-liner invocations. However, this is a refactoring concern, not a functional change, and is deferred to avoid scope creep.

---

## Category-to-Color Mapping Summary

For reference, here is the complete mapping of categories to their dot colors in the palette and their `nodeColorMap` color (used by `BaseNode` for the node background):

| Category | Palette Dot Color | nodeColorMap Color | Node Border/BG |
|----------|------------------|--------------------|----------------|
| `ai` | `bg-blue-500` | `blue` | Blue border/bg |
| `flow_control` | `bg-purple-500` | `yellow` | Yellow border/bg |
| `human` | `bg-yellow-500` | `orange` | Orange border/bg |
| `media` | `bg-pink-500` | `pink` | Pink border/bg |
| `skills` | `bg-green-500` | `green` | Green border/bg |
| `triggers` | `bg-indigo-500` | `green` | Green border/bg |
| `inputs` | `bg-cyan-500` | `blue` | Blue border/bg |
| `outputs` | `bg-teal-500` | `purple` | Purple border/bg |
| `data` | `bg-amber-500` | `orange` | Orange border/bg |
| `reliability` | `bg-orange-500` | `orange` | Orange border/bg |
| `security` | `bg-red-500` | `red` | Red border/bg |
| `communication` | `bg-cyan-500` | `cyan` | Cyan border/bg |
| `code` | `bg-purple-500` | `purple` | Purple border/bg |

Note: The palette dot color and the canvas node color serve different purposes. The dot is a quick visual indicator in the sidebar palette. The canvas node color is determined by the `color` field in each `NodeTypeSpec` from the backend registry and rendered by `BaseNode.tsx` using `nodeColorMap`.

---

## Verification Checklist

After implementing all changes:

1. **TypeScript type check passes:**
   ```bash
   cd /home/dev/projects/SmartSpecPro/apps/web && pnpm check
   ```

2. **Unit tests pass:**
   ```bash
   cd /home/dev/projects/SmartSpecPro/apps/web && pnpm test
   ```

3. **Visual verification (requires backend running with Section 11 complete):**
   - Open WorkflowEditor page
   - Verify all 13 category sections appear in the palette (when backend returns nodes for those categories)
   - Verify search filtering works across all categories including new ones
   - Verify "No nodes found" message appears when search matches nothing across all categories
   - Drag a reliability node onto the canvas -- verify it renders with orange border
   - Drag a security node onto the canvas -- verify it renders with red border
   - Drag a communication node onto the canvas -- verify it renders with cyan border
   - Drag a code node onto the canvas -- verify it renders with purple border
   - Click a new node type -- verify DynamicNodeConfig renders its inputs correctly
   - Connect a `secret` output to a `text` input -- should be allowed
   - Connect a `file` output to a `text` input -- should be rejected
   - Connect a `file` output to an `any` input -- should be allowed

4. **Graceful degradation (without backend changes):**
   - If the backend has not yet been updated (Section 11 not deployed), the new palette sections simply do not appear (they are conditionally rendered based on `nodes.length > 0`). No errors occur.

---

## Summary of Changes by File

| File | Lines Changed (approx) | Nature of Change |
|------|----------------------|------------------|
| `dataTypes.ts` | ~10 lines modified | Add `file` and `secret` to `DataType` union, compatibility matrix, and descriptions |
| `colorMap.ts` | ~12 lines added | Add `file` and `secret` entries to `dataTypeColorMap` |
| `useNodeRegistry.ts` | ~4 lines modified | Expand `category` union type with 4 new values |
| `WorkflowEditor.tsx` | ~100 lines added, ~4 lines modified | Add 4 palette sections + update no-results check |
| `__tests__/colorMap.test.ts` | ~70 lines created | Tests for color map completeness |
| `__tests__/dataTypes.test.ts` | ~65 lines created | Tests for new data types and compatibility |

**Total estimated scope:** ~265 lines added/modified across 6 files. This is a minimal, low-risk change because:
- The registry-driven architecture means all node rendering is dynamic
- No structural changes to any component
- All new code follows exact existing patterns
- Backward compatible -- new sections appear only when backend provides nodes in those categories
<!-- SECTION_STATE
status: stub
commit_hash: 
implementation_notes: Section 12 stub created - frontend updates for expanded node set
END_SECTION_STATE -->
