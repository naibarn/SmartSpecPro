# Request

Original user request:

> ในหน้า Presentation Edit วางแผนเพิ่ม Properties สำหรับ element ที่เป็นภาพหรือวีดีโอ ให้ใส่ effect ต่าง ๆ ได้เช่น ค่อย ๆ zoom in , zoom out หรืออื่น ๆ ที่ทำได้

Follow-up clarification:

> ในส่วนของ วีดีโอ ให้ ทำ effect เช่น การ zoom in , zoom out , pan ใน หลายทิศทาง ได้โดย วีดีโอยัง play ไปเรื่อย ๆ

## Normalized Summary

Add media-specific Properties in `Presentation Editor` so `image` and `video` elements can carry time-based visual effects, starting with gradual `zoom in` and `zoom out`, and leaving room for a few additional motion presets that are practical in the current architecture. For `video`, motion must run while the video itself continues normal playback.

## Likely Affected Areas

- Shared slide-content schema and runtime types
- Presentation editor property panel for image/video elements
- Slideshow preview runtime inside `PresentationEditor.tsx`
- HTML slide render route used by export capture
- Export classification/degradation logic for dynamic slides
- Frontend and route-level regression tests

## Constraints

- Preserve backward compatibility for existing saved `slideContent` JSON.
- Avoid database migrations if the new data can stay inside `slideContent`.
- Keep scope to `image` and `video` elements for v1.
- Do not break current crop/fit/zoom controls (`imageZoom`, `videoZoom`, focus X/Y).
- Keep MP4 export behavior aligned with slideshow preview behavior.

## Working Assumptions

- v1 supports one motion preset per media element, not arbitrary keyframes.
- Motion runs across the full slide duration.
- Motion is additive on top of the existing crop/focus state rather than replacing it.
- For `video`, the effect is applied as a transform over a still-playing `<video>` element rather than by freezing the video into a poster/frame sequence.
- The edit canvas remains primarily static; users validate the animated result via slideshow preview.
- Static exports (`png`, `jpg`, `pdf`) degrade to the base frame and should surface a warning when motion is omitted.

## Non-Goals For This Plan

- Text/shape animation
- Multi-step timelines or per-element start/end offsets
- Database/schema migrations outside the existing slide JSON contract
- New Python worker architecture
