import { createHash } from "node:crypto";

export type InferenceRuntimeBindingFingerprintInput = {
  profileVersionId: number;
  deploymentRevision: string;
  modelMappingId: number;
  providerRecordId: number;
  modelId: string;
  providerModelId: string;
  apiStyle: string;
  baseUrl: string | null;
  encryptedCredential: string | null;
  probePricing?: {
    inputMicrosPerMillion: number;
    outputMicrosPerMillion: number;
    source: string;
  };
};

/** Fingerprints the exact provider-map and encrypted credential binding without exposing key material. */
export function createInferenceRuntimeBindingFingerprint(
  input: InferenceRuntimeBindingFingerprintInput
): string {
  const evidence = {
    profileVersionId: input.profileVersionId,
    deploymentRevision: input.deploymentRevision,
    modelMappingId: input.modelMappingId,
    providerRecordId: input.providerRecordId,
    modelId: input.modelId,
    providerModelId: input.providerModelId,
    apiStyle: input.apiStyle,
    baseUrl: input.baseUrl,
    credentialCiphertextHash: input.encryptedCredential
      ? createHash("sha256").update(input.encryptedCredential).digest("hex")
      : null,
    probePricing: input.probePricing ?? null,
  };
  return `sha256:${createHash("sha256").update(JSON.stringify(evidence)).digest("hex")}`;
}
