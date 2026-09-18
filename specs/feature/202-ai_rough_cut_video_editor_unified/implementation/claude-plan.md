# Spec 202/203 Web Video Editor UI/UX Improvement Plan

## 1. Executive outcome

This plan closes the gap between the existing Spec 202/203 contracts and the
active `/video-editor` experience. The implementation must make user-facing
state truthful and recoverable before adding more visual polish: a user must
always know whether work is local, persisted, stale, conflicted, queued,
blocked, degraded, rendering, under QC, or complete.

The plan is intentionally incremental. `VideoEditorPhase3` is the active route
and contains useful timeline/preview/media behavior, so the work extracts
stable state and UI primitives around it instead of replacing the editor or
creating a second project/runtime model.

## 2. Authority and boundaries

### Normative authorities

- Spec 202 defines the flexible editor, AI tool, rough-cut, change-set, mobile,
  keyboard, accessibility, and release-gate expectations.
- Spec 203 defines canonical project/revision ownership, execution admission,
  capability lifecycle, evidence/compiler, artifact/QC, runtime, and security
  state semantics.
- Server responses and canonical revision/job/artifact state remain authoritative.
  The browser renders those decisions and may not infer capability, authorize
  tenants, mark jobs complete, or merge revisions locally without a server
  contract.

### In scope

- Active `VideoEditorPhase3` shell and its project/save/autosave/dialog/sidebar
  flows.
- Worker handoff and the related `/worker-jobs` list/detail flow.
- UI state adapters, copy, accessibility semantics, responsive layout, AI
  review/change-set/transcript/QC surfaces, focused tests, and browser evidence.

### Out of scope

- Replacing the server project/revision/CAS or worker control plane.
- Creating a new project store, editor runtime, workflow engine, Agency,
  OpenSandbox, Docker dispatch, or retired `/workpacks` integration.
- Rebuilding the legacy rollback editor. Shared primitive compatibility is
  allowed only when it does not make legacy a second canonical model.
- Claiming Windows Worker, deployment, provider, or production parity without
  target evidence.

## 3. Existing pattern and reuse decision

The plan reuses existing product primitives and interaction patterns:

| Interaction | Reuse | Decision |
|---|---|---|
| Modal/confirmation/focus | `components/ui/dialog.tsx`, `alert-dialog.tsx` | Replace editor-local custom overlays with Radix primitives |
| Mobile panel | `components/ui/sheet.tsx` or `drawer.tsx` | Use managed Sheet for mobile sidebar and status detail |
| Tabs | `components/ui/tabs.tsx` | Use for sidebar/tablet workspace navigation |
| Focus-visible/touch controls | `WorkerWebEditor.tsx` | Reuse its keyboard-visible focus and minimum control sizing |
| Project conflict | `VideoStudioWorkspacePage.tsx`, `ProductionWorkspace.tsx` | Reuse banner/state vocabulary; adapt to editor revisions |
| QC severity/confirmation | `MarketplaceDraftQualityQcPanel.tsx` | Reuse AlertDialog and passed/review/blocking language |
| Evidence inspection | `RoomWorkflowPanel.tsx` Summary/Evidence/Raw tabs | Reuse expert inspection separation |
| Job polling/detail | `RenderJobsPage.tsx` | Extend current list/detail, not a second job viewer |

No new design system is introduced. Phase3 may receive local adapter styles,
but reusable controls should use existing tokens and primitives.

## 4. Delivery dependency graph

```text
01 UI foundation/state primitives
 ├── 02 revision + conflict UX
 ├── 03 execution + capability/job visibility
 ├── 04 AI review + transcript + change-set + QC
 └── 05 responsive + visual/token consistency
          \
           06 integration tests + browser evidence + rollout gate
```

Wave 01 is the only mandatory serial foundation. Waves 02–05 can be developed
in parallel only after the shared state/copy/focus contracts are stable; writers
must own separate files and cannot concurrently rewrite the same Phase3 shell.
Wave 06 is final and must run after all user-visible states exist.

## 5. Proposed contracts and file ownership

The following are planned boundaries, not implementations:

| Boundary | Proposed location | Responsibility |
|---|---|---|
| Editor UI state types | `apps/web/client/src/components/videoeditor/ui/editorUiState.ts` | Stable unions for save, sync, conflict, capability, job, QC, and modal states |
| Safe copy/error mapping | `apps/web/client/src/components/videoeditor/ui/editorCopy.ts` | Thai-first labels, safe fallback, no raw provider/stack errors |
| Status/live region | `apps/web/client/src/components/videoeditor/ui/EditorStatusBanner.tsx` | Semantic status, reason, action, `role=status/alert`, live announcements |
| Accessible modal wrappers | `apps/web/client/src/components/videoeditor/ui/EditorDialog.tsx` | Shared Dialog/AlertDialog usage, title/description, focus policy |
| Mobile workspace panel | `apps/web/client/src/components/videoeditor/ui/EditorMobileSheet.tsx` | Managed sheet, focus trap/return, Escape/backdrop behavior |
| Project/revision adapter | `apps/web/client/src/components/videoeditor/ui/projectRevisionUi.ts` | Maps tRPC save/autosave/load errors and revisions into UI state |
| Execution status adapter | `apps/web/client/src/components/videoeditor/ui/executionStatusUi.ts` | Maps server job/statusReason/runtime/capability/QC into safe UI states |
| Conflict surface | `apps/web/client/src/components/videoeditor/ProjectConflictPanel.tsx` | Base/current revision, reload/merge/variant actions |
| Job status surface | `apps/web/client/src/components/videoeditor/EditorJobStatusPanel.tsx` | In-editor lifecycle and links to detailed job view |
| AI review surfaces | `apps/web/client/src/components/videoeditor/review/` | Scope, transcript anchors, change-set review, evidence, QC |
| Browser evidence | `implementation/ui-browser-evidence.md` | Current authenticated screenshots, keyboard/a11y/overflow notes |

If an existing shared component can own a boundary without editor-specific
behavior, use it directly instead of adding a wrapper.

## 6. Section 01 — UI foundation, state model, and accessibility primitives

### Objective

Remove duplicated custom overlay behavior and establish the state/copy/focus
contracts required by all later sections.

### Implementation direction

- Define discriminated state types for `save`, `sync`, `conflict`, `execution`,
  `capability`, `review`, `qc`, and `modal` without duplicating server truth.
- Normalize server errors by code and safe metadata. `CONFLICT` should preserve
  current revision ID/number when the server exposes it; otherwise refetch the
  project before showing resolution actions. Do not display raw `cause`, URLs,
  stack traces, or provider messages.
- Replace the Phase3 `ConfirmDialog`, Project List overlay, Export Dialog,
  Render Progress overlay, and Keyboard Shortcuts overlay with existing Radix
  Dialog/AlertDialog primitives or a small shared editor wrapper.
- Add `aria-labelledby`, `aria-describedby`, `aria-modal`, visible focus,
  Escape handling, focus return, and action loading/disabled states.
- Convert the sidebar buttons to semantic Tabs where they represent panel
  selection. Keep non-tab actions as ordinary buttons with explicit type and
  names.
- Create a live-region policy: progress/status updates are polite; blocking
  conflicts and failures are assertive once; repeated polling does not spam.

### Tests before implementation

- State/error mapping: `CONFLICT`, stale, network/offline, unknown error,
  capability-blocked, waiting-agent, degraded, terminal failure.
- Dialog open/close, initial focus, Tab containment, Escape, backdrop policy,
  focus restoration, accessible name/description, and disabled action state.
- Mobile sheet open/close by button, backdrop, Escape, and focus return.
- Tabs expose selected state and panel association; keyboard navigation works.

### Acceptance

- No active editor custom modal lacks dialog semantics or an accessible close
  action.
- Raw server/provider error text is not the primary user-facing message.
- Existing Timeline/Preview keyboard behavior remains unchanged.

## 7. Section 02 — Project revision, sync, autosave, and conflict UX

### Objective

Make project persistence safe and understandable while preserving local edits.

### Implementation direction

- Add a persistent editor header status showing project ID when available,
  current revision number/short ID, last saved time, autosave state, and
  external-update indicator.
- Map save/autosave mutation results into `saving`, `saved`, `autosaved`,
  `offline`, `retrying`, and `conflict` states. Autosave failures must be
  visible and retryable; logging alone is insufficient.
- On `CONFLICT`, keep the local project snapshot in memory/session recovery,
  fetch the latest server revision, and open `ProjectConflictPanel` without
  discarding local changes.
- Show base revision versus current server revision and provide only actions
  supported by the server contract: reload latest, retry/keep mine if safe,
  server-approved merge, or save as duplicate variant. If merge is not
  supported, disable it with an explanation instead of simulating it.
- Restore focus to the conflict trigger or announce the selected resolution.
- Keep `beforeunload`, session recovery, and dirty-project confirmation, but
  route their copy through the shared copy contract.

### Server/API boundary

- Reuse `videoEditorProjects.save` and `autoSave` expected revision fields.
- If the tRPC error does not safely transport current revision metadata, extend
  the conflict error data or add a read-only latest-revision query; do not add a
  client-only merge endpoint or mutate schema without evidence.
- Ensure retry actions generate a fresh mutation/idempotency key while keeping
  the project payload and intended base revision explicit.

### Tests before implementation

- Save success updates revision and clears dirty state.
- Autosave success updates revision and timestamp.
- Autosave network failure renders retryable visible state.
- Concurrent save returns conflict and preserves local project data.
- Reload latest discards local changes only after explicit confirmation.
- Save-as-variant does not overwrite the conflicting project.
- Focus restoration and screen-reader announcement for each resolution.

### Acceptance

The editor visibly satisfies Spec 203 shared project indicators: current
revision, sync state, last saved time, external update, conflict state, and
render revision when a job is active.

## 8. Section 03 — Execution admission, capability, and job visibility

### Objective

Make the Worker/control-plane lifecycle understandable from both the editor and
`/worker-jobs`, without implying unsupported execution parity.

### Implementation direction

- Extend `executionStatusUi.ts` to map server job status, `statusReason`,
  runtime/worker identity, capability result, snapshot/revision, and QC/output
  fields into a stable display state.
- Add an in-editor job status panel/banner after submission. It should show job
  ID, pinned revision, runtime/agent, reason-first status, progress, cancel,
  retry where allowed, review output, and return-to-editor actions.
- Extend `RenderJobsPage` status labels, filters, badges, and detail sections
  for waiting-agent, capability-blocked, degraded, stale, QC, and fallback.
- Distinguish no eligible executor (`capability-blocked`) from an eligible but
  unavailable executor (`waiting-agent`). Show retry/route guidance supplied by
  the server; the UI must not force an agent.
- Keep output links gated by verified artifact/Library state. A render result
  without required commit remains incomplete in UI.
- Remove or isolate any direct link to retired `/workpacks` surfaces rather than
  extending that route. Replace it with an allowed source/editor link only when
  the owning contract is known.

### Tests before implementation

- Projection tests for every status and reason, including unknown/future values.
- No-worker capability-blocked state has no misleading queued/completed label.
- Waiting-agent state exposes timeout/retry guidance.
- Degraded evidence is visibly diagnostic and not marked approved/completed.
- Cancel/retry actions honor server permissions and pending state.
- Pinned revision and runtime identity remain visible after later project edits.
- Mobile job cards keep status reason and primary action visible.

### Acceptance

Submitting from `/video-editor` never ends in an unexplained generic queue
state. Every non-terminal state has a reason and a safe next action.

## 9. Section 04 — AI scope, transcript, change-set review, and QC

### Objective

Expose the existing Spec 202/203 contracts as a review-first editing workflow,
without letting AI silently overwrite manual work.

### Implementation direction

- Add a scope control usable without a wizard: current clip, selected range,
  scene, entire timeline, and unedited ranges where supported.
- Add a transcript/source-anchor surface that can show loading, unavailable,
  stale, evidence-ready, and error states. Keep the timeline as the canonical
  apply target.
- Separate Analyze, Generate Suggestions, Preview, Apply, and Render states in
  the UI even when an automatic mode chains them internally.
- Add a change-set review surface with change-set ID, operation count, protected
  or skipped operations, source/evidence references, confidence, lock status,
  before/after or A/B preview, Apply All, Apply Selected, Reject Selected,
  Revert, and Regenerate Selected.
- Add QC display with INFO/REVIEW/WARNING/BLOCKING severity, artifact/render
  phase, blocking reason, allowed override policy, and recoverable partial
  states. Blocking QC must stop final render in the UI unless the server returns
  an allowed override path.
- Reuse `RoomWorkflowPanel`-style Summary/Evidence/Raw separation for expert
  inspection while keeping Basic mode concise.

### Tests before implementation

- Scope selection and bounded default for selection-triggered operations.
- Suggest/Draft/Apply transitions do not apply before explicit approval.
- Locked/manual operations remain unchanged.
- Change-set selected apply/reject/revert is revision-bound and stale-safe.
- Evidence/confidence missing, stale, invalid, and blocked states are visible.
- QC severity and blocking states prevent inappropriate render actions.
- Keyboard navigation moves between changes/warnings and triggers review actions.

### Acceptance

Users can inspect and approve AI work before it changes the timeline, and can
understand why an operation was skipped, protected, degraded, or blocked.

## 10. Section 05 — Responsive, visual, copy, and motion consistency

### Objective

Make the active editor coherent across mobile, tablet, laptop, and desktop while
preserving intentional timeline horizontal scrolling.

### Implementation direction

- Use a tablet mode at 768px with Preview plus navigation tabs for Timeline,
  Transcript/Review, AI, Assets, and Inspector; do not squeeze the desktop
  sidebar and all tool rows into the viewport.
- Use a managed mobile Sheet at 390px/360px with focus trap, backdrop semantics,
  Escape, focus return, close label, and a sticky/reachable primary action.
- Keep timeline content horizontally scrollable by design, but eliminate
  accidental header/action overflow and document every intentional scroll
  container.
- Normalize buttons, badges, banners, inputs, modal surfaces, and spacing to
  existing product tokens and Tailwind/Radix components. Keep dense timeline
  geometry local where required.
- Ensure primary controls meet approximately 44px touch targets and have
  visible focus rings. Add `prefers-reduced-motion` behavior for sheet/dialog
  transitions, status spinners, and preview animations.
- Adopt Thai-first copy for editor states with short safe English fallback.
  Never surface raw exception/provider/URL text as the only explanation.

### Tests before implementation

- Responsive DOM/layout tests for breakpoint mode selection and primary action
  visibility.
- Accessible name and focus-visible checks for all icon-only controls.
- Copy tests for Thai and fallback language paths; no raw provider error.
- Reduced-motion class/media behavior for transitions and progress indicators.
- Intentional timeline scrolling is preserved while header/body accidental
  overflow is rejected.

### Acceptance

Mobile and tablet users can reach the primary edit/save/submit/review action,
open and close panels without losing focus, and read every state without
horizontal clipping or overlapping controls.

## 11. Section 06 — Integration verification and release rollout

### Objective

Prove the user-visible state machine against the current code and target runtime.

### Implementation direction

- Add a Phase3 route harness with mocked tRPC/project/job fixtures for loading,
  loaded, empty, error, dirty, saving, conflict, capability-blocked,
  waiting-agent, degraded, QC-blocked, completed, and canceled states.
- Add keyboard/a11y assertions for editor toolbar, sidebar tabs, dialogs,
  project list, mobile Sheet, timeline selection, and job actions.
- Add authenticated Playwright route coverage for `/video-editor` and
  `/worker-jobs` with stable fixtures, console capture, screenshots, and
  viewport-specific overflow checks.
- Capture required viewports: mobile 390x844, tablet 768x1024, desktop
  1440x900. Because this is a dense multi-panel editor also capture 360x800,
  1024x768, and 1280x800.
- Record evidence in
  `specs/feature/202-ai_rough_cut_video_editor_unified/implementation/ui-browser-evidence.md`
  using the repository's UI browser verification format. Skipped browser,
  Windows, deployment, or production checks remain explicit residual risks.
- Roll out behind existing feature/runtime gates only if needed. Preserve a
  rollback path to the prior Phase3 shell and legacy query route while state
  migrations are not involved.

### Tests before implementation

- Full focused videoeditor Vitest selection under jsdom.
- Existing Worker handoff, Preview, Timeline, Smart Camera, Export, and Render
  Jobs suites remain green.
- Playwright screenshots and keyboard/a11y checks pass at all required viewports.
- `git diff --check` on owned paths; targeted import/build checks as available.
- Do not run repository-wide typecheck unless explicitly requested.

### Acceptance

No UI completion claim is made until all relevant state, viewport, keyboard,
focus, console, overflow, and copy checks are either passed or explicitly
recorded as skipped with a release owner and reason.

## 12. UI/UX contract

### Target User / JTBD

- Role: creator/editor working in SmartAIHub Web Editor.
- Goal: edit a timeline, use AI selectively, save safely, submit heavy work,
  understand runtime state, review output, and recover from conflicts/errors.
- Entry point: `/video-editor`, optionally opened from a Library item/project;
  job detail entry point `/worker-jobs`.
- Success: the user can complete the next intended action without guessing
  state ownership or losing work.

### Existing Pattern Reference

- Search: targeted `rg` over `apps/web/client/src/components`, `pages`, and
  `features` for Dialog, Sheet, Tabs, conflict, QC, focus-visible, and status.
- Found: shared Radix primitives, WorkerWebEditor, VideoStudioWorkspacePage,
  ProductionWorkspace, MarketplaceDraftQualityQcPanel, RoomWorkflowPanel,
  RenderJobsPage.
- Decision: reuse. Divergence is allowed only for timeline-specific dense
  geometry or editor-specific review payloads.

### Surface Inventory

| Surface | Route/file | Change |
|---|---|---|
| Editor shell | `/video-editor`, `VideoEditorPhase3.tsx` | State/header/sidebar/responsive/accessibility |
| Project list | Phase3 project modal | Dialog semantics, keyboard rows, loading/error/empty |
| Save/conflict | Phase3 + project adapter | Revision/sync/conflict/recovery |
| Worker handoff | Phase3 Worker panel | Admission/status/reason/retry |
| Job list/detail | `/worker-jobs`, `RenderJobsPage.tsx` | Capability/QC/runtime projections |
| AI review | New editor review surfaces | Scope/change-set/evidence/before-after |
| QC/render | Review/status surfaces | Severity/blocking/artifact state |

### State matrix

| State | Expected UI |
|---|---|
| loading | Skeleton/spinner with region label and no false empty state |
| empty | Explanation plus one safe primary action |
| error | Safe Thai error, retry, preserved local data where relevant |
| saving/autosaving | Visible progress/state without blocking editing unnecessarily |
| conflict | Base/current revision, preserved local draft, explicit actions |
| waiting-agent | Reason, eligible capability, retry/cancel/inspect |
| capability-blocked | Blocking reason and route/guidance, never completed |
| degraded | Warning and limitations, no approval implication |
| review | Selected changes, evidence, confidence, locks, keyboard actions |
| QC blocking | Blocking reason, allowed override policy, render disabled |
| success | Revision/job/artifact identity and next action |
| focus/disabled/selected | Visible ring, semantic selected/pressed, pending disabled state |

### Responsive matrix

| Viewport | Expected behavior |
|---|---|
| mobile 390x844 | Managed bottom Sheet, focus trapped, no accidental header overflow, primary action reachable |
| tablet 768x1024 | Preview plus navigation tabs; avoid desktop three-column squeeze |
| desktop 1440x900 | Preview/timeline/sidebar composition with intentional timeline scroll only |
| small-mobile 360x800 | Same as mobile with compressed copy and no clipped primary actions |
| laptop 1024x768 | Multi-panel density remains readable; status/actions remain visible |
| wide-desktop 1280x800 | Job/review details do not overlap timeline or sidebar |

### Accessibility acceptance

- Keyboard path covers open editor, navigate tabs, select timeline item, open
  project/job/review dialog, resolve/cancel, close with Escape, and restore focus.
- All dialogs have title/description, `aria-modal`, labelled close action, and
  focus containment/return.
- Tabs, buttons, sliders, timeline clips, status/alert/live regions have
  semantic roles and accessible names; state is not color-only.
- Focus-visible rings and contrast are readable in dark surfaces.
- Reduced-motion preference disables or minimizes nonessential transitions and
  repeated spinner motion.

### Visual direction

Dense professional editor: clear primary action hierarchy, stable dark canvas,
calm status colors paired with text/icon, restrained motion, existing product
tokens, and no new competing visual language.

### Copy contract

- Primary language: Thai for state/action/error copy; retain familiar technical
  identifiers such as revision ID, job ID, and capability name where useful.
- English fallback: short, equivalent, safe, and localized through existing
  product conventions.
- Errors: explain what happened, whether work is safe, and the next action;
  never use raw exception text as the only copy.
- Queue wording: say “ส่งคำขอแล้ว / รอ Worker / ความสามารถไม่พร้อม” rather
  than implying completion.

### Browser evidence required

Follow `skills/orchestra/references/ui-browser-verification.md`. Required
evidence includes current authenticated screenshots/trace notes at all required
viewports, keyboard/focus/a11y checks, no unexpected console errors, no
accidental overflow, and all async/conflict/capability/QC state fixtures.

## 13. Risks and mitigations

| Risk | Mitigation |
|---|---|
| Phase3 monolith creates merge conflicts | Extract primitives first; assign ownership by new files; make shell edits small |
| UI invents runtime truth | Centralize projections from server status/reason/revision/artifact fields |
| Conflict action loses local work | Keep session snapshot and require explicit destructive confirmation |
| Responsive changes break timeline editing | Preserve timeline scroll contract and test desktop/mobile separately |
| Dialog migration changes behavior | Add focused keyboard/focus tests before replacing each overlay |
| Scope expands into unfinished AI product | Implement review shell against existing contracts; mark unavailable capabilities explicitly |
| Browser proof unavailable | Record skipped gates with owner; do not mark release complete |

## 14. Recommended execution order

1. Implement Section 01 and its tests.
2. Implement Section 02 revision/conflict behavior and tests.
3. Implement Section 03 job/capability projection and tests.
4. Implement Section 04 review/transcript/change-set/QC surfaces and tests.
5. Implement Section 05 responsive/visual/copy/motion refinements after stable
   state contracts.
6. Implement Section 06 browser evidence, review findings, and release gate.
7. Run a final cross-spec audit against Spec 202/203 and update completion docs
   only with evidence-backed claims.
