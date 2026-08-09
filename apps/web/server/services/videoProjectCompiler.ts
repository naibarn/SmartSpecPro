/**
 * Pure compiler turning a `VideoProjectDocument` (the neutral, renderer-
 * agnostic authoring format — `shared/videoIntelligence/projectSchemas.ts`)
 * into the frozen `RemotionTemplateConfig` the existing Remotion engine
 * already consumes (Feature 133, Phase 1 MVP). See
 * `specs/feature/133-content-video-intelligence-platform/sections/section-01-neutral-schema-audio-layer-compiler.md`
 * §4.3 for the normative algorithm this file implements.
 *
 * NO I/O — assets are already resolved into `ctx.assetResolver` by the
 * caller (section-07's router does the actual DB-backed resolution); this
 * file never touches the database, network, or filesystem.
 *
 * Steps: template expansion → caption-cue → text-layer → frame offset →
 * flatten + 40-layer split → re-validate every emitted part against
 * `RemotionTemplateConfigSchema` → cost estimate.
 */
import {
  RemotionTemplateConfigSchema,
  type RemotionLayer,
  type RemotionTemplateConfig,
} from "../../shared/remotion/layerTemplateSchemas";
import {
  VideoProjectDocumentSchema,
  type CaptionPresetId,
  type Scene,
  type VideoProjectDocument,
} from "../../shared/videoIntelligence/projectSchemas";
import type { BrandKit } from "../../shared/videoIntelligence/brandKit";
import type { ResolvedCatalogFacts } from "./validateProjectClaims";
import {
  estimateRenderCost,
  type RenderCostEstimate,
} from "../../shared/videoIntelligence/cost";
import { retimeScenesToNarrationAudio } from "./videoProjectNarrationTiming";

/* -------------------------------------------------------------------------- */
/* Public types (§2 — keep names/shapes exact, later sections import these)   */
/* -------------------------------------------------------------------------- */

export type TemplateBuildContext = {
  format: { width: number; height: number; fps: number; durationMs: number };
  brandKit: BrandKit | null;
  assetResolver: AssetResolver;
  /** Resolved catalog identity facts for deterministic product-fidelity
   * enforcement. Null for Motion Studio projects. */
  catalogFacts?: ResolvedCatalogFacts | null;
};

export type AssetResolver = {
  /** Throws when `assetId` cannot be resolved to a URL. */
  url(assetId: number | string): string;
  sha256(assetId: number | string): string | undefined;
};

export { type RenderCostEstimate };

/** Owned by section-01 per the cross-section consistency resolution #4
 *  (`sections/index.md`): `{ parts: { index, durationInFrames }[] }`. */
export type SegmentPlan = {
  parts: { index: number; durationInFrames: number }[];
};

export type CompileResult =
  | { kind: "single"; config: RemotionTemplateConfig; cost: RenderCostEstimate }
  | {
      kind: "segmented";
      parts: RemotionTemplateConfig[];
      concat: SegmentPlan;
      cost: RenderCostEstimate;
    };

export class VideoProjectCompileError extends Error {
  code:
    | "VI_DOCUMENT_INVALID"
    | "VI_TEMPLATE_UNKNOWN"
    | "VI_ASSET_UNRESOLVED"
    // Feature 143 §4.12 — document-wide `scene.layers[].id` uniqueness
    // violation, asserted at `saveDocument` (see
    // `assertDocumentLayerIdsUnique`, `videoProjectAssetResolver.ts`).
    | "VI_DUPLICATE_LAYER_ID";

  constructor(
    code: VideoProjectCompileError["code"],
    message: string
  ) {
    super(message);
    this.name = "VideoProjectCompileError";
    this.code = code;
  }
}

export class BrandLockViolationError extends Error {
  token: string;
  expected: string;
  actual: string;

  constructor(token: string, expected: string, actual: string) {
    super(
      `Brand lock violation: locked "${token}" expects "${expected}" but got "${actual}"`
    );
    this.name = "BrandLockViolationError";
    this.token = token;
    this.expected = expected;
    this.actual = actual;
  }
}

/* -------------------------------------------------------------------------- */
/* Motion Template Registry seam (section-02 owns the real registry)          */
/* -------------------------------------------------------------------------- */

/**
 * A single Motion Template's build function — section-02
 * (`server/remotion/templates/index.ts`) owns the real
 * `MOTION_TEMPLATE_REGISTRY` implementing this shape. Section-01's own tests
 * inject a small in-test fake here (per section-01 §2's "Dependency note")
 * rather than depending on section-02 code, which does not exist yet.
 */
export type MotionTemplateBuilder = {
  build(params: Record<string, unknown>, ctx: TemplateBuildContext): RemotionLayer[];
  /** Validates/normalizes `visual.params` before `build()` runs — a plain
   *  Zod-shaped `.parse`, kept structural so section-01 does not depend on
   *  `zod`'s `ZodType` export surface directly. */
  paramsSchema?: { parse(input: unknown): Record<string, unknown> };
};

export type TemplateRegistryLookup = (
  templateId: string
) => MotionTemplateBuilder | undefined;

export type CompileVideoProjectDeps = {
  /**
   * Resolves a `templateId` to its builder. Defaults to "no templates known"
   * (every `visual.kind === "template"` scene throws `VI_TEMPLATE_UNKNOWN`)
   * so `compileVideoProject(document, ctx)` stays callable with exactly the
   * two documented arguments (§2) before section-02 exists; once section-02
   * lands, callers (section-07's router) pass
   * `{ resolveTemplate: id => MOTION_TEMPLATE_REGISTRY[id] }` as the third,
   * optional argument. This is the smallest deviation from the documented
   * 2-arg signature: it is additive-only and every 2-arg call site keeps
   * working unchanged.
   */
  resolveTemplate?: TemplateRegistryLookup;
};

const NO_TEMPLATES_REGISTERED: TemplateRegistryLookup = () => undefined;

/* -------------------------------------------------------------------------- */
/* Small pure helpers                                                         */
/* -------------------------------------------------------------------------- */

const COMPILED_CONFIG_ID = "video_intelligence_compiled";
const COMPILED_CONFIG_NAME = "Video Intelligence Compiled Project";
const MAX_LAYERS_PER_CONFIG = 40;
/** Phase-1 simplification: an `sfx` audio event's clip length is not part of
 *  the neutral schema (only its start time is), so it gets a fixed nominal
 *  duration. Documented here rather than guessed silently. */
const SFX_DEFAULT_DURATION_MS = 2000;

function msToFrames(ms: number, fps: number): number {
  return Math.max(0, Math.round((ms / 1000) * fps));
}

/** Converts a dB gain value to a linear 0..1 volume multiplier, clamped to
 *  the `RemotionLayer` `volume` field's valid range. */
function dbToLinearVolume(gainDb: number): number {
  const linear = Math.pow(10, gainDb / 20);
  return Math.min(1, Math.max(0, linear));
}

type TaggedLayer = { layer: RemotionLayer; sceneIndex: number };

/** Caption preset -> text-layer style mapping. `no_subtitle_style` means
 *  "skip burn-in entirely" (mirrors `hyperframesRenderWorker.ts`'s own
 *  `no_subtitle_style` handling) — `null` here means "emit no caption
 *  layers for this preset". */
const CAPTION_PRESET_TEXT_STYLE: Record<
  CaptionPresetId,
  {
    fontFamily: string;
    fontSizePx: number;
    color: string;
    fontWeight: "normal" | "bold";
  } | null
> = {
  classic_box: {
    fontFamily: "Inter",
    fontSizePx: 44,
    color: "#ffffff",
    fontWeight: "normal",
  },
  minimal_shadow: {
    fontFamily: "Inter",
    fontSizePx: 42,
    color: "#ffffff",
    fontWeight: "normal",
  },
  creator_pop: {
    fontFamily: "Inter",
    fontSizePx: 48,
    color: "#ffe600",
    fontWeight: "bold",
  },
  karaoke_word: {
    fontFamily: "Inter",
    fontSizePx: 46,
    color: "#ffffff",
    fontWeight: "bold",
  },
  highlight_bar: {
    fontFamily: "Inter",
    fontSizePx: 44,
    color: "#000000",
    fontWeight: "bold",
  },
  lower_third: {
    fontFamily: "Inter",
    fontSizePx: 38,
    color: "#ffffff",
    fontWeight: "normal",
  },
  cinematic_wide: {
    fontFamily: "Inter",
    fontSizePx: 40,
    color: "#f5f5f5",
    fontWeight: "normal",
  },
  neon_glow: {
    fontFamily: "Inter",
    fontSizePx: 46,
    color: "#39ff14",
    fontWeight: "bold",
  },
  review_bubble: {
    fontFamily: "Inter",
    fontSizePx: 40,
    color: "#ffffff",
    fontWeight: "normal",
  },
  no_subtitle_style: null,
};

/* -------------------------------------------------------------------------- */
/* Step: template expansion + brand-token resolution                          */
/* -------------------------------------------------------------------------- */

function expandSceneVisual(
  scene: Scene,
  ctx: TemplateBuildContext,
  resolveTemplate: TemplateRegistryLookup
): RemotionLayer[] {
  if (scene.visual.kind !== "template") {
    return [];
  }
  const builder = resolveTemplate(scene.visual.templateId);
  if (!builder) {
    throw new VideoProjectCompileError(
      "VI_TEMPLATE_UNKNOWN",
      `Unknown templateId "${scene.visual.templateId}" in scene "${scene.sceneId}"`
    );
  }
  try {
    const params = builder.paramsSchema
      ? builder.paramsSchema.parse(scene.visual.params)
      : scene.visual.params;
    // Template builders are scene-local. Passing the full document duration
    // here makes procedural compositions keep running across later scenes,
    // which causes preview/render drift and makes segmented concatenation
    // duplicate or cut motion at scene boundaries.
    const sceneCtx: TemplateBuildContext = {
      ...ctx,
      format: {
        ...ctx.format,
        durationMs: Math.max(1, scene.endMs - scene.startMs),
      },
    };
    const templateLayers = avoidTemplateTextCaptionOverlap(builder.build(params, sceneCtx), scene);
    return syncVisualMotionToCaptionCues(templateLayers, scene, sceneCtx.format.fps);
  } catch (error) {
    // Phase-1 template builders are pure `layer_pack` builders with no I/O
    // of their own besides `ctx.assetResolver.url(...)` — the only thing
    // that should throw inside `build()` is an unresolved asset reference
    // (per section-01 §2's "Dependency note" + the compiler test's fake
    // template convention). Surface it as the specific, documented code
    // rather than letting an arbitrary error escape `compileVideoProject`.
    throw new VideoProjectCompileError(
      "VI_ASSET_UNRESOLVED",
      `Failed to build template "${scene.visual.templateId}" for scene ` +
        `"${scene.sceneId}": ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

/**
 * Template text and compiler-generated captions are two different visual
 * layers. A template may put its title/subtitle near the bottom of the frame,
 * while `buildCaptionLayers()` reserves that same lower safe area for the
 * spoken cue. Keep both pieces of approved copy, but move template-owned text
 * into a small header band whenever captions are present. This is deliberately
 * limited to template layers; hand-authored editor layers keep their exact
 * placement and remain the user's responsibility.
 */
function avoidTemplateTextCaptionOverlap(
  layers: RemotionLayer[],
  scene: Scene,
): RemotionLayer[] {
  if (scene.captionCues.length === 0) return layers;

  const captionTop = 72;
  let nextHeaderY = 8;
  return layers.map(layer => {
    if (layer.type === "motionComposition") {
      return {
        ...layer,
        props: {
          ...layer.props,
          captionSafeArea: true,
        },
      };
    }
    if (layer.type !== "text" || layer.y + layer.height <= captionTop) return layer;

    const height = Math.min(layer.height, captionTop - nextHeaderY - 1);
    const moved = {
      ...layer,
      y: nextHeaderY,
      height: Math.max(1, height),
    };
    nextHeaderY += moved.height + 1;
    return moved;
  });
}

/**
 * Motion is authored semantically by the template/LLM, but exact pacing is
 * deterministic: when a scene has aligned caption cues, visual layers that
 * have an entrance/loop animation restart at each spoken phrase boundary.
 * Video layers are deliberately excluded so a source clip is never replayed
 * unexpectedly.  `sync: "scene"` opts out for a calm/static treatment.
 */
function syncVisualMotionToCaptionCues(
  layers: RemotionLayer[],
  scene: Scene,
  fps: number,
): RemotionLayer[] {
  if (scene.motion.sync === "scene" || scene.captionCues.length === 0) return layers;

  const visualLayers = new Set<RemotionLayer["type"]>([
    "image",
    "svg",
    "motionGraphic",
    "motionComposition",
    "scene3d",
  ]);
  const sceneEndFrame = msToFrames(Math.max(0, scene.endMs - scene.startMs), fps);

  return layers.flatMap((layer) => {
    if (!visualLayers.has(layer.type)) return [layer];
    if (
      layer.type === "motionComposition" &&
      layer.props.syncPolicy !== "restart"
    ) {
      // Continuous/event-driven procedural systems keep one deterministic
      // particle/network field for the whole scene. Their event markers are
      // evaluated by the composition against the real narration frame, so
      // slicing the layer at every caption cue would reset the simulation and
      // create visible jumps. Explicit `restart` remains available for a
      // template that intentionally wants cue-boundary restarts.
      return [addCaptionCueEvents(layer, scene, fps)];
    }
    const layerStart = Math.max(0, layer.startFrame);
    const layerEnd = Math.min(sceneEndFrame, layerStart + layer.durationFrames);
    const slices = scene.captionCues.flatMap((cue, cueIndex) => {
      const cueStart = Math.max(layerStart, msToFrames(cue.startMs, fps));
      const cueEnd = Math.min(layerEnd, Math.max(cueStart + 1, msToFrames(cue.endMs, fps)));
      if (cueEnd <= cueStart) return [];
      return [{
        ...layer,
        id: `${layer.id}_cue_${cueIndex}`,
        startFrame: cueStart,
        durationFrames: Math.max(1, cueEnd - cueStart),
      }];
    });
    return slices.length > 0 ? slices : [layer];
  });
}

/**
 * Procedural templates may be selected manually without AI-generated event
 * markers. In narration-sync mode, derive a small bounded event list from the
 * real caption cue timestamps so the same Remotion composition still reacts to
 * the spoken beats. Explicit template/AI events always win.
 */
function addCaptionCueEvents(
  layer: Extract<RemotionLayer, { type: "motionComposition" }>,
  scene: Scene,
  fps: number,
): Extract<RemotionLayer, { type: "motionComposition" }> {
  if (Array.isArray(layer.props.events) && layer.props.events.length > 0) return layer;
  if (scene.captionCues.length === 0) return layer;

  const sceneDurationFrames = msToFrames(Math.max(0, scene.endMs - scene.startMs), fps);
  const events = scene.captionCues.slice(0, 32).map((cue, index) => ({
    frame: Math.min(
      sceneDurationFrames,
      msToFrames(Math.max(0, cue.startMs - scene.startMs), fps),
    ),
    kind: index === 0 ? ("enter" as const) : ("emphasis" as const),
    strength: index === 0 ? 1 : 0.8,
  }));

  return {
    ...layer,
    props: {
      ...layer.props,
      events,
      syncPolicy: "event",
    },
  };
}

/* -------------------------------------------------------------------------- */
/* Step: caption cues -> text layers                                          */
/* -------------------------------------------------------------------------- */

function buildCaptionLayers(
  scene: Scene,
  document: VideoProjectDocument
): RemotionLayer[] {
  if (document.captions.burnIn) {
    // Handled by the `ass_burn` post-pass (section-04) instead.
    return [];
  }
  const style = CAPTION_PRESET_TEXT_STYLE[document.captions.presetId];
  if (!style) {
    return [];
  }
  const fps = document.format.fps;
  return scene.captionCues.map((cue, index) => {
    const durationFrames = Math.max(
      1,
      msToFrames(cue.endMs - cue.startMs, fps)
    );
    // RESERVED compiler-generated id pattern (§4.12, see the CTA doc
    // comment above) — `${sceneId}_caption_${index}` must never be
    // generated by the editor for a hand-authored layer.
    return {
      id: `${scene.sceneId}_caption_${index}`,
      type: "text",
      startFrame: msToFrames(cue.startMs, fps),
      durationFrames,
      x: 5,
      y: 76,
      width: 90,
      height: 20,
      rotationDeg: 0,
      opacity: 1,
      zIndex: 900,
      content: cue.text,
      fontFamily: style.fontFamily,
      fontSizePx: style.fontSizePx,
      color: style.color,
      textAlign: "center",
      fontWeight: style.fontWeight,
    } satisfies RemotionLayer;
  });
}

/* -------------------------------------------------------------------------- */
/* Step: frame offset (scene-relative -> absolute)                            */
/* -------------------------------------------------------------------------- */

function offsetLayerToAbsoluteFrame(
  layer: RemotionLayer,
  scene: Scene,
  fps: number
): RemotionLayer {
  const sceneStartFrame = msToFrames(scene.startMs, fps);
  return { ...layer, startFrame: layer.startFrame + sceneStartFrame };
}

/* -------------------------------------------------------------------------- */
/* Step: scene narration + audio tracks -> audio layers                       */
/* -------------------------------------------------------------------------- */

/**
 * TTS writes the generated MP3 id to `scene.narrationAudioAssetId`. Keep that
 * scene-local timing when compiling so narration follows the same scene that
 * owns the spoken text. The generic audio-track path remains available for
 * hand-authored narration/music/SFX tracks; if the same asset is already
 * referenced by a document narration track, the track is authoritative and
 * we avoid emitting it twice.
 */
function buildSceneNarrationAudioLayers(
  document: VideoProjectDocument,
  ctx: TemplateBuildContext,
): RemotionLayer[] {
  const trackAssetRefs = new Set<number>();
  for (const track of document.audioTracks) {
    if (track.kind === "narration" || track.kind === "music") {
      for (const assetRef of track.assetRefs) {
        if (typeof assetRef === "number") trackAssetRefs.add(assetRef);
      }
    }
  }

  return document.scenes.flatMap((scene, sceneIndex) => {
    const assetId = scene.narrationAudioAssetId;
    if (assetId === null || trackAssetRefs.has(assetId)) return [];

    const startFrame = msToFrames(scene.startMs, document.format.fps);
    const durationMs = scene.narrationAudioDurationMs ?? Math.max(0, scene.endMs - scene.startMs);
    const durationFrames = Math.max(
      1,
      msToFrames(durationMs, document.format.fps),
    );
    return [{
      id: `audio_scene_narration_${sceneIndex}`,
      type: "audio",
      startFrame,
      durationFrames,
      x: 0,
      y: 0,
      width: 0,
      height: 0,
      rotationDeg: 0,
      opacity: 1,
      zIndex: 0,
      src: resolveAssetUrl(ctx, assetId, `scenes[${sceneIndex}].narrationAudioAssetId`),
      trimStartSec: 0,
      volume: 1,
      loop: false,
      fadeInMs: 0,
      fadeOutMs: 0,
    } satisfies RemotionLayer];
  });
}

function buildAudioTrackLayers(
  document: VideoProjectDocument,
  ctx: TemplateBuildContext
): RemotionLayer[] {
  const fps = document.format.fps;
  const totalDurationFrames = Math.max(
    1,
    msToFrames(document.format.durationMs, fps)
  );
  const layers: RemotionLayer[] = [];

  document.audioTracks.forEach((track, trackIndex) => {
    if (track.kind === "narration" || track.kind === "music") {
      // `ducking` (music only) applies a documented flat extra attenuation
      // rather than dynamic sidechain compression (out of scope for Phase 1
      // — no audio-analysis engine here). This constant (`-6`) is the one
      // the client's ducking toggle must label honestly (Feature 143 §4.8
      // note / §6) — it is NOT sidechain compression.
      const duckingAttenuationDb =
        track.kind === "music" && track.ducking ? -6 : 0;
      const volume = dbToLinearVolume(track.gainDb + duckingAttenuationDb);
      // Feature 143 §4.8 — honour the track's own `startMs`/`endMs` when
      // present; fall back to Phase-1's whole-document span when absent, so
      // every pre-existing document (which never set these) compiles to a
      // byte-identical `RemotionLayer` as before this change.
      const startFrame =
        track.startMs !== undefined ? msToFrames(track.startMs, fps) : 0;
      const endFrame =
        track.endMs !== undefined
          ? msToFrames(track.endMs, fps)
          : totalDurationFrames;
      const durationFrames = Math.max(1, endFrame - startFrame);
      // Fades honour the schema's own `fadeInMs`/`fadeOutMs` (§4.8) instead
      // of the previous hardcoded `0` — the renderer's per-frame envelope
      // (`AudioLayerContent`, `GenericTemplateComposition.tsx:339-375`) was
      // already correct and just never received a non-zero value.
      const fadeInMs = track.fadeInMs ?? 0;
      const fadeOutMs = track.fadeOutMs ?? 0;
      track.assetRefs.forEach((assetRef, assetIndex) => {
        const src = resolveAssetUrl(ctx, assetRef, `audioTracks[${trackIndex}]`);
        // RESERVED compiler-generated id pattern (§4.12, see the CTA doc
        // comment above) — `audio_${kind}_${trackIndex}_${assetIndex}` must
        // never be generated by the editor for a hand-authored layer.
        layers.push({
          id: `audio_${track.kind}_${trackIndex}_${assetIndex}`,
          type: "audio",
          startFrame,
          durationFrames,
          x: 0,
          y: 0,
          width: 0,
          height: 0,
          rotationDeg: 0,
          opacity: 1,
          zIndex: 0,
          src,
          trimStartSec: 0,
          volume,
          // `loop: true` (music) loops the underlying asset to fill this
          // layer's own `durationFrames` (the Remotion `<Sequence>` wrapping
          // it, see `GenericTemplateComposition.tsx:421-424`) — when
          // `startMs`/`endMs` bound a music track to less than the full
          // document, looping fills only that bounded span, not the rest of
          // the document. A track that should fill the whole document must
          // either omit `startMs`/`endMs` (Phase-1 default) or set
          // `endMs === format.durationMs` explicitly.
          loop: track.kind === "music",
          fadeInMs,
          fadeOutMs,
        } satisfies RemotionLayer);
      });
    } else {
      // sfx
      track.events.forEach((event, eventIndex) => {
        const src = resolveAssetUrl(
          ctx,
          event.assetRef,
          `audioTracks[${trackIndex}].events[${eventIndex}]`
        );
        layers.push({
          id: `audio_sfx_${trackIndex}_${eventIndex}`,
          type: "audio",
          startFrame: msToFrames(event.atMs, fps),
          durationFrames: Math.max(
            1,
            msToFrames(SFX_DEFAULT_DURATION_MS, fps)
          ),
          x: 0,
          y: 0,
          width: 0,
          height: 0,
          rotationDeg: 0,
          opacity: 1,
          zIndex: 0,
          src,
          trimStartSec: 0,
          volume: 1,
          loop: false,
          fadeInMs: 0,
          fadeOutMs: 0,
        } satisfies RemotionLayer);
      });
    }
  });

  return layers;
}

function buildWatermarkLayers(
  document: VideoProjectDocument,
  ctx: TemplateBuildContext,
): RemotionLayer[] {
  const config = document.watermark;
  if (!config?.enabled) return [];

  const slots = [
    { id: "primary", slot: config },
    ...(config.secondary ? [{ id: "secondary", slot: config.secondary }] : []),
  ].filter(({ slot }) => slot.enabled);

  return slots.map(({ id, slot }) => {
    const width = slot.scalePct;
    const height = Math.max(5, Math.min(30, slot.scalePct * 0.65));
    const marginX = (slot.marginPx / Math.max(1, document.format.width)) * 100;
    const marginY = (slot.marginPx / Math.max(1, document.format.height)) * 100;
    const x = slot.position.endsWith("left")
      ? marginX
      : slot.position.endsWith("right")
        ? Math.max(0, 100 - marginX - width)
        : Math.max(0, 50 - width / 2);
    const y = slot.position.startsWith("top")
      ? marginY
      : slot.position.startsWith("bottom")
        ? Math.max(0, 100 - marginY - height)
        : Math.max(0, 50 - height / 2);

    return {
      id: `watermark_${id}`,
      type: "image",
      startFrame: 0,
      durationFrames: Math.max(1, msToFrames(document.format.durationMs, document.format.fps)),
      x,
      y,
      width,
      height,
      rotationDeg: 0,
      opacity: slot.opacity,
      zIndex: 1000,
      locked: true,
      role: "brand",
      name: `Watermark (${id})`,
      src: resolveAssetUrl(ctx, slot.assetId, `watermark.${id}.assetId`),
      fit: "contain",
    } satisfies RemotionLayer;
  });
}

function resolveAssetUrl(
  ctx: TemplateBuildContext,
  assetId: number | string,
  contextLabel: string
): string {
  try {
    return ctx.assetResolver.url(assetId);
  } catch (error) {
    throw new VideoProjectCompileError(
      "VI_ASSET_UNRESOLVED",
      `Unresolved asset "${String(assetId)}" referenced by ${contextLabel}: ` +
        `${error instanceof Error ? error.message : String(error)}`
    );
  }
}

/* -------------------------------------------------------------------------- */
/* Step: brand-lock enforcement (deterministic equality check — §4.4)         */
/* -------------------------------------------------------------------------- */

/**
 * Phase-1 MVP brand-lock enforcement: a coarse, deterministic hard-lock —
 * when colors/fonts are locked, EVERY resolved layer's `color`/`fontFamily`
 * must equal the brand kit's canonical `colors.primary` / `fonts.body`
 * value. This is intentionally blunt (not a per-token-role system) per
 * section-01 §4.4's literal description ("if... any resolved layer uses a
 * color/font that differs from the locked brand value, throw") — a fact
 * check, never an LLM judgment call.
 *
 * `iconStyle` / `motionIntensity` / `cta` / `productFidelity` (spec.md §7.7)
 * have NO stored canonical value on `brand_kits` — section-05 explicitly
 * defers the "advanced" style columns (`motionPersonality` / `transitionStyle`
 * / `musicStyle` / `ctaStyle` / `cameraBehavior`) to a later migration, and
 * `brandKits.create`/`update`'s Zod input (~routers/videoProjects.ts:1944)
 * only ever accepted the boolean lock flags for these four, never a value to
 * pin them to. Each is therefore enforced as the most conservative
 * deterministic reading grounded in data that actually exists in the
 * compiled output, documented per-lock below — never a broad guess:
 *
 * - `iconStyle`  → same-document SHAPE consistency across every
 *   `motionGraphic` layer (the only "icon" concept the schema has —
 *   `RemotionMotionGraphicLayerSchema.shape`). First occurrence sets the
 *   canonical shape; any later layer using a different shape violates.
 * - `motionIntensity` → same-document consistency of every scene's
 *   `motion.intensity` (`SceneMotionSchema.intensity`). First scene sets the
 *   canonical intensity; any later scene using a different one violates.
 * - `cta` → same-document consistency of every CTA text layer's `content`.
 *   CTA layers are identified by the one concrete convention that exists in
 *   this codebase — `id` ending in `_cta` (see
 *   `server/remotion/templates/luxury_end_card.ts`'s `luxury_end_card_cta`
 *   layer, the only CTA-producing template today). First occurrence sets the
 *   canonical CTA copy; any later CTA layer with different text violates.
 *   ⚠️ Feature 143 §4.12 — `layer.id.endsWith("_cta")` is LOAD-BEARING: any
 *   hand-authored or generated layer id ending in `_cta` is treated as a
 *   brand CTA for this lock, deliberately or not. Conversely,
 *   `${sceneId}_caption_${index}` (`buildCaptionLayers` below) and
 *   `audio_${kind}_${trackIndex}_${assetIndex}` (`buildAudioTrackLayers`
 *   below) are RESERVED compiler-generated id patterns — an editor
 *   generating ids for hand-authored layers (§4.12) must use a prefix that
 *   can never collide with `*_caption_*` / `audio_*` / `*_cta` (unless the
 *   CTA suffix is offered to the user deliberately).
 * - `productFidelity` → requires one resolved reference image for every
 *   declared product and forbids non-uniform image stretching
 *   (`RemotionImageLayerSchema.fit === "fill"`) on any image layer. The
 *   compiler now fails closed when catalog facts are unavailable/incomplete;
 *   exact visual color/logo matching remains a QA-evidence concern because
 *   the layer schema carries only resolved URLs.
 */
function enforceBrandLocks(
  layers: RemotionLayer[],
  scenes: Scene[],
  brandKit: BrandKit | null,
  catalogFacts: ResolvedCatalogFacts | null | undefined,
): void {
  if (!brandKit) return;
  const lockedColor = brandKit.locks.colors ? brandKit.colors.primary : undefined;
  const lockedFont = brandKit.locks.fonts ? brandKit.fonts.body : undefined;

  for (const layer of layers) {
    if (
      lockedColor !== undefined &&
      "color" in layer &&
      typeof layer.color === "string" &&
      layer.color !== lockedColor
    ) {
      throw new BrandLockViolationError("colors.primary", lockedColor, layer.color);
    }
    if (
      lockedFont !== undefined &&
      layer.type === "text" &&
      layer.fontFamily !== lockedFont
    ) {
      throw new BrandLockViolationError("fonts.body", lockedFont, layer.fontFamily);
    }
  }

  if (brandKit.locks.iconStyle) {
    let canonicalShape: string | undefined;
    for (const layer of layers) {
      if (layer.type !== "motionGraphic") continue;
      if (canonicalShape === undefined) {
        canonicalShape = layer.shape;
      } else if (layer.shape !== canonicalShape) {
        throw new BrandLockViolationError("iconStyle", canonicalShape, layer.shape);
      }
    }
  }

  if (brandKit.locks.motionIntensity) {
    let canonicalIntensity: string | undefined;
    for (const scene of scenes) {
      if (canonicalIntensity === undefined) {
        canonicalIntensity = scene.motion.intensity;
      } else if (scene.motion.intensity !== canonicalIntensity) {
        throw new BrandLockViolationError(
          "motionIntensity",
          canonicalIntensity,
          scene.motion.intensity
        );
      }
    }
  }

  if (brandKit.locks.cta) {
    let canonicalCta: string | undefined;
    for (const layer of layers) {
      if (layer.type !== "text" || !layer.id.endsWith("_cta")) continue;
      if (canonicalCta === undefined) {
        canonicalCta = layer.content;
      } else if (layer.content !== canonicalCta) {
        throw new BrandLockViolationError("cta", canonicalCta, layer.content);
      }
    }
  }

  if (brandKit.locks.productFidelity) {
    const expectedProductIds = new Set(catalogFacts?.productIds ?? []);
    const products = catalogFacts?.products ?? [];
    const resolvedProductIds = new Set(products.map(product => product.productId));
    const hasCompleteProductFacts =
      Boolean(catalogFacts) &&
      expectedProductIds.size > 0 &&
      products.length === expectedProductIds.size &&
      resolvedProductIds.size === expectedProductIds.size &&
      [...expectedProductIds].every(productId => resolvedProductIds.has(productId)) &&
      products.every(
        product => product.referenceImageUrls.length > 0 || product.referenceImageAssetIds.length > 0,
      );
    if (!hasCompleteProductFacts) {
      throw new BrandLockViolationError("productFidelity", "resolved catalog facts", "missing");
    }
    for (const layer of layers) {
      if (layer.type === "image" && layer.fit === "fill") {
        throw new BrandLockViolationError("productFidelity", "cover|contain", "fill");
      }
    }
  }
}

/* -------------------------------------------------------------------------- */
/* Step: flatten + 40-layer split                                             */
/* -------------------------------------------------------------------------- */

function buildSingleConfig(
  layers: RemotionLayer[],
  document: VideoProjectDocument
): RemotionTemplateConfig {
  const sorted = [...layers].sort((a, b) => a.zIndex - b.zIndex);
  const parsed = RemotionTemplateConfigSchema.safeParse({
    id: COMPILED_CONFIG_ID,
    name: COMPILED_CONFIG_NAME,
    width: document.format.width,
    height: document.format.height,
    fps: document.format.fps,
    durationInFrames: Math.max(
      1,
      msToFrames(document.format.durationMs, document.format.fps)
    ),
    layers: sorted,
  });
  if (!parsed.success) {
    throw new VideoProjectCompileError(
      "VI_DOCUMENT_INVALID",
      `Compiled output failed RemotionTemplateConfigSchema validation: ${parsed.error.message}`
    );
  }
  return parsed.data;
}

function buildSegmentedConfigs(
  taggedLayers: TaggedLayer[],
  sceneCount: number,
  document: VideoProjectDocument
): { parts: RemotionTemplateConfig[]; concat: SegmentPlan } {
  const globalLayers = taggedLayers.filter(t => t.sceneIndex === -1);
  const bySceneIndex: RemotionLayer[][] = Array.from(
    { length: sceneCount },
    () => []
  );
  for (const tagged of taggedLayers) {
    if (tagged.sceneIndex >= 0) {
      bySceneIndex[tagged.sceneIndex].push(tagged.layer);
    }
  }

  type SceneChunk = {
    layers: RemotionLayer[];
    firstSceneIndex: number;
    lastSceneIndex: number;
  };
  const chunks: SceneChunk[] = [];
  let currentChunk: SceneChunk | null = null;
  // Global layers are clipped and copied into every segment below. Reserve
  // their layer budget while grouping scenes so a later segment remains
  // schema-valid instead of silently losing the watermark/music layer.
  const maxSceneLayersPerChunk = Math.max(1, MAX_LAYERS_PER_CONFIG - globalLayers.length);

  for (let sceneIndex = 0; sceneIndex < sceneCount; sceneIndex += 1) {
    const sceneLayers = bySceneIndex[sceneIndex];
    if (
      currentChunk &&
      currentChunk.layers.length > 0 &&
      currentChunk.layers.length + sceneLayers.length > maxSceneLayersPerChunk
    ) {
      chunks.push(currentChunk);
      currentChunk = null;
    }
    if (sceneLayers.length === 0) continue;
    if (!currentChunk) {
      currentChunk = {
        layers: [],
        firstSceneIndex: sceneIndex,
        lastSceneIndex: sceneIndex,
      };
    }
    currentChunk.layers.push(...sceneLayers);
    currentChunk.lastSceneIndex = sceneIndex;
  }
  if (currentChunk && currentChunk.layers.length > 0) {
    chunks.push(currentChunk);
  }

  if (chunks.length === 0 && globalLayers.length > 0) {
    chunks.push({
      layers: [],
      firstSceneIndex: 0,
      lastSceneIndex: Math.max(0, sceneCount - 1),
    });
  }

  const fps = document.format.fps;
  const parts = chunks.map((chunk, index) => {
    const firstScene = document.scenes[chunk.firstSceneIndex];
    const lastScene = document.scenes[chunk.lastSceneIndex];
    const segmentStartFrame = firstScene ? msToFrames(firstScene.startMs, fps) : 0;
    const segmentEndFrame = lastScene
      ? msToFrames(lastScene.endMs, fps)
      : msToFrames(document.format.durationMs, fps);

    const clippedGlobalLayers = globalLayers.flatMap(({ layer }) => {
      const layerEndFrame = layer.startFrame + layer.durationFrames;
      const overlapStartFrame = Math.max(layer.startFrame, segmentStartFrame);
      const overlapEndFrame = Math.min(layerEndFrame, segmentEndFrame);
      if (overlapEndFrame <= overlapStartFrame) return [];

      const clipped = {
        ...layer,
        startFrame: overlapStartFrame,
        durationFrames: Math.max(1, overlapEndFrame - overlapStartFrame),
      };
      if (layer.type === "audio" || layer.type === "video") {
        return [{
          ...clipped,
          trimStartSec: layer.trimStartSec + (overlapStartFrame - layer.startFrame) / fps,
        }];
      }
      return [clipped];
    });

    const rebased = [...chunk.layers, ...clippedGlobalLayers]
      .map(layer => ({ ...layer, startFrame: layer.startFrame - segmentStartFrame }))
      .sort((a, b) => a.zIndex - b.zIndex);
    const durationInFrames = Math.max(
      1,
      segmentEndFrame - segmentStartFrame,
      ...rebased.map(l => l.startFrame + l.durationFrames)
    );
    const parsed = RemotionTemplateConfigSchema.safeParse({
      id: `${COMPILED_CONFIG_ID}_part_${index}`,
      name: `${COMPILED_CONFIG_NAME} (part ${index + 1})`,
      width: document.format.width,
      height: document.format.height,
      fps: document.format.fps,
      durationInFrames,
      layers: rebased,
    });
    if (!parsed.success) {
      throw new VideoProjectCompileError(
        "VI_DOCUMENT_INVALID",
        `Compiled segment part ${index} failed RemotionTemplateConfigSchema validation: ${parsed.error.message}`
      );
    }
    return parsed.data;
  });

  const concat: SegmentPlan = {
    parts: parts.map((part, index) => ({
      index,
      durationInFrames: part.durationInFrames,
    })),
  };

  return { parts, concat };
}

/* -------------------------------------------------------------------------- */
/* compileVideoProject                                                        */
/* -------------------------------------------------------------------------- */

export function compileVideoProject(
  document: VideoProjectDocument,
  ctx: TemplateBuildContext,
  deps: CompileVideoProjectDeps = {}
): CompileResult {
  const parsedDocument = VideoProjectDocumentSchema.safeParse(document);
  if (!parsedDocument.success) {
    throw new VideoProjectCompileError(
      "VI_DOCUMENT_INVALID",
      `Invalid VideoProjectDocument: ${parsedDocument.error.message}`
    );
  }
  // Keep compilation safe for documents created before the narration
  // mutation started persisting reflowed scene boundaries. Rendering must not
  // clip a known-longer audio asset merely because the saved timeline is old.
  const doc = retimeScenesToNarrationAudio(parsedDocument.data);
  const resolveTemplate = deps.resolveTemplate ?? NO_TEMPLATES_REGISTERED;
  const fps = doc.format.fps;

  const taggedLayers: TaggedLayer[] = [];

  doc.scenes.forEach((scene, sceneIndex) => {
    const templateLayers = expandSceneVisual(scene, ctx, resolveTemplate);
    const captionLayers = buildCaptionLayers(scene, doc);
    // Feature 143 §4.8/§4.13 — a hand-authored layer with `hidden: true` is
    // author-time-only invisible: it must never reach the compiled output
    // (never emitted as a zero-opacity/zero-size layer either), and so must
    // never consume the 40-layer budget checked below via
    // `taggedLayers.length` / `MAX_LAYERS_PER_CONFIG`. Template- and
    // caption-emitted layers have no `hidden` concept (they're never
    // hand-authored), so only `scene.layers` is filtered here.
    const visibleSceneLayers = scene.layers.filter(layer => !layer.hidden);
    const rawLayers = [...visibleSceneLayers, ...templateLayers, ...captionLayers];
    for (const layer of rawLayers) {
      taggedLayers.push({
        layer: offsetLayerToAbsoluteFrame(layer, scene, fps),
        sceneIndex,
      });
    }
  });

  for (const layer of buildWatermarkLayers(doc, ctx)) {
    taggedLayers.push({ layer, sceneIndex: -1 });
  }

  const audioLayers = [
    ...buildSceneNarrationAudioLayers(doc, ctx),
    ...buildAudioTrackLayers(doc, ctx),
  ];
  for (const layer of audioLayers) {
    taggedLayers.push({ layer, sceneIndex: -1 });
  }

  enforceBrandLocks(
    taggedLayers.map(t => t.layer),
    doc.scenes,
    ctx.brandKit,
    ctx.catalogFacts,
  );

  const totalLayerCount = taggedLayers.length;

  if (totalLayerCount <= MAX_LAYERS_PER_CONFIG) {
    const config = buildSingleConfig(
      taggedLayers.map(t => t.layer),
      doc
    );
    return { kind: "single", config, cost: estimateRenderCost(config) };
  }

  const { parts, concat } = buildSegmentedConfigs(
    taggedLayers,
    doc.scenes.length,
    doc
  );
  const combinedCost = estimateAggregateCost(parts);
  return { kind: "segmented", parts, concat, cost: combinedCost };
}

function estimateAggregateCost(
  parts: RemotionTemplateConfig[]
): RenderCostEstimate {
  const perPart = parts.map(estimateRenderCost);
  const score = perPart.reduce((sum, p) => sum + p.score, 0);
  const recommendPreRender = perPart.some(p => p.recommendPreRender);
  const cls = perPart.some(p => p.cls === "high")
    ? "high"
    : perPart.some(p => p.cls === "medium")
      ? "medium"
      : "low";
  return { score, cls, recommendPreRender };
}
