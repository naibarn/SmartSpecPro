/**
 * Live in-browser preview for a compiled Video Intelligence project
 * (Feature 133, section-08 §10.2) using `@remotion/player`'s `<Player>` —
 * the same `GenericTemplateComposition` React component the server uses for
 * the real render (`server/remotion/GenericTemplateComposition.tsx`), so the
 * preview and the final render are guaranteed to look identical (no
 * duplicate/near-duplicate rendering logic). 2D `layer_pack` templates only
 * this phase — `scene3d` layers render through the same component (it
 * already handles them), no separate poster fallback needed (per this
 * section's authoritative instructions).
 *
 * `GenericTemplateComposition` lives under `server/remotion/` (server-only
 * directory by convention, but plain browser-safe React/TS with no Node
 * built-ins — verified before reuse), so this file imports it by relative
 * path rather than a path alias (none exists for `server/`).
 */
import { Player } from "@remotion/player";

import { GenericTemplateComposition } from "../../../../server/remotion/GenericTemplateComposition";
import { buildGenericTemplateInputProps } from "../../../../server/services/remotionTemplateService";
import type { RemotionTemplateConfig } from "@shared/remotion/layerTemplateSchemas";

export function RemotionProjectPreview({
  config,
  className,
}: {
  config: RemotionTemplateConfig;
  className?: string;
}) {
  const inputProps = buildGenericTemplateInputProps(config);
  const durationInFrames = Math.max(1, config.durationInFrames);

  return (
    <div
      data-testid="video-studio-remotion-preview"
      className={className}
      style={{ width: "100%", aspectRatio: `${config.width} / ${config.height}` }}
    >
      <Player
        component={GenericTemplateComposition}
        inputProps={inputProps}
        durationInFrames={durationInFrames}
        fps={config.fps}
        compositionWidth={config.width}
        compositionHeight={config.height}
        controls
        loop
        style={{ width: "100%", height: "100%" }}
      />
    </div>
  );
}
