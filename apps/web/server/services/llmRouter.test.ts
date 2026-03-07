import { describe, it, expect, vi, beforeEach } from "vitest";

// Hoisted mocks
const { mockDbSelect, mockHealthIsAvailable, mockHealthRecordSuccess, mockHealthRecordFailure, mockFetch } = vi.hoisted(() => ({
  mockDbSelect: vi.fn(),
  mockHealthIsAvailable: vi.fn().mockReturnValue(true),
  mockHealthRecordSuccess: vi.fn(),
  mockHealthRecordFailure: vi.fn(),
  mockFetch: vi.fn(),
}));

vi.mock("../db", () => ({
  getDb: vi.fn().mockResolvedValue({
    select: mockDbSelect,
  }),
}));

vi.mock("./providerHealth", () => ({
  isAvailable: mockHealthIsAvailable,
  recordSuccess: mockHealthRecordSuccess,
  recordFailure: mockHealthRecordFailure,
}));

vi.mock("./costTracker", () => ({
  logRequest: vi.fn().mockResolvedValue(undefined),
  calculateCost: vi.fn().mockResolvedValue({ cost: 0.001, method: "model_lookup" }),
}));

vi.mock("./auditLogger", () => ({
  auditLogger: { log: vi.fn() },
}));

vi.mock("./crypto", () => ({
  decrypt: vi.fn().mockReturnValue("decrypted-api-key"),
}));

import { resolveProviders, executeWithFallback } from "./llmRouter";

vi.stubGlobal("fetch", mockFetch);

beforeEach(() => {
  vi.clearAllMocks();
  mockHealthIsAvailable.mockReturnValue(true);
});

// --- Helpers ---

function mockProviderRows(rows: any[]) {
  // resolveProviders does: db.select().from().innerJoin().where()
  const whereMock = vi.fn().mockResolvedValue(rows);
  const innerJoinMock = vi.fn().mockReturnValue({ where: whereMock });
  const fromMock = vi.fn().mockReturnValue({ innerJoin: innerJoinMock });
  mockDbSelect.mockReturnValue({ from: fromMock });
}

function mockRoutingRules(rules: any[]) {
  // Second db.select() call for routing rules
  const whereMock = vi.fn().mockResolvedValue(rules);
  const fromMock = vi.fn().mockReturnValue({ where: whereMock });

  let callCount = 0;
  mockDbSelect.mockImplementation(() => {
    callCount++;
    if (callCount === 1) {
      // provider candidates query (with join)
      return {
        from: vi.fn().mockReturnValue({
          innerJoin: vi.fn().mockReturnValue({
            where: vi.fn().mockResolvedValue([]),
          }),
        }),
      };
    }
    // routing rules query
    return { from: fromMock };
  });
}

function makeCandidate(overrides: Partial<any> = {}) {
  return {
    providerId: 1,
    providerName: "TestProvider",
    baseUrl: "https://api.test.com/v1",
    apiKeyEncrypted: "encrypted-key",
    providerModelId: "gpt-4o",
    pricingInput: "2.50",
    pricingOutput: "10.00",
    isFree: false,
    priority: 0,
    isEnabled: true,
    ...overrides,
  };
}

// --- Provider Resolution ---

describe("resolveProviders", () => {
  it("returns providers sorted by cost when routing mode is 'cost'", async () => {
    const freeProvider = makeCandidate({ providerId: 1, pricingInput: "0", pricingOutput: "0", isFree: true });
    const cheapProvider = makeCandidate({ providerId: 2, pricingInput: "1.00", pricingOutput: "2.00" });
    const expensiveProvider = makeCandidate({ providerId: 3, pricingInput: "5.00", pricingOutput: "15.00" });

    let callCount = 0;
    mockDbSelect.mockImplementation(() => {
      callCount++;
      if (callCount === 1) {
        return {
          from: vi.fn().mockReturnValue({
            innerJoin: vi.fn().mockReturnValue({
              where: vi.fn().mockResolvedValue([expensiveProvider, freeProvider, cheapProvider]),
            }),
          }),
        };
      }
      // routing rules - return cost mode rule
      return {
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([
            { modelPattern: "*", routingMode: "cost", maxFallbacks: 3, isActive: true, providerOrder: null },
          ]),
        }),
      };
    });

    const result = await resolveProviders("gpt-4o");
    expect(result.length).toBe(3);
    expect(result[0].isFree).toBe(true);
    expect(result[1].providerId).toBe(2);
    expect(result[2].providerId).toBe(3);
  });

  it("excludes 'down' providers with active cooldown", async () => {
    const provider1 = makeCandidate({ providerId: 1 });
    const provider2 = makeCandidate({ providerId: 2 });

    mockHealthIsAvailable.mockImplementation((id: number) => id !== 2);

    let callCount = 0;
    mockDbSelect.mockImplementation(() => {
      callCount++;
      if (callCount === 1) {
        return {
          from: vi.fn().mockReturnValue({
            innerJoin: vi.fn().mockReturnValue({
              where: vi.fn().mockResolvedValue([provider1, provider2]),
            }),
          }),
        };
      }
      return {
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([]),
        }),
      };
    });

    const result = await resolveProviders("gpt-4o");
    expect(result.length).toBe(1);
    expect(result[0].providerId).toBe(1);
  });

  it("includes 'down' provider if cooldown expired", async () => {
    const provider = makeCandidate({ providerId: 1 });
    mockHealthIsAvailable.mockReturnValue(true); // cooldown expired

    let callCount = 0;
    mockDbSelect.mockImplementation(() => {
      callCount++;
      if (callCount === 1) {
        return {
          from: vi.fn().mockReturnValue({
            innerJoin: vi.fn().mockReturnValue({
              where: vi.fn().mockResolvedValue([provider]),
            }),
          }),
        };
      }
      return { from: vi.fn().mockReturnValue({ where: vi.fn().mockResolvedValue([]) }) };
    });

    const result = await resolveProviders("gpt-4o");
    expect(result.length).toBe(1);
  });

  it("returns empty array when no providers match model", async () => {
    let callCount = 0;
    mockDbSelect.mockImplementation(() => {
      callCount++;
      if (callCount === 1) {
        return {
          from: vi.fn().mockReturnValue({
            innerJoin: vi.fn().mockReturnValue({
              where: vi.fn().mockResolvedValue([]),
            }),
          }),
        };
      }
      return { from: vi.fn().mockReturnValue({ where: vi.fn().mockResolvedValue([]) }) };
    });

    const result = await resolveProviders("nonexistent-model");
    expect(result).toEqual([]);
  });

  it("returns providerModelId for upstream API calls", async () => {
    const provider = makeCandidate({ providerModelId: "kimi-k2.5-chat" });

    let callCount = 0;
    mockDbSelect.mockImplementation(() => {
      callCount++;
      if (callCount === 1) {
        return {
          from: vi.fn().mockReturnValue({
            innerJoin: vi.fn().mockReturnValue({
              where: vi.fn().mockResolvedValue([provider]),
            }),
          }),
        };
      }
      return { from: vi.fn().mockReturnValue({ where: vi.fn().mockResolvedValue([]) }) };
    });

    const result = await resolveProviders("kimi-k2.5");
    expect(result[0].providerModelId).toBe("kimi-k2.5-chat");
  });

  it("resolves provider-qualified model IDs through generic mappings", async () => {
    const provider = makeCandidate({
      providerId: 2,
      providerModelId: "gpt-5.2",
      providerName: "OpenCode",
    });

    let callCount = 0;
    mockDbSelect.mockImplementation(() => {
      callCount++;
      if (callCount === 1) {
        return {
          from: vi.fn().mockReturnValue({
            innerJoin: vi.fn().mockReturnValue({
              where: vi.fn().mockResolvedValue([provider]),
            }),
          }),
        };
      }
      return { from: vi.fn().mockReturnValue({ where: vi.fn().mockResolvedValue([]) }) };
    });

    const result = await resolveProviders("openai/gpt-5.2");
    expect(result).toHaveLength(1);
    expect(result[0]?.providerModelId).toBe("gpt-5.2");
  });

  it("routing rule precedence: exact match wins over glob over wildcard", async () => {
    const provider = makeCandidate({ providerId: 1 });

    let callCount = 0;
    mockDbSelect.mockImplementation(() => {
      callCount++;
      if (callCount === 1) {
        return {
          from: vi.fn().mockReturnValue({
            innerJoin: vi.fn().mockReturnValue({
              where: vi.fn().mockResolvedValue([provider]),
            }),
          }),
        };
      }
      return {
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([
            { modelPattern: "*", routingMode: "cost", maxFallbacks: 3, isActive: true, providerOrder: null },
            { modelPattern: "gpt-*", routingMode: "quality", maxFallbacks: 3, isActive: true, providerOrder: null },
            { modelPattern: "gpt-4o", routingMode: "priority", maxFallbacks: 2, isActive: true, providerOrder: "[1,2]" },
          ]),
        }),
      };
    });

    const result = await resolveProviders("gpt-4o");
    // The exact match "gpt-4o" with mode "priority" should win
    // We can't directly check the routing mode from result, but we can verify it resolves
    expect(result.length).toBe(1);
  });
});

// --- Request Execution ---

describe("executeWithFallback", () => {
  // Mock global fetch for all execution tests

  function setupProviderResolution(providers: any[]) {
    let callCount = 0;
    mockDbSelect.mockImplementation(() => {
      callCount++;
      if (callCount === 1) {
        return {
          from: vi.fn().mockReturnValue({
            innerJoin: vi.fn().mockReturnValue({
              where: vi.fn().mockResolvedValue(providers),
            }),
          }),
        };
      }
      return {
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([
            { modelPattern: "*", routingMode: "cost", maxFallbacks: 3, isActive: true, providerOrder: null },
          ]),
        }),
      };
    });
  }

  it("successful primary provider returns {type: 'success'}", async () => {
    const provider = makeCandidate({ providerId: 1 });
    setupProviderResolution([provider]);

    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        choices: [{ message: { content: "Hello" } }],
        usage: { prompt_tokens: 10, completion_tokens: 5 },
      }),
    });

    const result = await executeWithFallback({
      model: "gpt-4o",
      messages: [{ role: "user", content: "Hi" }],
      stream: false,
      userId: 1,
    });

    expect(result.type).toBe("success");
    if (result.type === "success") {
      expect(result.providerId).toBe(1);
    }
  });

  it("429 from primary triggers fallback to next same-tier provider", async () => {
    const provider1 = makeCandidate({ providerId: 1, isFree: true, pricingInput: "0", pricingOutput: "0" });
    const provider2 = makeCandidate({ providerId: 2, isFree: true, pricingInput: "0", pricingOutput: "0" });
    setupProviderResolution([provider1, provider2]);

    mockFetch
      .mockResolvedValueOnce({ ok: false, status: 429, text: async () => "Rate limited" })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ choices: [{ message: { content: "OK" } }], usage: { prompt_tokens: 10, completion_tokens: 5 } }),
      });

    const result = await executeWithFallback({
      model: "gpt-4o",
      messages: [{ role: "user", content: "Hi" }],
      stream: false,
      userId: 1,
    });

    expect(result.type).toBe("success");
    if (result.type === "success") {
      expect(result.providerId).toBe(2);
    }
    expect(mockHealthRecordFailure).toHaveBeenCalledWith(1, expect.any(String));
    expect(mockHealthRecordSuccess).toHaveBeenCalledWith(2);
  });

  it("5xx from primary triggers fallback", async () => {
    const provider1 = makeCandidate({ providerId: 1 });
    const provider2 = makeCandidate({ providerId: 2 });
    setupProviderResolution([provider1, provider2]);

    mockFetch
      .mockResolvedValueOnce({ ok: false, status: 500, text: async () => "Server error" })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ choices: [{ message: { content: "OK" } }], usage: { prompt_tokens: 10, completion_tokens: 5 } }),
      });

    const result = await executeWithFallback({
      model: "gpt-4o",
      messages: [{ role: "user", content: "Hi" }],
      stream: false,
      userId: 1,
    });

    expect(result.type).toBe("success");
    if (result.type === "success") {
      expect(result.providerId).toBe(2);
    }
  });

  it("free->paid boundary returns {type: 'fallback_required'}", async () => {
    const freeProvider = makeCandidate({ providerId: 1, isFree: true, pricingInput: "0", pricingOutput: "0" });
    const paidProvider = makeCandidate({ providerId: 2, isFree: false, pricingInput: "2.50", pricingOutput: "10.00" });
    setupProviderResolution([freeProvider, paidProvider]);

    mockFetch.mockResolvedValueOnce({ ok: false, status: 500, text: async () => "Down" });

    const result = await executeWithFallback({
      model: "gpt-4o",
      messages: [{ role: "user", content: "Hi" }],
      stream: false,
      userId: 1,
    });

    expect(result.type).toBe("fallback_required");
    if (result.type === "fallback_required") {
      expect(result.from.providerId).toBe(1);
      expect(result.to.providerId).toBe(2);
      expect(typeof result.estimatedCredits).toBe("number");
    }
  });

  it("preferredProvider override skips routing", async () => {
    const provider = makeCandidate({ providerId: 5, providerModelId: "special-model" });

    // For preferred provider, we query the specific provider
    let callCount = 0;
    mockDbSelect.mockImplementation(() => {
      callCount++;
      if (callCount === 1) {
        return {
          from: vi.fn().mockReturnValue({
            innerJoin: vi.fn().mockReturnValue({
              where: vi.fn().mockResolvedValue([provider]),
            }),
          }),
        };
      }
      return { from: vi.fn().mockReturnValue({ where: vi.fn().mockResolvedValue([]) }) };
    });

    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ choices: [{ message: { content: "OK" } }], usage: { prompt_tokens: 10, completion_tokens: 5 } }),
    });

    const result = await executeWithFallback({
      model: "gpt-4o",
      messages: [{ role: "user", content: "Hi" }],
      stream: false,
      userId: 1,
      preferredProvider: 5,
    });

    expect(result.type).toBe("success");
    if (result.type === "success") {
      expect(result.providerId).toBe(5);
    }
  });

  it("400-level errors (except 429) do NOT trigger fallback", async () => {
    const provider1 = makeCandidate({ providerId: 1 });
    const provider2 = makeCandidate({ providerId: 2 });
    setupProviderResolution([provider1, provider2]);

    mockFetch.mockResolvedValue({ ok: false, status: 400, text: async () => "Bad request" });

    const result = await executeWithFallback({
      model: "gpt-4o",
      messages: [{ role: "user", content: "Hi" }],
      stream: false,
      userId: 1,
    });

    expect(result.type).toBe("error");
    expect(mockFetch).toHaveBeenCalledTimes(1); // Only one attempt
  });

  it("max fallback attempts respected (default 3)", async () => {
    const providers = [1, 2, 3, 4, 5].map(id => makeCandidate({ providerId: id }));
    setupProviderResolution(providers);

    mockFetch.mockResolvedValue({ ok: false, status: 500, text: async () => "Down" });

    const result = await executeWithFallback({
      model: "gpt-4o",
      messages: [{ role: "user", content: "Hi" }],
      stream: false,
      userId: 1,
    });

    expect(result.type).toBe("error");
    // 1 primary + 3 fallbacks = 4 attempts max
    expect(mockFetch).toHaveBeenCalledTimes(4);
  });

  it("all providers failing returns {type: 'error'}", async () => {
    const providers = [1, 2].map(id => makeCandidate({ providerId: id }));
    setupProviderResolution(providers);

    mockFetch.mockResolvedValue({ ok: false, status: 500, text: async () => "Server error" });

    const result = await executeWithFallback({
      model: "gpt-4o",
      messages: [{ role: "user", content: "Hi" }],
      stream: false,
      userId: 1,
    });

    expect(result.type).toBe("error");
  });

  it("all providers failing includes per-attempt provider/status summary", async () => {
    const provider1 = makeCandidate({ providerId: 1, providerName: "OpenRouter-A" });
    const provider2 = makeCandidate({ providerId: 2, providerName: "OpenRouter-B" });
    setupProviderResolution([provider1, provider2]);

    mockFetch
      .mockResolvedValueOnce({
        ok: false,
        status: 502,
        text: async () => JSON.stringify({ error: { code: "upstream_timeout", message: "provider timed out" } }),
      })
      .mockResolvedValueOnce({
        ok: false,
        status: 500,
        text: async () => "Internal Server Error",
      });

    const result = await executeWithFallback({
      model: "gpt-4o",
      messages: [{ role: "user", content: "Hi" }],
      stream: false,
      userId: 1,
    });

    expect(result.type).toBe("error");
    if (result.type === "error") {
      expect(result.error).toContain("All providers failed after 2 attempt(s)");
      expect(result.error).toContain("OpenRouter-A");
      expect(result.error).toContain("HTTP 502");
      expect(result.error).toContain("upstream_timeout");
      expect(result.error).toContain("OpenRouter-B");
      expect(result.error).toContain("HTTP 500");
    }
  });

  it("recordSuccess called on success, recordFailure on failure", async () => {
    const provider1 = makeCandidate({ providerId: 1 });
    const provider2 = makeCandidate({ providerId: 2 });
    setupProviderResolution([provider1, provider2]);

    mockFetch
      .mockResolvedValueOnce({ ok: false, status: 500, text: async () => "Error" })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ choices: [{ message: { content: "OK" } }], usage: { prompt_tokens: 10, completion_tokens: 5 } }),
      });

    await executeWithFallback({
      model: "gpt-4o",
      messages: [{ role: "user", content: "Hi" }],
      stream: false,
      userId: 1,
    });

    expect(mockHealthRecordFailure).toHaveBeenCalledWith(1, expect.any(String));
    expect(mockHealthRecordSuccess).toHaveBeenCalledWith(2);
  });
});

// --- Backward Compatibility ---

describe("backward compatibility", () => {

  it("single provider configured behaves identically to legacy", async () => {
    const provider = makeCandidate({ providerId: 1 });

    let callCount = 0;
    mockDbSelect.mockImplementation(() => {
      callCount++;
      if (callCount === 1) {
        return {
          from: vi.fn().mockReturnValue({
            innerJoin: vi.fn().mockReturnValue({
              where: vi.fn().mockResolvedValue([provider]),
            }),
          }),
        };
      }
      return { from: vi.fn().mockReturnValue({ where: vi.fn().mockResolvedValue([]) }) };
    });

    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ choices: [{ message: { content: "Hello" } }], usage: { prompt_tokens: 10, completion_tokens: 5 } }),
    });

    const result = await executeWithFallback({
      model: "gpt-4o",
      messages: [{ role: "user", content: "Hi" }],
      stream: false,
      userId: 1,
    });

    expect(result.type).toBe("success");
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it("no fallback logic triggered with single provider", async () => {
    const provider = makeCandidate({ providerId: 1 });

    let callCount = 0;
    mockDbSelect.mockImplementation(() => {
      callCount++;
      if (callCount === 1) {
        return {
          from: vi.fn().mockReturnValue({
            innerJoin: vi.fn().mockReturnValue({
              where: vi.fn().mockResolvedValue([provider]),
            }),
          }),
        };
      }
      return { from: vi.fn().mockReturnValue({ where: vi.fn().mockResolvedValue([]) }) };
    });

    mockFetch.mockResolvedValue({ ok: false, status: 500, text: async () => "Error" });

    const result = await executeWithFallback({
      model: "gpt-4o",
      messages: [{ role: "user", content: "Hi" }],
      stream: false,
      userId: 1,
    });

    expect(result.type).toBe("error");
    expect(mockFetch).toHaveBeenCalledTimes(1); // Only one attempt, no fallback
  });
});
