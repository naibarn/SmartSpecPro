/**
 * Node-callable Remotion render orchestration function, shared by:
 *   - `apps/web`'s in-process render worker (indirectly — `apps/web` keeps
 *     its own `executeRemotionRender()` in `remotionRuntimeAdapter.ts` for
 *     now, see that file's module doc comment for why it was NOT rewired
 *     onto this function this pass), and
 *   - the worker-app desktop-fleet Remotion sidecar
 *     (`apps/worker-app/runtime-pack/remotion-sidecar/render.mjs`), which
 *     calls this function directly.
 *
 * This is the sidecar's actual render implementation: read the manifest
 * JSON file -> validate strictly (fail closed) -> bundle the shared
 * `Root.tsx` composition entry -> `selectComposition()` -> `renderMedia()`
 * -> probe the output -> write `manifest.json` + `probe.json` into
 * `outputDir`, emitting `SidecarEvent`s at each checkpoint via `onEvent`.
 *
 * See planning/remotion-migration/plan.md Phase 10, "Sidecar contract" for
 * the full protocol documentation (argv shape, env vars, event shape,
 * output files) that this function's caller (`render.mjs`) implements.
 */
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { basename, join, resolve, sep } from "node:path";

import { bundle } from "@remotion/bundler";
import { renderMedia, selectComposition } from "@remotion/renderer";

import { resolveHardwareAcceleration } from "./hardwareAcceleration";
import { ROOT_ENTRY_POINT } from "./rootEntryPoint";
import {
  MARKETPLACE_AUTO_REVIEW_COMPOSITION_ID,
  GENERIC_TEMPLATE_COMPOSITION_ID,
} from "./Root";
import { parseRemotionSidecarManifest } from "./manifest";

export interface SidecarEvent {
  eventType: string;
  stage?: string;
  percent?: number;
  message?: string;
  [key: string]: unknown;
}

export interface RenderFinalCompositeInput {
  manifestPath: string;
  workspace: string;
  outputDir: string;
  browserExecutable?: string;
  ffmpegPath?: string;
  ffprobePath?: string;
  onEvent?: (event: SidecarEvent) => void;
}

export interface RenderFinalCompositeResult {
  outputPath: string;
}

// Bundling the composition entry point costs real time (webpack/esbuild).
// Memoize the bundle location for the lifetime of this process instead of
// re-bundling on every render — same pattern as `apps/web`'s
// `remotionRuntimeAdapter.ts`'s `getBundleLocation()`.
let bundleLocationPromise: Promise<string> | null = null;

function getBundleLocation(): Promise<string> {
  if (!bundleLocationPromise) {
    bundleLocationPromise = bundle({ entryPoint: ROOT_ENTRY_POINT }).catch(
      error => {
        bundleLocationPromise = null;
        throw error;
      }
    );
  }
  return bundleLocationPromise;
}

function pathInside(root: string, candidate: string): boolean {
  const normalizedRoot = resolve(root);
  const normalizedCandidate = resolve(candidate);
  return (
    normalizedCandidate === normalizedRoot ||
    normalizedCandidate.startsWith(`${normalizedRoot}${sep}`)
  );
}

function sha256File(filePath: string): string {
  return createHash("sha256").update(readFileSync(filePath)).digest("hex");
}

function probeVideo(
  ffprobePath: string,
  filePath: string
): Record<string, unknown> | null {
  const result = spawnSync(
    ffprobePath,
    [
      "-v",
      "error",
      "-print_format",
      "json",
      "-show_format",
      "-show_streams",
      filePath,
    ],
    { encoding: "utf8" }
  );
  if (result.error || result.status !== 0 || !result.stdout) {
    return null;
  }
  try {
    return JSON.parse(result.stdout) as Record<string, unknown>;
  } catch {
    return null;
  }
}

/**
 * Reads `manifestPath`, validates it strictly (see `manifest.ts`), renders
 * the requested composition (`MarketplaceAutoReview` or `GenericTemplate`)
 * via the shared `Root.tsx` bundle, and writes `<outputDir>/<video>`,
 * `<outputDir>/manifest.json`, and `<outputDir>/probe.json` (best-effort —
 * a missing/failing `ffprobePath` produces `probe.json: null`, it never
 * fails the render). Emits `SidecarEvent`s via `onEvent` at bundle-start,
 * render-start, progress checkpoints (every ~10%), and render-complete.
 */
export async function renderFinalComposite(
  input: RenderFinalCompositeInput
): Promise<RenderFinalCompositeResult> {
  const emit = (event: SidecarEvent): void => {
    input.onEvent?.(event);
  };

  const workspace = resolve(input.workspace);
  const outputDir = resolve(input.outputDir);
  mkdirSync(outputDir, { recursive: true });

  if (!existsSync(input.manifestPath)) {
    throw new Error(`Remotion sidecar manifest not found: ${input.manifestPath}`);
  }
  const rawManifestText = readFileSync(input.manifestPath, "utf8");
  const manifest = parseRemotionSidecarManifest(rawManifestText);

  const requestedOutputName = manifest.output.finalVideoPath
    ? basename(manifest.output.finalVideoPath)
    : "final.mp4";
  const outputPath = resolve(join(outputDir, requestedOutputName));
  if (!pathInside(outputDir, outputPath)) {
    throw new Error("final video output path escapes outputDir");
  }

  emit({
    eventType: "bundle.started",
    stage: "bundle_composition",
    percent: 2,
    message: "Bundling Remotion composition.",
  });
  const serveUrl = await getBundleLocation();
  emit({
    eventType: "bundle.succeeded",
    stage: "bundle_composition",
    percent: 10,
    message: "Bundled Remotion composition.",
  });

  const { compositionId, inputProps } = manifest.input;
  const composition = await selectComposition({
    serveUrl,
    id: compositionId,
    inputProps,
    browserExecutable: input.browserExecutable,
  });

  emit({
    eventType: "render.started",
    stage: "render_browser_css",
    percent: 12,
    compositionId,
    message: `Rendering Remotion composition "${compositionId}".`,
  });

  let lastEmittedDecile = -1;
  const renderResult = await renderMedia({
    composition,
    serveUrl,
    codec: "h264",
    outputLocation: outputPath,
    inputProps,
    browserExecutable: input.browserExecutable,
    hardwareAcceleration: resolveHardwareAcceleration(),
    onProgress: progress => {
      const percent = Math.min(
        95,
        12 + Math.round(progress.progress * 83)
      );
      const decile = Math.floor(percent / 10);
      if (decile === lastEmittedDecile) return;
      lastEmittedDecile = decile;
      emit({
        eventType: "render.progress",
        stage: "render_browser_css",
        percent,
        compositionId,
        message: `Rendering Remotion composition "${compositionId}" (${percent}%).`,
      });
    },
  });

  if (!existsSync(outputPath) || statSync(outputPath).size < 1024) {
    emit({
      eventType: "render.failed",
      stage: "render_browser_css",
      percent: 95,
      compositionId,
      errorCode: "remotion_output_missing",
      message: "Remotion render did not produce a real video file.",
    });
    throw new Error("Remotion render did not produce a real final video");
  }

  emit({
    eventType: "verify.started",
    stage: "verify_outputs",
    percent: 96,
    message: "Probing rendered output.",
  });
  const probe = input.ffprobePath
    ? probeVideo(input.ffprobePath, outputPath)
    : probeVideo("ffprobe", outputPath);
  writeFileSync(
    join(outputDir, "probe.json"),
    `${JSON.stringify(probe, null, 2)}\n`
  );

  writeFileSync(
    join(outputDir, "manifest.json"),
    `${JSON.stringify(
      {
        renderer: "remotion_renderer_official",
        officialRuntime: true,
        fallbackRender: false,
        mockRender: false,
        compositionId,
        jobId: manifest.jobId ?? null,
        assignmentAttempt: manifest.assignmentAttempt ?? null,
        width: (inputProps as { width?: number }).width ?? null,
        height: (inputProps as { height?: number }).height ?? null,
        fps: (inputProps as { fps?: number }).fps ?? null,
        durationInFrames:
          (inputProps as { durationInFrames?: number }).durationInFrames ??
          null,
        slowestFrames: renderResult.slowestFrames,
        contentType: renderResult.contentType,
        finalVideoPath: outputPath,
        finalVideoSha256: sha256File(outputPath),
      },
      null,
      2
    )}\n`
  );

  emit({
    eventType: "render.succeeded",
    stage: "verify_outputs",
    percent: 100,
    compositionId,
    message: `Rendered Remotion composition "${compositionId}".`,
  });

  return { outputPath };
}

// Re-exported here for callers that only need the composition ids, keeping
// `renderFinalComposite.ts`'s public surface self-contained.
export {
  MARKETPLACE_AUTO_REVIEW_COMPOSITION_ID,
  GENERIC_TEMPLATE_COMPOSITION_ID,
};
