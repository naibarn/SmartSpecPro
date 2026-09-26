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
};

export type BlockerStatus =
  "OPEN" | "INVESTIGATING" | "REPAIR" | "VERIFY" | "CLOSED";

export type BlockerLedgerEntry = {
  blockerId: string;
  runId: string;
  requirementRefs: string[];
  classification: string;
  severity: "low" | "medium" | "high" | "critical";
  status: BlockerStatus;
  verificationRefs: string[];
  reopenCount: number;
};

export type RequirementClosureGraph = {
  contractVersion: "spec-224-closure-v1";
  baseline: {
    specId: string;
    revision: string;
    digest: string;
    baselineId: string;
    authorityRef: string;
    scopeEnvelopeRef: string;
  };
  requirements: RequirementRecord[];
  planSections: Array<{ id: string; requirementIds: string[] }>;
  workPackages: Array<{
    id: string;
    planSectionId: string;
    requirementIds: string[];
    dependsOn: string[];
  }>;
  reverse: Record<string, string[]>;
  blockers: BlockerLedgerEntry[];
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

export function compileRequirementClosureGraph(input: {
  baseline: RequirementClosureGraph["baseline"];
  requirements: Array<{ id: string; sourceRef: string; text: string }>;
  planSections: Array<{ id: string; requirementIds: string[] }>;
  workPackages: Array<{
    id: string;
    planSectionId: string;
    requirementIds: string[];
    dependsOn: string[];
  }>;
}): RequirementClosureGraph {
  if (!HASH.test(input.baseline.digest))
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
  const requirementIds = input.requirements.map(requirement =>
    id(requirement.id, "REQUIREMENT_ID_INVALID")
  );
  if (new Set(requirementIds).size !== requirementIds.length)
    throw new Spec224ClosureError("REQUIREMENT_DUPLICATE");
  const requirementSet = new Set(requirementIds);
  const planSectionIds = input.planSections.map(section =>
    id(section.id, "PLAN_SECTION_ID_INVALID")
  );
  if (new Set(planSectionIds).size !== planSectionIds.length)
    throw new Spec224ClosureError("PLAN_SECTION_DUPLICATE");
  const planSectionByRequirement = new Map<string, string[]>();
  const planSections = input.planSections.map(section => {
    const ids = unique(section.requirementIds, "PLAN_REQUIREMENT_IDS_INVALID");
    for (const requirementId of ids) {
      if (!requirementSet.has(requirementId))
        throw new Spec224ClosureError("PLAN_REQUIREMENT_UNKNOWN");
      planSectionByRequirement.set(requirementId, [
        ...(planSectionByRequirement.get(requirementId) ?? []),
        section.id,
      ]);
    }
    return {
      id: id(section.id, "PLAN_SECTION_ID_INVALID"),
      requirementIds: ids,
    };
  });
  const planSectionRequirements = new Map(
    planSections.map(section => [section.id, new Set(section.requirementIds)])
  );
  const workPackageIds = input.workPackages.map(workPackage =>
    id(workPackage.id, "WORK_PACKAGE_ID_INVALID")
  );
  if (new Set(workPackageIds).size !== workPackageIds.length)
    throw new Spec224ClosureError("WORK_PACKAGE_DUPLICATE");
  const owners = new Map<string, string[]>();
  const workPackages = input.workPackages.map(workPackage => {
    const workPackageRequirementIds = unique(
      workPackage.requirementIds,
      "WORK_PACKAGE_REQUIREMENT_IDS_INVALID"
    );
    if (!planSectionIds.includes(workPackage.planSectionId))
      throw new Spec224ClosureError("PLAN_SECTION_UNKNOWN");
    for (const requirementId of workPackageRequirementIds) {
      if (!requirementSet.has(requirementId))
        throw new Spec224ClosureError("WORK_PACKAGE_REQUIREMENT_UNKNOWN");
      if (
        !planSectionRequirements
          .get(workPackage.planSectionId)
          ?.has(requirementId)
      ) {
        throw new Spec224ClosureError("WORK_PACKAGE_SECTION_MISMATCH");
      }
      owners.set(requirementId, [
        ...(owners.get(requirementId) ?? []),
        workPackage.id,
      ]);
    }
    return {
      id: id(workPackage.id, "WORK_PACKAGE_ID_INVALID"),
      planSectionId: id(workPackage.planSectionId, "PLAN_SECTION_ID_INVALID"),
      requirementIds: workPackageRequirementIds,
      dependsOn: unique(
        workPackage.dependsOn,
        "WORK_PACKAGE_DEPENDENCIES_INVALID"
      ),
    };
  });
  assertAcyclic(workPackages);
  for (const requirementId of requirementIds) {
    if (!planSectionByRequirement.has(requirementId))
      throw new Spec224ClosureError("REQUIREMENT_UNMAPPED");
    const requirementOwners = owners.get(requirementId) ?? [];
    if (requirementOwners.length === 0)
      throw new Spec224ClosureError("REQUIREMENT_UNMAPPED");
    if (requirementOwners.length > 1)
      throw new Spec224ClosureError("REQUIREMENT_MULTIPLE_OWNER");
  }
  const requirements = input.requirements.map(requirement => ({
    id: id(requirement.id, "REQUIREMENT_ID_INVALID"),
    sourceRef: ref(requirement.sourceRef, "REQUIREMENT_SOURCE_INVALID"),
    text: text(requirement.text, "REQUIREMENT_TEXT_INVALID"),
    state: "PLANNED" as const,
    planSectionIds: planSectionByRequirement.get(requirement.id)!,
    workPackageIds: owners.get(requirement.id)!,
    evidenceRefs: [],
  }));
  const reverse: Record<string, string[]> = {};
  for (const requirement of requirements) {
    const workPackageId = requirement.workPackageIds[0];
    reverse[workPackageId] = [
      ...(reverse[workPackageId] ?? []),
      requirement.id,
    ];
  }
  return {
    contractVersion: "spec-224-closure-v1",
    baseline: structuredClone(input.baseline),
    requirements,
    planSections,
    workPackages,
    reverse,
    blockers: [],
  };
}

export function buildBlockerLedgerEntry(input: {
  blockerId: string;
  runId: string;
  requirementRefs: string[];
  classification: string;
  severity: BlockerLedgerEntry["severity"];
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
    status: "OPEN",
    verificationRefs: [],
    reopenCount: 0,
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
  return { ...blocker, status: "CLOSED", verificationRefs: refs };
}

export function assertFinalVerifyReady(graph: RequirementClosureGraph): true {
  const incomplete = graph.requirements.find(requirement => {
    if (!TERMINAL_REQUIREMENT_STATES.has(requirement.state)) return true;
    return requirement.evidenceRefs.length === 0;
  });
  if (incomplete) throw new Spec224ClosureError("REQUIREMENT_NOT_TERMINAL");
  if (graph.blockers.some(blocker => blocker.status !== "CLOSED"))
    throw new Spec224ClosureError("BLOCKER_OPEN");
  return true;
}
