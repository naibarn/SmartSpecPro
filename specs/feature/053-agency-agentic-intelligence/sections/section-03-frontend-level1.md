# Section 03: Frontend Level 1 -- Intelligence UI for NodePropertyPanel

## Section ID
`section-03-frontend-level1`

## Dependencies
- **section-02-orchestrator-agentic** -- Defines the backend `executionMode`, `planningStrategy`, `maxReflectionCycles`, and `showReasoning` fields that this section provides UI for.
- No dependency on section-01-foundation at the frontend layer, but the backend fields validated here map to limits defined in `agentic_limits.py`.

## Overview

This section adds an "Intelligence" collapsible section to the `AgentSupervisorForm` inside `NodePropertyPanel.tsx`. It also extends the `saveBuilder` Zod schema in `agency.ts` to validate the new `nodeConfig` fields. A new Vitest test file verifies the UI behavior.

The UI controls are only shown for `agent` and `supervisor` node types. All new `nodeConfig` fields are optional with safe defaults, ensuring backward compatibility with existing agencies.

---

## Files to Modify

### 1. `apps/web/client/src/components/agency/NodePropertyPanel.tsx`

**Location within file:** Inside the `AgentSupervisorForm` function component, add a new collapsible section after the existing "Knowledge Base" section and before the "Tools" section (around line 337+).

**New UI elements to add:**

An "Intelligence" collapsible section (following the same pattern as the Knowledge Base and Guardrails collapsibles) containing:

1. **Execution Mode** -- A `Select` dropdown with two options:
   - `"single_shot"` labeled "Standard" (default)
   - `"agentic"` labeled "Agentic"

2. **Conditional sub-options** (shown only when execution mode is `"agentic"`):
   - **Planning Strategy** -- A `Select` dropdown with three options:
     - `"basic"` labeled "Basic"
     - `"cot"` labeled "Chain-of-Thought"
     - `"react"` labeled "ReAct"
   - **Max Reflection Cycles** -- An `<input type="range">` slider with range 1-10, default 3. Display the current value next to the slider.
   - **Show Reasoning** -- A `Switch` toggle (default: false). Label: "Show reasoning steps in output"

3. **Cost warning banner** -- A yellow/amber warning box shown when agentic mode is selected:
   - Text: "Agentic mode may use 2-5x more credits per run"
   - Use `Zap` icon from lucide-react (already imported)
   - Style: `bg-amber-50 border border-amber-200 text-amber-800 rounded-md p-2 text-xs`

**State management pattern:**

Use the existing `ncGet` and `ncSet` helpers for reading/writing `nodeConfig` fields:

```typescript
// Reading:
const executionMode = ncGet(node, "executionMode", "single_shot");
const planningStrategy = ncGet(node, "planningStrategy", "basic");
const maxReflectionCycles = ncGet(node, "maxReflectionCycles", 3);
const showReasoning = ncGet(node, "showReasoning", false);

// Writing (via onChange):
onChange(ncSet(node, "executionMode", value));
```

**New icon import:** Add `Brain` from `lucide-react` for the Intelligence section header icon. The existing import line at line 53 should be extended.

**Collapsible state:** Add `const [intelligenceOpen, setIntelligenceOpen] = useState(false);` alongside the other collapsible state variables (line 230-236).

---

### 2. `apps/web/server/routers/agency.ts`

**Location within file:** Inside the `saveBuilder` procedure's `.superRefine()` block (around line 1066), add validation for agentic nodeConfig fields when the node type is `agent` or `supervisor`.

**Validation rules to add:**

```typescript
// Inside the superRefine callback, after existing agent/supervisor checks:
if (["agent", "supervisor"].includes(data.nodeType)) {
  const nc = data.nodeConfig as Record<string, unknown> | undefined;
  const executionMode = nc?.executionMode;
  if (executionMode !== undefined && executionMode !== "single_shot" && executionMode !== "agentic") {
    ctx.addIssue({ code: "custom", path: ["nodeConfig", "executionMode"], message: "executionMode must be 'single_shot' or 'agentic'" });
  }
  const maxCycles = nc?.maxReflectionCycles;
  if (maxCycles !== undefined) {
    const n = Number(maxCycles);
    if (!Number.isInteger(n) || n < 1 || n > 10) {
      ctx.addIssue({ code: "custom", path: ["nodeConfig", "maxReflectionCycles"], message: "maxReflectionCycles must be an integer between 1 and 10" });
    }
  }
  const strategy = nc?.planningStrategy;
  if (strategy !== undefined && !["basic", "cot", "react"].includes(String(strategy))) {
    ctx.addIssue({ code: "custom", path: ["nodeConfig", "planningStrategy"], message: "planningStrategy must be 'basic', 'cot', or 'react'" });
  }
  const showReasoning = nc?.showReasoning;
  if (showReasoning !== undefined && typeof showReasoning !== "boolean") {
    ctx.addIssue({ code: "custom", path: ["nodeConfig", "showReasoning"], message: "showReasoning must be a boolean" });
  }
}
```

These validations are placed **inside** the existing `superRefine` block, not as a separate refinement. They use the same `ctx.addIssue()` pattern as the existing `knowledgeBase`, `browser_session`, and `router` validations.

---

## Files to Create

### 3. `apps/web/client/src/components/agency/__tests__/AgenticConfig.test.tsx`

**Test file for the Intelligence UI section.**

**Test setup pattern:** Follow the same conventions as `/home/dev/projects/SmartSpecPro/apps/web/client/src/components/agency/__tests__/AgentPropertyPanel.test.tsx`:
- `@vitest-environment jsdom` directive
- Mock `ToolPicker`, `ModelPicker`, `GuardrailsPanel`, and `trpc` (they make network calls)
- Use `render`, `screen`, `fireEvent` from `@testing-library/react`
- Create a `makeNode` helper that returns a valid `AgencyNodeData` object

**Required test cases:**

```typescript
test('renders execution mode dropdown for agent nodes')
```
- Render `NodePropertyPanel` with `nodeType: "agent"`, open the Intelligence section
- Assert a select/dropdown labeled "Execution Mode" is present

```typescript
test('shows agentic sub-options when agentic mode selected')
```
- Render with `nodeConfig: { executionMode: "agentic" }`, open the Intelligence section
- Assert "Planning Strategy" dropdown is visible
- Assert max reflection cycles slider is visible
- Assert "Show Reasoning" switch is visible

```typescript
test('hides agentic sub-options when standard mode selected')
```
- Render with `nodeConfig: { executionMode: "single_shot" }` (or no executionMode), open Intelligence
- Assert planning strategy dropdown is NOT visible
- Assert slider is NOT visible

```typescript
test('slider range is 1-10 for max reflection cycles')
```
- Render with agentic mode, open Intelligence
- Find the range input and assert `min="1"` and `max="10"`

```typescript
test('shows cost warning banner when agentic enabled')
```
- Render with `nodeConfig: { executionMode: "agentic" }`, open Intelligence
- Assert text "Agentic mode may use 2-5x more credits per run" is visible

**Mocking strategy for NodePropertyPanel tests:**

The `NodePropertyPanel` component internally uses `trpc` hooks (for library documents in KB). Mock the entire trpc module:

```typescript
vi.mock("@/lib/trpc", () => ({
  trpc: {
    library: {
      listDocuments: { useQuery: () => ({ data: null, isLoading: false }) },
      search: { useQuery: () => ({ data: null, isLoading: false }) },
    },
  },
}));
```

Also mock sub-components that have external dependencies:

```typescript
vi.mock("../ToolPicker", () => ({ ToolPicker: () => null }));
vi.mock("../ModelPicker", () => ({ ModelPicker: () => null }));
vi.mock("../guardrails/GuardrailsPanel", () => ({ GuardrailsPanel: () => null }));
```

**Important rendering note:** The `NodePropertyPanel` requires props including `node`, `onChange`, `onClose`, `onDelete`. The Intelligence section is inside `AgentSupervisorForm` which is rendered when `nodeType` is `"agent"` or `"supervisor"`. To open the Intelligence collapsible, find the button containing "Intelligence" text and click it.

---

## Implementation Guidance

### UI Layout within Intelligence Section

```
[Separator]
[v] Intelligence                          [toggle arrow]
    Execution Mode
    [Standard         v]                  <-- Select dropdown

    (when "Agentic" selected:)
    Planning Strategy
    [Basic            v]                  <-- Select dropdown

    Max Reflection Cycles          3
    [----====---------]                   <-- range slider 1-10

    Show Reasoning                [  ]    <-- Switch toggle

    [! Agentic mode may use 2-5x more credits per run]  <-- warning banner
```

### Backward Compatibility

- The `nodeConfig` field is already `z.record(z.unknown()).optional()` in the Zod schema. No structural change needed -- the new validation is additive within `superRefine`.
- All new `nodeConfig` fields default to safe values (`single_shot`, `basic`, `3`, `false`). Existing agencies that lack these fields will behave identically to current behavior.
- The frontend reads defaults via `ncGet(node, key, defaultValue)` which returns the fallback when the key is absent.

### Consistency with Neighboring Sections

- **section-02** reads `nodeConfig.executionMode`, `nodeConfig.planningStrategy`, `nodeConfig.maxReflectionCycles` from the database. The field names, value enums, and ranges must match exactly between frontend and backend.
- **section-04** registers the `agencyAgenticModeEnabled` feature flag. The Intelligence UI section should ideally be hidden when this flag is disabled, but the flag check is handled in section-04 -- this section focuses on the UI structure itself.

### Key File Paths

- `/home/dev/projects/SmartSpecPro/apps/web/client/src/components/agency/NodePropertyPanel.tsx` -- modify `AgentSupervisorForm`
- `/home/dev/projects/SmartSpecPro/apps/web/server/routers/agency.ts` -- modify `saveBuilder` superRefine
- `/home/dev/projects/SmartSpecPro/apps/web/client/src/components/agency/__tests__/AgenticConfig.test.tsx` -- create new test file
- `/home/dev/projects/SmartSpecPro/apps/web/client/src/components/agency/nodes/types.ts` -- reference only (no changes needed; `nodeConfig` is already `Record<string, unknown>`)