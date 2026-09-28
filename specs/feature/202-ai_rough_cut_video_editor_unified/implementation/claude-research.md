# Research Findings — Spec 202/203 Web Video Editor UI/UX Improvement

## Research decision

- Codebase research: yes — this is an existing SmartSpecPro git repository with
  an active Web Video Editor, Worker Jobs page, shared UI primitives, and
  Vitest/Playwright coverage.
- Web research: none — the requested outcome is codebase-specific and the
  current gap is implementation alignment, not a new external API or unstable
  platform decision.
- Testing research: Vitest with jsdom is the existing focused component/page
  test path; Playwright route evidence is the required browser proof for
  responsive, keyboard, accessibility, and async workflow states.

## Discovery boundary

SocratiCode was unavailable in the configured tool set. The fallback was
targeted `rg`, line-range reads, existing tests, and existing browser evidence.
This is recorded as shell/source inspection, not a live code-index validation.

## Active route and ownership

- `apps/web/client/src/pages/VideoEditorPage.tsx` routes the normal
  `/video-editor` path to `VideoEditorPhase3` with `workerHandoff`; the
  `?legacy=1` query is an explicit rollback surface for `WorkerWebEditor`.
- `apps/web/client/src/components/videoeditor/VideoEditorPhase3.tsx` owns the
  active editor shell, project state, save/autosave, dialogs, sidebar,
  timeline/preview composition, and Worker submission. It is a large monolith,
  so the plan must extract reusable UI primitives incrementally and avoid a
  broad rewrite.
- `apps/web/client/src/pages/RenderJobsPage.tsx` owns generic queue listing,
  polling, filters, job detail, cancellation, events, and verified outputs. It
  currently projects common statuses but not the full Spec 203 capability and
  QC lifecycle.

## Existing patterns to reuse

| Need | Existing reference | Decision |
|---|---|---|
| Accessible modal/focus/Escape | `apps/web/client/src/components/ui/dialog.tsx`, `alert-dialog.tsx` | Reuse Radix primitives; replace editor-local custom overlays incrementally |
| Mobile panel/sheet | `apps/web/client/src/components/ui/sheet.tsx`, `drawer.tsx` | Reuse for mobile sidebar and preserve desktop sidebar semantics |
| Semantic tabs | `apps/web/client/src/components/ui/tabs.tsx` | Reuse for editor sidebar/tablet navigation |
| Focus-visible/touch controls | `apps/web/client/src/components/videoeditor/WorkerWebEditor.tsx` | Reuse interaction conventions for active Phase3 controls |
| Conflict state | `apps/web/client/src/pages/VideoStudioWorkspacePage.tsx`, `apps/web/client/src/features/media-production/components/ProductionWorkspace.tsx` | Reuse state vocabulary and banner/card structure; adapt copy to editor revisions |
| QC confirmation/severity | `apps/web/client/src/components/marketplaceCapture/MarketplaceDraftQualityQcPanel.tsx` | Reuse `AlertDialog` and severity-oriented review language |
| Evidence/review tabs | `apps/web/client/src/components/orchestrator/RoomWorkflowPanel.tsx` | Reuse Summary/Evidence/Raw separation for expert inspection |
| Job polling/detail | `apps/web/client/src/pages/RenderJobsPage.tsx` | Extend existing page/status model; do not create a second job viewer |

## Current implementation evidence

1. Save errors in Phase3 are converted to generic toast text; autosave errors
   are logged to console only. The existing server precondition data is not
   projected into a conflict UI.
2. Successful Worker submission sets a job ID, shows a queue toast, and
   navigates to `/worker-jobs`; the in-editor Worker panel exposes only counts,
   a submit button, and the job ID.
3. `RenderJobsPage` supports common queue statuses and detail/output events but
   lacks explicit `waiting-agent`, `capability-blocked`, degraded, QC, stale,
   and runtime/source locality projections.
4. Phase3 has custom inline dialogs and a custom mobile bottom sheet. The
   project list, confirm dialog, export dialog, render progress dialog, and
   keyboard overlay do not consistently provide dialog semantics, focus trap,
   focus restoration, or accessible close names.
5. Timeline and PreviewPlayer already provide useful ARIA roles/labels and
   keyboard behavior. These should be preserved while the shell is refactored.
6. Media Library, Smart Camera, and Render Jobs provide useful loading, empty,
   error, retry, progress, or degraded patterns that should be normalized into
   shared copy/status primitives.
7. No active Phase3 integration test covers the complete editor shell, conflict
   flow, mobile sidebar, modal focus, or capability lifecycle. Existing tests
   cover child components and handoff contracts.
8. Historical route evidence from June 2026 shows no body-level horizontal
   overflow at 390x844 but many intentionally scrollable interactive regions.
   It is stale and must not be treated as current release proof.

## Repository constraints

- Do not run repository-wide TypeScript typecheck because of the project RAM
  constraint unless explicitly requested.
- Preserve unrelated dirty worktree changes.
- Do not use or restore retired Agency/workpacks/workflow/OpenSandbox/Docker
  systems. Existing stale `/workpacks` links should be isolated as a cleanup
  item, not extended.
- Keep server-derived revision, tenant, capability, snapshot, artifact, and QC
  decisions authoritative; UI must project them, not infer or override them.

## Testing conventions

- Focused UI tests: `npm exec -- vitest run --environment jsdom <paths>` from
  `apps/web`.
- Use Testing Library role/name assertions for dialogs, tabs, buttons, alerts,
  status regions, and focus behavior.
- Use existing Playwright route/evidence infrastructure for authenticated
  browser captures. Required viewports are 390x844, 768x1024, and 1440x900;
  dense/multi-panel surfaces add 360x800, 1024x768, and 1280x800.
- Do not claim browser, deployment, Windows Worker, provider, or production
  proof from unit tests.
