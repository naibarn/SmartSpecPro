/**
 * Remotion render engine adapter — Phase 2 real implementation.
 *
 * See planning/remotion-migration/plan.md. This adapter implements the same
 * `VideoRenderInput -> VideoRenderResult` contract as the HyperFrames
 * adapter (see `videoRenderer.ts`) so `executeVideoRender()` can dispatch to
 * either engine behind the `marketplaceRemotionRendererEnabled` tenant flag
 * / `RENDERER_ENGINE` env var.
 *
 * Scope (phase 2, deliberately narrow — see `remotionCompositionService.ts`):
 * only the schema-default preset combination is supported. Anything else
 * throws `UnsupportedPresetError` so the flag stays safe to enable without
 * silently mis-rendering unported presets.
 *
 * Asset staging mirrors `hyperframesRuntimeAdapter.ts`'s
 * `stageHyperframesStorageMediaRefs()` pattern: shot source videos whose
 * `sourceVideoUrl` resolves to a `/api/storage/files/...` or `/uploads/...`
 * storage key are copied into the render workspace via `storageCopyToPath`
 * (same helper HyperFrames uses).
 *
 * NOTE (deviation from the original brief, discovered during the phase-2
 * manual smoke test — see the plan/report, not guessed): unlike HyperFrames'
 * headless-Chrome-driven `<video>`/`<audio>` tags, Remotion's `renderMedia()`
 * asset pipeline downloads every asset over HTTP/HTTPS only — it explicitly
 * rejects `file://` URLs and does not read arbitrary local absolute paths
 * off disk ("Can only download URLs starting with http:// or https://").
 * So staged local video files cannot be referenced directly by filesystem
 * path; this adapter spins up a small local static file server
 * (`startLocalAssetServer`) rooted at the render workspace's
 * `assets/media/` staging directory for the lifetime of a single render, and
 * rewrites staged shots' `sourceVideoUrl` to `http://127.0.0.1:<port>/<file>`
 * before building `inputProps`. Non-storage-key `sourceVideoUrl`s that are
 * already directly-fetchable http(s) URLs are left untouched — Remotion
 * downloads those directly.
 */
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  copyFileSync,
  createReadStream,
  existsSync,
  mkdirSync,
  statSync,
} from "node:fs";
import { createServer, type Server } from "node:http";
import { dirname, extname, join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { delimiter } from "node:path";
import { accessSync, constants as fsConstants } from "node:fs";

import { bundle } from "@remotion/bundler";
import { renderMedia, selectComposition } from "@remotion/renderer";
// Light, React-free entry — the root entry re-exports the compositions and
// would evaluate React/JSX just to read one option (see the sidecar's note on
// the 2026-07-30 "jsx3 is not a function" incident).
import { resolveHardwareAcceleration } from "@smartspec/remotion-render/render-video-job";

import { storageCopyToPath } from "../storage";
import {
  HyperframesFinalCompositeConfigSchema,
  type HyperframesFinalCompositeConfig,
} from "../../shared/hyperframes/runtimeApiSchemas";
import {
  assertRemotionPresetSupport,
  buildRemotionInputProps,
} from "./remotionCompositionService";
import {
  GENERIC_TEMPLATE_COMPOSITION_ID,
  MARKETPLACE_AUTO_REVIEW_COMPOSITION_ID,
} from "../remotion/Root";
import { RemotionTemplateConfigSchema } from "../../shared/remotion/layerTemplateSchemas";
import { buildGenericTemplateInputProps } from "./remotionTemplateService";
import type { VideoRenderInput, VideoRenderResult } from "./videoRenderer";

const currentDir = dirname(fileURLToPath(import.meta.url));
const REMOTION_ENTRY_POINT = join(currentDir, "..", "remotion", "Root.tsx");

type StorageCopier = (
  relKey: string,
  targetPath: string
) => Promise<{ key: string }>;

function storageKeyFromAssetRef(ref: string): string | null {
  const trimmed = ref.trim();
  if (!trimmed) return null;
  try {
    const path = /^https?:\/\//i.test(trimmed)
      ? new URL(trimmed).pathname
      : trimmed;
    if (path.startsWith("/api/storage/files/")) {
      return decodeURIComponent(path.slice("/api/storage/files/".length));
    }
    if (path.startsWith("/uploads/")) {
      return decodeURIComponent(path.slice("/uploads/".length));
    }
  } catch {
    return null;
  }
  return null;
}

function stagedShotFileName(storageKey: string, index: number): string {
  const hash = createHash("sha256")
    .update(storageKey)
    .digest("hex")
    .slice(0, 24);
  const ext = extname(storageKey);
  return `shot_${index}_${hash}${/^\.[a-z0-9]{1,8}$/i.test(ext) ? ext : ".mp4"}`;
}

/**
 * Stages any shot source videos that reference in-app storage keys into the
 * render workspace's `assets/media/` directory, returning an updated config
 * whose `shots[].sourceVideoUrl` point at local file paths under that
 * directory for those shots (remote http(s) URLs and other refs pass
 * through unchanged). Call `rewriteStagedShotUrlsToLocalServer` afterwards
 * to turn the staged local paths into URLs Remotion can actually download.
 */
export async function stageRemotionShotSourceVideos(
  workspace: string,
  config: HyperframesFinalCompositeConfig,
  storageCopier: StorageCopier = storageCopyToPath
): Promise<HyperframesFinalCompositeConfig> {
  const mediaDir = join(workspace, "assets", "media");
  mkdirSync(mediaDir, { recursive: true });
  const shots = await Promise.all(
    config.shots.map(async (shot, index) => {
      const storageKey = storageKeyFromAssetRef(shot.sourceVideoUrl);
      if (!storageKey) return shot;
      const targetPath = join(
        mediaDir,
        stagedShotFileName(storageKey, index)
      );
      try {
        await storageCopier(storageKey, targetPath);
      } catch (error) {
        const message =
          error instanceof Error ? error.message : String(error);
        throw new Error(
          `Remotion renderer: failed to stage source video for shot "${shot.id}" (${storageKey}): ${message}`
        );
      }
      return { ...shot, sourceVideoUrl: targetPath };
    })
  );
  return { ...config, shots };
}

const ASSET_SERVER_MIME_TYPES: Record<string, string> = {
  ".mp4": "video/mp4",
  ".mov": "video/quicktime",
  ".webm": "video/webm",
  ".m4v": "video/x-m4v",
  ".ttf": "font/ttf",
  ".otf": "font/otf",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
};

export interface LocalAssetServerHandle {
  port: number;
  close: () => Promise<void>;
}

/**
 * Starts a minimal local HTTP static file server rooted at `rootDir`, for
 * the lifetime of a single render, so Remotion (which only downloads assets
 * over http/https, see module doc comment above) can fetch locally-staged
 * shot videos. Only files inside `rootDir` are served.
 */
export function startLocalAssetServer(
  rootDir: string
): Promise<LocalAssetServerHandle> {
  return new Promise((resolve, reject) => {
    const server: Server = createServer((req, res) => {
      try {
        const requestUrl = new URL(req.url ?? "/", "http://127.0.0.1");
        const relPath = decodeURIComponent(
          requestUrl.pathname.replace(/^\/+/, "")
        );
        const filePath = join(rootDir, relPath);
        const rel = relative(rootDir, filePath);
        const isInsideRoot =
          rel !== "" && !rel.startsWith("..") && !rel.startsWith(`..${sep}`);
        if (!isInsideRoot || !existsSync(filePath)) {
          res.writeHead(404);
          res.end();
          return;
        }
        const stat = statSync(filePath);
        const contentType =
          ASSET_SERVER_MIME_TYPES[extname(filePath).toLowerCase()] ??
          "application/octet-stream";
        res.writeHead(200, {
          "Content-Type": contentType,
          "Content-Length": stat.size,
          // Remotion's headless Chromium renders the composition from a
          // `localhost:<bundlePort>` origin (the webpack bundle server), so
          // font `@font-face` fetches (and any other cross-origin fetch of
          // this server's assets, e.g. `fetch()`-based asset checks) are
          // cross-origin relative to this asset server's own random port.
          // Without an explicit CORS allow-all header here, browsers block
          // those fetches (`FontFace.load()` fails silently into the
          // soft-degrade catch in `MarketplaceAutoReviewComposition.tsx`'s
          // `ThaiFontLoader`) even though the file itself loads fine as a
          // plain `<video>`/`<img>` `src` (which isn't subject to CORS).
          "Access-Control-Allow-Origin": "*",
        });
        createReadStream(filePath).pipe(res);
      } catch {
        if (!res.headersSent) res.writeHead(500);
        res.end();
      }
    });
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      const port =
        address && typeof address === "object" ? address.port : 0;
      resolve({
        port,
        close: () =>
          new Promise<void>(resolveClose => {
            server.close(() => resolveClose());
          }),
      });
    });
  });
}

/**
 * Rewrites `sourceVideoUrl` for any shot staged under `mediaDir` (by
 * `stageRemotionShotSourceVideos`) into an `http://127.0.0.1:<port>/media/...`
 * URL served by `startLocalAssetServer(workspace/assets)` (the asset server
 * is rooted one directory above `mediaDir` so it can also serve
 * `workspace/assets/fonts/...` for the staged Thai font — see
 * `resolveAndStageRenderFont`). Shots whose `sourceVideoUrl` is already a
 * remote http(s) URL are left unchanged.
 */
export function rewriteStagedShotUrlsToLocalServer(
  config: HyperframesFinalCompositeConfig,
  mediaDir: string,
  port: number
): HyperframesFinalCompositeConfig {
  return {
    ...config,
    shots: config.shots.map(shot => {
      if (!shot.sourceVideoUrl.startsWith(mediaDir + sep)) return shot;
      const relPath = relative(mediaDir, shot.sourceVideoUrl)
        .split(sep)
        .join("/");
      return {
        ...shot,
        sourceVideoUrl: `http://127.0.0.1:${port}/media/${relPath}`,
      };
    }),
  };
}

/**
 * Resolves a Thai-capable font file the same way HyperFrames does
 * (`hyperframesRuntimeAdapter.ts`'s `resolveThaiFontPath()`), so both render
 * engines pick a comparable font: an explicit `REMOTION_THAI_FONT_PATH` env
 * override, falling back to the existing `HYPERFRAMES_THAI_FONT_PATH`
 * override (same physical font-resolution need, reused rather than
 * duplicating a second env var most deployments would never set
 * differently), falling back to `fc-match` against the same candidate list
 * HyperFrames uses. Returns `null` (never throws) when no font can be
 * resolved — fontconfig may not be installed in every environment, and a
 * render must never fail just because Thai font discovery came up empty.
 */
function resolveThaiFontPath(
  env?: Record<string, string | undefined>
): string | null {
  const source = env ?? process.env;
  const explicit = String(
    source.REMOTION_THAI_FONT_PATH ?? source.HYPERFRAMES_THAI_FONT_PATH ?? ""
  ).trim();
  if (explicit) return existsSync(explicit) ? explicit : null;
  try {
    const output = execFileSync(
      "fc-match",
      ["-f", "%{file}", "Prompt,Noto Sans Thai,Kanit,Sarabun,Loma:lang=th"],
      { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }
    ).trim();
    return output && existsSync(output) ? output : null;
  } catch {
    return null;
  }
}

export interface StagedRenderFont {
  /** File name of the staged font under `workspace/assets/fonts/`. */
  fontFileName: string;
}

/**
 * Stages a Thai-capable font file into `workspace/assets/fonts/` for this
 * render, mirroring `hyperframesRuntimeAdapter.ts`'s
 * `stageHyperframesRuntimeAssets()` font-staging behavior. The caller is
 * expected to serve `workspace/assets/` via `startLocalAssetServer` (see
 * `executeRemotionRender`) so the composition can fetch the font at
 * `http://127.0.0.1:<port>/fonts/<fontFileName>` and register it via a CSS
 * `@font-face` rule.
 *
 * Soft-degrade: returns `null` and logs a diagnostic warning (never throws)
 * when no Thai font could be resolved — the render proceeds with the
 * Chromium default font in that case.
 */
export function resolveAndStageRenderFont(
  workspace: string,
  env?: Record<string, string | undefined>
): StagedRenderFont | null {
  const fontPath = resolveThaiFontPath(env);
  if (!fontPath) {
    console.warn(
      "[remotionRuntimeAdapter] No Thai-capable font resolved (fc-match " +
        'against "Prompt,Noto Sans Thai,Kanit,Sarabun,Loma:lang=th" found ' +
        "nothing, and REMOTION_THAI_FONT_PATH/HYPERFRAMES_THAI_FONT_PATH " +
        "are unset or point at a missing file). Rendering will proceed " +
        "with the Chromium default font, which likely has no Thai glyph " +
        "coverage (Thai text may render as tofu boxes)."
    );
    return null;
  }
  const fontDir = join(workspace, "assets", "fonts");
  mkdirSync(fontDir, { recursive: true });
  const ext = extname(fontPath);
  const fontFileName = `smartspec-thai-runtime${
    /^\.[a-z0-9]{1,8}$/i.test(ext) ? ext : ".ttf"
  }`;
  copyFileSync(fontPath, join(fontDir, fontFileName));
  return { fontFileName };
}

function executableExists(filePath: string): boolean {
  try {
    accessSync(filePath, fsConstants.X_OK);
    return true;
  } catch {
    return false;
  }
}

function resolveCommandExecutable(binaryName: string): string | null {
  for (const dir of String(process.env.PATH ?? "").split(delimiter)) {
    if (!dir) continue;
    const candidate = join(dir, binaryName);
    if (executableExists(candidate)) return candidate;
  }
  return null;
}

/**
 * Best-effort local Chrome/Chromium executable resolution, mirroring
 * `hyperframesRuntimeAdapter.ts`'s `resolveBrowserExecutable()` pattern, so
 * the render worker doesn't have to pay for `@remotion/renderer`'s own
 * on-demand browser download on every cold start when a suitable browser is
 * already available in the worker image (e.g. via Playwright/Puppeteer
 * caches already used by other parts of this codebase). Returns `undefined`
 * (not a throw) when nothing is found — `@remotion/renderer` falls back to
 * its own managed-browser download in that case.
 */
export function resolveRemotionBrowserExecutable(
  env: NodeJS.ProcessEnv = process.env
): string | undefined {
  for (const configured of [
    env.REMOTION_BROWSER_EXECUTABLE,
    env.CHROME_PATH,
    env.PUPPETEER_EXECUTABLE_PATH,
    env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,
  ]) {
    const value = String(configured ?? "").trim();
    if (value && executableExists(value)) return value;
  }
  for (const command of [
    "google-chrome",
    "chrome",
    "chromium",
    "chromium-browser",
    "chrome-headless-shell",
  ]) {
    const resolved = resolveCommandExecutable(command);
    if (resolved) return resolved;
  }
  return undefined;
}

// Bundling the composition entry point costs real time (webpack/esbuild).
// Memoize the bundle location for the lifetime of this process instead of
// re-bundling on every render. A failed bundle attempt is not cached, so the
// next render retries from scratch.
let bundleLocationPromise: Promise<string> | null = null;

function getBundleLocation(): Promise<string> {
  if (!bundleLocationPromise) {
    bundleLocationPromise = bundle({
      entryPoint: REMOTION_ENTRY_POINT,
    }).catch(error => {
      bundleLocationPromise = null;
      throw error;
    });
  }
  return bundleLocationPromise;
}

function extractFinalCompositeConfig(
  payload: Record<string, unknown>
): unknown {
  return payload.finalCompositeConfig &&
    typeof payload.finalCompositeConfig === "object"
    ? payload.finalCompositeConfig
    : payload;
}

interface RenderRuntime {
  serveUrl: string;
  browserExecutable: string | undefined;
}

/**
 * Shared bundling + browser-executable resolution used by BOTH the
 * `finalCompositeConfig` (MarketplaceAutoReview) render path and the
 * `remotionTemplate` (GenericTemplate, Phase 7) render path — both
 * compositions are registered under the same `Root.tsx` entry point, so
 * they share one memoized bundle (`getBundleLocation()`) and one browser
 * executable resolution strategy. Extracted here so neither branch of
 * `executeRemotionRender()` duplicates this setup.
 */
async function resolveRenderRuntime(
  env: VideoRenderInput["env"]
): Promise<RenderRuntime> {
  const browserExecutable = resolveRemotionBrowserExecutable(
    (env as NodeJS.ProcessEnv | undefined) ?? process.env
  );
  const serveUrl = await getBundleLocation();
  return { serveUrl, browserExecutable };
}

/**
 * Renders the existing, frozen `HyperframesFinalCompositeConfigSchema` ->
 * `MarketplaceAutoReview` composition path. Behavior-identical to the
 * pre-Phase-7 implementation of `executeRemotionRender` — only extracted
 * into its own function so `executeRemotionRender` can branch on payload
 * shape (see that function's doc comment).
 */
async function executeFinalCompositeRender(
  input: VideoRenderInput
): Promise<VideoRenderResult> {
  const config = HyperframesFinalCompositeConfigSchema.parse(
    extractFinalCompositeConfig(input.payload)
  );
  assertRemotionPresetSupport(config);

  const stagedConfig = await stageRemotionShotSourceVideos(
    input.workspace,
    config
  );
  const assetsDir = join(input.workspace, "assets");
  const mediaDir = join(assetsDir, "media");
  const stagedFont = resolveAndStageRenderFont(input.workspace, input.env);
  // Server is rooted at `assets/` (not `assets/media/`) so it can also serve
  // the staged font from `assets/fonts/` over the same http server/port.
  const assetServer = await startLocalAssetServer(assetsDir);

  try {
    const resolvedConfig = rewriteStagedShotUrlsToLocalServer(
      stagedConfig,
      mediaDir,
      assetServer.port
    );
    const fontFaceUrl = stagedFont
      ? `http://127.0.0.1:${assetServer.port}/fonts/${stagedFont.fontFileName}`
      : null;
    const inputProps = buildRemotionInputProps(resolvedConfig, fontFaceUrl);
    const { serveUrl, browserExecutable } = await resolveRenderRuntime(
      input.env
    );

    const composition = await selectComposition({
      serveUrl,
      id: MARKETPLACE_AUTO_REVIEW_COMPOSITION_ID,
      inputProps,
      browserExecutable,
    });

    const renderResult = await renderMedia({
      composition,
      serveUrl,
      codec: "h264",
      outputLocation: input.outputPath,
      inputProps,
      browserExecutable,
      hardwareAcceleration: resolveHardwareAcceleration(),
    });

    return {
      engine: "remotion",
      outputPath: input.outputPath,
      inputPath: serveUrl,
      result: {
        compositionId: MARKETPLACE_AUTO_REVIEW_COMPOSITION_ID,
        width: inputProps.width,
        height: inputProps.height,
        fps: inputProps.fps,
        durationInFrames: inputProps.durationInFrames,
        shotCount: inputProps.shots.length,
        slowestFrames: renderResult.slowestFrames,
        contentType: renderResult.contentType,
      },
    };
  } finally {
    await assetServer.close();
  }
}

/**
 * Renders the new Phase 7 generic multi-layer template path
 * (`RemotionTemplateConfig` -> `GenericTemplate` composition). Unlike the
 * `finalCompositeConfig` path, `image`/`video` layer `src` fields are
 * required (by `layerTemplateSchemas.ts`'s Zod schema) to already be
 * directly-fetchable `http(s)://` URLs, so no local asset staging / static
 * file server is needed here — Remotion downloads them directly, the same
 * way it already handles non-storage-key `sourceVideoUrl`s on the other
 * path. `scene3d` layers reference only vetted, pre-bundled registry
 * components (no assets to stage at all).
 */
async function executeGenericTemplateRender(
  input: VideoRenderInput
): Promise<VideoRenderResult> {
  const config = RemotionTemplateConfigSchema.parse(
    input.payload.remotionTemplate
  );
  const inputProps = buildGenericTemplateInputProps(config);
  const { serveUrl, browserExecutable } = await resolveRenderRuntime(
    input.env
  );

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
    outputLocation: input.outputPath,
    inputProps,
    browserExecutable,
    hardwareAcceleration: resolveHardwareAcceleration(),
  });

  return {
    engine: "remotion",
    outputPath: input.outputPath,
    inputPath: serveUrl,
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
}

/**
 * Branches on payload shape (see planning/remotion-migration/plan.md
 * section 8 / Phase 7): `payload.remotionTemplate` present -> the new
 * generic layer-template path; `payload.finalCompositeConfig` present (or,
 * for backward compatibility with existing callers, no recognizable marker
 * at all — the pre-Phase-7 behavior of treating the whole payload as a
 * `HyperframesFinalCompositeConfig`) -> the existing, unchanged
 * MarketplaceAutoReview path. Neither present is only possible if the
 * payload is genuinely missing all expected fields, in which case the
 * existing path's own Zod `.parse()` throws a clear validation error — no
 * separate "neither present" branch is needed, `extractFinalCompositeConfig`
 * already falls through to treating the raw payload as the config for
 * backward compatibility.
 */
export async function executeRemotionRender(
  input: VideoRenderInput
): Promise<VideoRenderResult> {
  if (
    input.payload.remotionTemplate &&
    typeof input.payload.remotionTemplate === "object"
  ) {
    return executeGenericTemplateRender(input);
  }
  return executeFinalCompositeRender(input);
}
