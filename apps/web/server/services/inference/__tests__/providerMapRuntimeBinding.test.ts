import { describe, expect, it } from "vitest";
import type {
  LogicalModelProfile,
  ProviderDeploymentProfile,
} from "../qualification";
import {
  verifyProviderMapRuntimeBinding,
  type ProviderMapRuntimeRecord,
} from "../providerMapRuntimeBinding";

const model = {
  logicalModelId: "model:stable-chat",
  providerNativeModelId: "native-chat-v2",
} as LogicalModelProfile;

const deployment = {
  deploymentId: "deployment:llm-provider-map:42",
  providerId: "provider:llm-provider:7",
  credentialOwnerRef: "credential-owner:llm-provider:7",
  logicalModelId: model.logicalModelId,
  executionSurface: "cloud",
  endpointSurface: "responses_compatible",
  runtimeBinding: {
    kind: "llm_provider_map",
    providerRecordId: 7,
    modelMappingId: 42,
  },
} as ProviderDeploymentProfile;

const runtime: ProviderMapRuntimeRecord = {
  mappingId: 42,
  providerRecordId: 7,
  modelId: model.logicalModelId,
  providerModelId: model.providerNativeModelId,
  apiStyle: "responses",
  mappingEnabled: true,
  providerEnabled: true,
  credentialConfigured: true,
  baseUrlConfigured: true,
};

describe("provider map runtime binding", () => {
  it("accepts only an exact active provider/model-map identity", () => {
    expect(verifyProviderMapRuntimeBinding(model, deployment, runtime)).toEqual({
      ok: true,
    });
  });

  it("fails closed when the provider deployment has no runtime binding", () => {
    expect(
      verifyProviderMapRuntimeBinding(
        model,
        { ...deployment, runtimeBinding: undefined },
        runtime
      )
    ).toEqual({ ok: false, reason: "RUNTIME_BINDING_MISSING" });
  });

  it("rejects route repoints and mismatched native model aliases", () => {
    expect(
      verifyProviderMapRuntimeBinding(model, deployment, {
        ...runtime,
        providerModelId: "native-chat-v3",
      })
    ).toEqual({
      ok: false,
      reason: "RUNTIME_BINDING_IDENTITY_MISMATCH",
    });
  });

  it("rejects disabled mappings, missing credentials and endpoint changes", () => {
    expect(
      verifyProviderMapRuntimeBinding(model, deployment, {
        ...runtime,
        mappingEnabled: false,
      })
    ).toEqual({ ok: false, reason: "RUNTIME_BINDING_DISABLED" });
    expect(
      verifyProviderMapRuntimeBinding(model, deployment, {
        ...runtime,
        credentialConfigured: false,
      })
    ).toEqual({ ok: false, reason: "RUNTIME_CREDENTIAL_UNAVAILABLE" });
    expect(
      verifyProviderMapRuntimeBinding(model, deployment, {
        ...runtime,
        apiStyle: "chat-completions",
      })
    ).toEqual({ ok: false, reason: "RUNTIME_SURFACE_MISMATCH" });
  });
});
