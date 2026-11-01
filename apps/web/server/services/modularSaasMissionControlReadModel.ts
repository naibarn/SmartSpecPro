type ProjectSpecInput = {
  id: string;
  title: string;
  digest: string;
  dependencies: string[];
  requirements: Array<{ id: string; finalState: string }>;
  nextAction?: string | null;
  lifecycleState?: string | null;
};

type CompilationInput = {
  requirements: Array<{ canonicalSpecId?: string; lifecycleStatus: "READY" | "BLOCKED" }>;
  workPackages: Array<{ externalId: string; readiness: "READY" | "BLOCKED"; blockers: readonly string[]; requirementIds?: readonly string[] }>;
};

type IngestionInput = {
  workspaceId: string;
  revision: number;
  digest: string;
  descriptorDigest: string;
  sourceRevision: string;
};

type RunInput = {
  runId: string;
  workspaceId: string;
  specSetRevision: number | null;
  state: string;
  workPackageExternalId: string | null;
};

export function buildModularSaasMissionControlReadModel(input: {
  project: {
    projectId: string;
    sourceRevision?: string;
    descriptorDigest: string;
    specs: ProjectSpecInput[];
    initialPackages: Array<{ id: string; specRefs: Array<{ specId: string; requirementIds: string[] }> }>;
  };
  compilation: CompilationInput;
  ingestions: IngestionInput[];
  runs: RunInput[];
}) {
  const currentIngestions = input.ingestions.filter(item => item.descriptorDigest === input.project.descriptorDigest);
  const ingestionStatus = currentIngestions.length ? "CURRENT" as const : input.ingestions.length ? "STALE" as const : "NOT_INGESTED" as const;
  const linkedRuns = input.runs.flatMap(run => {
    const matchingIngestion = input.ingestions.find(item => item.workspaceId === run.workspaceId && item.revision === run.specSetRevision);
    if (!matchingIngestion) return [];
    return [{
      runId: run.runId,
      workspaceId: run.workspaceId,
      specSetRevision: run.specSetRevision,
      state: run.state,
      workPackageExternalId: run.workPackageExternalId,
      evidenceScope: "SPEC224_RUN" as const,
      sourceAlignment: matchingIngestion.descriptorDigest === input.project.descriptorDigest ? "CURRENT" as const : "STALE" as const,
    }];
  });
  const packageById = new Map(input.compilation.workPackages.map(item => [item.externalId, item]));
  const declaredPackages = new Map(input.project.initialPackages.map(pkg => [pkg.id, pkg]));
  const packageIds = [...new Set([...declaredPackages.keys(), ...packageById.keys()])];
  const requirementCountsBySpec = new Map<string, { ready: number; blocked: number }>();
  for (const requirement of input.compilation.requirements) {
    if (!requirement.canonicalSpecId) continue;
    const counts = requirementCountsBySpec.get(requirement.canonicalSpecId) ?? { ready: 0, blocked: 0 };
    counts[requirement.lifecycleStatus === "READY" ? "ready" : "blocked"]++;
    requirementCountsBySpec.set(requirement.canonicalSpecId, counts);
  }
  return {
    projectId: input.project.projectId,
    title: "SmartAIHub Modular SaaS",
    sourceStatus: "CURRENT" as const,
    sourceRevision: input.project.sourceRevision ?? currentIngestions[0]?.sourceRevision ?? null,
    descriptorDigest: input.project.descriptorDigest,
    ingestionStatus,
    ingestions: input.ingestions.map(item => ({ workspaceId: item.workspaceId, revision: item.revision, digest: item.digest, descriptorDigest: item.descriptorDigest })),
    specs: input.project.specs.map(spec => {
      const canonicalCounts = requirementCountsBySpec.get(spec.id);
      const ledgerCounts = spec.requirements.reduce((counts, requirement) => {
        counts[requirement.finalState === "PASS" || requirement.finalState === "NOT_APPLICABLE" ? "closed" : "open"]++;
        return counts;
      }, { closed: 0, open: 0 });
      return {
        id: spec.id,
        title: spec.title,
        sourceDigest: spec.digest,
        dependencyIds: [...spec.dependencies],
        lifecycleState: spec.lifecycleState ?? "UNKNOWN",
        nextAction: spec.nextAction ?? null,
        requirements: {
          total: spec.requirements.length,
          closed: ledgerCounts.closed,
          open: ledgerCounts.open,
          compiledReady: canonicalCounts?.ready ?? 0,
          compiledBlocked: canonicalCounts?.blocked ?? 0,
        },
        openRequirements: ledgerCounts.open,
      };
    }),
    packages: packageIds.map(id => {
      const declaration = declaredPackages.get(id);
      const compiled = packageById.get(id);
      const specIds = declaration?.specRefs.map(ref => ref.specId)
        ?? [...new Set((compiled?.requirementIds ?? []).flatMap(requirementId => {
          const prefix = "canonical:";
          if (!requirementId.startsWith(prefix)) return [];
          const specId = requirementId.slice(prefix.length).split("#", 1)[0];
          return input.project.specs.some(spec => spec.id === specId) ? [specId] : [];
        }))];
      return {
        id,
        specIds,
        readiness: compiled?.readiness ?? "BLOCKED",
        blockers: compiled ? [...compiled.blockers] : ["Package declaration is not present in the compiled SpecSet."],
      };
    }),
    linkedRuns,
    deployment: { status: "UNKNOWN" as const, target: null },
  };
}
