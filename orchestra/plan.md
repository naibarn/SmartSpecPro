# Orchestra Plan

## Task
Add Presentation Editor version history and restore capability using the same shared versioning system as Document Management.

## Classification
- scope: medium
- risk: medium
- affected_domains: ["CMD-2 Backend", "CMD-1 Frontend"]
- estimated_file_count: 6
- chosen_route: multi-agent-waves
- task_summary: Persist presentation save snapshots to shared library content versions, expose list/restore APIs for Presentation Editor, and add UI to browse and restore versions.
- bug_route: false

## Wave Plan

### Wave 1 — Backend contract + service
- Add presentation version snapshot model/parser in service layer using `library_content_versions`.
- Capture snapshots on manual presentation saves (shared version system, no new table).
- Add tRPC procedures for listing presentation versions and restoring from version.
- Add/adjust backend tests for version listing and restore.

### Wave 2 — Frontend integration
- Add Presentation Editor UI section for version history.
- Fetch versions from new presentation endpoint.
- Restore selected version and refresh deck/editor state.
- Add/adjust editor tests for version history rendering and restore action.

### Wave 3 — Validation
- Run targeted test suite for Presentation Editor and presentation router/service changes.
- Resolve failures and finalize progress artifacts.

### Wave 4 — Restore UX hardening (follow-up)
- Group saved versions by slide inside Presentation Editor.
- Add diff preview panel for selected version before restore.
- Add explicit restore confirmation dialog to prevent accidental rollback.

## Integration Result
- waves_completed: 3
- files_changed:
  - /home/dev/projects/SmartSpecPro/apps/web/server/services/presentationService.ts
  - /home/dev/projects/SmartSpecPro/apps/web/server/routers/presentation.ts
  - /home/dev/projects/SmartSpecPro/apps/web/server/routers/presentation.test.ts
  - /home/dev/projects/SmartSpecPro/apps/web/client/src/pages/PresentationEditor.tsx
  - /home/dev/projects/SmartSpecPro/apps/web/client/src/pages/PresentationEditor.test.tsx
- quality_gates:
  - `npm test -- server/routers/presentation.test.ts client/src/pages/PresentationEditor.test.tsx` => passed
  - `npm test -- server/services/presentationService.test.ts` => passed
  - `cd apps/web && npm test -- client/src/pages/PresentationEditor.test.tsx` => passed (42 tests, includes grouped preview + confirm restore coverage)
  - `npm run check` => failed (pre-existing repo-wide TypeScript issues outside this change set)
- security_gate_required: true (new tRPC procedures added)
- security_gate: not executed in this run (warning)
