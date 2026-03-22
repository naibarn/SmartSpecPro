---
name: Presentation Editor Skill Regeneration UI — Research Brief
description: Complete technical analysis for per-slide skill-powered content regeneration feature near slide notes panel
type: project
---

# Research Brief: Per-Slide Skill-Powered Content Regeneration UI

## Findings

The SmartSpecPro codebase has all necessary infrastructure to add a "skill-powered content regeneration" UI near the slide notes panel:

1. **Mature slide notes management** — Full CRUD in draggable dialog (line 9997), state-driven (line 2321), autosaved (line 5953)
2. **Battle-tested skill execution** — tRPC `chat.executeSkill` mutation (server: chat.ts:1220) with LLM fallback, dynamic params, reference images
3. **Complete reference pattern** — AIDraftModal.tsx contains a production-ready "Use Your Own Article" implementation (lines 1854–1967) showing: skill selector, collapsible advanced options, generate button, result field
4. **Schema-aware forms** — DynamicSkillForm component auto-generates UI from skill input schema via `trpc.skills.getInputSchema` (server: skills.ts:1057)
5. **AI layout rebuild precedent** — `handleApplyAIRecipeOverride()` (line 4675) shows how to apply regeneration results to slide content

All pieces exist. Feature is implementable as a self-contained UI addition to the slide notes dialog.

---

## Current Architecture

### Slide Notes Panel (Dialog-Based UI)

**Location**: `apps/web/client/src/pages/PresentationEditor.tsx` — Lines 9997–10066

**JSX Structure**:
```typescript
<Dialog open={isSlideNoteDialogOpen} onOpenChange={setIsSlideNoteDialogOpen}>
  <DialogContent className="max-w-2xl">
    <DialogHeader>
      <DialogTitle>Slide Note</DialogTitle>
      <DialogDescription>
        Internal note for slide {selectedSlide?.orderIndex + 1}. Hidden from play/export.
      </DialogDescription>
    </DialogHeader>

    {/* Draft indicator + char count */}
    <div className="flex items-center justify-between text-xs text-slate-500">
      <span>{slideNoteDirty ? "Unsaved changes" : "Saved"}</span>
      <span>{slideNoteDraft.trim().length} chars</span>
    </div>

    {/* Textarea (14 rows) */}
    <Textarea
      value={slideNoteDraft}
      onChange={(event) => setSlideNoteDraft(event.target.value)}
      placeholder="Write slide-level notes here..."
      rows={14}
      disabled={!selectedSlide}
    />

    {/* Repair status indicator during "Generate Slide" */}
    {slideNoteRepairBusy && (
      <div className="flex items-center gap-2 text-xs text-slate-500">
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
        <span>{slideNoteRepairStatusLabel}</span>
      </div>
    )}

    {/* Footer: Copy, Close, Generate Slide, Save Note */}
    <DialogFooter>
      <Button onClick={() => copyTextToClipboard(slideNoteDraft)}>Copy</Button>
      <Button onClick={() => setIsSlideNoteDialogOpen(false)}>Close</Button>
      <Button onClick={() => void handleRepairSlideFromNote()}>
        Generate Slide
      </Button>
      <Button onClick={() => void handleSaveSlide()}>Save Note</Button>
    </DialogFooter>
  </DialogContent>
</Dialog>
```

**Draggable Dialog Positioning** (Line 2347):
```typescript
const slideNoteDialogDrag = useDraggableDialog(isSlideNoteDialogOpen);
// Applied via: style={slideNoteDialogDrag.dialogStyle}, onMouseDown handler on header
```

### Slide Notes State Management

**State Variables** (PresentationEditor.tsx):

| Variable | Line | Purpose |
|----------|------|---------|
| `slideNoteDraft` | 2321 | Current editing state (unsynced with DB) |
| `slideNoteRepairStatusIndex` | 2322 | Progress counter for "Generate Slide" animation |
| `isSlideNoteDialogOpen` | 2328 | Dialog visibility toggle |

**Computed Properties** (Lines 2688–2699):
```typescript
const slideNoteDirty = (selectedSlide?.notes ?? "") !== slideNoteDraft;
const hasSavedSlideNote = Boolean((selectedSlide?.notes ?? "").trim()) && !slideNoteDirty;
const slideNoteRepairBusy = repairSlideFromNoteMutation.isPending;
const slideNoteRepairStatuses = [
  "Saving note...",
  "Generating slide layout...",
  "Compacting content...",
];
```

**Sync on Slide Change** (Line 2320 effect):
```typescript
useEffect(() => {
  setSlideNoteDraft(selectedSlide?.notes ?? "");
  setSlideNoteRepairStatusIndex(0);
}, [selectedSlide?.id, selectedSlide?.notes]);
```

### Skill Execution Flow

#### Client-Side: tRPC Mutation Setup

**File**: `apps/web/client/src/pages/PresentationEditor.tsx` — Line 2215

```typescript
const updateSlideMutation = trpc.presentation.updateSlide.useMutation();
// ← Add here:
const executeSkillMutation = trpc.chat.executeSkill.useMutation();
```

#### Server-Side: executeSkill Procedure

**File**: `apps/web/server/routers/chat.ts` — Lines 1220–1244

```typescript
executeSkill: protectedProcedure
  .input(
    z.object({
      skillId: z.string().min(1).max(50),
      prompt: z.string().max(5000).optional(),
      model: z.string().max(50).optional(),

      // Dynamic form inputs (key-value pairs)
      dynamicParams: z.record(z.any()).optional(),
      extraParams: z.record(z.any()).optional(),  // Alias for dynamicParams

      // Reference images (for image-aware skills)
      referenceImageUrls: z.array(z.string().min(1)).max(5).optional(),

      // Legacy optional params
      aspectRatio: skillAspectRatioSchema.optional(),
      numImages: z.number().min(1).max(4).optional(),
      duration: z.number().min(1).max(60).optional(),
      voice: skillVoiceSchema.optional(),
      quality: skillQualitySchema.optional(),
      style: skillStyleSchema.optional(),
      conversationId: z.number().optional(),
    })
  )
  .mutation(async ({ ctx, input }) => {
    // Rate limiting, abuse guard, skill lookup...
    // LLM execution with fallback...
    // Returns: { success, skillId, type, message, error, ... }
  })
```

**Response Schema** (inferred from execution):
```typescript
interface SkillExecutionResult {
  success: boolean;
  skillId: string;
  type: 'image' | 'video' | 'audio' | 'text' | 'action';
  resultUrl?: string;           // For media skills
  resultUrls?: string[];        // Multiple media items
  message?: string;             // For text-based skills (article content)
  error?: string;               // Error message if failed
  creditsUsed?: number;
  taskId?: string;              // For async Python skills
  isAsync?: boolean;            // Indicates polling needed
}
```

#### Complete Execution Handler Example

From AIDraftModal.tsx (Lines 793–819) — **This is the pattern to replicate**:

```typescript
const handleGenerateArticle = useCallback(async () => {
  if (!articleGenSkill || isGeneratingArticle) return;
  setIsGeneratingArticle(true);
  try {
    const result = await executeSkillMutation.mutateAsync({
      skillId: articleGenSkill,                    // Skill ID/slug
      prompt: topic.trim() || undefined,          // Primary input (or from notes)
      dynamicParams: articleGenParams,            // Form inputs from "Advanced Options"
      referenceImageUrls: normalizedReferenceImageUrls,  // Context images
    });

    if (result.success) {
      // For text skills: populate result into target field
      if (result.message) {
        setCustomArticleText(result.message);
        toast.success("Article generated successfully.");
      } else {
        toast.success(`Skill executed successfully.`);
      }
    } else {
      toast.error(result.error || "Failed to generate article");
    }
  } catch (err) {
    toast.error(err instanceof Error ? err.message : "Unknown error");
  } finally {
    setIsGeneratingArticle(false);
  }
}, [
  articleGenSkill,
  isGeneratingArticle,
  topic,
  articleGenParams,
  normalizedReferenceImageUrls,
  executeSkillMutation,
]);
```

### UI Pattern: "Use Your Own Article" Section (Reference Implementation)

**File**: `apps/web/client/src/components/presentation/AIDraftModal.tsx` — Lines 1854–1967

This section is a **complete, production-ready example** of the exact UI pattern needed for slide regeneration:

**1. Toggle Switch to Enable Feature** (Lines 1862–1866):
```typescript
<Switch
  aria-label="Use your own article"
  checked={useCustomArticle}
  onCheckedChange={setUseCustomArticle}
/>
```

**2. Skill Selector (SearchableCombobox)** (Lines 1876–1888):
```typescript
<SearchableCombobox
  items={[
    { value: "", label: "None — paste manually" },
    ...articleGenSkillItems,  // Filtered list: [{ value: slug, label: name }, ...]
  ]}
  value={articleGenSkill || ""}
  onValueChange={(v) => {
    setArticleGenSkill(v);
    setArticleGenParams({});           // Clear form state
    setArticleGenAdvancedOpen(false);   // Collapse options
    localStorage.setItem("smartspec_aiDraft_articleGenSkill", v);
  }}
  placeholder="Select a skill to generate article..."
  searchPlaceholder="Search skills..."
  emptyMessage="No skills found."
/>
```

**3. Collapsible Advanced Options** (Lines 1891–1913):
```typescript
{articleGenSkill && articleGenSchema && (
  <Collapsible open={articleGenAdvancedOpen} onOpenChange={setArticleGenAdvancedOpen}>
    <CollapsibleTrigger asChild>
      <Button variant="ghost" size="sm" className="h-7 gap-1 px-2 text-xs">
        <Settings2 className="h-3.5 w-3.5" />
        Advanced Options
        <ChevronDown className={cn("h-3 w-3 transition-transform",
          articleGenAdvancedOpen && "rotate-180"
        )} />
      </Button>
    </CollapsibleTrigger>
    <CollapsibleContent>
      <div className="mt-2 rounded-md border border-muted bg-background p-3">
        <DynamicSkillForm
          schema={articleGenSchema}
          language={language === "th" ? "th" : "en"}
          values={articleGenParams}
          onChange={setArticleGenParams}
          excludeFields={["topic", "prompt", "subject", "reference_images"]}
          className="space-y-3"
        />
      </div>
    </CollapsibleContent>
  </Collapsible>
)}
```

**4. Generate Button** (Lines 1916–1937):
```typescript
{articleGenSkill && (
  <Button
    type="button"
    size="sm"
    variant="outline"
    className="gap-1.5 border-teal-300 text-teal-700 hover:bg-teal-50"
    disabled={isGeneratingArticle || (!topic.trim() && Object.keys(articleGenParams).length === 0)}
    onClick={handleGenerateArticle}
  >
    {isGeneratingArticle ? (
      <>
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
        Generating...
      </>
    ) : (
      <>
        <Sparkles className="h-3.5 w-3.5" />
        Generate Article
      </>
    )}
  </Button>
)}
```

**5. Result Field** (Lines 1941–1964):
```typescript
<div className="space-y-1.5">
  <Label htmlFor="ai-custom-article">Article Content</Label>
  <textarea
    id="ai-custom-article"
    className="...min-h-[180px]..."
    placeholder="Paste your article here, or use a skill above to generate one..."
    maxLength={20000}
    value={customArticleText}
    onChange={(e) => setCustomArticleText(e.target.value)}
  />
  <div className="flex items-center justify-between text-xs text-muted-foreground">
    <p>Reuse article, split into slide sections, continue draft flow.</p>
    <span className="tabular-nums">
      {words.toLocaleString()} words / {chars.toLocaleString()} chars
    </span>
  </div>
</div>
```

### Skill Schema Fetching

**Client Query** (AIDraftModal.tsx:453–455):
```typescript
const articleGenSchemaQuery = trpc.skills.getInputSchema.useQuery(
  { skillId: articleGenSkill },
  { enabled: articleGenSkill !== "" && useCustomArticle, staleTime: 300_000 }
);
const articleGenSchema = articleGenSchemaQuery.data;
```

**Server Endpoint** (skills.ts:1057–1066):
```typescript
getInputSchema: protectedProcedure
  .input(z.object({ skillId: z.string() }))
  .query(async ({ input }) => {
    // Sync skill if file changed (ensures latest skill.md)
    await syncSingleSkillIfChanged(input.skillId);

    // Lookup skill by ID or slug
    const skill = getSkillByIdOrType(input.skillId);

    // Extract and return schema
    return {
      inputSchema: skill?.inputSchema,
      uiSchema: skill?.uiSchema,
    };
  }),
```

### Slide Persistence: handleSaveSlide()

**File**: PresentationEditor.tsx — Lines 5953–5987

```typescript
async function handleSaveSlide(options?: { silent?: boolean }): Promise<boolean> {
  if (!deck || !selectedSlide) {
    if (!options?.silent) {
      toast.error("No active slide to save.");
    }
    return false;
  }

  const result = await performSave("manual");  // Mutation that includes slideNoteDraft
  if (result === "saved") {
    autosaveController.markPersisted(draftSignature);
    await Promise.all([
      refreshDeck(),
      trpcUtils.presentation.listVersions.invalidate(),
    ]);
    if (!options?.silent) {
      toast.success("Presentation saved.");
    }
    return true;
  }

  if (!options?.silent) {
    const blockedReason = shouldBlockSaveAttempt(...);
    if (blockedReason === "stale_blocked") {
      toast.error("Save blocked by version conflict. Reload latest and retry.");
    } else {
      toast.error("Save failed. Please retry.");
    }
  }
  return false;
}
```

**What gets saved**: `slideNoteDraft` is included in the `updateSlide` mutation payload (line 3152).

### AI Layout Rebuild Pattern (Inspiration for Results Integration)

**File**: PresentationEditor.tsx — Lines 4675–4744

**Function signature**:
```typescript
function handleApplyAIRecipeOverride(recipeId: BuiltInPresentationComponentId) {
  // Build narrative object from slide notes + recipe
  const baseNarrative = aiOverridePreviewNarrative || adaptAIOverrideNarrativeForRecipe(
    recipeId,
    {
      title: selectedSlide.title,
      body: aiOverrideBodyLines.length > 0 ? aiOverrideBodyLines : [selectedSlide.title],
      notes: slideNoteDraft.trim() || undefined,  // ← Uses slide notes as context
      sections: parsedAIOverrideSections,
    }
  );

  // Build component instance
  const nextComponent = buildBuiltInPresentationComponentInstanceFromNarrative(
    recipeId,
    { canvas: activeCanvasSize, instanceId, narrative }
  );

  // Apply to UI state (no save yet)
  applyComponentContentUpdate({
    ...draftContent,
    components: [nextComponent],
    aiDesign: { /* metadata */ },
  });

  // User must click "Save" to persist
  return;
}
```

**Key insight**: Regeneration results can update UI state via `applyComponentContentUpdate()`, then user clicks "Save Note" / "Save Slide" to persist.

---

## Risks

### Design Risks

1. **UI Real Estate** — Slide notes dialog is already feature-complete. Adding skill regeneration risks cognitive overload:
   - **Risk**: Users confuse "Generate Article" (in notes dialog) with "Generate Slide" (existing button)
   - **Mitigation**: Use clear naming (e.g., "Regenerate from Skill", "Article Auto-Generate"), distinct visual styling, or place in separate collapsible section

2. **Skill Type Compatibility** — Not all skills make sense in a "regenerate notes/narrative" context:
   - **Risk**: User selects a video-generation skill expecting text output
   - **Mitigation**: Filter skill list to `executionMode === "llm-only"` + text-focused skills (article, prompt, etc.)

3. **Mental Model Mismatch** — Is this for:
   - **A) Regenerating slide layout/visuals?** (feed notes as context → apply recipe override)
   - **B) Regenerating notes content itself?** (feed slide content → replace notes)
   - **C) Generating supplementary content?** (e.g., narrative suggestions alongside notes)
   - **Risk**: Ambiguous feature → confused users
   - **Mitigation**: Decide early, name explicitly, provide helpful tooltip

### Execution Risks

1. **Async Skills** — Some skills return `isAsync: true` with a `taskId`, requiring polling:
   - **Risk**: UI blocks waiting for async result (can exceed Cloudflare 100s timeout)
   - **Mitigation**: Use polling loop (like AIDraftModal:822) with max 300s timeout, or show task ID for manual follow-up

2. **Credits Deduction** — Users may not expect skill execution to consume credits:
   - **Risk**: User clicks "Generate" unaware of cost
   - **Mitigation**: Show estimated credits before button, or add explicit confirmation

3. **Conflict Handling** — If notes are dirty when user clicks "Generate":
   - **Risk**: Result applied to stale/incorrect content
   - **Mitigation**: Force save notes first (pattern: handleAutoRelayoutSlide:6034–6040)

4. **Skill Not Found** — Selected skill may be deleted/disabled:
   - **Risk**: Error on mutation attempt
   - **Mitigation**: Re-validate skill availability in `<Collapsible>` guard (`articleGenSkill && articleGenSchema`)

### Technical Risks

1. **State Synchronization** — Multiple async operations (fetch schema, execute skill, save):
   - **Risk**: Race conditions if user rapidly changes skill selection
   - **Mitigation**: Debounce skill selector, disable button during execution, validate state before mutation

2. **Reference Images** — DynamicSkillForm excludes `reference_images` from "Advanced Options":
   - **Risk**: Skills that need visual context can't access it
   - **Mitigation**: If needed, add separate image picker or include reference_images in advanced form

3. **Localization** — DynamicSkillForm takes `language` param (line 1904 in AIDraftModal):
   - **Risk**: UI elements rendered in user's locale, but skill output may be different language
   - **Mitigation**: Pass same language param to DynamicSkillForm as app language setting

---

## Options

### Option A: Minimal — Result-Only (Simplest)

**What**: Add a single "Generate Content from Skill" section *above* the save buttons in the notes dialog.
- Skill selector only (no dynamic form)
- Generate button → executes skill with `slideNoteDraft` as prompt
- Result displays in a small preview/toast

**Pros**:
- Minimal code additions (50–80 lines of JSX + state)
- Low cognitive load
- Clear purpose: "refresh content using a skill"

**Cons**:
- No advanced options (users can't customize skill behavior)
- Limited to simple text-in-text-out skills
- Result just shown, not automatically applied anywhere

---

### Option B: Full-Featured — Pattern Match (Recommended)

**What**: Replicate AIDraftModal's "Use Your Own Article" pattern exactly inside the notes dialog:
- Toggle to enable feature
- Skill selector (SearchableCombobox)
- Collapsible "Advanced Options" (DynamicSkillForm)
- Generate button with loading state
- Result textarea

**Pros**:
- Users familiar with AIDraftModal experience
- Supports complex skills (multiple inputs, images)
- Result visible, editable before applying/saving
- Proven pattern in production code

**Cons**:
- More code (~200–300 lines) and state variables
- Bigger dialog (may overflow mobile)
- Two textareas side-by-side (notes + result) is crowded

**Implementation effort**: 4–6 hours (DOM, state, mutations)

---

### Option C: Modal Popup — Separate Context

**What**: Don't touch the notes dialog. Instead, add a "Regenerate Slide" button *near* the "Open Slide Notes" icon that opens a full-screen modal.

**Pros**:
- Notes dialog stays clean and focused
- Modal can be large (full screen)
- Clearer separation of concerns

**Cons**:
- Requires navigation away from notes dialog
- Users must remember to apply result back to notes
- More UI complexity overall

---

## Recommendation

**Implement Option B (Full-Featured)** — Replicate the AIDraftModal pattern inside (or near) the slide notes dialog.

**Rationale**:
1. **Proven pattern** — AIDraftModal's "Use Your Own Article" has been tested in production for months. Reusing it reduces risk.
2. **User familiarity** — Users who've seen it in AIDraftModal will immediately understand how to use it.
3. **Flexibility** — Advanced options support complex skills (multi-input, images, custom parameters).
4. **Clear semantics** — "Generate article from skill" is unambiguous; result goes into slide context.
5. **Composability** — Result can feed into layout rebuild (pattern: handleApplyAIRecipeOverride) or replace notes.

**Placement considerations**:
- If implementing inside the notes dialog: Use collapsible sections to manage space (notes, skill regenerator, result preview)
- If implementing as separate toolbar/button: Make the button visually prominent (e.g., Sparkles icon + "Regenerate" label)

**Initial scope** (MVP):
1. Toggle to enable feature
2. Skill selector (filter: `executionMode === "llm-only"`)
3. "Generate" button (inline, no advanced options initially)
4. Result preview (toast or small modal)
5. Integrate result into slide context (tbd: notes, narrative, layout?)

**Follow-up scope** (Phase 2):
- Collapsible "Advanced Options" (DynamicSkillForm)
- Result field (textarea for editing before apply)
- Auto-apply or manual-apply modes

---

## Open Questions

1. **What is the regeneration target?**
   - Regenerate *slide layout* (use notes as context, apply recipe)?
   - Regenerate *notes content* (improve/expand existing notes)?
   - Regenerate *narrative sections* (break down notes into structured slide text)?
   - Generate *supplementary content* (prompts, talking points alongside notes)?
   → **Decision needed**: This determines the entire UX flow.

2. **Which skills are valid candidates?**
   - Article/content generation only? (safest)
   - Include video/image generation? (could generate media based on notes)
   - Exclude complex skills with many inputs? (reduce cognitive load)
   → **Decision needed**: Scope of skill filter.

3. **How should results be applied?**
   - Auto-apply (immediate slide update)?
   - Manual approval (show preview, let user confirm)?
   - Append to notes (add result *below* existing notes)?
   - Replace notes (overwrite notes with result)?
   → **Decision needed**: Integration with slide state.

4. **Should it consume credits visibly?**
   - Show cost estimate before "Generate"?
   - Allow users to pick lower-cost model?
   - Warn if user is near credit limit?
   → **Decision needed**: Credit transparency level.

5. **Is this feature available to all users or restricted?**
   - Free tier only, or all tiers?
   - Admin toggle? (feature flag)
   - Depends on tenant plan? (SKU-based)
   → **Decision needed**: Access control.

---

## Implementation Checklist

### Phase 1: UI Setup (2 hours)
- [ ] Add state variables: `selectedRegenSkill`, `regenSkillParams`, `isGeneratingContent`, `regenResult`
- [ ] Add `executeSkillMutation = trpc.chat.executeSkill.useMutation()` near line 2215
- [ ] Add collapsible section in notes dialog (or separate toolbar)
- [ ] Add skill selector (SearchableCombobox + filtered skill list)
- [ ] Add generate button with loading spinner

### Phase 2: Schema Fetching (1.5 hours)
- [ ] Add `skillSchemaQuery = trpc.skills.getInputSchema.useQuery()` when skill selected
- [ ] Show DynamicSkillForm inside collapsible "Advanced Options"
- [ ] Wire form changes → `regenSkillParams` state

### Phase 3: Execution (1.5 hours)
- [ ] Implement `handleGenerateContent()` handler (pattern: AIDraftModal:793–819)
- [ ] Call `executeSkillMutation.mutateAsync()` with skill ID, notes, params
- [ ] Handle success: populate result into target field/toast
- [ ] Handle error: show error toast
- [ ] Handle async: poll if `result.isAsync === true`

### Phase 4: Result Integration (2–3 hours)
- [ ] Decide: target field (notes, narrative, layout)?
- [ ] Wire result to target (append, replace, or apply recipe)
- [ ] Add save trigger (auto or manual)
- [ ] Test with various skill types

### Phase 5: Polish & Testing (2 hours)
- [ ] Keyboard shortcuts (Enter to generate?)
- [ ] Accessibility (ARIA labels, focus management)
- [ ] Mobile responsiveness
- [ ] Unit tests (skill selector, execution, error handling)
- [ ] E2E tests (full regen flow)

---

## File Modifications Required

| File | Change | Lines |
|------|--------|-------|
| `apps/web/client/src/pages/PresentationEditor.tsx` | Add state, mutation, handlers, JSX | ~200–250 new lines |
| `apps/web/server/routers/chat.ts` | No changes (executeSkill already exists) | — |
| `apps/web/server/routers/skills.ts` | No changes (getInputSchema already exists) | — |

---

## Success Criteria

- [ ] User can open slide notes dialog
- [ ] User can select a skill from dropdown
- [ ] User can view/configure skill parameters (optional fields shown in collapsible)
- [ ] User can click "Generate" and see loading state
- [ ] Skill executes server-side and returns result within 30 seconds
- [ ] Result is populated into appropriate slide field (notes/narrative/layout)
- [ ] User can save slide with new content
- [ ] Feature works for 3+ different skill types (article, prompt, etc.)
- [ ] Errors (skill not found, credits insufficient) are handled gracefully
- [ ] Mobile UI doesn't break (dialog doesn't overflow)

