# Feature Spec: 111-Presentation Builder Split-Layer Video Editor Handoff

**Spec ID:** 111-presentation-builder-split-layer-video-editor  
**Created:** 2026-05-10  
**Status:** Draft  
**Owner:** Presentation / Media / Video Editor  

---

## 1. Background

Presentation Builder currently supports a full-slide image mode where each slide is generated as one complete image and imported into Presentation Edit as a full-canvas image element.

That mode is useful for fast, high-quality visual slides, but it bakes the background, panels, icons, and text into one raster image. For downstream video workflows, users want more control:

1. Use AI image generation to create a realistic/photo background.
2. Generate text, panels, cards, and icons as a separate visual overlay.
3. Send both layers to the Video Editor as a ready-to-edit project.
4. Let the Video Editor own timeline layering, image-to-video conversion, chroma key, motion, and final MP4 export.

This spec defines a new non-default Presentation Builder option that creates split-layer slide assets and hands them off to the existing Video Editor project model.

---

## 2. Problem Statement

The current full-slide image workflow produces visually rich slides but has these limitations:

1. Text is baked into the same image as the background.
2. Users cannot animate or composite the background separately from the text layer.
3. If the user wants video output, Presentation Export must handle all visual composition itself.
4. Green-screen/keying workflows are not represented as a first-class handoff to Video Editor.
5. Regenerating a single slide can replace the whole design, even when only the text/panel layer should change.

The requested solution is not to replace the existing full-slide mode. It should add a separate option that creates two generated assets per slide:

- Background layer: realistic/photo/image-to-video-ready visual without text.
- Overlay layer: green-screen background containing all panels, cards, text, icons, and visual callouts.

The overlay is designed so green-screen removal cuts around opaque panels/cards, not individual text glyphs. This avoids most chroma-key artifacts around Thai text edges.

---

## 3. Goals

1. Add a non-default Presentation Builder mode for split-layer video handoff.
2. Keep all prompts, state, and generated assets separate from the existing editable-slide and full-slide-image modes.
3. Generate exactly two layer assets per planned slide in the first version:
   - `background`
   - `text_overlay_green`
4. Use dedicated prompt builders for each layer, not the existing full-slide prompt builder.
5. Build a Video Editor project draft where:
   - `V1` contains the background image or generated background video.
   - `V2` contains the green-screen text overlay image as a full-canvas overlay.
   - project dimensions, ratio, duration, and fps match the Presentation Builder settings.
6. Defer chroma-key compositing to the Video Editor render pipeline.
7. Preserve backward compatibility for existing Presentation Builder drafts, Presentation Edit slides, and Video Editor projects.
8. Provide clear UX status for each slide/layer so users know whether background and overlay are both ready.

---

## 4. Non-Goals

1. Do not change the default Presentation Builder behavior.
2. Do not replace the existing full-slide image mode.
3. Do not implement chroma key inside Presentation Export.
4. Do not require a DB migration for the first version unless Video Editor persistence requires a new project metadata field.
5. Do not rely on AI-generated transparent PNG as the primary v1 overlay format.
6. Do not require text to be editable inside Presentation Edit after generating the overlay image.
7. Do not implement arbitrary timeline keyframes in v1.

---

## 5. User Experience

### 5.1 Presentation Builder Mode

Add a third slide creation mode under `Media & Output`:

- `สไลด์แก้ไขได้`
- `สไลด์เป็นภาพทั้งหน้า`
- `แยก Layer Text สำหรับ Video Editor`

English:

- `Editable slides`
- `Full-slide image`
- `Split text layers for Video Editor`

The new mode is not default.

### 5.2 Mode Explanation

Thai copy:

> สร้างภาพพื้นหลังและภาพ overlay แยกกันต่อหนึ่งสไลด์ แล้วส่งต่อเป็นโปรเจกต์ Video Editor เพื่อซ้อน layer, ตัด green screen และ export video

English copy:

> Generate separate background and green-screen text overlay assets per slide, then create a Video Editor project for layering, chroma key, and video export.

### 5.3 Generated Asset Cards

Each slide card should show two readiness states:

- Background: `พร้อมใช้` / `กำลังสร้าง` / `ยังไม่มี` / `ล้มเหลว`
- Text overlay: `พร้อมใช้` / `กำลังสร้าง` / `ยังไม่มี` / `ล้มเหลว`

Each layer can be regenerated independently:

- `สร้างพื้นหลังใหม่`
- `สร้าง overlay ใหม่`
- `สร้างทั้ง slide ใหม่`

### 5.4 Handoff Action

After all required layer assets are ready, show:

- `ส่งไป Video Editor`
- `Create Video Editor Project`

The action should create/open a Video Editor project draft with tracks and clips already populated.

---

## 6. Prompt Strategy

This feature must use dedicated prompt builders and must not reuse full-slide-image prompts directly.

### 6.1 Background Prompt Contract

Purpose: create a realistic visual scene that can become the video background.

Hard rules:

1. No text, letters, captions, UI, logos, icons, or panels.
2. No embedded infographics.
3. Keep focal subject composition compatible with later overlay panels.
4. Leave clean negative space where panels will appear.
5. Match selected project style, topic, page summary, canvas ratio, and locale.

Example prompt shape:

```text
Create a realistic photographic background for a vertical 9:16 parenting video slide.
Topic: ...
Slide title/context: ...
Scene: Thai mother and 6-month-old baby in a warm bedroom at bedtime.
Mood: warm, gentle, modern parenting editorial.
Composition: leave the lower 35% visually calm for overlay panels; keep subjects above or beside the safe area.
No text, no captions, no icons, no cards, no UI, no logos.
Ultra realistic, soft warm light, clean background, high resolution.
```

### 6.2 Overlay Prompt Contract

Purpose: create a green-screen overlay image containing all visible text and panels.

Hard rules:

1. Background must be flat chroma green.
2. Use a single exact green color such as `#00FF00` or a configured chroma color.
3. No gradient, noise, texture, shadow, or lighting variation in green areas.
4. All text, icons, and decorations must be inside opaque or near-opaque panels/cards.
5. Panel/card edges may be rounded.
6. Shadows outside panels should be disabled or extremely minimal.
7. Do not use green inside icons, text, or panel decoration.
8. Thai text must be readable and large enough for mobile video.
9. The overlay must align to the same canvas ratio and safe-area assumptions as the background prompt.

Example prompt shape:

```text
Create a 9:16 green-screen overlay image for a parenting video slide.
The entire background outside panels must be pure flat chroma green #00FF00.
Place all Thai text, icons, cards, and callout panels inside opaque white/cream panels.
No translucent glass effect, no green spill, no texture in the green background, no shadows outside panel boundaries.

Main headline:
"..."

Body panel:
"..."

Bottom cards:
1. ...
2. ...
3. ...
4. ...

Modern Thai sans serif, readable, clean editorial layout.
```

### 6.3 Why Overlay Uses Panel Keying

The overlay is intentionally panel-based so chroma keying removes only green areas around panel/card geometry. The keyer does not need to cut around every text glyph, which reduces:

- green fringe around Thai characters
- antialiasing artifacts
- broken shadows/glows
- readability loss after MP4 encoding

---

## 7. Data Model

### 7.1 Presentation Builder Draft State

Add a new visual mode:

```ts
type SlideVisualMode =
  | "editable"
  | "full-slide-image"
  | "split-layer-video";
```

Persisted draft should carry:

```ts
{
  slideVisualMode: "split-layer-video",
  splitLayerStyleId: string,
  splitLayerCanvasRatio: "9:16" | "16:9" | "4:3" | "3:4" | ...,
  splitLayerAssets: SplitLayerGeneratedAsset[]
}
```

### 7.2 Split Layer Asset Shape

```ts
type SplitLayerKind = "background" | "text_overlay_green";

type SplitLayerGeneratedAsset = {
  id: string;
  pageNumber: number;
  imageIndex: number;
  slotKey: string;
  kind: SplitLayerKind;
  url: string;
  prompt: string;
  canvasRatio: SlideCanvasRatio;
  width?: number;
  height?: number;
  mediaModelId?: string;
  taskId?: string;
  status: "ready" | "running" | "failed";
  errorMessage?: string;
  updatedAt: string;
};
```

### 7.3 Video Editor Asset Metadata

Existing `Asset` supports:

- `type: "image" | "video" | "audio"`
- `generationPrompt`
- `generationModelId`
- `generationAspectRatio`
- `generationExtraParams`

Add non-breaking metadata in `generationExtraParams`:

```ts
{
  source: "presentation_builder_split_layer",
  deckSource: {
    topic: string,
    pageNumber: number,
    layerKind: "background" | "text_overlay_green"
  },
  chromaKeyCandidate: true,
  chromaKeyColor: "#00FF00"
}
```

No new required fields are needed for v1.

---

## 8. Video Editor Project Contract

### 8.1 Project Settings

The generated project should use:

- width/height from selected canvas ratio
- fps default 30
- per-slide duration default 5 seconds unless user config exists
- total duration = slide count * slide duration

Suggested default dimensions:

| Ratio | Width | Height |
|---|---:|---:|
| 9:16 | 1080 | 1920 |
| 16:9 | 1920 | 1080 |
| 3:4 | 1080 | 1440 |
| 4:3 | 1440 | 1080 |

### 8.2 Tracks

Use the existing `createEmptyProject()` track structure:

- `T1`: optional future real text clips
- `V2`: overlay track
- `V1`: primary background track
- `A1`: optional audio

### 8.3 Clips

For each slide:

1. Add a background clip to `V1`.
2. Add a text overlay clip to `V2`.
3. Both clips share:
   - same `startTime`
   - same `duration`
   - full-canvas transform

Suggested transform:

```ts
{
  x: 0.5,
  y: 0.5,
  scaleX: 1,
  scaleY: 1,
  rotation: 0,
  opacity: 1
}
```

### 8.4 Background Motion Options

v1 can start with static background image clips. Later enhancement:

1. Generate image-to-video background clips using selected video model.
2. Or use Video Editor pan/zoom/keyframe controls if existing overlay/video transforms are sufficient.

Do not block v1 on image-to-video.

---

## 9. Chroma Key Ownership

### 9.1 Ownership Decision

Chroma key belongs to Video Editor, not Presentation Builder and not Presentation Export.

Reasons:

1. Video Editor owns timeline tracks.
2. Video Editor already has overlay tracks and media job rendering.
3. Users may want to tune key similarity/blend per project.
4. Future workflows may use background video, not only static slide exports.

### 9.2 Proposed Clip Effect

Add a new effect type when implementing Phase 2:

```ts
type ChromaKeyEffect = {
  type: "chromaKey";
  parameters: {
    color: "#00FF00";
    similarity: number; // 0..1
    blend: number; // 0..1
    spill?: number; // optional future
  };
};
```

Attach it to the overlay image clip:

```ts
clip.effects = [
  {
    type: "chromaKey",
    parameters: {
      color: "#00FF00",
      similarity: 0.18,
      blend: 0.04
    }
  }
];
```

### 9.3 FFmpeg Direction

Video Editor renderer should translate the effect to FFmpeg filters such as:

- `chromakey=0x00FF00:similarity:blend`
- or `colorkey=0x00FF00:similarity:blend`

The exact filter should be selected during implementation testing.

The output must composite:

```text
[background][overlay_keyed]overlay=x=0:y=0
```

---

## 10. Implementation Waves

### Wave 1: Spec-Aligned Prompt and Asset Planning

Files likely affected:

- `apps/web/client/src/components/presentation/PresentationArticleGeneratorDialog.tsx`
- `apps/web/client/src/locales/en/presentation.json`
- `apps/web/client/src/locales/th/presentation.json`

Tasks:

1. Add `split-layer-video` visual mode.
2. Add split-layer prompt builders:
   - `buildSplitLayerBackgroundPrompt`
   - `buildSplitLayerOverlayPrompt`
3. Add layer asset state and normalization helpers.
4. Add layer readiness UI.
5. Add independent regenerate actions for each layer.
6. Ensure existing modes do not read or mutate split-layer assets.

Acceptance:

- Existing full-slide image mode behaves exactly as before.
- Split-layer mode generates two prompt records per page.
- Regenerating background does not replace overlay, and vice versa.

### Wave 2: Media Generation Orchestration

Files likely affected:

- `apps/web/client/src/components/presentation/PresentationArticleGeneratorDialog.tsx`
- existing media generation mutation hooks used by Presentation Builder

Tasks:

1. Generate missing layer assets in bounded concurrency.
2. Preserve per-layer running state to prevent duplicate clicks.
3. Store task IDs and error messages separately per layer.
4. Ensure generated assets are tagged with layer metadata.
5. Keep media history entries discoverable.

Acceptance:

- For N slides, successful generation produces 2N ready assets.
- Failed overlay generation does not delete a ready background asset.
- Switching ratio or style marks mismatched layer assets stale without deleting them.

### Wave 3: Video Editor Project Builder

Files likely affected:

- new helper, for example `apps/web/client/src/lib/presentationToVideoEditorProject.ts`
- `apps/web/client/src/types/videoEditor.ts`
- Video Editor project persistence or routing files if an auto-open flow exists

Tasks:

1. Build a pure helper that converts split-layer assets to `VideoEditorProject`.
2. Use `createEmptyProject()` as the base.
3. Add background image assets.
4. Add overlay image assets.
5. Create V1 and V2 clips with aligned timing.
6. Set project duration.
7. Persist/open project through existing Video Editor project flow.

Acceptance:

- Generated project validates with existing project structure checks.
- Timeline shows background clips on V1 and overlay clips on V2.
- Preview shows green overlay image above background before chroma key is enabled.

### Wave 4: Video Editor Chroma-Key Effect

Files likely affected:

- `apps/web/client/src/types/videoEditor.ts`
- `apps/web/client/src/components/videoeditor/OverlayPanel.tsx`
- `apps/web/client/src/components/videoeditor/PreviewPlayer.tsx`
- `apps/web/shared/types/mediaJob.ts`
- `apps/web/shared/types/mediaJobValidation.ts`
- `python-backend/app/tasks/media_job_worker.py`

Tasks:

1. Extend effect typing to support `chromaKey`.
2. Add UI controls for color, similarity, and blend on overlay clips.
3. Add preview approximation if feasible.
4. Extend `projectToTimeline()` so the effect reaches the media job spec.
5. Validate chroma-key parameters server-side.
6. Apply FFmpeg chroma key before overlay compositing.

Acceptance:

- Overlay clip can be keyed against `#00FF00`.
- Rendered MP4 shows panels/text over the background with green removed.
- Invalid color/similarity/blend is rejected before FFmpeg command construction.

### Wave 5: Optional Background Image-to-Video

Files likely affected:

- Presentation Builder media model selection
- media generation task flow
- Video Editor project builder

Tasks:

1. Add optional `backgroundMotionMode`:
   - `static_image`
   - `image_to_video`
   - `video_editor_motion`
2. If image-to-video is selected, generate video assets for V1 instead of image clips.
3. Preserve overlay image on V2.

Acceptance:

- Static image flow remains default.
- Image-to-video flow creates V1 video clips with the same duration.

---

## 11. Tests

### 11.1 Presentation Builder Tests

Target:

- split-layer mode does not alter existing full-slide prompt behavior
- background prompt excludes text/panels
- overlay prompt requires flat green and opaque panels
- generated assets are stored by layer kind
- regenerate one layer does not replace the other
- stale ratio/style handling does not delete assets

### 11.2 Video Editor Project Builder Tests

Target:

- 2 slides produce 4 assets and 4 clips
- V1 clips use background assets
- V2 clips use overlay assets
- clips align by start time and duration
- project duration equals total slide duration
- generated project passes validation

### 11.3 Media Job Validation Tests

Target:

- `chromaKey` effect accepts valid hex color and numeric bounds
- rejects invalid color strings
- rejects non-finite similarity/blend
- rejects shell-sensitive filter input

### 11.4 Python FFmpeg Tests

Target:

- render command includes chroma key for overlay clips with the effect
- overlay ordering is deterministic
- image inputs still use `-loop 1`
- background-only render still works
- keyed overlay does not remove non-green panel areas

### 11.5 Browser/Visual Tests

Target:

- Presentation Builder shows per-layer loading states
- Video Editor timeline displays V1/V2 clips
- Preview shows overlay before/after keying if preview approximation is implemented

---

## 12. Risks and Mitigations

### Risk: AI overlay uses non-flat green

Mitigation:

- Add hard prompt requirements.
- Prefer post-processing overlay background replacement if feasible later.
- Add visual QA warning if sampled green background varies too much.

### Risk: Panel shadows leave green fringe after keying

Mitigation:

- Prompt forbids shadows outside panels for v1.
- Use opaque panels.
- Add style presets designed for hard panel boundaries.

### Risk: Video Editor render currently treats overlay tracks as sequential clips

Mitigation:

- Audit and update media job renderer in Wave 4.
- Add render-command tests proving V2 overlays composite over V1 instead of concatenating.

### Risk: Existing text clip rollout constraints conflict with overlay image clips

Mitigation:

- v1 uses overlay image clips, not T1 text clips.
- T1 real text is reserved for future editable-video-text mode.

### Risk: Project persistence rejects text/overlay track variants

Mitigation:

- Include project validation tests.
- Keep generated project within existing `VideoEditorProject` track types.

---

## 13. Product Decisions Locked for MVP

These decisions are locked for the first shippable MVP unless the product owner explicitly reopens the spec:

1. The feature is non-default and opt-in only.
2. The existing `editable` and `full-slide-image` modes must remain unchanged.
3. Each slide slot creates exactly two generated assets:
   - `background`
   - `text_overlay_green`
4. Split-layer prompts are separate from full-slide prompts.
5. The background layer must not contain text, icons, cards, panels, logos, or UI.
6. The overlay layer must contain all visible text, cards, icons, and callouts on a flat chroma-green background.
7. The overlay is panel/card based. The keyer should remove green around panels, not around individual text glyphs.
8. MVP creates a Video Editor project with `V1` background clips and `V2` overlay clips.
9. MVP may leave chroma key disabled or marked as pending in the Video Editor project. Production keying can ship in a later phase.
10. Background image-to-video is deferred. MVP uses static image/video-editor-still clips unless existing infrastructure can support image-to-video without extra render risk.
11. Users can regenerate a single layer without replacing the other layer.
12. Ratio/style changes mark incompatible generated assets stale and trigger explicit regeneration instead of silently reusing old assets.

---

## 14. Video Editor Handoff API / Persistence Contract

### 14.1 Handoff Input

Presentation Builder should call a single handoff action after required split-layer assets are ready:

```ts
type PresentationSplitLayerHandoffRequest = {
  source: "presentation_builder_split_layer";
  sourceDraftId?: string;
  topic: string;
  locale: string;
  canvasRatio: SlideCanvasRatio;
  width: number;
  height: number;
  fps: number;
  slideDurationSeconds: number;
  styleId: string;
  slides: Array<{
    pageNumber: number;
    title: string;
    summary?: string;
    slotKey: string;
    backgroundAssetId: string;
    overlayAssetId: string;
  }>;
};
```

### 14.2 Handoff Output

The handoff action should return enough information for the UI to open the Video Editor project immediately:

```ts
type PresentationSplitLayerHandoffResult = {
  projectId: string;
  projectUrl: string;
  createdAssetIds: string[];
  warnings: Array<{
    code: string;
    message: string;
    pageNumber?: number;
    assetId?: string;
  }>;
};
```

### 14.3 Persistence Requirements

The persisted Video Editor project must include:

1. Project settings:
   - `width`
   - `height`
   - `fps`
   - `duration`
   - `canvasRatio`
2. Asset records for every background and overlay layer.
3. Clip records on deterministic tracks:
   - `V1` for background clips
   - `V2` for overlay clips
4. Clip metadata linking each clip back to:
   - Presentation Builder source
   - source draft id, if available
   - page number
   - slot key
   - layer kind
5. Optional effect metadata on overlay clips:
   - `chromaKeyCandidate: true`
   - `chromaKeyColor: "#00FF00"`
   - `chromaKeyEnabled: false` for MVP unless render support is enabled

### 14.4 Idempotency

The handoff should be idempotent for repeated clicks:

1. If the same source draft, ratio, style, slide set, and asset ids are handed off again, the system may reopen the existing project instead of creating duplicates.
2. If any asset id changes, create a new project revision or a new project depending on existing Video Editor persistence conventions.
3. Do not mutate previously exported Video Editor projects silently.

---

## 15. Asset Storage and Reuse Rules

### 15.1 Storage Metadata

Every split-layer media asset should store:

1. `source: "presentation_builder_split_layer"`
2. `layerKind: "background" | "text_overlay_green"`
3. `pageNumber`
4. `slotKey`
5. `canvasRatio`
6. `width`
7. `height`
8. `styleId`
9. `mediaModelId`
10. `promptHash`
11. `assetVersion`
12. `createdAt`

### 15.2 Reuse Rules

An existing split-layer asset can be reused only when all of these match:

1. `layerKind`
2. `pageNumber`
3. `slotKey`
4. `canvasRatio`
5. `width` and `height`
6. `styleId`
7. `mediaModelId`
8. `promptHash`
9. asset status is `ready`

If any of these values differ, show the asset as stale and require regeneration for that layer.

### 15.3 Regeneration Rules

1. Regenerating `background` replaces only the background asset for that slot.
2. Regenerating `text_overlay_green` replaces only the overlay asset for that slot.
3. Regenerating the whole slide creates both assets again.
4. Changing ratio should mark both layers stale for every slide.
5. Changing style should mark both layers stale for every slide.
6. Stale assets should remain available in Media History but should not be selected for new handoff unless the user explicitly reselects them.

### 15.4 Media History

Media History should display split-layer assets with enough context to avoid confusion:

- layer kind
- page number
- ratio/dimensions
- style id or style label
- source draft id, if available
- whether the asset is currently used by a Presentation Builder draft or Video Editor project

---

## 16. Overlay Format Policy

The overlay layer is a chroma-key candidate, so format matters.

### 16.1 Preferred Formats

Use lossless or visually lossless formats for `text_overlay_green`:

1. PNG
2. WebP lossless
3. Provider-native format only if it can preserve flat green edges without compression artifacts

### 16.2 JPG Policy

JPG is not suitable for chroma key overlays because compression creates color noise around text, icons, and panel edges.

Rules:

1. Warn when a provider returns JPG/JPEG for `text_overlay_green`.
2. Reject JPG/JPEG for `text_overlay_green` when chroma-key mode is enabled.
3. If MVP does not key automatically, allow JPG only as a temporary preview asset with a visible warning.
4. Prefer converting provider output to PNG/WebP only if the source preserves enough chroma integrity. Conversion cannot repair already-compressed green noise.

### 16.3 Background Format

Background assets may use PNG, WebP, JPG, or provider-native formats because they are not keyed.

---

## 17. Render Contract

### 17.1 Track Assembly

The Video Editor renderer must assemble tracks in this order:

1. Build the `V1` background timeline first.
2. Build `V2` overlay clips independently.
3. Apply chroma key to `V2` overlay clips when enabled.
4. Composite keyed `V2` clips over `V1` by z-order and time range.
5. Mix audio tracks after visual composition according to existing Video Editor rules.

### 17.2 Time Range Rules

For each slide:

1. `V1` background clip and `V2` overlay clip must share the same `startTime`.
2. Both clips must share the same `duration`.
3. A missing overlay clip should render the background clip alone with a warning.
4. A missing background clip should block handoff/render for that slide because there is no base visual layer.

### 17.3 Z-Order Rules

1. `V1` is the base layer.
2. `V2` is composited above `V1`.
3. Future tracks above `V2` must follow existing Video Editor z-order semantics.
4. `T1` remains reserved for future editable text and must not be required for MVP.

### 17.4 FFmpeg Direction

When chroma key is enabled, the renderer should translate the visual graph to a filter chain equivalent to:

```text
V1 background assembled first
V2 overlay keyed by #00FF00
keyed V2 composited over V1 by clip time range
```

The implementation may use `chromakey`, `colorkey`, masks, or another renderer-supported method as long as output behavior matches this contract.

---

## 18. Rollout / Feature Flag

This feature must be closed by default until the MVP is validated.

### 18.1 Rollout Rules

1. The mode is non-default even when enabled.
2. The UI option may be hidden behind a feature flag such as:
   - `PRESENTATION_SPLIT_LAYER_VIDEO_ENABLED`
   - or an existing presentation-builder experimental flag
3. The handoff action may use a separate flag if Video Editor persistence is not ready:
   - `PRESENTATION_SPLIT_LAYER_VIDEO_HANDOFF_ENABLED`
4. Chroma-key render support should use a separate flag:
   - `VIDEO_EDITOR_CHROMA_KEY_RENDER_ENABLED`

### 18.2 Safe Defaults

When flags are off:

1. Existing Presentation Builder modes continue to work.
2. Existing drafts containing `split-layer-video` should load read-only or gracefully fall back to hidden experimental UI if the user already has access.
3. Existing Video Editor projects created from split-layer assets should still open as normal image-overlay projects.

---

## 19. Open Questions

1. Should the handoff auto-create a persisted Video Editor project or only download/copy a project JSON draft?
2. Should v1 automatically enable chroma key on overlay clips, or should users enable it manually in Video Editor?
3. What default slide duration should Presentation Builder use for video projects: 4s, 5s, or user-configurable?
4. Should background image-to-video be offered immediately or delayed until static split-layer flow is stable?
5. Which storage layer is responsible for enforcing lossless overlay output: media provider adapter, media asset service, or Presentation Builder handoff?
6. Should stale split-layer assets be visually grouped with their replacement assets in Media History?

---

## 20. Recommended MVP

The recommended MVP is Waves 1-3 only:

1. Add split-layer mode behind a feature flag.
2. Generate background and green overlay images separately.
3. Enforce separate asset metadata, stale detection, and per-layer regeneration.
4. Prefer PNG/WebP lossless for overlay assets and warn on JPG/JPEG.
5. Build a persisted Video Editor project with `V1` background and `V2` overlay clips.
6. Do not automatically key green in MVP unless `VIDEO_EDITOR_CHROMA_KEY_RENDER_ENABLED` is ready.
7. Let users inspect/edit the generated timeline first.

Then implement Wave 4 as the production compositing milestone.

This keeps the first release safe because it proves:

- prompt separation
- asset generation
- per-layer UI state
- asset storage/reuse rules
- Video Editor handoff
- project shape compatibility

without forcing chroma-key render changes into the same release.

---

## 21. MVP Definition of Done

MVP is complete when:

1. Existing Presentation Builder modes remain unchanged.
2. Split-layer mode is non-default and can be hidden behind a feature flag.
3. Split-layer mode creates two assets per slide with separate prompts.
4. Background prompts exclude text/panels/icons/logos.
5. Overlay prompts require flat chroma green and opaque panel/card-contained text.
6. Users can regenerate background, overlay, or both without replacing unrelated layers.
7. Ratio/style changes mark incompatible generated assets stale.
8. Overlay assets prefer PNG/WebP lossless and JPG/JPEG produces a warning.
9. Users can create/open a Video Editor project from ready split-layer assets.
10. The generated project persists `V1` background clips and `V2` overlay clips with aligned timing.
11. The handoff records source metadata for page number, slot key, layer kind, ratio, style, and prompt hash.
12. Typecheck and targeted tests for prompt generation, stale asset handling, and project handoff pass.

---

## 22. Full Definition of Done

The full feature is complete when:

1. Existing Presentation Builder modes remain unchanged.
2. Split-layer mode creates two assets per slide with separate prompts.
3. Users can regenerate either layer independently.
4. Users can create/open a Video Editor project from generated split-layer assets.
5. The generated project has aligned `V1`/`V2` tracks and correct project settings.
6. Overlay storage rejects JPG/JPEG when chroma-key render mode is enabled.
7. Video Editor can render keyed overlay clips over background clips when the chroma-key phase is enabled.
8. The renderer assembles `V1` background first, keys `V2`, then composites by z-order and time range.
9. Typecheck and targeted tests pass.
10. A regression fixture exists for at least one Thai 9:16 parenting slide with:
   - realistic background layer
   - green panel overlay layer
   - generated Video Editor project
   - exported MP4 after keying
