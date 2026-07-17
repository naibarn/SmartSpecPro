/**
 * Vertical Drama CHARACTER tab — `customInstruction` flow-through
 * (vertical-drama-character-custom-instruction plan): a free-text framing/
 * pose/crop/mood hint typed by the user (e.g. "half-body shot,
 * front-facing") reaches the planner as a raw fact. The Visual Bible Skill
 * owns the wording; the router must not append a second prompt block.
 *
 * Covers both mutations that accept `customInstruction`:
 *  - `previewCharacterPrompt` — the PRIMARY path this field works through,
 *    since the UI always calls preview before confirm.
 *  - `generateCharacterImage` — forwards the same fact on fallback and keeps
 *    an already-approved prompt byte-for-byte.
 *
 * Same "mock the whole module graph, invoke the exported procedure handler
 * directly" convention as `verticalDramaCharacters.manualVariantTwinCrud.test.ts`
 * / `verticalDramaCharacters.voiceChain.test.ts`.
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

const {
  mockGetPrimaryPortraitUrl,
  mockCreatePortraitCandidateDraftBatch,
  mockGetPortraitCandidateTaskInfo,
  mockAttachGeneratedPortraitCandidate,
  mockGetPortraitCandidateBatchCount,
  mockClaimPortraitCandidateBatch,
  mockRecordPortraitCandidateTask,
  mockMarkPortraitCandidateSubmissionFailed,
} = vi.hoisted(() => ({
  mockGetPrimaryPortraitUrl: vi.fn(),
  mockCreatePortraitCandidateDraftBatch: vi.fn(),
  mockGetPortraitCandidateTaskInfo: vi.fn(),
  mockAttachGeneratedPortraitCandidate: vi.fn(),
  mockGetPortraitCandidateBatchCount: vi.fn(),
  mockClaimPortraitCandidateBatch: vi.fn(),
  mockRecordPortraitCandidateTask: vi.fn(),
  mockMarkPortraitCandidateSubmissionFailed: vi.fn(),
}));
// Set A gap 7 (2026-07-16): the real classified message text, duplicated
// here (not imported) because this whole module is mocked below — kept in
// sync manually with `VD_PORTRAIT_CANDIDATE_POLICY_REJECTED_MESSAGE` in
// `../../services/verticalDramaCharacterStock`. `vi.hoisted` (not a plain
// `const`) because `vi.mock` factories below are hoisted above module-scope
// declarations.
const { MOCK_VD_PORTRAIT_CANDIDATE_POLICY_REJECTED_MESSAGE } = vi.hoisted(() => ({
  MOCK_VD_PORTRAIT_CANDIDATE_POLICY_REJECTED_MESSAGE:
    "ภาพถูกปฏิเสธเนื่องจากติดนโยบายเนื้อหาของผู้ให้บริการ กรุณาลองสร้างใหม่อีกครั้ง " +
    "หรือปรับลักษณะตัวละครก่อนสร้างซ้ำ",
}));
vi.mock("../../services/verticalDramaCharacterStock", () => ({
  verticalDramaCharacterStockService: {
    getPrimaryPortraitUrl: mockGetPrimaryPortraitUrl,
    getReferenceImageUrlByAssetLinkId: vi.fn(),
    createPortraitCandidateDraftBatch: mockCreatePortraitCandidateDraftBatch,
    getPortraitCandidateTaskInfo: mockGetPortraitCandidateTaskInfo,
    attachGeneratedPortraitCandidate: mockAttachGeneratedPortraitCandidate,
    getPortraitCandidateBatchCount: mockGetPortraitCandidateBatchCount,
    claimPortraitCandidateBatch: mockClaimPortraitCandidateBatch,
    recordPortraitCandidateTask: mockRecordPortraitCandidateTask,
    markPortraitCandidateSubmissionFailed: mockMarkPortraitCandidateSubmissionFailed,
  },
  VerticalDramaCharacterStockError: class extends Error {
    constructor(
      public readonly reason: string,
      message: string,
    ) {
      super(message);
    }
  },
  VD_PORTRAIT_CANDIDATE_POLICY_REJECTED_MESSAGE: MOCK_VD_PORTRAIT_CANDIDATE_POLICY_REJECTED_MESSAGE,
}));

const { mockGenerateImageAsync, mockGetMediaTask } = vi.hoisted(() => ({
  mockGenerateImageAsync: vi.fn(),
  mockGetMediaTask: vi.fn(),
}));
vi.mock("../../services/mediaGenerationService", () => ({
  mediaGenerationService: {
    generateImageAsync: mockGenerateImageAsync,
    getTask: mockGetMediaTask,
  },
  DEFAULT_MODELS: { image: "google-nano-banana-pro" },
}));

vi.mock("../../services/pricingCalculator", () => ({
  calculateCreditCost: vi.fn(() => 5),
}));

const { mockHasEnoughCredits, mockDeductCredits, mockRefundCredits } = vi.hoisted(() => ({
  mockHasEnoughCredits: vi.fn(),
  mockDeductCredits: vi.fn(),
  mockRefundCredits: vi.fn(),
}));
vi.mock("../../services/creditService", () => ({
  hasEnoughCredits: mockHasEnoughCredits,
  deductCredits: mockDeductCredits,
  refundCredits: mockRefundCredits,
}));

vi.mock("../../_core/tokens", () => ({
  signBearerToken: vi.fn(() => "token"),
}));

const {
  mockGenerateCharacterVisualPrompts,
  mockGenerateCharacterPortraitCandidates,
  mockResolveFaceSourceReferenceForCharacter,
} = vi.hoisted(() => ({
  mockGenerateCharacterVisualPrompts: vi.fn(),
  mockGenerateCharacterPortraitCandidates: vi.fn(),
  mockResolveFaceSourceReferenceForCharacter: vi.fn(async () => null),
}));
vi.mock("../../services/verticalDramaCharacterImageGeneration", () => ({
  generateCharacterVisualPrompts: mockGenerateCharacterVisualPrompts,
  generateCharacterPortraitCandidates: mockGenerateCharacterPortraitCandidates,
  InsufficientCreditsError: class extends Error {},
  VdSchemaValidationError: class extends Error {},
  readPresetVisualIdentityFromBible: vi.fn(() => undefined),
  resolveFaceSourceReferenceForCharacter: mockResolveFaceSourceReferenceForCharacter,
}));

const { mockLoadCharacterDesignContext, mockPersistCharacterVisualBible } = vi.hoisted(() => ({
  mockLoadCharacterDesignContext: vi.fn(async () => ({
    seriesDna: {},
    currentCast: [],
    recentLeadArchive: [],
  })),
  mockPersistCharacterVisualBible: vi.fn(async () => undefined),
}));
vi.mock("../../services/verticalDramaCharacterDesignContext", () => ({
  loadCharacterDesignContext: mockLoadCharacterDesignContext,
}));

vi.mock("../../services/verticalDramaCharacterDnaPersistence", () => ({
  persistCharacterVisualBible: mockPersistCharacterVisualBible,
}));

vi.mock("../../services/rateLimiter", () => ({
  mediaGenerationLimiter: { isAllowed: vi.fn(() => true), getResetTime: vi.fn(() => 0) },
}));

const { mockCreateAssetFromAttachment } = vi.hoisted(() => ({
  mockCreateAssetFromAttachment: vi.fn(),
}));
vi.mock("../../services/mediaAssetService", () => ({
  createAssetFromAttachment: mockCreateAssetFromAttachment,
}));

vi.mock("../../services/modelRegistry", () => ({
  getModelsByTypeAsync: vi.fn(async () => []),
}));

vi.mock("../../services/mediaTransportResolver", () => ({
  resolveMediaTransport: vi.fn(),
}));

// `settlePortraitCandidate`'s failed branch lazy-`import()`s `./media` (not a
// static top-level import — see that file's own doc comment on why) purely
// to call `reconcileTaskCredits`; mocked here so the failed-branch tests
// below don't load the real (heavy, adminProcedure-carrying) media router.
const { mockReconcileTaskCredits } = vi.hoisted(() => ({
  mockReconcileTaskCredits: vi.fn().mockResolvedValue({ adjusted: true, difference: -5, action: "refund" }),
}));
vi.mock("../media", () => ({
  reconcileTaskCredits: mockReconcileTaskCredits,
}));

import { verticalDramaCharactersRouter } from "../verticalDramaCharacters";

const router = verticalDramaCharactersRouter as unknown as Record<string, Function>;

function ctx(overrides: Partial<{ tenantId: string | null; user: { id: number } }> = {}) {
  return { tenantId: "tenant-1", user: { id: 42 }, userToken: "session-token", publicUrl: undefined, ...overrides };
}

/** Thenable select-chain stub — resolves at ANY point in the chain (`.where()`,
 *  `.limit()`, or awaited directly), same convention as
 *  `verticalDramaCharacters.manualVariantTwinCrud.test.ts`. */
function selectChain(rows: unknown[]) {
  const chain: any = {
    from: vi.fn(() => chain),
    where: vi.fn(() => chain),
    limit: vi.fn(() => Promise.resolve(rows)),
    then: (resolve: any) => Promise.resolve(rows).then(resolve),
  };
  return chain;
}

const SERIES_ROW = { id: 10 };
const SERIES_CONTEXT_ROW = {
  id: 10,
  title: "Sisters of the Silk Market",
  genre: "family drama",
  tone: "warm",
  bible: null,
  updatedAt: new Date("2026-07-13T00:00:00.000Z"),
};
const CHARACTER_ROW = {
  id: 1,
  tenantId: "tenant-1",
  userId: 42,
  seriesId: 10,
  characterKey: "fai",
  name: "ฝ้าย",
  role: "lead",
  data: null,
  voiceConfig: null,
  parentCharacterId: null,
  variantLabel: null,
  variantType: null,
  sharesFaceWithCharacterId: null,
  createdAt: new Date("2026-07-01T00:00:00.000Z"),
  updatedAt: new Date("2026-07-01T00:00:00.000Z"),
};

function visualPromptResult(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    portraitPrompt: "a portrait prompt",
    negativePrompt: "a negative prompt",
    turnaroundPrompt: "a turnaround prompt",
    fullBodyPrompt: "a full body prompt",
    expressionSheetPrompt: "an expression sheet prompt",
    outfitSheetPrompt: "an outfit sheet prompt",
    raw: { visual_bible_summary: {} },
    creditsUsed: 4,
    model: "gpt-4o-mini",
    visualBibleSnapshot: {
      version: 1,
      createdAt: "2026-07-13T00:00:00.000Z",
      model: "gpt-4o-mini",
      visualIdentitySummary: "story-grounded lead",
    },
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockGetTenantFeatureFlags.mockResolvedValue({ verticalDramaSeriesPresetMixV2: false });
  mockResolveFaceSourceReferenceForCharacter.mockResolvedValue(null);
  mockGetPrimaryPortraitUrl.mockResolvedValue(null);
  mockHasEnoughCredits.mockResolvedValue(true);
  mockDeductCredits.mockResolvedValue(undefined);
  mockGenerateImageAsync.mockResolvedValue({ id: "task-1" });
  mockGenerateCharacterVisualPrompts.mockResolvedValue(visualPromptResult());
  mockGenerateCharacterPortraitCandidates.mockResolvedValue({
    sharedVisualLanguage: "premium vertical drama",
    model: "gpt-4o-mini",
    creditsUsed: 8,
    raw: {},
    candidates: [
      {
        candidateId: "candidate-1",
        portraitPrompt: "portrait one",
        negativePrompt: "catalog model",
        visualIdentitySummary: "identity one",
        visualBibleSnapshot: { version: 1, private: "dna-one" },
      },
      {
        candidateId: "candidate-2",
        portraitPrompt: "portrait two",
        negativePrompt: "catalog model",
        visualIdentitySummary: "identity two",
        visualBibleSnapshot: { version: 1, private: "dna-two" },
      },
    ],
  });
  mockCreatePortraitCandidateDraftBatch.mockResolvedValue({
    batchId: "6cc9da31-8a44-4742-b9c9-0dc6558db621",
    candidates: [
      { assetLinkId: 71, candidateId: "candidate-1", index: 0 },
      { assetLinkId: 72, candidateId: "candidate-2", index: 1 },
    ],
  });
  mockGetPortraitCandidateBatchCount.mockResolvedValue(1);
  mockClaimPortraitCandidateBatch.mockResolvedValue([
    {
      assetLinkId: 71,
      candidateId: "candidate-1",
      index: 0,
      portraitPrompt: "portrait one",
      negativePrompt: "catalog model",
    },
  ]);
  mockRecordPortraitCandidateTask.mockResolvedValue(undefined);
  mockGetPortraitCandidateTaskInfo.mockResolvedValue({
    batchId: "6cc9da31-8a44-4742-b9c9-0dc6558db621",
    candidateId: "candidate-1",
    index: 0,
    count: 2,
    status: "completed",
    taskId: "task-candidate-1",
    characterId: 1,
    mediaAssetId: 501,
    imageUrl: "https://cdn.example.test/candidate-1.jpg",
  });
  mockLoadCharacterDesignContext.mockResolvedValue({
    seriesDna: {},
    currentCast: [],
    recentLeadArchive: [],
  });
  mockPersistCharacterVisualBible.mockResolvedValue(undefined);
});

describe("generatePortraitCandidateBatch — legacy DNA compatibility", () => {
  it("submits an already-previewed candidate when legacy DNA exists but no primary portrait does", async () => {
    mockDb.select
      .mockReturnValueOnce(selectChain([SERIES_ROW]))
      .mockReturnValueOnce(
        selectChain([{ ...CHARACTER_ROW, data: { visualBible: { version: 1 } } }]),
      )
      .mockReturnValueOnce(selectChain([{ creditCost: 5, configJson: null }]));

    const result = await router.generatePortraitCandidateBatch({
      ctx: ctx(),
      input: {
        seriesId: "10",
        characterId: "1",
        batchId: "6cc9da31-8a44-4742-b9c9-0dc6558db621",
      },
    });

    expect(result.candidates).toEqual([
      expect.objectContaining({ candidateId: "candidate-1", status: "queued" }),
    ]);
    expect(mockGenerateImageAsync).toHaveBeenCalledTimes(1);
  });
});

/* -------------------------------------------------------------------------- */
/* previewCharacterPrompt — the PRIMARY path this field works through          */
/* -------------------------------------------------------------------------- */

describe("previewCharacterPrompt — customInstruction flow-through", () => {
  it("threads customInstruction into generateCharacterVisualPrompts when supplied", async () => {
    mockDb.select
      .mockReturnValueOnce(selectChain([SERIES_ROW])) // loadOwnedSeries
      .mockReturnValueOnce(selectChain([CHARACTER_ROW])) // loadOwnedCharacter
      .mockReturnValueOnce(selectChain([SERIES_CONTEXT_ROW])); // series title/genre/tone/bible

    const customInstruction = "ภาพเต็มตัว บรรยากาศแสงแดดยามเช้า ห้องสว่าง";
    const result = await router.previewCharacterPrompt({
      ctx: ctx(),
      input: { seriesId: "10", characterId: "1", customInstruction },
    });

    expect(mockGenerateCharacterVisualPrompts).toHaveBeenCalledWith(
      expect.objectContaining({
        customInstruction,
        characterDesignContext: expect.any(Object),
      }),
    );
    expect(mockLoadCharacterDesignContext).toHaveBeenCalledWith(
      { tenantId: "tenant-1", userId: 42 },
      SERIES_CONTEXT_ROW,
      CHARACTER_ROW,
    );
    expect(result.portraitPrompt).toBe("a portrait prompt");
    expect(result.portraitPrompt).not.toContain("VD_CHARACTER_CUSTOM_REQUIREMENTS");
    expect(result.approvedDesignSnapshot).toMatchObject({
      characterKey: "fai",
      portraitPrompt: result.portraitPrompt,
    });
    expect(mockPersistCharacterVisualBible).not.toHaveBeenCalled();
  });

  it("passes customInstruction as undefined when not supplied (legacy tolerant, no crash)", async () => {
    mockDb.select
      .mockReturnValueOnce(selectChain([SERIES_ROW]))
      .mockReturnValueOnce(selectChain([CHARACTER_ROW]))
      .mockReturnValueOnce(selectChain([SERIES_CONTEXT_ROW]));

    await router.previewCharacterPrompt({
      ctx: ctx(),
      input: { seriesId: "10", characterId: "1" },
    });

    expect(mockGenerateCharacterVisualPrompts).toHaveBeenCalledWith(
      expect.objectContaining({ customInstruction: undefined }),
    );
  });

  it("returns a browser-safe first-portrait batch while persisting private DNA server-side", async () => {
    const legacyApprovedDesignDna = { version: 1, faceIdentity: { hair: "legacy bob" } };
    mockLoadCharacterDesignContext.mockResolvedValueOnce({
      seriesDna: {},
      currentCast: [],
      recentLeadArchive: [],
      approvedDesignDna: legacyApprovedDesignDna,
    } as any);
    mockDb.select
      .mockReturnValueOnce(selectChain([SERIES_ROW]))
      .mockReturnValueOnce(selectChain([CHARACTER_ROW]))
      .mockReturnValueOnce(selectChain([SERIES_CONTEXT_ROW]));

    const result = await router.previewCharacterPrompt({
      ctx: ctx(),
      input: {
        seriesId: "10",
        characterId: "1",
        portraitCandidateCount: 2,
        customInstruction: "warm morning light",
      },
    });

    expect(mockGenerateCharacterPortraitCandidates).toHaveBeenCalledWith(
      expect.objectContaining({
        portraitCandidateCount: 2,
        customInstruction: "warm morning light",
        allowLegacyApprovedDesignDnaReplacement: true,
      }),
    );
    expect(mockCreatePortraitCandidateDraftBatch).toHaveBeenCalledWith(
      expect.objectContaining({
        candidates: expect.arrayContaining([
          expect.objectContaining({
            candidateId: "candidate-1",
            visualBibleSnapshot: expect.objectContaining({ private: "dna-one" }),
          }),
        ]),
      }),
    );
    expect(result).toMatchObject({
      mode: "candidate_batch",
      candidateCount: 2,
      candidates: [
        expect.objectContaining({ assetLinkId: "71", portraitPrompt: "portrait one" }),
        expect.objectContaining({ assetLinkId: "72", portraitPrompt: "portrait two" }),
      ],
    });
    expect(JSON.stringify(result)).not.toContain("dna-one");
    expect(mockGenerateCharacterVisualPrompts).not.toHaveBeenCalled();
  });
});

describe("settlePortraitCandidate — idempotent completed candidate", () => {
  it("returns the durable image without polling or creating a duplicate media asset", async () => {
    mockDb.select.mockReturnValueOnce(selectChain([SERIES_ROW]));

    const result = await router.settlePortraitCandidate({
      ctx: ctx(),
      input: { seriesId: "10", assetLinkId: "71", taskId: "task-candidate-1" },
    });

    expect(result).toEqual({
      assetLinkId: "71",
      taskId: "task-candidate-1",
      status: "completed",
      imageUrl: "https://cdn.example.test/candidate-1.jpg",
    });
    expect(mockGetMediaTask).not.toHaveBeenCalled();
    expect(mockCreateAssetFromAttachment).not.toHaveBeenCalled();
    expect(mockAttachGeneratedPortraitCandidate).not.toHaveBeenCalled();
  });

  it("rejects a browser-supplied recovery task whose durable provenance does not match", async () => {
    mockDb.select.mockReturnValueOnce(selectChain([SERIES_ROW]));
    mockGetPortraitCandidateTaskInfo.mockResolvedValueOnce({
      batchId: "6cc9da31-8a44-4742-b9c9-0dc6558db621",
      candidateId: "candidate-1",
      index: 0,
      count: 2,
      status: "submitting",
      characterId: 1,
      mediaAssetId: null,
      imageUrl: null,
    });
    mockGetMediaTask.mockResolvedValueOnce({
      id: "task-from-another-flow",
      mediaType: "image",
      status: "completed",
      model: "gpt-image-2",
      parameters: {
        extra_params: {
          __vd_portrait_candidate_asset_link_id: "999",
        },
      },
      resultUrl: "https://cdn.example.test/wrong.jpg",
    });

    await expect(
      router.settlePortraitCandidate({
        ctx: ctx(),
        input: {
          seriesId: "10",
          assetLinkId: "71",
          taskId: "task-from-another-flow",
        },
      }),
    ).rejects.toMatchObject({
      code: "BAD_REQUEST",
      message: "Task provenance does not match this portrait candidate.",
    });
    expect(mockCreateAssetFromAttachment).not.toHaveBeenCalled();
    expect(mockAttachGeneratedPortraitCandidate).not.toHaveBeenCalled();
  });
});

/**
 * Set A gap 7 (server half, 2026-07-16): the failed branch classifies
 * `errorMessage` via `isCharacterLockPolicyFailureMessage` in its immediate
 * (synchronous) response, mirroring what
 * `markPortraitCandidateSubmissionFailed` persists durably — so the client
 * doesn't need a manifest refetch to show a clear policy message. The raw
 * `task.errorMessage` is still what gets passed to
 * `markPortraitCandidateSubmissionFailed` (classification is centralized
 * there, not duplicated at the call site).
 */
describe("settlePortraitCandidate — failed branch (Set A gap 7 policy classification)", () => {
  beforeEach(() => {
    mockGetPortraitCandidateTaskInfo.mockResolvedValue({
      batchId: "6cc9da31-8a44-4742-b9c9-0dc6558db621",
      candidateId: "candidate-1",
      index: 0,
      count: 2,
      status: "queued",
      taskId: "task-candidate-1",
      characterId: 1,
      mediaAssetId: null,
      imageUrl: null,
    });
  });

  it("passes through a generic (non-policy) provider failure unclassified", async () => {
    mockDb.select.mockReturnValueOnce(selectChain([SERIES_ROW]));
    mockGetMediaTask.mockResolvedValueOnce({
      id: "task-candidate-1",
      mediaType: "image",
      status: "failed",
      model: "gpt-image-2",
      parameters: {},
      errorMessage: "Provider timed out after 30 minutes",
    });

    const result = await router.settlePortraitCandidate({
      ctx: ctx(),
      input: { seriesId: "10", assetLinkId: "71", taskId: "task-candidate-1" },
    });

    expect(result).toEqual({
      assetLinkId: "71",
      taskId: "task-candidate-1",
      status: "failed",
      errorMessage: "Provider timed out after 30 minutes",
      policyRejected: false,
    });
    expect(mockMarkPortraitCandidateSubmissionFailed).toHaveBeenCalledWith(
      expect.objectContaining({
        assetLinkId: 71,
        errorMessage: "Provider timed out after 30 minutes",
      }),
    );
    expect(mockReconcileTaskCredits).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 42 }),
    );
  });

  it("classifies a content-policy provider failure into the clear Thai message", async () => {
    mockDb.select.mockReturnValueOnce(selectChain([SERIES_ROW]));
    mockGetMediaTask.mockResolvedValueOnce({
      id: "task-candidate-1",
      mediaType: "image",
      status: "failed",
      model: "gpt-image-2",
      parameters: {},
      errorMessage: "Image blocked: content policy violation detected",
    });

    const result = await router.settlePortraitCandidate({
      ctx: ctx(),
      input: { seriesId: "10", assetLinkId: "71", taskId: "task-candidate-1" },
    });

    expect(result).toEqual({
      assetLinkId: "71",
      taskId: "task-candidate-1",
      status: "failed",
      errorMessage: MOCK_VD_PORTRAIT_CANDIDATE_POLICY_REJECTED_MESSAGE,
      policyRejected: true,
    });
    // The RAW provider text (not the classified one) is what's forwarded for
    // durable persistence — classification happens once, inside
    // `markPortraitCandidateSubmissionFailed` itself.
    expect(mockMarkPortraitCandidateSubmissionFailed).toHaveBeenCalledWith(
      expect.objectContaining({
        assetLinkId: 71,
        errorMessage: "Image blocked: content policy violation detected",
      }),
    );
  });
});

/* -------------------------------------------------------------------------- */
/* generateCharacterImage — fallback path only (no approvedPrompt)            */
/* -------------------------------------------------------------------------- */

describe("generateCharacterImage — customInstruction flow-through (no-approvedPrompt fallback path)", () => {
  it("threads customInstruction into generateCharacterVisualPrompts when supplied and approvedPrompt is absent", async () => {
    mockDb.select
      .mockReturnValueOnce(selectChain([SERIES_ROW])) // loadOwnedSeries
      .mockReturnValueOnce(selectChain([CHARACTER_ROW])) // loadOwnedCharacter
      .mockReturnValueOnce(selectChain([SERIES_CONTEXT_ROW])) // series title/genre/tone/bible
      .mockReturnValueOnce(selectChain([{ creditCost: 5, configJson: null }])); // mediaModels pricing row

    const customInstruction = "ภาพเต็มตัว บรรยากาศแสงแดดยามเช้า ห้องสว่าง";
    await router.generateCharacterImage({
      ctx: ctx(),
      input: { seriesId: "10", characterId: "1", customInstruction },
    });

    expect(mockGenerateCharacterVisualPrompts).toHaveBeenCalledWith(
      expect.objectContaining({ customInstruction }),
    );
    const submittedPrompt = mockGenerateImageAsync.mock.calls[0][0].prompt as string;
    expect(submittedPrompt).toContain("a portrait prompt");
    expect(submittedPrompt).not.toContain("VD_CHARACTER_CUSTOM_REQUIREMENTS");
  });

  it("passes customInstruction as undefined when not supplied (legacy tolerant, no crash)", async () => {
    mockDb.select
      .mockReturnValueOnce(selectChain([SERIES_ROW]))
      .mockReturnValueOnce(selectChain([CHARACTER_ROW]))
      .mockReturnValueOnce(selectChain([SERIES_CONTEXT_ROW]))
      .mockReturnValueOnce(selectChain([{ creditCost: 5, configJson: null }]));

    await router.generateCharacterImage({
      ctx: ctx(),
      input: { seriesId: "10", characterId: "1" },
    });

    expect(mockGenerateCharacterVisualPrompts).toHaveBeenCalledWith(
      expect.objectContaining({ customInstruction: undefined }),
    );
    expect(mockGenerateImageAsync.mock.calls[0][0].prompt).toBe("a portrait prompt");
  });

  it("keeps an approved prompt byte-for-byte without rerunning the planner", async () => {
    mockDb.select
      .mockReturnValueOnce(selectChain([SERIES_ROW]))
      .mockReturnValueOnce(selectChain([CHARACTER_ROW]))
      .mockReturnValueOnce(selectChain([SERIES_CONTEXT_ROW]))
      .mockReturnValueOnce(selectChain([{ creditCost: 5, configJson: null }]));

    await router.generateCharacterImage({
      ctx: ctx(),
      input: {
        seriesId: "10",
        characterId: "1",
        approvedPrompt: "already-approved prompt text",
        customInstruction: "full-body, wider shot",
      },
    });

    expect(mockGenerateCharacterVisualPrompts).not.toHaveBeenCalled();
    expect(mockPersistCharacterVisualBible).not.toHaveBeenCalled();
    const submittedPrompt = mockGenerateImageAsync.mock.calls[0][0].prompt as string;
    expect(submittedPrompt).toContain("already-approved prompt text");
    expect(submittedPrompt).not.toContain("full-body, wider shot");
  });

  it("does not mutate an already-approved prompt or append a requirement block", async () => {
    mockDb.select
      .mockReturnValueOnce(selectChain([SERIES_ROW]))
      .mockReturnValueOnce(selectChain([CHARACTER_ROW]))
      .mockReturnValueOnce(selectChain([SERIES_CONTEXT_ROW]))
      .mockReturnValueOnce(selectChain([{ creditCost: 5, configJson: null }]));
    const approvedPrompt = "approved portrait";

    await router.generateCharacterImage({
      ctx: ctx(),
      input: {
        seriesId: "10",
        characterId: "1",
        approvedPrompt,
        customInstruction: "full-body in morning light",
      },
    });

    const submittedPrompt = mockGenerateImageAsync.mock.calls[0][0].prompt as string;
    expect(submittedPrompt).toBe(approvedPrompt);
    expect(submittedPrompt).not.toContain("VD_CHARACTER_CUSTOM_REQUIREMENTS");
  });

  it("persists generated DNA only after the media task is submitted", async () => {
    mockDb.select
      .mockReturnValueOnce(selectChain([SERIES_ROW]))
      .mockReturnValueOnce(selectChain([CHARACTER_ROW]))
      .mockReturnValueOnce(selectChain([SERIES_CONTEXT_ROW]))
      .mockReturnValueOnce(selectChain([{ creditCost: 5, configJson: null }]));

    const result = await router.generateCharacterImage({
      ctx: ctx(),
      input: { seriesId: "10", characterId: "1" },
    });

    expect(mockPersistCharacterVisualBible).toHaveBeenCalledWith(
      { tenantId: "tenant-1", userId: 42, seriesId: 10 },
      1,
      expect.objectContaining({ visualIdentitySummary: "story-grounded lead" }),
    );
    expect(mockGenerateImageAsync.mock.invocationCallOrder[0]).toBeLessThan(
      mockPersistCharacterVisualBible.mock.invocationCallOrder[0],
    );
    expect(result.dnaPersistenceStatus).toBe("persisted");
  });

  it("persists an unedited matching preview snapshot without rerunning the LLM", async () => {
    mockDb.select
      .mockReturnValueOnce(selectChain([SERIES_ROW]))
      .mockReturnValueOnce(selectChain([CHARACTER_ROW]))
      .mockReturnValueOnce(selectChain([SERIES_CONTEXT_ROW]))
      .mockReturnValueOnce(selectChain([{ creditCost: 5, configJson: null }]));
    const visualBible = { visualIdentitySummary: "previewed design" };

    const result = await router.generateCharacterImage({
      ctx: ctx(),
      input: {
        seriesId: "10",
        characterId: "1",
        approvedPrompt: "approved portrait",
        approvedDesignSnapshot: {
          characterKey: "fai",
          portraitPrompt: "approved portrait",
          visualBible,
        },
      },
    });

    expect(mockGenerateCharacterVisualPrompts).not.toHaveBeenCalled();
    expect(mockPersistCharacterVisualBible).toHaveBeenCalledWith(
      { tenantId: "tenant-1", userId: 42, seriesId: 10 },
      1,
      visualBible,
    );
    expect(result.dnaPersistenceStatus).toBe("persisted");
  });

  it("renders an edited approved prompt but does not persist the preview DNA", async () => {
    mockDb.select
      .mockReturnValueOnce(selectChain([SERIES_ROW]))
      .mockReturnValueOnce(selectChain([CHARACTER_ROW]))
      .mockReturnValueOnce(selectChain([SERIES_CONTEXT_ROW]))
      .mockReturnValueOnce(selectChain([{ creditCost: 5, configJson: null }]));

    const result = await router.generateCharacterImage({
      ctx: ctx(),
      input: {
        seriesId: "10",
        characterId: "1",
        approvedPrompt: "edited portrait",
        approvedDesignSnapshot: {
          characterKey: "fai",
          portraitPrompt: "original portrait",
          visualBible: { visualIdentitySummary: "previewed design" },
        },
      },
    });

    expect(mockGenerateImageAsync).toHaveBeenCalledTimes(1);
    expect(mockPersistCharacterVisualBible).not.toHaveBeenCalled();
    expect(result.dnaPersistenceWarning).toMatch(/edited after preview/i);
  });

  it("rejects a snapshot correlated to another character before media submission", async () => {
    mockDb.select
      .mockReturnValueOnce(selectChain([SERIES_ROW]))
      .mockReturnValueOnce(selectChain([CHARACTER_ROW]));

    await expect(
      router.generateCharacterImage({
        ctx: ctx(),
        input: {
          seriesId: "10",
          characterId: "1",
          approvedPrompt: "approved portrait",
          approvedDesignSnapshot: {
            characterKey: "another-character",
            portraitPrompt: "approved portrait",
            visualBible: { visualIdentitySummary: "wrong character" },
          },
        },
      }),
    ).rejects.toThrow(/another character/i);

    expect(mockGenerateImageAsync).not.toHaveBeenCalled();
    expect(mockPersistCharacterVisualBible).not.toHaveBeenCalled();
  });

  it("returns a non-fatal warning when persistence fails after task submission", async () => {
    mockDb.select
      .mockReturnValueOnce(selectChain([SERIES_ROW]))
      .mockReturnValueOnce(selectChain([CHARACTER_ROW]))
      .mockReturnValueOnce(selectChain([SERIES_CONTEXT_ROW]))
      .mockReturnValueOnce(selectChain([{ creditCost: 5, configJson: null }]));
    mockPersistCharacterVisualBible.mockRejectedValueOnce(new Error("database unavailable"));

    const result = await router.generateCharacterImage({
      ctx: ctx(),
      input: { seriesId: "10", characterId: "1" },
    });

    expect(result.taskId).toBe("task-1");
    expect(result.dnaPersistenceStatus).toBe("failed");
    expect(result.dnaPersistenceWarning).toMatch(/not resubmitted/i);
    expect(mockGenerateImageAsync).toHaveBeenCalledTimes(1);
  });

  it("does not persist when media submission fails", async () => {
    mockDb.select
      .mockReturnValueOnce(selectChain([SERIES_ROW]))
      .mockReturnValueOnce(selectChain([CHARACTER_ROW]))
      .mockReturnValueOnce(selectChain([SERIES_CONTEXT_ROW]))
      .mockReturnValueOnce(selectChain([{ creditCost: 5, configJson: null }]));
    mockGenerateImageAsync.mockRejectedValueOnce(new Error("submit failed"));

    await expect(
      router.generateCharacterImage({
        ctx: ctx(),
        input: { seriesId: "10", characterId: "1" },
      }),
    ).rejects.toThrow(/submit failed/i);

    expect(mockPersistCharacterVisualBible).not.toHaveBeenCalled();
  });
});

describe("generateCharacterSheet — Character DNA persistence", () => {
  it("loads design context and persists the just-generated DNA after sheet submission", async () => {
    mockDb.select
      .mockReturnValueOnce(selectChain([SERIES_ROW]))
      .mockReturnValueOnce(selectChain([CHARACTER_ROW]))
      .mockReturnValueOnce(selectChain([SERIES_CONTEXT_ROW]))
      .mockReturnValueOnce(selectChain([{ creditCost: 5, configJson: null }]));

    const result = await router.generateCharacterSheet({
      ctx: ctx(),
      input: { seriesId: "10", characterId: "1", sheetType: "auto" },
    });

    expect(mockGenerateCharacterVisualPrompts).toHaveBeenCalledWith(
      expect.objectContaining({ characterDesignContext: expect.any(Object) }),
    );
    expect(mockPersistCharacterVisualBible).toHaveBeenCalledTimes(1);
    expect(mockGenerateImageAsync.mock.invocationCallOrder[0]).toBeLessThan(
      mockPersistCharacterVisualBible.mock.invocationCallOrder[0],
    );
    expect(result.dnaPersistenceStatus).toBe("persisted");
  });
});
