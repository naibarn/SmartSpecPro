Now I have all the information needed. Let me compose the section content.

# Section 08: Frontend -- AIDraftModal + PresentationEditor Integration

## Overview

This section implements the client-side UI for the "Draft with AI" feature. It creates a modal dialog (`AIDraftModal`) where users configure AI slide generation (topic, skills, style preset, slide count), view real-time progress, and cancel in-flight tasks. It also integrates a "Draft with AI" button into the PresentationEditor toolbar, gated by the `aiGenerationEnabled` flag from the availability query.

**Dependencies (must be completed first):**
- Section 01 (shared types and presets) -- provides `BUILT_IN_PRESETS`, `SlideStylePreset`, `GenerateAIDraftInputSchema`, `AIDraftProgressSchema`, `AI_STYLE_PRESET_IDS`
- Section 04 (error codes and feature flag) -- provides `isPresentationAIGenerationEnabled()` on the server, extended availability schema with `aiGenerationEnabled`
- Section 07 (tRPC router) -- provides `presentation.ai.generateDraft`, `presentation.ai.getDraftProgress`, `presentation.ai.cancelDraft` procedures

---

## Files

| Action | File (relative to `apps/web/`) |
|--------|-------------------------------|
| **Create** | `client/src/components/presentation/AIDraftModal.tsx` |
| **Create** | `client/src/components/presentation/__tests__/AIDraftModal.test.tsx` |
| **Modify** | `client/src/pages/PresentationEditor.tsx` |

---

## Tests FIRST

**Test file:** `apps/web/client/src/components/presentation/__tests__/AIDraftModal.test.tsx`

This test file uses the same patterns established in the codebase by `ImportPresentationDialog.test.tsx` and `ExportDialog.test.tsx`: jsdom environment directive, `vi.mock` for tRPC and navigation, `vi.hoisted` for hoisted mock values, `@testing-library/react` for rendering, and mock factory helpers for tRPC hooks.

### Mock Setup

The tRPC mock must provide these procedure hooks:

```typescript
vi.mock("@/lib/trpc", () => ({
  trpc: {
    presentation: {
      ai: {
        generateDraft: { useMutation: vi.fn() },
        getDraftProgress: { useQuery: vi.fn() },
        cancelDraft: { useMutation: vi.fn() },
      },
      availability: { useQuery: vi.fn() },
    },
    skills: {
      getUserVisibleSkills: { useQuery: vi.fn() },
    },
    useUtils: vi.fn(() => ({
      presentation: { getDeck: { invalidate: vi.fn() } },
    })),
  },
}));
```

Additionally mock `@shared/presentation/aiStylePresets` to provide the `BUILT_IN_PRESETS` array (5 entries), and `sonner` to suppress toast side effects.

The `beforeEach` block calls `vi.clearAllMocks()` and sets up default return values for all hooks: skills list with at least one article skill and one image skill, mutation mocks in idle state, progress query returning undefined.

### Test Groups and Cases

**G.1 Modal Rendering**

- `it("renders topic textarea, slide count slider, and language select")` -- Render the modal with `isOpen: true`. Assert presence of a textarea (or input) for topic entry, a slider or numeric input for slide count, and a select/dropdown for language.
- `it("renders article skill dropdown populated from skills list")` -- Mock skills query to return 3 skills. Assert the dropdown (or combobox) contains all 3 skill names.
- `it("renders image skill dropdown (optional)")` -- Assert the image skill selector is present and is optional (no required indicator).
- `it("renders 5 style preset cards")` -- Assert exactly 5 elements matching the preset card pattern are in the DOM.
- `it("default selected preset is dark-professional")` -- Assert the dark-professional card has the selected visual indicator (e.g., a ring class or aria-selected attribute).
- `it("generate button disabled when no article skill selected")` -- Render without selecting an article skill. Assert the Generate button is disabled.
- `it("generate button enabled when article skill selected and topic filled")` -- Fill in topic and select a skill. Assert Generate button is enabled.

**G.2 Non-Empty Deck Warning**

- `it("shows warning when currentSlideCount > 0")` -- Render with `currentSlideCount={3}`. Assert text containing "3 slides will be added" is visible.
- `it("no warning when currentSlideCount === 0")` -- Render with `currentSlideCount={0}`. Assert no warning text about adding slides.

**G.3 Progress View**

- `it("transitions to progress view after generateDraft mutation succeeds")` -- Trigger Generate, mock mutation to resolve with `{ taskId: "abc" }`. Assert the modal now shows progress UI (phase label, progress bar).
- `it("shows phase label from progress data")` -- Mock getDraftProgress query to return `{ phase: 2, phaseLabel: "Splitting content...", ... }`. Assert text "Splitting content..." is in the DOM.
- `it("shows slide thumbnails as slidePreview[] grows")` -- Mock progress with `slidePreview: [{ title: "Intro" }, { title: "Body" }]`. Assert both titles appear.
- `it("shows success message when completed=true")` -- Mock progress with `completed: true, result: { slidesAdded: 5 }`. Assert success message mentioning "5 slides".
- `it("shows error message when error is present")` -- Mock progress with `error: { code: "AI_GENERATION_FAILED", message: "LLM error" }`. Assert error text is visible.
- `it("shows cancelled message when cancelled=true")` -- Mock progress with `completed: true, cancelled: true`. Assert "cancelled" text appears.

**G.4 Cancel Button**

- `it("cancel button visible during in-progress generation")` -- In progress view, assert a Cancel button is present and enabled.
- `it("cancel button calls cancelDraft mutation")` -- Click Cancel. Assert `cancelDraft.mutate` was called with `{ taskId }`.
- `it("cancel button shows Cancelling... after click")` -- Click Cancel. Assert the button text changes to "Cancelling..." and becomes disabled.
- `it("cancel button hidden after completion")` -- Mock progress as `completed: true`. Assert no Cancel button is rendered.

**G.5 Preset Selector**

- `it("clicking a preset card selects it (ring highlight)")` -- Click a non-default preset card. Assert it gains the selected visual state and the previous default loses it.
- `it("footer text input visible when selected preset has footer.enabled")` -- Select a preset that has `footer.enabled: true`. Assert the footer text input is rendered.
- `it("footer text input hidden when selected preset has no footer")` -- Select a preset that has `footer.enabled: false` or no footer. Assert the footer text input is not rendered.

**G.6 PresentationEditor Integration** (separate test or described in same file)

These tests are best placed within the existing PresentationEditor test infrastructure or as a lightweight describe block at the end of the AIDraftModal test file. They verify:

- `it("'Draft with AI' button visible when aiGenerationEnabled is true")` -- Mock availability query to return `{ enabled: true, aiGenerationEnabled: true }`. Assert the button with text "Draft with AI" (or matching aria-label) is in the DOM.
- `it("'Draft with AI' button hidden when aiGenerationEnabled is false")` -- Mock availability query to return `{ enabled: true, aiGenerationEnabled: false }`. Assert the button is not in the DOM.
- `it("clicking button opens AIDraftModal")` -- Click the "Draft with AI" button. Assert modal content appears.
- `it("deck query invalidated when modal closes after successful generation")` -- Simulate modal closing after a successful generation. Assert `utils.presentation.getDeck.invalidate` was called.

---

## Implementation Details

### 1. AIDraftModal Component

**File:** `apps/web/client/src/components/presentation/AIDraftModal.tsx`

**Props interface:**

```typescript
interface AIDraftModalProps {
  isOpen: boolean;
  onClose: () => void;
  deckId: number;
  expectedVersion: number;
  currentSlideCount: number;
}
```

**Internal state machine:** The modal has two phases -- "config" (form input) and "progress" (polling). A `taskId` state variable (initially `null`) controls which phase is shown. When `taskId` is set, the modal shows the progress view.

**Config Phase UI elements (in order):**

1. **Topic textarea** -- A `<textarea>` (or `<Textarea>` from UI kit if available) with `maxLength={1000}`, `required`, placeholder text like "Describe what your presentation should be about...". Minimum 3 characters before Generate button enables.

2. **Slide count** -- A `<Slider>` from `@/components/ui/slider` with `min={1}`, `max={10}`, `defaultValue={[5]}`, step 1. Show the current numeric value next to the slider.

3. **Language select** -- A `<Select>` from `@/components/ui/select` with options: `auto` (Auto-detect), `en` (English), `th` (Thai). Default: `auto`.

4. **Article skill dropdown** -- Required. Use `trpc.skills.getUserVisibleSkills.useQuery({ limit: 100 })` to fetch skills. Display a `<Select>` (or combobox) showing skill name and description. Optionally filter by `category: "content_writing"` client-side, but show all skills since the plan says to let users pick any.

5. **Image skill dropdown** -- Optional. Filter skills client-side for image-related skills (e.g., `category` contains "image" or execution mode matches). Show "None" as a valid option.

6. **Image model dropdown** -- Optional. Can be a simple text input or a small select with known model IDs like `flux-2.0`. Default empty (server will use default).

7. **Preset selector** -- A horizontal scrolling row of 5 cards. Each card is approximately 120px wide and shows:
   - 4 small color circles (background, primary, secondary, text) stacked in a 2x2 grid or row
   - Preset name below the swatches
   - Selected state indicated by a ring/border (e.g., `ring-2 ring-blue-500`)
   - Clicking a card sets it as the selected preset via state

   Import presets from `@shared/presentation/aiStylePresets` (`BUILT_IN_PRESETS` array).

8. **Footer text input** -- Conditionally visible. Only shown when the currently selected preset has `footer?.enabled && footer?.showCustomText`. Pre-filled with the preset's `footer.customText` default. Stored in form state and passed as `footerCustomText` to the mutation.

9. **Non-empty deck warning** -- Inline alert shown when `currentSlideCount > 0`. Text: `"{currentSlideCount} slides will be added at the end of your deck."`

10. **Generate button** -- Calls `trpc.presentation.ai.generateDraft.useMutation()`. Disabled when: topic is empty or < 3 chars, no article skill is selected, or the mutation is pending. On success, stores the returned `taskId` in state, switching the modal to progress view. On error, shows a toast via `sonner`.

**Progress Phase UI elements:**

1. **Phase label** -- Text like "Phase 2/6: Splitting content..." sourced from progress data `phaseLabel`. Combine with `phase` number.

2. **Progress bar** -- `<Progress>` component from `@/components/ui/progress`. Value = `(phase / 6) * 100`. For finer granularity within phases 3-4, can use `(phase - 1 + slidesCompleted / totalSlides) / 6 * 100`.

3. **Slide thumbnails** -- A grid or horizontal scroll of mini cards. Each card shows `slidePreview[i].title` and an icon indicating image status (checkmark for generated, placeholder icon for fallback). Cards appear one-by-one as the array grows.

4. **Cancel button** -- Visible when `!completed`. Calls `trpc.presentation.ai.cancelDraft.useMutation()` with `{ taskId }`. After click, button text changes to "Cancelling..." and button disables. Polling continues until progress shows `cancelled: true`.

5. **Completion states:**
   - **Success** (`completed && result`): Show green success message with `result.slidesAdded` count, a snippet of `result.articlePreview`, and any `result.warnings` as a collapsible list. Show a "Close" button that calls `onClose`.
   - **Cancelled** (`completed && cancelled`): Show yellow/amber message "Generation cancelled. No slides were added." with Close button.
   - **Error** (`error`): Show red error message with `error.message`. Show "Retry" button that resets `taskId` to null (goes back to config phase) and "Close" button.

**Polling setup:**

```typescript
const progressQuery = trpc.presentation.ai.getDraftProgress.useQuery(
  { taskId: taskId! },
  {
    enabled: taskId !== null && !completed,
    refetchInterval: 2000,
  }
);
```

Track `completed` in local state, derived from `progressQuery.data?.completed === true`.

**tRPC utility for invalidation:**

```typescript
const utils = trpc.useUtils();
// On successful close:
utils.presentation.getDeck.invalidate({ deckId });
```

### 2. PresetSelector Sub-Component

Can be defined within `AIDraftModal.tsx` or extracted to a separate file. For simplicity, define inline as a function component.

```typescript
interface PresetSelectorProps {
  presets: SlideStylePreset[];
  selectedId: string;
  onSelect: (id: string) => void;
}
```

Each preset card renders:
- A `<div>` with click handler and conditional ring class for selection
- Color swatch circles using inline `style={{ backgroundColor: preset.colors.X }}`
- Preset name as text below

### 3. PresentationEditor Integration

**File:** `apps/web/client/src/pages/PresentationEditor.tsx`

**Changes needed:**

1. **Import the AIDraftModal:**
   ```typescript
   import { AIDraftModal } from "@/components/presentation/AIDraftModal";
   ```

2. **Add state for the modal:**
   ```typescript
   const [isAIDraftModalOpen, setIsAIDraftModalOpen] = useState(false);
   ```

3. **Query availability with AI flag:**
   The PresentationEditor needs to know whether AI generation is enabled. Use the existing `presentation.availability` query (which section-04 extends with `aiGenerationEnabled?: boolean`):
   ```typescript
   const availabilityQuery = trpc.presentation.availability.useQuery();
   const isAIGenerationEnabled = availabilityQuery.data?.aiGenerationEnabled === true;
   ```

4. **Add the "Draft with AI" button** in the toolbar header, near the Import/Export buttons (around line 3038 in the current file, after the Import button):
   ```tsx
   {isAIGenerationEnabled && (
     <Button
       onClick={() => setIsAIDraftModalOpen(true)}
       aria-label="Draft with AI"
       variant="secondary"
       size="sm"
       className="gap-1"
       disabled={!deck}
     >
       <Sparkles className="h-3.5 w-3.5" />
       <span className="hidden sm:inline">Draft with AI</span>
     </Button>
   )}
   ```
   Import `Sparkles` from `lucide-react`.

5. **Render the modal** at the end of the component, alongside the existing `ExportDialog` and `ImportPresentationDialog`:
   ```tsx
   {isAIDraftModalOpen && deck && (
     <AIDraftModal
       isOpen={isAIDraftModalOpen}
       onClose={() => {
         setIsAIDraftModalOpen(false);
         // Invalidate deck data to pick up newly added slides
       }}
       deckId={deck.id}
       expectedVersion={expectedSlideVersion ?? 1}
       currentSlideCount={slides.length}
     />
   )}
   ```

6. **Invalidation on close after success:** The `onClose` callback should invalidate the deck query to reload slides. This can be done either:
   - By always invalidating on close (harmless if no changes were made), or
   - By having `AIDraftModal` call `onClose` with a `success: boolean` parameter

   Simplest approach: always invalidate the deck query in the onClose handler. The `AIDraftModal` component itself calls `utils.presentation.getDeck.invalidate({ deckId })` in its close handler when generation was successful. The PresentationEditor's `onClose` simply closes the modal; the invalidation happens inside the modal before calling `onClose`.

### 4. Availability Schema Extension (Client Consumption)

Section 04 extends the availability schema to include an optional `aiGenerationEnabled` field:

```typescript
// In shared/presentation/contracts.ts (done by section-04)
export const presentationAvailabilitySchema = z.object({
  enabled: z.boolean(),
  errorCode: z.enum(PRESENTATION_ERROR_CODE_VALUES).optional(),
  message: z.string().optional(),
  aiGenerationEnabled: z.boolean().optional(), // NEW
});
```

The PresentationEditor consumes this via `trpc.presentation.availability.useQuery()`. The `aiGenerationEnabled` field is optional so older clients do not break.

### 5. Skill Loading Strategy

The modal uses `trpc.skills.getUserVisibleSkills.useQuery({ limit: 100 })` to fetch the user's available skills. This returns objects with at minimum: `id`, `slug`, `name`, `description`, `category`, `executionMode`.

Client-side filtering:
- **Article skills:** Show all skills in the article skill dropdown. Optionally sort `content_writing` category skills to the top.
- **Image prompt skills:** Filter to skills where `category` includes "image" or `executionMode` is "enhance-prompt". Show as separate dropdown with a "None (skip enhancement)" option.

### 6. UI Library Components Used

All UI primitives are already available in `apps/web/client/src/components/ui/`:
- `Dialog`, `DialogContent`, `DialogHeader`, `DialogTitle`, `DialogDescription`, `DialogFooter` -- for the modal shell
- `Button` -- Generate, Cancel, Close buttons
- `Slider` -- slide count selector
- `Select`, `SelectTrigger`, `SelectValue`, `SelectContent`, `SelectItem` -- language and skill dropdowns
- `Progress` -- progress bar
- `Alert`, `AlertDescription` -- non-empty deck warning and error/success messages
- `Label` -- form field labels

Icons from `lucide-react`: `Sparkles`, `Loader2`, `X`, `Check`, `AlertTriangle`.

---

## Key Implementation Notes

1. **No server-side code changes in this section.** All server changes (tRPC router, availability extension, feature flag) are handled by sections 04 and 07. This section is purely client-side.

2. **The modal is gated by `aiGenerationEnabled`.** If the feature flag is OFF (default), the button does not render and users cannot access AI generation.

3. **Polling stops when `completed` is true.** The `refetchInterval` is conditional on `!completed` to avoid unnecessary network requests after the task finishes.

4. **The modal does not block non-empty decks.** It shows a warning, but the Generate button remains enabled. The server simply appends slides at the end.

5. **Style preset data comes from the shared module** `@shared/presentation/aiStylePresets`, which is created in section-01. Import `BUILT_IN_PRESETS` for rendering the card grid and `getBuiltInPreset()` for looking up footer configuration when a preset is selected.

6. **Footer text visibility** toggles based on `selectedPreset.footer?.enabled && selectedPreset.footer?.showCustomText`. When the user switches presets, the footer text should reset to the new preset's `footer.customText` default (or empty string if the preset has no footer).

7. **The Generate mutation input** maps form state to `GenerateAIDraftInputSchema`:
   ```typescript
   {
     deckId,
     expectedVersion,
     prompt: topic,           // textarea value
     numSlides: slideCount,   // slider value
     language: language,      // select value: "auto" | "en" | "th"
     articleSkillId: selectedArticleSkillSlug,  // from skill dropdown
     imageSkillId: selectedImageSkillSlug || undefined,  // optional
     imageModel: imageModel || undefined,       // optional
     stylePresetId: selectedPresetId,           // from preset selector
     footerCustomText: footerText || undefined, // optional
   }
   ```

8. **Error handling in the modal:** The mutation's `onError` callback shows a toast with the error message. The progress view handles errors from the polling response separately (showing inline error + retry button).