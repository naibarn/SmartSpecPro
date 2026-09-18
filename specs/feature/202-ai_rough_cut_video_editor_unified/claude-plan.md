# Spec 202 Deep Implementation Plan

## Scope

Spec 202 is the product/UX layer on top of Spec 203's shared runtime. This
plan implements the active Web Editor integration and user-visible Rough Cut
workflow while consuming the runtime contracts rather than adding a second
timeline or queue. Product algorithms without current executors are represented
as typed suggestions/capability-blocked modules and are not faked.

## Section 01 — Web project adapter and legacy migration

### Ownership

- `apps/web/server/routers/videoEditorProjects.ts`
- `apps/web/client/src/pages/VideoEditorPage.tsx`
- `apps/web/client/src/components/videoeditor/VideoEditorPhase3.tsx`
- shared migration helper/tests

### Requirements

- Load current server revision and snapshot metadata on project open.
- Save/autosave through server CAS with client mutation idempotency; preserve
  local edits on conflict and expose reload/merge choice.
- Convert legacy project data through the canonical adapter, preserving unknown
  fields and reporting unresolved assets/markers.
- Keep `?legacy=1` as an explicit rollback/read-convert surface, never a bypass.
- Keep `video_projects` separate from active Web Editor projects.

## Section 02 — Operation bridge, Full Scan, and truthful status

### Ownership

- `VideoEditorPhase3.tsx` operation dispatch/status hooks
- `editorMediaJobs` client/server adapters
- Full Scan/review components and tests

### Requirements

- Submit operation with server revision/snapshot reference, idempotency, and
  managed asset refs; direct browser project transport is compatibility-only.
- Use the dedicated Node composition adapter until Worker parity exists.
- Render status uses canonical machine states `queued`, `waiting_agent`,
  `capability_blocked`, `running`, `degraded`, `completed`, and `failed`, with
  Web labels “waiting-agent” and “capability-blocked”, not just a spinner.
- Degraded composition evidence requires review and cannot be promoted by the
  UI; promotion response must be server-authoritative.
- Cancel/retry must recheck revision and job terminal state.

## Section 03 — Timeline, EDL, change sets, undo/redo, and protected ranges

### Ownership

- existing canonical NLE conversion/timeline modules
- `apps/web/client/src/components/videoeditor/`
- new change-set service/tests where current state lacks a server boundary

### Requirements

- Map product EDL to Spec 203 EditorialIntentPlan/ExecutableEditPlan/canonical
  timeline operations.
- Apply non-destructive change sets with revision precondition, deterministic
  operation IDs, undo/redo, protected ranges, and unsupported metadata
  preservation.
- Keep transcript/timeline sync in canonical time domains and prevent stale
  analysis from applying after edits.
- Validate linked A/V, gap/ripple semantics, clip bounds, and no accidental
  media deletion.

## Section 04 — AI tool panel, command bar, transcript, and suggestions UX

### Ownership

- `apps/web/client/src/components/videoeditor/`
- `AiMediaStudioPanel.tsx`, `AiMusicPanel.tsx`, `SmartCameraPanel.tsx`,
  `VideoDraftAIPanel.tsx`, `SubtitleEditorPanel.tsx`, timeline/inspector
  components, and their existing tests
- focused component tests

### Requirements

- Suggest/Draft/Apply modes are explicit; Apply always shows change-set review.
- Module settings show capability, confidence, cost, stale evidence, and
  protected-range constraints before queueing.
- Transcript editor and timeline remain synchronized using canonical anchors.
- Suggestions inbox supports accept/reject/defer and records audit metadata.
- Missing AI capability is visible and actionable, not silently disabled.

## Section 05 — Preview, render, QC, and artifact UX

### Ownership

- `apps/web/client/src/components/videoeditor/`
- render panel/handoff components and existing artifact helpers
- component/integration tests

### Requirements

- Preview and final render use the same canonical source/revision/plan hash.
- Show progress stages and cancellation; stale render results cannot attach to
  a newer revision.
- Display QC warnings/errors and only show final artifact after server commit.
- Preserve non-destructive edit history and provide restore/rollback controls.

## Section 06 — Product acceptance and release integration

### Requirements

- Add end-to-end tests for open/save/conflict, Full Scan degraded/blocked/
  waiting-agent, review/apply, undo/redo, render, artifact, and legacy route.
- Add browser evidence requirements to implementation completion docs.
- Record current unsupported modules and their capability/release gates.
- Verify Thai/English copy, keyboard access, responsive state matrix, and
  reduced motion.

## UI/UX contract

Target user: editor creating a Rough Cut while retaining human control.

Route/surfaces: `/video-editor` Phase 3, legacy rollback route, AI tools panel,
transcript/timeline, inspector, suggestions inbox, render/QC panel.

State matrix: loading/opening, empty project, no transcript, analysis queued,
waiting-agent, capability-blocked, degraded/review-required, stale conflict,
draft, apply confirmation, applying, canceled, failed, completed, focus,
selected, protected/disabled.

Responsive matrix: mobile review/status-first; tablet timeline plus inspector;
laptop editor plus AI panel; desktop full multi-panel workspace.

Accessibility: keyboard timeline/transport, focus restoration after dialogs,
semantic labels, live progress, warnings not conveyed by color alone, contrast,
reduced-motion and screen-reader-friendly change-set summaries.

Copy contract: Thai-first concise labels with English fallback; never call a
queued or degraded result “เสร็จสมบูรณ์”. Show actionable capability/revision
conflict reasons and preserve user edits in error states.

Browser evidence: authenticated clean save, stale conflict, analysis status
states, degraded review, apply/reject, undo/redo, render/QC, final artifact,
and legacy rollback conversion.

## Dependency order

Spec 203 sections 01–04 are prerequisites for 202 sections 01–02; 202 section
03 depends on shared contracts and revisions; sections 04–05 depend on all
runtime/status/change-set contracts; section 06 is final integration.
