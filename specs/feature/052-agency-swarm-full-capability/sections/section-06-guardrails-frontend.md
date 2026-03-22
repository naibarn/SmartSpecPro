I now have enough context. Let me produce the section.

# Section 06 — Guardrails Frontend

## Section ID
`section-06-guardrails-frontend`

## Dependencies
- **section-01-database-migration**: `agency_guardrails` and `agency_agent_guardrails` tables must exist.
- **section-05-guardrails-backend**: tRPC procedures (`createGuardrail`, `updateGuardrail`, `deleteGuardrail`, `listGuardrails`, `testGuardrail`, `assignGuardrailToAgent`, `removeGuardrailFromAgent`) must be available. This section consumes them from the frontend.

## Goal

Build the guardrails management UI inside the AgencyBuilder sidebar. Users create, edit, assign, and test guardrails for individual agents or across an entire agency. Each of the 7 guardrail strategies has a dedicated configuration form. A test panel lets users validate guardrails against sample text before activating them.

---

## Files to Create

| File | Purpose |
|------|---------|
| `apps/web/client/src/components/agency/guardrails/GuardrailsPanel.tsx` | Main panel component rendered in AgencyBuilder sidebar |
| `apps/web/client/src/components/agency/guardrails/GuardrailForm.tsx` | Create/edit form with strategy-specific sub-forms |
| `apps/web/client/src/components/agency/guardrails/GuardrailStrategyFields.tsx` | Strategy-specific config fields for all 7 strategies |
| `apps/web/client/src/components/agency/guardrails/GuardrailTestPanel.tsx` | Test guardrail with sample text, show pass/fail |
| `apps/web/client/src/components/agency/guardrails/GuardrailCard.tsx` | Read-only card rendering a single guardrail with edit/delete actions |
| `apps/web/client/src/components/agency/guardrails/types.ts` | Shared TypeScript types for guardrail UI state |
| `apps/web/client/src/components/agency/__tests__/GuardrailsPanel.test.tsx` | Unit tests for the guardrails panel |
| `apps/web/client/src/components/agency/__tests__/GuardrailForm.test.tsx` | Unit tests for the guardrail form |
| `apps/web/client/src/components/agency/__tests__/GuardrailTestPanel.test.tsx` | Unit tests for the test panel |

## Files to Modify

| File | Change |
|------|--------|
| `apps/web/client/src/components/agency/NodePropertyPanel.tsx` | Add "Guardrails" collapsible section for agent/supervisor node types |
| `apps/web/client/src/components/agency/AgencySidebar.tsx` | Add "Guardrails" tab for agency-wide guardrail management |
| `apps/web/client/src/components/agency/nodes/types.ts` | Extend `AgencyNodeData` with optional `guardrails` array reference |

---

## TDD Test Specifications

### Test File: `apps/web/client/src/components/agency/__tests__/GuardrailsPanel.test.tsx`

```
# @vitest-environment jsdom

# Setup: mock trpc.agency.listGuardrails.useQuery, trpc.agency.deleteGuardrail.useMutation,
#        trpc.agency.assignGuardrailToAgent.useMutation, trpc.agency.removeGuardrailFromAgent.useMutation

Test: renders empty state with "Add Guardrail" button when no guardrails exist
  - Mock listGuardrails returns empty array
  - Expect "No guardrails" message and an "Add Guardrail" button

Test: renders list of guardrail cards when guardrails exist
  - Mock listGuardrails returns 2 guardrails (keyword_block, pii_detection)
  - Expect 2 GuardrailCard elements with correct names

Test: clicking "Add Guardrail" opens GuardrailForm in create mode
  - Click add button
  - Expect form to be visible with empty fields

Test: clicking edit on a guardrail card opens GuardrailForm in edit mode
  - Click edit icon on first card
  - Expect form pre-populated with guardrail data

Test: clicking delete triggers confirmation dialog before calling deleteGuardrail
  - Click delete icon
  - Expect confirmation dialog
  - Confirm
  - Expect deleteGuardrail mutation called with correct guardrailId

Test: filters guardrails by type (input/output) tab
  - Mock 3 guardrails: 2 input, 1 output
  - Click "Output" tab
  - Expect only 1 card visible

Test: drag-to-reorder updates sortOrder via tRPC
  - Render 3 guardrails
  - Simulate reorder (via sortable callback)
  - Expect updateGuardrail called with new sortOrder values
```

### Test File: `apps/web/client/src/components/agency/__tests__/GuardrailForm.test.tsx`

```
# @vitest-environment jsdom

# Setup: mock trpc.agency.createGuardrail.useMutation, trpc.agency.updateGuardrail.useMutation

Test: renders name, type (input/output), mode (guidance/strict) fields
  - Render form in create mode
  - Expect name input, type select, mode select

Test: selecting strategy shows corresponding config fields
  - Select "keyword_block" → expect keywords textarea
  - Select "regex_match" → expect pattern input + action select
  - Select "llm_classify" → expect prompt textarea + blockIf input + optional model select
  - Select "json_schema" → expect JSON schema textarea with validation
  - Select "max_length" → expect maxChars number input
  - Select "pii_detection" → expect checkboxes for email/phone/SSN + action radio (block/redact)
  - Select "custom_endpoint" → expect URL input + optional headers JSON

Test: keyword_block config requires at least one keyword
  - Enter empty keywords
  - Submit form
  - Expect validation error "At least one keyword required"

Test: regex_match config validates regex pattern syntax
  - Enter "[invalid" as pattern
  - Submit form
  - Expect validation error "Invalid regex pattern"

Test: max_length config requires positive integer for maxChars
  - Enter 0 or negative number
  - Submit form
  - Expect validation error

Test: custom_endpoint validates URL format
  - Enter "not-a-url"
  - Submit form
  - Expect validation error

Test: json_schema config validates JSON syntax
  - Enter malformed JSON
  - Submit form
  - Expect validation error "Invalid JSON"

Test: submit in create mode calls createGuardrail with correct payload
  - Fill name, type=input, mode=strict, strategy=keyword_block, config={keywords:["test"]}
  - Submit
  - Expect createGuardrail mutation called with matching args

Test: submit in edit mode calls updateGuardrail with guardrailId
  - Render with existing guardrail data
  - Change name
  - Submit
  - Expect updateGuardrail called with id and updates

Test: shows validationAttempts field only when type is "output"
  - Select type=input → validationAttempts hidden
  - Select type=output → validationAttempts shown with default 1

Test: shows enforceOnHandoff toggle only when type is "input"
  - Select type=output → toggle hidden
  - Select type=input → enforceOnHandoff toggle visible
```

### Test File: `apps/web/client/src/components/agency/__tests__/GuardrailTestPanel.test.tsx`

```
# @vitest-environment jsdom

# Setup: mock trpc.agency.testGuardrail.useMutation

Test: renders sample text input and "Test" button
  - Render with a guardrail config
  - Expect textarea and test button

Test: clicking "Test" with empty text shows validation error
  - Leave textarea empty, click Test
  - Expect "Enter sample text" error

Test: successful test shows "Passed" badge with green styling
  - Mock testGuardrail returns { passed: true, message: null }
  - Enter text, click Test
  - Expect "Passed" badge

Test: failed test shows "Blocked" badge with guardrail message
  - Mock testGuardrail returns { passed: false, message: "Contains blocked keyword", action: "block" }
  - Enter text, click Test
  - Expect "Blocked" badge and message displayed

Test: shows loading spinner while testing
  - Mock testGuardrail with delay
  - Click Test
  - Expect spinner visible and button disabled

Test: PII redaction result shows redacted text preview
  - Mock testGuardrail returns { passed: true, message: null, action: "redact", redactedText: "Contact [REDACTED] for info" }
  - Expect redacted text shown in preview area
```

---

## Implementation Guidance

### types.ts

Define the following interfaces, derived from the `agency_guardrails` schema (section-01) and the tRPC router output types (section-05):

```
GuardrailStrategy — union literal of 7 values: "keyword_block" | "regex_match" | "llm_classify" | "json_schema" | "max_length" | "pii_detection" | "custom_endpoint"

GuardrailType — "input" | "output"

GuardrailMode — "guidance" | "strict"

GuardrailConfig — discriminated union by strategy:
  - keyword_block: { keywords: string[] }
  - regex_match: { pattern: string; action: "block" | "require" }
  - llm_classify: { prompt: string; blockIf: string; model?: string }
  - json_schema: { schema: Record<string, unknown> }
  - max_length: { maxChars: number }
  - pii_detection: { detectEmail: boolean; detectPhone: boolean; detectSSN: boolean; action: "block" | "redact" }
  - custom_endpoint: { url: string; headers?: Record<string, string> }

Guardrail — full guardrail object:
  id, tenantId, agencyId, name, type, mode, strategy, config, validationAttempts, enforceOnHandoff?, isEnabled, sortOrder, createdAt, updatedAt

GuardrailTestResult — { passed: boolean; message: string | null; action?: string; redactedText?: string }
```

### GuardrailsPanel.tsx

- Accepts props: `agencyId: string`, `agentId?: string` (when opened from NodePropertyPanel for a specific agent), `tenantId: string`.
- Uses `trpc.agency.listGuardrails.useQuery({ agencyId })` to fetch all guardrails for the agency.
- When `agentId` is provided, also fetch agent-specific assignments and show assigned guardrails first, with unassigned guardrails available to add.
- Two sub-tabs: "Input" and "Output" to filter guardrails by type.
- Each guardrail rendered as a `GuardrailCard` with: name, strategy badge (colored by strategy), mode badge (guidance=yellow, strict=red), enabled toggle, edit button, delete button.
- "Add Guardrail" button at the bottom opens `GuardrailForm`.
- Reorder via drag handle (use existing `GripVertical` icon pattern from NodePropertyPanel). On reorder, call `updateGuardrail` with new `sortOrder` values.
- When `agentId` is set, show assign/unassign toggle per guardrail (calls `assignGuardrailToAgent` / `removeGuardrailFromAgent`).

### GuardrailForm.tsx

- Controlled form using React state (not React Hook Form -- match existing agency component patterns which use controlled state + onChange).
- Fields:
  - `name` (text input, required, max 100 chars)
  - `type` (select: input/output)
  - `mode` (select: guidance/strict)
  - `strategy` (select: 7 options with icons)
  - Strategy-specific config (delegated to `GuardrailStrategyFields`)
  - `validationAttempts` (number, shown only when type=output, min 1, max 5, default 1)
  - `enforceOnHandoff` (toggle, shown only when type=input)
  - `isEnabled` (toggle, default true)
- Strategy select: render each option with a descriptive label and icon:
  - keyword_block: "Keyword Block" (Ban icon)
  - regex_match: "Regex Match" (Regex icon or Code icon)
  - llm_classify: "LLM Classification" (Brain icon)
  - json_schema: "JSON Schema Validation" (FileJson icon)
  - max_length: "Max Length" (Ruler icon)
  - pii_detection: "PII Detection" (ShieldAlert icon)
  - custom_endpoint: "Custom Endpoint" (Globe icon)
- On submit: call `createGuardrail` (create mode) or `updateGuardrail` (edit mode) via tRPC mutation.
- Client-side validation before submit:
  - Name required
  - Strategy-specific validation (see tests above)
  - Regex pattern compiled in try/catch to validate syntax
  - JSON schema parsed via `JSON.parse` to validate syntax
  - Custom endpoint URL validated as proper URL format

### GuardrailStrategyFields.tsx

- Accepts `strategy: GuardrailStrategy`, `config: GuardrailConfig`, `onChange: (config) => void`.
- Renders strategy-specific fields based on the `strategy` prop (switch statement).
- Each strategy sub-form:
  - **keyword_block**: Textarea for comma-separated keywords. Parse on blur/submit into string array. Show chip preview below textarea.
  - **regex_match**: Text input for regex pattern. Select for action (block/require). Show real-time regex validation feedback.
  - **llm_classify**: Textarea for classification prompt. Text input for `blockIf` condition. Optional model picker (reuse `ModelPicker` component from agency). Helper text explaining that this adds latency due to LLM call.
  - **json_schema**: Textarea with monospace font for JSON schema. Toggle between raw JSON and a "visual" hint (just syntax-highlighted display). Validate JSON on blur.
  - **max_length**: Number input for `maxChars`. Min 1.
  - **pii_detection**: Checkboxes for `detectEmail`, `detectPhone`, `detectSSN`. Radio group for action (block/redact). When redact is selected, show info text: "PII will be replaced with [REDACTED]".
  - **custom_endpoint**: URL input. Optional textarea for headers (JSON format). SSRF warning text below URL input.

### GuardrailTestPanel.tsx

- Accepts `guardrail: Guardrail` (the full guardrail object to test).
- Renders a textarea for sample text and a "Test" button.
- On click: calls `trpc.agency.testGuardrail.useMutation` with `{ guardrailId, sampleText }`.
- Shows result:
  - Passed: green check badge + "Passed"
  - Blocked: red X badge + "Blocked" + guardrail message
  - Redacted: amber badge + "Redacted" + shows before/after text comparison
- Loading state: spinner on button, textarea disabled.

### GuardrailCard.tsx

- Accepts `guardrail: Guardrail`, `onEdit`, `onDelete`, `onToggleEnabled`, `assigned?: boolean`, `onToggleAssign?`.
- Renders a compact card (matching existing ToolPicker card styling):
  - Left: strategy icon (colored by strategy type)
  - Center: name, strategy label, type badge (input=blue, output=purple), mode badge (guidance=yellow, strict=red)
  - Right: enabled switch, edit icon button, delete icon button
  - If `onToggleAssign` provided: show assign/unassign toggle on far right
- Disabled guardrails shown with reduced opacity.

### NodePropertyPanel.tsx Modifications

- For `agent` and `supervisor` node types, add a collapsible "Guardrails" section after the existing "Tools" section.
- Section header: "Guardrails" with Shield icon and count badge showing number of assigned guardrails.
- Expanded state shows an embedded `GuardrailsPanel` with `agentId` set to the current node's agent ID.
- Collapsed by default to avoid overwhelming the property panel.

### AgencySidebar.tsx Modifications

- Add a new tab "Guardrails" (Shield icon) alongside existing "Nodes" and "Templates" tabs.
- This tab renders a full-width `GuardrailsPanel` without `agentId` (agency-wide view).
- Shows all guardrails for the agency with the ability to create, edit, delete, and test them.
- Agency-wide guardrails can then be assigned to specific agents via the NodePropertyPanel.

### AgencyNodeData Extension (types.ts)

- Add optional field: `guardrailIds?: string[]` to `AgencyNodeData` interface.
- This is a client-side reference only -- actual assignment is managed through the `agency_agent_guardrails` junction table via tRPC.

---

## UI/UX Details

### Strategy Colors (for badges and icons)

| Strategy | Color | Icon (lucide-react) |
|----------|-------|---------------------|
| keyword_block | red | `Ban` |
| regex_match | blue | `Code` |
| llm_classify | purple | `Brain` |
| json_schema | cyan | `FileJson` |
| max_length | orange | `Ruler` |
| pii_detection | amber | `ShieldAlert` |
| custom_endpoint | green | `Globe` |

### Mode Badges

- `guidance` mode: yellow/amber badge with text "Guidance" -- indicates the guardrail provides a warning message but does not block execution.
- `strict` mode: red badge with text "Strict" -- indicates the guardrail blocks execution on violation.

### Type Badges

- `input` type: blue badge -- runs before the agent processes a message.
- `output` type: purple badge -- runs after the agent produces a response.

---

## Integration Notes

- The `testGuardrail` tRPC procedure (from section-05) accepts `{ guardrailId: string, sampleText: string }` and returns `{ passed: boolean, message: string | null, action?: string, redactedText?: string }`. It calls the Python guardrail execution engine server-side.
- All guardrail CRUD mutations should invalidate the `listGuardrails` query cache using `utils.agency.listGuardrails.invalidate()` on success.
- The `ModelPicker` component (existing at `apps/web/client/src/components/agency/ModelPicker.tsx`) should be reused for the `llm_classify` strategy's optional model field.
- Follow existing agency component patterns: Radix UI primitives, Tailwind utility classes, lucide-react icons, cn() utility for conditional classes.
- The `ScrollArea` component should wrap the guardrails list when it exceeds the panel height.
- Toast notifications (Sonner) for success/error on create/update/delete/test operations.