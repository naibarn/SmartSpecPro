import crypto from "crypto";

import type {
  OrchestratorLearningProposal,
} from "../../shared/workOrchestrator";

export interface EvaluateRunForLearningInput {
  runId: string;
  objective: string;
  successCount?: number;
  repeatedPathCount?: number;
  exceptionSummaries?: readonly string[] | null;
  evidenceRefs?: readonly string[] | null;
  finalArtifacts?: readonly string[] | null;
  generatedAt?: Date | string;
}

export interface EvaluateRunForLearningResult {
  workpackCandidates: Array<{
    id: string;
    title: string;
    confidence: number;
    evidenceRefs: string[];
  }>;
  proposals: OrchestratorLearningProposal[];
}

export interface TransitionLearningProposalInput {
  proposal: OrchestratorLearningProposal;
  nextState: OrchestratorLearningProposal["state"];
  actorUserId?: number | null;
  reason: string;
  evidenceRefs?: readonly string[] | null;
  occurredAt?: Date | string;
}

function toIsoDate(value: Date | string | undefined): string {
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "string" && value.trim()) return new Date(value).toISOString();
  return new Date().toISOString();
}

function buildDedupeKey(parts: readonly string[]): string {
  return crypto.createHash("sha256").update(parts.join("|")).digest("hex");
}

function normalizeLearningObjective(value: string): string {
  return value.trim().toLowerCase();
}

function readDuplicateRunIds(
  metadata: OrchestratorLearningProposal["metadata"],
): string[] {
  const duplicateRunIds = metadata.duplicateRunIds;
  if (!Array.isArray(duplicateRunIds)) {
    return [];
  }
  return duplicateRunIds
    .filter((value): value is string => typeof value === "string")
    .map(value => value.trim())
    .filter(Boolean);
}

export function estimateRepeatedPathCount(input: {
  objective: string;
  existingProposals?: readonly OrchestratorLearningProposal[] | null;
  completedRun?: boolean;
}): number {
  if (!input.completedRun) {
    return 0;
  }

  const normalizedObjective = normalizeLearningObjective(input.objective);
  const priorRunIds = new Set(
    (input.existingProposals ?? [])
      .filter(proposal => {
        if (!proposal.relatedRunId) {
          return false;
        }
        if (
          proposal.state === "rejected" ||
          proposal.state === "expired" ||
          proposal.state === "superseded"
        ) {
          return false;
        }
        const metadataObjective =
          typeof proposal.metadata.learningObjective === "string"
            ? proposal.metadata.learningObjective
            : proposal.title;
        return normalizeLearningObjective(metadataObjective) === normalizedObjective;
      })
      .flatMap(proposal =>
        [proposal.relatedRunId ?? null, ...readDuplicateRunIds(proposal.metadata)]
          .filter((value): value is string => Boolean(value)),
      ),
  );

  return Math.max(1, priorRunIds.size + 1);
}

export function evaluateRunForLearning(
  input: EvaluateRunForLearningInput,
): EvaluateRunForLearningResult {
  const generatedAt = toIsoDate(input.generatedAt);
  const evidenceRefs = [...(input.evidenceRefs ?? [])];
  const repeatedPathCount = Math.max(0, input.repeatedPathCount ?? 0);
  const successCount = Math.max(0, input.successCount ?? 0);
  const exceptionSummaries = [...(input.exceptionSummaries ?? [])].filter(Boolean);

  const workpackConfidence =
    repeatedPathCount >= 3 && successCount >= repeatedPathCount
      ? Math.min(0.95, 0.5 + repeatedPathCount * 0.1)
      : 0;

  const workpackCandidates =
    workpackConfidence >= 0.7
      ? [
          {
            id: crypto.randomUUID(),
            title: `Reusable path for ${input.objective}`,
            confidence: workpackConfidence,
            evidenceRefs,
          },
        ]
      : [];

  const proposals: OrchestratorLearningProposal[] = [];

  if (successCount > 0) {
    proposals.push({
      id: crypto.randomUUID(),
      state: "generated",
      actionType: "skill_improvement",
      title: `Skill improvement for ${input.objective}`,
      summary:
        repeatedPathCount >= 3
          ? "This successful path is stable enough to capture as a reusable skill improvement brief."
          : "Capture the strongest reusable prompt, review steps, and evidence from this successful run.",
      confidence: Math.min(
        0.92,
        0.45 + Math.min(0.25, repeatedPathCount * 0.08) + Math.min(0.15, (input.finalArtifacts?.length ?? 0) * 0.03),
      ),
      dedupeKey: buildDedupeKey([
        "skill_improvement",
        input.objective,
        ...(input.finalArtifacts ?? []),
      ]),
      evidenceRefs,
      recommendedApprovalPath: "skill_studio_review",
      relatedRunId: input.runId,
      createdAt: generatedAt,
      updatedAt: generatedAt,
      metadata: {
        learningObjective: input.objective,
        repeatedPathCount,
        finalArtifacts: [...(input.finalArtifacts ?? [])],
        followUpAction: "improve_owned_skill",
      },
    });
  }

  if (exceptionSummaries.length > 0) {
    proposals.push({
      id: crypto.randomUUID(),
      state: "generated",
      actionType: "workflow_refinement",
      title: `Workflow refinement for ${input.objective}`,
      summary: exceptionSummaries.join(" "),
      confidence: Math.min(0.9, 0.45 + exceptionSummaries.length * 0.1),
      dedupeKey: buildDedupeKey([
        "workflow_refinement",
        input.objective,
        ...exceptionSummaries,
      ]),
      evidenceRefs,
      recommendedApprovalPath: "admin_review",
      relatedRunId: input.runId,
      createdAt: generatedAt,
      updatedAt: generatedAt,
      metadata: {
        learningObjective: input.objective,
        exceptionCount: exceptionSummaries.length,
      },
    });
  }

  if (workpackCandidates.length > 0) {
    proposals.push({
      id: crypto.randomUUID(),
      state: "generated",
      actionType: "workpack_candidate",
      title: `Workpack candidate for ${input.objective}`,
      summary: "This run appears stable enough to be packaged for reuse.",
      confidence: workpackCandidates[0].confidence,
      dedupeKey: buildDedupeKey([
        "workpack_candidate",
        input.objective,
        String(repeatedPathCount),
      ]),
      evidenceRefs,
      recommendedApprovalPath: "workpack_review",
      relatedRunId: input.runId,
      createdAt: generatedAt,
      updatedAt: generatedAt,
      metadata: {
        learningObjective: input.objective,
        repeatedPathCount,
        finalArtifacts: [...(input.finalArtifacts ?? [])],
      },
    });
  }

  return {
    workpackCandidates,
    proposals,
  };
}

const ALLOWED_TRANSITIONS: Record<
  OrchestratorLearningProposal["state"],
  readonly OrchestratorLearningProposal["state"][]
> = {
  generated: ["generated", "deduped", "triaged", "rejected", "expired", "superseded"],
  deduped: ["deduped", "triaged", "rejected", "expired", "superseded"],
  triaged: ["triaged", "accepted", "rejected", "expired", "superseded"],
  accepted: ["accepted", "scheduled", "applied", "rejected", "expired", "superseded"],
  scheduled: ["scheduled", "applied", "rejected", "expired", "superseded"],
  applied: ["applied"],
  rejected: ["rejected"],
  expired: ["expired"],
  superseded: ["superseded"],
};

export function transitionProposal(
  input: TransitionLearningProposalInput,
): OrchestratorLearningProposal {
  const allowedNextStates = ALLOWED_TRANSITIONS[input.proposal.state];
  if (!allowedNextStates.includes(input.nextState)) {
    throw new Error(
      `LEARNING_PROPOSAL_INVALID_TRANSITION:${input.proposal.state}->${input.nextState}`,
    );
  }

  return {
    ...input.proposal,
    state: input.nextState,
    updatedAt: toIsoDate(input.occurredAt),
    metadata: {
      ...input.proposal.metadata,
      lastTransitionReason: input.reason,
      lastTransitionActorUserId: input.actorUserId ?? null,
      lastTransitionEvidenceRefs: [...(input.evidenceRefs ?? [])],
    },
  };
}
