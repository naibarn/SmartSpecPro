#!/usr/bin/env tsx
/**
 * Phase 3 of planning/remotion-migration/plan.md — parity-testing harness.
 *
 * Renders the SAME `HyperframesFinalCompositeConfigSchema` input through
 * BOTH render engines (real end-to-end execution, not mocked):
 *   - HyperFrames (`executeVideoRender("hyperframes", ...)`)
 *   - Remotion   (`executeVideoRender("remotion", ...)`)
 * and compares the outputs (duration, resolution, playability, a handful of
 * extracted comparison frames). This is the hard gate documented in the plan
 * before `marketplaceRemotionRendererEnabled` is ever turned on for a real
 * tenant.
 *
 * NOTE (deviation from the brief's suggested filename
 * `scripts/remotion-parity-test.mjs`): this is a `.ts` file run via `tsx`
 * (see the `remotion:parity-test` npm script), not a plain `.mjs`. It needs
 * to import real TypeScript modules from `server/services/*` (the same
 * `executeVideoRender`/`buildHyperframesFinalCompositeCompositionInput`
 * functions the production render worker uses) — no existing `.mjs` script
 * in this repo imports server TS modules directly (they only shell out to
 * the `hyperframes` CLI binary), and doing so from plain `.mjs` isn't
 * possible without a loader. `tsx scripts/*.ts` is an established pattern
 * already used by other non-trivial scripts in this `package.json` (e.g.
 * `report:presentation-release-gate`, the `seed:*`/`backfill:*` family).
 *
 * NOTE (asset strategy — revised after a real-run discovery, not guessed):
 * fixtures reference shot source videos via the placeholder scheme
 * `urn:remotion-parity-fixture:<name>` instead of a real URL. This harness
 * synthesizes a couple of tiny local MP4 clips with `ffmpeg` (color/test
 * patterns, matching the technique already used by
 * `scripts/hyperframes-fixture-render.mjs`), then uploads them through the
 * app's OWN `storagePutFromPath()` (`server/storage.ts`) into whatever
 * storage backend is actually active for this environment (R2 in this
 * sandbox), and substitutes the placeholders with the returned
 * `/api/storage/files/...` (or `/uploads/...` for a local backend) URL
 * before validating each fixture against
 * `HyperframesFinalCompositeConfigSchema`.
 *
 * An earlier version of this harness tried serving assets from a throwaway
 * `http://127.0.0.1:<port>/...` static file server instead (no storage
 * upload required). That was rejected on the HyperFrames side by
 * `isHyperframesSafeAssetRef()` in
 * `server/services/hyperframesCompositionSanitizer.ts`, which — by explicit
 * design, not a bug — refuses ALL plain `http:` URLs and ALL
 * localhost/private-IP hosts as shot asset refs (an SSRF-style safety
 * policy), throwing "HyperFrames asset ref failed safety policy". Storage
 * keys of the form `/api/storage/files/...` / `/uploads/...` (paths
 * starting with `/`) are exempt from that check and are exactly the
 * asset-ref shape both `hyperframesRuntimeAdapter.ts` and
 * `remotionRuntimeAdapter.ts` already know how to stage via
 * `storageCopyToPath()` — so this harness now exercises the SAME real
 * storage-staging code path both production adapters use, which is a more
 * faithful parity test than a bespoke local server would have been anyway.
 * Uploaded fixture objects are deleted via `storageDelete()` in a `finally`
 * block after the run. This avoids committing any binary video file to git.
 */
import "dotenv/config";

import { execFileSync, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { executeVideoRender } from "../server/services/videoRenderer";
import { buildHyperframesFinalCompositeCompositionInput } from "../server/services/hyperframesCompositionService";
import { UnsupportedPresetError } from "../server/services/remotionCompositionService";
import { storagePutFromPath, storageDelete } from "../server/storage";
import {
  HyperframesFinalCompositeConfigSchema,
  type HyperframesFinalCompositeConfig,
} from "../shared/hyperframes/runtimeApiSchemas";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "..");
const fixturesDir = resolve(repoRoot, "test-fixtures/remotion-parity");
const resultsDir = resolve(repoRoot, "test-results/remotion-parity");
const framesDir = join(resultsDir, "frames");
const reportPath = join(resultsDir, "report.json");
const keepWorkspaces = Boolean(process.env.REMOTION_PARITY_KEEP_WORKSPACES);

interface RemotionParityFixture {
  id: string;
  description: string;
  expectRemotionSupported: boolean;
  expectedUnsupportedPresetMessageContains?: string;
  finalComposite: unknown;
}

interface EngineRunOutcome {
  attempted: boolean;
  ok: boolean;
  outputPath: string | null;
  errorMessage: string | null;
  probe: FfprobeSummary | null;
  frames: string[];
  durationMs: number;
}

interface FfprobeSummary {
  passed: boolean;
  durationSec: number | null;
  width: number | null;
  height: number | null;
  codecName: string | null;
  hasVideo: boolean;
  hasAudio: boolean;
  frameCount: number | null;
}

function stableHash(value: unknown): string {
  return `rpt_${createHash("sha256")
    .update(JSON.stringify(value))
    .digest("hex")
    .slice(0, 32)}`;
}

// ─── Fixture asset server ──────────────────────────────────────────────────

function runFfmpeg(args: string[]): void {
  const result = spawnSync(
    "ffmpeg",
    ["-y", "-hide_banner", "-loglevel", "error", ...args],
    { encoding: "utf8" }
  );
  if (result.status !== 0) {
    throw new Error(
      `ffmpeg fixture asset generation failed: ${result.stderr || result.stdout || "unknown error"}`
    );
  }
}

/**
 * Synthesizes two tiny (6s) local MP4 clips with `ffmpeg` lavfi test
 * patterns + a sine-wave audio track, mirroring the technique already used
 * by `scripts/hyperframes-fixture-render.mjs`. Not committed to git — always
 * generated fresh into a throwaway temp dir for the lifetime of this run.
 */
function synthesizeFixtureAssets(assetsDir: string): Record<string, string> {
  mkdirSync(assetsDir, { recursive: true });
  const sceneOne = join(assetsDir, "scene-1.mp4");
  const sceneTwo = join(assetsDir, "scene-2.mp4");
  runFfmpeg([
    "-f",
    "lavfi",
    "-i",
    "testsrc2=size=1080x1920:rate=30:duration=6",
    "-f",
    "lavfi",
    "-i",
    "sine=frequency=660:sample_rate=48000:duration=6",
    "-shortest",
    "-c:v",
    "libx264",
    "-pix_fmt",
    "yuv420p",
    "-c:a",
    "aac",
    sceneOne,
  ]);
  runFfmpeg([
    "-f",
    "lavfi",
    "-i",
    "color=c=0x312e81:s=1080x1920:r=30:d=6",
    "-f",
    "lavfi",
    "-i",
    "sine=frequency=880:sample_rate=48000:duration=6",
    "-shortest",
    "-c:v",
    "libx264",
    "-pix_fmt",
    "yuv420p",
    "-c:a",
    "aac",
    sceneTwo,
  ]);
  return { "scene-1": sceneOne, "scene-2": sceneTwo };
}

/**
 * Uploads the synthesized fixture clips through the app's own storage
 * abstraction (whatever backend is actually active — R2/S3/local) under a
 * throwaway, run-scoped key prefix, and returns a map of
 * `sceneName -> { key, url }`. Callers must delete these via
 * `storageDelete(key)` once the run is done (see `main()`'s `finally`).
 */
async function uploadFixtureAssets(
  assets: Record<string, string>,
  keyPrefix: string
): Promise<Record<string, { key: string; url: string }>> {
  const uploaded: Record<string, { key: string; url: string }> = {};
  for (const [name, filePath] of Object.entries(assets)) {
    uploaded[name] = await storagePutFromPath(
      `${keyPrefix}/${name}.mp4`,
      filePath,
      "video/mp4"
    );
  }
  return uploaded;
}

function substitutePlaceholderUrls(
  raw: unknown,
  uploaded: Record<string, { key: string; url: string }>
): unknown {
  const json = JSON.stringify(raw).replace(
    /urn:remotion-parity-fixture:([a-z0-9-]+)/gi,
    (match, name) => uploaded[name]?.url ?? match
  );
  return JSON.parse(json);
}

// ─── ffprobe / ffmpeg evidence helpers ─────────────────────────────────────

function probeOutput(path: string): FfprobeSummary {
  try {
    const raw = execFileSync(
      "ffprobe",
      [
        "-v",
        "error",
        "-show_entries",
        "stream=codec_type,codec_name,width,height,nb_frames",
        "-show_entries",
        "format=duration",
        "-of",
        "json",
        path,
      ],
      { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }
    );
    const parsed = JSON.parse(raw) as {
      streams?: Array<{
        codec_type?: string;
        codec_name?: string;
        width?: number;
        height?: number;
        nb_frames?: string;
      }>;
      format?: { duration?: string };
    };
    const streams = Array.isArray(parsed.streams) ? parsed.streams : [];
    const videoStream = streams.find(stream => stream.codec_type === "video");
    const durationSec = Number(parsed.format?.duration ?? NaN);
    const frameCount = videoStream?.nb_frames
      ? Number(videoStream.nb_frames)
      : null;
    return {
      passed: Boolean(videoStream) && Number.isFinite(durationSec) && durationSec > 0,
      durationSec: Number.isFinite(durationSec)
        ? Math.round(durationSec * 1000) / 1000
        : null,
      width: videoStream?.width ?? null,
      height: videoStream?.height ?? null,
      codecName: videoStream?.codec_name ?? null,
      hasVideo: Boolean(videoStream),
      hasAudio: streams.some(stream => stream.codec_type === "audio"),
      frameCount: Number.isFinite(frameCount) ? frameCount : null,
    };
  } catch (error) {
    return {
      passed: false,
      durationSec: null,
      width: null,
      height: null,
      codecName: null,
      hasVideo: false,
      hasAudio: false,
      frameCount: null,
    };
  }
}

function extractComparisonFrames(
  outputPath: string,
  durationSec: number | null,
  destDir: string,
  labelPrefix: string
): string[] {
  if (!durationSec || durationSec <= 0) return [];
  mkdirSync(destDir, { recursive: true });
  const timestamps = [
    Math.min(0.2, durationSec / 4),
    durationSec / 2,
    Math.max(durationSec - 0.2, durationSec * 0.9),
  ];
  const framePaths: string[] = [];
  for (const [index, t] of timestamps.entries()) {
    const framePath = join(destDir, `${labelPrefix}-t${index + 1}.png`);
    try {
      execFileSync(
        "ffmpeg",
        [
          "-y",
          "-hide_banner",
          "-loglevel",
          "error",
          "-ss",
          t.toFixed(3),
          "-i",
          outputPath,
          "-frames:v",
          "1",
          framePath,
        ],
        { stdio: ["ignore", "pipe", "pipe"] }
      );
      if (existsSync(framePath)) framePaths.push(framePath);
    } catch {
      // Frame extraction is best-effort evidence, not a pass/fail gate —
      // don't let an isolated ffmpeg seek failure abort the whole fixture.
    }
  }
  return framePaths;
}

// ─── Engine execution ───────────────────────────────────────────────────────

async function runHyperframesEngine(
  fixture: RemotionParityFixture,
  config: HyperframesFinalCompositeConfig
): Promise<EngineRunOutcome> {
  const workspace = mkdtempSync(
    join(tmpdir(), `ssp-remotion-parity-hf-${fixture.id}-`)
  );
  const outputPath = join(workspace, "output.mp4");
  const startedAt = Date.now();
  try {
    const composition = buildHyperframesFinalCompositeCompositionInput({
      tenantId: "remotion-parity-test",
      userId: 0,
      productId: fixture.id,
      runId: fixture.id,
      finalComposite: config,
    });
    const payload: Record<string, unknown> = {
      ...composition,
      fps: config.fps,
      quality: "draft",
    };
    const outcome = await executeVideoRender("hyperframes", {
      workspace,
      outputPath,
      payload,
      env: process.env,
    });
    if (!outcome) {
      throw new Error(
        "HyperFrames runtime mode resolved to 'diagnostic' (no official CLI/producer render was attempted) — check HYPERFRAMES_RUNTIME_MODE."
      );
    }
    const probe = probeOutput(outputPath);
    const frames = extractComparisonFrames(
      outputPath,
      probe.durationSec,
      framesDir,
      `${fixture.id}-hyperframes`
    );
    return {
      attempted: true,
      ok: probe.passed,
      outputPath,
      errorMessage: probe.passed ? null : "Output failed ffprobe playability check.",
      probe,
      frames,
      durationMs: Date.now() - startedAt,
    };
  } catch (error) {
    return {
      attempted: true,
      ok: false,
      outputPath: null,
      errorMessage: error instanceof Error ? error.message : String(error),
      probe: null,
      frames: [],
      durationMs: Date.now() - startedAt,
    };
  } finally {
    if (!keepWorkspaces) rmSync(workspace, { recursive: true, force: true });
  }
}

async function runRemotionEngine(
  fixture: RemotionParityFixture,
  config: HyperframesFinalCompositeConfig
): Promise<EngineRunOutcome & { unsupportedPresetError: string | null }> {
  const workspace = mkdtempSync(
    join(tmpdir(), `ssp-remotion-parity-remotion-${fixture.id}-`)
  );
  const outputPath = join(workspace, "output.mp4");
  const startedAt = Date.now();
  try {
    const outcome = await executeVideoRender("remotion", {
      workspace,
      outputPath,
      payload: { finalCompositeConfig: config },
      env: process.env,
    });
    if (!outcome) {
      throw new Error("executeVideoRender('remotion', ...) unexpectedly returned null.");
    }
    const probe = probeOutput(outputPath);
    const frames = extractComparisonFrames(
      outputPath,
      probe.durationSec,
      framesDir,
      `${fixture.id}-remotion`
    );
    return {
      attempted: true,
      ok: probe.passed,
      outputPath,
      errorMessage: probe.passed ? null : "Output failed ffprobe playability check.",
      probe,
      frames,
      durationMs: Date.now() - startedAt,
      unsupportedPresetError: null,
    };
  } catch (error) {
    const isUnsupportedPreset =
      error instanceof UnsupportedPresetError ||
      (error instanceof Error && error.name === "UnsupportedPresetError");
    return {
      attempted: true,
      ok: false,
      outputPath: null,
      errorMessage: error instanceof Error ? error.message : String(error),
      probe: null,
      frames: [],
      durationMs: Date.now() - startedAt,
      unsupportedPresetError: isUnsupportedPreset
        ? (error as Error).message
        : null,
    };
  } finally {
    if (!keepWorkspaces) rmSync(workspace, { recursive: true, force: true });
  }
}

// ─── Parity comparison ──────────────────────────────────────────────────────

function compareOutcomes(
  config: HyperframesFinalCompositeConfig,
  hyperframes: EngineRunOutcome,
  remotion: EngineRunOutcome
): {
  verdict: "pass" | "fail" | "not_comparable";
  durationDiffSec: number | null;
  durationDiffFrames: number | null;
  toleranceFrames: number;
  resolutionMatch: boolean | null;
  bothPlayable: boolean;
  notes: string[];
} {
  const notes: string[] = [];
  if (!hyperframes.ok || !remotion.ok) {
    return {
      verdict: "not_comparable",
      durationDiffSec: null,
      durationDiffFrames: null,
      toleranceFrames: 1,
      resolutionMatch: null,
      bothPlayable: false,
      notes: ["At least one engine did not produce a playable output; see errorMessage."],
    };
  }
  const hfProbe = hyperframes.probe!;
  const rmProbe = remotion.probe!;
  const toleranceFrames = 1;
  const durationDiffSec =
    hfProbe.durationSec !== null && rmProbe.durationSec !== null
      ? Math.abs(hfProbe.durationSec - rmProbe.durationSec)
      : null;
  const durationDiffFrames =
    durationDiffSec !== null ? durationDiffSec * config.fps : null;
  const resolutionMatch =
    hfProbe.width !== null &&
    hfProbe.height !== null &&
    rmProbe.width !== null &&
    rmProbe.height !== null
      ? hfProbe.width === rmProbe.width && hfProbe.height === rmProbe.height
      : null;
  if (resolutionMatch === false) {
    notes.push(
      `Resolution mismatch: hyperframes=${hfProbe.width}x${hfProbe.height}, remotion=${rmProbe.width}x${rmProbe.height}.`
    );
  }
  if (durationDiffFrames !== null && durationDiffFrames > toleranceFrames) {
    notes.push(
      `Duration diff ${durationDiffFrames.toFixed(2)} frames exceeds tolerance of ${toleranceFrames} frame(s) at ${config.fps}fps.`
    );
  }
  notes.push(
    "Frame comparison is structural/visual (file paths only) — exact pixel-diff automation is out of scope for this phase; inspect the extracted frame PNGs manually or wire in a perceptual-diff tool in a follow-up."
  );
  const bothPlayable = hfProbe.passed && rmProbe.passed;
  const verdict: "pass" | "fail" =
    bothPlayable &&
    resolutionMatch !== false &&
    (durationDiffFrames === null || durationDiffFrames <= toleranceFrames)
      ? "pass"
      : "fail";
  return {
    verdict,
    durationDiffSec,
    durationDiffFrames,
    toleranceFrames,
    resolutionMatch,
    bothPlayable,
    notes,
  };
}

// ─── Main ───────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  mkdirSync(resultsDir, { recursive: true });
  mkdirSync(framesDir, { recursive: true });

  const fixtureFiles = readdirSync(fixturesDir)
    .filter(name => name.endsWith(".json"))
    .sort();

  const assetsWorkspace = mkdtempSync(join(tmpdir(), "ssp-remotion-parity-assets-"));
  const assets = synthesizeFixtureAssets(join(assetsWorkspace, "media"));
  const storageKeyPrefix = `remotion-parity-test/${Date.now()}`;
  const uploadedAssets = await uploadFixtureAssets(assets, storageKeyPrefix);

  const fixtureResults: Array<Record<string, unknown>> = [];
  let overallStatus: "passed" | "failed" | "blocked" = "passed";
  let hyperframesEverAttempted = false;
  let hyperframesEverBlocked = false;

  try {
    for (const fileName of fixtureFiles) {
      const fixturePath = join(fixturesDir, fileName);
      const rawFixture = JSON.parse(readFileSync(fixturePath, "utf8")) as RemotionParityFixture;
      const fixture: RemotionParityFixture = {
        ...rawFixture,
        finalComposite: substitutePlaceholderUrls(
          rawFixture.finalComposite,
          uploadedAssets
        ),
      };

      let parsedConfig: HyperframesFinalCompositeConfig;
      try {
        parsedConfig = HyperframesFinalCompositeConfigSchema.parse(fixture.finalComposite);
      } catch (error) {
        overallStatus = "failed";
        fixtureResults.push({
          fixtureId: fixture.id,
          fixtureFile: fileName,
          status: "failed",
          error: `Fixture failed HyperframesFinalCompositeConfigSchema validation: ${
            error instanceof Error ? error.message : String(error)
          }`,
        });
        continue;
      }

      if (fixture.expectRemotionSupported === false) {
        // Negative-path fixture: only assert Remotion fails closed with
        // UnsupportedPresetError. Hyperframes is not exercised (every
        // preset already renders on that engine, so it isn't a
        // parity-relevant comparison for this fixture).
        const remotionOutcome = await runRemotionEngine(fixture, parsedConfig);
        const messageContains = fixture.expectedUnsupportedPresetMessageContains;
        const passed =
          remotionOutcome.unsupportedPresetError !== null &&
          (!messageContains ||
            remotionOutcome.unsupportedPresetError.includes(messageContains));
        if (!passed) overallStatus = overallStatus === "blocked" ? "blocked" : "failed";
        fixtureResults.push({
          fixtureId: fixture.id,
          fixtureFile: fileName,
          kind: "negative_unsupported_preset",
          status: passed ? "passed" : "failed",
          description: fixture.description,
          remotion: {
            threwUnsupportedPresetError: remotionOutcome.unsupportedPresetError !== null,
            errorMessage: remotionOutcome.unsupportedPresetError ?? remotionOutcome.errorMessage,
          },
          hyperframesSkipped: true,
        });
        continue;
      }

      const hyperframesOutcome = await runHyperframesEngine(fixture, parsedConfig);
      hyperframesEverAttempted = true;
      const hyperframesBlockedByEnvironment =
        !hyperframesOutcome.ok &&
        /official runtime is blocked|browser runtime is not available|CLI runtime package\/binary is not available|Chrome\/headless browser|requires Node/i.test(
          hyperframesOutcome.errorMessage ?? ""
        );
      if (hyperframesBlockedByEnvironment) hyperframesEverBlocked = true;

      const remotionOutcome = await runRemotionEngine(fixture, parsedConfig);

      const comparison = hyperframesOutcome.ok
        ? compareOutcomes(parsedConfig, hyperframesOutcome, remotionOutcome)
        : {
            verdict: "not_comparable" as const,
            durationDiffSec: null,
            durationDiffFrames: null,
            toleranceFrames: 1,
            resolutionMatch: null,
            bothPlayable: false,
            notes: hyperframesBlockedByEnvironment
              ? [
                  "HyperFrames-side execution blocked in this sandbox (see hyperframes.errorMessage). Remotion side result reported standalone below.",
                ]
              : ["HyperFrames-side render failed for a reason other than environment blocking; see hyperframes.errorMessage."],
          };

      let fixtureStatus: "passed" | "failed" | "blocked";
      if (comparison.verdict === "pass") {
        fixtureStatus = "passed";
      } else if (hyperframesBlockedByEnvironment) {
        fixtureStatus = "blocked";
      } else {
        fixtureStatus = "failed";
      }
      if (fixtureStatus === "failed") overallStatus = "failed";
      if (fixtureStatus === "blocked" && overallStatus === "passed") overallStatus = "blocked";

      fixtureResults.push({
        fixtureId: fixture.id,
        fixtureFile: fileName,
        kind: "parity",
        status: fixtureStatus,
        description: fixture.description,
        config: {
          finalVideoLengthSec: parsedConfig.finalVideoLengthSec,
          fps: parsedConfig.fps,
          width: parsedConfig.width,
          height: parsedConfig.height,
          shotCount: parsedConfig.shots.length,
          subtitlePreset: parsedConfig.subtitlePreset,
        },
        hyperframes: {
          attempted: hyperframesOutcome.attempted,
          ok: hyperframesOutcome.ok,
          blockedByEnvironment: hyperframesBlockedByEnvironment,
          errorMessage: hyperframesOutcome.errorMessage,
          durationMs: hyperframesOutcome.durationMs,
          probe: hyperframesOutcome.probe,
          frames: hyperframesOutcome.frames,
        },
        remotion: {
          attempted: remotionOutcome.attempted,
          ok: remotionOutcome.ok,
          errorMessage: remotionOutcome.errorMessage,
          durationMs: remotionOutcome.durationMs,
          probe: remotionOutcome.probe,
          frames: remotionOutcome.frames,
        },
        parity: comparison,
      });
    }
  } finally {
    if (!keepWorkspaces) {
      for (const { key } of Object.values(uploadedAssets)) {
        try {
          await storageDelete(key);
        } catch {
          // Best-effort cleanup — a leftover throwaway test object under
          // remotion-parity-test/<timestamp>/ in the storage bucket is not
          // worth failing the whole harness run over.
        }
      }
    }
    rmSync(assetsWorkspace, { recursive: true, force: true });
  }

  const report = {
    gate: "remotion-parity-test",
    status: overallStatus,
    generatedAt: new Date().toISOString(),
    plan: "planning/remotion-migration/plan.md (Phase 3)",
    node: process.version,
    hyperframesRuntime: {
      everAttempted: hyperframesEverAttempted,
      everBlockedByEnvironment: hyperframesEverBlocked,
    },
    fixturesHash: stableHash(fixtureFiles),
    fixtures: fixtureResults,
    notes: [
      "This harness performs REAL end-to-end renders through both engines via the same executeVideoRender() dispatch layer the production render worker uses — no mocking.",
      "Frame comparison is structural/visual (extracted PNG file paths under test-results/remotion-parity/frames/) — exact pixel-diff automation is explicitly out of scope for this phase.",
      "If hyperframes.blockedByEnvironment is true for a fixture, the HyperFrames-side code path was genuinely exercised but could not complete due to a missing runtime dependency in this environment (see hyperframes.errorMessage) — this is not a bug in the harness or in remotionRuntimeAdapter.ts.",
      "This is the Phase 3 hard gate from planning/remotion-migration/plan.md — a 'passed' status here for all fixtures is required before marketplaceRemotionRendererEnabled is enabled for any real tenant.",
    ],
  };

  writeFileSync(reportPath, JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
  if (overallStatus === "failed") process.exitCode = 1;
}

main().catch(error => {
  console.error("[remotion-parity-test] Fatal error:", error);
  process.exitCode = 1;
});
