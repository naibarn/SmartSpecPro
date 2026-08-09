/**
 * Remotion composition for the Marketplace Auto-Review video pipeline.
 *
 * MOVED (unchanged) from
 * `apps/web/server/remotion/MarketplaceAutoReviewComposition.tsx` as part of
 * the `packages/remotion-render` extraction (see
 * planning/remotion-migration/plan.md Phase 10, "Sidecar contract").
 *
 * Phase 2 of the migration plan — supports ONLY the schema-default preset
 * combination (see `apps/web/server/services/remotionCompositionService.ts`'s
 * `assertRemotionPresetSupport`): `fade`/`none` transitions, `smooth_reveal`
 * shot animation, `stagger_rise` on-screen-text motion, and `classic_box`
 * burned-in subtitles. This does not aim for pixel parity with the
 * HyperFrames CSS/GSAP renderer — it is a real, visible, timed
 * Remotion-native implementation of the same preset intent.
 */
import React, { useEffect, useState } from "react";
import {
  AbsoluteFill,
  OffthreadVideo,
  continueRender,
  delayRender,
  interpolate,
  useCurrentFrame,
} from "remotion";
import { TransitionSeries, linearTiming } from "@remotion/transitions";
import { fade } from "@remotion/transitions/fade";

import type {
  RemotionInputProps,
  RemotionShotProps,
  RemotionSubtitleCueProps,
} from "./compositionTypes";

/** Frames spent on the shot-enter opacity/scale reveal ("smooth_reveal"). */
const REVEAL_FRAMES = 15;
/** Frames spent per on-screen-text line's fade+rise-in ("stagger_rise"). */
const TEXT_RISE_FRAMES = 12;
/** Stagger delay (frames) between successive on-screen-text lines. */
const TEXT_STAGGER_FRAMES = 6;
/** Fade-transition length between shots, capped by the shorter neighbor. */
const MAX_TRANSITION_FRAMES = 6;

function transitionFramesBetween(
  previous: RemotionShotProps,
  next: RemotionShotProps
): number {
  return Math.max(
    1,
    Math.min(
      MAX_TRANSITION_FRAMES,
      Math.floor(previous.durationFrames / 2),
      Math.floor(next.durationFrames / 2)
    )
  );
}

/**
 * Loads the staged Thai-capable font (see `apps/web`'s
 * `remotionRuntimeAdapter.ts`'s `resolveAndStageRenderFont`, served over the
 * render workspace's local asset server) via the browser `FontFace` API, and
 * blocks frame capture (`delayRender`/`continueRender` — Remotion's
 * documented pattern for custom/local fonts, see
 * https://www.remotion.dev/docs/fonts) until the font has actually loaded
 * into `document.fonts`. Renders nothing itself; `fontFamily` is then usable
 * as a plain CSS `font-family` value by sibling elements once loading
 * completes.
 *
 * No-op (immediately unblocks capture) when `fontFaceUrl` is `null` — the
 * soft-degrade case where no Thai font could be resolved at render time. In
 * that case elements referencing `fontFamily` simply fall back to the
 * browser's default font.
 */
const ThaiFontLoader: React.FC<{
  fontFamily: string;
  fontFaceUrl: string | null;
}> = ({ fontFamily, fontFaceUrl }) => {
  const [handle] = useState(() =>
    delayRender(`Loading render font "${fontFamily}"`)
  );

  useEffect(() => {
    if (!fontFaceUrl) {
      continueRender(handle);
      return;
    }
    let cancelled = false;
    const fontFace = new FontFace(fontFamily, `url("${fontFaceUrl}")`);
    fontFace
      .load()
      .then(loaded => {
        if (cancelled) return;
        // Some TypeScript DOM lib versions omit FontFaceSet#add even though
        // Chromium implements it. Keep the runtime call while describing the
        // small browser surface this composition relies on.
        (document.fonts as unknown as { add(font: FontFace): void }).add(loaded);
        continueRender(handle);
      })
      .catch(() => {
        // Soft-degrade: font failed to load (network hiccup on the local
        // asset server, unsupported font format, etc.) — proceed with the
        // browser default font rather than failing the render.
        if (!cancelled) continueRender(handle);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return null;
};

const OnScreenTextLayer: React.FC<{
  lines: string[];
  fontFamily: string;
}> = ({ lines, fontFamily }) => {
  const frame = useCurrentFrame();
  if (lines.length === 0) return null;
  return (
    <AbsoluteFill
      style={{
        justifyContent: "flex-start",
        alignItems: "center",
        paddingTop: "10%",
      }}
    >
      {lines.map((line, index) => {
        const localFrame = frame - index * TEXT_STAGGER_FRAMES;
        const opacity = interpolate(
          localFrame,
          [0, TEXT_RISE_FRAMES],
          [0, 1],
          { extrapolateLeft: "clamp", extrapolateRight: "clamp" }
        );
        const translateY = interpolate(
          localFrame,
          [0, TEXT_RISE_FRAMES],
          [28, 0],
          { extrapolateLeft: "clamp", extrapolateRight: "clamp" }
        );
        return (
          <div
            key={`${index}-${line}`}
            style={{
              opacity,
              transform: `translateY(${translateY}px)`,
              fontFamily,
              fontSize: 40,
              fontWeight: 700,
              color: "#ffffff",
              textShadow: "0 2px 10px rgba(0,0,0,0.6)",
              marginBottom: 12,
              textAlign: "center",
              padding: "0 6%",
            }}
          >
            {line}
          </div>
        );
      })}
    </AbsoluteFill>
  );
};

const ShotLayer: React.FC<{
  shot: RemotionShotProps;
  fontFamily: string;
}> = ({ shot, fontFamily }) => {
  const frame = useCurrentFrame();
  const revealFrames = Math.min(REVEAL_FRAMES, shot.durationFrames);
  const opacity = interpolate(frame, [0, revealFrames], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const scale = interpolate(frame, [0, revealFrames], [1.04, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  return (
    <AbsoluteFill style={{ opacity, backgroundColor: "#000" }}>
      <AbsoluteFill style={{ transform: `scale(${scale})` }}>
        <OffthreadVideo
          src={shot.src}
          {...(shot.trimBeforeFrames > 0
            ? { trimBefore: shot.trimBeforeFrames }
            : {})}
          {...(shot.trimAfterFrames > 0
            ? { trimAfter: shot.trimAfterFrames }
            : {})}
          style={{ width: "100%", height: "100%", objectFit: "cover" }}
        />
      </AbsoluteFill>
      <OnScreenTextLayer lines={shot.onScreenText} fontFamily={fontFamily} />
    </AbsoluteFill>
  );
};

const SubtitleOverlay: React.FC<{
  cues: RemotionSubtitleCueProps[];
  placement: "bottom" | "lower_third";
  fontFamily: string;
  fontSizePx: number;
}> = ({ cues, placement, fontFamily, fontSizePx }) => {
  const frame = useCurrentFrame();
  const active = cues.find(
    cue => frame >= cue.startFrame && frame < cue.endFrame
  );
  if (!active) return null;

  return (
    <AbsoluteFill
      style={{
        justifyContent: "flex-end",
        alignItems: "center",
        paddingBottom: placement === "lower_third" ? "30%" : "6%",
      }}
    >
      {/* "classic_box" subtitle preset: semi-opaque rounded box behind text */}
      <div
        style={{
          maxWidth: "86%",
          padding: "14px 22px",
          borderRadius: 14,
          backgroundColor: "rgba(0,0,0,0.72)",
          color: "#ffffff",
          fontFamily,
          fontSize: fontSizePx,
          fontWeight: 600,
          textAlign: "center",
          lineHeight: 1.3,
        }}
      >
        {active.text}
      </div>
    </AbsoluteFill>
  );
};

function buildTransitionChildren(
  shots: RemotionShotProps[],
  fontFamily: string
): React.ReactNode[] {
  const children: React.ReactNode[] = [];
  shots.forEach((shot, index) => {
    const previous = index > 0 ? shots[index - 1] : undefined;
    if (previous && shot.transitionIn === "fade") {
      children.push(
        <TransitionSeries.Transition
          key={`transition-${shot.id}`}
          presentation={fade()}
          timing={linearTiming({
            durationInFrames: transitionFramesBetween(previous, shot),
          })}
        />
      );
    }
    children.push(
      <TransitionSeries.Sequence
        key={shot.id}
        durationInFrames={shot.durationFrames}
      >
        <ShotLayer shot={shot} fontFamily={fontFamily} />
      </TransitionSeries.Sequence>
    );
  });
  return children;
}

export const MarketplaceAutoReviewComposition: React.FC<
  RemotionInputProps
> = props => {
  const {
    shots,
    subtitleCues,
    subtitlePlacement,
    fontFamily,
    fontFaceUrl,
    subtitleFontSizePx,
    burnInSubtitles,
  } = props;

  return (
    <AbsoluteFill style={{ backgroundColor: "#000000" }}>
      <ThaiFontLoader fontFamily={fontFamily} fontFaceUrl={fontFaceUrl} />
      <TransitionSeries>
        {buildTransitionChildren(shots, fontFamily)}
      </TransitionSeries>
      {burnInSubtitles ? (
        <SubtitleOverlay
          cues={subtitleCues}
          placement={subtitlePlacement}
          fontFamily={fontFamily}
          fontSizePx={subtitleFontSizePx}
        />
      ) : null}
    </AbsoluteFill>
  );
};
