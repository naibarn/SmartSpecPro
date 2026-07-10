/**
 * Vertical Drama Series — Text Overlay Suite series-side coverage (F131AB,
 * task #34, `planning/vertical-drama-end-card-teaser/plan.md` v2):
 *  - `updateSeriesWatermark` — flag gate, ownership, persistence.
 *  - `assembleSeasonVideos` — additive text-overlay/watermark feeding into
 *    `submitSequentialAssemblyJobs`'s specs (merged into each episode's
 *    `subtitles.overlays` + `watermarkImage`), batch-level
 *    `applyTextOverlays`/`applyWatermark` opt-outs, cumulative counts.
 *
 * Same "mock the whole module graph, test the exported procedure handler
 * directly" convention as `verticalDramaSeries.assembleSeasonVideos.test.ts`
 * — extended here with `../../services/verticalDramaTextOverlayResolution`
 * (the ONE new lazy-loaded dependency this wave adds to this router).
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockDb } = vi.hoisted(() => ({
  mockDb: {
    select: vi.fn(),
    update: vi.fn(),
    insert: vi.fn(),
    delete: vi.fn(),
    transaction: vi.fn(),
    instance: {},
  },
}));
vi.mock("../../db", () => ({ db: mockDb }));

vi.mock("../../_core/trpc", () => {
  const createProcedure = () => {
    const proc: any = {
      use: () => proc,
      input: () => proc,
      query: (fn: Function) => fn,
      mutation: (fn: Function) => fn,
    };
    return proc;
  };
  return {
    router: (routes: Record<string, unknown>) => routes,
    protectedProcedure: createProcedure(),
  };
});

vi.mock("../../middleware/requireFeatureFlag", () => ({
  requireFeatureFlag: () => (x: unknown) => x,
}));

vi.mock("../../services/verticalDramaStoryBible", () => ({
  generateStoryBible: vi.fn(),
  InsufficientCreditsError: class extends Error {},
  VdSchemaValidationError: class extends Error {},
}));

vi.mock("../../_core/logger", () => ({
  debugError: vi.fn(),
  debugLog: vi.fn(),
}));

const { mockGetTenantFeatureFlags } = vi.hoisted(() => ({
  mockGetTenantFeatureFlags: vi.fn(),
}));
vi.mock("../../services/tenantFeatureFlagService", () => ({
  getTenantFeatureFlags: mockGetTenantFeatureFlags,
}));

vi.mock("../../services/appRuntimeConfig", () => ({
  getCachedAppRuntimeConfig: vi.fn(() => ({
    internalNodeUrl: "http://localhost:3000",
  })),
}));

vi.mock("../../services/verticalDramaEpisodeVideoAssembly", () => ({
  extractClipSourcesFromMotionPromptPack: vi.fn(() => []),
  resolveClipsForAssembly: vi.fn(() => ({ ordered: [], missing: [] })),
  compiledVideoFilename: vi.fn(
    (args: { episodeNumber?: number | string }) => `ep-${args.episodeNumber}-compiled.mp4`
  ),
  resolveEpisodeDialogueAudioAndSubtitlesRunInputs: vi.fn(() => ({
    dialogueAudioSegmentsIncluded: 0,
    subtitleLinesIncluded: 0,
  })),
  submitSequentialAssemblyJobs: vi.fn(async (specs: Array<{ owner: { episodeId: number } }>) =>
    specs.map(spec => ({ episodeId: spec.owner.episodeId, jobId: `job-${spec.owner.episodeId}` }))
  ),
}));

const { mockResolveVdEpisodeTextOverlayEngineInputs } = vi.hoisted(() => ({
  mockResolveVdEpisodeTextOverlayEngineInputs: vi.fn(),
}));
vi.mock("../../services/verticalDramaTextOverlayResolution", () => ({
  resolveVdEpisodeTextOverlayEngineInputs: mockResolveVdEpisodeTextOverlayEngineInputs,
}));

import { verticalDramaSeriesRouter } from "../verticalDramaSeries";
import * as episodeVideoAssembly from "../../services/verticalDramaEpisodeVideoAssembly";

const router = verticalDramaSeriesRouter as unknown as Record<string, Function>;

function ctx(overrides: Partial<{ tenantId: string | null; user: { id: number } }> = {}) {
  return { tenantId: "tenant-1", user: { id: 42 }, userToken: null, publicUrl: undefined, ...overrides };
}

function selectChain(rows: unknown[]) {
  const chain: any = {
    from: vi.fn(() => chain),
    where: vi.fn(() => chain),
    orderBy: vi.fn(() => Promise.resolve(rows)),
    limit: vi.fn(() => Promise.resolve(rows)),
    then: (resolve: any) => Promise.resolve(rows).then(resolve),
  };
  return chain;
}

function updateChain(rows: unknown[] = []) {
  const chain: any = {
    set: vi.fn(() => chain),
    where: vi.fn(() => chain),
    returning: vi.fn(() => Promise.resolve(rows)),
  };
  return chain;
}

function seriesRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 10,
    tenantId: "tenant-1",
    userId: 42,
    title: "Midnight Vows",
    watermark: null,
    ...overrides,
  };
}

function episodeRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 1,
    episodeNumber: 1,
    title: null,
    motionPromptPack: { clips: [{ clipNumber: 1, sourceShotNumbers: [1], durationSeconds: 8 }] },
    dialogueAudioPlan: null,
    startFramePlan: null,
    textOverlayPlan: null,
    ...overrides,
  };
}

const NO_OVERLAYS_RESULT = { overlays: [], watermarkImage: null, overlaysIncluded: 0 };

beforeEach(() => {
  vi.clearAllMocks();
  mockGetTenantFeatureFlags.mockResolvedValue({
    verticalDramaSeriesVoiceChain: false,
    verticalDramaSeriesTextOverlaySuite: false,
  });
  mockResolveVdEpisodeTextOverlayEngineInputs.mockResolvedValue(NO_OVERLAYS_RESULT);
  vi.mocked(episodeVideoAssembly.extractClipSourcesFromMotionPromptPack).mockImplementation(
    (pack: any) => (pack?.clips?.length ? pack.clips.map((c: any) => ({ clipNumber: c.clipNumber, videoUrl: `/clip-${c.clipNumber}.mp4` })) : [])
  );
  vi.mocked(episodeVideoAssembly.resolveClipsForAssembly).mockImplementation((clips: any) => ({
    ordered: clips,
    missing: [],
  }));
  vi.mocked(episodeVideoAssembly.resolveEpisodeDialogueAudioAndSubtitlesRunInputs).mockReturnValue({
    dialogueAudioSegmentsIncluded: 0,
    subtitleLinesIncluded: 0,
  });
  vi.mocked(episodeVideoAssembly.submitSequentialAssemblyJobs).mockImplementation(
    async (specs: any) =>
      specs.map((spec: any) => ({ episodeId: spec.owner.episodeId, jobId: `job-${spec.owner.episodeId}` }))
  );
});

/* -------------------------------------------------------------------------- */
/* updateSeriesWatermark                                                      */
/* -------------------------------------------------------------------------- */

describe("updateSeriesWatermark", () => {
  const watermarkInput = {
    enabled: true,
    type: "text" as const,
    text: "@mychannel",
    position: "top_right" as const,
    opacity: 0.5,
    scalePct: 10,
    marginPx: 32,
  };

  it("throws FORBIDDEN when verticalDramaSeriesTextOverlaySuite is off", async () => {
    await expect(
      router.updateSeriesWatermark({
        ctx: ctx(),
        input: { seriesId: "10", watermark: watermarkInput },
      })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(mockDb.select).not.toHaveBeenCalled();
  });

  it("throws BAD_REQUEST for a non-numeric seriesId", async () => {
    mockGetTenantFeatureFlags.mockResolvedValue({ verticalDramaSeriesTextOverlaySuite: true });
    await expect(
      router.updateSeriesWatermark({
        ctx: ctx(),
        input: { seriesId: "not-a-number", watermark: watermarkInput },
      })
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  it("throws NOT_FOUND for a series the caller does not own", async () => {
    mockGetTenantFeatureFlags.mockResolvedValue({ verticalDramaSeriesTextOverlaySuite: true });
    mockDb.select.mockReturnValueOnce(selectChain([]));
    await expect(
      router.updateSeriesWatermark({
        ctx: ctx(),
        input: { seriesId: "10", watermark: watermarkInput },
      })
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(mockDb.update).not.toHaveBeenCalled();
  });

  it("persists a valid watermark config and returns it", async () => {
    mockGetTenantFeatureFlags.mockResolvedValue({ verticalDramaSeriesTextOverlaySuite: true });
    mockDb.select.mockReturnValueOnce(selectChain([seriesRow()]));
    const chain = updateChain([{ ...seriesRow(), watermark: watermarkInput }]);
    mockDb.update.mockReturnValueOnce(chain);

    const result = await router.updateSeriesWatermark({
      ctx: ctx(),
      input: { seriesId: "10", watermark: watermarkInput },
    });

    expect(chain.set).toHaveBeenCalledWith(
      expect.objectContaining({ watermark: watermarkInput })
    );
    expect(result.watermark).toEqual(watermarkInput);
  });

  it("persists an image-type watermark", async () => {
    mockGetTenantFeatureFlags.mockResolvedValue({ verticalDramaSeriesTextOverlaySuite: true });
    const imageWatermark = {
      enabled: true,
      type: "image" as const,
      imageUrl: "/api/storage/files/logo.png",
      position: "bottom_left" as const,
      opacity: 0.6,
      scalePct: 8,
      marginPx: 24,
    };
    mockDb.select.mockReturnValueOnce(selectChain([seriesRow()]));
    mockDb.update.mockReturnValueOnce(updateChain([{ ...seriesRow(), watermark: imageWatermark }]));

    const result = await router.updateSeriesWatermark({
      ctx: ctx(),
      input: { seriesId: "10", watermark: imageWatermark },
    });
    expect(result.watermark).toEqual(imageWatermark);
  });
});

/* -------------------------------------------------------------------------- */
/* assembleSeasonVideos — Text Overlay Suite feeding                          */
/* -------------------------------------------------------------------------- */

describe("assembleSeasonVideos — Text Overlay Suite feeding (F131AB, task #34)", () => {
  it("flag OFF: never calls resolveVdEpisodeTextOverlayEngineInputs, submits with no overlays/watermarkImage", async () => {
    mockDb.select
      .mockReturnValueOnce(selectChain([seriesRow()]))
      .mockReturnValueOnce(selectChain([episodeRow({ id: 1 })]));

    await router.assembleSeasonVideos({ ctx: ctx(), input: { seriesId: "10" } });

    expect(mockResolveVdEpisodeTextOverlayEngineInputs).not.toHaveBeenCalled();
    const specs = vi.mocked(episodeVideoAssembly.submitSequentialAssemblyJobs).mock.calls[0]![0] as any[];
    expect(specs[0].watermarkImage).toBeUndefined();
  });

  it("flag ON: resolves per-episode overlays and merges them into that episode's subtitles.overlays", async () => {
    mockGetTenantFeatureFlags.mockResolvedValue({ verticalDramaSeriesTextOverlaySuite: true });
    mockDb.select
      .mockReturnValueOnce(selectChain([seriesRow()]))
      .mockReturnValueOnce(selectChain([episodeRow({ id: 1 })]));
    const overlayEvent = { kind: "episode_indicator", text: "EP 1", startSec: 0, endSec: 0, entireClip: true };
    mockResolveVdEpisodeTextOverlayEngineInputs.mockResolvedValue({
      overlays: [overlayEvent],
      watermarkImage: null,
      overlaysIncluded: 1,
    });

    const result = await router.assembleSeasonVideos({ ctx: ctx(), input: { seriesId: "10" } });

    expect(mockResolveVdEpisodeTextOverlayEngineInputs).toHaveBeenCalledTimes(1);
    const specs = vi.mocked(episodeVideoAssembly.submitSequentialAssemblyJobs).mock.calls[0]![0] as any[];
    expect(specs[0].subtitles).toEqual({
      preset: "no_subtitle_style",
      lines: [],
      fontsDir: undefined,
      overlays: [overlayEvent],
    });
    expect(result.textOverlayEventsIncluded).toBe(1);
  });

  it("flag ON: includes a resolved watermarkImage on the episode's spec and counts it", async () => {
    mockGetTenantFeatureFlags.mockResolvedValue({ verticalDramaSeriesTextOverlaySuite: true });
    mockDb.select
      .mockReturnValueOnce(selectChain([seriesRow()]))
      .mockReturnValueOnce(selectChain([episodeRow({ id: 1 }), episodeRow({ id: 2 })]));
    const watermarkImage = {
      imageUrl: "https://cdn.example.com/logo.png",
      position: "top_right" as const,
      opacity: 0.45,
      scalePct: 10,
      marginPx: 32,
    };
    mockResolveVdEpisodeTextOverlayEngineInputs.mockResolvedValue({
      overlays: [],
      watermarkImage,
      overlaysIncluded: 0,
    });

    const result = await router.assembleSeasonVideos({ ctx: ctx(), input: { seriesId: "10" } });

    const specs = vi.mocked(episodeVideoAssembly.submitSequentialAssemblyJobs).mock.calls[0]![0] as any[];
    expect(specs[0].watermarkImage).toEqual(watermarkImage);
    expect(specs[1].watermarkImage).toEqual(watermarkImage);
    expect(result.episodesWithWatermark).toBe(2);
  });

  it("options.applyTextOverlays === false: skips resolution entirely even with the flag on", async () => {
    mockGetTenantFeatureFlags.mockResolvedValue({ verticalDramaSeriesTextOverlaySuite: true });
    mockDb.select
      .mockReturnValueOnce(selectChain([seriesRow()]))
      .mockReturnValueOnce(selectChain([episodeRow({ id: 1 })]));

    await router.assembleSeasonVideos({
      ctx: ctx(),
      input: { seriesId: "10", options: { applyTextOverlays: false, applyWatermark: false } },
    });

    expect(mockResolveVdEpisodeTextOverlayEngineInputs).not.toHaveBeenCalled();
  });

  it("options.applyWatermark === false still resolves text overlays (independent toggles) but passes includeWatermark: false", async () => {
    mockGetTenantFeatureFlags.mockResolvedValue({ verticalDramaSeriesTextOverlaySuite: true });
    mockDb.select
      .mockReturnValueOnce(selectChain([seriesRow()]))
      .mockReturnValueOnce(selectChain([episodeRow({ id: 1 })]));

    await router.assembleSeasonVideos({
      ctx: ctx(),
      input: { seriesId: "10", options: { applyWatermark: false } },
    });

    expect(mockResolveVdEpisodeTextOverlayEngineInputs).toHaveBeenCalledWith(
      expect.objectContaining({ includeWatermark: false })
    );
  });

  it("passes each episode's own textOverlayPlan/startFramePlan/title through as the plan/startFramePlan/episodeTitle params", async () => {
    mockGetTenantFeatureFlags.mockResolvedValue({ verticalDramaSeriesTextOverlaySuite: true });
    const plan = { endCard: { enabled: true, text: "จบแล้ว" } };
    const startFramePlan = { frames: [{ shotNumber: 1, requiredCharacterRefs: [] }] };
    mockDb.select
      .mockReturnValueOnce(selectChain([seriesRow()]))
      .mockReturnValueOnce(
        selectChain([
          episodeRow({ id: 1, title: "ตอนแรก", textOverlayPlan: plan, startFramePlan }),
        ])
      );

    await router.assembleSeasonVideos({ ctx: ctx(), input: { seriesId: "10" } });

    const call = mockResolveVdEpisodeTextOverlayEngineInputs.mock.calls[0]![0];
    expect(call.episodeTitle).toBe("ตอนแรก");
    // `parseTextOverlayPlan` applies zod defaults (durationSec/showFollowLine/
    // styleVariant) on top of the raw stored plan — this is the CORRECT,
    // normalized shape the router actually threads through.
    expect(call.plan).toEqual({
      endCard: {
        enabled: true,
        text: "จบแล้ว",
        durationSec: 3,
        showFollowLine: true,
        styleVariant: "center_card",
      },
    });
    expect(call.startFramePlan).toEqual(startFramePlan);
    expect(call.owner).toEqual({ tenantId: "tenant-1", userId: 42, seriesId: 10 });
  });

  it("sums textOverlayEventsIncluded across every submitted episode", async () => {
    mockGetTenantFeatureFlags.mockResolvedValue({ verticalDramaSeriesTextOverlaySuite: true });
    mockDb.select
      .mockReturnValueOnce(selectChain([seriesRow()]))
      .mockReturnValueOnce(selectChain([episodeRow({ id: 1 }), episodeRow({ id: 2 })]));
    mockResolveVdEpisodeTextOverlayEngineInputs
      .mockResolvedValueOnce({ overlays: [{ kind: "end_card" }], watermarkImage: null, overlaysIncluded: 3 })
      .mockResolvedValueOnce({ overlays: [{ kind: "end_card" }], watermarkImage: null, overlaysIncluded: 2 });

    const result = await router.assembleSeasonVideos({ ctx: ctx(), input: { seriesId: "10" } });
    expect(result.textOverlayEventsIncluded).toBe(5);
  });

  it("returns textOverlayEventsIncluded: 0 and episodesWithWatermark: 0 in the all-skipped early-return branch", async () => {
    mockGetTenantFeatureFlags.mockResolvedValue({ verticalDramaSeriesTextOverlaySuite: true });
    mockDb.select
      .mockReturnValueOnce(selectChain([seriesRow()]))
      .mockReturnValueOnce(selectChain([episodeRow({ id: 1, motionPromptPack: null })]));

    const result = await router.assembleSeasonVideos({ ctx: ctx(), input: { seriesId: "10" } });
    expect(result.textOverlayEventsIncluded).toBe(0);
    expect(result.episodesWithWatermark).toBe(0);
    expect(mockResolveVdEpisodeTextOverlayEngineInputs).not.toHaveBeenCalled();
  });
});
