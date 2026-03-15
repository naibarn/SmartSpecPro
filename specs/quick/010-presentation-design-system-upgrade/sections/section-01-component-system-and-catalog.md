## Goal

Introduce a reusable component system that becomes the basis for both built-in and future user-authored slide blocks.

## Scope

- add `componentDefinition` and `componentInstance`
- support named slots
- support preview artifacts
- upgrade the block library into a visual catalog
- define editor interaction semantics for select, enter, override, resize, and detach
- keep `componentInstance` first-class in persisted slide schema and editor state
- define component definition versioning and slot-binding invariants
- define downgrade boundaries explicitly instead of flattening during normal saves

## Done When

- block items show actual previews before insertion
- built-in blocks can carry editable media/text placeholders
- the editor can insert a component instance as one logical unit
- users can edit slot content without losing the component structure accidentally
- save/load preserves `componentInstance` identity and slot bindings intact
