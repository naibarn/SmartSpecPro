import { describe, expect, it } from "vitest";

import {
  assertSkillAdmission,
  assertSkillDependencyClosure,
  buildSkillDefinition,
  buildSkillEvaluation,
  buildSkillReviewDecision,
  buildSkillVersion,
} from "../skillGovernanceContracts";

const contextPackHash = "a".repeat(64);
const baseDefinition = {
  skillId: "skill-research",
  tenantId: "tenant-acme",
  productId: "product-acme",
  contractVersion: "spec-221-v1" as const,
  sourceRef: "skill:research",
};

describe("Spec 221 Skill governance contracts", () => {
  it("requires immutable tenant/product Skill identity and canonical source", () => {
    expect(buildSkillDefinition(baseDefinition)).toMatchObject(baseDefinition);
    expect(() => buildSkillDefinition({ ...baseDefinition, tenantId: "tenant-other" })).not.toThrow();
    expect(() => buildSkillDefinition({ ...baseDefinition, sourceRef: "latest" })).toThrow("SKILL_SOURCE_REF_INVALID");
  });

  it("rejects floating versions and unbounded or malformed dependencies", () => {
    expect(() => buildSkillVersion({
      skillId: "skill-research",
      tenantId: "tenant-acme",
      productId: "product-acme",
      version: "latest",
      digest: "b".repeat(64),
      sourceRevision: "git:abc123",
      contextPackHash,
      requiredHarnessCapabilities: ["read"],
      dependencies: [],
    })).toThrow("SKILL_VERSION_INVALID");
    expect(() => buildSkillVersion({
      skillId: "skill-research",
      tenantId: "tenant-acme",
      productId: "product-acme",
      version: "1.0.0",
      digest: "bad",
      sourceRevision: "git:abc123",
      contextPackHash,
      requiredHarnessCapabilities: ["read"],
      dependencies: new Array(65).fill({ skillId: "skill-x", version: "1.0.0", digest: "c".repeat(64) }),
    })).toThrow("SKILL_DEPENDENCY_LIMIT");
  });

  it("requires exact dependency closure and rejects cycles or cross-tenant dependencies", () => {
    const root = buildSkillVersion({
      skillId: "skill-root",
      tenantId: "tenant-acme",
      productId: "product-acme",
      version: "1.0.0",
      digest: "b".repeat(64),
      sourceRevision: "git:abc123",
      contextPackHash,
      requiredHarnessCapabilities: ["read"],
      dependencies: [{ skillId: "skill-leaf", version: "1.0.0", digest: "c".repeat(64) }],
    });
    const leaf = buildSkillVersion({
      skillId: "skill-leaf",
      tenantId: "tenant-acme",
      productId: "product-acme",
      version: "1.0.0",
      digest: "c".repeat(64),
      sourceRevision: "git:abc123",
      contextPackHash,
      requiredHarnessCapabilities: [],
      dependencies: [],
    });
    expect(assertSkillDependencyClosure({ root, catalog: [root, leaf] })).toBe(true);
    expect(() => assertSkillDependencyClosure({ root, catalog: new Array(257).fill(leaf) })).toThrow("SKILL_CATALOG_LIMIT");
    const cycleA = { ...root, skillId: "skill-a", dependencies: [{ skillId: "skill-b", version: "1.0.0", digest: "d".repeat(64) }] };
    const cycleB = { ...leaf, skillId: "skill-b", digest: "d".repeat(64), dependencies: [{ skillId: "skill-a", version: "1.0.0", digest: "b".repeat(64) }] };
    expect(() => assertSkillDependencyClosure({ root: cycleA, catalog: [cycleA, cycleB] })).toThrow("SKILL_DEPENDENCY_CYCLE");
    expect(() => assertSkillDependencyClosure({ root, catalog: [{ ...leaf, tenantId: "tenant-other" }] })).toThrow("SKILL_TENANT_MISMATCH");
  });

  it("binds evaluations and reviews to exact revision and context", () => {
    const evaluation = buildSkillEvaluation({
      skillId: "skill-research",
      version: "1.0.0",
      sourceRevision: "git:abc123",
      contextPackHash,
      outcome: "passed",
      evaluatorRef: "eval:quality-v1",
      expiresAt: "2099-01-01T00:00:00.000Z",
    });
    const review = buildSkillReviewDecision({
      skillId: "skill-research",
      version: "1.0.0",
      sourceRevision: "git:abc123",
      contextPackHash,
      reviewerPrincipalId: "user-reviewer",
      outcome: "approved",
    });
    expect(evaluation.outcome).toBe("passed");
    expect(review.outcome).toBe("approved");
    expect(() => buildSkillEvaluation({ ...evaluation, contextPackHash: "b".repeat(64) })).not.toThrow();
  });

  it("admits only exact, evaluated, approved, non-revoked and compatible Skills", () => {
    const version = buildSkillVersion({
      skillId: "skill-research",
      tenantId: "tenant-acme",
      productId: "product-acme",
      version: "1.0.0",
      digest: "b".repeat(64),
      sourceRevision: "git:abc123",
      contextPackHash,
      requiredHarnessCapabilities: ["read", "write"],
      dependencies: [],
    });
    const definition = buildSkillDefinition(baseDefinition);
    const evaluation = buildSkillEvaluation({
      skillId: version.skillId,
      version: version.version,
      sourceRevision: version.sourceRevision,
      contextPackHash,
      outcome: "passed",
      evaluatorRef: "eval:quality-v1",
      expiresAt: "2099-01-01T00:00:00.000Z",
    });
    const review = buildSkillReviewDecision({
      skillId: version.skillId,
      version: version.version,
      sourceRevision: version.sourceRevision,
      contextPackHash,
      reviewerPrincipalId: "user-reviewer",
      outcome: "approved",
    });
    expect(assertSkillAdmission({ definition, version, catalog: [version], evaluation, review, contextPackHash, harnessCapabilities: ["read", "write"], now: "2026-09-20T00:00:00.000Z" })).toBe(true);
    expect(() => assertSkillAdmission({ definition, version, catalog: [version], evaluation, review, contextPackHash, harnessCapabilities: ["read"], now: "2026-09-20T00:00:00.000Z" })).toThrow("SKILL_CAPABILITY_MISSING");
    expect(() => assertSkillAdmission({ definition, version, catalog: [version], evaluation, review, contextPackHash, harnessCapabilities: ["read", "write"], revoked: true, now: "2026-09-20T00:00:00.000Z" })).toThrow("SKILL_REVOKED");
    expect(() => assertSkillAdmission({ definition, version, catalog: [version], evaluation: { ...evaluation, outcome: "failed" }, review, contextPackHash, harnessCapabilities: ["read", "write"], now: "2026-09-20T00:00:00.000Z" })).toThrow("SKILL_EVALUATION_REQUIRED");
    expect(() => assertSkillAdmission({ definition: { ...definition, productId: "product-other" }, version, catalog: [version], evaluation, review, contextPackHash, harnessCapabilities: ["read", "write"], now: "2026-09-20T00:00:00.000Z" })).toThrow("SKILL_SCOPE_MISMATCH");
    const unresolved = { ...version, dependencies: [{ skillId: "skill-missing", version: "1.0.0", digest: "c".repeat(64) }] };
    expect(() => assertSkillAdmission({ definition, version: unresolved, catalog: [unresolved], evaluation, review, contextPackHash, harnessCapabilities: ["read", "write"], now: "2026-09-20T00:00:00.000Z" })).toThrow("SKILL_DEPENDENCY_MISSING");
  });
});
