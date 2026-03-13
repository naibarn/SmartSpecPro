# Section 07: SkillSettings Model Resolution Preview

## Implementation Status: COMPLETE

## Overview

Added admin-facing model resolution preview. Key implementations:
1. `previewModelResolution` adminProcedure query in `skills.ts` — loads skill by ID, calls `resolveSkillExecutionPolicy()`, returns diagnostic fields
2. `SkillModelPreviewPanel` component — collapsible panel with lazy-load, debounced auto-refresh, 4 display states
3. Panel integrated into `AdminSkills.tsx` edit dialog after Content Quality section

**Depends on:** Section 04 (extended `SkillExecutionPolicyResult` with matchedCapabilities, requirementsFallback, modelSource "requirements_match").

### Tests: 6 passing

### Deviations from plan
- `SkillModelPreviewPanel` placed in separate file (`SkillModelPreviewPanel.tsx`) not appended to `SkillSettings.tsx`
- `requirementsVersion` prop not wired to form changes (would require threading onChange through all execution policy fields); panel has manual refresh button instead
- Component test stubs (8 in plan) deferred — require JSDOM + tRPC mock provider setup
- Admin role test deferred — mock tRPC procedures bypass auth in unit tests

This section depends on **Section 04** (extended `resolveSkillExecutionPolicy()` return type, which adds `matchedCapabilities`, `requirementsFallback`, and `modelSource: "requirements_match"`).

---

## Dependencies

- **Section 04 must be complete** before this section is implemented. Specifically, `SkillExecutionPolicyResult` must include:
  - `matchedCapabilities?: string[]`
  - `requirementsFallback?: boolean`
  - `modelSource` union extended with `"requirements_match"`
- The `adminProcedure` helper is already imported in `apps/web/server/routers/skills.ts` (line 7).
- `resolveSkillExecutionPolicy` and `SkillExecutionPolicyInput` are exported from `apps/web/server/services/skillExecutionPolicy.ts`.
- `loadEnabledLlmModelRows` is exported from `apps/web/server/services/enabledLlmModels.ts`.

---

## Tests First

**New test file:** `apps/web/server/routers/skills.previewModelResolution.test.ts`

(No existing skills router test file exists. Create this as a new file targeting the `previewModelResolution` query specifically.)

```typescript
describe("skills.previewModelResolution", () => {
  it("returns modelId and modelSource for a skill with requirements")
  // Setup: skill in DB with executionPolicyJson.requirements set
  // Mock resolveSkillExecutionPolicy to return { modelId: "claude-sonnet-4-6", modelSource: "requirements_match", matchedCapabilities: ["vision"], requirementsFallback: false }
  // Call query with { skillId: skill.id }
  // Expect: response.modelId === "claude-sonnet-4-6", response.modelSource === "requirements_match"

  it("returns fallback info when requirements match nothing")
  // Mock resolveSkillExecutionPolicy to return { modelId: "gpt-4o", modelSource: "system_default", requirementsFallback: true }
  // Expect: response.requirementsFallback === true

  it("returns system default when no requirements and no llmModelId")
  // Skill has no executionPolicyJson.requirements, no llmModelId
  // Expect: response.modelSource === "system_default"

  it("requires admin role")
  // Call with non-admin context
  // Expect: TRPCError UNAUTHORIZED

  it("returns matchedCapabilities list")
  // Mock returns matchedCapabilities: ["functionTools", "structuredOutput"]
  // Expect: response.matchedCapabilities contains those values

  it("returns requirementsFallback=true when fallback used")
  // Mock returns requirementsFallback: true
  // Expect: response.requirementsFallback === true

  it("returns availableModelCount from loaded rows")
  // Mock loadEnabledLlmModelRows to return array of 5 rows
  // Expect: response.availableModelCount === 5

  it("returns 404 when skillId does not exist")
  // Call with non-existent skillId
  // Expect: TRPCError NOT_FOUND
})
```

---

## Backend: `skills.previewModelResolution` tRPC Query

**File to modify:** `apps/web/server/routers/skills.ts`

### New imports needed at the top of the file

Add alongside existing service imports:

```typescript
import { resolveSkillExecutionPolicy } from "../services/skillExecutionPolicy";
import { loadEnabledLlmModelRows } from "../services/enabledLlmModels";
```

### Procedure definition

Add a new procedure inside the `skillsRouter` export object (place it near other admin-only queries, e.g., after `listEditable` around line 1763):

```typescript
previewModelResolution: adminProcedure
  .input(z.object({
    skillId: z.number().int(),
    conversationModel: z.string().optional(),
  }))
  .query(async ({ input }) => {
    /**
     * Loads the skill, calls resolveSkillExecutionPolicy(), and returns
     * the resolved model with diagnostic fields for admin preview.
     * No side effects — read-only.
     */
  }),
```

### Implementation logic

The procedure body should:

1. Load the skill from the `skills` table using `input.skillId`. Throw `TRPCError({ code: "NOT_FOUND" })` if no row found.
2. Convert the DB row into a `SkillDefinition`-compatible shape (just the fields needed by `resolveSkillExecutionPolicy`: `llmModelId`, `defaultModel`, `preferredProviderId`, `strictProviderPin`, `executionPolicy`). Pull `executionPolicyJson` from the DB row and cast it into the `executionPolicy` field on the skill.
3. Load enabled model rows in parallel (or sequentially): `const rows = await loadEnabledLlmModelRows()`.
4. Call `resolveSkillExecutionPolicy({ skill, conversationModel: input.conversationModel })`.
5. Return the following shape:

```typescript
{
  modelId: result.modelId,
  modelSource: result.modelSource,
  matchedCapabilities: result.matchedCapabilities ?? [],
  requirementsFallback: result.requirementsFallback ?? false,
  availableModelCount: rows.length,
}
```

**Important:** `resolveSkillExecutionPolicy` already calls `loadEnabledLlmModelRows()` internally (see the existing implementation in `skillExecutionPolicy.ts`). To avoid a redundant DB call, either:
- Call `loadEnabledLlmModelRows()` once and pass rows through (if Section 04 adds an overload that accepts pre-loaded rows), OR
- Accept the double-load as acceptable overhead for a preview-only admin endpoint (not in the hot path).

The simpler approach is to call `resolveSkillExecutionPolicy` as-is (which loads rows internally) and separately call `loadEnabledLlmModelRows()` only to get `availableModelCount`. Document this with a comment noting it is a preview endpoint and the double-load is intentional.

### Return type

The query's inferred output type (TypeScript via tRPC) will be:

```typescript
{
  modelId: string | null;
  modelSource: string;
  matchedCapabilities: string[];
  requirementsFallback: boolean;
  availableModelCount: number;
}
```

No explicit output Zod schema is required — tRPC infers the return type from the implementation.

---

## Frontend: Model Preview Panel in `SkillSettings.tsx`

**File to modify:** `apps/web/client/src/components/chat/settings/SkillSettings.tsx`

The existing component is a per-conversation skill toggle panel (400 lines). This section adds a preview panel that is only meaningful in an admin context where a specific skill is selected for editing. The plan calls for placing it in `SkillSettings.tsx` or `AdminSkills.tsx`.

**Decision:** Add the preview panel as a standalone exported component `SkillModelPreviewPanel` in `SkillSettings.tsx` (or a co-located file), so it can be imported and used from `AdminSkills.tsx` without modifying the existing conversation-scoped `SkillSettings` component.

### New component: `SkillModelPreviewPanel`

**Location:** `apps/web/client/src/components/chat/settings/SkillSettings.tsx` (append to file) or a new file `apps/web/client/src/components/chat/settings/SkillModelPreviewPanel.tsx`

```typescript
interface SkillModelPreviewPanelProps {
  skillId: number;
  /** Optional: when changed, triggers a debounced re-fetch of the preview */
  requirementsVersion?: number | string;
}

export function SkillModelPreviewPanel({ skillId, requirementsVersion }: SkillModelPreviewPanelProps) {
  /**
   * Collapsible panel showing the resolved model for a given skill.
   * - Lazy-loaded: only fetches when expanded or refresh is clicked
   * - Debounced auto-refresh (400ms) when requirementsVersion changes
   * - Shows distinct UI for fixed model, requirements match, fallback, or unconfigured
   */
}
```

### State and data fetching

Use a controlled `enabled` flag on the tRPC query so it only fires on demand:

```typescript
const [isOpen, setIsOpen] = useState(false);
const [fetchEnabled, setFetchEnabled] = useState(false);

const { data, isFetching, refetch } = trpc.skills.previewModelResolution.useQuery(
  { skillId },
  { enabled: fetchEnabled, staleTime: 0 }
);
```

On expand (`isOpen` becoming `true`): set `fetchEnabled = true`.

For debounced auto-refresh when `requirementsVersion` changes:

```typescript
const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

useEffect(() => {
  if (!fetchEnabled) return;
  if (debounceRef.current) clearTimeout(debounceRef.current);
  debounceRef.current = setTimeout(() => { refetch(); }, 400);
  return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
}, [requirementsVersion]);
```

### UI rendering rules

The panel renders one of four states based on `data`:

**1. Requirements match (no fallback):**
```
Would use: claude-sonnet-4-6
Source: requirements_match | Matched: vision, function tools
Available models: 12
```

**2. Requirements fallback (yellow warning):**
```
⚠ No model matched requirements — using system default: gpt-4o
Source: system_default | Available models: 12
```
Use `text-yellow-600` or a `Badge variant="outline"` with amber styling.

**3. Fixed model (no requirements):**
```
Fixed model: claude-sonnet-4-6
Source: skill_llmModelId
```

**4. No configuration (neither requirements nor fixed model):**
```
Requirements not set — using [source: system_default / conversation / skill_defaultModel]
Model: gpt-4o
```

### Collapsible wrapper

Use a simple `<details>` / `<summary>` pattern or a Radix `Collapsible` component if available in the project's UI package. The panel header should read "Model Preview" with a `<RefreshCw>` button on the right side (import from `lucide-react`).

Required lucide-react icons: `ChevronDown`, `ChevronRight`, `RefreshCw`, `AlertTriangle`, `CheckCircle2` — most are already used elsewhere in `AdminSkills.tsx`.

### Integration into `AdminSkills.tsx`

Import and place `SkillModelPreviewPanel` inside the skill edit dialog/form in `AdminSkills.tsx`, below the execution policy section. Pass `skillId={selectedSkill.id}` and a `requirementsVersion` that increments each time the admin modifies requirements fields in the form (e.g., a counter state bumped in the requirements `onChange` handler).

**File to modify:** `apps/web/client/src/pages/AdminSkills.tsx`

No structural changes to `AdminSkills.tsx` are needed beyond:
1. Importing `SkillModelPreviewPanel`
2. Adding a `requirementsVersion` counter state
3. Bumping the counter when requirements-related fields change
4. Rendering `<SkillModelPreviewPanel skillId={...} requirementsVersion={...} />` in the edit form

---

## File Summary

| File | Action |
|------|--------|
| `apps/web/server/routers/skills.ts` | Add `previewModelResolution` adminProcedure query |
| `apps/web/client/src/components/chat/settings/SkillSettings.tsx` | Add `SkillModelPreviewPanel` exported component (append to existing file or new co-located file) |
| `apps/web/client/src/pages/AdminSkills.tsx` | Import and render `SkillModelPreviewPanel` in the skill edit dialog |
| `apps/web/server/routers/skills.previewModelResolution.test.ts` | New test file with 8 test stubs |

---

## Checklist

- [ ] `previewModelResolution` query added to `skillsRouter` in `apps/web/server/routers/skills.ts`
- [ ] Query is admin-only (`adminProcedure`)
- [ ] Query returns `{ modelId, modelSource, matchedCapabilities, requirementsFallback, availableModelCount }`
- [ ] Returns `NOT_FOUND` for unknown `skillId`
- [ ] `SkillModelPreviewPanel` component created and exported
- [ ] Panel is lazy-loaded (no fetch until expanded)
- [ ] Auto-refresh debounced at 400ms when `requirementsVersion` changes
- [ ] Panel shows correct UI for all four states: requirements match, fallback, fixed model, unconfigured
- [ ] Panel integrated into `AdminSkills.tsx` edit dialog
- [ ] `requirementsVersion` bumped when admin edits requirements fields
- [ ] Test file created with 8 stubs matching the plan
- [ ] `pnpm check` passes (TypeScript compiles)