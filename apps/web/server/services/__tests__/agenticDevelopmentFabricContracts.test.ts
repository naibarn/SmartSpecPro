import { describe, expect, it } from "vitest";

import {
  assertRequiredEvidenceComplete,
  buildDevelopmentIntent,
  buildDevelopmentWorkPackage,
  buildEngineeringEvidence,
  buildProjectContextPack,
  assertProjectContextPackFresh,
  classifyArtifact,
  classifyReuseResult,
  describeHarnessAdapter,
  DevelopmentFabricContractError,
  TRUST_ORDER,
} from "../agenticDevelopmentFabricContracts";

const baseIntent = {
  requestId: "dev-request-001",
  tenantId: "tenant-acme",
  principalId: "user-42",
  requestedOutcome: "Build a validated workflow skill",
  artifactCandidates: ["skill", "custom-mini-app"] as const,
};

describe("Spec 222 agentic development fabric contracts", () => {
  it("classifies only supported artifact classes and restricts platform core", () => {
    expect(classifyArtifact({ candidates: baseIntent.artifactCandidates, authorizedPlatformCore: false })).toBe("SKILL");
    expect(() => classifyArtifact({ candidates: ["PLATFORM_CORE"], authorizedPlatformCore: false })).toThrow(
      "PLATFORM_CORE_FORBIDDEN",
    );
    expect(classifyArtifact({ candidates: ["PLATFORM_CORE"], authorizedPlatformCore: true })).toBe("PLATFORM_CORE");
  });

  it("requires server-scoped identity and canonical product or skill references", () => {
    const intent = buildDevelopmentIntent({
      ...baseIntent,
      artifactCandidates: ["TENANT_PRODUCT"],
      productId: "product-acme",
    });
    expect(intent.tenantId).toBe("tenant-acme");
    expect(intent.productId).toBe("product-acme");
    expect(() => buildDevelopmentIntent({ ...baseIntent, tenantId: "acme" })).toThrow(
      "TENANT_ID_INVALID",
    );
    expect(() => buildDevelopmentIntent({ ...baseIntent, artifactCandidates: ["TENANT_PRODUCT"] })).toThrow(
      "PRODUCT_REF_REQUIRED",
    );
  });

  it("returns bounded reuse-first outcomes with canonical references", () => {
    expect(classifyReuseResult({ outcome: "EXACT_REUSE", references: ["skill:existing-v1"] })).toEqual({
      outcome: "EXACT_REUSE",
      references: ["skill:existing-v1"],
    });
    expect(() => classifyReuseResult({ outcome: "CAPABILITY_GAP", references: new Array(65).fill("ref") })).toThrow(
      "REFERENCE_LIMIT_EXCEEDED",
    );
    expect(() => classifyReuseResult({ outcome: "EXACT_REUSE", references: ["raw prompt"] })).toThrow(
      "REFERENCE_INVALID",
    );
  });

  it("bounds work packages to dev/staging, expiry, evidence, and no raw secrets", () => {
    expect(() => buildDevelopmentWorkPackage({
      id: "wp-001",
      artifactClass: "SKILL",
      tenantId: "tenant-acme",
      targetEnvironment: "production",
      requirementRef: "req-1",
      contextPackRef: "context-1",
      evidenceRequirements: ["unit-tests"],
      expiresAt: "2099-01-01T00:00:00.000Z",
    })).toThrow("TARGET_ENVIRONMENT_FORBIDDEN");

    expect(() => buildDevelopmentWorkPackage({
      id: "wp-001",
      artifactClass: "SKILL",
      tenantId: "tenant-acme",
      targetEnvironment: "dev",
      requirementRef: "req-1",
      contextPackRef: "context-1",
      evidenceRequirements: [],
      expiresAt: "2099-01-01T00:00:00.000Z",
      metadata: { apiKey: "must-never-be-present" },
    })).toThrow("RAW_SECRET_FORBIDDEN");
  });

  it("creates an integrity-hashed context pack and rejects stale source revisions", () => {
    const pack = buildProjectContextPack({
      packId: "context-001",
      tenantId: "tenant-acme",
      principalId: "user-42",
      artifactClass: "SKILL",
      contractVersion: "spec-222-v1",
      sourceRefs: ["spec:222", "repo:apps/web"],
      sourceRevision: "git:abc123",
      trust: { "spec:222": "canonical-contract", "repo:apps/web": "untrusted-content" },
    });
    expect(pack.contentHash).toMatch(/^[a-f0-9]{64}$/);
    expect(pack.freshness).toBe("CURRENT");
    expect(() => buildProjectContextPack({
      ...pack,
      sourceRevision: "git:changed",
    })).toThrow("CONTEXT_HASH_INPUT_INVALID");
    expect(assertProjectContextPackFresh(pack, "git:abc123")).toBe(true);
    expect(() => assertProjectContextPackFresh(pack, "git:changed")).toThrow("CONTEXT_STALE");
  });

  it("keeps generated instruction views below canonical policy trust", () => {
    expect(TRUST_ORDER).toEqual([
      "platform-policy",
      "canonical-contract",
      "tenant-authored",
      "generated-view",
      "untrusted-content",
    ]);
    expect(() => buildProjectContextPack({
      packId: "context-002",
      tenantId: "tenant-acme",
      principalId: "user-42",
      artifactClass: "SKILL",
      contractVersion: "spec-222-v1",
      sourceRefs: ["policy", "generated"],
      sourceRevision: "git:abc123",
      trust: { policy: "generated-view", generated: "platform-policy" },
    })).toThrow("TRUST_ESCALATION");
  });

  it("describes a swappable harness without accepting auth material", () => {
    expect(describeHarnessAdapter({
      family: "local-agent",
      version: "1.0.0",
      capabilities: ["edit", "test"],
      authBoundary: "platform-managed",
    })).toMatchObject({ family: "local-agent", version: "1.0.0" });
    expect(() => describeHarnessAdapter({
      family: "local-agent",
      version: "1.0.0",
      capabilities: ["edit"],
      authBoundary: "platform-managed",
      authToken: "secret",
    })).toThrow("AUTH_MATERIAL_FORBIDDEN");
  });

  it("requires passing evidence linked to the same revision and context before completion", () => {
    const evidence = buildEngineeringEvidence({
      evidenceId: "evidence-001",
      type: "unit-tests",
      status: "passed",
      sourceRevision: "git:abc123",
      contextPackHash: "a".repeat(64),
    });
    expect(assertRequiredEvidenceComplete({
      requiredTypes: ["unit-tests", "security-review"],
      evidence: [evidence],
      sourceRevision: "git:abc123",
      contextPackHash: "a".repeat(64),
    })).toBe(false);
    expect(() => buildEngineeringEvidence({
      ...evidence,
      sourceRevision: "git:changed",
    })).not.toThrow();
    expect(() => assertRequiredEvidenceComplete({
      requiredTypes: ["unit-tests"],
      evidence: [evidence],
      sourceRevision: "git:changed",
      contextPackHash: "a".repeat(64),
    })).toThrow(DevelopmentFabricContractError);
  });
});
