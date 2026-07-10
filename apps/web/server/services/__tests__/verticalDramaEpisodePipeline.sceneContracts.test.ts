/**
 * Feature 132 §6.2 (F132C, scene contracts, `verticalDramaSceneContracts`,
 * added 2026-07-09) — coverage for `verticalDramaEpisodePipeline.ts`'s:
 *  - `validateStagePayload`'s new flag-gated `storyboard_shotgrid` contract
 *    checks (presence/shape, ≤2 newClueIds budget, anchor-line cadence);
 *  - `sceneContractsEnabled` threaded through `generateRealScript`/
 *    `generateRealStoryboard`'s `opts` bag (mirrors
 *    `verticalDramaEpisodePipeline.episodeDraftHydration.test.ts`'s
 *    mocking pattern for the private-method tests);
 *  - `repairStage`'s `storyboard_shotgrid` branch threading
 *    `args.sceneContractsEnabled` through to `generateRealStoryboard`
 *    (mirrors `verticalDramaEpisodePipeline.repairStage.test.ts`'s
 *    mocking pattern).
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

import { VerticalDramaEpisodePipeline, validateStagePayload } from "../verticalDramaEpisodePipeline";

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
  // Part B1 (planning/`polished-toasting-gadget.md`) — `generateRealStoryboard`
  // now calls `getActiveBreakdown` unconditionally (not flag-gated), so give
  // every test a safe empty-array default; tests exercising the plan-context
  // injection itself override this per-case.
  mockGetActiveBreakdown.mockReturnValue([]);
});

/* -------------------------------------------------------------------------- */
/* validateStagePayload — pure function                                      */
/* -------------------------------------------------------------------------- */

function contractShot(overrides: Record<string, unknown> = {}) {
  return {
    shot_number: 1,
    timecode: "00:01",
    duration_seconds: 8,
    narrative_purpose: "advance plot",
    characters: [],
    required_character_refs: [],
    camera: {},
    visual_description: "d",
    image_prompt: "p",
    contract: {
      storyFunction: "reveal",
      emotionalBeat: "dread",
      audienceTakeaway: "takeaway",
      tensionSource: "time pressure",
      newClueIds: [],
      dialoguePurpose: "confront",
      ...overrides,
    },
  };
}

function nineShotsWithContract(overrides: (i: number) => Record<string, unknown> = () => ({})) {
  return Array.from({ length: 9 }, (_, i) => contractShot(overrides(i)));
}

describe("validateStagePayload — storyboard_shotgrid scene contracts (F132C)", () => {
  it("byte-identical: flag off ignores missing contracts entirely (only the 9-shot count check runs)", () => {
    const payload = { shots: Array.from({ length: 9 }, (_, i) => ({ shot_number: i + 1 })) };
    const result = validateStagePayload("storyboard_shotgrid", payload);
    expect(result.valid).toBe(true);
  });

  it("flag on: fails when a shot has no contract at all", () => {
    const shots = nineShotsWithContract();
    (shots[3] as any).contract = undefined;
    const result = validateStagePayload("storyboard_shotgrid", { shots }, true);
    expect(result.valid).toBe(false);
    expect(result.errors[0].message).toContain("shot #4");
    expect(result.errors[0].repairable).toBe(true);
  });

  it("flag on: fails when a shot's contract.newClueIds exceeds 2", () => {
    const shots = nineShotsWithContract(i => (i === 2 ? { newClueIds: ["a", "b", "c"] } : {}));
    const result = validateStagePayload("storyboard_shotgrid", { shots }, true);
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.message.includes("shot #3") && e.message.includes("budget of 2"))).toBe(
      true,
    );
  });

  it("flag on: fails on a 4-shot gap with no anchorLine: true (violates the canonical cadence predicate)", () => {
    const shots = nineShotsWithContract(i => ({ anchorLine: i === 0 }));
    // shots 2-9 (8 in a row) never carry anchorLine: true.
    const result = validateStagePayload("storyboard_shotgrid", { shots }, true);
    expect(result.valid).toBe(false);
    expect(
      result.errors.some(e =>
        e.message.includes("no run of 3 or more consecutive shots without anchorLine: true"),
      ),
    ).toBe(true);
  });

  it("flag on: passes a fully-compliant 9-shot payload (contract on every shot, <=2 clues each, anchor line every <=3 shots)", () => {
    const shots = nineShotsWithContract(i => ({ anchorLine: [0, 3, 6].includes(i) }));
    const result = validateStagePayload("storyboard_shotgrid", { shots }, true);
    expect(result.valid).toBe(true);
  });

  it("flag on: the shot-count check (exactly 9) still runs alongside the new contract checks", () => {
    const shots = nineShotsWithContract(i => ({ anchorLine: [0, 3, 6].includes(i) })).slice(0, 8);
    const result = validateStagePayload("storyboard_shotgrid", { shots }, true);
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.message.includes("exactly 9 shots"))).toBe(true);
  });

  it("plan_episode_script: the contract flag is a documented no-op (no shot-grained payload to check) — still only checks episode_title, flag on or off", () => {
    const withTitle = validateStagePayload("plan_episode_script", { episode_title: "t" }, true);
    expect(withTitle.valid).toBe(true);
    const withoutTitle = validateStagePayload("plan_episode_script", {}, true);
    expect(withoutTitle.valid).toBe(false);
    expect(withoutTitle.errors[0].message).toBe("script is missing episode_title");
  });
});

/* -------------------------------------------------------------------------- */
/* generateRealScript / generateRealStoryboard opts threading                */
/* -------------------------------------------------------------------------- */

describe("generateRealScript / generateRealStoryboard — sceneContractsEnabled opts threading (F132C)", () => {
  it("generateRealScript passes opts.sceneContractsEnabled=true through to generateEpisodeScript when the 6th argument is true", async () => {
    const bible = { breakdownVersions: [] };
    mockDb.select
      .mockReturnValueOnce(selectChain([{ bible, locale: "th", productTieIn: null, tone: null }]))
      .mockReturnValueOnce(selectChain([]));

    await pipeline.generateRealScript(owner, episode, false, undefined, false, true);

    const callArgs = mockGenerateEpisodeScript.mock.calls[0][0];
    expect(callArgs.opts.sceneContractsEnabled).toBe(true);
  });

  it("generateRealScript defaults opts.sceneContractsEnabled to false when the 6th argument is omitted (existing callers stay byte-identical)", async () => {
    const bible = { breakdownVersions: [] };
    mockDb.select
      .mockReturnValueOnce(selectChain([{ bible, locale: "th", productTieIn: null, tone: null }]))
      .mockReturnValueOnce(selectChain([]));

    await pipeline.generateRealScript(owner, episode);

    const callArgs = mockGenerateEpisodeScript.mock.calls[0][0];
    expect(callArgs.opts.sceneContractsEnabled).toBe(false);
  });

  it("generateRealStoryboard passes opts.sceneContractsEnabled=true through to generateStoryboardShotgrid when the 5th argument is true", async () => {
    const bible = { breakdownVersions: [] };
    mockDb.select
      .mockReturnValueOnce(selectChain([{ bible, locale: "th", tone: null }]))
      .mockReturnValueOnce(selectChain([]));

    await pipeline.generateRealStoryboard(owner, episode, false, undefined, true);

    const callArgs = mockGenerateStoryboardShotgrid.mock.calls[0][0];
    expect(callArgs.opts.sceneContractsEnabled).toBe(true);
  });

  it("generateRealStoryboard defaults opts.sceneContractsEnabled to false when the 5th argument is omitted", async () => {
    const bible = { breakdownVersions: [] };
    mockDb.select
      .mockReturnValueOnce(selectChain([{ bible, locale: "th", tone: null }]))
      .mockReturnValueOnce(selectChain([]));

    await pipeline.generateRealStoryboard(owner, episode, false);

    const callArgs = mockGenerateStoryboardShotgrid.mock.calls[0][0];
    expect(callArgs.opts.sceneContractsEnabled).toBe(false);
  });
});

/* -------------------------------------------------------------------------- */
/* repairStage — storyboard_shotgrid threading of args.sceneContractsEnabled */
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

describe("repairStage — storyboard_shotgrid threads args.sceneContractsEnabled through to generateRealStoryboard (F132C)", () => {
  it("passes sceneContractsEnabled=true to generateRealStoryboard when args.sceneContractsEnabled is true", async () => {
    const episode = baseEpisode();
    mockDb.select
      .mockReturnValueOnce(selectChain([episode]))
      .mockReturnValueOnce(selectChain([{ bible: null, locale: "th", tone: null }]))
      .mockReturnValueOnce(selectChain([]))
      .mockReturnValueOnce(selectChain([]));

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
      sceneContractsEnabled: true,
    });

    const callArgs = mockGenerateStoryboardShotgrid.mock.calls[0][0];
    expect(callArgs.opts.sceneContractsEnabled).toBe(true);
  });

  it("defaults sceneContractsEnabled to false when args.sceneContractsEnabled is omitted (existing repair callers stay byte-identical)", async () => {
    const episode = baseEpisode();
    mockDb.select
      .mockReturnValueOnce(selectChain([episode]))
      .mockReturnValueOnce(selectChain([{ bible: null, locale: "th", tone: null }]))
      .mockReturnValueOnce(selectChain([]))
      .mockReturnValueOnce(selectChain([]));

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
    expect(callArgs.opts.sceneContractsEnabled).toBe(false);
  });
});
