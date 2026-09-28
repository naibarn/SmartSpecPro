import React, { useMemo } from "react";
import * as THREE from "three";
import { interpolate, useCurrentFrame } from "remotion";

type MotionEvent = { frame: number; strength?: number };

export interface GlowingSphereSceneProps {
  seed?: number;
  density?: "low" | "medium" | "high";
  color?: string;
  secondaryColor?: string;
  rotationSpeed?: number;
  events?: MotionEvent[];
  [key: string]: unknown;
}

function seededRandom(seed: number): () => number {
  let state = (seed | 0) + 0x6d2b79f5;
  return () => {
    state |= 0;
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function particleCount(density: GlowingSphereSceneProps["density"]): number {
  if (density === "low") return 100;
  if (density === "high") return 300;
  return 180;
}

function eventEnergy(frame: number, events: MotionEvent[] | undefined): number {
  if (!events || events.length === 0) return 0;
  return events.reduce((max, event) => {
    const pulse = interpolate(Math.abs(frame - event.frame), [0, 18], [event.strength ?? 1, 0], {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
    });
    return Math.max(max, pulse);
  }, 0);
}

export const GlowingSphereScene: React.FC<GlowingSphereSceneProps> = ({
  seed = 11,
  density = "medium",
  color = "#38bdf8",
  secondaryColor = "#60a5fa",
  rotationSpeed = 0.35,
  events,
}) => {
  const frame = useCurrentFrame();
  const energy = eventEnergy(frame, events);
  const points = useMemo(() => {
    const random = seededRandom(seed);
    const positions = new Float32Array(particleCount(density) * 3);
    for (let i = 0; i < positions.length; i += 3) {
      const theta = random() * Math.PI * 2;
      const phi = Math.acos(2 * random() - 1);
      const radius = 1.05 + random() * 0.32;
      positions[i] = radius * Math.sin(phi) * Math.cos(theta);
      positions[i + 1] = radius * Math.cos(phi);
      positions[i + 2] = radius * Math.sin(phi) * Math.sin(theta);
    }
    return positions;
  }, [density, seed]);
  const linePositions = useMemo(() => {
    const random = seededRandom(seed + 17);
    const positions = new Float32Array(36 * 6);
    for (let i = 0; i < positions.length; i += 6) {
      const a = random() * Math.PI * 2;
      const b = Math.acos(2 * random() - 1);
      const c = random() * Math.PI * 2;
      const d = Math.acos(2 * random() - 1);
      positions[i] = Math.sin(b) * Math.cos(a);
      positions[i + 1] = Math.cos(b);
      positions[i + 2] = Math.sin(b) * Math.sin(a);
      positions[i + 3] = Math.sin(d) * Math.cos(c);
      positions[i + 4] = Math.cos(d);
      positions[i + 5] = Math.sin(d) * Math.sin(c);
    }
    return positions;
  }, [seed]);
  const rotation = frame * Number(rotationSpeed) * (0.01 + energy * 0.004);
  const pulse = 1 + Math.sin(frame / 18) * 0.035 + energy * 0.08;

  return (
    <group rotation={[0.08, rotation, rotation * 0.4]} scale={pulse}>
      <ambientLight intensity={0.45 + energy * 0.25} />
      <pointLight position={[3, 2, 4]} color={color} intensity={2.8 + energy * 2} distance={8} />
      <pointLight position={[-3, -2, -4]} color={secondaryColor} intensity={2 + energy * 1.4} distance={7} />
      <mesh>
        <sphereGeometry args={[1.02, 48, 48]} />
        <meshBasicMaterial color={color} transparent opacity={0.12 + energy * 0.08} side={THREE.DoubleSide} />
      </mesh>
      <mesh>
        <sphereGeometry args={[1.055, 24, 24]} />
        <meshBasicMaterial color={secondaryColor} wireframe transparent opacity={0.22} />
      </mesh>
      <points>
        <bufferGeometry>
          <bufferAttribute attach="attributes-position" args={[points, 3]} count={points.length / 3} />
        </bufferGeometry>
        <pointsMaterial color={color} size={0.045 + energy * 0.018} sizeAttenuation transparent opacity={0.9} blending={THREE.AdditiveBlending} />
      </points>
      <lineSegments>
        <bufferGeometry>
          <bufferAttribute attach="attributes-position" args={[linePositions, 3]} count={linePositions.length / 3} />
        </bufferGeometry>
        <lineBasicMaterial color={secondaryColor} transparent opacity={0.34 + energy * 0.2} blending={THREE.AdditiveBlending} />
      </lineSegments>
    </group>
  );
};
