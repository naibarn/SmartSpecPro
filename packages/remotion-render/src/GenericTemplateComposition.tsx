/**
 * The generic, template-driven multi-layer Remotion composition. Separate
 * from, and additive to, `MarketplaceAutoReviewComposition.tsx` (which stays
 * locked to `HyperframesFinalCompositeConfigSchema` in `apps/web`).
 *
 * MOVED (unchanged) from
 * `apps/web/server/remotion/GenericTemplateComposition.tsx` as part of the
 * `packages/remotion-render` extraction (see
 * planning/remotion-migration/plan.md Phase 10, "Sidecar contract").
 *
 * Iterates `layers[]` (sorted by `zIndex`), wraps each in a
 * `<Sequence from durationInFrames>` so every layer is independently timed,
 * and positions it via an absolutely-positioned container computed from the
 * layer's `x`/`y`/`width`/`height` (percent of canvas) + `rotationDeg` +
 * `opacity`. Renders the type-appropriate Remotion primitive per layer:
 * `<Img>` (image), `<OffthreadVideo>` (video), a styled `<div>` with a
 * modest fade-in (text), sanitized inline `<svg>` with a small
 * animation-driven transform (svg), an inline SVG shape with a looping CSS
 * transform (motionGraphic), or a `<ThreeCanvas>` from `@remotion/three`
 * wrapping a registry-resolved R3F scene component (scene3d). CSS,
 * Canvas/SVG, and WebGL layers all coexist on the same timeline, each
 * independently timed — this is the actual capability this composition
 * exists to demonstrate.
 */
import React from "react";
import {
  AbsoluteFill,
  Img,
  OffthreadVideo,
  Sequence,
  interpolate,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { ThreeCanvas } from "@remotion/three";

import type {
  RemotionLayer,
  RemotionMotionGraphicLayer,
  RemotionScene3dLayer,
  RemotionSvgLayer,
  RemotionTextLayer,
} from "./layerTemplateSchemas";
import { REMOTION_SCENE_REGISTRY } from "./scenes";
import type { GenericTemplateInputProps } from "./genericTemplateInputProps";

const ENTER_FADE_FRAMES = 15;

/**
 * Computes the shared, per-layer absolute-position wrapper style from the
 * layer's percent-of-canvas placement fields. `AbsoluteFill` (100% of the
 * composition canvas) is the positioning context, so plain CSS percentages
 * work directly without needing pixel math against `useVideoConfig()`.
 */
function layerWrapperStyle(layer: RemotionLayer): React.CSSProperties {
  return {
    position: "absolute",
    left: `${layer.x}%`,
    top: `${layer.y}%`,
    width: `${layer.width}%`,
    height: `${layer.height}%`,
    opacity: layer.opacity,
    transform: `rotate(${layer.rotationDeg}deg)`,
    transformOrigin: "center center",
  };
}

function enterFadeOpacity(frame: number, durationFrames: number): number {
  const fadeFrames = Math.min(ENTER_FADE_FRAMES, durationFrames);
  return interpolate(frame, [0, fadeFrames], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
}

const ImageLayerContent: React.FC<{
  layer: Extract<RemotionLayer, { type: "image" }>;
}> = ({ layer }) => (
  <Img
    src={layer.src}
    style={{
      width: "100%",
      height: "100%",
      objectFit: layer.fit,
    }}
  />
);

const VideoLayerContent: React.FC<{
  layer: Extract<RemotionLayer, { type: "video" }>;
  fps: number;
}> = ({ layer, fps }) => (
  <OffthreadVideo
    src={layer.src}
    volume={layer.muted ? 0 : layer.volume}
    muted={layer.muted}
    trimBefore={Math.max(0, Math.round(layer.trimStartSec * fps))}
    style={{ width: "100%", height: "100%", objectFit: "cover" }}
  />
);

const TextLayerContent: React.FC<{ layer: RemotionTextLayer }> = ({
  layer,
}) => {
  const frame = useCurrentFrame();
  const opacity = enterFadeOpacity(frame, layer.durationFrames);
  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        alignItems: "center",
        justifyContent:
          layer.textAlign === "left"
            ? "flex-start"
            : layer.textAlign === "right"
              ? "flex-end"
              : "center",
        opacity,
      }}
    >
      <span
        style={{
          fontFamily: layer.fontFamily,
          fontSize: layer.fontSizePx,
          fontWeight: layer.fontWeight === "bold" ? 700 : 400,
          color: layer.color,
          textAlign: layer.textAlign,
          whiteSpace: "pre-wrap",
        }}
      >
        {layer.content}
      </span>
    </div>
  );
};

const SvgLayerContent: React.FC<{ layer: RemotionSvgLayer }> = ({
  layer,
}) => {
  const frame = useCurrentFrame();
  let transform = "none";
  let opacity = 1;
  if (layer.animation === "fadeIn") {
    opacity = enterFadeOpacity(frame, layer.durationFrames);
  } else if (layer.animation === "drawPath") {
    // Simplified "draw" effect: since the SVG markup is arbitrary
    // user-authored content (not a single known `<path>`), animating exact
    // stroke-dashoffset per-path isn't generically possible — instead this
    // approximates a reveal via a horizontal scale-in, documented as a
    // simplification of a true path-draw animation.
    const progress = interpolate(frame, [0, 20], [0, 1], {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
    });
    transform = `scaleX(${progress})`;
  } else if (layer.animation === "pulse") {
    const scale = 1 + 0.05 * Math.sin(frame / 6);
    transform = `scale(${scale})`;
  }
  return (
    <div
      style={{ width: "100%", height: "100%", opacity, transform }}
      // eslint-disable-next-line react/no-danger -- markup is validated by
      // `isSafeInlineSvgMarkup` (RemotionSvgLayerSchema) before this
      // component ever receives it; see that schema's doc comment.
      dangerouslySetInnerHTML={{ __html: layer.markup }}
    />
  );
};

const MOTION_GRAPHIC_SHAPE_PATHS: Record<
  RemotionMotionGraphicLayer["shape"],
  React.ReactNode
> = {
  circle: <circle cx="50" cy="50" r="42" />,
  rect: <rect x="8" y="8" width="84" height="84" rx="10" />,
  triangle: <polygon points="50,6 94,92 6,92" />,
  star: (
    <polygon points="50,4 61,37 96,37 68,58 79,92 50,71 21,92 32,58 4,37 39,37" />
  ),
};

const MotionGraphicLayerContent: React.FC<{
  layer: RemotionMotionGraphicLayer;
}> = ({ layer }) => {
  const frame = useCurrentFrame();
  let transform = "none";
  if (layer.loopAnimation === "spin") {
    transform = `rotate(${frame * 4}deg)`;
  } else if (layer.loopAnimation === "pulse") {
    const scale = 1 + 0.12 * Math.sin(frame / 8);
    transform = `scale(${scale})`;
  } else if (layer.loopAnimation === "bounce") {
    const translateY = 6 * Math.sin(frame / 6);
    transform = `translateY(${translateY}px)`;
  }
  return (
    <svg
      viewBox="0 0 100 100"
      style={{
        width: "100%",
        height: "100%",
        transform,
        transformOrigin: "center center",
      }}
    >
      <g fill={layer.color}>{MOTION_GRAPHIC_SHAPE_PATHS[layer.shape]}</g>
    </svg>
  );
};

const Scene3dLayerContent: React.FC<{
  layer: RemotionScene3dLayer;
  canvasWidth: number;
  canvasHeight: number;
}> = ({ layer, canvasWidth, canvasHeight }) => {
  const SceneComponent = REMOTION_SCENE_REGISTRY[layer.sceneId];
  if (!SceneComponent) {
    // Fall back to rendering nothing rather than crashing the whole render
    // — a `scene3d` layer referencing an id absent from the registry should
    // never happen (the Zod schema's `z.enum` rejects it before this point),
    // but this stays defensive rather than trusting that invariant blindly
    // at render time.
    console.warn(
      `[GenericTemplateComposition] scene3d layer "${layer.id}" references ` +
        `unknown sceneId "${layer.sceneId}" — rendering nothing for this layer.`
    );
    return null;
  }
  const pixelWidth = Math.max(1, Math.round((layer.width / 100) * canvasWidth));
  const pixelHeight = Math.max(
    1,
    Math.round((layer.height / 100) * canvasHeight)
  );
  return (
    <ThreeCanvas width={pixelWidth} height={pixelHeight}>
      <SceneComponent {...layer.props} />
    </ThreeCanvas>
  );
};

function layerContent(
  layer: RemotionLayer,
  fps: number,
  canvasWidth: number,
  canvasHeight: number
): React.ReactNode {
  switch (layer.type) {
    case "image":
      return <ImageLayerContent layer={layer} />;
    case "video":
      return <VideoLayerContent layer={layer} fps={fps} />;
    case "text":
      return <TextLayerContent layer={layer} />;
    case "svg":
      return <SvgLayerContent layer={layer} />;
    case "motionGraphic":
      return <MotionGraphicLayerContent layer={layer} />;
    case "scene3d":
      return (
        <Scene3dLayerContent
          layer={layer}
          canvasWidth={canvasWidth}
          canvasHeight={canvasHeight}
        />
      );
    default: {
      const exhaustiveCheck: never = layer;
      return exhaustiveCheck;
    }
  }
}

export const GenericTemplateComposition: React.FC<
  GenericTemplateInputProps
> = props => {
  const { fps } = useVideoConfig();
  const sortedLayers = [...props.layers].sort((a, b) => a.zIndex - b.zIndex);

  return (
    <AbsoluteFill style={{ backgroundColor: "#000000" }}>
      {sortedLayers.map(layer => (
        <Sequence
          key={layer.id}
          from={layer.startFrame}
          durationInFrames={layer.durationFrames}
          layout="none"
        >
          <div style={layerWrapperStyle(layer)}>
            {layerContent(layer, fps, props.width, props.height)}
          </div>
        </Sequence>
      ))}
    </AbsoluteFill>
  );
};
