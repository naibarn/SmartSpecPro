# Section 04 — Visual Tracks and Active Speaker Fusion

## Goal

Combine face/person/body evidence with speech/diarization windows so multi-speaker framing can hold, move smoothly, or cut without oscillation or false face-only assumptions.

## Files owned

- `apps/web/shared/verticalDramaMedia/speakerAwareWorkflow.ts` fusion/smoothing functions.
- `apps/worker-app/src/screens/media-workspace/MediaVideoEditorPlayer.tsx` preview integration only.
- `apps/worker-app/src/screens/media-workspace/mediaWorkspaceTimeline.ts` camera/action and edit-map preview helpers.
- `apps/worker-app/src-tauri/src/speaker_aware_pipeline.rs` track evidence wiring.
- `apps/worker-app/tests/media-workspace/speakerAwareTracking.test.ts` and focused player tests.

## Implementation tasks

1. Normalize MediaPipe face detections/keypoints and PersonBody detections into stable tracks with explicit source coordinate spaces.
2. Support `body_only` when the face is missing/not facing camera; posture may be unknown. Never label body detection as face detection.
3. Fuse diarization speaker IDs to visual tracks using time overlap, optional active-speaker visual cue, position continuity, and confidence hysteresis. Output alternatives/conflicts.
4. Implement camera decision compiler: `hold`, bounded `slow_move`, `cut_to_track`, `cut_to_wide`, `manual_lock`, `no_change`. Require two-window confirmation and default minimum hold; preserve a target while inside the safe crop.
5. Ensure the existing preview frame, 9:16/16:9 crop guide, and smooth motion consume the same focus/action plan. On target loss, hold last valid composition or use explicit fallback; never drift to background.
6. Add timeline overlays for active track, evidence confidence, and camera actions without removing existing dead-air/manual controls.

## UI/UX Contract

### Target User / JTBD
- Role: editor reviewing who speaks and where the crop should move.
- Goal: see the selected person/track and why the camera holds/moves/cuts.
- Entry point: existing Media Studio preview/timeline.
- Success: a user can inspect a track, jump to source time, lock/manual-correct it, and preview stable motion.

### Existing Pattern Reference
- Search: targeted `rg` over `MediaVideoEditorPlayer.tsx`, `mediaWorkspaceTimeline.ts`, and existing crop/dead-air controls.
- Found: crop-guide/WYSIWYG preview, focus buttons, waveform/timeline ranges.
- Decision: reuse; add evidence overlays and action badges within the existing player.

### Surface Inventory
| Surface | Change |
|---|---|
| preview canvas | active track/crop/action overlay |
| timeline | evidence/action lanes and existing silence/manual ranges |
| focus toolbar | selected track, hold/move/cut/lock status |

### Component Map
| Component | Ownership | Contract |
|---|---|---|
| `MediaVideoEditorPlayer` overlay | Worker UI | visual track + camera action |
| timeline evidence lane | Worker UI | active-speaker windows + edit map |
| focus toolbar state | Worker UI | selected track, lock, preflight status |

### State Matrix
| State | UI |
|---|---|
| loading | scanning badge and disabled action |
| empty | no visual evidence explanation |
| conflict | multiple candidate tracks with review action |
| success | selected track and confidence basis |
| disabled/focus/hover | keyboard-visible controls |

### Responsive Matrix
| Viewport | UI behavior |
|---|---|
| 390x844 | overlay summary collapses; evidence list becomes sheet |
| 768x1024 | preview above scrollable evidence/timeline |
| 1440x900 | preview + evidence lanes visible |
| 360x800 / 1024x768 / 1280x800 | compact toolbar and independent scrolling |

### Accessibility Acceptance
Keyboard can focus each track/action; labels identify confidence and reason; color is not the only signal; reduced motion holds a static preview while retaining action metadata.

### Copy Contract
Thai-first labels: `ผู้พูดที่กำลังพูด`, `ติดตามบุคคล`, `หยุดกรอบ`, `เคลื่อนช้า`, `ตัดไปผู้พูด`, `ล็อกกรอบ`, `ไม่พบใบหน้า ใช้ทั้งตัวแทน`; errors state whether audio or visual evidence is missing.

### Browser Evidence Required
Record player/timeline evidence at the canonical viewports and include no-drift/no-oscillation manual notes.

## TDD first

- Stable target remains held inside safe zone.
- Background/lower-confidence track cannot steal focus.
- Target loss holds or uses explicit fallback, never random center drift.
- Speaker switch becomes a cut only after debounce; slow moves are bounded and monotonic.
- Body-only track works when face evidence is absent.

## Exit evidence

Focused pure tests plus Worker UI tests. Browser evidence is completed in section 08.
