import { createHash } from "node:crypto";

export type DevelopmentJobState =
  | "DRAFT"
  | "PLANNED"
  | "APPROVED"
  | "QUEUED"
  | "PREPARING_WORKSPACE"
  | "EXECUTING"
  | "BUILDING"
  | "TESTING"
  | "SCANNING"
  | "PREVIEW_READY"
  | "REVIEWING"
  | "APPROVED_FOR_MERGE"
  | "MERGED"
  | "RELEASE_CANDIDATE"
  | "HANDED_TO_SPEC_219"
  | "FAILED"
  | "CANCELLED"
  | "REJECTED"
  | "NEEDS_USER_INPUT"
  | "BLOCKED_POLICY"
  | "STALE_BASE";

export type DevelopmentJob = {
  contractVersion: "spec-218-v3";
  developmentJobId: string;
  tenantId: string;
  productId: string;
  workPackageRef: string;
  repositoryRef: string;
  baseRevision: string;
  request: string;
  contextPackHash: string;
  harnessProfileRef: string;
  skillLockRefs: string[];
  targetEnvironment: "dev" | "staging";
  createdBy: string;
  state: DevelopmentJobState;
  metadata?: Record<string, unknown>;
};

export type ChangeSet = {
  contractVersion: "spec-218-v3";
  changeSetId: string;
  developmentJobId: string;
  repositoryRef: string;
  branchRef: string;
  baseRevision: string;
  headRevision: string;
  fileRefs: string[];
};

export type EvidenceResult = { status: "pending" | "passed" | "failed"; ref: string };

export type EngineeringEvidenceBundle = {
  contractVersion: "spec-218-v3";
  sourceRevision: string;
  baseRevision: string;
  contextPackHash: string;
  harnessProfileRef: string;
  methodologyRef: string;
  skillLockRefs: string[];
  build: EvidenceResult;
  tests: EvidenceResult;
  security: EvidenceResult;
  preview: EvidenceResult;
  completeness: "COMPLETE" | "INCOMPLETE";
};

export type ReleaseCandidate = {
  contractVersion: "spec-218-v3";
  releaseCandidateId: string;
  developmentJobId: string;
  tenantId: string;
  productId: string;
  repositoryRef: string;
  commitRevision: string;
  treeHash: string;
  artifactDigest: string;
  evidence: EngineeringEvidenceBundle;
  approverPrincipalId: string;
  handoffToSpec219: true;
  contentHash: string;
};

export class DevelopmentControlPlaneError extends Error {
  constructor(public readonly code: string, message = code) {
    super(message);
    this.name = "DevelopmentControlPlaneError";
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

const TENANT_ID = /^tenant-[A-Za-z0-9_-]{1,35}$/;
const ID = /^[A-Za-z][A-Za-z0-9_.:-]{0,127}$/;
const REF = /^[a-z][a-z0-9_-]{0,31}:[A-Za-z0-9_./:@#-]{1,191}$/;
const HASH = /^[a-f0-9]{64}$/;
const RAW_SECRET_KEY = /(api[_-]?key|secret|token|password|credential|authorization|private[_-]?key)/i;
const TERMINAL_STATES = new Set<DevelopmentJobState>(["FAILED", "CANCELLED", "REJECTED", "HANDED_TO_SPEC_219"]);
const NEXT_STATES: Record<DevelopmentJobState, DevelopmentJobState[]> = {
  DRAFT: ["PLANNED", "CANCELLED"],
  PLANNED: ["APPROVED", "NEEDS_USER_INPUT", "BLOCKED_POLICY", "CANCELLED"],
  APPROVED: ["QUEUED", "CANCELLED", "BLOCKED_POLICY"],
  QUEUED: ["PREPARING_WORKSPACE", "CANCELLED", "BLOCKED_POLICY"],
  PREPARING_WORKSPACE: ["EXECUTING", "FAILED", "CANCELLED", "STALE_BASE"],
  EXECUTING: ["BUILDING", "FAILED", "CANCELLED", "NEEDS_USER_INPUT"],
  BUILDING: ["TESTING", "FAILED", "CANCELLED"],
  TESTING: ["SCANNING", "FAILED", "CANCELLED"],
  SCANNING: ["PREVIEW_READY", "FAILED", "CANCELLED"],
  PREVIEW_READY: ["REVIEWING", "FAILED", "CANCELLED"],
  REVIEWING: ["APPROVED_FOR_MERGE", "REJECTED", "NEEDS_USER_INPUT", "CANCELLED"],
  APPROVED_FOR_MERGE: ["MERGED", "REJECTED", "CANCELLED"],
  MERGED: ["RELEASE_CANDIDATE"],
  RELEASE_CANDIDATE: ["HANDED_TO_SPEC_219"],
  HANDED_TO_SPEC_219: [],
  FAILED: [],
  CANCELLED: [],
  REJECTED: [],
  NEEDS_USER_INPUT: ["PLANNED", "CANCELLED"],
  BLOCKED_POLICY: ["PLANNED", "CANCELLED"],
  STALE_BASE: ["PLANNED", "CANCELLED"],
};

function text(value: unknown, code: string): string {
  if (typeof value !== "string" || !value.trim()) throw new DevelopmentControlPlaneError(code);
  return value.trim();
}

function id(value: unknown, code: string): string {
  const result = text(value, code);
  if (!ID.test(result)) throw new DevelopmentControlPlaneError(code);
  return result;
}

function tenantId(value: unknown): string {
  const result = text(value, "TENANT_ID_INVALID");
  if (!TENANT_ID.test(result)) throw new DevelopmentControlPlaneError("TENANT_ID_INVALID");
  return result;
}

function ref(value: unknown, code: string): string {
  const result = text(value, code);
  if (!REF.test(result)) throw new DevelopmentControlPlaneError(code);
  return result;
}

function hash(value: unknown, code: string): string {
  const result = text(value, code);
  if (!HASH.test(result)) throw new DevelopmentControlPlaneError(code);
  return result;
}

function containsRawSecret(value: unknown): boolean {
  if (Array.isArray(value)) return value.some(containsRawSecret);
  if (!value || typeof value !== "object") return false;
  return Object.entries(value as Record<string, unknown>).some(([key, child]) => RAW_SECRET_KEY.test(key) || containsRawSecret(child));
}

function stable(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
  if (!value || typeof value !== "object") return JSON.stringify(value);
  return `{${Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)).map(([key, child]) => `${JSON.stringify(key)}:${stable(child)}`).join(",")}}`;
}

function contentHash(value: unknown): string {
  return createHash("sha256").update(stable(value), "utf8").digest("hex");
}

export function buildDevelopmentJob(input: {
  developmentJobId: string;
  tenantId: string;
  productId: string;
  workPackageRef: string;
  repositoryRef: string;
  baseRevision: string;
  request: string;
  contextPackHash: string;
  harnessProfileRef: string;
  skillLockRefs: string[];
  targetEnvironment: "dev" | "staging" | string;
  createdBy: string;
  metadata?: Record<string, unknown>;
}): DevelopmentJob {
  if (input.targetEnvironment !== "dev" && input.targetEnvironment !== "staging") throw new DevelopmentControlPlaneError("TARGET_ENVIRONMENT_FORBIDDEN");
  if (containsRawSecret(input)) throw new DevelopmentControlPlaneError("RAW_SECRET_FORBIDDEN");
  return {
    contractVersion: "spec-218-v3",
    developmentJobId: id(input.developmentJobId, "JOB_ID_INVALID"),
    tenantId: tenantId(input.tenantId),
    productId: id(input.productId, "PRODUCT_ID_INVALID"),
    workPackageRef: ref(input.workPackageRef, "WORK_PACKAGE_REF_INVALID"),
    repositoryRef: ref(input.repositoryRef, "REPOSITORY_REF_INVALID"),
    baseRevision: ref(input.baseRevision, "BASE_REVISION_INVALID"),
    request: text(input.request, "JOB_REQUEST_INVALID"),
    contextPackHash: hash(input.contextPackHash, "CONTEXT_HASH_INVALID"),
    harnessProfileRef: ref(input.harnessProfileRef, "HARNESS_PROFILE_INVALID"),
    skillLockRefs: input.skillLockRefs.map(value => ref(value, "SKILL_LOCK_INVALID")),
    targetEnvironment: input.targetEnvironment,
    createdBy: id(input.createdBy, "CREATOR_INVALID"),
    state: "DRAFT",
    ...(input.metadata ? { metadata: structuredClone(input.metadata) } : {}),
  };
}

export function transitionDevelopmentJob(job: DevelopmentJob, nextState: DevelopmentJobState): DevelopmentJob {
  if (TERMINAL_STATES.has(job.state)) throw new DevelopmentControlPlaneError("JOB_TERMINAL");
  if (!NEXT_STATES[job.state].includes(nextState)) throw new DevelopmentControlPlaneError("JOB_TRANSITION_INVALID");
  return { ...job, state: nextState };
}

export function buildChangeSet(input: {
  changeSetId: string;
  developmentJobId: string;
  repositoryRef: string;
  branchRef: string;
  baseRevision: string;
  headRevision: string;
  fileRefs: string[];
  expectedBaseRevision?: string;
}): ChangeSet {
  if (input.branchRef === "main" || input.branchRef === "master" || input.branchRef.includes("production")) throw new DevelopmentControlPlaneError("PROTECTED_BRANCH_FORBIDDEN");
  if (input.expectedBaseRevision && input.expectedBaseRevision !== input.baseRevision) throw new DevelopmentControlPlaneError("STALE_BASE");
  return {
    contractVersion: "spec-218-v3",
    changeSetId: id(input.changeSetId, "CHANGE_SET_ID_INVALID"),
    developmentJobId: id(input.developmentJobId, "JOB_ID_INVALID"),
    repositoryRef: ref(input.repositoryRef, "REPOSITORY_REF_INVALID"),
    branchRef: ref(input.branchRef, "BRANCH_REF_INVALID"),
    baseRevision: ref(input.baseRevision, "BASE_REVISION_INVALID"),
    headRevision: ref(input.headRevision, "HEAD_REVISION_INVALID"),
    fileRefs: input.fileRefs.map(value => ref(value, "FILE_REF_INVALID")),
  };
}

export function buildEngineeringEvidenceBundle(input: {
  sourceRevision: string;
  baseRevision: string;
  contextPackHash: string;
  harnessProfileRef: string;
  methodologyRef: string;
  skillLockRefs: string[];
  build: EvidenceResult;
  tests: EvidenceResult;
  security: EvidenceResult;
  preview: EvidenceResult;
}): EngineeringEvidenceBundle {
  const results = [input.build, input.tests, input.security, input.preview];
  return {
    contractVersion: "spec-218-v3",
    sourceRevision: ref(input.sourceRevision, "SOURCE_REVISION_INVALID"),
    baseRevision: ref(input.baseRevision, "BASE_REVISION_INVALID"),
    contextPackHash: hash(input.contextPackHash, "CONTEXT_HASH_INVALID"),
    harnessProfileRef: ref(input.harnessProfileRef, "HARNESS_PROFILE_INVALID"),
    methodologyRef: ref(input.methodologyRef, "METHODOLOGY_REF_INVALID"),
    skillLockRefs: input.skillLockRefs.map(value => ref(value, "SKILL_LOCK_INVALID")),
    build: { ...input.build, ref: ref(input.build.ref, "EVIDENCE_REF_INVALID") },
    tests: { ...input.tests, ref: ref(input.tests.ref, "EVIDENCE_REF_INVALID") },
    security: { ...input.security, ref: ref(input.security.ref, "EVIDENCE_REF_INVALID") },
    preview: { ...input.preview, ref: ref(input.preview.ref, "EVIDENCE_REF_INVALID") },
    completeness: results.every(result => result.status === "passed") ? "COMPLETE" : "INCOMPLETE",
  };
}

export function buildReleaseCandidate(input: {
  releaseCandidateId: string;
  job: DevelopmentJob;
  changeSet: ChangeSet;
  evidence: EngineeringEvidenceBundle;
  commitRevision: string;
  treeHash: string;
  artifactDigest: string;
  approverPrincipalId: string;
  handoffToSpec219: true;
  [key: string]: unknown;
}): ReleaseCandidate {
  if (input.job.state !== "MERGED") throw new DevelopmentControlPlaneError("RC_JOB_STATE_INVALID");
  if (input.evidence.completeness !== "COMPLETE") throw new DevelopmentControlPlaneError("RC_EVIDENCE_INCOMPLETE");
  if (input.changeSet.developmentJobId !== input.job.developmentJobId || input.changeSet.headRevision !== input.commitRevision) throw new DevelopmentControlPlaneError("RC_CHANGESET_MISMATCH");
  if (input.evidence.sourceRevision !== input.commitRevision || input.evidence.baseRevision !== input.job.baseRevision || input.evidence.contextPackHash !== input.job.contextPackHash) throw new DevelopmentControlPlaneError("RC_EVIDENCE_MISMATCH");
  if (containsRawSecret(input)) throw new DevelopmentControlPlaneError("RAW_SECRET_FORBIDDEN");
  const candidate = {
    contractVersion: "spec-218-v3" as const,
    releaseCandidateId: id(input.releaseCandidateId, "RC_ID_INVALID"),
    developmentJobId: input.job.developmentJobId,
    tenantId: input.job.tenantId,
    productId: input.job.productId,
    repositoryRef: input.job.repositoryRef,
    commitRevision: ref(input.commitRevision, "COMMIT_REVISION_INVALID"),
    treeHash: hash(input.treeHash, "TREE_HASH_INVALID"),
    artifactDigest: hash(input.artifactDigest, "ARTIFACT_DIGEST_INVALID"),
    evidence: structuredClone(input.evidence),
    approverPrincipalId: id(input.approverPrincipalId, "APPROVER_INVALID"),
    handoffToSpec219: true as const,
  };
  return { ...candidate, contentHash: contentHash(candidate) };
}

export function assertReleaseCandidateImmutable(original: ReleaseCandidate, candidate: ReleaseCandidate): true {
  const originalBody = { ...original };
  delete (originalBody as Partial<ReleaseCandidate>).contentHash;
  const candidateBody = { ...candidate };
  delete (candidateBody as Partial<ReleaseCandidate>).contentHash;
  if (original.contentHash !== contentHash(originalBody) || candidate.contentHash !== contentHash(candidateBody) || original.contentHash !== candidate.contentHash) {
    throw new DevelopmentControlPlaneError("RC_IMMUTABLE");
  }
  return true;
}
