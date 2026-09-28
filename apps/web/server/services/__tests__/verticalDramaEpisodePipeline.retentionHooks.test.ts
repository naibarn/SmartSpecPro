/**
 * Retention hooks (`planning/vertical-drama-retention-hooks/plan.md` W1,
 * added 2026-07-11) — coverage for `verticalDramaEpisodePipeline.ts`'s:
 *  - `genre` threaded from the already-loaded `seriesRow` into
 *    `generateEpisodeScript` unconditionally (the payload half of the
 *    decoupled payload-vs-flag convention);
 *  - `retentionHooksEnabled` threaded through `generateRealScript`'s `opts`
 *    bag (the flag half), from both `runStage` (via `RunStageOptions`) and
 *    `repairStage` (via `args`).
 *
 * Mirrors `verticalDramaEpisodePipeline.sceneContracts.test.ts`'s mocking
 * pattern exactly (same private-method-under-test convention).
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
  // Series memory Producer B (planning/vd-series-memory-and-lineage/
  // plan.md Stage 1.2) — best-effort no-op stub; the memory-write
  // wiring itself is covered by
  // verticalDramaScriptGeneration.episodeMemory.test.ts, not this file.
  resolveScriptEpisodeMemory: vi.fn(),
}));
vi.mock("../verticalDramaSeriesMemoryProjection", () => ({
  upsertEpisodeMemory: vi.fn(),
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
// Router-wiring package (added 2026-07-11) — W7 motion-pack coverage below
// needs a handle on the mocked `generateVideoMotionPromptPack` to assert on
// its call args; every other mocked export in this module is accessed via a
// hoisted-named `vi.fn()` already (`mockGenerateEpisodeScript`/
// `mockGenerateStoryboardShotgrid`), but this one wasn't previously needed
// by name — `vi.mocked()` on the plain import works identically since
// `vi.mock`'s factory is hoisted above this import either way.
import { generateVideoMotionPromptPack } from "../verticalDramaVideoMotionPromptGeneration";

const mockGenerateVideoMotionPromptPack = vi.mocked(generateVideoMotionPromptPack);

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
/* generateRealScript — genre (payload) + retentionHooksEnabled (flag)       */
/* -------------------------------------------------------------------------- */

describe("generateRealScript — genre threading (unconditional) + retentionHooksEnabled opts threading (W1)", () => {
  it("passes genre from the already-loaded seriesRow unconditionally, even when the flag is off/omitted", async () => {
    const bible = { breakdownVersions: [] };
    mockDb.select
      .mockReturnValueOnce(
        selectChain([{ bible, locale: "th", productTieIn: null, tone: null, genre: "romance" }]),
      )
      .mockReturnValueOnce(selectChain([]));

    await pipeline.generateRealScript(owner, episode);

    const callArgs = mockGenerateEpisodeScript.mock.calls[0][0];
    expect(callArgs.genre).toBe("romance");
    expect(callArgs.opts.retentionHooksEnabled).toBe(false);
  });

  it("passes genre as undefined when the series row has no genre set", async () => {
    const bible = { breakdownVersions: [] };
    mockDb.select
      .mockReturnValueOnce(
        selectChain([{ bible, locale: "th", productTieIn: null, tone: null, genre: null }]),
      )
      .mockReturnValueOnce(selectChain([]));

    await pipeline.generateRealScript(owner, episode);

    const callArgs = mockGenerateEpisodeScript.mock.calls[0][0];
    expect(callArgs.genre).toBeUndefined();
  });

  it("passes opts.retentionHooksEnabled=true through to generateEpisodeScript when the 7th argument is true", async () => {
    const bible = { breakdownVersions: [] };
    mockDb.select
      .mockReturnValueOnce(
        selectChain([{ bible, locale: "th", productTieIn: null, tone: null, genre: "educational" }]),
      )
      .mockReturnValueOnce(selectChain([]));

    await pipeline.generateRealScript(owner, episode, false, undefined, false, false, true);

    const callArgs = mockGenerateEpisodeScript.mock.calls[0][0];
    expect(callArgs.opts.retentionHooksEnabled).toBe(true);
    expect(callArgs.genre).toBe("educational");
  });

  it("defaults opts.retentionHooksEnabled to false when the 7th argument is omitted (existing callers stay byte-identical)", async () => {
    const bible = { breakdownVersions: [] };
    mockDb.select
      .mockReturnValueOnce(selectChain([{ bible, locale: "th", productTieIn: null, tone: null }]))
      .mockReturnValueOnce(selectChain([]));

    await pipeline.generateRealScript(owner, episode);

    const callArgs = mockGenerateEpisodeScript.mock.calls[0][0];
    expect(callArgs.opts.retentionHooksEnabled).toBe(false);
  });
});

/* -------------------------------------------------------------------------- */
/* repairStage — plan_episode_script threads args.retentionHooksEnabled      */
/* -------------------------------------------------------------------------- */

function baseEpisode(over: Record<string, unknown> = {}) {
  return {
    id: 100,
    title: "Episode 3",
    episodeNumber: 3,
    targetDurationSeconds: 60,
    script: { episode_title: "old" },
    storyboard: null,
    dialogueAudioPlan: null,
    ...over,
  };
}

describe("repairStage — plan_episode_script threads args.retentionHooksEnabled through to generateRealScript", () => {
  it("passes retentionHooksEnabled=true to generateEpisodeScript when args.retentionHooksEnabled is true", async () => {
    const repairEpisode = baseEpisode();
    mockDb.select
      .mockReturnValueOnce(selectChain([repairEpisode]))
      .mockReturnValueOnce(selectChain([{ bible: null, locale: "th", productTieIn: null, tone: null, genre: "drama" }]))
      .mockReturnValueOnce(selectChain([]))
      .mockReturnValueOnce(selectChain([])); // checkpoint lookup (none found)

    const episodeUpdateChain = updateChain();
    const runUpdateChain = updateChain();
    mockDb.update.mockReturnValueOnce(episodeUpdateChain).mockReturnValueOnce(runUpdateChain);
    mockDb.insert
      .mockReturnValueOnce(insertChain([{ id: 801 }]))
      .mockReturnValueOnce(insertChain([{ id: 901 }]));

    await pipeline.repairStage(owner, "plan_episode_script", {
      instruction: "Fix the cliffhanger.",
      retentionHooksEnabled: true,
    });

    const callArgs = mockGenerateEpisodeScript.mock.calls[0][0];
    expect(callArgs.opts.retentionHooksEnabled).toBe(true);
    expect(callArgs.genre).toBe("drama");
  });

  it("defaults retentionHooksEnabled to false when args.retentionHooksEnabled is omitted (existing repair callers stay byte-identical)", async () => {
    const repairEpisode = baseEpisode();
    mockDb.select
      .mockReturnValueOnce(selectChain([repairEpisode]))
      .mockReturnValueOnce(selectChain([{ bible: null, locale: "th", productTieIn: null, tone: null }]))
      .mockReturnValueOnce(selectChain([]))
      .mockReturnValueOnce(selectChain([])); // checkpoint lookup (none found)

    const episodeUpdateChain = updateChain();
    const runUpdateChain = updateChain();
    mockDb.update.mockReturnValueOnce(episodeUpdateChain).mockReturnValueOnce(runUpdateChain);
    mockDb.insert
      .mockReturnValueOnce(insertChain([{ id: 802 }]))
      .mockReturnValueOnce(insertChain([{ id: 902 }]));

    await pipeline.repairStage(owner, "plan_episode_script", { instruction: "Fix the cliffhanger." });

    const callArgs = mockGenerateEpisodeScript.mock.calls[0][0];
    expect(callArgs.opts.retentionHooksEnabled).toBe(false);
  });
});

/* -------------------------------------------------------------------------- */
/* generateRealMotionPromptPack — retentionHooksEnabled threading (W7,        */
/* router-wiring package, added 2026-07-11)                                   */
/* -------------------------------------------------------------------------- */

describe("generateRealMotionPromptPack — retentionHooksEnabled threading (W7)", () => {
  function motionPackEpisode() {
    return {
      ...episode,
      storyboard: {
        shots: [
          { shotNumber: 1, description: "opens on the ringing phone", durationSeconds: 6 },
        ],
      },
      motionPromptPack: null,
    };
  }

  beforeEach(() => {
    mockGenerateVideoMotionPromptPack.mockResolvedValue({
      pack: { clips: [] } as any,
      raw: {} as any,
      creditsUsed: 1,
      model: "gpt-x",
    });
  });

  it("passes retentionHooksEnabled=true through to generateVideoMotionPromptPack when the 3rd argument is true", async () => {
    mockDb.select.mockReturnValueOnce(selectChain([{ bible: null, locale: "en" }])); // episodePlanSeriesRow

    await pipeline.generateRealMotionPromptPack(owner, motionPackEpisode(), true);

    const callArgs = mockGenerateVideoMotionPromptPack.mock.calls[0][0];
    expect(callArgs.retentionHooksEnabled).toBe(true);
  });

  it("defaults retentionHooksEnabled to false when the 3rd argument is omitted (existing runStage caller stays byte-identical)", async () => {
    mockDb.select.mockReturnValueOnce(selectChain([{ bible: null, locale: "en" }])); // episodePlanSeriesRow

    await pipeline.generateRealMotionPromptPack(owner, motionPackEpisode());

    const callArgs = mockGenerateVideoMotionPromptPack.mock.calls[0][0];
    expect(callArgs.retentionHooksEnabled).toBe(false);
  });
});
