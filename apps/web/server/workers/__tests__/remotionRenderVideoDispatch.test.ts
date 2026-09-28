/**
 * Feature 133 (Video Intelligence Platform) — section-04 —
 * `executeRemotionRenderVideoJob` (Lane A `remotion_render_video` dispatch)
 * tests. Every side-effecting collaborator (`render`, `ffmpeg`,
 * `storagePut`, `emitEvent`) is injected — never a real render/ffmpeg
 * process in Vitest.
 */
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createHash } from "node:crypto";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// implementation-progress.md gap #3 closure: `buildAssBurnSubtitleFileContent`
// is spied-through (real implementation still runs) so tests can assert the
// dispatch branch forwards `payload.captionLines` into the `.ass` content
// builder instead of the old hardcoded `[]` — without depending on the
// (separate, out-of-scope) `no_subtitle_style` preset's own zero-Dialogue-
// event behavior, which is pure-unit-tested directly in
// `remotionPostPassArgs.test.ts`/`verticalDramaFinalRenderGraph.test.ts`.
vi.mock("../../services/remotionPostPassArgs", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../services/remotionPostPassArgs")>();
  return {
    ...actual,
    buildAssBurnSubtitleFileContent: vi.fn(actual.buildAssBurnSubtitleFileContent),
  };
});

import { executeRemotionRenderVideoJob } from "../hyperframesRenderWorker";
import { buildAssBurnSubtitleFileContent } from "../../services/remotionPostPassArgs";
import {
  REMOTION_RENDER_VIDEO_FAILURE_CODES,
  REMOTION_RENDER_VIDEO_PLATFORM_CONTRACT_VERSION,
  REMOTION_RENDER_VIDEO_PROGRESS_STAGES,
  REMOTION_RENDER_VIDEO_RENDERER_POLICY_VERSION,
  type RemotionRenderVideoWorkerInput,
} from "../../../shared/workerRuntime";
import type { VideoRenderResult } from "../../services/videoRenderer";

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
  };
}

/** Writes a minimal but "plausible MP4" fixture file: >10KB with an `ftyp` box signature, matching `verifyRemotionRenderMp4Sanity`'s sanity check. */
function writeFakeMp4(path: string): void {
  const header = Buffer.from("....ftyp....", "utf-8");
  const padding = Buffer.alloc(10_100, 0);
  writeFileSync(path, Buffer.concat([header, padding]));
}

describe("executeRemotionRenderVideoJob (remotion_render_video Lane A dispatch)", () => {
  let workDir: string;

  beforeEach(() => {
    workDir = mkdtempSync(join(tmpdir(), "remotion-dispatch-test-"));
    vi.mocked(buildAssBurnSubtitleFileContent).mockClear();
  });

  afterEach(() => {
    rmSync(workDir, { recursive: true, force: true });
  });

  function makeRenderStub() {
    return vi.fn(async (renderInput: { outputPath: string }): Promise<VideoRenderResult> => {
      writeFakeMp4(renderInput.outputPath);
      return {
        engine: "remotion",
        outputPath: renderInput.outputPath,
        inputPath: "file:///bundle",
        result: { compositionId: "GenericTemplate", width: 1080, height: 1920, fps: 30, durationInFrames: 900, layerCount: 0 },
      };
    });
  }

  it("emits progress events in REMOTION_RENDER_VIDEO_PROGRESS_STAGES order", async () => {
    const emitEvent = vi.fn();
    const storagePut = vi.fn(async (key: string) => ({ key, url: `/uploads/${key}` }));
    const render = makeRenderStub();

    const result = await executeRemotionRenderVideoJob(
      {
        tenantId: "tenant-1",
        runId: "run-1",
        renderJobId: "job-1",
        payload: buildPayload(),
      },
      { render, emitEvent, storagePut },
    );

    expect(result.outputArtifactRef).toBeTruthy();
    const emittedStages = emitEvent.mock.calls.map(call => call[0].stage);
    // Every emitted stage must be a real stage name, in non-decreasing
    // canonical order (a prefix-ordered subset of REMOTION_RENDER_VIDEO_PROGRESS_STAGES).
    const canonicalIndex = new Map(REMOTION_RENDER_VIDEO_PROGRESS_STAGES.map((s, i) => [s, i]));
    let lastIndex = -1;
    for (const stage of emittedStages) {
      expect(canonicalIndex.has(stage)).toBe(true);
      const idx = canonicalIndex.get(stage)!;
      expect(idx).toBeGreaterThanOrEqual(lastIndex);
      lastIndex = idx;
    }
    // All 10 canonical stages were emitted at least once on the happy path.
    for (const stage of REMOTION_RENDER_VIDEO_PROGRESS_STAGES) {
      expect(emittedStages).toContain(stage);
    }
  });

  it("fails with contract_version_unsupported on an unknown platformContractVersion", async () => {
    const emitEvent = vi.fn();
    const render = makeRenderStub();
    const storagePut = vi.fn();

    await expect(
      executeRemotionRenderVideoJob(
        {
          tenantId: "tenant-1",
          runId: "run-1",
          renderJobId: "job-2",
          payload: buildPayload({ platformContractVersion: "1999-01-01" }),
        },
        { render, emitEvent, storagePut },
      ),
    ).rejects.toMatchObject({ code: "contract_version_unsupported" });

    expect(render).not.toHaveBeenCalled();
  });

  it("fails with a specific failure code (never blanket render_failed) on a chromium launch error", async () => {
    const emitEvent = vi.fn();
    const storagePut = vi.fn();
    const render = vi.fn(async () => {
      throw new Error("Failed to launch the browser process! chromium executable not found");
    });

    let caught: unknown;
    try {
      await executeRemotionRenderVideoJob(
        {
          tenantId: "tenant-1",
          runId: "run-1",
          renderJobId: "job-3",
          payload: buildPayload(),
        },
        { render, emitEvent, storagePut },
      );
    } catch (error) {
      caught = error;
    }
    expect(caught).toMatchObject({ code: "chromium_launch_failed" });
    expect((caught as { code: string }).code).not.toBe("render_failed");
    expect(REMOTION_RENDER_VIDEO_FAILURE_CODES).toContain((caught as { code: string }).code);
  });

  it("fails with a specific failure code on a generic render error (render_failed, not a blanket default elsewhere)", async () => {
    const emitEvent = vi.fn();
    const storagePut = vi.fn();
    const render = vi.fn(async () => {
      throw new Error("renderMedia timed out waiting for frame 42");
    });

    await expect(
      executeRemotionRenderVideoJob(
        {
          tenantId: "tenant-1",
          runId: "run-1",
          renderJobId: "job-4",
          payload: buildPayload(),
        },
        { render, emitEvent, storagePut },
      ),
    ).rejects.toMatchObject({ code: "render_failed" });
  });

  it("runs declared postPasses in order via the injected runner", async () => {
    const emitEvent = vi.fn();
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
        renderJobId: "job-5",
        payload: buildPayload({ postPasses: ["loudnorm", "ass_burn"] }),
      },
      { render, emitEvent, storagePut, ffmpeg },
    );

    expect(ffmpeg).toHaveBeenCalledTimes(2);
    expect(ffmpegCalls[0]).toContain("loudnorm=I=-16:TP=-1.5:LRA=11");
    expect(ffmpegCalls[1]!.some(arg => arg.startsWith("subtitles=filename="))).toBe(true);
    expect(result.outputArtifactRef).toBeTruthy();
  });

  it("threads real payload.captionLines into buildAssBurnSubtitleFileContent (implementation-progress.md gap #3)", async () => {
    const emitEvent = vi.fn();
    const storagePut = vi.fn(async (key: string) => ({ key, url: `/uploads/${key}` }));
    const render = makeRenderStub();
    const ffmpeg = vi.fn(async (argv: string[]) => {
      const outputPath = argv[argv.length - 1]!;
      writeFakeMp4(outputPath);
      return { code: 0, stderr: "" };
    });
    const captionLines = [
      { startSec: 0, endSec: 2, text: "Real caption line one" },
      { startSec: 2, endSec: 4, text: "Real caption line two" },
    ];

    const result = await executeRemotionRenderVideoJob(
      {
        tenantId: "tenant-1",
        runId: "run-1",
        renderJobId: "job-caption-1",
        payload: buildPayload({ postPasses: ["ass_burn"], captionLines }),
      },
      { render, emitEvent, storagePut, ffmpeg },
    );

    // implementation-progress.md gap #3 follow-up: the 2nd argument is no
    // longer hardcoded to the "off" sentinel `"no_subtitle_style"` — when
    // `payload.captionPresetId` is omitted, the dispatch branch falls back
    // to a REAL rendering preset (`"classic_box"`) so burn-in still produces
    // visible captions.
    expect(buildAssBurnSubtitleFileContent).toHaveBeenCalledWith(
      captionLines,
      "classic_box",
      expect.objectContaining({ playResX: 1080, playResY: 1920 }),
    );
    expect(result.outputArtifactRef).toBeTruthy();
  });

  it("threads real payload.captionPresetId into buildAssBurnSubtitleFileContent instead of the hardcoded no_subtitle_style sentinel (implementation-progress.md gap #3 follow-up)", async () => {
    const emitEvent = vi.fn();
    const storagePut = vi.fn(async (key: string) => ({ key, url: `/uploads/${key}` }));
    const render = makeRenderStub();
    const ffmpeg = vi.fn(async (argv: string[]) => {
      const outputPath = argv[argv.length - 1]!;
      writeFakeMp4(outputPath);
      return { code: 0, stderr: "" };
    });
    const captionLines = [{ startSec: 0, endSec: 2, text: "Real caption line" }];

    await executeRemotionRenderVideoJob(
      {
        tenantId: "tenant-1",
        runId: "run-1",
        renderJobId: "job-caption-preset-1",
        payload: buildPayload({
          postPasses: ["ass_burn"],
          captionLines,
          captionPresetId: "minimal_shadow",
        }),
      },
      { render, emitEvent, storagePut, ffmpeg },
    );

    expect(buildAssBurnSubtitleFileContent).toHaveBeenCalledWith(
      captionLines,
      "minimal_shadow",
      expect.objectContaining({ playResX: 1080, playResY: 1920 }),
    );
  });

  it("falls back to an empty (but structurally valid) caption-lines array, and a REAL rendering preset (not no_subtitle_style), when payload.captionLines/captionPresetId are omitted (documented fallback, not a bug)", async () => {
    const emitEvent = vi.fn();
    const storagePut = vi.fn(async (key: string) => ({ key, url: `/uploads/${key}` }));
    const render = makeRenderStub();
    const ffmpeg = vi.fn(async (argv: string[]) => {
      const outputPath = argv[argv.length - 1]!;
      writeFakeMp4(outputPath);
      return { code: 0, stderr: "" };
    });

    await executeRemotionRenderVideoJob(
      {
        tenantId: "tenant-1",
        runId: "run-1",
        renderJobId: "job-caption-2",
        payload: buildPayload({ postPasses: ["ass_burn"] }),
      },
      { render, emitEvent, storagePut, ffmpeg },
    );

    const [, presetArg] = vi.mocked(buildAssBurnSubtitleFileContent).mock.calls[0]!;
    expect(presetArg).not.toBe("no_subtitle_style");
    expect(buildAssBurnSubtitleFileContent).toHaveBeenCalledWith(
      [],
      "classic_box",
      expect.objectContaining({ playResX: 1080, playResY: 1920 }),
    );
  });

  it("F133-04 fix: rejects an assetManifest source URL that does not resolve to the internal storage-proxy origin (§17.3 SSRF host allowlist) BEFORE fetching it", async () => {
    const emitEvent = vi.fn();
    const storagePut = vi.fn();
    const render = makeRenderStub();
    const fetchSpy = vi.spyOn(globalThis, "fetch");

    await expect(
      executeRemotionRenderVideoJob(
        {
          tenantId: "tenant-1",
          runId: "run-1",
          renderJobId: "job-ssrf-1",
          payload: buildPayload({
            assetManifest: {
              sources: [
                {
                  role: "video",
                  url: "http://169.254.169.254/latest/meta-data/iam/security-credentials/",
                  sha256: "a".repeat(64),
                },
              ],
            },
          }),
        },
        // Deliberately NOT injecting `stageAssets` — exercises the REAL
        // `defaultStageRemotionRenderVideoAssets` default implementation,
        // where the F133-04 allowlist check lives.
        { render, emitEvent, storagePut },
      ),
    ).rejects.toMatchObject({ code: "asset_stage_failed" });

    // The exploit this closes: a job whose assetManifest.sources[].url
    // targets a cloud metadata endpoint (or any other non-internal host)
    // must never be fetched by this server process at all.
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });

  it("still stages a legitimate internal storage-proxy assetManifest source (no regression)", async () => {
    const emitEvent = vi.fn();
    const storagePut = vi.fn(async (key: string) => ({ key, url: `/uploads/${key}` }));
    const render = makeRenderStub();
    const assetBytes = Buffer.from("fake-video-bytes");
    const assetHash = createHash("sha256").update(assetBytes).digest("hex");
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      arrayBuffer: async () => assetBytes.buffer.slice(assetBytes.byteOffset, assetBytes.byteOffset + assetBytes.byteLength),
    } as Response);

    const result = await executeRemotionRenderVideoJob(
      {
        tenantId: "tenant-1",
        runId: "run-1",
        renderJobId: "job-ssrf-2",
        payload: buildPayload({
          assetManifest: {
            sources: [
              {
                role: "video",
                url: "http://localhost:3000/api/storage/files/clip.mp4",
                sha256: assetHash,
              },
            ],
          },
        }),
      },
      { render, emitEvent, storagePut },
    );

    expect(fetchSpy).toHaveBeenCalledWith("http://localhost:3000/api/storage/files/clip.mp4");
    expect(result.outputArtifactRef).toBeTruthy();
    fetchSpy.mockRestore();
  });

  it("fails with post_pass_failed (not blanket render_failed) when the injected ffmpeg runner returns a non-zero exit code", async () => {
    const emitEvent = vi.fn();
    const storagePut = vi.fn();
    const render = makeRenderStub();
    const ffmpeg = vi.fn(async () => ({ code: 1, stderr: "boom" }));

    await expect(
      executeRemotionRenderVideoJob(
        {
          tenantId: "tenant-1",
          runId: "run-1",
          renderJobId: "job-6",
          payload: buildPayload({ postPasses: ["loudnorm"] }),
        },
        { render, emitEvent, storagePut, ffmpeg },
      ),
    ).rejects.toMatchObject({ code: "post_pass_failed" });
  });

  it("produces a remotion_render_mp4 artifact descriptor", async () => {
    const emitEvent = vi.fn();
    const storagePut = vi.fn(async (key: string) => ({ key, url: `/uploads/${key}` }));
    const render = makeRenderStub();

    const result = await executeRemotionRenderVideoJob(
      {
        tenantId: "tenant-1",
        runId: "run-1",
        renderJobId: "job-7",
        payload: buildPayload(),
      },
      { render, emitEvent, storagePut },
    );

    expect(result.outputArtifactRef).toMatchObject({
      artifactType: "remotion_render_mp4",
      mimeType: "video/mp4",
    });
    const artifacts = result.artifacts as Array<{ artifactType: string }>;
    expect(artifacts.map(a => a.artifactType)).toEqual(
      expect.arrayContaining([
        "remotion_render_mp4",
        "remotion_render_manifest",
        "remotion_render_log",
        "remotion_render_probe_report",
      ]),
    );
    expect(storagePut).toHaveBeenCalledTimes(1);
  });
});
