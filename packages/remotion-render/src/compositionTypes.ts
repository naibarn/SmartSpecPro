/**
 * Generic (app-agnostic) `RemotionInputProps` types consumed by
 * `MarketplaceAutoReviewComposition.tsx`, plus a Zod schema
 * (`RemotionInputPropsSchema`) that strictly validates an already-mapped
 * `RemotionInputProps` object.
 *
 * These type definitions were MOVED here (unchanged) from
 * `apps/web/server/services/remotionCompositionService.ts` as part of the
 * `packages/remotion-render` extraction (see
 * planning/remotion-migration/plan.md Phase 10, "Sidecar contract").
 * `remotionCompositionService.ts` in `apps/web` still owns the actual
 * `HyperframesFinalCompositeConfig -> RemotionInputProps` mapping
 * (`buildRemotionInputProps`) and preset-support gate
 * (`assertRemotionPresetSupport`) — those stay in `apps/web` because they
 * depend on `apps/web/shared/hyperframes/runtimeApiSchemas.ts`, which is
 * NOT moved (frozen, app-specific contract, out of scope for this
 * extraction). `apps/web`'s `remotionCompositionService.ts` now imports
 * these types from this package instead of declaring them locally.
 *
 * `RemotionInputPropsSchema` is NEW (did not exist in `apps/web`) — it
 * exists specifically so the worker-app Remotion sidecar
 * (`renderFinalComposite.ts`) can strictly, fail-closed validate an
 * already-mapped `RemotionInputProps` manifest payload before rendering,
 * mirroring the strictness of the HyperFrames sidecar's `validateManifest()`.
 * It is NOT wired into `apps/web`'s existing render path (which builds and
 * consumes `RemotionInputProps` as a plain TS object, unchanged behavior).
 */
import { z } from "zod";

export interface RemotionSubtitleCueProps {
  startFrame: number;
  endFrame: number;
  text: string;
}

export interface RemotionShotProps {
  id: string;
  src: string;
  startFrame: number;
  durationFrames: number;
  trimBeforeFrames: number;
  trimAfterFrames: number;
  transitionIn: "fade" | "none";
  onScreenText: string[];
}

export interface RemotionInputProps {
  width: number;
  height: number;
  fps: number;
  durationInFrames: number;
  fontFamily: string;
  /**
   * URL of a staged Thai-capable font file served by the render workspace's
   * local asset server, to be registered via a CSS `@font-face` rule as
   * `fontFamily` inside the composition. `null` when no Thai font could be
   * resolved for this render (soft degrade — the composition falls back to
   * the browser default font).
   */
  fontFaceUrl: string | null;
  subtitleFontSizePx: number;
  subtitlePlacement: "bottom" | "lower_third";
  burnInSubtitles: boolean;
  preserveNativeAudio: boolean;
  shots: RemotionShotProps[];
  subtitleCues: RemotionSubtitleCueProps[];
  // Remotion's `Composition`/`CalculateMetadataFunction` generics require
  // Props to satisfy `Record<string, unknown>`; this index signature exists
  // only to satisfy that constraint (see `Root.tsx`), all real fields above
  // remain concretely typed for consumers.
  [key: string]: unknown;
}

export const RemotionShotPropsSchema = z
  .object({
    id: z.string().trim().min(1),
    // Deliberately permissive `.url()` (not `.startsWith("http")`-only):
    // this must accept `http://127.0.0.1:<port>/...` local-asset-server URLs
    // the same way `apps/web`'s existing render path already does.
    src: z.string().trim().url(),
    startFrame: z.number().int().min(0),
    durationFrames: z.number().int().min(1),
    trimBeforeFrames: z.number().int().min(0),
    trimAfterFrames: z.number().int().min(0),
    transitionIn: z.enum(["fade", "none"]),
    onScreenText: z.array(z.string()),
  })
  .strict();

export const RemotionSubtitleCuePropsSchema = z
  .object({
    startFrame: z.number().int().min(0),
    endFrame: z.number().int().min(0),
    text: z.string(),
  })
  .strict();

export const RemotionInputPropsSchema = z
  .object({
    width: z.number().int().min(1),
    height: z.number().int().min(1),
    fps: z.number().int().min(1),
    durationInFrames: z.number().int().min(1),
    fontFamily: z.string().trim().min(1),
    fontFaceUrl: z.string().trim().url().nullable(),
    subtitleFontSizePx: z.number().positive(),
    subtitlePlacement: z.enum(["bottom", "lower_third"]),
    burnInSubtitles: z.boolean(),
    preserveNativeAudio: z.boolean(),
    shots: z.array(RemotionShotPropsSchema).min(1),
    subtitleCues: z.array(RemotionSubtitleCuePropsSchema),
  })
  // `.passthrough()`, not `.strict()`: `RemotionInputProps` carries the
  // `[key: string]: unknown` index signature required by Remotion's
  // `CalculateMetadataFunction` generics — real callers (e.g.
  // `buildRemotionInputProps` in `apps/web`) never add extra keys today, but
  // this schema should not fail closed on a structurally-compatible object
  // that has them.
  .passthrough();
