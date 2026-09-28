import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  rows: [] as Array<Record<string, unknown>>,
  probeRows: [] as Array<Record<string, unknown>>,
  fail: false,
}));

vi.mock("../../../db", () => ({
  getDb: () => ({
    transaction: async (callback: (tx: any) => Promise<unknown>) =>
      callback({
        execute: async () => undefined,
        select: () => {
          let resultRows: Array<Record<string, unknown>> = [];
          const builder: any = {
            from: (table: object) => {
              resultRows =
                (table as Record<PropertyKey, unknown>)[
                  Symbol.for("drizzle:Name")
                ] === "llm_inference_probe_runs"
                  ? state.probeRows
                  : state.rows;
              return builder;
            },
            innerJoin: () => builder,
            where: () => builder,
            then: (
              resolve: (rows: unknown[]) => unknown,
              reject: (error: unknown) => unknown
            ) => {
              if (state.fail)
                return Promise.reject(new Error("database unavailable")).then(
                  resolve,
                  reject
                );
              return Promise.resolve(resultRows).then(resolve, reject);
            },
          };
          return builder;
        },
      }),
  }),
}));

import {
  matchesStoredCapabilityProbeEvidence,
  loadInferenceProfileRegistry,
  validateInferenceProfilePublication,
  type InferenceProfilePair,
} from "../profileRegistry";

const metadataProfile: InferenceProfilePair = {
  model: {
    logicalModelId: "model:chat-v1",
    revision: "model-rev:1",
    providerNativeModelId: "vendor-chat-v1",
    lifecycle: "POLICY_REVIEWED",
    capabilityRefs: ["capability:text-chat"],
    capabilities: {
      inputModalities: ["text"],
      outputModalities: ["text"],
      features: ["streaming"],
      toolContractRefs: [],
      maxContextTokens: 16_000,
      maxOutputTokens: 4_000,
    },
  },
  deployment: {
    deploymentId: "deployment:provider-account-a:model-chat-v1",
    revision: "deployment-rev:1",
    logicalModelId: "model:chat-v1",
    logicalModelRevision: "model-rev:1",
    providerId: "provider:account-a",
    credentialOwnerRef: "credential-owner:platform-default",
    endpointSurface: "responses_compatible",
    executionSurface: "cloud",
    region: "TH",
    allowedRegions: ["TH"],
    allowedPrivacyClasses: ["tenant-confidential"],
    retention: "limited-retention",
    status: "DEGRADED",
    health: "degraded",
    healthObservedAtMs: 100,
    latencyP95Ms: 2_000,
    resolvedAliasRevision: "model-rev:1",
    probe: {
      source: "catalog_metadata",
      endpointSurface: "responses_compatible",
      probeSuiteRevision: "catalog-import:1",
      evidenceRef: "catalog:record-1",
      observedAtMs: 100,
      validUntilMs: 200,
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
      inputMicrosPerMillion: 1_000_000,
      outputMicrosPerMillion: 2_000_000,
      snapshotRef: "catalog-price:1",
      validUntilMs: 200,
    },
  },
};

const certifiedProfile: InferenceProfilePair = {
  model: { ...metadataProfile.model, lifecycle: "ACTIVE" },
  deployment: {
    ...metadataProfile.deployment,
    status: "ACTIVE",
    health: "healthy",
    runtimeBinding: {
      kind: "llm_provider_map",
      providerRecordId: 7,
      modelMappingId: 19,
    },
    probe: {
      ...metadataProfile.deployment.probe,
      source: "live_probe",
      probeSuiteRevision: "capability:1",
      evidenceRef: `sha256:${"a".repeat(64)}`,
      checks: {
        basicRequestResponse: true,
        chatResponsesParity: true,
        streamingCancellation: true,
        toolsContinuation: true,
        strictSchema: true,
        reasoningUsage: true,
        multimodal: true,
        contextOutputLimits: true,
        regionRetention: true,
        credentialOwnership: true,
      },
      probedCapabilityRefs: ["capability:text-chat"],
    },
  },
};

const storedReceipt = {
  runId: "run:profile-registry-test",
  profileVersionId: 17,
  deploymentId: certifiedProfile.deployment.deploymentId,
  deploymentRevision: certifiedProfile.deployment.revision,
  logicalModelId: certifiedProfile.model.logicalModelId,
  modelRevision: certifiedProfile.model.revision,
  providerRecordId: 7,
  modelMappingId: 19,
  probeKind: "capability_suite",
  probeSuiteRevision: "capability:1",
  status: "passed",
  resultJson: {
    qualificationStatus: "passed",
    evidenceRef: certifiedProfile.deployment.probe.evidenceRef,
    checks: certifiedProfile.deployment.probe.checks,
    probedCapabilityRefs: ["capability:text-chat"],
  },
  finishedAt: new Date(100),
};

describe("Spec 231 profile registry", () => {
  beforeEach(() => {
    state.fail = false;
    state.probeRows = [storedReceipt];
    state.rows = [
      {
        id: 17,
        deploymentId: metadataProfile.deployment.deploymentId,
        deploymentRevision: metadataProfile.deployment.revision,
        logicalModelId: metadataProfile.model.logicalModelId,
        modelRevision: metadataProfile.model.revision,
        providerId: metadataProfile.deployment.providerId,
        profileJson: certifiedProfile,
        capabilityProbeRunId: storedReceipt.runId,
      },
    ];
  });

  it("loads current immutable profile heads and binds a registry revision", async () => {
    const result = await loadInferenceProfileRegistry(
      new Date("2026-09-27T00:00:00Z")
    );
    expect(result).toMatchObject({
      ok: true,
      profiles: [certifiedProfile],
      invalidProfileIds: [],
      registryRevision: expect.stringMatching(/^registry:[a-f0-9]{64}$/),
      observedAtMs: Date.parse("2026-09-27T00:00:00Z"),
    });
  });

  it("excludes profiles whose JSON identity disagrees with indexed identity", async () => {
    state.rows[0] = {
      ...state.rows[0],
      deploymentId: "deployment:tampered",
    };
    const result = await loadInferenceProfileRegistry(
      new Date("2026-09-27T00:00:00Z")
    );
    expect(result).toMatchObject({
      ok: true,
      profiles: [],
      invalidProfileIds: ["deployment:tampered"],
    });
  });

  it("fails closed when an active profile claims live probing without a stored capability receipt", async () => {
    state.probeRows = [];
    const liveProfile: InferenceProfilePair = certifiedProfile;
    state.rows[0] = { ...state.rows[0], profileJson: liveProfile };

    const result = await loadInferenceProfileRegistry(
      new Date("2026-09-27T00:00:00Z")
    );

    expect(result).toMatchObject({
      ok: true,
      profiles: [],
      invalidProfileIds: [liveProfile.deployment.deploymentId],
    });
  });

  it("fails closed when the profile registry is unavailable", async () => {
    state.fail = true;
    await expect(loadInferenceProfileRegistry()).resolves.toEqual({
      ok: false,
      code: "PROFILE_REGISTRY_UNAVAILABLE",
    });
  });

  it("accepts a metadata-only profile while preserving its unqualified status", () => {
    expect(validateInferenceProfilePublication(metadataProfile)).toEqual({
      ok: true,
      profile: metadataProfile,
    });
  });

  it("requires a matching immutable passed capability receipt for live profile evidence", () => {
    const profile: InferenceProfilePair = {
      model: {
        ...metadataProfile.model,
        lifecycle: "ACTIVE",
      },
      deployment: {
        ...metadataProfile.deployment,
        status: "ACTIVE",
        health: "healthy",
        runtimeBinding: {
          kind: "llm_provider_map",
          providerRecordId: 7,
          modelMappingId: 19,
        },
        probe: {
          ...metadataProfile.deployment.probe,
          source: "live_probe",
          probeSuiteRevision: "capability:1",
          evidenceRef: `sha256:${"a".repeat(64)}`,
          observedAtMs: 100,
          checks: {
            basicRequestResponse: true,
            chatResponsesParity: true,
            streamingCancellation: true,
            toolsContinuation: true,
            strictSchema: true,
            reasoningUsage: true,
            multimodal: true,
            contextOutputLimits: true,
            regionRetention: true,
            credentialOwnership: true,
          },
          probedCapabilityRefs: ["capability:text-chat"],
        },
      },
    };
    const evidence = storedReceipt;

    expect(matchesStoredCapabilityProbeEvidence(profile, evidence)).toBe(true);
    expect(
      matchesStoredCapabilityProbeEvidence(profile, evidence, {
        profileVersionId: 17,
        runId: evidence.runId,
      })
    ).toBe(true);
    expect(
      matchesStoredCapabilityProbeEvidence(profile, evidence, {
        profileVersionId: 18,
        runId: evidence.runId,
      })
    ).toBe(false);
    expect(
      matchesStoredCapabilityProbeEvidence(profile, {
        ...evidence,
        status: "incomplete",
      })
    ).toBe(false);
    expect(
      matchesStoredCapabilityProbeEvidence(profile, {
        ...evidence,
        modelMappingId: 20,
      })
    ).toBe(false);
    expect(
      matchesStoredCapabilityProbeEvidence(profile, {
        ...evidence,
        resultJson: { ...evidence.resultJson, evidenceRef: "catalog:fake" },
      })
    ).toBe(false);
  });

  it("rejects an admin attempt to self-certify ACTIVE or live-probed profiles", () => {
    expect(
      validateInferenceProfilePublication({
        ...metadataProfile,
        model: { ...metadataProfile.model, lifecycle: "ACTIVE" },
      })
    ).toEqual({
      ok: false,
      code: "SERVER_PROBE_REQUIRED_FOR_ACTIVATION",
    });
    expect(
      validateInferenceProfilePublication({
        ...metadataProfile,
        deployment: {
          ...metadataProfile.deployment,
          probe: { ...metadataProfile.deployment.probe, source: "live_probe" },
        },
      })
    ).toEqual({
      ok: false,
      code: "SERVER_PROBE_REQUIRED_FOR_ACTIVATION",
    });
  });

  it("rejects mismatched model and deployment revisions", () => {
    expect(
      validateInferenceProfilePublication({
        ...metadataProfile,
        deployment: {
          ...metadataProfile.deployment,
          logicalModelRevision: "model-rev:old",
        },
      })
    ).toMatchObject({ ok: false, code: "PROFILE_INVALID" });
  });
});
