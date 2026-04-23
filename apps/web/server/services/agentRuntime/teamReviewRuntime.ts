export interface TeamReviewRuntimeVerdict {
  verdict: "pass" | "fail" | "needs_repair" | "blocked";
  note: string | null;
  issues: string[];
  repairInstructions: string | null;
}

export function describeTeamReviewVerdict(input: {
  pass: boolean;
  recommendation?: string | null;
  issues?: string[];
  repairInstructions?: string | null;
}): TeamReviewRuntimeVerdict {
  const issues = (input.issues ?? []).filter((issue) => issue.trim().length > 0);
  return {
    verdict: input.pass ? "pass" : issues.length > 0 ? "needs_repair" : "blocked",
    note: input.recommendation ?? null,
    issues,
    repairInstructions: input.repairInstructions ?? null,
  };
}

