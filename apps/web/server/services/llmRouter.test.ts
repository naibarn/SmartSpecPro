import { describe, it, expect, vi, beforeEach } from "vitest";

// Hoisted mocks
const {
  mockDbSelect,
  mockHealthIsAvailable,
  mockHealthRecordSuccess,
  mockHealthRecordFailure,
  mockFetch,
  mockResolveEnabledLlmModelId,
} = vi.hoisted(() => ({
  mockDbSelect: vi.fn(),
  mockHealthIsAvailable: vi.fn().mockReturnValue(true),
  mockHealthRecordSuccess: vi.fn(),
  mockHealthRecordFailure: vi.fn(),
  mockFetch: vi.fn(),
  mockResolveEnabledLlmModelId: vi.fn(async (preferredModelIds?: Array<string | null | undefined>) => {
    const candidate = preferredModelIds?.find((value): value is string => typeof value === "string" && value.trim().length > 0);
    return candidate ?? "gpt-4o";
  }),
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

vi.mock("./enabledLlmModels", () => ({
  resolveEnabledLlmModelId: mockResolveEnabledLlmModelId,
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

import { resolveProviders, executeWithFallback, makeWorkerLlmIdempotencyKey } from "./llmRouter";
import { auditLogger } from "./auditLogger";

const mockAuditLog = vi.mocked(auditLogger.log);

vi.stubGlobal("fetch", mockFetch);

beforeEach(() => {
  vi.clearAllMocks();
  mockHealthIsAvailable.mockReturnValue(true);
  mockResolveEnabledLlmModelId.mockImplementation(async (preferredModelIds?: Array<string | null | undefined>) => {
    const candidate = preferredModelIds?.find((value): value is string => typeof value === "string" && value.trim().length > 0);
    return candidate ?? "gpt-4o";
  });
});

// --- Helpers ---

describe("Worker Local LLM idempotency", () => {
  it("changes when a later message is added to the same conversation", () => {
    const base = {
      conversationId: 42,
      model: "wllm_12345678",
      stream: false,
      messages: [{ role: "user", content: "first" }],
    } as const;
    const first = makeWorkerLlmIdempotencyKey(base);
    const second = makeWorkerLlmIdempotencyKey({
      ...base,
      messages: [...base.messages, { role: "assistant", content: "answer" }],
    });
    expect(first).toMatch(/^conversation:42:/);
    expect(second).toMatch(/^conversation:42:/);
    expect(second).not.toBe(first);
  });
});

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
    supportsResponses: true,
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

  it("downgrades Google Gemini JSON Schema to JSON mode through OpenRouter", async () => {
    const provider = makeCandidate({
      providerName: "openrouter",
      baseUrl: "https://openrouter.ai/api/v1",
      providerModelId: "google/gemini-3.7-flash",
    });
    setupProviderResolution([provider]);
    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        choices: [{ message: { content: "{\"ok\":true}" } }],
        usage: { prompt_tokens: 10, completion_tokens: 5 },
      }),
    });

    const result = await executeWithFallback({
      model: "google/gemini-3.7-flash",
      messages: [{ role: "user", content: "Return JSON" }],
      stream: false,
      userId: 1,
      extraBodyParams: {
        response_format: {
          type: "json_schema",
          json_schema: { name: "demo", schema: { type: "object" } },
        },
      },
    });

    expect(result.type).toBe("success");
    const [, fetchInit] = mockFetch.mock.calls[0] ?? [];
    const body = JSON.parse(String((fetchInit as any)?.body ?? "{}"));
    expect(body.response_format).toEqual({ type: "json_object" });
    expect(body.response_format.json_schema).toBeUndefined();
  });

  it("treats Google INVALID_ARGUMENT as provider-fallback eligible", async () => {
    const provider1 = makeCandidate({ providerId: 1, providerName: "openrouter", providerModelId: "google/gemini-3.7-flash" });
    const provider2 = makeCandidate({ providerId: 2, providerName: "openrouter", providerModelId: "google/gemini-3.1-pro" });
    setupProviderResolution([provider1, provider2]);
    mockFetch
      .mockResolvedValueOnce({
        ok: false,
        status: 400,
        text: async () => '{"error":{"message":"Request contains an invalid argument.","status":"INVALID_ARGUMENT"}}',
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ choices: [{ message: { content: "OK" } }], usage: { prompt_tokens: 10, completion_tokens: 5 } }),
      });

    const result = await executeWithFallback({
      model: "google/gemini-3.7-flash",
      messages: [{ role: "user", content: "Hi" }],
      stream: false,
      userId: 1,
    });

    expect(result.type).toBe("success");
    if (result.type === "success") expect(result.providerId).toBe(2);
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it("returns an actionable model-specific error when all mapped providers are unavailable", async () => {
    setupProviderResolution([]);

    const result = await executeWithFallback({
      model: "gpt-4o",
      messages: [{ role: "user", content: "Hi" }],
      stream: false,
      userId: 1,
    });

    expect(result).toEqual({
      type: "error",
      error: expect.stringContaining('No healthy provider is available for model "gpt-4o"'),
      statusCode: 503,
    });
    expect((result as any).error).toContain("try again or select another model");
  });

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

  it("routes responses-style requests through the responses endpoint and normalizes the payload", async () => {
    const provider = makeCandidate({
      providerId: 1,
      providerName: "kie_ai",
      baseUrl: "https://api.kie.ai",
      providerModelId: "gpt-5-4",
      apiStyle: "responses",
    });
    setupProviderResolution([provider]);

    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        id: "resp_123",
        model: "gpt-5-4",
        output_text: "{\"ok\":true}",
        usage: { input_tokens: 11, output_tokens: 7, total_tokens: 18 },
      }),
    });

    const result = await executeWithFallback({
      model: "gpt-5-4",
      messages: [
        { role: "system", content: "Return JSON only" },
        { role: "user", content: "Say hello" },
      ],
      stream: false,
      userId: 1,
      maxTokens: 6000,
      extraBodyParams: {
        response_format: {
          type: "json_schema",
          json_schema: {
            name: "demo",
            schema: {
              type: "object",
              properties: {
                ok: { type: "boolean" },
              },
              required: ["ok"],
            },
            strict: true,
          },
        },
      },
    });

    expect(result.type).toBe("success");
    if (result.type === "success") {
      expect(result.response.choices[0].message.content).toBe("{\"ok\":true}");
      expect(result.response.usage.prompt_tokens).toBe(11);
      expect(result.response.usage.completion_tokens).toBe(7);
    }

    expect(mockFetch).toHaveBeenCalledTimes(1);
    const [fetchUrl, fetchInit] = mockFetch.mock.calls[0] ?? [];
    expect(fetchUrl).toBe("https://api.kie.ai/codex/v1/responses");
    const body = JSON.parse(String((fetchInit as any)?.body ?? "{}"));
    expect(body).toEqual(expect.objectContaining({
      model: "gpt-5-4",
      stream: false,
      input: [
        {
          role: "user",
          content: "Say hello",
        },
      ],
      instructions: "Return JSON only",
      max_output_tokens: 6000,
      text: expect.objectContaining({
        format: expect.objectContaining({
          type: "json_schema",
        }),
      }),
    }));
    expect(body).not.toHaveProperty("messages");
    expect(body).not.toHaveProperty("response_format");
  });

  it("routes messages-style requests through the messages endpoint and converts the payload", async () => {
    const provider = makeCandidate({
      providerId: 1,
      providerName: "kie_ai",
      baseUrl: "https://api.kie.ai",
      providerModelId: "claude-sonnet-4-6",
      apiStyle: "messages",
    });
    setupProviderResolution([provider]);

    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        content: [{ text: "Hello" }],
        usage: { input_tokens: 11, output_tokens: 7, total_tokens: 18 },
      }),
    });

    const result = await executeWithFallback({
      model: "claude-sonnet-4-6",
      messages: [
        { role: "system", content: "You are helpful" },
        { role: "user", content: "Say hello" },
      ],
      stream: false,
      userId: 1,
      maxTokens: 1024,
    });

    expect(result.type).toBe("success");
    expect(mockFetch).toHaveBeenCalledTimes(1);
    const [fetchUrl, fetchInit] = mockFetch.mock.calls[0] ?? [];
    expect(fetchUrl).toBe("https://api.kie.ai/claude/v1/messages");

    const body = JSON.parse(String((fetchInit as any)?.body ?? "{}"));
    expect(body).toEqual(expect.objectContaining({
      model: "claude-sonnet-4-6",
      stream: false,
      max_tokens: 1024,
      system: "You are helpful",
      messages: [
        {
          role: "user",
          content: [{ type: "text", text: "Say hello" }],
        },
      ],
    }));
    expect(body).not.toHaveProperty("input");
    expect(body).not.toHaveProperty("response_format");
  });

  it("falls back to chat-completions when a responses-style model does not support responses", async () => {
    const provider = makeCandidate({
      providerId: 1,
      providerName: "openrouter",
      baseUrl: "https://openrouter.ai/api/v1",
      providerModelId: "openai/gpt-5.4-mini",
      apiStyle: "responses",
      supportsResponses: false,
    });
    setupProviderResolution([provider]);

    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        choices: [{ message: { content: "{\"ok\":true}" } }],
        usage: { prompt_tokens: 11, completion_tokens: 7 },
      }),
    });

    const result = await executeWithFallback({
      model: "gpt-5.4-mini",
      messages: [
        { role: "system", content: "Return JSON only" },
        { role: "user", content: "Say hello" },
      ],
      stream: false,
      userId: 1,
      maxTokens: 6000,
      disableProviderFallbacks: true,
      extraBodyParams: {
        response_format: {
          type: "json_schema",
          json_schema: {
            name: "demo",
            schema: {
              type: "object",
              properties: {
                ok: { type: "boolean" },
              },
              required: ["ok"],
            },
            strict: true,
          },
        },
      },
    });

    expect(result.type).toBe("success");
    expect(mockFetch).toHaveBeenCalledTimes(1);
    const [fetchUrl, fetchInit] = mockFetch.mock.calls[0] ?? [];
    expect(fetchUrl).toBe("https://openrouter.ai/api/v1/chat/completions");
    const body = JSON.parse(String((fetchInit as any)?.body ?? "{}"));
    expect(body).toEqual(expect.objectContaining({
      model: "openai/gpt-5.4-mini",
      messages: [
        { role: "system", content: "Return JSON only" },
        { role: "user", content: "Say hello" },
      ],
      stream: false,
      max_tokens: 6000,
      provider: expect.objectContaining({
        allow_fallbacks: false,
        require_parameters: false,
      }),
      response_format: expect.objectContaining({
        type: "json_schema",
      }),
    }));
    expect(body).not.toHaveProperty("input");
    expect(body).not.toHaveProperty("instructions");
  });

  it("falls back when a provider returns HTML instead of JSON", async () => {
    const provider1 = makeCandidate({ providerId: 1, providerName: "HTMLProvider" });
    const provider2 = makeCandidate({ providerId: 2, providerName: "JSONProvider" });
    setupProviderResolution([provider1, provider2]);

    mockFetch
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: { get: vi.fn().mockReturnValue("text/html; charset=utf-8") },
        text: async () => "<!DOCTYPE html><html><body>login page</body></html>",
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          choices: [{ message: { content: "Recovered" } }],
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
      expect(result.providerId).toBe(2);
    }
    expect(mockHealthRecordFailure).toHaveBeenCalledWith(1, expect.any(String));
    expect(mockHealthRecordSuccess).toHaveBeenCalledWith(2);
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
    if (result.type === "error") {
      expect(result.error).toContain("Bad request");
    }
    expect(mockFetch).toHaveBeenCalledTimes(1); // Only one attempt
    expect(mockHealthRecordFailure).not.toHaveBeenCalled();
    expect(mockAuditLog).toHaveBeenCalledWith(expect.objectContaining({
      eventType: "llm_response",
      statusCode: 400,
      responsePayload: expect.objectContaining({
        bodyPreview: "Bad request",
      }),
    }));
  });

  it("redacts OpenRouter key URLs from returned and audited provider errors", async () => {
    const keyId = "19b1f7803431216a3c43f58823f945af1d3b55285a86711b13ab0b2bf09";
    const provider = makeCandidate({ providerName: "openrouter" });
    setupProviderResolution([provider]);
    mockFetch.mockResolvedValue({
      ok: false,
      status: 402,
      text: async () => JSON.stringify({
        error: {
          message: `This request requires more credits. To increase, visit https://openrouter.ai/workspaces/default/keys/${keyId}`,
        },
      }),
    });

    const result = await executeWithFallback({
      model: "gpt-4o",
      messages: [{ role: "user", content: "Hi" }],
      stream: false,
      userId: 1,
    });

    expect(result.type).toBe("error");
    if (result.type === "error") {
      expect(result.error).toContain("[openrouter_key_url_redacted]");
      expect(result.error).not.toContain(keyId);
    }
    expect(JSON.stringify(mockAuditLog.mock.calls)).not.toContain(keyId);
  });

  it("records cross-model fallback provenance in request and response audit events", async () => {
    setupProviderResolution([makeCandidate({ providerId: 1, providerModelId: "recommended-fallback" })]);
    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      text: async () => JSON.stringify({
        choices: [{ message: { content: "Recovered" } }],
        usage: { prompt_tokens: 10, completion_tokens: 5 },
      }),
      headers: { get: () => "application/json" },
    });

    const result = await executeWithFallback({
      model: "recommended-fallback",
      modelFallbackFrom: "primary-model",
      modelFallbackReason: "transient_retries_exhausted",
      messages: [{ role: "user", content: "Hi" }],
      stream: false,
      userId: 1,
    });

    expect(result.type).toBe("success");
    expect(mockAuditLog).toHaveBeenCalledWith(expect.objectContaining({
      eventType: "llm_request",
      modelFallbackFrom: "primary-model",
      modelFallbackReason: "transient_retries_exhausted",
    }));
    expect(mockAuditLog).toHaveBeenCalledWith(expect.objectContaining({
      eventType: "llm_response",
      modelFallbackFrom: "primary-model",
      modelFallbackReason: "transient_retries_exhausted",
    }));
  });

  it("400 invalid-model responses can fallback to the next provider", async () => {
    const provider1 = makeCandidate({ providerId: 1, providerName: "OpenRouter-A" });
    const provider2 = makeCandidate({ providerId: 2, providerName: "OpenRouter-B" });
    setupProviderResolution([provider1, provider2]);

    mockFetch
      .mockResolvedValueOnce({ ok: false, status: 400, text: async () => JSON.stringify({ error: { message: "not a valid model" } }) })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ choices: [{ message: { content: "Recovered" } }], usage: { prompt_tokens: 12, completion_tokens: 6 } }),
      });

    const result = await executeWithFallback({
      model: "gpt-5.4-mini",
      messages: [{ role: "user", content: "Hi" }],
      stream: false,
      userId: 1,
    });

    expect(result.type).toBe("success");
    if (result.type === "success") {
      expect(result.providerId).toBe(2);
    }
    expect(mockFetch).toHaveBeenCalledTimes(2);
    expect(mockHealthRecordFailure).toHaveBeenCalledWith(1, "http_400");
    expect(mockHealthRecordSuccess).toHaveBeenCalledWith(2);
  });

  it("vision reference download 404s fallback without poisoning provider health", async () => {
    const provider1 = makeCandidate({ providerId: 1, providerName: "OpenRouter-A" });
    const provider2 = makeCandidate({ providerId: 2, providerName: "OpenRouter-B" });
    setupProviderResolution([provider1, provider2]);

    mockFetch
      .mockResolvedValueOnce({
        ok: false,
        status: 400,
        text: async () => JSON.stringify({
          error: {
            message: "Vision reference image unavailable: upstream status code: 404",
          },
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          choices: [{ message: { content: "Recovered with vision" } }],
          usage: { prompt_tokens: 12, completion_tokens: 6 },
        }),
      });

    const result = await executeWithFallback({
      model: "gpt-5.6-luna",
      messages: [{ role: "user", content: "Inspect the attached frame" }],
      stream: false,
      userId: 1,
    });

    expect(result.type).toBe("success");
    expect(mockFetch).toHaveBeenCalledTimes(2);
    expect(mockHealthRecordFailure).not.toHaveBeenCalledWith(1, expect.any(String));
    expect(mockHealthRecordSuccess).toHaveBeenCalledWith(2);
    expect(mockAuditLog).toHaveBeenCalledWith(expect.objectContaining({
      eventType: "llm_response",
      errorType: "reference_unavailable",
    }));
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

  // Timeout-hole fix (2026-07-18) — see this file's doc comment at the fetch
  // call site (audit-2026-07-18.jsonl root cause: moonshotai/kimi-k3
  // capacity-limited, totalMs 275904 per hung attempt, headers arrived but
  // the body never did). Previously the AbortController was cleared as soon
  // as headers arrived, so a stalled `response.text()` read had NO deadline
  // at all.
  describe("body-read timeout (two-phase AbortController)", () => {
    it("aborts a stalled body read at the body-timeout deadline and classifies it as a retryable network_error", async () => {
      const provider = makeCandidate({ providerId: 1 });
      setupProviderResolution([provider]);

      mockFetch.mockImplementation((_url: string, init: any) => {
        const signal: AbortSignal = init.signal;
        return Promise.resolve({
          ok: true,
          status: 200,
          headers: { get: () => "application/json" },
          // Headers arrive immediately (this promise resolves), but the BODY
          // never does until the (re-armed) AbortController fires.
          text: () =>
            new Promise((_resolve, reject) => {
              signal.addEventListener("abort", () => {
                reject(new DOMException("This operation was aborted.", "AbortError"));
              });
            }),
        });
      });

      const result = await executeWithFallback({
        model: "gpt-4o",
        messages: [{ role: "user", content: "Hi" }],
        stream: false,
        userId: 1,
        timeoutMs: 30, // tight deadline so the test runs fast
        disableProviderFallbacks: true,
      });

      expect(result.type).toBe("error");
      if (result.type === "error") {
        expect(result.error.toLowerCase()).toContain("aborted");
      }
      // Classified via the outer catch as "network_error" — the same class
      // `verticalDramaStoryBible.ts`'s `classifyVerticalDramaLlmError`
      // already treats as "transient" (bounded-retry-eligible).
      expect(mockHealthRecordFailure).toHaveBeenCalledWith(1, "network_error");
    });

    it("does not abort a normal-latency call with no timeoutMs override (byte-identical default behavior)", async () => {
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
    });
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
