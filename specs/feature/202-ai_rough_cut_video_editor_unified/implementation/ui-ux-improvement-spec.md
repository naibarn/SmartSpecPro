# Spec 202/203 Web Video Editor UI/UX Improvement Plan Input

## Objective

Bring the active `/video-editor` Web Editor and its Worker/job handoff to the
highest practical level of UI/UX completeness against Spec 202 and Spec 203,
without forking the canonical project/revision or worker control-plane
contracts.

## Authority and scope

- Product and flexible-editor UX authority: `specs/feature/202-ai_rough_cut_video_editor_unified/spec.md`.
- Shared runtime, revision, execution, capability, artifact/QC, and security
  authority: `specs/feature/203-ai-editor-director-spec-shared-runtime/spec.md`.
- Active route: `apps/web/client/src/pages/VideoEditorPage.tsx` and
  `apps/web/client/src/components/videoeditor/VideoEditorPhase3.tsx`.
- Related flow: `apps/web/client/src/pages/RenderJobsPage.tsx`.
- Legacy `/video-editor?legacy=1` remains a rollback surface and is not the
  target for a second canonical UI.

## Current gaps to close

1. Save/autosave exposes generic errors instead of revision, sync, external
   update, and conflict/merge states.
2. Worker handoff redirects to a generic queue without editor-aware
   waiting-agent, capability-blocked, degraded, QC, retry, or review guidance.
3. Custom editor dialogs and the mobile sidebar lack consistent dialog/sheet
   semantics, focus trapping/restoration, Escape behavior, and accessible names.
4. Active sidebar tabs, project title, project list rows, and resize affordance
   need keyboard and semantic interaction coverage.
5. Transcript/change-set before/after review, evidence/confidence inspection,
   and QC severity/blocking surfaces are not yet exposed as a coherent editor
   workflow even though runtime contracts exist.
6. Tablet/mobile layout, touch targets, copy/localization, visual tokens, and
   reduced-motion behavior are inconsistent across Phase3, dialogs, and the
   Worker Jobs page.
7. Current authenticated browser evidence is missing; historical June 2026
   evidence is stale and cannot close the current release gate.

## Ordered delivery waves

### Wave 01 — UI state and accessibility foundation

Create reusable editor-facing primitives for accessible Dialog, AlertDialog,
Sheet/mobile panel, Tabs, status banner, focus return, keyboard dismissal,
live-region announcements, and safe localized error mapping. Reuse the existing
Radix primitives under `apps/web/client/src/components/ui/` and existing
focus-visible patterns in `WorkerWebEditor`.

### Wave 02 — Project revision, sync, and conflict UX

Expose current revision, saved/autosaved/saving state, external update, stale
revision, offline/retry, and explicit conflict resolution. Preserve the local
draft while showing base/current revisions and actions for reload, keep mine,
keep current, merge when safe, and duplicate variant. Restore focus after every
resolution.

### Wave 03 — Execution and capability/job visibility

Add an editor-aware execution status model and projection for admitted,
waiting-agent, capability-blocked, claimed, running, retrying, degraded,
rendering, uploading, QC, completed, failed, canceled, expired, and stale.
Show reason, assigned agent/runtime, pinned render revision, retry/cancel/review
actions, and deep-link back to the editor. Do not label queue admission as
completion or Windows parity.

### Wave 04 — AI review, transcript, change-set, and QC UX

Expose the existing 202/203 contracts through a review-first UI: scope picker,
transcript/anchor view, Suggest/Draft/Apply separation, change-set list,
before/after or A/B preview, evidence/confidence details, apply selected,
reject, revert, regenerate, warning severity, and QC blocking/override states.
Keep manual locks and protected operations visible.

### Wave 05 — Responsive and visual consistency

Refactor the active editor incrementally toward existing tokens and Radix/
Tailwind patterns. Implement dedicated tablet tabs, mobile bottom-sheet
behavior with focus management, 44px touch targets, overflow strategy, Thai-first
copy with safe English fallback, readable dark surfaces, and reduced-motion
support. Do not rewrite the legacy rollback surface unless a shared primitive
requires a compatibility adapter.

### Wave 06 — Verification, rollout, and release gate

Add Phase3 integration tests for state transitions and keyboard paths, then run
authenticated browser evidence at mobile 390x844, tablet 768x1024, desktop
1440x900, plus small-mobile 360x800, laptop 1024x768, and wide-desktop 1280x800.
Capture loading/empty/error/conflict/capability/QC/modal states, accessibility,
overflow, console, reduced-motion, and focus evidence before declaring UI DoD.

## Constraints and non-goals

- Do not create a second project store, editor runtime, workflow engine,
  OpenSandbox/Docker path, or retired `/workpacks` integration.
- Do not weaken server revision/CAS, tenant, capability, artifact, or snapshot
  gates to make UI states appear complete.
- Preserve unrelated dirty-worktree changes.
- Do not run the repository-wide TypeScript typecheck unless explicitly asked;
  use focused tests and targeted compilation/import checks.
- Browser evidence is a required gate; skipped browser checks are not passes.

## Definition of done

- Every required 202/203 UI state has a named component state, safe copy,
  keyboard path, and focused test.
- `/video-editor` visibly exposes revision/sync/conflict/render-source/job
  state and never implies unsupported capability parity.
- Modal, sheet, tab, timeline, project, and job flows pass keyboard and
  accessible-name checks.
- Mobile/tablet/desktop evidence shows no unintended overflow or unreachable
  primary action.
- Browser evidence, focused tests, and residual limitations are recorded in a
  UI browser evidence artifact and release review.
