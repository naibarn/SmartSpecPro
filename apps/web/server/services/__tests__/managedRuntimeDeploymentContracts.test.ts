import { describe, expect, it } from "vitest";

import {
  advanceHostBinding,
  buildHostBinding,
  buildRuntimeNamespace,
  buildRuntimeRelease,
  promoteRuntimeRelease,
  rollbackRuntimeRelease,
  suspendRuntime,
} from "../managedRuntimeDeploymentContracts";

const candidate = {
  releaseCandidateId: "rc-001",
  tenantId: "tenant-acme",
  productId: "product-acme",
  artifactDigest: "d".repeat(64),
  contentHash: "e".repeat(64),
  immutableVerified: true as const,
  evidenceComplete: true as const,
  handoffToSpec219: true as const,
};

describe("Spec 219 managed runtime/deployment contracts", () => {
  it("uses shared per-environment namespaces with tenant/product isolation", () => {
    expect(buildRuntimeNamespace({ environment: "staging", namespaceRef: "namespace:staging" })).toMatchObject({ environment: "staging" });
    expect(() => buildRuntimeNamespace({ environment: "production", namespaceRef: "namespace:tenant-acme" })).toThrow("NAMESPACE_SCOPE_INVALID");
  });

  it("admits only complete handed-off RCs into an exact environment release", () => {
    expect(buildRuntimeRelease({ candidate, environment: "staging", namespaceRef: "namespace:staging", runtimeReleaseId: "runtime-release-001" })).toMatchObject({ artifactDigest: candidate.artifactDigest });
    expect(() => buildRuntimeRelease({ candidate: { ...candidate, evidenceComplete: false }, environment: "staging", namespaceRef: "namespace:staging", runtimeReleaseId: "runtime-release-001" })).toThrow("RC_NOT_ELIGIBLE");
    expect(() => buildRuntimeRelease({ candidate, environment: "production", namespaceRef: "namespace:production", runtimeReleaseId: "runtime-release-001" })).toThrow("PRODUCTION_PROMOTION_REQUIRED");
  });

  it("requires verified custom-domain lifecycle and immutable identity mapping", () => {
    const binding = buildHostBinding({ hostBindingId: "host-001", hostname: "interiorpro.example.com", tenantId: "tenant-acme", productId: "product-acme", environment: "staging", type: "CUSTOM_DOMAIN" });
    expect(binding.state).toBe("REQUESTED");
    const verified = advanceHostBinding(advanceHostBinding(advanceHostBinding(binding, "VALIDATING"), "OWNERSHIP_VERIFICATION_PENDING"), "VERIFIED");
    expect(verified.state).toBe("VERIFIED");
    expect(() => advanceHostBinding(binding, "ACTIVE")).toThrow("HOST_TRANSITION_INVALID");
    expect(() => buildHostBinding({ hostBindingId: "host-002", hostname: "bad host", tenantId: "tenant-acme", productId: "product-acme", environment: "staging", type: "CUSTOM_DOMAIN" })).toThrow("HOSTNAME_INVALID");
  });

  it("promotes only from staged health-checked release and preserves digest", () => {
    const release = buildRuntimeRelease({ candidate, environment: "staging", namespaceRef: "namespace:staging", runtimeReleaseId: "runtime-release-001" });
    expect(promoteRuntimeRelease({ release, targetEnvironment: "production", healthCheckPassed: true, policyCheckPassed: true })).toMatchObject({ environment: "production", artifactDigest: candidate.artifactDigest });
    expect(() => promoteRuntimeRelease({ release, targetEnvironment: "production", healthCheckPassed: false, policyCheckPassed: true })).toThrow("PROMOTION_CHECK_FAILED");
  });

  it("requires backward-compatible data before rollback and fences suspension", () => {
    const staged = buildRuntimeRelease({ candidate, environment: "staging", namespaceRef: "namespace:staging", runtimeReleaseId: "runtime-release-001" });
    const release = promoteRuntimeRelease({ release: staged, targetEnvironment: "production", healthCheckPassed: true, policyCheckPassed: true });
    expect(rollbackRuntimeRelease({ current: release, targetReleaseId: "runtime-release-previous", targetArtifactDigest: "c".repeat(64), targetKnownGood: true, dataBackwardCompatible: true })).toMatchObject({ state: "ROLLED_BACK" });
    expect(() => rollbackRuntimeRelease({ current: release, targetReleaseId: "runtime-release-previous", targetArtifactDigest: "c".repeat(64), targetKnownGood: false, dataBackwardCompatible: true })).toThrow("ROLLBACK_TARGET_INVALID");
    expect(() => rollbackRuntimeRelease({ current: release, targetReleaseId: "runtime-release-previous", targetArtifactDigest: "c".repeat(64), targetKnownGood: true, dataBackwardCompatible: false })).toThrow("ROLLBACK_DATA_INCOMPATIBLE");
    expect(suspendRuntime({ release, target: "PRODUCT", reason: "incident-001" })).toMatchObject({ state: "SUSPENDED" });
  });
});
