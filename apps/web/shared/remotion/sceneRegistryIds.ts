/**
 * Plain, dependency-free list of vetted R3F/Three.js scene ids for the
 * generic Remotion template system (Phase 7, see
 * planning/remotion-migration/plan.md section 8).
 *
 * This file exists ONLY to break a circular import: the Zod
 * `RemotionLayerSchema` in `layerTemplateSchemas.ts` (a `shared/` module,
 * usable by both client and server code) needs to validate `scene3d` layers'
 * `sceneId` against the same fixed set of ids the real scene REGISTRY
 * (`server/remotion/scenes/index.ts`, a server-only module that imports
 * React components) resolves at render time. `shared/` must never import
 * from `server/` (wrong dependency direction for a module that could be
 * pulled into client bundles), so the id list — a plain string array, no
 * React/Node dependencies — lives here and is imported by BOTH
 * `layerTemplateSchemas.ts` (for the Zod enum) and
 * `server/remotion/scenes/index.ts` (as the canonical key order for the
 * component registry). Adding a new scene means adding its id here AND
 * adding the matching component entry in `server/remotion/scenes/index.ts`
 * — `server/remotion/scenes/index.ts` throws at module-load time if the two
 * ever drift out of sync (see that file's `assertRegistryMatchesIds`).
 */
export const REMOTION_SCENE_IDS = ["orbiting-product"] as const;

export type RemotionSceneId = (typeof REMOTION_SCENE_IDS)[number];
