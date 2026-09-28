/**
 * Proof-of-pipeline example R3F/Three.js scene for the generic Remotion
 * template system (Phase 7, see planning/remotion-migration/plan.md
 * section 8). Deliberately simple: a single rotating sphere with basic
 * lighting, driven frame-by-frame off Remotion's `useCurrentFrame()` (NOT
 * `useFrame()`/an internal animation loop — Remotion renders frame-by-frame
 * out of sequence for parallelized rendering, so scene state must be a pure
 * function of the current frame, exactly like every 2D layer in this
 * composition system).
 *
 * Registered under id `"orbiting-product"` in `./index.ts`'s
 * `REMOTION_SCENE_REGISTRY`. Only vetted scenes like this one are reachable
 * from a `scene3d` layer — see `shared/remotion/layerTemplateSchemas.ts`'s
 * `sceneId` enum, sourced from `shared/remotion/sceneRegistryIds.ts`.
 */
import React from "react";
import { useCurrentFrame } from "remotion";

export interface OrbitingProductSceneProps {
  color?: string;
  rotationSpeed?: number;
  [key: string]: unknown;
}

export const OrbitingProductScene: React.FC<OrbitingProductSceneProps> = ({
  color = "#4f8cff",
  rotationSpeed = 0.05,
}) => {
  const frame = useCurrentFrame();
  const rotationY = frame * Number(rotationSpeed);

  return (
    <>
      <ambientLight intensity={0.6} />
      <directionalLight position={[3, 4, 5]} intensity={1.2} />
      <mesh rotation={[0.3, rotationY, 0]}>
        <sphereGeometry args={[1.4, 48, 48]} />
        <meshStandardMaterial color={color} roughness={0.35} metalness={0.2} />
      </mesh>
    </>
  );
};
