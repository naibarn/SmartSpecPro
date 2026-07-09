/**
 * Deep story drafts hydration wiring (W10-B, spec/section-16 refine-mode,
 * added 2026-07-08) — verifies `verticalDramaEpisodePipeline.ts`'s
 * `generateRealScript`/`generateRealStoryboard` correctly resolve the
 * episode's active-breakdown `shotDrafts`/`cliffhanger_line` (W10-A, via the
 * new `resolveEpisodeDraftHydration` helper) and pass them through to
 * `generateEpisodeScript`/`generateStoryboardShotgrid` as `episodeDraft` +
 * `opts.episodeDraftHydrationEnabled`, gated on the `deepStoryDraftsFlagOn`
 * argument the router's `runStage`/`runEpisode`/`regenerateStage` thread in
 * via `RunStageOptions`.
 *
 * Exercises the two PRIVATE methods directly (`(pipeline as any).generateReal*`)
 * rather than the full `runStage` — a full end-to-end `runStage` call needs
 * to mock the unrelated checkpoint/run/artifact-ledger write chain, which
 * this wave does not touch; `verticalDramaEpisodePipeline.memoryWiring.test.ts`
 * already covers `runStage`/`approveRunCheckpoint` wiring separately. This
 * file mocks `../verticalDramaStoryBible` directly (never `importActual`) so
 * the dynamic `import()` inside `resolveEpisodeDraftHydration` resolves to a
 * small, fully-controlled fake — mirrors `verticalDramaEpisodePipeline.memoryWiring.test.ts`'s
 * "mock the whole module graph" convention.
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
// `repairStage`'s real-repair wiring added a static import of this module's
// `generateEpisodeDialogueAudioPlan`/`buildDialogueAudioPlan` — not exercised
// by `generateRealScript`/`generateRealStoryboard`, stubbed as pass-throughs.
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
  extractShotProductPlacements: vi.fn(),
  findPlacementForShot: vi.fn(),
  appendProductPresenceDirective: vi.fn(),
  resolveProductReferenceImageUrls: vi.fn(),
  resolveMarketplaceCaptureProductImageUrls: vi.fn(),
  resolveFrameProductReferenceAssetIds: vi.fn(),
}));

// The whole point of this file — a small, fully-controlled fake for the 3
// pure readers `resolveEpisodeDraftHydration` calls via a dynamic `import()`.
// `vi.mock` intercepts a dynamic import of a mocked path exactly like a
// static one (established convention — see `verticalDramaEpisodes.ts`'s
// `runArcDriftCheckAndProposeIfNeeded` doc comment).
const { mockGetActiveBreakdown, mockReadItemShotDrafts, mockReadItemCliffhangerLine } = vi.hoisted(() => ({
  mockGetActiveBreakdown: vi.fn(),
  mockReadItemShotDrafts: vi.fn(),
  mockReadItemCliffhangerLine: vi.fn(),
}));
vi.mock("../verticalDramaStoryBible", () => ({
  getActiveBreakdown: mockGetActiveBreakdown,
  readItemShotDrafts: mockReadItemShotDrafts,
  readItemCliffhangerLine: mockReadItemCliffhangerLine,
}));

import { VerticalDramaEpisodePipeline } from "../verticalDramaEpisodePipeline";

// Cast to `any` to reach the two intentionally-private methods under test —
// a full public-API `runStage` call would additionally require mocking the
// unrelated checkpoint/run/artifact-ledger write chain (see file doc comment).
const pipeline = new VerticalDramaEpisodePipeline() as any;

const owner = { tenantId: "tenant-1", userId: 42, seriesId: 10, episodeId: 100 };
const episode = {
  id: 100,
  title: "Episode 3",
  episodeNumber: 3,
  targetDurationSeconds: 60,
  script: null,
} as any;

/** Build a thenable select-chain stub so `await db.select()....where(...)` (with or without `.limit()`) resolves to `rows`. */
function selectChain(rows: unknown[]) {
  const chain: any = {
    from: vi.fn(() => chain),
    where: vi.fn(() => chain),
    limit: vi.fn(() => Promise.resolve(rows)),
    then: (resolve: any) => Promise.resolve(rows).then(resolve),
  };
  return chain;
}

const SAMPLE_BREAKDOWN_ITEM = {
  episodeNumber: 3,
  workingTitle: "Midnight Verdict",
  logline: "l",
  keyBeats: ["b1"],
};
const SAMPLE_SHOTS = [
  { shot_number: 1, summary: "Aria discovers the clause", dialogue_lines: [] },
];

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
});

describe("generateRealScript — deep story drafts hydration wiring (W10-B)", () => {
  it("resolves the active breakdown item via the ALREADY-LOADED bible (no extra DB round trip) and passes episodeDraft + opts.episodeDraftHydrationEnabled=true when the flag is on and a draft exists", async () => {
    const bible = { breakdownVersions: [] };
    mockDb.select
      .mockReturnValueOnce(selectChain([{ bible, locale: "th", productTieIn: null, tone: null }]))
      .mockReturnValueOnce(selectChain([]));
    mockGetActiveBreakdown.mockReturnValue([SAMPLE_BREAKDOWN_ITEM]);
    mockReadItemShotDrafts.mockReturnValue(SAMPLE_SHOTS);
    mockReadItemCliffhangerLine.mockReturnValue("cliff");

    await pipeline.generateRealScript(owner, episode, true);

    expect(mockDb.select).toHaveBeenCalledTimes(2); // series row + character rows — never a 3rd select for the bible
    expect(mockGetActiveBreakdown).toHaveBeenCalledWith(bible);
    const callArgs = mockGenerateEpisodeScript.mock.calls[0][0];
    expect(callArgs.episodeDraft).toEqual({ shots: SAMPLE_SHOTS, cliffhanger_line: "cliff" });
    expect(callArgs.opts.episodeDraftHydrationEnabled).toBe(true);
  });

  it("passes episodeDraft: undefined and episodeDraftHydrationEnabled: false when the flag is off, even for an episode that HAS a draft (never even resolves the breakdown)", async () => {
    const bible = { breakdownVersions: [] };
    mockDb.select
      .mockReturnValueOnce(selectChain([{ bible, locale: "th", productTieIn: null, tone: null }]))
      .mockReturnValueOnce(selectChain([]));

    await pipeline.generateRealScript(owner, episode, false);

    expect(mockGetActiveBreakdown).not.toHaveBeenCalled();
    const callArgs = mockGenerateEpisodeScript.mock.calls[0][0];
    expect(callArgs.episodeDraft).toBeUndefined();
    expect(callArgs.opts.episodeDraftHydrationEnabled).toBe(false);
  });

  it("passes episodeDraft: undefined when the flag is on but the episode's active breakdown item has no shotDrafts (non-draft episode — byte-identical to today)", async () => {
    const bible = { breakdownVersions: [] };
    mockDb.select
      .mockReturnValueOnce(selectChain([{ bible, locale: "th", productTieIn: null, tone: null }]))
      .mockReturnValueOnce(selectChain([]));
    mockGetActiveBreakdown.mockReturnValue([SAMPLE_BREAKDOWN_ITEM]);
    mockReadItemShotDrafts.mockReturnValue(null);

    await pipeline.generateRealScript(owner, episode, true);

    const callArgs = mockGenerateEpisodeScript.mock.calls[0][0];
    expect(callArgs.episodeDraft).toBeUndefined();
    expect(callArgs.opts.episodeDraftHydrationEnabled).toBe(false);
  });

  it("defaults deepStoryDraftsFlagOn to false when the 3rd argument is omitted (existing callers stay byte-identical)", async () => {
    const bible = { breakdownVersions: [] };
    mockDb.select
      .mockReturnValueOnce(selectChain([{ bible, locale: "th", productTieIn: null, tone: null }]))
      .mockReturnValueOnce(selectChain([]));

    await pipeline.generateRealScript(owner, episode);

    expect(mockGetActiveBreakdown).not.toHaveBeenCalled();
    expect(mockGenerateEpisodeScript.mock.calls[0][0].episodeDraft).toBeUndefined();
  });
});

describe("generateRealStoryboard — deep story drafts hydration wiring (W10-B)", () => {
  it("passes episodeDraft + opts.episodeDraftHydrationEnabled=true to generateStoryboardShotgrid when the flag is on and a draft exists", async () => {
    const bible = { breakdownVersions: [] };
    mockDb.select
      .mockReturnValueOnce(selectChain([{ bible, locale: "th", tone: null }]))
      .mockReturnValueOnce(selectChain([]));
    mockGetActiveBreakdown.mockReturnValue([SAMPLE_BREAKDOWN_ITEM]);
    mockReadItemShotDrafts.mockReturnValue(SAMPLE_SHOTS);
    mockReadItemCliffhangerLine.mockReturnValue("cliff");

    await pipeline.generateRealStoryboard(owner, episode, true);

    const callArgs = mockGenerateStoryboardShotgrid.mock.calls[0][0];
    expect(callArgs.episodeDraft).toEqual({ shots: SAMPLE_SHOTS, cliffhanger_line: "cliff" });
    expect(callArgs.opts.episodeDraftHydrationEnabled).toBe(true);
  });

  it("passes episodeDraft: undefined and episodeDraftHydrationEnabled: false when the flag is off", async () => {
    const bible = { breakdownVersions: [] };
    mockDb.select
      .mockReturnValueOnce(selectChain([{ bible, locale: "th", tone: null }]))
      .mockReturnValueOnce(selectChain([]));

    await pipeline.generateRealStoryboard(owner, episode, false);

    const callArgs = mockGenerateStoryboardShotgrid.mock.calls[0][0];
    expect(callArgs.episodeDraft).toBeUndefined();
    expect(callArgs.opts.episodeDraftHydrationEnabled).toBe(false);
  });

  it("passes episodeDraft: undefined when the flag is on but no draft exists for this episode", async () => {
    const bible = { breakdownVersions: [] };
    mockDb.select
      .mockReturnValueOnce(selectChain([{ bible, locale: "th", tone: null }]))
      .mockReturnValueOnce(selectChain([]));
    mockGetActiveBreakdown.mockReturnValue([]); // no matching item at all

    await pipeline.generateRealStoryboard(owner, episode, true);

    const callArgs = mockGenerateStoryboardShotgrid.mock.calls[0][0];
    expect(callArgs.episodeDraft).toBeUndefined();
  });
});
