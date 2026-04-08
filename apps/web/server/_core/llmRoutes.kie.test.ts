import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import express from "express";
import request from "supertest";

import { registerLLMRoutes, resetLlmRouteStateForTests } from "./llmRoutes";
import { buildKieLlmAvailableModels } from "../services/llmProviderCatalog";

const { mockDbSelect, mockGetDb, mockAuthorizeRequest, mockHasEnoughCredits, mockGetCreditBalance, mockDeductCreditsForModel, mockResolveEnabledLlmModelId, mockRunPlanner } = vi.hoisted(() => ({
  mockDbSelect: vi.fn(),
  mockGetDb: vi.fn(),
  mockAuthorizeRequest: vi.fn(),
  mockHasEnoughCredits: vi.fn(),
  mockGetCreditBalance: vi.fn(),
  mockDeductCreditsForModel: vi.fn(),
  mockResolveEnabledLlmModelId: vi.fn(),
  mockRunPlanner: vi.fn(),
}));

vi.mock("../db", () => ({
  db: {
    select: mockDbSelect,
  },
  getDb: mockGetDb,
  getUserByOpenId: vi.fn(),
  getUserById: vi.fn(),
}));

vi.mock("../services/crypto", () => ({
  decrypt: vi.fn(() => "kie-test-key"),
}));

vi.mock("../_core/authz", () => ({
  authorizeRequest: (...args: any[]) => mockAuthorizeRequest(...args),
  AuthResult: {},
}));

vi.mock("../_core/limits", () => ({
  enforceJsonBodyMaxBytes: () => (_req: any, _res: any, next: any) => next(),
  rateLimit: () => (_req: any, _res: any, next: any) => next(),
}));

vi.mock("../services/creditService", () => ({
  getCreditBalance: (...args: any[]) => mockGetCreditBalance(...args),
  getCreditBalanceByOpenId: vi.fn(),
  hasEnoughCredits: (...args: any[]) => mockHasEnoughCredits(...args),
  deductCredits: vi.fn(),
  deductCreditsForModel: (...args: any[]) => mockDeductCreditsForModel(...args),
  calculateCreditsFromCost: vi.fn((cost: number) => Math.ceil(cost * 1000)),
  calculateCreditsForLLM: vi.fn(() => 10),
}));

vi.mock("../services/enabledLlmModels", () => ({
  resolveEnabledLlmModelId: (...args: any[]) => mockResolveEnabledLlmModelId(...args),
}));

vi.mock("../services/taskPlannerMiddleware", () => ({
  runPlanner: (...args: any[]) => mockRunPlanner(...args),
  recordStepAttempt: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../services/auditLogger", () => ({
  auditLogger: { log: vi.fn() },
}));

vi.mock("../services/traceContext", () => ({
  getTraceId: vi.fn().mockReturnValue("trace-kie-chat"),
}));

vi.mock("../services/costTracker", () => ({
  logRequest: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../_core/logger", () => ({
  debugLog: vi.fn(),
  debugError: vi.fn(),
}));

vi.mock("../services/llmRateLimiter", () => ({
  getProviderLimiter: vi.fn(),
  getProviderLimitConfig: vi.fn(),
  scheduleWithLimiter: vi.fn(),
  getLimiterStats: vi.fn(),
  getAllLimiterStats: vi.fn(),
  getLimiterCounts: vi.fn(),
  recordModelUsage: vi.fn(),
}));

vi.mock("../services/redis", () => ({
  isRedisAvailable: vi.fn(() => false),
  getRedisClient: vi.fn(),
}));

vi.mock("./responsesRoutes", () => ({
  registerResponsesRoutes: vi.fn(),
}));

function makeStream(body: string) {
  const enc = new TextEncoder();
  const chunks = body.split("");
  let i = 0;
  return new ReadableStream<Uint8Array>({
    pull(controller) {
      if (i >= chunks.length) {
        controller.close();
        return;
      }
      controller.enqueue(enc.encode(chunks[i++]));
    },
  });
}

function makeSelectResult(rows: any[]) {
  const limit = vi.fn().mockResolvedValue(rows);
  const orderBy = vi.fn().mockReturnValue({ limit });
  const where = vi.fn().mockReturnValue({ orderBy, limit });
  const from = vi.fn().mockReturnValue({ where });
  return { from };
}

function queueProviderAndMappingSelects(mapping: { providerModelId: string; apiStyle: "chat-completions" | "responses" | "messages" | "gemini" }) {
  mockDbSelect
    .mockImplementationOnce(() => makeSelectResult([{
      providerId: 9,
      providerName: "kie_ai",
      baseUrl: "https://api.kie.ai",
      apiKeyEncrypted: "enc",
      defaultModel: mapping.providerModelId,
      availableModels: buildKieLlmAvailableModels(),
    }]))
    .mockImplementationOnce(() => makeSelectResult([mapping]));
}

function createApp() {
  const app = express();
  app.use(express.json());
  registerLLMRoutes(app);
  return app;
}

const describeSocketSuite =
  process.env.RUN_SOCKET_TESTS === "true" ? describe : describe.skip;

describeSocketSuite("Kie /v1/chat/completions route guards", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetLlmRouteStateForTests();
    mockGetDb.mockResolvedValue({ select: mockDbSelect });
    mockAuthorizeRequest.mockResolvedValue({ ok: true, mode: "api_key", userId: 42 });
    mockHasEnoughCredits.mockResolvedValue(true);
    mockGetCreditBalance.mockResolvedValue({ credits: 900 });
    mockDeductCreditsForModel.mockResolvedValue({ creditsUsed: 10, wasFree: false });
    mockResolveEnabledLlmModelId.mockImplementation(async (candidates: Array<string | null | undefined>) =>
      candidates.find((value) => typeof value === "string" && value.trim().length > 0) ?? null,
    );
    mockRunPlanner.mockResolvedValue(null);
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("rejects Kie responses-family models on /v1/chat/completions", async () => {
    queueProviderAndMappingSelects({
      providerModelId: "gpt-5-4",
      apiStyle: "responses",
    });
    const app = createApp();

    const res = await request(app)
      .post("/v1/chat/completions")
      .set("Authorization", "Bearer gwtoken")
      .send({
        model: "gpt-5.4",
        messages: [{ role: "user", content: "hello" }],
      });

    expect(res.status).toBe(400);
    expect(res.body.error.message).toContain("/v1/responses");
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it("bridges Kie responses-family models on /api/llm/stream into chat SSE", async () => {
    queueProviderAndMappingSelects({
      providerModelId: "gpt-5-4",
      apiStyle: "responses",
    });

    vi.stubGlobal("fetch", vi.fn(async (_url: string, init?: RequestInit) => new Response(
      JSON.stringify({
        id: "resp_kie_123",
        model: "gpt-5-4",
        output: [
          {
            type: "message",
            role: "assistant",
            content: [
              { type: "output_text", text: "วันนี้วันอังคาร" },
            ],
          },
        ],
        usage: {
          input_tokens: 9,
          output_tokens: 5,
          total_tokens: 14,
        },
      }),
      { status: 200, headers: { "content-type": "application/json" } },
    )));

    const app = createApp();

    const res = await request(app)
      .post("/api/llm/stream")
      .set("Authorization", "Bearer gwtoken")
      .send({
        model: "gpt-5.4",
        preferredProvider: 9,
        messages: [{ role: "user", content: "วันนี้วันอะไร" }],
      });

    expect(res.status).toBe(200);
    expect(String(res.headers["content-type"])).toContain("text/event-stream");
    expect(res.text).toContain('"object":"chat.completion.chunk"');
    expect(res.text).toContain('"content":"วันนี้วันอังคาร"');
    expect(res.text).toContain('"finish_reason":"stop"');
    expect(res.text).toContain("event: message_complete");
    expect(res.text).toContain("data: [DONE]");
    expect(mockDeductCreditsForModel).toHaveBeenCalledWith(
      expect.objectContaining({
        inputTokens: 9,
        outputTokens: 5,
        model: "gpt-5.4",
        provider: "kie_ai",
      }),
    );
    expect(globalThis.fetch).toHaveBeenCalledWith(
      "https://api.kie.ai/api/v1/responses",
      expect.objectContaining({
        method: "POST",
        body: expect.stringContaining("\"input\""),
      }),
    );
    expect((globalThis.fetch as any).mock.calls[0]?.[1]?.body).not.toContain("\"messages\"");
  });

  it("normalizes Kie Claude streaming into OpenAI chat-completions SSE", async () => {
    queueProviderAndMappingSelects({
      providerModelId: "claude-sonnet-4-6",
      apiStyle: "messages",
    });

    const sse = [
      "event: message_start",
      'data: {"type":"message_start","message":{"id":"msg_stream_123","model":"claude-sonnet-4-6","usage":{"input_tokens":11}}}',
      "",
      "event: content_block_delta",
      'data: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"Hello"}}',
      "",
      "event: content_block_delta",
      'data: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":" from Claude"}}',
      "",
      "event: message_delta",
      'data: {"type":"message_delta","delta":{"stop_reason":"end_turn"},"usage":{"output_tokens":7}}',
      "",
      "event: message_stop",
      'data: {"type":"message_stop"}',
      "",
    ].join("\n");

    vi.stubGlobal("fetch", vi.fn(async () => new Response(
      makeStream(sse),
      { status: 200, headers: { "content-type": "text/event-stream" } },
    )));

    const app = createApp();

    const res = await request(app)
      .post("/v1/chat/completions")
      .set("Authorization", "Bearer gwtoken")
      .send({
        model: "claude-sonnet-4-6",
        stream: true,
        messages: [{ role: "user", content: "hello" }],
      });

    expect(res.status).toBe(200);
    expect(String(res.headers["content-type"])).toContain("text/event-stream");
    expect(res.text).toContain('"object":"chat.completion.chunk"');
    expect(res.text).toContain('"role":"assistant"');
    expect(res.text).toContain('"content":"Hello"');
    expect(res.text).toContain('"content":" from Claude"');
    expect(res.text).toContain('"finish_reason":"stop"');
    expect(res.text).toContain("data: [DONE]");
    expect(mockDeductCreditsForModel).toHaveBeenCalledWith(
      expect.objectContaining({
        inputTokens: 11,
        outputTokens: 7,
        model: "claude-sonnet-4-6",
        provider: "kie_ai",
      }),
    );
  });

  it("normalizes Kie Claude multi-fragment tool-use streaming into OpenAI tool call deltas", async () => {
    queueProviderAndMappingSelects({
      providerModelId: "claude-sonnet-4-6",
      apiStyle: "messages",
    });

    const sse = [
      "event: message_start",
      'data: {"type":"message_start","message":{"id":"msg_tool_123","model":"claude-sonnet-4-6","usage":{"input_tokens":13}}}',
      "",
      "event: content_block_start",
      'data: {"type":"content_block_start","index":0,"content_block":{"type":"tool_use","id":"toolu_123","name":"lookup_weather","input":{}}}',
      "",
      "event: content_block_delta",
      'data: {"type":"content_block_delta","index":0,"delta":{"type":"input_json_delta","partial_json":"{\\"city\\":\\"Bang"}}',
      "",
      "event: content_block_delta",
      'data: {"type":"content_block_delta","index":0,"delta":{"type":"input_json_delta","partial_json":"kok\\",\\"unit\\":\\"c\\"}"}}',
      "",
      "event: message_delta",
      'data: {"type":"message_delta","delta":{"stop_reason":"tool_use"},"usage":{"output_tokens":5}}',
      "",
      "event: message_stop",
      'data: {"type":"message_stop"}',
      "",
    ].join("\n");

    vi.stubGlobal("fetch", vi.fn(async () => new Response(
      makeStream(sse),
      { status: 200, headers: { "content-type": "text/event-stream" } },
    )));

    const app = createApp();

    const res = await request(app)
      .post("/v1/chat/completions")
      .set("Authorization", "Bearer gwtoken")
      .send({
        model: "claude-sonnet-4-6",
        stream: true,
        messages: [{ role: "user", content: "Call the weather tool" }],
      });

    expect(res.status).toBe(200);
    expect(String(res.headers["content-type"])).toContain("text/event-stream");
    expect(res.text).toContain('"tool_calls"');
    expect(res.text).toContain('"name":"lookup_weather"');
    expect(res.text).toContain('"arguments":""');
    expect(res.text).toContain('{\\"city\\":\\"Bang');
    expect(res.text).toContain('kok\\",\\"unit\\":\\"c\\"}');
    expect(res.text).not.toContain('"arguments":"{}{"');
    expect(res.text).toContain('"finish_reason":"tool_calls"');
    expect(res.text).toContain("data: [DONE]");
    expect(mockDeductCreditsForModel).toHaveBeenCalledWith(
      expect.objectContaining({
        inputTokens: 13,
        outputTokens: 5,
        model: "claude-sonnet-4-6",
        provider: "kie_ai",
      }),
    );
  });

  it("preserves seeded Kie Claude tool input when the stream starts with non-empty arguments", async () => {
    queueProviderAndMappingSelects({
      providerModelId: "claude-sonnet-4-6",
      apiStyle: "messages",
    });

    const sse = [
      "event: message_start",
      'data: {"type":"message_start","message":{"id":"msg_seeded_123","model":"claude-sonnet-4-6","usage":{"input_tokens":10}}}',
      "",
      "event: content_block_start",
      'data: {"type":"content_block_start","index":0,"content_block":{"type":"tool_use","id":"toolu_seeded","name":"lookup_weather","input":{"city":"Bangkok","unit":"c"}}}',
      "",
      "event: message_delta",
      'data: {"type":"message_delta","delta":{"stop_reason":"tool_use"},"usage":{"output_tokens":4}}',
      "",
      "event: message_stop",
      'data: {"type":"message_stop"}',
      "",
    ].join("\n");

    vi.stubGlobal("fetch", vi.fn(async () => new Response(
      makeStream(sse),
      { status: 200, headers: { "content-type": "text/event-stream" } },
    )));

    const app = createApp();

    const res = await request(app)
      .post("/v1/chat/completions")
      .set("Authorization", "Bearer gwtoken")
      .send({
        model: "claude-sonnet-4-6",
        stream: true,
        messages: [{ role: "user", content: "Call the weather tool" }],
      });

    expect(res.status).toBe(200);
    expect(res.text).toContain('"tool_calls"');
    expect(res.text).toContain('"name":"lookup_weather"');
    expect(res.text).toContain('\\"city\\":\\"Bangkok\\"');
    expect(res.text).toContain('\\"unit\\":\\"c\\"');
    expect(res.text).toContain('"finish_reason":"tool_calls"');
    expect(mockDeductCreditsForModel).toHaveBeenCalledWith(
      expect.objectContaining({
        inputTokens: 10,
        outputTokens: 4,
      }),
    );
  });

  it("does not bill or synthesize [DONE] when a Kie Claude stream ends without a terminal event", async () => {
    queueProviderAndMappingSelects({
      providerModelId: "claude-sonnet-4-6",
      apiStyle: "messages",
    });

    const sse = [
      "event: message_start",
      'data: {"type":"message_start","message":{"id":"msg_partial_123","model":"claude-sonnet-4-6","usage":{"input_tokens":9}}}',
      "",
      "event: content_block_delta",
      'data: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"Partial"}}',
      "",
    ].join("\n");

    vi.stubGlobal("fetch", vi.fn(async () => new Response(
      makeStream(sse),
      { status: 200, headers: { "content-type": "text/event-stream" } },
    )));

    const app = createApp();

    const res = await request(app)
      .post("/v1/chat/completions")
      .set("Authorization", "Bearer gwtoken")
      .send({
        model: "claude-sonnet-4-6",
        stream: true,
        messages: [{ role: "user", content: "hello" }],
      });

    expect(res.status).toBe(200);
    expect(String(res.headers["content-type"])).toContain("text/event-stream");
    expect(res.text).toContain('"content":"Partial"');
    expect(res.text).toContain("event: error");
    expect(res.text).toContain("ended before a terminal event");
    expect(res.text).not.toContain("data: [DONE]");
    expect(mockDeductCreditsForModel).not.toHaveBeenCalled();
  });

  it("translates Kie Claude messages responses back into OpenAI chat completion shape", async () => {
    queueProviderAndMappingSelects({
      providerModelId: "claude-sonnet-4-6",
      apiStyle: "messages",
    });

    vi.stubGlobal("fetch", vi.fn(async () => new Response(
      JSON.stringify({
        id: "msg_123",
        model: "claude-sonnet-4-6",
        stop_reason: "end_turn",
        content: [{ type: "text", text: "Hello from Claude" }],
        usage: {
          input_tokens: 11,
          output_tokens: 7,
        },
      }),
      { status: 200, headers: { "content-type": "application/json" } },
    )));

    const app = createApp();
    const res = await request(app)
      .post("/v1/chat/completions")
      .set("Authorization", "Bearer gwtoken")
      .send({
        model: "claude-sonnet-4-6",
        messages: [{ role: "user", content: "hello" }],
      });

    expect(res.status).toBe(200);
    expect(res.body.object).toBe("chat.completion");
    expect(res.body.choices[0].message.content).toBe("Hello from Claude");
    expect(res.body.usage).toEqual({
      prompt_tokens: 11,
      completion_tokens: 7,
      total_tokens: 18,
    });
    expect(res.body._meta.normalizedUsage).toEqual({
      inputTokens: 11,
      outputTokens: 7,
      totalTokens: 18,
      providerReportedCostUsd: undefined,
      providerReportedCreditsConsumed: undefined,
    });
  });

  it("transforms Claude tool round-trips into Anthropic tool_use and tool_result blocks upstream", async () => {
    queueProviderAndMappingSelects({
      providerModelId: "claude-sonnet-4-6",
      apiStyle: "messages",
    });

    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => new Response(
      JSON.stringify({
        id: "msg_tool_roundtrip",
        model: "claude-sonnet-4-6",
        stop_reason: "end_turn",
        content: [{ type: "text", text: "done" }],
        usage: {
          input_tokens: 12,
          output_tokens: 3,
        },
      }),
      { status: 200, headers: { "content-type": "application/json" } },
    ));
    vi.stubGlobal("fetch", fetchMock);

    const app = createApp();
    const res = await request(app)
      .post("/v1/chat/completions")
      .set("Authorization", "Bearer gwtoken")
      .send({
        model: "claude-sonnet-4-6",
        messages: [
          {
            role: "assistant",
            content: null,
            tool_calls: [
              {
                id: "call_weather",
                type: "function",
                function: {
                  name: "lookup_weather",
                  arguments: "{\"city\":\"Bangkok\"}",
                },
              },
            ],
          },
          {
            role: "tool",
            tool_call_id: "call_weather",
            content: "Sunny and 31C",
          },
        ],
      });

    expect(res.status).toBe(200);
    const upstreamBody = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body ?? "{}"));
    expect(upstreamBody.messages).toEqual([
      {
        role: "assistant",
        content: [
          {
            type: "tool_use",
            id: "call_weather",
            name: "lookup_weather",
            input: { city: "Bangkok" },
          },
        ],
      },
      {
        role: "user",
        content: [
          {
            type: "tool_result",
            tool_use_id: "call_weather",
            content: "Sunny and 31C",
          },
        ],
      },
    ]);
  });

  it("rejects Claude-only fields that are not documented for the specific Kie model config", async () => {
    queueProviderAndMappingSelects({
      providerModelId: "claude-sonnet-4-6",
      apiStyle: "messages",
    });
    const app = createApp();

    const res = await request(app)
      .post("/v1/chat/completions")
      .set("Authorization", "Bearer gwtoken")
      .send({
        model: "claude-sonnet-4-6",
        messages: [{ role: "user", content: "hello" }],
        output_config: { include_reasoning: true },
      });

    expect(res.status).toBe(400);
    expect(res.body.error.message).toContain("Unsupported request fields");
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it("rejects unknown top-level fields for Kie Gemini requests before upstream", async () => {
    queueProviderAndMappingSelects({
      providerModelId: "gemini-3-pro",
      apiStyle: "chat-completions",
    });
    const app = createApp();

    const res = await request(app)
      .post("/v1/chat/completions")
      .set("Authorization", "Bearer gwtoken")
      .send({
        model: "gemini-3-pro",
        messages: [{ role: "user", content: "hello" }],
        unsupported: true,
      });

    expect(res.status).toBe(400);
    expect(res.body.error.message).toContain("Unsupported request fields");
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });
});
