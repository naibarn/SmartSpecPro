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
    /**
     * How the renderer should pace visual motion.  `captions` is the safe
     * default for narration-driven video: the compiler can use real caption
     * cue boundaries without asking an LLM to invent frame numbers.
     */
    sync: z.enum(["scene", "captions"]).optional(),
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

export const VideoProjectWatermarkPositionSchema = z.enum([
  "top_left",
  "top_center",
  "top_right",
  "middle_left",
  "middle_center",
  "middle_right",
  "bottom_left",
  "bottom_center",
  "bottom_right",
]);
export type VideoProjectWatermarkPosition = z.infer<typeof VideoProjectWatermarkPositionSchema>;

export const VideoProjectWatermarkSlotSchema = z
  .object({
    enabled: z.boolean(),
    assetId: z.number().int().positive(),
    position: VideoProjectWatermarkPositionSchema.default("top_right"),
    opacity: z.number().min(0.2).max(0.8).default(0.45),
    scalePct: z.number().min(5).max(20).default(10),
    marginPx: z.number().int().min(0).max(200).default(32),
  })
  .strict();
export type VideoProjectWatermarkSlot = z.infer<typeof VideoProjectWatermarkSlotSchema>;

export const VideoProjectWatermarkSchema = z
  .object({
    enabled: z.boolean(),
    assetId: z.number().int().positive(),
    position: VideoProjectWatermarkPositionSchema.default("top_right"),
    opacity: z.number().min(0.2).max(0.8).default(0.45),
    scalePct: z.number().min(5).max(20).default(10),
    marginPx: z.number().int().min(0).max(200).default(32),
    secondary: VideoProjectWatermarkSlotSchema.optional(),
  })
  .strict();
export type VideoProjectWatermark = z.infer<typeof VideoProjectWatermarkSchema>;

export const VideoProjectNarrationSettingsSchema = z
  .object({
    modelId: z.string().trim().min(1).max(128),
    voice: z.string().trim().min(1).max(160).optional(),
    speed: z.number().min(0.5).max(2).optional(),
    extraParams: z.record(z.string(), z.unknown()).optional(),
  })
  .strict();
export type VideoProjectNarrationSettings = z.infer<typeof VideoProjectNarrationSettingsSchema>;

/* -------------------------------------------------------------------------- */
/* Motion candidates (Feature 142 follow-on — motion stage multi-variant     */
/* picker). See `server/services/videoProjectMotionDirector.ts` and          */
/* `skills/video-project-motion-director/skill.md`.                          */
/* -------------------------------------------------------------------------- */

/**
 * One proposed motion take for a scene — a template id + bound params +
 * motion descriptor, exactly like a `scene_plan` output entry, plus a short
 * `label`/`rationale` so a picker UI can show the user why the options
 * differ (energy level, camera behavior, pacing). Structurally validated
 * against the template's own `paramsSchema` before persistence (never
 * trusted verbatim from the skill) — see `planMotionVariants`.
 */
export const MotionCandidateSchema = z
  .object({
    candidateId: z.string().trim().min(1).max(64),
    templateId: z.string().trim().min(1).max(128),
    templateParams: z.record(z.string(), z.unknown()),
    motion: SceneMotionSchema,
    label: z.string().trim().min(1).max(120),
    rationale: z.string().trim().max(2000),
  })
  .strict();
export type MotionCandidate = z.infer<typeof MotionCandidateSchema>;

export const SceneSchema = z
  .object({
    sceneId: z.string().trim().min(1).max(128),
    startMs: z.number().int().min(0),
    endMs: z.number().int().min(0),
    narration: z.string().trim().max(4000).nullable(),
    // `mediaAssets.id` is a bigint column in `mode: "number"` — plain
    // `z.number().int()`, nullable until TTS has run for this scene.
    narrationAudioAssetId: z.number().int().nullable(),
    /** Actual generated audio duration, when narration synthesis has run. */
    narrationAudioDurationMs: z.number().int().min(1).optional(),
    /** Whether caption timing came from audio alignment or the deterministic fallback. */
    captionTimingSource: z.enum(["manual", "aligned", "estimated"]).optional(),
    visual: SceneVisualSchema,
    // Reused verbatim from the frozen layer schema — scene-relative
    // `startFrame`; the compiler offsets this to absolute frames.
    layers: z.array(RemotionLayerSchema),
    motion: SceneMotionSchema,
    captionCues: z.array(CaptionCueSchema),
    // Motion-variant picker (additive, backward-compatible). Deliberately
    // `.optional()` rather than `.default(...)`: a `.default()` would make
    // BOTH fields required in the schema's OUTPUT TypeScript type
    // (`z.infer`), which would break every pre-existing call site across
    // the codebase (server AND client) that builds a plain `Scene` object
    // literal without knowing these two fields exist — a source-level
    // break this feature must never cause on an additive change.
    // `.optional()` keeps them absent-or-present in both the type and at
    // runtime, so a stored document that predates this field simply parses
    // with `motionCandidates === undefined` (see
    // `projectSchemas.test.ts`'s "backward compatibility" describe block).
    // Every reader treats `undefined` the same as `[]`/`null`
    // (`scene.motionCandidates ?? []`, `scene.selectedMotionCandidateId ??
    // null`) — see `videoProjectMotionDirector.ts` and
    // `routers/videoProjects.ts`'s `selectMotionCandidate`. Generating
    // candidates NEVER writes `visual`/`motion` above — only an explicit
    // `selectMotionCandidate` call does, which is what makes motion-variant
    // generation non-destructive by construction (it can never clobber a
    // scene's live, already-applied motion/visual).
    motionCandidates: z.array(MotionCandidateSchema).max(6).optional(),
    // The `candidateId` of whichever `motionCandidates` entry (if any) the
    // user has applied to this scene's `visual`/`motion` — absent/`null`
    // until `selectMotionCandidate` is called. `.optional()` for the same
    // backward-compat reason as `motionCandidates` above.
    selectedMotionCandidateId: z.string().trim().min(1).max(64).nullable().optional(),
  })
  .strict();
export type Scene = z.infer<typeof SceneSchema>;

/* -------------------------------------------------------------------------- */
/* Audio tracks                                                               */
/* -------------------------------------------------------------------------- */

// Feature 143 §4.8 audio timing/fades — additive, `.optional()` only (NEVER
// `.default()`, which would make the field required in the inferred type and
// break every existing construction site; this mistake has already been made
// and reverted twice in this repo, see `SceneSchema.motionCandidates`'s doc
// comment above for the same rule spelled out in full). Absent means "the
// Phase-1 whole-document span + zero fades" — see
// `buildAudioTrackLayers`/`videoProjectCompiler.ts` for the fallback.
const AudioTrackTimingFieldsShape = {
  /** Absolute document ms where this track's asset(s) start playing.
   *  Omitted -> track spans from the start of the document (`0`), matching
   *  today's behaviour. */
  startMs: z.number().int().min(0).optional(),
  /** Absolute document ms where this track's asset(s) stop playing. Omitted
   *  -> track spans to the end of the document, matching today's behaviour.
   *  Document-level cross-field validation (`endMs > startMs`, both within
   *  `format.durationMs`) happens on `VideoProjectDocumentSchema` below,
   *  since the document duration lives on a sibling field. */
  endMs: z.number().int().min(0).optional(),
  /** Linear fade-in length in ms, applied by the renderer's existing
   *  per-frame envelope (`AudioLayerContent`,
   *  `GenericTemplateComposition.tsx:339-375`) — omitted/`0` = no fade. */
  fadeInMs: z.number().int().min(0).optional(),
  /** Linear fade-out length in ms, same envelope. Omitted/`0` = no fade. */
  fadeOutMs: z.number().int().min(0).optional(),
};

export const AudioTrackSchema = z.discriminatedUnion("kind", [
  z
    .object({
      kind: z.literal("narration"),
      assetRefs: z.array(z.number().int()).min(1),
      gainDb: z.number().min(-60).max(24).default(0),
      ...AudioTrackTimingFieldsShape,
    })
    .strict(),
  z
    .object({
      kind: z.literal("music"),
      assetRefs: z.array(z.number().int()).min(1),
      gainDb: z.number().min(-60).max(24).default(-14),
      ducking: z.boolean().default(true),
      ...AudioTrackTimingFieldsShape,
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
    narrationSettings: VideoProjectNarrationSettingsSchema.optional(),
    /** Persistent project-level watermark, modelled after Vertical Drama's
     * primary + optional secondary image slots. */
    watermark: VideoProjectWatermarkSchema.optional(),
    scenes: z.array(SceneSchema).min(1),
    audioTracks: z.array(AudioTrackSchema),
    captions: VideoProjectCaptionsSchema,
    claims: z.array(ClaimRecordSchema),
    qa: VideoProjectQaSchema,
  })
  .strict()
  // Feature 143 §4.8 — `AudioTrackSchema`'s new `startMs`/`endMs` (narration/
  // music only) can only be validated against `format.durationMs`, a sibling
  // field, so this cross-field check lives on the document schema rather
  // than the track schema itself. Absent `startMs`/`endMs` are never
  // checked here (Phase-1 "whole document" fallback is always valid).
  .superRefine((doc, ctx) => {
    doc.audioTracks.forEach((track, trackIndex) => {
      if (track.kind !== "narration" && track.kind !== "music") return;
      const { startMs, endMs } = track;
      if (startMs === undefined && endMs === undefined) return;
      const effectiveStart = startMs ?? 0;
      const effectiveEnd = endMs ?? doc.format.durationMs;
      if (effectiveEnd <= effectiveStart) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `audioTracks[${trackIndex}]: endMs (${effectiveEnd}) must be greater than startMs (${effectiveStart})`,
          path: ["audioTracks", trackIndex, "endMs"],
        });
      }
      if (effectiveStart > doc.format.durationMs) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `audioTracks[${trackIndex}]: startMs (${effectiveStart}) exceeds format.durationMs (${doc.format.durationMs})`,
          path: ["audioTracks", trackIndex, "startMs"],
        });
      }
      if (effectiveEnd > doc.format.durationMs) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `audioTracks[${trackIndex}]: endMs (${effectiveEnd}) exceeds format.durationMs (${doc.format.durationMs})`,
          path: ["audioTracks", trackIndex, "endMs"],
        });
      }
    });
  });

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
