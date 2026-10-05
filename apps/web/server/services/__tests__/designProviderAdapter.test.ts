import { describe, expect, it, vi } from "vitest";
import { FEATURE_FLAG_DEFAULTS, type TenantFeatureFlags } from "../../../shared/featureFlags";
import {
  createDesignProviderAdapter,
  DesignProviderAdapterError,
  type DesignProviderCandidate,
  type DesignProviderPolicy,
} from "../designProviderAdapter";

const enabledFlags = {
  ...FEATURE_FLAG_DEFAULTS,
  smartAiHubDesignIntelligence: true,
  smartAiHubDesignNative: true,
  smartAiHubDesignResolver: true,
  smartAiHubDesignProviders: true,
  smartAiHubGoogleStitch: true,
  smartAiHubDesignVisualVerify: true,
} satisfies TenantFeatureFlags;
const actor = { tenantId: "tenant-1", projectId: "project-1", userId: "user-1" };
const request = {
  schemaVersion: 1 as const,
  tenantId: actor.tenantId,
  projectId: actor.projectId,
  requestId: "request-1",
  requestedBy: actor.userId,
  intent: "mini-app-screen" as const,
  prompt: { text: "Create a settings screen", trust: "user-authored" as const },
  locale: "en",
  componentCatalogSnapshotId: "catalog-1",
};
const policy: DesignProviderPolicy = {
  status: "approved",
  certification: "verified",
  consentGranted: true,
  bindingEligible: true,
  policyDecisionRef: "decision-1",
  region: "region-eu",
  retention: "none",
  allowImportedUntrusted: false,
  allowedFields: ["intent", "prompt", "locale"],
  apiVersion: "2026-01",
  requiredCapabilities: ["design-screen"],
};

function createOperationStore() {
  const values = new Map<string, DesignProviderCandidate>();
  const fingerprints = new Map<string, string>();
  const pending = new Map<string, { fingerprint: string; promise: Promise<DesignProviderCandidate> }>();
  return {
    runOnce: (key: string, fingerprint: string, operation: () => Promise<DesignProviderCandidate>) => {
      const existing = values.get(key);
      const oldFingerprint = fingerprints.get(key);
      if (oldFingerprint && oldFingerprint !== fingerprint) throw new DesignProviderAdapterError("REQUEST_CONFLICT");
      if (existing) return existing;
      const inFlight = pending.get(key);
      if (inFlight) {
        if (inFlight.fingerprint !== fingerprint) throw new DesignProviderAdapterError("REQUEST_CONFLICT");
        return inFlight.promise;
      }
      const promise = operation().then((candidate) => {
        values.set(key, candidate);
        fingerprints.set(key, fingerprint);
        pending.delete(key);
        return candidate;
      }, (error) => {
        pending.delete(key);
        throw error;
      });
      pending.set(key, { fingerprint, promise });
      return promise;
    },
  };
}

function makeAdapter(overrides: Partial<Parameters<typeof createDesignProviderAdapter>[0]> = {}) {
  return createDesignProviderAdapter({
    flags: enabledFlags,
    bindingRef: "binding-ref-only",
    readPolicy: async () => policy,
    operationStore: createOperationStore(),
    provider: {
      negotiate: async () => ({ apiVersion: "2026-01", capabilities: ["design-screen"] }),
      generate: async () => ({ screen: "settings", components: ["SettingsForm"] }),
    },
    createId: () => "artifact-1",
    now: () => new Date("2026-01-01T00:00:00.000Z"),
    ...overrides,
  });
}

describe("optional design provider adapter", () => {
  it("does not invoke a provider while default feature flags are off", async () => {
    const negotiate = vi.fn(async () => ({ apiVersion: "2026-01", capabilities: ["design-screen"] }));
    const adapter = makeAdapter({ flags: FEATURE_FLAG_DEFAULTS, provider: { negotiate, generate: vi.fn() } });
    await expect(adapter.generate(request, actor)).rejects.toMatchObject({ code: "PROVIDER_DISABLED" });
    expect(negotiate).not.toHaveBeenCalled();
  });

  it("requires the server policy authority to approve consent, certification, binding, egress and retention", async () => {
    const generate = vi.fn();
    for (const result of [
      null,
      { ...policy, certification: "unverified" },
      { ...policy, consentGranted: false },
      { ...policy, bindingEligible: false },
      { ...policy, allowedFields: ["prompt", "tenantId"] },
      { ...policy, retention: undefined },
    ]) {
      const adapter = makeAdapter({ readPolicy: async () => result as DesignProviderPolicy | null, provider: { negotiate: vi.fn(), generate } });
      await expect(adapter.generate(request, actor)).rejects.toMatchObject({ code: "POLICY_DENIED" });
    }
    expect(generate).not.toHaveBeenCalled();
  });

  it("sends only approved prompt fields and builds server-owned candidate lineage and rights", async () => {
    const generate = vi.fn(async (providerInput: unknown) => {
      expect(providerInput).toEqual({ intent: "mini-app-screen", prompt: "Create a settings screen", locale: "en" });
      return { screen: "settings" };
    });
    const candidate = await makeAdapter({ provider: { negotiate: async () => ({ apiVersion: "2026-01", capabilities: ["design-screen"] }), generate } }).generate(request, actor);
    expect(candidate).toMatchObject({
      schemaVersion: 1,
      tenantId: actor.tenantId,
      projectId: actor.projectId,
      ownerId: actor.userId,
      rights: { ownerId: actor.userId, assetsCleared: false },
      provenance: { source: "external-provider", providerVersion: "2026-01", policyDecisionRef: "decision-1", branchId: "artifact-1" },
    });
    expect(candidate.digest).toMatch(/^sha256:[a-f0-9]{64}$/);
  });

  it("replays the same idempotent operation without a second provider invocation", async () => {
    const generate = vi.fn(async () => ({ screen: "settings" }));
    const operationStore = createOperationStore();
    const adapter = makeAdapter({ operationStore, provider: { negotiate: async () => ({ apiVersion: "2026-01", capabilities: ["design-screen"] }), generate } });
    const first = await adapter.generate(request, actor);
    const replay = await adapter.generate(request, actor);
    expect(replay).toEqual(first);
    expect(generate).toHaveBeenCalledTimes(1);
    await expect(adapter.generate({ ...request, prompt: { ...request.prompt, text: "Changed request" } }, actor))
      .rejects.toMatchObject({ code: "REQUEST_CONFLICT" });
    const changedPolicyAdapter = makeAdapter({ operationStore, readPolicy: async () => ({ ...policy, requiredCapabilities: ["different-capability"] }) });
    await expect(changedPolicyAdapter.generate(request, actor)).rejects.toMatchObject({ code: "REQUEST_CONFLICT" });
    expect(generate).toHaveBeenCalledTimes(1);
  });

  it("isolates idempotent results by actor within one project", async () => {
    const generate = vi.fn(async () => ({ screen: "settings" }));
    const operationStore = createOperationStore();
    const adapter = makeAdapter({ operationStore, provider: { negotiate: async () => ({ apiVersion: "2026-01", capabilities: ["design-screen"] }), generate } });
    const first = await adapter.generate(request, actor);
    const secondActor = { ...actor, userId: "user-2" };
    const second = await adapter.generate({ ...request, requestedBy: "user-2" }, secondActor);
    expect(first.ownerId).toBe("user-1");
    expect(second.ownerId).toBe("user-2");
    expect(generate).toHaveBeenCalledTimes(2);
  });

  it("normalizes negotiation, secret-policy and provider failures", async () => {
    await expect(makeAdapter({ provider: { negotiate: async () => ({ apiVersion: "2025-01", capabilities: ["design-screen"] }), generate: vi.fn() } }).generate(request, actor))
      .rejects.toMatchObject({ code: "VERSION_MISMATCH" });
    await expect(makeAdapter({ provider: { negotiate: async () => ({ apiVersion: "2026-01", capabilities: [] }), generate: vi.fn() } }).generate(request, actor))
      .rejects.toMatchObject({ code: "CAPABILITY_UNAVAILABLE" });
    await expect(makeAdapter({ readPolicy: async () => { throw new Error("secret=raw-value"); } }).generate(request, actor))
      .rejects.toMatchObject({ code: "PROVIDER_UNAVAILABLE" });
    await expect(makeAdapter({ readPolicy: async () => ({ ...policy, allowedFields: undefined }) as unknown as DesignProviderPolicy }).generate(request, actor))
      .rejects.toMatchObject({ code: "POLICY_DENIED" });
    await expect(makeAdapter({ provider: { negotiate: async () => { throw new Error("provider token"); }, generate: vi.fn() } }).generate(request, actor))
      .rejects.toBeInstanceOf(DesignProviderAdapterError);
    await expect(makeAdapter({ provider: { negotiate: async () => ({ apiVersion: "2026-01", capabilities: undefined }) as unknown as { apiVersion: string; capabilities: string[] }, generate: vi.fn() } }).generate(request, actor))
      .rejects.toMatchObject({ code: "PROVIDER_UNAVAILABLE" });
  });

  it("rejects invalid timeout configuration before any request", () => {
    expect(() => makeAdapter({ timeoutMs: Number.NaN })).toThrow("timeoutMs must be a positive finite number");
  });

  it("handles cancellation and provider timeout with typed outcomes", async () => {
    const cancelled = new AbortController();
    cancelled.abort();
    await expect(makeAdapter().generate(request, actor, cancelled.signal)).rejects.toMatchObject({ code: "CANCELLED" });
    const adapter = makeAdapter({
      timeoutMs: 5,
      provider: {
        negotiate: async () => ({ apiVersion: "2026-01", capabilities: ["design-screen"] }),
        generate: (_payload, signal) => new Promise((_resolve, reject) => signal.addEventListener("abort", () => reject(new Error("aborted")), { once: true })),
      },
    });
    await expect(adapter.generate(request, actor)).rejects.toMatchObject({ code: "TIMEOUT" });

    const active = new AbortController();
    const waiting = makeAdapter({
      provider: {
        negotiate: async () => ({ apiVersion: "2026-01", capabilities: ["design-screen"] }),
        generate: () => new Promise(() => undefined),
      },
    }).generate(request, actor, active.signal);
    setTimeout(() => active.abort(), 5);
    await expect(waiting).rejects.toMatchObject({ code: "CANCELLED" });

    let releaseLock: (() => void) | undefined;
    const lock = new Promise<void>((resolve) => { releaseLock = resolve; });
    const negotiateAfterLock = vi.fn(async () => ({ apiVersion: "2026-01", capabilities: ["design-screen"] }));
    const generateAfterLock = vi.fn(async () => ({ screen: "settings" }));
    const waitingForLock = makeAdapter({
      operationStore: { runOnce: async (_key, _fingerprint, operation) => { await lock; return operation(); } },
      provider: { negotiate: negotiateAfterLock, generate: generateAfterLock },
    });
    const queuedController = new AbortController();
    const queuedRequest = waitingForLock.generate(request, actor, queuedController.signal);
    queuedController.abort();
    releaseLock?.();
    await expect(queuedRequest).rejects.toMatchObject({ code: "CANCELLED" });
    expect(negotiateAfterLock).not.toHaveBeenCalled();
    expect(generateAfterLock).not.toHaveBeenCalled();

    const slowController = new AbortController();
    let resolveProvider: ((value: unknown) => void) | undefined;
    const slow = makeAdapter({ provider: {
      negotiate: async () => ({ apiVersion: "2026-01", capabilities: ["design-screen"] }),
      generate: () => new Promise((resolve) => { resolveProvider = resolve; }),
    } }).generate(request, actor, slowController.signal);
    await new Promise((resolve) => setTimeout(resolve, 0));
    slowController.abort();
    resolveProvider?.({ screen: "late result" });
    await expect(slow).rejects.toMatchObject({ code: "CANCELLED" });
  });

  it("rejects unscoped requests and unsafe provider payloads", async () => {
    await expect(makeAdapter().generate({ ...request, tenantId: "other" }, actor)).rejects.toMatchObject({ code: "POLICY_DENIED" });
    await expect(makeAdapter({ provider: { negotiate: async () => ({ apiVersion: "2026-01", capabilities: ["design-screen"] }), generate: async () => ({ html: "<script>alert(1)</script>" }) } }).generate(request, actor))
      .rejects.toMatchObject({ code: "RESULT_INVALID" });
  });

  it("fails closed before policy or provider calls when the catalog snapshot is missing", async () => {
    const readPolicy = vi.fn(async () => policy);
    const negotiate = vi.fn(async () => ({ apiVersion: "2026-01", capabilities: ["design-screen"] }));
    const generate = vi.fn(async () => ({ screen: "settings" }));
    const adapter = makeAdapter({ readPolicy, provider: { negotiate, generate } });

    await expect(adapter.generate({ ...request, componentCatalogSnapshotId: undefined }, actor))
      .rejects.toMatchObject({ code: "POLICY_DENIED" });

    expect(readPolicy).not.toHaveBeenCalled();
    expect(negotiate).not.toHaveBeenCalled();
    expect(generate).not.toHaveBeenCalled();
  });
});
