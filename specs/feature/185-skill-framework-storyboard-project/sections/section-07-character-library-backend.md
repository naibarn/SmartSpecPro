# Section 07 — Character Library backend

## Goal

Create a reusable, owner-scoped character source that supports Storyboard projects and explicit Drama interoperability.

## Behavior

CRUD characters, immutable revisions, names/aliases, looks, primary/reference assets, candidates, sheets/angle packs, QC/approval, archive/delete dependency checks, and project revision bindings. Auto names are deterministic and editable without changing stable `characterKey`. Direct generation validates the selected character-prompt skill and runs its canonical `prompt_only` adapter; asset-only operations do not charge credits.

Interop is explicit: Drama publish creates a snapshot; Library-to-Storyboard binds a revision; Library-to-Drama imports through existing owner-scoped APIs; export creates an authorized manifest; sync uses preview/apply with conflict resolution. Source deletion never silently deletes targets, and binary assets are not duplicated.

## Tests

Cover tenant isolation, revision immutability, name/look editing, binding snapshots, candidate promotion, skill-driven generation, import/export, conflict/source-unavailable behavior, and no-charge asset import. No synthetic Drama series rows for Storyboard characters.

## UI/UX Contract

### Target User / JTBD
Creator reuses a recognizable character, edits its name, adds looks, and exchanges it with Drama explicitly.

### Surface Inventory
Character list, profile editor, looks, candidates, assets, revision picker, import/export, conflicts.

### Component Map
Library owns identity/revisions; shared Character Stock owns presentation and adapters.

### State Matrix
Support empty, loading, selected, editing, generating, approved, archived, unavailable, conflict.

### Responsive Matrix
Character identity and primary action stay visible at 320px through desktop.

### Accessibility Acceptance
Name editing, tabs, dialogs, assets, and conflict choices support keyboard and labels.

### Copy Contract
Localize auto-name, rename, look, revision, import, export, source, and conflict terms.

### Browser Evidence Required
Create, rename, add look, bind, and preview Drama import without silent mutation.
