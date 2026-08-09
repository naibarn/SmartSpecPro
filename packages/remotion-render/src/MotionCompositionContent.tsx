import React, { useMemo } from "react";
import { interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";

import type { RemotionMotionCompositionLayer } from "./layerTemplateSchemas";

type MotionEvent = {
  frame: number;
  kind: "enter" | "emphasis" | "reveal" | "transition";
  strength?: number;
};

type MotionProps = {
  seed?: number;
  density?: "low" | "medium" | "high";
  speed?: number;
  palette?: string[];
  title?: string;
  subtitle?: string;
  captionSafeArea?: boolean;
  events?: MotionEvent[];
  nodes?: string[];
  linkDistance?: number;
};

function asMotionProps(value: Record<string, unknown>): MotionProps {
  const palette = Array.isArray(value.palette)
    ? value.palette.filter((item): item is string => typeof item === "string").slice(0, 6)
    : undefined;
  const events = Array.isArray(value.events)
    ? value.events.filter((item): item is MotionEvent => {
        if (!item || typeof item !== "object") return false;
        const event = item as Record<string, unknown>;
        return typeof event.frame === "number" && typeof event.kind === "string";
      }).slice(0, 32)
    : undefined;
  const nodes = Array.isArray(value.nodes)
    ? value.nodes.filter((item): item is string => typeof item === "string").slice(0, 12)
    : undefined;
  return {
    seed: typeof value.seed === "number" ? value.seed : 42,
    density: value.density === "low" || value.density === "high" ? value.density : "medium",
    speed: typeof value.speed === "number" ? Math.max(0.1, Math.min(4, value.speed)) : 1,
    palette: palette && palette.length > 0 ? palette : ["#60a5fa", "#22d3ee", "#facc15"],
    title: typeof value.title === "string" ? value.title : "",
    subtitle: typeof value.subtitle === "string" ? value.subtitle : "",
    captionSafeArea: value.captionSafeArea === true,
    events,
    nodes,
    linkDistance: typeof value.linkDistance === "number" ? value.linkDistance : 0.34,
  };
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

function normalizeId(value: string): string {
  return value.replace(/[^a-zA-Z0-9_-]/g, "-");
}

function eventEnergy(frame: number, events: MotionEvent[] | undefined): number {
  if (!events || events.length === 0) return 0;
  return events.reduce((max, event) => {
    const distance = Math.abs(frame - event.frame);
    const pulse = interpolate(distance, [0, 18], [event.strength ?? 1, 0], {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
    });
    return Math.max(max, pulse);
  }, 0);
}

function densityCount(density: MotionProps["density"]): number {
  if (density === "low") return 100;
  if (density === "high") return 360;
  return 220;
}

const SvgText: React.FC<{
  title: string;
  subtitle: string;
  palette: string[];
  captionSafeArea: boolean;
}> = ({ title, subtitle, palette, captionSafeArea }) => (
  <>
    {title ? (
      <text x="7" y={captionSafeArea ? "12" : "84"} fill="#f8fafc" fontSize="6" fontWeight="800" letterSpacing="0.12em">
        {title}
      </text>
    ) : null}
    {subtitle ? (
      <text x="7" y={captionSafeArea ? "18" : "89"} fill={palette[1] ?? "#cbd5e1"} fontSize="2.6" fontWeight="500">
        {subtitle}
      </text>
    ) : null}
  </>
);

const ParticleField: React.FC<{ layer: RemotionMotionCompositionLayer }> = ({ layer }) => {
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();
  const props = useMemo(() => asMotionProps(layer.props), [layer.props]);
  const id = normalizeId(layer.id);
  const particles = useMemo(() => {
    const random = seededRandom(props.seed ?? 42);
    return Array.from({ length: densityCount(props.density) }, (_, index) => {
      const angle = random() * Math.PI * 2;
      const radius = Math.pow(random(), 0.55) * 46;
      return {
        index,
        angle,
        radius,
        depth: random(),
        drift: (random() - 0.5) * 0.7,
        size: 0.18 + random() * 0.65,
        color: props.palette?.[Math.floor(random() * (props.palette?.length ?? 1))] ?? "#60a5fa",
      };
    });
  }, [props.density, props.palette, props.seed]);
  const progress = durationInFrames > 1 ? frame / durationInFrames : 0;
  const energy = eventEnergy(frame, props.events);
  const speed = props.speed ?? 1;
  const centerX = 50;
  const centerY = 43;

  return (
    <svg viewBox="0 0 100 100" preserveAspectRatio="none" style={{ width: "100%", height: "100%" }}>
      <defs>
        <radialGradient id={`${id}-bg`} cx="50%" cy="42%" r="70%">
          <stop offset="0" stopColor={props.palette?.[0] ?? "#1d4ed8"} stopOpacity="0.24" />
          <stop offset="0.45" stopColor="#0b1228" stopOpacity="0.5" />
          <stop offset="1" stopColor="#020617" stopOpacity="0.98" />
        </radialGradient>
        <filter id={`${id}-glow`} x="-100%" y="-100%" width="300%" height="300%">
          <feGaussianBlur stdDeviation="0.8" result="blur" />
          <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
        </filter>
      </defs>
      <rect width="100" height="100" fill={`url(#${id}-bg)`} />
      <g filter={`url(#${id}-glow)`}>
        {particles.map(particle => {
          const theta = particle.angle + frame * 0.004 * speed * (0.4 + particle.depth);
          const radial = particle.radius * (0.94 + progress * 0.16 + energy * 0.2);
          const x = centerX + Math.cos(theta) * radial;
          const y = centerY + Math.sin(theta) * radial * 0.62 + Math.sin(frame / 25 + particle.index) * particle.drift;
          const opacity = 0.22 + particle.depth * 0.68 + energy * 0.3;
          const scale = 0.8 + energy * 1.6 + Math.sin(frame / 18 + particle.index) * 0.1;
          return <circle key={particle.index} cx={x} cy={y} r={particle.size * scale} fill={particle.color} opacity={Math.max(0.05, Math.min(1, opacity))} />;
        })}
      </g>
      <circle cx={centerX} cy={centerY} r={2 + energy * 3} fill={props.palette?.[1] ?? "#22d3ee"} opacity={0.8} filter={`url(#${id}-glow)`} />
      <SvgText title={props.title ?? ""} subtitle={props.subtitle ?? ""} palette={props.palette ?? []} captionSafeArea={props.captionSafeArea === true} />
    </svg>
  );
};

const NetworkGraph: React.FC<{ layer: RemotionMotionCompositionLayer }> = ({ layer }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const props = useMemo(() => asMotionProps(layer.props), [layer.props]);
  const id = normalizeId(layer.id);
  const labels = useMemo(
    () => props.nodes && props.nodes.length >= 2 ? props.nodes : ["Input", "Process", "Output", "Signal", "Result"],
    [props.nodes],
  );
  const nodes = useMemo(() => {
    const random = seededRandom(props.seed ?? 7);
    return labels.map((label, index) => ({ label, index, x: 16 + random() * 68, y: 20 + random() * 43, radius: 1.3 + random() * 0.8 }));
  }, [labels, props.seed]);
  const links = useMemo(() => {
    const result: Array<[number, number]> = [];
    nodes.forEach((node, index) => {
      if (index > 0) result.push([index - 1, index]);
      let nearest = -1;
      let nearestDistance = Number.POSITIVE_INFINITY;
      nodes.forEach((other, otherIndex) => {
        if (otherIndex === index) return;
        const distance = Math.hypot(node.x - other.x, node.y - other.y);
        if (distance < nearestDistance) {
          nearestDistance = distance;
          nearest = otherIndex;
        }
      });
      if (nearest >= 0 && nearestDistance < (props.linkDistance ?? 0.34) * 100) {
        const pair: [number, number] = index < nearest ? [index, nearest] : [nearest, index];
        if (!result.some(existing => existing[0] === pair[0] && existing[1] === pair[1])) result.push(pair);
      }
    });
    return result;
  }, [nodes, props.linkDistance]);
  const energy = eventEnergy(frame, props.events);
  const springProgress = spring({ frame: Math.max(0, frame - 4), fps, config: { damping: 18, stiffness: 90 } });
  const palette = props.palette ?? ["#60a5fa", "#22d3ee", "#facc15"];

  return (
    <svg viewBox="0 0 100 100" preserveAspectRatio="none" style={{ width: "100%", height: "100%" }}>
      <defs>
        <radialGradient id={`${id}-bg`} cx="50%" cy="45%" r="70%">
          <stop offset="0" stopColor="#0b2a54" stopOpacity="0.5" />
          <stop offset="1" stopColor="#020617" stopOpacity="0.98" />
        </radialGradient>
        <filter id={`${id}-glow`} x="-100%" y="-100%" width="300%" height="300%">
          <feGaussianBlur stdDeviation="0.55" result="blur" />
          <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
        </filter>
      </defs>
      <rect width="100" height="100" fill={`url(#${id}-bg)`} />
      <g opacity="0.9" filter={`url(#${id}-glow)`}>
        {links.map(([from, to], index) => {
          const a = nodes[from];
          const b = nodes[to];
          const lineProgress = interpolate(frame, [index * 4, index * 4 + 18], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
          return <line key={`${from}-${to}`} x1={a.x} y1={a.y} x2={a.x + (b.x - a.x) * lineProgress} y2={a.y + (b.y - a.y) * lineProgress} stroke={palette[index % palette.length]} strokeWidth="0.28" opacity={0.7} />;
        })}
        {nodes.map(node => {
          const pulse = 1 + 0.12 * Math.sin(frame / 9 + node.index) + energy * 0.35;
          return (
            <g key={node.index} transform={`translate(${node.x} ${node.y}) scale(${springProgress * pulse})`}>
              <circle r={node.radius * 2.6} fill={palette[node.index % palette.length]} opacity="0.16" />
              <circle r={node.radius} fill={palette[node.index % palette.length]} />
              <text x="2.2" y="0.9" fill="#e2e8f0" fontSize="2.2" fontWeight="600">{node.label}</text>
            </g>
          );
        })}
      </g>
      <SvgText title={props.title ?? ""} subtitle={props.subtitle ?? ""} palette={palette} captionSafeArea={props.captionSafeArea === true} />
    </svg>
  );
};

export const MotionCompositionLayerContent: React.FC<{
  layer: RemotionMotionCompositionLayer;
}> = ({ layer }) => {
  if (layer.compositionId === "network-graph") return <NetworkGraph layer={layer} />;
  return <ParticleField layer={layer} />;
};
