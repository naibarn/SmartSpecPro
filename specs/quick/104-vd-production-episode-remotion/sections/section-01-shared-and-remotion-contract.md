# Section 01 — Shared and Remotion Contract

## Ownership

Own pure range/source/render-option contracts and the Remotion segment-template builder. Do not edit DB schema or router orchestration in this section.

## Targets

- `apps/web/shared/verticalDramaSeries/assembly.ts`
- `packages/remotion-render/src/remotionRenderVideoSchema.ts` only if an additive, backward-compatible field is strictly required
- `packages/remotion-render/src/layerTemplateSchemas.ts` and mirrored web copy only if contract parity requires it
- new focused shared/remotion tests

## TDD expectations

Start with failing tests for range partitioning, source-mode selection, overlay layer construction, stable segment durations, schema parse, and legacy compatibility. Keep the GenericTemplate layer budget bounded per segment.

## Acceptance

The builder emits schema-valid segment templates for compiled and shot sources, maps the exact EP/title/watermark options, and never widens generic URL acceptance or weakens old fixtures.

## Coordination

If a migration or broad contract bump is discovered, stop and return `NEEDS_SCHEMA_CHANGE` to the conductor; do not edit migrations in this section.
