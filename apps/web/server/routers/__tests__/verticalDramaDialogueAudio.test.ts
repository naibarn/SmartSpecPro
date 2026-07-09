/**
 * Vertical Drama Series — dialogue/audio router coverage for the W12-A voice
 * chain casting thread (`planDialogueAudio` loads the series' locked
 * character voice castings from the DB and passes them to the planner
 * service as `characterVoiceConfigs`, flag-gated on
 * `verticalDramaSeriesVoiceChain`).
 *
 * Same "mock the whole module graph, test the exported procedure handler
 * directly" convention as `verticalDramaSeries.setSeriesTargetAudienceRegion.test.ts`.
 * The planner SERVICE itself is mocked here (it has its own full DB-free
 * test suite in `server/services/__tests__/verticalDramaDialogueAudio.test.ts`)
 * — this file only asserts what `characterVoiceConfigs` the router passes in.
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

const { mockGetTenantFeatureFlags } = vi.hoisted(() => ({
  mockGetTenantFeatureFlags: vi.fn(),
}));
vi.mock("../../services/tenantFeatureFlagService", () => ({
  getTenantFeatureFlags: mockGetTenantFeatureFlags,
}));

// `verticalDramaDialogueAudio.ts`'s real-repair wiring (added for
// `verticalDramaEpisodePipeline.ts`'s `repairStage`) added a static import of
// `./verticalDramaStoryBible` — which transitively loads `enabledLlmModels.ts`
// -> `llmProviders.ts` -> `adminProcedure` from `_core/trpc`, an export this
// file's own minimal `_core/trpc` mock above does not provide (it exists only
// to satisfy THIS router's `protectedProcedure` usage). Mocked out here with
// plain stand-ins (none of this file's tests exercise LLM generation) so the
// `importActual` below never pulls in that real chain — mirrors
// `verticalDramaEpisodePipeline.*.test.ts`'s identical "mock the whole module
// graph" convention for the exact same transitive-import problem.
vi.mock("../../services/verticalDramaStoryBible", () => ({
  resolveStoryBibleModel: vi.fn(),
  executeJsonPlanningCallWithRetry: vi.fn(),
  InsufficientCreditsError: class extends Error {},
  VdSchemaValidationError: class extends Error {},
  VD_COMPACT_JSON_INSTRUCTION: "",
}));

const { mockPlanDialogueAudio, mockRepairAudio } = vi.hoisted(() => ({
  mockPlanDialogueAudio: vi.fn(),
  mockRepairAudio: vi.fn(),
}));
vi.mock("../../services/verticalDramaDialogueAudio", async () => {
  const actual = await vi.importActual<typeof import("../../services/verticalDramaDialogueAudio")>(
    "../../services/verticalDramaDialogueAudio",
  );
  return {
    ...actual,
    verticalDramaDialogueAudioService: {
      planDialogueAudio: mockPlanDialogueAudio,
      repairAudio: mockRepairAudio,
    },
  };
});

import { verticalDramaDialogueAudioRouter } from "../verticalDramaDialogueAudio";

const router = verticalDramaDialogueAudioRouter as unknown as Record<string, Function>;

function ctx(overrides: Partial<{ tenantId: string | null; user: { id: number } }> = {}) {
  return { tenantId: "tenant-1", user: { id: 42 }, userToken: null, publicUrl: undefined, ...overrides };
}

/** Thenable select-chain stub so `await db.select()....where(...)` resolves to `rows`. */
function selectChain(rows: unknown[]) {
  const chain: any = {
    from: vi.fn(() => chain),
    where: vi.fn(() => Promise.resolve(rows)),
    then: (resolve: any) => Promise.resolve(rows).then(resolve),
  };
  return chain;
}

function baseInput(over: Record<string, unknown> = {}) {
  return {
    seriesId: "10",
    episodeId: "20",
    language: "th",
    mode: "dialogue",
    beats: [],
    shots: [],
    ...over,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockPlanDialogueAudio.mockResolvedValue({ plan: {}, artifactId: "artifact-1", runId: "run-1", reviewMetadata: {} });
});

describe("planDialogueAudio — characterVoiceConfigs threading (W12-A)", () => {
  it("flag OFF: passes input through unchanged and never queries characters", async () => {
    mockGetTenantFeatureFlags.mockResolvedValue({ verticalDramaSeriesVoiceChain: false });

    const input = baseInput();
    await router.planDialogueAudio({ ctx: ctx(), input });

    expect(mockDb.select).not.toHaveBeenCalled();
    expect(mockPlanDialogueAudio).toHaveBeenCalledWith(
      { tenantId: "tenant-1", userId: 42 },
      input, // exact same object reference/shape — no characterVoiceConfigs added
    );
  });

  it("flag OFF (flags row missing entirely): still passes input through unchanged (fail-closed default)", async () => {
    mockGetTenantFeatureFlags.mockResolvedValue(undefined);

    const input = baseInput();
    await router.planDialogueAudio({ ctx: ctx(), input });

    expect(mockDb.select).not.toHaveBeenCalled();
    expect(mockPlanDialogueAudio).toHaveBeenCalledWith({ tenantId: "tenant-1", userId: 42 }, input);
  });

  it("flag ON: loads the series' cast characters and passes them as characterVoiceConfigs", async () => {
    mockGetTenantFeatureFlags.mockResolvedValue({ verticalDramaSeriesVoiceChain: true });
    mockDb.select.mockReturnValueOnce(
      selectChain([
        { id: 1, voiceConfig: { voiceModelId: "uvoice/tts-premium", voiceId: "th-porche" } },
        { id: 2, voiceConfig: { voiceModelId: "uvoice/tts-natural", voiceId: "th-nalinee" } },
      ]),
    );

    const input = baseInput();
    await router.planDialogueAudio({ ctx: ctx(), input });

    expect(mockPlanDialogueAudio).toHaveBeenCalledWith(
      { tenantId: "tenant-1", userId: 42 },
      expect.objectContaining({
        characterVoiceConfigs: [
          { characterId: "1", voiceModelId: "uvoice/tts-premium", voiceId: "th-porche" },
          { characterId: "2", voiceModelId: "uvoice/tts-natural", voiceId: "th-nalinee" },
        ],
      }),
    );
  });

  it("flag ON: a series with no cast characters yields an empty characterVoiceConfigs array (not undefined)", async () => {
    mockGetTenantFeatureFlags.mockResolvedValue({ verticalDramaSeriesVoiceChain: true });
    mockDb.select.mockReturnValueOnce(selectChain([]));

    const input = baseInput();
    await router.planDialogueAudio({ ctx: ctx(), input });

    expect(mockPlanDialogueAudio).toHaveBeenCalledWith(
      { tenantId: "tenant-1", userId: 42 },
      expect.objectContaining({ characterVoiceConfigs: [] }),
    );
  });

  it("flag ON: an invalid seriesId resolves to an empty array without querying the DB (service's own ownership check is the source of truth)", async () => {
    mockGetTenantFeatureFlags.mockResolvedValue({ verticalDramaSeriesVoiceChain: true });

    const input = baseInput({ seriesId: "not-a-number" });
    await router.planDialogueAudio({ ctx: ctx(), input });

    expect(mockDb.select).not.toHaveBeenCalled();
    expect(mockPlanDialogueAudio).toHaveBeenCalledWith(
      { tenantId: "tenant-1", userId: 42 },
      expect.objectContaining({ characterVoiceConfigs: [] }),
    );
  });

  it("scopes the character sweep to the caller's own tenant + user (never another owner's castings)", async () => {
    mockGetTenantFeatureFlags.mockResolvedValue({ verticalDramaSeriesVoiceChain: true });
    const whereSpy = vi.fn(() => Promise.resolve([]));
    mockDb.select.mockReturnValueOnce({
      from: vi.fn(() => ({ where: whereSpy })),
    });

    await router.planDialogueAudio({ ctx: ctx({ tenantId: "tenant-1", user: { id: 99 } }), input: baseInput() });

    expect(whereSpy).toHaveBeenCalled();
  });
});

describe("repairAudio — unaffected by W12-A (no characterVoiceConfigs threading)", () => {
  it("never reads tenant feature flags or the characters table", async () => {
    mockRepairAudio.mockResolvedValue({ plan: {}, artifactId: "a", runId: "r", reviewMetadata: {} });

    await router.repairAudio({
      ctx: ctx(),
      input: { seriesId: "10", episodeId: "20", repairId: "r1", resolution: { kind: "dismiss" } },
    });

    expect(mockGetTenantFeatureFlags).not.toHaveBeenCalled();
    expect(mockDb.select).not.toHaveBeenCalled();
  });
});
