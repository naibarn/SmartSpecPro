---
name: Presentation Editor Regen — Quick Reference
description: Fast lookup table for file paths, line numbers, and code patterns
type: reference
---

# Quick Reference: Slide Regeneration UI Implementation

## File Locations & Line Numbers

```
apps/web/client/src/pages/PresentationEditor.tsx
├─ State variables (line 2321)
│  └─ slideNoteDraft, slideNoteRepairStatusIndex, isSlideNoteDialogOpen
├─ tRPC hooks (line 2212-2215)
│  └─ Add: executeSkillMutation = trpc.chat.executeSkill.useMutation()
├─ Sync on slide change (line ~2320)
├─ Computed properties (line 2688-2699)
│  └─ slideNoteDirty, hasSavedSlideNote
├─ Dialog JSX (line 9997-10066)
│  └─ Textarea, buttons, footer
├─ handleSaveSlide() (line 5953-5987)
│  └─ Use when persisting results
└─ handleApplyAIRecipeOverride() (line 4675-4744)
   └─ Pattern: apply result to layout

apps/web/client/src/components/presentation/AIDraftModal.tsx
├─ Pattern: "Use Your Own Article" (line 1854-1967)
│  ├─ Toggle (line 1862-1866)
│  ├─ Skill selector (line 1876-1888)
│  ├─ Collapsible advanced options (line 1891-1913)
│  │  └─ Uses DynamicSkillForm
│  ├─ Generate button (line 1916-1937)
│  └─ Result field (line 1941-1964)
├─ Handler: handleGenerateArticle() (line 793-819)
│  └─ Pattern for executeSkill mutation
├─ Schema query (line 453-455)
│  └─ trpc.skills.getInputSchema.useQuery()
└─ State variables (lines 400-450)
   └─ articleGenSkill, articleGenParams, isGeneratingArticle, customArticleText

apps/web/server/routers/chat.ts
├─ Procedure: executeSkill (line 1220-1244)
│  └─ Input: { skillId, prompt, dynamicParams, ... }
│  └─ Output: { success, message, error, type, ... }
└─ Execution logic (line 1244-1600+)

apps/web/server/routers/skills.ts
├─ Procedure: getInputSchema (line 1057-1066)
│  └─ Input: { skillId }
│  └─ Output: { inputSchema, uiSchema, ... }
└─ Skill lookup: getSkillByIdOrType()
```

---

## Code Patterns: Copy-Paste Ready

### 1. Add tRPC Mutation to PresentationEditor.tsx (Line ~2215)

```typescript
const executeSkillMutation = trpc.chat.executeSkill.useMutation();
```

### 2. Skill Selector Component (Copy from AIDraftModal:1876–1888)

```typescript
<SearchableCombobox
  items={[{ value: "", label: "None — skip" }, ...availableSkills]}
  value={selectedSkill}
  onValueChange={(v) => {
    setSelectedSkill(v);
    setSkillParams({});
    setAdvancedOpen(false);
  }}
  placeholder="Select skill..."
/>
```

### 3. Collapsible Advanced Options (Copy from AIDraftModal:1891–1913)

```typescript
{selectedSkill && skillSchema && (
  <Collapsible open={advancedOpen} onOpenChange={setAdvancedOpen}>
    <CollapsibleTrigger asChild>
      <Button variant="ghost" size="sm">
        <Settings2 className="h-3.5 w-3.5" />
        Advanced Options
        <ChevronDown className={cn("h-3 w-3", advancedOpen && "rotate-180")} />
      </Button>
    </CollapsibleTrigger>
    <CollapsibleContent>
      <div className="mt-2 rounded-md border p-3">
        <DynamicSkillForm
          schema={skillSchema}
          language="en"
          values={skillParams}
          onChange={setSkillParams}
        />
      </div>
    </CollapsibleContent>
  </Collapsible>
)}
```

### 4. Generate Button (Copy from AIDraftModal:1916–1937)

```typescript
<Button
  onClick={handleGenerate}
  disabled={!selectedSkill || isGenerating}
>
  {isGenerating ? (
    <>
      <Loader2 className="h-3.5 w-3.5 animate-spin" />
      Generating...
    </>
  ) : (
    <>
      <Sparkles className="h-3.5 w-3.5" />
      Generate
    </>
  )}
</Button>
```

### 5. Execution Handler (Copy from AIDraftModal:793–819)

```typescript
const handleGenerate = useCallback(async () => {
  if (!selectedSkill || isGenerating) return;
  setIsGenerating(true);
  try {
    const result = await executeSkillMutation.mutateAsync({
      skillId: selectedSkill,
      prompt: slideNoteDraft.trim() || undefined,
      dynamicParams: skillParams,
    });

    if (result.success) {
      // Apply result to target field
      if (result.message) {
        // For text skills: populate result
        setResultContent(result.message);
        toast.success("Generated successfully");
      }
    } else {
      toast.error(result.error || "Generation failed");
    }
  } catch (err) {
    toast.error("Error: " + (err instanceof Error ? err.message : "Unknown"));
  } finally {
    setIsGenerating(false);
  }
}, [selectedSkill, isGenerating, skillParams, slideNoteDraft, executeSkillMutation]);
```

### 6. Schema Fetching (From AIDraftModal:453–455)

```typescript
const schemaQuery = trpc.skills.getInputSchema.useQuery(
  { skillId: selectedSkill },
  { enabled: selectedSkill !== "", staleTime: 300_000 }
);
const skillSchema = schemaQuery.data;
```

---

## State Management Template

```typescript
// Add to PresentationEditor.tsx state block (around line 2321)

// Skill regeneration feature
const [selectedRegenSkill, setSelectedRegenSkill] = useState<string>("");
const [regenSkillParams, setRegenSkillParams] = useState<Record<string, any>>({});
const [isGeneratingContent, setIsGeneratingContent] = useState(false);
const [regenResult, setRegenResult] = useState<string>("");
const [advancedOptionsOpen, setAdvancedOptionsOpen] = useState(false);

// Skill schema
const regenSkillSchemaQuery = trpc.skills.getInputSchema.useQuery(
  { skillId: selectedRegenSkill },
  { enabled: selectedRegenSkill !== "", staleTime: 300_000 }
);
const regenSkillSchema = regenSkillSchemaQuery.data;
```

---

## UI Placement Options

### Option A: Within Slide Notes Dialog (Recommended)

```
┌─────────────────────────────────┐
│ Slide Note                      │
├─────────────────────────────────┤
│ [Unsaved] | 0 chars             │
├─────────────────────────────────┤
│ <textarea: slide notes>          │
├─────────────────────────────────┤
│ ┌───────────────────────────────┐ ← NEW
│ │ Regenerate from Skill         │ ← NEW
│ │ [Skill Selector]              │ ← NEW
│ │ > Advanced Options            │ ← NEW
│ │ [Generate] [Advanced]         │ ← NEW
│ └───────────────────────────────┘ ← NEW
├─────────────────────────────────┤
│ [Copy] [Close] [Regen] [Save]   │
└─────────────────────────────────┘
```

### Option B: Separate Floating Toolbar

```
[Slide Content Area]
    ↑ [Sparkles icon] Regenerate  ← NEW button
      Skill: [dropdown]
      [Generate]
```

---

## Import Statements Required

```typescript
// In PresentationEditor.tsx, add to existing imports:
import { Settings2, Sparkles, Loader2, ChevronDown } from "lucide-react";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import DynamicSkillForm from "@/components/media/DynamicSkillForm";
import { SearchableCombobox } from "@/components/presentation/SearchableCombobox";
import { cn } from "@/lib/utils";
```

---

## API Contract: executeSkill

**Client Call**:
```typescript
executeSkillMutation.mutateAsync({
  skillId: "string",                         // e.g., "parenting-article-writer"
  prompt?: "string",                         // e.g., slideNoteDraft
  dynamicParams?: Record<string, any>,       // Form inputs
  referenceImageUrls?: string[],             // 0-5 images
  conversationId?: number,                   // Optional
})
```

**Server Response**:
```typescript
{
  success: boolean,
  skillId: string,
  type: "text" | "image" | "video" | "audio" | "action",
  message?: string,                          // For text skills (e.g., article content)
  resultUrl?: string,                        // For media skills
  resultUrls?: string[],                     // For multi-item media
  error?: string,                            // If success === false
  creditsUsed?: number,
  taskId?: string,                           // For async (isAsync === true)
  isAsync?: boolean,                         // Indicates polling needed
}
```

---

## Debugging Checklist

- [ ] Check Network tab: Does executeSkill request go out?
- [ ] Check Response: Is `success === true`?
- [ ] Check `message` field: Does it contain expected content?
- [ ] Check `error` field: If failed, what's the error message?
- [ ] Check server logs: Any tRPC errors or validation failures?
- [ ] Check skill registry: Is selected skill available? (`getSkillByIdOrType()`)
- [ ] Check credits: Does user have enough credits for skill?
- [ ] Check rate limiting: Is user hitting skill execution rate limit?

---

## Testing Template

```typescript
// Vitest test case
describe("Slide regeneration from skill", () => {
  it("executes skill with slide notes as prompt", async () => {
    // 1. Select skill
    fireEvent.change(skillSelector, { target: { value: "test-skill" } });

    // 2. Click generate
    fireEvent.click(generateButton);
    await waitFor(() => expect(isGeneratingIndicator).toBeInTheDocument());

    // 3. Verify mutation called with correct params
    expect(executeSkillMutation.mutateAsync).toHaveBeenCalledWith(
      expect.objectContaining({
        skillId: "test-skill",
        prompt: slideNoteDraft,
      })
    );

    // 4. Verify result displayed
    await waitFor(() => {
      expect(resultField).toHaveValue("Generated content...");
    });
  });

  it("shows error if skill execution fails", async () => {
    executeSkillMutation.mutateAsync.mockRejectedValueOnce(
      new Error("Skill not found")
    );

    fireEvent.click(generateButton);

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith(expect.stringContaining("Skill not found"));
    });
  });
});
```

---

## Common Pitfalls & Solutions

| Pitfall | Solution |
|---------|----------|
| Skill selector doesn't show skills | Ensure `availableSkills` is populated (query or hardcoded list) |
| "Advanced Options" doesn't appear | Check `skillSchema && selectedSkill` guard before rendering Collapsible |
| Form inputs not captured | Verify `DynamicSkillForm onChange` wires to state |
| Button disabled when shouldn't be | Check `disabled` condition (should be `!selectedSkill \|\| isGenerating`) |
| Result not displayed | Check `result.success === true`, then check `result.message` field |
| Mutation not firing | Verify `executeSkillMutation` hook is called (line 2215) |
| Types missing (DynamicSkillForm) | Import from `@/components/media/DynamicSkillForm` with proper type |

