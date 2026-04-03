The section-02 file hasn't been written yet. I have enough from the spec to write section-04. Let me now produce the section content.

---

# Section 04 — `SkillAgencySelector` Component

## Overview

This section implements the `SkillAgencySelector` component, which lives in Step 1 of the Article Composer wizard (`ArticleSettingsStep`). It provides the skill/agency radio group, the filtered skill dropdown, the agency picker modal integration, and the complexity suggestion banner.

**Depends on:** section-02 (composerReducer state shape and `ComposerState` types)
**Blocks:** section-06 (wizard steps consume this component)

---

## Files to Create

| File | Purpose |
|---|---|
| `apps/web/client/src/components/media/composer/SkillAgencySelector.tsx` | Main component |
| `apps/web/client/src/components/media/composer/__tests__/SkillAgencySelector.test.tsx` | Tests |

---

## Background: State Contract from Section 02

The `composerReducer` (section-02) owns these fields that `SkillAgencySelector` reads and mutates via dispatched actions:

```typescript
// From ComposerState (section-02)
executionSource: "skill" | "agency";
skillId: string | null;
agencyId: string | null;
agencyName: string | null;   // display name for review step
```

Actions dispatched by this component (must match the action union in section-02):

```typescript
{ type: "SET_EXECUTION_SOURCE"; payload: "skill" | "agency" }
{ type: "SET_SKILL"; payload: string | null }
{ type: "SET_AGENCY"; payload: { id: string; name: string } | null }
```

---

## Component: `SkillAgencySelector`

**File:** `apps/web/client/src/components/media/composer/SkillAgencySelector.tsx`

### Props Interface

```typescript
export interface SkillAgencySelectorProps {
  /** Current execution source from composer state */
  executionSource: "skill" | "agency";
  /** Currently selected skill ID */
  skillId: string | null;
  /** Currently selected agency ID */
  agencyId: string | null;
  /** Currently selected agency display name */
  agencyName: string | null;
  /** The topic text — used to compute complexity recommendation */
  topic: string;
  /** Dispatch from useReducer in ContentComposerPanel */
  dispatch: React.Dispatch<ComposerAction>;
  /** Optional class name for container */
  className?: string;
}
```

`ComposerAction` is re-exported from `composerReducer.ts` (section-02). Import it as:

```typescript
import type { ComposerAction } from "../composerReducer";
```

### Skill Data Loading

Use `trpc.skills.listFromDb` to load skills filtered to the two categories relevant for article generation:

```typescript
const { data: skillsData, isLoading: skillsLoading } = trpc.skills.listFromDb.useQuery({
  category: undefined,   // fetch all; filter client-side (see note below)
  enabledOnly: true,
  limit: 100,
});
```

**Note:** `listFromDb` accepts only a single `category` string, not an array. Fetch with `enabledOnly: true` and no category filter, then filter the result client-side to include only skills whose `category` is `"chat_assistant"` or `"prompt_enhancement"`:

```typescript
const filteredSkills = useMemo(
  () =>
    (skillsData ?? []).filter((s) =>
      ["chat_assistant", "prompt_enhancement"].includes(s.category ?? ""),
    ),
  [skillsData],
);
```

### Complexity Recommendation Logic

Compute whether to show the agency suggestion banner client-side, without any LLM call:

```typescript
const COMPLEXITY_KEYWORDS = [
  "research", "compare", "analyze", "comprehensive", "multi-step",
  "in-depth", "detailed", "review", "versus", "vs", "pros and cons",
];

function isComplexTopic(topic: string): boolean {
  if (topic.length > 150) return true;
  const lower = topic.toLowerCase();
  return COMPLEXITY_KEYWORDS.some((kw) => lower.includes(kw));
}
```

The banner is:
- Shown when `isComplexTopic(topic)` is `true` AND `executionSource === "skill"`.
- Dismissible: track a local `bannerDismissed` boolean in `useState`.
- Dismissal is local only (not persisted, not in composerReducer).
- Clicking "Switch to Agency" in the banner dispatches `SET_EXECUTION_SOURCE` with `"agency"` and opens the `AgencyPickerModal`.
- Does not force a switch — the "Dismiss" action just hides the banner.

### Agency Picker Integration

`AgencyPickerModal` is imported from `@/components/agency/AgencyPickerModal`. Its props:

```typescript
interface AgencyPickerModalProps {
  open: boolean;
  onClose: () => void;
  onSelect: (agency: { id: string; name: string; description?: string }) => void;
}
```

- Opening: controlled by local `agencyModalOpen` state (`useState<boolean>`).
- When the user selects an agency: dispatch `SET_AGENCY` with `{ id, name }`, close the modal.
- If the user closes without selecting: do not change state.
- The selected agency should be shown as a summary pill: agency name + a "Change" button that reopens the modal.

### Skill Dropdown

When `executionSource === "skill"`, render a `<Select>` (Radix UI / shadcn Select pattern) populated with `filteredSkills`. Each option shows the skill `name`. The selected value is `skillId`.

- On change: dispatch `SET_SKILL` with the new value.
- Loading state: show a disabled Select with placeholder "Loading skills…" while `skillsLoading` is true.
- Empty state: show an informational message "No article skills available" if `filteredSkills.length === 0` after loading.
- If a skill has a `description`, show it as a tooltip or secondary text in the dropdown item.

### Render Structure

```
<div className="space-y-4">
  {/* Execution Source Radio Group */}
  <RadioGroup value={executionSource} onValueChange={...}>
    <RadioGroupItem value="skill" label="Skill" />
    <RadioGroupItem value="agency" label="Agency" />
  </RadioGroup>

  {/* Skill picker — shown when executionSource === "skill" */}
  {executionSource === "skill" && (
    <SkillDropdown ... />
  )}

  {/* Agency summary pill — shown when executionSource === "agency" && agencyId is set */}
  {executionSource === "agency" && agencyId && (
    <AgencySummaryPill agencyName={agencyName} onChangeClick={...} />
  )}

  {/* "Pick an Agency" button — shown when executionSource === "agency" && agencyId is null */}
  {executionSource === "agency" && !agencyId && (
    <Button onClick={() => setAgencyModalOpen(true)}>Pick Agency</Button>
  )}

  {/* Complexity recommendation banner */}
  {showBanner && <ComplexityBanner onDismiss={...} onSwitchToAgency={...} />}

  {/* AgencyPickerModal (portal) */}
  <AgencyPickerModal
    open={agencyModalOpen}
    onClose={() => setAgencyModalOpen(false)}
    onSelect={handleAgencySelect}
  />
</div>
```

Use Radix UI `RadioGroup` / `RadioGroupItem` from `@/components/ui/radio-group` (or the local ui package equivalent). The existing codebase uses `@radix-ui/react-radio-group`.

---

## Tests

**File:** `apps/web/client/src/components/media/composer/__tests__/SkillAgencySelector.test.tsx`

Test framework: Vitest + `@testing-library/react` + jsdom. Match the pattern used in `apps/web/client/src/pages/__tests__/`.

### Test Setup

Mock `@/lib/trpc` to avoid actual network calls. Provide a `mockDispatch` spy using `vi.fn()`. Build a `renderSelector` helper that renders with default props and merges overrides.

```typescript
// Minimal mock shape for trpc.skills.listFromDb
vi.mock("@/lib/trpc", () => ({
  trpc: {
    skills: {
      listFromDb: {
        useQuery: vi.fn().mockReturnValue({
          data: [
            { id: "sk-1", name: "Article Writer", category: "chat_assistant", description: "Writes articles" },
            { id: "sk-2", name: "Prompt Enhancer", category: "prompt_enhancement", description: null },
            { id: "sk-3", name: "Image Prompt", category: "image_generation", description: null },
          ],
          isLoading: false,
        }),
      },
    },
    agency: {
      list: {
        useQuery: vi.fn().mockReturnValue({ data: { agencies: [] }, isLoading: false }),
      },
    },
  },
}));
```

Also mock `AgencyPickerModal` to a simple stub that calls `onSelect` immediately when `open` is `true` (for interaction tests):

```typescript
vi.mock("@/components/agency/AgencyPickerModal", () => ({
  AgencyPickerModal: ({ open, onSelect, onClose }: any) => {
    if (!open) return null;
    return (
      <div data-testid="agency-picker-modal">
        <button onClick={() => onSelect({ id: "ag-1", name: "Research Agency" })}>
          Select Agency
        </button>
        <button onClick={onClose}>Close</button>
      </div>
    );
  },
}));
```

### Test Cases

**Rendering:**

1. **Renders both radio options** — `skill` and `agency` radio buttons are present.
2. **Defaults to "skill" mode** — skill radio is checked when `executionSource="skill"`.
3. **Renders skill dropdown when executionSource is skill** — `<Select>` is visible.
4. **Filters out non-article-generation skills** — `"Image Prompt"` (category `image_generation`) must NOT appear in the dropdown; `"Article Writer"` and `"Prompt Enhancer"` MUST appear.
5. **Renders agency picker button when executionSource is agency and no agency selected** — "Pick Agency" button is visible.
6. **Renders agency name pill when agency is already selected** — agency name and "Change" button visible when `agencyId` and `agencyName` are set.

**Dispatch interactions:**

7. **Switching to agency dispatches SET_EXECUTION_SOURCE** — clicking the "agency" radio triggers `dispatch({ type: "SET_EXECUTION_SOURCE", payload: "agency" })`.
8. **Switching to skill dispatches SET_EXECUTION_SOURCE** — clicking the "skill" radio dispatches accordingly.
9. **Selecting a skill dispatches SET_SKILL** — choosing a skill in the dropdown fires `dispatch({ type: "SET_SKILL", payload: "sk-1" })`.
10. **Clicking "Pick Agency" opens the modal** — `AgencyPickerModal` becomes visible after clicking.
11. **Selecting agency via modal dispatches SET_AGENCY** — after `onSelect` fires, `dispatch` receives `{ type: "SET_AGENCY", payload: { id: "ag-1", name: "Research Agency" } }`.
12. **Closing modal without selecting does not dispatch** — closing via onClose does not call `dispatch`.
13. **"Change" button reopens modal when agency already selected** — clicking "Change" on the agency pill opens the modal again.

**Complexity banner:**

14. **Banner not shown for short, simple topic** — no banner rendered for `topic="Write a blog post"`.
15. **Banner shown for long topic (> 150 chars)** — shown when topic exceeds 150 characters and `executionSource === "skill"`.
16. **Banner shown for keyword-containing topic** — shown for topic `"research the pros and cons of React vs Vue"`.
17. **Banner NOT shown when executionSource is already agency** — even with a complex topic, banner hidden when `executionSource === "agency"`.
18. **Dismissing banner hides it** — clicking Dismiss removes the banner from the DOM.
19. **"Switch to Agency" in banner dispatches SET_EXECUTION_SOURCE** — clicking "Switch to Agency" dispatches `{ type: "SET_EXECUTION_SOURCE", payload: "agency" }`.

**Loading state:**

20. **Shows loading placeholder while skills loading** — when `isLoading: true` returned by mock, dropdown is disabled or shows "Loading skills…".
21. **Shows empty message when no article skills available** — when mocked data contains only `image_generation` skills (filtered out), empty state message shown.

---

## i18n Keys

No new i18n keys are required in this section. The component uses inline English strings. Section-06 (wizard steps) will add the i18n keys for this text when it integrates `SkillAgencySelector`. If i18n is added proactively, add keys to `apps/web/client/src/lib/i18n/locales/en.ts` and `th.ts` under the `mediaComposer` namespace:

```typescript
// en.ts additions (optional in this section, required in section-06)
mediaComposer: {
  executionSource: {
    skill: "Skill",
    agency: "Agency",
  },
  skillDropdown: {
    placeholder: "Select a skill…",
    loading: "Loading skills…",
    empty: "No article skills available",
  },
  agencySelector: {
    pickButton: "Pick Agency",
    changeButton: "Change",
  },
  complexityBanner: {
    message: "This topic looks complex — consider using an Agency for better results.",
    switchButton: "Switch to Agency",
    dismissButton: "Dismiss",
  },
},
```

---

## Dependencies

- `@/lib/trpc` — `trpc.skills.listFromDb.useQuery`
- `@/components/agency/AgencyPickerModal` — existing component (section-04 depends on this being present in the codebase; it is already committed)
- `@/components/ui/radio-group` — Radix UI RadioGroup primitives
- `@/components/ui/select` — Radix UI Select primitives (or local shadcn equivalent)
- `@/components/ui/button` — Button primitive
- `@/components/ui/badge` — Badge primitive (for complexity banner and agency pill)
- `composerReducer` — `ComposerAction` type import (section-02)

No new npm packages are needed for this section. `AgencyPickerModal` already uses `@radix-ui/react-dialog`. The radio group uses `@radix-ui/react-radio-group` (already in `package.json`).

---

## What This Section Does NOT Cover

- The container that renders `SkillAgencySelector` — that is `ArticleSettingsStep` in section-06.
- The full composerReducer action union and state shape — defined in section-02.
- The `AgencyPickerModal` implementation — already exists in `apps/web/client/src/components/agency/AgencyPickerModal.tsx`.
- Social platform/account pickers — section-05.
- The wizard step layout and navigation — section-06.