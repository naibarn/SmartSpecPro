import type {
  StoryGenerationRunContract,
  StoryValidationFinding,
  StoryValidationReport,
} from "./verticalDramaStoryGenerationContracts";

export interface StoryRepairPlan {
  available: boolean;
  requiresApproval: boolean;
  reason: string;
  targetEpisodes: number[];
  impactClosureEpisodes: number[];
  impactExpansionRequired: boolean;
  targetPaths: string[];
  preservePaths: string[];
  nextStatus: "repairing" | "awaiting_approval" | "needs_repair";
}

export function planStoryGenerationRepair(input: {
  contract: StoryGenerationRunContract;
  report: StoryValidationReport;
}): StoryRepairPlan {
  const blocking = input.report.findings.filter((finding) => finding.blocking);
  if (blocking.length === 0) {
    return {
      available: false,
      requiresApproval: false,
      reason: "No blocking findings remain",
      targetEpisodes: input.report.impactedEpisodes,
      impactClosureEpisodes: input.report.impactedEpisodes,
      impactExpansionRequired: false,
      targetPaths: [],
      preservePaths: ["/plan", "/characters", "/locations"],
      nextStatus: "needs_repair",
    };
  }
  const impacted = new Set(input.report.impactedEpisodes);
  const admitted = new Set(input.contract.targetEpisodes);
  for (const episodeNumber of input.report.impactedEpisodes) {
    for (const neighbor of [episodeNumber - 1, episodeNumber + 1]) {
      if (admitted.has(neighbor)) impacted.add(neighbor);
    }
  }
  const impactClosureEpisodes = [...impacted].sort((a, b) => a - b);
  const continuityFinding = blocking.some((finding) => finding.code.includes("continuity"));
  const impactExpansionRequired = continuityFinding && input.report.impactedEpisodes.some((episodeNumber) =>
    !admitted.has(episodeNumber - 1) || !admitted.has(episodeNumber + 1),
  );
  const requiresApproval = blocking.some((finding) => finding.requiresApproval || finding.severity === "structural") || impactExpansionRequired;
  const targetPaths = uniquePaths(blocking, "targetPaths");
  const preservePaths = uniquePaths(blocking, "preservePaths");
  const withinBudget = input.report.repairRound < input.contract.budget.maxRepairAttempts;
  return {
    available: withinBudget,
    requiresApproval,
    reason: withinBudget
      ? impactExpansionRequired
        ? `Repair impact crosses the admitted episode scope; approval is required`
        : `Repair ${blocking.length} blocking finding(s) in impacted episodes and their admitted neighbors`
      : "Repair budget exhausted; source or plan review is required",
    targetEpisodes: impactClosureEpisodes,
    impactClosureEpisodes,
    impactExpansionRequired,
    targetPaths,
    preservePaths: preservePaths.length > 0 ? preservePaths : ["/plan"],
    nextStatus: !withinBudget ? "needs_repair" : requiresApproval ? "awaiting_approval" : "repairing",
  };
}

function uniquePaths(findings: StoryValidationFinding[], key: "targetPaths" | "preservePaths"): string[] {
  return [...new Set(findings.flatMap((finding) => finding[key]))].slice(0, 32);
}
