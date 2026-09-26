import {
  buildRequirementEvidenceBinding,
  buildWorkPackageEvidenceBinding,
  buildSourceChangeInventory,
  compileRequirementClosureGraph,
  digestSourceManifest,
  type RequirementClosureGraph,
} from "../spec224RequirementClosureContracts";

export function makeReadyClosureFixture(
  source: RequirementClosureGraph,
  input: {
    baseRevision: string;
    prefix: string;
    repositoryRef?: string;
  }
): { graph: RequirementClosureGraph; evidenceRefs: string[] } {
  const manifestEvidenceRef = `evidence:${input.prefix}-manifest`;
  const manifestFiles = [
    {
      path: "specs/feature/224-Autonomous Development Orchestrator Runtime/spec.md",
      digest: source.baseline.sourceArtifactDigest,
    },
    {
      path: "apps/web/server/services/spec224-contract.ts",
      digest: "d".repeat(64),
    },
  ];
  const candidateManifestDigest = digestSourceManifest(manifestFiles);
  const inventory = buildSourceChangeInventory({
    baseline: source.baseline,
    baselineRevision: input.baseRevision,
    candidateRevision: `git:${input.prefix}-candidate`,
    baselineManifestDigest: digestSourceManifest(manifestFiles),
    candidateManifestDigest,
    scannerRef: "scanner:spec224-test-fixture",
    manifestEvidenceRef,
    coverage: {
      repositoryRef: input.repositoryRef ?? "repo:smartspecpro",
      baselineRevision: input.baseRevision,
      candidateRevision: `git:${input.prefix}-candidate`,
      inclusionRoots: ["**"],
      excludedPaths: [],
      recursive: true,
      includesUntracked: true,
      attestationEvidenceRef: manifestEvidenceRef,
    },
    specArtifactPath: manifestFiles[0]!.path,
    baselineFiles: manifestFiles,
    candidateFiles: manifestFiles,
    scannedAt: "2026-09-26T00:00:00.000Z",
    changes: [],
    requirementIds: source.requirements.map(requirement => requirement.id),
    derivedRequirements: source.derivedRequirements,
  });
  const workPackageEvidenceRefs = new Map<string, string>();
  const planSections = source.planSections.map(section => ({
    ...section,
    title: section.title || `Section ${section.id}`,
    objective: section.objective || "Close its mapped source requirements",
    sourceSpecRefs: section.requirementIds.flatMap(id => {
      const requirement = source.requirements.find(item => item.id === id);
      return requirement ? [requirement.sourceRef] : [];
    }),
    entryConditions: ["Exact baseline is frozen"],
    exitConditions: ["Mapped work packages reach verified state"],
    verificationObligations: ["test:spec224-focused"],
    riskClass: "low" as const,
    owners: ["team:spec224"],
    executorConstraints: ["isolated-non-production"],
    status: "VERIFIED" as const,
  }));
  const workPackages = source.workPackages.map((workPackage, index) => {
    const evidenceRef = `evidence:${input.prefix}-package-${index + 1}`;
    workPackageEvidenceRefs.set(workPackage.id, evidenceRef);
    return {
      ...workPackage,
      title: workPackage.title || `Package ${workPackage.id}`,
      objective: workPackage.objective || "Implement mapped requirements",
      owner: workPackage.owner || "agent:spec224-test",
      allowedWriteSet: workPackage.allowedWriteSet.length
        ? workPackage.allowedWriteSet
        : [
            `apps/web/server/services/${workPackage.id.replace(/[^A-Za-z0-9-]/g, "-")}.ts`,
          ],
      workspaceRef: `workspace:${input.prefix}-${workPackage.id.replace(/[^A-Za-z0-9-]/g, "-")}`,
      operationScope: "modify only declared package files",
      approvalGateRef: null,
      testPlanRefs: workPackage.testPlanRefs.length
        ? workPackage.testPlanRefs
        : ["test:spec224-focused"],
      evidenceRefs: [evidenceRef],
      evidence: [],
      reviewer: workPackage.reviewer || "reviewer:spec224-test",
      riskClass: "low" as const,
      status: "VERIFIED" as const,
      tddApplicability: "TDD_REQUIRED" as const,
      tddReason: null,
      alternateVerificationPlan: null,
      nextSafeAction: "continue after verified package dependencies",
    };
  });
  const planned = compileRequirementClosureGraph({
    baseline: source.baseline,
    requirements: source.requirements.map(({ id, sourceRef, text }) => ({
      id,
      sourceRef,
      text,
    })),
    planSections,
    workPackages,
    derivedRequirements: source.derivedRequirements,
    sourceInventory: inventory,
  });
  const evidenceRefs = [
    manifestEvidenceRef,
    ...workPackageEvidenceRefs.values(),
  ];
  const graph: RequirementClosureGraph = {
    ...planned,
    workPackages: planned.workPackages.map((workPackage, index) => {
      const evidenceRef = workPackageEvidenceRefs.get(workPackage.id)!;
      const evidence = buildWorkPackageEvidenceBinding({
        graph: planned,
        workPackageId: workPackage.id,
        evidenceRef,
        verificationMethod: "test:spec224-focused",
        verifierRef: "reviewer:spec224-test",
        verifiedAt: "2026-09-26T00:00:00.000Z",
      });
      return {
        ...workPackage,
        evidence: [evidence],
        evidenceRefs: [evidenceRef],
      };
    }),
    requirements: planned.requirements.map((requirement, index) => {
      const evidence = buildRequirementEvidenceBinding({
        graph: planned,
        requirementId: requirement.id,
        workPackageId: requirement.workPackageIds[0]!,
        evidenceRef: `evidence:${input.prefix}-requirement-${index + 1}`,
        verificationMethod: "test:spec224-focused",
        verifierRef: "reviewer:spec224-test",
        verifiedAt: "2026-09-26T00:00:00.000Z",
      });
      evidenceRefs.push(evidence.evidenceRef);
      return {
        ...requirement,
        state: "VERIFIED_PASS" as const,
        evidenceRefs: [evidence.evidenceRef],
        evidence: [evidence],
      };
    }),
  };
  return { graph, evidenceRefs };
}
