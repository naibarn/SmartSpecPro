/**
 * The vetted R3F/Three.js scene registry for `scene3d` layers in the
 * generic Remotion template system (Phase 7, see
 * planning/remotion-migration/plan.md section 8).
 *
 * SECURITY: this is the enforcement point for "no arbitrary user-submitted
 * 3D scene code" — `scene3d` layers can only reference a `sceneId` that is
 * both (a) present in `shared/remotion/sceneRegistryIds.ts`'s
 * `REMOTION_SCENE_IDS` (enforced at the Zod-schema layer, before any render
 * ever starts) AND (b) a real, pre-vetted React component registered here.
 * `assertRegistryMatchesIds()` runs at module load and throws if the two
 * ever drift apart, so a scene id can never validate successfully at the
 * schema layer while having no corresponding component to render (or vice
 * versa) without the drift being caught immediately, not silently at
 * render time in production.
 *
 * Starts with one example scene to prove the pipeline end-to-end; not
 * intended to be an exhaustive scene library (see plan.md section 8,
 * "Deliberately out of scope this phase").
 */
import type React from "react";

import { REMOTION_SCENE_IDS, type RemotionSceneId } from "../../../shared/remotion/sceneRegistryIds";
import { OrbitingProductScene } from "./OrbitingProductScene";
import { GlowingSphereScene } from "./GlowingSphereScene";

export const REMOTION_SCENE_REGISTRY: Record<
  RemotionSceneId,
  React.FC<Record<string, unknown>>
> = {
  "orbiting-product": OrbitingProductScene,
  "glowing-sphere": GlowingSphereScene,
};

function assertRegistryMatchesIds(): void {
  const registryKeys = Object.keys(REMOTION_SCENE_REGISTRY).sort();
  const idList = [...REMOTION_SCENE_IDS].sort();
  const matches =
    registryKeys.length === idList.length &&
    registryKeys.every((key, index) => key === idList[index]);
  if (!matches) {
    throw new Error(
      "[remotion/scenes] REMOTION_SCENE_REGISTRY keys " +
        `(${JSON.stringify(registryKeys)}) do not match ` +
        "shared/remotion/sceneRegistryIds.ts's REMOTION_SCENE_IDS " +
        `(${JSON.stringify(idList)}). These two lists must stay in sync — ` +
        "see this file's module doc comment."
    );
  }
}

assertRegistryMatchesIds();

export { REMOTION_SCENE_IDS };
