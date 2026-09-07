# Section 02 — Speaker Scan and Identity Panel

> v2 implementation prerequisite: read ../contracts-v2.md and the v2 section dependency graph. Both local and cloud execution are supported through one control plane. Existing v1 scope remains unless explicitly revised there.

## Goal

Turn Feature 179 scan evidence into a user-reviewable registry for standalone and Series projects.

## Implementation scope

- Normalize VAD, diarization, face, person/body and active-speaker evidence into `SpeakerIdentityRegistryV1`.
- Preserve audio-only and body-only segments and record disagreement as review state.
- Respect selected adapter policy and explicit fallback exactly.
- Resolve source video from an existing project asset/managed artifact before asking for a folder; return `SOURCE_UNAVAILABLE` only when resolution genuinely fails.
- Extend the existing Worker Media workspace with the dockable Speakers & Dubbing panel.
- Add standalone rename/representative-frame/merge/split/unknown controls.
- Add Series character proposal and explicit approval without mutating canonical Series data.

## UI/UX contract

The panel is a right dock on desktop, a resizable drawer on laptop, a full-height sheet on tablet and a single predictable scroll surface on narrow screens. Tabs are Speakers, Translation, Voices and Review/Export. Every tab exposes loading, empty, partial, error, needs-review and success states. Primary actions remain reachable without nested hidden scroll. Keyboard focus, labels, status text and reduced-motion behavior follow the main spec.

## TDD stubs

- Registry normalization fixtures for one, two, overlapping, no-face and body-only speakers.
- Standalone and Series mapping persistence tests.
- Source auto-resolution and missing-source tests.
- Adapter policy/preflight tests.
- Worker UI state, panel scroll and tab-state preservation tests.

## Exit criteria

An editor can scan any standalone or Series video, inspect evidence, name/map speakers and save a new registry revision while existing timeline/Silence Cut controls remain intact.

## UI/UX Contract

### Target User / JTBD

Editors need to understand who may be speaking and name/map those clusters without losing the timeline.

### Surface Inventory

The right/dockable Speakers tab, timeline jump links, representative-frame capture and Series character picker are the feature surfaces.

### Component Map

`SpeakerIdentityPanel` owns cluster cards and scan state; `SpeakerEvidenceCard` owns evidence; `SpeakerNameEditor` owns standalone naming; `CharacterMatchPicker` owns approved Series mapping.

### State Matrix

Cover loading, empty/no speech, partial scan, low-confidence needs review, selected, merge/split editing, save success and scan error. Preserve the last immutable registry while a new scan runs.

### Responsive Matrix

At 1440×900 use a right dock; at 1280×800 use a resizable drawer; at 768×1024 use a full-height sheet; at 390×844 stack cards in one scroll container.

### Accessibility Acceptance

Cluster cards, evidence toggles, rename fields, merge/split controls and timeline jumps are keyboard reachable with visible focus and accessible labels.

### Copy Contract

Use Thai labels such as “ผู้พูดไม่ระบุชื่อ”, “ต้องตรวจสอบ” and “แมปเป็นตัวละคร”; explain that a frame is representative evidence, not identity proof.

### Browser Evidence Required

Capture one-speaker, multi-speaker, low-confidence, standalone naming and Series mapping states at desktop and narrow widths, including panel scrolling and jump-to-time.

## v2 required integration

Reuse speaker_aware_media_scan without a second scan job kind. Authored dialogue identity bypasses scanning; no automatic canonical character mutation. Map v1 nullable Series scope at the boundary.
