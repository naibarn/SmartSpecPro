# Decision Log

## Planning Depth

`standard`

## Why Not `micro`

- this is not a single setting move; it affects policy ownership, authz, UI placement, and data model
- the answer must cover both configuration storage and user-facing administration surfaces

## Why Not Promote To Full `deep-plan`

- the domain is architecture-heavy, but the request is still bounded to one subsystem
- current codebase already has most primitives in place
- a compact plan with 3 sections is sufficient to implement incrementally

## Main Decisions

1. Treat browser policy as a layered model, not a single settings form
2. Keep privilege expansion impossible below tenant/platform layers
3. Move tenant-owned policy management out of global admin-only settings over time
4. Reuse existing tables where possible and add a dedicated user policy profile only where policy semantics are stronger than generic preferences
