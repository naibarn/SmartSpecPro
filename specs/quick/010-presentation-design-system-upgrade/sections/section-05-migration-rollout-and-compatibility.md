## Goal

Introduce the new presentation design system safely without breaking current decks, templates, or AI generation flows.

## Scope

- backward-compatible schema evolution
- fallback/degradation strategy
- rollout flags or staged enablement
- preview/render compatibility checks
- migration notes for existing slides and templates
- export-time/component-compatibility flattening rules
- canonical preview parity checks between client and server
- stale preview policy and regeneration triggers
- definition-revision bump policy for built-in components

## Done When

- legacy slides and templates remain loadable
- component-aware features can be enabled gradually
- the system has a documented rollback path if preview/render/AI quality regresses
- downgrade behavior is explicit at compatibility boundaries instead of hidden in core save/load
- preview regeneration and staleness rules are explicit enough to support safe rollout and rollback
