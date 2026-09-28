import { describe, expect, it } from "vitest";
import {
  assessInferenceCapabilityRecheck,
  type InferenceCapabilityRecheckAssessment,
} from "../capabilityRecheck";
import type { ProfileRegistryLoadResult } from "../profileRegistry";

const nowMs = 1_800_000_000_000;
const profile = {
  model: {
    logicalModelId: "model:chat",
    revision: "model-rev:1",
    providerNativeModelId: "native-chat",
    lifecycle: "ACTIVE",
    capabilityRefs: ["capability:text-chat"],
    capabilities: {
      inputModalities: ["text"],
      outputModalities: ["text"],
      features: [],
      toolContractRefs: [],
      maxContextTokens: 16_000,
      maxOutputTokens: 2_000,
    },
  },
  deployment: {
    deploymentId: "deployment:provider-map:1",
    revision: "deployment-rev:1",
    logicalModelId: "model:chat",
    logicalModelRevision: "model-rev:1",
    providerId: "provider:1",
    credentialOwnerRef: "credential-owner:1",
    endpointSurface: "responses_compatible",
    executionSurface: "cloud",
    region: "TH",
    allowedRegions: ["TH"],
    allowedPrivacyClasses: ["tenant-confidential"],
    retention: "zero-data-retention",
    status: "ACTIVE",
    health: "healthy",
    healthObservedAtMs: nowMs,
    latencyP95Ms: 100,
    resolvedAliasRevision: "model-rev:1",
    probe: {
      source: "live_probe",
      endpointSurface: "responses_compatible",
      probeSuiteRevision: "capability:1",
      evidenceRef: `sha256:${"a".repeat(64)}`,
      observedAtMs: nowMs - 1_000,
      validUntilMs: nowMs + 60_000,
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
    },
    price: {
      currency: "USD_MICROS",
      inputMicrosPerMillion: 1_000_000,
      outputMicrosPerMillion: 2_000_000,
      snapshotRef: "price:1",
      validUntilMs: nowMs + 60_000,
    },
    runtimeBinding: {
      kind: "llm_provider_map",
      providerRecordId: 7,
      modelMappingId: 19,
    },
  },
};

function registry(
  profiles = [profile],
  invalidProfileIds: string[] = []
): ProfileRegistryLoadResult {
  return {
    ok: true,
    profiles: profiles as never,
    invalidProfileIds,
    registryRevision: "registry:1",
    observedAtMs: nowMs,
  };
}

describe("inference provider capability recheck", () => {
  it("creates a stable reference only for a non-empty fully valid certified registry", () => {
    const assessment = assessInferenceCapabilityRecheck(registry(), nowMs);
    expect(assessment).toMatchObject({
      ready: true,
      registryRevision: "registry:1",
      eligibleProfileCount: 1,
      ineligibleDeploymentIds: [],
    });
    expect(assessment.reference).toMatch(/^sha256:[a-f0-9]{64}$/);
    expect(assessInferenceCapabilityRecheck(registry(), nowMs).reference).toBe(
      assessment.reference
    );
  });

  it("fails closed for empty, invalid, stale, or incomplete registries", () => {
    const scenarios: Array<[ProfileRegistryLoadResult, string]> = [
      [registry([]), "NO_CERTIFIED_PROFILES"],
      [
        registry([profile], [profile.deployment.deploymentId]),
        "INVALID_PROFILES",
      ],
      [
        registry([
          {
            ...profile,
            deployment: {
              ...profile.deployment,
              probe: { ...profile.deployment.probe, validUntilMs: nowMs },
            },
          },
        ]),
        "INELIGIBLE_PROFILES",
      ],
      [
        registry([
          {
            ...profile,
            deployment: { ...profile.deployment, runtimeBinding: undefined },
          },
        ]),
        "INELIGIBLE_PROFILES",
      ],
    ];

    for (const [input, reason] of scenarios) {
      const assessment: InferenceCapabilityRecheckAssessment =
        assessInferenceCapabilityRecheck(input, nowMs);
      expect(assessment).toMatchObject({
        ready: false,
        reason,
        reference: null,
      });
    }
  });

  it("changes the reference when certified model, provider evidence, price, or registry revision changes", () => {
    const baseline = assessInferenceCapabilityRecheck(
      registry(),
      nowMs
    ).reference;
    const variants = [
      registry([
        {
          ...profile,
          deployment: {
            ...profile.deployment,
            probe: {
              ...profile.deployment.probe,
              evidenceRef: `sha256:${"b".repeat(64)}`,
            },
          },
        },
      ]),
      registry([
        {
          ...profile,
          deployment: {
            ...profile.deployment,
            price: {
              ...profile.deployment.price,
              inputMicrosPerMillion: 1_500_000,
            },
          },
        },
      ]),
      { ...registry(), registryRevision: "registry:2" },
    ];
    expect(
      variants.map(
        item => assessInferenceCapabilityRecheck(item, nowMs).reference
      )
    ).not.toContain(baseline);
  });
});
