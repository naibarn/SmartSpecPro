import {
  assertEditorialEvidence,
  assertExecutableEditPlan,
  computeEditorialContractHash,
  type EditorialEvidenceBundle,
  type EditorialIntentPlan,
  type ExecutableEditPlan,
} from "@smartspec/shared";
import { validateEditorialIntent } from "./editorialIntentService";
import { validateEditorialSafety } from "./editorialSafetyValidator";

export async function compileEditorialIntent(input: {
  snapshotId: string;
  evidence: EditorialEvidenceBundle;
  intent: EditorialIntentPlan;
  policyVersion: string;
}): Promise<ExecutableEditPlan & { reviewRequired: boolean }> {
  const evidence = assertEditorialEvidence(input.evidence);
  const intent = validateEditorialIntent(input.intent);
  if (evidence.status !== "available")
    throw new Error("EVIDENCE_NOT_EXECUTABLE");
  if (
    intent.snapshotId !== input.snapshotId ||
    intent.snapshotId !== evidence.snapshotId ||
    intent.policyVersion !== input.policyVersion
  )
    throw new Error("INTENT_BINDING_STALE");
  validateEditorialSafety(intent.operations, { protectedRanges: [] });
  const operations = [...intent.operations]
    .sort((left, right) => left.id.localeCompare(right.id))
    .map(operation => ({
      ...operation,
      dependsOn: [...(operation.dependsOn ?? [])].sort(),
    }));
  const planSeed = {
    snapshotId: input.snapshotId,
    evidenceHash: evidence.evidenceHash,
    policyVersion: input.policyVersion,
    operations,
  };
  const planHash = await computeEditorialContractHash(planSeed);
  const plan = {
    schemaVersion: "editorial.executable_plan.v1" as const,
    planId: `plan-${planHash.slice(0, 24)}`,
    planHash,
    tenantId: intent.tenantId,
    projectId: intent.projectId,
    revisionId: intent.revisionId,
    snapshotId: input.snapshotId,
    operations,
    outputRoles: ["preview", "final_video"],
    validatorVersion: "editorial-safety.v1",
  };
  assertExecutableEditPlan(plan);
  return { ...plan, reviewRequired: intent.reviewRequired };
}
