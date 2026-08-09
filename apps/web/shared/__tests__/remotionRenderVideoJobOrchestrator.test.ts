/**
 * Direct unit tests for `@smartspec/remotion-render/render-video-job`'s
 * `executeRemotionRenderVideoJob` orchestrator (worker-app-remotion-render-video
 * P1) — imports the package's `render-video-job` subpath directly (NOT
 * `apps/web/server/workers/hyperframesRenderWorker.ts`'s wrapper), so this
 * suite exercises the shared implementation itself, with every
 * side-effecting collaborator injected (never a real render/ffmpeg process).
 *
 * `hyperframesRenderWorker.ts`'s own `server/workers/__tests__/
 * remotionRenderVideoDispatch.test.ts` exercises the SAME orchestrator
 * through apps/web's wrapper (with apps/web's real deps as defaults) — that
 * suite currently can't run in this sandbox because merely importing
 * `hyperframesRenderWorker.ts` eagerly loads `remotionRuntimeAdapter.ts` ->
 * `@remotion/bundler`, which needs a working `react/jsx-runtime` resolution
 * this Vitest environment's `apps/web/node_modules` doesn't have — a
 * PRE-EXISTING environment gap (confirmed unrelated to this change: the same
 * failure exists at the pre-extraction baseline commit). This suite has no
 * such dependency since `render-video-job` never imports `Root.tsx`/any
 * React composition module.
 */
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  REMOTION_RENDER_VIDEO_FAILURE_CODES,
  REMOTION_RENDER_VIDEO_PLATFORM_CONTRACT_VERSION,
  REMOTION_RENDER_VIDEO_PROGRESS_STAGES,
  REMOTION_RENDER_VIDEO_RENDERER_POLICY_VERSION,
  executeRemotionRenderVideoJob,
  type RemotionRenderVideoWorkerInput,
} from "@smartspec/remotion-render/render-video-job";

let fixtureCounter = 0;

function buildPayload(
  overrides: Partial<RemotionRenderVideoWorkerInput> = {},
): RemotionRenderVideoWorkerInput {
  fixtureCounter += 1;
  const n = fixtureCounter;
  return {
    kind: "remotion_render_video",
    schemaVersion: 1,
    platformContractVersion: REMOTION_RENDER_VIDEO_PLATFORM_CONTRACT_VERSION,
    rendererPolicyVersion: REMOTION_RENDER_VIDEO_RENDERER_POLICY_VERSION,
    videoProjectId: `vproj_${n}`,
    projectRevision: 1,
    traceId: `trace_${n}`,
    renderProfile: {
      profile: "final",
      width: 1080,
      height: 1920,
      fps: 30,
      codec: "h264",
      loudnessNormalize: true,
      burnInAssCaptions: false,
    },
    remotionTemplate: {
      id: "tpl_1",
      name: "Template",
      width: 1080,
      height: 1920,
      fps: 30,
      durationInFrames: 900,
      layers: [],
    },
    compositionId: "GenericTemplate",
    assetManifest: { sources: [] },
    postPasses: [],
    segmentPlan: null,
    remotionTemplateHash: `hash_${String(n).padStart(8, "0")}`,
    durationInFrames: 900,
    ...overrides,
  } as RemotionRenderVideoWorkerInput;
}

/** Writes a minimal but "plausible MP4" fixture file: >10KB with an `ftyp` box signature. */
function writeFakeMp4(path: string): void {
  const header = Buffer.from("....ftyp....", "utf-8");
  const padding = Buffer.alloc(10_100, 0);
  writeFileSync(path, Buffer.concat([header, padding]));
}

describe("@smartspec/remotion-render/render-video-job — executeRemotionRenderVideoJob", () => {
  let workDir: string;

  beforeEach(() => {
    workDir = mkdtempSync(join(tmpdir(), "remotion-render-video-job-test-"));
  });

  afterEach(() => {
    rmSync(workDir, { recursive: true, force: true });
  });

  function makeRenderStub() {
    return vi.fn(async (renderInput: { outputPath: string }) => {
      writeFakeMp4(renderInput.outputPath);
      return {
        outputPath: renderInput.outputPath,
        result: { compositionId: "GenericTemplate" },
      };
    });
  }

  it("emits all 10 progress stages in canonical order on the happy path", async () => {
    const emitEvent = vi.fn();
    const storagePut = vi.fn(async (key: string) => ({ key, url: `/uploads/${key}` }));
    const render = makeRenderStub();

    const result = await executeRemotionRenderVideoJob(
      { tenantId: "tenant-1", runId: "run-1", renderJobId: "job-1", payload: buildPayload() },
      { render, emitEvent, storagePut },
    );

    expect(result.outputArtifactRef).toBeTruthy();
    const emittedStages = emitEvent.mock.calls.map(call => call[0].stage);
    const canonicalIndex = new Map(REMOTION_RENDER_VIDEO_PROGRESS_STAGES.map((s, i) => [s, i]));
    let lastIndex = -1;
    for (const stage of emittedStages) {
      expect(canonicalIndex.has(stage)).toBe(true);
      const idx = canonicalIndex.get(stage)!;
      expect(idx).toBeGreaterThanOrEqual(lastIndex);
      lastIndex = idx;
    }
    for (const stage of REMOTION_RENDER_VIDEO_PROGRESS_STAGES) {
      expect(emittedStages).toContain(stage);
    }
  });

  it("fails with contract_version_unsupported on an unknown platformContractVersion", async () => {
    const render = makeRenderStub();
    await expect(
      executeRemotionRenderVideoJob(
        {
          tenantId: "tenant-1",
          runId: "run-1",
          renderJobId: "job-2",
          payload: buildPayload({ platformContractVersion: "1999-01-01" }),
        },
        { render, storagePut: vi.fn() },
      ),
    ).rejects.toMatchObject({ code: "contract_version_unsupported" });
    expect(render).not.toHaveBeenCalled();
  });

  it("fails with asset_stage_failed when stageAssets throws (checksum mismatch)", async () => {
    const render = makeRenderStub();
    const stageAssets = vi.fn(async () => {
      throw new Error("Asset checksum mismatch for video source: https://example.com/a.mp4");
    });
    await expect(
      executeRemotionRenderVideoJob(
        { tenantId: "tenant-1", runId: "run-1", renderJobId: "job-3", payload: buildPayload() },
        { render, storagePut: vi.fn(), stageAssets },
      ),
    ).rejects.toMatchObject({ code: "asset_stage_failed" });
  });

  it("maps a chromium launch error to chromium_launch_failed, never a blanket render_failed", async () => {
    const render = vi.fn(async () => {
      throw new Error("Failed to launch the browser process! chromium executable not found");
    });
    let caught: unknown;
    try {
      await executeRemotionRenderVideoJob(
        { tenantId: "tenant-1", runId: "run-1", renderJobId: "job-4", payload: buildPayload() },
        { render, storagePut: vi.fn() },
      );
    } catch (error) {
      caught = error;
    }
    expect(caught).toMatchObject({ code: "chromium_launch_failed" });
    expect((caught as { code: string }).code).not.toBe("render_failed");
    expect(REMOTION_RENDER_VIDEO_FAILURE_CODES).toContain((caught as { code: string }).code);
  });

  it("maps a generic render error to render_failed", async () => {
    const render = vi.fn(async () => {
      throw new Error("renderMedia timed out waiting for frame 42");
    });
    await expect(
      executeRemotionRenderVideoJob(
        { tenantId: "tenant-1", runId: "run-1", renderJobId: "job-5", payload: buildPayload() },
        { render, storagePut: vi.fn() },
      ),
    ).rejects.toMatchObject({ code: "render_failed" });
  });

  it("runs declared postPasses (loudnorm + ass_burn) in order via the injected ffmpeg runner and default planner/ASS builder", async () => {
    const storagePut = vi.fn(async (key: string) => ({ key, url: `/uploads/${key}` }));
    const render = makeRenderStub();
    const ffmpegCalls: string[][] = [];
    const ffmpeg = vi.fn(async (argv: string[]) => {
      ffmpegCalls.push(argv);
      const outputPath = argv[argv.length - 1]!;
      writeFakeMp4(outputPath);
      return { code: 0, stderr: "" };
    });

    const result = await executeRemotionRenderVideoJob(
      {
        tenantId: "tenant-1",
        runId: "run-1",
        renderJobId: "job-6",
        payload: buildPayload({
          postPasses: ["loudnorm", "ass_burn"],
          captionLines: [{ startSec: 0, endSec: 2, text: "hello" }],
        }),
      },
      { render, storagePut, ffmpeg },
    );

    expect(ffmpeg).toHaveBeenCalledTimes(2);
    expect(ffmpegCalls[0]).toContain("loudnorm=I=-16:TP=-1.5:LRA=11");
    expect(ffmpegCalls[1]!.some(arg => arg.startsWith("subtitles=filename="))).toBe(true);
    expect(result.outputArtifactRef).toBeTruthy();
  });

  it("renders every segment and concatenates before global audio post-processing", async () => {
    const storagePut = vi.fn(async (key: string) => ({ key, url: `/uploads/${key}` }));
    const render = makeRenderStub();
    const ffmpegCalls: string[][] = [];
    const concatLists: string[] = [];
    const ffmpeg = vi.fn(async (argv: string[]) => {
      ffmpegCalls.push(argv);
      const inputIndex = argv.indexOf("-i");
      if (argv.includes("concat")) {
        concatLists.push(readFileSync(argv[inputIndex + 1]!, "utf8"));
      }
      writeFakeMp4(argv[argv.length - 1]!);
      return { code: 0, stderr: "" };
    });
    const segmentA = { ...buildPayload().remotionTemplate, id: "segment-a", durationInFrames: 150 };
    const segmentB = { ...segmentA, id: "segment-b" };

    const result = await executeRemotionRenderVideoJob(
      {
        tenantId: "tenant-1",
        runId: "run-1",
        renderJobId: "job-segmented",
        payload: buildPayload({
          remotionTemplate: segmentA,
          segmentTemplates: [segmentA, segmentB],
          segmentPlan: {
            parts: [
              { index: 0, durationInFrames: 150 },
              { index: 1, durationInFrames: 150 },
            ],
          },
          durationInFrames: 300,
          postPasses: ["segment_concat", "loudnorm"],
        }),
      },
      { render, storagePut, ffmpeg },
    );

    expect(render).toHaveBeenCalledTimes(2);
    expect(ffmpeg).toHaveBeenCalledTimes(2);
    expect(ffmpegCalls[0]).toContain("concat");
    expect(ffmpegCalls[1]).toContain("loudnorm=I=-16:TP=-1.5:LRA=11");
    expect(concatLists[0]).toContain("segment-0.mp4");
    expect(concatLists[0]).toContain("segment-1.mp4");
    expect(result.outputArtifactRef).toBeTruthy();
  });

  it("fails with post_pass_failed when the injected ffmpeg runner exits non-zero", async () => {
    const storagePut = vi.fn();
    const render = makeRenderStub();
    const ffmpeg = vi.fn(async () => ({ code: 1, stderr: "boom" }));
    await expect(
      executeRemotionRenderVideoJob(
        {
          tenantId: "tenant-1",
          runId: "run-1",
          renderJobId: "job-7",
          payload: buildPayload({ postPasses: ["loudnorm"] }),
        },
        { render, storagePut, ffmpeg },
      ),
    ).rejects.toMatchObject({ code: "post_pass_failed" });
  });

  it("fails with artifact_upload_failed when storagePut throws", async () => {
    const render = makeRenderStub();
    const storagePut = vi.fn(async () => {
      throw new Error("S3 unreachable");
    });
    await expect(
      executeRemotionRenderVideoJob(
        { tenantId: "tenant-1", runId: "run-1", renderJobId: "job-8", payload: buildPayload() },
        { render, storagePut },
      ),
    ).rejects.toMatchObject({ code: "artifact_upload_failed" });
  });

  it("forwards emitAudit events with started/completed lifecycle", async () => {
    const emitAudit = vi.fn();
    const render = makeRenderStub();
    const storagePut = vi.fn(async (key: string) => ({ key, url: `/uploads/${key}` }));

    await executeRemotionRenderVideoJob(
      { tenantId: "tenant-1", runId: "run-1", renderJobId: "job-9", payload: buildPayload() },
      { render, storagePut, emitAudit },
    );

    const eventTypes = emitAudit.mock.calls.map(call => call[0]);
    expect(eventTypes).toContain("started");
    expect(eventTypes).toContain("completed");
  });
});
