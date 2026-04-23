/**
 * Tests for the Responses API proxy (/v1/responses)
 *
 * Feature: 032-Browser-Automation-Copilot, Section 03
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import express from "express";
import request from "supertest";
import { sanitizeResponsesBody, registerResponsesRoutes } from "../_core/responsesRoutes";
import { buildKieLlmAvailableModels } from "../services/llmProviderCatalog";
import { DelegatedWorkerPlatformError } from "../services/delegatedWorkerPlatformService";

// ── Env stubs (MUST be before any imports) ──────────────────
process.env.JWT_SECRET =
  process.env.JWT_SECRET || "test-secret-key-at-least-32-chars-long!!";
process.env.SMARTSPEC_WEB_GATEWAY_TOKEN = "test-internal-token-value";
process.env.LLM_GATEWAY_SERVICE_ACCOUNT_ID = "99";

const { mockAuthorizeRequest } = vi.hoisted(() => ({
  mockAuthorizeRequest: vi.fn(),
}));
const {
  mockAcquireDelegatedWorkerConcurrencySlot,
  mockBuildDelegatedWorkerOriginMetadata,
  mockEnforceDelegatedWorkerSpendGuardrails,
  mockEnforceDelegatedWorkerModelSelectionPolicy,
} = vi.hoisted(() => ({
  mockAcquireDelegatedWorkerConcurrencySlot: vi.fn(),
  mockBuildDelegatedWorkerOriginMetadata: vi.fn((_auth, _surface, extra) => extra ?? {}),
  mockEnforceDelegatedWorkerSpendGuardrails: vi.fn(),
  mockEnforceDelegatedWorkerModelSelectionPolicy: vi.fn(),
}));

// ── Mock authz (to prevent tokens.ts from crashing) ─────────
vi.mock("../_core/authz", () => ({
  authorizeRequest: (...args: any[]) => mockAuthorizeRequest(...args),
  AuthResult: {},
}));

// ── Mock limits ─────────────────────────────────────────────
vi.mock("../_core/limits", () => ({
  enforceJsonBodyMaxBytes: () => (_req: any, _res: any, next: any) => next(),
  rateLimit: () => (_req: any, _res: any, next: any) => next(),
}));

// ── Mock llmRoutes (avoid authz import chain) ───────────────
vi.mock("../_core/llmRoutes", () => ({
  resolveApiUrl: vi.fn().mockReturnValue("https://api.openai.com/v1/responses"),
}));

vi.mock("../../server/services/delegatedWorkerPlatformService", () => ({
  acquireDelegatedWorkerConcurrencySlot: (...args: any[]) =>
    mockAcquireDelegatedWorkerConcurrencySlot(...args),
  buildDelegatedWorkerOriginMetadata: (...args: any[]) =>
    mockBuildDelegatedWorkerOriginMetadata(...args),
  enforceDelegatedWorkerSpendGuardrails: (...args: any[]) =>
    mockEnforceDelegatedWorkerSpendGuardrails(...args),
  enforceDelegatedWorkerModelSelectionPolicy: (...args: any[]) =>
    mockEnforceDelegatedWorkerModelSelectionPolicy(...args),
  DelegatedWorkerPlatformError: class DelegatedWorkerPlatformError extends Error {
    code: string;
    statusCode: number;
    type: string;

    constructor(code: string, statusCode: number, message: string, type = "invalid_request_error") {
      super(message);
      this.code = code;
      this.statusCode = statusCode;
      this.type = type;
    }
  },
}));

// ── Mock enabled model resolution ────────────────────────────
vi.mock("../../server/services/enabledLlmModels", () => ({
  resolveEnabledLlmModelId: vi.fn(async (candidates: Array<string | null | undefined>) =>
    candidates.find((value) => typeof value === "string" && value.trim().length > 0) ?? null,
  ),
}));

// ── Mock planner middleware ──────────────────────────────────
const { mockRunPlanner, mockRecordStepAttempt } = vi.hoisted(() => ({
  mockRunPlanner: vi.fn().mockResolvedValue(null),
  mockRecordStepAttempt: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../../server/services/taskPlannerMiddleware", () => ({
  runPlanner: (...args: any[]) => mockRunPlanner(...args),
  recordStepAttempt: (...args: any[]) => mockRecordStepAttempt(...args),
}));

// ── Mock Redis ──────────────────────────────────────────────
vi.mock("../../server/services/redis", () => ({
  getRedisClient: () => ({
    get: vi.fn().mockResolvedValue(null),
    set: vi.fn().mockResolvedValue("OK"),
    del: vi.fn().mockResolvedValue(1),
  }),
  isRedisAvailable: () => false,
}));

// ── Mock credit service ─────────────────────────────────────
const mockDeductCreditsForModel = vi.fn().mockResolvedValue({ creditsUsed: 10, wasFree: false });
const mockHasEnoughCredits = vi.fn().mockResolvedValue(true);
const mockGetCreditBalance = vi.fn().mockResolvedValue({ credits: 900 });

vi.mock("../../server/services/creditService", () => ({
  getCreditBalance: (...args: any[]) => mockGetCreditBalance(...args),
  getCreditBalanceByOpenId: vi.fn().mockResolvedValue(1000),
  hasEnoughCredits: (...args: any[]) => mockHasEnoughCredits(...args),
  deductCredits: vi.fn().mockResolvedValue(true),
  deductCreditsForModel: (...args: any[]) => mockDeductCreditsForModel(...args),
  calculateCreditsFromCost: vi.fn().mockImplementation((cost: number) => Math.ceil(cost * 1000)),
  calculateCreditsForLLM: vi.fn().mockReturnValue(10),
}));

// ── Mock feature flags ──────────────────────────────────────
const mockGetFeatureFlag = vi.fn().mockResolvedValue(true);
const mockGetTenantFeatureFlag = vi.fn().mockResolvedValue(true);

vi.mock("../../server/services/featureFlags", () => ({
  getFeatureFlag: (...args: any[]) => mockGetFeatureFlag(...args),
  getTenantFeatureFlag: (...args: any[]) => mockGetTenantFeatureFlag(...args),
}));

// ── Mock audit logger ───────────────────────────────────────
const mockAuditLog = vi.fn();
vi.mock("../../server/services/auditLogger", () => ({
  auditLogger: { log: (...args: any[]) => mockAuditLog(...args) },
}));

// ── Mock cost tracker ───────────────────────────────────────
const mockLogRequest = vi.fn().mockResolvedValue(undefined);
vi.mock("../../server/services/costTracker", () => ({
  logRequest: (...args: any[]) => mockLogRequest(...args),
}));

// ── Mock trace context ──────────────────────────────────────
vi.mock("../../server/services/traceContext", () => ({
  getTraceId: vi.fn().mockReturnValue("test-trace-id"),
}));

// ── Mock logger ─────────────────────────────────────────────
vi.mock("../_core/logger", () => ({
  debugLog: vi.fn(),
  debugError: vi.fn(),
}));

// ── Mock fetch (global) ─────────────────────────────────────
const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

// ── Helpers ─────────────────────────────────────────────────

function createMockDeps(overrides?: Partial<Record<string, any>>) {
  return {
    guardWithCreditsOrInternalToken: vi
      .fn()
      .mockResolvedValue({ ok: true, userId: 42, isInternal: false }),
    verifyInternalToken: vi.fn().mockReturnValue(false),
    getActiveLlmProvider: vi.fn().mockResolvedValue({
      providerId: 1,
      providerName: "openai",
      baseUrl: "https://api.openai.com/v1",
      apiKey: "sk-test-key",
      defaultModel: "gpt-5.4",
    }),
    getLlmProviderById: vi.fn().mockResolvedValue(null),
    resolveProviderModelAny: vi.fn().mockResolvedValue({
      providerModelId: "gpt-5.4",
      apiStyle: "responses" as const,
    }),
    resolveProviderModel: vi.fn().mockResolvedValue(null),
    acquireProviderSlot: vi.fn().mockResolvedValue({ queuePosition: 0 }),
    releaseProviderSlot: vi.fn(),
    recordModelUsage: vi.fn(),
    ...overrides,
  };
}

function createApp(deps: ReturnType<typeof createMockDeps>) {
  const app = express();
  app.use(express.json());
  registerResponsesRoutes(app, deps);
  return app;
}

function makeResponsesApiResponse(overrides?: Record<string, any>) {
  return {
    id: "resp_test123",
    object: "response",
    model: "gpt-5.4",
    output: [
      {
        type: "message",
        role: "assistant",
        content: [{ type: "output_text", text: "Hello!" }],
      },
    ],
    usage: {
      input_tokens: 100,
      output_tokens: 50,
      total_tokens: 150,
    },
    ...overrides,
  };
}

function makeFetchResponse(body: any, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: status === 200 ? "OK" : "Error",
    json: () => Promise.resolve(body),
    text: () => Promise.resolve(JSON.stringify(body)),
    body: null,
  } as any;
}

function makeSSEStream(events: string[]): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  const combined = events.join("\n") + "\n";
  return new ReadableStream({
    start(controller) {
      controller.enqueue(encoder.encode(combined));
      controller.close();
    },
  });
}

// ═══════════════════════════════════════════════════════════════
// Tests
// ═══════════════════════════════════════════════════════════════

describe("sanitizeResponsesBody", () => {
  it("rejects missing model field", () => {
    const result = sanitizeResponsesBody({ input: [{ role: "user", content: "hi" }] });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.status).toBe(400);
      expect(result.error).toContain("model");
    }
  });

  it("rejects missing input field", () => {
    const result = sanitizeResponsesBody({ model: "gpt-5.4" });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.status).toBe(400);
      expect(result.error).toContain("input");
    }
  });

  it("enforces store=false by default", () => {
    const result = sanitizeResponsesBody({
      model: "gpt-5.4",
      input: [{ role: "user", content: "hi" }],
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.body.store).toBe(false);
    }
  });

  it("always overrides store=true to false (ZDR compliance)", () => {
    const result = sanitizeResponsesBody(
      { model: "gpt-5.4", input: [{ role: "user", content: "hi" }], store: true },
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.body.store).toBe(false);
    }
  });

  it("accepts valid payload and strips unknown fields", () => {
    const result = sanitizeResponsesBody({
      model: "gpt-5.4",
      input: [{ role: "user", content: "hi" }],
      temperature: 0.7,
      unknownField: "should be removed",
      _internal: true,
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.body.model).toBe("gpt-5.4");
      expect(result.body.temperature).toBe(0.7);
      expect(result.body).not.toHaveProperty("unknownField");
      expect(result.body).not.toHaveProperty("_internal");
    }
  });

  it("extracts max_budget_credits from body", () => {
    const result = sanitizeResponsesBody({
      model: "gpt-5.4",
      input: [{ role: "user", content: "hi" }],
      max_budget_credits: 100,
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.maxBudgetCredits).toBe(100);
      expect(result.body).not.toHaveProperty("max_budget_credits");
    }
  });

  it("uses default budget when not specified", () => {
    const result = sanitizeResponsesBody({
      model: "gpt-5.4",
      input: [{ role: "user", content: "hi" }],
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.maxBudgetCredits).toBe(500);
    }
  });

  it("rejects unknown top-level fields in strict mode", () => {
    const result = sanitizeResponsesBody(
      {
        model: "gpt-5.4",
        input: [{ role: "user", content: "hi" }],
        unsupported: true,
      },
      { strictUnknownFields: true },
    );

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.status).toBe(400);
      expect(result.error).toContain("unsupported");
    }
  });

  it("preserves allowlisted passthrough fields in strict mode", () => {
    const result = sanitizeResponsesBody(
      {
        model: "gpt-5.4",
        input: [{ role: "user", content: "hi" }],
        reasoning: { effort: "high" },
      },
      { strictUnknownFields: true, passthroughFields: ["reasoning"] },
    );

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.body.reasoning).toEqual({ effort: "high" });
    }
  });
});

describe("/v1/responses endpoint", () => {
  let deps: ReturnType<typeof createMockDeps>;
  let app: express.Express;

  beforeEach(() => {
    mockFetch.mockReset();
    mockAuditLog.mockClear();
    mockBuildDelegatedWorkerOriginMetadata.mockReset();
    mockBuildDelegatedWorkerOriginMetadata.mockImplementation((_auth, _surface, extra) => extra ?? {});
    mockLogRequest.mockResolvedValue(undefined);
    mockRunPlanner.mockReset();
    mockRunPlanner.mockResolvedValue(null);
    mockRecordStepAttempt.mockReset();
    mockRecordStepAttempt.mockResolvedValue(undefined);
    mockAcquireDelegatedWorkerConcurrencySlot.mockReset();
    mockAcquireDelegatedWorkerConcurrencySlot.mockResolvedValue({ release: vi.fn().mockResolvedValue(undefined) });
    mockEnforceDelegatedWorkerSpendGuardrails.mockReset();
    mockEnforceDelegatedWorkerSpendGuardrails.mockResolvedValue(undefined);
    mockEnforceDelegatedWorkerModelSelectionPolicy.mockReset();
    mockGetFeatureFlag.mockResolvedValue(true);
    mockGetTenantFeatureFlag.mockResolvedValue(true);
    mockHasEnoughCredits.mockResolvedValue(true);
    mockDeductCreditsForModel.mockResolvedValue({ creditsUsed: 10, wasFree: false });
    mockGetCreditBalance.mockResolvedValue({ credits: 900 });
    mockAuthorizeRequest.mockResolvedValue({
      ok: true,
      mode: "api_key",
      sub: "42",
      userId: 42,
      tenantId: "tenant-api",
      apiKeyId: "key-1",
      scopes: ["llm:chat"],
      rateLimit: 60,
      creditLimit: null,
      quotaHourly: null,
      quotaDaily: null,
      quotaWeekly: null,
      quotaMonthly: null,
    });

    deps = createMockDeps();
    app = createApp(deps);
  });

  afterEach(() => {
    mockFetch.mockReset();
  });

  // === Feature Flag Gating ===

  describe("feature flag gating", () => {
    it("returns 404 when global responsesApi flag is off", async () => {
      mockGetFeatureFlag.mockResolvedValue(false);

      const res = await request(app)
        .post("/v1/responses")
        .send({ model: "gpt-5.4", input: [{ role: "user", content: "hi" }] });

      expect(res.status).toBe(404);
      expect(res.body.error.message).toBe("Not found");
    });

    it("returns 403 when tenant flag is off", async () => {
      mockGetFeatureFlag.mockResolvedValue(true);
      mockGetTenantFeatureFlag.mockResolvedValue(false);

      const res = await request(app)
        .post("/v1/responses")
        .send({ model: "gpt-5.4", input: [{ role: "user", content: "hi" }] });

      expect(res.status).toBe(403);
      expect(res.body.error.message).toContain("not enabled");
    });

    it("proceeds when both flags are on", async () => {
      mockFetch.mockResolvedValue(makeFetchResponse(makeResponsesApiResponse()));

      const res = await request(app)
        .post("/v1/responses")
        .send({ model: "gpt-5.4", input: [{ role: "user", content: "hi" }] });

      expect(res.status).toBe(200);
    });
  });

  describe("tenant normalization", () => {
    it("derives tenant context from API-key auth instead of default", async () => {
      mockFetch.mockResolvedValue(makeFetchResponse(makeResponsesApiResponse()));

      const res = await request(app)
        .post("/v1/responses")
        .send({ model: "gpt-5.4", input: [{ role: "user", content: "hi" }] });

      expect(res.status).toBe(200);
      expect(mockGetTenantFeatureFlag).toHaveBeenCalledWith("responsesApi", "tenant-api");
    });

    it("derives tenant context from bearer auth when available", async () => {
      mockAuthorizeRequest.mockResolvedValueOnce({
        ok: true,
        mode: "bearer",
        sub: "84",
        userId: 84,
        tenantId: "tenant-bearer",
        scopes: ["llm:chat"],
      });
      mockFetch.mockResolvedValue(makeFetchResponse(makeResponsesApiResponse()));

      const res = await request(app)
        .post("/v1/responses")
        .send({ model: "gpt-5.4", input: [{ role: "user", content: "hi" }] });

      expect(res.status).toBe(200);
      expect(mockGetTenantFeatureFlag).toHaveBeenCalledWith("responsesApi", "tenant-bearer");
    });

    it("uses explicit X-Tenant-Id for internal service callers", async () => {
      deps = createMockDeps({
        guardWithCreditsOrInternalToken: vi
          .fn()
          .mockResolvedValue({ ok: true, userId: 42, isInternal: true }),
      });
      app = createApp(deps);
      mockFetch.mockResolvedValue(makeFetchResponse(makeResponsesApiResponse()));

      const res = await request(app)
        .post("/v1/responses")
        .set("X-Tenant-Id", "tenant-internal")
        .send({ model: "gpt-5.4", input: [{ role: "user", content: "hi" }] });

      expect(res.status).toBe(200);
      expect(mockGetTenantFeatureFlag).toHaveBeenCalledWith("responsesApi", "tenant-internal");
    });

    it("rejects internal callers that omit tenant context", async () => {
      deps = createMockDeps({
        guardWithCreditsOrInternalToken: vi
          .fn()
          .mockResolvedValue({ ok: true, userId: 42, isInternal: true }),
      });
      app = createApp(deps);
      mockGetTenantFeatureFlag.mockClear();

      const res = await request(app)
        .post("/v1/responses")
        .send({ model: "gpt-5.4", input: [{ role: "user", content: "hi" }] });

      expect(res.status).toBe(400);
      expect(res.body.error.message).toContain("tenant");
      expect(mockGetTenantFeatureFlag).not.toHaveBeenCalled();
    });
  });

  // === Request Validation ===

  describe("request validation", () => {
    it("rejects request missing model field", async () => {
      const res = await request(app)
        .post("/v1/responses")
        .send({ input: [{ role: "user", content: "hi" }] });

      expect(res.status).toBe(400);
      expect(res.body.error.message).toContain("model");
    });

    it("rejects request missing input field", async () => {
      const res = await request(app)
        .post("/v1/responses")
        .send({ model: "gpt-5.4" });

      expect(res.status).toBe(400);
      expect(res.body.error.message).toContain("input");
    });

    it("accepts valid Responses API payload", async () => {
      mockFetch.mockResolvedValue(makeFetchResponse(makeResponsesApiResponse()));

      const res = await request(app)
        .post("/v1/responses")
        .send({
          model: "gpt-5.4",
          input: [{ role: "user", content: "Search for latest news" }],
          tools: [{ type: "web_search_preview" }],
        });

      expect(res.status).toBe(200);
      expect(res.body.id).toBe("resp_test123");
    });

    it("returns delegated worker policy errors when model selection is rejected", async () => {
      mockAuthorizeRequest.mockResolvedValueOnce({
        ok: true,
        mode: "delegated_worker",
        sub: "worker-delegate:test",
        userId: 42,
        ownerUserId: 42,
        workerId: "worker-1",
        workerJobId: "job-1",
        delegatedSessionId: "session-1",
        runtimeType: "openclaw_gateway",
        scopeProfile: "worker_gateway_hybrid_executor",
        tenantId: "tenant-api",
        scopes: ["llm:chat"],
      });
      mockEnforceDelegatedWorkerModelSelectionPolicy.mockImplementationOnce(() => {
        throw new DelegatedWorkerPlatformError(
          "worker_model_not_allowed",
          403,
          "The selected model is not allowed for this delegated worker session",
          "auth_error",
        );
      });

      const res = await request(app)
        .post("/v1/responses")
        .send({ model: "unsupported-model", input: [{ role: "user", content: "hi" }] });

      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe("worker_model_not_allowed");
    });

    it("propagates delegated worker billing metadata for Hermes runtime requests", async () => {
      mockAuthorizeRequest.mockResolvedValueOnce({
        ok: true,
        mode: "delegated_worker",
        sub: "worker-delegate:test",
        userId: 42,
        ownerUserId: 42,
        workerId: "worker-hermes-1",
        workerJobId: "job-hermes-1",
        delegatedSessionId: "session-hermes-1",
        runtimeType: "hermes_agent_gateway",
        scopeProfile: "worker_gateway_hybrid_executor",
        tenantId: "tenant-api",
        scopes: ["llm:chat"],
      });
      mockFetch.mockResolvedValueOnce(makeFetchResponse(makeResponsesApiResponse()));

      const res = await request(app)
        .post("/v1/responses")
        .send({ model: "gpt-5.4", input: [{ role: "user", content: "hi" }] });

      expect(res.status).toBe(200);
      expect(mockBuildDelegatedWorkerOriginMetadata).toHaveBeenCalledWith(
        undefined,
        "responses.execute",
        expect.objectContaining({
          endpoint: "/v1/responses",
          providerName: "openai",
          requestedModelId: "gpt-5.4",
        }),
      );
    });

    it("rejects Kie requests with unknown top-level fields outside the allowlist", async () => {
      deps = createMockDeps({
        getActiveLlmProvider: vi.fn().mockResolvedValue({
          providerId: 9,
          providerName: "kie_ai",
          baseUrl: "https://api.kie.ai",
          apiKey: "kie-key",
          defaultModel: "gpt-5-4",
          availableModels: buildKieLlmAvailableModels(),
        }),
        resolveProviderModelAny: vi.fn().mockResolvedValue({
          providerModelId: "gpt-5-4",
          apiStyle: "responses" as const,
        }),
      });
      app = createApp(deps);

      const res = await request(app)
        .post("/v1/responses")
        .send({
          model: "gpt-5.4",
          input: [{ role: "user", content: "hello" }],
          unsupported: true,
        });

      expect(res.status).toBe(400);
      expect(res.body.error.message).toContain("unsupported");
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it("rejects Kie responses requests that resolve to non-responses models", async () => {
      deps = createMockDeps({
        getActiveLlmProvider: vi.fn().mockResolvedValue({
          providerId: 9,
          providerName: "kie_ai",
          baseUrl: "https://api.kie.ai",
          apiKey: "kie-key",
          defaultModel: "claude-sonnet-4-6",
          availableModels: buildKieLlmAvailableModels(),
        }),
        resolveProviderModelAny: vi.fn().mockResolvedValue({
          providerModelId: "claude-sonnet-4-6",
          apiStyle: "messages" as const,
        }),
      });
      app = createApp(deps);

      const res = await request(app)
        .post("/v1/responses")
        .send({
          model: "claude-sonnet-4-6",
          input: [{ role: "user", content: "hello" }],
        });

      expect(res.status).toBe(400);
      expect(res.body.error.message).toContain("does not support /v1/responses");
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it("rejects Kie responses requests that mix web search and function tools", async () => {
      deps = createMockDeps({
        getActiveLlmProvider: vi.fn().mockResolvedValue({
          providerId: 9,
          providerName: "kie_ai",
          baseUrl: "https://api.kie.ai",
          apiKey: "kie-key",
          defaultModel: "gpt-5-4",
          availableModels: buildKieLlmAvailableModels(),
        }),
        resolveProviderModelAny: vi.fn().mockResolvedValue({
          providerModelId: "gpt-5-4",
          apiStyle: "responses" as const,
        }),
      });
      app = createApp(deps);

      const res = await request(app)
        .post("/v1/responses")
        .send({
          model: "gpt-5.4",
          input: [{ role: "user", content: "hello" }],
          tools: [{ type: "web_search_preview" }, { type: "function", name: "lookup_weather" }],
        });

      expect(res.status).toBe(400);
      expect(res.body.error.message).toContain("do not allow web-search tools together with function tools");
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it("re-resolves planner-selected Kie responses models before sending upstream", async () => {
      mockRunPlanner.mockResolvedValue({
        resolvedModel: "gpt-5.4",
        taskRunId: "task-1",
        plan: null,
        snapshot: null,
      });

      deps = createMockDeps({
        getActiveLlmProvider: vi.fn().mockResolvedValue({
          providerId: 9,
          providerName: "kie_ai",
          baseUrl: "https://api.kie.ai",
          apiKey: "kie-key",
          defaultModel: "gpt-5.3-codex",
          availableModels: buildKieLlmAvailableModels(),
        }),
        resolveProviderModelAny: vi.fn()
          .mockResolvedValueOnce({
            providerModelId: "gpt-5.3-codex",
            apiStyle: "responses" as const,
          })
          .mockResolvedValueOnce({
            providerModelId: "gpt-5-4",
            apiStyle: "responses" as const,
          }),
      });
      app = createApp(deps);
      mockFetch.mockResolvedValue(makeFetchResponse(makeResponsesApiResponse()));

      const res = await request(app)
        .post("/v1/responses")
        .send({
          model: "gpt-5.3-codex",
          input: [{ role: "user", content: "hello" }],
        });

      expect(res.status).toBe(200);
      const upstreamBody = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(upstreamBody.model).toBe("gpt-5-4");
    });

    it("ignores planner overrides that switch the route to a non-responses family", async () => {
      mockRunPlanner.mockResolvedValue({
        resolvedModel: "claude-sonnet-4-6",
        taskRunId: "task-2",
        plan: null,
        snapshot: null,
      });

      deps = createMockDeps({
        getActiveLlmProvider: vi.fn().mockResolvedValue({
          providerId: 9,
          providerName: "kie_ai",
          baseUrl: "https://api.kie.ai",
          apiKey: "kie-key",
          defaultModel: "gpt-5-4",
          availableModels: buildKieLlmAvailableModels(),
        }),
        resolveProviderModelAny: vi.fn()
          .mockResolvedValueOnce({
            providerModelId: "gpt-5-4",
            apiStyle: "responses" as const,
          })
          .mockResolvedValueOnce({
            providerModelId: "claude-sonnet-4-6",
            apiStyle: "messages" as const,
          }),
      });
      app = createApp(deps);
      mockFetch.mockResolvedValue(makeFetchResponse(makeResponsesApiResponse()));

      const res = await request(app)
        .post("/v1/responses")
        .send({
          model: "gpt-5.4",
          input: [{ role: "user", content: "hello" }],
        });

      expect(res.status).toBe(200);
      const upstreamBody = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(upstreamBody.model).toBe("gpt-5-4");
    });
  });

  // === Non-Streaming Mode ===

  describe("non-streaming mode", () => {
    it("returns JSON response with usage parsed", async () => {
      const responseData = makeResponsesApiResponse();
      mockFetch.mockResolvedValue(makeFetchResponse(responseData));

      const res = await request(app)
        .post("/v1/responses")
        .send({
          model: "gpt-5.4",
          input: [{ role: "user", content: "hello" }],
        });

      expect(res.status).toBe(200);
      expect(res.body.usage.input_tokens).toBe(100);
      expect(res.body.usage.output_tokens).toBe(50);
    });

    it("deducts credits from usage", async () => {
      mockFetch.mockResolvedValue(makeFetchResponse(makeResponsesApiResponse()));

      await request(app)
        .post("/v1/responses")
        .send({
          model: "gpt-5.4",
          input: [{ role: "user", content: "hello" }],
        });

      expect(mockDeductCreditsForModel).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: 42,
          model: "gpt-5.4",
          sourceType: "browser_automation",
        }),
      );
    });

    it("prefers normalized provider-reported cost for billing and response metadata", async () => {
      mockFetch.mockResolvedValue(
        makeFetchResponse(
          makeResponsesApiResponse({
            usage: {
              input_tokens: 12,
              output_tokens: 8,
              total_tokens: 20,
              cost: 0.045,
            },
            credits_consumed: 45,
          }),
        ),
      );

      const res = await request(app)
        .post("/v1/responses")
        .send({
          model: "gpt-5.4",
          input: [{ role: "user", content: "hello" }],
        });

      expect(res.status).toBe(200);
      expect(mockDeductCreditsForModel).toHaveBeenCalledWith(
        expect.objectContaining({
          costUsd: 0.045,
        }),
      );
      expect(res.body._meta.providerReportedCostUsd).toBe(0.045);
      expect(res.body._meta.providerReportedCreditsConsumed).toBe(45);
    });

    it("adds _credits and _meta to response", async () => {
      mockFetch.mockResolvedValue(makeFetchResponse(makeResponsesApiResponse()));

      const res = await request(app)
        .post("/v1/responses")
        .send({
          model: "gpt-5.4",
          input: [{ role: "user", content: "hello" }],
        });

      expect(res.body._credits).toBeDefined();
      expect(res.body._credits.remaining).toBe(900);
      expect(res.body._meta).toBeDefined();
      expect(res.body._meta.traceId).toBe("test-trace-id");
    });
  });

  // === Tool-Call Loop ===

  describe("tool-call loop", () => {
    it("dispatches function_call to internal tool route", async () => {
      // First response has a function call
      const firstResponse = makeResponsesApiResponse({
        output: [
          {
            type: "function_call",
            id: "fc_1",
            call_id: "call_1",
            name: "browser.execute_actions",
            arguments: '{"action":"click","selector":"#btn"}',
          },
        ],
      });

      // Second response is final
      const secondResponse = makeResponsesApiResponse();

      mockFetch
        .mockResolvedValueOnce(makeFetchResponse(firstResponse)) // OpenAI first call
        .mockResolvedValueOnce({
          // Internal tool dispatch
          ok: true,
          status: 200,
          text: () => Promise.resolve('{"result":"clicked"}'),
        })
        .mockResolvedValueOnce(makeFetchResponse(secondResponse)); // OpenAI second call

      const res = await request(app)
        .post("/v1/responses")
        .send({
          model: "gpt-5.4",
          input: [{ role: "user", content: "click the button" }],
        });

      expect(res.status).toBe(200);
      // Should have made 3 fetch calls: 2 to OpenAI + 1 to internal tool
      expect(mockFetch).toHaveBeenCalledTimes(3);
    });

    it("injects tool context hints into the next round after parsing _meta.contextState", async () => {
      const firstResponse = makeResponsesApiResponse({
        output: [
          {
            type: "function_call",
            id: "fc_1",
            call_id: "call_1",
            name: "browser.execute_actions",
            arguments: '{"action":"click","selector":"#btn"}',
          },
        ],
      });

      const secondResponse = makeResponsesApiResponse();
      const toolPayload = {
        result: "clicked",
        _meta: {
          contextState: {
            toolResults: [
              {
                title: "Browser step",
                content: "Clicked CTA button",
                source: "browser.execute_actions",
                trust: "trusted",
                freshness: "fresh",
              },
            ],
          },
        },
      };

      mockFetch
        .mockResolvedValueOnce(makeFetchResponse(firstResponse))
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          text: () => Promise.resolve(JSON.stringify(toolPayload)),
        })
        .mockResolvedValueOnce(makeFetchResponse(secondResponse));

      const res = await request(app)
        .post("/v1/responses")
        .send({
          model: "gpt-5.4",
          input: [{ role: "user", content: "click the button" }],
        });

      expect(res.status).toBe(200);

      const secondOpenAICall = mockFetch.mock.calls[2];
      const secondBody = JSON.parse(secondOpenAICall[1].body);
      const toolOutputs = secondBody.input.filter(
        (item: any) => item.type === "function_call_output",
      );
      expect(toolOutputs.length).toBe(1);
      expect(toolOutputs[0].output).not.toContain("_meta");
      expect(JSON.parse(toolOutputs[0].output)).toEqual(
        expect.objectContaining({ result: "clicked" }),
      );

      const contextMessages = secondBody.input.filter(
        (item: any) => item.role === "system" && typeof item.content === "string",
      );
      expect(contextMessages.some((item: any) => item.content.includes("[TOOL RESULT]"))).toBe(true);
      expect(contextMessages.some((item: any) => item.content.includes("Clicked CTA button"))).toBe(true);
    });

    it("stops loop after MAX_TOOL_ROUNDS", async () => {
      // Always return a function call to trigger loop
      const fcResponse = makeResponsesApiResponse({
        output: [
          {
            type: "function_call",
            id: "fc_1",
            call_id: "call_1",
            name: "browser.execute_actions",
            arguments: "{}",
          },
        ],
      });

      // Mock: every call returns a function call
      mockFetch.mockImplementation(async (url: string) => {
        if (url.includes("internal")) {
          return {
            ok: true,
            status: 200,
            text: () => Promise.resolve('{"result":"ok"}'),
          };
        }
        return makeFetchResponse(fcResponse);
      });

      const res = await request(app)
        .post("/v1/responses")
        .send({
          model: "gpt-5.4",
          input: [{ role: "user", content: "loop test" }],
        });

      expect(res.status).toBe(200);
      // Should cap at MAX_TOOL_ROUNDS (10) rounds of OpenAI calls + tool dispatches
      // At most 10 OpenAI calls + 10 tool calls = 20 total
      expect(mockFetch.mock.calls.length).toBeLessThanOrEqual(20);
    });

    it("sends error output to OpenAI when tool call fails", async () => {
      const fcResponse = makeResponsesApiResponse({
        output: [
          {
            type: "function_call",
            id: "fc_1",
            call_id: "call_1",
            name: "browser.execute_actions",
            arguments: "{}",
          },
        ],
      });

      const finalResponse = makeResponsesApiResponse();

      mockFetch
        .mockResolvedValueOnce(makeFetchResponse(fcResponse))
        .mockResolvedValueOnce({
          ok: false,
          status: 500,
          statusText: "Internal Server Error",
          text: () => Promise.resolve("Tool broke"),
        })
        .mockResolvedValueOnce(makeFetchResponse(finalResponse));

      const res = await request(app)
        .post("/v1/responses")
        .send({
          model: "gpt-5.4",
          input: [{ role: "user", content: "test" }],
        });

      expect(res.status).toBe(200);

      // Verify the second OpenAI call included function_call_output with error
      const secondOpenAICall = mockFetch.mock.calls[2];
      const secondBody = JSON.parse(secondOpenAICall[1].body);
      const toolOutputs = secondBody.input.filter(
        (item: any) => item.type === "function_call_output",
      );
      expect(toolOutputs.length).toBe(1);
      expect(toolOutputs[0].output).toContain("error");
    });

    it("stops loop when budget is exceeded", async () => {
      const fcResponse = makeResponsesApiResponse({
        output: [
          {
            type: "function_call",
            id: "fc_1",
            call_id: "call_1",
            name: "browser.execute_actions",
            arguments: "{}",
          },
        ],
        usage: { input_tokens: 5000, output_tokens: 5000, total_tokens: 10000 },
      });

      mockFetch.mockImplementation(async (url: string) => {
        if (url.includes("internal")) {
          return {
            ok: true,
            status: 200,
            text: () => Promise.resolve('{"result":"ok"}'),
          };
        }
        return makeFetchResponse(fcResponse);
      });

      const res = await request(app)
        .post("/v1/responses")
        .send({
          model: "gpt-5.4",
          input: [{ role: "user", content: "expensive" }],
          max_budget_credits: 5, // Very low budget
        });

      expect(res.status).toBe(200);
      expect(res.body._meta.budgetExceeded).toBe(true);
    });
  });

  // === web_search Tracking ===

  describe("web_search tracking", () => {
    it("counts web_search_call items for cost tracking", async () => {
      const responseWithSearch = makeResponsesApiResponse({
        output: [
          { type: "web_search_call", id: "ws_1", status: "completed" },
          { type: "web_search_call", id: "ws_2", status: "completed" },
          {
            type: "message",
            role: "assistant",
            content: [{ type: "output_text", text: "Search results" }],
          },
        ],
      });

      mockFetch.mockResolvedValue(makeFetchResponse(responseWithSearch));

      const res = await request(app)
        .post("/v1/responses")
        .send({
          model: "gpt-5.4",
          input: [{ role: "user", content: "search test" }],
          tools: [{ type: "web_search_preview" }],
        });

      expect(res.status).toBe(200);
      expect(res.body._meta.webSearchCalls).toBe(2);

      // Verify web_search cost was deducted separately
      expect(mockDeductCreditsForModel).toHaveBeenCalledWith(
        expect.objectContaining({
          model: "web_search",
          costUsd: 0.02, // 2 calls * $0.01
        }),
      );
    });

    it("logs web_search as separate audit event", async () => {
      const responseWithSearch = makeResponsesApiResponse({
        output: [
          { type: "web_search_call", id: "ws_1", status: "completed" },
          {
            type: "message",
            role: "assistant",
            content: [{ type: "output_text", text: "Result" }],
          },
        ],
      });

      mockFetch.mockResolvedValue(makeFetchResponse(responseWithSearch));

      await request(app)
        .post("/v1/responses")
        .send({
          model: "gpt-5.4",
          input: [{ role: "user", content: "search" }],
        });

      const webSearchLogs = mockAuditLog.mock.calls.filter(
        (call: any[]) => call[0]?.eventType === "web_search_call",
      );
      expect(webSearchLogs.length).toBe(1);
      expect(webSearchLogs[0][0].metadata.searchCallCount).toBe(1);
    });
  });

  // === Budget Cap ===

  describe("budget cap", () => {
    it("uses max_budget_credits from request body", async () => {
      mockFetch.mockResolvedValue(makeFetchResponse(makeResponsesApiResponse()));

      const res = await request(app)
        .post("/v1/responses")
        .send({
          model: "gpt-5.4",
          input: [{ role: "user", content: "hello" }],
          max_budget_credits: 100,
        });

      expect(res.status).toBe(200);
      // Budget metadata should be available
      expect(res.body._meta.budgetExceeded).toBe(false);
    });

    it("uses default budget when not specified", async () => {
      mockFetch.mockResolvedValue(makeFetchResponse(makeResponsesApiResponse()));

      const res = await request(app)
        .post("/v1/responses")
        .send({
          model: "gpt-5.4",
          input: [{ role: "user", content: "hello" }],
        });

      expect(res.status).toBe(200);
    });

    it("stops loop when credit balance is insufficient", async () => {
      mockHasEnoughCredits.mockResolvedValue(false);

      const fcResponse = makeResponsesApiResponse({
        output: [
          {
            type: "function_call",
            id: "fc_1",
            call_id: "call_1",
            name: "browser.execute_actions",
            arguments: "{}",
          },
        ],
      });

      mockFetch.mockResolvedValue(makeFetchResponse(fcResponse));

      const res = await request(app)
        .post("/v1/responses")
        .send({
          model: "gpt-5.4",
          input: [{ role: "user", content: "test" }],
        });

      expect(res.status).toBe(200);
      expect(res.body._meta.budgetExceeded).toBe(true);
    });
  });

  // === Auth ===

  describe("auth", () => {
    it("returns 401 when auth fails", async () => {
      deps = createMockDeps({
        guardWithCreditsOrInternalToken: vi
          .fn()
          .mockResolvedValue({ ok: false }),
      });
      // Auth failure sends its own response, so we need a mock that calls res.status
      deps.guardWithCreditsOrInternalToken = vi.fn().mockImplementation(async (_req: any, res: any) => {
        res.status(401).json({ error: { message: "Unauthorized" } });
        return { ok: false };
      });
      app = createApp(deps);

      const res = await request(app)
        .post("/v1/responses")
        .send({
          model: "gpt-5.4",
          input: [{ role: "user", content: "hello" }],
        });

      expect(res.status).toBe(401);
    });
  });

  // === Audit Logging ===

  describe("audit logging", () => {
    it("logs responses_api_call events", async () => {
      mockFetch.mockResolvedValue(makeFetchResponse(makeResponsesApiResponse()));

      await request(app)
        .post("/v1/responses")
        .send({
          model: "gpt-5.4",
          input: [{ role: "user", content: "hello" }],
        });

      const responsesLogs = mockAuditLog.mock.calls.filter(
        (call: any[]) => call[0]?.eventType === "responses_api_call",
      );
      // Should have at least 2: request + response
      expect(responsesLogs.length).toBeGreaterThanOrEqual(2);
    });

    it("logs browser_tool_call events for function calls", async () => {
      const fcResponse = makeResponsesApiResponse({
        output: [
          {
            type: "function_call",
            id: "fc_1",
            call_id: "call_1",
            name: "browser.execute_actions",
            arguments: "{}",
          },
        ],
      });

      mockFetch
        .mockResolvedValueOnce(makeFetchResponse(fcResponse))
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          text: () => Promise.resolve('{"result":"ok"}'),
        })
        .mockResolvedValueOnce(makeFetchResponse(makeResponsesApiResponse()));

      await request(app)
        .post("/v1/responses")
        .send({
          model: "gpt-5.4",
          input: [{ role: "user", content: "click" }],
        });

      const toolLogs = mockAuditLog.mock.calls.filter(
        (call: any[]) => call[0]?.eventType === "browser_tool_call",
      );
      expect(toolLogs.length).toBe(1);
      expect(toolLogs[0][0].metadata.toolName).toBe("browser.execute_actions");
    });
  });

  // === Provider/Model Resolution ===

  describe("provider resolution", () => {
    it("returns 503 when no provider configured", async () => {
      deps = createMockDeps({
        getActiveLlmProvider: vi.fn().mockResolvedValue(null),
      });
      app = createApp(deps);

      const res = await request(app)
        .post("/v1/responses")
        .send({
          model: "gpt-5.4",
          input: [{ role: "user", content: "hello" }],
        });

      expect(res.status).toBe(503);
    });
  });
});
