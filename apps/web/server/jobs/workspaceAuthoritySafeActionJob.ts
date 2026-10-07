import { execFile } from "node:child_process";
import { promisify } from "node:util";
import os from "node:os";
import path from "node:path";

import { enqueueWorkspaceAuthorityAuditEvent } from "./workspaceAuthorityAuditJob";
import type { WorkspaceAuthorityAction } from "../services/workspaceAuthoritySafeActions";

const execFileAsync = promisify(execFile);

type ActionInput = {
  jobId: string;
  tenantId: string;
  actorId: number;
  projectId: string;
  repositoryId: string;
  workspaceId: string | null;
  action: WorkspaceAuthorityAction;
  payload: Record<string, unknown>;
  authority: { runnerId: string; snapshotRevision: string | null };
};

function safeEvidence(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(safeEvidence);
  if (!value || typeof value !== "object") return value;
  const blocked = new Set(["path", "location", "previous_path", "workspace_location", "recovery_path", "manifest"]);
  return Object.fromEntries(Object.entries(value as Record<string, unknown>)
    .filter(([key]) => !blocked.has(key.toLowerCase()))
    .map(([key, child]) => [key, safeEvidence(child)]));
}

function requiredRepository(env: NodeJS.ProcessEnv): string {
  const repository = env.SMARTSPEC_WORKSPACE_AUTHORITY_REPOSITORY?.trim();
  if (!repository) throw new Error("WORKSPACE_AUTHORITY_EXECUTION_NOT_CONFIGURED");
  return path.resolve(repository);
}

async function runAuthority(repository: string, env: NodeJS.ProcessEnv, args: string[]) {
  const { stdout } = await execFileAsync(env.SMARTSPEC_PYTHON_EXECUTABLE?.trim() || "python3", [
    path.join(repository, "scripts", "development-lifecycle", "workspace_authority.py"),
    ...args,
    "--repository", repository,
  ], { cwd: repository, timeout: 120_000, maxBuffer: 2 * 1024 * 1024 });
  const parsed = JSON.parse(stdout) as Record<string, unknown>;
  return parsed;
}

type PullRequestFact = {
  state?: unknown; isDraft?: unknown; baseRefName?: unknown; baseRefOid?: unknown;
  headRefOid?: unknown; mergeable?: unknown; mergeStateStatus?: unknown;
  mergedAt?: unknown; mergeCommit?: { oid?: unknown } | null;
};

async function canonicalGithubRepository(repository: string): Promise<string> {
  const [remote] = await execFileAsync("git", ["remote", "get-url", "origin"], { cwd: repository, timeout: 10_000 });
  const remoteUrl = remote.trim();
  const sshRemote = /^git@github\.com:([^/]+\/[^/]+?)(?:\.git)?$/.exec(remoteUrl);
  let repositorySlug = sshRemote?.[1]?.replace(/\.git$/, "");
  if (!repositorySlug) {
    try {
      const parsedRemote = new URL(remoteUrl);
      if (parsedRemote.hostname.toLowerCase() === "github.com" && !parsedRemote.username && !parsedRemote.password)
        repositorySlug = parsedRemote.pathname.replace(/^\//, "").replace(/\.git$/, "");
    } catch { /* malformed or non-GitHub remote */ }
  }
  if (!repositorySlug || !/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repositorySlug))
    throw new Error("WORKSPACE_ACTION_CANONICAL_REPOSITORY_UNAVAILABLE");
  return repositorySlug;
}

async function inspectPullRequest(repository: string, number: number): Promise<PullRequestFact> {
  const { stdout } = await execFileAsync("gh", ["pr", "view", String(number), "--json", "state,isDraft,baseRefName,baseRefOid,headRefOid,mergeable,mergeStateStatus"], {
    cwd: repository, timeout: 30_000, maxBuffer: 256 * 1024,
  });
  return JSON.parse(stdout) as PullRequestFact;
}

async function mergePullRequest(repository: string, repositorySlug: string, number: number, headSha: string) {
  const { stdout } = await execFileAsync("gh", [
    "api", "-X", "PUT", `repos/${repositorySlug}/pulls/${number}/merge`,
    "-f", "merge_method=merge", "-f", `sha=${headSha}`,
  ], { cwd: repository, timeout: 60_000, maxBuffer: 256 * 1024 });
  return JSON.parse(stdout) as Record<string, unknown>;
}

async function integratePullRequest(
  repository: string,
  input: ActionInput,
  env: NodeJS.ProcessEnv,
  executeAuthority: typeof runAuthority,
  github: {
    repository: (root: string) => Promise<string>;
    inspect: (root: string, number: number) => Promise<PullRequestFact>;
    merge: (root: string, slug: string, number: number, headSha: string) => Promise<Record<string, unknown>>;
  },
) {
  const number = input.payload.pullRequestNumber;
  if (!Number.isSafeInteger(number) || (number as number) <= 0)
    throw new Error("WORKSPACE_ACTION_PULL_REQUEST_INVALID");
  const authority = await executeAuthority(repository, env, ["resolve"]);
  if (authority.project_id !== input.projectId || authority.repository_id !== input.repositoryId)
    throw new Error("WORKSPACE_ACTION_PROJECT_BINDING_MISMATCH");
  const canonicalBranch = typeof authority.canonical_ref === "string"
    ? authority.canonical_ref.replace(/^refs\/heads\//, "") : "";
  if (!canonicalBranch) throw new Error("WORKSPACE_ACTION_CANONICAL_REF_UNAVAILABLE");
  const repositorySlug = await github.repository(repository);
  const pr = await github.inspect(repository, number);
  if (pr.baseRefName !== canonicalBranch || typeof pr.headRefOid !== "string" || !/^[a-f0-9]{40,64}$/.test(pr.headRefOid))
    throw new Error("WORKSPACE_ACTION_PULL_REQUEST_NOT_MERGEABLE");
  if (typeof input.payload.expectedHeadSha !== "string" || input.payload.expectedHeadSha !== pr.headRefOid)
    throw new Error("WORKSPACE_ACTION_PULL_REQUEST_HEAD_STALE");
  let merged: Record<string, unknown>;
  if (pr.state === "MERGED" && typeof pr.mergedAt === "string" &&
      typeof pr.mergeCommit?.oid === "string" && /^[a-f0-9]{40,64}$/.test(pr.mergeCommit.oid)) {
    merged = { merged: true, sha: pr.mergeCommit.oid };
  } else {
    if (pr.state !== "OPEN" || pr.isDraft === true || pr.mergeable !== true ||
        !["CLEAN", "HAS_HOOKS"].includes(String(pr.mergeStateStatus)))
      throw new Error("WORKSPACE_ACTION_PULL_REQUEST_NOT_MERGEABLE");
    merged = await github.merge(repository, repositorySlug, number, pr.headRefOid);
  if (merged.merged !== true || typeof merged.sha !== "string" || !/^[a-f0-9]{40,64}$/.test(merged.sha))
    throw new Error("WORKSPACE_ACTION_PULL_REQUEST_MERGE_UNCONFIRMED");
  }
  await enqueueWorkspaceAuthorityAuditEvent({
    tenantId: input.tenantId,
    eventType: "INTEGRATION_FINISH",
    eventId: `pull-request:${number}:${merged.sha}`,
  });
  const integratedSha = merged.sha as string;
  const convergence = await executeAuthority(repository, env, ["converge", "--integrated-sha", integratedSha]);
  return { status: "INTEGRATION_RECORDED", pullRequestNumber: number, integratedSha, convergence };
}

/** Canonical worker_jobs executor; all Git/worktree operations stay outside the API request path. */
export async function executeWorkspaceAuthoritySafeAction(
  input: ActionInput,
  env: NodeJS.ProcessEnv = process.env,
  dependencies: {
    runAuthority?: typeof runAuthority;
    github?: {
      repository: (root: string) => Promise<string>;
      inspect: (root: string, number: number) => Promise<PullRequestFact>;
      merge: (root: string, slug: string, number: number, headSha: string) => Promise<Record<string, unknown>>;
    };
    hostname?: () => string;
    now?: () => Date;
  } = {},
) {
  const executeAuthority = dependencies.runAuthority ?? runAuthority;
  const github = dependencies.github ?? { repository: canonicalGithubRepository, inspect: inspectPullRequest, merge: mergePullRequest };
  const repository = requiredRepository(env);
  const resolved = await executeAuthority(repository, env, ["resolve"]);
  if (resolved.project_id !== input.projectId || resolved.repository_id !== input.repositoryId)
    throw new Error("WORKSPACE_ACTION_PROJECT_BINDING_MISMATCH");
  const workspaces = Array.isArray(resolved.workspaces) ? resolved.workspaces as Array<Record<string, unknown>> : [];
  const target = input.workspaceId ? workspaces.find(row => row.workspace_id === input.workspaceId) : null;
  if (input.workspaceId && !target) throw new Error("WORKSPACE_ACTION_LOCAL_AUTHORITY_NOT_FOUND");

  let result: Record<string, unknown>;
  if (input.action === "INTEGRATE_COMPLETED_WORK") {
    result = await integratePullRequest(repository, input, env, executeAuthority, github);
  } else if (input.action === "SYNC_WORKSPACE_SAFELY") {
    result = await executeAuthority(repository, env, ["converge", ...(typeof input.payload.integratedSha === "string" ? ["--integrated-sha", input.payload.integratedSha] : [])]);
  } else if (input.action === "INSPECT_LOCAL_CHANGES") {
    const audit = await executeAuthority(repository, env, ["collect", "--mode", "AUDIT_ONLY"]);
    const rows = Array.isArray(audit.workspaces) ? audit.workspaces as Array<Record<string, unknown>> : [];
    result = { status: audit.status, workspace: rows.find(row => row.workspace_id === input.workspaceId) ?? null };
  } else if (input.action === "OPEN_CANONICAL_WORKSPACE") {
    result = { status: "CANONICAL_WORKSPACE_RESOLVED", projectId: resolved.project_id,
      repositoryId: resolved.repository_id, canonicalRef: resolved.canonical_ref,
      canonicalSha: resolved.canonical_sha, workspaceId: resolved.canonical_workspace_id };
  } else if (input.action === "RECOVER_WORK") {
    result = await executeAuthority(repository, env, ["preserve", "--workspace-id", input.workspaceId ?? ""]);
  } else if (input.action === "RETIRE_SAFE_WORKTREE") {
    result = await executeAuthority(repository, env, ["retire", "--workspace-id", input.workspaceId ?? "", "--apply"]);
  } else {
    result = await executeAuthority(repository, env, ["verify",
      ...(typeof input.payload.integratedSha === "string" ? ["--integrated-sha", input.payload.integratedSha] : []),
      ...(input.workspaceId ? ["--workspace-id", input.workspaceId] : []),
    ]);
  }

  if (input.action === "RECOVER_WORK" && result.status === "DIRTY_WORK_PRESERVED" &&
      typeof result.workspace_id === "string" && typeof result.manifest_sha256 === "string") {
    await enqueueWorkspaceAuthorityAuditEvent({
      tenantId: input.tenantId,
      eventType: "RECOVERY_ARCHIVE_COMPLETE",
      eventId: `${result.workspace_id}:${result.manifest_sha256}`,
    });
  }
  if (input.action === "SYNC_WORKSPACE_SAFELY" && result.status === "USER_WORKSPACE_CONVERGED" &&
      result.receipt && typeof result.receipt === "object" &&
      typeof (result.receipt as Record<string, unknown>).receipt_id === "string") {
    await enqueueWorkspaceAuthorityAuditEvent({
      tenantId: input.tenantId,
      eventType: "CANONICAL_CONVERGENCE_SUCCESS",
      eventId: (result.receipt as Record<string, unknown>).receipt_id as string,
    });
  }

  const status = typeof result.status === "string" ? result.status : "UNKNOWN";
  const receipt = {
    schemaVersion: "workspace-authority-action-receipt.v1",
    receiptId: `workspace-action:${input.jobId}`,
    jobId: input.jobId,
    tenantId: input.tenantId,
    actorId: input.actorId,
    projectId: input.projectId,
    repositoryId: input.repositoryId,
    workspaceId: input.workspaceId,
    action: input.action,
    status,
    runnerId: input.authority.runnerId,
    snapshotRevision: input.authority.snapshotRevision,
    executionHost: (dependencies.hostname ?? os.hostname)(),
    observedAt: (dependencies.now ?? (() => new Date()))().toISOString(),
    evidence: safeEvidence(result),
  };
  return { output: { receipt } };
}
