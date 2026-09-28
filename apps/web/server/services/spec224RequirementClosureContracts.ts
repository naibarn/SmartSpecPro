import { deriveSpec224RequirementId } from "./spec224SpecBaseline";
import { createHash } from "node:crypto";

export type RequirementState =
  | "UNPARSED"
  | "MAPPED"
  | "PLANNED"
  | "IMPLEMENTING"
  | "IMPLEMENTED_UNVERIFIED"
  | "VERIFIED_PASS"
  | "VERIFIED_FAIL"
  | "WAIVED_BY_AUTHORIZED_DECISION"
  | "NOT_APPLICABLE_WITH_EVIDENCE";

export type RequirementRecord = {
  id: string;
  sourceRef: string;
  text: string;
  state: RequirementState;
  planSectionIds: string[];
  workPackageIds: string[];
  evidenceRefs: string[];
  evidence: RequirementEvidence[];
};

export type RequirementEvidence = {
  evidenceRef: string;
  baselineId: string;
  sourceArtifactDigest: string;
  requirementId: string;
  workPackageId: string;
  implementationDigest: string;
  verifierRef: string;
  verificationMethod: string;
  verifiedAt: string;
  invalidatedAt: string | null;
  invalidationReason: string | null;
};

export type WorkPackageEvidence = Omit<RequirementEvidence, "requirementId">;

export type PlanSectionStatus =
  | "NOT_STARTED"
  | "READY"
  | "IN_PROGRESS"
  | "BLOCKED_PARTIAL"
  | "WAITING_DECISION"
  | "INTEGRATING"
  | "REVIEWING"
  | "GAP_REPAIR"
  | "VERIFIED"
  | "COMPLETE";
export type WorkPackageStatus =
  | "NOT_STARTED"
  | "TEST_DESIGN"
  | "RED_READY"
  | "IMPLEMENTING"
  | "IMPLEMENTED_UNVERIFIED"
  | "GREEN"
  | "REFACTORING"
  | "TARGETED_VERIFY"
  | "REVIEWING"
  | "BLOCKED"
  | "VERIFIED"
  | "COMPLETE";
export type TddApplicability =
  | "TDD_REQUIRED"
  | "TDD_PREFERRED"
  | "TDD_NOT_APPLICABLE_WITH_REASON"
  | "ALTERNATE_VERIFICATION_REQUIRED";

export type PlanSectionRecord = {
  id: string;
  title: string;
  objective: string;
  requirementIds: string[];
  derivedRequirementIds: string[];
  sourceSpecRefs: string[];
  dependencySectionIds: string[];
  workPackageIds: string[];
  entryConditions: string[];
  exitConditions: string[];
  verificationObligations: string[];
  riskClass: "low" | "medium" | "high" | "critical";
  owners: string[];
  executorConstraints: string[];
  status: PlanSectionStatus;
  admissionGaps: string[];
};

export type WorkPackageRecord = {
  id: string;
  title: string;
  objective: string;
  planSectionId: string;
  requirementIds: string[];
  derivedRequirementIds: string[];
  dependsOn: string[];
  owner: string;
  allowedWriteSet: string[];
  workspaceRef: string;
  operationScope: string;
  approvalGateRef: string | null;
  testPlanRefs: string[];
  evidenceRefs: string[];
  evidence: WorkPackageEvidence[];
  reviewer: string;
  riskClass: "low" | "medium" | "high" | "critical";
  status: WorkPackageStatus;
  tddApplicability: TddApplicability;
  tddReason: string | null;
  alternateVerificationPlan: string | null;
  nextSafeAction: string;
  admissionGaps: string[];
};

export type DeferredTestCategory =
  | "UNIT"
  | "INTEGRATION"
  | "E2E"
  | "PERFORMANCE"
  | "SECURITY"
  | "MIGRATION"
  | "MANUAL"
  | "OTHER";

/** A versioned deferral record, never a passing-test or verification record. */
export type DeferredTestObligation = {
  obligationId: string;
  version: number;
  runId: string;
  requirementId: string;
  workPackageId: string;
  specId: string;
  specRevision: string;
  sourceArtifactDigest: string;
  specDigest: string;
  category: DeferredTestCategory;
  testTarget: string;
  reason: string;
  requiredEnvironment: string;
  createdAt: string;
  invalidatedAt: string | null;
  invalidationReason: string | null;
};

export type DerivedRequirementRecord = {
  id: string;
  originFindingId: string;
  originCampaignRef: string;
  parentRequirementRef: string;
  classification: string;
  reason: string;
  severity: "low" | "medium" | "high" | "critical";
  requiredVerification: string[];
  introducedAt: string;
  specAmendmentRef: string | null;
  status: "PROPOSED" | "ACCEPTED" | "REJECTED";
  decisionRef: string | null;
  workPackageIds: string[];
};

export type SourceChangeRecord = {
  path: string;
  beforeDigest: string | null;
  afterDigest: string | null;
  requirementIds: string[];
  derivedRequirementIds: string[];
  evidenceRef: string;
  classification: "JUSTIFIED_CHANGE" | "UNREQUESTED_CHANGE";
};

export type SourceManifestEntry = { path: string; digest: string };
export type SourceManifestCoverage = {
  repositoryRef: string;
  baselineRevision: string;
  candidateRevision: string;
  inclusionRoots: string[];
  excludedPaths: string[];
  recursive: true;
  includesUntracked: true;
  attestationEvidenceRef: string;
};

export type SourceChangeInventory = {
  baselineRevision: string;
  candidateRevision: string;
  baselineManifestDigest: string;
  candidateManifestDigest: string;
  inventoryDigest: string;
  scannerRef: string;
  manifestEvidenceRef: string;
  coverage: SourceManifestCoverage;
  specArtifactPath: string;
  baselineFiles: SourceManifestEntry[];
  candidateFiles: SourceManifestEntry[];
  scannedAt: string;
  complete: true;
  changes: SourceChangeRecord[];
};

export type BlockerStatus =
  "OPEN" | "INVESTIGATING" | "REPAIR" | "VERIFY" | "CLOSED";

export type BlockerLedgerEntry = {
  blockerId: string;
  runId: string;
  requirementRefs: string[];
  classification: string;
  severity: "low" | "medium" | "high" | "critical";
  openedBy: string;
  openedAt: string;
  currentOwner: string;
  subrunRef: string | null;
  status: BlockerStatus;
  resolution: string | null;
  verificationRefs: string[];
  reopenCount: number;
  closedAt: string | null;
};

export type RequirementClosureGraph = {
  contractVersion: "spec-224-closure-v2";
  baseline: {
    specId: string;
    revision: string;
    sourceArtifactDigest: string;
    digest: string;
    baselineId: string;
    authorityRef: string;
    scopeEnvelopeRef: string;
  };
  requirements: RequirementRecord[];
  planSections: PlanSectionRecord[];
  workPackages: WorkPackageRecord[];
  derivedRequirements: DerivedRequirementRecord[];
  sourceChanges: SourceChangeRecord[];
  reverse: Record<string, string[]>;
  blockers: BlockerLedgerEntry[];
  sourceInventory: SourceChangeInventory | null;
  admissionGaps: string[];
  /** Optional only for older closure-v2 records; absent must remain absent in their digest projection. */
  deferredTestObligations?: DeferredTestObligation[];
};

export class Spec224ClosureError extends Error {
  constructor(
    public readonly code: string,
    message = code
  ) {
    super(message);
    this.name = "Spec224ClosureError";
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

const ID = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,159}$/;
const REF = /^[a-z][a-z0-9_-]{0,31}:[A-Za-z0-9_./:@#-]{1,191}$/;
const HASH = /^[a-f0-9]{64}$/;
const TERMINAL_REQUIREMENT_STATES = new Set<RequirementState>([
  "VERIFIED_PASS",
  "WAIVED_BY_AUTHORIZED_DECISION",
  "NOT_APPLICABLE_WITH_EVIDENCE",
]);

function text(value: unknown, code: string, max = 4000): string {
  if (typeof value !== "string" || !value.trim() || value.trim().length > max)
    throw new Spec224ClosureError(code);
  return value.trim();
}

function optionalText(
  value: unknown,
  code: string,
  gaps: string[],
  max = 4000
): string {
  if (typeof value !== "string" || !value.trim()) {
    gaps.push(code);
    return "";
  }
  if (value.trim().length > max) throw new Spec224ClosureError(code);
  return value.trim();
}

function id(value: unknown, code: string): string {
  const result = text(value, code, 160);
  if (!ID.test(result)) throw new Spec224ClosureError(code);
  return result;
}

function ref(value: unknown, code: string): string {
  const result = text(value, code, 200);
  if (!REF.test(result)) throw new Spec224ClosureError(code);
  return result;
}

function unique(values: string[], code: string): string[] {
  if (!Array.isArray(values) || values.some(value => typeof value !== "string"))
    throw new Spec224ClosureError(code);
  const normalized = values.map(value => id(value, code));
  if (new Set(normalized).size !== normalized.length)
    throw new Spec224ClosureError(code);
  return normalized;
}

function stringList(values: string[], code: string, max = 1000): string[] {
  if (!Array.isArray(values) || values.length > max) {
    throw new Spec224ClosureError(code);
  }
  const normalized = values.map(value => text(value, code, 1000));
  if (new Set(normalized).size !== normalized.length) {
    throw new Spec224ClosureError(code);
  }
  return normalized.sort();
}

function relativePath(value: string): string {
  const path = text(value, "SOURCE_CHANGE_PATH_INVALID", 512).replace(
    /\\/g,
    "/"
  );
  if (
    path.startsWith("/") ||
    /^[A-Za-z]:/.test(path) ||
    path.split("/").some(part => !part || part === "." || part === "..")
  ) {
    throw new Spec224ClosureError("SOURCE_CHANGE_PATH_INVALID");
  }
  return path;
}

function timestamp(value: string, code: string): string {
  const normalized = text(value, code, 64);
  const parsed = new Date(normalized);
  if (
    !Number.isFinite(parsed.getTime()) ||
    parsed.toISOString() !== normalized
  ) {
    throw new Spec224ClosureError(code);
  }
  return normalized;
}

function sha256(value: unknown): string {
  return createHash("sha256")
    .update(JSON.stringify(canonicalize(value)), "utf8")
    .digest("hex");
}

export function deriveDerivedRequirementId(
  baseline: RequirementClosureGraph["baseline"],
  input: Omit<DerivedRequirementRecord, "id" | "workPackageIds">
): string {
  const {
    originFindingId,
    originCampaignRef,
    parentRequirementRef,
    classification,
    reason,
    severity,
    requiredVerification,
    introducedAt,
    specAmendmentRef,
  } = input;
  return `derived:${sha256({
    specId: baseline.specId,
    revision: baseline.revision,
    sourceArtifactDigest: baseline.sourceArtifactDigest,
    sourceDigest: baseline.digest,
    baselineId: baseline.baselineId,
    originFindingId,
    originCampaignRef,
    parentRequirementRef,
    classification,
    reason,
    severity,
    requiredVerification,
    introducedAt,
    specAmendmentRef,
  })}`;
}

export function buildSourceChangeInventory(input: {
  baseline: RequirementClosureGraph["baseline"];
  baselineRevision: string;
  candidateRevision: string;
  baselineManifestDigest: string;
  candidateManifestDigest: string;
  scannerRef: string;
  manifestEvidenceRef: string;
  coverage: SourceManifestCoverage;
  specArtifactPath: string;
  baselineFiles: SourceManifestEntry[];
  candidateFiles: SourceManifestEntry[];
  scannedAt: string;
  changes: Array<Omit<SourceChangeRecord, "classification">>;
  requirementIds: string[];
  derivedRequirements: DerivedRequirementRecord[];
}): SourceChangeInventory {
  const normalized = normalizeSourceInventory(
    {
      baselineRevision: input.baselineRevision,
      candidateRevision: input.candidateRevision,
      baselineManifestDigest: input.baselineManifestDigest,
      candidateManifestDigest: input.candidateManifestDigest,
      scannerRef: input.scannerRef,
      manifestEvidenceRef: input.manifestEvidenceRef,
      coverage: input.coverage,
      specArtifactPath: input.specArtifactPath,
      baselineFiles: input.baselineFiles,
      candidateFiles: input.candidateFiles,
      scannedAt: input.scannedAt,
      complete: true,
      changes: input.changes,
    },
    {
      baseline: input.baseline,
      requirementIds: new Set(input.requirementIds),
      derivedRequirements: input.derivedRequirements,
    }
  );
  if (!normalized || normalized.baselineRevision !== input.baselineRevision) {
    throw new Spec224ClosureError("SOURCE_INVENTORY_INVALID");
  }
  return normalized;
}

export function digestSourceManifest(entries: SourceManifestEntry[]): string {
  return sha256(
    entries
      .map(entry => ({
        path: relativePath(entry.path),
        digest: entry.digest,
      }))
      .sort((left, right) => left.path.localeCompare(right.path))
  );
}

export function buildRequirementEvidenceBinding(input: {
  graph: RequirementClosureGraph;
  requirementId: string;
  workPackageId: string;
  evidenceRef: string;
  verificationMethod: string;
  verifierRef: string;
  verifiedAt: string;
}): RequirementEvidence {
  const requirement = input.graph.requirements.find(
    item => item.id === input.requirementId
  );
  if (
    !requirement ||
    !requirement.workPackageIds.includes(input.workPackageId)
  ) {
    throw new Spec224ClosureError("REQUIREMENT_EVIDENCE_BINDING_INVALID");
  }
  if (!input.graph.sourceInventory)
    throw new Spec224ClosureError("SOURCE_INVENTORY_MISSING");
  return {
    evidenceRef: ref(input.evidenceRef, "REQUIREMENT_EVIDENCE_INVALID"),
    baselineId: input.graph.baseline.baselineId,
    sourceArtifactDigest: input.graph.baseline.sourceArtifactDigest,
    requirementId: input.requirementId,
    workPackageId: input.workPackageId,
    implementationDigest: input.graph.sourceInventory.candidateManifestDigest,
    verificationMethod: text(
      input.verificationMethod,
      "REQUIREMENT_EVIDENCE_METHOD_INVALID",
      160
    ),
    verifierRef: ref(
      input.verifierRef,
      "REQUIREMENT_EVIDENCE_VERIFIER_INVALID"
    ),
    verifiedAt: timestamp(
      input.verifiedAt,
      "REQUIREMENT_EVIDENCE_TIMESTAMP_INVALID"
    ),
    invalidatedAt: null,
    invalidationReason: null,
  };
}

export function buildWorkPackageEvidenceBinding(input: {
  graph: RequirementClosureGraph;
  workPackageId: string;
  evidenceRef: string;
  verificationMethod: string;
  verifierRef: string;
  verifiedAt: string;
}): WorkPackageEvidence {
  if (!input.graph.workPackages.some(item => item.id === input.workPackageId)) {
    throw new Spec224ClosureError("WORK_PACKAGE_EVIDENCE_BINDING_INVALID");
  }
  if (!input.graph.sourceInventory)
    throw new Spec224ClosureError("SOURCE_INVENTORY_MISSING");
  return {
    evidenceRef: ref(input.evidenceRef, "WORK_PACKAGE_EVIDENCE_INVALID"),
    baselineId: input.graph.baseline.baselineId,
    sourceArtifactDigest: input.graph.baseline.sourceArtifactDigest,
    workPackageId: input.workPackageId,
    implementationDigest: input.graph.sourceInventory.candidateManifestDigest,
    verifierRef: ref(
      input.verifierRef,
      "WORK_PACKAGE_EVIDENCE_VERIFIER_INVALID"
    ),
    verificationMethod: text(
      input.verificationMethod,
      "WORK_PACKAGE_EVIDENCE_METHOD_INVALID",
      160
    ),
    verifiedAt: timestamp(
      input.verifiedAt,
      "WORK_PACKAGE_EVIDENCE_TIMESTAMP_INVALID"
    ),
    invalidatedAt: null,
    invalidationReason: null,
  };
}

function normalizeSourceInventory(
  inventory:
    | (Omit<SourceChangeInventory, "inventoryDigest" | "changes"> & {
        inventoryDigest?: string;
        changes: Array<
          Omit<SourceChangeRecord, "classification"> & {
            classification?: SourceChangeRecord["classification"];
          }
        >;
      })
    | null,
  context: {
    baseline: RequirementClosureGraph["baseline"];
    requirementIds: Set<string>;
    derivedRequirements: DerivedRequirementRecord[];
  }
): SourceChangeInventory | null {
  if (!inventory) return null;
  if (inventory.complete !== true)
    throw new Spec224ClosureError("SOURCE_INVENTORY_INCOMPLETE");
  const normalizeManifest = (entries: SourceManifestEntry[]) => {
    if (!Array.isArray(entries) || entries.length === 0)
      throw new Spec224ClosureError("SOURCE_MANIFEST_INCOMPLETE");
    const normalized = entries
      .map(entry => {
        const path = relativePath(entry.path);
        if (!HASH.test(entry.digest))
          throw new Spec224ClosureError("SOURCE_MANIFEST_ENTRY_INVALID");
        return { path, digest: entry.digest };
      })
      .sort((left, right) => left.path.localeCompare(right.path));
    if (new Set(normalized.map(entry => entry.path)).size !== normalized.length)
      throw new Spec224ClosureError("SOURCE_MANIFEST_DUPLICATE_PATH");
    return normalized;
  };
  const baselineFiles = normalizeManifest(inventory.baselineFiles);
  const candidateFiles = normalizeManifest(inventory.candidateFiles);
  const coverage = inventory.coverage;
  if (
    !coverage ||
    coverage.recursive !== true ||
    coverage.includesUntracked !== true ||
    !Array.isArray(coverage.inclusionRoots) ||
    coverage.inclusionRoots.length === 0
  )
    throw new Spec224ClosureError("SOURCE_MANIFEST_COVERAGE_INCOMPLETE");
  const normalizedCoverage: SourceManifestCoverage = {
    repositoryRef: ref(
      coverage.repositoryRef,
      "SOURCE_MANIFEST_REPOSITORY_INVALID"
    ),
    baselineRevision: text(
      coverage.baselineRevision,
      "SOURCE_MANIFEST_BASELINE_INVALID",
      160
    ),
    candidateRevision: text(
      coverage.candidateRevision,
      "SOURCE_MANIFEST_CANDIDATE_INVALID",
      160
    ),
    inclusionRoots: stringList(
      coverage.inclusionRoots,
      "SOURCE_MANIFEST_ROOTS_INVALID"
    ),
    excludedPaths: stringList(
      coverage.excludedPaths,
      "SOURCE_MANIFEST_EXCLUSIONS_INVALID"
    ),
    recursive: true,
    includesUntracked: true,
    attestationEvidenceRef: ref(
      coverage.attestationEvidenceRef,
      "SOURCE_MANIFEST_ATTESTATION_INVALID"
    ),
  };
  const coveredPath = (path: string) =>
    normalizedCoverage.inclusionRoots.some(
      root =>
        root === "**" ||
        path === root ||
        path.startsWith(`${root.replace(/\/$/, "")}/`)
    );
  const excludedPath = (path: string) =>
    normalizedCoverage.excludedPaths.some(exclusion => {
      const prefix = exclusion.replace(/\/\*\*$/, "").replace(/\/$/, "");
      return path === prefix || path.startsWith(`${prefix}/`);
    });
  if (
    [...baselineFiles, ...candidateFiles].some(
      file => !coveredPath(file.path) || excludedPath(file.path)
    )
  )
    throw new Spec224ClosureError("SOURCE_MANIFEST_SCOPE_MISMATCH");
  const baselineByPath = new Map(
    baselineFiles.map(file => [file.path, file.digest])
  );
  const candidateByPath = new Map(
    candidateFiles.map(file => [file.path, file.digest])
  );
  const specArtifactPath = relativePath(inventory.specArtifactPath);
  if (
    normalizedCoverage.baselineRevision !== inventory.baselineRevision ||
    normalizedCoverage.candidateRevision !== inventory.candidateRevision ||
    normalizedCoverage.attestationEvidenceRef !== inventory.manifestEvidenceRef
  )
    throw new Spec224ClosureError("SOURCE_MANIFEST_COVERAGE_MISMATCH");
  if (
    baselineByPath.get(specArtifactPath) !==
      context.baseline.sourceArtifactDigest ||
    candidateByPath.get(specArtifactPath) !==
      context.baseline.sourceArtifactDigest
  )
    throw new Spec224ClosureError("SOURCE_SPEC_BASELINE_MISMATCH");
  const actualChangedPaths = [
    ...new Set([...baselineByPath.keys(), ...candidateByPath.keys()]),
  ]
    .filter(path => baselineByPath.get(path) !== candidateByPath.get(path))
    .sort();
  const declaredChangedPaths = inventory.changes
    .map(change => relativePath(change.path))
    .sort();
  if (
    JSON.stringify(actualChangedPaths) !== JSON.stringify(declaredChangedPaths)
  )
    throw new Spec224ClosureError("SOURCE_CHANGE_MANIFEST_MISMATCH");
  const changes = inventory.changes
    .map(change => {
      const path = relativePath(change.path);
      if (
        change.beforeDigest !== (baselineByPath.get(path) ?? null) ||
        change.afterDigest !== (candidateByPath.get(path) ?? null)
      )
        throw new Spec224ClosureError("SOURCE_CHANGE_MANIFEST_MISMATCH");
      if (change.beforeDigest !== null && !HASH.test(change.beforeDigest))
        throw new Spec224ClosureError("SOURCE_CHANGE_DIGEST_INVALID");
      if (
        (change.afterDigest !== null && !HASH.test(change.afterDigest)) ||
        (change.beforeDigest === null && change.afterDigest === null) ||
        change.beforeDigest === change.afterDigest
      )
        throw new Spec224ClosureError("SOURCE_CHANGE_DIGEST_INVALID");
      const requirementIds = unique(
        change.requirementIds,
        "SOURCE_CHANGE_REQUIREMENTS_INVALID"
      ).sort();
      const derivedRequirementIds = unique(
        change.derivedRequirementIds,
        "SOURCE_CHANGE_DERIVED_INVALID"
      ).sort();
      if (requirementIds.some(value => !context.requirementIds.has(value)))
        throw new Spec224ClosureError("SOURCE_CHANGE_PARENT_UNKNOWN");
      const derivedById = new Map(
        context.derivedRequirements.map(value => [value.id, value])
      );
      if (
        derivedRequirementIds.some(
          value => derivedById.get(value)?.status !== "ACCEPTED"
        )
      )
        throw new Spec224ClosureError("SOURCE_CHANGE_DERIVED_NOT_ACCEPTED");
      return {
        path,
        beforeDigest: change.beforeDigest,
        afterDigest: change.afterDigest,
        requirementIds,
        derivedRequirementIds,
        evidenceRef: ref(change.evidenceRef, "SOURCE_CHANGE_EVIDENCE_INVALID"),
        classification:
          requirementIds.length || derivedRequirementIds.length
            ? ("JUSTIFIED_CHANGE" as const)
            : ("UNREQUESTED_CHANGE" as const),
      };
    })
    .sort((left, right) => left.path.localeCompare(right.path));
  if (new Set(changes.map(change => change.path)).size !== changes.length)
    throw new Spec224ClosureError("SOURCE_CHANGE_DUPLICATE");
  const normalized = {
    baselineRevision: text(
      inventory.baselineRevision,
      "SOURCE_INVENTORY_BASELINE_INVALID",
      160
    ),
    candidateRevision: text(
      inventory.candidateRevision,
      "SOURCE_INVENTORY_CANDIDATE_INVALID",
      160
    ),
    baselineManifestDigest: inventory.baselineManifestDigest,
    candidateManifestDigest: inventory.candidateManifestDigest,
    scannerRef: ref(inventory.scannerRef, "SOURCE_INVENTORY_SCANNER_INVALID"),
    manifestEvidenceRef: ref(
      inventory.manifestEvidenceRef,
      "SOURCE_INVENTORY_EVIDENCE_INVALID"
    ),
    coverage: normalizedCoverage,
    specArtifactPath,
    baselineFiles,
    candidateFiles,
    scannedAt: timestamp(
      inventory.scannedAt,
      "SOURCE_INVENTORY_TIMESTAMP_INVALID"
    ),
    complete: true as const,
    changes,
  };
  if (
    !HASH.test(normalized.baselineManifestDigest) ||
    !HASH.test(normalized.candidateManifestDigest) ||
    digestSourceManifest(baselineFiles) !== normalized.baselineManifestDigest ||
    digestSourceManifest(candidateFiles) !== normalized.candidateManifestDigest
  )
    throw new Spec224ClosureError("SOURCE_INVENTORY_DIGEST_INVALID");
  const inventoryDigest = sha256({
    ...normalized,
    changes: normalized.changes.map(
      ({ classification: _classification, ...change }) => change
    ),
  });
  if (
    inventory.inventoryDigest &&
    inventory.inventoryDigest !== inventoryDigest
  )
    throw new Spec224ClosureError("SOURCE_INVENTORY_DIGEST_MISMATCH");
  return { ...normalized, inventoryDigest };
}

function assertAcyclic(
  workPackages: Array<{ id: string; dependsOn: string[] }>
): void {
  const byId = new Map(
    workPackages.map(workPackage => [workPackage.id, workPackage])
  );
  for (const workPackage of workPackages) {
    for (const dependency of workPackage.dependsOn) {
      if (!byId.has(dependency))
        throw new Spec224ClosureError("WORK_PACKAGE_DEPENDENCY_MISSING");
    }
  }
  const visiting = new Set<string>();
  const visited = new Set<string>();
  const visit = (workPackageId: string): void => {
    if (visiting.has(workPackageId))
      throw new Spec224ClosureError("WORK_PACKAGE_CYCLE");
    if (visited.has(workPackageId)) return;
    visiting.add(workPackageId);
    for (const dependency of byId.get(workPackageId)!.dependsOn)
      visit(dependency);
    visiting.delete(workPackageId);
    visited.add(workPackageId);
  };
  for (const workPackage of workPackages) visit(workPackage.id);
}

function dependencyContains(
  packageId: string,
  dependencyId: string,
  packages: Map<string, WorkPackageRecord>,
  seen = new Set<string>()
): boolean {
  if (seen.has(packageId)) return false;
  seen.add(packageId);
  const current = packages.get(packageId);
  if (!current) return false;
  if (current.dependsOn.includes(dependencyId)) return true;
  return current.dependsOn.some(value =>
    dependencyContains(value, dependencyId, packages, seen)
  );
}

function writePathsOverlap(left: string, right: string): boolean {
  if (left === right || left === "**" || right === "**") return true;
  if (left.includes("**") || right.includes("**")) return true;
  const glob = (pattern: string, candidate: string): boolean => {
    const escaped = pattern
      .replace(/[.+?^${}()|[\]\\]/g, "\\$&")
      .replace(/\*/g, "[^/]*");
    return new RegExp(`^${escaped}$`).test(candidate);
  };
  return glob(left, right) || glob(right, left);
}

export function compileRequirementClosureGraph(input: {
  baseline: RequirementClosureGraph["baseline"];
  requirements: Array<{ id: string; sourceRef: string; text: string }>;
  planSections: Array<{
    id: string;
    requirementIds: string[];
    derivedRequirementIds?: string[];
    title?: string;
    objective?: string;
    sourceSpecRefs?: string[];
    dependencySectionIds?: string[];
    workPackageIds?: string[];
    entryConditions?: string[];
    exitConditions?: string[];
    verificationObligations?: string[];
    riskClass?: PlanSectionRecord["riskClass"];
    owners?: string[];
    executorConstraints?: string[];
    status?: PlanSectionStatus;
  }>;
  workPackages: Array<{
    id: string;
    planSectionId: string;
    requirementIds: string[];
    dependsOn: string[];
    derivedRequirementIds?: string[];
    title?: string;
    objective?: string;
    owner?: string;
    allowedWriteSet?: string[];
    workspaceRef?: string;
    operationScope?: string;
    approvalGateRef?: string | null;
    testPlanRefs?: string[];
    evidenceRefs?: string[];
    reviewer?: string;
    riskClass?: WorkPackageRecord["riskClass"];
    status?: WorkPackageStatus;
    tddApplicability?: TddApplicability;
    tddReason?: string | null;
    alternateVerificationPlan?: string | null;
    nextSafeAction?: string;
  }>;
  derivedRequirements?: DerivedRequirementRecord[];
  sourceInventory?:
    | (Omit<SourceChangeInventory, "inventoryDigest" | "changes"> & {
        inventoryDigest?: string;
        changes: Array<
          Omit<SourceChangeRecord, "classification"> & {
            classification?: SourceChangeRecord["classification"];
          }
        >;
      })
    | null;
}): RequirementClosureGraph {
  if (
    !HASH.test(input.baseline.sourceArtifactDigest) ||
    !HASH.test(input.baseline.digest)
  )
    throw new Spec224ClosureError("BASELINE_DIGEST_INVALID");
  for (const value of [
    input.baseline.specId,
    input.baseline.revision,
    input.baseline.baselineId,
  ])
    id(value, "BASELINE_INVALID");
  ref(input.baseline.authorityRef, "AUTHORITY_REF_INVALID");
  ref(input.baseline.scopeEnvelopeRef, "SCOPE_ENVELOPE_REF_INVALID");
  if (!input.requirements.length)
    throw new Spec224ClosureError("REQUIREMENTS_REQUIRED");
  const requirementInputs = input.requirements
    .map(requirement => {
      const requirementId = id(requirement.id, "REQUIREMENT_ID_INVALID");
      const sourceRef = ref(
        requirement.sourceRef,
        "REQUIREMENT_SOURCE_INVALID"
      );
      const requirementText = text(
        requirement.text,
        "REQUIREMENT_TEXT_INVALID"
      );
      const prefix = `spec:${input.baseline.specId}@${input.baseline.revision}#L`;
      if (!sourceRef.startsWith(prefix)) {
        throw new Spec224ClosureError("REQUIREMENT_SOURCE_BASELINE_MISMATCH");
      }
      const lineRange = /^(\d+)(?:-L(\d+))?$/.exec(
        sourceRef.slice(prefix.length)
      );
      const line = lineRange ? Number(lineRange[1]) : NaN;
      const endLine = lineRange?.[2] ? Number(lineRange[2]) : line;
      if (
        !Number.isSafeInteger(line) ||
        line < 1 ||
        !Number.isSafeInteger(endLine) ||
        endLine < line
      ) {
        throw new Spec224ClosureError("REQUIREMENT_SOURCE_INVALID");
      }
      const expectedId = deriveSpec224RequirementId({
        specId: input.baseline.specId,
        revision: input.baseline.revision,
        sourceArtifactDigest: input.baseline.sourceArtifactDigest,
        sourceDigest: input.baseline.digest,
        line,
        text: requirementText,
      });
      if (requirementId !== expectedId) {
        throw new Spec224ClosureError("REQUIREMENT_ID_SOURCE_MISMATCH");
      }
      return { id: requirementId, sourceRef, text: requirementText };
    })
    .sort(
      (left, right) =>
        left.sourceRef.localeCompare(right.sourceRef) ||
        left.id.localeCompare(right.id)
    );
  const requirementIds = requirementInputs.map(requirement => requirement.id);
  if (new Set(requirementIds).size !== requirementIds.length)
    throw new Spec224ClosureError("REQUIREMENT_DUPLICATE");
  const requirementSet = new Set(requirementIds);
  const planSectionIds = input.planSections.map(section =>
    id(section.id, "PLAN_SECTION_ID_INVALID")
  );
  if (new Set(planSectionIds).size !== planSectionIds.length)
    throw new Spec224ClosureError("PLAN_SECTION_DUPLICATE");
  const planSectionByRequirement = new Map<string, string[]>();
  const planSections = input.planSections
    .map(section => {
      const sectionId = id(section.id, "PLAN_SECTION_ID_INVALID");
      const ids = unique(
        section.requirementIds,
        "PLAN_REQUIREMENT_IDS_INVALID"
      );
      for (const requirementId of ids) {
        if (!requirementSet.has(requirementId))
          throw new Spec224ClosureError("PLAN_REQUIREMENT_UNKNOWN");
        planSectionByRequirement.set(requirementId, [
          ...(planSectionByRequirement.get(requirementId) ?? []),
          sectionId,
        ]);
      }
      const gaps: string[] = [];
      const title = optionalText(
        section.title,
        "PLAN_SECTION_TITLE_MISSING",
        gaps,
        200
      );
      const objective = optionalText(
        section.objective,
        "PLAN_SECTION_OBJECTIVE_MISSING",
        gaps,
        2000
      );
      const textFields = [
        "entryConditions",
        "exitConditions",
        "verificationObligations",
        "owners",
        "executorConstraints",
      ] as const;
      for (const field of textFields) {
        if (!Array.isArray(section[field]) || section[field]!.length === 0)
          gaps.push(`PLAN_SECTION_${field.toUpperCase()}_MISSING`);
      }
      if (
        !section.riskClass ||
        !["low", "medium", "high", "critical"].includes(section.riskClass)
      )
        gaps.push("PLAN_SECTION_RISK_CLASS_MISSING");
      const sectionStatus = section.status ?? "NOT_STARTED";
      if (!section.status) gaps.push("PLAN_SECTION_STATUS_MISSING");
      if (
        ![
          "NOT_STARTED",
          "READY",
          "IN_PROGRESS",
          "BLOCKED_PARTIAL",
          "WAITING_DECISION",
          "INTEGRATING",
          "REVIEWING",
          "GAP_REPAIR",
          "VERIFIED",
          "COMPLETE",
        ].includes(sectionStatus)
      )
        gaps.push("PLAN_SECTION_STATUS_INVALID");
      const dependencySectionIds = unique(
        section.dependencySectionIds ?? [],
        "PLAN_SECTION_DEPENDENCIES_INVALID"
      ).sort();
      const derivedRequirementIds = unique(
        section.derivedRequirementIds ?? [],
        "PLAN_DERIVED_REQUIREMENTS_INVALID"
      ).sort();
      const sourceSpecRefs = stringList(
        section.sourceSpecRefs ??
          requirementInputs
            .filter(item => ids.includes(item.id))
            .map(item => item.sourceRef),
        "PLAN_SOURCE_REFS_INVALID"
      );
      const entryConditions = stringList(
        section.entryConditions ?? [],
        "PLAN_ENTRY_CONDITIONS_INVALID"
      );
      const exitConditions = stringList(
        section.exitConditions ?? [],
        "PLAN_EXIT_CONDITIONS_INVALID"
      );
      const verificationObligations = stringList(
        section.verificationObligations ?? [],
        "PLAN_VERIFICATION_INVALID"
      );
      const owners = stringList(section.owners ?? [], "PLAN_OWNERS_INVALID");
      const executorConstraints = stringList(
        section.executorConstraints ?? [],
        "PLAN_EXECUTOR_CONSTRAINTS_INVALID"
      );
      return {
        id: sectionId,
        title,
        objective,
        requirementIds: ids.sort(),
        derivedRequirementIds,
        sourceSpecRefs,
        dependencySectionIds,
        workPackageIds: [] as string[],
        entryConditions,
        exitConditions,
        verificationObligations,
        riskClass: section.riskClass ?? "critical",
        owners,
        executorConstraints,
        status: sectionStatus,
        admissionGaps: gaps,
      };
    })
    .sort((left, right) => left.id.localeCompare(right.id));
  assertAcyclic(
    planSections.map(section => ({
      id: section.id,
      dependsOn: section.dependencySectionIds,
    }))
  );
  for (const section of planSections) {
    if (
      section.sourceSpecRefs.some(
        sourceRef =>
          !requirementInputs.some(item => item.sourceRef === sourceRef)
      )
    ) {
      throw new Spec224ClosureError("PLAN_SOURCE_REF_BASELINE_MISMATCH");
    }
    const expectedRefs = requirementInputs
      .filter(item => section.requirementIds.includes(item.id))
      .map(item => item.sourceRef)
      .sort();
    if (
      JSON.stringify(section.sourceSpecRefs) !== JSON.stringify(expectedRefs)
    ) {
      section.admissionGaps.push("PLAN_SECTION_SOURCE_REQUIREMENT_MISMATCH");
    }
  }
  const planSectionRequirements = new Map(
    planSections.map(section => [section.id, new Set(section.requirementIds)])
  );
  const workPackageIds = input.workPackages.map(workPackage =>
    id(workPackage.id, "WORK_PACKAGE_ID_INVALID")
  );
  if (new Set(workPackageIds).size !== workPackageIds.length)
    throw new Spec224ClosureError("WORK_PACKAGE_DUPLICATE");
  const owners = new Map<string, string[]>();
  const workPackages = input.workPackages
    .map(workPackage => {
      const workPackageId = id(workPackage.id, "WORK_PACKAGE_ID_INVALID");
      const planSectionId = id(
        workPackage.planSectionId,
        "PLAN_SECTION_ID_INVALID"
      );
      const workPackageRequirementIds = unique(
        workPackage.requirementIds,
        "WORK_PACKAGE_REQUIREMENT_IDS_INVALID"
      );
      const derivedRequirementIds = unique(
        workPackage.derivedRequirementIds ?? [],
        "WORK_PACKAGE_DERIVED_IDS_INVALID"
      ).sort();
      if (!planSectionIds.includes(planSectionId))
        throw new Spec224ClosureError("PLAN_SECTION_UNKNOWN");
      for (const requirementId of workPackageRequirementIds) {
        if (!requirementSet.has(requirementId))
          throw new Spec224ClosureError("WORK_PACKAGE_REQUIREMENT_UNKNOWN");
        if (!planSectionRequirements.get(planSectionId)?.has(requirementId)) {
          throw new Spec224ClosureError("WORK_PACKAGE_SECTION_MISMATCH");
        }
        owners.set(requirementId, [
          ...(owners.get(requirementId) ?? []),
          workPackageId,
        ]);
      }
      const gaps: string[] = [];
      const title = optionalText(
        workPackage.title,
        "WORK_PACKAGE_TITLE_MISSING",
        gaps,
        200
      );
      const objective = optionalText(
        workPackage.objective,
        "WORK_PACKAGE_OBJECTIVE_MISSING",
        gaps,
        2000
      );
      const owner = optionalText(
        workPackage.owner,
        "WORK_PACKAGE_OWNER_MISSING",
        gaps,
        160
      );
      const reviewer = optionalText(
        workPackage.reviewer,
        "WORK_PACKAGE_REVIEWER_MISSING",
        gaps,
        160
      );
      for (const field of ["allowedWriteSet", "testPlanRefs"] as const) {
        if (
          !Array.isArray(workPackage[field]) ||
          workPackage[field]!.length === 0
        )
          gaps.push(`WORK_PACKAGE_${field.toUpperCase()}_MISSING`);
      }
      const tddApplicability = workPackage.tddApplicability ?? "TDD_REQUIRED";
      const tddReason = workPackage.tddReason ?? null;
      const alternateVerificationPlan =
        workPackage.alternateVerificationPlan ?? null;
      if (
        (tddApplicability === "TDD_NOT_APPLICABLE_WITH_REASON" ||
          tddApplicability === "ALTERNATE_VERIFICATION_REQUIRED") &&
        !tddReason
      )
        gaps.push("WORK_PACKAGE_TDD_REASON_MISSING");
      if (
        tddApplicability === "ALTERNATE_VERIFICATION_REQUIRED" &&
        !alternateVerificationPlan
      )
        gaps.push("WORK_PACKAGE_ALTERNATE_VERIFICATION_MISSING");
      const status = workPackage.status ?? "NOT_STARTED";
      if (!workPackage.status) gaps.push("WORK_PACKAGE_STATUS_MISSING");
      if (!workPackage.tddApplicability)
        gaps.push("WORK_PACKAGE_TDD_DECISION_MISSING");
      const workspaceRef = workPackage.workspaceRef
        ? ref(workPackage.workspaceRef, "WORK_PACKAGE_WORKSPACE_INVALID")
        : "";
      if (!workspaceRef) gaps.push("WORK_PACKAGE_WORKSPACE_MISSING");
      const operationScope = optionalText(
        workPackage.operationScope,
        "WORK_PACKAGE_OPERATION_SCOPE_MISSING",
        gaps,
        1000
      );
      const approvalGateRef =
        workPackage.approvalGateRef === null
          ? null
          : workPackage.approvalGateRef
            ? ref(
                workPackage.approvalGateRef,
                "WORK_PACKAGE_APPROVAL_GATE_INVALID"
              )
            : null;
      if (workPackage.approvalGateRef === undefined)
        gaps.push("WORK_PACKAGE_APPROVAL_GATE_MISSING");
      const evidenceRefs = stringList(
        workPackage.evidenceRefs ?? [],
        "WORK_PACKAGE_EVIDENCE_INVALID"
      );
      if (evidenceRefs.some(evidenceRef => !REF.test(evidenceRef)))
        throw new Spec224ClosureError("WORK_PACKAGE_EVIDENCE_INVALID");
      const nextSafeAction = optionalText(
        workPackage.nextSafeAction,
        "WORK_PACKAGE_NEXT_ACTION_MISSING",
        gaps,
        1000
      );
      if (
        [
          "GREEN",
          "TARGETED_VERIFY",
          "REVIEWING",
          "VERIFIED",
          "COMPLETE",
        ].includes(status) &&
        evidenceRefs.length === 0
      )
        gaps.push("WORK_PACKAGE_CLOSURE_EVIDENCE_MISSING");
      if (
        ![
          "NOT_STARTED",
          "TEST_DESIGN",
          "RED_READY",
          "IMPLEMENTING",
          "IMPLEMENTED_UNVERIFIED",
          "GREEN",
          "REFACTORING",
          "TARGETED_VERIFY",
          "REVIEWING",
          "BLOCKED",
          "VERIFIED",
          "COMPLETE",
        ].includes(status)
      )
        gaps.push("WORK_PACKAGE_STATUS_INVALID");
      if (
        ![
          "TDD_REQUIRED",
          "TDD_PREFERRED",
          "TDD_NOT_APPLICABLE_WITH_REASON",
          "ALTERNATE_VERIFICATION_REQUIRED",
        ].includes(tddApplicability)
      )
        gaps.push("WORK_PACKAGE_TDD_APPLICABILITY_INVALID");
      if (
        !workPackage.riskClass ||
        !["low", "medium", "high", "critical"].includes(workPackage.riskClass)
      )
        gaps.push("WORK_PACKAGE_RISK_CLASS_MISSING");
      const allowedWriteSet = (workPackage.allowedWriteSet ?? [])
        .map(relativePath)
        .sort();
      const testPlanRefs = stringList(
        workPackage.testPlanRefs ?? [],
        "WORK_PACKAGE_TEST_PLAN_INVALID"
      );
      if (testPlanRefs.some(testRef => !REF.test(testRef)))
        throw new Spec224ClosureError("WORK_PACKAGE_TEST_PLAN_INVALID");
      return {
        id: workPackageId,
        title,
        objective,
        planSectionId,
        requirementIds: workPackageRequirementIds.sort(),
        derivedRequirementIds,
        dependsOn: unique(
          workPackage.dependsOn,
          "WORK_PACKAGE_DEPENDENCIES_INVALID"
        ).sort(),
        owner,
        allowedWriteSet,
        workspaceRef,
        operationScope,
        approvalGateRef,
        testPlanRefs,
        evidenceRefs,
        evidence: [],
        reviewer,
        riskClass: workPackage.riskClass ?? "critical",
        status,
        tddApplicability,
        tddReason,
        alternateVerificationPlan,
        nextSafeAction,
        admissionGaps: gaps,
      };
    })
    .sort((left, right) => left.id.localeCompare(right.id));
  assertAcyclic(workPackages);
  const packagesById = new Map(workPackages.map(item => [item.id, item]));
  for (let leftIndex = 0; leftIndex < workPackages.length; leftIndex += 1) {
    for (
      let rightIndex = leftIndex + 1;
      rightIndex < workPackages.length;
      rightIndex += 1
    ) {
      const left = workPackages[leftIndex]!;
      const right = workPackages[rightIndex]!;
      if (left.workspaceRef !== right.workspaceRef) continue;
      const ordered =
        dependencyContains(left.id, right.id, packagesById) ||
        dependencyContains(right.id, left.id, packagesById);
      const overlapping = left.allowedWriteSet.some(leftPath =>
        right.allowedWriteSet.some(rightPath =>
          writePathsOverlap(leftPath, rightPath)
        )
      );
      if (!ordered && overlapping) {
        left.admissionGaps.push(`WRITE_SET_OVERLAP:${right.id}`);
        right.admissionGaps.push(`WRITE_SET_OVERLAP:${left.id}`);
      }
    }
  }
  const sectionIds = new Set(planSections.map(section => section.id));
  if (
    planSections.some(section =>
      section.dependencySectionIds.some(
        dependency => !sectionIds.has(dependency)
      )
    )
  ) {
    throw new Spec224ClosureError("PLAN_SECTION_DEPENDENCY_MISSING");
  }
  for (const section of planSections) {
    section.workPackageIds = workPackages
      .filter(item => item.planSectionId === section.id)
      .map(item => item.id)
      .sort();
    if (section.workPackageIds.length === 0)
      section.admissionGaps.push("PLAN_SECTION_WORK_PACKAGE_MISSING");
    if (
      ["VERIFIED", "COMPLETE"].includes(section.status) &&
      section.workPackageIds.some(packageId => {
        const workPackage = workPackages.find(item => item.id === packageId)!;
        return (
          (workPackage.status !== "COMPLETE" &&
            workPackage.status !== "VERIFIED") ||
          workPackage.evidenceRefs.length === 0
        );
      })
    )
      section.admissionGaps.push(
        "PLAN_SECTION_CHILD_UNRESOLVED_OR_UNEVIDENCED"
      );
  }
  const derivedRequirements = (input.derivedRequirements ?? [])
    .map(derived => {
      const required = {
        originFindingId: id(
          derived.originFindingId,
          "DERIVED_ORIGIN_FINDING_INVALID"
        ),
        originCampaignRef: ref(
          derived.originCampaignRef,
          "DERIVED_CAMPAIGN_REF_INVALID"
        ),
        parentRequirementRef: text(
          derived.parentRequirementRef,
          "DERIVED_PARENT_INVALID",
          200
        ),
        classification: text(
          derived.classification,
          "DERIVED_CLASSIFICATION_INVALID",
          80
        ),
        reason: text(derived.reason, "DERIVED_REASON_INVALID", 2000),
        severity: derived.severity,
        requiredVerification: stringList(
          derived.requiredVerification,
          "DERIVED_VERIFICATION_INVALID"
        ),
        introducedAt: timestamp(
          derived.introducedAt,
          "DERIVED_TIMESTAMP_INVALID"
        ),
        specAmendmentRef:
          derived.specAmendmentRef === null
            ? null
            : ref(derived.specAmendmentRef, "DERIVED_AMENDMENT_INVALID"),
        status: derived.status,
        decisionRef:
          derived.decisionRef === null
            ? null
            : ref(derived.decisionRef, "DERIVED_DECISION_INVALID"),
      };
      if (
        !HASH.test(derived.id.slice("derived:".length)) ||
        !derived.id.startsWith("derived:")
      ) {
        throw new Spec224ClosureError("DERIVED_ID_INVALID");
      }
      if (required.parentRequirementRef.startsWith("invariant:")) {
        ref(required.parentRequirementRef, "DERIVED_PARENT_INVALID");
      } else if (!requirementSet.has(required.parentRequirementRef)) {
        throw new Spec224ClosureError("DERIVED_PARENT_UNKNOWN");
      }
      if (!["low", "medium", "high", "critical"].includes(required.severity))
        throw new Spec224ClosureError("DERIVED_SEVERITY_INVALID");
      if (!["PROPOSED", "ACCEPTED", "REJECTED"].includes(required.status)) {
        throw new Spec224ClosureError("DERIVED_STATUS_INVALID");
      }
      const findingTaxonomy = new Set([
        "ORIGINAL_SPEC_GAP",
        "IMPLEMENTATION_DEFECT",
        "INTEGRATION_GAP",
        "PRODUCTION_HARDENING_REQUIRED",
        "SECURITY_PRIVACY_RELIABILITY_GAP",
        "OPERABILITY_GAP",
        "PERFORMANCE_SCALE_GAP",
        "MAINTAINABILITY_EVOLVABILITY_GAP",
        "UI_UX_FUNCTIONAL_GAP",
        "DEVICE_EXPERIENCE_GAP",
        "UNREQUESTED_CHANGE",
        "OPTIONAL_HARDENING",
        "OPTIONAL_IMPROVEMENT",
        "NEW_CAPABILITY",
        "DUPLICATE_FINDING",
        "FALSE_POSITIVE",
      ]);
      if (!findingTaxonomy.has(required.classification))
        throw new Spec224ClosureError("DERIVED_CLASSIFICATION_INVALID");
      if (required.status !== "PROPOSED" && !required.decisionRef)
        throw new Spec224ClosureError("DERIVED_DECISION_REQUIRED");
      const expectedId = deriveDerivedRequirementId(input.baseline, required);
      if (derived.id !== expectedId)
        throw new Spec224ClosureError("DERIVED_ID_SOURCE_MISMATCH");
      const assigned = workPackages
        .filter(workPackage =>
          workPackage.derivedRequirementIds.includes(derived.id)
        )
        .map(workPackage => workPackage.id)
        .sort();
      if (
        derived.workPackageIds.length > 0 &&
        JSON.stringify([...derived.workPackageIds].sort()) !==
          JSON.stringify(assigned)
      ) {
        throw new Spec224ClosureError("DERIVED_WORK_PACKAGE_MISMATCH");
      }
      return { ...required, id: derived.id, workPackageIds: assigned };
    })
    .sort((left, right) => left.id.localeCompare(right.id));
  const derivedRequirementIds = new Set(
    derivedRequirements.map(item => item.id)
  );
  for (const workPackage of workPackages) {
    if (
      workPackage.derivedRequirementIds.some(
        derivedId => !derivedRequirementIds.has(derivedId)
      )
    ) {
      throw new Spec224ClosureError("WORK_PACKAGE_DERIVED_REQUIREMENT_UNKNOWN");
    }
  }
  for (const section of planSections) {
    if (
      section.derivedRequirementIds.some(
        derivedId => !derivedRequirementIds.has(derivedId)
      )
    ) {
      throw new Spec224ClosureError("PLAN_DERIVED_REQUIREMENT_UNKNOWN");
    }
  }
  for (const derived of derivedRequirements) {
    const packageOwners = workPackages.filter(item =>
      item.derivedRequirementIds.includes(derived.id)
    );
    const sectionOwners = planSections.filter(item =>
      item.derivedRequirementIds.includes(derived.id)
    );
    if (
      derived.status === "ACCEPTED" &&
      (packageOwners.length !== 1 || sectionOwners.length < 1)
    ) {
      throw new Spec224ClosureError("DERIVED_REQUIREMENT_UNMAPPED");
    }
    if (
      packageOwners.some(
        item =>
          !sectionOwners.some(section => section.id === item.planSectionId)
      )
    ) {
      throw new Spec224ClosureError("DERIVED_REQUIREMENT_SECTION_MISMATCH");
    }
  }
  const normalizedInventory = normalizeSourceInventory(
    input.sourceInventory ?? null,
    {
      baseline: input.baseline,
      requirementIds: requirementSet,
      derivedRequirements,
    }
  );
  const sourceChanges = normalizedInventory?.changes ?? [];
  for (const change of sourceChanges) {
    if (
      change.requirementIds.some(
        requirementId => !requirementSet.has(requirementId)
      ) ||
      change.derivedRequirementIds.some(
        derivedId => !derivedRequirementIds.has(derivedId)
      )
    ) {
      throw new Spec224ClosureError("SOURCE_CHANGE_PARENT_UNKNOWN");
    }
  }
  const sourceChangesWithScope = sourceChanges.map(change => {
    const parents = [
      ...change.requirementIds.flatMap(
        requirementId => owners.get(requirementId) ?? []
      ),
      ...change.derivedRequirementIds.flatMap(derivedId =>
        workPackages
          .filter(item => item.derivedRequirementIds.includes(derivedId))
          .map(item => item.id)
      ),
    ];
    const scoped =
      parents.length > 0 &&
      parents.every(packageId => {
        const workPackage = workPackages.find(item => item.id === packageId)!;
        return workPackage.allowedWriteSet.some(
          pattern =>
            writePathsOverlap(pattern, change.path) &&
            (pattern.includes("*") || pattern === change.path)
        );
      });
    return {
      ...change,
      classification:
        change.classification === "UNREQUESTED_CHANGE" || !scoped
          ? ("UNREQUESTED_CHANGE" as const)
          : ("JUSTIFIED_CHANGE" as const),
    };
  });
  const sourceInventory = normalizedInventory
    ? { ...normalizedInventory, changes: sourceChangesWithScope }
    : null;
  for (const requirementId of requirementIds) {
    if (!planSectionByRequirement.has(requirementId))
      throw new Spec224ClosureError("REQUIREMENT_UNMAPPED");
    const requirementOwners = owners.get(requirementId) ?? [];
    if (requirementOwners.length === 0)
      throw new Spec224ClosureError("REQUIREMENT_UNMAPPED");
    if (requirementOwners.length > 1)
      throw new Spec224ClosureError("REQUIREMENT_MULTIPLE_OWNER");
  }
  const requirements = requirementInputs.map(requirement => ({
    id: requirement.id,
    sourceRef: requirement.sourceRef,
    text: requirement.text,
    state: "PLANNED" as const,
    planSectionIds: [...planSectionByRequirement.get(requirement.id)!].sort(),
    workPackageIds: [...owners.get(requirement.id)!].sort(),
    evidenceRefs: [],
    evidence: [],
  }));
  const reverse: Record<string, string[]> = {};
  for (const requirement of requirements) {
    const workPackageId = requirement.workPackageIds[0];
    reverse[workPackageId] = [
      ...(reverse[workPackageId] ?? []),
      requirement.id,
    ];
  }
  for (const values of Object.values(reverse)) values.sort();
  for (const workPackage of workPackages) {
    for (const derivedId of workPackage.derivedRequirementIds) {
      reverse[workPackage.id] = [...(reverse[workPackage.id] ?? []), derivedId];
    }
  }
  for (const values of Object.values(reverse)) values.sort();
  return {
    contractVersion: "spec-224-closure-v2",
    baseline: structuredClone(input.baseline),
    requirements,
    planSections,
    workPackages,
    derivedRequirements,
    sourceChanges: sourceChangesWithScope,
    reverse,
    blockers: [],
    sourceInventory,
    admissionGaps: [
      ...planSections.flatMap(section => section.admissionGaps),
      ...workPackages.flatMap(workPackage => workPackage.admissionGaps),
      ...derivedRequirements
        .filter(item => item.status === "PROPOSED")
        .map(item => `DERIVED_REQUIREMENT_PENDING:${item.id}`),
      ...sourceChangesWithScope
        .filter(change => change.classification === "UNREQUESTED_CHANGE")
        .map(change => `UNREQUESTED_CHANGE:${change.path}`),
      ...(sourceInventory ? [] : ["SOURCE_INVENTORY_MISSING"]),
    ],
  };
}

/** Validate persisted or caller-supplied graphs without trusting derived fields. */
export function validateRequirementClosureGraph(
  graph: RequirementClosureGraph
): RequirementClosureGraph {
  if (!graph || graph.contractVersion !== "spec-224-closure-v2") {
    throw new Spec224ClosureError("CLOSURE_GRAPH_INVALID");
  }
  const normalized = compileRequirementClosureGraph({
    baseline: graph.baseline,
    requirements: graph.requirements.map(requirement => ({
      id: requirement.id,
      sourceRef: requirement.sourceRef,
      text: requirement.text,
    })),
    planSections: graph.planSections,
    workPackages: graph.workPackages,
    derivedRequirements: graph.derivedRequirements,
    sourceInventory: graph.sourceInventory,
  });
  if (
    graph.planSections.some(
      (section, index) =>
        JSON.stringify([...section.workPackageIds].sort()) !==
        JSON.stringify(
          [...normalized.planSections[index]!.workPackageIds].sort()
        )
    )
  )
    throw new Spec224ClosureError("PLAN_SECTION_WORK_PACKAGE_MISMATCH");
  if (
    JSON.stringify(canonicalize(graph.sourceChanges)) !==
    JSON.stringify(canonicalize(normalized.sourceChanges))
  ) {
    throw new Spec224ClosureError("SOURCE_CHANGE_PROJECTION_MISMATCH");
  }
  const allowedStates = new Set<RequirementState>([
    "UNPARSED",
    "MAPPED",
    "PLANNED",
    "IMPLEMENTING",
    "IMPLEMENTED_UNVERIFIED",
    "VERIFIED_PASS",
    "VERIFIED_FAIL",
    "WAIVED_BY_AUTHORIZED_DECISION",
    "NOT_APPLICABLE_WITH_EVIDENCE",
  ]);
  const normalizedRequirements = new Map(
    normalized.requirements.map(requirement => [requirement.id, requirement])
  );
  const normalizedRequirementSet = new Set(normalizedRequirements.keys());
  const normalizedWorkPackages = new Map(
    normalized.workPackages.map(workPackage => [workPackage.id, workPackage])
  );
  const requirements = graph.requirements.map(requirement => {
    const canonical = normalizedRequirements.get(requirement.id);
    if (!canonical || !allowedStates.has(requirement.state)) {
      throw new Spec224ClosureError("CLOSURE_REQUIREMENT_INVALID");
    }
    const evidence = requirement.evidence
      .map(binding => {
        const evidenceRef = ref(
          binding.evidenceRef,
          "REQUIREMENT_EVIDENCE_INVALID"
        );
        const workPackageId = id(
          binding.workPackageId,
          "REQUIREMENT_EVIDENCE_PACKAGE_INVALID"
        );
        if (
          !canonical.workPackageIds.includes(workPackageId) ||
          binding.requirementId !== requirement.id
        )
          throw new Spec224ClosureError("REQUIREMENT_EVIDENCE_BINDING_INVALID");
        const verifiedAt = timestamp(
          binding.verifiedAt,
          "REQUIREMENT_EVIDENCE_TIMESTAMP_INVALID"
        );
        if (
          !HASH.test(binding.sourceArtifactDigest) ||
          !HASH.test(binding.implementationDigest)
        )
          throw new Spec224ClosureError("REQUIREMENT_EVIDENCE_DIGEST_INVALID");
        const invalidatedAt =
          binding.invalidatedAt === null
            ? null
            : timestamp(
                binding.invalidatedAt,
                "REQUIREMENT_EVIDENCE_INVALIDATION_INVALID"
              );
        const invalidationReason =
          binding.invalidationReason === null
            ? null
            : text(
                binding.invalidationReason,
                "REQUIREMENT_EVIDENCE_INVALIDATION_INVALID",
                500
              );
        const staleBaseline =
          binding.baselineId !== graph.baseline.baselineId ||
          binding.sourceArtifactDigest !== graph.baseline.sourceArtifactDigest;
        const staleImplementation =
          !normalized.sourceInventory ||
          binding.implementationDigest !==
            normalized.sourceInventory.candidateManifestDigest;
        if ((staleBaseline || staleImplementation) && invalidatedAt === null) {
          throw new Spec224ClosureError(
            "REQUIREMENT_EVIDENCE_STALE_NOT_INVALIDATED"
          );
        }
        if ((invalidatedAt === null) !== (invalidationReason === null))
          throw new Spec224ClosureError(
            "REQUIREMENT_EVIDENCE_INVALIDATION_INVALID"
          );
        return {
          evidenceRef,
          baselineId: id(
            binding.baselineId,
            "REQUIREMENT_EVIDENCE_BASELINE_INVALID"
          ),
          sourceArtifactDigest: binding.sourceArtifactDigest,
          requirementId: binding.requirementId,
          workPackageId,
          implementationDigest: binding.implementationDigest,
          verificationMethod: text(
            binding.verificationMethod,
            "REQUIREMENT_EVIDENCE_METHOD_INVALID",
            160
          ),
          verifierRef: ref(
            binding.verifierRef,
            "REQUIREMENT_EVIDENCE_VERIFIER_INVALID"
          ),
          verifiedAt,
          invalidatedAt,
          invalidationReason,
        };
      })
      .sort((left, right) => left.evidenceRef.localeCompare(right.evidenceRef));
    if (
      new Set(evidence.map(item => item.evidenceRef)).size !== evidence.length
    )
      throw new Spec224ClosureError("REQUIREMENT_EVIDENCE_DUPLICATE");
    const evidenceRefs = evidence
      .filter(item => item.invalidatedAt === null)
      .map(item => item.evidenceRef);
    const suppliedEvidenceRefs = stringList(
      requirement.evidenceRefs,
      "REQUIREMENT_EVIDENCE_INVALID"
    );
    if (
      JSON.stringify(suppliedEvidenceRefs) !==
      JSON.stringify([...evidenceRefs].sort())
    ) {
      throw new Spec224ClosureError("REQUIREMENT_EVIDENCE_PROJECTION_MISMATCH");
    }
    return {
      ...canonical,
      state: requirement.state,
      evidenceRefs: [...evidenceRefs].sort(),
      evidence,
    };
  });
  if (requirements.length !== normalized.requirements.length) {
    throw new Spec224ClosureError("CLOSURE_REQUIREMENTS_MISMATCH");
  }
  const workPackages = graph.workPackages.map(workPackage => {
    const canonical = normalizedWorkPackages.get(workPackage.id);
    if (!canonical) throw new Spec224ClosureError("WORK_PACKAGE_INVALID");
    const evidence = workPackage.evidence
      .map(binding => {
        const evidenceRef = ref(
          binding.evidenceRef,
          "WORK_PACKAGE_EVIDENCE_INVALID"
        );
        if (
          binding.workPackageId !== workPackage.id ||
          !HASH.test(binding.sourceArtifactDigest) ||
          !HASH.test(binding.implementationDigest)
        ) {
          throw new Spec224ClosureError(
            "WORK_PACKAGE_EVIDENCE_BINDING_INVALID"
          );
        }
        const verifiedAt = timestamp(
          binding.verifiedAt,
          "WORK_PACKAGE_EVIDENCE_TIMESTAMP_INVALID"
        );
        const invalidatedAt =
          binding.invalidatedAt === null
            ? null
            : timestamp(
                binding.invalidatedAt,
                "WORK_PACKAGE_EVIDENCE_INVALIDATION_INVALID"
              );
        const invalidationReason =
          binding.invalidationReason === null
            ? null
            : text(
                binding.invalidationReason,
                "WORK_PACKAGE_EVIDENCE_INVALIDATION_INVALID",
                500
              );
        const stale =
          binding.baselineId !== graph.baseline.baselineId ||
          binding.sourceArtifactDigest !==
            graph.baseline.sourceArtifactDigest ||
          !normalized.sourceInventory ||
          binding.implementationDigest !==
            normalized.sourceInventory.candidateManifestDigest;
        if (stale && invalidatedAt === null)
          throw new Spec224ClosureError(
            "WORK_PACKAGE_EVIDENCE_STALE_NOT_INVALIDATED"
          );
        if ((invalidatedAt === null) !== (invalidationReason === null))
          throw new Spec224ClosureError(
            "WORK_PACKAGE_EVIDENCE_INVALIDATION_INVALID"
          );
        return {
          evidenceRef,
          baselineId: id(
            binding.baselineId,
            "WORK_PACKAGE_EVIDENCE_BASELINE_INVALID"
          ),
          sourceArtifactDigest: binding.sourceArtifactDigest,
          workPackageId: workPackage.id,
          implementationDigest: binding.implementationDigest,
          verifierRef: ref(
            binding.verifierRef,
            "WORK_PACKAGE_EVIDENCE_VERIFIER_INVALID"
          ),
          verificationMethod: text(
            binding.verificationMethod,
            "WORK_PACKAGE_EVIDENCE_METHOD_INVALID",
            160
          ),
          verifiedAt,
          invalidatedAt,
          invalidationReason,
        };
      })
      .sort((left, right) => left.evidenceRef.localeCompare(right.evidenceRef));
    const activeEvidenceRefs = evidence
      .filter(item => item.invalidatedAt === null)
      .map(item => item.evidenceRef)
      .sort();
    const suppliedEvidenceRefs = stringList(
      workPackage.evidenceRefs,
      "WORK_PACKAGE_EVIDENCE_INVALID"
    );
    if (
      JSON.stringify(suppliedEvidenceRefs) !==
      JSON.stringify(activeEvidenceRefs)
    )
      throw new Spec224ClosureError(
        "WORK_PACKAGE_EVIDENCE_PROJECTION_MISMATCH"
      );
    return { ...canonical, evidence, evidenceRefs: activeEvidenceRefs };
  });
  const blockers = graph.blockers
    .map(validateBlockerLedgerEntry)
    .sort((a, b) => a.blockerId.localeCompare(b.blockerId));
  if (
    blockers.some(blocker =>
      blocker.requirementRefs.some(
        refValue => !normalizedRequirementSet.has(refValue)
      )
    )
  ) {
    throw new Spec224ClosureError("BLOCKER_REQUIREMENT_UNKNOWN");
  }
  if (
    new Set(blockers.map(blocker => blocker.blockerId)).size !== blockers.length
  ) {
    throw new Spec224ClosureError("BLOCKER_DUPLICATE");
  }
  const reverse = Object.fromEntries(
    Object.entries(normalized.reverse).sort(([left], [right]) =>
      left.localeCompare(right)
    )
  );
  if (
    JSON.stringify(canonicalize(graph.reverse)) !==
    JSON.stringify(canonicalize(reverse))
  ) {
    throw new Spec224ClosureError("CLOSURE_GRAPH_INVALID");
  }
  const admissionGaps = [
    ...normalized.admissionGaps,
    ...requirements.flatMap(requirement =>
      TERMINAL_REQUIREMENT_STATES.has(requirement.state) &&
      requirement.evidenceRefs.length === 0
        ? [`REQUIREMENT_EVIDENCE_STALE:${requirement.id}`]
        : []
    ),
  ];
  const deferredTestObligations =
    graph.deferredTestObligations === undefined
      ? undefined
      : validateDeferredTestObligations(
          graph.deferredTestObligations,
          graph.baseline,
          normalizedRequirements,
          normalizedWorkPackages
        );
  return {
    ...normalized,
    requirements,
    workPackages,
    blockers,
    admissionGaps,
    ...(deferredTestObligations === undefined
      ? {}
      : { deferredTestObligations }),
  };
}

function validateDeferredTestObligations(
  input: DeferredTestObligation[],
  baseline: RequirementClosureGraph["baseline"],
  requirements: Map<string, RequirementRecord>,
  workPackages: Map<string, WorkPackageRecord>
): DeferredTestObligation[] {
  const categories = new Set<DeferredTestCategory>([
    "UNIT",
    "INTEGRATION",
    "E2E",
    "PERFORMANCE",
    "SECURITY",
    "MIGRATION",
    "MANUAL",
    "OTHER",
  ]);
  if (!Array.isArray(input) || input.length > 5000) {
    throw new Spec224ClosureError("DEFERRED_TEST_OBLIGATIONS_INVALID");
  }
  const obligations = input.map(obligation => {
    const obligationId = id(
      obligation.obligationId,
      "DEFERRED_TEST_OBLIGATION_ID_INVALID"
    );
    const requirementId = id(
      obligation.requirementId,
      "DEFERRED_TEST_REQUIREMENT_INVALID"
    );
    const workPackageId = id(
      obligation.workPackageId,
      "DEFERRED_TEST_WORK_PACKAGE_INVALID"
    );
    const invalidatedAt =
      obligation.invalidatedAt === null
        ? null
        : timestamp(
            obligation.invalidatedAt,
            "DEFERRED_TEST_INVALIDATION_INVALID"
          );
    const invalidationReason =
      obligation.invalidationReason === null
        ? null
        : text(
            obligation.invalidationReason,
            "DEFERRED_TEST_INVALIDATION_INVALID",
            1000
          );
    if ((invalidatedAt === null) !== (invalidationReason === null)) {
      throw new Spec224ClosureError("DEFERRED_TEST_INVALIDATION_INVALID");
    }
    const requirement = requirements.get(requirementId);
    const workPackage = workPackages.get(workPackageId);
    if (
      invalidatedAt === null &&
      (!requirement ||
        !workPackage ||
        !requirement.workPackageIds.includes(workPackageId) ||
        !workPackage.requirementIds.includes(requirementId))
    ) {
      throw new Spec224ClosureError(
        "DEFERRED_TEST_REQUIREMENT_PACKAGE_MISMATCH"
      );
    }
    if (
      !ID.test(obligation.specId) ||
      !ID.test(obligation.specRevision) ||
      !HASH.test(obligation.sourceArtifactDigest) ||
      !HASH.test(obligation.specDigest) ||
      (invalidatedAt === null &&
        (obligation.specId !== baseline.specId ||
          obligation.specRevision !== baseline.revision ||
          obligation.sourceArtifactDigest !== baseline.sourceArtifactDigest ||
          obligation.specDigest !== baseline.digest))
    ) {
      throw new Spec224ClosureError("DEFERRED_TEST_BASELINE_MISMATCH");
    }
    if (
      !Number.isSafeInteger(obligation.version) ||
      obligation.version < 1 ||
      !categories.has(obligation.category)
    ) {
      throw new Spec224ClosureError("DEFERRED_TEST_OBLIGATION_INVALID");
    }
    return {
      obligationId,
      version: obligation.version,
      runId: id(obligation.runId, "DEFERRED_TEST_RUN_INVALID"),
      requirementId,
      workPackageId,
      specId: obligation.specId,
      specRevision: obligation.specRevision,
      sourceArtifactDigest: obligation.sourceArtifactDigest,
      specDigest: obligation.specDigest,
      category: obligation.category,
      testTarget: text(
        obligation.testTarget,
        "DEFERRED_TEST_TARGET_INVALID",
        512
      ),
      reason: text(obligation.reason, "DEFERRED_TEST_REASON_INVALID", 1000),
      requiredEnvironment: text(
        obligation.requiredEnvironment,
        "DEFERRED_TEST_ENVIRONMENT_INVALID",
        500
      ),
      createdAt: timestamp(
        obligation.createdAt,
        "DEFERRED_TEST_CREATED_AT_INVALID"
      ),
      invalidatedAt,
      invalidationReason,
    };
  });
  const ids = new Set<string>();
  const byObligation = new Map<string, DeferredTestObligation[]>();
  for (const obligation of obligations) {
    const versionKey = `${obligation.obligationId}:${obligation.version}`;
    if (ids.has(versionKey)) {
      throw new Spec224ClosureError("DEFERRED_TEST_VERSION_DUPLICATE");
    }
    ids.add(versionKey);
    byObligation.set(obligation.obligationId, [
      ...(byObligation.get(obligation.obligationId) ?? []),
      obligation,
    ]);
  }
  for (const versions of byObligation.values()) {
    versions.sort((left, right) => left.version - right.version);
    if (
      versions.some((obligation, index) => obligation.version !== index + 1) ||
      versions
        .slice(0, -1)
        .some(obligation => obligation.invalidatedAt === null)
    ) {
      throw new Spec224ClosureError("DEFERRED_TEST_VERSION_HISTORY_INVALID");
    }
  }
  return obligations.sort(
    (left, right) =>
      left.obligationId.localeCompare(right.obligationId) ||
      left.version - right.version
  );
}

function validateBlockerLedgerEntry(
  blocker: BlockerLedgerEntry
): BlockerLedgerEntry {
  if (
    !blocker ||
    !["OPEN", "INVESTIGATING", "REPAIR", "VERIFY", "CLOSED"].includes(
      blocker.status
    )
  ) {
    throw new Spec224ClosureError("BLOCKER_INVALID");
  }
  const status = blocker.status;
  const openedAt = text(blocker.openedAt, "BLOCKER_OPENED_AT_INVALID", 64);
  const openedDate = new Date(openedAt);
  if (
    !Number.isFinite(openedDate.getTime()) ||
    openedDate.toISOString() !== openedAt
  ) {
    throw new Spec224ClosureError("BLOCKER_OPENED_AT_INVALID");
  }
  if (!Number.isSafeInteger(blocker.reopenCount) || blocker.reopenCount < 0) {
    throw new Spec224ClosureError("BLOCKER_REOPEN_COUNT_INVALID");
  }
  if (!["low", "medium", "high", "critical"].includes(blocker.severity)) {
    throw new Spec224ClosureError("BLOCKER_SEVERITY_INVALID");
  }
  const verificationRefs = blocker.verificationRefs.map(value =>
    ref(value, "BLOCKER_VERIFICATION_INVALID")
  );
  const closedAt =
    blocker.closedAt === null
      ? null
      : text(blocker.closedAt, "BLOCKER_CLOSED_AT_INVALID", 64);
  if (closedAt) {
    const closedDate = new Date(closedAt);
    if (
      !Number.isFinite(closedDate.getTime()) ||
      closedDate.toISOString() !== closedAt
    ) {
      throw new Spec224ClosureError("BLOCKER_CLOSED_AT_INVALID");
    }
  }
  if (
    status === "CLOSED" &&
    (!closedAt || !blocker.resolution || !verificationRefs.length)
  ) {
    throw new Spec224ClosureError("BLOCKER_CLOSURE_EVIDENCE_REQUIRED");
  }
  if (status !== "CLOSED" && closedAt !== null) {
    throw new Spec224ClosureError("BLOCKER_CLOSED_AT_INVALID");
  }
  return {
    blockerId: id(blocker.blockerId, "BLOCKER_ID_INVALID"),
    runId: id(blocker.runId, "RUN_ID_INVALID"),
    requirementRefs: unique(
      blocker.requirementRefs,
      "BLOCKER_REQUIREMENTS_INVALID"
    ).sort(),
    classification: text(
      blocker.classification,
      "BLOCKER_CLASSIFICATION_INVALID",
      100
    ),
    severity: blocker.severity,
    openedBy: text(blocker.openedBy, "BLOCKER_OPENED_BY_INVALID", 160),
    openedAt,
    currentOwner: text(blocker.currentOwner, "BLOCKER_OWNER_INVALID", 160),
    subrunRef:
      blocker.subrunRef === null
        ? null
        : ref(blocker.subrunRef, "BLOCKER_SUBRUN_INVALID"),
    status,
    resolution:
      blocker.resolution === null
        ? null
        : text(blocker.resolution, "BLOCKER_RESOLUTION_INVALID", 1000),
    verificationRefs: [...verificationRefs].sort(),
    reopenCount: blocker.reopenCount,
    closedAt,
  };
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, child]) => [key, canonicalize(child)])
    );
  }
  return value;
}

export function buildBlockerLedgerEntry(input: {
  blockerId: string;
  runId: string;
  requirementRefs: string[];
  classification: string;
  severity: BlockerLedgerEntry["severity"];
  openedBy?: string;
  openedAt?: string;
  currentOwner?: string;
  subrunRef?: string | null;
}): BlockerLedgerEntry {
  if (!["low", "medium", "high", "critical"].includes(input.severity)) {
    throw new Spec224ClosureError("BLOCKER_SEVERITY_INVALID");
  }
  return {
    blockerId: id(input.blockerId, "BLOCKER_ID_INVALID"),
    runId: id(input.runId, "RUN_ID_INVALID"),
    requirementRefs: unique(
      input.requirementRefs,
      "BLOCKER_REQUIREMENTS_INVALID"
    ),
    classification: text(
      input.classification,
      "BLOCKER_CLASSIFICATION_INVALID",
      100
    ),
    severity: input.severity,
    openedBy: text(
      input.openedBy ?? "system:spec224",
      "BLOCKER_OPENED_BY_INVALID",
      160
    ),
    openedAt: input.openedAt ?? new Date().toISOString(),
    currentOwner: text(
      input.currentOwner ?? "unassigned",
      "BLOCKER_OWNER_INVALID",
      160
    ),
    subrunRef: input.subrunRef ?? null,
    status: "OPEN",
    resolution: null,
    verificationRefs: [],
    reopenCount: 0,
    closedAt: null,
  };
}

export function closeBlocker(
  blocker: BlockerLedgerEntry,
  verificationRefs: string[]
): BlockerLedgerEntry {
  if (blocker.status === "CLOSED") return blocker;
  const refs = verificationRefs.map(value =>
    ref(value, "BLOCKER_VERIFICATION_INVALID")
  );
  if (!refs.length)
    throw new Spec224ClosureError("BLOCKER_VERIFICATION_REQUIRED");
  return {
    ...blocker,
    status: "CLOSED",
    resolution: blocker.resolution ?? "Verified closure evidence recorded",
    verificationRefs: refs,
    closedAt: new Date().toISOString(),
  };
}

export function assertRequirementClosureEvidenceBoundToRun(
  graph: RequirementClosureGraph,
  run: {
    repositoryRef: string;
    baseRevision: string;
    evidenceRefs: string[];
  }
): true {
  const validated = validateRequirementClosureGraph(graph);
  const currentEvidence = new Set(run.evidenceRefs);
  const inventory = validated.sourceInventory;
  if (inventory) {
    if (
      inventory.baselineRevision !== run.baseRevision ||
      inventory.coverage.repositoryRef !== run.repositoryRef ||
      inventory.coverage.baselineRevision !== run.baseRevision ||
      inventory.coverage.candidateRevision !== inventory.candidateRevision ||
      !currentEvidence.has(inventory.coverage.attestationEvidenceRef) ||
      !currentEvidence.has(inventory.manifestEvidenceRef)
    ) {
      throw new Spec224ClosureError("SOURCE_INVENTORY_UNBOUND");
    }
    for (const change of inventory.changes) {
      if (!currentEvidence.has(change.evidenceRef))
        throw new Spec224ClosureError("SOURCE_CHANGE_EVIDENCE_UNBOUND");
    }
  }
  for (const requirement of validated.requirements) {
    for (const evidence of requirement.evidence) {
      if (evidence.invalidatedAt !== null) continue;
      if (
        !currentEvidence.has(evidence.evidenceRef) ||
        !inventory ||
        evidence.baselineId !== validated.baseline.baselineId ||
        evidence.sourceArtifactDigest !==
          validated.baseline.sourceArtifactDigest ||
        evidence.implementationDigest !== inventory.candidateManifestDigest
      ) {
        throw new Spec224ClosureError("REQUIREMENT_EVIDENCE_UNBOUND");
      }
    }
    if (
      [
        "VERIFIED_PASS",
        "WAIVED_BY_AUTHORIZED_DECISION",
        "NOT_APPLICABLE_WITH_EVIDENCE",
      ].includes(requirement.state) &&
      (requirement.evidenceRefs.length === 0 ||
        requirement.evidenceRefs.some(
          evidenceRef => !currentEvidence.has(evidenceRef)
        ))
    ) {
      throw new Spec224ClosureError("REQUIREMENT_EVIDENCE_UNBOUND");
    }
  }
  for (const workPackage of validated.workPackages) {
    for (const evidence of workPackage.evidence) {
      if (evidence.invalidatedAt !== null) continue;
      if (
        !currentEvidence.has(evidence.evidenceRef) ||
        !inventory ||
        evidence.baselineId !== validated.baseline.baselineId ||
        evidence.sourceArtifactDigest !==
          validated.baseline.sourceArtifactDigest ||
        evidence.implementationDigest !== inventory.candidateManifestDigest
      ) {
        throw new Spec224ClosureError("WORK_PACKAGE_EVIDENCE_UNBOUND");
      }
    }
    if (
      workPackage.evidenceRefs.some(
        evidenceRef => !currentEvidence.has(evidenceRef)
      )
    ) {
      throw new Spec224ClosureError("WORK_PACKAGE_EVIDENCE_UNBOUND");
    }
  }
  for (const derived of validated.derivedRequirements) {
    if (
      derived.status !== "PROPOSED" &&
      (!derived.decisionRef || !currentEvidence.has(derived.decisionRef))
    ) {
      throw new Spec224ClosureError("DERIVED_DECISION_UNBOUND");
    }
  }
  for (const blocker of validated.blockers) {
    if (
      blocker.status === "CLOSED" &&
      blocker.verificationRefs.some(
        evidenceRef => !currentEvidence.has(evidenceRef)
      )
    ) {
      throw new Spec224ClosureError("BLOCKER_VERIFICATION_UNBOUND");
    }
  }
  return true;
}

export function assertFinalVerifyReady(graph: RequirementClosureGraph): true {
  const validated = validateRequirementClosureGraph(graph);
  const incomplete = validated.requirements.find(
    requirement =>
      !TERMINAL_REQUIREMENT_STATES.has(requirement.state) ||
      requirement.evidenceRefs.length === 0 ||
      requirement.evidence.length === 0
  );
  if (incomplete) throw new Spec224ClosureError("REQUIREMENT_NOT_TERMINAL");
  if (
    validated.workPackages.some(
      workPackage =>
        workPackage.status !== "VERIFIED" && workPackage.status !== "COMPLETE"
    )
  ) {
    throw new Spec224ClosureError("WORK_PACKAGE_NOT_TERMINAL");
  }
  for (const derived of validated.derivedRequirements) {
    if (derived.status !== "ACCEPTED") continue;
    const packages = validated.workPackages.filter(workPackage =>
      derived.workPackageIds.includes(workPackage.id)
    );
    const satisfied = derived.requiredVerification.every(obligation =>
      packages.some(workPackage =>
        workPackage.evidence.some(
          evidence =>
            evidence.invalidatedAt === null &&
            evidence.implementationDigest ===
              validated.sourceInventory?.candidateManifestDigest &&
            evidence.verificationMethod === obligation
        )
      )
    );
    if (!satisfied)
      throw new Spec224ClosureError("DERIVED_REQUIREMENT_EVIDENCE_INCOMPLETE");
  }
  if (
    validated.planSections.some(
      section => section.status !== "VERIFIED" && section.status !== "COMPLETE"
    )
  ) {
    throw new Spec224ClosureError("PLAN_SECTION_NOT_TERMINAL");
  }
  if (
    validated.sourceChanges.some(
      change => change.classification === "UNREQUESTED_CHANGE"
    )
  ) {
    throw new Spec224ClosureError("UNREQUESTED_CHANGE");
  }
  if (validated.blockers.some(blocker => blocker.status !== "CLOSED")) {
    throw new Spec224ClosureError("BLOCKER_OPEN");
  }
  if (validated.admissionGaps.length > 0) {
    throw new Spec224ClosureError("CLOSURE_INCOMPLETE");
  }
  return true;
}
