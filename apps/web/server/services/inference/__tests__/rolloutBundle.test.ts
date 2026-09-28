import { describe, expect, it } from "vitest";
import {
  publishInferenceRolloutBundleInputSchema,
  signInferenceRolloutBundle,
  verifyInferenceRolloutBundle,
} from "../rolloutBundle";

const keyId = "test-2026-01";
const keyring = new Map([[keyId, Buffer.alloc(32, 7)]]);

function payload() {
  return {
    contract: "SAH-INFERENCE-ROLLOUT-1",
    bundleId: "bundle-chat-001",
    sequence: 1,
    createdAt: "2026-09-27T00:00:00.000Z",
    createdBy: "admin:12",
    routerPolicyRevision: "policy:platform:4",
    logicalModelRegistryRevision: "registry:8",
    deploymentCredentialBindingRevision: "binding-set:9",
    surfaceCertificationRevision: "certification:5",
    gatewayRouteManifestHashes: [`sha256:${"a".repeat(64)}`],
    billingPricingSnapshotRefs: ["pricing:model-a:2026-09"],
    fxPolicyRevision: "fx:usd-micros-v1",
    guardrailPolicyRevision: "guardrail:chat-v3",
    rollbackBundleHash: `sha256:${"b".repeat(64)}`,
    contractVersions: ["SAH-INFERENCE-2", "SAH-RETRIEVAL-2"],
    providerCapabilityRecheckRef: "probe-run:501",
    environmentReadinessRef: "staging-readiness:2026-09-27",
  };
}

describe("Spec 231 signed inference rollout bundle", () => {
  it("signs and verifies a complete §84 bundle", () => {
    const signed = signInferenceRolloutBundle({
      payload: payload(),
      signingKeyId: keyId,
      keyring,
    });

    expect(verifyInferenceRolloutBundle(signed, keyring)).toEqual({
      ok: true,
      payload: signed.payload,
      bundleHash: signed.bundleHash,
    });
  });

  it("rejects payload edits even when the old signature is retained", () => {
    const signed = signInferenceRolloutBundle({
      payload: payload(),
      signingKeyId: keyId,
      keyring,
    });

    expect(
      verifyInferenceRolloutBundle(
        { ...signed, payload: { ...signed.payload, routerPolicyRevision: "policy:changed" } },
        keyring,
      ),
    ).toEqual({ ok: false, reason: "BUNDLE_HASH_MISMATCH" });
  });

  it("rejects unknown signing keys and altered signatures", () => {
    const signed = signInferenceRolloutBundle({
      payload: payload(),
      signingKeyId: keyId,
      keyring,
    });

    expect(
      verifyInferenceRolloutBundle({ ...signed, signingKeyId: "retired-key" }, keyring),
    ).toEqual({ ok: false, reason: "UNKNOWN_SIGNING_KEY" });
    expect(
      verifyInferenceRolloutBundle({ ...signed, signature: "0".repeat(64) }, keyring),
    ).toEqual({ ok: false, reason: "SIGNATURE_INVALID" });
  });

  it("fails to sign when a required readiness or rollback reference is absent", () => {
    expect(() =>
      signInferenceRolloutBundle({
        payload: { ...payload(), environmentReadinessRef: "" },
        signingKeyId: keyId,
        keyring,
      }),
    ).toThrow("Inference rollout bundle payload is invalid");
  });

  it("rejects a rollout bundle without any gateway route manifest evidence", () => {
    expect(
      publishInferenceRolloutBundleInputSchema.safeParse({
        bundleId: "bundle-chat-001",
        sequence: 1,
        routerPolicyRevision: "policy:platform:4",
        logicalModelRegistryRevision: "registry:8",
        deploymentCredentialBindingRevision: "binding-set:9",
        surfaceCertificationRevision: "certification:5",
        gatewayRouteManifestHashes: [],
        billingPricingSnapshotRefs: ["pricing:model-a:2026-09"],
        fxPolicyRevision: "fx:usd-micros-v1",
        guardrailPolicyRevision: "guardrail:chat-v3",
        rollbackBundleHash: `sha256:${"b".repeat(64)}`,
        providerCapabilityRecheckRef: "probe-run:501",
        environmentReadinessRef: "staging-readiness:2026-09-27",
      }).success,
    ).toBe(false);
    expect(() =>
      signInferenceRolloutBundle({
        payload: { ...payload(), gatewayRouteManifestHashes: [] },
        signingKeyId: keyId,
        keyring,
      }),
    ).toThrow("Inference rollout bundle payload is invalid");
  });

  it("does not sign with a missing or undersized key", () => {
    expect(() =>
      signInferenceRolloutBundle({
        payload: payload(),
        signingKeyId: "missing",
        keyring,
      }),
    ).toThrow("Inference rollout signing key is unavailable");
    expect(() =>
      signInferenceRolloutBundle({
        payload: payload(),
        signingKeyId: "short",
        keyring: new Map([["short", Buffer.alloc(16, 1)]]),
      }),
    ).toThrow("Inference rollout signing key is unavailable");
  });
});
