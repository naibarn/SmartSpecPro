import { describe, expect, it } from "vitest";
import {
  certifyInferenceProfileCandidate,
  type CapabilityProbeReceipt,
} from "../profileCertification";
import type { InferenceProfilePair } from "../profileRegistry";

const finishedAt = new Date("2026-09-27T10:00:00.000Z");
const now = new Date("2026-09-27T10:05:00.000Z");

const profile: InferenceProfilePair = {
  model: {
    logicalModelId: "model:certification-test",
    revision: "model-rev:1",
    providerNativeModelId: "provider-model-1",
    lifecycle: "POLICY_REVIEWED",
    capabilityRefs: ["capability:text-chat"],
    capabilities: {
      inputModalities: ["text"],
      outputModalities: ["text"],
      features: [],
      toolContractRefs: [],
      maxContextTokens: 8_000,
      maxOutputTokens: 1_000,
    },
  },
  deployment: {
    deploymentId: "deployment:certification-test",
    revision: "deployment-rev:1",
    logicalModelId: "model:certification-test",
    logicalModelRevision: "model-rev:1",
    providerId: "provider:llm-provider:7",
    credentialOwnerRef: "credential-owner:7",
    endpointSurface: "chat_compatible",
    executionSurface: "cloud",
    region: "TH",
    allowedRegions: ["TH"],
    allowedPrivacyClasses: ["tenant-confidential"],
    retention: "limited-retention",
    status: "DEGRADED",
    health: "degraded",
    healthObservedAtMs: finishedAt.getTime(),
    latencyP95Ms: 100,
    resolvedAliasRevision: "model-rev:1",
    probe: {
      source: "catalog_metadata",
      endpointSurface: "chat_compatible",
      probeSuiteRevision: "catalog:1",
      evidenceRef: "catalog:test",
      observedAtMs: finishedAt.getTime(),
      validUntilMs: finishedAt.getTime() + 60_000,
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
      inputMicrosPerMillion: 1,
      outputMicrosPerMillion: 1,
      snapshotRef: "price:test",
      validUntilMs: now.getTime() + 60_000,
    },
    runtimeBinding: {
      kind: "llm_provider_map",
      providerRecordId: 7,
      modelMappingId: 19,
    },
  },
};

function receipt(
  overrides: Partial<CapabilityProbeReceipt> = {}
): CapabilityProbeReceipt {
  return {
    runId: "run:certification-test",
    profileVersionId: 12,
    deploymentId: profile.deployment.deploymentId,
    deploymentRevision: profile.deployment.revision,
    providerRecordId: 7,
    modelMappingId: 19,
    probeKind: "capability_suite",
    probeSuiteRevision: "capability:1",
    status: "passed",
    resultJson: {
      qualificationStatus: "passed",
      evidenceRef: `sha256:${"b".repeat(64)}`,
      runtimeBindingHash: `sha256:${"a".repeat(64)}`,
      maximumOutputLimitVerified: true,
      probedCapabilityRefs: ["capability:text-chat"],
      checks: {
        basicRequestResponse: true,
        chatResponsesParity: false,
        streamingCancellation: false,
        toolsContinuation: false,
        strictSchema: false,
        reasoningUsage: false,
        multimodal: false,
        contextOutputLimits: true,
        regionRetention: true,
        credentialOwnership: true,
      },
      reasonCodes: [],
    },
    finishedAt,
    ...overrides,
  };
}

describe("Spec 231 profile certification", () => {
  it("creates an active immutable projection only from a complete bound receipt", () => {
    const result = certifyInferenceProfileCandidate({
      profile,
      candidateProfileVersionId: 12,
      receipt: receipt(),
      now,
    });

    if (!result.ok) throw new Error(result.reason);
    expect(result).toMatchObject({
      ok: true,
      profile: {
        model: { lifecycle: "ACTIVE" },
        deployment: {
          status: "ACTIVE",
          health: "healthy",
          probe: {
            source: "live_probe",
            evidenceRef: `sha256:${"b".repeat(64)}`,
          },
        },
      },
    });
    if (result.ok) {
      expect(result.profile.deployment.probe.validUntilMs).toBe(
        finishedAt.getTime() + 24 * 60 * 60 * 1000
      );
    }
    expect(profile.model.lifecycle).toBe("POLICY_REVIEWED");
    expect(profile.deployment.status).toBe("DEGRADED");
  });

  it.each([
    [
      "incomplete suite",
      {
        status: "incomplete",
        resultJson: { qualificationStatus: "incomplete" },
      },
    ],
    ["wrong candidate version", { profileVersionId: 99 }],
    ["wrong provider map", { modelMappingId: 20 }],
    [
      "stale probe",
      { finishedAt: new Date(finishedAt.getTime() - 25 * 60 * 60 * 1000) },
    ],
    [
      "missing runtime binding",
      { resultJson: { ...receipt().resultJson, runtimeBindingHash: "" } },
    ],
  ] as const)("rejects %s", (_label, overrides) => {
    expect(
      certifyInferenceProfileCandidate({
        profile,
        candidateProfileVersionId: 12,
        receipt: receipt(overrides),
        now,
      })
    ).toMatchObject({ ok: false });
  });

  it("does not promote a profile when a required context/region gate is false", () => {
    const evidence = receipt();
    evidence.resultJson.checks = {
      ...evidence.resultJson.checks,
      contextOutputLimits: false,
    };
    expect(
      certifyInferenceProfileCandidate({
        profile,
        candidateProfileVersionId: 12,
        receipt: evidence,
        now,
      })
    ).toMatchObject({ ok: false, reason: "CAPABILITY_CHECKS_INCOMPLETE" });
  });
});
