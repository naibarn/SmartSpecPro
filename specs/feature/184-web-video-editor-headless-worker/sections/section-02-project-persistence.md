# Section 02 — Project persistence, revisions, and concurrency

## Scope and dependencies

Build on Section 01's canonical project document and reuse `video_editor_projects`. This section owns the schema migration and server revision semantics; asset ingest and job admission must wait for its IDs and CAS behavior.

## Tests first

- Add migration/schema tests for `video_editor_project_revisions`, `video_editor_project_assets`, and `video_editor_project_jobs`, indexes, foreign keys, and compatibility with current columns.
- Extend `apps/web/server/routers/__tests__/videoEditorProjects.test.ts` (or the closest existing suite) for tenant/owner checks, expected-revision CAS, duplicate mutation IDs, restore, archive/delete active-job guard, and legacy list/get/save/autoSave/rename behavior.
- Add service tests for two-tab conflict, stale response ordering, offline draft rebase, revision pinning, and project-job links.

## Implementation

Add a numbered Drizzle migration and matching definitions in `apps/web/drizzle/schema.ts`. The migration is the single writer and must record the exact columns/indexes before any deploy. Keep current `projectData` readable. Add a focused service next to `apps/web/server/routers/videoEditorProjects.ts` that:

1. validates tenant/user ownership and schema version;
2. applies mutations transactionally with expected revision and client mutation ID;
3. returns the existing revision on an idempotent same-payload retry and a typed conflict on a different payload;
4. writes immutable snapshots and provenance, and creates a new revision on restore;
5. pins a revision and plan hash through `video_editor_project_jobs`.

Update client project manager/hooks under `apps/web/client/src/components/videoeditor/` so autosave serializes writes, ignores stale responses, and scopes IndexedDB recovery to tenant/user/project. No last-write-wins overwrite is allowed.

## Acceptance and evidence

Capture migration dry-run output, focused router/service tests, and the legacy regression result. This section supplies AC-03, AC-04, AC-06, AC-14, AC-16, and the persistence half of AC-17.

## Safety and rollback

No drop or destructive backfill. Archive instead of delete while active jobs exist. If migration cannot run, leave current table/router behavior intact and keep the feature flag off.

## Implementation status

Implemented additive Drizzle definitions and manual migration `apps/web/drizzle/0288_feature_184_video_editor_revisions.sql`, plus pure CAS/idempotency helper `apps/web/server/services/videoEditorRevisionService.ts` and tests. Existing router mutation wiring and database dry-run require an environment-backed follow-up before production rollout.

## UI/UX Contract
### Target User / JTBD
Creator needs safe save, reload, restore, and conflict recovery.
### Surface Inventory
Project manager, autosave indicator, conflict dialog, restore action.
### Component Map
Project hooks own state; server router owns CAS; dialogs render recovery.
### State Matrix
Loading, saved, saving, conflict, offline, restored, archived, and unauthorized.
### Responsive Matrix
Save/conflict controls work on laptop/tablet; mobile shows recovery/status.
### Accessibility Acceptance
Revision and conflict status are announced and actions are keyboard accessible.
### Copy Contract
Thai clear conflict copy with revision numbers and English fallback.
### Browser Evidence Required
jsdom two-tab/conflict test and Playwright reload/restore evidence.
