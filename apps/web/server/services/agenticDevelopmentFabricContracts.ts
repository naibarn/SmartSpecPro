import { createHash } from "node:crypto";

export type EngineeringArtifactClass =
  | "SKILL"
  | "NATIVE_MINI_APP"
  | "CUSTOM_MINI_APP"
  | "TENANT_PRODUCT"
  | "PLATFORM_CORE";

export type ReuseOutcome =
  | "EXACT_REUSE"
  | "COMPOSABLE_REUSE"
  | "NEEDS_CONFIGURATION"
  | "CAPABILITY_GAP"
  | "CUSTOM_UI_GAP";

export type TrustClass =
  | "platform-policy"
  | "canonical-contract"
  | "tenant-authored"
  | "generated-view"
  | "untrusted-content";

export const TRUST_ORDER: TrustClass[] = [
  "platform-policy",
  "canonical-contract",
  "tenant-authored",
  "generated-view",
  "untrusted-content",
];

export type DevelopmentIntent = {
  contractVersion: "spec-222-v1";
  requestId: string;
  tenantId: string;
  principalId: string;
  requestedOutcome: string;
  artifactCandidates: EngineeringArtifactClass[];
  productId?: string;
  skillId?: string;
};

export type DevelopmentWorkPackage = {
  contractVersion: "spec-222-v1";
  id: string;
  artifactClass: EngineeringArtifactClass;
  tenantId: string;
  targetEnvironment: "dev" | "staging";
  requirementRef: string;
  contextPackRef: string;
  methodologyProfileRef?: string;
  capabilityGrantRef?: string;
  evidenceRequirements: string[];
  expiresAt: string;
  metadata?: Record<string, unknown>;
};

export type ProjectContextPack = {
  contractVersion: "spec-222-v1";
  packId: string;
  tenantId: string;
  principalId: string;
  artifactClass: EngineeringArtifactClass;
  sourceRefs: string[];
  sourceRevision: string;
  trust: Record<string, TrustClass>;
  contentHash: string;
  freshness: "CURRENT";
};

export type HarnessAdapterDescriptor = {
  contractVersion: "spec-222-v1";
  family: string;
  version: string;
  capabilities: string[];
  authBoundary: "local-user" | "platform-managed";
};

export type EngineeringEvidence = {
  contractVersion: "spec-222-v1";
  evidenceId: string;
  type: string;
  status: "pending" | "passed" | "failed";
  sourceRevision: string;
  contextPackHash: string;
};

export class DevelopmentFabricContractError extends Error {
  constructor(public readonly code: string, message = code) {
    super(message);
    this.name = "DevelopmentFabricContractError";
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

const TENANT_ID = /^tenant-[A-Za-z0-9_-]{1,35}$/;
const ID = /^[A-Za-z][A-Za-z0-9_.:-]{0,127}$/;
const REF = /^[a-z][a-z0-9_-]{0,31}:[A-Za-z0-9_./:-]{1,127}$/;
const HASH = /^[a-f0-9]{64}$/;
const RAW_SECRET_KEY = /(api[_-]?key|secret|token|password|credential|authorization|private[_-]?key)/i;
const ARTIFACTS: EngineeringArtifactClass[] = [
  "SKILL",
  "NATIVE_MINI_APP",
  "CUSTOM_MINI_APP",
  "TENANT_PRODUCT",
  "PLATFORM_CORE",
];

function text(value: unknown, code: string): string {
  if (typeof value !== "string" || !value.trim()) throw new DevelopmentFabricContractError(code);
  return value.trim();
}

function id(value: unknown, code: string): string {
  const result = text(value, code);
  if (!ID.test(result)) throw new DevelopmentFabricContractError(code);
  return result;
}

function tenantId(value: unknown): string {
  const result = text(value, "TENANT_ID_INVALID");
  if (!TENANT_ID.test(result)) throw new DevelopmentFabricContractError("TENANT_ID_INVALID");
  return result;
}

function artifact(value: unknown): EngineeringArtifactClass {
  if (typeof value !== "string" || !ARTIFACTS.includes(value as EngineeringArtifactClass)) {
    throw new DevelopmentFabricContractError("ARTIFACT_CLASS_INVALID");
  }
  return value as EngineeringArtifactClass;
}

function canonicalRef(value: unknown, code: string): string {
  const result = text(value, code);
  if (!REF.test(result)) throw new DevelopmentFabricContractError(code);
  return result;
}

function sourceRef(value: unknown): string {
  const result = text(value, "SOURCE_REF_INVALID");
  if (!ID.test(result) && !REF.test(result)) throw new DevelopmentFabricContractError("SOURCE_REF_INVALID");
  return result;
}

function containsRawSecret(value: unknown): boolean {
  if (Array.isArray(value)) return value.some(containsRawSecret);
  if (!value || typeof value !== "object") return false;
  return Object.entries(value as Record<string, unknown>).some(
    ([key, child]) => RAW_SECRET_KEY.test(key) || containsRawSecret(child),
  );
}

function stable(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
  if (!value || typeof value !== "object") return JSON.stringify(value);
  return `{${Object.entries(value as Record<string, unknown>)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, child]) => `${JSON.stringify(key)}:${stable(child)}`)
    .join(",")}}`;
}

function hash(value: unknown): string {
  return createHash("sha256").update(stable(value), "utf8").digest("hex");
}

function assertTrustBoundary(sourceRef: string, trust: TrustClass): void {
  const normalized = sourceRef.toLowerCase();
  if ((normalized.includes("generated") || normalized.includes("view") || normalized.includes("agents.md") || normalized.includes("claude.md")) && TRUST_ORDER.indexOf(trust) < TRUST_ORDER.indexOf("generated-view")) {
    throw new DevelopmentFabricContractError("TRUST_ESCALATION");
  }
  if ((normalized.includes("repo:") || normalized.includes("web:") || normalized.includes("mcp:")) && trust === "platform-policy") {
    throw new DevelopmentFabricContractError("TRUST_ESCALATION");
  }
}

export function classifyArtifact(input: {
  candidates: readonly (EngineeringArtifactClass | Lowercase<string>)[];
  authorizedPlatformCore: boolean;
}): EngineeringArtifactClass {
  const normalized = input.candidates.map(candidate => {
    const value = String(candidate).toUpperCase().replaceAll("-", "_") as EngineeringArtifactClass;
    return artifact(value);
  });
  if (!normalized.length) throw new DevelopmentFabricContractError("ARTIFACT_CLASS_REQUIRED");
  if (normalized.includes("PLATFORM_CORE") && !input.authorizedPlatformCore) {
    throw new DevelopmentFabricContractError("PLATFORM_CORE_FORBIDDEN");
  }
  return normalized[0];
}

export function buildDevelopmentIntent(input: {
  requestId: string;
  tenantId: string;
  principalId: string;
  requestedOutcome: string;
  artifactCandidates: readonly (EngineeringArtifactClass | Lowercase<string>)[];
  productId?: string;
  skillId?: string;
  authorizedPlatformCore?: boolean;
}): DevelopmentIntent {
  const artifactCandidates = input.artifactCandidates.map(candidate => {
    const value = String(candidate).toUpperCase().replaceAll("-", "_") as EngineeringArtifactClass;
    return artifact(value);
  });
  if (!artifactCandidates.length) throw new DevelopmentFabricContractError("ARTIFACT_CLASS_REQUIRED");
  if (artifactCandidates.includes("PLATFORM_CORE") && !input.authorizedPlatformCore) {
    throw new DevelopmentFabricContractError("PLATFORM_CORE_FORBIDDEN");
  }
  const result: DevelopmentIntent = {
    contractVersion: "spec-222-v1",
    requestId: id(input.requestId, "REQUEST_ID_INVALID"),
    tenantId: tenantId(input.tenantId),
    principalId: id(input.principalId, "PRINCIPAL_ID_INVALID"),
    requestedOutcome: text(input.requestedOutcome, "OUTCOME_REQUIRED"),
    artifactCandidates,
  };
  if (artifactCandidates.includes("TENANT_PRODUCT")) {
    if (!input.productId) throw new DevelopmentFabricContractError("PRODUCT_REF_REQUIRED");
    result.productId = id(input.productId, "PRODUCT_REF_INVALID");
  } else if (input.productId) {
    result.productId = id(input.productId, "PRODUCT_REF_INVALID");
  }
  if (artifactCandidates.includes("SKILL")) {
    if (input.skillId) result.skillId = id(input.skillId, "SKILL_REF_INVALID");
  }
  return result;
}

export function classifyReuseResult(input: { outcome: ReuseOutcome; references: string[] }): { outcome: ReuseOutcome; references: string[] } {
  if (!Object.prototype.hasOwnProperty.call({ EXACT_REUSE: true, COMPOSABLE_REUSE: true, NEEDS_CONFIGURATION: true, CAPABILITY_GAP: true, CUSTOM_UI_GAP: true }, input.outcome)) {
    throw new DevelopmentFabricContractError("REUSE_OUTCOME_INVALID");
  }
  if (input.references.length > 64) throw new DevelopmentFabricContractError("REFERENCE_LIMIT_EXCEEDED");
  const references = input.references.map(reference => canonicalRef(reference, "REFERENCE_INVALID"));
  return { outcome: input.outcome, references };
}

export function buildDevelopmentWorkPackage(input: {
  id: string;
  artifactClass: EngineeringArtifactClass;
  tenantId: string;
  targetEnvironment: "dev" | "staging" | string;
  requirementRef: string;
  contextPackRef: string;
  methodologyProfileRef?: string;
  capabilityGrantRef?: string;
  evidenceRequirements: string[];
  expiresAt: string;
  metadata?: Record<string, unknown>;
}): DevelopmentWorkPackage {
  if (input.targetEnvironment !== "dev" && input.targetEnvironment !== "staging") {
    throw new DevelopmentFabricContractError("TARGET_ENVIRONMENT_FORBIDDEN");
  }
  if (containsRawSecret(input)) throw new DevelopmentFabricContractError("RAW_SECRET_FORBIDDEN");
  if (!input.evidenceRequirements.length) throw new DevelopmentFabricContractError("EVIDENCE_REQUIREMENTS_REQUIRED");
  const expiresAt = text(input.expiresAt, "EXPIRY_INVALID");
  if (!Number.isFinite(Date.parse(expiresAt)) || Date.parse(expiresAt) <= Date.now()) {
    throw new DevelopmentFabricContractError("EXPIRY_INVALID");
  }
  return {
    contractVersion: "spec-222-v1",
    id: id(input.id, "WORK_PACKAGE_ID_INVALID"),
    artifactClass: artifact(input.artifactClass),
    tenantId: tenantId(input.tenantId),
    targetEnvironment: input.targetEnvironment,
    requirementRef: canonicalRef(input.requirementRef, "REQUIREMENT_REF_INVALID"),
    contextPackRef: canonicalRef(input.contextPackRef, "CONTEXT_REF_INVALID"),
    ...(input.methodologyProfileRef ? { methodologyProfileRef: canonicalRef(input.methodologyProfileRef, "METHODOLOGY_REF_INVALID") } : {}),
    ...(input.capabilityGrantRef ? { capabilityGrantRef: canonicalRef(input.capabilityGrantRef, "CAPABILITY_REF_INVALID") } : {}),
    evidenceRequirements: input.evidenceRequirements.map(item => canonicalRef(item, "EVIDENCE_REQUIREMENT_INVALID")),
    expiresAt,
    ...(input.metadata ? { metadata: structuredClone(input.metadata) } : {}),
  };
}

export function buildProjectContextPack(input: {
  packId: string;
  tenantId: string;
  principalId: string;
  artifactClass: EngineeringArtifactClass;
  contractVersion: "spec-222-v1";
  sourceRefs: string[];
  sourceRevision: string;
  trust: Record<string, TrustClass>;
  contentHash?: string;
  freshness?: string;
}): ProjectContextPack {
  if (input.contentHash || input.freshness) throw new DevelopmentFabricContractError("CONTEXT_HASH_INPUT_INVALID");
  if (!input.sourceRefs.length) throw new DevelopmentFabricContractError("SOURCE_REF_REQUIRED");
  const sourceRefs = input.sourceRefs.map(sourceRef);
  for (const sourceRef of sourceRefs) {
    const trust = input.trust[sourceRef];
    if (!trust || !TRUST_ORDER.includes(trust)) throw new DevelopmentFabricContractError("TRUST_LABEL_REQUIRED");
    assertTrustBoundary(sourceRef, trust);
  }
  for (const key of Object.keys(input.trust)) {
    if (!sourceRefs.includes(key)) throw new DevelopmentFabricContractError("TRUST_SOURCE_MISMATCH");
  }
  const content = {
    contractVersion: input.contractVersion,
    packId: id(input.packId, "CONTEXT_ID_INVALID"),
    tenantId: tenantId(input.tenantId),
    principalId: id(input.principalId, "PRINCIPAL_ID_INVALID"),
    artifactClass: artifact(input.artifactClass),
    sourceRefs,
    sourceRevision: text(input.sourceRevision, "SOURCE_REVISION_INVALID"),
    trust: Object.fromEntries(sourceRefs.map(ref => [ref, input.trust[ref]])),
  } as const;
  return { ...content, contentHash: hash(content), freshness: "CURRENT" };
}

export function assertProjectContextPackFresh(pack: ProjectContextPack, currentSourceRevision: string): true {
  if (pack.sourceRevision !== text(currentSourceRevision, "SOURCE_REVISION_INVALID")) {
    throw new DevelopmentFabricContractError("CONTEXT_STALE");
  }
  const content = {
    contractVersion: pack.contractVersion,
    packId: pack.packId,
    tenantId: pack.tenantId,
    principalId: pack.principalId,
    artifactClass: pack.artifactClass,
    sourceRefs: pack.sourceRefs,
    sourceRevision: pack.sourceRevision,
    trust: pack.trust,
  };
  if (hash(content) !== pack.contentHash || pack.freshness !== "CURRENT") {
    throw new DevelopmentFabricContractError("CONTEXT_HASH_INVALID");
  }
  return true;
}

export function describeHarnessAdapter(input: {
  family: string;
  version: string;
  capabilities: string[];
  authBoundary: "local-user" | "platform-managed";
  [key: string]: unknown;
}): HarnessAdapterDescriptor {
  if (Object.keys(input).some(key => RAW_SECRET_KEY.test(key))) {
    throw new DevelopmentFabricContractError("AUTH_MATERIAL_FORBIDDEN");
  }
  if (!input.capabilities.length) throw new DevelopmentFabricContractError("HARNESS_CAPABILITY_REQUIRED");
  return {
    contractVersion: "spec-222-v1",
    family: id(input.family, "HARNESS_FAMILY_INVALID"),
    version: text(input.version, "HARNESS_VERSION_INVALID"),
    capabilities: input.capabilities.map(capability => id(capability, "HARNESS_CAPABILITY_INVALID")),
    authBoundary: input.authBoundary,
  };
}

export function buildEngineeringEvidence(input: {
  evidenceId: string;
  type: string;
  status: "pending" | "passed" | "failed";
  sourceRevision: string;
  contextPackHash: string;
}): EngineeringEvidence {
  if (!HASH.test(input.contextPackHash)) throw new DevelopmentFabricContractError("CONTEXT_HASH_INVALID");
  return {
    contractVersion: "spec-222-v1",
    evidenceId: id(input.evidenceId, "EVIDENCE_ID_INVALID"),
    type: id(input.type, "EVIDENCE_TYPE_INVALID"),
    status: input.status,
    sourceRevision: text(input.sourceRevision, "SOURCE_REVISION_INVALID"),
    contextPackHash: input.contextPackHash,
  };
}

export function assertRequiredEvidenceComplete(input: {
  requiredTypes: string[];
  evidence: EngineeringEvidence[];
  sourceRevision: string;
  contextPackHash: string;
}): boolean {
  if (!HASH.test(input.contextPackHash)) throw new DevelopmentFabricContractError("CONTEXT_HASH_INVALID");
  for (const item of input.evidence) {
    if (item.sourceRevision !== input.sourceRevision || item.contextPackHash !== input.contextPackHash) {
      throw new DevelopmentFabricContractError("EVIDENCE_STALE");
    }
  }
  return input.requiredTypes.every(type => input.evidence.some(item => item.type === type && item.status === "passed"));
}
