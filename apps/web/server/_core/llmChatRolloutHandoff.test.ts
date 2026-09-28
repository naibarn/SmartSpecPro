import { beforeEach, describe, expect, it, vi } from "vitest";
import express from "express";
import { createServer } from "http";

const mocks = vi.hoisted(() => ({
  authorize: vi.fn(),
  select: vi.fn(),
  stream: vi.fn(),
}));

vi.mock("./authz", () => ({
  authorizeRequest: (...args: unknown[]) => mocks.authorize(...args),
}));
vi.mock("./limits", () => ({
  rateLimit: () => (_req: unknown, _res: unknown, next: () => void) => next(),
  enforceJsonBodyMaxBytes: () => (_req: unknown, _res: unknown, next: () => void) => next(),
}));
vi.mock("./responsesRoutes", () => ({ registerResponsesRoutes: vi.fn() }));
vi.mock("../db", () => ({
  getDb: () => ({
    select: () => ({
      from: () => ({
        where: () => ({ limit: () => mocks.select() }),
      }),
    }),
  }),
}));
vi.mock("../services/llmRoutesHandler", () => ({
  handleChatWithRouter: vi.fn(),
  handleStreamWithRouter: (...args: unknown[]) => mocks.stream(...args),
  replaySavedAssistantSse: vi.fn(),
}));
vi.mock("../services/creditService", () => ({
  getCreditBalance: vi.fn(),
  getCreditBalanceByOpenId: vi.fn(),
  hasEnoughCredits: vi.fn(async () => true),
  deductCredits: vi.fn(),
  calculateCreditsFromCost: vi.fn(),
  calculateCreditsForLLM: vi.fn(),
}));
vi.mock("../services/mediaGenerationService", () => ({
  resolveExternalMediaMessageUrls: async (messages: unknown[]) => messages,
}));

async function start(app: express.Express) {
  const server = createServer(app);
  await new Promise<void>(resolve => server.listen(0, resolve));
  const address = server.address();
  const port = typeof address === "object" && address ? address.port : 0;
  return { server, url: `http://127.0.0.1:${port}/api/llm/stream` };
}

describe("Spec 231 primary Chat route rollout handoff", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("JWT_SECRET", "spec231-test-jwt-secret-32-characters-minimum");
    vi.stubEnv("INFERENCE_ROLLOUT_KEYS_JSON", JSON.stringify({
      "route-test-key": Buffer.alloc(32, 11).toString("base64"),
    }));
    vi.stubEnv("INFERENCE_ROLLOUT_ACTIVE_KEY_ID", "route-test-key");
    mocks.authorize.mockResolvedValue({ ok: true, mode: "api_key", userId: 7 });
    mocks.stream.mockImplementation(async ({ res }: any) => {
      res.status(200);
      res.setHeader("Content-Type", "text/event-stream");
      res.write(`event: message_complete\ndata: {"content":"ok"}\n\n`);
      res.end();
    });
  });

  it("verifies the persisted HMAC bundle before handing an authenticated request to the policy gateway", async () => {
    const { signInferenceRolloutBundle } = await import("../services/inference/rolloutBundle");
    const signed = signInferenceRolloutBundle({
      signingKeyId: "route-test-key",
      keyring: new Map([["route-test-key", Buffer.alloc(32, 11)]]),
      payload: {
        contract: "SAH-INFERENCE-ROLLOUT-1",
        bundleId: "route-integration",
        sequence: 1,
        createdAt: "2026-09-28T00:00:00.000Z",
        createdBy: "admin:test",
        routerPolicyRevision: "policy:test",
        logicalModelRegistryRevision: "registry:test",
        deploymentCredentialBindingRevision: "bindings:test",
        surfaceCertificationRevision: "certification:test",
        gatewayRouteManifestHashes: [`sha256:${"a".repeat(64)}`],
        billingPricingSnapshotRefs: ["pricing:test"],
        fxPolicyRevision: "fx:test",
        guardrailPolicyRevision: "guardrail:test",
        rollbackBundleHash: `sha256:${"b".repeat(64)}`,
        contractVersions: ["SAH-INFERENCE-2", "SAH-RETRIEVAL-2"],
        providerCapabilityRecheckRef: "probe:test",
        environmentReadinessRef: "readiness:test",
      },
    });
    mocks.select
      .mockResolvedValueOnce([{ bundleHash: signed.bundleHash }])
      .mockResolvedValueOnce([{
        bundleHash: signed.bundleHash,
        payloadJson: signed.payload,
        signingKeyId: signed.signingKeyId,
        signature: signed.signature,
      }]);

    const { registerLLMRoutes } = await import("./llmRoutes");
    const app = express();
    app.use(express.json());
    app.use((_req, _res, next) => next());
    registerLLMRoutes(app);
    const { server, url } = await start(app);
    try {
      const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Idempotency-Key": "request-1" },
        body: JSON.stringify({ messages: [{ role: "user", content: "hello" }] }),
      });
      expect(response.status).toBe(200);
      expect(await response.text()).toContain("message_complete");
      expect(mocks.stream).toHaveBeenCalledWith(expect.objectContaining({
        userId: 7,
        idempotencyKey: "request-1",
        requirePolicyGateway: true,
        contextPrepared: true,
      }));
    } finally {
      await new Promise<void>(resolve => server.close(() => resolve()));
    }
  });

  it("does not hand off a persisted active bundle with an invalid HMAC to the legacy proxy", async () => {
    mocks.select
      .mockResolvedValueOnce([{ bundleHash: `sha256:${"c".repeat(64)}` }])
      .mockResolvedValueOnce([{
        bundleHash: `sha256:${"c".repeat(64)}`,
        payloadJson: {
          contract: "SAH-INFERENCE-ROLLOUT-1",
          bundleId: "tampered-route-integration",
          sequence: 1,
          createdAt: "2026-09-28T00:00:00.000Z",
          createdBy: "admin:test",
          routerPolicyRevision: "policy:test",
          logicalModelRegistryRevision: "registry:test",
          deploymentCredentialBindingRevision: "bindings:test",
          surfaceCertificationRevision: "certification:test",
          gatewayRouteManifestHashes: [`sha256:${"a".repeat(64)}`],
          billingPricingSnapshotRefs: ["pricing:test"],
          fxPolicyRevision: "fx:test",
          guardrailPolicyRevision: "guardrail:test",
          rollbackBundleHash: `sha256:${"b".repeat(64)}`,
          contractVersions: ["SAH-INFERENCE-2", "SAH-RETRIEVAL-2"],
          providerCapabilityRecheckRef: "probe:test",
          environmentReadinessRef: "readiness:test",
        },
        signingKeyId: "route-test-key",
        signature: "0".repeat(64),
      }]);
    const { registerLLMRoutes } = await import("./llmRoutes");
    const app = express();
    app.use(express.json());
    registerLLMRoutes(app);
    const { server, url } = await start(app);
    try {
      const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: [{ role: "user", content: "hello" }] }),
      });
      const body = await response.text();
      expect(response.status).toBe(200);
      expect(body).toContain("SIGNATURE_INVALID");
      expect(mocks.stream).not.toHaveBeenCalled();
    } finally {
      await new Promise<void>(resolve => server.close(() => resolve()));
    }
  });
});
