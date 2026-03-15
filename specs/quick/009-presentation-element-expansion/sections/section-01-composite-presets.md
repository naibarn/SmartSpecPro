## Goal

Unlock much richer slide designs quickly by inserting multi-element preset blocks built from existing primitives.

## Scope

- Add a preset/block catalog for common design patterns.
- Each preset emits standard slide elements only:
  - `text`
  - `rect`
  - `line`
  - `image` with optional `svgContent`

## Why First

- Lowest architectural risk
- Immediate UX value
- Reuses current renderer/export stack

## Candidate Presets

- process step card
- feature box with icon
- profile card
- timeline item
- contact/info chip
- quote/callout block

## Done When

- Users can insert at least a few richer blocks without manual assembly.
- Inserted blocks render correctly in editor and export.
