import { describe, expect, it, vi } from "vitest";
import {
  runInferenceConnectivityProbe,
  type ConnectivityProbeTarget,
} from "../connectivityProbe";

const target: ConnectivityProbeTarget = {
  profileVersionId: 42,
  runtimeBindingHash: `sha256:${"d".repeat(64)}`,
  providerRecordId: 7,
  modelMappingId: 19,
  providerModelId: "vendor-model-r3",
  apiStyle: "responses",
  probePricing: {
    inputMicrosPerMillion: 0,
    outputMicrosPerMillion: 0,
    source: "mapping",
  },
  profile: {
    model: {
      logicalModelId: "model:general-r3",
      revision: "model-rev:3",
      providerNativeModelId: "vendor-model-r3",
      lifecycle: "METADATA_VALIDATED",
      capabilityRefs: ["capability:chat"],
      capabilities: {
        inputModalities: ["text"],
        outputModalities: ["text"],
        features: [],
        toolContractRefs: [],
        maxContextTokens: 32_000,
        maxOutputTokens: 4_096,
      },
    },
    deployment: {
      deploymentId: "deployment:llm-provider-map:19",
      revision: "deployment-rev:3",
      logicalModelId: "model:general-r3",
      logicalModelRevision: "model-rev:3",
      providerId: "provider:llm-provider:7",
      credentialOwnerRef: "credential-owner:llm-provider:7",
      endpointSurface: "responses_compatible",
      executionSurface: "cloud",
      region: "TH",
      allowedRegions: ["TH"],
      allowedPrivacyClasses: ["tenant-confidential"],
      retention: "unknown",
      status: "DEGRADED",
      health: "degraded",
      healthObservedAtMs: 1,
      latencyP95Ms: 0,
      resolvedAliasRevision: "model-rev:3",
      probe: {
        source: "catalog_metadata",
        endpointSurface: "responses_compatible",
        probeSuiteRevision: "catalog:1",
        evidenceRef: "catalog:record-1",
        observedAtMs: 1,
        validUntilMs: 999_999,
        probedCapabilityRefs: [],
        checks: {
          basicRequestResponse: false,
          chatResponsesParity: false,
          streamingCancellation: false,
          toolsContinuation: false,
          strictSchema: false,
          reasoningUsage: false,
          multimodal: false,
          contextOutputLimits: false,
          regionRetention: false,
          credentialOwnership: false,
        },
      },
      price: {
        currency: "USD_MICROS",
        inputMicrosPerMillion: 0,
        outputMicrosPerMillion: 0,
        snapshotRef: "price:catalog-1",
        validUntilMs: 999_999,
      },
      runtimeBinding: {
        kind: "llm_provider_map",
        providerRecordId: 7,
        modelMappingId: 19,
      },
    },
  },
};

describe("Spec 231 provider connectivity evidence", () => {
  it("uses only the exact pinned provider/model/surface and stores redacted partial evidence", async () => {
    const execute = vi.fn(async () => ({
      type: "success" as const,
      providerId: 7,
      providerName: "provider",
      response: {
        model: "vendor-model-r3",
        choices: [{ message: { content: "SAH_CONNECTIVITY_PROBE_V1" } }],
      },
    }));
    const persist = vi.fn(async () => undefined);
    const now = vi
      .fn<() => Date>()
      .mockReturnValueOnce(new Date("2026-09-27T04:00:00.000Z"))
      .mockReturnValueOnce(new Date("2026-09-27T04:00:00.250Z"));

    const result = await runInferenceConnectivityProbe(
      { deploymentId: target.profile.deployment.deploymentId, actorUserId: 12 },
      {
        resolveTarget: async () => ({ ok: true, target }),
        execute,
        persist,
        now,
      }
    );

    expect(execute).toHaveBeenCalledWith(
      expect.objectContaining({
        model: "model:general-r3",
        userId: 0,
        preferredProvider: 7,
        strictProviderPin: true,
        expectedProviderModelId: "vendor-model-r3",
        expectedApiStyle: "responses",
        expectedModelMappingId: 19,
        disableProviderFallbacks: true,
        maxTokens: 16,
        timeoutMs: 12_000,
      })
    );
    expect(result).toMatchObject({
      status: "passed",
      checks: { basicRequestResponse: true },
      responseLatencyMs: 250,
      observedProviderId: "provider:llm-provider:7",
      observedModelId: "vendor-model-r3",
    });
    expect(persist).toHaveBeenCalledOnce();
    const saved = persist.mock.calls[0][0];
    expect(saved.status).toBe("passed");
    expect(JSON.stringify(saved.resultJson)).not.toContain(
      "SAH_CONNECTIVITY_PROBE_V1"
    );
    expect(saved.probeKind).toBe("connectivity");
  });

  it("records provider/model identity mismatches as failed evidence", async () => {
    const persist = vi.fn(async () => undefined);
    const result = await runInferenceConnectivityProbe(
      { deploymentId: target.profile.deployment.deploymentId, actorUserId: 12 },
      {
        resolveTarget: async () => ({ ok: true, target }),
        execute: async () => ({
          type: "success",
          providerId: 7,
          providerName: "provider",
          response: {
            model: "unexpected-model-alias",
            choices: [{ message: { content: "SAH_CONNECTIVITY_PROBE_V1" } }],
          },
        }),
        persist,
        now: () => new Date("2026-09-27T04:00:00.000Z"),
      }
    );

    expect(result).toMatchObject({
      status: "failed",
      reasonCode: "OBSERVED_MODEL_MISMATCH",
      checks: { basicRequestResponse: false },
    });
    expect(persist.mock.calls[0][0].status).toBe("failed");
  });

  it("rejects passing evidence if the candidate or runtime binding changes during the provider call", async () => {
    let resolutionCount = 0;
    const changedTarget = {
      ...target,
      profileVersionId: target.profileVersionId + 1,
      runtimeBindingHash: `sha256:${"e".repeat(64)}`,
    };
    const persist = vi.fn(async () => undefined);
    const result = await runInferenceConnectivityProbe(
      { deploymentId: target.profile.deployment.deploymentId, actorUserId: 12 },
      {
        resolveTarget: async () => {
          resolutionCount += 1;
          return {
            ok: true as const,
            target: resolutionCount === 1 ? target : changedTarget,
          };
        },
        execute: async () => ({
          type: "success",
          providerId: 7,
          providerName: "provider",
          response: {
            model: "vendor-model-r3",
            choices: [{ message: { content: "SAH_CONNECTIVITY_PROBE_V1" } }],
          },
        }),
        persist,
        now: () => new Date("2026-09-27T04:00:00.000Z"),
      }
    );

    expect(result).toMatchObject({
      status: "failed",
      reasonCode: "PROBE_TARGET_CHANGED_DURING_EXECUTION",
      checks: { basicRequestResponse: false },
    });
    expect(persist.mock.calls[0][0].status).toBe("failed");
    expect(persist.mock.calls[0][0].resultJson).toMatchObject({
      runtimeBindingHash: target.runtimeBindingHash,
    });
  });

  it("does not dispatch or persist when the profile/runtime target is not eligible for probing", async () => {
    const execute = vi.fn();
    const persist = vi.fn();
    const result = await runInferenceConnectivityProbe(
      { deploymentId: "missing-deployment", actorUserId: 12 },
      {
        resolveTarget: async () => ({ ok: false, reason: "PROFILE_NOT_FOUND" }),
        execute,
        persist,
      }
    );
    expect(result).toEqual({
      status: "blocked",
      reasonCode: "PROFILE_NOT_FOUND",
    });
    expect(execute).not.toHaveBeenCalled();
    expect(persist).not.toHaveBeenCalled();
  });

  it("does not report success when durable evidence cannot be stored", async () => {
    const result = await runInferenceConnectivityProbe(
      { deploymentId: target.profile.deployment.deploymentId, actorUserId: 12 },
      {
        resolveTarget: async () => ({ ok: true, target }),
        execute: async () => ({
          type: "success",
          providerId: 7,
          providerName: "provider",
          response: {
            model: "vendor-model-r3",
            choices: [{ message: { content: "SAH_CONNECTIVITY_PROBE_V1" } }],
          },
        }),
        persist: async () => {
          throw new Error("database unavailable");
        },
        now: () => new Date("2026-09-27T04:00:00.000Z"),
      }
    );
    expect(result).toEqual({
      status: "blocked",
      reasonCode: "PROBE_EVIDENCE_PERSIST_FAILED",
    });
  });
});
