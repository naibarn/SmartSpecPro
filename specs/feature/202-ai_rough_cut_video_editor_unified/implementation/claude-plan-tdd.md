# TDD Plan — Spec 202/203 Web Video Editor UI/UX Improvement

Tests are written before implementation in each section. Use existing Vitest,
Testing Library, and Playwright conventions. These are test stubs and acceptance
intent, not test implementations.

## Section 01 — UI foundation, state model, and accessibility primitives

- State mapper returns safe Thai/fallback copy for save, conflict, offline,
  capability-blocked, waiting-agent, degraded, QC, and unknown states.
- Dialog has accessible name/description, focus containment, initial focus,
  Escape close, labelled close control, and focus restoration.
- AlertDialog does not close destructive actions on an accidental backdrop click.
- Mobile Sheet opens from the trigger, traps focus, closes on Escape/backdrop,
  and restores focus to the trigger.
- Semantic Tabs expose selected tab/panel association and keyboard navigation.
- Live region announces a blocking error once and does not repeat every polling
  tick.

## Section 02 — Project revision, sync, autosave, and conflict UX

- Save success updates revision ID/number, last-saved time, and dirty state.
- Autosave success updates revision without stealing focus or blocking editing.
- Autosave failure shows a visible retryable state while preserving the draft.
- `CONFLICT` preserves local project data and opens conflict UI with base/current
  revision details.
- Reload latest requires explicit user action and clears local edits only after
  confirmation.
- Safe retry/keep-mine path uses a fresh mutation key and correct expected
  revision; unsupported merge is not presented as available.
- Save-as-variant creates an independent project path without overwriting the
  conflicting revision.
- Beforeunload/session recovery and conflict resolution do not lose focus or
  local recovery data.

## Section 03 — Execution admission, capability, and job visibility

- Every known server job status/reason maps to the expected Thai/fallback label,
  badge semantics, icon, and action set.
- `waiting-agent` and `capability-blocked` remain distinct in editor and job
  detail surfaces.
- Capability-blocked never renders a completed/approved state.
- Degraded output displays limitations and cannot enable an approval/render
  action that requires promotable evidence.
- Pinned revision, snapshot/job identity, runtime, and agent remain visible
  after the project changes.
- Cancel/retry buttons reflect permission, pending, success, and race/error
  outcomes without duplicate actions.
- Mobile job card keeps reason and primary action accessible without horizontal
  clipping.

## Section 04 — AI scope, transcript, change-set review, and QC

- Scope picker stores the selected scope and applies bounded defaults for a
  selection-triggered operation.
- Analyze, Suggest/Draft, Preview, Apply, and Render states cannot collapse into
  an unreviewed implicit apply.
- Transcript/source anchors show loading, empty/unavailable, stale, ready, and
  error states with a retry path.
- Change-set review lists protected/skipped/manual-locked operations and supports
  selected apply/reject/revert/regenerate actions.
- Stale change-set application is blocked and offers reload/recompute guidance.
- Before/after or A/B selection is keyboard reachable and announces the active
  side.
- Evidence/confidence missing, stale, invalid, and blocked states are explicit.
- QC INFO/REVIEW/WARNING/BLOCKING states render correct actions; blocking QC
  prevents final render unless an allowed server override exists.

## Section 05 — Responsive, visual, copy, and motion consistency

- Breakpoint mode switches are correct at 360, 390, 768, 1024, 1280, and 1440
  widths without hiding the primary action.
- Mobile Sheet focus/close behavior works at 390x844 and 360x800.
- Tablet uses the intended tab navigation rather than inaccessible squeezed
  desktop panels.
- Intentional timeline horizontal scrolling remains available; accidental
  header/action overflow is rejected.
- Icon-only controls have accessible names, visible focus rings, and sufficient
  touch target size.
- Thai copy and English fallback are equivalent; raw error/provider text is not
  rendered as the sole user message.
- Reduced-motion preference suppresses nonessential dialog/sheet transitions
  and excessive spinner animation.

## Section 06 — Integration verification and release rollout

- Phase3 route harness covers loading, loaded, empty, error, dirty, saving,
  conflict, waiting-agent, capability-blocked, degraded, QC-blocked,
  completed, failed, and canceled fixtures.
- Keyboard path covers project open, tab navigation, timeline selection, dialog
  actions, Escape, and focus return.
- `/video-editor` and `/worker-jobs` authenticated Playwright flows capture
  screenshots/traces at required and extended viewports.
- Browser assertions cover console errors, overflow, accessible names,
  focus-visible state, loading/empty/error, disabled actions, and reduced motion.
- Existing focused editor tests remain green after each wave.
- UI browser evidence artifact records pass/fail/skipped status and residual
  risks before release documentation is updated.
