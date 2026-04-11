import type { RoleImprovementProposal } from "../../shared/roleAgentContracts";
import { createRoleId, getRoleAgentDetail, saveRoleImprovementProposal } from "./rolePersistence";

function nowIso(): string {
  return new Date().toISOString();
}

export async function generateRoleImprovementProposals(roleId: string): Promise<RoleImprovementProposal[]> {
  const detail = await getRoleAgentDetail(roleId);
  if (!detail) {
    throw new Error(`Unknown role: ${roleId}`);
  }

  const latestMetric = detail.metricSnapshots[0] ?? null;
  const proposals = [];

  if (detail.exceptionBindings.length >= 3) {
    proposals.push(await saveRoleImprovementProposal({
      id: createRoleId("rip"),
      tenantId: detail.role.tenantId,
      roleId: detail.role.id,
      routineId: detail.exceptionBindings[0]?.routineId ?? null,
      targetType: "connector_map",
      riskClass: "medium",
      authorityImpact: "configuration_only",
      expectedBenefit: "Reduce repeated exception triage through tighter connector mappings.",
      evidenceRefs: detail.exceptionBindings.slice(0, 5).map((binding) => binding.workpackExceptionId),
      suggestedChange: {
        action: "review_connector_maps",
        exceptionCount: detail.exceptionBindings.length,
      },
      autoApplyEligible: false,
      status: "pending",
      createdAt: nowIso(),
      updatedAt: nowIso(),
    }));
  }

  if (latestMetric && latestMetric.replayPassRate < 0.85) {
    proposals.push(await saveRoleImprovementProposal({
      id: createRoleId("rip"),
      tenantId: detail.role.tenantId,
      roleId: detail.role.id,
      routineId: latestMetric.routineId ?? null,
      targetType: "workpack_version_preference",
      riskClass: "high",
      authorityImpact: "none",
      expectedBenefit: "Prefer a more stable workpack version until replay quality recovers.",
      evidenceRefs: detail.routineRuns.slice(0, 3).map((run) => run.id),
      suggestedChange: {
        action: "pin_previous_ready_version",
        replayPassRate: latestMetric.replayPassRate,
      },
      autoApplyEligible: false,
      status: "pending",
      createdAt: nowIso(),
      updatedAt: nowIso(),
    }));
  }

  if (latestMetric && latestMetric.checkpointFreshnessTier !== "fresh") {
    proposals.push(await saveRoleImprovementProposal({
      id: createRoleId("rip"),
      tenantId: detail.role.tenantId,
      roleId: detail.role.id,
      routineId: latestMetric.routineId ?? null,
      targetType: "operator_guidance",
      riskClass: "low",
      authorityImpact: "none",
      expectedBenefit: "Reduce checkpoint churn by tightening checkpoint cadence guidance.",
      evidenceRefs: detail.checkpoints.slice(0, 3).map((checkpoint) => checkpoint.id),
      suggestedChange: {
        action: "increase_checkpoint_frequency",
        freshnessTier: latestMetric.checkpointFreshnessTier,
      },
      autoApplyEligible: true,
      status: "pending",
      createdAt: nowIso(),
      updatedAt: nowIso(),
    }));
  }

  return proposals;
}
