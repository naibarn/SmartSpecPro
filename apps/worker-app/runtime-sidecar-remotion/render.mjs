#!/usr/bin/env node
/**
 * Remotion desktop-fleet sidecar entrypoint — the Node.js process the Rust
 * worker loop spawns to execute either a "remotion_final_composite" job
 * (`render` mode, unchanged) or a "remotion_render_video" job (`render-video`
 * mode, additive — planning/worker-app-remotion-render-video/plan.md P1),
 * mirroring `apps/worker-app/runtime-pack/hyperframes-sidecar/render.mjs`'s
 * protocol conventions exactly (same runtime-root/browser/ffmpeg resolution
 * pattern, same `SMARTAIHUB_EVENT` progress-line protocol) so the Rust side
 * only needs to branch on WHICH sidecar mode to spawn, not reinvent the
 * interprocess contract.
 *
 * `render` mode invocation (unchanged): `node render.mjs render --manifest
 *   <path> --workspace <dir> --output-dir <dir> --format mp4`
 *
 * `render-video` mode invocation (FROZEN contract — do not change without
 *   updating the P2 Rust executor in lockstep): `node render.mjs
 *   render-video --payload <path to RemotionRenderVideoWorkerInput JSON>
 *   --workspace <dir> --output-dir <dir>`. Emits one `SMARTAIHUB_EVENT
 *   {"eventType":"progress","stage":"<REMOTION_RENDER_VIDEO_PROGRESS_STAGES
 *   value>","message":"..."}` line per stage (in the contract's declared
 *   order), then a final line: either
 *   `{"eventType":"completed","outputPath":<abs path inside --output-dir>,
 *   "durationSec":<number>,"sha256":<hex>,"widthPx":<n>,"heightPx":<n>}` or
 *   `{"eventType":"failed","failureCode":<REMOTION_RENDER_VIDEO_FAILURE_CODES
 *   value>,"message":"..."}` followed by a non-zero exit. Never uploads
 *   anything itself — Rust owns artifact upload; this mode only writes the
 *   mp4 into `--output-dir` and reports its path/hash.
 *
 * Full `render` mode protocol documentation lives in
 * planning/remotion-migration/plan.md, Phase 10, "Sidecar contract".
 *
 * Both modes reuse the SAME bundled `runtime-pack/browser/` Chromium binary
 * and `runtime-pack/bin/ffmpeg`/`ffprobe` the HyperFrames sidecar already
 * uses — no separate Chromium acquisition is needed for either Remotion pack
 * variant, since `@remotion/renderer`'s `renderMedia()`/`selectComposition()`
 * accept a `browserExecutable` override.
 */
import { createHash } from "node:crypto";
import {
  copyFileSync,
  createReadStream,
  createWriteStream,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  statSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { createServer } from "node:http";
import { dirname, extname, isAbsolute, join, relative, resolve } from "node:path";
import { Readable, Transform } from "node:stream";
import { pipeline } from "node:stream/promises";

import { bundle } from "@remotion/bundler";
import { renderMedia, selectComposition } from "@remotion/renderer";

// Split imports on purpose. The package ROOT entry re-exports the Remotion
// compositions, which pull in React/JSX at module-evaluation time. Only the
// composition-rendering paths actually need those, so they are imported
// LAZILY inside the functions that use them (`loadCompositionApi()` below).
// The render-video job contract + ffmpeg helpers come from the light,
// React-free `/render-video-job` entry so simply loading this file (e.g. a
// test importing `runRenderVideoMode`, or `render-video` mode itself) never
// evaluates React. Field incident 2026-07-30: importing the root entry at
// top level made the sidecar test fail with `jsx3 is not a function`.
import {
  remotionRenderVideoWorkerInputSchema,
  executeRemotionRenderVideoJob,
  RemotionRenderVideoJobError,
  REMOTION_RENDER_VIDEO_FAILURE_CODES,
  REMOTION_RENDER_VIDEO_MAX_ATTEMPTS,
  REMOTION_RENDER_VIDEO_RETRY_BACKOFF_MS,
  REMOTION_RENDER_VIDEO_ATTEMPT_TIMEOUT_MS,
  defaultFfmpegRunner,
  probeDurationSeconds,
} from "@smartspec/remotion-render/render-video-job";

let compositionApiPromise = null;
function loadCompositionApi() {
  compositionApiPromise ??= import("@smartspec/remotion-render");
  return compositionApiPromise;
}

// OffthreadVideo downloads each remote MP4 in full before extracting a frame.
// The default 28-second delayRender window is too short for production media
// fetched through the Remotion proxy, while the surrounding Worker job already
// has a much larger execution timeout.
const REMOTION_RENDER_TIMEOUT_IN_MILLISECONDS =
  REMOTION_RENDER_VIDEO_ATTEMPT_TIMEOUT_MS;

// Remotion's implicit concurrency follows the host CPU count. That is unsafe
// for a desktop worker: one render can start many Chromium instances and make
// Windows terminate the GUI process under memory pressure. Keep one render
// worker by default; operators can raise it explicitly through the packaged
// runtime environment when the machine has been sized for that workload.
const DEFAULT_RENDER_CONCURRENCY = 1;

function resolveRenderConcurrency() {
  const requested = Number.parseInt(process.env.SMARTAIHUB_RENDER_WORKERS ?? "", 10);
  if (!Number.isFinite(requested) || requested < 1) return DEFAULT_RENDER_CONCURRENCY;
  return Math.min(requested, 4);
}

// Keep fatal Node-side failures in render.log even when the exception happens
// outside the orchestrator's normal try/catch (for example a native Chromium
// or FFmpeg binding failure). The parent Rust process remains responsible for
// converting the non-zero exit into a job failure.
process.on("uncaughtExceptionMonitor", error => {
  console.error(
    `[remotion-sidecar] uncaughtException: ${error instanceof Error ? error.stack || error.message : String(error)}`,
  );
});
process.on("unhandledRejection", reason => {
  console.error(
    `[remotion-sidecar] unhandledRejection: ${reason instanceof Error ? reason.stack || reason.message : String(reason)}`,
  );
  process.exitCode = 1;
  setImmediate(() => process.exit(1));
});

const REMOTION_STAGED_ASSET_DIRNAME = "remotion-assets";
const REMOTION_STAGED_ASSET_ROUTE = "/asset/";

function sourceFileExtension(sourceUrl, role) {
  try {
    const extension = extname(new URL(sourceUrl).pathname).toLowerCase();
    if (/^\.[a-z0-9]{1,8}$/.test(extension)) return extension;
  } catch {
    // Fall through to a role-based extension for malformed or relative URLs.
  }
  return role === "video" ? ".mp4" : role === "audio" ? ".audio" : ".asset";
}

async function streamResponseToFile(response, filePath) {
  if (!response.body) {
    const bytes = Buffer.from(await response.arrayBuffer());
    writeFileSync(filePath, bytes);
    return createHash("sha256").update(bytes).digest("hex");
  }

  const hash = createHash("sha256");
  const hashingTransform = new Transform({
    transform(chunk, _encoding, callback) {
      hash.update(chunk);
      callback(null, chunk);
    },
  });
  await pipeline(
    Readable.fromWeb(response.body),
    hashingTransform,
    createWriteStream(filePath),
  );
  return hash.digest("hex");
}

async function hashFileSha256(filePath) {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(filePath)) hash.update(chunk);
  return hash.digest("hex");
}

/**
 * Downloads manifest sources once per sidecar job. The returned files live
 * outside the orchestrator's per-attempt subdirectories so retry attempts can
 * reuse the exact same verified bytes.
 */
export async function stageRemotionAssetsLocally({
  workspace,
  assetManifest,
  fetchAsset = globalThis.fetch,
}) {
  const sources = Array.isArray(assetManifest?.sources) ? assetManifest.sources : [];
  const rootDir = join(workspace, REMOTION_STAGED_ASSET_DIRNAME);
  mkdirSync(rootDir, { recursive: true });

  if (typeof fetchAsset !== "function") {
    throw new Error("The Remotion sidecar requires fetch to stage HTTP assets");
  }

  const urlMap = new Map();
  const stagedBySource = new Map();
  let verifiedCount = 0;
  let skippedCount = 0;

  for (const [index, source] of sources.entries()) {
    const sourceUrl = typeof source?.url === "string" ? source.url : "";
    if (!/^https?:\/\//i.test(sourceUrl)) {
      skippedCount += 1;
      continue;
    }

    const sourceKey = `${sourceUrl}\u0000${source.sha256 ?? ""}`;
    const existingFileName = stagedBySource.get(sourceKey);
    if (existingFileName) {
      urlMap.set(sourceUrl, existingFileName);
      verifiedCount += 1;
      continue;
    }

    const response = await fetchAsset(sourceUrl, {
      signal: AbortSignal.timeout(REMOTION_RENDER_VIDEO_ATTEMPT_TIMEOUT_MS),
    });
    if (!response?.ok) {
      throw new Error(
        `Failed to stage Remotion asset ${sourceUrl}: HTTP ${response?.status ?? "unknown"}`,
      );
    }

    const fileName = `asset-${index}-${source.sha256?.slice(0, 24) || "unhashed"}${sourceFileExtension(sourceUrl, source.role)}`;
    const filePath = join(rootDir, fileName);
    if (source.sha256 && existsSync(filePath)) {
      const cachedSha256 = await hashFileSha256(filePath);
      if (cachedSha256 === source.sha256) {
        stagedBySource.set(sourceKey, fileName);
        urlMap.set(sourceUrl, fileName);
        verifiedCount += 1;
        continue;
      }
      unlinkSync(filePath);
    }
    let actualSha256;
    try {
      actualSha256 = await streamResponseToFile(response, filePath);
      if (source.sha256 && actualSha256 !== source.sha256) {
        throw new Error(
          `SHA-256 mismatch for Remotion asset ${sourceUrl}: expected ${source.sha256}, got ${actualSha256}`,
        );
      }
    } catch (error) {
      if (existsSync(filePath)) unlinkSync(filePath);
      throw error;
    }

    stagedBySource.set(sourceKey, fileName);
    urlMap.set(sourceUrl, fileName);
    verifiedCount += 1;
  }

  return { rootDir, urlMap, verifiedCount, skippedCount };
}

export function rewriteRemotionTemplateAssetUrls(template, urlForAsset) {
  if (!template || !Array.isArray(template.layers)) return template;
  return {
    ...template,
    layers: template.layers.map(layer => {
      if (
        !layer ||
        !["image", "video", "audio"].includes(layer.type) ||
        typeof layer.src !== "string"
      ) {
        return layer;
      }
      const localUrl = urlForAsset(layer.src);
      return localUrl ? { ...layer, src: localUrl } : layer;
    }),
  };
}

export function rewriteRemotionRenderVideoPayload(payload, urlForAsset) {
  return {
    ...payload,
    remotionTemplate: rewriteRemotionTemplateAssetUrls(
      payload.remotionTemplate,
      urlForAsset,
    ),
    ...(Array.isArray(payload.segmentTemplates)
      ? {
          segmentTemplates: payload.segmentTemplates.map(template =>
            rewriteRemotionTemplateAssetUrls(template, urlForAsset),
          ),
        }
      : {}),
  };
}

export async function startLocalRemotionAssetServer(rootDir) {
  const server = createServer((request, response) => {
    if (!request.url?.startsWith(REMOTION_STAGED_ASSET_ROUTE)) {
      response.writeHead(404).end();
      return;
    }

    let fileName;
    try {
      const requestPath = new URL(request.url, "http://127.0.0.1").pathname;
      if (!requestPath.startsWith(REMOTION_STAGED_ASSET_ROUTE)) {
        response.writeHead(404).end();
        return;
      }
      fileName = decodeURIComponent(requestPath.slice(REMOTION_STAGED_ASSET_ROUTE.length));
    } catch {
      response.writeHead(400).end();
      return;
    }
    if (!fileName || fileName.includes("/") || fileName.includes("\\")) {
      response.writeHead(400).end();
      return;
    }

    const filePath = join(rootDir, fileName);
    const relativePath = relative(resolve(rootDir), resolve(filePath));
    if (
      !relativePath ||
      relativePath.startsWith("..") ||
      isAbsolute(relativePath) ||
      !existsSync(filePath)
    ) {
      response.writeHead(404).end();
      return;
    }

    const sizeBytes = statSync(filePath).size;
    response.writeHead(200, {
      "Access-Control-Allow-Origin": "*",
      Connection: "close",
      "Content-Length": sizeBytes,
      "Content-Type": "application/octet-stream",
    });
    if (request.method !== "HEAD") createReadStream(filePath).pipe(response);
    else response.end();
  });

  await new Promise((resolveServer, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      server.off("error", reject);
      resolveServer();
    });
  });
  const address = server.address();
  if (!address || typeof address === "string") {
    await new Promise(resolveServer => server.close(resolveServer));
    throw new Error("Remotion local asset server did not expose a TCP port");
  }

  return {
    urlFor(fileName) {
      return `http://127.0.0.1:${address.port}${REMOTION_STAGED_ASSET_ROUTE}${encodeURIComponent(fileName)}`;
    },
    close() {
      return new Promise((resolveServer, reject) => {
        server.closeIdleConnections?.();
        server.close(error => (error ? reject(error) : resolveServer()));
      });
    },
  };
}

/**
 * Whether Remotion may hand H.264 encoding to the GPU.
 *
 * `renderMedia()` defaults `hardwareAcceleration` to `"disable"`, which pins
 * the encode to libx264 regardless of what hardware is present — measured
 * 2026-08-02 on a worker with an RTX 5060 Ti, Task Manager's Video Encode
 * graph sat at 0% for the whole render while the CPU carried it.
 *
 * `"if-possible"`, never `"required"`: a machine with no NVENC then falls
 * back to libx264 silently instead of failing the job outright.
 *
 * CAUTION when touching the other `renderMedia()` options: Remotion drops
 * back to software encoding whenever `crf`, `encodingMaxRate`, or
 * `encodingBufferSize` is set (see `hasSpecifiedUnsupportedHardwareQualify
 * Settings` in @remotion/renderer). None of this repo's calls set them —
 * adding one turns NVENC off again with nothing but a log line to show for
 * it.
 *
 * Shares `SMARTAIHUB_ENABLE_GPU_ENCODING` with the HyperFrames lane (Rust
 * `DEFAULT_RENDER_ENV` sets it to "1") so GPU encoding has ONE operator
 * switch across both renderers, not two.
 */
function resolveHardwareAcceleration() {
  return process.env.SMARTAIHUB_ENABLE_GPU_ENCODING === "0" ? "disable" : "if-possible";
}

function argValue(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : "";
}

function fail(message) {
  console.error(`[remotion-sidecar] ${message}`);
  process.exit(1);
}

function emitWorkerEvent(eventType, payload = {}) {
  console.log(`SMARTAIHUB_EVENT ${JSON.stringify({ eventType, ...payload })}`);
}

function findFile(root, names) {
  const pending = [root];
  while (pending.length > 0) {
    const current = pending.shift();
    if (!current || !existsSync(current)) continue;
    for (const entry of readdirSync(current, { withFileTypes: true })) {
      const absolute = join(current, entry.name);
      if (entry.isDirectory()) {
        pending.push(absolute);
      } else if (
        (entry.isFile() || entry.isSymbolicLink()) &&
        names.includes(entry.name.toLowerCase())
      ) {
        return absolute;
      }
    }
  }
  return null;
}

/**
 * Runtime-root/browser/ffmpeg resolution — SAME pattern for both `render`
 * and `render-video` modes (see module doc comment).
 */
function resolveRuntimePackPaths() {
  const runtimeRoot = resolve(
    process.env.SMARTAIHUB_RUNTIME_ROOT ||
      join(dirname(new URL(import.meta.url).pathname), "..", "..")
  );
  const runtimePack = join(runtimeRoot, "runtime-pack");

  let ffmpegPath = join(
    runtimePack,
    "bin",
    process.platform === "win32" ? "ffmpeg.exe" : "ffmpeg"
  );
  let ffprobePath = join(
    runtimePack,
    "bin",
    process.platform === "win32" ? "ffprobe.exe" : "ffprobe"
  );
  let browserExecutable = findFile(join(runtimePack, "browser"), [
    "chrome.exe",
    "headless_shell.exe",
    "chrome",
    "headless_shell",
  ]);
  const browserLibsPath = join(runtimePack, "browser-libs");
  if (existsSync(browserLibsPath)) {
    process.env.LD_LIBRARY_PATH = process.env.LD_LIBRARY_PATH
      ? `${browserLibsPath}:${process.env.LD_LIBRARY_PATH}`
      : browserLibsPath;
  }

  if (process.platform === "linux") {
    if (!existsSync(ffmpegPath)) ffmpegPath = "ffmpeg";
    if (!existsSync(ffprobePath)) ffprobePath = "ffprobe";
    // A missing bundled browser is not fatal here — @remotion/renderer can
    // fall back to its own managed Chromium resolution when
    // `browserExecutable` is left `undefined`. We still prefer the bundled
    // one for consistency/offline-friendliness.
    if (!browserExecutable) browserExecutable = undefined;
  } else {
    if (!existsSync(ffmpegPath)) fail(`FFmpeg is missing: ${ffmpegPath}`);
    if (!existsSync(ffprobePath)) fail(`ffprobe is missing: ${ffprobePath}`);
  }

  return { ffmpegPath, ffprobePath, browserExecutable };
}

async function runFinalCompositeMode() {
  const manifestPath = argValue("--manifest");
  const workspace = resolve(argValue("--workspace"));
  const outputDir = resolve(argValue("--output-dir"));
  if (!manifestPath || !workspace || !outputDir) {
    fail("render requires --manifest, --workspace, and --output-dir");
  }

  const { ffmpegPath, ffprobePath, browserExecutable } = resolveRuntimePackPaths();

  emitWorkerEvent("sidecar.started", {
    stage: "startup",
    percent: 0,
    message: "Remotion sidecar starting.",
  });

  try {
    const { renderFinalComposite } = await loadCompositionApi();
    const { outputPath } = await renderFinalComposite({
      manifestPath,
      workspace,
      outputDir,
      browserExecutable,
      ffmpegPath,
      ffprobePath,
      onEvent: event => emitWorkerEvent(event.eventType, event),
    });
    emitWorkerEvent("sidecar.completed", {
      stage: "done",
      percent: 100,
      message: "Remotion sidecar completed.",
      finalVideoPath: outputPath,
    });
  } catch (error) {
    emitWorkerEvent("sidecar.failed", {
      stage: "error",
      percent: 100,
      errorCode: "remotion_sidecar_error",
      message: error instanceof Error ? error.message : String(error),
    });
    fail(error instanceof Error ? error.stack || error.message : String(error));
  }
}

/* -------------------------------------------------------------------------- */
/* `render-video` mode — `remotion_render_video` job type (Lane B).           */
/* planning/worker-app-remotion-render-video/plan.md P1.                     */
/* -------------------------------------------------------------------------- */

// Bundling the composition entry point costs real time — memoize for the
// lifetime of this process (same pattern as `renderFinalComposite.ts`'s
// `getBundleLocation()`, duplicated here rather than imported since that
// helper is private to that module).
let bundleLocationPromise = null;
function getBundleLocation() {
  if (!bundleLocationPromise) {
    bundleLocationPromise = loadCompositionApi()
      .then(({ ROOT_ENTRY_POINT }) => bundle({ entryPoint: ROOT_ENTRY_POINT }))
      .catch(error => {
        bundleLocationPromise = null;
        throw error;
      });
  }
  return bundleLocationPromise;
}

/**
 * `render-video` mode's `deps.render` — bundles the package's shared
 * `Root.tsx` entry, selects the frozen `GenericTemplate` composition, and
 * renders it via `@remotion/renderer`'s `renderMedia()`. Mirrors
 * `apps/web/server/services/remotionRuntimeAdapter.ts#executeGenericTemplateRender`
 * (the ONLY branch of that adapter relevant to `remotion_render_video`,
 * since `payload.compositionId` is always `"GenericTemplate"`), but against
 * this package's OWN `GenericTemplateComposition.tsx` (bundled here) instead
 * of `apps/web`'s local copy.
 */
function makeRenderVideoRenderFn(browserExecutable) {
  return async function renderVideo({ outputPath, payload }) {
    const config = payload.remotionTemplate;
    const { buildGenericTemplateInputProps, GENERIC_TEMPLATE_COMPOSITION_ID } =
      await loadCompositionApi();
    const inputProps = buildGenericTemplateInputProps(config);
    const serveUrl = await getBundleLocation();
    const composition = await selectComposition({
      serveUrl,
      id: GENERIC_TEMPLATE_COMPOSITION_ID,
      inputProps,
      browserExecutable,
    });
    const renderResult = await renderMedia({
      composition,
      serveUrl,
      codec: "h264",
      outputLocation: outputPath,
      inputProps,
      browserExecutable,
      timeoutInMilliseconds: REMOTION_RENDER_TIMEOUT_IN_MILLISECONDS,
      concurrency: resolveRenderConcurrency(),
      hardwareAcceleration: resolveHardwareAcceleration(),
    });
    return {
      outputPath,
      result: {
        compositionId: GENERIC_TEMPLATE_COMPOSITION_ID,
        width: inputProps.width,
        height: inputProps.height,
        fps: inputProps.fps,
        durationInFrames: inputProps.durationInFrames,
        layerCount: inputProps.layers.length,
        slowestFrames: renderResult.slowestFrames,
        contentType: renderResult.contentType,
      },
    };
  };
}

/** `deps.storagePut` for `render-video` mode: the sidecar NEVER uploads
 *  anything (Rust owns artifact upload) — this just leaves the finished mp4
 *  at a stable path inside `--output-dir` and reports that path back. */
function makeLocalStoragePut(outputDir) {
  return async function storagePut(_key, filePath) {
    const fileName = "render.mp4";
    const destPath = join(outputDir, fileName);
    if (resolve(filePath) !== resolve(destPath)) {
      copyFileSync(filePath, destPath);
    }
    return { key: fileName, url: destPath };
  };
}

/** Maps ANY thrown error (typed `RemotionRenderVideoJobError` in most paths,
 *  per the shared orchestrator) onto the closest
 *  `REMOTION_RENDER_VIDEO_FAILURE_CODES` value — never an untyped/blanket
 *  code. */
function resolveRenderVideoFailureCode(error) {
  if (
    error instanceof RemotionRenderVideoJobError &&
    REMOTION_RENDER_VIDEO_FAILURE_CODES.includes(error.code)
  ) {
    return error.code;
  }
  return "render_failed";
}

/**
 * A failed sidecar attempt is not automatically a failed user job. Remote
 * storage proxies and Chromium can fail transiently while the same render is
 * still perfectly valid. Keep the retry decision here, at the sidecar
 * boundary, so retrying never creates a second worker job or reserves credits
 * again. Permanent input/contract/output errors must fail immediately.
 */
export function isRetryableRemotionRenderFailure(error, failureCode = resolveRenderVideoFailureCode(error)) {
  const message = error instanceof Error ? error.message : String(error ?? "");
  const lower = message.toLowerCase();

  if (
    /checksum mismatch|http\s+(400|401|403|404|410)\b|not found|invalid payload|unsupported|missing composition|missing required|outside the worker workspace|host allowlist|url rejected|unauthorized|forbidden|output too small|missing ftyp/.test(
      lower,
    )
  ) {
    return false;
  }

  if (failureCode === "contract_version_unsupported" || failureCode === "composition_select_failed") {
    return false;
  }

  if (failureCode === "server_verification_failed") {
    return /timeout|timed out|probe|temporar|econn|socket|network|i\/o|busy/.test(lower);
  }

  if (failureCode === "asset_stage_failed" || failureCode === "artifact_upload_failed") {
    return true;
  }

  if (failureCode === "chromium_launch_failed" || failureCode === "render_failed") {
    return true;
  }

  if (failureCode === "post_pass_failed") {
    return /timeout|timed out|temporar|econn|socket|network|i\/o|busy|resource/.test(lower);
  }

  return /timeout|timed out|delayrender|fetch|network|econn|etimedout|socket|proxy|429|502|503|504|temporar/.test(
    lower,
  );
}

function sleepForRetry(delayMs, sleep) {
  if (delayMs <= 0) return Promise.resolve();
  if (sleep) return sleep(delayMs);
  return new Promise(resolve => setTimeout(resolve, delayMs));
}

/**
 * `render-video` mode body — deliberately dependency-injected (`deps`
 * defaults to the real imports/`resolveRuntimePackPaths`/`emitWorkerEvent`)
 * so a test can exercise this exact function with a mocked
 * `executeRemotionRenderVideoJob` and assert the exact `SMARTAIHUB_EVENT`
 * stdout lines it emits, without a real Chromium/ffmpeg process — see
 * `apps/web/server/workers/__tests__/remotionRenderVideoSidecarMode.test.ts`.
 * `process.exit` is never called from inside this function (callers decide
 * exit behavior) so it stays testable in-process.
 */
export async function runRenderVideoMode(
  { payloadPath, workspace, outputDir },
  deps = {},
) {
  const emit = deps.emitWorkerEvent ?? emitWorkerEvent;
  const execJob = deps.executeRemotionRenderVideoJob ?? executeRemotionRenderVideoJob;
  const parseSchema = deps.parsePayload ??
    (raw => remotionRenderVideoWorkerInputSchema.parse(raw));
  const resolvePaths = deps.resolveRuntimePackPaths ?? resolveRuntimePackPaths;
  const mkdir = deps.mkdirSync ?? mkdirSync;
  const readFile = deps.readFileSync ?? readFileSync;
  const probeDuration = deps.probeDurationSeconds ?? probeDurationSeconds;
  const sleep = deps.sleep;
  const stageAssetsLocally = deps.stageAssetsLocally ?? stageRemotionAssetsLocally;
  const createAssetServer = deps.createAssetServer ?? startLocalRemotionAssetServer;

  console.log(
    `[Perf] render-video pid=${process.pid} concurrency=${resolveRenderConcurrency()} ` +
      `rssBytes=${process.memoryUsage().rss}`,
  );

  if (!payloadPath || !workspace || !outputDir) {
    throw new Error("render-video requires --payload, --workspace, and --output-dir");
  }
  mkdir(outputDir, { recursive: true });
  mkdir(workspace, { recursive: true });

  let payload;
  try {
    const raw = JSON.parse(readFile(payloadPath, "utf8"));
    payload = parseSchema(raw);
  } catch (error) {
    emit("failed", {
      failureCode: "contract_version_unsupported",
      message: `Invalid remotion_render_video payload: ${
        error instanceof Error ? error.message : String(error)
      }`,
    });
    return { exitCode: 1 };
  }

  const { ffmpegPath, ffprobePath, browserExecutable } = resolvePaths();
  // `probeDurationSeconds`/`defaultFfmpegRunner` (package defaults) resolve
  // via `FFMPEG_PATH`/`FFPROBE_PATH` env vars first — point them at this
  // sidecar's bundled binaries so the orchestrator's internal duration probe
  // and default ffmpeg runner use the SAME binaries this mode resolved,
  // exactly like the HyperFrames sidecar's own env-based resolution.
  process.env.FFMPEG_PATH = ffmpegPath;
  process.env.FFPROBE_PATH = ffprobePath;

  let localAssetServer;
  let stagedAssets;
  let renderPayload = payload;
  try {
    let result;
    for (let attempt = 1; attempt <= REMOTION_RENDER_VIDEO_MAX_ATTEMPTS; attempt += 1) {
      try {
        if (!stagedAssets) {
          let nextStagedAssets;
          try {
            nextStagedAssets = await stageAssetsLocally({
              workspace,
              assetManifest: payload.assetManifest,
              fetchAsset: deps.fetchAsset,
            });
            let nextAssetServer;
            if (nextStagedAssets.urlMap.size > 0) {
              nextAssetServer = await createAssetServer(nextStagedAssets.rootDir);
              renderPayload = rewriteRemotionRenderVideoPayload(
                payload,
                sourceUrl => {
                  const fileName = nextStagedAssets.urlMap.get(sourceUrl);
                  return fileName ? nextAssetServer.urlFor(fileName) : undefined;
                },
              );
            }
            stagedAssets = nextStagedAssets;
            localAssetServer = nextAssetServer;
          } catch (error) {
            throw new RemotionRenderVideoJobError(
              "asset_stage_failed",
              error instanceof Error ? error.message : String(error),
            );
          }
        }

        result = await execJob(
          {
            tenantId: null,
            runId: payload.videoProjectId,
            renderJobId: `sidecar-${Date.now()}-attempt-${attempt}`,
            payload: renderPayload,
            workspaceRoot: workspace,
          },
          {
            render: deps.render ?? makeRenderVideoRenderFn(browserExecutable),
            ffmpeg: deps.ffmpeg ?? defaultFfmpegRunner,
            storagePut: deps.storagePut ?? makeLocalStoragePut(outputDir),
            stageAssets: async () => ({
              verifiedCount: stagedAssets.verifiedCount,
              skippedCount: stagedAssets.skippedCount,
            }),
            emitEvent: event => emit("progress", { stage: event.stage, message: event.message }),
          },
        );
        break;
      } catch (error) {
        const failureCode = resolveRenderVideoFailureCode(error);
        const canRetry =
          attempt < REMOTION_RENDER_VIDEO_MAX_ATTEMPTS &&
          isRetryableRemotionRenderFailure(error, failureCode);
        if (!canRetry) throw error;

        const delayMs = REMOTION_RENDER_VIDEO_RETRY_BACKOFF_MS[attempt - 1] ?? 60_000;
        emit("progress", {
          stage: "render_frames",
          message: `Transient Remotion failure (${failureCode}); retrying attempt ${attempt + 1}/${REMOTION_RENDER_VIDEO_MAX_ATTEMPTS} after ${Math.ceil(delayMs / 1000)}s.`,
        });
        await sleepForRetry(delayMs, sleep);
      }
    }

    const outputPath = result.outputArtifactRef.url;
    const sha256 = await hashFileSha256(outputPath);
    const durationSec =
      (await probeDuration(outputPath)) ??
      result.artifacts?.find(a => a.artifactType === "remotion_render_probe_report")?.inline
        ?.durationSec ??
      0;

    emit("completed", {
      outputPath,
      durationSec,
      sha256,
      widthPx: payload.renderProfile.width,
      heightPx: payload.renderProfile.height,
    });
    return { exitCode: 0 };
  } catch (error) {
    const failureCode = resolveRenderVideoFailureCode(error);
    emit("failed", {
      failureCode,
      message: error instanceof Error ? error.message : String(error),
    });
    return { exitCode: 1 };
  } finally {
    if (localAssetServer) await localAssetServer.close();
  }
}

if (process.argv[1] && new URL(import.meta.url).pathname === resolve(process.argv[1])) {
  const mode = process.argv[2];
  if (mode === "render") {
    await runFinalCompositeMode();
  } else if (mode === "render-video") {
    const { exitCode } = await runRenderVideoMode({
      payloadPath: argValue("--payload"),
      workspace: resolve(argValue("--workspace")),
      outputDir: resolve(argValue("--output-dir")),
    });
    process.exit(exitCode);
  } else {
    fail("expected command: render or render-video");
  }
}
