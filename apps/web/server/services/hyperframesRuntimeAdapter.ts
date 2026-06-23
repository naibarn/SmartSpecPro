import { execFile, execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import { promisify } from "node:util";
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
  HYPERFRAMES_BROWSER_BINARY?: string;
  HYPERFRAMES_FFMPEG_BINARY?: string;
  HYPERFRAMES_FFPROBE_BINARY?: string;
  HYPERFRAMES_ALLOW_NODE20_OFFICIAL_RUNTIME?: string;
  HYPERFRAMES_PLAYER_READY_TIMEOUT_MS?: string;
  HYPERFRAMES_PAGE_NAVIGATION_TIMEOUT_SEC?: string;
  HYPERFRAMES_CLI_RENDER_HARD_TIMEOUT_MS?: string;
  HYPERFRAMES_THAI_FONT_PATH?: string;
}

export interface HyperframesRuntimeRenderInput {
  workspace: string;
  outputPath: string;
  payload: Record<string, unknown>;
  env?: HyperframesRuntimeAdapterEnv;
  importer?: (specifier: string) => Promise<unknown>;
  commandRunner?: (command: string, args: string[], options: { cwd?: string; env?: NodeJS.ProcessEnv; timeout?: number; maxBuffer?: number }) => unknown | Promise<unknown>;
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
  pageNavigationTimeoutSec: number;
}

function truthy(value: unknown): boolean {
  return /^(1|true|yes|on)$/i.test(String(value ?? "").trim());
}

function falsey(value: unknown): boolean {
  return /^(0|false|no|off|disabled)$/i.test(String(value ?? "").trim());
}

function runtimeEnv(
  env?: HyperframesRuntimeAdapterEnv
): HyperframesRuntimeAdapterEnv {
  return (env ?? process.env) as HyperframesRuntimeAdapterEnv;
}

export function getHyperframesRuntimeMode(
  env?: HyperframesRuntimeAdapterEnv
): HyperframesRuntimeMode {
  const mode = String(runtimeEnv(env).HYPERFRAMES_RUNTIME_MODE ?? "").trim().toLowerCase();
  if (!mode) return "cli";
  if (mode === "producer") return "producer";
  if (mode === "cli" || mode === "official_cli") return "cli";
  return "diagnostic";
}

function isNodeVersionAllowedForOfficialRuntime(
  env?: HyperframesRuntimeAdapterEnv
): boolean {
  const resolvedEnv = runtimeEnv(env);
  if (
    process.env.NODE_ENV === "test" &&
    truthy(resolvedEnv.HYPERFRAMES_ALLOW_NODE20_OFFICIAL_RUNTIME)
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
  const resolvedEnv = runtimeEnv(env);
  return truthy(resolvedEnv.HYPERFRAMES_OFFICIAL_RUNTIME_READY) ||
    truthy(resolvedEnv.HYPERFRAMES_PRODUCTION_RUNTIME_READY);
}

function officialRuntimeExplicitlyBlocked(
  env?: HyperframesRuntimeAdapterEnv
): boolean {
  const resolvedEnv = runtimeEnv(env);
  return falsey(resolvedEnv.HYPERFRAMES_OFFICIAL_RUNTIME_READY) ||
    falsey(resolvedEnv.HYPERFRAMES_PRODUCTION_RUNTIME_READY);
}

function isHyperframesPackageAvailable(packageName: string): boolean {
  return readPackageVersion(packageName) != null;
}

function isHyperframesCliBinaryAvailable(
  env?: HyperframesRuntimeAdapterEnv
): boolean {
  return resolveHyperframesCliBinaryPath(env) != null;
}

function commonOfficialRuntimeReadinessIssues(
  env?: HyperframesRuntimeAdapterEnv
): string[] {
  const resolvedEnv = runtimeEnv(env);
  const issues: string[] = [];
  if (!officialRuntimeGatePassed(resolvedEnv) || officialRuntimeExplicitlyBlocked(resolvedEnv)) {
    issues.push(
      "HyperFrames official runtime is blocked: readiness flag is not enabled. Run `npm --prefix apps/web run hyperframes:doctor` in the target worker image, confirm `official_runtime_ready`, then set `HYPERFRAMES_OFFICIAL_RUNTIME_READY=1`."
    );
  }
  if (!isNodeVersionAllowedForOfficialRuntime(resolvedEnv)) {
    issues.push("HyperFrames official runtime requires Node >=22.22 in the worker image.");
  }
  if (!resolveRuntimeExecutable("ffmpeg", resolvedEnv.HYPERFRAMES_FFMPEG_BINARY)) {
    issues.push("FFmpeg binary is not available. Install ffmpeg or set `HYPERFRAMES_FFMPEG_BINARY` to an executable path.");
  }
  if (!resolveRuntimeExecutable("ffprobe", resolvedEnv.HYPERFRAMES_FFPROBE_BINARY)) {
    issues.push("FFprobe binary is not available. Install ffprobe or set `HYPERFRAMES_FFPROBE_BINARY` to an executable path.");
  }
  if (!resolveThaiFontPath(resolvedEnv)) {
    issues.push("Thai-capable render font is not available. Install Prompt/Noto Sans Thai/Kanit/Sarabun/Loma or set `HYPERFRAMES_THAI_FONT_PATH`.");
  }
  if (!resolveBrowserExecutable(resolvedEnv)) {
    issues.push("Chrome/headless browser runtime is not available. Install Playwright Chromium/Chrome or set `HYPERFRAMES_BROWSER_BINARY`.");
  }
  return issues;
}

export function getHyperframesProducerRuntimeReadinessIssues(
  env?: HyperframesRuntimeAdapterEnv
): string[] {
  const issues: string[] = [];
  if (getHyperframesRuntimeMode(env) !== "producer") {
    issues.push("HyperFrames producer runtime was not requested.");
  }
  issues.push(...commonOfficialRuntimeReadinessIssues(env));
  if (!isHyperframesPackageAvailable("@hyperframes/producer")) {
    issues.push("HyperFrames producer runtime package @hyperframes/producer is not installed.");
  }
  return issues;
}

export function getHyperframesCliRuntimeReadinessIssues(
  env?: HyperframesRuntimeAdapterEnv
): string[] {
  const issues: string[] = [];
  if (getHyperframesRuntimeMode(env) !== "cli") {
    issues.push("HyperFrames CLI runtime was not requested.");
  }
  issues.push(...commonOfficialRuntimeReadinessIssues(env));
  if (!isHyperframesCliBinaryAvailable(env)) {
    issues.push("HyperFrames CLI runtime package/binary is not available. Install the pinned HyperFrames CLI or set `HYPERFRAMES_CLI_BINARY`.");
  }
  return issues;
}

export function isHyperframesProducerRuntimeAllowed(
  env?: HyperframesRuntimeAdapterEnv
): boolean {
  return getHyperframesProducerRuntimeReadinessIssues(env).length === 0;
}

export function isHyperframesCliRuntimeAllowed(
  env?: HyperframesRuntimeAdapterEnv
): boolean {
  return getHyperframesCliRuntimeReadinessIssues(env).length === 0;
}

export function assertHyperframesProducerRuntimeAllowed(
  env?: HyperframesRuntimeAdapterEnv
): void {
  const issues = getHyperframesProducerRuntimeReadinessIssues(env);
  if (issues.length > 0) throw new Error(issues.join(" "));
}

export function assertHyperframesCliRuntimeAllowed(
  env?: HyperframesRuntimeAdapterEnv
): void {
  const issues = getHyperframesCliRuntimeReadinessIssues(env);
  if (issues.length > 0) throw new Error(issues.join(" "));
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
const execFileAsync = promisify(execFile);

function parsePositiveInt(value: string | undefined, fallback: number): number {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function numberFromUnknown(value: unknown): number | null {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function getFinalCompositeDurationSec(payload: Record<string, unknown>): number {
  const config = payload.finalCompositeConfig && typeof payload.finalCompositeConfig === "object"
    ? payload.finalCompositeConfig as Record<string, unknown>
    : {};
  const directDuration =
    numberFromUnknown(config.finalVideoLengthSec) ??
    numberFromUnknown(payload.finalVideoLengthSec) ??
    numberFromUnknown(config.durationSec) ??
    numberFromUnknown(payload.durationSec);
  if (directDuration) return directDuration;
  const shots = Array.isArray(config.shots) ? config.shots : Array.isArray(payload.shots) ? payload.shots : [];
  return shots.reduce((sum, shot) => {
    if (!shot || typeof shot !== "object") return sum;
    return sum + (numberFromUnknown((shot as Record<string, unknown>).durationSec) ?? 0);
  }, 0);
}

export function resolveHyperframesCliRenderTimeouts(
  payload: Record<string, unknown>,
  env?: HyperframesRuntimeAdapterEnv
): { playerReadyTimeoutMs: number; pageNavigationTimeoutSec: number } {
  const durationSec = getFinalCompositeDurationSec(payload);
  const shotCount = (() => {
    const config = payload.finalCompositeConfig && typeof payload.finalCompositeConfig === "object"
      ? payload.finalCompositeConfig as Record<string, unknown>
      : {};
    const shots = Array.isArray(config.shots) ? config.shots : Array.isArray(payload.shots) ? payload.shots : [];
    return shots.length;
  })();
  const longCompositePlayerTimeoutMs =
    durationSec >= 180 || shotCount >= 6 ? 180_000 : durationSec >= 60 || shotCount >= 3 ? 120_000 : 60_000;
  const longCompositeBrowserTimeoutSec =
    durationSec >= 180 || shotCount >= 6 ? 900 : durationSec >= 60 || shotCount >= 3 ? 420 : 180;
  return {
    playerReadyTimeoutMs: parsePositiveInt(
      env?.HYPERFRAMES_PLAYER_READY_TIMEOUT_MS,
      longCompositePlayerTimeoutMs,
    ),
    pageNavigationTimeoutSec: parsePositiveInt(
      env?.HYPERFRAMES_PAGE_NAVIGATION_TIMEOUT_SEC,
      longCompositeBrowserTimeoutSec,
    ),
  };
}

export function resolveHyperframesCliRenderHardTimeoutMs(
  payload: Record<string, unknown>,
  env?: HyperframesRuntimeAdapterEnv
): number {
  const explicit = parsePositiveInt(env?.HYPERFRAMES_CLI_RENDER_HARD_TIMEOUT_MS, 0);
  if (explicit > 0) return explicit;
  const durationSec = getFinalCompositeDurationSec(payload);
  const config = payload.finalCompositeConfig && typeof payload.finalCompositeConfig === "object"
    ? payload.finalCompositeConfig as Record<string, unknown>
    : {};
  const shots = Array.isArray(config.shots) ? config.shots : Array.isArray(payload.shots) ? payload.shots : [];
  const shotCount = shots.length;
  const isFinalComposite =
    payload.renderIntent === "final" ||
    payload.compositionMode === "captioned_final_composite" ||
    (payload.finalCompositeConfig && typeof payload.finalCompositeConfig === "object");
  if (isFinalComposite) {
    const estimatedMs = Math.max(
      60 * 60_000,
      Math.ceil(durationSec * 15_000) + shotCount * 5 * 60_000,
    );
    return Math.min(6 * 60 * 60_000, estimatedMs);
  }
  const estimatedMs = Math.max(15 * 60_000, Math.ceil(durationSec * 5_000));
  return Math.min(60 * 60_000, estimatedMs);
}

function resolveThaiFontPath(env?: HyperframesRuntimeAdapterEnv): string | null {
  const explicit = String(runtimeEnv(env).HYPERFRAMES_THAI_FONT_PATH ?? "").trim();
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
  env?: HyperframesRuntimeAdapterEnv,
  timeouts?: { playerReadyTimeoutMs: number; pageNavigationTimeoutSec: number }
): HyperframesRuntimeDiagnostics {
  return {
    runtimeMode: mode,
    nodeVersion: process.version,
    hyperframesCliVersion: readPackageVersion("hyperframes"),
    hyperframesProducerVersion: readPackageVersion("@hyperframes/producer"),
    packageNames: ["hyperframes", "@hyperframes/producer"],
    fontAssetStaged: runtimeAssets.fontAssetStaged === true,
    playerReadyTimeoutMs:
      timeouts?.playerReadyTimeoutMs ??
      parsePositiveInt(env?.HYPERFRAMES_PLAYER_READY_TIMEOUT_MS, 5000),
    pageNavigationTimeoutSec:
      timeouts?.pageNavigationTimeoutSec ??
      parsePositiveInt(env?.HYPERFRAMES_PAGE_NAVIGATION_TIMEOUT_SEC, 60),
  };
}

export function resolveHyperframesCliBinary(env?: HyperframesRuntimeAdapterEnv): string {
  const resolved = resolveHyperframesCliBinaryPath(env);
  if (resolved) return resolved;
  const explicit = String(runtimeEnv(env).HYPERFRAMES_CLI_BINARY ?? "").trim();
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

function resolveConfiguredExecutable(value?: string): string | null {
  const configured = String(value ?? "").trim();
  if (!configured) return null;
  if (configured.includes("/") || configured.includes("\\")) {
    return executableExists(configured) ? configured : null;
  }
  return resolveCommandExecutable(configured);
}

function resolveCommandExecutable(binaryName: string): string | null {
  const command = binaryName.trim();
  if (!command) return null;
  for (const dir of runtimeToolSearchDirs()) {
    const candidate = join(dir, command);
    if (executableExists(candidate)) return candidate;
  }
  return null;
}

function resolveHyperframesCliBinaryPath(
  env?: HyperframesRuntimeAdapterEnv
): string | null {
  const configured = String(runtimeEnv(env).HYPERFRAMES_CLI_BINARY ?? "").trim();
  if (configured) return resolveConfiguredExecutable(configured);
  const candidates = [
    join(process.cwd(), "node_modules", ".bin", "hyperframes"),
    join(process.cwd(), "apps", "web", "node_modules", ".bin", "hyperframes"),
    join(process.cwd(), "..", "..", "node_modules", ".bin", "hyperframes"),
  ];
  const localBinary = candidates.find(candidate => executableExists(candidate));
  return localBinary ?? resolveCommandExecutable("hyperframes");
}

function resolveBrowserExecutable(
  env?: HyperframesRuntimeAdapterEnv
): string | null {
  const resolvedEnv = runtimeEnv(env);
  for (const configured of [
    resolvedEnv.HYPERFRAMES_BROWSER_BINARY,
    resolvedEnv.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,
    resolvedEnv.CHROME_PATH,
    resolvedEnv.PUPPETEER_EXECUTABLE_PATH,
  ]) {
    const value = String(configured ?? "").trim();
    if (value) return resolveConfiguredExecutable(value);
  }

  for (const command of [
    "google-chrome",
    "chrome",
    "chromium",
    "chromium-browser",
    "chrome-headless-shell",
  ]) {
    const executable = resolveCommandExecutable(command);
    if (executable) return executable;
  }

  try {
    const playwright = requireForRuntime("playwright") as {
      chromium?: { executablePath?: () => string };
    };
    const executable = playwright.chromium?.executablePath?.();
    return executable && executableExists(executable) ? executable : null;
  } catch {
    return null;
  }
}

function resolveRuntimeExecutable(
  binaryName: "ffmpeg" | "ffprobe",
  explicitPath?: string
): string | null {
  const explicit = String(explicitPath ?? "").trim();
  if (explicit) return resolveConfiguredExecutable(explicit);
  for (const dir of runtimeToolSearchDirs()) {
    const candidate = join(dir, binaryName);
    if (executableExists(candidate)) return candidate;
  }
  return null;
}

export function buildHyperframesCliProcessEnv(
  env?: HyperframesRuntimeAdapterEnv
): NodeJS.ProcessEnv {
  const resolvedEnv = runtimeEnv(env);
  const ffmpegPath = resolveRuntimeExecutable("ffmpeg", resolvedEnv.HYPERFRAMES_FFMPEG_BINARY);
  const ffprobePath = resolveRuntimeExecutable("ffprobe", resolvedEnv.HYPERFRAMES_FFPROBE_BINARY);
  const browserPath = resolveBrowserExecutable(resolvedEnv);
  const toolDirs = [
    ffmpegPath ? dirname(ffmpegPath) : "",
    ffprobePath ? dirname(ffprobePath) : "",
    browserPath ? dirname(browserPath) : "",
  ];
  return {
    ...process.env,
    PATH: uniquePathDirs([
      ...toolDirs,
      ...String(process.env.PATH ?? "").split(delimiter),
    ]).join(delimiter),
    ...(ffmpegPath ? { FFMPEG_PATH: ffmpegPath } : {}),
    ...(ffprobePath ? { FFPROBE_PATH: ffprobePath } : {}),
    ...(browserPath
      ? {
          CHROME_PATH: browserPath,
          PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH: browserPath,
        }
      : {}),
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
  const { playerReadyTimeoutMs, pageNavigationTimeoutSec } =
    resolveHyperframesCliRenderTimeouts(input.payload, input.env);
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
  const hardTimeoutMs = resolveHyperframesCliRenderHardTimeoutMs(
    input.payload,
    input.env,
  );
  const result = await (input.commandRunner
    ? input.commandRunner(command, args, {
        cwd: input.workspace,
        env: processEnv,
        timeout: hardTimeoutMs,
        maxBuffer: 20 * 1024 * 1024,
      })
    : execFileAsync(command, args, {
        cwd: input.workspace,
        env: processEnv,
        timeout: hardTimeoutMs,
        maxBuffer: 20 * 1024 * 1024,
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
      input.env,
      { playerReadyTimeoutMs, pageNavigationTimeoutSec },
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
