import { createHash } from "node:crypto";

type Binding = {
  runnerId: string; ownerUserId: number | null; activeSessionId: string | null;
  workspace: { workspaceId: string; projectId: string | null; repositoryId: string | null;
    gitHead: string | null; gitBranch: string | null; dirty: boolean | null; contentFingerprint: string | null };
};

/** Heartbeat revisions change even when the selected workspace does not.
 * Bind read/sync actions to complete identity/content facts instead. Fresh
 * ownership, revocation and lease checks remain the caller's responsibility. */
export function workspaceAuthorityBindingDigest(value: Binding): string | null {
  const workspace = value.workspace;
  if (!workspace || !value.runnerId || !Number.isSafeInteger(value.ownerUserId) ||
      !workspace.workspaceId || !workspace.projectId || !workspace.repositoryId ||
      !/^[a-f0-9]{40,64}$/.test(workspace.gitHead ?? "") || typeof workspace.dirty !== "boolean" ||
      !/^[a-f0-9]{64}$/.test(workspace.contentFingerprint ?? "")) return null;
  return createHash("sha256").update(JSON.stringify({ runnerId: value.runnerId, ownerUserId: value.ownerUserId,
    activeSessionId: value.activeSessionId, workspaceId: workspace.workspaceId, projectId: workspace.projectId,
    repositoryId: workspace.repositoryId, gitHead: workspace.gitHead, gitBranch: workspace.gitBranch,
    dirty: workspace.dirty, contentFingerprint: workspace.contentFingerprint })).digest("hex");
}
