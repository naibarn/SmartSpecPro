---
name: Video Editor Metadata Storage & Draft AI Panel Architecture
description: Complete mapping of how video editor stores clip metadata, reference images, and prompts; VideoDraftAIPanel rendering; integration pattern for imported draft clips
type: reference
---

# Video Editor Metadata Storage & Draft AI Panel Architecture

## Research Date
2026-03-18

## Executive Summary

The video editor stores clip metadata in the `Asset` and `Clip` types, with NO dedicated fields for prompts/reference images. However, the presentation system (which feeds imported drafts to video editor) ALREADY STORES prompts and reference URLs in `PresentationSlideElement` types. When importing presentation drafts to video editor, the system should:

1. **Extend `Asset` type** to include metadata fields: `prompt`, `modelId`, `referenceUrls`
2. **Store in `Clip` object** via optional `metadata?: { prompt?, modelId?, referenceUrls? }` field
3. **Pass through `VideoDraftAIPanel` via context** — when a clip is selected, populate the panel from this metadata
4. **Use existing `PresentationDraftImportVisual` structure** as the source of truth

---

## Part 1: Type Definitions

### 1.1 Asset Type (videoEditor.ts, lines 80-106)

```typescript
export interface Asset {
  id: string;
  type: 'video' | 'audio' | 'image';
  source: 'generated' | 'imported';

  // For generated media
  taskId?: string;           // backend task_id
  model?: string;

  // File info
  name?: string;             // display name
  path: string;              // local path in workspace
  originalPath?: string;     // original URL if generated
  filename: string;
  format: string;

  // Metadata
  duration: number;
  width?: number;
  height?: number;
  fps?: number;
  sampleRate?: number;

  // Cache
  thumbnailPath?: string;
  waveformData?: number[];   // for audio visualization
}
```

**CURRENT STATE:** No prompt, reference, or model metadata fields.

### 1.2 Clip Type (videoEditor.ts, lines 46-65)

```typescript
export interface Clip {
  id: string;
  assetId: string;           // references assets object
  trackId: string;
  startTime: number;         // position in timeline (seconds)
  duration: number;          // visible duration (seconds)
  trimIn: number;            // trim from start (seconds)
  trimOut: number;           // trim from end (seconds)
  volume: number;            // 0.0 - 1.0
  speed: number;             // 0.5 - 2.0
  effects: Effect[];
  transitions?: {
    fadeIn?: number;         // fade in duration (seconds)
    fadeOut?: number;        // fade out duration (seconds)
  };
  inTransition?: ClipTransition;  // Clip-to-clip transition from previous clip
  transform?: ClipTransform;      // For overlay clips
  textConfig?: TextConfig;        // For text clips
  groupId?: string;               // For compound clip grouping
}
```

**CURRENT STATE:** No metadata field for prompt/reference storage.

### 1.3 MediaLibraryAsset Type (videoEditor.ts, lines 340-353)

```typescript
export interface MediaLibraryAsset {
  id: string;
  type: 'video' | 'audio' | 'image';
  title: string;
  thumbnailUrl: string;
  duration: number;
  url: string;
  model: string;
  createdAt: Date;
  resolution?: string;
  format: string;
  localPath?: string;
  fileSize?: number;
}
```

**CURRENT STATE:** Has `model` field but no prompt/reference storage.

### 1.4 PresentationSlideElement Type (shared/presentation/contracts.ts)

For **image elements** (lines 257-279):
```typescript
imagePrompt: z.string().max(4_000).optional(),
imageModelId: z.string().max(256).optional(),
imageReferenceUrls: z.array(z.string().max(2_048)).max(5).optional(),
imageExtraParams: z.record(z.unknown()).optional(),
```

For **video elements** (lines 281-306):
```typescript
videoPrompt: z.string().max(4_000).optional(),
videoModelId: z.string().max(256).optional(),
videoReferenceUrls: z.array(z.string().max(2_048)).max(5).optional(),
videoExtraParams: z.record(z.unknown()).optional(),
```

**KEY INSIGHT:** Presentation system already stores prompts + reference URLs + model IDs on a PER-ELEMENT basis.

### 1.5 PresentationDraftImportVisual Type (presentationDraftImport.ts, lines 17-24)

```typescript
export interface PresentationDraftImportVisual {
  type: "image" | "video";
  src: string;
  title: string;
  prompt?: string;
  modelId?: string;
  referenceUrls?: string[];
}
```

**KEY INSIGHT:** This is populated from PresentationSlideElement.{imagePrompt, imageModelId, imageReferenceUrls} / {videoPrompt, videoModelId, videoReferenceUrls} at lines 106-124.

---

## Part 2: VideoDraftAIPanel Component

### 2.1 Location & Props

**File:** `/home/dev/projects/SmartSpecPro/apps/web/client/src/components/videoeditor/VideoDraftAIPanel.tsx` (617 lines)

**Props Interface (lines 33-40):**
```typescript
interface VideoDraftAIPanelProps {
  projectWidth: number;
  projectHeight: number;
  isGenerating: boolean;
  isPreparingPresentationDraft?: boolean;
  onGenerate: (request: VideoDraftAIGenerateRequest) => Promise<void>;
  onOpenPresentationDraft?: () => void;
}
```

**Generate Request Type (lines 24-31):**
```typescript
export interface VideoDraftAIGenerateRequest {
  prompt: string;
  mediaType: "image" | "video";
  modelId?: string;
  aspectRatio: string;
  referenceImageUrls: string[];
  extraParams?: Record<string, unknown>;
}
```

### 2.2 Internal State

Key state variables managed by VideoDraftAIPanel (lines 75-89):
```typescript
const [mediaType, setMediaType] = useState<"image" | "video">("video");
const [prompt, setPrompt] = useState("");
const [selectedModelId, setSelectedModelId] = useState("");
const [aspectRatio, setAspectRatio] = useState(() => {
  const initial = toAspectRatio(projectWidth, projectHeight);
  return ASPECT_RATIOS.includes(initial) ? initial : "16:9";
});
const [advancedMediaOptionsEnabled, setAdvancedMediaOptionsEnabled] = useState(false);
const [mediaModelExtraParams, setMediaModelExtraParams] = useState<Record<string, unknown>>({});
const [referenceImages, setReferenceImages] = useState<ReferenceImageItem[]>([]);
```

**NO FIELDS FOR:** Prompt pre-population from imported clips, reference image pre-population, model selection from metadata.

### 2.3 Rendering Location

**File:** `/home/dev/projects/SmartSpecPro/apps/web/client/src/components/videoeditor/VideoEditorPhase3.tsx`, lines 3912-3921:

```typescript
{sidebarView === 'draftAi' && (
  <VideoDraftAIPanel
    projectWidth={project.settings.width}
    projectHeight={project.settings.height}
    isGenerating={isGeneratingDraftMedia}
    isPreparingPresentationDraft={isPreparingPresentationDraft || isImportingPresentationDraft}
    onOpenPresentationDraft={() => void handleOpenPresentationDraft()}
    onGenerate={handleGenerateDraftMedia}
  />
)}
```

**Context in VideoEditorPhase3:**
- Rendered in the right sidebar when `sidebarView === 'draftAi'` (line 338 enum definition)
- Sidebar tab button at line 3831
- Only receives project dimensions and callbacks
- **NO CLIP CONTEXT:** Does not receive `selectedClipId`, selected clip data, or anything about the current clip

### 2.4 onGenerate Handler (handleGenerateDraftMedia)

**File:** VideoEditorPhase3.tsx, lines 1404-1535

**Flow:**
1. Takes `VideoDraftAIGenerateRequest` (prompt, mediaType, modelId, aspectRatio, referenceImageUrls, extraParams)
2. Calls either `generateImageAsyncMutation` or `generateVideoAsyncMutation` with these params
3. Polls for task completion
4. Creates a `MediaLibraryAsset` object (lines 1476-1487):
   ```typescript
   const mediaAsset: MediaLibraryAsset = {
     id: taskId,
     type: request.mediaType,
     title: normalizedPrompt.length > 60 ? `${normalizedPrompt.slice(0, 60)}...` : normalizedPrompt,
     thumbnailUrl: request.mediaType === 'image' ? resultUrl : '',
     duration: extractDurationSeconds(terminalTask, request.mediaType),
     url: resultUrl,
     model: modelName,  // ← model stored here
     createdAt,
     resolution: extractResolutionLabel(terminalTask),
     format: extractFormatFromUrl(resultUrl, request.mediaType === 'image' ? 'png' : 'mp4'),
   };
   ```
   **NOTE:** `model` is stored, but NOT `prompt` or `referenceUrls`.
5. Downloads media to workspace, probes it, adds to project assets, creates clip, selects clip
6. Sets `selectedClipId = insertedClipId` (line 1520)
7. **PROBLEM:** No metadata about the original prompt/reference images is persisted anywhere

---

## Part 3: Clip Selection & Current State Management

### 3.1 Selected Clip Tracking

In VideoEditorPhase3:
- Line 311: `const [selectedClipId, setSelectedClipId] = useState<string | null>(null);`
- Line 312: `const [selectedClipIds, setSelectedClipIds] = useState<string[]>([]);` (multi-select)
- Line 1520: Selected clip is set after generation: `setSelectedClipId(insertedClipId);`

### 3.2 How Other Panels Use selectedClipId

**TransitionsPanel (line 3885-3891):**
```typescript
selectedClip={selectedClipId ?
  project.timeline.tracks
    .flatMap(t => t.clips)
    .find(c => c.id === selectedClipId) || null
  : null
}
```

**OverlayPanel (line 3901-3907):**
```typescript
selectedClip={selectedClipId ?
  project.timeline.tracks
    .flatMap(t => t.clips)
    .find(c => c.id === selectedClipId) || null
  : null
}
```

**PATTERN:** Panels receive `selectedClipId` OR look it up from the project. VideoDraftAIPanel currently receives NEITHER.

---

## Part 4: Imported Draft Integration

### 4.1 PresentationDraftImportSegment Structure

**File:** presentationDraftImport.ts, lines 26-35:

```typescript
export interface PresentationDraftImportSegment {
  slideId: number;
  orderIndex: number;
  title: string;
  startTime: number;
  duration: number;
  hasExplicitDuration: boolean;
  visual: PresentationDraftImportVisual | null;  // ← contains prompt, modelId, referenceUrls
  audio: ResolvedAudioTrack | null;
}
```

### 4.2 How Presentation Visuals Are Extracted

**File:** presentationDraftImport.ts, lines 105-124:

```typescript
const visual = visualElement
  ? visualElement.type === "video"
    ? {
        type: "video" as const,
        src: visualElement.src,
        title: visualElement.title || slide.title,
        prompt: visualElement.videoPrompt,       // ← extracted
        modelId: visualElement.videoModelId,     // ← extracted
        referenceUrls: visualElement.videoReferenceUrls,  // ← extracted
      }
    : {
        type: "image" as const,
        src: visualElement.src,
        title: slide.title,
        prompt: visualElement.imagePrompt,       // ← extracted
        modelId: visualElement.imageModelId,     // ← extracted
        referenceUrls: visualElement.imageReferenceUrls,  // ← extracted
      }
  : null;
```

**KEY:** When a presentation draft is imported to video editor, the prompt/modelId/referenceUrls ARE AVAILABLE during import, but they are NOT stored anywhere in the resulting video editor project.

---

## Part 5: Data Flow: Generation → Storage → Retrieval

### Current Flow (Generation only)
```
VideoDraftAIPanel (user fills in prompt/references)
  ↓
onGenerate handler (VideoDraftAIGenerateRequest)
  ↓
generateImageAsyncMutation / generateVideoAsyncMutation
  ↓
Task polling
  ↓
Create MediaLibraryAsset (stores: id, type, url, model, duration, format)
  ↓
Download to workspace
  ↓
Add to project.assets[assetId]
  ↓
Create Clip (assetId reference)
  ↓
Add to track.clips[]
  ↓
setSelectedClipId
  ✗ LOST: prompt, referenceUrls, originalModelId
```

### Current Flow (Imported Draft)
```
Presentation Draft Import
  ↓
buildPresentationDraftImportSegments() extracts PresentationDraftImportVisual
  (has: prompt, modelId, referenceUrls)
  ↓
For each segment, create Asset + Clip
  ✗ LOST: prompt, modelId, referenceUrls NOT stored anywhere
```

### Desired Flow (with changes)
```
Generate or Import
  ↓
Create/Update Clip with metadata object:
  {
    prompt?: string,
    modelId?: string,
    referenceUrls?: string[],
    extraParams?: Record<string, unknown>
  }
  ↓
When clip selected in timeline:
  VideoDraftAIPanel receives selectedClip via props
  ↓
VideoDraftAIPanel pre-populates from clip.metadata:
  - prompt field
  - model selector
  - reference images list
  ↓
User can edit/regenerate with these pre-filled values
```

---

## Part 6: Recommended Implementation Strategy

### 6.1 Type Extensions Needed

**1. Extend Clip type** with optional metadata:
```typescript
export interface Clip {
  // ... existing fields ...

  // Optional metadata for prompt-based generation
  metadata?: {
    prompt?: string;
    modelId?: string;
    referenceUrls?: string[];
    extraParams?: Record<string, unknown>;
  };
}
```

**2. Update Asset type** (optional, for completeness):
```typescript
export interface Asset {
  // ... existing fields ...

  // Optional generation metadata
  prompt?: string;
  modelId?: string;
  referenceUrls?: string[];
}
```

### 6.2 Props Changes to VideoDraftAIPanel

Add optional `selectedClip` param:
```typescript
interface VideoDraftAIPanelProps {
  // ... existing ...
  selectedClip?: {
    id: string;
    assetId: string;
    metadata?: {
      prompt?: string;
      modelId?: string;
      referenceUrls?: string[];
      extraParams?: Record<string, unknown>;
    };
  } | null;
}
```

### 6.3 VideoDraftAIPanel Pre-Population Logic

On mount or when `selectedClip` changes:
```typescript
useEffect(() => {
  if (!selectedClip?.metadata) {
    // Reset to defaults
    setPrompt("");
    setSelectedModelId("");
    setReferenceImages([]);
    return;
  }

  // Pre-populate from clip metadata
  setPrompt(selectedClip.metadata.prompt || "");
  setSelectedModelId(selectedClip.metadata.modelId || "");

  if (selectedClip.metadata.referenceUrls && selectedClip.metadata.referenceUrls.length > 0) {
    setReferenceImages(
      selectedClip.metadata.referenceUrls.map((url, idx) => ({
        url,
        name: `Reference ${idx + 1}`,
      }))
    );
  } else {
    setReferenceImages([]);
  }
}, [selectedClip]);
```

### 6.4 Update Import Handler

When importing presentation drafts in `handleImportPresentationDraft`, store metadata in clips:
```typescript
// In the clip creation loop, after creating the clip:
if (segment.visual?.prompt || segment.visual?.modelId || segment.visual?.referenceUrls) {
  clip.metadata = {
    prompt: segment.visual.prompt,
    modelId: segment.visual.modelId,
    referenceUrls: segment.visual.referenceUrls,
  };
}
```

### 6.5 Update Generation Handler

In `handleGenerateDraftMedia`, after creating the clip, add metadata:
```typescript
// Line 1511-1512, after addClipToTrack:
if (insertedClip) {
  insertedClip.metadata = {
    prompt: normalizedPrompt,
    modelId: request.modelId || defaultMediaModelId || undefined,
    referenceUrls: normalizedReferenceImageUrls,
    extraParams: request.extraParams,
  };
}
```

### 6.6 Pass selectedClip to VideoDraftAIPanel

In VideoEditorPhase3, line 3913:
```typescript
{sidebarView === 'draftAi' && (
  <VideoDraftAIPanel
    projectWidth={project.settings.width}
    projectHeight={project.settings.height}
    isGenerating={isGeneratingDraftMedia}
    isPreparingPresentationDraft={isPreparingPresentationDraft || isImportingPresentationDraft}
    onOpenPresentationDraft={() => void handleOpenPresentationDraft()}
    onGenerate={handleGenerateDraftMedia}
    selectedClip={selectedClipId ?
      project.timeline.tracks
        .flatMap(t => t.clips)
        .find(c => c.id === selectedClipId) || undefined
      : undefined
    }
  />
)}
```

---

## Part 7: Key Files & Line References

| File | Purpose | Key Lines |
|------|---------|-----------|
| `apps/web/client/src/types/videoEditor.ts` | Type definitions | 46-106 (Clip, Asset), 340-353 (MediaLibraryAsset) |
| `apps/web/client/src/components/videoeditor/VideoDraftAIPanel.tsx` | Draft AI panel component | 33-40 (props), 67-74 (FC def), 75-89 (state), 401-616 (render) |
| `apps/web/client/src/components/videoeditor/VideoEditorPhase3.tsx` | Main editor + handlers | 311-312 (selectedClipId), 338 (sidebarView), 1404-1535 (handleGenerateDraftMedia), 3912-3921 (render), 3831-3835 (sidebar tab) |
| `apps/web/client/src/components/videoeditor/presentationDraftImport.ts` | Import utilities | 17-24 (PresentationDraftImportVisual), 86-147 (buildSegments), 105-124 (visual extraction) |
| `apps/web/shared/presentation/contracts.ts` | Presentation types | 272-275 (image fields), 295-297 (video fields), 374-380 (element union) |

---

## Part 8: Open Questions

1. **Should metadata be stored in `Asset` or only `Clip`?**
   - Currently: Recommendation is Clip-level only, since same asset can be used multiple times with different prompts
   - Alternative: Store in Asset if the intention is "remember what generated this"

2. **What about recreating a clip?**
   - Should there be a "Regenerate" button in VideoDraftAIPanel when a clip is selected?
   - Should it automatically re-run the same generation, or just pre-fill the form?

3. **Migration for existing projects?**
   - Existing VideoEditorProject JSONs won't have `clip.metadata` field
   - Safe default: Treat missing metadata as undefined/null

4. **How do we handle selectedClip when multiple clips are selected?**
   - VideoDraftAIPanel only works with one clip at a time
   - Suggestion: If multi-select active, disable or hide the panel

5. **Should reference image URLs be validated/normalized on load?**
   - Currently only validated on input (lines 63-64, 278)
   - Could add validation when pre-populating from clip.metadata

---

## Summary Table: Data Retention Points

| Data | Current Storage | Recommended Storage | Accessible From |
|------|-----------------|----------------------|-----------------|
| **Prompt** | Temporary (panel state only) | `clip.metadata.prompt` | VideoDraftAIPanel when clip selected |
| **Model ID** | `asset.model` (lossy, stores model name, not ID) | `clip.metadata.modelId` + `asset.model` (both) | Model selector pre-fill |
| **Reference URLs** | Temporary (panel state only) | `clip.metadata.referenceUrls` | Reference images list pre-fill |
| **Extra Params** | Temporary (panel state only) | `clip.metadata.extraParams` | Advanced options pre-fill |
| **Duration (video)** | `asset.duration` | (same, already stored) | Clip duration |

---

## Implementation Complexity Estimate

- **Type definitions**: 15 min (add metadata optional fields)
- **VideoDraftAIPanel props + hook**: 20 min (useEffect to pre-populate)
- **VideoEditorPhase3 updates**: 30 min (pass selectedClip, update handlers)
- **Migration/backward compat**: 15 min (handle missing metadata gracefully)
- **Testing**: 30 min (verify state flows, pre-population, import)

**Total: ~2 hours**

