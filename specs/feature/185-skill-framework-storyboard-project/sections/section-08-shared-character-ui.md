# Section 08 — Shared character UI

## Goal

Reuse the Drama Character Stock experience for the new Characters tab while preserving Drama behavior and flags.

## Implementation

Extract a shared controller/presentation boundary or shared hooks from `VerticalDramaCharacterStockPanel.tsx`. Keep the existing Drama owner adapter, tRPC procedures, feature flags, and visible capabilities unchanged. Add a Storyboard owner adapter for library/project bindings.

The Storyboard tab exposes search/select/create/edit name/profile/DNA/role, archive/delete checks, looks/variants, primary/reference assets, candidates, generation/regeneration, sheets/angle packs, lightbox, QC/approval, and supported casting/voice/twin/merge affordances. Import/export/sync must show source and conflict state before mutation.

## Tests

Use existing Drama CRUD/flag tests as regression evidence and add Storyboard adapter tests for selection, name editing, look/revision binding, promotion, import conflict, keyboard/dialog states, and asset ownership.

## UI/UX Contract

### Target User / JTBD
Creator gets the familiar Drama character management experience in Storyboard Characters.

### Surface Inventory
Stock list, profile/DNA editor, looks, candidates, lightbox, QC, and interop actions.

### Component Map
Shared presentation/controller renders both owner adapters; Drama remains baseline.

### State Matrix
Support loading, empty, selected, editing, unsaved, generating, candidate, approved, conflict.

### Responsive Matrix
Stock list/editor collapse without losing the primary character action on mobile.

### Accessibility Acceptance
Tabs, buttons, dialogs, upload, lightbox, and inline rename support keyboard/focus restoration.

### Copy Contract
Keep Drama copy semantics and add localized Storyboard/library labels.

### Browser Evidence Required
Run Drama regression and Storyboard parity checks with keyboard/focus evidence.
