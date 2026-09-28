import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  row: null as unknown,
  probeEvidence: null as unknown,
  selectCount: 0,
  registry: null as unknown,
  eligible: true,
  composedAuthority: null as unknown,
  composedSources: null as unknown,
}));

vi.mock("../../../db", () => ({
  getDb: () => ({
    transaction: async (callback: (tx: any) => Promise<unknown>) =>
      callback({
        execute: async () => undefined,
        select: () => {
          state.selectCount += 1;
          let resultRows: unknown[] = [];
          const builder: any = {
            from: (table: object) => {
              const tableName = (table as Record<PropertyKey, unknown>)[
                Symbol.for("drizzle:Name")
              ];
              resultRows =
                tableName === "llm_inference_probe_runs"
                  ? state.probeEvidence
                    ? [state.probeEvidence]
                    : []
                  : state.row
                    ? [state.row]
                    : [];
              return builder;
            },
            innerJoin: () => builder,
            where: () => builder,
            limit: () => builder,
            then: (resolve: (rows: unknown[]) => unknown) =>
              Promise.resolve(resultRows).then(resolve),
          };
          return builder;
        },
      }),
  }),
}));
vi.mock("../profileRegistry", () => ({
  loadInferenceProfileRegistry: async () => state.registry,
}));
vi.mock("../policySourceLoader", () => ({
  loadInferencePolicySourceLayers: async () => ({
    ok: true,
    sources: {
      platform: {
        revision: "platform-policy:1",
        routerPolicy: {
          scoreCalibrationRevision: "scores:platform-1",
          weights: {
            qualityPpm: 800_000,
            costPpm: 50_000,
            latencyPpm: 50_000,
            reliabilityPpm: 50_000,
            compatibilityPpm: 50_000,
          },
        },
      },
    },
  }),
}));
vi.mock("../authorityComposer", () => ({
  composeInferenceAuthority: (sources: unknown) => {
    state.composedSources = sources;
    return state.composedAuthority;
  },
}));
vi.mock("../contracts", () => ({
  resolveTrustedInferenceIntent: (intent: unknown) => ({ ok: true, intent }),
}));
vi.mock("../providerHealth", () => ({ isAvailable: () => true }));
vi.mock("../qualification", () => ({
  buildQualifiedRouteCandidate: () =>
    state.eligible
      ? {
          ok: true,
          candidate: {
            deploymentId: "deployment:llm-provider-map:42",
            providerId: "provider:llm-provider:7",
            credentialOwnerRef: "credential-owner:llm-provider:7",
          },
        }
      : { ok: false, reasonCodes: ["LIVE_PROBE_REQUIRED"] },
}));
vi.mock("../policyResolver", () => ({
  evaluateInferenceEligibility: () => ({ eligible: true, reasonCodes: [] }),
}));

import { resolveCurrentInferenceDeployment } from "../runtimeDeploymentResolver";
import { createInferenceRuntimeBindingFingerprint } from "../runtimeBindingFingerprint";

const model = {
  logicalModelId: "model:chat",
  providerNativeModelId: "native-chat",
};
const deployment = {
  deploymentId: "deployment:llm-provider-map:42",
  revision: "deploy-rev:1",
  providerId: "provider:llm-provider:7",
  credentialOwnerRef: "credential-owner:llm-provider:7",
  logicalModelId: "model:chat",
  endpointSurface: "responses_compatible",
  executionSurface: "cloud",
  price: {
    inputMicrosPerMillion: 0,
    outputMicrosPerMillion: 0,
  },
  probe: {
    source: "catalog_metadata",
    evidenceRef: "catalog:fixture",
    probeSuiteRevision: "catalog:1",
  },
  runtimeBinding: {
    kind: "llm_provider_map",
    providerRecordId: 7,
    modelMappingId: 42,
  },
};
const authority = {
  policyRevision: "policy:1",
  registryRevision: "registry:1",
  routerPolicyRevision: "router:1",
} as never;
const intent = {
  tenantId: "tenant-a",
  principalId: "user-1",
  policyRevision: "policy:1",
} as never;
const owners = {
  budget: {},
  requestContext: {
    tenantId: "tenant-a",
    principalId: "user-1",
    traceId: "trace-1",
    budgetScopeRef: "tenant:tenant-a",
    idempotencyKey: "idem-1",
    effectivePrivacyClass: "tenant-confidential",
    effectiveRisk: "low",
  },
} as never;

describe("runtime deployment resolver", () => {
  beforeEach(() => {
    state.selectCount = 0;
    state.eligible = true;
    state.composedAuthority = { ok: true, snapshot: authority };
    state.composedSources = null;
    state.registry = {
      ok: true,
      registryRevision: "registry:1",
      profiles: [{ model, deployment }],
    };
    state.row = {
      mappingId: 42,
      providerRecordId: 7,
      modelId: "model:chat",
      providerModelId: "native-chat",
      apiStyle: "responses",
      mappingEnabled: true,
      providerEnabled: true,
      apiKeyEncrypted: "must-not-return",
      baseUrl: "https://provider.example",
      providerName: "provider-a",
      healthStatus: "healthy",
      availableModels: [],
      pricingInput: "0",
      pricingOutput: "0",
      isFree: false,
    };
    state.probeEvidence = null;
  });

  it("revalidates the exact provider mapping and returns no credential material", async () => {
    const result = await resolveCurrentInferenceDeployment({
      deploymentId: deployment.deploymentId,
      intent,
      owners,
      expectedRegistryRevision: "registry:1",
      expectedRouterPolicyRevision: "router:1",
      now: new Date(10_000),
    });
    expect(result).toMatchObject({
      ok: true,
      registryRevision: "registry:1",
      candidate: { deploymentId: deployment.deploymentId },
      runtime: {
        providerRecordId: 7,
        modelMappingId: 42,
        providerName: "provider-a",
        providerModelId: "native-chat",
        apiStyle: "responses",
      },
    });
    expect(JSON.stringify(result)).not.toContain("must-not-return");
    expect(state.selectCount).toBe(1);
    expect(state.composedSources).toMatchObject({
      router: {
        revision: "platform-policy:1",
        scoreCalibrationRevision: "scores:platform-1",
        routingWeights: {
          qualityPpm: 800_000,
          costPpm: 50_000,
          latencyPpm: 50_000,
          reliabilityPpm: 50_000,
          compatibilityPpm: 50_000,
        },
      },
    });
  });

  it("rejects a live-qualified route after its encrypted credential or endpoint changes", async () => {
    const liveDeployment = {
      ...deployment,
      probe: {
        source: "live_probe",
        evidenceRef: `sha256:${"a".repeat(64)}`,
        probeSuiteRevision: "capability:1",
      },
    };
    state.registry = {
      ok: true,
      registryRevision: "registry:1",
      profiles: [{ model, deployment: liveDeployment }],
    };
    state.probeEvidence = {
      profileVersionId: 10,
      deploymentId: deployment.deploymentId,
      deploymentRevision: deployment.revision,
      providerRecordId: 7,
      modelMappingId: 42,
      probeSuiteRevision: "capability:1",
      resultJson: {
        evidenceRef: liveDeployment.probe.evidenceRef,
        runtimeBindingHash: createInferenceRuntimeBindingFingerprint({
          profileVersionId: 10,
          deploymentRevision: deployment.revision,
          modelMappingId: 42,
          providerRecordId: 7,
          modelId: "model:chat",
          providerModelId: "native-chat",
          apiStyle: "responses",
          baseUrl: "https://provider.example",
          encryptedCredential: "must-not-return",
          probePricing: {
            inputMicrosPerMillion: 1_000_000,
            outputMicrosPerMillion: 4_000_000,
            source: "default",
          },
        }),
      },
    };

    const verified = await resolveCurrentInferenceDeployment({
      deploymentId: deployment.deploymentId,
      intent,
      owners,
      expectedRegistryRevision: "registry:1",
      expectedRouterPolicyRevision: "router:1",
      now: new Date(10_000),
    });
    expect(verified.ok).toBe(true);

    state.row = {
      ...(state.row as object),
      apiKeyEncrypted: "rotated-ciphertext",
    };
    await expect(
      resolveCurrentInferenceDeployment({
        deploymentId: deployment.deploymentId,
        intent,
        owners,
        expectedRegistryRevision: "registry:1",
        expectedRouterPolicyRevision: "router:1",
        now: new Date(10_000),
      })
    ).resolves.toEqual({
      ok: false,
      reason: "RUNTIME_PROBE_BINDING_MISMATCH",
    });
  });

  it("refuses a changed registry revision before provider lookup", async () => {
    state.registry = {
      ...(state.registry as object),
      registryRevision: "registry:2",
    };
    await expect(
      resolveCurrentInferenceDeployment({
        deploymentId: deployment.deploymentId,
        intent,
        owners,
        expectedRegistryRevision: "registry:1",
        expectedRouterPolicyRevision: "router:1",
        now: new Date(10_000),
      })
    ).resolves.toEqual({ ok: false, reason: "AUTHORITY_STALE_OR_CHANGED" });
    expect(state.selectCount).toBe(0);
  });

  it("rejects live qualification when the current billing price changes", async () => {
    const liveDeployment = {
      ...deployment,
      probe: {
        source: "live_probe",
        evidenceRef: `sha256:${"b".repeat(64)}`,
        probeSuiteRevision: "capability:1",
      },
    };
    state.registry = {
      ok: true,
      registryRevision: "registry:1",
      profiles: [{ model, deployment: liveDeployment }],
    };
    state.probeEvidence = {
      profileVersionId: 10,
      deploymentId: deployment.deploymentId,
      deploymentRevision: deployment.revision,
      providerRecordId: 7,
      modelMappingId: 42,
      probeSuiteRevision: "capability:1",
      resultJson: {
        evidenceRef: liveDeployment.probe.evidenceRef,
        runtimeBindingHash: createInferenceRuntimeBindingFingerprint({
          profileVersionId: 10,
          deploymentRevision: deployment.revision,
          modelMappingId: 42,
          providerRecordId: 7,
          modelId: "model:chat",
          providerModelId: "native-chat",
          apiStyle: "responses",
          baseUrl: "https://provider.example",
          encryptedCredential: "must-not-return",
          probePricing: {
            inputMicrosPerMillion: 1_000_000,
            outputMicrosPerMillion: 4_000_000,
            source: "default",
          },
        }),
      },
    };
    state.row = { ...(state.row as object), pricingInput: "0.25" };

    await expect(
      resolveCurrentInferenceDeployment({
        deploymentId: deployment.deploymentId,
        intent,
        owners,
        expectedRegistryRevision: "registry:1",
        expectedRouterPolicyRevision: "router:1",
        now: new Date(10_000),
      })
    ).resolves.toEqual({
      ok: false,
      reason: "RUNTIME_PROBE_BINDING_MISMATCH",
    });
  });

  it("refuses a current map whose native model no longer matches the profile", async () => {
    state.row = { ...(state.row as object), providerModelId: "native-chat-v3" };
    await expect(
      resolveCurrentInferenceDeployment({
        deploymentId: deployment.deploymentId,
        intent,
        owners,
        expectedRegistryRevision: "registry:1",
        expectedRouterPolicyRevision: "router:1",
        now: new Date(10_000),
      })
    ).resolves.toEqual({
      ok: false,
      reason: "RUNTIME_BINDING_IDENTITY_MISMATCH",
    });
  });
});
