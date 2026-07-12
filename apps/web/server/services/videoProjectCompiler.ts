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
import {
  estimateRenderCost,
  type RenderCostEstimate,
} from "../../shared/videoIntelligence/cost";

/* -------------------------------------------------------------------------- */
/* Public types (§2 — keep names/shapes exact, later sections import these)   */
/* -------------------------------------------------------------------------- */

export type TemplateBuildContext = {
  format: { width: number; height: number; fps: number; durationMs: number };
  brandKit: BrandKit | null;
  assetResolver: AssetResolver;
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
  code: "VI_DOCUMENT_INVALID" | "VI_TEMPLATE_UNKNOWN" | "VI_ASSET_UNRESOLVED";

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
    return builder.build(params, ctx);
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
/* Step: audio tracks -> audio layers (document-level, absolute frames)       */
/* -------------------------------------------------------------------------- */

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
      // Phase-1 simplification: without per-asset timing metadata in the
      // neutral schema, each referenced asset spans the whole document
      // duration. `ducking` (music only) applies a documented flat extra
      // attenuation rather than dynamic sidechain compression (out of
      // scope for Phase 1 — no audio-analysis engine here).
      const duckingAttenuationDb =
        track.kind === "music" && track.ducking ? -6 : 0;
      const volume = dbToLinearVolume(track.gainDb + duckingAttenuationDb);
      track.assetRefs.forEach((assetRef, assetIndex) => {
        const src = resolveAssetUrl(ctx, assetRef, `audioTracks[${trackIndex}]`);
        layers.push({
          id: `audio_${track.kind}_${trackIndex}_${assetIndex}`,
          type: "audio",
          startFrame: 0,
          durationFrames: totalDurationFrames,
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
          loop: track.kind === "music",
          fadeInMs: 0,
          fadeOutMs: 0,
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
 */
function enforceBrandLocks(
  layers: RemotionLayer[],
  brandKit: BrandKit | null
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
  // Global (non-scene) layers — audio tracks — are tagged sceneIndex -1 and
  // prepended into the first chunk so they still reach a rendered part
  // (Phase-1 simplification: full-document background audio is embedded in
  // segment part 0 only, rather than duplicated/re-trimmed across parts).
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

  const chunks: RemotionLayer[][] = [];
  let currentChunk: RemotionLayer[] = globalLayers.map(t => t.layer);

  for (let sceneIndex = 0; sceneIndex < sceneCount; sceneIndex += 1) {
    const sceneLayers = bySceneIndex[sceneIndex];
    if (
      currentChunk.length > 0 &&
      currentChunk.length + sceneLayers.length > MAX_LAYERS_PER_CONFIG
    ) {
      chunks.push(currentChunk);
      currentChunk = [];
    }
    currentChunk.push(...sceneLayers);
  }
  if (currentChunk.length > 0) {
    chunks.push(currentChunk);
  }

  const parts = chunks.map((chunkLayers, index) => {
    const minFrame = Math.min(...chunkLayers.map(l => l.startFrame));
    const rebased = chunkLayers
      .map(layer => ({ ...layer, startFrame: layer.startFrame - minFrame }))
      .sort((a, b) => a.zIndex - b.zIndex);
    const durationInFrames = Math.max(
      1,
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
  const doc = parsedDocument.data;
  const resolveTemplate = deps.resolveTemplate ?? NO_TEMPLATES_REGISTERED;
  const fps = doc.format.fps;

  const taggedLayers: TaggedLayer[] = [];

  doc.scenes.forEach((scene, sceneIndex) => {
    const templateLayers = expandSceneVisual(scene, ctx, resolveTemplate);
    const captionLayers = buildCaptionLayers(scene, doc);
    const rawLayers = [...scene.layers, ...templateLayers, ...captionLayers];
    for (const layer of rawLayers) {
      taggedLayers.push({
        layer: offsetLayerToAbsoluteFrame(layer, scene, fps),
        sceneIndex,
      });
    }
  });

  const audioLayers = buildAudioTrackLayers(doc, ctx);
  for (const layer of audioLayers) {
    taggedLayers.push({ layer, sceneIndex: -1 });
  }

  enforceBrandLocks(
    taggedLayers.map(t => t.layer),
    ctx.brandKit
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
