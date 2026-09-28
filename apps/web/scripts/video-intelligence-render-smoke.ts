#!/usr/bin/env tsx
/**
 * Feature 133 (Video Intelligence Platform), section-07 §7 — the real-render
 * "it actually renders" harness (Phase 1 gate). NOT a Vitest file — performs
 * real ffmpeg + storage I/O, a real DB read/write, and a real Lane-A
 * `executeRemotionRenderVideoJob` render (real ffmpeg/Chromium via Remotion).
 * Modeled on `scripts/remotion-parity-test.ts` (research B7): synthesizes
 * tiny local fixture clips with `ffmpeg`, uploads them through the app's own
 * `storagePutFromPath()` (`server/storage.ts`) so downstream code only ever
 * sees the app's own storage-proxy URLs — never a throwaway
 * `http://127.0.0.1:<port>` server (rejected by the asset-ref safety policy
 * by design, same precedent as `remotion-parity-test.ts`'s own note).
 *
 * Flow: synthesize fixtures -> upload -> insert one real `mediaAssets` row
 * (narration audio, referenced by numeric id like a real document would) ->
 * build a tiny `VideoProjectDocument` (2 scenes, 1 audio track, ≥1 caption
 * cue) -> `resolveProjectAssets` -> `compileVideoProject` ->
 * `buildAssetManifest` -> assemble a `RemotionRenderVideoWorkerInput` ->
 * drive the Lane-A `executeRemotionRenderVideoJob` path (section-04) with
 * real ffmpeg + storage -> ffprobe assertions on the rendered output ->
 * cleanup (tmp workspace + uploaded fixture assets + inserted DB rows) in a
 * `finally`.
 *
 * Requires: a reachable Postgres with at least one `tenants` row and one
 * `users` row (any dev/staging DB that has been through normal app usage
 * satisfies this — the harness scopes its fixture data under the FIRST
 * tenant/user it finds and cleans up everything it creates). Requires
 * `ffmpeg`/`ffprobe` on PATH and a working Remotion/Chromium render
 * environment (same requirement as `remotion:parity-test`).
 *
 * Run: `pnpm video-intelligence:render-smoke` (NOT part of `pnpm test`).
 */
import "dotenv/config";

import { execFileSync, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { eq } from "drizzle-orm";
import { db } from "../server/db";
import { tenants, users, mediaAssets } from "../drizzle/schema";
import { storagePutFromPath, storageCopyToPath, storageDelete } from "../server/storage";
import { getAppRuntimeConfig } from "../server/services/appRuntimeConfig";
import {
  resolveProjectAssets,
  buildAssetManifest,
  fallbackAssetSourceHash,
} from "../server/services/videoProjectAssetResolver";
import { compileVideoProject, type TemplateBuildContext } from "../server/services/videoProjectCompiler";
import { MOTION_TEMPLATE_REGISTRY } from "../server/remotion/templates";
import { executeRemotionRenderVideoJob } from "../server/workers/hyperframesRenderWorker";
import {
  REMOTION_RENDER_VIDEO_PLATFORM_CONTRACT_VERSION,
  REMOTION_RENDER_VIDEO_RENDERER_POLICY_VERSION,
  remotionRenderVideoWorkerInputSchema,
  type RemotionRenderVideoWorkerInput,
} from "../shared/workerRuntime";
import type { VideoProjectDocument } from "../shared/videoIntelligence/projectSchemas";
import type { MotionTemplateId } from "../shared/videoIntelligence/motionTemplates";

const FIXTURE_WIDTH = 540;
const FIXTURE_HEIGHT = 960;
const FIXTURE_FPS = 15;
const FIXTURE_DURATION_MS = 4_000;

function runFfmpeg(args: string[]): void {
  const result = spawnSync("ffmpeg", ["-y", "-hide_banner", "-loglevel", "error", ...args], {
    encoding: "utf8",
  });
  if (result.status !== 0) {
    throw new Error(`ffmpeg fixture asset generation failed: ${result.stderr || result.stdout || "unknown error"}`);
  }
}

interface FfprobeSummary {
  passed: boolean;
  durationSec: number | null;
  width: number | null;
  height: number | null;
  hasVideo: boolean;
  hasAudio: boolean;
}

function probeOutput(path: string): FfprobeSummary {
  try {
    const raw = execFileSync(
      "ffprobe",
      [
        "-v",
        "error",
        "-show_entries",
        "stream=codec_type,width,height",
        "-show_entries",
        "format=duration",
        "-of",
        "json",
        path,
      ],
      { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] },
    );
    const parsed = JSON.parse(raw) as {
      streams?: Array<{ codec_type?: string; width?: number; height?: number }>;
      format?: { duration?: string };
    };
    const streams = Array.isArray(parsed.streams) ? parsed.streams : [];
    const videoStream = streams.find(s => s.codec_type === "video");
    const durationSec = Number(parsed.format?.duration ?? NaN);
    return {
      passed: Boolean(videoStream) && Number.isFinite(durationSec) && durationSec > 0,
      durationSec: Number.isFinite(durationSec) ? Math.round(durationSec * 1000) / 1000 : null,
      width: videoStream?.width ?? null,
      height: videoStream?.height ?? null,
      hasVideo: Boolean(videoStream),
      hasAudio: streams.some(s => s.codec_type === "audio"),
    };
  } catch (error) {
    console.error("[video-intelligence-render-smoke] ffprobe failed:", error);
    return { passed: false, durationSec: null, width: null, height: null, hasVideo: false, hasAudio: false };
  }
}

async function main(): Promise<void> {
  const workspace = mkdtempSync(join(tmpdir(), "ssp-vi-render-smoke-"));
  const uploadedStorageKeys: string[] = [];
  let insertedMediaAssetId: number | null = null;
  let outputStorageKey: string | null = null;

  try {
    // ── 0. Resolve a real tenant+user to scope this run's data under. ────────
    const [tenantRow] = await db.select({ id: tenants.id }).from(tenants).limit(1);
    if (!tenantRow) {
      throw new Error(
        "No tenant row found — this harness needs at least one seeded tenant to scope its fixture project under.",
      );
    }
    const [userRow] = await db.select({ id: users.id }).from(users).limit(1);
    if (!userRow) {
      throw new Error("No user row found — this harness needs at least one seeded user.");
    }
    const auth = { tenantId: tenantRow.id, userId: userRow.id };
    console.log(`[video-intelligence-render-smoke] Using tenantId=${auth.tenantId} userId=${auth.userId}`);

    // ── 1. Synthesize + upload fixture assets. ────────────────────────────────
    const assetsDir = join(workspace, "media");
    mkdirSync(assetsDir, { recursive: true });
    const videoPath = join(assetsDir, "scene.mp4");
    const audioPath = join(assetsDir, "narration.mp3");

    runFfmpeg([
      "-f",
      "lavfi",
      "-i",
      `testsrc2=size=${FIXTURE_WIDTH}x${FIXTURE_HEIGHT}:rate=${FIXTURE_FPS}:duration=${FIXTURE_DURATION_MS / 1000}`,
      "-c:v",
      "libx264",
      "-pix_fmt",
      "yuv420p",
      videoPath,
    ]);
    runFfmpeg([
      "-f",
      "lavfi",
      "-i",
      `sine=frequency=440:sample_rate=44100:duration=${FIXTURE_DURATION_MS / 1000}`,
      "-c:a",
      "libmp3lame",
      audioPath,
    ]);

    const keyPrefix = `video-intelligence-smoke/${Date.now()}`;
    const uploadedVideo = await storagePutFromPath(`${keyPrefix}/scene.mp4`, videoPath, "video/mp4");
    const uploadedAudio = await storagePutFromPath(`${keyPrefix}/narration.mp3`, audioPath, "audio/mpeg");
    uploadedStorageKeys.push(uploadedVideo.key, uploadedAudio.key);

    // `storagePutFromPath` returns a RELATIVE storage-proxy path
    // (`/api/storage/files/…` or `/uploads/…`) — make it absolute against
    // this server's own base URL (see `videoProjectAssetResolver.ts`'s
    // `toAbsoluteUrl` doc comment for why this is required: the frozen
    // `RemotionLayerSchema.src` is `.url()`-validated, and headless Chromium
    // fetches `layer.src` directly over the wire during render).
    const runtime = await getAppRuntimeConfig();
    const toAbsolute = (relOrAbs: string) =>
      /^https?:\/\//i.test(relOrAbs) ? relOrAbs : `${runtime.internalNodeUrl}${relOrAbs}`;
    const videoSrc = toAbsolute(uploadedVideo.url);

    // ── 2. Register the audio fixture as a real mediaAssets row. ─────────────
    const audioBytes = readFileSync(audioPath);
    const audioChecksum = createHash("sha256").update(audioBytes).digest("hex");
    const [audioAssetRow] = await db
      .insert(mediaAssets)
      .values({
        tenantId: auth.tenantId,
        userId: auth.userId,
        sourceType: "video_intelligence_smoke_harness",
        status: "ready",
        storageKey: uploadedAudio.key,
        originalUrl: uploadedAudio.url,
        mimeType: "audio/mpeg",
        fileSize: audioBytes.byteLength,
        checksumSha256: audioChecksum,
      } as never)
      .returning();
    insertedMediaAssetId = (audioAssetRow as { id: number }).id;
    console.log(`[video-intelligence-render-smoke] Inserted mediaAssets row id=${insertedMediaAssetId}`);

    // ── 3. Build a tiny VideoProjectDocument (2 scenes, 1 audio track, ≥1 caption cue). ──
    const document: VideoProjectDocument = {
      schemaVersion: 1,
      format: { width: FIXTURE_WIDTH, height: FIXTURE_HEIGHT, fps: FIXTURE_FPS, durationMs: FIXTURE_DURATION_MS },
      content: { language: "en", platformPreset: "tiktok_9_16" },
      brandKitId: null,
      scenes: [
        {
          sceneId: "scene-1",
          startMs: 0,
          endMs: FIXTURE_DURATION_MS / 2,
          narration: null,
          narrationAudioAssetId: null,
          visual: { kind: "layers" },
          layers: [
            {
              id: "smoke-video-layer",
              type: "video",
              startFrame: 0,
              durationFrames: Math.round((FIXTURE_DURATION_MS / 2 / 1000) * FIXTURE_FPS),
              x: 0,
              y: 0,
              width: 100,
              height: 100,
              rotationDeg: 0,
              opacity: 1,
              zIndex: 0,
              src: videoSrc,
              trimStartSec: 0,
              volume: 1,
              muted: true,
            },
          ],
          motion: { intensity: "medium", camera: "static" },
          captionCues: [{ startMs: 0, endMs: 1500, text: "Video Intelligence render smoke test" }],
        },
        {
          sceneId: "scene-2",
          startMs: FIXTURE_DURATION_MS / 2,
          endMs: FIXTURE_DURATION_MS,
          narration: null,
          narrationAudioAssetId: null,
          visual: { kind: "layers" },
          layers: [
            {
              id: "smoke-video-layer-2",
              type: "video",
              startFrame: 0,
              durationFrames: Math.round((FIXTURE_DURATION_MS / 2 / 1000) * FIXTURE_FPS),
              x: 0,
              y: 0,
              width: 100,
              height: 100,
              rotationDeg: 0,
              opacity: 1,
              zIndex: 0,
              src: videoSrc,
              trimStartSec: 0,
              volume: 1,
              muted: true,
            },
          ],
          motion: { intensity: "medium", camera: "static" },
          captionCues: [],
        },
      ],
      audioTracks: [{ kind: "narration", assetRefs: [insertedMediaAssetId], gainDb: 0 }],
      captions: { presetId: "classic_box", burnIn: false, language: "en" },
      claims: [],
      qa: { targetScore: 7, maxLoops: 1 },
    };

    // ── 4. resolveProjectAssets -> compileVideoProject -> buildAssetManifest. ─
    const resolver = await resolveProjectAssets(document, auth);
    const buildCtx: TemplateBuildContext = { format: document.format, brandKit: null, assetResolver: resolver };
    const compileResult = compileVideoProject(document, buildCtx, {
      resolveTemplate: (id: string) => MOTION_TEMPLATE_REGISTRY[id as MotionTemplateId],
    });
    if (compileResult.kind !== "single") {
      throw new Error(
        `Smoke fixture unexpectedly compiled to a "${compileResult.kind}" output — the fixture is intentionally tiny (2 scenes) and should always compile to a single config.`,
      );
    }
    console.log(
      `[video-intelligence-render-smoke] Compiled: ${compileResult.config.layers.length} layers, ${compileResult.config.durationInFrames} frames, cost=${JSON.stringify(compileResult.cost)}`,
    );

    const manifest = buildAssetManifest(compileResult.config, resolver);
    const manifestWithHashes = {
      sources: manifest.sources.map(source => ({
        ...source,
        sha256: source.sha256 ?? fallbackAssetSourceHash(source.url),
      })),
    };

    // ── 5. Assemble the worker payload + drive the real Lane-A executor. ─────
    const payload: RemotionRenderVideoWorkerInput = remotionRenderVideoWorkerInputSchema.parse({
      videoProjectId: "video-intelligence-render-smoke",
      projectRevision: 1,
      traceId: `vi-smoke-${Date.now()}`,
      platformContractVersion: REMOTION_RENDER_VIDEO_PLATFORM_CONTRACT_VERSION,
      rendererPolicyVersion: REMOTION_RENDER_VIDEO_RENDERER_POLICY_VERSION,
      renderProfile: {
        profile: "preview",
        width: compileResult.config.width,
        height: compileResult.config.height,
        fps: compileResult.config.fps,
        codec: "h264",
        loudnessNormalize: true,
        burnInAssCaptions: false,
      },
      remotionTemplate: compileResult.config,
      compositionId: "GenericTemplate",
      assetManifest: manifestWithHashes,
      postPasses: ["loudnorm"],
      segmentPlan: null,
      remotionTemplateHash: createHash("sha256").update(JSON.stringify(compileResult.config)).digest("hex"),
      durationInFrames: compileResult.config.durationInFrames,
    });

    const renderJobId = `vi-render-smoke-${Date.now()}`;
    console.log(`[video-intelligence-render-smoke] Running Lane-A executeRemotionRenderVideoJob (renderJobId=${renderJobId})…`);
    const result = (await executeRemotionRenderVideoJob({
      tenantId: auth.tenantId,
      runId: renderJobId,
      renderJobId,
      payload,
    })) as { outputUrl: string; outputArtifactRef: { storageRef: string } };

    outputStorageKey = result.outputArtifactRef.storageRef;
    console.log(`[video-intelligence-render-smoke] Render produced: ${result.outputUrl}`);

    // ── 6. Pull the rendered output back down + ffprobe assertions. ──────────
    const downloadedOutputPath = join(workspace, "rendered-output.mp4");
    await storageCopyToPath(outputStorageKey, downloadedOutputPath);
    const probe = probeOutput(downloadedOutputPath);

    console.log(`[video-intelligence-render-smoke] ffprobe: ${JSON.stringify(probe)}`);

    const failures: string[] = [];
    if (!probe.passed) failures.push("ffprobe did not detect a playable video stream/duration.");
    const expectedDurationSec = FIXTURE_DURATION_MS / 1000;
    if (probe.durationSec === null || Math.abs(probe.durationSec - expectedDurationSec) > 0.5) {
      failures.push(
        `Output duration ${probe.durationSec}s is not within tolerance of expected ${expectedDurationSec}s (document.format.durationMs=${FIXTURE_DURATION_MS}).`,
      );
    }
    if (probe.width !== FIXTURE_WIDTH || probe.height !== FIXTURE_HEIGHT) {
      failures.push(`Output resolution ${probe.width}x${probe.height} does not match expected ${FIXTURE_WIDTH}x${FIXTURE_HEIGHT}.`);
    }
    if (!probe.hasAudio) {
      failures.push("Output has no audio stream — expected ≥1 audio track (narration).");
    }

    if (failures.length > 0) {
      console.error("[video-intelligence-render-smoke] FAILED:");
      for (const failure of failures) console.error(`  - ${failure}`);
      process.exitCode = 1;
      return;
    }

    console.log("[video-intelligence-render-smoke] PASSED — real end-to-end render verified (duration, resolution, audio track).");
  } catch (error) {
    console.error("[video-intelligence-render-smoke] Fatal error:", error);
    process.exitCode = 1;
  } finally {
    // Cleanup: uploaded fixture assets, the inserted mediaAssets row, the
    // rendered output artifact, and the tmp workspace — never leave smoke
    // test debris in real storage/DB.
    for (const key of uploadedStorageKeys) {
      await storageDelete(key).catch(() => {});
    }
    if (outputStorageKey) {
      await storageDelete(outputStorageKey).catch(() => {});
    }
    if (insertedMediaAssetId !== null) {
      await db.delete(mediaAssets).where(eq(mediaAssets.id, insertedMediaAssetId)).catch(() => {});
    }
    rmSync(workspace, { recursive: true, force: true });
  }
}

main().catch(error => {
  console.error("[video-intelligence-render-smoke] Unhandled error:", error);
  process.exitCode = 1;
});
