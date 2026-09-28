import { describe, expect, it } from "vitest";
import { createInferenceRuntimeBindingFingerprint } from "../runtimeBindingFingerprint";

const input = {
  profileVersionId: 12,
  deploymentRevision: "deploy:revision-3",
  modelMappingId: 42,
  providerRecordId: 7,
  modelId: "model:logical",
  providerModelId: "vendor-native-r3",
  apiStyle: "responses",
  baseUrl: "https://provider.example/v1",
  encryptedCredential: "ciphertext:do-not-log",
};

describe("inference runtime binding fingerprint", () => {
  it("is deterministic and sensitive to mapping, endpoint, and credential rotation", () => {
    const fingerprint = createInferenceRuntimeBindingFingerprint(input);
    expect(fingerprint).toMatch(/^sha256:[a-f0-9]{64}$/);
    expect(createInferenceRuntimeBindingFingerprint(input)).toBe(fingerprint);
    expect(
      createInferenceRuntimeBindingFingerprint({
        ...input,
        encryptedCredential: "ciphertext:rotated",
      })
    ).not.toBe(fingerprint);
    expect(
      createInferenceRuntimeBindingFingerprint({
        ...input,
        baseUrl: "https://changed.example/v1",
      })
    ).not.toBe(fingerprint);
    expect(fingerprint).not.toContain(input.encryptedCredential);
  });
});
