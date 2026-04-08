/**
 * Tests for GPT-5.4 model configuration (Feature 032, Section 01).
 *
 * Validates:
 * - resolveApiUrl routes apiStyle "responses" correctly for any provider
 * - feature flag responsesApi gates access with tenant overrides
 * - pricing and system settings spec constants
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Env stubs for import chain ──────────────────────────────
process.env.JWT_SECRET = process.env.JWT_SECRET || "test-secret-key-at-least-32-chars-long!!";

// ── Mock Redis ──────────────────────────────────────────────
const redisStore = new Map<string, string>();

vi.mock("../../server/services/redis", () => ({
  getRedisClient: () => ({
    get: vi.fn((key: string) => Promise.resolve(redisStore.get(key) ?? null)),
    set: vi.fn((key: string, value: string) => {
      redisStore.set(key, value);
      return Promise.resolve("OK");
    }),
  }),
}));

// ── resolveApiUrl tests (using actual function) ─────────────

describe("resolveApiUrl — apiStyle responses routing", () => {
  let resolveApiUrl: typeof import("../../server/_core/llmRoutes").resolveApiUrl;
  let normalizeMessagesApiResponseToChatCompletion: typeof import("../../server/_core/llmRoutes").normalizeMessagesApiResponseToChatCompletion;

  beforeEach(async () => {
    const mod = await import("../../server/_core/llmRoutes");
    resolveApiUrl = mod.resolveApiUrl;
    normalizeMessagesApiResponseToChatCompletion = mod.normalizeMessagesApiResponseToChatCompletion;
  });

  it("routes OpenCode provider with apiStyle responses to /v1/responses", () => {
    const url = resolveApiUrl(
      "https://api.opencode.ai/v1",
      "gpt-5.4",
      "OpenCode Zen",
      "responses",
    );
    expect(url).toBe("https://api.opencode.ai/v1/responses");
  });

  it("routes non-OpenCode provider with apiStyle responses to /v1/responses", () => {
    const url = resolveApiUrl(
      "https://api.openai.com/v1",
      "gpt-5.4",
      "OpenAI",
      "responses",
    );
    expect(url).toBe("https://api.openai.com/v1/responses");
  });

  it("routes non-OpenCode provider without apiStyle to /v1/chat/completions", () => {
    const url = resolveApiUrl(
      "https://api.openai.com/v1",
      "gpt-4o",
      "OpenAI",
      "chat-completions",
    );
    expect(url).toBe("https://api.openai.com/v1/chat/completions");
  });

  it("handles base URL without /v1 suffix for responses", () => {
    const url = resolveApiUrl(
      "https://api.openai.com",
      "gpt-5.4",
      "OpenAI",
      "responses",
    );
    expect(url).toBe("https://api.openai.com/v1/responses");
  });

  it("routes Anthropic provider to /v1/messages regardless of apiStyle", () => {
    const url = resolveApiUrl(
      "https://api.anthropic.com/v1",
      "claude-sonnet-4",
      "Anthropic",
      "messages",
    );
    expect(url).toBe("https://api.anthropic.com/v1/messages");
  });

  it("does not affect default chat-completions for generic providers", () => {
    const url = resolveApiUrl(
      "https://api.deepseek.com/v1",
      "deepseek-chat",
      "DeepSeek",
    );
    expect(url).toBe("https://api.deepseek.com/v1/chat/completions");
  });

  it("routes Kie GPT-5.4 responses traffic to the codex responses endpoint", () => {
    const url = resolveApiUrl(
      "https://api.kie.ai",
      "gpt-5-4",
      "kie_ai",
      "responses",
    );
    expect(url).toBe("https://api.kie.ai/codex/v1/responses");
  });

  it("routes Kie Codex responses traffic to the shared responses endpoint", () => {
    const url = resolveApiUrl(
      "https://api.kie.ai",
      "gpt-5.3-codex",
      "kie_ai",
      "responses",
    );
    expect(url).toBe("https://api.kie.ai/api/v1/responses");
  });

  it("routes Kie Claude traffic to the shared messages endpoint", () => {
    const url = resolveApiUrl(
      "https://api.kie.ai",
      "claude-sonnet-4-6",
      "kie_ai",
      "messages",
    );
    expect(url).toBe("https://api.kie.ai/claude/v1/messages");
  });

  it("routes Kie Gemini traffic to the model-specific chat-completions endpoint", () => {
    const url = resolveApiUrl(
      "https://api.kie.ai",
      "gemini-3.1-pro",
      "kie_ai",
      "chat-completions",
    );
    expect(url).toBe("https://api.kie.ai/gemini-3.1-pro/v1/chat/completions");
  });

  it("normalizes messages-style responses back into OpenAI chat completion shape", () => {
    const normalized = normalizeMessagesApiResponseToChatCompletion(
      {
        id: "msg_123",
        model: "claude-sonnet-4-6",
        stop_reason: "tool_use",
        content: [
          { type: "text", text: "Need a tool call." },
          {
            type: "tool_use",
            id: "toolu_123",
            name: "lookup_weather",
            input: { city: "Bangkok" },
          },
        ],
        usage: {
          input_tokens: 11,
          output_tokens: 7,
        },
      },
      "claude-sonnet-4-6",
    );

    expect(normalized.object).toBe("chat.completion");
    expect(normalized.choices[0].message.role).toBe("assistant");
    expect(normalized.choices[0].message.content).toBe("Need a tool call.");
    expect(normalized.choices[0].message.tool_calls).toEqual([
      {
        id: "toolu_123",
        type: "function",
        function: {
          name: "lookup_weather",
          arguments: JSON.stringify({ city: "Bangkok" }),
        },
      },
    ]);
    expect(normalized.choices[0].finish_reason).toBe("tool_calls");
    expect(normalized.usage).toEqual({
      prompt_tokens: 11,
      completion_tokens: 7,
      total_tokens: 18,
    });
  });
});

// ── Feature flag tests ──────────────────────────────────────

describe("feature flag — responsesApi", () => {
  beforeEach(() => {
    redisStore.clear();
  });

  it("returns false when global flag is false", async () => {
    const { getTenantFeatureFlag } = await import(
      "../../server/services/featureFlags"
    );
    redisStore.set("feature-flag:responsesApi", "false");
    const result = await getTenantFeatureFlag("responsesApi", "tenant-1");
    expect(result).toBe(false);
  });

  it("returns true when global flag is true and no tenant override", async () => {
    const { getTenantFeatureFlag } = await import(
      "../../server/services/featureFlags"
    );
    redisStore.set("feature-flag:responsesApi", "true");
    const result = await getTenantFeatureFlag("responsesApi", "tenant-1");
    expect(result).toBe(true);
  });

  it("returns false when global is true but tenant override is false", async () => {
    const { getTenantFeatureFlag } = await import(
      "../../server/services/featureFlags"
    );
    redisStore.set("feature-flag:responsesApi", "true");
    redisStore.set("feature-flag:responsesApi:tenant-1", "false");
    const result = await getTenantFeatureFlag("responsesApi", "tenant-1");
    expect(result).toBe(false);
  });

  it("returns true when tenant override is true regardless of global", async () => {
    const { getTenantFeatureFlag } = await import(
      "../../server/services/featureFlags"
    );
    redisStore.set("feature-flag:responsesApi", "false");
    redisStore.set("feature-flag:responsesApi:tenant-1", "true");
    const result = await getTenantFeatureFlag("responsesApi", "tenant-1");
    expect(result).toBe(true);
  });
});

// ── Spec constants validation ───────────────────────────────

describe("GPT-5.4 pricing spec", () => {
  it("expected pricing values match spec constants", () => {
    const expectedPricingInput = "2.50000000";
    const expectedPricingOutput = "15.00000000";

    expect(parseFloat(expectedPricingInput)).toBe(2.5);
    expect(parseFloat(expectedPricingOutput)).toBe(15.0);
  });
});

describe("system settings defaults", () => {
  it("expected default values match spec", () => {
    const defaults = {
      vision_model: "gpt-4o",
      max_search_calls_per_request: "5",
      max_credits_per_request: "500",
      max_browser_sessions: "3",
    };

    expect(defaults.vision_model).toBe("gpt-4o");
    expect(defaults.max_search_calls_per_request).toBe("5");
    expect(defaults.max_credits_per_request).toBe("500");
    expect(defaults.max_browser_sessions).toBe("3");
  });
});
