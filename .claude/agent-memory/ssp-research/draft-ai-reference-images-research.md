# Draft with AI — Reference Images UI & Data Flow Research

**Date**: 2026-03-10 | **Status**: COMPLETE | **Type**: Feature architecture

---

## Summary

Reference images in AIDraftModal are positioned **early in the form** (lines 1497-1659) to feed article generation, image generation, and video generation phases. Images flow through 3 UI channels (upload, library, manual URL) and are sent as multimodal OpenAI-compatible messages to the LLM.

---

## 1. Reference Images UI Position

**File**: `apps/web/client/src/components/presentation/AIDraftModal.tsx`
**Lines**: 1497-1659 (163 lines)
**Position**: BEFORE skill selection, early in form
**Max Images**: 5 (constant MAX_MEDIA_REFERENCES, line 135)

**Placement Rationale** (line 1497 comment):
```
Reference images — placed early so they feed into article gen, image gen, and video gen
```

**UI Sections**:
1. Label + description (1499-1502)
2. Add image actions row: Upload | From Library | Manual URL (1504-1629)
3. Added images preview grid (1631-1658)

---

## 2. Skill-Specific Form Rendering (DynamicSkillForm)

**Component**: `apps/web/client/src/components/media/DynamicSkillForm.tsx`
**Imported in AIDraftModal**: Line 51

**SkillInputSchema Structure** (lines 143-150):
```typescript
interface SkillInputSchema {
  title: string;
  titleTh?: string;
  sections: SkillInputSection[];  // Array of collapsible sections with fields
  outputMapping?: Record<string, string>;
}
```

**How Used in AIDraftModal** (lines 1709-1716):
```typescript
<DynamicSkillForm
  schema={articleGenSchema}
  language={language === "th" ? "th" : "en"}
  values={articleGenParams}
  onChange={setArticleGenParams}
  excludeFields={["topic", "prompt", "subject", "reference_images"]}  // ← Exclude ref images
/>
```

**Key Insight**: `reference_images` is **explicitly excluded** from skill schemas. It's handled at the modal level, not in individual skill configurations.

---

## 3. Image Upload/Selection Channels

### A. Upload Channel (Lines 1505-1526)
```typescript
<input
  ref={referenceFileInputRef}
  type="file"
  accept="image/*"
  multiple
  onChange={handleReferenceFileUpload}
/>
<Button onClick={() => referenceFileInputRef.current?.click()}>Upload</Button>
```

**Handler**: `handleReferenceFileUpload` → `uploadReferenceMutation` (tRPC)

### B. Library Channel (Lines 1527-1604)
```typescript
<Collapsible>
  <CollapsibleTrigger><Button>From Library</Button></CollapsibleTrigger>
  <CollapsibleContent>
    {/* Grid of thumbnails from referenceLibraryQuery */}
    {/* Click → handleAddReferenceFromLibrary(url) */}
  </CollapsibleContent>
</Collapsible>
```

**Data Source**: `referenceLibraryQuery` (tRPC query)
**Grid Size**: 4-5 columns, lazy-loaded thumbnails, scrollable

### C. Manual URL Channel (Lines 1605-1628)
```typescript
<Input placeholder="https://... or /uploads/..." />
<Button onClick={handleAddReferenceUrl}><Plus /> URL</Button>
```

**Handler**: `handleAddReferenceUrl()` — validates and adds URL
**Accepts**: Absolute (`https://...`) or relative paths (`/uploads/...`)

---

## 4. Data Flow: UI → Form Submission → Skill Execution → LLM

### Step 1: State Management (Line 375)
```typescript
const [referenceImages, setReferenceImages] = useState<ReferenceImageItem[]>([]);

interface ReferenceImageItem {
  url: string;
  name: string;
}
```

- Cleared on modal open (line 909)
- Persisted to localStorage (debounced, line 1152)
- Max 5 items enforced in UI

### Step 2: Form Submission → tRPC (Lines 1225-1231)
```typescript
await generateDraft.mutateAsync({
  imagePromptContext: imagePromptContext.trim() || undefined,
  referenceImageUrls:
    normalizedReferenceImageUrls.length > 0
      ? normalizedReferenceImageUrls
      : undefined,
  // ... other fields ...
});
```

**URL Normalization** (lines 691-704):
Dedupes and trims reference image URLs before sending.

### Step 3: Article Generation with References (Lines 785-795)
When user selects an article skill and generates:
```typescript
const result = await executeSkillMutation.mutateAsync({
  skillId: articleGenSkill,
  prompt: topic.trim() || undefined,
  dynamicParams: articleGenParams,
  referenceImageUrls: normalizedReferenceImageUrls,  // ← Passed here
});
```

### Step 4: Skill Execution Endpoint (chat.ts:1211-1235)

**tRPC Input Schema**:
```typescript
executeSkill: protectedProcedure.input(
  z.object({
    skillId: z.string(),
    prompt: z.string().optional(),
    referenceImageUrls: z.array(z.string().min(1)).max(5).optional(),  // ← Accepted here
    dynamicParams: z.record(z.any()).optional(),
    // ... other fields ...
  })
)
```

### Step 5: Multimodal LLM Message Building (chat.ts:1405-1420)

**URL Conversion & Message Construction**:
```typescript
const hasRefImages = input.referenceImageUrls && input.referenceImageUrls.length > 0;
if (hasRefImages) {
  const baseUrl = (ctx.publicUrl || "").replace(/\/+$/, "");
  const contentParts = [
    { type: "text", text: userPrompt },
  ];
  for (const imgUrl of input.referenceImageUrls!) {
    // Convert relative URLs to absolute
    const absoluteUrl = imgUrl.startsWith("http") ? imgUrl : `${baseUrl}${imgUrl}`;
    contentParts.push({ type: "image_url", image_url: { url: absoluteUrl } });
  }
  llmMessages.push({ role: "user", content: contentParts });
} else {
  llmMessages.push({ role: "user", content: userPrompt });
}
```

**Key Details**:
- Relative paths (`/uploads/...`) converted to absolute only for external LLM API
- Each image sent as OpenAI-compatible `image_url` content part
- Works with any OpenAI-compatible provider (Claude, GPT, etc.)

### Step 6: LLM API Call (chat.ts:1477-1487)
```typescript
const llmResponse = await fetch(apiUrl, {
  method: "POST",
  headers: { "Authorization": `Bearer ${provider.apiKey}` },
  body: JSON.stringify({
    model: provider.providerModelId,
    messages: llmMessages,  // ← Includes multimodal content
    stream: false,
  }),
});
```

---

## 5. Skill Schema Loading

**File**: `apps/web/server/routers/skills.ts`
**Procedure**: `getInputSchema` (lines 1019-1134)

**Priority Order**:
1. `{folderPath}/schemas/ui.schema.json` (preferred)
2. `{folderPath}/schemas/input.schema.json` (JSON Schema)

**Example Schema** (`image-creator/ui.schema.json`):
```json
{
  "sections": [
    {
      "id": "generate",
      "title": "Generate Image",
      "titleTh": "สร้างภาพ",
      "icon": "image",
      "fields": [
        {
          "id": "description",
          "type": "textarea",
          "label": "Image Description",
          "required": true
        }
      ]
    }
  ]
}
```

**Note**: No `reference_images` field in schemas. Handled at modal level.

---

## 6. Key Architecture Patterns

1. **Early Positioning**: Reference images placed before skill config because they feed all phases
2. **Multi-Channel Ingestion**: Upload, library, manual URL all update same state array
3. **Modal-Level Ownership**: Not defined in skill schemas, owned by AIDraftModal
4. **Smart URL Handling**: Relative paths preserved locally, converted to absolute for external APIs
5. **Multimodal LLM Integration**: Images sent as OpenAI-compatible message parts

---

## 7. Key Files

| File | Lines | Purpose |
|------|-------|---------|
| AIDraftModal.tsx | 1497-1659 | Reference images UI section |
| AIDraftModal.tsx | 785-795 | Article generation with references |
| DynamicSkillForm.tsx | 143-150, 84-128 | Schema-driven form rendering |
| chat.ts (routers) | 1211-1420 | Skill execution + LLM multimodal |
| skills.ts (routers) | 1019-1134 | Schema loading endpoint |

---

## 8. Questions for Implementation

1. Should `reference_images` field be skill-configurable (per-skill max count)?
2. Should uploaded images be cached server-side?
3. Should audit logs include which specific images were sent to LLM?
4. Should there be per-image MIME type validation?

