/**
 * Vertical Drama Series — Ad Banner Overlay (F131W, #30-A) router coverage:
 * `generateAdBannerPrompt`, `generateAdBannerImage`, `getAdBannerImageStatus`.
 *
 * Same "mock the whole module graph, test the exported procedure handler
 * directly" convention as `verticalDramaSeries.setSeriesTargetAudienceRegion.test.ts`
 * / `verticalDramaCharacters.modelSelection.test.ts`. The ad banner SERVICE
 * module (`services/verticalDramaAdBanner`) is mocked as a black box — its
 * own behavior is covered by `services/__tests__/verticalDramaAdBanner.test.ts`.
 * `@shared/verticalDramaSeries/adBannerPresets` is left UNMOCKED (pure,
 * deterministic) so the real style/placement presets + validators run.
 *
 * Covers: persistence (prompt + image + status polling all read-modify-write
 * `productTieIn.adBanners[]`), the regulated-category approval gate, the
 * forbidden-claim block, and ≤5 structural enforcement.
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

vi.mock("../../services/rateLimiter", () => ({
  mediaGenerationLimiter: {
    isAllowed: vi.fn(() => true),
    getResetTime: vi.fn(() => 0),
  },
}));

vi.mock("../../_core/tokens", () => ({
  signBearerToken: vi.fn(() => "signed-token"),
}));

vi.mock("../../services/mediaGenerationService", () => ({
  mediaGenerationService: { getTask: vi.fn() },
  DEFAULT_MODELS: { image: "google-nano-banana-pro" },
}));

vi.mock("../../services/creditService", () => ({
  hasEnoughCredits: vi.fn(),
  deductCredits: vi.fn(),
  refundCredits: vi.fn(),
}));

vi.mock("../../services/verticalDramaAdBanner", () => ({
  generateAdBannerPrompt: vi.fn(),
  resolveAdBannerImageModelPricing: vi.fn(),
  submitAdBannerImageGeneration: vi.fn(),
  resolveAdBannerProductReferenceImageUrls: vi.fn(),
  resolveAdBannerApprovalGate: vi.fn(),
  AdBannerRateLimitExceededError: class extends Error {},
  VdAdBannerForbiddenClaimError: class extends Error {},
}));

// Feature 135 — Hermes Grok media worker (section 09, remediation row 10):
// `generateAdBannerImage` now dynamically imports
// `resolveVdCharacterMediaTransportDecision` from `verticalDramaCharacters.ts`,
// whose `mcp` arm delegates to the REAL `resolveMediaTransport` (which pulls
// in MCP connection/share-policy services with their own transitive module
// graph) — mocked directly here, same "mock the transport resolver, not the
// whole MCP module graph" convention `verticalDramaCharacters.modelSelection.test.ts`
// already established, so this file's `../../_core/trpc` mock (no
// `adminProcedure`) is never exercised transitively.
const { mockResolveMediaTransport } = vi.hoisted(() => ({
  mockResolveMediaTransport: vi.fn(),
}));
vi.mock("../../services/mediaTransportResolver", () => ({
  resolveMediaTransport: mockResolveMediaTransport,
}));

const { mockQueueHermesMediaJob } = vi.hoisted(() => ({
  mockQueueHermesMediaJob: vi.fn(),
}));
vi.mock("../../services/hermesMediaScheduler", () => ({
  queueHermesMediaJob: mockQueueHermesMediaJob,
}));

const { mockBuildHermesMediaReferences } = vi.hoisted(() => ({
  mockBuildHermesMediaReferences: vi.fn(async () => []),
}));
vi.mock("../../services/hermesMediaReferences", () => ({
  buildHermesMediaReferences: mockBuildHermesMediaReferences,
  buildHermesMediaTaskEnvelope: (params: {
    taskId: string;
    userId: number;
    mediaType: string;
    model: string;
    prompt: string;
  }) => ({
    id: params.taskId,
    userId: String(params.userId),
    mediaType: params.mediaType,
    status: "pending",
    model: params.model,
    prompt: params.prompt,
    creditsUsed: 0,
    createdAt: new Date().toISOString(),
  }),
  resolveHermesReferenceAssetIdFromUrl: vi.fn(async () => null),
  resolveHermesOrderedRefsFromUrls: vi.fn(async (params: { urls: string[] }) => ({
    orderedRefs: [],
    droppedReferenceCount: params.urls.length,
  })),
}));
vi.mock("../../services/hermesConnectionService", () => ({
  getHermesConnection: vi.fn(async () => ({ capabilities: null })),
  listHermesConnections: vi.fn(async () => []),
}));

// `resolveVdCharacterMediaTransportDecision` is dynamically imported from
// `verticalDramaCharacters.ts`, which pulls that ENTIRE router file's static
// module graph into this test too — same "mock the whole module graph"
// convention `verticalDramaLocations.test.ts` already established for the
// identical reuse (see that file's own doc comment: these mocks are the
// same ones `verticalDramaCharacters.modelSelection.test.ts` uses to import
// that exact file safely).
vi.mock("../../services/pricingCalculator", () => ({
  calculateCreditCost: vi.fn(() => 5),
}));
vi.mock("../../services/verticalDramaCharacterImageGeneration", () => ({
  readPresetVisualIdentityFromBible: vi.fn(() => undefined),
  generateCharacterVisualPrompts: vi.fn(),
  InsufficientCreditsError: class extends Error {},
  VdSchemaValidationError: class extends Error {},
  resolveFaceSourceReferenceForCharacter: vi.fn(),
}));
vi.mock("../../services/mediaAssetService", () => ({
  createAssetFromAttachment: vi.fn(),
}));
vi.mock("../../services/tenantFeatureFlagService", () => ({
  getTenantFeatureFlags: vi.fn(),
}));
vi.mock("../../services/modelRegistry", () => ({
  getModelsByTypeAsync: vi.fn(async () => []),
  isDbModelCatalogLoaded: () => true,
}));
vi.mock("../../services/verticalDramaCharacterStock", () => ({
  verticalDramaCharacterStockService: {
    getPrimaryPortraitUrl: vi.fn(),
    getReferenceImageUrlByAssetLinkId: vi.fn(),
  },
  VerticalDramaCharacterStockError: class extends Error {
    constructor(public readonly reason: string, message: string) {
      super(message);
    }
  },
  VD_PORTRAIT_CANDIDATE_POLICY_REJECTED_MESSAGE: "policy-rejected",
}));

import { verticalDramaSeriesRouter } from "../verticalDramaSeries";
import {
  InsufficientCreditsError,
  VdSchemaValidationError,
} from "../../services/verticalDramaStoryBible";
import { mediaGenerationLimiter } from "../../services/rateLimiter";
import { mediaGenerationService } from "../../services/mediaGenerationService";
import {
  hasEnoughCredits,
  deductCredits,
  refundCredits,
} from "../../services/creditService";
import {
  generateAdBannerPrompt as generateAdBannerPromptService,
  resolveAdBannerImageModelPricing,
  submitAdBannerImageGeneration as submitAdBannerImageGenerationService,
  resolveAdBannerProductReferenceImageUrls,
  resolveAdBannerApprovalGate,
  AdBannerRateLimitExceededError,
  VdAdBannerForbiddenClaimError,
} from "../../services/verticalDramaAdBanner";

const router = verticalDramaSeriesRouter as unknown as Record<string, Function>;

const mockIsAllowed = vi.mocked(mediaGenerationLimiter.isAllowed);
const mockGetTask = vi.mocked(mediaGenerationService.getTask);
const mockHasEnoughCredits = vi.mocked(hasEnoughCredits);
const mockDeductCredits = vi.mocked(deductCredits);
const mockRefundCredits = vi.mocked(refundCredits);
const mockGenerateAdBannerPromptService = vi.mocked(
  generateAdBannerPromptService
);
const mockResolvePricing = vi.mocked(resolveAdBannerImageModelPricing);
const mockSubmitImage = vi.mocked(submitAdBannerImageGenerationService);
const mockResolveReferenceImages = vi.mocked(
  resolveAdBannerProductReferenceImageUrls
);
const mockResolveApprovalGate = vi.mocked(resolveAdBannerApprovalGate);

function ctx(
  overrides: Partial<{
    tenantId: string | null;
    user: { id: number; role: string };
    userToken: string | null;
  }> = {}
) {
  return {
    tenantId: "tenant-1",
    user: { id: 42, role: "user" },
    userToken: "session-token",
    publicUrl: undefined,
    ...overrides,
  };
}

/** Thenable select-chain stub so `await db.select()....where(...).limit(...)` resolves to `rows`. */
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

/** Thenable update-chain stub. */
function updateChain() {
  const chain: any = {
    set: vi.fn(() => chain),
    where: vi.fn(() => Promise.resolve(undefined)),
  };
  return chain;
}

function draftBanner(overrides: Record<string, unknown> = {}) {
  return {
    id: "banner-1",
    stylePresetId: "bold_typography",
    placementId: "bottom_band",
    copy: { headline: "ลดพิเศษ 30%" },
    prompt: {},
    generation: {},
    defaultTiming: { mode: "entire" },
    status: "draft",
    ...overrides,
  };
}

function seriesRow(
  adBanners: unknown[],
  overrides: Record<string, unknown> = {}
) {
  return {
    id: 10,
    tenantId: "tenant-1",
    userId: 42,
    title: "Corporate Betrayal",
    status: "active",
    productTieIn: {
      enabled: true,
      productName: "Glow Serum",
      productCategory: "cosmetics",
      forbiddenClaims: ["cures acne"],
      adBanners,
    },
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockIsAllowed.mockReturnValue(true);
  mockResolveReferenceImages.mockResolvedValue([]);
  mockResolveApprovalGate.mockReturnValue(false);
  mockHasEnoughCredits.mockResolvedValue(true);
  mockDeductCredits.mockResolvedValue(undefined as any);
  mockRefundCredits.mockResolvedValue(undefined as any);
});

describe("generateAdBannerPrompt", () => {
  it("throws NOT_FOUND when the banner id does not exist on the series", async () => {
    mockDb.select.mockReturnValueOnce(
      selectChain([seriesRow([draftBanner({ id: "other" })])])
    );

    await expect(
      router.generateAdBannerPrompt({
        ctx: ctx(),
        input: { seriesId: "10", bannerId: "banner-1" },
      })
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(mockGenerateAdBannerPromptService).not.toHaveBeenCalled();
  });

  it("throws BAD_REQUEST (VD_AD_BANNER_TOO_MANY) and never calls the service when the series already has more than 5 banners", async () => {
    const sixBanners = Array.from({ length: 6 }, (_, i) =>
      draftBanner({ id: `banner-${i}` })
    );
    mockDb.select.mockReturnValueOnce(selectChain([seriesRow(sixBanners)]));

    await expect(
      router.generateAdBannerPrompt({
        ctx: ctx(),
        input: { seriesId: "10", bannerId: "banner-0" },
      })
    ).rejects.toMatchObject({
      code: "BAD_REQUEST",
      message: expect.stringContaining("VD_AD_BANNER_TOO_MANY"),
    });
    expect(mockGenerateAdBannerPromptService).not.toHaveBeenCalled();
  });

  it("happy path: persists prompt.generated/negative + status prompt_ready, stamps approval.required from the gate", async () => {
    mockDb.select.mockReturnValueOnce(
      selectChain([seriesRow([draftBanner()])])
    );
    const chain = updateChain();
    mockDb.update.mockReturnValueOnce(chain);
    mockResolveApprovalGate.mockReturnValue(true);
    mockGenerateAdBannerPromptService.mockResolvedValue({
      imagePrompt: "A bold banner",
      negativePrompt: "blurry",
      textInImage: ["ลดพิเศษ 30%"],
      compositionNotes: "wide",
      complianceNotes: "clean",
      model: "gpt-vision",
      usedVision: false,
      creditsUsed: 5,
    } as any);

    const result = await router.generateAdBannerPrompt({
      ctx: ctx(),
      input: { seriesId: "10", bannerId: "banner-1" },
    });

    expect(result.banner.prompt).toEqual({
      generated: "A bold banner",
      negative: "blurry",
    });
    expect(result.banner.status).toBe("prompt_ready");
    expect(result.banner.approval).toEqual({ required: true });
    expect(chain.set).toHaveBeenCalledWith(
      expect.objectContaining({
        productTieIn: expect.objectContaining({
          productName: "Glow Serum",
          adBanners: [
            expect.objectContaining({ id: "banner-1", status: "prompt_ready" }),
          ],
        }),
      })
    );
  });

  it("maps InsufficientCreditsError to FORBIDDEN", async () => {
    mockDb.select.mockReturnValueOnce(
      selectChain([seriesRow([draftBanner()])])
    );
    mockGenerateAdBannerPromptService.mockRejectedValue(
      new InsufficientCreditsError()
    );

    await expect(
      router.generateAdBannerPrompt({
        ctx: ctx(),
        input: { seriesId: "10", bannerId: "banner-1" },
      })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(mockDb.update).not.toHaveBeenCalled();
  });

  it("maps AdBannerRateLimitExceededError to TOO_MANY_REQUESTS", async () => {
    mockDb.select.mockReturnValueOnce(
      selectChain([seriesRow([draftBanner()])])
    );
    mockGenerateAdBannerPromptService.mockRejectedValue(
      new AdBannerRateLimitExceededError("rate limited" as any)
    );

    await expect(
      router.generateAdBannerPrompt({
        ctx: ctx(),
        input: { seriesId: "10", bannerId: "banner-1" },
      })
    ).rejects.toMatchObject({ code: "TOO_MANY_REQUESTS" });
  });

  it("maps VdAdBannerForbiddenClaimError to UNPROCESSABLE_CONTENT and never persists", async () => {
    mockDb.select.mockReturnValueOnce(
      selectChain([seriesRow([draftBanner()])])
    );
    mockGenerateAdBannerPromptService.mockRejectedValue(
      new VdAdBannerForbiddenClaimError()
    );

    await expect(
      router.generateAdBannerPrompt({
        ctx: ctx(),
        input: { seriesId: "10", bannerId: "banner-1" },
      })
    ).rejects.toMatchObject({ code: "UNPROCESSABLE_CONTENT" });
    expect(mockDb.update).not.toHaveBeenCalled();
  });

  it("maps VdSchemaValidationError to UNPROCESSABLE_CONTENT", async () => {
    mockDb.select.mockReturnValueOnce(
      selectChain([seriesRow([draftBanner()])])
    );
    mockGenerateAdBannerPromptService.mockRejectedValue(
      new VdSchemaValidationError("bad json", {})
    );

    await expect(
      router.generateAdBannerPrompt({
        ctx: ctx(),
        input: { seriesId: "10", bannerId: "banner-1" },
      })
    ).rejects.toMatchObject({ code: "UNPROCESSABLE_CONTENT" });
  });

  it("throws TOO_MANY_REQUESTS at the router's own rate-limit gate before touching the DB", async () => {
    mockIsAllowed.mockReturnValue(false);

    await expect(
      router.generateAdBannerPrompt({
        ctx: ctx(),
        input: { seriesId: "10", bannerId: "banner-1" },
      })
    ).rejects.toMatchObject({ code: "TOO_MANY_REQUESTS" });
    expect(mockDb.select).not.toHaveBeenCalled();
  });
});

describe("generateAdBannerImage", () => {
  it("throws PRECONDITION_FAILED when the banner has no prompt yet", async () => {
    mockDb.select.mockReturnValueOnce(
      selectChain([seriesRow([draftBanner()])])
    );

    await expect(
      router.generateAdBannerImage({
        ctx: ctx(),
        input: { seriesId: "10", bannerId: "banner-1" },
      })
    ).rejects.toMatchObject({ code: "PRECONDITION_FAILED" });
    expect(mockSubmitImage).not.toHaveBeenCalled();
  });

  it("blocks with UNPROCESSABLE_CONTENT when the prompt/copy contains a forbidden claim", async () => {
    const banner = draftBanner({
      prompt: { generated: "This CURES ACNE overnight." },
      status: "prompt_ready",
    });
    mockDb.select.mockReturnValueOnce(selectChain([seriesRow([banner])]));

    await expect(
      router.generateAdBannerImage({
        ctx: ctx(),
        input: { seriesId: "10", bannerId: "banner-1" },
      })
    ).rejects.toMatchObject({
      code: "UNPROCESSABLE_CONTENT",
      message: expect.stringContaining("VD_AD_BANNER_FORBIDDEN_CLAIM"),
    });
    expect(mockSubmitImage).not.toHaveBeenCalled();
    expect(mockDeductCredits).not.toHaveBeenCalled();
  });

  it("blocks with FORBIDDEN when the product is regulated + requires approval and the banner isn't approved yet", async () => {
    const banner = draftBanner({
      prompt: { generated: "A safe prompt" },
      status: "prompt_ready",
    });
    mockDb.select.mockReturnValueOnce(selectChain([seriesRow([banner])]));
    mockResolveApprovalGate.mockReturnValue(true);

    await expect(
      router.generateAdBannerImage({
        ctx: ctx(),
        input: { seriesId: "10", bannerId: "banner-1" },
      })
    ).rejects.toMatchObject({
      code: "FORBIDDEN",
      message: expect.stringContaining("VD_AD_BANNER_APPROVAL_REQUIRED"),
    });
    expect(mockSubmitImage).not.toHaveBeenCalled();
  });

  it("allows generation when the product is regulated + requires approval AND the banner is already approved", async () => {
    const banner = draftBanner({
      prompt: { generated: "A safe prompt" },
      status: "prompt_ready",
      approval: { required: true, approvedAt: "2026-07-08T00:00:00.000Z" },
      generation: { modelId: "google-nano-banana-pro" },
    });
    mockDb.select.mockReturnValueOnce(selectChain([seriesRow([banner])]));
    mockDb.update.mockReturnValueOnce(updateChain());
    mockResolveApprovalGate.mockReturnValue(true);
    mockResolvePricing.mockResolvedValue({
      modelId: "google-nano-banana-pro",
      creditCost: 10,
      maxReferenceImages: 3,
      configJson: null,
    });
    mockSubmitImage.mockResolvedValue({ taskId: "task-1" });

    const result = await router.generateAdBannerImage({
      ctx: ctx(),
      input: { seriesId: "10", bannerId: "banner-1" },
    });

    expect(result.taskId).toBe("task-1");
  });

  it("happy path: reserves credits, submits, and persists status=generating + pendingTaskId", async () => {
    const banner = draftBanner({
      prompt: { generated: "A safe prompt" },
      status: "prompt_ready",
      generation: { modelId: "google-nano-banana-pro" },
    });
    mockDb.select.mockReturnValueOnce(selectChain([seriesRow([banner])]));
    const chain = updateChain();
    mockDb.update.mockReturnValueOnce(chain);
    mockResolvePricing.mockResolvedValue({
      modelId: "google-nano-banana-pro",
      creditCost: 10,
      maxReferenceImages: 3,
      configJson: null,
    });
    mockSubmitImage.mockResolvedValue({ taskId: "task-42" });

    const result = await router.generateAdBannerImage({
      ctx: ctx(),
      input: { seriesId: "10", bannerId: "banner-1" },
    });

    expect(result).toEqual({
      taskId: "task-42",
      creditCost: 10,
      banner: expect.objectContaining({
        status: "generating",
        pendingTaskId: "task-42",
      }),
    });
    expect(mockHasEnoughCredits).toHaveBeenCalledWith(42, 10);
    expect(mockDeductCredits).toHaveBeenCalledTimes(1);
    expect(chain.set).toHaveBeenCalledWith(
      expect.objectContaining({
        productTieIn: expect.objectContaining({
          adBanners: [
            expect.objectContaining({
              status: "generating",
              pendingTaskId: "task-42",
            }),
          ],
        }),
      })
    );
  });

  it("skips the credit reserve/refund cycle entirely for a zero-cost model", async () => {
    const banner = draftBanner({
      prompt: { generated: "A safe prompt" },
      status: "prompt_ready",
      // A plain (non-MCP-id-shaped, non-hermes) zero-cost gateway model —
      // the transport-decision helper resolves this to `{kind:"gateway"}`
      // without touching the real (unmocked in this file)
      // `mediaTransportResolver`/MCP connection-lookup chain, which
      // `higgsfield/*`-shaped ids would otherwise route into.
      generation: { modelId: "zero-cost-gateway-model" },
    });
    mockDb.select.mockReturnValueOnce(selectChain([seriesRow([banner])]));
    mockDb.update.mockReturnValueOnce(updateChain());
    mockResolvePricing.mockResolvedValue({
      modelId: "zero-cost-gateway-model",
      creditCost: 0,
      maxReferenceImages: 1,
      configJson: null,
    });
    mockSubmitImage.mockResolvedValue({ taskId: "task-mcp" });

    await router.generateAdBannerImage({
      ctx: ctx(),
      input: { seriesId: "10", bannerId: "banner-1" },
    });

    expect(mockHasEnoughCredits).not.toHaveBeenCalled();
    expect(mockDeductCredits).not.toHaveBeenCalled();
  });

  it("refunds the reservation when submission fails", async () => {
    const banner = draftBanner({
      prompt: { generated: "A safe prompt" },
      status: "prompt_ready",
      generation: { modelId: "google-nano-banana-pro" },
    });
    mockDb.select.mockReturnValueOnce(selectChain([seriesRow([banner])]));
    mockResolvePricing.mockResolvedValue({
      modelId: "google-nano-banana-pro",
      creditCost: 10,
      maxReferenceImages: 3,
      configJson: null,
    });
    mockSubmitImage.mockRejectedValue(new Error("provider unavailable"));

    await expect(
      router.generateAdBannerImage({
        ctx: ctx(),
        input: { seriesId: "10", bannerId: "banner-1" },
      })
    ).rejects.toMatchObject({ code: "INTERNAL_SERVER_ERROR" });

    expect(mockDeductCredits).toHaveBeenCalledTimes(1);
    expect(mockRefundCredits).toHaveBeenCalledTimes(1);
    expect(mockDb.update).not.toHaveBeenCalled();
  });

  it("throws FORBIDDEN and never submits when credits are insufficient", async () => {
    const banner = draftBanner({
      prompt: { generated: "A safe prompt" },
      status: "prompt_ready",
      generation: { modelId: "google-nano-banana-pro" },
    });
    mockDb.select.mockReturnValueOnce(selectChain([seriesRow([banner])]));
    mockResolvePricing.mockResolvedValue({
      modelId: "google-nano-banana-pro",
      creditCost: 10,
      maxReferenceImages: 3,
      configJson: null,
    });
    mockHasEnoughCredits.mockResolvedValue(false);

    await expect(
      router.generateAdBannerImage({
        ctx: ctx(),
        input: { seriesId: "10", bannerId: "banner-1" },
      })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(mockSubmitImage).not.toHaveBeenCalled();
  });

  it("throws BAD_REQUEST (VD_AD_BANNER_TOO_MANY) when the series already has more than 5 banners", async () => {
    const sixBanners = Array.from({ length: 6 }, (_, i) =>
      draftBanner({
        id: `banner-${i}`,
        prompt: { generated: "ok" },
        status: "prompt_ready",
      })
    );
    mockDb.select.mockReturnValueOnce(selectChain([seriesRow(sixBanners)]));

    await expect(
      router.generateAdBannerImage({
        ctx: ctx(),
        input: { seriesId: "10", bannerId: "banner-0" },
      })
    ).rejects.toMatchObject({
      code: "BAD_REQUEST",
      message: expect.stringContaining("VD_AD_BANNER_TOO_MANY"),
    });
    expect(mockSubmitImage).not.toHaveBeenCalled();
  });

  // Feature 135 — Hermes Grok media worker (section 09, remediation row 10).
  describe("remediation row 10 — fail-closed model guard + transport routing", () => {
    it("throws BAD_REQUEST when banner.generation.modelId is empty (the silent DEFAULT_MODELS.image fallback is gone)", async () => {
      const banner = draftBanner({
        prompt: { generated: "A safe prompt" },
        status: "prompt_ready",
        // generation.modelId intentionally absent/empty.
      });
      mockDb.select.mockReturnValueOnce(selectChain([seriesRow([banner])]));

      await expect(
        router.generateAdBannerImage({
          ctx: ctx(),
          input: { seriesId: "10", bannerId: "banner-1" },
        })
      ).rejects.toMatchObject({ code: "BAD_REQUEST" });
      // Never even reaches pricing/submit — proves the model source is no
      // longer a lazy `DEFAULT_MODELS` import.
      expect(mockResolvePricing).not.toHaveBeenCalled();
      expect(mockSubmitImage).not.toHaveBeenCalled();
    });

    it("routes a Hermes-transport model into queueHermesMediaJob (image operation), with no platform-credit charge", async () => {
      const banner = draftBanner({
        prompt: { generated: "A safe prompt" },
        status: "prompt_ready",
        generation: { modelId: "hermes-grok/grok-imagine-image" },
      });
      mockDb.select.mockReturnValueOnce(selectChain([seriesRow([banner])]));
      mockDb.update.mockReturnValueOnce(updateChain());
      mockResolvePricing.mockResolvedValue({
        modelId: "hermes-grok/grok-imagine-image",
        creditCost: 0,
        maxReferenceImages: 3,
        configJson: { transport: "hermes_worker", hermes: { providerModelId: "grok-imagine-image" } },
      });
      mockQueueHermesMediaJob.mockResolvedValue({ created: true, taskId: "hermes_banner-1", job: {} });

      const result = await router.generateAdBannerImage({
        ctx: ctx(),
        input: { seriesId: "10", bannerId: "banner-1", hermesConnectionId: "hermes-conn-1" },
      });

      expect(mockSubmitImage).not.toHaveBeenCalled();
      expect(mockQueueHermesMediaJob).toHaveBeenCalledTimes(1);
      expect(mockQueueHermesMediaJob).toHaveBeenCalledWith(
        expect.objectContaining({
          operation: "image.generate",
          connectionId: "hermes-conn-1",
          tenantId: "tenant-1",
          requestedByUserId: 42,
        }),
      );
      expect(result.taskId).toBe("hermes_banner-1");
      expect(result.creditCost).toBe(0);
      expect(mockHasEnoughCredits).not.toHaveBeenCalled();
      expect(mockDeductCredits).not.toHaveBeenCalled();
    });

    it("routes an MCP-transport model id into the MCP submit path (side effect of the shared decision helper), byte-identical charge lifecycle otherwise", async () => {
      const banner = draftBanner({
        prompt: { generated: "A safe prompt" },
        status: "prompt_ready",
        generation: { modelId: "higgsfield/nano-banana-pro" },
      });
      mockDb.select.mockReturnValueOnce(selectChain([seriesRow([banner])]));
      mockDb.update.mockReturnValueOnce(updateChain());
      mockResolvePricing.mockResolvedValue({
        modelId: "higgsfield/nano-banana-pro",
        creditCost: 0,
        maxReferenceImages: 3,
        configJson: null,
      });
      mockResolveMediaTransport.mockResolvedValue({
        transport: "mcp",
        providerKey: "higgsfield",
        providerModelId: "nano_banana_pro",
        connectionId: "mcp-conn-1",
      });
      mockSubmitImage.mockResolvedValue({ taskId: "task-mcp-banner" });

      const result = await router.generateAdBannerImage({
        ctx: ctx(),
        input: { seriesId: "10", bannerId: "banner-1", mcpConnectionId: "mcp-conn-1" },
      });

      expect(mockQueueHermesMediaJob).not.toHaveBeenCalled();
      expect(mockSubmitImage).toHaveBeenCalledWith(
        expect.objectContaining({
          transportMetadata: expect.objectContaining({ transport: "mcp", providerKey: "higgsfield" }),
        }),
      );
      expect(result.taskId).toBe("task-mcp-banner");
    });
  });
});

describe("getAdBannerImageStatus", () => {
  it("returns a null taskStatus without polling when there is no pendingTaskId", async () => {
    mockDb.select.mockReturnValueOnce(
      selectChain([seriesRow([draftBanner({ status: "generating" })])])
    );

    const result = await router.getAdBannerImageStatus({
      ctx: ctx(),
      input: { seriesId: "10", bannerId: "banner-1" },
    });

    expect(result).toEqual({
      banner: expect.objectContaining({ status: "generating" }),
      taskStatus: null,
    });
    expect(mockGetTask).not.toHaveBeenCalled();
  });

  it("on completed: persists imageAsset + status ready and clears pendingTaskId", async () => {
    const banner = draftBanner({
      status: "generating",
      pendingTaskId: "task-1",
    });
    mockDb.select.mockReturnValueOnce(selectChain([seriesRow([banner])]));
    const chain = updateChain();
    mockDb.update.mockReturnValueOnce(chain);
    mockGetTask.mockResolvedValue({
      id: "task-1",
      status: "completed",
      resultUrl: "https://cdn/banner.png",
    } as any);

    const result = await router.getAdBannerImageStatus({
      ctx: ctx(),
      input: { seriesId: "10", bannerId: "banner-1" },
    });

    expect(result.taskStatus).toBe("completed");
    expect(result.banner.status).toBe("ready");
    expect(result.banner.imageAsset).toEqual(
      expect.objectContaining({
        url: "https://cdn/banner.png",
        taskId: "task-1",
      })
    );
    expect(result.banner.pendingTaskId).toBeUndefined();
    expect(chain.set).toHaveBeenCalledWith(
      expect.objectContaining({
        productTieIn: expect.objectContaining({
          adBanners: [expect.objectContaining({ status: "ready" })],
        }),
      })
    );
  });

  it("on failed: persists status failed and clears pendingTaskId", async () => {
    const banner = draftBanner({
      status: "generating",
      pendingTaskId: "task-1",
    });
    mockDb.select.mockReturnValueOnce(selectChain([seriesRow([banner])]));
    mockDb.update.mockReturnValueOnce(updateChain());
    mockGetTask.mockResolvedValue({
      id: "task-1",
      status: "failed",
      errorMessage: "provider timeout",
    } as any);

    const result = await router.getAdBannerImageStatus({
      ctx: ctx(),
      input: { seriesId: "10", bannerId: "banner-1" },
    });

    expect(result.taskStatus).toBe("failed");
    expect(result.banner.status).toBe("failed");
    expect(result.banner.pendingTaskId).toBeUndefined();
    expect((result as any).errorMessage).toBe("provider timeout");
  });

  it("does not persist for a non-terminal (processing) status", async () => {
    const banner = draftBanner({
      status: "generating",
      pendingTaskId: "task-1",
    });
    mockDb.select.mockReturnValueOnce(selectChain([seriesRow([banner])]));
    mockGetTask.mockResolvedValue({
      id: "task-1",
      status: "processing",
    } as any);

    const result = await router.getAdBannerImageStatus({
      ctx: ctx(),
      input: { seriesId: "10", bannerId: "banner-1" },
    });

    expect(result.taskStatus).toBe("processing");
    expect(mockDb.update).not.toHaveBeenCalled();
  });
});
