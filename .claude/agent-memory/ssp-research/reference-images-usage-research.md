# Reference Images Usage Research Brief

## Findings

### 1. Reference Images Exist Throughout the Stack
Reference images are a fully integrated feature spanning React UI, Node.js backend, and Python media generation. They serve as context for both LLM and media generation models.

**Key observation:** Reference images are primarily **URL-based** (no file upload for reference images to database). URLs are either:
- Relative paths starting with `/` (local uploads to S3/R2)
- HTTP/HTTPS URLs (external or public assets)

### 2. UI Layer: Draft with AI Modal

**File:** `/home/dev/projects/SmartSpecPro/apps/web/client/src/components/presentation/AIDraftModal.tsx`

**State management:**
- Line 375: `referenceImages` state holds `ReferenceImageItem[]` (url + name)
- Line 687-705: `normalizedReferenceImageUrls` memoized computed value deduplicates and validates URLs (max 5 images)
- Line 909-910: Reference images cleared on modal open (per-task basis, not persistent across drafts)

**Reference image sources (user adds via UI):**
- Line 1115-1132: File upload handler (`uploadReferenceMutation`) converts base64 → server upload → returns signed URL
- Line 745-764: Library search results (users can pick from existing library files)
- Line 1179+: Manual URL input field

**Form rendering:**
- Lines 1024-1050: DynamicSkillForm renders image fields from skill schema
- Lines 375-379: Separate UI controls for reference images + library search

### 3. Data Flow: UI → Backend

**AIDraftModal to generateDraft mutation (line 1155-1276):**
```
handleGenerate() {
  // Line 1229-1232: Reference images passed in generateDraft call
  referenceImageUrls: normalizedReferenceImageUrls.length > 0
    ? normalizedReferenceImageUrls
    : undefined,

  // Also passed to skill parameters (line 1251-1258)
  draftSkillParams: articleSkillParams  // May include reference_images from form
  articleSkillParams: articleSkillParams
  mediaSkillParams: mediaSkillParams
}
```

**Article generation with executeSkill (line 785-795):**
```
await executeSkillMutation.mutateAsync({
  skillId: articleGenSkill,
  prompt: topic,
  dynamicParams: articleGenParams,
  referenceImageUrls: normalizedReferenceImageUrls.length > 0
    ? normalizedReferenceImageUrls
    : undefined,
})
```

### 4. Input Validation Schema

**File:** `/home/dev/projects/SmartSpecPro/apps/web/shared/presentation/aiTypes.ts`

**Lines 60-66:** `referenceImageUrlSchema`
```typescript
z.string()
  .min(1)
  .max(2048)
  .refine((value) => value.startsWith("/") || /^https?:\/\//i.test(value), {
    message: "Reference URL must be a relative path or http(s) URL",
  })
```

**Lines 172-190:** GenerateAIDraftInputSchema includes:
```typescript
referenceImageUrls: z.array(referenceImageUrlSchema).max(5).optional(),
```

**Max 5 reference images per draft generation.**

### 5. Backend Processing: Node.js

**File:** `/home/dev/projects/SmartSpecPro/apps/web/server/services/aiPresentationService.ts`

**Normalization (lines 2540-2560):**
```typescript
function normalizeReferenceImageUrls(referenceImageUrls?: string[]): string[] {
  // Deduplicates, validates URL format
  // Returns string[] (empty if invalid or missing)
}
```

**Line 4328:** Input reference URLs normalized at start of `generateAIDraft()`

**Sync targets for media models (lines 2618-2650):**
- Reference images can be synced to model fields marked with `syncWith: "reference_images"`
- Used in `applyFieldSyncTargets()` to populate model-specific reference image fields

**Usage in media generation (lines 4887-4910):**
```typescript
// For video generation
{
  prompt: imagePrompt,
  model: imageModelToUse,
  ...(normalizedReferenceImageUrls.length > 0
    ? { referenceImageUrls: normalizedReferenceImageUrls }
    : {}),
}

// For image generation (same pattern)
{
  prompt: imagePrompt,
  model: imageModelToUse,
  ...(normalizedReferenceImageUrls.length > 0
    ? { referenceImageUrls: normalizedReferenceImageUrls }
    : {}),
}
```

### 6. Model Input Synchronization

**File:** `/home/dev/projects/SmartSpecPro/apps/web/client/src/lib/mediaModelInputs.ts`

**Lines 63-99:** `parseModelInputFields()` infers sync targets:
- Fields with `type: "image_urls"` | `"video_urls"` | `"audio_urls"` → inferred as `syncWith: "reference_images"`
- Fields with key matching patterns like `referenceImages`, `referenceImage`, `imageUrls` → synced
- Explicitly declared `syncWith: "reference_images"` in model config takes priority

**Lines 229-262:** `applyModelSyncTargets()`
- Merges reference image URLs into model extra parameters
- `reference_images` sync target populated from `syncValues.referenceImageUrls`

**Line 264-266:** `hasReferenceImageSyncField()` checks if model supports reference images

### 7. Skill Parameter Usage

**Files:**
- `/home/dev/projects/SmartSpecPro/apps/web/client/src/components/media/DynamicSkillForm.tsx` (lines 143-150)
- `/home/dev/projects/SmartSpecPro/apps/web/client/src/components/presentation/AIDraftModal.tsx` (lines 1251-1258)

**DynamicSkillForm fields:**
- `type: "image" | "images"` — single or multiple image fields from skill schema
- `type: "imageUpload"` — upload interface for skill-specific images
- Can be part of article skill, image skill, or video skill schemas

**AIDraftModal usage (line 1251-1258):**
```typescript
draftSkillParams: !useCustomArticle && Object.keys(articleSkillParams).length > 0
  ? articleSkillParams
  : undefined,

articleSkillParams: !useCustomArticle && isArticleDraftSkill(selectedDraftSkillRecord)
  && Object.keys(articleSkillParams).length > 0
  ? articleSkillParams
  : undefined,
```

### 8. LLM Prompt Enhancement Service

**File:** `/home/dev/projects/SmartSpecPro/apps/web/server/services/promptEnhancementService.ts`

**Lines 10-21:** PromptEnhancementRequest interface:
```typescript
referenceImages?: string[];
referenceImageRoles?: Array<{
  role?: string;
  notes?: string;
}>;
```

**Lines 892-904:** Reference images included in system prompt:
```typescript
if (request.referenceImages && request.referenceImages.length > 0) {
  systemPrompt += `\n## Reference Images: ${request.referenceImages.length} image(s)\n`;
  systemPrompt += `Start prompt with: "Using image(s) as reference, generate..."\n`;

  if (request.referenceImageRoles?.length) {
    // Add role descriptions for each reference image
  }
}
```

**Lines 1128-1135:** User prompt includes reference image count and role descriptions

### 9. Chat/Article Generation with Reference Images

**File:** `/home/dev/projects/SmartSpecPro/apps/web/server/routers/chat.ts`

**Lines 1393-1400:** When building extra params for skill execution:
```typescript
// Exclude reference_images — they are sent as multimodal image_url content parts instead
.filter(([k, v]) => v !== undefined && v !== null && v !== "" && k !== "reference_images")
```

**Key insight:** Reference images are FILTERED OUT of text params and instead sent as multimodal image content to the LLM (OpenAI vision API pattern).

### 10. Python Backend: Image/Video Generation Executors

**File:** `python-backend/app/orchestrator/node_executors/image_executor.py`

**Lines 67-74:** Reference images handled:
```python
ref_images_raw = inputs.get("referenceImages") or config.get("referenceImages")
reference_images: list[str] = []
if isinstance(ref_images_raw, list):
    reference_images = [str(u) for u in ref_images_raw if u]
elif isinstance(ref_images_raw, str) and ref_images_raw.strip():
    reference_images = [u.strip() for u in ref_images_raw.split(",") if u.strip()]
```

**Lines 99-100:** Passed to media generation API:
```python
if reference_images:
    trpc_input["imageUrls"] = reference_images
```

**File:** `python-backend/app/llm_proxy/providers/kie_ai_provider.py`

- Kie.ai API provider receives reference images as `imageUrls` parameter
- Images included in task payload for image/video generation

### 11. Media Model Configuration

**File:** `/home/dev/projects/SmartSpecPro/apps/web/server/services/aiPresentationService.ts` (lines 2258-2380)

**MediaModelInputField structure:**
```typescript
type: "image_urls" | "video_urls" | "audio_urls" | "library_file" | ...
syncWith: "reference_images" | "prompt" | "aspect_ratio" | "none"
```

Models can declare which fields should sync with global reference images or use their own.

---

## Current Architecture

### Image Sources Currently Available

1. **Local Upload:** User uploads file → Base64 → tRPC upload endpoint → S3/R2 storage → Returns signed URL
   - Works in AIDraftModal for reference images
   - Works in DynamicSkillForm for skill-specific images
   - Stored in temporary upload location

2. **Library Search:** User searches existing library files
   - Returns library items with `source_url` (already in S3/R2)
   - Can be picked and added to reference images

3. **Manual URL Entry:** User pastes HTTP/HTTPS URL or `/relative/path`
   - Validated but not downloaded/verified until generation time
   - Passed through to media API

### Image Sharing & Persistence

**Current behavior:**
- Reference images in AIDraftModal: **Session-scoped** (cleared on modal reopen)
- Reference images in DynamicSkillForm: **Per-skill instance** (stored in form state)
- No group/team sharing of reference image collections
- No saved "reference image kits" or templates

### Image Generation Usage

**Reference images used for:**
1. **Article generation (LLM):** Passed as vision context to LLM (if provider supports multimodal)
2. **Image generation:** Passed to `generateImageAsync()` as `referenceImageUrls` parameter
3. **Video generation:** Passed to `generateVideoAsync()` as `referenceImageUrls` parameter
4. **Media model extra params:** Auto-synced if model field declares `syncWith: "reference_images"`

**NOT currently used for:**
- Audio-only generation (though Suno models might support style reference)
- Text content layout decisions
- Watermark generation (watermark is separate, has own URL)

---

## Risks

1. **Reference image URLs are NOT validated at submission time** — only format checked (must start with `/` or http/https). External URLs may 404 during generation, causing failures downstream.

2. **Max 5 reference images is hardcoded** — if users want to reference more, no way to extend this without schema change.

3. **Reference images persist only in local state** — reloading the modal loses all references. Users must re-upload or re-enter URLs.

4. **No conflict resolution between skill params and global reference images** — if both `draftSkillParams` and global `referenceImageUrls` contain images, both get passed. Behavior depends on backend merging logic.

5. **Image upload endpoint URL is temporary** — uploaded reference images go to temp storage. Unclear TTL/cleanup policy for old uploads.

6. **Skill schema images vs global reference images** — potential UX confusion: DynamicSkillForm has its own image upload, separate from the global AIDraftModal reference images. Both exist but serve different purposes.

7. **Backend filtering of `reference_images` from text params** (`chat.ts:1396`) suggests images are sent via multimodal API, but no validation that LLM provider actually supports vision.

---

## Options

### Option 1: Persistent Reference Image Collections (No Change)
- Keep current URL-based approach
- Add optional "Save as Template" UI to store reference image set
- Require users to manually re-enter URLs each session
- **Pros:** Minimal code change
- **Cons:** Poor UX, repeated data entry

### Option 2: Reference Image Library Integration (Medium Effort)
- Create `/api/reference-image-libraries` endpoint
- Let users create named collections of reference image URLs
- AIDraftModal fetches from saved collections
- Persist collections per user in database
- **Pros:** Better UX, persistent across sessions
- **Cons:** Requires DB schema for collections, migration

### Option 3: Enhanced Skill Schema Support (Low Effort, High Value)
- Document that DynamicSkillForm can include image fields with `type: "images"`
- Clarify when to use skill image fields vs. global reference images
- Provide better error messaging if image sync conflicts occur
- **Pros:** Clarifies existing feature
- **Cons:** Doesn't solve fundamental architecture issue

### Option 4: Image Staging & Pre-Validation (Medium Effort)
- On reference image addition, validate URL immediately (HEAD request or download headers)
- Show warning icon if URL unreachable
- Store validation status with reference image in state
- Skip unreachable images at generation time
- **Pros:** Better error handling and UX
- **Cons:** Adds latency to image addition

---

## Recommendation

**Implement Option 3 + Option 4 incrementally:**

1. **Short-term (v1):** Add input validation for reference images
   - When user adds URL, fetch HEAD request to verify accessibility
   - Display warning if URL 404 or returns non-image content-type
   - Document in UI help text: "Reference images are optional context for AI models"

2. **Medium-term (v2):** Enhance skill schema documentation
   - Document `type: "images"` field for skills
   - Show in AdminMediaModels that models can declare `syncWith: "reference_images"`
   - Clarify UX: global reference images are for ALL slides, skill images are per-skill

3. **Long-term (v3):** Reference image collections
   - Add "Save Collection" button in AIDraftModal
   - Persist to database per user
   - Reuse collections across multiple draft sessions

**Rationale:**
- Reference images are already working end-to-end
- Main pain point is validation + persistence across sessions
- Skill schema support exists but is underdocumented
- Gradual approach avoids large DB migration

---

## Open Questions

1. **What is the TTL for uploaded reference images** (`uploadReferenceMutation` endpoint result)?
   - Are they cleaned up automatically?
   - Can users reference them indefinitely?

2. **Does the LLM multimodal image sending actually work**?
   - In chat.ts:1396, reference_images are filtered from text params
   - But where/how are they added back as vision content?
   - Is this implemented for all LLM providers?

3. **How do skill-specific images interact with global reference images**?
   - If a skill has `imageUrls` field in schema AND user selects global reference images, what gets sent?
   - Is there precedence/merging logic?

4. **Can reference images be URLs to S3/R2 that user doesn't have public read access to**?
   - If URLs are signed/temporary, will they expire before generation completes?

5. **What happens if a reference image 404s during media generation**?
   - Does the generation fail?
   - Or does the model API gracefully ignore missing images?
   - Audit log entry for this?

6. **Is reference image support model-dependent**?
   - Do all image/video models support reference images?
   - If not, how is this communicated to users?

7. **Why is there both `referenceImages` state and DynamicSkillForm images**?
   - Could there be a unified image management component?
   - Or are they intentionally separate (global vs. skill-specific)?
