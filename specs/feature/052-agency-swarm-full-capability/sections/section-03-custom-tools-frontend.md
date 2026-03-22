Now I have sufficient context. Let me produce the section.

# Section 03 — Custom Tools Frontend

## Overview

This section implements the frontend components for custom tool CRUD: `CustomToolCreator.tsx` form wizard, `JsonSchemaEditor.tsx` reusable component, and modifications to the existing `ToolPicker.tsx` and `AgencySidebar.tsx` to surface custom tools alongside builtins.

**Depends on**: section-01 (database migration), section-02 (tRPC backend procedures: `createCustomTool`, `updateCustomTool`, `deleteCustomTool`, `listCustomTools`, `testCustomTool`)

**Blocks**: Nothing directly; other frontend sections (04 OpenAPI Import Modal, 06 Guardrails Frontend) may reference patterns established here.

---

## Files to Create

| File | Purpose |
|------|---------|
| `apps/web/client/src/components/agency/CustomToolCreator.tsx` | Multi-step form wizard for creating/editing custom tools |
| `apps/web/client/src/components/agency/JsonSchemaEditor.tsx` | Reusable JSON Schema editor (visual + raw toggle) |
| `apps/web/client/src/components/agency/__tests__/CustomToolCreator.test.tsx` | Tests for custom tool form wizard |
| `apps/web/client/src/components/agency/__tests__/JsonSchemaEditor.test.tsx` | Tests for JSON Schema editor |
| `apps/web/client/src/components/agency/__tests__/ToolPickerCustom.test.tsx` | Tests for extended ToolPicker with custom tools |

## Files to Modify

| File | Changes |
|------|---------|
| `apps/web/client/src/components/agency/ToolPicker.tsx` | Add "Create Custom Tool" button, custom badge rendering, edit/delete actions |
| `apps/web/client/src/components/agency/AgencySidebar.tsx` | Add "Custom Tools" management link/button |
| `apps/web/client/src/components/agency/NodePropertyPanel.tsx` | Surface custom tool badge on assigned tools list |

---

## TDD — Tests to Write First

### Test File: `apps/web/client/src/components/agency/__tests__/CustomToolCreator.test.tsx`

```
# Test: renders step 1 (name/description) as initial view
# Test: validates required fields before allowing next step
# Test: step 2 shows endpoint URL input, HTTP method select, and headers key-value editor
# Test: step 3 renders JsonSchemaEditor for inputSchema
# Test: step 4 shows test panel with sample input and run button
# Test: calls trpc.agency.createCustomTool.mutate on save with correctly shaped payload
# Test: calls trpc.agency.updateCustomTool.mutate when editing existing tool (toolId prop)
# Test: displays server validation errors (e.g., SSRF blocked, name not unique)
# Test: disables save button while mutation is pending
# Test: navigating back between steps preserves entered data
# Test: headers are sent as plaintext — backend handles encryption (no client-side encrypt)
```

### Test File: `apps/web/client/src/components/agency/__tests__/JsonSchemaEditor.test.tsx`

```
# Test: renders empty state with "Add Property" button
# Test: adds a property with name, type (string/number/boolean/array/object), and required toggle
# Test: removes a property via delete button
# Test: toggles between visual editor and raw JSON textarea
# Test: raw JSON textarea syncs back to visual editor on valid JSON
# Test: raw JSON textarea shows error indicator on invalid JSON
# Test: onChange fires with valid JSON Schema object on every edit
# Test: handles nested object properties (one level deep)
# Test: enforces max 20 properties (UI limit for usability)
```

### Test File: `apps/web/client/src/components/agency/__tests__/ToolPickerCustom.test.tsx`

```
# Test: renders "Custom" group section when custom tools exist in listTools response
# Test: custom tools display a "Custom" badge (not "Built-in")
# Test: "Create Custom Tool" button appears at bottom of tool list
# Test: clicking "Create Custom Tool" opens CustomToolCreator dialog
# Test: custom tools with configSchema show step-2 config form on click (existing behavior)
# Test: disabled custom tools (isEnabled=false) are excluded from the list
# Test: edit icon on custom tool opens CustomToolCreator in edit mode
```

---

## Implementation Guidance

### 1. CustomToolCreator.tsx

A multi-step dialog/sheet component with 4 steps. Use existing Dialog or Sheet from `@smartspec/ui` (Radix-based). Pattern follows the existing `AutoCreateAgencyModal.tsx` stepper approach.

**Component signature (stub)**:

```typescript
interface CustomToolCreatorProps {
  open: boolean;
  onClose: () => void;
  /** If provided, the form pre-fills for edit mode */
  editToolId?: string;
  /** Called after successful create/update */
  onSuccess?: () => void;
}
```

**Step 1 — Basic Info**:
- `name` (Input, max 100 chars)
- `description` (Textarea, max 500 chars)
- `icon` (optional, select from lucide icon subset or text input)
- `category` (optional, Input or Select)
- `riskLevel` (Select: low / medium / high, default low)

**Step 2 — Endpoint Configuration**:
- `endpoint` (Input, URL, required)
- `httpMethod` (Select: GET / POST / PUT / DELETE, default POST)
- `headers` — Dynamic key-value pair list (Button to add row, X to remove). Keys and values are plain strings; backend encrypts via `headersEncrypted` column.
- `retryPolicy.maxRetries` (Input, number, 0-5)
- `retryPolicy.backoffMs` (Input, number, default 1000)
- `strictSchema` (Switch, default false, tooltip: "Enforce exact JSON Schema match")
- `oneCallAtATime` (Switch, default false, tooltip: "Prevent concurrent calls")

**Step 3 — JSON Schema**:
- Renders `<JsonSchemaEditor>` for `inputSchema`.
- Optional `outputSchema` section (collapsible, same editor).

**Step 4 — Test & Save**:
- Sample input textarea (pre-filled from inputSchema defaults if any).
- "Test Tool" button calls `trpc.agency.testCustomTool.mutate({ toolId_or_tempConfig, sampleInput })`.
- Display test result (status, response body, latency).
- "Save" button calls `createCustomTool` or `updateCustomTool`.

**State management**: Use `useState` for current step index and a single form state object. Use `React Hook Form` + Zod resolver if the form complexity warrants it, or plain controlled state (matching the simpler pattern used in `NodePropertyPanel.tsx`).

**tRPC mutations**: Use `(trpc as any).agency.createCustomTool.useMutation()` and similarly for update/test. Invalidate `agency.listTools` query cache on success.

### 2. JsonSchemaEditor.tsx

A reusable component for editing JSON Schema objects in the UI. Two modes toggled by a button:

**Visual mode**: A list of property rows, each with:
- Property name (Input)
- Type (Select: string, number, integer, boolean, array, object)
- Required (Checkbox)
- Description (Input, optional)
- Delete button (Trash2 icon)
- "Add Property" button at the bottom

**Raw mode**: A monospace `<Textarea>` with the JSON Schema as text. Parse on blur or debounce. Show validation feedback (green check or red X).

**Component signature (stub)**:

```typescript
interface JsonSchemaEditorProps {
  value: Record<string, unknown> | null;
  onChange: (schema: Record<string, unknown>) => void;
  /** Max number of top-level properties */
  maxProperties?: number;
  className?: string;
}
```

The component produces a standard JSON Schema `{ type: "object", properties: {...}, required: [...] }` shape.

### 3. ToolPicker.tsx Modifications

Extend the existing `ToolPicker.tsx` (located at `/home/dev/projects/SmartSpecPro/apps/web/client/src/components/agency/ToolPicker.tsx`).

**Changes**:

1. **"Create Custom Tool" button**: Add a button at the bottom of the tool list (below all groups). Clicking it opens `<CustomToolCreator open={...} />`. After creation, the tool list refreshes (TanStack Query invalidation).

2. **Custom tool badge**: The existing `TYPE_LABELS` map already has `custom: "Custom"`. Verify that custom tools from `listTools` have `toolType: "custom"` or `"http_api"`. Update `TYPE_LABELS` if the backend returns `http_api` / `openapi_import` / `mcp_bridge` as `toolType`:
   ```typescript
   const TYPE_LABELS: Record<string, string> = {
     builtin: "Built-in",
     skill: "Skill",
     sandbox: "Sandbox",
     custom: "Custom",
     http_api: "Custom API",
     openapi_import: "OpenAPI",
     mcp_bridge: "MCP",
   };
   ```

3. **Edit/delete actions on custom tools**: For tools with `toolType !== "builtin"` and `toolType !== "sandbox"`, render small icon buttons (Pencil, Trash2) on hover. Edit opens `CustomToolCreator` in edit mode. Delete calls `trpc.agency.deleteCustomTool.mutate`.

4. **Filtering**: The existing search and group filtering logic handles new types naturally via the `grouped` useMemo. No structural changes needed — just ensure the group headers render correctly for new type keys.

### 4. AgencySidebar.tsx Modifications

File: `/home/dev/projects/SmartSpecPro/apps/web/client/src/components/agency/AgencySidebar.tsx`

Add a "Custom Tools" button or link in the sidebar, below the node type sections. This button opens the `CustomToolCreator` dialog for creating tools without going through the ToolPicker flow. Use the existing sidebar styling patterns (compact buttons with icons).

**Implementation approach**: Add a new section at the bottom of the sidebar with a `Wrench` icon and "Manage Custom Tools" label. Clicking it could open a tools management panel or dialog listing existing custom tools with create/edit/delete actions. Keep this lightweight — the primary creation flow is through `ToolPicker`.

### 5. NodePropertyPanel.tsx Modifications

File: `/home/dev/projects/SmartSpecPro/apps/web/client/src/components/agency/NodePropertyPanel.tsx`

In the tools list section (where assigned tools are shown per agent), add a visual badge to distinguish custom tools from builtin ones. The existing tool list items show `toolId` and `toolName` — add a small `<Badge variant="outline">Custom</Badge>` next to custom tool names. Determine "custom" by checking if the `toolId` does not start with `"builtin-"`.

---

## Key Integration Points

### tRPC Procedures (from section-02)

The following procedures must exist before this section can be fully implemented:

| Procedure | Usage in Frontend |
|-----------|-------------------|
| `agency.createCustomTool` | Called by CustomToolCreator on save (create mode) |
| `agency.updateCustomTool` | Called by CustomToolCreator on save (edit mode) |
| `agency.deleteCustomTool` | Called by ToolPicker delete action |
| `agency.listCustomTools` | Used by tools management panel (if separate from listTools) |
| `agency.testCustomTool` | Called by CustomToolCreator step 4 test button |
| `agency.listTools` | Already exists; must include custom tools in response |

The existing `agency.listTools` procedure already queries `agencyTools` table and returns them alongside builtins. After section-02 adds new columns (`inputSchema`, `httpMethod`, etc.), the query response shape will include these fields. The frontend should handle their presence gracefully (optional chaining).

### Feature Flag

Gate the "Create Custom Tool" button and custom tool management behind the `AGENCY_CUSTOM_TOOLS_ENABLED` feature flag. Use the existing `useTenantFeatureFlag` hook:

```typescript
const customToolsEnabled = useTenantFeatureFlag("AGENCY_CUSTOM_TOOLS_ENABLED");
```

If the flag is disabled, hide the "Create Custom Tool" button but still show any existing custom tools (read-only, no edit/delete).

### UI Component Dependencies

All UI primitives come from `@smartspec/ui` (Radix-based) already used throughout the agency builder:
- `Dialog`, `DialogContent`, `DialogHeader`, `DialogTitle`
- `Input`, `Textarea`, `Label`, `Switch`
- `Select`, `SelectContent`, `SelectItem`, `SelectTrigger`, `SelectValue`
- `Button`, `Badge`, `ScrollArea`, `Separator`
- `Tooltip`, `TooltipContent`, `TooltipTrigger`

Icons from `lucide-react`: `Wrench`, `Plus`, `Trash2`, `Pencil`, `Play`, `Check`, `AlertTriangle`, `Code`, `Eye`, `ArrowLeft`, `ArrowRight`, `Loader2`.

### Styling Conventions

Follow the existing agency component patterns:
- Tailwind utility classes with `cn()` helper for conditional classes
- Compact sizing: `text-xs`, `h-7` inputs, `size="sm"` buttons
- Dark mode support via `dark:` Tailwind variants
- Color scheme consistent with existing tool risk badges in `ToolPicker.tsx` (`RISK_STYLES` map)

### Error Handling

- Display tRPC mutation errors using Sonner toast (`toast.error(error.message)`)
- For SSRF validation failures, the backend returns a descriptive error message — display it inline below the endpoint field
- For rate limit errors (429), show a toast with retry-after information
- For the 50-tool-per-tenant cap, show an inline warning when approaching the limit (e.g., "45/50 custom tools") and block creation at 50