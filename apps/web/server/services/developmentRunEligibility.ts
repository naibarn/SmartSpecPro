import type { DevelopmentRun } from "./spec224DevelopmentRunContracts";
import { getDevelopmentLifecyclePredicate } from "./developmentLifecyclePredicateRegistry";
import type {
  DevelopmentDependencyContract,
  DevelopmentDependencyEvidence,
  DevelopmentWorkUnit,
} from "./developmentLifecycleContracts";

export const DEVELOPMENT_RUN_ELIGIBILITY_SCHEMA =
  "development-run-eligibility.v1" as const;

export const DEVELOPMENT_RUN_ELIGIBILITY_STATES = [
  "READY",
  "WAITING_DEPENDENCY",
  "WAITING_AUTHORITY",
  "STALE_EVIDENCE",
  "OWNER_REQUIRED",
  "OWNERSHIP_CONFLICT",
  "ADAPTER_UNAVAILABLE",
  "INELIGIBLE",
] as const;

export type DevelopmentRunEligibilityState =
  (typeof DEVELOPMENT_RUN_ELIGIBILITY_STATES)[number];

export type VerifiedDevelopmentOwnershipEvidence = {
  schemaVersion: "development-lifecycle-ownership.v1";
  tenantId: string;
  developmentRunId: string;
  workUnitId: string;
  ownerId: string;
  resolverId: string;
  evidenceRef: string;
  sourceRevision: string;
  verifiedAt: string;
  validUntil: string;
  conflictRefs: string[];
};

export type VerifiedDevelopmentEligibilityEvidence = {
  dependencyId: string;
  tenantId: string;
  developmentRunId: string;
  workUnitId: string;
  sourceRevision: string;
  verifiedAt: string;
  validUntil: string;
  evidence: DevelopmentDependencyEvidence;
};

export type DevelopmentRunEligibilityInput = {
  /** Must come from the authenticated/canonical request context. */
  tenantId: string;
  /** Durable identity requested by the caller, checked against the loaded run. */
  developmentRunId: string | null;
  /** Canonically loaded SPEC-224 DevelopmentRun; not a handoff nomination. */
  run: Pick<DevelopmentRun, "runId" | "tenantId" | "state" | "workUnit"> | null;
  /** Current source revision from the authoritative workunit projection. */
  sourceRevision: string | null;
  /** The caller supplies a fixed clock so this contract remains deterministic. */
  evaluatedAt: string;
  /** Produced by the domain's authoritative ownership resolver. */
  ownership: VerifiedDevelopmentOwnershipEvidence | null;
  /** Verified dependency receipts returned by registered predicate adapters. */
  dependencyEvidence: readonly VerifiedDevelopmentEligibilityEvidence[];
};

export type DevelopmentRunEligibilityEvidence = {
  source: string;
  reference: string;
  observedAt: string;
  verifiedAt: string;
  revision?: string;
};

export type DevelopmentRunEligibilityResult = {
  schemaVersion: typeof DEVELOPMENT_RUN_ELIGIBILITY_SCHEMA;
  state: DevelopmentRunEligibilityState;
  /** This evaluator reports eligibility only; it never grants execution authority. */
  advisory: true;
  workUnit: {
    domain: string;
    durableKind: "SPEC224_DEVELOPMENT_RUN";
    durableId: string;
    tenantId: string;
  } | null;
  sourceRevision: string | null;
  reasonCodes: string[];
  evidence: DevelopmentRunEligibilityEvidence[];
  ownership: {
    ownerId: string;
    adapterId: string;
    verifiedAt: string;
    conflictRefs: string[];
  } | null;
};

const ADMISSIBLE_RUN_STATES = new Set<DevelopmentRun["state"]>([
  "DISCOVERY",
  "PLANNING",
  "PLAN_VERIFY",
  "IMPLEMENT",
  "BUILD",
  "TEST",
  "DEBUG_REPAIR",
  "REVIEW",
  "FIX_REVIEW_FINDINGS",
  "VERIFY",
  "RECOVERY",
  "REGRESSION",
  "FINAL_VERIFY",
]);

function hasText(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function time(value: unknown): number | null {
  if (typeof value !== "string") return null;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function evidenceShapeIsValid(
  receipt: VerifiedDevelopmentEligibilityEvidence,
  dependency: DevelopmentDependencyContract,
  input: DevelopmentRunEligibilityInput,
  workUnit: DevelopmentWorkUnit
): "VALID" | "STALE" | "BINDING_MISMATCH" {
  const { evidence } = receipt;
  if (
    receipt.tenantId !== input.tenantId ||
    receipt.developmentRunId !== input.developmentRunId ||
    receipt.workUnitId !== workUnit.workId ||
    evidence.source !== dependency.satisfaction.evidenceSource ||
    evidence.projectId !== workUnit.projectId ||
    evidence.requirementType !== dependency.requirement.type ||
    evidence.locator !== dependency.requirement.locator ||
    evidence.satisfiesMinimumRevision !== true ||
    !hasText(evidence.reference) ||
    !hasText(evidence.observedAt) ||
    (dependency.requirement.minimumRevision !== undefined &&
      !hasText(evidence.revision)) ||
    (dependency.watcher.lastEvidenceRef !== undefined &&
      dependency.watcher.lastEvidenceRef !== evidence.reference)
  ) {
    return "BINDING_MISMATCH";
  }
  if (receipt.sourceRevision !== input.sourceRevision) return "STALE";
  const evaluatedAt = time(input.evaluatedAt);
  const observedAt = time(evidence.observedAt);
  const verifiedAt = time(receipt.verifiedAt);
  const validUntil = time(receipt.validUntil);
  if (
    evaluatedAt === null ||
    observedAt === null ||
    verifiedAt === null ||
    validUntil === null ||
    observedAt > evaluatedAt ||
    verifiedAt > evaluatedAt ||
    validUntil <= evaluatedAt ||
    validUntil <= verifiedAt
  ) {
    return "STALE";
  }
  return "VALID";
}

function ownershipShapeIsValid(
  evidence: VerifiedDevelopmentOwnershipEvidence,
  input: DevelopmentRunEligibilityInput,
  workUnit: DevelopmentWorkUnit
): "VALID" | "STALE" | "BINDING_MISMATCH" {
  if (
    evidence.schemaVersion !== "development-lifecycle-ownership.v1" ||
    evidence.tenantId !== input.tenantId ||
    evidence.developmentRunId !== input.developmentRunId ||
    evidence.workUnitId !== workUnit.workId ||
    evidence.ownerId !== workUnit.ownership.actor ||
    !hasText(evidence.resolverId) ||
    !hasText(evidence.evidenceRef) ||
    !Array.isArray(evidence.conflictRefs) ||
    evidence.conflictRefs.some(ref => !hasText(ref))
  ) {
    return "BINDING_MISMATCH";
  }
  if (evidence.sourceRevision !== input.sourceRevision) return "STALE";
  const evaluatedAt = time(input.evaluatedAt);
  const verifiedAt = time(evidence.verifiedAt);
  const validUntil = time(evidence.validUntil);
  if (
    evaluatedAt === null ||
    verifiedAt === null ||
    validUntil === null ||
    verifiedAt > evaluatedAt ||
    validUntil <= evaluatedAt ||
    validUntil <= verifiedAt
  ) {
    return "STALE";
  }
  return "VALID";
}

function resultState(input: {
  ineligible: boolean;
  ownershipConflict: boolean;
  ownerRequired: boolean;
  staleEvidence: boolean;
  adapterUnavailable: boolean;
  waitingAuthority: boolean;
  waitingDependency: boolean;
}): DevelopmentRunEligibilityState {
  if (input.ineligible) return "INELIGIBLE";
  if (input.ownershipConflict) return "OWNERSHIP_CONFLICT";
  if (input.ownerRequired) return "OWNER_REQUIRED";
  if (input.staleEvidence) return "STALE_EVIDENCE";
  if (input.adapterUnavailable) return "ADAPTER_UNAVAILABLE";
  if (input.waitingAuthority) return "WAITING_AUTHORITY";
  if (input.waitingDependency) return "WAITING_DEPENDENCY";
  return "READY";
}

/**
 * Deterministically evaluates advisory eligibility for one canonical
 * DevelopmentRun. It performs no persistence, dispatch, authorization, or
 * economic operation. Trusted callers must obtain ownership/evidence receipts
 * from their existing domain authorities before invoking it.
 */
export function evaluateDevelopmentRunEligibility(
  input: DevelopmentRunEligibilityInput
): DevelopmentRunEligibilityResult {
  const reasons = new Set<string>();
  const evidence: DevelopmentRunEligibilityEvidence[] = [];
  const run = input.run;
  const workUnit = run?.workUnit ?? null;
  const outputWorkUnit =
    run && hasText(run.runId) && hasText(run.tenantId)
      ? {
          domain: hasText(workUnit?.projectId)
            ? workUnit.projectId
            : "SPEC-224",
          durableKind: "SPEC224_DEVELOPMENT_RUN" as const,
          durableId: run.runId,
          tenantId: run.tenantId,
        }
      : null;
  let ineligible = false;
  let ownershipConflict = false;
  let ownerRequired = false;
  let staleEvidence = false;
  let adapterUnavailable = false;
  let waitingAuthority = false;
  let waitingDependency = false;

  if (!hasText(input.tenantId) || !hasText(input.developmentRunId) || !run) {
    reasons.add("DEVELOPMENT_RUN_REQUIRED");
    ineligible = true;
  } else {
    if (run.runId !== input.developmentRunId) {
      reasons.add("DEVELOPMENT_RUN_ID_MISMATCH");
      ineligible = true;
    }
    if (run.tenantId !== input.tenantId) {
      reasons.add("TENANT_BINDING_MISMATCH");
      ineligible = true;
    }
    if (!ADMISSIBLE_RUN_STATES.has(run.state)) {
      reasons.add("DEVELOPMENT_RUN_STATE_NOT_ADMISSIBLE");
      ineligible = true;
    }
    if (!workUnit) {
      reasons.add("DEVELOPMENT_WORK_UNIT_REQUIRED");
      ineligible = true;
    }
  }

  if (time(input.evaluatedAt) === null) {
    reasons.add("EVALUATION_TIME_INVALID");
    ineligible = true;
  }

  if (workUnit) {
    if (
      !hasText(workUnit.workId) ||
      !hasText(workUnit.projectId) ||
      !hasText(workUnit.repositoryId) ||
      !hasText(workUnit.ownership?.actor) ||
      !Array.isArray(workUnit.dependencies)
    ) {
      reasons.add("DEVELOPMENT_WORK_UNIT_INVALID");
      ineligible = true;
    }
    if (!hasText(input.sourceRevision)) {
      reasons.add("SOURCE_REVISION_REQUIRED");
      ineligible = true;
    } else if (input.sourceRevision !== workUnit.progress?.canonicalRevision) {
      reasons.add("SOURCE_REVISION_MISMATCH");
      staleEvidence = true;
    }
  }

  let outputOwnership: DevelopmentRunEligibilityResult["ownership"] = null;
  if (!input.ownership) {
    reasons.add("OWNER_EVIDENCE_REQUIRED");
    ownerRequired = true;
  } else if (
    Array.isArray(input.ownership.conflictRefs) &&
    input.ownership.conflictRefs.length > 0
  ) {
    reasons.add("OWNERSHIP_CONFLICT");
    ownershipConflict = true;
    outputOwnership = {
      ownerId: input.ownership.ownerId,
      adapterId: input.ownership.resolverId,
      verifiedAt: input.ownership.verifiedAt,
      conflictRefs: [...input.ownership.conflictRefs].sort(),
    };
  } else if (!run || !workUnit) {
    reasons.add("OWNER_EVIDENCE_BINDING_MISMATCH");
    ineligible = true;
  } else {
    const ownershipState = ownershipShapeIsValid(
      input.ownership,
      input,
      workUnit
    );
    if (ownershipState === "BINDING_MISMATCH") {
      reasons.add("OWNER_EVIDENCE_BINDING_MISMATCH");
      ineligible = true;
    } else if (ownershipState === "STALE") {
      reasons.add("OWNER_EVIDENCE_STALE");
      staleEvidence = true;
    } else {
      outputOwnership = {
        ownerId: input.ownership.ownerId,
        adapterId: input.ownership.resolverId,
        verifiedAt: input.ownership.verifiedAt,
        conflictRefs: [],
      };
      evidence.push({
        source: input.ownership.resolverId,
        reference: input.ownership.evidenceRef,
        observedAt: input.ownership.verifiedAt,
        verifiedAt: input.ownership.verifiedAt,
        revision: input.ownership.sourceRevision,
      });
    }
  }

  const evidenceByDependency = new Map<
    string,
    VerifiedDevelopmentEligibilityEvidence[]
  >();
  if (!Array.isArray(input.dependencyEvidence)) {
    reasons.add("DEPENDENCY_EVIDENCE_INVALID");
    ineligible = true;
  }
  for (const receipt of Array.isArray(input.dependencyEvidence)
    ? input.dependencyEvidence
    : []) {
    evidenceByDependency.set(receipt.dependencyId, [
      ...(evidenceByDependency.get(receipt.dependencyId) ?? []),
      receipt,
    ]);
  }

  if (workUnit && Array.isArray(workUnit.dependencies)) {
    const seen = new Set<string>();
    for (const dependency of workUnit.dependencies) {
      if (seen.has(dependency.dependencyId)) {
        reasons.add("DEPENDENCY_ID_DUPLICATE");
        ineligible = true;
        continue;
      }
      seen.add(dependency.dependencyId);
      const predicate = getDevelopmentLifecyclePredicate(
        dependency.satisfaction.predicateId
      );
      if (
        !predicate ||
        typeof predicate.verifyEvidence !== "function" ||
        typeof predicate.recheck !== "function"
      ) {
        reasons.add("DEPENDENCY_PREDICATE_UNAVAILABLE");
        adapterUnavailable = true;
        continue;
      }
      if (dependency.state === "INVALIDATED") {
        reasons.add("DEPENDENCY_EVIDENCE_INVALIDATED");
        staleEvidence = true;
        continue;
      }
      if (dependency.state === "UNSATISFIED") {
        if (dependency.watcher.status !== "ACTIVE") {
          reasons.add("DEPENDENCY_WATCHER_UNAVAILABLE");
          adapterUnavailable = true;
        } else if (dependency.requirement.type === "capability") {
          reasons.add("AUTHORITY_UNSATISFIED");
          waitingAuthority = true;
        } else {
          reasons.add("DEPENDENCY_UNSATISFIED");
          waitingDependency = true;
        }
        continue;
      }
      const receipts = evidenceByDependency.get(dependency.dependencyId) ?? [];
      if (receipts.length !== 1) {
        reasons.add("DEPENDENCY_EVIDENCE_REQUIRED");
        staleEvidence = true;
        continue;
      }
      const receipt = receipts[0]!;
      const evidenceState = evidenceShapeIsValid(
        receipt,
        dependency,
        input,
        workUnit
      );
      if (evidenceState === "BINDING_MISMATCH") {
        reasons.add("DEPENDENCY_EVIDENCE_BINDING_MISMATCH");
        ineligible = true;
      } else if (evidenceState === "STALE") {
        reasons.add("DEPENDENCY_EVIDENCE_STALE");
        staleEvidence = true;
      } else {
        evidence.push({
          source: receipt.evidence.source,
          reference: receipt.evidence.reference,
          observedAt: receipt.evidence.observedAt,
          verifiedAt: receipt.verifiedAt,
          ...(receipt.evidence.revision
            ? { revision: receipt.evidence.revision }
            : {}),
        });
      }
    }
    for (const dependencyId of evidenceByDependency.keys()) {
      if (!seen.has(dependencyId)) {
        reasons.add("DEPENDENCY_EVIDENCE_UNBOUND");
        ineligible = true;
      }
    }
  } else if (
    Array.isArray(input.dependencyEvidence) &&
    input.dependencyEvidence.length > 0
  ) {
    reasons.add("DEPENDENCY_EVIDENCE_UNBOUND");
    ineligible = true;
  }

  evidence.sort((left, right) =>
    `${left.source}:${left.reference}`.localeCompare(
      `${right.source}:${right.reference}`
    )
  );
  return {
    schemaVersion: DEVELOPMENT_RUN_ELIGIBILITY_SCHEMA,
    state: resultState({
      ineligible,
      ownershipConflict,
      ownerRequired,
      staleEvidence,
      adapterUnavailable,
      waitingAuthority,
      waitingDependency,
    }),
    advisory: true,
    workUnit: outputWorkUnit,
    sourceRevision: input.sourceRevision,
    reasonCodes: [...reasons].sort(),
    evidence,
    ownership: outputOwnership,
  };
}
