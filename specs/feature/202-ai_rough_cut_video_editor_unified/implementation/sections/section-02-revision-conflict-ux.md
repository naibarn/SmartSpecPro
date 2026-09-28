# Section 02 — Project revision, sync, autosave, and conflict UX

## Goal

Make project persistence visible and safe. A stale save must preserve local work
and lead to an explicit resolution path rather than a generic toast.

## Ownership paths

- Add: `apps/web/client/src/components/videoeditor/ProjectConflictPanel.tsx`
- Add: `apps/web/client/src/components/videoeditor/ui/projectRevisionUi.ts`
- Modify: `VideoEditorPhase3.tsx`
- Potentially modify: `apps/web/server/routers/videoEditorProjects.ts` only if
  safe conflict metadata is not transported by the existing tRPC error
- Tests: Phase3/project router focused suites

## Design

Use the existing `videoEditorProjects.save` and `autoSave` expected revision and
expected revision ID fields. Keep `projectRevisionRef` as the client cursor,
but project a separate UI state containing current revision, save phase, last
saved time, external update, and conflict information.

On `CONFLICT`, retain the in-memory project and sessionStorage recovery snapshot,
fetch the latest server project/revision, and open a conflict panel. The panel
must show base revision versus current revision and explain that local edits are
preserved. Reload latest is destructive to local edits and requires explicit
confirmation. Save-as-variant creates an independent project through the
existing project-save path. A merge/keep-mine action is shown only when the
server contract says it is safe; otherwise it is disabled with a reason.

If the current tRPC error does not carry safe current revision metadata, extend
the server error data or perform a read-only latest fetch. Do not expose raw
error causes and do not implement a client-side authoritative merge.

Add header status for revision, saving/autosaving/saved/unsaved/offline,
external update, and active render revision. All state changes use the shared
status/live-region primitives from Section 01.

## TDD checklist

- Save success updates revision, timestamp, and dirty state.
- Autosave success updates cursor without stealing focus.
- Autosave failure is visible and retryable while local data remains intact.
- Concurrent save displays base/current revision conflict and preserves local
  draft.
- Reload latest requires confirmation and resets the editor to fetched data.
- Save-as-variant cannot overwrite the conflicting project.
- Focus returns to the save trigger or a conflict action after resolution.
- Beforeunload/session recovery behavior remains intact.

## UI/UX Contract

### Target User / JTBD

- Role: creator editing a project across tabs or Web/Worker surfaces.
- Goal: save safely and recover from concurrent updates.
- Entry point: editor header Save/autosave status or project open flow.
- Success: no silent overwrite and no loss of local edits.

### Existing Pattern Reference

- Searched: `VideoStudioWorkspacePage.tsx` and `ProductionWorkspace.tsx`.
- Found: conflict banners/cards with reload and save-as-new-version actions.
- Decision: reuse vocabulary/layout, diverge only to show editor revision IDs and
  preserve a local timeline snapshot.

### Surface Inventory

| Surface | File | Change |
|---|---|---|
| Header save state | Phase3 | Revision/sync/autosave indicators |
| Conflict panel | New component | Base/current revision and actions |
| Project list/open | Phase3 | Loading/error/empty/focus handling |
| Save adapter | New UI mapper | Safe server error projection |

## Implementation result

Implemented `projectRevisionUi.ts`, `ProjectConflictPanel.tsx`, revision header
identity, save/autosave/error states, recovery snapshot preservation, latest
revision reload, and save-as-variant flow in Phase3. Conflict metadata is read
from both direct and nested tRPC error causes without rendering raw provider
details. Merge/keep-mine is intentionally not enabled because no server-safe
merge contract is present.

Focused proof: `projectRevisionUi.test.ts`, `editorUiState.test.ts`, and the
full focused editor regression matrix passed.

### Component Map

| Component | File | Owns | Consumes |
|---|---|---|---|
| ProjectConflictPanel | `ProjectConflictPanel.tsx` | conflict summary/actions | revision UI state |
| Project revision mapper | `ui/projectRevisionUi.ts` | save/error projection | tRPC mutation/query results |
| Revision header status | `VideoEditorPhase3.tsx` | visible sync/save state | mapper + project cursor |
| Project list dialog | `VideoEditorPhase3.tsx` + Section 01 dialog | open/empty/error actions | project list query |

### State Matrix

| State | Expected UI | Verification |
|---|---|---|
| saving | non-blocking progress and disabled duplicate save | component test |
| saved/autosaved | revision/time confirmation | component test |
| unsaved | visible dirty indicator | route test |
| offline/error | safe message + retry, preserve draft | mapper/UI test |
| external update | non-destructive notice + review latest | integration test |
| conflict | base/current + explicit choices | integration/browser test |

### Responsive Matrix

| Viewport | Expected behavior | Evidence |
|---|---|---|
| mobile 390x844 | revision status and conflict actions stack without clipping | Playwright |
| tablet 768x1024 | conflict panel readable beside/over editor | Playwright |
| desktop 1440x900 | header status visible without hiding Save/Submit | Playwright |
| small-mobile 360x800 | concise conflict copy and reachable primary action | Playwright |
| laptop 1024x768 | latest/local comparison scrolls internally | Playwright |
| wide-desktop 1280x800 | revision metadata does not overlap timeline | Playwright |

### Accessibility Acceptance

- Conflict is an assertive alert/dialog with a labelled heading and description.
- Actions have clear names and keyboard order: review latest, keep/retry when
  allowed, save variant, cancel.
- Destructive reload requires explicit confirmation.
- Focus returns after resolution and local draft preservation is announced.

### Copy Contract

- Use Thai-first text such as “พบเวอร์ชันใหม่กว่า” and “การแก้ไขในหน้านี้ยัง
  ถูกเก็บไว้”.
- Explain base/current revision without exposing unsafe payloads.
- English fallback must preserve the distinction between reload, retry, merge,
  and save-as-variant.

### Browser Evidence Required

Capture dirty → save → saved, autosave failure, stale conflict, reload/variant,
focus restoration, and beforeunload-related UI notes at required viewports.

## Exit criteria

The active editor visibly exposes revision/sync/conflict state and all save paths
are either safely resolved or explicitly unavailable; no generic save toast is
the only recovery surface.
