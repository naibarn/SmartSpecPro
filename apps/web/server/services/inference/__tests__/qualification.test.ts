import { describe, expect, it } from "vitest";
import {
  buildQualifiedRouteCandidate,
  evaluateDeploymentQualification,
  requiredProbeChecksForModel,
  type LogicalModelProfile,
  type ProviderDeploymentProfile,
} from "../qualification";
import { inferenceIntentV2Schema } from "../contracts";

const intent = inferenceIntentV2Schema.parse({
  contract: "SAH-INFERENCE-2",
  requestId: "req-q",
  traceId: "trace-q",
  tenantId: "tenant-a",
  principalId: "user-7",
  consumer: "chat",
  taskClass: "chat",
  purpose: "answer",
  inputModalities: ["text"],
  outputModalities: ["text"],
  inputTokenEstimate: 1_000,
  outputTokenReserve: 500,
  requiredFeatures: ["streaming"],
  languageHints: ["th"],
  privacyClass: "tenant-confidential",
  residencyAllowlist: ["TH"],
  zdrRequired: true,
  qualityClass: "standard",
  risk: "low",
  latencyDeadlineMs: 10_000,
  maxEstimatedCostMicros: 10_000,
  selection: { mode: "AUTO" },
  policyRevision: "policy-1",
  budgetScopeRef: "tenant:tenant-a",
  idempotencyKey: "idempotency:q",
});

const model: LogicalModelProfile = {
  logicalModelId: "model:stable-v3",
  revision: "rev:3",
  providerNativeModelId: "provider-model-3",
  lifecycle: "ACTIVE",
  capabilityRefs: ["capability:chat", "capability:tools"],
  capabilities: {
    inputModalities: ["text"],
    outputModalities: ["text"],
    features: ["streaming"],
    toolContractRefs: [],
    maxContextTokens: 32_000,
    maxOutputTokens: 8_000,
  },
};

const probes = {
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
};

const deployment: ProviderDeploymentProfile = {
  deploymentId: "deployment:account-a:v3",
  revision: "deployment-rev:3",
  logicalModelId: model.logicalModelId,
  logicalModelRevision: model.revision,
  providerId: "provider:account-a",
  credentialOwnerRef: "credential-owner:platform",
  endpointSurface: "responses_compatible",
  executionSurface: "cloud",
  region: "TH",
  allowedRegions: ["TH"],
  allowedPrivacyClasses: ["tenant-confidential"],
  retention: "zero-data-retention",
  status: "ACTIVE",
  health: "healthy",
  healthObservedAtMs: 9_500,
  latencyP95Ms: 2_000,
  resolvedAliasRevision: model.revision,
  probe: {
    source: "live_probe",
    endpointSurface: "responses_compatible",
    probeSuiteRevision: "probe-suite:4",
    evidenceRef: "evidence:probe-44",
    observedAtMs: 9_000,
    validUntilMs: 12_000,
    probedCapabilityRefs: ["capability:chat", "capability:tools"],
    checks: probes,
  },
  price: {
    currency: "USD_MICROS",
    inputMicrosPerMillion: 1_000_000,
    outputMicrosPerMillion: 2_000_000,
    snapshotRef: "pricing:42",
    validUntilMs: 12_000,
  },
};

describe("Spec 231 deployment qualification", () => {
  it("exposes the canonical probe suite required by each logical model profile", () => {
    expect(requiredProbeChecksForModel(model)).toEqual([
      "basicRequestResponse",
      "contextOutputLimits",
      "regionRetention",
      "credentialOwnership",
      "streamingCancellation",
      "toolsContinuation",
    ]);
    expect(
      requiredProbeChecksForModel({
        ...model,
        capabilityRefs: ["capability:chat"],
        capabilities: {
          ...model.capabilities,
          inputModalities: ["text", "image"],
          features: ["json_schema", "reasoning"],
        },
      })
    ).toContain("multimodal");
  });

  it("admits only active immutable deployments with fresh live probes and current pricing", () => {
    expect(evaluateDeploymentQualification(model, deployment, 10_000)).toEqual({
      eligible: true,
      reasonCodes: [],
    });
  });

  it("fails closed for static metadata, stale probe evidence or stale pricing", () => {
    expect(
      evaluateDeploymentQualification(
        model,
        {
          ...deployment,
          probe: { ...deployment.probe, source: "catalog_metadata" },
        },
        10_000
      ).reasonCodes
    ).toContain("LIVE_PROBE_REQUIRED");
    expect(
      evaluateDeploymentQualification(
        model,
        { ...deployment, probe: { ...deployment.probe, validUntilMs: 9_999 } },
        10_000
      ).reasonCodes
    ).toContain("PROBE_STALE");
    expect(
      evaluateDeploymentQualification(
        model,
        { ...deployment, price: { ...deployment.price, validUntilMs: 9_999 } },
        10_000
      ).reasonCodes
    ).toContain("PRICE_STALE");
  });

  it("rejects alias drift, mismatched identity and incomplete capability evidence", () => {
    expect(
      evaluateDeploymentQualification(
        model,
        { ...deployment, resolvedAliasRevision: "rev:4" },
        10_000
      ).reasonCodes
    ).toContain("MODEL_ALIAS_DRIFT");
    expect(
      evaluateDeploymentQualification(
        model,
        { ...deployment, logicalModelRevision: "rev:2" },
        10_000
      ).reasonCodes
    ).toContain("MODEL_REVISION_MISMATCH");
    expect(
      evaluateDeploymentQualification(
        model,
        {
          ...deployment,
          probe: {
            ...deployment.probe,
            checks: { ...probes, toolsContinuation: false },
          },
        },
        10_000
      ).reasonCodes
    ).toContain("CAPABILITY_PROBE_FAILED");

    for (const check of ["toolsContinuation", "streamingCancellation"] as const) {
      expect(
        evaluateDeploymentQualification(
          model,
          {
            ...deployment,
            probe: {
              ...deployment.probe,
              checks: { ...probes, [check]: false },
            },
          },
          10_000
        ).reasonCodes
      ).toContain("CAPABILITY_PROBE_FAILED");
    }

    const multimodalModel: LogicalModelProfile = {
      ...model,
      capabilityRefs: ["capability:chat"],
      capabilities: {
        ...model.capabilities,
        inputModalities: ["text", "image"],
        features: ["json_schema", "reasoning"],
      },
    };
    for (const check of ["multimodal", "strictSchema", "reasoningUsage"] as const) {
      expect(
        evaluateDeploymentQualification(
          multimodalModel,
          {
            ...deployment,
            probe: {
              ...deployment.probe,
              checks: { ...probes, [check]: false },
              probedCapabilityRefs: ["capability:chat"],
            },
          },
          10_000
        ).reasonCodes
      ).toContain("CAPABILITY_PROBE_FAILED");
    }
  });

  it("requires capability-specific probes only when the profile declares that capability", () => {
    const textOnlyModel: LogicalModelProfile = {
      ...model,
      capabilityRefs: ["capability:chat"],
      capabilities: { ...model.capabilities, features: [] },
    };
    const irrelevantChecksFalse = {
      ...probes,
      streamingCancellation: false,
      toolsContinuation: false,
      strictSchema: false,
      reasoningUsage: false,
      multimodal: false,
    };
    const textOnlyDeployment: ProviderDeploymentProfile = {
      ...deployment,
      probe: {
        ...deployment.probe,
        checks: irrelevantChecksFalse,
        probedCapabilityRefs: ["capability:chat"],
      },
    };

    for (const check of [
      "basicRequestResponse",
      "contextOutputLimits",
      "regionRetention",
      "credentialOwnership",
    ] as const) {
      expect(
        evaluateDeploymentQualification(
          textOnlyModel,
          {
            ...textOnlyDeployment,
            probe: {
              ...textOnlyDeployment.probe,
              checks: { ...probes, [check]: false },
            },
          },
          10_000
        ).reasonCodes
      ).toContain("CAPABILITY_PROBE_FAILED");
    }

    expect(
      evaluateDeploymentQualification(
        textOnlyModel,
        textOnlyDeployment,
        10_000
      )
    ).toEqual({ eligible: true, reasonCodes: [] });

    expect(
      evaluateDeploymentQualification(
        model,
        {
          ...deployment,
          probe: {
            ...deployment.probe,
            checks: { ...probes, streamingCancellation: false },
          },
        },
        10_000
      ).reasonCodes
    ).toContain("CAPABILITY_PROBE_FAILED");
  });

  it("rejects deployments that are not active or have unscoped credentials", () => {
    expect(
      evaluateDeploymentQualification(
        model,
        { ...deployment, status: "QUARANTINED" },
        10_000
      ).reasonCodes
    ).toContain("DEPLOYMENT_NOT_ACTIVE");
    expect(
      evaluateDeploymentQualification(
        model,
        { ...deployment, credentialOwnerRef: "" },
        10_000
      ).reasonCodes
    ).toContain("CREDENTIAL_OWNER_MISSING");
  });

  it("builds a resolver candidate only from qualified evidence and estimates cost with integer rounding", () => {
    const result = buildQualifiedRouteCandidate(
      intent,
      model,
      deployment,
      10_000
    );
    expect(result).toMatchObject({
      ok: true,
      candidate: {
        modelProfileId: model.logicalModelId,
        deploymentId: deployment.deploymentId,
        qualification: "qualified",
        estimatedCostMicros: 2_000,
        supportsZeroDataRetention: true,
      },
    });
    expect(
      buildQualifiedRouteCandidate(
        intent,
        model,
        { ...deployment, health: "unavailable" },
        10_000
      )
    ).toMatchObject({
      ok: false,
      reasonCodes: ["DEPLOYMENT_UNHEALTHY"],
    });
  });
});
