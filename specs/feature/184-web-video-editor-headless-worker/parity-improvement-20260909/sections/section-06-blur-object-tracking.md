# Section 06 — Blur bar, face/object tracking and privacy gate

## Goal

Provide a visible blur/mosaic bar that follows a face or object when approved,
while guaranteeing that an unverified privacy request cannot render clear.

## Privacy track model

Add a `privacyRegionTrack` namespace separate from clip Transform and camera
tracks. A region stores normalized rectangle/ellipse/path, feather, strength,
shape, keyframes, source clip and policy intent. Values are finite and clamped
to the active media dimensions. Manual regions are immediately previewable.

`privacy_track` accepts source asset, target class (face/object/manual), model
version and sampling policy. Worker returns a confidence-scored region track,
missing intervals and source checksum. The review UI displays the path across
the ruler, marks low-confidence frames, lets the user correct/add keyframes and
requires explicit approval. A region without a manual interval or approved
verified track blocks render preflight with `privacy_unverified`.

Preview uses browser canvas blur/mosaic/drawbox for feedback. Worker compiles
typed blur options and track samples to allowlisted FFmpeg/Remotion operations;
the client never submits a raw filter graph. The output manifest records privacy
track IDs, model/version, confidence summary and approval user/time.

## Files and sequence

1. Add privacy region schemas, validator and fixture clips.
2. Add `BlurPanel.tsx`, region handles, keyframe correction and review list.
3. Add server job/preflight privacy gate and Worker tracker/render adapter.
4. Add stale-source, low-confidence and missing-interval behavior to render
   result review.

## UI/UX Contract

### Target User / JTBD

A creator needs to conceal a face or object throughout a clip and prove which
frames were covered before sending the render to Worker.

### Surface Inventory

`FX / Blur` tab, preview region handles, region inspector, tracking action,
confidence/missing-interval list, keyframe strip and render privacy checklist.

### Component Map

`BlurPanel` owns region settings/review; `PrivacyRegionOverlay` owns handles;
shared keyframe reducer owns motion; `EditorJobStatus` owns tracking progress;
server preflight owns fail-closed policy; Worker owns tracking and final blur.

### State Matrix

| State | Required behavior |
|---|---|
| no region | offer manual region or tracking |
| manual/keyframed | preview blur; show coverage |
| tracking queued/running | progress/cancel; no auto-approval |
| low confidence/missing | highlight and block render until resolved |
| approved | allow preflight with revision/version |
| rejected/stale | preserve old region; request correction/regenerate |
| locked | view only; explain unlock |

### Responsive Matrix

| Viewport | Behavior |
|---|---|
| 360x800 | tracking status and region review; editing deferred |
| 390x844 | one region inspector sheet |
| 768x1024 | stacked inspector and confidence list |
| 1024x768 | side panel aligned to preview |
| 1280x800 | full preview, timeline and inspector |
| 1440x900 | multi-region list and render checklist |

### Accessibility Acceptance

Each region handle has a label and keyboard move/resize controls, coverage and
confidence are textual, missing intervals are focusable time ranges, approval is
explicit and focus-visible, and a blocked render announces the reason.

### Copy Contract

Use `FX / Blur`, `เบลอติดตามวัตถุ`, `สร้างเส้นทางติดตาม`, `ช่วงที่ยังไม่ยืนยัน`,
`อนุมัติการปกปิด`, `เรนเดอร์ถูกบล็อก: ยังปกปิดไม่ครบ` and `แก้ไขจุดติดตาม`.
Use `privacy track`/`verified` as English fallback metadata.

### Browser Evidence Required

Browser fixture covers manual blur, tracking progress, low-confidence correction
and blocked/approved preflight. Worker fixture proves the output remains blurred
for approved ranges and refuses unverified ranges.

## Tests and acceptance

- Region normalization, shape/feather/strength, keyframe motion and correction.
- Tracker result confidence/missing intervals, stale revision and approval.
- Privacy preflight fail-closed and typed blur compilation.
- Browser screenshots at desktop/tablet/mobile with keyboard region edits.

## Risks and stop conditions

Never silently downgrade tracking to an unblurred render. Stop on missing source,
stale model/result, checksum mismatch or unavailable sandbox/filter guarantees.
