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
export { REMOTION_EXECUTOR_RUNTIME_PACK_IDS, remotionExecutorRuntimePackManifestSchema } from "./remotionExecutorRuntimePackSchema";
export type { RemotionExecutorRuntimePackManifest } from "./remotionExecutorRuntimePackSchema";

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

/**
 * Runtime policy for the Worker App sidecar. These values are part of the
 * shared contract so the server's job timeout and the installed sidecar do
 * not silently drift apart.
 */
export const REMOTION_RENDER_VIDEO_MAX_ATTEMPTS = 3;
export const REMOTION_RENDER_VIDEO_RETRY_BACKOFF_MS = [20_000, 60_000] as const;
export const REMOTION_RENDER_VIDEO_ATTEMPT_TIMEOUT_MS = 10 * 60 * 1000;
export const REMOTION_RENDER_VIDEO_QUEUED_TTL_MS = 60 * 60 * 1000;

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

/**
 * Feature 145 — neutral registration contract for the standalone executor.
 * Keep this beside the frozen Remotion job contract so the web server, Worker
 * App compatibility layer, and standalone Node package cannot drift on the
 * admission vocabulary. This module must remain free of node:* imports.
 */
export const REMOTION_EXECUTOR_SUPPORTED_HOST_PLATFORMS = [
  "windows",
  "macos",
  "linux",
] as const;
export const REMOTION_EXECUTOR_SUPPORTED_RUNTIME_PLATFORMS = [
  "windows",
  "macos",
  "linux",
] as const;
export const REMOTION_EXECUTOR_SUPPORTED_ARCHITECTURES = ["x64", "arm64"] as const;
export const REMOTION_EXECUTOR_INSTALLATION_MODES = [
  "windows_native",
  "windows_wsl2",
  "macos_native",
  "linux_native",
] as const;
export const REMOTION_EXECUTOR_READINESS_STATUSES = ["ready", "blocked", "unavailable"] as const;
export const REMOTION_EXECUTOR_BLOCKING_REASON_CODES = [
  "browser_missing",
  "browser_incompatible",
  "ffmpeg_missing",
  "ffmpeg_incompatible",
  "ffprobe_missing",
  "ffprobe_incompatible",
  "font_set_incomplete",
  "low_disk",
  "credential_store_unavailable",
  "manifest_invalid",
  "platform_unsupported",
  "architecture_mismatch",
  "contract_mismatch",
] as const;
export const REMOTION_EXECUTOR_MAX_CONCURRENCY = 1;

const boundedAuditStringSchema = z.string().trim().min(1).max(256);
const executorCheckSchema = z.object({
  status: z.enum(["pass", "error", "unknown"]),
  reasonCode: z.enum(REMOTION_EXECUTOR_BLOCKING_REASON_CODES).nullable().default(null),
  version: z.string().trim().min(1).max(128).nullable().default(null),
}).strict().superRefine((check, ctx) => {
  if (check.status === "error" && !check.reasonCode) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["reasonCode"], message: "Failed checks require a blocking reason code" });
  }
  if (check.status === "pass" && check.reasonCode) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["reasonCode"], message: "Passing checks cannot carry a blocking reason code" });
  }
});

export const remotionExecutorRuntimeMetadataSchema = z.object({
  executorVersion: boundedAuditStringSchema,
  packId: boundedAuditStringSchema,
  packVersion: boundedAuditStringSchema,
  runtimeSource: z.enum(["existing_hermes_install", "managed_runtime_pack"]),
  hostPlatform: z.enum(REMOTION_EXECUTOR_SUPPORTED_HOST_PLATFORMS),
  runtimePlatform: z.enum(REMOTION_EXECUTOR_SUPPORTED_RUNTIME_PLATFORMS),
  architecture: z.enum(REMOTION_EXECUTOR_SUPPORTED_ARCHITECTURES),
  installationMode: z.enum(REMOTION_EXECUTOR_INSTALLATION_MODES),
  platformContractVersion: z.literal(REMOTION_RENDER_VIDEO_PLATFORM_CONTRACT_VERSION),
  rendererPolicyVersion: z.literal(REMOTION_RENDER_VIDEO_RENDERER_POLICY_VERSION),
  maxConcurrency: z.number().int().min(1).max(REMOTION_EXECUTOR_MAX_CONCURRENCY),
  manifestChecksum: z.string().regex(/^[a-f0-9]{64}$/i).nullable().default(null),
}).strict().superRefine((metadata, ctx) => {
  const validMatrix = (
    metadata.installationMode === "windows_native"
      && metadata.hostPlatform === "windows"
      && metadata.runtimePlatform === "windows"
      && metadata.architecture === "x64"
  ) || (
    metadata.installationMode === "windows_wsl2"
      && metadata.hostPlatform === "windows"
      && metadata.runtimePlatform === "linux"
      && metadata.architecture === "x64"
  ) || (
    metadata.installationMode === "macos_native"
      && metadata.hostPlatform === "macos"
      && metadata.runtimePlatform === "macos"
  ) || (
    metadata.installationMode === "linux_native"
      && metadata.hostPlatform === "linux"
      && metadata.runtimePlatform === "linux"
      && metadata.architecture === "x64"
  );
  if (!validMatrix) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["installationMode"], message: "Host, runtime platform, architecture, and installation mode are incompatible" });
  }
});

export const remotionExecutorCapabilityProfileSchema = z.object({
  capabilityFamilies: z.array(z.enum(REMOTION_RENDER_VIDEO_CAPABILITY_FAMILIES)).min(REMOTION_RENDER_VIDEO_CAPABILITY_FAMILIES.length).max(8),
  claimCapability: z.literal(REMOTION_RENDER_VIDEO_CLAIM_CAPABILITY),
  containers: z.array(z.literal("mp4")).length(1),
  codecs: z.array(z.literal("h264")).length(1),
  maxWidth: z.number().int().positive().max(16_384),
  maxHeight: z.number().int().positive().max(16_384),
  maxDurationInFrames: z.number().int().positive().max(2_000_000),
  maxConcurrency: z.number().int().min(1).max(REMOTION_EXECUTOR_MAX_CONCURRENCY),
  supportsChromiumRendering: z.boolean(),
  supportsFfmpegProbe: z.boolean(),
  supportsFfmpegPostPass: z.boolean(),
  supportsFontMaterialization: z.boolean(),
}).strict().superRefine((profile, ctx) => {
  const unique = new Set(profile.capabilityFamilies);
  if (unique.size !== profile.capabilityFamilies.length) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["capabilityFamilies"], message: "Capability families must be unique" });
  }
  for (const family of REMOTION_RENDER_VIDEO_CAPABILITY_FAMILIES) {
    if (!unique.has(family)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["capabilityFamilies"], message: `Missing required capability family ${family}` });
    }
  }
  if (!profile.supportsChromiumRendering || !profile.supportsFfmpegProbe || !profile.supportsFfmpegPostPass || !profile.supportsFontMaterialization) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["supportsChromiumRendering"], message: "The initial Remotion executor must support Chromium, FFmpeg probe/post-pass, and fonts" });
  }
});

export const remotionExecutorReadinessSchema = z.object({
  status: z.enum(REMOTION_EXECUTOR_READINESS_STATUSES),
  observedAt: z.string().datetime({ offset: true }),
  checks: z.object({
    browser: executorCheckSchema,
    ffmpeg: executorCheckSchema,
    ffprobe: executorCheckSchema,
    fontSet: executorCheckSchema,
    diskFloor: executorCheckSchema,
    credentialStore: executorCheckSchema,
    manifestIntegrity: executorCheckSchema,
    contractCompatibility: executorCheckSchema,
  }).strict(),
  blockingReasons: z.array(z.enum(REMOTION_EXECUTOR_BLOCKING_REASON_CODES)).max(8),
}).strict().superRefine((readiness, ctx) => {
  const hasFailure = Object.values(readiness.checks).some((check) => check.status === "error");
  if (readiness.status === "ready" && (hasFailure || readiness.blockingReasons.length > 0)) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["status"], message: "Ready executor must have all checks passing and no blocking reasons" });
  }
  if (readiness.status !== "ready" && readiness.blockingReasons.length === 0) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["blockingReasons"], message: "Blocked or unavailable executor must declare a blocking reason" });
  }
});

export type RemotionExecutorRuntimeMetadata = z.infer<typeof remotionExecutorRuntimeMetadataSchema>;
export type RemotionExecutorCapabilityProfile = z.infer<typeof remotionExecutorCapabilityProfileSchema>;
export type RemotionExecutorReadiness = z.infer<typeof remotionExecutorReadinessSchema>;

export const remotionExecutionTargetValues = [
  "auto",
  "desktop_worker",
  "remotion_executor",
] as const;
export const remotionResolvedExecutionTargetValues = [
  "desktop_worker",
  "remotion_executor",
] as const;
export const remotionExecutionTargetResolutionReasonValues = [
  "explicit_desktop_worker",
  "explicit_remotion_executor",
  "auto_dedicated_ready",
  "auto_tenant_flag_disabled",
  "auto_operator_kill_switch",
  "auto_no_eligible_executor",
] as const;

export const remotionExecutionTargetSchema = z.enum(remotionExecutionTargetValues);
export const remotionResolvedExecutionTargetSchema = z.enum(remotionResolvedExecutionTargetValues);
export const remotionExecutionTargetResolutionReasonSchema = z.enum(
  remotionExecutionTargetResolutionReasonValues,
);
export const remotionExecutionTargetResolutionSchema = z.object({
  requestedTarget: remotionExecutionTargetSchema,
  resolvedTarget: remotionResolvedExecutionTargetSchema,
  reason: remotionExecutionTargetResolutionReasonSchema,
  preferredWorkerId: z.string().trim().min(1).max(128).nullable(),
  selectedWorkerId: z.string().trim().min(1).max(128).nullable(),
  resolvedAt: z.string().datetime({ offset: true }),
}).strict().superRefine((resolution, ctx) => {
  if (resolution.resolvedTarget === "remotion_executor" && !resolution.selectedWorkerId) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["selectedWorkerId"], message: "A dedicated executor resolution requires a selected worker" });
  }
  if (resolution.reason === "explicit_remotion_executor" && resolution.requestedTarget !== "remotion_executor") {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["reason"], message: "Explicit executor reason requires an explicit executor request" });
  }
});

export type RemotionExecutionTarget = z.infer<typeof remotionExecutionTargetSchema>;
export type RemotionResolvedExecutionTarget = z.infer<typeof remotionResolvedExecutionTargetSchema>;
export type RemotionExecutionTargetResolution = z.infer<typeof remotionExecutionTargetResolutionSchema>;

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
