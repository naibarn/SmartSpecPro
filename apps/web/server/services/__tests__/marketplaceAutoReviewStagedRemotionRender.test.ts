import { describe, expect, it, vi } from "vitest";

// `submitStagedRemotionFinalRender` no longer dispatches Lane A in-process
// (`planning/worker-app-remotion-render-video/plan.md` §P3 — Lane A must
// never render inside `smartspec-web`'s cgroup), so this module has no
// `videoIntelligenceJobs`/`@remotion/bundler` dependency chain to mock
// around anymore.
vi.mock("../../db", () => ({ db: {} }));

import {
  buildStagedCaptionLines,
  buildStagedRemotionTemplate,
  StagedRemotionRenderError,
  submitStagedRemotionFinalRender,
} from "../marketplaceAutoReviewStagedRemotionRender";

describe("buildStagedCaptionLines", () => {
  it("builds cues for a single-speaker shot within its clip window", () => {
    const lines = buildStagedCaptionLines({
      shots: [{ shotId: 1, dialogue: "This product is amazing and worth every baht." }],
      clipDurationsSec: [8],
    });
    expect(lines.length).toBeGreaterThan(0);
    for (const line of lines) {
      expect(line.startSec).toBeGreaterThanOrEqual(0);
      expect(line.endSec).toBeLessThanOrEqual(8);
      expect(line.endSec).toBeGreaterThan(line.startSec);
      expect(line.text.length).toBeGreaterThan(0);
    }
  });

  it("prefixes each turn with the speaker name in two-person mode", () => {
    const lines = buildStagedCaptionLines({
      shots: [
        {
          shotId: 1,
          dialogue: "Host: What do you think of this?\nGuest: I love it.",
          dialogueTurns: [
            { speakerName: "Host", line: "What do you think of this?" },
            { speakerName: "Guest", line: "I love it." },
          ],
        },
      ],
      clipDurationsSec: [6],
    });
    expect(lines.length).toBeGreaterThanOrEqual(2);
    expect(lines.some(line => line.text.startsWith("Host:"))).toBe(true);
    expect(lines.some(line => line.text.startsWith("Guest:"))).toBe(true);
    // Host lines must all end before (or exactly when) Guest lines begin.
    const hostEnd = Math.max(
      ...lines.filter(line => line.text.startsWith("Host:")).map(line => line.endSec),
    );
    const guestStart = Math.min(
      ...lines.filter(line => line.text.startsWith("Guest:")).map(line => line.startSec),
    );
    expect(guestStart).toBeGreaterThanOrEqual(hostEnd);
  });

  it("chunks long dialogue into multiple readable cues", () => {
    const longDialogue =
      "This is a very long piece of dialogue that describes the product in great detail, " +
      "covering the material quality, the price point, the shipping experience, and why " +
      "every viewer should consider buying it today before the promotion ends.";
    const lines = buildStagedCaptionLines({
      shots: [{ shotId: 1, dialogue: longDialogue }],
      clipDurationsSec: [10],
    });
    expect(lines.length).toBeGreaterThan(1);
    for (const line of lines) {
      expect(Array.from(line.text).length).toBeLessThanOrEqual(48);
    }
  });

  it("never overlaps across shot boundaries and offsets by real clip durations", () => {
    const lines = buildStagedCaptionLines({
      shots: [
        { shotId: 1, dialogue: "First shot dialogue line." },
        { shotId: 2, dialogue: "Second shot dialogue line." },
      ],
      clipDurationsSec: [8, 8],
    });
    const shot1Lines = lines.filter(line => line.endSec <= 8.001);
    const shot2Lines = lines.filter(line => line.startSec >= 7.999);
    expect(shot1Lines.length).toBeGreaterThan(0);
    expect(shot2Lines.length).toBeGreaterThan(0);
    for (const line of shot2Lines) {
      expect(line.startSec).toBeGreaterThanOrEqual(8);
    }
    for (let i = 1; i < lines.length; i++) {
      expect(lines[i].startSec).toBeGreaterThanOrEqual(lines[i - 1].endSec);
    }
  });
});

describe("buildStagedRemotionTemplate", () => {
  it("computes cumulative startFrame and total durationInFrames", () => {
    const { template, durationInFrames } = buildStagedRemotionTemplate({
      clips: [
        { url: "https://cdn.example.com/clip1.mp4", durationSec: 5 },
        { url: "https://cdn.example.com/clip2.mp4", durationSec: 3 },
      ],
      fps: 30,
    });
    const videoLayers = template.layers.filter(layer => layer.type === "video");
    expect(videoLayers).toHaveLength(2);
    expect(videoLayers[0].startFrame).toBe(0);
    expect(videoLayers[0].durationFrames).toBe(150);
    expect(videoLayers[1].startFrame).toBe(150);
    expect(videoLayers[1].durationFrames).toBe(90);
    expect(durationInFrames).toBe(240);
    expect(template.durationInFrames).toBe(240);
  });

  it("produces a schema-valid config (RemotionTemplateConfigSchema.parse succeeds internally)", () => {
    const { template } = buildStagedRemotionTemplate({
      clips: [{ url: "https://cdn.example.com/clip1.mp4", durationSec: 4 }],
    });
    expect(template.id).toBeTruthy();
    expect(template.width).toBe(1080);
    expect(template.height).toBe(1920);
    expect(template.fps).toBe(30);
  });

  it("adds an audio layer spanning the full timeline when audio is provided", () => {
    const { template, durationInFrames } = buildStagedRemotionTemplate({
      clips: [{ url: "https://cdn.example.com/clip1.mp4", durationSec: 4 }],
      audio: { url: "https://cdn.example.com/voiceover.mp3" },
    });
    const audioLayers = template.layers.filter(layer => layer.type === "audio");
    expect(audioLayers).toHaveLength(1);
    expect(audioLayers[0].startFrame).toBe(0);
    expect(audioLayers[0].durationFrames).toBe(durationInFrames);
  });

  it("throws when the clip count exceeds the layer budget", () => {
    const clips = Array.from({ length: 41 }, (_, index) => ({
      url: `https://cdn.example.com/clip${index}.mp4`,
      durationSec: 1,
    }));
    expect(() => buildStagedRemotionTemplate({ clips })).toThrow(StagedRemotionRenderError);
  });
});

describe("submitStagedRemotionFinalRender", () => {
  function baseInput(overrides: Partial<Parameters<typeof submitStagedRemotionFinalRender>[0]> = {}) {
    return {
      runId: "run-1",
      tenantId: "tenant-1",
      planRevision: 1,
      videoClipUrls: ["https://cdn.example.com/clip1.mp4", "https://cdn.example.com/clip2.mp4"],
      shots: [
        { shotId: 1, dialogue: "First shot dialogue.", durationSeconds: 5 },
        { shotId: 2, dialogue: "Second shot dialogue.", durationSeconds: 5 },
      ],
      includeAudio: false,
      ...overrides,
    };
  }

  function fakeDeps() {
    const stageClip = vi.fn(async (_url: string, fallback: number | undefined) => ({
      durationSec: fallback ?? 5,
      sha256: "a".repeat(64),
    }));
    const stageAudio = vi.fn(async () => ({ sha256: "b".repeat(64) }));
    const queueJob = vi.fn(async () => ({
      created: true,
      job: { id: "job-1" } as any,
    }));
    return { stageClip, stageAudio, queueJob };
  }

  it("omits captionLines/captionPresetId when subtitlePresetId is no_subtitle_style", async () => {
    const deps = fakeDeps();
    await submitStagedRemotionFinalRender(
      baseInput({ subtitlePresetId: "no_subtitle_style" }),
      deps,
    );
    expect(deps.queueJob).toHaveBeenCalledTimes(1);
    const workerInput = deps.queueJob.mock.calls[0][0];
    expect(workerInput.captionLines).toBeUndefined();
    expect(workerInput.captionPresetId).toBeUndefined();
    expect(workerInput.postPasses).toEqual(["loudnorm"]);
  });

  it("includes captionLines/captionPresetId by default (classic_box)", async () => {
    const deps = fakeDeps();
    await submitStagedRemotionFinalRender(baseInput(), deps);
    const workerInput = deps.queueJob.mock.calls[0][0];
    expect(workerInput.captionPresetId).toBe("classic_box");
    expect(Array.isArray(workerInput.captionLines)).toBe(true);
    expect(workerInput.postPasses).toEqual(["loudnorm", "ass_burn"]);
  });

  it("throws StagedRemotionRenderError when there are no clip URLs", async () => {
    const deps = fakeDeps();
    await expect(
      submitStagedRemotionFinalRender(baseInput({ videoClipUrls: [] }), deps),
    ).rejects.toThrow(StagedRemotionRenderError);
    expect(deps.queueJob).not.toHaveBeenCalled();
  });

  it("never dispatches Lane A in-process (Lane B worker-app claims the queued job instead)", async () => {
    const deps = fakeDeps();
    const result = await submitStagedRemotionFinalRender(baseInput(), deps);
    expect(result.jobId).toBe("job-1");
    expect(deps.queueJob).toHaveBeenCalledTimes(1);
    expect((deps as Record<string, unknown>).dispatchLaneA).toBeUndefined();
  });

  it("uses the video clips' real staged sha256 (not sha256(url)) in the asset manifest", async () => {
    const deps = fakeDeps();
    await submitStagedRemotionFinalRender(baseInput(), deps);
    const workerInput = deps.queueJob.mock.calls[0][0];
    const videoSources = workerInput.assetManifest.sources.filter(
      (s: any) => s.role === "video",
    );
    expect(videoSources).toHaveLength(2);
    for (const source of videoSources) {
      expect(source.sha256).toBe("a".repeat(64));
    }
  });

  it("stages the audio file for real bytes-sha256 and includes it in the manifest", async () => {
    const deps = fakeDeps();
    await submitStagedRemotionFinalRender(
      baseInput({ includeAudio: true, audioUrl: "https://cdn.example.com/voiceover.mp3" }),
      deps,
    );
    expect(deps.stageAudio).toHaveBeenCalledWith(
      "https://cdn.example.com/voiceover.mp3",
      undefined,
    );
    const workerInput = deps.queueJob.mock.calls[0][0];
    const audioSources = workerInput.assetManifest.sources.filter(
      (s: any) => s.role === "audio",
    );
    expect(audioSources).toHaveLength(1);
    expect(audioSources[0].sha256).toBe("b".repeat(64));
    // Different from `sha256(url)` — proves it's a real bytes hash, not the
    // pre-fix `fallbackAssetSourceHash(input.audioUrl)`.
    expect(audioSources[0].sha256).not.toBe(
      require("crypto")
        .createHash("sha256")
        .update("https://cdn.example.com/voiceover.mp3")
        .digest("hex"),
    );
  });

  it("omits the audio layer (and manifest entry) when audio staging fails, without throwing", async () => {
    const deps = fakeDeps();
    deps.stageAudio = vi.fn(async () => {
      throw new Error("download failed");
    });
    const result = await submitStagedRemotionFinalRender(
      baseInput({ includeAudio: true, audioUrl: "https://cdn.example.com/voiceover.mp3" }),
      deps,
    );
    expect(result.jobId).toBe("job-1");
    const workerInput = deps.queueJob.mock.calls[0][0];
    const audioSources = workerInput.assetManifest.sources.filter(
      (s: any) => s.role === "audio",
    );
    expect(audioSources).toHaveLength(0);
    const audioLayers = workerInput.remotionTemplate.layers.filter(
      (l: any) => l.type === "audio",
    );
    expect(audioLayers).toHaveLength(0);
  });
});
