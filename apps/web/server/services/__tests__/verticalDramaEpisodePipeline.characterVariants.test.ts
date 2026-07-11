/**
 * Character variants — storyboard generation selects the right variant per
 * shot (planning/vertical-drama-character-variants/plan.md Phase D).
 *
 * Verifies `verticalDramaEpisodePipeline.ts`'s `generateRealStoryboard`
 * correctly partitions the series' character roster into base characters
 * (`parentCharacterId == null`, sent as top-level `characters` entries,
 * unchanged shape/order) and variant rows (`parentCharacterId` set,
 * attached under their own parent's `variants[]`), resolving each variant's
 * OWN portrait via `getPrimaryPortraitUrl` keyed by the VARIANT row's own
 * id — never the parent's — and excluding any variant with no approved
 * portrait yet.
 *
 * Exercises the PRIVATE `generateRealStoryboard` method directly (same
 * "cast to any, mock the whole module graph" convention as
 * `verticalDramaEpisodePipeline.episodeDraftHydration.test.ts` — see that
 * file's doc comment for the rationale).
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
  extractShotProductPlacements: vi.fn(),
  findPlacementForShot: vi.fn(),
  appendProductPresenceDirective: vi.fn(),
  resolveProductReferenceImageUrls: vi.fn(),
  resolveMarketplaceCaptureProductImageUrls: vi.fn(),
  resolveFrameProductReferenceAssetIds: vi.fn(),
}));

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

const pipeline = new VerticalDramaEpisodePipeline() as any;

const owner = { tenantId: "tenant-1", userId: 42, seriesId: 10, episodeId: 100 };
const episode = {
  id: 100,
  title: "Episode 3",
  episodeNumber: 3,
  targetDurationSeconds: 60,
  script: null,
} as any;

/** Build a thenable select-chain stub so `await db.select()....where(...)` resolves to `rows`. */
function selectChain(rows: unknown[]) {
  const chain: any = {
    from: vi.fn(() => chain),
    where: vi.fn(() => chain),
    limit: vi.fn(() => Promise.resolve(rows)),
    then: (resolve: any) => Promise.resolve(rows).then(resolve),
  };
  return chain;
}

const SERIES_ROW = { bible: { breakdownVersions: [] }, locale: "th", tone: null };

beforeEach(() => {
  vi.clearAllMocks();
  mockMemoryService.buildEpisodeMemoryBundle.mockResolvedValue(null);
  mockGenerateStoryboardShotgrid.mockResolvedValue({
    storyboard: { shots: [] },
    creditsUsed: 1,
    model: "gpt-x",
  });
  mockGetActiveBreakdown.mockReturnValue([]);
});

describe("generateRealStoryboard — character variants (Phase D)", () => {
  it("sends only BASE characters as top-level entries, each carrying its own variants[] (only variants with a resolved portrait)", async () => {
    const characterRows = [
      // Base character with two variant rows.
      { id: 1, characterKey: "char-nuna", name: "Nuna", role: "lead", parentCharacterId: null, variantLabel: null, variantType: null, data: null },
      { id: 2, characterKey: "char-nuna-school", name: "Nuna", role: "lead", parentCharacterId: 1, variantLabel: "ชุดนักเรียน", variantType: "outfit", data: { description: "school uniform, worn at school" } },
      { id: 3, characterKey: "char-nuna-sleep", name: "Nuna", role: "lead", parentCharacterId: 1, variantLabel: "ชุดนอน", variantType: "outfit", data: { description: "pajamas, worn at home" } },
      // Unrelated base character with no variants at all.
      { id: 4, characterKey: "char-bob", name: "Bob", role: "support", parentCharacterId: null, variantLabel: null, variantType: null, data: null },
    ];
    mockDb.select
      .mockReturnValueOnce(selectChain([SERIES_ROW]))
      .mockReturnValueOnce(selectChain(characterRows));
    mockGetPrimaryPortraitUrl.mockImplementation((_owner: unknown, id: number) => {
      if (id === 1) return Promise.resolve(null); // base character — no portrait yet
      if (id === 2) return Promise.resolve("https://cdn.example/nuna-school.png"); // variant WITH portrait
      if (id === 3) return Promise.resolve(null); // variant WITHOUT portrait — must be excluded
      if (id === 4) return Promise.resolve("https://cdn.example/bob.png");
      return Promise.resolve(null);
    });

    await pipeline.generateRealStoryboard(owner, episode, false);

    const callArgs = mockGenerateStoryboardShotgrid.mock.calls[0][0];
    expect(callArgs.characters).toHaveLength(2); // base characters only — variants nested, not top-level
    expect(callArgs.characters.map((c: any) => c.characterId)).toEqual(["char-nuna", "char-bob"]);

    const nuna = callArgs.characters.find((c: any) => c.characterId === "char-nuna");
    expect(nuna.referenceImageUrl).toBeNull();
    expect(nuna.variants).toEqual([
      {
        characterKey: "char-nuna-school",
        variantLabel: "ชุดนักเรียน",
        variantType: "outfit",
        description: "school uniform, worn at school",
        referenceImageUrl: "https://cdn.example/nuna-school.png",
      },
    ]);

    const bob = callArgs.characters.find((c: any) => c.characterId === "char-bob");
    expect(bob.variants).toBeUndefined();
  });

  it("falls back to the variant's own variantLabel as description when the variant row has no data.description", async () => {
    const characterRows = [
      { id: 1, characterKey: "char-nuna", name: "Nuna", role: "lead", parentCharacterId: null, variantLabel: null, variantType: null, data: null },
      { id: 2, characterKey: "char-nuna-school", name: "Nuna", role: "lead", parentCharacterId: 1, variantLabel: "ชุดนักเรียน", variantType: "outfit", data: null },
    ];
    mockDb.select
      .mockReturnValueOnce(selectChain([SERIES_ROW]))
      .mockReturnValueOnce(selectChain(characterRows));
    mockGetPrimaryPortraitUrl.mockImplementation((_owner: unknown, id: number) =>
      Promise.resolve(id === 2 ? "https://cdn.example/nuna-school.png" : null)
    );

    await pipeline.generateRealStoryboard(owner, episode, false);

    const callArgs = mockGenerateStoryboardShotgrid.mock.calls[0][0];
    const nuna = callArgs.characters.find((c: any) => c.characterId === "char-nuna");
    expect(nuna.variants[0].description).toBe("ชุดนักเรียน");
  });

  it("produces variants: undefined for every character when the series has no variant rows at all (byte-identical to before Phase D)", async () => {
    const characterRows = [
      { id: 1, characterKey: "char-1", name: "Alice", role: "lead", parentCharacterId: null, variantLabel: null, variantType: null, data: null },
    ];
    mockDb.select
      .mockReturnValueOnce(selectChain([SERIES_ROW]))
      .mockReturnValueOnce(selectChain(characterRows));
    mockGetPrimaryPortraitUrl.mockResolvedValue(null);

    await pipeline.generateRealStoryboard(owner, episode, false);

    const callArgs = mockGenerateStoryboardShotgrid.mock.calls[0][0];
    expect(callArgs.characters).toEqual([
      { characterId: "char-1", name: "Alice", role: "lead", referenceImageUrl: null, variants: undefined },
    ]);
  });

  it("also works when character rows omit the new variant columns entirely (older mocks/rows without parentCharacterId etc. — all treated as base characters)", async () => {
    const characterRows = [
      { id: 1, characterKey: "char-1", name: "Alice", role: "lead" },
    ];
    mockDb.select
      .mockReturnValueOnce(selectChain([SERIES_ROW]))
      .mockReturnValueOnce(selectChain(characterRows));
    mockGetPrimaryPortraitUrl.mockResolvedValue(null);

    await pipeline.generateRealStoryboard(owner, episode, false);

    const callArgs = mockGenerateStoryboardShotgrid.mock.calls[0][0];
    expect(callArgs.characters).toHaveLength(1);
    expect(callArgs.characters[0].variants).toBeUndefined();
  });
});
