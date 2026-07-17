/**
 * Plain, dependency-free list of vetted R3F/Three.js scene ids for the
 * generic Remotion template system.
 *
 * MOVED from `apps/web/shared/remotion/sceneRegistryIds.ts` as part of the
 * `packages/remotion-render` extraction (see
 * planning/remotion-migration/plan.md Phase 10, "Sidecar contract"). The
 * original circular-import rationale still applies: the Zod
 * `RemotionLayerSchema` in `layerTemplateSchemas.ts` needs to validate
 * `scene3d` layers' `sceneId` against the same fixed id set the real scene
 * REGISTRY (`scenes/index.ts`, which imports React components) resolves at
 * render time, without either module importing the other's heavier
 * dependency. `apps/web/shared/remotion/sceneRegistryIds.ts` now re-exports
 * this file's `REMOTION_SCENE_IDS` for backward compatibility with existing
 * importers.
 */
export const REMOTION_SCENE_IDS = ["orbiting-product"] as const;

export type RemotionSceneId = (typeof REMOTION_SCENE_IDS)[number];
