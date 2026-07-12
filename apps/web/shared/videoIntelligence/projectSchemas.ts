/**
 * The neutral, renderer-agnostic `VideoProjectDocument` Zod schema — the
 * "Neutral Video Project Schema" a user authors (Feature 133, Phase 1 MVP).
 * This is the PERSISTED authoring format; it is never stored as React code
 * and it is NOT the same thing as the already-shipped, frozen
 * `RemotionTemplateConfig` (`shared/remotion/layerTemplateSchemas.ts`), which
 * stays the *compilation target* only (`server/services/videoProjectCompiler.ts`
 * turns a `VideoProjectDocument` into one or more `RemotionTemplateConfig`s).
 *
 * See `specs/feature/133-content-video-intelligence-platform/spec.md` §5 and
 * `sections/section-01-neutral-schema-audio-layer-compiler.md` for the
 * normative shape this file implements.
 *
 * Reuse-first constraints (do not violate):
 * - `SceneSchema.layers` imports `RemotionLayerSchema` verbatim from
 *   `../remotion/layerTemplateSchemas` — never re-declare a layer shape here.
 * - `CaptionPresetId` reuses the existing shared 10-preset enum
 *   (`HyperframesFinalCompositeSubtitlePresetSchema`,
 *   `shared/hyperframes/runtimeApiSchemas.ts`) — never invent a new caption
 *   preset enum.
 * - Asset references are numeric ids (`mediaAssets.id` bigint / mode:number,
 *   `libraryItems.id` int) — never arbitrary external URLs (spec §17.3).
 */
import { z } from "zod";

import { RemotionLayerSchema } from "../remotion/layerTemplateSchemas";
import { HyperframesFinalCompositeSubtitlePresetSchema } from "../hyperframes/runtimeApiSchemas";

/* -------------------------------------------------------------------------- */
/* Caption preset id — reused verbatim (never re-declared)                    */
/* -------------------------------------------------------------------------- */

/** The same 10 HyperFrames subtitle preset ids used by HyperFrames + Vertical
 *  Drama (`shared/hyperframes/runtimeApiSchemas.ts`). Reused verbatim per
 *  section-01 §4.1 — never a new caption preset enum. */
export const CaptionPresetIdSchema = HyperframesFinalCompositeSubtitlePresetSchema;
export type CaptionPresetId = z.infer<typeof CaptionPresetIdSchema>;

/* -------------------------------------------------------------------------- */
/* Platform preset (safe-area enum driving width/height defaults)             */
/* -------------------------------------------------------------------------- */

export const PlatformPresetSchema = z.enum([
  "tiktok_9_16",
  "reels_9_16",
  "youtube_16_9",
  "square_1_1",
]);
export type PlatformPreset = z.infer<typeof PlatformPresetSchema>;

/* -------------------------------------------------------------------------- */
/* format / content                                                           */
/* -------------------------------------------------------------------------- */

export const VideoProjectFormatSchema = z
  .object({
    width: z.number().int().min(320).max(4096),
    height: z.number().int().min(320).max(4096),
    // fps 12..60 mirrors the frozen `RemotionTemplateConfigSchema` bounds
    // (research A1) — the compiled output must always be a valid fps.
    fps: z.number().int().min(12).max(60),
    durationMs: z.number().int().min(1),
  })
  .strict();
export type VideoProjectFormat = z.infer<typeof VideoProjectFormatSchema>;

export const VideoProjectContentSchema = z
  .object({
    topic: z.string().trim().max(500).optional(),
    audience: z.string().trim().max(200).optional(),
    language: z.string().trim().min(1).max(20),
    platformPreset: PlatformPresetSchema,
  })
  .strict();
export type VideoProjectContent = z.infer<typeof VideoProjectContentSchema>;

/* -------------------------------------------------------------------------- */
/* Scene                                                                      */
/* -------------------------------------------------------------------------- */

export const SceneVisualSchema = z.discriminatedUnion("kind", [
  z
    .object({
      kind: z.literal("template"),
      templateId: z.string().trim().min(1).max(128),
      params: z.record(z.string(), z.unknown()).default({}),
    })
    .strict(),
  z
    .object({
      kind: z.literal("layers"),
    })
    .strict(),
]);
export type SceneVisual = z.infer<typeof SceneVisualSchema>;

export const SceneMotionSchema = z
  .object({
    intensity: z.enum(["low", "medium", "high"]).default("medium"),
    // Freeform camera direction label (e.g. "push-in", "pan-left",
    // "static") — Phase 1 does not enumerate an exhaustive camera list
    // (spec §5.2 only shows "push-in" as an example), so this stays a
    // bounded free-text field rather than a guessed-at enum.
    camera: z.string().trim().min(1).max(60).default("static"),
  })
  .strict();
export type SceneMotion = z.infer<typeof SceneMotionSchema>;

export const CaptionCueSchema = z
  .object({
    startMs: z.number().int().min(0),
    endMs: z.number().int().min(0),
    text: z.string().trim().min(1).max(500),
  })
  .strict();
export type CaptionCue = z.infer<typeof CaptionCueSchema>;

export const SceneSchema = z
  .object({
    sceneId: z.string().trim().min(1).max(128),
    startMs: z.number().int().min(0),
    endMs: z.number().int().min(0),
    narration: z.string().trim().max(4000).nullable(),
    // `mediaAssets.id` is a bigint column in `mode: "number"` — plain
    // `z.number().int()`, nullable until TTS has run for this scene.
    narrationAudioAssetId: z.number().int().nullable(),
    visual: SceneVisualSchema,
    // Reused verbatim from the frozen layer schema — scene-relative
    // `startFrame`; the compiler offsets this to absolute frames.
    layers: z.array(RemotionLayerSchema),
    motion: SceneMotionSchema,
    captionCues: z.array(CaptionCueSchema),
  })
  .strict();
export type Scene = z.infer<typeof SceneSchema>;

/* -------------------------------------------------------------------------- */
/* Audio tracks                                                               */
/* -------------------------------------------------------------------------- */

export const AudioTrackSchema = z.discriminatedUnion("kind", [
  z
    .object({
      kind: z.literal("narration"),
      assetRefs: z.array(z.number().int()).min(1),
      gainDb: z.number().min(-60).max(24).default(0),
    })
    .strict(),
  z
    .object({
      kind: z.literal("music"),
      assetRefs: z.array(z.number().int()).min(1),
      gainDb: z.number().min(-60).max(24).default(-14),
      ducking: z.boolean().default(true),
    })
    .strict(),
  z
    .object({
      kind: z.literal("sfx"),
      events: z
        .array(
          z
            .object({
              assetRef: z.number().int(),
              atMs: z.number().int().min(0),
            })
            .strict()
        )
        .min(1),
    })
    .strict(),
]);
export type AudioTrack = z.infer<typeof AudioTrackSchema>;

/* -------------------------------------------------------------------------- */
/* Captions (document-level) / claims / qa                                    */
/* -------------------------------------------------------------------------- */

export const VideoProjectCaptionsSchema = z
  .object({
    presetId: CaptionPresetIdSchema,
    burnIn: z.boolean().default(false),
    language: z.string().trim().min(1).max(20),
  })
  .strict();
export type VideoProjectCaptions = z.infer<typeof VideoProjectCaptionsSchema>;

export const ClaimRecordSchema = z
  .object({
    claim: z.string().trim().min(1).max(2000),
    source: z.string().trim().min(1).max(500),
    status: z.enum([
      "approved",
      "needs_review",
      "unsupported",
      "prohibited",
    ]),
  })
  .strict();
export type ClaimRecord = z.infer<typeof ClaimRecordSchema>;

export const VideoProjectQaSchema = z
  .object({
    targetScore: z.number().min(0).max(10),
    maxLoops: z.number().int().min(0).max(20),
  })
  .strict();
export type VideoProjectQa = z.infer<typeof VideoProjectQaSchema>;

/* -------------------------------------------------------------------------- */
/* Root document                                                              */
/* -------------------------------------------------------------------------- */

export const VideoProjectDocumentSchema = z
  .object({
    schemaVersion: z.literal(1),
    format: VideoProjectFormatSchema,
    content: VideoProjectContentSchema,
    // Nullable string id — `brand_kits.id` (section-05) as a string, or
    // `null` when no brand kit is attached yet.
    brandKitId: z.string().trim().min(1).max(128).nullable(),
    scenes: z.array(SceneSchema).min(1),
    audioTracks: z.array(AudioTrackSchema),
    captions: VideoProjectCaptionsSchema,
    claims: z.array(ClaimRecordSchema),
    qa: VideoProjectQaSchema,
  })
  .strict();

export type VideoProjectDocument = z.infer<typeof VideoProjectDocumentSchema>;

/* -------------------------------------------------------------------------- */
/* Determinism helper — stable key ordering for round-trip tests              */
/* -------------------------------------------------------------------------- */

/**
 * Recursively sorts every plain object's keys alphabetically (arrays keep
 * their order — order is semantically meaningful for `scenes`/`layers`).
 * Used so `JSON.stringify(normalizeDocument(doc))` is deterministic
 * regardless of the key insertion order Zod happened to produce, per
 * research B6's determinism convention (no `toMatchSnapshot`).
 */
export function normalizeDocument(doc: VideoProjectDocument): unknown {
  return normalizeValue(doc);
}

function normalizeValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(normalizeValue);
  }
  if (value !== null && typeof value === "object") {
    const sortedKeys = Object.keys(value as Record<string, unknown>).sort();
    const result: Record<string, unknown> = {};
    for (const key of sortedKeys) {
      result[key] = normalizeValue((value as Record<string, unknown>)[key]);
    }
    return result;
  }
  return value;
}
