import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import {
  accessSync,
  constants as fsConstants,
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { delimiter, dirname, extname, join } from "node:path";
import { homedir } from "node:os";

import { storageCopyToPath } from "../storage";

type HyperframesProducerModule = {
  createRenderJob?: (config: Record<string, unknown>) => unknown;
  executeRenderJob?: (
    job: unknown,
    projectDir: string,
    outputPath: string
  ) => Promise<unknown>;
};

export type HyperframesRuntimeMode = "diagnostic" | "cli" | "producer";

export interface HyperframesRuntimeAdapterEnv {
  [key: string]: string | undefined;
  HYPERFRAMES_RUNTIME_MODE?: string;
  HYPERFRAMES_PRODUCTION_RUNTIME_READY?: string;
  HYPERFRAMES_OFFICIAL_RUNTIME_READY?: string;
  HYPERFRAMES_CLI_BINARY?: string;
  HYPERFRAMES_FFMPEG_BINARY?: string;
  HYPERFRAMES_FFPROBE_BINARY?: string;
  HYPERFRAMES_ALLOW_NODE20_OFFICIAL_RUNTIME?: string;
  HYPERFRAMES_PLAYER_READY_TIMEOUT_MS?: string;
  HYPERFRAMES_PAGE_NAVIGATION_TIMEOUT_SEC?: string;
  HYPERFRAMES_THAI_FONT_PATH?: string;
}

export interface HyperframesRuntimeRenderInput {
  workspace: string;
  outputPath: string;
  payload: Record<string, unknown>;
  env?: HyperframesRuntimeAdapterEnv;
  importer?: (specifier: string) => Promise<unknown>;
  commandRunner?: (command: string, args: string[], options: { cwd?: string; env?: NodeJS.ProcessEnv }) => unknown | Promise<unknown>;
  storageCopier?: (relKey: string, targetPath: string) => Promise<{ key: string }>;
}

export interface HyperframesRuntimeRenderResult {
  renderer: "hyperframes_producer" | "hyperframes_cli";
  inputPath: string;
  outputPath: string;
  result: unknown;
  noRawHtmlExposed: true;
  officialRuntime: true;
  runtimeDiagnostics: HyperframesRuntimeDiagnostics;
}

export interface HyperframesRuntimeDiagnostics {
  runtimeMode: "official_cli_ready" | "official_producer_ready";
  nodeVersion: string;
  hyperframesCliVersion: string | null;
  hyperframesProducerVersion: string | null;
  packageNames: ["hyperframes", "@hyperframes/producer"];
  fontAssetStaged: boolean;
  playerReadyTimeoutMs: number;
}

function truthy(value: unknown): boolean {
  return /^(1|true|yes|on)$/i.test(String(value ?? "").trim());
}

function falsey(value: unknown): boolean {
  return /^(0|false|no|off|disabled)$/i.test(String(value ?? "").trim());
}

export function getHyperframesRuntimeMode(
  env?: HyperframesRuntimeAdapterEnv
): HyperframesRuntimeMode {
  const mode = String(env?.HYPERFRAMES_RUNTIME_MODE ?? "").trim().toLowerCase();
  if (!mode) return "cli";
  if (mode === "producer") return "producer";
  if (mode === "cli" || mode === "official_cli") return "cli";
  return "diagnostic";
}

function isNodeVersionAllowedForOfficialRuntime(
  env?: HyperframesRuntimeAdapterEnv
): boolean {
  if (
    process.env.NODE_ENV === "test" &&
    truthy(env?.HYPERFRAMES_ALLOW_NODE20_OFFICIAL_RUNTIME)
  ) {
    return true;
  }
  const match = /^v?(\d+)\.(\d+)\.(\d+)/.exec(process.version);
  if (!match) return false;
  const major = Number(match[1]);
  const minor = Number(match[2]);
  return major > 22 || (major === 22 && minor >= 22);
}

function officialRuntimeGatePassed(env?: HyperframesRuntimeAdapterEnv): boolean {
  if (!env) return true;
  return truthy(env.HYPERFRAMES_OFFICIAL_RUNTIME_READY) ||
    truthy(env.HYPERFRAMES_PRODUCTION_RUNTIME_READY);
}

function officialRuntimeExplicitlyBlocked(
  env?: HyperframesRuntimeAdapterEnv
): boolean {
  if (!env) return false;
  return falsey(env.HYPERFRAMES_OFFICIAL_RUNTIME_READY) ||
    falsey(env.HYPERFRAMES_PRODUCTION_RUNTIME_READY);
}

function isHyperframesPackageAvailable(packageName: string): boolean {
  return readPackageVersion(packageName) != null;
}

function isHyperframesCliBinaryAvailable(
  env?: HyperframesRuntimeAdapterEnv
): boolean {
  const explicit = String(env?.HYPERFRAMES_CLI_BINARY ?? "").trim();
  if (explicit) {
    return explicit.includes("/") || explicit.includes("\\")
      ? existsSync(explicit)
      : true;
  }
  const candidates = [
    join(process.cwd(), "node_modules", ".bin", "hyperframes"),
    join(process.cwd(), "apps", "web", "node_modules", ".bin", "hyperframes"),
    join(process.cwd(), "..", "..", "node_modules", ".bin", "hyperframes"),
  ];
  return candidates.some(candidate => existsSync(candidate)) ||
    isHyperframesPackageAvailable("hyperframes");
}

export function isHyperframesProducerRuntimeAllowed(
  env?: HyperframesRuntimeAdapterEnv
): boolean {
  return (
    getHyperframesRuntimeMode(env) === "producer" &&
    officialRuntimeGatePassed(env) &&
    !officialRuntimeExplicitlyBlocked(env) &&
    isNodeVersionAllowedForOfficialRuntime(env) &&
    isHyperframesPackageAvailable("@hyperframes/producer")
  );
}

export function isHyperframesCliRuntimeAllowed(
  env?: HyperframesRuntimeAdapterEnv
): boolean {
  return (
    getHyperframesRuntimeMode(env) === "cli" &&
    !officialRuntimeExplicitlyBlocked(env) &&
    isNodeVersionAllowedForOfficialRuntime(env) &&
    isHyperframesCliBinaryAvailable(env)
  );
}

export function assertHyperframesProducerRuntimeAllowed(
  env?: HyperframesRuntimeAdapterEnv
): void {
  if (getHyperframesRuntimeMode(env) !== "producer") {
    throw new Error("HyperFrames producer runtime was not requested.");
  }
  if (!officialRuntimeGatePassed(env) || officialRuntimeExplicitlyBlocked(env)) {
    throw new Error(
      "HyperFrames producer runtime is blocked until production rollout gates pass."
    );
  }
  if (!isNodeVersionAllowedForOfficialRuntime(env)) {
    throw new Error("HyperFrames producer runtime requires Node >=22.22 in the worker image.");
  }
  if (!isHyperframesPackageAvailable("@hyperframes/producer")) {
    throw new Error("HyperFrames producer runtime package @hyperframes/producer is not installed.");
  }
}

export function assertHyperframesCliRuntimeAllowed(
  env?: HyperframesRuntimeAdapterEnv
): void {
  if (getHyperframesRuntimeMode(env) !== "cli") {
    throw new Error("HyperFrames CLI runtime was not requested.");
  }
  if (officialRuntimeExplicitlyBlocked(env)) {
    throw new Error(
      "HyperFrames CLI runtime is blocked by explicit runtime readiness env."
    );
  }
  if (!isNodeVersionAllowedForOfficialRuntime(env)) {
    throw new Error("HyperFrames CLI runtime requires Node >=22.22 in the worker image.");
  }
  if (!isHyperframesCliBinaryAvailable(env)) {
    throw new Error("HyperFrames CLI runtime package/binary is not available.");
  }
}

function escapeHtml(value: unknown): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function buildHyperframesProducerFallbackHtml(
  payload: Record<string, unknown>
): string {
  const templateId = escapeHtml(payload.templateId ?? "marketplace_auto_review");
  const title = escapeHtml(payload.productTitle ?? payload.productId ?? "Marketplace product");
  const platform = escapeHtml(payload.platformPresetId ?? "generic_vertical_9_16");
  return `<!doctype html>
<html lang="th">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <style>
      @font-face {
        font-family: "SmartSpecThai";
        src: url("./assets/fonts/smartspec-thai-runtime.ttf") format("truetype");
        font-display: swap;
      }
      html, body { margin: 0; width: 100%; height: 100%; }
      body { font-family: "SmartSpecThai", Inter, system-ui, sans-serif; }
      [data-composition-id] {
        position: relative;
        width: 720px;
        height: 1280px;
        overflow: hidden;
        background: #0f172a;
        color: #f8fafc;
      }
      .clip {
        position: absolute;
        inset: 0;
        display: grid;
        place-items: center;
        padding: 72px;
        text-align: center;
        background: linear-gradient(135deg, #0369a1, #0f172a 58%, #f59e0b);
      }
      h1 { font-size: 48px; line-height: 1.1; margin: 0; }
      p { margin: 24px 0 0; font-size: 22px; opacity: 0.84; }
    </style>
  </head>
  <body>
    <div id="stage" data-composition-id="ssp-marketplace-auto-review"
      data-start="0" data-width="720" data-height="1280" data-duration="1">
      <section id="ssp-marketplace-auto-review-card" class="clip" data-start="0" data-duration="1" data-track-index="0">
        <div>
          <h1>${title}</h1>
          <p>${templateId} / ${platform}</p>
        </div>
      </section>
      <script>
        window.__timelines = window.__timelines || {};
        window.__timelines["ssp-marketplace-auto-review"] = {
          duration: function () { return 1; },
          seek: function () { return this; },
          pause: function () { return this; }
        };
        window.__playerReady = true;
        window.__renderReady = true;
      </script>
    </div>
  </body>
</html>`;
}

function getCompositionHtml(payload: Record<string, unknown>): string {
  return typeof payload.compositionHtml === "string" && payload.compositionHtml.trim()
    ? payload.compositionHtml
    : buildHyperframesProducerFallbackHtml(payload);
}

function missingAudioRefsFromPayload(payload: Record<string, unknown>): Set<string> {
  const config =
    payload.finalCompositeConfig && typeof payload.finalCompositeConfig === "object"
      ? (payload.finalCompositeConfig as Record<string, unknown>)
      : payload;
  const validation =
    config.audioAssetValidation && typeof config.audioAssetValidation === "object"
      ? (config.audioAssetValidation as Record<string, unknown>)
      : {};
  const refs = Array.isArray(validation.missingAssetRefs)
    ? validation.missingAssetRefs
    : [];
  return new Set(refs.map(ref => String(ref ?? "").trim()).filter(Boolean));
}

function audioSrcFromTag(tag: string): string | null {
  const match = tag.match(/\bsrc=("([^"]*)"|'([^']*)')/i);
  return (match?.[2] ?? match?.[3] ?? "").trim() || null;
}

function removeUnstageableAudioRefs(
  html: string,
  payload: Record<string, unknown>
): string {
  const missingRefs = missingAudioRefsFromPayload(payload);
  return html.replace(/<audio\b[\s\S]*?<\/audio>\s*/gi, tag => {
    const src = audioSrcFromTag(tag);
    if (!src) return tag;
    if (missingRefs.has(src)) return "";
    if (src.startsWith("/") && !storageKeyFromRuntimeAssetRef(src)) return "";
    return tag;
  });
}

function storageKeyFromRuntimeAssetRef(ref: string): string | null {
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

function stagedMediaFileName(storageKey: string): string {
  const hash = createHash("sha256").update(storageKey).digest("hex").slice(0, 24);
  const ext = extname(storageKey);
  return `${hash}${/^\.[a-z0-9]{1,8}$/i.test(ext) ? ext : ".bin"}`;
}

function isMissingStorageAssetError(error: unknown): boolean {
  const message =
    error instanceof Error ? error.message : String(error ?? "");
  return /ENOENT|NoSuchKey|NotFound|not found|404/i.test(message);
}

function storageAssetErrorMessage(error: unknown): string {
  const message =
    error instanceof Error ? error.message : String(error ?? "");
  return message.replace(/\s+/g, " ").trim().slice(0, 240) || "unknown error";
}

async function stageHyperframesStorageMediaRefs(input: {
  workspace: string;
  html: string;
  storageCopier?: HyperframesRuntimeRenderInput["storageCopier"];
}): Promise<string> {
  const attributePattern = /\b(src|href|poster)=("([^"]*)"|'([^']*)')/gi;
  const refs = new Map<string, string>();
  let match: RegExpExecArray | null;
  while ((match = attributePattern.exec(input.html))) {
    const ref = match[3] ?? match[4] ?? "";
    const storageKey = storageKeyFromRuntimeAssetRef(ref);
    if (storageKey) refs.set(ref, storageKey);
  }
  if (refs.size === 0) return input.html;

  const mediaDir = join(input.workspace, "assets", "media");
  mkdirSync(mediaDir, { recursive: true });
  const copier = input.storageCopier ?? storageCopyToPath;
  const stagedRefs = new Map<string, string>();
  for (const [ref, storageKey] of refs) {
    const stagedName = stagedMediaFileName(storageKey);
    const targetPath = join(mediaDir, stagedName);
    try {
      await copier(storageKey, targetPath);
    } catch (error) {
      if (isMissingStorageAssetError(error)) {
        throw new Error(
          `HyperFrames missing render media asset: ${storageKey}`
        );
      }
      throw new Error(
        `HyperFrames media asset staging failed for ${storageKey}: ${storageAssetErrorMessage(error)}`
      );
    }
    stagedRefs.set(ref, `./assets/media/${stagedName}`);
  }

  return input.html.replace(attributePattern, (full, attr, quoted, doubleValue, singleValue) => {
    const ref = doubleValue ?? singleValue ?? "";
    const stagedRef = stagedRefs.get(ref);
    if (!stagedRef) return full;
    const quote = quoted.startsWith("'") ? "'" : "\"";
    return `${attr}=${quote}${stagedRef}${quote}`;
  });
}

function getHyperframesVariables(payload: Record<string, unknown>): Record<string, unknown> | null {
  const variables = payload.hyperframesVariables ?? payload.variables;
  if (!variables || typeof variables !== "object" || Array.isArray(variables)) {
    return null;
  }
  return variables as Record<string, unknown>;
}

async function importHyperframesProducer(
  importer?: (specifier: string) => Promise<unknown>
): Promise<HyperframesProducerModule> {
  const importModule =
    importer ??
    ((specifier: string) =>
      new Function("specifier", "return import(specifier)")(specifier) as Promise<unknown>);
  const mod = (await importModule("@hyperframes/producer")) as HyperframesProducerModule;
  if (typeof mod.createRenderJob !== "function" || typeof mod.executeRenderJob !== "function") {
    throw new Error(
      "HyperFrames producer module does not expose createRenderJob/executeRenderJob."
    );
  }
  return mod;
}

const requireForRuntime = createRequire(import.meta.url);

function parsePositiveInt(value: string | undefined, fallback: number): number {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function resolveThaiFontPath(env?: HyperframesRuntimeAdapterEnv): string | null {
  const explicit = String(env?.HYPERFRAMES_THAI_FONT_PATH ?? "").trim();
  if (explicit && existsSync(explicit)) return explicit;
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

function stageHyperframesRuntimeAssets(
  workspace: string,
  env?: HyperframesRuntimeAdapterEnv
): { fontAssetStaged: boolean } {
  const fontPath = resolveThaiFontPath(env);
  if (!fontPath) return { fontAssetStaged: false };
  const fontDir = join(workspace, "assets", "fonts");
  mkdirSync(fontDir, { recursive: true });
  copyFileSync(fontPath, join(fontDir, "smartspec-thai-runtime.ttf"));
  return { fontAssetStaged: true };
}

function readPackageVersion(packageName: string): string | null {
  try {
    return String(requireForRuntime(`${packageName}/package.json`).version ?? "");
  } catch {
    const packagePath = packageName.split("/");
    const candidates = [
      join(process.cwd(), "node_modules", ...packagePath, "package.json"),
      join(process.cwd(), "apps", "web", "node_modules", ...packagePath, "package.json"),
      join(process.cwd(), "..", "..", "node_modules", ...packagePath, "package.json"),
    ];
    for (const candidate of candidates) {
      if (!existsSync(candidate)) continue;
      try {
        const packageJson = JSON.parse(readFileSync(candidate, "utf8")) as {
          version?: unknown;
        };
        return typeof packageJson.version === "string" ? packageJson.version : null;
      } catch {
        return null;
      }
    }
    return null;
  }
}

export function getHyperframesRuntimeDiagnostics(
  mode: "official_cli_ready" | "official_producer_ready",
  runtimeAssets: { fontAssetStaged?: boolean } = {},
  env?: HyperframesRuntimeAdapterEnv
): HyperframesRuntimeDiagnostics {
  return {
    runtimeMode: mode,
    nodeVersion: process.version,
    hyperframesCliVersion: readPackageVersion("hyperframes"),
    hyperframesProducerVersion: readPackageVersion("@hyperframes/producer"),
    packageNames: ["hyperframes", "@hyperframes/producer"],
    fontAssetStaged: runtimeAssets.fontAssetStaged === true,
    playerReadyTimeoutMs: parsePositiveInt(
      env?.HYPERFRAMES_PLAYER_READY_TIMEOUT_MS,
      5000
    ),
  };
}

function resolveHyperframesCliBinary(env?: HyperframesRuntimeAdapterEnv): string {
  const explicit = String(env?.HYPERFRAMES_CLI_BINARY ?? "").trim();
  if (explicit) return explicit;
  const candidates = [
    join(process.cwd(), "node_modules", ".bin", "hyperframes"),
    join(process.cwd(), "apps", "web", "node_modules", ".bin", "hyperframes"),
    join(process.cwd(), "..", "..", "node_modules", ".bin", "hyperframes"),
  ];
  const localBinary = candidates.find(candidate => existsSync(candidate));
  return localBinary ?? "hyperframes";
}

function executableExists(filePath: string): boolean {
  try {
    accessSync(filePath, fsConstants.X_OK);
    return true;
  } catch {
    return false;
  }
}

function uniquePathDirs(dirs: string[]): string[] {
  const seen = new Set<string>();
  return dirs
    .map(dir => dir.trim())
    .filter(Boolean)
    .filter(dir => {
      if (seen.has(dir)) return false;
      seen.add(dir);
      return true;
    });
}

function runtimeToolSearchDirs(): string[] {
  return uniquePathDirs([
    ...String(process.env.PATH ?? "").split(delimiter),
    join(homedir(), ".local", "bin"),
    "/usr/local/bin",
    "/usr/bin",
    "/bin",
  ]);
}

function resolveRuntimeExecutable(
  binaryName: "ffmpeg" | "ffprobe",
  explicitPath?: string
): string | null {
  const explicit = String(explicitPath ?? "").trim();
  if (explicit) return executableExists(explicit) ? explicit : null;
  for (const dir of runtimeToolSearchDirs()) {
    const candidate = join(dir, binaryName);
    if (executableExists(candidate)) return candidate;
  }
  return null;
}

function buildHyperframesCliProcessEnv(
  env?: HyperframesRuntimeAdapterEnv
): NodeJS.ProcessEnv {
  const ffmpegPath = resolveRuntimeExecutable("ffmpeg", env?.HYPERFRAMES_FFMPEG_BINARY);
  const ffprobePath = resolveRuntimeExecutable("ffprobe", env?.HYPERFRAMES_FFPROBE_BINARY);
  const toolDirs = [
    ffmpegPath ? dirname(ffmpegPath) : "",
    ffprobePath ? dirname(ffprobePath) : "",
  ];
  return {
    ...process.env,
    PATH: uniquePathDirs([
      ...toolDirs,
      ...String(process.env.PATH ?? "").split(delimiter),
    ]).join(delimiter),
    ...(ffmpegPath ? { FFMPEG_PATH: ffmpegPath } : {}),
    ...(ffprobePath ? { FFPROBE_PATH: ffprobePath } : {}),
  };
}

export async function executeHyperframesCliRender(
  input: HyperframesRuntimeRenderInput
): Promise<HyperframesRuntimeRenderResult> {
  assertHyperframesCliRuntimeAllowed(input.env);
  const htmlPath = join(input.workspace, "index.html");
  const compositionHtml = await stageHyperframesStorageMediaRefs({
    workspace: input.workspace,
    html: removeUnstageableAudioRefs(getCompositionHtml(input.payload), input.payload),
    storageCopier: input.storageCopier,
  });
  writeFileSync(htmlPath, compositionHtml, "utf8");
  const runtimeAssets = stageHyperframesRuntimeAssets(input.workspace, input.env);
  const command = resolveHyperframesCliBinary(input.env);
  const playerReadyTimeoutMs = parsePositiveInt(
    input.env?.HYPERFRAMES_PLAYER_READY_TIMEOUT_MS,
    5000
  );
  const pageNavigationTimeoutSec = parsePositiveInt(
    input.env?.HYPERFRAMES_PAGE_NAVIGATION_TIMEOUT_SEC,
    60
  );
  const args = [
    "render",
    input.workspace,
    "--composition",
    ".",
    "--output",
    input.outputPath,
    "--format",
    "mp4",
    "--fps",
    String(Number(input.payload.fps) || 30),
    "--quality",
    typeof input.payload.quality === "string" ? input.payload.quality : "standard",
    "--workers",
    "1",
    "--player-ready-timeout",
    String(playerReadyTimeoutMs),
    "--browser-timeout",
    String(pageNavigationTimeoutSec),
    "--strict",
  ];
  const variables = getHyperframesVariables(input.payload);
  if (variables) {
    args.push("--variables", JSON.stringify(variables), "--strict-variables");
  }
  const processEnv = buildHyperframesCliProcessEnv(input.env);
  const result = await (input.commandRunner
    ? input.commandRunner(command, args, {
        cwd: input.workspace,
        env: processEnv,
      })
    : execFileSync(command, args, {
        cwd: input.workspace,
        env: processEnv,
        stdio: "pipe",
      }));
  if (!existsSync(input.outputPath)) {
    throw new Error("HyperFrames CLI completed without creating output.mp4.");
  }
  return {
    renderer: "hyperframes_cli",
    inputPath: htmlPath,
    outputPath: input.outputPath,
    result,
    noRawHtmlExposed: true,
    officialRuntime: true,
    runtimeDiagnostics: getHyperframesRuntimeDiagnostics(
      "official_cli_ready",
      runtimeAssets,
      input.env
    ),
  };
}

export async function executeHyperframesProducerRender(
  input: HyperframesRuntimeRenderInput
): Promise<HyperframesRuntimeRenderResult> {
  assertHyperframesProducerRuntimeAllowed(input.env);
  const htmlPath = join(input.workspace, "index.html");
  const compositionHtml = await stageHyperframesStorageMediaRefs({
    workspace: input.workspace,
    html: removeUnstageableAudioRefs(getCompositionHtml(input.payload), input.payload),
    storageCopier: input.storageCopier,
  });
  writeFileSync(htmlPath, compositionHtml, "utf8");
  const runtimeAssets = stageHyperframesRuntimeAssets(input.workspace, input.env);
  const producer = await importHyperframesProducer(input.importer);
  const playerReadyTimeoutMs = parsePositiveInt(
    input.env?.HYPERFRAMES_PLAYER_READY_TIMEOUT_MS,
    5000
  );
  const job = producer.createRenderJob!({
    fps: Number(input.payload.fps) || 30,
    quality: typeof input.payload.quality === "string" ? input.payload.quality : "standard",
    format: "mp4",
    workers: 1,
    debug: false,
    entryFile: "index.html",
    variables: getHyperframesVariables(input.payload) ?? undefined,
    producerConfig: {
      playerReadyTimeoutMs,
    },
  });
  const result = await producer.executeRenderJob!(job, input.workspace, input.outputPath);
  if (!existsSync(input.outputPath)) {
    throw new Error("HyperFrames producer completed without creating output.mp4.");
  }
  return {
    renderer: "hyperframes_producer",
    inputPath: htmlPath,
    outputPath: input.outputPath,
    result,
    noRawHtmlExposed: true,
    officialRuntime: true,
    runtimeDiagnostics: getHyperframesRuntimeDiagnostics(
      "official_producer_ready",
      runtimeAssets,
      input.env
    ),
  };
}
