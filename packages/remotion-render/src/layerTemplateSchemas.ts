/**
 * Zod schemas for the generic, template-driven Remotion multi-layer
 * composition system.
 *
 * MOVED from `apps/web/shared/remotion/layerTemplateSchemas.ts` as part of
 * the `packages/remotion-render` extraction (see
 * planning/remotion-migration/plan.md Phase 10, "Sidecar contract"). This is
 * intentionally separate from `apps/web/shared/hyperframes/runtimeApiSchemas.ts`'s
 * `HyperframesFinalCompositeConfigSchema`, which stays frozen in `apps/web`
 * and only powers `MarketplaceAutoReviewComposition.tsx`.
 *
 * A `RemotionTemplateConfig` describes an arbitrary number of independently
 * timed/positioned `layers[]` — still images, real video, text, inline SVG
 * motion graphics, declarative motion-graphic shapes, and vetted R3F/Three.js
 * 3D scenes — composed on one timeline. Layout/content/timing is fully
 * data-driven (a "template"): the same `GenericTemplateComposition.tsx`
 * renders any valid config, no per-template code required.
 *
 * DRIFT WARNING (corrected 2026-08-03, Feature 143 RK1): despite the
 * "MOVED"/re-export language above, `apps/web/shared/remotion/
 * layerTemplateSchemas.ts` does NOT re-export from this module — it is an
 * independent, hand-duplicated copy of the same schema code (the two files'
 * code must stay byte-identical modulo comments; only the doc comments are
 * allowed to differ). This was a stale claim left over from an earlier,
 * never-completed unification plan. There is no automated guard against the
 * two copies drifting apart other than
 * `apps/web/shared/remotion/__tests__/layerTemplateSchemasSync.test.ts`
 * (added alongside this correction) — see that test for why a byte-diff
 * (rather than a schema-shape diff) is the robust check, and RK1 in
 * `specs/feature/143-video-studio-layer-timeline-editor/spec.md` for the
 * full rationale. Any change to either file's schema code MUST be applied
 * to both, in lockstep, together with a `platformContractVersion` bump
 * (`remotionRenderVideoSchema.ts`) and updated golden fixtures
 * (`apps/web/shared/__fixtures__/remotionRenderVideoWorkerInput-*.json`).
 */
import { z } from "zod";

import { REMOTION_SCENE_IDS } from "./sceneRegistryIds";

const MAX_LAYERS = 40;

/** Percent-of-canvas coordinate/size field (0-100). */
const PercentSchema = z.number().min(0).max(100);

/**
 * Minimal, defense-in-depth inline-SVG markup guard for the `svg` layer
 * type. This markup renders inside a headless-Chromium render worker
 * process (never served directly to end-user browsers over the public
 * web), but per the design brief it must still be validated rather than
 * trusted blindly, even in a worker context — mirrors the reject-list
 * approach `hyperframesCompositionSanitizer.ts`'s `sanitizeHyperframesText`
 * uses to strip the same three patterns (there it strips; here, for raw SVG
 * markup that must remain visually intact, we reject the whole layer
 * instead of mangling the markup).
 */
const UNSAFE_SVG_PATTERNS = [
  /<script[\s>]/i,
  /<\/script>/i,
  /\son[a-z]+\s*=/i,
  /javascript:/i,
];

export function isSafeInlineSvgMarkup(markup: string): boolean {
  return !UNSAFE_SVG_PATTERNS.some(pattern => pattern.test(markup));
}

const RemotionLayerBaseSchema = z.object({
  id: z.string().trim().min(1).max(128),
  startFrame: z.number().int().min(0),
  durationFrames: z.number().int().min(1),
  x: PercentSchema,
  y: PercentSchema,
  width: PercentSchema,
  height: PercentSchema,
  rotationDeg: z.number().default(0),
  opacity: z.number().min(0).max(1).default(1),
  zIndex: z.number().int().default(0),
  // Feature 143 §4.8 (Video Studio layer/timeline editor) — additive,
  // cross-package fields on every layer type. ALL FOUR MUST STAY
  // `.optional()`, never `.default()`: a `.default()` would make the field
  // required in the inferred output type and break every existing
  // construction site across the codebase (this exact mistake was already
  // made and reverted once during the motion-variants work). A document
  // authored before this change simply parses with these fields
  // `undefined` — every reader must treat `undefined` the same as the
  // field's "off" state (`hidden` -> visible, `locked` -> unlocked, `role`
  // -> unbanded, `name` -> no label).
  /** Human-readable label for the layers list / timeline UI. Never used by
   *  the compiler or renderer — display-only. */
  name: z.string().trim().min(1).max(200).optional(),
  /** Author-set lock — when true, server-side AI repair stages (QA safe-area
   *  clamp, decorative-layer budget deletion) must skip this layer entirely
   *  (§4.9.1). This is the ONLY mechanism protecting a hand-authored layer
   *  from automated mutation, so it must be honoured wherever those stages
   *  read layers, not just decoratively rendered in the UI. */
  locked: z.boolean().optional(),
  /** Author-set visibility — when true, `compileVideoProject` must exclude
   *  this layer from the compiled output entirely (never emit a
   *  zero-opacity/zero-size layer instead), and the layer must not count
   *  against the 40-layer budget. See
   *  `server/services/videoProjectCompiler.ts`'s `rawLayers` construction. */
  hidden: z.boolean().optional(),
  /** Explicit band assignment (§4.1's zIndex-band projection) so the
   *  timeline UI's track assignment survives a round-trip without having to
   *  re-derive it from `zIndex` alone, and so server-side logic (e.g. the
   *  §4.9.1 safe-area exemption for full-bleed backgrounds) can reason about
   *  authorial intent directly instead of guessing from geometry. Purely a
   *  UI/authoring convention — the compiler and renderer do not branch on
   *  it today. */
  role: z.enum(["background", "overlay", "brand"]).optional(),
});

const RemotionImageLayerSchema = RemotionLayerBaseSchema.extend({
  type: z.literal("image"),
  src: z.string().trim().url().max(4096),
  fit: z.enum(["cover", "contain", "fill"]).default("cover"),
}).strict();

const RemotionVideoLayerSchema = RemotionLayerBaseSchema.extend({
  type: z.literal("video"),
  src: z.string().trim().url().max(4096),
  trimStartSec: z.number().min(0).default(0),
  volume: z.number().min(0).max(1).default(1),
  muted: z.boolean().default(false),
}).strict();

const RemotionTextLayerSchema = RemotionLayerBaseSchema.extend({
  type: z.literal("text"),
  content: z.string().max(2000),
  fontFamily: z.string().trim().min(1).max(160).default("Inter"),
  fontSizePx: z.number().positive().max(1000).default(48),
  color: z.string().trim().min(1).max(64).default("#ffffff"),
  textAlign: z.enum(["left", "center", "right"]).default("center"),
  fontWeight: z.enum(["normal", "bold"]).default("normal"),
}).strict();

const RemotionSvgLayerSchema = RemotionLayerBaseSchema.extend({
  type: z.literal("svg"),
  markup: z
    .string()
    .max(20000)
    .refine(isSafeInlineSvgMarkup, {
      message:
        'SVG markup rejected: contains "<script", an event-handler ' +
        'attribute (on*=), or a "javascript:" URI.',
    }),
  animation: z
    .enum(["none", "fadeIn", "drawPath", "pulse"])
    .default("none"),
}).strict();

const RemotionMotionGraphicLayerSchema = RemotionLayerBaseSchema.extend({
  type: z.literal("motionGraphic"),
  shape: z.enum(["circle", "rect", "triangle", "star"]).default("circle"),
  color: z.string().trim().min(1).max(64).default("#ffffff"),
  loopAnimation: z
    .enum(["spin", "pulse", "bounce", "none"])
    .default("spin"),
}).strict();

/**
 * A procedural visual system is intentionally one layer from the editor's
 * point of view. Its internal particles/nodes are generated by a closed
 * renderer registry, never supplied as executable code. The generic props
 * envelope is bounded here; each registered composition applies a stricter
 * schema before rendering.
 */
export const REMOTION_MOTION_COMPOSITION_IDS = [
  "particle-field",
  "network-graph",
] as const;

const RemotionMotionCompositionPropsSchema = z
  .record(z.string(), z.unknown())
  .refine(value => JSON.stringify(value).length <= 20_000, {
    message: "Motion composition props exceed the 20KB limit",
  });

const RemotionMotionCompositionLayerSchema = RemotionLayerBaseSchema.extend({
  type: z.literal("motionComposition"),
  compositionId: z.enum(REMOTION_MOTION_COMPOSITION_IDS),
  props: RemotionMotionCompositionPropsSchema,
}).strict();

const RemotionScene3dPropValueSchema = z.union([
  z.string(),
  z.number(),
  z.boolean(),
  z.array(
    z
      .object({
        frame: z.number().int().min(0).max(180_000),
        kind: z.enum(["enter", "emphasis", "reveal", "transition"]),
        strength: z.number().min(0).max(1).optional(),
      })
      .strict(),
  ),
]);

const RemotionScene3dLayerSchema = RemotionLayerBaseSchema.extend({
  type: z.literal("scene3d"),
  // Hard security constraint (not a style preference): only ids from the
  // fixed, vetted scene registry are accepted — no arbitrary/unregistered
  // 3D scene code can ever reach the render worker via this schema.
  sceneId: z.enum(REMOTION_SCENE_IDS),
  props: z.record(RemotionScene3dPropValueSchema).default({}),
}).strict();

/**
 * Additive `audio` variant (Feature 133, Phase 1 MVP — see
 * `specs/feature/133-content-video-intelligence-platform/sections/section-01-neutral-schema-audio-layer-compiler.md`
 * §4.2). Closes the Phase-7 "no audio layer" gap for narration/music/SFX.
 * `<Audio>` has no visual box, so the inherited `x`/`y`/`width`/`height`
 * base fields are present (schema consistency with every other variant) but
 * ignored at render time — see `AudioLayerContent` in
 * `GenericTemplateComposition.tsx`.
 *
 * SYNCED from `apps/web/shared/remotion/layerTemplateSchemas.ts` (2026-07-30,
 * worker-app-remotion-render-video P1) — that file independently declared
 * this variant ahead of this package (pre-existing drift: apps/web's Lane A
 * render worker has never actually been rewired onto this package, see this
 * package's module doc comment; the `remotion_render_video` job contract's
 * `remotionTemplate` field needs the audio layer type here too, since this
 * package is now the sidecar's ONLY source for `RemotionTemplateConfigSchema`
 * — see `remotionRenderVideoSchema.ts`). Keep byte-identical if either copy
 * changes until the two `layerTemplateSchemas.ts` files are fully unified.
 */
const RemotionAudioLayerSchema = RemotionLayerBaseSchema.extend({
  type: z.literal("audio"),
  src: z.string().trim().url().max(4096),
  trimStartSec: z.number().min(0).default(0),
  volume: z.number().min(0).max(1).default(1),
  loop: z.boolean().default(false),
  fadeInMs: z.number().int().min(0).default(0),
  fadeOutMs: z.number().int().min(0).default(0),
}).strict();

export const RemotionLayerSchema = z.discriminatedUnion("type", [
  RemotionImageLayerSchema,
  RemotionVideoLayerSchema,
  RemotionTextLayerSchema,
  RemotionSvgLayerSchema,
  RemotionMotionGraphicLayerSchema,
  RemotionMotionCompositionLayerSchema,
  RemotionScene3dLayerSchema,
  RemotionAudioLayerSchema,
]);

export type RemotionLayer = z.infer<typeof RemotionLayerSchema>;
export type RemotionImageLayer = z.infer<typeof RemotionImageLayerSchema>;
export type RemotionVideoLayer = z.infer<typeof RemotionVideoLayerSchema>;
export type RemotionTextLayer = z.infer<typeof RemotionTextLayerSchema>;
export type RemotionSvgLayer = z.infer<typeof RemotionSvgLayerSchema>;
export type RemotionMotionGraphicLayer = z.infer<
  typeof RemotionMotionGraphicLayerSchema
>;
export type RemotionMotionCompositionLayer = z.infer<
  typeof RemotionMotionCompositionLayerSchema
>;
export type RemotionScene3dLayer = z.infer<typeof RemotionScene3dLayerSchema>;
export type RemotionAudioLayer = z.infer<typeof RemotionAudioLayerSchema>;

export const RemotionTemplateConfigSchema = z
  .object({
    id: z.string().trim().min(1).max(128),
    name: z.string().trim().min(1).max(200),
    width: z.number().int().min(320).max(4096).default(1080),
    height: z.number().int().min(320).max(4096).default(1920),
    fps: z.number().int().min(12).max(60).default(30),
    durationInFrames: z.number().int().min(1),
    layers: z.array(RemotionLayerSchema).max(MAX_LAYERS),
  })
  .strict();

export type RemotionTemplateConfig = z.infer<
  typeof RemotionTemplateConfigSchema
>;
