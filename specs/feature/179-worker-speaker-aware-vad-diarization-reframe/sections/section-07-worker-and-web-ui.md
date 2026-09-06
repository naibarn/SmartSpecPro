# Section 07 — Worker and Web UI

## Goal

Expose flexible workflow selection, adapter policy, scan/review state, subtitle-first editing, and render approval without removing existing Worker Media Studio behavior.

## Files owned

- `apps/worker-app/src/screens/media-workspace/SpeakerAwareWorkflowPanel.tsx` and focused child components.
- `apps/worker-app/src/screens/media-workspace/MediaWorkspaceHost.tsx`, `MediaVideoEditorPlayer.tsx`, and styles only for wiring/state presentation.
- `apps/web/client/src/components/verticalDramaSeries/VerticalDramaProductionEpisodesPanel.tsx` or its current production child for job/artifact summary.
- focused Worker/Web tests.

## Implementation tasks

1. Add recipe choices: subtitle-first 16:9, speaker-aware reframe, speaker-first coverage, full assisted edit, and custom.
2. Add reorder/enable/disable stage editor and visible invariant warnings rather than locking sequence.
3. Add adapter policy editor with primary/enabled/fallback policy and per-adapter preflight status. Disable run when required adapter is not ready; show exact remediation.
4. Add scan progress/cancel/resume, evidence list, confidence/conflict badges, jump-to-source, manual track correction, and manual lock.
5. Add condensation review with cue text/source range, keep/remove/shorten, restore, and approval.
6. Add stale/approval/render state and preserve existing dead-air/manual controls, Bin/Library panel state, and crop/aspect controls.
7. Web production page shows server job/artifact status and links into Worker review; it does not duplicate local inference state.
8. Add Thai-first copy and English fallback, semantic labels, reduced motion, responsive layout, and no horizontal overflow.

## UI/UX Contract

### Target User / JTBD
- Role: editor/producer.
- Goal: choose a flexible workflow, review evidence, customize cuts/reframe, and approve a safe render.
- Entry point: Worker Media Studio and Web production episode status.
- Success outcome: the user can complete subtitle-first, speaker-aware, or custom flows without losing existing manual/dead-air edits.

### Existing Pattern Reference
- Search: `rg` over `apps/worker-app/src/screens/media-workspace` and `apps/web/client/src/components/verticalDramaSeries`.
- Found: crop/WYSIWYG preview, Quick Silence Cut, subtitle modal, worker job summaries, render controls.
- Decision: reuse existing interaction/state patterns; diverge only into a dedicated panel for complex stage/adapter configuration.

### Surface Inventory
| Surface | File | Change |
|---|---|---|
| Worker workflow panel | `SpeakerAwareWorkflowPanel.tsx` | recipe, stage, adapter, review |
| Worker preview/timeline | existing media workspace | evidence/action overlays |
| Web production status | `VerticalDramaProductionEpisodesPanel.tsx` | server job/artifact summary |
| Render controls | existing player/render area | map hash/approval state |

### Component Map
| Component | Owns | Consumes |
|---|---|---|
| `SpeakerAwareWorkflowPanel` | workflow user actions | recipe, capabilities, artifacts |
| `StageOrderEditor` | stage order/enabled state | `WorkflowRecipeV1` |
| `AdapterPolicyEditor` | adapter/fallback policy | `AdapterPolicyV1` |
| `EvidenceTrackList` | track review/jump | `ScanArtifactV1` |
| `CondensationReview` | keep/remove/shorten | subtitle proposal |
| `EditMapReviewBar` | stale/approval/render | `ComposedEditMapV1` |

### State Matrix
| State | Expected UI | Verification |
|---|---|---|
| loading | progress/skeleton, actions disabled | component test |
| empty | explain no scan and offer run | component test |
| error/unavailable | typed reason and remediation | component test |
| conflict/partial | evidence conflict and review gate | component test |
| success | artifact hash, counts, review/render actions | component test |
| stale | parent changed and rescan/replan required | component test |
| disabled/focus/hover/selected | visible semantic states | keyboard/browser |

### Responsive Matrix
| Viewport | Expected behavior | Evidence |
|---|---|---|
| mobile 390x844 | single-column stepper and bottom-sheet evidence | browser |
| tablet 768x1024 | stacked preview/panel with sticky actions | browser |
| desktop 1440x900 | two-column editor/evidence view | browser |
| small-mobile 360x800 | compact labels and inner chip scroll | browser/manual |
| laptop 1024x768 | independent panel scroll, no page overflow | browser/manual |
| wide-desktop 1280x800 | capped evidence columns and reachable actions | browser/manual |

### Accessibility Acceptance
Keyboard path covers reorder, adapter selection, run/cancel, evidence jump, corrections, and approval. Icon-only controls have names; status uses `role=status`/`role=alert`; focus is visible; contrast and reduced motion follow existing studio rules; confidence is not color-only.

### Copy Contract
Thai-first: `เลือกขั้นตอน`, `วิเคราะห์ผู้พูด`, `ตัวตรวจจับเสียง`, `หลักฐานคำบรรยาย`, `รอการตรวจสอบ`, `ไม่พร้อมใช้งาน`, `อนุมัติเพื่อเรนเดอร์`; English fallback follows locale conventions. Errors state stage, adapter, reason, and next action.

### Browser Evidence Required
Follow `skills/orchestra/references/ui-browser-verification.md`; record canonical viewport results in section 08.

## TDD first

- Recipe and custom stage ordering persists.
- Adapter unavailable/blocked state cannot trigger run.
- Scan progress/empty/error/conflict/success/stale states render.
- Subtitle-first review and condensation restore work without invoking speaker reframe.
- Existing Silence Cut/manual selection remains visible and stateful.
- Keyboard labels/focus and responsive panel states are covered by focused tests.

## Exit evidence

Worker React tests, Web component tests, and browser evidence in section 08. If a production server or Worker runtime cannot be started, mark the browser checks skipped rather than passing them.
