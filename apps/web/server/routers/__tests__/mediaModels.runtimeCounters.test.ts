import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  mockGetMediaModelLookupCounters,
  mockResetMediaModelLookupCounters,
  mockGetMediaModelResolutionCounters,
  mockResetMediaModelResolutionCounters,
  mockGetModelRegistryCounters,
  mockResetModelRegistryCounters,
} = vi.hoisted(() => ({
  mockGetMediaModelLookupCounters: vi.fn(),
  mockResetMediaModelLookupCounters: vi.fn(),
  mockGetMediaModelResolutionCounters: vi.fn(),
  mockResetMediaModelResolutionCounters: vi.fn(),
  mockGetModelRegistryCounters: vi.fn(),
  mockResetModelRegistryCounters: vi.fn(),
}));

vi.mock("../media", () => ({
  getMediaModelLookupCounters: mockGetMediaModelLookupCounters,
  resetMediaModelLookupCounters: mockResetMediaModelLookupCounters,
}));

vi.mock("../../services/mediaGenerationService", () => ({
  getMediaModelResolutionCounters: mockGetMediaModelResolutionCounters,
  resetMediaModelResolutionCounters: mockResetMediaModelResolutionCounters,
}));

vi.mock("../../services/modelRegistry", () => ({
  clearModelCache: vi.fn(),
  getStaticFallbackModels: vi.fn(),
  getStaticModelById: vi.fn(),
  getModelRegistryCounters: mockGetModelRegistryCounters,
  resetModelRegistryCounters: mockResetModelRegistryCounters,
}));

vi.mock("../../services/skillRegistry", () => ({
  clearSkillRegistryCache: vi.fn(),
}));

vi.mock("../../db", () => ({
  db: {
    select: vi.fn(),
    insert: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    instance: { selectDistinct: vi.fn() },
  },
}));

vi.mock("../../_core/trpc", () => {
  const createProcedure = () => {
    const proc: any = {
      query: (fn: Function) => fn,
      mutation: (fn: Function) => fn,
      input: () => proc,
    };
    return proc;
  };

  return {
    router: (routes: any) => routes,
    adminProcedure: createProcedure(),
    protectedProcedure: createProcedure(),
  };
});

import { mediaModelsRouter } from "../mediaModels";

describe("mediaModels.runtimeCounters", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetMediaModelLookupCounters.mockReturnValue({
      pricingDbMissFallback: 2,
      metadataDbMissFallback: 3,
      unknownModelRejected: 1,
      defaultFromDb: 12,
      defaultFallbackStatic: 4,
    });
    mockGetMediaModelResolutionCounters.mockReturnValue({
      providerFromApiConfig: 20,
      providerFromStaticRegistry: 5,
      providerDefaultFallback: 2,
      unknownModelRequests: 1,
    });
    mockGetModelRegistryCounters.mockReturnValue({
      staticFallbackHits: 6,
      cacheHits: 40,
    });
  });

  it("returns aggregated runtime counters", async () => {
    const fn = mediaModelsRouter.runtimeCounters as Function;
    const result = await fn({});

    expect(result).toMatchObject({
      mediaLookup: {
        defaultFromDb: 12,
        defaultFallbackStatic: 4,
      },
      mediaResolution: {
        providerDefaultFallback: 2,
      },
      modelRegistry: {
        staticFallbackHits: 6,
      },
      fallbackTotal: 17,
    });
    expect(typeof result.generatedAt).toBe("string");
  });

  it("resets all runtime counters", async () => {
    const fn = mediaModelsRouter.resetRuntimeCounters as Function;
    const result = await fn({});

    expect(mockResetMediaModelLookupCounters).toHaveBeenCalledTimes(1);
    expect(mockResetMediaModelResolutionCounters).toHaveBeenCalledTimes(1);
    expect(mockResetModelRegistryCounters).toHaveBeenCalledTimes(1);
    expect(result.success).toBe(true);
    expect(typeof result.resetAt).toBe("string");
  });
});
