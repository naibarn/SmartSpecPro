/**
 * `remotion_render_video` job orchestrator — extracted from
 * `apps/web/server/workers/hyperframesRenderWorker.ts`'s
 * `runRemotionRenderVideoJob`/`executeRemotionRenderVideoJob` (Lane A) so
 * BOTH Lane A (`apps/web`, in-process) and Lane B (the `apps/worker-app`
 * Remotion sidecar's `render-video` mode) run the exact same stage sequence,
 * error classification, and artifact-shape logic from ONE implementation —
 * see `planning/worker-app-remotion-render-video/plan.md` P1.
 *
 * Everything genuinely environment-agnostic (the 10-stage sequence, failure
 * code classification, mp4 sanity check, content hashing, the concurrency
 * lock) lives here. Everything genuinely environment-specific (DB-backed
 * audit logging, S3/storage upload, the SSRF host-allowlist tied to THIS
 * server's own origin, VD's styled ASS caption presets) stays OUT of this
 * package and is supplied by the CALLER via `RemotionRenderVideoJobExecutorDeps`
 * — `apps/web` injects its real server implementations (byte-identical to
 * pre-extraction behavior); the sidecar injects local-filesystem/bundled-binary
 * equivalents (see `apps/worker-app/runtime-pack/remotion-sidecar/render.mjs`).
 */
import { createHash } from "node:crypto";
import {
  closeSync,
  existsSync,
  mkdtempSync,
  openSync,
  readFileSync,
  readSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  REMOTION_RENDER_VIDEO_FAILURE_CODES,
  REMOTION_RENDER_VIDEO_PLATFORM_CONTRACT_VERSION,
  REMOTION_RENDER_VIDEO_PROGRESS_STAGES,
  REMOTION_RENDER_VIDEO_RENDERER_POLICY_VERSION,
  type RemotionRenderVideoFailureCode,
  type RemotionRenderVideoProgressStage,
  type RemotionRenderVideoWorkerInput,
} from "./remotionRenderVideoSchema";
import {
  buildAssBurnSubtitleFileContent as defaultBuildAssBurnSubtitleFileContent,
  planPostPasses as defaultPlanPostPasses,
  type AssSubtitleBuildOpts,
  type AssSubtitleLine,
  type PlanPostPassesPaths,
  type PostPassStep,
} from "./postPassArgs";
import { defaultFfmpegRunner, probeDurationSeconds, type FfmpegRunner } from "./ffmpegUtil";

/**
 * Equal to `Root.tsx`'s `GENERIC_TEMPLATE_COMPOSITION_ID` (also re-declared,
 * separately, as a Zod literal in `remotionRenderVideoWorkerInputSchema`'s
 * `compositionId` field) — deliberately NOT imported from `./Root`, which
 * pulls in the full React/Remotion composition module graph
 * (`GenericTemplateComposition.tsx`, `MarketplaceAutoReviewComposition.tsx`,
 * `@react-three/fiber`) at module-load time. This orchestrator (and anything
 * that imports it, including `apps/web`'s Lane A dispatch and its
 * schema-only importers of `shared/workerRuntime.ts`) must stay import-safe
 * without a `react/jsx-runtime` resolvable in that consumer's module
 * resolution — only the actual bundling/rendering step
 * (`renderFinalComposite.ts` / the sidecar's `render-video` mode / `apps/web`'s
 * own `remotionRuntimeAdapter.ts`) needs the real composition module.
 */
const GENERIC_TEMPLATE_COMPOSITION_ID = "GenericTemplate";

export class RemotionRenderVideoJobError extends Error {
  code: RemotionRenderVideoFailureCode;
  constructor(code: RemotionRenderVideoFailureCode, message: string) {
    super(message);
    this.name = "RemotionRenderVideoJobError";
    this.code = code;
  }
}

/** Stage-scoped fallback failure code for an error that isn't already a
 *  `RemotionRenderVideoJobError` — never a single blanket default irrespective
 *  of stage. */
const REMOTION_RENDER_VIDEO_STAGE_FALLBACK_FAILURE_CODE: Record<
  RemotionRenderVideoProgressStage,
  RemotionRenderVideoFailureCode
> = {
  resolve_inputs: "contract_version_unsupported",
  stage_assets: "asset_stage_failed",
  bundle_composition: "bundle_failed",
  select_composition: "composition_select_failed",
  render_frames: "render_failed",
  run_post_passes: "post_pass_failed",
  verify_outputs: "server_verification_failed",
  upload_artifacts: "artifact_upload_failed",
  server_verify_artifacts: "server_verification_failed",
  publish_artifacts: "artifact_upload_failed",
};

/** Maps a render failure message onto a specific failure code — never a
 *  blanket `render_failed`. */
export function classifyRemotionRenderFailure(
  message: string,
): RemotionRenderVideoFailureCode {
  const lower = message.toLowerCase();
  if (lower.includes("bundle") || lower.includes("webpack") || lower.includes("esbuild")) {
    return "bundle_failed";
  }
  if (
    lower.includes("composition") &&
    (lower.includes("not found") || lower.includes("select") || lower.includes("unknown"))
  ) {
    return "composition_select_failed";
  }
  if (
    lower.includes("chromium") ||
    lower.includes("chrome") ||
    lower.includes("browser") ||
    lower.includes("executable")
  ) {
    return "chromium_launch_failed";
  }
  return "render_failed";
}

export interface RemotionRenderVideoProgressEvent {
  jobId: string;
  stage: RemotionRenderVideoProgressStage;
  traceId?: string;
  shotIndex?: number;
  shotTotal?: number;
  message?: string;
}

function defaultEmitRemotionRenderVideoEvent(
  event: RemotionRenderVideoProgressEvent,
): void {
  console.debug(
    `[remotionRenderVideoJob] job=${event.jobId} stage=${event.stage}` +
      (event.shotIndex != null ? ` shot=${event.shotIndex}/${event.shotTotal ?? "?"}` : "") +
      (event.message ? ` — ${event.message}` : ""),
  );
}

export interface RemotionRenderVideoAssetStageResult {
  verifiedCount: number;
  skippedCount: number;
}

/**
 * Best-effort default asset-manifest verification: for every source whose
 * `url` is a directly-fetchable `http(s)://` URL, fetch it and compare its
 * sha256 against the manifest-declared hash. Sources referencing a relative
 * storage path are counted as `skipped` (informational provenance records,
 * not render inputs Remotion itself fetches — see `apps/web`'s
 * `defaultStageRemotionRenderVideoAssets` doc comment for the full rationale,
 * unchanged here).
 *
 * `isAllowedUrl` is injectable so each caller can apply its OWN SSRF policy:
 * `apps/web` injects `isAllowedInternalAssetUrl` (only its own storage-proxy
 * origin, spec §17.3) to keep Lane A behavior byte-identical; the default
 * here (used by the sidecar and any caller that doesn't override it) allows
 * any `http(s)://` URL, since the sidecar runs on a separate trust boundary
 * (a worker machine, not the web server itself) fetching from a
 * caller-declared asset manifest rather than re-entrant same-process URLs.
 */
export async function defaultStageRemotionRenderVideoAssets(
  input: {
    workspace: string;
    assetManifest: RemotionRenderVideoWorkerInput["assetManifest"];
  },
  isAllowedUrl: (url: string) => boolean = () => true,
): Promise<RemotionRenderVideoAssetStageResult> {
  let verifiedCount = 0;
  let skippedCount = 0;
  for (const source of input.assetManifest.sources) {
    if (!/^https?:\/\//i.test(source.url)) {
      skippedCount += 1;
      continue;
    }
    if (!isAllowedUrl(source.url)) {
      throw new Error(
        `Asset URL rejected by host allowlist for ${source.role} source: ${source.url}`,
      );
    }
    const response = await fetch(source.url);
    if (!response.ok) {
      throw new Error(
        `Asset fetch failed (${response.status}) for ${source.role} source: ${source.url}`,
      );
    }
    const bytes = Buffer.from(await response.arrayBuffer());
    const actualHash = createHash("sha256").update(bytes).digest("hex");
    if (actualHash !== source.sha256) {
      throw new Error(`Asset checksum mismatch for ${source.role} source: ${source.url}`);
    }
    verifiedCount += 1;
  }
  return { verifiedCount, skippedCount };
}

function verifyRemotionRenderMp4Sanity(filePath: string): {
  passed: boolean;
  sizeBytes: number;
  message?: string;
} {
  const MIN_BYTES = 10_000;
  if (!existsSync(filePath)) {
    return { passed: false, sizeBytes: 0, message: "output file does not exist" };
  }
  const sizeBytes = statSync(filePath).size;
  if (sizeBytes < MIN_BYTES) {
    return { passed: false, sizeBytes, message: `output too small (${sizeBytes} bytes)` };
  }
  const fd = openSync(filePath, "r");
  try {
    const header = Buffer.alloc(64);
    readSync(fd, header, 0, 64, 0);
    const hasFtyp = header.includes("ftyp");
    return {
      passed: hasFtyp,
      sizeBytes,
      message: hasFtyp ? undefined : "missing ftyp MP4 box signature",
    };
  } finally {
    closeSync(fd);
  }
}

function contentHashId(buffer: Buffer): string {
  return `hf_${createHash("sha256").update(buffer).digest("hex").slice(0, 48)}`;
}

export interface RemotionRenderVideoRenderInput {
  workspace: string;
  outputPath: string;
  payload: Record<string, unknown>;
  env?: Record<string, string | undefined>;
}

export interface RemotionRenderVideoRenderResult {
  outputPath: string;
  result?: unknown;
  [key: string]: unknown;
}

export interface RemotionRenderVideoStorageResult {
  key: string;
  url: string;
}

export interface RemotionRenderVideoJobExecutorDeps {
  render?: (
    input: RemotionRenderVideoRenderInput,
  ) => Promise<RemotionRenderVideoRenderResult>;
  ffmpeg?: FfmpegRunner;
  storagePut?: (
    key: string,
    filePath: string,
    contentType: string,
  ) => Promise<RemotionRenderVideoStorageResult>;
  emitEvent?: (event: RemotionRenderVideoProgressEvent) => Promise<void> | void;
  stageAssets?: (input: {
    workspace: string;
    assetManifest: RemotionRenderVideoWorkerInput["assetManifest"];
  }) => Promise<RemotionRenderVideoAssetStageResult>;
  /** Audit/observability hook — `apps/web` injects a real `auditLogger` call;
   *  the sidecar has no audit table and defaults to a no-op. */
  emitAudit?: (
    eventType: "started" | "post_pass" | "completed" | "failed",
    input: {
      tenantId?: string | null;
      traceId: string;
      renderJobId: string;
      metadata?: Record<string, unknown>;
    },
  ) => void;
  /** Post-pass argv planner — see `postPassArgs.ts`'s doc comment for why
   *  `apps/web` overrides this with its own VD-aware implementation. */
  planPostPasses?: (
    payload: RemotionRenderVideoWorkerInput,
    paths: PlanPostPassesPaths,
  ) => PostPassStep[];
  /** ASS subtitle-file content builder — see `postPassArgs.ts`'s doc comment. */
  buildAssBurnSubtitleFileContent?: (
    lines: AssSubtitleLine[],
    presetId: string,
    opts: AssSubtitleBuildOpts,
  ) => string;
}

// Concurrency (spec §18.6): one Remotion render at a time per process
// (Chromium memory). Every call is chained onto this promise so concurrent
// `executeRemotionRenderVideoJob` invocations within this process serialize
// rather than run in parallel.
let remotionRenderVideoQueueTail: Promise<unknown> = Promise.resolve();

function withRemotionRenderVideoLock<T>(run: () => Promise<T>): Promise<T> {
  const result = remotionRenderVideoQueueTail.then(run, run);
  remotionRenderVideoQueueTail = result.then(
    () => undefined,
    () => undefined,
  );
  return result;
}

export interface RunRemotionRenderVideoJobInput {
  tenantId?: string | null;
  runId: string;
  renderJobId: string;
  payload: RemotionRenderVideoWorkerInput;
  runtimeEnv?: Record<string, string | undefined>;
  /**
   * Base directory `mkdtempSync` creates this job's scratch workspace under
   * (defaults to `os.tmpdir()` — `apps/web`'s Lane A dispatch never passes
   * this, so its behavior is unchanged). The `apps/worker-app` sidecar's
   * `render-video` mode passes its own `--workspace <dir>` CLI argument here
   * so the Rust harness's disk-quota/cleanup accounting for that directory
   * actually covers where this job stages its scratch files.
   */
  workspaceRoot?: string;
}

/**
 * The 10-stage `remotion_render_video` pipeline: resolve_inputs ->
 * stage_assets -> bundle_composition -> select_composition -> render_frames
 * -> run_post_passes -> verify_outputs -> upload_artifacts ->
 * server_verify_artifacts -> publish_artifacts. Not lock-serialized itself —
 * see `executeRemotionRenderVideoJob` for the process-wide concurrency lock.
 */
export async function runRemotionRenderVideoJob(
  input: RunRemotionRenderVideoJobInput,
  deps: RemotionRenderVideoJobExecutorDeps,
): Promise<Record<string, unknown>> {
  const ffmpeg = deps.ffmpeg ?? defaultFfmpegRunner;
  const emitEvent = deps.emitEvent ?? defaultEmitRemotionRenderVideoEvent;
  const stageAssets = deps.stageAssets ?? defaultStageRemotionRenderVideoAssets;
  const emitAudit = deps.emitAudit ?? (() => {});
  const planPostPassesFn = deps.planPostPasses ?? defaultPlanPostPasses;
  const buildAssBurn = deps.buildAssBurnSubtitleFileContent ?? defaultBuildAssBurnSubtitleFileContent;
  const payload = input.payload;

  if (!deps.render) {
    throw new Error("runRemotionRenderVideoJob: deps.render is required (no portable default)");
  }
  if (!deps.storagePut) {
    throw new Error("runRemotionRenderVideoJob: deps.storagePut is required (no portable default)");
  }
  const render = deps.render;
  const storagePut = deps.storagePut;

  let currentStage: RemotionRenderVideoProgressStage = "resolve_inputs";
  const emit = async (
    stage: RemotionRenderVideoProgressStage,
    extra: Partial<RemotionRenderVideoProgressEvent> = {},
  ) => {
    currentStage = stage;
    await emitEvent({ jobId: input.renderJobId, stage, traceId: payload.traceId, ...extra });
  };

  emitAudit("started", {
    tenantId: input.tenantId,
    traceId: payload.traceId,
    renderJobId: input.renderJobId,
    metadata: {
      videoProjectId: payload.videoProjectId,
      projectRevision: payload.projectRevision,
      renderProfile: payload.renderProfile.profile,
    },
  });

  const workspace = mkdtempSync(
    join(
      input.workspaceRoot ?? tmpdir(),
      `smartspec-remotion-render-video-${input.renderJobId}-`,
    ),
  );
  try {
    await emit("resolve_inputs");
    if (
      payload.platformContractVersion !== REMOTION_RENDER_VIDEO_PLATFORM_CONTRACT_VERSION ||
      payload.rendererPolicyVersion !== REMOTION_RENDER_VIDEO_RENDERER_POLICY_VERSION
    ) {
      throw new RemotionRenderVideoJobError(
        "contract_version_unsupported",
        `Unsupported platformContractVersion/rendererPolicyVersion: ${payload.platformContractVersion}/${payload.rendererPolicyVersion} (expected ${REMOTION_RENDER_VIDEO_PLATFORM_CONTRACT_VERSION}/${REMOTION_RENDER_VIDEO_RENDERER_POLICY_VERSION})`,
      );
    }
    if (payload.compositionId !== GENERIC_TEMPLATE_COMPOSITION_ID) {
      throw new RemotionRenderVideoJobError(
        "composition_select_failed",
        `Unexpected compositionId "${payload.compositionId}" (expected "${GENERIC_TEMPLATE_COMPOSITION_ID}")`,
      );
    }

    await emit("stage_assets");
    try {
      await stageAssets({ workspace, assetManifest: payload.assetManifest });
    } catch (error) {
      throw new RemotionRenderVideoJobError(
        "asset_stage_failed",
        error instanceof Error ? error.message : String(error),
      );
    }

    await emit("bundle_composition");
    await emit("select_composition");
    await emit("render_frames");
    const renderedOutputPath = join(workspace, "render.mp4");
    let renderResult: RemotionRenderVideoRenderResult;
    try {
      renderResult = await render({
        workspace,
        outputPath: renderedOutputPath,
        payload: payload as unknown as Record<string, unknown>,
        env: input.runtimeEnv,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new RemotionRenderVideoJobError(classifyRemotionRenderFailure(message), message);
    }

    await emit("run_post_passes");
    let finalOutputPath = renderedOutputPath;
    if (payload.postPasses.length > 0) {
      emitAudit("post_pass", {
        tenantId: input.tenantId,
        traceId: payload.traceId,
        renderJobId: input.renderJobId,
        metadata: { postPasses: payload.postPasses },
      });
      try {
        let assFilePath: string | null = null;
        if (payload.postPasses.includes("ass_burn")) {
          const assContent = buildAssBurn(
            payload.captionLines ?? [],
            payload.captionPresetId ?? "classic_box",
            { playResX: payload.renderProfile.width, playResY: payload.renderProfile.height },
          );
          assFilePath = join(workspace, "captions.ass");
          writeFileSync(assFilePath, assContent, "utf-8");
        }
        const steps = planPostPassesFn(payload, {
          renderedMp4Path: renderedOutputPath,
          workspaceDir: workspace,
          assFilePath,
        });
        for (const step of steps) {
          // eslint-disable-next-line no-await-in-loop
          const runResult = await ffmpeg(step.argv);
          if (runResult.code !== 0) {
            throw new Error(
              `ffmpeg post-pass "${step.code}" exited with code ${runResult.code}: ${runResult.stderr.slice(-2_000)}`,
            );
          }
          finalOutputPath = step.outputPath;
        }
      } catch (error) {
        throw new RemotionRenderVideoJobError(
          "post_pass_failed",
          error instanceof Error ? error.message : String(error),
        );
      }
    }

    await emit("verify_outputs");
    const durationSec = await probeOutputDuration(finalOutputPath);
    const sanity = verifyRemotionRenderMp4Sanity(finalOutputPath);
    if (!sanity.passed) {
      throw new RemotionRenderVideoJobError(
        "server_verification_failed",
        sanity.message ?? "output sanity check failed",
      );
    }
    const fileBuffer = readFileSync(finalOutputPath);
    const contentHash = contentHashId(fileBuffer);

    await emit("upload_artifacts");
    const storageKey = [
      "video-intelligence",
      input.tenantId ?? "default",
      payload.videoProjectId,
      String(payload.projectRevision),
      input.renderJobId,
      "output.mp4",
    ].join("/");
    let stored: RemotionRenderVideoStorageResult;
    try {
      stored = await storagePut(storageKey, finalOutputPath, "video/mp4");
    } catch (error) {
      throw new RemotionRenderVideoJobError(
        "artifact_upload_failed",
        error instanceof Error ? error.message : String(error),
      );
    }

    await emit("server_verify_artifacts");
    await emit("publish_artifacts");

    const artifacts = [
      {
        artifactType: "remotion_render_mp4",
        storageRef: stored.key,
        url: stored.url,
        contentHash,
        mimeType: "video/mp4",
        sizeBytes: fileBuffer.byteLength,
      },
      {
        artifactType: "remotion_render_manifest",
        inline: {
          compositionId: payload.compositionId,
          width: payload.renderProfile.width,
          height: payload.renderProfile.height,
          fps: payload.renderProfile.fps,
          durationInFrames: payload.durationInFrames,
          postPasses: payload.postPasses,
          renderResult: renderResult.result ?? null,
        },
      },
      {
        artifactType: "remotion_render_log",
        inline: { stagesCompleted: [...REMOTION_RENDER_VIDEO_PROGRESS_STAGES] },
      },
      {
        artifactType: "remotion_render_probe_report",
        inline: { durationSec, sizeBytes: sanity.sizeBytes },
      },
    ];

    emitAudit("completed", {
      tenantId: input.tenantId,
      traceId: payload.traceId,
      renderJobId: input.renderJobId,
      metadata: { contentHash, sizeBytes: fileBuffer.byteLength, durationSec },
    });

    return {
      videoProjectId: payload.videoProjectId,
      projectRevision: payload.projectRevision,
      traceId: payload.traceId,
      outputUrl: stored.url,
      outputArtifactRef: artifacts[0],
      artifacts,
    };
  } catch (error) {
    const failureCode =
      error instanceof RemotionRenderVideoJobError
        ? error.code
        : REMOTION_RENDER_VIDEO_STAGE_FALLBACK_FAILURE_CODE[currentStage];
    const message = error instanceof Error ? error.message : String(error);
    if (!(REMOTION_RENDER_VIDEO_FAILURE_CODES as readonly string[]).includes(failureCode)) {
      throw new Error(`Invalid remotion_render_video failure code: ${failureCode}`);
    }
    await emit("verify_outputs", { message: `failed: ${message}` }).catch(() => {});
    emitAudit("failed", {
      tenantId: input.tenantId,
      traceId: payload.traceId,
      renderJobId: input.renderJobId,
      metadata: { failureCode, stage: currentStage, stderrTail: message.slice(-2_000) },
    });
    throw new RemotionRenderVideoJobError(failureCode, message);
  } finally {
    rmSync(workspace, { recursive: true, force: true });
  }
}

// `probeDurationSeconds` is deliberately best-effort (returns undefined on
// any ffprobe failure) — a duration probe failure alone must not fail the
// render; the hard gate is the ftyp/min-bytes sanity check.
async function probeOutputDuration(filePath: string): Promise<number | undefined> {
  return probeDurationSeconds(filePath);
}

/**
 * `remotion_render_video` executor — public entry point, injectable-deps so
 * it can be unit-tested without a real render/ffmpeg process. Serializes
 * against any other in-flight call in this process (spec §18.6).
 */
export async function executeRemotionRenderVideoJob(
  input: RunRemotionRenderVideoJobInput,
  deps: RemotionRenderVideoJobExecutorDeps = {},
): Promise<Record<string, unknown>> {
  return withRemotionRenderVideoLock(() => runRemotionRenderVideoJob(input, deps));
}
