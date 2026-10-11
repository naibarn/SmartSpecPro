import type { JobControlPlane } from "./jobControlPlane";
import type {
  Spec224WorkspaceLifecycleReceiptReadInput,
  Spec224WorkspaceLifecycleReceiptReader,
  Spec224WorkspaceLifecycleReceiptReadResult,
} from "./spec224DevelopmentRunContracts";

type ReceiptKind = "convergence" | "retirement";

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function issuedReceipt(
  snapshot: Awaited<ReturnType<JobControlPlane["getJobSnapshot"]>>,
  input: Spec224WorkspaceLifecycleReceiptReadInput,
  kind: ReceiptKind
): Record<string, unknown> | null {
  if (!snapshot || snapshot.status !== "succeeded" || snapshot.jobType !== "workspace.authority.safe_action" ||
      snapshot.tenantId !== input.tenantId || snapshot.requestedByUserId !== input.actorId) return null;
  const jobInput = record(snapshot.input);
  const actionReceipt = record(record(snapshot.output)?.receipt);
  if (!jobInput || !actionReceipt || jobInput.tenantId !== input.tenantId || jobInput.actorId !== input.actorId ||
      jobInput.projectId !== input.projectId || jobInput.repositoryId !== input.repositoryRef.replace(/^repo:/, "") ||
      jobInput.action !== (kind === "convergence" ? "SYNC_WORKSPACE_SAFELY" : "RETIRE_SAFE_WORKTREE")) return null;
  if (actionReceipt.schemaVersion !== "workspace-authority-action-receipt.v1" ||
      actionReceipt.receiptId !== `workspace-action:${snapshot.jobId}` || actionReceipt.jobId !== snapshot.jobId ||
      actionReceipt.tenantId !== input.tenantId || actionReceipt.actorId !== input.actorId ||
      actionReceipt.projectId !== input.projectId ||
      actionReceipt.repositoryId !== input.repositoryRef.replace(/^repo:/, "") ||
      actionReceipt.action !== jobInput.action) return null;

  const actionEvidence = record(actionReceipt.evidence);
  const authorityReceipt = record(actionEvidence?.receipt);
  const expectedId = kind === "convergence" ? input.convergenceEvidenceRef : input.retirementEvidenceRef;
  const prefix = kind === "convergence" ? "workspace-convergence" : "worktree-retirement";
  const rawReceiptId = authorityReceipt?.receipt_id;
  if (typeof rawReceiptId !== "string") return null;
  const suffix = rawReceiptId.startsWith(`${prefix}:`) ? rawReceiptId.slice(prefix.length + 1) : rawReceiptId;
  if (`evidence:${prefix}:${suffix}` !== expectedId) return null;
  if (kind === "convergence" && actionEvidence?.status !== "USER_WORKSPACE_CONVERGED") return null;
  if (kind === "retirement" && actionEvidence?.status !== "WORKTREE_RETIRED") return null;

  const observedAt = Date.parse(String(actionReceipt.observedAt ?? ""));
  const authority = record(jobInput.authority);
  const snapshotObservedAt = Date.parse(String(authority?.snapshotObservedAt ?? ""));
  const snapshotExpiresAt = Date.parse(String(authority?.snapshotExpiresAt ?? ""));
  if (!Number.isFinite(observedAt) || !Number.isFinite(snapshotObservedAt) || !Number.isFinite(snapshotExpiresAt) ||
      snapshotObservedAt > observedAt || snapshotExpiresAt <= observedAt ||
      typeof authority?.runnerId !== "string" || !authority.runnerId ||
      typeof authority.snapshotRevision !== "string" || !authority.snapshotRevision ||
      actionReceipt.runnerId !== authority.runnerId ||
      actionReceipt.snapshotRevision !== authority.snapshotRevision ||
      actionReceipt.status !== actionEvidence?.status) return null;
  return authorityReceipt;
}

/**
 * Resolves receipt IDs through the existing canonical worker-job store. The
 * Python authority receipt is accepted only as the result of its successful,
 * tenant/actor/project/repository/action-bound Runner job.
 */
export function createSpec224WorkspaceLifecycleReceiptReader(
  controlPlane: Pick<JobControlPlane, "getJobSnapshot">
): Spec224WorkspaceLifecycleReceiptReader {
  return {
    async readPersistedReceipts(input): Promise<Spec224WorkspaceLifecycleReceiptReadResult> {
      if (!input.projectId || !input.canonicalRef || !input.integratedSha) {
        return { status: "PENDING", reason: "WORKSPACE_LIFECYCLE_TARGET_BINDING_MISSING" };
      }
      const [convergenceSnapshot, retirementSnapshot] = await Promise.all([
        controlPlane.getJobSnapshot(input.convergenceAuthorityJobId, {
          tenantId: input.tenantId,
          requestedByUserId: input.actorId,
        }),
        controlPlane.getJobSnapshot(input.retirementAuthorityJobId, {
          tenantId: input.tenantId,
          requestedByUserId: input.actorId,
        }),
      ]);
      const convergenceReceipt = issuedReceipt(convergenceSnapshot, input, "convergence");
      const retirementReceipt = issuedReceipt(retirementSnapshot, input, "retirement");
      if (!convergenceReceipt || !retirementReceipt) {
        return { status: "PENDING", reason: "WORKSPACE_LIFECYCLE_RECEIPT_NOT_AUTHORITY_ISSUED" };
      }
      if (convergenceReceipt.canonical_ref !== input.canonicalRef ||
          convergenceReceipt.integrated_sha !== input.integratedSha) {
        return { status: "PENDING", reason: "WORKSPACE_LIFECYCLE_RECEIPT_TARGET_STALE" };
      }
      return {
        status: "VERIFIED",
        convergenceReceipt,
        retirementReceipt,
        convergenceAuthorityJobId: input.convergenceAuthorityJobId,
        retirementAuthorityJobId: input.retirementAuthorityJobId,
        verifiedAt: new Date().toISOString(),
      };
    },
  };
}
