/**
 * Remotion composition root/entry point, bundled by `@remotion/bundler`'s
 * `bundle()`. Registers two compositions under one root (a valid,
 * documented Remotion pattern — multiple `<Composition>` elements as
 * siblings in one fragment):
 *   - "MarketplaceAutoReview" — locked to `HyperframesFinalCompositeConfig`
 *     (unchanged, see `MarketplaceAutoReviewComposition.tsx`).
 *   - "GenericTemplate" — the generalized multi-layer template system (see
 *     `GenericTemplateComposition.tsx`).
 * Both compute their real width/height/fps/durationInFrames at render time
 * from validated inputProps via `calculateMetadata` (the `defaultProps`
 * below only matter for the Remotion Studio preview / static default case).
 *
 * MOVED (unchanged, aside from import paths) from
 * `apps/web/server/remotion/Root.tsx` as part of the `packages/remotion-render`
 * extraction (see planning/remotion-migration/plan.md Phase 10, "Sidecar
 * contract"). This file's on-disk path (exposed as `ROOT_ENTRY_POINT` in
 * `index.ts`) is used directly as `@remotion/bundler`'s `bundle({entryPoint})`
 * by BOTH `apps/web`'s `remotionRuntimeAdapter.ts` AND the worker-app
 * Remotion sidecar (`apps/worker-app/runtime-pack/remotion-sidecar/render.mjs`,
 * via `renderFinalComposite.ts`) — a single source of truth for the actual
 * React composition both consumers bundle and render.
 */
import React from "react";
import { Composition, registerRoot } from "remotion";
import type { CalculateMetadataFunction } from "remotion";

import { MarketplaceAutoReviewComposition } from "./MarketplaceAutoReviewComposition";
import { GenericTemplateComposition } from "./GenericTemplateComposition";
import type { RemotionInputProps } from "./compositionTypes";
import type { GenericTemplateInputProps } from "./genericTemplateInputProps";

export const MARKETPLACE_AUTO_REVIEW_COMPOSITION_ID =
  "MarketplaceAutoReview";
export const GENERIC_TEMPLATE_COMPOSITION_ID = "GenericTemplate";

const DEFAULT_INPUT_PROPS: RemotionInputProps = {
  width: 1080,
  height: 1920,
  fps: 30,
  durationInFrames: 30,
  fontFamily: "Prompt",
  fontFaceUrl: null,
  subtitleFontSizePx: 34,
  subtitlePlacement: "bottom",
  burnInSubtitles: true,
  preserveNativeAudio: true,
  shots: [],
  subtitleCues: [],
};

const calculateMetadata: CalculateMetadataFunction<RemotionInputProps> = ({
  props,
}) => ({
  durationInFrames: props.durationInFrames,
  fps: props.fps,
  width: props.width,
  height: props.height,
});

const DEFAULT_GENERIC_TEMPLATE_INPUT_PROPS: GenericTemplateInputProps = {
  id: "empty-template",
  name: "Empty template",
  width: 1080,
  height: 1920,
  fps: 30,
  durationInFrames: 30,
  layers: [],
};

const calculateGenericTemplateMetadata: CalculateMetadataFunction<
  GenericTemplateInputProps
> = ({ props }) => ({
  durationInFrames: props.durationInFrames,
  fps: props.fps,
  width: props.width,
  height: props.height,
});

export const RemotionRoot: React.FC = () => {
  return (
    <>
      <Composition
        id={MARKETPLACE_AUTO_REVIEW_COMPOSITION_ID}
        component={MarketplaceAutoReviewComposition}
        width={DEFAULT_INPUT_PROPS.width}
        height={DEFAULT_INPUT_PROPS.height}
        fps={DEFAULT_INPUT_PROPS.fps}
        durationInFrames={DEFAULT_INPUT_PROPS.durationInFrames}
        defaultProps={DEFAULT_INPUT_PROPS}
        calculateMetadata={calculateMetadata}
      />
      <Composition
        id={GENERIC_TEMPLATE_COMPOSITION_ID}
        component={GenericTemplateComposition}
        width={DEFAULT_GENERIC_TEMPLATE_INPUT_PROPS.width}
        height={DEFAULT_GENERIC_TEMPLATE_INPUT_PROPS.height}
        fps={DEFAULT_GENERIC_TEMPLATE_INPUT_PROPS.fps}
        durationInFrames={
          DEFAULT_GENERIC_TEMPLATE_INPUT_PROPS.durationInFrames
        }
        defaultProps={DEFAULT_GENERIC_TEMPLATE_INPUT_PROPS}
        calculateMetadata={calculateGenericTemplateMetadata}
      />
    </>
  );
};

registerRoot(RemotionRoot);
