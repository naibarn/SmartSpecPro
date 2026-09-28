# Section 01 — Web project adapter and legacy migration

## Objective

Wire the active Phase 3 Web Editor to server-authoritative revisions while
preserving legacy project opening through an explicit versioned adapter.

## Files and ownership

- `apps/web/server/routers/videoEditorProjects.ts`
- `apps/web/client/src/pages/VideoEditorPage.tsx`
- `apps/web/client/src/components/videoeditor/VideoEditorPhase3.tsx`
- shared migration/revision tests and any section-203 revision service

## Behavior

- Open loads current revision/snapshot metadata; browser state is a cache.
- Save/autosave sends expected revision and client mutation id; stale writes
  preserve local edits and expose reload/merge, never overwrite.
- Legacy route `?legacy=1` uses versioned read/convert and writes through the
  same CAS boundary. Unknown fields and unresolved assets remain visible.
- Active Web Editor `video_editor_projects` and Video Studio `video_projects`
  remain separate domains with explicit IDs.

## TDD and acceptance

Test first load, save, autosave, stale conflict, duplicate mutation, tenant
isolation, legacy conversion, rollback route, and domain separation. Browser
evidence must show local edits survive a conflict.

## UI/UX Contract

States: opening, empty, loaded, saving, saved, conflict, merge/reload,
offline/error, legacy conversion, and focus. Responsive layout keeps conflict
actions reachable on mobile/tablet. Keyboard focus returns to the editor after
the conflict dialog; Thai-first copy explains which revision won.

### Target User / JTBD
Editor needs to save and reopen work without losing local edits.

### Surface Inventory
Phase 3 project loader, save/autosave indicator, conflict dialog, legacy route.

### Component Map
Revision router/service owns truth; Phase 3 owns state; conflict dialog owns
reload/merge actions.

### State Matrix
Opening, empty, loaded, saving, saved, conflict, merge/reload, error, legacy.

### Responsive Matrix
Mobile stacked actions; tablet/laptop inline status; desktop revision details.

### Accessibility Acceptance
Focus restoration, semantic labels, live save status, keyboard conflict action.

### Copy Contract
Thai-first current/local revision copy with English fallback; never discard edits.

### Browser Evidence Required
Authenticated open/save/stale-conflict/legacy evidence.
