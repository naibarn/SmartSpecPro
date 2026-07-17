/**
 * Vertical Drama Series — `createdCharacters` response field coverage
 * (`planning/vd-stuck-generation-and-lost-characters/plan.md`, Set B).
 *
 * `ensureRosterCharactersFromStory`'s return value (`VdRosterAutoRegisterSummary`,
 * including `createdCharacters`) used to be silently DISCARDED at both
 * `runGenerateStoryBibleDeepJob` and `runExtendStoryDraftHorizonJob` call
 * sites. This is a dedicated, isolated test file (rather than extending the
 * large shared `verticalDramaSeries.deepStoryDrafts.test.ts`, which never
 * mocks `verticalDramaCharacterRosterAutoRegister` and instead lets the real
 * call silently throw/no-op against the bare `mockDb` stub) so it can mock
 * that service directly and assert the summary actually reaches the
 * mutation's returned object, mirroring the pre-existing `createdLocationCount`
 * convention.
 *
 * Mock setup mirrors `verticalDramaSeries.deepStoryDrafts.test.ts` (same
 * `mockDb`/`_core/trpc`/`requireFeatureFlag` shape) — kept minimal to just
 * what `runGenerateStoryBibleDeepJob`/`runExtendStoryDraftHorizonJob` need.
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
  const proc: any = {
    use: () => proc,
    input: () => proc,
    mutation: () => vi.fn(),
    query: () => vi.fn(),
  };
  return {
    router: (routes: unknown) => routes,
    protectedProcedure: proc,
  };
});

vi.mock("../../middleware/requireFeatureFlag", () => ({
  requireFeatureFlag: () => (opts: unknown) => opts,
}));

vi.mock("../../services/enabledLlmModels", () => ({
  loadEnabledLlmModelRows: vi.fn(async () => []),
}));
vi.mock("../../services/intelligentModelSelector", () => ({
  selectBestLlmModel: vi.fn(() => null),
}));

const { mockHasEnoughCredits } = vi.hoisted(() => ({
  mockHasEnoughCredits: vi.fn(() => Promise.resolve(true)),
}));
vi.mock("../../services/creditService", () => ({
  hasEnoughCredits: mockHasEnoughCredits,
  deductCredits: vi.fn(),
  calculateCreditsForLLM: vi.fn(() => 0),
}));
vi.mock("../../services/llmRouter", () => ({
  executeWithFallback: vi.fn(),
}));

const { mockGetTenantFeatureFlags } = vi.hoisted(() => ({
  mockGetTenantFeatureFlags: vi.fn(),
}));
vi.mock("../../services/tenantFeatureFlagService", () => ({
  getTenantFeatureFlags: mockGetTenantFeatureFlags,
}));

const { mockGenerateStoryBibleDeep } = vi.hoisted(() => ({
  mockGenerateStoryBibleDeep: vi.fn(),
}));
vi.mock("../../services/verticalDramaStoryBible", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../services/verticalDramaStoryBible")>();
  return {
    ...actual,
    generateStoryBible: vi.fn(),
    generateStoryBibleDeep: mockGenerateStoryBibleDeep,
  };
});

const { mockRunVerticalDramaLedgerPlanning } = vi.hoisted(() => ({
  mockRunVerticalDramaLedgerPlanning: vi.fn(),
}));
vi.mock("../../services/verticalDramaLedgerPlanner", () => ({
  runVerticalDramaLedgerPlanning: mockRunVerticalDramaLedgerPlanning,
}));

vi.mock("../../services/verticalDramaArcReplan", () => ({
  applyApprovedArcReplan: vi.fn(),
}));

const { mockListEvents, mockAppendEvent } = vi.hoisted(() => ({
  mockListEvents: vi.fn(),
  mockAppendEvent: vi.fn(),
}));
vi.mock("../../services/verticalDramaSeriesMemory", () => ({
  verticalDramaSeriesMemoryService: {
    listEvents: mockListEvents,
    appendEvent: mockAppendEvent,
  },
}));

vi.mock("../../_core/logger", () => ({
  debugError: vi.fn(),
  debugLog: vi.fn(),
}));

vi.mock("../../services/verticalDramaStoryJobs", () => ({
  enqueueVerticalDramaStoryJob: vi.fn(),
  getVerticalDramaStoryJobStatus: vi.fn(),
  getActiveVerticalDramaStoryJob: vi.fn(),
  submitVerticalDramaSystemFeedback: vi.fn(),
}));

// The field under test — mocked directly (unlike the shared deep-story-drafts
// test file) so `createdCharacters` in each mutation's return object can be
// asserted precisely instead of always landing on the empty default via a
// silently-thrown/caught real DB call.
const { mockEnsureRosterCharactersFromStory } = vi.hoisted(() => ({
  mockEnsureRosterCharactersFromStory: vi.fn(),
}));
vi.mock("../../services/verticalDramaCharacterRosterAutoRegister", () => ({
  ensureRosterCharactersFromStory: mockEnsureRosterCharactersFromStory,
}));

vi.mock("../../services/verticalDramaLocationReconciliation", () => ({
  persistDeepDraftDeclaredLocations: vi.fn(),
}));

import { runGenerateStoryBibleDeepJob, runExtendStoryDraftHorizonJob } from "../verticalDramaSeries";
import type { VdDeepDraftShotDraft } from "../../services/verticalDramaStoryBible";

/** Thenable select-chain stub, mirrors `verticalDramaSeries.deepStoryDrafts.test.ts`. */
function selectChain(rows: unknown[]) {
  const chain: any = {
    from: vi.fn(() => chain),
    leftJoin: vi.fn(() => chain),
    where: vi.fn(() => chain),
    orderBy: vi.fn(() => chain),
    groupBy: vi.fn(() => Promise.resolve(rows)),
    limit: vi.fn(() => Promise.resolve(rows)),
    then: (resolve: any) => Promise.resolve(rows).then(resolve),
  };
  return chain;
}

function updateChain(rows: unknown[]) {
  const chain: any = {
    set: vi.fn(() => chain),
    where: vi.fn(() => chain),
    returning: vi.fn(() => Promise.resolve(rows)),
  };
  return chain;
}

const NINE_SHOTS: VdDeepDraftShotDraft[] = Array.from({ length: 9 }, (_, i) => ({
  shot_number: i + 1,
  summary: `Shot ${i + 1} summary`,
  dialogue_lines: [{ speaker: "Aria", line: `บทพูดช็อต ${i + 1}` }],
}));

const COMPLETENESS_OK = {
  dialogueEveryShot: true,
  allSpeakable: true,
  estimatedSpeechSeconds: 40,
  coverageStatus: "ok" as const,
};

function plannedItem(episodeNumber: number) {
  return {
    episodeNumber,
    workingTitle: `Ep${episodeNumber}`,
    logline: `Logline ${episodeNumber}`,
    keyBeats: [`Beat ${episodeNumber}`],
  };
}

function draftedResultItem(episodeNumber: number) {
  return {
    episodeNumber,
    shotDrafts: NINE_SHOTS,
    cliffhanger_line: `Cliff ${episodeNumber}`,
    draftCompleteness: COMPLETENESS_OK,
  };
}

const seriesRow = {
  id: 10,
  tenantId: "tenant-1",
  userId: 42,
  title: "Corporate Betrayal",
  locale: "th",
  genre: "romance",
  tone: "dramatic",
  targetEpisodeCount: 3,
  defaultEpisodeDurationSeconds: 60,
  bible: { episodeBreakdown: [plannedItem(1), plannedItem(2), plannedItem(3)] },
};

beforeEach(() => {
  vi.clearAllMocks();
  mockListEvents.mockResolvedValue([]);
  mockDb.insert.mockReturnValue({ values: vi.fn(() => Promise.resolve(undefined)) });
  mockGetTenantFeatureFlags.mockResolvedValue({});
  mockRunVerticalDramaLedgerPlanning.mockResolvedValue({
    ledgers: {
      evidenceLedger: [],
      characterActivationLedger: [],
      threatLadder: [],
      consequenceLedger: [],
      threadLedger: [],
      worldRuleLedger: [],
      causalChainMap: [],
    },
    creditsUsed: 0,
  });
  mockGenerateStoryBibleDeep.mockResolvedValue({
    draftedItems: [draftedResultItem(1), draftedResultItem(2)],
    chunkSizes: [2],
    partial: false,
    creditsUsed: 6,
    model: "test-model",
    warnings: [],
    finalOpenThreads: ["thread-x"],
  });
});

describe("runGenerateStoryBibleDeepJob — createdCharacters (Set B)", () => {
  it("captures ensureRosterCharactersFromStory's summary into { count, names } instead of discarding it", async () => {
    mockDb.select.mockReturnValueOnce(selectChain([seriesRow]));
    mockDb.update.mockReturnValueOnce(updateChain([{ ...seriesRow }]));
    mockEnsureRosterCharactersFromStory.mockResolvedValue({
      createdCharacters: [
        { characterKey: "narrator-1", name: "Narrator" },
        { characterKey: "shopkeeper-1", name: "Shopkeeper" },
      ],
    });

    const result: any = await runGenerateStoryBibleDeepJob(
      { tenantId: "tenant-1", userId: 42, seriesId: 10, horizonEpisodes: 2 },
      vi.fn(),
    );

    expect(mockEnsureRosterCharactersFromStory).toHaveBeenCalledTimes(1);
    expect(result.createdCharacters).toEqual({
      count: 2,
      names: ["Narrator", "Shopkeeper"],
    });
  });

  it("defaults to { count: 0, names: [] } when nothing was auto-registered this run", async () => {
    mockDb.select.mockReturnValueOnce(selectChain([seriesRow]));
    mockDb.update.mockReturnValueOnce(updateChain([{ ...seriesRow }]));
    mockEnsureRosterCharactersFromStory.mockResolvedValue({ createdCharacters: [] });

    const result: any = await runGenerateStoryBibleDeepJob(
      { tenantId: "tenant-1", userId: 42, seriesId: 10, horizonEpisodes: 2 },
      vi.fn(),
    );

    expect(result.createdCharacters).toEqual({ count: 0, names: [] });
  });

  it("defaults to { count: 0, names: [] } (never throws/omits the field) when ensureRosterCharactersFromStory rejects", async () => {
    mockDb.select.mockReturnValueOnce(selectChain([seriesRow]));
    mockDb.update.mockReturnValueOnce(updateChain([{ ...seriesRow }]));
    mockEnsureRosterCharactersFromStory.mockRejectedValue(new Error("db unavailable"));

    const result: any = await runGenerateStoryBibleDeepJob(
      { tenantId: "tenant-1", userId: 42, seriesId: 10, horizonEpisodes: 2 },
      vi.fn(),
    );

    expect(result.partial).toBe(false);
    expect(result.createdCharacters).toEqual({ count: 0, names: [] });
  });
});

describe("runExtendStoryDraftHorizonJob — createdCharacters (Set B)", () => {
  it("captures ensureRosterCharactersFromStory's summary into { count, names } instead of discarding it", async () => {
    mockDb.select.mockReturnValueOnce(selectChain([seriesRow]));
    mockDb.update.mockReturnValueOnce(updateChain([{ ...seriesRow }]));
    mockEnsureRosterCharactersFromStory.mockResolvedValue({
      createdCharacters: [{ characterKey: "detective-1", name: "Detective Somchai" }],
    });

    const result: any = await runExtendStoryDraftHorizonJob(
      { tenantId: "tenant-1", userId: 42, seriesId: 10 },
      vi.fn(),
    );

    expect(mockEnsureRosterCharactersFromStory).toHaveBeenCalledTimes(1);
    expect(result.createdCharacters).toEqual({
      count: 1,
      names: ["Detective Somchai"],
    });
  });

  it("defaults to { count: 0, names: [] } when nothing was auto-registered this run", async () => {
    mockDb.select.mockReturnValueOnce(selectChain([seriesRow]));
    mockDb.update.mockReturnValueOnce(updateChain([{ ...seriesRow }]));
    mockEnsureRosterCharactersFromStory.mockResolvedValue({ createdCharacters: [] });

    const result: any = await runExtendStoryDraftHorizonJob(
      { tenantId: "tenant-1", userId: 42, seriesId: 10 },
      vi.fn(),
    );

    expect(result.createdCharacters).toEqual({ count: 0, names: [] });
  });
});
