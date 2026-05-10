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

## 13. Open Questions

1. Should the handoff auto-create a persisted Video Editor project or only download/copy a project JSON draft?
2. Should v1 automatically enable chroma key on overlay clips, or should users enable it manually in Video Editor?
3. What default slide duration should Presentation Builder use for video projects: 4s, 5s, or user-configurable?
4. Should background image-to-video be offered immediately or delayed until static split-layer flow is stable?
5. Should overlay layer be stored as PNG/WebP lossless only, or allow provider-native JPG if that is all the media provider returns?

---

## 14. Recommended MVP

The recommended MVP is Waves 1-3 only:

1. Add split-layer mode.
2. Generate background and green overlay images separately.
3. Build a Video Editor project with V1 background and V2 overlay clips.
4. Do not automatically key green in MVP.
5. Let users inspect/edit the generated timeline first.

Then implement Wave 4 as the production compositing milestone.

This keeps the first release safe because it proves:

- prompt separation
- asset generation
- per-layer UI state
- Video Editor handoff
- project shape compatibility

without forcing chroma-key render changes into the same release.

---

## 15. Definition of Done

The feature is complete when:

1. Existing Presentation Builder modes remain unchanged.
2. Split-layer mode creates two assets per slide with separate prompts.
3. Users can regenerate either layer independently.
4. Users can create/open a Video Editor project from generated split-layer assets.
5. The generated project has aligned V1/V2 tracks and correct project settings.
6. Video Editor can render keyed overlay clips over background clips when the chroma-key phase is enabled.
7. Typecheck and targeted tests pass.
8. A regression fixture exists for at least one Thai 9:16 parenting slide with:
   - realistic background layer
   - green panel overlay layer
   - generated Video Editor project
   - exported MP4 after keying

