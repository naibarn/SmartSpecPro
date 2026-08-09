# Section 02 — Procedural Compositions

## Ownership

Own particle field, network graph, kinetic title, glowing sphere, deterministic PRNG,
quality caps and render-safe composition/scene registries. Do not decide semantic
selection or persist user documents here.

## Target files

- `packages/remotion-render/src/GenericTemplateComposition.tsx`
- `packages/remotion-render/src/scenes/*`
- `apps/web/server/remotion/scenes/*`
- `apps/web/server/remotion/templates/*`
- `packages/remotion-render/src/__tests__/*` and server composition tests

## TDD expectations

Test deterministic geometry and event frames separately from visual rendering. Add a
preview/final quality test and an actual render smoke fixture for each family.

## Acceptance

Each family renders as one bounded visual system, uses the same source component in
Player and Worker, and does not produce a blank/black output when an optional GPU
feature is unavailable.

## Risks

SVG/Canvas performance and Three.js Chromium configuration may require a spike. Do not
add a new rendering dependency until measurements show the current primitives cannot
meet the target particle count.
