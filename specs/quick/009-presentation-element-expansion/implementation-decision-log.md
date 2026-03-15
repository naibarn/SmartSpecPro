## Decisions

### Section 01 - execution mode

- options considered:
  - `ask_every_choice`
  - `smart_auto`
  - `auto_by_default`
- decision taken: `auto_by_default`
- mode used: `auto`
- rationale: the task is editor-side implementation with bounded product intent and no destructive actions.

### Section 01 - dirty worktree handling

- options considered:
  - pause and ask the user because the repository is dirty
  - continue while avoiding unrelated files
- decision taken: continue while limiting edits to presentation editor files touched by this feature
- mode used: `auto`
- rationale: the worktree is broadly dirty, but the requested feature is narrow and the overlapping presentation files can be inspected before editing.

### Section 01 - first implementation slice

- options considered:
  - add only a new UI tab without insertion behavior
  - add preset block insertion end-to-end with multi-element command support
- decision taken: add a `Blocks` library with reusable preset insertion and single-step undo semantics
- mode used: `auto`
- rationale: this is the smallest slice that produces actual user value and matches the plan's composite-preset recommendation.

### Section 01 - surface area for the first slice

- options considered:
  - add desktop, mobile, and server-aware block systems immediately
  - limit the first slice to editor-side preset insertion built on existing primitives
- decision taken: implement editor-side preset insertion only, using existing element contracts so play/export remain compatible automatically
- mode used: `auto`
- rationale: the inserted content is composed from existing primitives, so it already rides the current render pipeline without requiring a broader contract change.
