/**
 * `remotion_render_video` worker job contract (Feature 133, Phase 1 MVP,
 * section-03 — `specs/feature/133-content-video-intelligence-platform/spec.md`
 * §6). This is the server-authoritative payload schema shared by both
 * execution lanes (Lane A in-process, Lane B `apps/worker-app` fleet). It
 * embeds `RemotionTemplateConfigSchema` verbatim (never re-declared) and is
 * intentionally `.strict()` on every nested object: an unknown or renamed
 * field must be a hard parse failure so the golden-fixture round-trip test
 * (`apps/web/shared/__fixtures__/remotionRenderVideoWorkerInput-*.json`) is a
 * real server⇄worker drift guard, not a silent-strip no-op.
 *
 * MOVED from `apps/web/shared/workerRuntime.ts` as part of the
 * worker-app-remotion-render-video P1 task (2026-07-30): the
 * `apps/worker-app` Remotion sidecar bundles ONLY `@smartspec/remotion-render`
 * (see `apps/worker-app/package.json`) — it has no dependency on `apps/web`
 * at all, so `apps/web/shared/workerRuntime.ts` was never importable from the
 * sidecar bundle. This module is now the single source of truth; `apps/web`'s
 * `shared/workerRuntime.ts` re-exports everything from here (never
 * re-declares) for its existing importers (`workerSchedulerService.ts`,
 * `workerRegistryService.ts`, `hyperframesRenderWorker.ts`, etc.).
 *
 * `REMOTION_RENDER_VIDEO_CAPABILITY_FAMILIES` is the anti-mis-claim safety
 * mechanism (spec §6.3): it MUST stay non-empty. The server does not filter
 * job claims by jobType, so a non-empty capability-family requirement is the
 * only thing that prevents a HyperFrames-only worker from claiming and then
 * failing a Remotion render job.
 *
 * `captionPresetId` below (`remotionRenderVideoCaptionPresetIdSchema`) is a
 * DELIBERATE, DOCUMENTED, narrow exception to the "never re-declare" rule:
 * its 10 literal values are copied verbatim from
 * `apps/web/shared/hyperframes/runtimeApiSchemas.ts`'s
 * `HyperframesFinalCompositeSubtitlePresetSchema`. That module cannot be
 * imported from this package (it lives in `apps/web`, has its own large
 * dependency graph, and `apps/web` is not a dependency of this package or of
 * `apps/worker-app`) — moving IT here would be a much larger, out-of-scope
 * change. If either list of 10 values changes, update BOTH.
 */
import { z } from "zod";

import { RemotionTemplateConfigSchema } from "./layerTemplateSchemas";

export const REMOTION_RENDER_VIDEO_CAPABILITY_FAMILIES = [
  "remotion-render",
  "chromium-render",
  "ffmpeg-probe",
] as const;

const remotionRenderVideoProgressStageValues = [
  "resolve_inputs",
  "stage_assets",
  "bundle_composition",
  "select_composition",
  "render_frames",
  "run_post_passes",
  "verify_outputs",
  "upload_artifacts",
  "server_verify_artifacts",
  "publish_artifacts",
] as const;

export const REMOTION_RENDER_VIDEO_PROGRESS_STAGES = [
  ...remotionRenderVideoProgressStageValues,
];

const remotionRenderVideoFailureCodeValues = [
  "contract_version_unsupported",
  "asset_stage_failed",
  "bundle_failed",
  "composition_select_failed",
  "chromium_launch_failed",
  "render_failed",
  "post_pass_failed",
  "artifact_upload_failed",
  "server_verification_failed",
] as const;

export const REMOTION_RENDER_VIDEO_FAILURE_CODES = [
  ...remotionRenderVideoFailureCodeValues,
];

// Feature 144 procedural motion contract bump (2026-08-04.2): bounded
// `motionComposition` layers and the registered procedural renderer set are
// now part of the worker payload schema. This stays separate from the prior
// segmented-render change on 2026-08-04 so an older worker cannot claim a
// payload it cannot render.
//
// Feature 143 segmented render contract bump (2026-08-04): `segmentTemplates`
// is now carried alongside the first `remotionTemplate` so a worker can
// render compiler-generated parts and concatenate them safely. This also
// includes the prior `RemotionLayerBaseSchema` compatibility fields.
// gained four additive `.optional()` fields (`name`/`locked`/`hidden`/
// `role`). Both `.strict()` layer schemas embedded in this worker contract
// (`RemotionTemplateConfigSchema`) reject unrecognized keys, so a payload
// that actually sets one of these new fields would be rejected by any
// worker still running the pre-143 schema — this version string is the
// contract's own drift signal for that mismatch (checked in
// `renderVideoJob.ts` against `REMOTION_RENDER_VIDEO_PLATFORM_CONTRACT_VERSION`).
// Payloads that omit the new fields entirely (every pre-143 caller) are
// unaffected — the fields are optional, not required.
export const REMOTION_RENDER_VIDEO_PLATFORM_CONTRACT_VERSION = "2026-08-04.2";
export const REMOTION_RENDER_VIDEO_RENDERER_POLICY_VERSION = "remotion-1";
/**
 * Admission token for the Worker App claim path. This is deliberately tied to
 * the platform contract version so a worker with an older Remotion sidecar
 * cannot claim a payload that its renderer will reject.
 */
export const REMOTION_RENDER_VIDEO_CLAIM_CAPABILITY =
  `remotion-render-contract-${REMOTION_RENDER_VIDEO_PLATFORM_CONTRACT_VERSION}`;

export type RemotionRenderVideoProgressStage =
  (typeof remotionRenderVideoProgressStageValues)[number];
export type RemotionRenderVideoFailureCode =
  (typeof remotionRenderVideoFailureCodeValues)[number];
export type RemotionRenderVideoCapabilityFamily =
  (typeof REMOTION_RENDER_VIDEO_CAPABILITY_FAMILIES)[number];

export const remotionRenderVideoProgressStageSchema = z.enum(
  remotionRenderVideoProgressStageValues,
);
export const remotionRenderVideoFailureCodeSchema = z.enum(
  remotionRenderVideoFailureCodeValues,
);
export const remotionRenderVideoCapabilityFamilySchema = z.enum(
  REMOTION_RENDER_VIDEO_CAPABILITY_FAMILIES,
);

// Copied verbatim from `apps/web/shared/workerRuntime.ts`'s (now-removed)
// local declarations — pure literal validators, not business logic, so a
// narrow duplication here has zero drift risk (the values themselves are
// primitive format constraints, not part of any evolving domain contract).
const workerStableHashSchema = z.string().trim().min(8).max(256);
const workerDownloadUrlSchema = z
  .string()
  .trim()
  .min(1)
  .max(8_192)
  .regex(/^(https?:\/\/|\/).+/);

/** See this module's doc comment — copied verbatim from
 *  `HyperframesFinalCompositeSubtitlePresetSchema`. */
export const remotionRenderVideoCaptionPresetIdSchema = z.enum([
  "classic_box",
  "minimal_shadow",
  "creator_pop",
  "karaoke_word",
  "highlight_bar",
  "lower_third",
  "cinematic_wide",
  "neon_glow",
  "review_bubble",
  "no_subtitle_style",
]);

const remotionRenderVideoRenderProfileSchema = z
  .object({
    profile: z.enum(["preview", "final"]),
    width: z.number().int().min(320).max(4096),
    height: z.number().int().min(320).max(4096),
    fps: z.number().int().min(12).max(60),
    codec: z.literal("h264").default("h264"),
    loudnessNormalize: z.boolean().default(true),
    burnInAssCaptions: z.boolean().default(false),
  })
  .strict();

const remotionRenderVideoAssetManifestSchema = z
  .object({
    sources: z.array(
      z
        .object({
          role: z.enum(["video", "image", "audio", "font"]),
          url: workerDownloadUrlSchema,
          sha256: workerStableHashSchema,
        })
        .strict(),
    ),
  })
  .strict();

/**
 * Owned by section-01 (`apps/web/server/services/videoProjectCompiler.ts`'s
 * `SegmentPlan` type, cross-section consistency resolution #4,
 * `sections/index.md`): `{ parts: { index, durationInFrames }[] }`. Section-01
 * exports no Zod schema for it, so this is a structurally-identical local
 * schema (not an import — this package must not depend on `apps/web/server/*`)
 * that any real `SegmentPlan` value satisfies.
 */
const remotionRenderVideoSegmentPlanSchema = z
  .object({
    parts: z
      .array(
        z
          .object({
            index: z.number().int().min(0),
            durationInFrames: z.number().int().min(1),
          })
          .strict(),
      )
      .min(1),
  })
  .strict();

export const remotionRenderVideoWorkerInputSchema = z
  .object({
    kind: z.literal("remotion_render_video").default("remotion_render_video"),
    schemaVersion: z.literal(1).default(1),
    platformContractVersion: z.string().trim().min(1).max(120),
    rendererPolicyVersion: z.string().trim().min(1).max(120),
    videoProjectId: z.string().trim().min(1).max(160),
    projectRevision: z.number().int().min(1),
    traceId: z.string().trim().min(1).max(200),
    renderProfile: remotionRenderVideoRenderProfileSchema,
    // Embedded verbatim — layer shapes are never re-declared.
    remotionTemplate: RemotionTemplateConfigSchema,
    /** Compiler-generated multi-part plan. `remotionTemplate` remains the
     * first part for backward compatibility; the worker renders every entry
     * and concatenates them before global post-passes. */
    segmentTemplates: z.array(RemotionTemplateConfigSchema).min(1).optional(),
    // Must equal GENERIC_TEMPLATE_COMPOSITION_ID (`./Root.ts`).
    // Re-declared as a literal here (not imported) so this schema never
    // depends on a React/`.tsx` composition module.
    compositionId: z.literal("GenericTemplate"),
    assetManifest: remotionRenderVideoAssetManifestSchema,
    postPasses: z
      .array(z.enum(["loudnorm", "ass_burn", "segment_concat"]))
      .default([]),
    segmentPlan: remotionRenderVideoSegmentPlanSchema.nullable().default(null),
    // Stable hash of `remotionTemplate` — dedupe + tamper check.
    remotionTemplateHash: workerStableHashSchema,
    // Authoritative; the worker must not recompute this from the template.
    durationInFrames: z.number().int().min(1),
    // ADDITIVE (implementation-progress.md gap #3 closure): real caption cues
    // to burn in when `postPasses` includes `"ass_burn"`. Absolute-timeline
    // seconds (already offset by scene start, NOT scene-relative ms like
    // `CaptionCueSchema`/`document.scenes[].captionCues`) so the worker never
    // has to re-derive per-scene timing. Genuinely optional — omitted
    // entirely by every pre-existing caller/fixture, so this cannot break any
    // frozen `.strict()` contract or golden fixture.
    captionLines: z
      .array(
        z
          .object({
            startSec: z.number().min(0),
            endSec: z.number().min(0),
            text: z.string().trim().min(1).max(2_000),
          })
          .strict(),
      )
      .optional(),
    // ADDITIVE (implementation-progress.md gap #3 closure, part 2): which of
    // the 10 shared caption presets to render `captionLines` with when
    // `postPasses` includes `"ass_burn"`. See this module's doc comment for
    // why this is a documented duplicate of
    // `HyperframesFinalCompositeSubtitlePresetSchema`'s 10 values rather than
    // an import. Genuinely optional — omitted by every pre-existing
    // caller/fixture, so this cannot break any frozen `.strict()` contract or
    // golden fixture. When omitted, the worker falls back to a real
    // (non-`"no_subtitle_style"`) rendering preset so burn-in without an
    // explicit preset still produces visible captions (see
    // `renderVideoJob.ts`).
    captionPresetId: remotionRenderVideoCaptionPresetIdSchema.optional(),
  })
  .strict();

export type RemotionRenderVideoWorkerInput = z.infer<
  typeof remotionRenderVideoWorkerInputSchema
>;
