## Planning Depth

- Chosen depth: `standard`

## Why

- The request is broader than the quick block-insertion slice already implemented.
- It spans editor UX, persistence, render contracts, typography, media rendering, and AI layout generation.
- A repository-fit solution still fits inside a rigorous quick plan, but it should be treated as a design-system upgrade rather than another small UI tweak.

## Key Decisions

1. Do not recommend scaling the current system by adding many more hardcoded block presets alone.
2. Recommend a component-based slide design system as the new middle layer between primitives and full-slide templates.
3. Treat typography packs and media masks as first-class architecture concerns, not optional styling add-ons.
4. Recommend that Draft with AI move from fixed template family selection toward composition recipes using shared components.
5. Keep `componentInstance` as a first-class schema inside editor/persistence/AI flows; only flatten to primitives in export or compatibility downgrade layers.
6. Use a hybrid preview pipeline for user-authored blocks: client-side for immediate editing feedback, server-side for canonical cached/shareable artifacts.
7. Ship typography packs in v1 with an allowlisted font catalog, but define the pack interface so tenant/custom font sources can be introduced later without schema churn.
8. Store canonical preview binaries in object storage and preview metadata/index rows in the database; use cache/CDN only as an acceleration layer.
9. Version built-in component definitions with revision integers rather than semver for runtime invalidation and cache-key simplicity.
10. Start typography v1 with a small deterministic allowlist spanning sans, serif, mono, and Thai-capable families, protected by `fontCatalogVersion`.
11. Lock preview hash inputs and artifact lifecycle rules before implementation starts.
12. Record sprint-1 execution defaults in [kickoff-defaults.md](/home/dev/projects/SmartSpecPro/specs/quick/010-presentation-design-system-upgrade/kickoff-defaults.md) so storage/provider, font catalog, and preview retry behavior stay aligned across teams.

## Follow-up Safeguards Added After Review

- Introduce component definition versioning so persisted instances and preview cache keys stay stable as built-ins evolve.
- Require preview artifact hashing/version metadata so client ephemeral previews and server canonical previews can be compared and invalidated predictably.
- Separate `fontPackId` from future `fontSource` metadata so v1 stays constrained without blocking future tenant-font rollout.
- Treat the preview renderer as stateless so canonical persistence remains object storage + database metadata rather than app memory or CDN cache.
- Use `definitionRevision` as the built-in component version field and bump it only for render/output semantic changes.
