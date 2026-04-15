# Decision Log

## Feature identity

- Feature number: `093`
- Working title: `Hermes Capability and Experience Expansion`
- Status: `Proposed`

## Depth decision

Chosen depth: `standard`

Why:

- the requested scope is broader than a micro change but still tightly centered on one product area
- it breaks cleanly into five sectioned implementation slices
- the work is primarily feature design and controlled extension of existing Hermes surfaces, not a platform rewrite

What kept it in quick-plan range:

- the base Hermes runtime already exists
- the team binding, delegation, and monitoring surfaces already exist
- the main work is product expansion and UX refinement

Key risks that could still force promotion later:

- if memory sync needs a new storage model or cross-tenant replication rules
- if channel workflows require a new end-to-end messaging architecture
- if task modes require a new scheduler abstraction instead of metadata-driven routing

## Scope decisions

1. Hermes remains a truthful external runtime family.
2. All new behavior must be capability-driven and fail-closed.
3. Persona and profile UX will be additive on top of the current Hermes bridge.
4. Memory and context sync will be opt-in, not automatic, with user-only approval for personal sync and tenant approval for shared scopes.
5. Channel capabilities must be revocable and stale metadata must be invalidated after disconnect, reauthorization, or transfer.
6. Task specialization will use named modes and scope profiles, not a hard runtime split.
7. Visibility changes will prioritize plain-language summaries for non-technical users.
8. Persona, profile, task-mode, and status state will stay in worker/runtime/delegation metadata rather than a separate Hermes state store.

## Why this is the right next feature

- Feature 081 gets Hermes connected
- this feature makes Hermes pleasant and practical to use
- the plan preserves flexibility while making Hermes easier to adopt in day-to-day work
