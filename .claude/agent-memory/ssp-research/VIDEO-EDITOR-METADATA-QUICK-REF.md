---
name: Video Editor Metadata — Quick Reference
description: Quick lookup for type locations, component props, selected clip flow, and data persistence pattern
type: reference
---

# Video Editor Metadata — Quick Reference

## Type Locations

| Type | File | Lines | Current Fields | Gap |
|------|------|-------|---|---|
| `Clip` | `types/videoEditor.ts` | 46-65 | assetId, trackId, startTime, duration, trimIn, trimOut, volume, speed, effects, transitions, inTransition, transform, textConfig, groupId | ❌ NO metadata field |
| `Asset` | `types/videoEditor.ts` | 80-106 | id, type, source, taskId, model, name, path, originalPath, filename, format, duration, width, height, fps, sampleRate, thumbnailPath, waveformData | ❌ NO prompt/references |
| `MediaLibraryAsset` | `types/videoEditor.ts` | 340-353 | id, type, title, thumbnailUrl, duration, url, model, createdAt, resolution, format, localPath, fileSize | ⚠️ Has model, NO modelId |
| `PresentationSlideElement` | `shared/presentation/contracts.ts` | 257-306 | (discriminated union of image/video/text/rect/line) | ✅ imagePrompt, imageModelId, imageReferenceUrls, videoPrompt, videoModelId, videoReferenceUrls |
| `PresentationDraftImportVisual` | `components/videoeditor/presentationDraftImport.ts` | 17-24 | type, src, title, prompt, modelId, referenceUrls | ✅ Complete |

## Component Props Flow

### VideoDraftAIPanel (VideoDraftAIPanel.tsx, lines 33-40)

```typescript
interface VideoDraftAIPanelProps {
  projectWidth: number;
  projectHeight: number;
  isGenerating: boolean;
  isPreparingPresentationDraft?: boolean;
  onGenerate: (request: VideoDraftAIGenerateRequest) => Promise<void>;
  onOpenPresentationDraft?: () => void;

  // ⚠️ NOT IMPLEMENTED YET:
  // selectedClip?: Clip | null;
}
```

**onGenerate callback signature:**
```typescript
interface VideoDraftAIGenerateRequest {
  prompt: string;
  mediaType: "image" | "video";
  modelId?: string;
  aspectRatio: string;
  referenceImageUrls: string[];
  extraParams?: Record<string, unknown>;
}
```

### VideoEditorPhase3 Usage (VideoEditorPhase3.tsx, lines 3912-3921)

```typescript
{sidebarView === 'draftAi' && (
  <VideoDraftAIPanel
    projectWidth={project.settings.width}
    projectHeight={project.settings.height}
    isGenerating={isGeneratingDraftMedia}
    isPreparingPresentationDraft={isPreparingPresentationDraft || isImportingPresentationDraft}
    onOpenPresentationDraft={() => void handleOpenPresentationDraft()}
    onGenerate={handleGenerateDraftMedia}
    // ⚠️ MISSING: selectedClip prop
  />
)}
```

## Selected Clip State Management

**In VideoEditorPhase3.tsx:**
- **Line 311:** `const [selectedClipId, setSelectedClipId] = useState<string | null>(null);`
- **Line 312:** `const [selectedClipIds, setSelectedClipIds] = useState<string[]>([]);` (multi-select)
- **Line 1520:** After generation: `setSelectedClipId(insertedClipId);`

**How to resolve selected clip:**
```typescript
const selectedClip = selectedClipId
  ? project.timeline.tracks
      .flatMap(t => t.clips)
      .find(c => c.id === selectedClipId)
  : undefined;
```

**Pattern used by other sidebar panels:**
- TransitionsPanel (line 3885-3891)
- OverlayPanel (line 3901-3907)

## Data Persistence in Generation Flow

### Current Flow (handleGenerateDraftMedia, lines 1404-1535)

```
onGenerate callback (VideoDraftAIGenerateRequest)
  ↓
generateImageAsyncMutation / generateVideoAsyncMutation (lines 1419-1448)
  ↓
pollTaskUntilTerminal (gets task result URL, duration)
  ↓
Create MediaLibraryAsset (lines 1476-1487) ← stores: id, type, title, url, model, duration
  ↓
Download to workspace
  ↓
Probe media file for duration/resolution
  ↓
addAssetToProject(newProject, mediaAsset, localPath) (line 1505)
  ↓
findTrackByType(newProject.timeline, mediaType) (line 1506)
  ↓
addClipToTrack(track, newAsset, startTime) (line 1511) ← creates Clip with assetId only
  ↓
setProject() with updated timeline
  ↓
setSelectedClipId(insertedClipId) (line 1520)
  ↓
✗ LOST: prompt, modelId, referenceImageUrls, extraParams
```

### Where Metadata IS Available (Import Flow)

**buildPresentationDraftImportSegments (presentationDraftImport.ts, lines 86-147)**

```typescript
const visual = visualElement
  ? visualElement.type === "video"
    ? {
        type: "video" as const,
        src: visualElement.src,
        title: visualElement.title || slide.title,
        prompt: visualElement.videoPrompt,              // ✅ AVAILABLE
        modelId: visualElement.videoModelId,           // ✅ AVAILABLE
        referenceUrls: visualElement.videoReferenceUrls,  // ✅ AVAILABLE
      }
    : {
        type: "image" as const,
        src: visualElement.src,
        title: slide.title,
        prompt: visualElement.imagePrompt,             // ✅ AVAILABLE
        modelId: visualElement.imageModelId,           // ✅ AVAILABLE
        referenceUrls: visualElement.imageReferenceUrls,  // ✅ AVAILABLE
      }
  : null;
```

But this data is only used for immediate asset creation, NOT stored in the clip metadata.

## Implementation Checklist

- [ ] Add `metadata?: { prompt?, modelId?, referenceUrls?, extraParams? }` field to Clip interface
- [ ] Update VideoDraftAIPanel props to include `selectedClip?: Clip | null`
- [ ] Add useEffect hook in VideoDraftAIPanel to populate form from clip.metadata
- [ ] Pass selectedClip to VideoDraftAIPanel in VideoEditorPhase3 rendering
- [ ] Update handleGenerateDraftMedia to store metadata in created clip
- [ ] Update presentation import handlers to store metadata when importing drafts
- [ ] Handle backward compatibility (missing metadata in old projects)
- [ ] Test: Pre-population when selecting different clips
- [ ] Test: Generation preserves metadata in new clips
- [ ] Test: Import from presentation includes metadata

## Expected User Experience After Implementation

1. User generates image with prompt "A red sunset over mountains" + 2 reference images
2. Generated image is added to timeline, clip is auto-selected
3. VideoDraftAIPanel's form is pre-populated with:
   - Prompt: "A red sunset over mountains"
   - Reference images: 2 images displayed
   - Model: Previously selected model
4. User can edit the prompt/references and click "Regenerate" or "Generate again"
5. Same experience for imported presentation drafts

