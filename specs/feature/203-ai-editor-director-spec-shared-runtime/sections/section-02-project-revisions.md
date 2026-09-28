# Section 02 — Project revisions, CAS, and migration

## Objective

Make Feature 184's immutable revision table authoritative for the active Web
Editor while retaining legacy project conversion and preventing cross-domain
joins with Video Studio `video_projects`.

## Files and ownership

- Add `apps/web/server/services/videoEditorProjectRevisionService.ts`.
- Add focused service tests.
- Update `apps/web/server/routers/videoEditorProjects.ts` only through the
  service boundary.
- Update schema/migrations only if the existing Feature 184 columns/indexes are
  insufficient; do not alter `video_projects` semantics.

## Behavior

- All reads/writes derive tenant and user from server auth.
- Create/append revision stores canonical document, hash, parent revision,
  clientMutationId, and revision metadata.
- Expected revision/hash mismatch returns typed conflict and current summary;
  it never overwrites.
- Duplicate mutation returns the original revision idempotently.
- Legacy conversion preserves unknown fields and reports unresolved mappings.
- Project IDs are mapped explicitly; serial IDs from separate domains are never
  coerced into one another.

## TDD and acceptance

Test first save, CAS success/conflict, duplicate mutation, tenant/user access,
legacy conversion, malformed canonical documents, and rollback on transaction
failure. The active router's save/autosave no longer writes the old JSON record
as the authoritative revision after this section.

## UI/UX Contract

### Target User / JTBD
Editor needs to save without losing local work and understand stale revision
conflicts.

### Surface Inventory
Web Editor save/autosave indicators and conflict/merge dialog.

### Component Map
Router/service owns truth; Phase 3 owns state display; conflict dialog owns
reload/merge actions.

### State Matrix
Loading, saving, saved, conflict, merge available, reload required, failed,
offline retry, keyboard focus.

### Responsive Matrix
Mobile stacked conflict actions; tablet/laptop inline status; desktop full
revision details.

### Accessibility Acceptance
Focus moves to conflict dialog, actions have semantic labels, live save status,
and no conflict meaning relies on color.

### Copy Contract
Thai-first copy names the current revision and preserves local edits; English
fallback uses the same conflict semantics.

### Browser Evidence Required
Authenticated save and stale-conflict flow showing local edits survive.
