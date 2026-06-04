import { execFileSync } from "node:child_process";
import {
  mkdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { chromium } from "playwright";

export const MARKETPLACE_HYPERFRAMES_RESULTS_DIR = join(
  process.cwd(),
  "test-results",
  "marketplace-hyperframes"
);

export function ensureResultsDir() {
  mkdirSync(MARKETPLACE_HYPERFRAMES_RESULTS_DIR, { recursive: true });
  return MARKETPLACE_HYPERFRAMES_RESULTS_DIR;
}

export function buildFixtureHtml(input = {}) {
  const title =
    input.title ??
    "ชื่อสินค้าไทยยาวมากพร้อม English mixed และ safe-area caption";
  const frameLabel = input.frameLabel ?? "Storyboard motion preview";
  return `<!doctype html>
<html lang="th">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <style>
      * { box-sizing: border-box; }
      body { margin: 0; width: 720px; height: 1280px; overflow: hidden; font-family: Inter, system-ui, sans-serif; background: #f8fafc; color: #0f172a; }
      [data-composition-id="marketplace_storyboard_motion_9x9_v1"] { position: relative; width: 720px; height: 1280px; padding: 48px; display: grid; grid-template-rows: auto 1fr auto; gap: 28px; background: linear-gradient(160deg, #e0f2fe 0%, #ffffff 48%, #fef3c7 100%); }
      .badge { display: inline-flex; width: max-content; border-radius: 999px; background: #0369a1; color: #fff; padding: 8px 14px; font-size: 24px; font-weight: 700; }
      h1 { margin: 0; font-size: 48px; line-height: 1.12; overflow-wrap: anywhere; }
      .card { display: grid; place-items: center; border: 3px solid #0ea5e9; border-radius: 24px; background: rgba(255,255,255,.78); box-shadow: 0 24px 80px rgba(15,23,42,.16); }
      .product { width: 420px; height: 420px; border-radius: 32px; background: linear-gradient(135deg, #0ea5e9, #f59e0b); display: grid; place-items: center; color: white; font-size: 96px; font-weight: 900; transform: translateY(calc(var(--frame, 0) * -1px)); }
      .caption { border-radius: 18px; background: rgba(15,23,42,.92); color: #fff; padding: 22px 26px; font-size: 30px; line-height: 1.28; overflow-wrap: anywhere; }
    </style>
  </head>
  <body style="--frame:0">
    <main data-composition-id="marketplace_storyboard_motion_9x9_v1">
      <div class="badge">HyperFrames Auto Review</div>
      <section class="card">
        <div class="product">SSP</div>
      </section>
      <section>
        <h1>${escapeHtml(title)}</h1>
        <p class="caption">${escapeHtml(frameLabel)} · CTA และ disclosure อยู่ใน safe area</p>
      </section>
    </main>
    <script>
      window.__renderReady = Promise.resolve(true);
      window.__setFrame = (frame) => {
        document.body.style.setProperty("--frame", String(frame));
        document.querySelector(".caption").textContent = "${escapeJs(frameLabel)} · frame " + frame + " · CTA และ disclosure อยู่ใน safe area";
      };
    </script>
  </body>
</html>`;
}

export async function renderFixtureFrames(options = {}) {
  const outputDir = options.outputDir ?? ensureResultsDir();
  const frameDir = join(outputDir, options.frameDirName ?? "frames");
  rmSync(frameDir, { recursive: true, force: true });
  mkdirSync(frameDir, { recursive: true });
  const html = buildFixtureHtml(options);
  const htmlPath = join(outputDir, options.htmlFileName ?? "fixture.html");
  writeFileSync(htmlPath, html);

  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 720, height: 1280 } });
  await page.setContent(html, { waitUntil: "networkidle" });
  await page.evaluate(() => Promise.resolve(window.__renderReady));
  const frames = options.frames ?? [0, 15, 30, 45, 60];
  const framePaths = [];
  for (const frame of frames) {
    await page.evaluate(value => window.__setFrame?.(value), frame);
    const framePath = join(frameDir, `frame_${String(frame).padStart(5, "0")}.png`);
    await page.screenshot({ path: framePath });
    framePaths.push(framePath);
  }
  await browser.close();
  return { htmlPath, frameDir, framePaths };
}

export function encodeFramesToMp4(input) {
  const outputPath = input.outputPath;
  execFileSync(
    "ffmpeg",
    [
      "-y",
      "-framerate",
      "1",
      "-pattern_type",
      "glob",
      "-i",
      join(input.frameDir, "*.png"),
      "-c:v",
      "libx264",
      "-pix_fmt",
      "yuv420p",
      "-movflags",
      "+faststart",
      outputPath,
    ],
    { stdio: "pipe" }
  );
  return outputPath;
}

export function fileEvidence(path) {
  const stats = statSync(path);
  return {
    path,
    sizeBytes: stats.size,
    ok: stats.size > 1024,
  };
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function escapeJs(value) {
  return String(value).replaceAll("\\", "\\\\").replaceAll('"', '\\"');
}
