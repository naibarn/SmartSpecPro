import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import { copyFileSync, existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

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
  return /^(1|true|yes|on)$/i.test(String(value ?? ""));
}

export function getHyperframesRuntimeMode(
  env: HyperframesRuntimeAdapterEnv = process.env
): HyperframesRuntimeMode {
  const mode = String(env.HYPERFRAMES_RUNTIME_MODE ?? "").toLowerCase();
  if (mode === "producer") return "producer";
  if (mode === "cli" || mode === "official_cli") return "cli";
  return "diagnostic";
}

function isNodeVersionAllowedForOfficialRuntime(
  env: HyperframesRuntimeAdapterEnv = process.env
): boolean {
  if (
    process.env.NODE_ENV === "test" &&
    truthy(env.HYPERFRAMES_ALLOW_NODE20_OFFICIAL_RUNTIME)
  ) {
    return true;
  }
  const match = /^v?(\d+)\.(\d+)\.(\d+)/.exec(process.version);
  if (!match) return false;
  const major = Number(match[1]);
  const minor = Number(match[2]);
  return major > 22 || (major === 22 && minor >= 22);
}

function officialRuntimeReady(env: HyperframesRuntimeAdapterEnv = process.env): boolean {
  return truthy(env.HYPERFRAMES_OFFICIAL_RUNTIME_READY) ||
    truthy(env.HYPERFRAMES_PRODUCTION_RUNTIME_READY);
}

export function isHyperframesProducerRuntimeAllowed(
  env: HyperframesRuntimeAdapterEnv = process.env
): boolean {
  return (
    getHyperframesRuntimeMode(env) === "producer" &&
    officialRuntimeReady(env) &&
    isNodeVersionAllowedForOfficialRuntime(env)
  );
}

export function isHyperframesCliRuntimeAllowed(
  env: HyperframesRuntimeAdapterEnv = process.env
): boolean {
  return (
    getHyperframesRuntimeMode(env) === "cli" &&
    officialRuntimeReady(env) &&
    isNodeVersionAllowedForOfficialRuntime(env)
  );
}

export function assertHyperframesProducerRuntimeAllowed(
  env: HyperframesRuntimeAdapterEnv = process.env
): void {
  if (getHyperframesRuntimeMode(env) !== "producer") {
    throw new Error("HyperFrames producer runtime was not requested.");
  }
  if (!officialRuntimeReady(env)) {
    throw new Error(
      "HyperFrames producer runtime is blocked until production rollout gates pass."
    );
  }
  if (!isNodeVersionAllowedForOfficialRuntime(env)) {
    throw new Error("HyperFrames producer runtime requires Node >=22.22 in the worker image.");
  }
}

export function assertHyperframesCliRuntimeAllowed(
  env: HyperframesRuntimeAdapterEnv = process.env
): void {
  if (getHyperframesRuntimeMode(env) !== "cli") {
    throw new Error("HyperFrames CLI runtime was not requested.");
  }
  if (!officialRuntimeReady(env)) {
    throw new Error(
      "HyperFrames CLI runtime is blocked until production rollout gates pass."
    );
  }
  if (!isNodeVersionAllowedForOfficialRuntime(env)) {
    throw new Error("HyperFrames CLI runtime requires Node >=22.22 in the worker image.");
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

function resolveThaiFontPath(env: HyperframesRuntimeAdapterEnv = process.env): string | null {
  const explicit = String(env.HYPERFRAMES_THAI_FONT_PATH ?? "").trim();
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
  env: HyperframesRuntimeAdapterEnv = process.env
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
    return null;
  }
}

export function getHyperframesRuntimeDiagnostics(
  mode: "official_cli_ready" | "official_producer_ready",
  runtimeAssets: { fontAssetStaged?: boolean } = {},
  env: HyperframesRuntimeAdapterEnv = process.env
): HyperframesRuntimeDiagnostics {
  return {
    runtimeMode: mode,
    nodeVersion: process.version,
    hyperframesCliVersion: readPackageVersion("hyperframes"),
    hyperframesProducerVersion: readPackageVersion("@hyperframes/producer"),
    packageNames: ["hyperframes", "@hyperframes/producer"],
    fontAssetStaged: runtimeAssets.fontAssetStaged === true,
    playerReadyTimeoutMs: parsePositiveInt(
      env.HYPERFRAMES_PLAYER_READY_TIMEOUT_MS,
      5000
    ),
  };
}

function resolveHyperframesCliBinary(env: HyperframesRuntimeAdapterEnv = process.env): string {
  const explicit = String(env.HYPERFRAMES_CLI_BINARY ?? "").trim();
  if (explicit) return explicit;
  const localBinary = join(process.cwd(), "node_modules", ".bin", "hyperframes");
  return existsSync(localBinary) ? localBinary : "hyperframes";
}

export async function executeHyperframesCliRender(
  input: HyperframesRuntimeRenderInput
): Promise<HyperframesRuntimeRenderResult> {
  assertHyperframesCliRuntimeAllowed(input.env);
  const htmlPath = join(input.workspace, "index.html");
  writeFileSync(htmlPath, getCompositionHtml(input.payload), "utf8");
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
  const result = await (input.commandRunner
    ? input.commandRunner(command, args, {
        cwd: input.workspace,
        env: process.env,
      })
    : execFileSync(command, args, {
        cwd: input.workspace,
        env: process.env,
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
  writeFileSync(htmlPath, getCompositionHtml(input.payload), "utf8");
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
