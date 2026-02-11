import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockInsert, mockSelect, mockUpdate, mockGetDb } = vi.hoisted(() => ({
  mockInsert: vi.fn(),
  mockSelect: vi.fn(),
  mockUpdate: vi.fn(),
  mockGetDb: vi.fn(),
}));

vi.mock("./db", () => ({
  db: {
    insert: mockInsert,
    select: mockSelect,
    update: mockUpdate,
  },
  getDb: mockGetDb,
}));

import { seedZenProvider } from "../drizzle/seed";

beforeEach(() => {
  vi.clearAllMocks();
  delete process.env.OPENCODE_ZEN_API_KEY;
});

function setupMocks(providerId: number = 1) {
  // Insert mocks: .values().onConflictDoNothing()
  const onConflictMock = vi.fn().mockResolvedValue(undefined);
  const valuesMock = vi.fn().mockReturnValue({ onConflictDoNothing: onConflictMock });
  mockInsert.mockReturnValue({ values: valuesMock });

  const updateWhereMock = vi.fn().mockResolvedValue(undefined);
  const updateSetMock = vi.fn().mockReturnValue({ where: updateWhereMock });
  mockUpdate.mockReturnValue({ set: updateSetMock });

  const makeSelectResult = (rows: any[]) => ({
    from: vi.fn().mockReturnValue({
      where: vi.fn().mockReturnValue({
        limit: vi.fn().mockResolvedValue(rows),
      }),
    }),
  });

  // 1st select: zen provider id, 2nd select: openrouter not found
  mockSelect
    .mockImplementationOnce(() => makeSelectResult([{ id: providerId }]))
    .mockImplementationOnce(() => makeSelectResult([]))
    .mockImplementation(() => makeSelectResult([]));

  mockGetDb.mockResolvedValue({
    insert: mockInsert,
    select: mockSelect,
    update: mockUpdate,
  });

  return { valuesMock, onConflictMock };
}

describe("seedZenProvider", () => {
  it("inserts OpenCode Zen provider", async () => {
    const { valuesMock } = setupMocks();
    await seedZenProvider();

    // First insert call should be the provider
    expect(valuesMock).toHaveBeenCalledWith(
      expect.objectContaining({
        providerName: "opencode-zen",
        displayName: "OpenCode Zen",
        providerType: "secondary",
        healthStatus: "healthy",
      })
    );
  });

  it("inserts 3 free model mappings", async () => {
    setupMocks();
    await seedZenProvider();

    // 1 provider + 3 models + 2 routing rules = 6 insert calls
    expect(mockInsert).toHaveBeenCalledTimes(6);
  });

  it("uses ON CONFLICT DO NOTHING for idempotency", async () => {
    const { onConflictMock } = setupMocks();
    await seedZenProvider();

    // All inserts use onConflictDoNothing
    expect(onConflictMock).toHaveBeenCalled();
  });

  it("all model mappings are free with 0 pricing", async () => {
    const { valuesMock } = setupMocks();
    await seedZenProvider();

    // Check model insert calls (calls 2, 3, 4 — after provider and before routing rule)
    const modelCalls = valuesMock.mock.calls.filter(
      (call: any[]) => call[0]?.isFree === true
    );
    expect(modelCalls).toHaveLength(3);
    for (const call of modelCalls) {
      expect(call[0].pricingInput).toBe("0");
      expect(call[0].pricingOutput).toBe("0");
      expect(call[0].isFree).toBe(true);
    }
  });

  it("correct model IDs and providerModelIds", async () => {
    const { valuesMock } = setupMocks();
    await seedZenProvider();

    const modelCalls = valuesMock.mock.calls.filter(
      (call: any[]) => call[0]?.modelId
    );
    const modelIds = modelCalls.map((c: any[]) => c[0].modelId);
    expect(modelIds).toContain("kimi-k2.5-free");
    expect(modelIds).toContain("minimax-m2.1-free");
    expect(modelIds).toContain("glm-4.7-free");
  });

  it("reasonable context lengths", async () => {
    const { valuesMock } = setupMocks();
    await seedZenProvider();

    const modelCalls = valuesMock.mock.calls.filter(
      (call: any[]) => call[0]?.contextLength
    );
    for (const call of modelCalls) {
      expect(call[0].contextLength).toBeGreaterThanOrEqual(128000);
    }
  });

  it("provider disabled without API key", async () => {
    const { valuesMock } = setupMocks();
    await seedZenProvider();

    expect(valuesMock).toHaveBeenCalledWith(
      expect.objectContaining({
        isEnabled: false,
        hasApiKey: false,
      })
    );
  });

  it("provider enabled with API key", async () => {
    process.env.OPENCODE_ZEN_API_KEY = "test-key";
    const { valuesMock } = setupMocks();
    await seedZenProvider();

    expect(valuesMock).toHaveBeenCalledWith(
      expect.objectContaining({
        isEnabled: true,
        hasApiKey: true,
      })
    );
  });

  it("seeds default routing rule for free models", async () => {
    const { valuesMock } = setupMocks();
    await seedZenProvider();

    expect(valuesMock).toHaveBeenCalledWith(
      expect.objectContaining({
        modelPattern: "*-free",
        routingMode: "cost",
        maxFallbacks: 3,
        isActive: true,
      })
    );
  });
});
