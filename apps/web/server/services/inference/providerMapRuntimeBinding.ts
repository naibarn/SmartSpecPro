import type {
  LogicalModelProfile,
  ProviderDeploymentProfile,
} from "./qualification";

export type ProviderMapRuntimeRecord = {
  mappingId: number;
  providerRecordId: number;
  modelId: string;
  providerModelId: string;
  apiStyle: "chat-completions" | "responses" | "messages" | "gemini";
  mappingEnabled: boolean;
  providerEnabled: boolean;
  credentialConfigured: boolean;
  baseUrlConfigured: boolean;
};

export type ProviderMapBindingResult =
  | { ok: true }
  | {
      ok: false;
      reason:
        | "RUNTIME_BINDING_MISSING"
        | "RUNTIME_BINDING_IDENTITY_MISMATCH"
        | "RUNTIME_BINDING_DISABLED"
        | "RUNTIME_CREDENTIAL_UNAVAILABLE"
        | "RUNTIME_SURFACE_MISMATCH";
    };

function expectedEndpointSurface(
  apiStyle: ProviderMapRuntimeRecord["apiStyle"]
): ProviderDeploymentProfile["endpointSurface"] {
  if (apiStyle === "responses") return "responses_compatible";
  if (apiStyle === "chat-completions") return "chat_compatible";
  return "native_provider";
}

/** Verifies that a qualified profile still points at the exact current DB mapping. */
export function verifyProviderMapRuntimeBinding(
  model: LogicalModelProfile,
  deployment: ProviderDeploymentProfile,
  runtime: ProviderMapRuntimeRecord | null
): ProviderMapBindingResult {
  const binding = deployment.runtimeBinding;
  if (!binding || binding.kind !== "llm_provider_map" || !runtime) {
    return { ok: false, reason: "RUNTIME_BINDING_MISSING" };
  }
  if (
    binding.modelMappingId !== runtime.mappingId ||
    binding.providerRecordId !== runtime.providerRecordId ||
    deployment.deploymentId !== `deployment:llm-provider-map:${runtime.mappingId}` ||
    deployment.providerId !== `provider:llm-provider:${runtime.providerRecordId}` ||
    deployment.credentialOwnerRef !==
      `credential-owner:llm-provider:${runtime.providerRecordId}` ||
    model.logicalModelId !== runtime.modelId ||
    model.providerNativeModelId !== runtime.providerModelId
  ) {
    return { ok: false, reason: "RUNTIME_BINDING_IDENTITY_MISMATCH" };
  }
  if (!runtime.mappingEnabled || !runtime.providerEnabled) {
    return { ok: false, reason: "RUNTIME_BINDING_DISABLED" };
  }
  if (!runtime.credentialConfigured || !runtime.baseUrlConfigured) {
    return { ok: false, reason: "RUNTIME_CREDENTIAL_UNAVAILABLE" };
  }
  if (
    deployment.executionSurface !== "cloud" ||
    deployment.endpointSurface !== expectedEndpointSurface(runtime.apiStyle)
  ) {
    return { ok: false, reason: "RUNTIME_SURFACE_MISMATCH" };
  }
  return { ok: true };
}
