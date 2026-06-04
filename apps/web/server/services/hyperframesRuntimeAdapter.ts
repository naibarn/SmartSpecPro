import { existsSync, writeFileSync } from "node:fs";
import { join } from "node:path";

type HyperframesProducerModule = {
  createRenderJob?: (config: Record<string, unknown>) => unknown;
  executeRenderJob?: (job: unknown) => Promise<unknown>;
};

export type HyperframesRuntimeMode = "smoke" | "producer";

export interface HyperframesRuntimeAdapterEnv {
  [key: string]: string | undefined;
  HYPERFRAMES_RUNTIME_MODE?: string;
  HYPERFRAMES_PRODUCTION_RUNTIME_READY?: string;
}

export interface HyperframesRuntimeRenderInput {
  workspace: string;
  outputPath: string;
  payload: Record<string, unknown>;
  env?: HyperframesRuntimeAdapterEnv;
  importer?: (specifier: string) => Promise<unknown>;
}

export interface HyperframesRuntimeRenderResult {
  renderer: "hyperframes_producer";
  inputPath: string;
  outputPath: string;
  result: unknown;
  noRawHtmlExposed: true;
}

function truthy(value: unknown): boolean {
  return /^(1|true|yes|on)$/i.test(String(value ?? ""));
}

export function getHyperframesRuntimeMode(
  env: HyperframesRuntimeAdapterEnv = process.env
): HyperframesRuntimeMode {
  return String(env.HYPERFRAMES_RUNTIME_MODE ?? "").toLowerCase() === "producer"
    ? "producer"
    : "smoke";
}

export function isHyperframesProducerRuntimeAllowed(
  env: HyperframesRuntimeAdapterEnv = process.env
): boolean {
  return (
    getHyperframesRuntimeMode(env) === "producer" &&
    truthy(env.HYPERFRAMES_PRODUCTION_RUNTIME_READY)
  );
}

export function assertHyperframesProducerRuntimeAllowed(
  env: HyperframesRuntimeAdapterEnv = process.env
): void {
  if (getHyperframesRuntimeMode(env) !== "producer") {
    throw new Error("HyperFrames producer runtime was not requested.");
  }
  if (!truthy(env.HYPERFRAMES_PRODUCTION_RUNTIME_READY)) {
    throw new Error(
      "HyperFrames producer runtime is blocked until production rollout gates pass."
    );
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
      html, body { margin: 0; width: 100%; height: 100%; }
      body { font-family: Inter, system-ui, sans-serif; }
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
      data-start="0" data-width="720" data-height="1280">
      <section class="clip" data-start="0" data-duration="1" data-track-index="0">
        <div>
          <h1>${title}</h1>
          <p>${templateId} / ${platform}</p>
        </div>
      </section>
    </div>
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
  </body>
</html>`;
}

function getCompositionHtml(payload: Record<string, unknown>): string {
  return typeof payload.compositionHtml === "string" && payload.compositionHtml.trim()
    ? payload.compositionHtml
    : buildHyperframesProducerFallbackHtml(payload);
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

export async function executeHyperframesProducerRender(
  input: HyperframesRuntimeRenderInput
): Promise<HyperframesRuntimeRenderResult> {
  assertHyperframesProducerRuntimeAllowed(input.env);
  const htmlPath = join(input.workspace, "index.html");
  writeFileSync(htmlPath, getCompositionHtml(input.payload), "utf8");
  const producer = await importHyperframesProducer(input.importer);
  const job = producer.createRenderJob!({
    input: htmlPath,
    output: input.outputPath,
    fps: Number(input.payload.fps) || 30,
    quality: typeof input.payload.quality === "string" ? input.payload.quality : "standard",
    format: "mp4",
    workers: 1,
    debug: false,
  });
  const result = await producer.executeRenderJob!(job);
  if (!existsSync(input.outputPath)) {
    throw new Error("HyperFrames producer completed without creating output.mp4.");
  }
  return {
    renderer: "hyperframes_producer",
    inputPath: htmlPath,
    outputPath: input.outputPath,
    result,
    noRawHtmlExposed: true,
  };
}
