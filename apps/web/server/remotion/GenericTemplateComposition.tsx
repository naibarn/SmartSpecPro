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
import React, { useEffect, useState } from "react";
import {
  AbsoluteFill,
  Audio,
  Img,
  OffthreadVideo,
  Sequence,
  continueRender,
  delayRender,
  interpolate,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { ThreeCanvas } from "@remotion/three";

import type {
  RemotionAudioLayer,
  RemotionLayer,
  RemotionMotionCompositionLayer,
  RemotionMotionGraphicLayer,
  RemotionScene3dLayer,
  RemotionSvgLayer,
  RemotionTextLayer,
} from "../../shared/remotion/layerTemplateSchemas";
import {
  isAllowlistedFontFamily,
  googleFontsCss2Url,
  type VideoStudioFontFamily,
} from "../../shared/remotion/fontAllowlist";
import { REMOTION_SCENE_REGISTRY } from "./scenes";
import { MotionCompositionLayerContent } from "./MotionCompositionContent";
import type { GenericTemplateInputProps } from "../services/remotionTemplateService";

const ENTER_FADE_FRAMES = 15;

/**
 * Feature 143 §4.10 (RK12 — "Thai text renders as tofu"). Ports
 * `MarketplaceAutoReviewComposition.tsx`'s `ThaiFontLoader` pattern
 * (`delayRender`/`continueRender`, Remotion's documented custom-font
 * mechanism) into this generic composition, which previously had ZERO font
 * registration for its `text` layers — whatever font Chromium happened to
 * have installed silently won, so Thai text (`Sarabun`/`Prompt`/etc.)
 * rendered as tofu or the wrong face with no error.
 *
 * Unlike `ThaiFontLoader` (which loads one KNOWN local file staged by
 * `resolveAndStageRenderFont`'s `fc-match` host lookup), this loader has no
 * single physical font file to point `FontFace` at — `fontFamily` here is a
 * user-chosen family name from `VIDEO_STUDIO_FONT_ALLOWLIST`
 * (`shared/remotion/fontAllowlist.ts`), not a resolved path. It instead
 * injects the family's real Google Fonts CSS2 `<link>` (the same mechanism
 * an ordinary web page uses to load a Google Font) and blocks frame capture
 * until `document.fonts` reports the family as loaded (or the load fails —
 * soft-degrade, never blocks the render). A `fontFamily` NOT on the
 * allowlist is a no-op here (unblocks immediately) — the layer's inline
 * `fontFamily` CSS value is still applied, falling back to whatever
 * Chromium's default font is, exactly the pre-existing (undocumented)
 * behavior for any font this loader doesn't recognize.
 */
const AllowlistedFontLoader: React.FC<{ family: VideoStudioFontFamily }> = ({
  family,
}) => {
  const [handle] = useState(() =>
    delayRender(`Loading allowlisted font "${family}"`)
  );

  useEffect(() => {
    let cancelled = false;
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = googleFontsCss2Url(family);
    document.head.appendChild(link);

    Promise.resolve(document.fonts.load(`16px "${family}"`))
      .then(() => document.fonts.ready)
      .then(() => {
        if (!cancelled) continueRender(handle);
      })
      .catch(() => {
        // Soft-degrade: network hiccup, or Chromium couldn't parse the
        // response — proceed with the browser default font rather than
        // failing the render (matches `ThaiFontLoader`'s soft-degrade).
        if (!cancelled) continueRender(handle);
      });

    return () => {
      cancelled = true;
      link.remove();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return null;
};

/**
 * One `AllowlistedFontLoader` per DISTINCT allowlisted family actually used
 * by this config's `text` layers — never one per layer, and never for a
 * family that isn't on the allowlist (nothing to load for those).
 */
const DocumentFontLoaders: React.FC<{ layers: RemotionLayer[] }> = ({
  layers,
}) => {
  const families = new Set<VideoStudioFontFamily>();
  for (const layer of layers) {
    if (layer.type === "text" && isAllowlistedFontFamily(layer.fontFamily)) {
      families.add(layer.fontFamily);
    }
  }
  return (
    <>
      {[...families].map(family => (
        <AllowlistedFontLoader key={family} family={family} />
      ))}
    </>
  );
};

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
  const scrollProgress =
    layer.animation === "scrollUp"
      ? interpolate(
          frame,
          [0, Math.max(1, layer.durationFrames - 1)],
          [
            layer.animationFromYPercent ?? 105,
            layer.animationToYPercent ?? -115,
          ],
          { extrapolateLeft: "clamp", extrapolateRight: "clamp" }
        )
      : 0;
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
        overflow: layer.animation === "scrollUp" ? "hidden" : undefined,
        position: "relative",
      }}
    >
      <span
        style={{
          fontFamily: layer.fontFamily,
          fontSize: layer.fontSizePx,
          fontWeight: layer.fontWeight === "bold" ? 700 : 400,
          color: layer.color,
          textAlign: layer.textAlign,
          lineHeight: 1.15,
          letterSpacing: "0.01em",
          textShadow: "0 2px 10px rgba(2, 6, 23, 0.42)",
          whiteSpace: "pre-wrap",
          overflowWrap: "anywhere",
          ...(layer.animation === "scrollUp"
            ? {
                position: "absolute",
                left: 0,
                right: 0,
                top: 0,
                transform: `translateY(${scrollProgress}%)`,
              }
            : {}),
        }}
      >
        {layer.content}
      </span>
    </div>
  );
};

const SvgLayerContent: React.FC<{ layer: RemotionSvgLayer }> = ({ layer }) => {
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

function svgIdForLayer(layerId: string): string {
  return `motion-${layerId.replace(/[^a-zA-Z0-9_-]/g, "-")}`;
}

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
  const svgId = svgIdForLayer(layer.id);
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
      <defs>
        <linearGradient id={`${svgId}-fill`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor={layer.color} stopOpacity="0.98" />
          <stop offset="0.52" stopColor={layer.color} stopOpacity="0.78" />
          <stop offset="1" stopColor="#020617" stopOpacity="0.92" />
        </linearGradient>
        <linearGradient id={`${svgId}-shine`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#ffffff" stopOpacity="0.34" />
          <stop offset="0.42" stopColor="#ffffff" stopOpacity="0.06" />
          <stop offset="1" stopColor="#ffffff" stopOpacity="0" />
        </linearGradient>
        <filter
          id={`${svgId}-shadow`}
          x="-20%"
          y="-20%"
          width="140%"
          height="150%"
        >
          <feDropShadow
            dx="0"
            dy="3"
            stdDeviation="3"
            floodColor="#020617"
            floodOpacity="0.34"
          />
        </filter>
      </defs>
      <g
        fill={`url(#${svgId}-fill)`}
        stroke="#ffffff"
        strokeOpacity="0.18"
        strokeWidth="0.8"
        filter={`url(#${svgId}-shadow)`}
      >
        {MOTION_GRAPHIC_SHAPE_PATHS[layer.shape]}
      </g>
      {layer.shape === "rect" ? (
        <rect
          x="8"
          y="8"
          width="84"
          height="34"
          rx="10"
          fill={`url(#${svgId}-shine)`}
          pointerEvents="none"
        />
      ) : null}
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

const MotionCompositionLayer: React.FC<{
  layer: RemotionMotionCompositionLayer;
}> = ({ layer }) => <MotionCompositionLayerContent layer={layer} />;

/**
 * `<Audio>` has no visual box, so this layer type ignores `x`/`y`/`width`/
 * `height` entirely (those fields still exist on the schema for consistency
 * with every other variant — see `RemotionAudioLayerSchema`'s doc comment).
 * `volume` is a per-frame envelope: `fadeInMs`/`fadeOutMs` are converted to
 * frames via `fps` and interpolated the same way every other layer derives
 * per-frame values from `useCurrentFrame()`.
 */
const AudioLayerContent: React.FC<{
  layer: RemotionAudioLayer;
  fps: number;
}> = ({ layer, fps }) => {
  const frame = useCurrentFrame();
  const fadeInFrames = Math.round((layer.fadeInMs / 1000) * fps);
  const fadeOutFrames = Math.round((layer.fadeOutMs / 1000) * fps);
  const fadeInEndFrame = Math.min(fadeInFrames, layer.durationFrames);
  const fadeOutStartFrame = Math.max(
    fadeInEndFrame,
    layer.durationFrames - fadeOutFrames
  );

  let envelope = 1;
  if (fadeInFrames > 0 && frame < fadeInEndFrame) {
    envelope = interpolate(frame, [0, fadeInEndFrame], [0, 1], {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
    });
  } else if (fadeOutFrames > 0 && frame > fadeOutStartFrame) {
    envelope = interpolate(
      frame,
      [fadeOutStartFrame, layer.durationFrames],
      [1, 0],
      { extrapolateLeft: "clamp", extrapolateRight: "clamp" }
    );
  }

  return (
    <Audio
      src={layer.src}
      volume={layer.volume * envelope}
      loop={layer.loop}
      trimBefore={Math.max(0, Math.round(layer.trimStartSec * fps))}
    />
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
    case "motionComposition":
      return <MotionCompositionLayer layer={layer} />;
    case "scene3d":
      return (
        <Scene3dLayerContent
          layer={layer}
          canvasWidth={canvasWidth}
          canvasHeight={canvasHeight}
        />
      );
    case "audio":
      return <AudioLayerContent layer={layer} fps={fps} />;
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
    <AbsoluteFill
      style={{
        backgroundColor: "#070b14",
        backgroundImage:
          "radial-gradient(circle at 16% 12%, rgba(59, 130, 246, 0.16), transparent 34%), radial-gradient(circle at 88% 82%, rgba(168, 85, 247, 0.12), transparent 38%), linear-gradient(135deg, #0b1220 0%, #05070d 58%, #111827 100%)",
      }}
    >
      <DocumentFontLoaders layers={props.layers} />
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
