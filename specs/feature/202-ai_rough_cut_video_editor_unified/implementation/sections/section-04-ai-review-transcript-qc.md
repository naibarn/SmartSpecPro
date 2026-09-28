# Section 04 — AI scope, transcript, change-set review, and QC

## Goal

Expose Spec 202/203 AI contracts as a review-first editor workflow that protects
manual locks and makes evidence, confidence, skipped operations, and QC visible.

## Ownership paths

- Add review surfaces under `apps/web/client/src/components/videoeditor/review/`:
  scope picker, transcript/anchor view, change-set review, evidence inspector,
  before/after preview, and QC panel.
- Modify `VideoEditorPhase3.tsx` only to compose review surfaces and route
  callbacks; do not move canonical apply logic into the UI.
- Reuse existing editorial/change-set/evidence/QC services and shared contracts
  from Specs 202/203.
- Tests: review state, keyboard navigation, stale apply, protected operations,
  QC gates, and Phase3 composition tests.

## Design

Provide bounded scope without a wizard: current clip, selected range, current
scene, entire timeline, and unedited ranges when supported. Keep the analysis →
suggestion/draft → preview → apply → render boundary visible even if automatic
mode chains the operations.

Transcript/source-anchor UI must distinguish loading, unavailable, stale,
evidence-ready, invalid, and error. It may select a timeline range but the
server remains the owner of revision-bound apply.

Change-set review shows change-set identity, summary, protected/skipped/manual
locked operations, source/evidence references, confidence, validation, and
renderer mapping in Expert mode. Basic mode stays concise. Actions are Apply
All, Apply Selected, Reject Selected, Revert, and Regenerate Selected when the
server contract permits them.

Before/after or A/B preview must be keyboard reachable. Stale change-set apply
is blocked with reload/recompute guidance. QC uses INFO/REVIEW/WARNING/BLOCKING;
blocking state disables final render unless a server-approved override is
available. UI never marks degraded evidence as approved.

## TDD checklist

- Scope selection and bounded selection default.
- Explicit analysis/suggestion/preview/apply/render transitions.
- Transcript loading/empty/unavailable/stale/ready/error.
- Change-set protected/skipped/locked display and selected actions.
- Stale revision/change-set apply is blocked and recoverable.
- Before/after A/B keyboard path and active-side announcement.
- Evidence/confidence missing/stale/invalid/blocked states.
- QC severity, blocking render gate, approved override, and recoverable partial.

## UI/UX Contract

### Target User / JTBD

- Role: creator using AI to improve an existing edit.
- Goal: inspect, understand, and selectively apply AI changes safely.
- Entry point: AI panel, transcript/selection action, or review status from a
  Worker job.
- Success: manual intent is protected and every applied change is explainable
  and reversible.

### Existing Pattern Reference

- Searched: `RoomWorkflowPanel.tsx`, `MarketplaceDraftQualityQcPanel.tsx`,
  existing videoeditor History/Smart Camera/Silence panels, and 202/203 shared
  contracts.
- Found: Summary/Evidence/Raw tabs, QC severity/confirmation, history and
  degraded/stale panel patterns.
- Decision: reuse patterns and shared services; diverge only for timeline
  change-set geometry and media preview needs.

### Surface Inventory

| Surface | File/route | Change |
|---|---|---|
| Scope picker | New review component | Bounded operation scope |
| Transcript/anchors | New review component | Source/revision-bound review |
| Change-set review | New review component | Selective apply/reject/revert |

## Implementation result

Implemented the review workspace and its scope picker, transcript/source-anchor
states, change-set operation review, protected/manual-lock visibility,
evidence/confidence inspector, before/after preview, and QC severity/blocking
panel. No unavailable backend result is fabricated: an absent change set or
transcript is shown as unavailable and Apply is revision-bound/stale-blocked.

Focused proof: `reviewTypes.test.ts`, `editorUiSurfaces.test.tsx`, and Review
Workspace targeted compile passed.
| A/B preview | New review component + PreviewPlayer | Before/after/loop/jump |
| Evidence inspector | New review component | Confidence/refs/locks |
| QC panel | New review component | Severity/blocking/override |

### Component Map

| Component | File | Owns | Consumes |
|---|---|---|---|
| ScopePicker | `review/ScopePicker.tsx` | bounded operation scope | selection/timeline context |
| TranscriptAnchorView | `review/TranscriptAnchorView.tsx` | transcript/source states | evidence/transcript contract |
| ChangeSetReviewPanel | `review/ChangeSetReviewPanel.tsx` | review actions | change-set/evidence data |
| BeforeAfterPreview | `review/BeforeAfterPreview.tsx` | A/B/loop state | PreviewPlayer + revisions |
| EvidenceInspector | `review/EvidenceInspector.tsx` | confidence/refs/locks | editorial evidence |
| QcReviewPanel | `review/QcReviewPanel.tsx` | severity/render gate | QC/artifact status |

### State Matrix

| State | Expected UI | Verification |
|---|---|---|
| loading/empty | explanation and retry/next action | component test |
| unavailable/stale | reason and recompute path | component test |
| draft/suggestion | review controls, no implicit apply | integration test |
| selected/applying | selection and pending disabled state | integration test |
| conflict/rejected | preserved state and recovery | integration test |
| applied/undo | revision/change-set identity and undo | integration test |
| QC warning/blocking | severity and render gate | integration/browser |

### Responsive Matrix

| Viewport | Expected behavior | Evidence |
|---|---|---|
| mobile 390x844 | Review-first sheet; one primary action at a time | Playwright |
| tablet 768x1024 | Review tabs separate transcript/AI/inspector | Playwright |
| desktop 1440x900 | Preview and change list visible together | Playwright |
| small-mobile 360x800 | Evidence details collapse without losing summary | Playwright |
| laptop 1024x768 | A/B/review panes scroll independently | Playwright |
| wide-desktop 1280x800 | Expert details do not cover timeline | Playwright |

### Accessibility Acceptance

- Changes/warnings are keyboard navigable with next/previous actions.
- Apply/reject/revert actions have explicit names and pending/disabled states.
- Confidence and warning text is readable without color-only encoding.
- A/B active side and QC severity are announced.
- Reduced motion does not block review or hide state.

### Copy Contract

- Use Thai-first terms for “ข้อเสนอแนะ”, “ฉบับร่าง”, “ตรวจสอบก่อนใช้”,
  “ป้องกันไว้”, “ข้ามไว้”, “ความมั่นใจ”, and QC severity.
- Explain why an operation is protected, skipped, stale, invalid, or blocked.
- Expert raw identifiers are available behind a labelled inspection surface.

### Browser Evidence Required

Capture suggestion/review/apply/reject/conflict/QC states, keyboard change
navigation, A/B preview, and mobile review-first flow at required viewports.

## Exit criteria

AI is visibly review-gated, revision-bound, evidence-aware, and reversible; no
new UI implies that contract presence alone means the feature is executable.
