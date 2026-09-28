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
 *
 * Feature 143 §4.4 — this is also the timeline editor's editing surface (the
 * spec forbids drawing a second, approximate canvas). The ONLY addition for
 * that reuse is the optional `playerRef`, forwarded straight through to
 * `<Player>`'s own imperative handle (`PlayerRef.seekTo`, etc. — see
 * `@remotion/player`'s `player-methods.d.ts`). Nothing else about this
 * component changes, so `RenderPanel.tsx`'s existing, ref-less usage is
 * untouched.
 */
import { useEffect, useMemo, useRef, useState, type ComponentType, type FC, type Ref } from "react";
import { Maximize2, Minimize2 } from "lucide-react";
import { Player, type PlayerRef } from "@remotion/player";
import { AbsoluteFill, Sequence } from "remotion";

import { Button } from "@astryxdesign/core/Button";

import { GenericTemplateComposition } from "../../../../server/remotion/GenericTemplateComposition";
import {
  buildGenericTemplateInputProps,
  type GenericTemplateInputProps,
} from "../../../../server/services/remotionTemplateService";
import type { RemotionTemplateConfig } from "@shared/remotion/layerTemplateSchemas";

type SegmentedTemplateInputProps = {
  parts: GenericTemplateInputProps[];
  [key: string]: unknown;
};

/** Concatenates compiler parts while keeping the same composition per part. */
export const SegmentedTemplateComposition: FC<SegmentedTemplateInputProps> = ({ parts }) => {
  let offset = 0;
  return (
    <AbsoluteFill style={{ backgroundColor: "#000000" }}>
      {parts.map((part, index) => {
        const durationInFrames = Math.max(1, part.durationInFrames);
        const from = offset;
        offset += durationInFrames;
        return (
          <Sequence key={`${part.id}-${index}`} from={from} durationInFrames={durationInFrames} layout="none">
            <GenericTemplateComposition {...part} />
          </Sequence>
        );
      })}
    </AbsoluteFill>
  );
};

export function RemotionProjectPreview({
  config,
  className,
  playerRef,
  controls = true,
  loop = true,
}: {
  config: RemotionTemplateConfig | RemotionTemplateConfig[];
  className?: string;
  /** Feature 143 §4.4 — optional imperative handle so a caller (the
   *  timeline stage) can drive the current frame from a playhead via
   *  `playerRef.current?.seekTo(frame)`. `undefined` for every other
   *  caller — behaviour is unchanged when omitted. */
  playerRef?: Ref<PlayerRef>;
  /** Feature 143 §4.4 — the timeline stage still wants transport controls,
   *  but keeps `loop` on by default like the render preview; both stay
   *  overridable per-caller rather than hardcoded twice. */
  controls?: boolean;
  loop?: boolean;
}) {
  const previewRef = useRef<HTMLDivElement>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const configs = useMemo(() => (Array.isArray(config) ? config : [config]), [config]);
  const firstConfig = configs[0];
  const isSegmented = configs.length > 1;
  const inputProps = useMemo(() => {
    if (isSegmented) return { parts: configs.map(buildGenericTemplateInputProps) } satisfies SegmentedTemplateInputProps;
    return buildGenericTemplateInputProps(firstConfig);
  }, [configs, firstConfig, isSegmented]);
  const durationInFrames = Math.max(1, configs.reduce((total, item) => total + Math.max(1, item.durationInFrames), 0));
  const composition = (isSegmented ? SegmentedTemplateComposition : GenericTemplateComposition) as ComponentType<Record<string, unknown>>;

  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(document.fullscreenElement === previewRef.current);
    };
    document.addEventListener("fullscreenchange", handleFullscreenChange);
    return () => document.removeEventListener("fullscreenchange", handleFullscreenChange);
  }, []);

  async function toggleFullscreen() {
    const element = previewRef.current;
    if (!element) return;
    try {
      if (document.fullscreenElement === element) {
        await document.exitFullscreen();
      } else {
        await element.requestFullscreen();
      }
    } catch {
      // Fullscreen can be refused by the browser or an embedded frame. The
      // inline preview remains usable in either case.
    }
  }

  return (
    <div
      ref={previewRef}
      data-testid="video-studio-remotion-preview"
      role="region"
      aria-label="ตัวอย่างวิดีโอแบบสด"
      className={`relative overflow-hidden bg-slate-950 ${isFullscreen ? "bg-black" : ""} ${className ?? ""}`}
      style={isFullscreen
        ? { width: "100vw", height: "100vh" }
        : {
            width: "100%",
            aspectRatio: `${firstConfig.width} / ${firstConfig.height}`,
            boxShadow: "0 24px 80px rgba(2, 6, 23, 0.34)",
          }}
    >
      <div className="pointer-events-none absolute left-3 top-3 z-10 flex items-center gap-2 rounded-full border border-white/15 bg-slate-950/70 px-2.5 py-1 text-[10px] font-medium tracking-wide text-white/80 backdrop-blur-md">
        <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 shadow-[0_0_10px_rgba(52,211,153,0.8)]" aria-hidden="true" />
        <span>Live preview</span>
        <span className="text-white/45">{firstConfig.width}×{firstConfig.height} · {firstConfig.fps} fps</span>
      </div>
      <Player
        ref={playerRef}
        component={composition}
        inputProps={inputProps as Record<string, unknown>}
        durationInFrames={durationInFrames}
        fps={firstConfig.fps}
        compositionWidth={firstConfig.width}
        compositionHeight={firstConfig.height}
        controls={controls}
        loop={loop}
        style={{ width: "100%", height: "100%", backgroundColor: "transparent" }}
      />
      <Button
        type="button"
        variant="secondary"
        size="sm"
        icon={isFullscreen ? <Minimize2 className="h-4 w-4" aria-hidden="true" /> : <Maximize2 className="h-4 w-4" aria-hidden="true" />}
        label={isFullscreen ? "ออกจากเต็มจอ" : "ขยายเต็มจอ"}
        aria-label={isFullscreen ? "ออกจากเต็มจอ" : "ขยายเต็มจอ"}
        onClick={() => void toggleFullscreen()}
        data-testid="video-studio-preview-fullscreen"
        className="absolute right-2 top-2 z-10 bg-black/70 text-white hover:bg-black/85"
      />
    </div>
  );
}
