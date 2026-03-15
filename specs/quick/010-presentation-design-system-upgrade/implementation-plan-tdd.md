## Test-First Guidance

### Component System

Add tests that fail until:
- component definitions validate and serialize
- component instances bind slots correctly
- component instances persist as first-class schema without being flattened during ordinary save/load flows
- inserting a component yields deterministic rendered output
- component select/enter/detach semantics are deterministic
- unsupported component paths can degrade safely to primitive output

### Preview Catalog

Add tests that fail until:
- each catalog item has a preview artifact
- client working preview and server canonical preview resolve to the same version/hash contract
- preview rendering is stable for built-in and user-authored items
- preview invalidation/regeneration works when a reusable block changes
- preview metadata resolves to object-storage artifact URIs without requiring binary storage in the relational database
- stale preview detection follows explicit hash/version inputs

### Typography Packs

Add tests that fail until:
- only allowed font packs serialize
- raw unapproved font families are rejected in v1 persisted pack state
- Thai-safe typography packs resolve correctly
- editor/export use the same pack identifiers
- pack interfaces can carry future font-source metadata without breaking v1 fixtures
- changing `fontCatalogVersion` invalidates preview/export fixtures when expected

### Media Masks

Add tests that fail until:
- image/video mask config validates
- editor and export both render the same shape family
- unsupported mask shapes fail safely
- fallback behavior is explicit when a renderer cannot support a mask shape

### Draft with AI

Add tests that fail until:
- AI output can reference recipes/components instead of only fixed legacy template IDs
- generated slides remain schema-valid
- recipe diversity is exercised by regression cases
- legacy template-only requests still remain compatible during migration

### Persistence / Permissions

Add tests that fail until:
- user-authored blocks are tenant-scoped correctly
- unauthorized users cannot mutate or access private reusable blocks
- saved blocks preserve preview, slot schema, and library metadata
- preview lifecycle status transitions (`pending`, `ready`, `stale`, `failed`) behave deterministically

## Regression Checks

- Existing primitive-only slides still load.
- Existing full-presentation templates remain valid.
- Legacy AI template IDs remain supported during migration.
- Turning off the new rollout flag falls back safely to legacy authoring/generation behavior.
