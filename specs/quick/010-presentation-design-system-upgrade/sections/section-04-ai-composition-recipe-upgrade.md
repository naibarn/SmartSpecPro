## Goal

Upgrade Draft with AI so it composes slides from richer recipes/components rather than only a small template family.

## Scope

- new recipe/archetype layer
- component-aware AI output schema
- compatibility bridge for legacy template IDs
- recipe constraints so output stays valid and bounded
- explicit fallback to legacy template generation when recipe mode is disabled
- AI outputs first-class `componentInstance` structures rather than only pre-flattened primitives

## Done When

- AI-generated slides show substantially more varied structures and styling while remaining valid in the existing render pipeline
- recipe-driven AI output can be rolled back without breaking existing generation flows
- recipe output aligns with the same component schema used by manual authoring and reusable blocks
