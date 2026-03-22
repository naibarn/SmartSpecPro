---
name: Presentation Editor Skill-Powered Content Regeneration
description: Research for per-slide skill execution UI near slide notes panel
type: project
---

# Research Brief: Slide-Level Skill Content Regeneration UI

## Findings

The SmartSpecPro PresentationEditor has a mature infrastructure for:
1. **Slide notes management** — Full CRUD with drag-enabled dialog, autosave, repair-from-note
2. **Skill execution** — tRPC mutation that handles LLM-only and media skills with dynamic parameters
3. **AI recipe override** — Manual layout rebuild using narrative + recipe selection
4. **Pattern reference** — "Use Your Own Article" section in AIDraftModal shows exact UI pattern needed

This research provides exact file paths, line numbers, and code patterns to implement per-slide skill-powered content regeneration.

---

## Current Architecture

### Slide Notes Panel (Dialog-Based)

**File**: `apps/web/client/src/pages/PresentationEditor.tsx`

**JSX Rendering**:
- **Dialog open state**: Line 9997 `Dialog open={isSlideNoteDialogOpen}`
- **Textarea input**: Lines 10016–10022
  ```typescript
  <Textarea
    value={slideNoteDraft}
    onChange={(event) => setSlideNoteDraft(event.target.value)}
    placeholder="Write slide-level notes here..."
    rows={14}
    disabled={!selectedSlide}
  />
  ```
- **Footer buttons**: Lines 10030–10064 (Copy, Close, "Generate Slide", "Save Note")

**State Management**:
- **Draft state**: Line 2321 `const [slideNoteDraft, setSlideNoteDraft] = useState("")`
- **Dirty flag**: Line 2688 `const slideNoteDirty = (selectedSlide?.notes ?? "") !== slideNoteDraft`
- **Repair status tracking**: Lines 2322, 2691–2715

**Dialog Control**:
- **Open/close**: Line 2328 `const [isSlideNoteDialogOpen, setIsSlideNoteDialogOpen] = useState(false)`
- **Draggable positioning**: Line 2347 `const slideNoteDialogDrag = useDraggableDialog(isSlideNoteDialogOpen)`

**Persistence via handleSaveSlide()**:
- **Function**: Lines 5953–5987
- **Calls**: `performSave("manual")` which includes `slideNoteDraft`
- **Returns**: `Promise<boolean>` — success/failure
- **Post-save**: Invalidates `listVersions`, refreshes deck

---

### Skill Execution Pattern (from "Use Your Own Article" in AIDraftModal)

**File**: `apps/web/client/src/components/presentation/AIDraftModal.tsx`

**Article Generate Skill Section** (Lines 1854–1967):
```typescript
// Toggle to enable skill-based generation
<Switch
  aria-label="Use your own article"
  checked={useCustomArticle}
  onCheckedChange={setUseCustomArticle}
/>

// Skill selector (SearchableCombobox)
<SearchableCombobox
  items={[{ value: "", label: "None — paste manually" }, ...articleGenSkillItems]}
  value={articleGenSkill || ""}
  onValueChange={(v) => {
    setArticleGenSkill(v);
    setArticleGenParams({});
    setArticleGenAdvancedOpen(false);
  }}
  placeholder="Select a skill to generate article..."
/>

// Advanced Options (Collapsible with DynamicSkillForm)
<Collapsible open={articleGenAdvancedOpen} onOpenChange={setArticleGenAdvancedOpen}>
  <CollapsibleTrigger asChild>
    <Button variant="ghost" size="sm" className="h-7 gap-1 px-2">
      <Settings2 className="h-3.5 w-3.5" />
      Advanced Options
    </Button>
  </CollapsibleTrigger>
  <CollapsibleContent>
    <DynamicSkillForm
      schema={articleGenSchema}
      language={language === "th" ? "th" : "en"}
      values={articleGenParams}
      onChange={setArticleGenParams}
      excludeFields={["topic", "prompt", "subject", "reference_images"]}
    />
  </CollapsibleContent>
</Collapsible>

// Generate button
<Button
  type="button"
  size="sm"
  variant="outline"
  disabled={isGeneratingArticle || (!topic.trim() && Object.keys(articleGenParams).length === 0)}
  onClick={handleGenerateArticle}
>
  {isGeneratingArticle ? <>Generating...</> : <>Generate Article</>}
</Button>

// Result textarea
<textarea
  id="ai-custom-article"
  placeholder="Paste your article here, or use a skill above to generate one..."
  value={customArticleText}
  onChange={(e) => setCustomArticleText(e.target.value)}
/>
```

---

### Skill Execution Flow (tRPC + Hook)

**tRPC Mutation**:
- **File**: `apps/web/server/routers/chat.ts`
- **Procedure**: Lines 1220–1244 (executeSkill)
- **Input schema**: Lines 1222–1242
  ```typescript
  z.object({
    skillId: z.string().min(1).max(50),
    prompt: z.string().max(5000).optional(),
    conversationId: z.number().optional(),
    referenceImageUrls: z.array(z.string().min(1)).max(5).optional(),
    dynamicParams: z.record(z.any()).optional(),  // ← For form inputs
    // ... other optional fields
  })
  ```

**Frontend Execution Hook**:
- **File**: `apps/web/client/src/components/chat/skill/hooks/useSkillExecution.ts`
- **Hook pattern**: Lines 48–100
  ```typescript
  export function useSkillExecution(options: UseSkillExecutionOptions) {
    const mutation = trpc.chat.executeSkill.useMutation({
      onSuccess: (data) => { setResult(data); },
      onError: (err) => { setError(err); },
    });
    const execute = useCallback(
      async (params: {
        skillId: string;
        prompt?: string;
        dynamicParams: Record<string, any>;
      }): Promise<SkillExecutionResult | undefined> => {
        const _data = await mutation.mutateAsync({
          skillId: params.skillId,
          prompt: params.prompt,
          dynamicParams: params.dynamicParams,
          conversationId,
        });
        // Returns { success, skillId, type, resultUrl, message, error, ... }
      },
      [mutation]
    );
    return { execute, isLoading: mutation.isPending, error, result, reset };
  }
  ```

**Direct tRPC Usage** (as in AIDraftModal):
- **File**: `apps/web/client/src/components/presentation/AIDraftModal.tsx`
- **Line 783**: `const executeSkillMutation = trpc.chat.executeSkill.useMutation()`
- **Handler** (Lines 793–819):
  ```typescript
  const handleGenerateArticle = useCallback(async () => {
    if (!articleGenSkill || isGeneratingArticle) return;
    setIsGeneratingArticle(true);
    try {
      const result = await executeSkillMutation.mutateAsync({
        skillId: articleGenSkill,
        prompt: topic.trim() || undefined,
        dynamicParams: Object.keys(articleGenParams).length > 0 ? articleGenParams : undefined,
        referenceImageUrls: normalizedReferenceImageUrls,
      });
      // Handle result.success, result.message, result.error
      if (result.success) {
        setCustomArticleText(result.message || "");
      } else {
        toast.error(result.error || "Failed to generate article");
      }
    } finally {
      setIsGeneratingArticle(false);
    }
  }, [articleGenSkill, isGeneratingArticle, topic, articleGenParams, executeSkillMutation]);
  ```

---

### Skill Schema Fetching

**Query to load skill input form**:
- **File**: `apps/web/client/src/components/presentation/AIDraftModal.tsx`
- **Line 453–455**:
  ```typescript
  const articleGenSchemaQuery = trpc.skills.getInputSchema.useQuery(
    { skillId: articleGenSkill },
    { enabled: articleGenSkill !== "" && useCustomArticle, staleTime: 300_000 }
  );
  ```

**Server Endpoint**:
- **File**: `apps/web/server/routers/skills.ts`
- **Procedure**: Lines 1057–1066 (getInputSchema)
  ```typescript
  getInputSchema: protectedProcedure
    .input(z.object({ skillId: z.string() }))
    .query(async ({ input }) => {
      await syncSingleSkillIfChanged(input.skillId);
      const skill = getSkillByIdOrType(input.skillId);
      // Returns: { inputSchema, uiSchema, ... }
    }),
  ```

---

### AI Layout Rebuild Pattern (for inspiration)

**File**: `apps/web/client/src/pages/PresentationEditor.tsx`

**Function**: `handleApplyAIRecipeOverride(recipeId)` (Lines 4675–4744)
- **Inputs**:
  - Recipe ID (e.g., "poster-spotlight")
  - Narrative text (from slide notes or AI preview)
  - Canvas size
- **Workflow**:
  1. Build narrative object from notes + recipe + slide title
  2. Generate component instance using `buildBuiltInPresentationComponentInstanceFromNarrative()`
  3. Call `applyComponentContentUpdate()` to update UI state
  4. Save via `handleSaveSlide()`

**Key details**:
- **Narrative construction**: Lines 4680–4694 (adapts based on recipe)
- **Component building**: Lines 4704–4708
- **State update**: Lines 4712–4744 (aiDesign metadata, selection mode, etc.)

---

## Data Flow for Skill Regeneration Feature

```
[Slide Notes Dialog]
    ↓
[New: Skill Selector + Advanced Options + Generate Button]
    ↓
[trpc.chat.executeSkill (skillId, prompt=slideNoteDraft, dynamicParams)]
    ↓
[Server: LLM skill execution with fallback]
    ↓
[Result: { success, message, error }]
    ↓
[New: Populate result into target field or trigger layout rebuild]
    ↓
[handleSaveSlide() to persist]
```

---

## Risks & Considerations

### Design Risks
1. **UI real estate** — Slide notes dialog is already feature-rich. Adding skill regeneration needs careful placement:
   - Option A: Separate collapsible section within the notes dialog (like AIDraftModal)
   - Option B: Move to a floating toolbar near the notes icon
   - Option C: Add "regenerate" button in notes dialog footer (similar to "Generate Slide" → "Save + Generate")

2. **User mental model** — Is this for regenerating *slide content* (layout, visuals) or *note content* (editing the notes themselves)?
   - **If regenerating from notes** → Feed `slideNoteDraft` as `prompt`, populate result elsewhere (layout, narrative)
   - **If regenerating notes** → Feed slide content as context, populate result back into notes textarea

3. **Execution mode** — Some skills are async (return taskId). Need polling mechanism:
   - Check `isAsync: true` in response
   - Poll `presentation.ai.getDraftProgress` (Line 822 in AIDraftModal)
   - Or wait for result inline if <5s guaranteed

### Validation Risks
1. **Skill type check** — Ensure selected skill's `executionMode` is compatible with the target (article skills vs layout skills)
2. **Credits check** — Skill execution deducts credits. User needs visibility into cost before clicking "Generate"
3. **Conflict handling** — If notes are dirty, should force save before executing skill (pattern: handleAutoRelayoutSlide, line 6034–6040)

### Technical Risks
1. **Reference images** — DynamicSkillForm excludes `reference_images`. Need to decide if slide regeneration should support image context
2. **Conversation ID** — executeSkill is conversation-based. If no conversationId, skill execution still works (optional field)

---

## Key Files Summary

| Purpose | File | Key Lines |
|---------|------|-----------|
| **Slide notes UI** | `apps/web/client/src/pages/PresentationEditor.tsx` | 9997–10066 (Dialog), 2321–2688 (State) |
| **Skill execution** | `apps/web/client/src/pages/PresentationEditor.tsx` (add mutation) | 2212–2218 (tRPC hooks) |
| **Skill execution tRPC** | `apps/web/server/routers/chat.ts` | 1220–1244 (executeSkill procedure) |
| **Skill schema query** | `apps/web/server/routers/skills.ts` | 1057–1066 (getInputSchema procedure) |
| **Pattern reference** | `apps/web/client/src/components/presentation/AIDraftModal.tsx` | 1854–1967 (Full "Use Your Own Article" UI) |
| **Handler pattern** | `apps/web/client/src/components/presentation/AIDraftModal.tsx` | 793–819 (handleGenerateArticle) |
| **Layout rebuild pattern** | `apps/web/client/src/pages/PresentationEditor.tsx` | 4675–4744 (handleApplyAIRecipeOverride) |
| **Save logic** | `apps/web/client/src/pages/PresentationEditor.tsx` | 5953–5987 (handleSaveSlide) |

---

## Implementation Checklist

### Phase 1: UI Structure
- [ ] Identify placement (within notes dialog or separate)
- [ ] Add skill selector (SearchableCombobox + skill list)
- [ ] Add collapsible "Advanced Options" (DynamicSkillForm)
- [ ] Add "Generate" button (show loading state)

### Phase 2: State Management
- [ ] Add state: `selectedRegenSkill`, `regenSkillParams`, `isGenerating`, `regenResult`
- [ ] Wire up skill selector → fetch schema via `trpc.skills.getInputSchema`
- [ ] Wire up form changes → update params

### Phase 3: Execution
- [ ] Add tRPC mutation: `const executeSkillMutation = trpc.chat.executeSkill.useMutation()`
- [ ] Implement handler that calls mutation with `slideNoteDraft` as prompt
- [ ] Handle async skills (polling if needed)
- [ ] Handle success/error states

### Phase 4: Integration
- [ ] Decide target: regenerate what? (notes content, narrative sections, layout?)
- [ ] Wire result back to appropriate field
- [ ] Trigger save if needed
- [ ] Add success toast

### Phase 5: Testing
- [ ] Test skill selection + schema fetching
- [ ] Test execution with various skill types
- [ ] Test error handling (no credits, skill not found, etc.)
- [ ] Test async skills (if applicable)

---

## Open Questions

1. **What should be regenerated?**
   - Slide layout/narrative (via AI recipe)?
   - Notes content itself?
   - Slide title or body text?

2. **Where should result go?**
   - Replace notes content?
   - Populate a separate preview field?
   - Trigger layout rebuild automatically?

3. **Which skills are valid?**
   - Article/content generation skills only?
   - Include media generation skills (images, video)?
   - Filter by execution mode?

4. **Credit visibility?**
   - Show estimated cost before "Generate" button?
   - Allow users to pick lower-cost model?

5. **Async handling?**
   - If skill returns `isAsync: true`, should UI wait inline or show task ID?
   - Polling timeout (AIDraftModal uses 300s default)?
