/**
 * Lightweight `@smartspec/remotion-render/render-video-job` subpath entry —
 * exports ONLY the `remotion_render_video` schema + job orchestrator +
 * portable ffmpeg/post-pass helpers. Deliberately does NOT re-export
 * anything from `./index.ts`'s composition surface (`Root`,
 * `GenericTemplateComposition`, `MarketplaceAutoReviewComposition`,
 * `@react-three/fiber` scenes) — those pull in a full React/Remotion
 * composition module graph that requires a working `react/jsx-runtime`
 * resolution at import time.
 *
 * `apps/web` imports from THIS subpath (not the package root) for its
 * `remotion_render_video` job orchestration (`hyperframesRenderWorker.ts`)
 * and schema re-export (`shared/workerRuntime.ts`) — those contexts (Lane A
 * dispatch, this schema's many non-Remotion importers, and this repo's
 * Vitest environment, which does not have a real `react/jsx-runtime`
 * resolvable from `apps/web/node_modules`) must stay import-safe without
 * ever loading a React component module. The actual bundle/render step
 * (`apps/web/server/services/remotionRuntimeAdapter.ts#executeRemotionRender`)
 * is injected into the orchestrator as `deps.render` and lives entirely in
 * `apps/web` — it is never imported BY this package, only the other way
 * around (this package is a dependency of `apps/web`, not vice versa).
 *
 * The `apps/worker-app` Remotion sidecar imports from the package ROOT
 * (`@smartspec/remotion-render`, `./index.ts`) instead, since it genuinely
 * needs the full composition/bundle/render surface AND runs in a real
 * Node + bundled-Chromium environment with no jsx-runtime resolution issue.
 */
export {
  REMOTION_RENDER_VIDEO_CAPABILITY_FAMILIES,
  REMOTION_RENDER_VIDEO_PROGRESS_STAGES,
  REMOTION_RENDER_VIDEO_FAILURE_CODES,
  REMOTION_RENDER_VIDEO_MAX_ATTEMPTS,
  REMOTION_RENDER_VIDEO_RETRY_BACKOFF_MS,
  REMOTION_RENDER_VIDEO_ATTEMPT_TIMEOUT_MS,
  REMOTION_RENDER_VIDEO_QUEUED_TTL_MS,
  REMOTION_RENDER_VIDEO_PLATFORM_CONTRACT_VERSION,
  REMOTION_RENDER_VIDEO_RENDERER_POLICY_VERSION,
  remotionRenderVideoProgressStageSchema,
  remotionRenderVideoFailureCodeSchema,
  remotionRenderVideoCapabilityFamilySchema,
  remotionRenderVideoCaptionPresetIdSchema,
  remotionRenderVideoWorkerInputSchema,
} from "./remotionRenderVideoSchema";
export type {
  RemotionRenderVideoProgressStage,
  RemotionRenderVideoFailureCode,
  RemotionRenderVideoCapabilityFamily,
  RemotionRenderVideoWorkerInput,
} from "./remotionRenderVideoSchema";

export {
  RemotionRenderVideoJobError,
  classifyRemotionRenderFailure,
  defaultStageRemotionRenderVideoAssets,
  runRemotionRenderVideoJob,
  executeRemotionRenderVideoJob,
} from "./renderVideoJob";
export type {
  RemotionRenderVideoJobExecutorDeps,
  RemotionRenderVideoProgressEvent,
  RemotionRenderVideoAssetStageResult,
  RemotionRenderVideoRenderInput,
  RemotionRenderVideoRenderResult,
  RemotionRenderVideoStorageResult,
  RunRemotionRenderVideoJobInput,
} from "./renderVideoJob";

export {
  defaultFfmpegRunner,
  probeDurationSeconds,
  resolveFfBinary,
} from "./ffmpegUtil";
export type { FfmpegRunner } from "./ffmpegUtil";

// Re-exported from the React-free entry on purpose: `apps/web`'s render
// adapter needs the GPU-encoding policy but must NOT pull the compositions
// (and therefore React/JSX) in through the root entry.
export { resolveHardwareAcceleration } from "./hardwareAcceleration";
export type { RemotionHardwareAcceleration } from "./hardwareAcceleration";

export {
  buildLoudnormPassArgs,
  buildAssBurnPassArgs,
  buildConcatListFileContent,
  buildConcatFfmpegArgs,
  planPostPasses,
  buildAssBurnSubtitleFileContent,
  escapeFfmpegFilterPath,
  REMOTION_POST_PASS_LOUDNORM_FILTER,
} from "./postPassArgs";
export type {
  PostPassStep,
  PlanPostPassesPaths,
  PlanPostPassesPayload,
  ConcatCommandSpec,
  AssSubtitleLine,
  AssSubtitleBuildOpts,
} from "./postPassArgs";

// Re-declared here (NOT imported from `./Root`, see this file's doc
// comment) so callers can still validate `compositionId` without pulling in
// React. Kept in sync with `Root.tsx`'s `GENERIC_TEMPLATE_COMPOSITION_ID` —
// both are frozen string literals unlikely to ever change.
export const GENERIC_TEMPLATE_COMPOSITION_ID = "GenericTemplate";
