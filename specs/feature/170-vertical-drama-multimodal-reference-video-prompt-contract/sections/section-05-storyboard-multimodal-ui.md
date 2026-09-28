# Section 05 — Storyboard multimodal drag/drop and Library UX

## Objective

Keep separate image-only Start/Stop slots and add a multimodal Reference media
drop zone for local files and canonical Library assets. Users can inspect,
reorder, remove, and understand provider readiness without hidden drops.

## Existing Pattern Reference

Reuse image-only drop/upload state patterns in
`VerticalDramaStoryboardPanel.tsx`, canonical asset linking in existing
Vertical Drama reference flows, and modality-aware input/preview patterns from
`mediaStudioPayload.ts` and `mediaModelInputs.ts`. Diverge only for the
separate temporal frame slots and mixed ordered reference list because the
current shot strip cannot represent video/audio or temporal semantics.

## UI/UX Contract

### Target User / JTBD

- Role: Vertical Drama creator/editor.
- Goal: attach exact image/video/audio references to one shot and know whether
  the selected model can use them.
- Entry point: episode storyboard shot card.
- Success: authorized ordered attachments are inspected, explicitly referenced
  in the final prompt, and ready for render.

### Surface Inventory

| Surface | File/route | Change |
| --- | --- | --- |
| Shot card | `VerticalDramaStoryboardPanel.tsx` | Start/Stop slots and reference drop/list. |
| Workspace | `VerticalDramaEpisodeWorkspace.tsx` | Pass bundle/readiness state. |
| Episode page | `VerticalDramaEpisodePage.tsx` | Wire mutations, imports, Library payloads, final prompt state. |
| Library/media | Existing managed-media surfaces | Provide canonical ID and media kind. |

### Component Map

| Component | Owns | Consumes |
| --- | --- | --- |
| `ShotFrameDropSlot` | image-only frame admission/state | frame asset, callbacks |
| `ShotReferenceMediaDropZone` | local/Library add | accepted kinds, revision |
| `ShotReferenceMediaList` | order/role/segment/remove | typed references, readiness |
| `ReferenceMediaCard` | modality preview/status | canonical metadata |
| `ModelReadinessSummary` | mode/limits/block reason | capability response |

Video references default to the whole file and may expose a bounded in/out
segment editor when the server/provider profile supports video segments. Audio
references remain whole-file in version 1. The card must show the effective
range and reject a range that exceeds source duration.

### State Matrix

| State | Expected UI | Verification |
| --- | --- | --- |
| loading/uploading | progress; render disabled | component/browser |
| empty | optional stop and reference affordance | component |
| pending | visible but not prompt/render eligible | component |
| success | preview, modality, role, source, order | component/browser |
| partial success | retained accepted cards; failed retry | component/browser |
| blocked | no paid action; exact reason | component/browser |
| selected/hover/focus | visible target/focus ring | browser/a11y |
| invalid drop | video/audio rejected in Start/Stop; reason shown | component/browser |

### Responsive Matrix

| Viewport | Expected behavior | Evidence |
| --- | --- | --- |
| mobile 390x844 | stacked cards, usable previews, action menu | screenshot |
| tablet 768x1024 | no horizontal clipping; balanced list | screenshot |
| desktop 1440x900 | frame slots/list/readiness visible | screenshot |
| small-mobile 360x800 | compact metadata/action menu | extended screenshot |
| laptop 1024x768 | prompt/readiness remains visible | extended screenshot |
| wide-desktop 1280x800 | no overflow in dense cards | extended screenshot |

### Accessibility Acceptance

Provide keyboard/button alternatives for every drag/drop action. Expose labels,
focus order, selected/invalid/disabled contrast, live upload/status/error
announcements, and reduced-motion behavior. Color cannot be the only modality
signal.

### Visual Direction

Reuse existing storyboard components and tokens. Make temporal frame hierarchy
stronger than generic references; show modality with icon and text; use
restrained transitions; do not add a global reset or raw color/spacing values.

### Copy Contract

Thai is primary with existing English labels where established. Required copy
includes: `ยังไม่มี Stop frame (ไม่บังคับ)`, `ลากภาพ วิดีโอ หรือ audio มาใส่ได้`,
`ช่องนี้รับเฉพาะภาพสำหรับ Start/Stop frame`, pending/readiness/stale messages,
and exact model/asset block reasons. Use localization keys and safe fallback.

### Browser Evidence Required

Follow `skills/orchestra/references/ui-browser-verification.md`. Capture local
image/video/audio drag, Library drag, invalid frame drops, reorder/remove,
pending/error/success/readiness, and final prompt display at required viewports.
Unavailable browser tooling is recorded as a limitation, not a pass.

## TDD-first tests

Test local/Library payloads, content validation, image-only frame slots,
pending/partial/error/success, previews, reorder/remove, 50-item ceiling,
keyboard alternatives, capability readiness, stale state, and terminal prompt
display. Include whole-video default and bounded video-segment selection, with
audio remaining whole-file in version 1. Use jsdom for browser-facing components.

## Exit criteria

Focused StoryboardPanel/EpisodePage/media input tests pass and browser evidence
or an explicit tooling limitation is recorded. Only owned UI paths are changed.

## Implementation status

Implemented in `apps/web/client/src/components/media/ImageSourcePicker.tsx`,
`apps/web/client/src/components/verticalDramaSeries/VerticalDramaStoryboardPanel.tsx`,
`apps/web/client/src/pages/VerticalDramaEpisodePage.tsx`, and the upload router.
The reference strip accepts local or library image/video/audio drops and the
three frame roles remain separated. Focused jsdom/media-input tests pass;
full browser evidence remains a tooling limitation for this run.
