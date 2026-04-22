import type {
  ApprovalSourceSnapshot,
  ExecutionBudgetEnvelope,
  PreflightApprovalBundle,
  PreflightRevisionFingerprint,
  TeamExecutionPlan,
  TeamResolutionDecision,
} from "../../shared/workOrchestrator";
import { preflightApprovalBundleSchema } from "../../shared/workOrchestrator";
import type { RunPlanArtifact } from "./monitoringService";
import { buildRuntimeDispatchPolicy } from "./workOrchestratorSecurityPolicy";

export interface ApprovedPlanBundleSnapshot {
  bundle: PreflightApprovalBundle;
  executionPlan: TeamExecutionPlan;
  approvalSnapshots: ApprovalSourceSnapshot[];
  budget: ExecutionBudgetEnvelope;
  teamResolution: TeamResolutionDecision;
  preflightRevision: PreflightRevisionFingerprint;
}

function parseBundleCandidate(value: unknown): PreflightApprovalBundle | null {
  const parsed = preflightApprovalBundleSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

function extractBundleCandidate(value: unknown): PreflightApprovalBundle | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const record = value as Record<string, unknown>;
  const directBundle = parseBundleCandidate(record.preflightBundle ?? null);
  if (directBundle) {
    return directBundle;
  }

  const workOrchestrator = record.workOrchestrator;
  if (workOrchestrator && typeof workOrchestrator === "object") {
    return parseBundleCandidate(
      (workOrchestrator as Record<string, unknown>).preflightBundle ?? null,
    );
  }

  return parseBundleCandidate(value);
}

export function getApprovedPlanForRun(input: {
  constraintsJson?: Record<string, unknown> | null;
  approvalPolicyJson?: Record<string, unknown> | null;
}): ApprovedPlanBundleSnapshot | null {
  const bundle =
    extractBundleCandidate(input.constraintsJson ?? null) ??
    extractBundleCandidate(input.approvalPolicyJson ?? null);

  if (!bundle || bundle.state !== "approved" && bundle.state !== "launching" && bundle.state !== "launched") {
    return null;
  }
  if (!bundle.executionPlan || !bundle.teamResolution || !bundle.budget) {
    return null;
  }

  return {
    bundle,
    executionPlan: bundle.executionPlan,
    approvalSnapshots: bundle.approvalSnapshots,
    budget: bundle.budget,
    teamResolution: bundle.teamResolution,
    preflightRevision: bundle.preflightRevision,
  };
}

export function buildApprovedPlanProjectState(
  snapshot: ApprovedPlanBundleSnapshot,
): Record<string, unknown> {
  return {
    version: 1,
    source: "work_os",
    objective:
      snapshot.bundle.brief.objective ??
      snapshot.bundle.brief.summary ??
      snapshot.bundle.brief.title,
    steps: snapshot.executionPlan.steps.map(step => ({
      stepKey: step.stepKey ?? step.id,
      title: step.title,
      objective: step.objective,
      deliverable: step.expectedArtifacts.join(", "),
      status: "planned",
      surface: step.surface,
      selectedCapabilityId: step.capabilityId ?? null,
      governance: step.governance,
      contractCompatibility: step.contractCompatibility,
      runtimeDispatchPolicy: buildRuntimeDispatchPolicy({
        step,
        budget: snapshot.budget,
        inputFingerprint: snapshot.preflightRevision.fingerprint,
      }),
    })),
    preflightBundleId: snapshot.bundle.id,
    teamResolution: snapshot.teamResolution,
    budget: snapshot.budget,
    sourceRefs: snapshot.bundle.brief.sourceRefs,
  };
}

export function buildApprovedRunPlanArtifact(input: {
  snapshot: ApprovedPlanBundleSnapshot;
  runId: string;
  roomId: string;
  teamId: string;
}): RunPlanArtifact {
  return {
    version: 1,
    runId: input.runId,
    roomId: input.roomId,
    teamId: input.teamId,
    caseId: input.snapshot.bundle.caseId,
    requestId: input.snapshot.bundle.requestId ?? null,
    objective:
      input.snapshot.bundle.brief.objective ??
      input.snapshot.bundle.brief.summary ??
      input.snapshot.bundle.brief.title,
    source: "work_os",
    status: "ready",
    generatedAt: input.snapshot.bundle.createdAt,
    lastUpdatedAt: input.snapshot.bundle.updatedAt,
    steps: input.snapshot.executionPlan.steps.map(step => ({
      stepKey: step.stepKey ?? step.id,
      title: step.title,
      objective: step.objective,
      deliverable: step.expectedArtifacts.join(", ") || step.title,
      ownerPersona: step.surface.replace(/_/g, " "),
      ownerMemberId: null,
      reviewerPersona: "Work OS reviewer",
      reviewerMemberId: null,
      verificationMethod: step.governance.approvalRequired
        ? "approval_snapshot"
        : "runtime_review",
      retryRule:
        step.governance.autoExecutableByDefault && !step.governance.approvalRequired
          ? "bounded_auto_retry"
          : "manual_review_required",
      evidenceRequirements: step.expectedArtifacts,
      qualityCriteria: step.expectedArtifacts.map(
        artifact => `Evidence captured for ${artifact}`,
      ),
      reviewChecklist: [
        "planned_surface_matches_preflight",
        "governance_state_preserved",
      ],
      status: "planned",
      evidenceRefs: input.snapshot.approvalSnapshots.map(
        snapshot => `source:${snapshot.source.sourceId}`,
      ),
      notes:
        step.contractCompatibility.state === "compatible"
          ? null
          : String(step.contractCompatibility.reasonCode ?? "blocked"),
      surface: step.surface,
      selectedCapabilityId: step.capabilityId ?? null,
      runtimeDispatchPolicy: buildRuntimeDispatchPolicy({
        step,
        budget: input.snapshot.budget,
        inputFingerprint: input.snapshot.preflightRevision.fingerprint,
      }),
    }) as any),
    evidenceRefs: input.snapshot.approvalSnapshots.map(
      snapshot => `source:${snapshot.source.sourceId}`,
    ),
    planEvidenceRefs: input.snapshot.approvalSnapshots.map(
      snapshot => `source:${snapshot.source.sourceId}`,
    ),
    reviewerMatrix: [
      {
        riskClass: "medium",
        reviewerPersona: "Work OS reviewer",
        escalationRule: "Fail closed on drift, authority, or compatibility loss.",
      },
    ],
    exploration: null,
    review: {
      status: "passed",
      iteration: 1,
      reviewedAt: input.snapshot.bundle.approvedAt ?? input.snapshot.bundle.updatedAt,
      reviewerPersona: "Work OS preflight",
      issues: [],
      score: 1,
      recommendation: "Use the approved Work OS execution plan as the starting graph.",
    },
  };
}
