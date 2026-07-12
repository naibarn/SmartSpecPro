/**
 * Retention hooks (`planning/vertical-drama-retention-hooks/plan.md` W3,
 * added 2026-07-11) — coverage for `verticalDramaEpisodePipeline.ts`'s:
 *  - `genre` threaded from the already-loaded `seriesRow` into
 *    `generateStoryboardShotgrid` unconditionally (the payload half of the
 *    decoupled payload-vs-flag convention);
 *  - `retentionHooksEnabled` threaded through `generateRealStoryboard`'s
 *    `opts` bag (the flag half), from both `runStage` (via
 *    `RunStageOptions`) and `repairStage` (via `args`).
 *
 * Mirrors `verticalDramaEpisodePipeline.retentionHooks.test.ts`'s (W1,
 * script-side) and `verticalDramaEpisodePipeline.sceneContracts.test.ts`'s
 * mocking pattern exactly (same private-method-under-test convention).
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockDb } = vi.hoisted(() => ({
  mockDb: {
    select: vi.fn(),
    update: vi.fn(),
    insert: vi.fn(),
    delete: vi.fn(),
    instance: {},
  },
}));
vi.mock("../../db", () => ({ db: mockDb }));

const { mockMemoryService } = vi.hoisted(() => ({
  mockMemoryService: {
    appendEvent: vi.fn(),
    listEvents: vi.fn(),
    buildEpisodeMemoryBundle: vi.fn(),
    proposeRetcon: vi.fn(),
    approveRetconProposal: vi.fn(),
    rejectRetconProposal: vi.fn(),
  },
}));
vi.mock("../verticalDramaSeriesMemory", () => ({
  verticalDramaSeriesMemoryService: mockMemoryService,
  VerticalDramaSeriesMemoryService: class {},
  memoryRowToEvent: vi.fn(),
}));

const { mockGenerateEpisodeScript, mockGenerateStoryboardShotgrid } = vi.hoisted(() => ({
  mockGenerateEpisodeScript: vi.fn(),
  mockGenerateStoryboardShotgrid: vi.fn(),
}));
vi.mock("../verticalDramaScriptGeneration", () => ({
  generateEpisodeScript: mockGenerateEpisodeScript,
  InsufficientCreditsError: class extends Error {},
  VdSchemaValidationError: class extends Error {},
}));
vi.mock("../verticalDramaStoryboardGeneration", () => ({
  generateStoryboardShotgrid: mockGenerateStoryboardShotgrid,
  InsufficientCreditsError: class extends Error {},
  VdSchemaValidationError: class extends Error {},
}));
vi.mock("../verticalDramaDialogueAudio", () => ({
  generateEpisodeDialogueAudioPlan: vi.fn(),
  buildDialogueAudioPlan: vi.fn(),
  InsufficientCreditsError: class extends Error {},
  VdSchemaValidationError: class extends Error {},
}));
vi.mock("../verticalDramaStartFrameGeneration", () => ({
  generateStartFrameRenderPlan: vi.fn(),
  InsufficientCreditsError: class extends Error {},
  VdSchemaValidationError: class extends Error {},
}));
vi.mock("../verticalDramaVideoMotionPromptGeneration", () => ({
  generateVideoMotionPromptPack: vi.fn(),
  syncDialogueOntoMotionPromptClips: vi.fn(),
  syncStartFramesOntoMotionPromptClips: vi.fn(),
  InsufficientCreditsError: class extends Error {},
  VdSchemaValidationError: class extends Error {},
}));
const { mockGetPrimaryPortraitUrl } = vi.hoisted(() => ({
  mockGetPrimaryPortraitUrl: vi.fn(),
}));
vi.mock("../verticalDramaCharacterStock", () => ({
  verticalDramaCharacterStockService: { getPrimaryPortraitUrl: mockGetPrimaryPortraitUrl },
}));
vi.mock("../verticalDramaStoryboardHandoff", () => ({
  createVerticalDramaStoryboardHandoff: vi.fn(),
}));
vi.mock("../verticalDramaSeriesMemoryPlanning", () => ({
  runVerticalDramaSeriesMemoryPlanning: vi.fn(),
  InsufficientCreditsError: class extends Error {},
  VdSchemaValidationError: class extends Error {},
}));
vi.mock("../verticalDramaPromptQc", () => ({
  ensurePromptWithinLimit: vi.fn(async ({ prompt }: { prompt: string }) => ({
    prompt,
    refined: false,
    creditsUsed: 0,
    truncated: false,
  })),
}));
vi.mock("../verticalDramaProductTieIn", () => ({
  extractShotProductPlacements: vi.fn(() => []),
  findPlacementForShot: vi.fn(),
  appendProductPresenceDirective: vi.fn(),
  resolveProductReferenceImageUrls: vi.fn(),
  resolveMarketplaceCaptureProductImageUrls: vi.fn(),
  resolveFrameProductReferenceAssetIds: vi.fn(),
}));

const { mockGetActiveBreakdown, mockReadItemShotDrafts, mockReadItemCliffhangerLine } = vi.hoisted(
  () => ({
    mockGetActiveBreakdown: vi.fn(),
    mockReadItemShotDrafts: vi.fn(),
    mockReadItemCliffhangerLine: vi.fn(),
  }),
);
vi.mock("../verticalDramaStoryBible", () => ({
  getActiveBreakdown: mockGetActiveBreakdown,
  readItemShotDrafts: mockReadItemShotDrafts,
  readItemCliffhangerLine: mockReadItemCliffhangerLine,
}));

import { VerticalDramaEpisodePipeline } from "../verticalDramaEpisodePipeline";

const pipeline = new VerticalDramaEpisodePipeline() as any;

const owner = { tenantId: "tenant-1", userId: 42, seriesId: 10, episodeId: 100 };
const episode = {
  id: 100,
  title: "Episode 3",
  episodeNumber: 3,
  targetDurationSeconds: 60,
  script: null,
} as any;

function selectChain(rows: unknown[]) {
  const chain: any = {
    from: vi.fn(() => chain),
    where: vi.fn(() => chain),
    orderBy: vi.fn(() => chain),
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
    then: (resolve: any) => Promise.resolve(rows).then(resolve),
  };
  return chain;
}

function insertChain(rows: unknown[]) {
  const chain: any = {
    values: vi.fn(() => chain),
    returning: vi.fn(() => Promise.resolve(rows)),
  };
  return chain;
}

beforeEach(() => {
  vi.clearAllMocks();
  mockMemoryService.buildEpisodeMemoryBundle.mockResolvedValue(null);
  mockGenerateEpisodeScript.mockResolvedValue({
    script: { episode_title: "t" },
    creditsUsed: 1,
    model: "gpt-x",
  });
  mockGenerateStoryboardShotgrid.mockResolvedValue({
    storyboard: { shots: [] },
    creditsUsed: 1,
    model: "gpt-x",
  });
  mockGetPrimaryPortraitUrl.mockResolvedValue(null);
  mockGetActiveBreakdown.mockReturnValue([]);
});

/* -------------------------------------------------------------------------- */
/* generateRealStoryboard — genre (payload) + retentionHooksEnabled (flag)   */
/* -------------------------------------------------------------------------- */

describe("generateRealStoryboard — genre threading (unconditional) + retentionHooksEnabled opts threading (W3)", () => {
  it("passes genre from the already-loaded seriesRow unconditionally, even when the flag is off/omitted", async () => {
    mockDb.select
      .mockReturnValueOnce(selectChain([{ bible: null, locale: "th", tone: null, genre: "romance" }]))
      .mockReturnValueOnce(selectChain([]));

    await pipeline.generateRealStoryboard(owner, episode);

    const callArgs = mockGenerateStoryboardShotgrid.mock.calls[0][0];
    expect(callArgs.genre).toBe("romance");
    expect(callArgs.opts.retentionHooksEnabled).toBe(false);
  });

  it("passes genre as undefined when the series row has no genre set", async () => {
    mockDb.select
      .mockReturnValueOnce(selectChain([{ bible: null, locale: "th", tone: null, genre: null }]))
      .mockReturnValueOnce(selectChain([]));

    await pipeline.generateRealStoryboard(owner, episode);

    const callArgs = mockGenerateStoryboardShotgrid.mock.calls[0][0];
    expect(callArgs.genre).toBeUndefined();
  });

  it("passes opts.retentionHooksEnabled=true through to generateStoryboardShotgrid when the 6th argument is true", async () => {
    mockDb.select
      .mockReturnValueOnce(
        selectChain([{ bible: null, locale: "th", tone: null, genre: "educational" }]),
      )
      .mockReturnValueOnce(selectChain([]));

    await pipeline.generateRealStoryboard(owner, episode, false, undefined, false, true);

    const callArgs = mockGenerateStoryboardShotgrid.mock.calls[0][0];
    expect(callArgs.opts.retentionHooksEnabled).toBe(true);
    expect(callArgs.genre).toBe("educational");
  });

  it("defaults opts.retentionHooksEnabled to false when the 6th argument is omitted (existing callers stay byte-identical)", async () => {
    mockDb.select
      .mockReturnValueOnce(selectChain([{ bible: null, locale: "th", tone: null }]))
      .mockReturnValueOnce(selectChain([]));

    await pipeline.generateRealStoryboard(owner, episode);

    const callArgs = mockGenerateStoryboardShotgrid.mock.calls[0][0];
    expect(callArgs.opts.retentionHooksEnabled).toBe(false);
  });
});

/* -------------------------------------------------------------------------- */
/* repairStage — storyboard_shotgrid threads args.retentionHooksEnabled      */
/* -------------------------------------------------------------------------- */

const CURRENT_STORYBOARD = {
  storyboard_summary: {},
  canonical_style_bible: {},
  shot_grid_plan: {},
  shots: Array.from({ length: 9 }, (_, i) => ({ shot_number: i + 1, duration_seconds: 8 })),
  plain_text_storyboard: "old text",
  storyboard_handoff_json: {},
};

function baseEpisode(over: Record<string, unknown> = {}) {
  return {
    id: 100,
    title: "Episode 3",
    episodeNumber: 3,
    targetDurationSeconds: 60,
    script: null,
    storyboard: CURRENT_STORYBOARD,
    dialogueAudioPlan: null,
    ...over,
  };
}

describe("repairStage — storyboard_shotgrid threads args.retentionHooksEnabled through to generateRealStoryboard (W3)", () => {
  it("passes retentionHooksEnabled=true to generateStoryboardShotgrid when args.retentionHooksEnabled is true", async () => {
    const repairEpisode = baseEpisode();
    mockDb.select
      .mockReturnValueOnce(selectChain([repairEpisode]))
      .mockReturnValueOnce(selectChain([{ bible: null, locale: "th", tone: null, genre: "drama" }]))
      .mockReturnValueOnce(selectChain([]))
      .mockReturnValueOnce(selectChain([])); // checkpoint lookup (none found)

    const episodeUpdateChain = updateChain();
    const runUpdateChain = updateChain();
    mockDb.update.mockReturnValueOnce(episodeUpdateChain).mockReturnValueOnce(runUpdateChain);
    mockDb.insert
      .mockReturnValueOnce(insertChain([{ id: 801 }]))
      .mockReturnValueOnce(insertChain([{ id: 901 }]));

    mockGenerateStoryboardShotgrid.mockResolvedValue({
      storyboard: CURRENT_STORYBOARD,
      creditsUsed: 8,
      model: "gpt-4o-mini",
    });

    await pipeline.repairStage(owner, "storyboard_shotgrid", {
      instruction: "Fix shot 1.",
      retentionHooksEnabled: true,
    });

    const callArgs = mockGenerateStoryboardShotgrid.mock.calls[0][0];
    expect(callArgs.opts.retentionHooksEnabled).toBe(true);
    expect(callArgs.genre).toBe("drama");
  });

  it("defaults retentionHooksEnabled to false when args.retentionHooksEnabled is omitted (existing repair callers stay byte-identical)", async () => {
    const repairEpisode = baseEpisode();
    mockDb.select
      .mockReturnValueOnce(selectChain([repairEpisode]))
      .mockReturnValueOnce(selectChain([{ bible: null, locale: "th", tone: null }]))
      .mockReturnValueOnce(selectChain([]))
      .mockReturnValueOnce(selectChain([])); // checkpoint lookup (none found)

    const episodeUpdateChain = updateChain();
    const runUpdateChain = updateChain();
    mockDb.update.mockReturnValueOnce(episodeUpdateChain).mockReturnValueOnce(runUpdateChain);
    mockDb.insert
      .mockReturnValueOnce(insertChain([{ id: 802 }]))
      .mockReturnValueOnce(insertChain([{ id: 902 }]));

    mockGenerateStoryboardShotgrid.mockResolvedValue({
      storyboard: CURRENT_STORYBOARD,
      creditsUsed: 8,
      model: "gpt-4o-mini",
    });

    await pipeline.repairStage(owner, "storyboard_shotgrid", { instruction: "Fix shot 1." });

    const callArgs = mockGenerateStoryboardShotgrid.mock.calls[0][0];
    expect(callArgs.opts.retentionHooksEnabled).toBe(false);
  });
});
