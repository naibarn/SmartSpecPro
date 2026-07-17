/**
 * The vetted R3F/Three.js scene registry for `scene3d` layers in the
 * generic Remotion template system.
 *
 * MOVED from `apps/web/server/remotion/scenes/index.ts` as part of the
 * `packages/remotion-render` extraction (see
 * planning/remotion-migration/plan.md Phase 10, "Sidecar contract").
 *
 * SECURITY: this is the enforcement point for "no arbitrary user-submitted
 * 3D scene code" — `scene3d` layers can only reference a `sceneId` that is
 * both (a) present in `../sceneRegistryIds.ts`'s `REMOTION_SCENE_IDS`
 * (enforced at the Zod-schema layer, before any render ever starts) AND (b)
 * a real, pre-vetted React component registered here.
 * `assertRegistryMatchesIds()` runs at module load and throws if the two
 * ever drift apart, so a scene id can never validate successfully at the
 * schema layer while having no corresponding component to render (or vice
 * versa) without the drift being caught immediately, not silently at
 * render time in production.
 */
import type React from "react";

import { REMOTION_SCENE_IDS, type RemotionSceneId } from "../sceneRegistryIds";
import { OrbitingProductScene } from "./OrbitingProductScene";

export const REMOTION_SCENE_REGISTRY: Record<
  RemotionSceneId,
  React.FC<Record<string, unknown>>
> = {
  "orbiting-product": OrbitingProductScene,
};

function assertRegistryMatchesIds(): void {
  const registryKeys = Object.keys(REMOTION_SCENE_REGISTRY).sort();
  const idList = [...REMOTION_SCENE_IDS].sort();
  const matches =
    registryKeys.length === idList.length &&
    registryKeys.every((key, index) => key === idList[index]);
  if (!matches) {
    throw new Error(
      "[remotion-render/scenes] REMOTION_SCENE_REGISTRY keys " +
        `(${JSON.stringify(registryKeys)}) do not match ` +
        "sceneRegistryIds.ts's REMOTION_SCENE_IDS " +
        `(${JSON.stringify(idList)}). These two lists must stay in sync — ` +
        "see this file's module doc comment."
    );
  }
}

assertRegistryMatchesIds();

export { REMOTION_SCENE_IDS };
