export type SkillDefinition = {
  contractVersion: "spec-221-v1";
  skillId: string;
  tenantId: string;
  productId: string;
  sourceRef: string;
};

export type SkillDependencyRef = {
  skillId: string;
  version: string;
  digest: string;
};

export type SkillVersion = {
  contractVersion: "spec-221-v1";
  skillId: string;
  tenantId: string;
  productId: string;
  version: string;
  digest: string;
  sourceRevision: string;
  contextPackHash: string;
  requiredHarnessCapabilities: string[];
  dependencies: SkillDependencyRef[];
};

export type SkillEvaluation = {
  contractVersion: "spec-221-v1";
  skillId: string;
  version: string;
  sourceRevision: string;
  contextPackHash: string;
  outcome: "passed" | "failed";
  evaluatorRef: string;
  expiresAt: string;
};

export type SkillReviewDecision = {
  contractVersion: "spec-221-v1";
  skillId: string;
  version: string;
  sourceRevision: string;
  contextPackHash: string;
  reviewerPrincipalId: string;
  outcome: "approved" | "rejected" | "revoked";
};

export class SkillGovernanceContractError extends Error {
  constructor(public readonly code: string, message = code) {
    super(message);
    this.name = "SkillGovernanceContractError";
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

const TENANT_ID = /^tenant-[A-Za-z0-9_-]{1,35}$/;
const ID = /^[A-Za-z][A-Za-z0-9_.:-]{0,127}$/;
const VERSION = /^\d+\.\d+\.\d+$/;
const DIGEST = /^[a-f0-9]{64}$/;
const HASH = /^[a-f0-9]{64}$/;
const SOURCE_REF = /^skill:[A-Za-z0-9_.-]{1,120}$/;
const EVALUATOR_REF = /^eval:[A-Za-z0-9_.-]{1,120}$/;
const MAX_CATALOG_SIZE = 256;

function text(value: unknown, code: string): string {
  if (typeof value !== "string" || !value.trim()) throw new SkillGovernanceContractError(code);
  return value.trim();
}

function id(value: unknown, code: string): string {
  const result = text(value, code);
  if (!ID.test(result)) throw new SkillGovernanceContractError(code);
  return result;
}

function tenantId(value: unknown): string {
  const result = text(value, "SKILL_TENANT_INVALID");
  if (!TENANT_ID.test(result)) throw new SkillGovernanceContractError("SKILL_TENANT_INVALID");
  return result;
}

function version(value: unknown): string {
  const result = text(value, "SKILL_VERSION_INVALID");
  if (!VERSION.test(result)) throw new SkillGovernanceContractError("SKILL_VERSION_INVALID");
  return result;
}

function digest(value: unknown): string {
  const result = text(value, "SKILL_DIGEST_INVALID");
  if (!DIGEST.test(result)) throw new SkillGovernanceContractError("SKILL_DIGEST_INVALID");
  return result;
}

function contextHash(value: unknown): string {
  const result = text(value, "SKILL_CONTEXT_HASH_INVALID");
  if (!HASH.test(result)) throw new SkillGovernanceContractError("SKILL_CONTEXT_HASH_INVALID");
  return result;
}

function dependencyKey(skill: Pick<SkillVersion, "skillId" | "version">): string {
  return `${skill.skillId}@${skill.version}`;
}

function assertLineage(
  expected: { skillId: string; version: string; sourceRevision: string; contextPackHash: string },
  actual: { skillId: string; version: string; sourceRevision: string; contextPackHash: string },
): void {
  if (expected.skillId !== actual.skillId || expected.version !== actual.version) {
    throw new SkillGovernanceContractError("SKILL_LINEAGE_MISMATCH");
  }
  if (expected.sourceRevision !== actual.sourceRevision) throw new SkillGovernanceContractError("SKILL_REVISION_MISMATCH");
  if (expected.contextPackHash !== actual.contextPackHash) throw new SkillGovernanceContractError("SKILL_CONTEXT_MISMATCH");
}

export function buildSkillDefinition(input: {
  skillId: string;
  tenantId: string;
  productId: string;
  contractVersion: "spec-221-v1";
  sourceRef: string;
}): SkillDefinition {
  const sourceRef = text(input.sourceRef, "SKILL_SOURCE_REF_INVALID");
  if (!SOURCE_REF.test(sourceRef)) throw new SkillGovernanceContractError("SKILL_SOURCE_REF_INVALID");
  return {
    contractVersion: "spec-221-v1",
    skillId: id(input.skillId, "SKILL_ID_INVALID"),
    tenantId: tenantId(input.tenantId),
    productId: id(input.productId, "SKILL_PRODUCT_INVALID"),
    sourceRef,
  };
}

export function buildSkillVersion(input: {
  skillId: string;
  tenantId: string;
  productId: string;
  version: string;
  digest: string;
  sourceRevision: string;
  contextPackHash: string;
  requiredHarnessCapabilities: string[];
  dependencies: SkillDependencyRef[];
}): SkillVersion {
  if (input.dependencies.length > 64) throw new SkillGovernanceContractError("SKILL_DEPENDENCY_LIMIT");
  const dependencies = input.dependencies.map(dependency => ({
    skillId: id(dependency.skillId, "SKILL_DEPENDENCY_INVALID"),
    version: version(dependency.version),
    digest: digest(dependency.digest),
  }));
  return {
    contractVersion: "spec-221-v1",
    skillId: id(input.skillId, "SKILL_ID_INVALID"),
    tenantId: tenantId(input.tenantId),
    productId: id(input.productId, "SKILL_PRODUCT_INVALID"),
    version: version(input.version),
    digest: digest(input.digest),
    sourceRevision: text(input.sourceRevision, "SKILL_REVISION_INVALID"),
    contextPackHash: contextHash(input.contextPackHash),
    requiredHarnessCapabilities: input.requiredHarnessCapabilities.map(capability => id(capability, "SKILL_CAPABILITY_INVALID")),
    dependencies,
  };
}

export function buildSkillEvaluation(input: {
  skillId: string;
  version: string;
  sourceRevision: string;
  contextPackHash: string;
  outcome: "passed" | "failed";
  evaluatorRef: string;
  expiresAt: string;
  [key: string]: unknown;
}): SkillEvaluation {
  const expiresAt = text(input.expiresAt, "SKILL_EVALUATION_EXPIRY_INVALID");
  if (!Number.isFinite(Date.parse(expiresAt))) throw new SkillGovernanceContractError("SKILL_EVALUATION_EXPIRY_INVALID");
  const evaluatorRef = text(input.evaluatorRef, "SKILL_EVALUATOR_INVALID");
  if (!EVALUATOR_REF.test(evaluatorRef)) throw new SkillGovernanceContractError("SKILL_EVALUATOR_INVALID");
  return {
    contractVersion: "spec-221-v1",
    skillId: id(input.skillId, "SKILL_ID_INVALID"),
    version: version(input.version),
    sourceRevision: text(input.sourceRevision, "SKILL_REVISION_INVALID"),
    contextPackHash: contextHash(input.contextPackHash),
    outcome: input.outcome,
    evaluatorRef,
    expiresAt,
  };
}

export function buildSkillReviewDecision(input: {
  skillId: string;
  version: string;
  sourceRevision: string;
  contextPackHash: string;
  reviewerPrincipalId: string;
  outcome: "approved" | "rejected" | "revoked";
}): SkillReviewDecision {
  return {
    contractVersion: "spec-221-v1",
    skillId: id(input.skillId, "SKILL_ID_INVALID"),
    version: version(input.version),
    sourceRevision: text(input.sourceRevision, "SKILL_REVISION_INVALID"),
    contextPackHash: contextHash(input.contextPackHash),
    reviewerPrincipalId: id(input.reviewerPrincipalId, "SKILL_REVIEWER_INVALID"),
    outcome: input.outcome,
  };
}

export function assertSkillDependencyClosure(input: { root: SkillVersion; catalog: SkillVersion[] }): true {
  if (input.catalog.length > MAX_CATALOG_SIZE) throw new SkillGovernanceContractError("SKILL_CATALOG_LIMIT");
  const catalog = new Map(input.catalog.map(skill => [dependencyKey(skill), skill]));
  const visiting = new Set<string>();
  const visited = new Set<string>();
  let traversed = 0;
  const walk = (skill: SkillVersion): void => {
    traversed += 1;
    if (traversed > MAX_CATALOG_SIZE) throw new SkillGovernanceContractError("SKILL_CATALOG_LIMIT");
    const key = dependencyKey(skill);
    if (visiting.has(key)) throw new SkillGovernanceContractError("SKILL_DEPENDENCY_CYCLE");
    if (visited.has(key)) return;
    visiting.add(key);
    for (const dependency of skill.dependencies) {
      const child = catalog.get(`${dependency.skillId}@${dependency.version}`);
      if (!child) throw new SkillGovernanceContractError("SKILL_DEPENDENCY_MISSING");
      if (child.digest !== dependency.digest) throw new SkillGovernanceContractError("SKILL_DIGEST_MISMATCH");
      if (child.tenantId !== input.root.tenantId || child.productId !== input.root.productId) {
        throw new SkillGovernanceContractError("SKILL_TENANT_MISMATCH");
      }
      walk(child);
    }
    visiting.delete(key);
    visited.add(key);
  };
  walk(input.root);
  return true;
}

export function assertSkillAdmission(input: {
  definition: SkillDefinition;
  version: SkillVersion;
  catalog: SkillVersion[];
  evaluation: SkillEvaluation;
  review: SkillReviewDecision;
  contextPackHash: string;
  harnessCapabilities: string[];
  revoked?: boolean;
  now: string;
}): true {
  if (input.revoked) throw new SkillGovernanceContractError("SKILL_REVOKED");
  if (input.definition.skillId !== input.version.skillId || input.definition.tenantId !== input.version.tenantId || input.definition.productId !== input.version.productId) {
    throw new SkillGovernanceContractError("SKILL_SCOPE_MISMATCH");
  }
  assertSkillDependencyClosure({ root: input.version, catalog: input.catalog });
  const contextPackHash = contextHash(input.contextPackHash);
  if (contextPackHash !== input.version.contextPackHash) throw new SkillGovernanceContractError("SKILL_CONTEXT_MISMATCH");
  assertLineage(input.version, input.evaluation);
  assertLineage(input.version, input.review);
  if (input.evaluation.outcome !== "passed") throw new SkillGovernanceContractError("SKILL_EVALUATION_REQUIRED");
  if (Date.parse(input.evaluation.expiresAt) <= Date.parse(text(input.now, "SKILL_TIME_INVALID"))) {
    throw new SkillGovernanceContractError("SKILL_EVALUATION_EXPIRED");
  }
  if (input.review.outcome !== "approved") throw new SkillGovernanceContractError("SKILL_REVIEW_REQUIRED");
  if (input.version.requiredHarnessCapabilities.some(capability => !input.harnessCapabilities.includes(capability))) {
    throw new SkillGovernanceContractError("SKILL_CAPABILITY_MISSING");
  }
  return true;
}
