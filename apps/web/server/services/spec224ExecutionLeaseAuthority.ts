import { execFile } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export type Spec224ExecutionLease = {
  schema: "spec224.execution-lease.v1";
  leaseId: string;
  projectId: string;
  repositoryId: string;
  workspaceId: string;
  runId: string;
  jobId: string;
  attemptId: string;
  tenantId: string;
  actorId: string;
  sourceSha: string;
  sourceFingerprint: string;
  allowedWriteSet: string[];
  fencingGeneration: number;
  expiresAt: number;
  authorizationDeadline: number;
  status: "ACTIVE" | "RELEASED";
};

type AuthorityRepositoryMapping = Record<string, Record<string, string>>;

export function resolveSpec224AuthorityRepository(input: {
  runnerId: string;
  workspaceId: string;
  defaultRepository?: string;
  mappingJson?: string;
}): string {
  const fallback = input.defaultRepository?.trim();
  let mapping: AuthorityRepositoryMapping = {};
  if (input.mappingJson?.trim()) {
    try {
      const parsed: unknown = JSON.parse(input.mappingJson);
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error();
      mapping = parsed as AuthorityRepositoryMapping;
    } catch {
      throw new Error("SPEC224_WORKSPACE_AUTHORITY_MAPPING_INVALID");
    }
  }
  const runnerMapping = mapping[input.runnerId];
  if (runnerMapping !== undefined) {
    if (!runnerMapping || typeof runnerMapping !== "object" || Array.isArray(runnerMapping)) {
      throw new Error("SPEC224_WORKSPACE_AUTHORITY_MAPPING_INVALID");
    }
    const selected = runnerMapping[input.workspaceId];
    if (typeof selected !== "string" || !selected.trim()) {
      throw new Error("SPEC224_WORKSPACE_AUTHORITY_WORKSPACE_UNMAPPED");
    }
    if (!path.isAbsolute(selected.trim())) throw new Error("SPEC224_WORKSPACE_AUTHORITY_MAPPING_INVALID");
    return path.resolve(selected.trim());
  }
  if (!fallback) throw new Error("SPEC224_WORKSPACE_AUTHORITY_NOT_CONFIGURED");
  return path.resolve(fallback);
}

function authorityScriptRepository(): string {
  const value = process.env.SMARTSPEC_WORKSPACE_AUTHORITY_REPOSITORY?.trim();
  if (!value) throw new Error("SPEC224_WORKSPACE_AUTHORITY_NOT_CONFIGURED");
  return path.resolve(value);
}

async function runAuthority<T>(action: string, request: Record<string, unknown> & { runnerId: string; workspaceId: string }): Promise<T> {
  const scriptRepository = authorityScriptRepository();
  const repository = resolveSpec224AuthorityRepository({
    runnerId: request.runnerId,
    workspaceId: request.workspaceId,
    defaultRepository: scriptRepository,
    mappingJson: process.env.SMARTSPEC_WORKSPACE_AUTHORITY_REPOSITORIES_JSON,
  });
  const { runnerId: _runnerId, ...authorityRequest } = request;
  const directory = await mkdtemp(path.join(os.tmpdir(), "spec224-lease-"));
  const input = path.join(directory, "request.json");
  try {
    const pythonRequest = Object.fromEntries(Object.entries(authorityRequest).map(([key, value]) => [
      key.replace(/[A-Z]/g, letter => `_${letter.toLowerCase()}`), value,
    ]));
    await writeFile(input, JSON.stringify(pythonRequest), { mode: 0o600, flag: "wx" });
    const { stdout } = await execFileAsync(process.env.SMARTSPEC_PYTHON_EXECUTABLE?.trim() || "python3", [
      path.join(scriptRepository, "scripts", "development-lifecycle", "workspace_authority.py"),
      action, "--repository", repository, "--lease-input", input,
    ], { cwd: scriptRepository, timeout: 15_000, maxBuffer: 128 * 1024 });
    return JSON.parse(stdout) as T;
  } catch (error) {
    const stderr = error && typeof error === "object" && "stderr" in error ? String((error as { stderr?: unknown }).stderr ?? "") : "";
    const code = stderr.trim().split(/\r?\n/).filter(Boolean).at(-1)?.split(/\s+/, 1)[0] ?? "";
    throw new Error(/^EXECUTION_|^WORKSPACE_|^SPEC224_/.test(code) ? code : "SPEC224_WORKSPACE_AUTHORITY_UNAVAILABLE");
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

export function acquireSpec224ExecutionLease(input: {
  runnerId: string; workspaceId: string; runId: string; jobId: string; attemptId: string; tenantId: string; actorId: number;
  sourceSha: string; sourceFingerprint: string; allowedWriteSet: string[]; dirtyPaths: string[]; idempotencyKey: string;
  authorizationDeadline: string;
}): Promise<Spec224ExecutionLease> {
  return runAuthority("execution-lease-acquire", { ...input, actorId: String(input.actorId) });
}

export async function assertSpec224ExecutionSourceMatchesAuthority(input: {
  runnerId: string; workspaceId: string; sourceSha: string; sourceFingerprint: string; dirtyPaths: string[];
}): Promise<void> {
  await runAuthority("execution-source-check", input);
}

export function validateSpec224ExecutionLease(input: {
  leaseId: string; fencingGeneration: number; runnerId: string; workspaceId: string; runId: string; jobId: string; attemptId: string;
  tenantId: string; actorId: number; sourceSha: string; sourceFingerprint: string; changedPaths?: string[];
}): Promise<Spec224ExecutionLease> {
  return runAuthority("execution-lease-validate", { ...input, actorId: String(input.actorId) });
}

export function renewSpec224ExecutionLease(input: {
  leaseId: string; fencingGeneration: number; leaseSeconds?: number; runnerId: string; workspaceId: string; runId: string; jobId: string;
  attemptId: string; tenantId: string; actorId: number; sourceSha: string; sourceFingerprint: string;
}): Promise<Spec224ExecutionLease> {
  return runAuthority("execution-lease-renew", { ...input, actorId: String(input.actorId) });
}

export function releaseSpec224ExecutionLease(input: {
  leaseId: string; fencingGeneration: number; terminalRef: string; runnerId: string; workspaceId: string; runId: string; jobId: string;
  attemptId: string; tenantId: string; actorId: number;
}): Promise<Spec224ExecutionLease> {
  return runAuthority("execution-lease-release", { ...input, actorId: String(input.actorId) });
}
