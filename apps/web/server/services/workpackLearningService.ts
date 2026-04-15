import type { ImprovementProposal, TrustTaintTag } from "../../shared/workpackPromotion";
import { improvementProposalSchema } from "../../shared/workpackPromotion";
import { prepareWorkpackImprovementIntake } from "./skillStudioService";
import { isWorkpackImprovementAutoApplyEligible } from "./skillUpgradeApplier";
import { createWorkpackId, getWorkpackDetail, saveImprovementProposal } from "./workpackPersistence";

export interface WorkpackLearningBundle {
  workpackId: string;
  versionId: string;
  proposals: ImprovementProposal[];
  benchmarkCandidate: boolean;
  handoffBriefs: Array<{
    proposalId: string;
    title: string;
    brief: string;
    autoApplyEligible: boolean;
  }>;
}

function nowIso(): string {
  return new Date().toISOString();
}

async function deriveTrustTags(workpackId: string): Promise<TrustTaintTag[]> {
  const detail = await getWorkpackDetail(workpackId);
  if (!detail) return ["restricted_lineage"];

  const tags = new Set<TrustTaintTag>(["verified"]);
  for (const fixture of detail.version.fixtureCatalog) {
    if (fixture.governance.accessScope === "tenant") tags.add("tenant_local_only");
    if (fixture.governance.redactionState === "unscrubbed") tags.add("local_only");
    if (fixture.governance.redactionState !== "de_identified") tags.add("tenant_local_only");
  }
  for (const exceptionRecord of detail.exceptions) {
    if (exceptionRecord.reasonCategory === "policy_boundary") tags.add("manual_override");
  }

  return Array.from(tags);
}

function dedupeBySummary(proposals: ImprovementProposal[]): ImprovementProposal[] {
  const seen = new Set<string>();
  return proposals.filter((proposal) => {
    const key = `${proposal.actionType}:${proposal.summary}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export async function deriveWorkpackImprovementProposals(workpackId: string): Promise<WorkpackLearningBundle> {
  const detail = await getWorkpackDetail(workpackId);
  if (!detail) {
    throw new Error(`Unknown workpack: ${workpackId}`);
  }

  const createdAt = nowIso();
  const trustTags = await deriveTrustTags(workpackId);
  const proposals: ImprovementProposal[] = [];
  const exceptionsByReason = new Map<string, typeof detail.exceptions>();

  for (const exceptionRecord of detail.exceptions) {
    const bucket = exceptionsByReason.get(exceptionRecord.reasonCode) ?? [];
    bucket.push(exceptionRecord);
    exceptionsByReason.set(exceptionRecord.reasonCode, bucket);
  }

  for (const [reasonCode, records] of exceptionsByReason.entries()) {
    const actionType = reasonCode.includes("connector")
      ? "connector_map_adjustment"
      : reasonCode.includes("fixture")
        ? "fixture_update"
        : "workflow_refinement";
    const risk = records.some((record) => record.riskClass === "critical")
      ? "high"
      : records.length > 1
        ? "medium"
        : "low";

    proposals.push(improvementProposalSchema.parse({
      id: createWorkpackId("prop"),
      workpackId: detail.workpack.id,
      versionId: detail.version.id,
      actionType,
      risk,
      sourceRunId: records[0]?.runId ?? null,
      sourceExceptionIds: records.map((record) => record.id),
      summary: `${records[0]?.title ?? "Workpack exception"} (${records.length}x)`,
      evidenceSummary: records.map((record) => record.reasonCode).join(", "),
      trustTags,
      autoApplicable: false,
      createdAt,
    }));
  }

  const successfulRuns = detail.runs.filter((run) => run.status === "succeeded");
  const successfulSimulations = detail.simulations.filter((run) => run.status === "passed");
  const repeatedApprovalHotspots = detail.runs.filter((run) => run.approvalCheckpoints.length > 0).length;

  if (successfulRuns.length >= 1 && repeatedApprovalHotspots === 0) {
    proposals.push(improvementProposalSchema.parse({
      id: createWorkpackId("prop"),
      workpackId: detail.workpack.id,
      versionId: detail.version.id,
      actionType: "skill_improvement",
      risk: "low",
      sourceRunId: successfulRuns[0]?.id ?? null,
      sourceExceptionIds: [],
      summary: "Package the stable execution path into a reusable skill improvement brief",
      evidenceSummary: `${successfulRuns.length} successful runs completed without intervention hotspots.`,
      trustTags,
      autoApplicable: isWorkpackImprovementAutoApplyEligible({
        risk: "low",
        trustTags,
        actionType: "skill_improvement",
      }),
      createdAt,
    }));
  }

  const benchmarkCandidate = successfulSimulations.length > 0 && detail.exceptions.filter((item) => !item.resolvedAt).length === 0;
  if (benchmarkCandidate) {
    proposals.push(improvementProposalSchema.parse({
      id: createWorkpackId("prop"),
      workpackId: detail.workpack.id,
      versionId: detail.version.id,
      actionType: "benchmark_publication",
      risk: "low",
      sourceRunId: successfulRuns[0]?.id ?? null,
      sourceExceptionIds: [],
      summary: "Publish this version as a benchmark candidate",
      evidenceSummary: `${successfulSimulations.length} passed simulations and ${successfulRuns.length} successful runs are available.`,
      trustTags,
      autoApplicable: false,
      createdAt,
    }));
  }

  const finalProposals = await Promise.all(
    dedupeBySummary(proposals).map((proposal) => saveImprovementProposal(proposal)),
  );
  const handoffBriefs = finalProposals
    .filter((proposal) => proposal.actionType === "skill_improvement")
    .map((proposal) => {
      const intake = prepareWorkpackImprovementIntake({
        workpackTitle: detail.workpack.title,
        workpackGoal: detail.workpack.goal,
        proposalSummary: proposal.summary,
        evidenceSummary: proposal.evidenceSummary,
        targetArea: detail.workpack.domainPack,
      });
      return {
        proposalId: proposal.id,
        title: intake.title,
        brief: intake.brief,
        autoApplyEligible: proposal.autoApplicable,
      };
    });

  return {
    workpackId: detail.workpack.id,
    versionId: detail.version.id,
    proposals: finalProposals,
    benchmarkCandidate,
    handoffBriefs,
  };
}
