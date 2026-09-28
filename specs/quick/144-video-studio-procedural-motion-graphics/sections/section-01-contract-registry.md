# Section 01 — Contract and Registry

## Ownership

Own shared motion metadata, composition/scene ids, bounded props schemas, registry
guards, worker contract/version updates and fixtures. Do not implement visual drawing
or UI here.

## Target files

- `apps/web/shared/videoIntelligence/motionTemplates.ts`
- `apps/web/shared/remotion/layerTemplateSchemas.ts`
- `apps/web/shared/remotion/sceneRegistryIds.ts`
- `packages/remotion-render/src/layerTemplateSchemas.ts`
- `packages/remotion-render/src/remotionRenderVideoSchema.ts`
- `apps/web/shared/__fixtures__/*remotionRenderVideoWorkerInput*`
- registry and schema sync tests

## TDD expectations

Write schema/registry/contract tests first. Verify old documents parse unchanged,
unknown ids/counts are rejected, and both duplicated schema copies remain synchronized.

## Acceptance

The contract can represent a procedural system without arbitrary code or unbounded
payloads, and existing `layer_pack`/`scene3d` projects remain valid.

## Risks

Any non-optional field or schema drift can break old construction sites and worker
fixtures. Use additive fields, explicit contract versioning and exact diff review.
