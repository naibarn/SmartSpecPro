diff --git a/apps/web/server/__tests__/responsesRoutes.test.ts b/apps/web/server/__tests__/responsesRoutes.test.ts
new file mode 100644
index 0000000..46ee033
--- /dev/null
+++ b/apps/web/server/__tests__/responsesRoutes.test.ts
@@ -0,0 +1,817 @@
+/**
+ * Tests for the Responses API proxy (/v1/responses)
+ *
+ * Feature: 032-Browser-Automation-Copilot, Section 03
+ */
+
+import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
+import express from "express";
+import request from "supertest";
+import { sanitizeResponsesBody, registerResponsesRoutes } from "../_core/responsesRoutes";
+
+// ── Env stubs (MUST be before any imports) ──────────────────
+process.env.JWT_SECRET =
+  process.env.JWT_SECRET || "test-secret-key-at-least-32-chars-long!!";
+process.env.SMARTSPEC_WEB_GATEWAY_TOKEN = "test-internal-token-value";
+process.env.LLM_GATEWAY_SERVICE_ACCOUNT_ID = "99";
+
+// ── Mock authz (to prevent tokens.ts from crashing) ─────────
+vi.mock("../_core/authz", () => ({
+  authorizeRequest: vi.fn().mockResolvedValue({ ok: true, userId: 42 }),
+  AuthResult: {},
+}));
+
+// ── Mock limits ─────────────────────────────────────────────
+vi.mock("../_core/limits", () => ({
+  enforceJsonBodyMaxBytes: () => (_req: any, _res: any, next: any) => next(),
+  rateLimit: () => (_req: any, _res: any, next: any) => next(),
+}));
+
+// ── Mock llmRoutes (avoid authz import chain) ───────────────
+vi.mock("../_core/llmRoutes", () => ({
+  resolveApiUrl: vi.fn().mockReturnValue("https://api.openai.com/v1/responses"),
+}));
+
+// ── Mock Redis ──────────────────────────────────────────────
+vi.mock("../../server/services/redis", () => ({
+  getRedisClient: () => ({
+    get: vi.fn().mockResolvedValue(null),
+    set: vi.fn().mockResolvedValue("OK"),
+    del: vi.fn().mockResolvedValue(1),
+  }),
+  isRedisAvailable: () => true,
+}));
+
+// ── Mock credit service ─────────────────────────────────────
+const mockDeductCreditsForModel = vi.fn().mockResolvedValue({ creditsUsed: 10, wasFree: false });
+const mockHasEnoughCredits = vi.fn().mockResolvedValue(true);
+const mockGetCreditBalance = vi.fn().mockResolvedValue({ credits: 900 });
+
+vi.mock("../../server/services/creditService", () => ({
+  getCreditBalance: (...args: any[]) => mockGetCreditBalance(...args),
+  getCreditBalanceByOpenId: vi.fn().mockResolvedValue(1000),
+  hasEnoughCredits: (...args: any[]) => mockHasEnoughCredits(...args),
+  deductCredits: vi.fn().mockResolvedValue(true),
+  deductCreditsForModel: (...args: any[]) => mockDeductCreditsForModel(...args),
+  calculateCreditsFromCost: vi.fn().mockImplementation((cost: number) => Math.ceil(cost * 1000)),
+  calculateCreditsForLLM: vi.fn().mockReturnValue(10),
+}));
+
+// ── Mock feature flags ──────────────────────────────────────
+const mockGetFeatureFlag = vi.fn().mockResolvedValue(true);
+const mockGetTenantFeatureFlag = vi.fn().mockResolvedValue(true);
+
+vi.mock("../../server/services/featureFlags", () => ({
+  getFeatureFlag: (...args: any[]) => mockGetFeatureFlag(...args),
+  getTenantFeatureFlag: (...args: any[]) => mockGetTenantFeatureFlag(...args),
+}));
+
+// ── Mock audit logger ───────────────────────────────────────
+const mockAuditLog = vi.fn();
+vi.mock("../../server/services/auditLogger", () => ({
+  auditLogger: { log: (...args: any[]) => mockAuditLog(...args) },
+}));
+
+// ── Mock cost tracker ───────────────────────────────────────
+const mockLogRequest = vi.fn().mockResolvedValue(undefined);
+vi.mock("../../server/services/costTracker", () => ({
+  logRequest: (...args: any[]) => mockLogRequest(...args),
+}));
+
+// ── Mock trace context ──────────────────────────────────────
+vi.mock("../../server/services/traceContext", () => ({
+  getTraceId: vi.fn().mockReturnValue("test-trace-id"),
+}));
+
+// ── Mock logger ─────────────────────────────────────────────
+vi.mock("../_core/logger", () => ({
+  debugLog: vi.fn(),
+  debugError: vi.fn(),
+}));
+
+// ── Mock fetch (global) ─────────────────────────────────────
+const mockFetch = vi.fn();
+vi.stubGlobal("fetch", mockFetch);
+
+// ── Helpers ─────────────────────────────────────────────────
+
+function createMockDeps(overrides?: Partial<Record<string, any>>) {
+  return {
+    guardWithCreditsOrInternalToken: vi
+      .fn()
+      .mockResolvedValue({ ok: true, userId: 42, isInternal: false }),
+    verifyInternalToken: vi.fn().mockReturnValue(false),
+    getActiveLlmProvider: vi.fn().mockResolvedValue({
+      providerId: 1,
+      providerName: "openai",
+      baseUrl: "https://api.openai.com/v1",
+      apiKey: "sk-test-key",
+      defaultModel: "gpt-5.4",
+    }),
+    getLlmProviderById: vi.fn().mockResolvedValue(null),
+    resolveProviderModelAny: vi.fn().mockResolvedValue({
+      providerModelId: "gpt-5.4",
+      apiStyle: "responses" as const,
+    }),
+    resolveProviderModel: vi.fn().mockResolvedValue(null),
+    acquireProviderSlot: vi.fn().mockResolvedValue({ queuePosition: 0 }),
+    releaseProviderSlot: vi.fn(),
+    recordModelUsage: vi.fn(),
+    ...overrides,
+  };
+}
+
+function createApp(deps: ReturnType<typeof createMockDeps>) {
+  const app = express();
+  app.use(express.json());
+  registerResponsesRoutes(app, deps);
+  return app;
+}
+
+function makeResponsesApiResponse(overrides?: Record<string, any>) {
+  return {
+    id: "resp_test123",
+    object: "response",
+    model: "gpt-5.4",
+    output: [
+      {
+        type: "message",
+        role: "assistant",
+        content: [{ type: "output_text", text: "Hello!" }],
+      },
+    ],
+    usage: {
+      input_tokens: 100,
+      output_tokens: 50,
+      total_tokens: 150,
+    },
+    ...overrides,
+  };
+}
+
+function makeFetchResponse(body: any, status = 200) {
+  return {
+    ok: status >= 200 && status < 300,
+    status,
+    statusText: status === 200 ? "OK" : "Error",
+    json: () => Promise.resolve(body),
+    text: () => Promise.resolve(JSON.stringify(body)),
+    body: null,
+  } as any;
+}
+
+function makeSSEStream(events: string[]): ReadableStream<Uint8Array> {
+  const encoder = new TextEncoder();
+  const combined = events.join("\n") + "\n";
+  return new ReadableStream({
+    start(controller) {
+      controller.enqueue(encoder.encode(combined));
+      controller.close();
+    },
+  });
+}
+
+// ═══════════════════════════════════════════════════════════════
+// Tests
+// ═══════════════════════════════════════════════════════════════
+
+describe("sanitizeResponsesBody", () => {
+  it("rejects missing model field", () => {
+    const result = sanitizeResponsesBody({ input: [{ role: "user", content: "hi" }] });
+    expect(result.ok).toBe(false);
+    if (!result.ok) {
+      expect(result.status).toBe(400);
+      expect(result.error).toContain("model");
+    }
+  });
+
+  it("rejects missing input field", () => {
+    const result = sanitizeResponsesBody({ model: "gpt-5.4" });
+    expect(result.ok).toBe(false);
+    if (!result.ok) {
+      expect(result.status).toBe(400);
+      expect(result.error).toContain("input");
+    }
+  });
+
+  it("enforces store=false by default", () => {
+    const result = sanitizeResponsesBody({
+      model: "gpt-5.4",
+      input: [{ role: "user", content: "hi" }],
+    });
+    expect(result.ok).toBe(true);
+    if (result.ok) {
+      expect(result.body.store).toBe(false);
+    }
+  });
+
+  it("overrides store=true when tenant disallows", () => {
+    const result = sanitizeResponsesBody(
+      { model: "gpt-5.4", input: [{ role: "user", content: "hi" }], store: true },
+      false,
+    );
+    expect(result.ok).toBe(true);
+    if (result.ok) {
+      expect(result.body.store).toBe(false);
+    }
+  });
+
+  it("allows store=true when tenant allows", () => {
+    const result = sanitizeResponsesBody(
+      { model: "gpt-5.4", input: [{ role: "user", content: "hi" }], store: true },
+      true,
+    );
+    expect(result.ok).toBe(true);
+    if (result.ok) {
+      expect(result.body.store).toBe(true);
+    }
+  });
+
+  it("accepts valid payload and strips unknown fields", () => {
+    const result = sanitizeResponsesBody({
+      model: "gpt-5.4",
+      input: [{ role: "user", content: "hi" }],
+      temperature: 0.7,
+      unknownField: "should be removed",
+      _internal: true,
+    });
+    expect(result.ok).toBe(true);
+    if (result.ok) {
+      expect(result.body.model).toBe("gpt-5.4");
+      expect(result.body.temperature).toBe(0.7);
+      expect(result.body).not.toHaveProperty("unknownField");
+      expect(result.body).not.toHaveProperty("_internal");
+    }
+  });
+
+  it("extracts max_budget_credits from body", () => {
+    const result = sanitizeResponsesBody({
+      model: "gpt-5.4",
+      input: [{ role: "user", content: "hi" }],
+      max_budget_credits: 100,
+    });
+    expect(result.ok).toBe(true);
+    if (result.ok) {
+      expect(result.maxBudgetCredits).toBe(100);
+      expect(result.body).not.toHaveProperty("max_budget_credits");
+    }
+  });
+
+  it("uses default budget when not specified", () => {
+    const result = sanitizeResponsesBody({
+      model: "gpt-5.4",
+      input: [{ role: "user", content: "hi" }],
+    });
+    expect(result.ok).toBe(true);
+    if (result.ok) {
+      expect(result.maxBudgetCredits).toBe(500);
+    }
+  });
+});
+
+describe("/v1/responses endpoint", () => {
+  let deps: ReturnType<typeof createMockDeps>;
+  let app: express.Express;
+
+  beforeEach(() => {
+    mockFetch.mockReset();
+    mockAuditLog.mockClear();
+    mockLogRequest.mockResolvedValue(undefined);
+    mockGetFeatureFlag.mockResolvedValue(true);
+    mockGetTenantFeatureFlag.mockResolvedValue(true);
+    mockHasEnoughCredits.mockResolvedValue(true);
+    mockDeductCreditsForModel.mockResolvedValue({ creditsUsed: 10, wasFree: false });
+    mockGetCreditBalance.mockResolvedValue({ credits: 900 });
+
+    deps = createMockDeps();
+    app = createApp(deps);
+  });
+
+  afterEach(() => {
+    mockFetch.mockReset();
+  });
+
+  // === Feature Flag Gating ===
+
+  describe("feature flag gating", () => {
+    it("returns 404 when global responsesApi flag is off", async () => {
+      mockGetFeatureFlag.mockResolvedValue(false);
+
+      const res = await request(app)
+        .post("/v1/responses")
+        .send({ model: "gpt-5.4", input: [{ role: "user", content: "hi" }] });
+
+      expect(res.status).toBe(404);
+      expect(res.body.error.message).toBe("Not found");
+    });
+
+    it("returns 403 when tenant flag is off", async () => {
+      mockGetFeatureFlag.mockResolvedValue(true);
+      mockGetTenantFeatureFlag.mockResolvedValue(false);
+
+      const res = await request(app)
+        .post("/v1/responses")
+        .send({ model: "gpt-5.4", input: [{ role: "user", content: "hi" }] });
+
+      expect(res.status).toBe(403);
+      expect(res.body.error.message).toContain("not enabled");
+    });
+
+    it("proceeds when both flags are on", async () => {
+      mockFetch.mockResolvedValue(makeFetchResponse(makeResponsesApiResponse()));
+
+      const res = await request(app)
+        .post("/v1/responses")
+        .send({ model: "gpt-5.4", input: [{ role: "user", content: "hi" }] });
+
+      expect(res.status).toBe(200);
+    });
+  });
+
+  // === Request Validation ===
+
+  describe("request validation", () => {
+    it("rejects request missing model field", async () => {
+      const res = await request(app)
+        .post("/v1/responses")
+        .send({ input: [{ role: "user", content: "hi" }] });
+
+      expect(res.status).toBe(400);
+      expect(res.body.error.message).toContain("model");
+    });
+
+    it("rejects request missing input field", async () => {
+      const res = await request(app)
+        .post("/v1/responses")
+        .send({ model: "gpt-5.4" });
+
+      expect(res.status).toBe(400);
+      expect(res.body.error.message).toContain("input");
+    });
+
+    it("accepts valid Responses API payload", async () => {
+      mockFetch.mockResolvedValue(makeFetchResponse(makeResponsesApiResponse()));
+
+      const res = await request(app)
+        .post("/v1/responses")
+        .send({
+          model: "gpt-5.4",
+          input: [{ role: "user", content: "Search for latest news" }],
+          tools: [{ type: "web_search_preview" }],
+        });
+
+      expect(res.status).toBe(200);
+      expect(res.body.id).toBe("resp_test123");
+    });
+  });
+
+  // === Non-Streaming Mode ===
+
+  describe("non-streaming mode", () => {
+    it("returns JSON response with usage parsed", async () => {
+      const responseData = makeResponsesApiResponse();
+      mockFetch.mockResolvedValue(makeFetchResponse(responseData));
+
+      const res = await request(app)
+        .post("/v1/responses")
+        .send({
+          model: "gpt-5.4",
+          input: [{ role: "user", content: "hello" }],
+        });
+
+      expect(res.status).toBe(200);
+      expect(res.body.usage.input_tokens).toBe(100);
+      expect(res.body.usage.output_tokens).toBe(50);
+    });
+
+    it("deducts credits from usage", async () => {
+      mockFetch.mockResolvedValue(makeFetchResponse(makeResponsesApiResponse()));
+
+      await request(app)
+        .post("/v1/responses")
+        .send({
+          model: "gpt-5.4",
+          input: [{ role: "user", content: "hello" }],
+        });
+
+      expect(mockDeductCreditsForModel).toHaveBeenCalledWith(
+        expect.objectContaining({
+          userId: 42,
+          model: "gpt-5.4",
+          sourceType: "browser_automation",
+        }),
+      );
+    });
+
+    it("adds _credits and _meta to response", async () => {
+      mockFetch.mockResolvedValue(makeFetchResponse(makeResponsesApiResponse()));
+
+      const res = await request(app)
+        .post("/v1/responses")
+        .send({
+          model: "gpt-5.4",
+          input: [{ role: "user", content: "hello" }],
+        });
+
+      expect(res.body._credits).toBeDefined();
+      expect(res.body._credits.remaining).toBe(900);
+      expect(res.body._meta).toBeDefined();
+      expect(res.body._meta.traceId).toBe("test-trace-id");
+    });
+  });
+
+  // === Tool-Call Loop ===
+
+  describe("tool-call loop", () => {
+    it("dispatches function_call to internal tool route", async () => {
+      // First response has a function call
+      const firstResponse = makeResponsesApiResponse({
+        output: [
+          {
+            type: "function_call",
+            id: "fc_1",
+            call_id: "call_1",
+            name: "browser.execute_actions",
+            arguments: '{"action":"click","selector":"#btn"}',
+          },
+        ],
+      });
+
+      // Second response is final
+      const secondResponse = makeResponsesApiResponse();
+
+      mockFetch
+        .mockResolvedValueOnce(makeFetchResponse(firstResponse)) // OpenAI first call
+        .mockResolvedValueOnce({
+          // Internal tool dispatch
+          ok: true,
+          status: 200,
+          text: () => Promise.resolve('{"result":"clicked"}'),
+        })
+        .mockResolvedValueOnce(makeFetchResponse(secondResponse)); // OpenAI second call
+
+      const res = await request(app)
+        .post("/v1/responses")
+        .send({
+          model: "gpt-5.4",
+          input: [{ role: "user", content: "click the button" }],
+        });
+
+      expect(res.status).toBe(200);
+      // Should have made 3 fetch calls: 2 to OpenAI + 1 to internal tool
+      expect(mockFetch).toHaveBeenCalledTimes(3);
+    });
+
+    it("stops loop after MAX_TOOL_ROUNDS", async () => {
+      // Always return a function call to trigger loop
+      const fcResponse = makeResponsesApiResponse({
+        output: [
+          {
+            type: "function_call",
+            id: "fc_1",
+            call_id: "call_1",
+            name: "browser.execute_actions",
+            arguments: "{}",
+          },
+        ],
+      });
+
+      // Mock: every call returns a function call
+      mockFetch.mockImplementation(async (url: string) => {
+        if (url.includes("internal")) {
+          return {
+            ok: true,
+            status: 200,
+            text: () => Promise.resolve('{"result":"ok"}'),
+          };
+        }
+        return makeFetchResponse(fcResponse);
+      });
+
+      const res = await request(app)
+        .post("/v1/responses")
+        .send({
+          model: "gpt-5.4",
+          input: [{ role: "user", content: "loop test" }],
+        });
+
+      expect(res.status).toBe(200);
+      // Should cap at MAX_TOOL_ROUNDS (10) rounds of OpenAI calls + tool dispatches
+      // At most 10 OpenAI calls + 10 tool calls = 20 total
+      expect(mockFetch.mock.calls.length).toBeLessThanOrEqual(20);
+    });
+
+    it("sends error output to OpenAI when tool call fails", async () => {
+      const fcResponse = makeResponsesApiResponse({
+        output: [
+          {
+            type: "function_call",
+            id: "fc_1",
+            call_id: "call_1",
+            name: "browser.execute_actions",
+            arguments: "{}",
+          },
+        ],
+      });
+
+      const finalResponse = makeResponsesApiResponse();
+
+      mockFetch
+        .mockResolvedValueOnce(makeFetchResponse(fcResponse))
+        .mockResolvedValueOnce({
+          ok: false,
+          status: 500,
+          statusText: "Internal Server Error",
+          text: () => Promise.resolve("Tool broke"),
+        })
+        .mockResolvedValueOnce(makeFetchResponse(finalResponse));
+
+      const res = await request(app)
+        .post("/v1/responses")
+        .send({
+          model: "gpt-5.4",
+          input: [{ role: "user", content: "test" }],
+        });
+
+      expect(res.status).toBe(200);
+
+      // Verify the second OpenAI call included function_call_output with error
+      const secondOpenAICall = mockFetch.mock.calls[2];
+      const secondBody = JSON.parse(secondOpenAICall[1].body);
+      const toolOutputs = secondBody.input.filter(
+        (item: any) => item.type === "function_call_output",
+      );
+      expect(toolOutputs.length).toBe(1);
+      expect(toolOutputs[0].output).toContain("error");
+    });
+
+    it("stops loop when budget is exceeded", async () => {
+      const fcResponse = makeResponsesApiResponse({
+        output: [
+          {
+            type: "function_call",
+            id: "fc_1",
+            call_id: "call_1",
+            name: "browser.execute_actions",
+            arguments: "{}",
+          },
+        ],
+        usage: { input_tokens: 5000, output_tokens: 5000, total_tokens: 10000 },
+      });
+
+      mockFetch.mockImplementation(async (url: string) => {
+        if (url.includes("internal")) {
+          return {
+            ok: true,
+            status: 200,
+            text: () => Promise.resolve('{"result":"ok"}'),
+          };
+        }
+        return makeFetchResponse(fcResponse);
+      });
+
+      const res = await request(app)
+        .post("/v1/responses")
+        .send({
+          model: "gpt-5.4",
+          input: [{ role: "user", content: "expensive" }],
+          max_budget_credits: 5, // Very low budget
+        });
+
+      expect(res.status).toBe(200);
+      expect(res.body._meta.budgetExceeded).toBe(true);
+    });
+  });
+
+  // === web_search Tracking ===
+
+  describe("web_search tracking", () => {
+    it("counts web_search_call items for cost tracking", async () => {
+      const responseWithSearch = makeResponsesApiResponse({
+        output: [
+          { type: "web_search_call", id: "ws_1", status: "completed" },
+          { type: "web_search_call", id: "ws_2", status: "completed" },
+          {
+            type: "message",
+            role: "assistant",
+            content: [{ type: "output_text", text: "Search results" }],
+          },
+        ],
+      });
+
+      mockFetch.mockResolvedValue(makeFetchResponse(responseWithSearch));
+
+      const res = await request(app)
+        .post("/v1/responses")
+        .send({
+          model: "gpt-5.4",
+          input: [{ role: "user", content: "search test" }],
+          tools: [{ type: "web_search_preview" }],
+        });
+
+      expect(res.status).toBe(200);
+      expect(res.body._meta.webSearchCalls).toBe(2);
+
+      // Verify web_search cost was deducted separately
+      expect(mockDeductCreditsForModel).toHaveBeenCalledWith(
+        expect.objectContaining({
+          model: "web_search",
+          costUsd: 0.02, // 2 calls * $0.01
+        }),
+      );
+    });
+
+    it("logs web_search as separate audit event", async () => {
+      const responseWithSearch = makeResponsesApiResponse({
+        output: [
+          { type: "web_search_call", id: "ws_1", status: "completed" },
+          {
+            type: "message",
+            role: "assistant",
+            content: [{ type: "output_text", text: "Result" }],
+          },
+        ],
+      });
+
+      mockFetch.mockResolvedValue(makeFetchResponse(responseWithSearch));
+
+      await request(app)
+        .post("/v1/responses")
+        .send({
+          model: "gpt-5.4",
+          input: [{ role: "user", content: "search" }],
+        });
+
+      const webSearchLogs = mockAuditLog.mock.calls.filter(
+        (call: any[]) => call[0]?.eventType === "web_search_call",
+      );
+      expect(webSearchLogs.length).toBe(1);
+      expect(webSearchLogs[0][0].metadata.searchCallCount).toBe(1);
+    });
+  });
+
+  // === Budget Cap ===
+
+  describe("budget cap", () => {
+    it("uses max_budget_credits from request body", async () => {
+      mockFetch.mockResolvedValue(makeFetchResponse(makeResponsesApiResponse()));
+
+      const res = await request(app)
+        .post("/v1/responses")
+        .send({
+          model: "gpt-5.4",
+          input: [{ role: "user", content: "hello" }],
+          max_budget_credits: 100,
+        });
+
+      expect(res.status).toBe(200);
+      // Budget metadata should be available
+      expect(res.body._meta.budgetExceeded).toBe(false);
+    });
+
+    it("uses default budget when not specified", async () => {
+      mockFetch.mockResolvedValue(makeFetchResponse(makeResponsesApiResponse()));
+
+      const res = await request(app)
+        .post("/v1/responses")
+        .send({
+          model: "gpt-5.4",
+          input: [{ role: "user", content: "hello" }],
+        });
+
+      expect(res.status).toBe(200);
+    });
+
+    it("stops loop when credit balance is insufficient", async () => {
+      mockHasEnoughCredits.mockResolvedValue(false);
+
+      const fcResponse = makeResponsesApiResponse({
+        output: [
+          {
+            type: "function_call",
+            id: "fc_1",
+            call_id: "call_1",
+            name: "browser.execute_actions",
+            arguments: "{}",
+          },
+        ],
+      });
+
+      mockFetch.mockResolvedValue(makeFetchResponse(fcResponse));
+
+      const res = await request(app)
+        .post("/v1/responses")
+        .send({
+          model: "gpt-5.4",
+          input: [{ role: "user", content: "test" }],
+        });
+
+      expect(res.status).toBe(200);
+      expect(res.body._meta.budgetExceeded).toBe(true);
+    });
+  });
+
+  // === Auth ===
+
+  describe("auth", () => {
+    it("returns 401 when auth fails", async () => {
+      deps = createMockDeps({
+        guardWithCreditsOrInternalToken: vi
+          .fn()
+          .mockResolvedValue({ ok: false }),
+      });
+      // Auth failure sends its own response, so we need a mock that calls res.status
+      deps.guardWithCreditsOrInternalToken = vi.fn().mockImplementation(async (_req: any, res: any) => {
+        res.status(401).json({ error: { message: "Unauthorized" } });
+        return { ok: false };
+      });
+      app = createApp(deps);
+
+      const res = await request(app)
+        .post("/v1/responses")
+        .send({
+          model: "gpt-5.4",
+          input: [{ role: "user", content: "hello" }],
+        });
+
+      expect(res.status).toBe(401);
+    });
+  });
+
+  // === Audit Logging ===
+
+  describe("audit logging", () => {
+    it("logs responses_api_call events", async () => {
+      mockFetch.mockResolvedValue(makeFetchResponse(makeResponsesApiResponse()));
+
+      await request(app)
+        .post("/v1/responses")
+        .send({
+          model: "gpt-5.4",
+          input: [{ role: "user", content: "hello" }],
+        });
+
+      const responsesLogs = mockAuditLog.mock.calls.filter(
+        (call: any[]) => call[0]?.eventType === "responses_api_call",
+      );
+      // Should have at least 2: request + response
+      expect(responsesLogs.length).toBeGreaterThanOrEqual(2);
+    });
+
+    it("logs browser_tool_call events for function calls", async () => {
+      const fcResponse = makeResponsesApiResponse({
+        output: [
+          {
+            type: "function_call",
+            id: "fc_1",
+            call_id: "call_1",
+            name: "browser.execute_actions",
+            arguments: "{}",
+          },
+        ],
+      });
+
+      mockFetch
+        .mockResolvedValueOnce(makeFetchResponse(fcResponse))
+        .mockResolvedValueOnce({
+          ok: true,
+          status: 200,
+          text: () => Promise.resolve('{"result":"ok"}'),
+        })
+        .mockResolvedValueOnce(makeFetchResponse(makeResponsesApiResponse()));
+
+      await request(app)
+        .post("/v1/responses")
+        .send({
+          model: "gpt-5.4",
+          input: [{ role: "user", content: "click" }],
+        });
+
+      const toolLogs = mockAuditLog.mock.calls.filter(
+        (call: any[]) => call[0]?.eventType === "browser_tool_call",
+      );
+      expect(toolLogs.length).toBe(1);
+      expect(toolLogs[0][0].metadata.toolName).toBe("browser.execute_actions");
+    });
+  });
+
+  // === Provider/Model Resolution ===
+
+  describe("provider resolution", () => {
+    it("returns 503 when no provider configured", async () => {
+      deps = createMockDeps({
+        getActiveLlmProvider: vi.fn().mockResolvedValue(null),
+      });
+      app = createApp(deps);
+
+      const res = await request(app)
+        .post("/v1/responses")
+        .send({
+          model: "gpt-5.4",
+          input: [{ role: "user", content: "hello" }],
+        });
+
+      expect(res.status).toBe(503);
+    });
+  });
+});
diff --git a/apps/web/server/_core/llmRoutes.ts b/apps/web/server/_core/llmRoutes.ts
index 2f90fdc..c99d6d3 100644
--- a/apps/web/server/_core/llmRoutes.ts
+++ b/apps/web/server/_core/llmRoutes.ts
@@ -19,6 +19,7 @@ import { handleChatWithRouter, handleStreamWithRouter } from "../services/llmRou
 import { auditLogger } from "../services/auditLogger";
 import { getTraceId } from "../services/traceContext";
 import { logRequest as logCostRequest } from "../services/costTracker";
+import { registerResponsesRoutes } from "./responsesRoutes";
 
 // --- Provider-specific Rate Limiter with Queue System ---
 // Uses Bottleneck with Redis for distributed rate limiting when available
@@ -1277,6 +1278,19 @@ export function registerLLMRoutes(app: Express) {
     }
   );
 
+  // Responses API endpoint (/v1/responses) — for GPT-5.x web_search & function tools
+  registerResponsesRoutes(app, {
+    guardWithCreditsOrInternalToken,
+    verifyInternalToken,
+    getActiveLlmProvider,
+    getLlmProviderById,
+    resolveProviderModelAny,
+    resolveProviderModel,
+    acquireProviderSlot,
+    releaseProviderSlot,
+    recordModelUsage,
+  });
+
   // Models endpoint - returns models from enabled providers in database
   app.get("/v1/models", llmLimiter, async (req: Request, res: Response) => {
     const auth = await authorizeRequest(req, { allowBearer: true, allowSession: true });
diff --git a/apps/web/server/_core/responsesRoutes.ts b/apps/web/server/_core/responsesRoutes.ts
new file mode 100644
index 0000000..4607704
--- /dev/null
+++ b/apps/web/server/_core/responsesRoutes.ts
@@ -0,0 +1,1163 @@
+/**
+ * Responses API Proxy — /v1/responses
+ *
+ * Proxies requests to OpenAI's Responses API (GPT-5.x with web_search & function tools).
+ * Handles SSE streaming, tool-call loop for custom function tools, web_search cost tracking,
+ * and per-request budget cap enforcement.
+ *
+ * Feature: 032-Browser-Automation-Copilot, Section 03
+ */
+
+import type { Express, Request, Response } from "express";
+import { enforceJsonBodyMaxBytes, rateLimit } from "./limits";
+import { debugLog, debugError } from "./logger";
+import { auditLogger } from "../services/auditLogger";
+import { getTraceId } from "../services/traceContext";
+import { logRequest as logCostRequest } from "../services/costTracker";
+import { getFeatureFlag, getTenantFeatureFlag } from "../services/featureFlags";
+import {
+  deductCreditsForModel,
+  calculateCreditsForLLM,
+  calculateCreditsFromCost,
+  getCreditBalance,
+  hasEnoughCredits,
+} from "../services/creditService";
+import { resolveApiUrl, type ApiStyle } from "./llmRoutes";
+
+// ---------------------------------------------------------------------------
+// Constants
+// ---------------------------------------------------------------------------
+
+const MAX_TOOL_ROUNDS = 10;
+const WEB_SEARCH_COST_USD = 0.01; // $0.01 per web_search call
+const DEFAULT_MAX_BUDGET_CREDITS = 500;
+const SOCKET_TIMEOUT_MS = 600_000; // 10 min
+
+const MAX_LLM_BODY_BYTES = parseInt(
+  process.env.WEB_LLM_MAX_BODY_BYTES || "2097152",
+);
+const LLM_RPM = parseInt(process.env.WEB_LLM_RPM || "120");
+
+// Fields allowed to be forwarded to the OpenAI Responses API
+const ALLOWED_FIELDS = new Set([
+  "model",
+  "input",
+  "instructions",
+  "tools",
+  "tool_choice",
+  "temperature",
+  "top_p",
+  "max_output_tokens",
+  "store",
+  "metadata",
+  "stream",
+  "previous_response_id",
+]);
+
+// ---------------------------------------------------------------------------
+// Types
+// ---------------------------------------------------------------------------
+
+interface BudgetState {
+  maxBudgetCredits: number;
+  accumulatedCredits: number;
+  currentRound: number;
+  totalInputTokens: number;
+  totalOutputTokens: number;
+  webSearchCalls: number;
+}
+
+interface ToolDispatchResult {
+  callId: string;
+  output: string;
+}
+
+interface SanitizeSuccess {
+  ok: true;
+  body: Record<string, unknown>;
+  maxBudgetCredits: number;
+  stream: boolean;
+}
+
+interface SanitizeError {
+  ok: false;
+  error: string;
+  status: number;
+}
+
+type SanitizeResult = SanitizeSuccess | SanitizeError;
+
+// ---------------------------------------------------------------------------
+// Internal tool dispatch registry
+// ---------------------------------------------------------------------------
+
+const TOOL_DISPATCH_MAP: Record<string, string> = {
+  "browser.execute_actions": "/api/internal/tools/browser",
+  "sandbox.exec_command": "/api/internal/tools/sandbox",
+};
+
+// ---------------------------------------------------------------------------
+// Helpers
+// ---------------------------------------------------------------------------
+
+/**
+ * Sanitize and validate a Responses API request body.
+ * Enforces store=false default, validates required fields, strips unknown fields.
+ */
+export function sanitizeResponsesBody(
+  body: any,
+  tenantStoreAllowed: boolean = false,
+): SanitizeResult {
+  if (!body || typeof body !== "object") {
+    return { ok: false, error: "Request body must be a JSON object", status: 400 };
+  }
+
+  if (!body.model || typeof body.model !== "string") {
+    return { ok: false, error: 'Missing required field: "model"', status: 400 };
+  }
+
+  if (!body.input || !Array.isArray(body.input)) {
+    return { ok: false, error: 'Missing required field: "input" (must be an array)', status: 400 };
+  }
+
+  // Extract custom budget field before filtering
+  const maxBudgetCredits =
+    typeof body.max_budget_credits === "number" && body.max_budget_credits > 0
+      ? body.max_budget_credits
+      : DEFAULT_MAX_BUDGET_CREDITS;
+
+  // Filter to allowed fields only
+  const sanitized: Record<string, unknown> = {};
+  for (const key of ALLOWED_FIELDS) {
+    if (key in body) {
+      sanitized[key] = body[key];
+    }
+  }
+
+  // Enforce store=false (ZDR compliance)
+  if (sanitized.store === true && !tenantStoreAllowed) {
+    sanitized.store = false;
+  }
+  if (sanitized.store === undefined) {
+    sanitized.store = false;
+  }
+
+  const stream = Boolean(sanitized.stream);
+
+  return { ok: true, body: sanitized, maxBudgetCredits, stream };
+}
+
+/**
+ * Count web_search_call items in a Responses API output array.
+ */
+function countWebSearchCalls(output: unknown[]): number {
+  if (!Array.isArray(output)) return 0;
+  return output.filter(
+    (item: any) => item?.type === "web_search_call",
+  ).length;
+}
+
+/**
+ * Extract function_call items from a Responses API output array.
+ */
+function extractFunctionCalls(
+  output: unknown[],
+): Array<{ id: string; callId: string; name: string; arguments: string }> {
+  if (!Array.isArray(output)) return [];
+  return output
+    .filter((item: any) => item?.type === "function_call")
+    .map((item: any) => ({
+      id: item.id,
+      callId: item.call_id || item.id,
+      name: item.name,
+      arguments: item.arguments || "{}",
+    }));
+}
+
+/**
+ * Parse usage from a Responses API response (JSON or SSE event).
+ */
+function parseResponsesUsage(data: any): {
+  inputTokens: number;
+  outputTokens: number;
+  totalTokens: number;
+} {
+  const usage = data?.usage;
+  if (!usage) return { inputTokens: 0, outputTokens: 0, totalTokens: 0 };
+  return {
+    inputTokens: usage.input_tokens || 0,
+    outputTokens: usage.output_tokens || 0,
+    totalTokens: usage.total_tokens || usage.input_tokens + usage.output_tokens || 0,
+  };
+}
+
+/**
+ * Build upstream request headers for the provider.
+ */
+function buildHeaders(apiKey: string): Record<string, string> {
+  return {
+    Authorization: `Bearer ${apiKey}`,
+    "Content-Type": "application/json",
+  };
+}
+
+/**
+ * Dispatch a function call to an internal tool handler.
+ */
+async function dispatchFunctionCall(
+  toolName: string,
+  args: string,
+  internalToken: string,
+  userId: number,
+): Promise<string> {
+  const route = TOOL_DISPATCH_MAP[toolName];
+  if (!route) {
+    return JSON.stringify({ error: `Unknown tool: ${toolName}` });
+  }
+
+  const baseUrl = `http://localhost:${process.env.PORT || 3000}`;
+  try {
+    const resp = await fetch(`${baseUrl}${route}`, {
+      method: "POST",
+      headers: {
+        "Content-Type": "application/json",
+        "X-Internal-Token": internalToken,
+        "X-User-Id": String(userId),
+      },
+      body: args,
+      signal: AbortSignal.timeout(120_000), // 2 min per tool call
+    });
+
+    if (!resp.ok) {
+      const errText = await resp.text().catch(() => resp.statusText);
+      return JSON.stringify({ error: `Tool call failed (${resp.status}): ${errText}` });
+    }
+
+    return await resp.text();
+  } catch (err: any) {
+    return JSON.stringify({ error: `Tool dispatch error: ${err?.message || "unknown"}` });
+  }
+}
+
+/**
+ * Estimate credits for a round based on average from previous rounds.
+ */
+function estimateNextRoundCredits(budget: BudgetState): number {
+  if (budget.currentRound === 0) return 10; // Conservative default
+  const avgPerRound = budget.accumulatedCredits / budget.currentRound;
+  return Math.ceil(avgPerRound * 1.2); // 20% buffer
+}
+
+// ---------------------------------------------------------------------------
+// Main export
+// ---------------------------------------------------------------------------
+
+/**
+ * Register the /v1/responses endpoint on the Express app.
+ * Called from registerLLMRoutes() in llmRoutes.ts.
+ */
+export function registerResponsesRoutes(
+  app: Express,
+  deps: {
+    guardWithCreditsOrInternalToken: (
+      req: Request,
+      res: Response,
+    ) => Promise<
+      { ok: true; userId: number; isInternal: boolean } | { ok: false }
+    >;
+    verifyInternalToken: (req: Request) => boolean;
+    getActiveLlmProvider: () => Promise<any>;
+    getLlmProviderById: (id: number) => Promise<any>;
+    resolveProviderModelAny: (modelId: string) => Promise<any>;
+    resolveProviderModel: (
+      modelId: string,
+      providerId: number,
+    ) => Promise<any>;
+    acquireProviderSlot: (
+      providerName: string,
+      isFreeModel?: boolean,
+    ) => Promise<{ queuePosition: number }>;
+    releaseProviderSlot: (providerName: string) => void;
+    recordModelUsage: (
+      providerName: string,
+      modelId: string,
+      success: boolean,
+      inputTokens?: number,
+      outputTokens?: number,
+    ) => void;
+  },
+) {
+  const llmLimiter = rateLimit("llm-responses", { rpm: LLM_RPM });
+
+  app.post(
+    "/v1/responses",
+    // Skip IP rate limiter for internal token callers
+    (req: Request, res: Response, next: Function) => {
+      const isInternal = deps.verifyInternalToken(req);
+      if (isInternal) {
+        (res.locals as any).skipIpRateLimit = true;
+        (res.locals as any).verifiedInternalToken = true;
+      }
+      next();
+    },
+    llmLimiter,
+    enforceJsonBodyMaxBytes(MAX_LLM_BODY_BYTES),
+    async (req: Request, res: Response) => {
+      req.socket.setTimeout(SOCKET_TIMEOUT_MS);
+      res.setTimeout(SOCKET_TIMEOUT_MS);
+
+      const traceId = getTraceId();
+      const startTime = Date.now();
+
+      // --- Feature flag gating ---
+      try {
+        const globalEnabled = await getFeatureFlag("responsesApi");
+        if (!globalEnabled) {
+          return res
+            .status(404)
+            .json({ error: { message: "Not found" } });
+        }
+
+        // Extract tenant ID from auth context (will be available after auth check)
+        // For now check global only; tenant check happens after auth
+      } catch (err) {
+        debugError("responses", "Feature flag check failed", err);
+        // Fail open for global check errors — tenant check below is authoritative
+      }
+
+      // --- Auth ---
+      const check = await deps.guardWithCreditsOrInternalToken(req, res);
+      if (!check.ok) return;
+
+      const { userId, isInternal } = check;
+
+      // Tenant-level feature flag (uses userId-based tenant resolution)
+      // For internal callers, use the tenant from X-Tenant-Id header or default
+      const tenantId =
+        (req.headers["x-tenant-id"] as string) || "default";
+      try {
+        const tenantEnabled = await getTenantFeatureFlag(
+          "responsesApi",
+          tenantId,
+        );
+        if (!tenantEnabled) {
+          return res.status(403).json({
+            error: {
+              message: "Feature not enabled for this tenant",
+            },
+          });
+        }
+      } catch (err) {
+        debugError("responses", "Tenant feature flag check failed", err);
+      }
+
+      // --- Sanitize body ---
+      const sanitizeResult = sanitizeResponsesBody(req.body);
+      if (!sanitizeResult.ok) {
+        return res
+          .status(sanitizeResult.status)
+          .json({ error: { message: sanitizeResult.error } });
+      }
+
+      const { body: sanitizedBody, maxBudgetCredits, stream } =
+        sanitizeResult;
+
+      // --- Resolve provider & model ---
+      const preferredProviderId = req.body?.preferredProvider;
+      let provider: any = null;
+
+      if (preferredProviderId != null) {
+        provider = await deps.getLlmProviderById(preferredProviderId);
+      }
+      if (!provider) {
+        provider = await deps.getActiveLlmProvider();
+      }
+
+      if (!provider) {
+        return res.status(503).json({
+          error: {
+            message:
+              "No LLM provider configured. Please add an LLM provider in admin settings.",
+          },
+        });
+      }
+
+      const requestedModelId =
+        (sanitizedBody.model as string) ||
+        provider.defaultModel ||
+        "gpt-4o-mini";
+      let model = requestedModelId;
+      let apiStyle: ApiStyle | undefined;
+
+      if (preferredProviderId != null) {
+        const resolved = await deps.resolveProviderModel(
+          requestedModelId,
+          preferredProviderId,
+        );
+        if (resolved) {
+          model = resolved.providerModelId;
+          apiStyle = resolved.apiStyle;
+        }
+      } else {
+        const resolved =
+          await deps.resolveProviderModelAny(requestedModelId);
+        if (resolved) {
+          model = resolved.providerModelId;
+          apiStyle = resolved.apiStyle;
+        }
+      }
+
+      // Ensure we use the responses endpoint
+      const effectiveApiStyle: ApiStyle = apiStyle || "responses";
+      const url = resolveApiUrl(
+        provider.baseUrl,
+        model,
+        provider.providerName,
+        effectiveApiStyle,
+      );
+
+      debugLog("responses", "Request", {
+        url,
+        model,
+        requestedModelId,
+        stream,
+        userId,
+        traceId,
+      });
+
+      // Update sanitized body with resolved model
+      sanitizedBody.model = model;
+
+      // --- Audit: log request ---
+      auditLogger.log({
+        traceId,
+        eventType: "responses_api_call",
+        userId,
+        providerId: provider.providerId,
+        providerName: provider.providerName,
+        model: requestedModelId,
+        endpoint: "/v1/responses",
+        requestType: "responses",
+        requestPayload: {
+          model: requestedModelId,
+          stream,
+          toolCount: Array.isArray(sanitizedBody.tools)
+            ? (sanitizedBody.tools as unknown[]).length
+            : 0,
+          maxBudgetCredits,
+        },
+      });
+
+      // --- Rate limiting ---
+      const isFreeModel =
+        model.toLowerCase().includes("free") ||
+        model.toLowerCase().includes("-free");
+      await deps.acquireProviderSlot(provider.providerName, isFreeModel);
+
+      const internalToken = process.env.SMARTSPEC_WEB_GATEWAY_TOKEN || "";
+
+      try {
+        if (stream) {
+          await proxyResponsesStream(
+            req,
+            res,
+            url,
+            sanitizedBody,
+            provider,
+            userId,
+            requestedModelId,
+            maxBudgetCredits,
+            traceId,
+            startTime,
+            internalToken,
+            deps,
+          );
+        } else {
+          await proxyResponsesJson(
+            req,
+            res,
+            url,
+            sanitizedBody,
+            provider,
+            userId,
+            requestedModelId,
+            maxBudgetCredits,
+            traceId,
+            startTime,
+            internalToken,
+            deps,
+          );
+        }
+      } catch (err: any) {
+        debugError("responses", "Handler error", err);
+        if (!res.headersSent) {
+          res
+            .status(500)
+            .json({ error: { message: err?.message || "Internal error" } });
+        }
+      } finally {
+        deps.releaseProviderSlot(provider.providerName);
+      }
+    },
+  );
+}
+
+// ---------------------------------------------------------------------------
+// Non-streaming handler
+// ---------------------------------------------------------------------------
+
+async function proxyResponsesJson(
+  req: Request,
+  res: Response,
+  url: string,
+  body: Record<string, unknown>,
+  provider: any,
+  userId: number,
+  requestedModelId: string,
+  maxBudgetCredits: number,
+  traceId: string,
+  startTime: number,
+  internalToken: string,
+  deps: any,
+) {
+  const controller = new AbortController();
+  req.on("close", () => controller.abort());
+
+  // Ensure stream is false
+  body.stream = false;
+
+  const budget: BudgetState = {
+    maxBudgetCredits,
+    accumulatedCredits: 0,
+    currentRound: 0,
+    totalInputTokens: 0,
+    totalOutputTokens: 0,
+    webSearchCalls: 0,
+  };
+
+  let currentInput = body.input;
+  let lastResponse: any = null;
+  let budgetExceeded = false;
+
+  // Tool-call loop
+  for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
+    budget.currentRound = round + 1;
+
+    if (req.socket.destroyed) {
+      debugLog("responses", "Client disconnected mid-loop", { round, traceId });
+      break;
+    }
+
+    const requestBody = { ...body, input: currentInput };
+
+    let upstream: globalThis.Response;
+    try {
+      upstream = await fetch(url, {
+        method: "POST",
+        headers: buildHeaders(provider.apiKey),
+        body: JSON.stringify(requestBody),
+        signal: controller.signal,
+      });
+    } catch (err: any) {
+      debugError("responses", "Upstream fetch error", { round, error: err?.message });
+      if (lastResponse) break; // Return partial
+      throw err;
+    }
+
+    if (!upstream.ok) {
+      const errText = await upstream.text().catch(() => upstream.statusText);
+      debugError("responses", "Upstream error", { status: upstream.status, body: errText });
+      if (lastResponse) break; // Return partial
+      res.status(upstream.status).json({
+        error: { message: `Upstream error: ${errText}` },
+      });
+      return;
+    }
+
+    const data = await upstream.json();
+    lastResponse = data;
+
+    // Parse usage
+    const usage = parseResponsesUsage(data);
+    budget.totalInputTokens += usage.inputTokens;
+    budget.totalOutputTokens += usage.outputTokens;
+
+    // Count web_search_call items
+    const searchCalls = countWebSearchCalls(data.output || []);
+    budget.webSearchCalls += searchCalls;
+
+    // Calculate credits for this round
+    const roundCredits = calculateCreditsForLLM(
+      usage.inputTokens,
+      usage.outputTokens,
+      requestedModelId,
+    );
+    budget.accumulatedCredits += roundCredits;
+
+    // Extract function calls
+    const functionCalls = extractFunctionCalls(data.output || []);
+    if (functionCalls.length === 0) break; // No tool calls, we're done
+
+    // Check budget before dispatching tools
+    const estimatedNext = estimateNextRoundCredits(budget);
+    if (budget.accumulatedCredits + estimatedNext > budget.maxBudgetCredits) {
+      budgetExceeded = true;
+      debugLog("responses", "Budget exceeded", {
+        accumulated: budget.accumulatedCredits,
+        max: budget.maxBudgetCredits,
+        round,
+      });
+      break;
+    }
+
+    // Check credits balance
+    const hasCredits = await hasEnoughCredits(userId, estimatedNext);
+    if (!hasCredits) {
+      budgetExceeded = true;
+      break;
+    }
+
+    // Dispatch function calls
+    const toolOutputs: Array<{
+      type: "function_call_output";
+      call_id: string;
+      output: string;
+    }> = [];
+
+    for (const fc of functionCalls) {
+      auditLogger.log({
+        traceId,
+        eventType: "browser_tool_call",
+        userId,
+        model: requestedModelId,
+        metadata: {
+          toolName: fc.name,
+          callId: fc.callId,
+          round,
+        },
+      });
+
+      const output = await dispatchFunctionCall(
+        fc.name,
+        fc.arguments,
+        internalToken,
+        userId,
+      );
+
+      toolOutputs.push({
+        type: "function_call_output",
+        call_id: fc.callId,
+        output,
+      });
+    }
+
+    // Build next input with tool outputs appended
+    currentInput = [...(Array.isArray(currentInput) ? currentInput : []), ...toolOutputs];
+  }
+
+  // --- Deduct credits ---
+  const searchCostUsd = budget.webSearchCalls * WEB_SEARCH_COST_USD;
+  const totalMs = Date.now() - startTime;
+
+  await deductCreditsForModel({
+    userId,
+    model: requestedModelId,
+    provider: provider.providerName,
+    inputTokens: budget.totalInputTokens,
+    outputTokens: budget.totalOutputTokens,
+    sourceType: "browser_automation",
+  });
+
+  // Log web_search cost separately if any
+  if (budget.webSearchCalls > 0) {
+    const searchCredits = calculateCreditsFromCost(searchCostUsd);
+    await deductCreditsForModel({
+      userId,
+      model: "web_search",
+      provider: provider.providerName,
+      inputTokens: 0,
+      outputTokens: 0,
+      costUsd: searchCostUsd,
+      description: `${budget.webSearchCalls} web search calls`,
+      sourceType: "browser_automation",
+    });
+
+    logCostRequest({
+      userId,
+      providerId: provider.providerId ?? 0,
+      modelUsed: "web_search",
+      inputTokens: 0,
+      outputTokens: 0,
+      costUsd: searchCostUsd,
+      creditsCharged: searchCredits,
+      responseTimeMs: totalMs,
+      statusCode: 200,
+      wasFallback: false,
+      traceId,
+    }).catch((err: any) =>
+      debugError("responses", "Failed to log web_search cost", err?.message),
+    );
+
+    auditLogger.log({
+      traceId,
+      eventType: "web_search_call",
+      userId,
+      model: requestedModelId,
+      metadata: {
+        searchCallCount: budget.webSearchCalls,
+        searchCostUsd,
+      },
+    });
+  }
+
+  // Record usage analytics
+  deps.recordModelUsage(
+    provider.providerName,
+    requestedModelId,
+    true,
+    budget.totalInputTokens,
+    budget.totalOutputTokens,
+  );
+
+  // Log to provider_usage_log
+  const totalCredits = calculateCreditsForLLM(
+    budget.totalInputTokens,
+    budget.totalOutputTokens,
+    requestedModelId,
+  );
+  logCostRequest({
+    userId,
+    providerId: provider.providerId ?? 0,
+    modelUsed: requestedModelId,
+    inputTokens: budget.totalInputTokens,
+    outputTokens: budget.totalOutputTokens,
+    costUsd: 0,
+    creditsCharged: totalCredits,
+    responseTimeMs: totalMs,
+    statusCode: 200,
+    wasFallback: false,
+    traceId,
+  }).catch((err: any) =>
+    debugError("responses", "Failed to log cost", err?.message),
+  );
+
+  // Audit: log response
+  auditLogger.log({
+    traceId,
+    eventType: "responses_api_call",
+    userId,
+    providerId: provider.providerId,
+    providerName: provider.providerName,
+    model: requestedModelId,
+    statusCode: 200,
+    inputTokens: budget.totalInputTokens,
+    outputTokens: budget.totalOutputTokens,
+    creditsCharged: totalCredits,
+    timing: { totalMs },
+    metadata: {
+      toolRounds: budget.currentRound,
+      webSearchCalls: budget.webSearchCalls,
+      budgetExceeded,
+    },
+  });
+
+  // Add metadata to response
+  if (lastResponse && typeof lastResponse === "object") {
+    lastResponse._meta = {
+      traceId,
+      toolRounds: budget.currentRound,
+      webSearchCalls: budget.webSearchCalls,
+      budgetExceeded,
+      usage: {
+        inputTokens: budget.totalInputTokens,
+        outputTokens: budget.totalOutputTokens,
+      },
+    };
+
+    if (userId > 0) {
+      const balance = await getCreditBalance(userId);
+      lastResponse._credits = {
+        used: totalCredits,
+        remaining: balance?.credits ?? 0,
+      };
+    }
+  }
+
+  res.status(200).json(lastResponse || { error: { message: "No response" } });
+}
+
+// ---------------------------------------------------------------------------
+// Streaming handler
+// ---------------------------------------------------------------------------
+
+async function proxyResponsesStream(
+  req: Request,
+  res: Response,
+  url: string,
+  body: Record<string, unknown>,
+  provider: any,
+  userId: number,
+  requestedModelId: string,
+  maxBudgetCredits: number,
+  traceId: string,
+  startTime: number,
+  internalToken: string,
+  deps: any,
+) {
+  const controller = new AbortController();
+  let clientDisconnected = false;
+  req.on("close", () => {
+    clientDisconnected = true;
+    controller.abort();
+  });
+
+  body.stream = true;
+
+  // Set SSE headers
+  res.status(200);
+  res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
+  res.setHeader("Cache-Control", "no-cache, no-transform");
+  res.setHeader("Connection", "keep-alive");
+  res.setHeader("X-Content-Type-Options", "nosniff");
+  res.setHeader("X-Frame-Options", "DENY");
+
+  const budget: BudgetState = {
+    maxBudgetCredits,
+    accumulatedCredits: 0,
+    currentRound: 0,
+    totalInputTokens: 0,
+    totalOutputTokens: 0,
+    webSearchCalls: 0,
+  };
+
+  let currentInput = body.input;
+  let budgetExceeded = false;
+
+  try {
+    // Tool-call loop (for streaming, we re-request after tool calls)
+    for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
+      budget.currentRound = round + 1;
+
+      if (clientDisconnected) break;
+
+      const requestBody = { ...body, input: currentInput };
+
+      let upstream: globalThis.Response;
+      try {
+        upstream = await fetch(url, {
+          method: "POST",
+          headers: buildHeaders(provider.apiKey),
+          body: JSON.stringify(requestBody),
+          signal: controller.signal,
+        });
+      } catch (err: any) {
+        if (!clientDisconnected) {
+          res.write(
+            `event: error\ndata: ${JSON.stringify({ error: err?.message || "Upstream error" })}\n\n`,
+          );
+        }
+        break;
+      }
+
+      if (!upstream.ok) {
+        const errText = await upstream.text().catch(() => upstream.statusText);
+        if (!clientDisconnected) {
+          res.write(
+            `event: error\ndata: ${JSON.stringify({ error: errText, status: upstream.status })}\n\n`,
+          );
+        }
+        break;
+      }
+
+      if (!upstream.body) {
+        res.write(
+          `event: error\ndata: ${JSON.stringify({ error: "No stream body" })}\n\n`,
+        );
+        break;
+      }
+
+      // Stream SSE events and collect function calls
+      const reader = upstream.body.getReader();
+      let accumulatedData = "";
+      const functionCalls: Array<{
+        id: string;
+        callId: string;
+        name: string;
+        arguments: string;
+      }> = [];
+
+      try {
+        while (true) {
+          const { done, value } = await reader.read();
+          if (done) break;
+          if (value) {
+            const chunk = Buffer.from(value);
+
+            // Only proxy SSE events from the first round directly
+            // Subsequent rounds' events are internal (tool loop)
+            if (round === 0 || functionCalls.length === 0) {
+              res.write(chunk);
+            }
+
+            accumulatedData += chunk.toString();
+          }
+        }
+      } finally {
+        try {
+          reader.releaseLock();
+        } catch {}
+      }
+
+      // Parse accumulated SSE data for usage and function calls
+      const dataLines = accumulatedData
+        .split("\n")
+        .filter((l) => l.startsWith("data:"));
+
+      let roundUsage = { inputTokens: 0, outputTokens: 0, totalTokens: 0 };
+      let roundSearchCalls = 0;
+
+      for (const line of dataLines) {
+        const raw = line.slice("data:".length).trim();
+        if (!raw || raw === "[DONE]") continue;
+        try {
+          const parsed = JSON.parse(raw);
+
+          // Check for usage in response.completed event
+          if (parsed?.usage) {
+            roundUsage = parseResponsesUsage(parsed);
+          }
+
+          // Track web_search_call events
+          if (parsed?.type === "web_search_call") {
+            roundSearchCalls++;
+          }
+
+          // Collect output items for function call detection
+          if (parsed?.type === "response.completed" && parsed?.response?.output) {
+            const fcs = extractFunctionCalls(parsed.response.output);
+            functionCalls.push(...fcs);
+            roundSearchCalls += countWebSearchCalls(parsed.response.output);
+          }
+
+          // Also check for individual function_call events in stream
+          if (
+            parsed?.type === "response.output_item.done" &&
+            parsed?.item?.type === "function_call"
+          ) {
+            functionCalls.push({
+              id: parsed.item.id,
+              callId: parsed.item.call_id || parsed.item.id,
+              name: parsed.item.name,
+              arguments: parsed.item.arguments || "{}",
+            });
+          }
+        } catch {}
+      }
+
+      // Update budget
+      budget.totalInputTokens += roundUsage.inputTokens;
+      budget.totalOutputTokens += roundUsage.outputTokens;
+      budget.webSearchCalls += roundSearchCalls;
+
+      const roundCredits = calculateCreditsForLLM(
+        roundUsage.inputTokens,
+        roundUsage.outputTokens,
+        requestedModelId,
+      );
+      budget.accumulatedCredits += roundCredits;
+
+      // No function calls — we're done
+      if (functionCalls.length === 0) break;
+
+      // Check budget
+      const estimatedNext = estimateNextRoundCredits(budget);
+      if (budget.accumulatedCredits + estimatedNext > budget.maxBudgetCredits) {
+        budgetExceeded = true;
+        res.write(
+          `event: budget_exceeded\ndata: ${JSON.stringify({ accumulated: budget.accumulatedCredits, max: budget.maxBudgetCredits })}\n\n`,
+        );
+        break;
+      }
+
+      // Check credits balance
+      const hasCreditsLeft = await hasEnoughCredits(userId, estimatedNext);
+      if (!hasCreditsLeft) {
+        budgetExceeded = true;
+        res.write(
+          `event: budget_exceeded\ndata: ${JSON.stringify({ reason: "insufficient_credits" })}\n\n`,
+        );
+        break;
+      }
+
+      if (clientDisconnected) break;
+
+      // Dispatch function calls
+      const toolOutputs: Array<{
+        type: "function_call_output";
+        call_id: string;
+        output: string;
+      }> = [];
+
+      for (const fc of functionCalls) {
+        auditLogger.log({
+          traceId,
+          eventType: "browser_tool_call",
+          userId,
+          model: requestedModelId,
+          metadata: { toolName: fc.name, callId: fc.callId, round },
+        });
+
+        const output = await dispatchFunctionCall(
+          fc.name,
+          fc.arguments,
+          internalToken,
+          userId,
+        );
+
+        toolOutputs.push({
+          type: "function_call_output",
+          call_id: fc.callId,
+          output,
+        });
+
+        // Notify client about tool execution progress
+        if (!clientDisconnected) {
+          res.write(
+            `event: tool_executed\ndata: ${JSON.stringify({ toolName: fc.name, callId: fc.callId, round })}\n\n`,
+          );
+        }
+      }
+
+      // Build next input
+      currentInput = [
+        ...(Array.isArray(currentInput) ? currentInput : []),
+        ...toolOutputs,
+      ];
+    }
+  } finally {
+    // --- Deduct credits ---
+    const searchCostUsd = budget.webSearchCalls * WEB_SEARCH_COST_USD;
+    const totalMs = Date.now() - startTime;
+
+    await deductCreditsForModel({
+      userId,
+      model: requestedModelId,
+      provider: provider.providerName,
+      inputTokens: budget.totalInputTokens,
+      outputTokens: budget.totalOutputTokens,
+      sourceType: "browser_automation",
+    });
+
+    // Log web_search cost
+    if (budget.webSearchCalls > 0) {
+      const searchCredits = calculateCreditsFromCost(searchCostUsd);
+      await deductCreditsForModel({
+        userId,
+        model: "web_search",
+        provider: provider.providerName,
+        inputTokens: 0,
+        outputTokens: 0,
+        costUsd: searchCostUsd,
+        description: `${budget.webSearchCalls} web search calls`,
+        sourceType: "browser_automation",
+      });
+
+      logCostRequest({
+        userId,
+        providerId: provider.providerId ?? 0,
+        modelUsed: "web_search",
+        inputTokens: 0,
+        outputTokens: 0,
+        costUsd: searchCostUsd,
+        creditsCharged: searchCredits,
+        responseTimeMs: totalMs,
+        statusCode: 200,
+        wasFallback: false,
+        traceId,
+      }).catch((err: any) =>
+        debugError("responses", "Failed to log web_search cost", err?.message),
+      );
+
+      auditLogger.log({
+        traceId,
+        eventType: "web_search_call",
+        userId,
+        model: requestedModelId,
+        metadata: {
+          searchCallCount: budget.webSearchCalls,
+          searchCostUsd,
+        },
+      });
+    }
+
+    // Record analytics
+    deps.recordModelUsage(
+      provider.providerName,
+      requestedModelId,
+      true,
+      budget.totalInputTokens,
+      budget.totalOutputTokens,
+    );
+
+    const totalCredits = calculateCreditsForLLM(
+      budget.totalInputTokens,
+      budget.totalOutputTokens,
+      requestedModelId,
+    );
+
+    logCostRequest({
+      userId,
+      providerId: provider.providerId ?? 0,
+      modelUsed: requestedModelId,
+      inputTokens: budget.totalInputTokens,
+      outputTokens: budget.totalOutputTokens,
+      costUsd: 0,
+      creditsCharged: totalCredits,
+      responseTimeMs: totalMs,
+      statusCode: 200,
+      wasFallback: false,
+      traceId,
+    }).catch((err: any) =>
+      debugError("responses", "Failed to log cost", err?.message),
+    );
+
+    auditLogger.log({
+      traceId,
+      eventType: "responses_api_call",
+      userId,
+      providerId: provider.providerId,
+      providerName: provider.providerName,
+      model: requestedModelId,
+      statusCode: 200,
+      inputTokens: budget.totalInputTokens,
+      outputTokens: budget.totalOutputTokens,
+      creditsCharged: totalCredits,
+      timing: { totalMs },
+      metadata: {
+        toolRounds: budget.currentRound,
+        webSearchCalls: budget.webSearchCalls,
+        budgetExceeded,
+        streaming: true,
+      },
+    });
+
+    // Send summary event
+    if (!clientDisconnected) {
+      res.write(
+        `event: responses_summary\ndata: ${JSON.stringify({
+          traceId,
+          toolRounds: budget.currentRound,
+          webSearchCalls: budget.webSearchCalls,
+          budgetExceeded,
+          usage: {
+            inputTokens: budget.totalInputTokens,
+            outputTokens: budget.totalOutputTokens,
+          },
+          creditsUsed: totalCredits,
+        })}\n\n`,
+      );
+    }
+
+    res.end();
+  }
+}
diff --git a/apps/web/server/services/auditLogger.ts b/apps/web/server/services/auditLogger.ts
index a5a3c6e..6e64d61 100644
--- a/apps/web/server/services/auditLogger.ts
+++ b/apps/web/server/services/auditLogger.ts
@@ -76,6 +76,9 @@ export type AuditEventType =
   | "channel_webhook_no_active_channel"
   | "channel_webhook_ingest_error"
   | "channel_adapter_registered"
+  | "responses_api_call"
+  | "web_search_call"
+  | "browser_tool_call"
   | "widget_origin_rejected"
   | "widget_init_error"
   | "widget_ingest_error"
