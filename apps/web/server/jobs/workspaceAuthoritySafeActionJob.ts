import { execFile } from "node:child_process";
import { promisify } from "node:util";
import os from "node:os";
import path from "node:path";

import { enqueueWorkspaceAuthorityAuditEvent } from "./workspaceAuthorityAuditJob";
import { canonicalGithubRepository } from "./workspaceAuthorityGithub";
import {
  resolveOwnedWorkspaceAuthority,
  type WorkspaceAuthorityAction,
} from "../services/workspaceAuthoritySafeActions";

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
  authority: {
    runnerId: string;
    snapshotRevision: string | null;
    snapshotObservedAt: string | null;
    snapshotExpiresAt: string | null;
  };
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

type RequiredCheck = { context: string; integrationId: number | null };
type CheckRunFact = {
  name: string; status: string; conclusion: string | null; integrationId: number | null;
  startedAt?: string | null; completedAt?: string | null;
};
type CommitStatusFact = { context: string; state: string; updatedAt?: string | null; createdAt?: string | null };
type CheckGateEvidence = {
  state: "NO_REQUIRED_CHECKS_CONFIGURED" | "REQUIRED_CHECKS_PASSED" | "REQUIRED_CHECKS_NOT_PASSED" | "ALREADY_MERGED";
  headSha: string;
  requiredChecks: Array<{ context: string; integrationId: number | null; state: string }>;
  observedChecks: Array<{ context: string; source: "check_run" | "commit_status"; state: string }>;
};

async function inspectPullRequest(repository: string, number: number): Promise<PullRequestFact> {
  const { stdout } = await execFileAsync("gh", ["pr", "view", String(number), "--json", "state,isDraft,baseRefName,baseRefOid,headRefOid,mergeable,mergeStateStatus,mergedAt,mergeCommit"], {
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

async function githubApiJson(repository: string, endpoint: string): Promise<unknown> {
  try {
    const { stdout } = await execFileAsync("gh", ["api", endpoint], {
      cwd: repository, timeout: 30_000, maxBuffer: 1024 * 1024,
    });
    return JSON.parse(stdout) as unknown;
  } catch (error) {
    const stderr = error && typeof error === "object" && "stderr" in error
      ? String((error as { stderr?: unknown }).stderr ?? "") : "";
    if (endpoint.includes("/branches/") && endpoint.endsWith("/protection/required_status_checks") &&
        /Branch not protected.*404/i.test(stderr)) return null;
    throw new Error("WORKSPACE_ACTION_CHECK_POLICY_UNAVAILABLE");
  }
}

export function readRequiredChecks(rulesValue: unknown, protectionValue: unknown): RequiredCheck[] {
  if (!Array.isArray(rulesValue)) throw new Error("WORKSPACE_ACTION_CHECK_POLICY_UNAVAILABLE");
  const checks: RequiredCheck[] = [];
  const add = (context: unknown, integrationId: unknown) => {
    if (typeof context !== "string" || !context.trim() ||
        (integrationId !== null && integrationId !== undefined &&
          (!Number.isSafeInteger(integrationId) || (integrationId as number) < -1)))
      throw new Error("WORKSPACE_ACTION_CHECK_POLICY_UNAVAILABLE");
    checks.push({
      context: context.trim(),
      integrationId: Number.isSafeInteger(integrationId) && (integrationId as number) > 0
        ? integrationId as number : null,
    });
  };

  for (const rule of rulesValue) {
    if (!rule || typeof rule !== "object") throw new Error("WORKSPACE_ACTION_CHECK_POLICY_UNAVAILABLE");
    const record = rule as Record<string, unknown>;
    if (record.type !== "required_status_checks") continue;
    if (!record.parameters || typeof record.parameters !== "object")
      throw new Error("WORKSPACE_ACTION_CHECK_POLICY_UNAVAILABLE");
    const configured = (record.parameters as Record<string, unknown>).required_status_checks;
    if (!Array.isArray(configured)) throw new Error("WORKSPACE_ACTION_CHECK_POLICY_UNAVAILABLE");
    for (const item of configured) {
      if (!item || typeof item !== "object") throw new Error("WORKSPACE_ACTION_CHECK_POLICY_UNAVAILABLE");
      const check = item as Record<string, unknown>;
      add(check.context, check.integration_id);
    }
  }

  if (protectionValue !== null) {
    if (!protectionValue || typeof protectionValue !== "object")
      throw new Error("WORKSPACE_ACTION_CHECK_POLICY_UNAVAILABLE");
    const protection = protectionValue as Record<string, unknown>;
    const configured = protection.checks;
    if (!Array.isArray(configured) || !Array.isArray(protection.contexts))
      throw new Error("WORKSPACE_ACTION_CHECK_POLICY_UNAVAILABLE");
    for (const item of configured) {
      if (!item || typeof item !== "object") throw new Error("WORKSPACE_ACTION_CHECK_POLICY_UNAVAILABLE");
      const check = item as Record<string, unknown>;
      add(check.context, check.app_id);
    }
    for (const context of protection.contexts) add(context, null);
  }

  return [...new Map(checks.map(check => [`${check.context}\0${check.integrationId ?? "*"}`, check])).values()];
}

function checkConclusionState(status: string, conclusion: string | null): string {
  if (status !== "completed") return "pending";
  if (conclusion === "success") return "success";
  if (conclusion === "skipped") return "skipped";
  return conclusion || "missing_conclusion";
}

function latestFacts<T>(facts: T[], keyFor: (fact: T) => string, timeFor: (fact: T) => string | null | undefined): T[] {
  const groups = new Map<string, T[]>();
  for (const fact of facts) {
    const key = keyFor(fact);
    groups.set(key, [...(groups.get(key) ?? []), fact]);
  }
  return [...groups.values()].flatMap(group => {
    if (group.length < 2) return group;
    const timed = group.map(fact => ({ fact, time: Date.parse(timeFor(fact) ?? "") }));
    // Old/synthetic facts without timestamps remain fail-closed. The GitHub
    // adapters provide these timestamps for real reruns.
    if (timed.some(item => !Number.isFinite(item.time))) return group;
    const latest = Math.max(...timed.map(item => item.time));
    return timed.filter(item => item.time === latest).map(item => item.fact);
  });
}

export function evaluateRequiredCheckGate(input: {
  headSha: string;
  requiredChecks: RequiredCheck[];
  checkRuns: CheckRunFact[];
  commitStatuses: CommitStatusFact[];
}): CheckGateEvidence {
  const observedChecks = [
    ...input.checkRuns.map(run => ({
      context: run.name,
      source: "check_run" as const,
      state: checkConclusionState(run.status, run.conclusion),
    })),
    ...input.commitStatuses.map(status => ({
      context: status.context,
      source: "commit_status" as const,
      state: status.state,
    })),
  ].slice(0, 200);

  if (input.requiredChecks.length === 0) {
    return {
      state: "NO_REQUIRED_CHECKS_CONFIGURED",
      headSha: input.headSha,
      requiredChecks: [],
      observedChecks,
    };
  }

  const requiredChecks = input.requiredChecks.map(required => {
    const matchingRuns = latestFacts(input.checkRuns.filter(run => run.name === required.context &&
      (required.integrationId === null || run.integrationId === required.integrationId)),
    run => `${run.name}\0${run.integrationId ?? "*"}`, run => run.startedAt ?? run.completedAt);
    const matchingStatuses = required.integrationId === null
      ? input.commitStatuses.filter(status => status.context === required.context)
      : [];
    const latestStatuses = latestFacts(matchingStatuses, status => status.context,
      status => status.updatedAt ?? status.createdAt);
    const states = [
      ...matchingRuns.map(run => checkConclusionState(run.status, run.conclusion)),
      ...latestStatuses.map(status => status.state),
    ];
    const state = states.length === 0 ? "missing"
      : states.every(value => value === "success") ? "success"
        : states.includes("skipped") ? "skipped"
          : states.includes("pending") ? "pending" : "failed";
    return {
      context: required.context,
      integrationId: required.integrationId,
      state,
    };
  });
  return {
    state: requiredChecks.every(check => check.state === "success")
      ? "REQUIRED_CHECKS_PASSED" : "REQUIRED_CHECKS_NOT_PASSED",
    headSha: input.headSha,
    requiredChecks,
    observedChecks,
  };
}

async function inspectCheckGate(
  repository: string,
  repositorySlug: string,
  baseBranch: string,
  headSha: string,
): Promise<CheckGateEvidence> {
  const encodedBranch = encodeURIComponent(baseBranch);
  const [rules, protection, runsValue, statusesValue] = await Promise.all([
    githubApiJson(repository, `repos/${repositorySlug}/rules/branches/${encodedBranch}`),
    githubApiJson(repository, `repos/${repositorySlug}/branches/${encodedBranch}/protection/required_status_checks`),
    githubApiJson(repository, `repos/${repositorySlug}/commits/${headSha}/check-runs?per_page=100`),
    githubApiJson(repository, `repos/${repositorySlug}/commits/${headSha}/status?per_page=100`),
  ]);
  if (!runsValue || typeof runsValue !== "object" ||
      !Array.isArray((runsValue as Record<string, unknown>).check_runs) ||
      !statusesValue || typeof statusesValue !== "object" ||
      !Array.isArray((statusesValue as Record<string, unknown>).statuses))
    throw new Error("WORKSPACE_ACTION_CHECK_POLICY_UNAVAILABLE");
  const checkRuns = ((runsValue as Record<string, unknown>).check_runs as unknown[]).flatMap(value => {
      if (!value || typeof value !== "object") return [];
      const run = value as Record<string, unknown>;
      return typeof run.name === "string" && typeof run.status === "string"
        ? [{ name: run.name, status: run.status, conclusion: typeof run.conclusion === "string" ? run.conclusion : null,
            integrationId: run.app && typeof run.app === "object" && Number.isSafeInteger((run.app as Record<string, unknown>).id)
              ? (run.app as Record<string, unknown>).id as number : null,
            startedAt: typeof run.started_at === "string" ? run.started_at : null,
            completedAt: typeof run.completed_at === "string" ? run.completed_at : null }]
        : [];
    });
  const commitStatuses = ((statusesValue as Record<string, unknown>).statuses as unknown[]).flatMap(value => {
      if (!value || typeof value !== "object") return [];
      const status = value as Record<string, unknown>;
      return typeof status.context === "string" && typeof status.state === "string"
        ? [{ context: status.context, state: status.state,
            updatedAt: typeof status.updated_at === "string" ? status.updated_at : null,
            createdAt: typeof status.created_at === "string" ? status.created_at : null }] : [];
    });
  const evidence = evaluateRequiredCheckGate({
    headSha,
    requiredChecks: readRequiredChecks(rules, protection),
    checkRuns,
    commitStatuses,
  });
  if (evidence.state === "REQUIRED_CHECKS_NOT_PASSED")
    throw new Error(`WORKSPACE_ACTION_REQUIRED_CHECKS_NOT_PASSED:${JSON.stringify(evidence.requiredChecks)}`);
  return evidence;
}

async function integratePullRequest(
  repository: string,
  input: ActionInput,
  env: NodeJS.ProcessEnv,
  executeAuthority: typeof runAuthority,
  github: {
    repository: (root: string) => Promise<string>;
    inspect: (root: string, number: number) => Promise<PullRequestFact>;
    checkGate: (root: string, slug: string, baseBranch: string, headSha: string) => Promise<CheckGateEvidence>;
    merge: (root: string, slug: string, number: number, headSha: string) => Promise<Record<string, unknown>>;
  },
  assertActive: () => Promise<void>,
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
  let checkGate: CheckGateEvidence;
  if (pr.state === "MERGED" && typeof pr.mergedAt === "string" &&
      typeof pr.mergeCommit?.oid === "string" && /^[a-f0-9]{40,64}$/.test(pr.mergeCommit.oid)) {
    merged = { merged: true, sha: pr.mergeCommit.oid };
    checkGate = { state: "ALREADY_MERGED", headSha: pr.headRefOid, requiredChecks: [], observedChecks: [] };
  } else {
    if (pr.state !== "OPEN" || pr.isDraft === true || pr.mergeable !== true ||
        !["CLEAN", "HAS_HOOKS"].includes(String(pr.mergeStateStatus)))
      throw new Error("WORKSPACE_ACTION_PULL_REQUEST_NOT_MERGEABLE");
    checkGate = await github.checkGate(repository, repositorySlug, canonicalBranch, pr.headRefOid);
    await assertActive();
    merged = await github.merge(repository, repositorySlug, number, pr.headRefOid);
  if (merged.merged !== true || typeof merged.sha !== "string" || !/^[a-f0-9]{40,64}$/.test(merged.sha))
    throw new Error("WORKSPACE_ACTION_PULL_REQUEST_MERGE_UNCONFIRMED");
  }
  await assertActive();
  await enqueueWorkspaceAuthorityAuditEvent({
    tenantId: input.tenantId,
    eventType: "INTEGRATION_FINISH",
    eventId: `pull-request:${number}:${merged.sha}`,
  });
  const integratedSha = merged.sha as string;
  await assertActive();
  const convergence = await executeAuthority(repository, env, ["converge", "--integrated-sha", integratedSha]);
  if (convergence.status === "USER_WORKSPACE_CONVERGED" &&
      convergence.receipt && typeof convergence.receipt === "object" &&
      typeof (convergence.receipt as Record<string, unknown>).receipt_id === "string") {
    await enqueueWorkspaceAuthorityAuditEvent({
      tenantId: input.tenantId,
      eventType: "HANDOFF_COMPLETE",
      eventId: `pull-request:${number}:${integratedSha}:${(convergence.receipt as Record<string, unknown>).receipt_id}`,
    });
  }
  let cleanup: Record<string, unknown> | null = null;
  if (input.payload.automatedReconciliation === true && input.workspaceId) {
    await assertActive();
    const preview = await executeAuthority(repository, env, ["retire", "--workspace-id", input.workspaceId]);
    if (preview.status === "RETIREMENT_DRY_RUN") {
      await assertActive();
      cleanup = await executeAuthority(repository, env, ["retire", "--workspace-id", input.workspaceId, "--apply"]);
    } else {
      cleanup = { status: "CLEANUP_PRESERVED", reason: "RETIREMENT_PREFLIGHT_NOT_CLEAR", preview };
    }
  }
  return { status: "INTEGRATION_RECORDED", pullRequestNumber: number, integratedSha, checkGate, convergence, cleanup };
}

/** Canonical worker_jobs executor; all Git/worktree operations stay outside the API request path. */
export async function executeWorkspaceAuthoritySafeAction(
  input: ActionInput,
  env: NodeJS.ProcessEnv = process.env,
  dependencies: {
    runAuthority?: typeof runAuthority;
    resolveAuthority?: typeof resolveOwnedWorkspaceAuthority;
    github?: {
      repository: (root: string) => Promise<string>;
      inspect: (root: string, number: number) => Promise<PullRequestFact>;
      checkGate: (root: string, slug: string, baseBranch: string, headSha: string) => Promise<CheckGateEvidence>;
      merge: (root: string, slug: string, number: number, headSha: string) => Promise<Record<string, unknown>>;
    };
    hostname?: () => string;
    now?: () => Date;
    assertActive?: () => Promise<void>;
  } = {},
) {
  const executeAuthority = dependencies.runAuthority ?? runAuthority;
  const assertActive = dependencies.assertActive ?? (async () => {});
  const resolveAuthority = dependencies.resolveAuthority ?? resolveOwnedWorkspaceAuthority;
  const github = dependencies.github ?? {
    repository: canonicalGithubRepository,
    inspect: inspectPullRequest,
    checkGate: inspectCheckGate,
    merge: mergePullRequest,
  };
  const currentRunnerAuthority = await resolveAuthority({
    tenantId: input.tenantId,
    actorId: input.actorId,
    projectId: input.projectId,
    repositoryId: input.repositoryId,
    workspaceId: input.workspaceId ?? undefined,
  });
  const authorityChanged =
    currentRunnerAuthority.runnerId !== input.authority.runnerId ||
    currentRunnerAuthority.snapshotRevision !== input.authority.snapshotRevision ||
    (input.authority.snapshotRevision === null &&
      currentRunnerAuthority.snapshotObservedAt !== input.authority.snapshotObservedAt);
  if (authorityChanged) throw new Error("WORKSPACE_ACTION_AUTHORITY_CHANGED");

  const repository = requiredRepository(env);
  const resolved = await executeAuthority(repository, env, ["resolve"]);
  if (resolved.project_id !== input.projectId || resolved.repository_id !== input.repositoryId)
    throw new Error("WORKSPACE_ACTION_PROJECT_BINDING_MISMATCH");
  const workspaces = Array.isArray(resolved.workspaces) ? resolved.workspaces as Array<Record<string, unknown>> : [];
  const target = input.workspaceId ? workspaces.find(row => row.workspace_id === input.workspaceId) : null;
  if (input.workspaceId && !target) throw new Error("WORKSPACE_ACTION_LOCAL_AUTHORITY_NOT_FOUND");

  if (input.action === "INTEGRATE_COMPLETED_WORK" && input.payload.automatedReconciliation === true) {
    const expectedHeadSha = input.payload.expectedHeadSha;
    if (!target || target.role !== "TASK_WORKTREE" || target.dirty !== false || target.session_state === "ACTIVE_SESSION" ||
        typeof expectedHeadSha !== "string" || target.head_sha !== expectedHeadSha ||
        typeof target.branch !== "string" || !target.task_id)
      throw new Error("WORKSPACE_ACTION_AUTONOMOUS_WORKSPACE_NOT_SAFE");
    if (currentRunnerAuthority.activeSessionId)
      throw new Error("WORKSPACE_ACTION_AUTONOMOUS_RUNNER_SESSION_ACTIVE");
  }

  let result: Record<string, unknown>;
  if (input.action === "INTEGRATE_COMPLETED_WORK") {
    result = await integratePullRequest(repository, input, env, executeAuthority, github, assertActive);
  } else if (input.action === "SYNC_WORKSPACE_SAFELY") {
    await assertActive();
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
    await assertActive();
    result = await executeAuthority(repository, env, ["preserve", "--workspace-id", input.workspaceId ?? ""]);
  } else if (input.action === "RETIRE_SAFE_WORKTREE") {
    await assertActive();
    const preview = await executeAuthority(repository, env, ["retire", "--workspace-id", input.workspaceId ?? ""]);
    if (preview.status === "RETIREMENT_DRY_RUN") {
      await assertActive();
      result = await executeAuthority(repository, env, ["retire", "--workspace-id", input.workspaceId ?? "", "--apply"]);
    } else {
      result = { status: "CLEANUP_PRESERVED", reason: "RETIREMENT_PREFLIGHT_NOT_CLEAR", preview };
    }
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
