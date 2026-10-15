import { spawn, type ChildProcess } from "node:child_process";
import { createHash } from "node:crypto";
import { access, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { Writable } from "node:stream";

import type { JobExecutor, JobExecutorContext } from "./jobExecutor";
import { createPostgresProviderSchedulerRepository } from "./postgresProviderSchedulerRepository";
import { createSpec224DeveloperModelAdmissionTransport } from "./spec224DeveloperModelAdmission";
import { DEVELOPER_FAST_LANE_CONTRACT, DEVELOPER_FAST_LANE_JOB, type DeveloperFastLaneRequest } from "./spec224DeveloperFastLaneContract";
import type { CodexModelUsage } from "./providerSchedulerService";

type FastLaneBinding = {
  contractVersion: typeof DEVELOPER_FAST_LANE_CONTRACT;
  runId: string;
  workerJobId: string;
  tenantId: string;
  actorId: number;
  request: DeveloperFastLaneRequest;
};

type ContinuationGrant = {
  schema: "spec224.developer-continuation-grant.v1";
  continuationId: string;
  continuationOrdinal: number;
  jobId: string;
  runId: string;
  tenantId: string;
  actorId: number;
  attemptId: string;
  fencingVersion: number;
  developerLogin: string;
  workspaceId: string;
  sourceRevision: string;
  originalAuthorizationReceiptSha256: string;
  scopeDigest: string;
  issuedAt: string;
  scopeExpiresAt: string;
};

function asObject(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function readBinding(context: JobExecutorContext): FastLaneBinding {
  const root = asObject(context.input);
  const binding = asObject(root?.developerWorkUnit);
  if (!binding || context.jobType !== DEVELOPER_FAST_LANE_JOB || context.contractVersion !== DEVELOPER_FAST_LANE_CONTRACT ||
      binding.contractVersion !== DEVELOPER_FAST_LANE_CONTRACT || binding.workerJobId !== context.jobId ||
      binding.tenantId !== context.tenantId || binding.actorId !== context.requestedByUserId ||
      typeof binding.runId !== "string" || !binding.runId || !binding.request || typeof binding.request !== "object") {
    throw Object.assign(new Error("DEVELOPER_FAST_LANE_JOB_BINDING_INVALID"), { diagnosticCode: "DEVELOPER_FAST_LANE_JOB_BINDING_INVALID" });
  }
  return binding as unknown as FastLaneBinding;
}

async function findRepositoryRoot(start = process.cwd()): Promise<string> {
  let current = path.resolve(start);
  while (true) {
    try { await readFile(path.join(current, ".development-repository.toml")); return current; }
    catch { const parent = path.dirname(current); if (parent === current) throw new Error("DEVELOPER_FAST_LANE_REPOSITORY_ROOT_UNAVAILABLE"); current = parent; }
  }
}

function usageFromRpc(value: unknown): CodexModelUsage | null {
  if (value === null) return null;
  const usage = asObject(value);
  if (!usage) throw new Error("DEVELOPER_FAST_LANE_USAGE_INVALID");
  const inputTokens = usage.inputTokens;
  const cachedInputTokens = usage.cachedInputTokens;
  const outputTokens = usage.outputTokens;
  if (![inputTokens, cachedInputTokens, outputTokens].every(token => Number.isSafeInteger(token) && Number(token) >= 0) || Number(cachedInputTokens) > Number(inputTokens) ||
      typeof usage.threadId !== "string" || typeof usage.turnId !== "string" || typeof usage.observedAt !== "string") throw new Error("DEVELOPER_FAST_LANE_USAGE_INVALID");
  return { inputTokens: Number(inputTokens), cachedInputTokens: Number(cachedInputTokens), outputTokens: Number(outputTokens), threadId: usage.threadId, turnId: usage.turnId,
    effectiveModel: typeof usage.effectiveModel === "string" ? usage.effectiveModel : null, observedAt: usage.observedAt };
}

function stringField(value: unknown, name: string, max = 160): string {
  if (typeof value !== "string" || !value.trim() || value.length > max) throw new Error(`DEVELOPER_FAST_LANE_RPC_${name}_INVALID`);
  return value.trim();
}

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.entries(value as Record<string, unknown>).filter(([, item]) => item !== undefined)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => `${JSON.stringify(key)}:${canonicalJson(item)}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function sha256(value: string | Buffer): string {
  return createHash("sha256").update(value).digest("hex");
}

function sameJson(left: unknown, right: unknown): boolean {
  return canonicalJson(left) === canonicalJson(right);
}

function runLocalCommand(file: string, args: string[], cwd: string, timeoutMs = 15_000): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(file, args, { cwd, stdio: ["ignore", "pipe", "pipe"] });
    const timeout = setTimeout(() => {
      child.kill("SIGKILL");
      reject(new Error(`LOCAL_AUTHORITY_COMMAND_TIMEOUT:${file}`));
    }, timeoutMs);
    let stdout = "";
    let stderr = "";
    child.stdout?.on("data", (chunk: Buffer) => { stdout += chunk.toString("utf8").slice(0, 16_000); });
    child.stderr?.on("data", (chunk: Buffer) => { stderr += chunk.toString("utf8").slice(0, 4_000); });
    child.once("error", error => { clearTimeout(timeout); reject(error); });
    child.once("close", code => {
      clearTimeout(timeout);
      code === 0 ? resolve(stdout) : reject(new Error(`LOCAL_AUTHORITY_COMMAND_FAILED:${file}:${code ?? "signal"}:${sha256(stderr).slice(0, 12)}`));
    });
  });
}

function githubOrigin(value: string): { host: string; owner: string; repository: string } {
  const ssh = /^git@([^:]+):([^/]+)\/([^/]+?)(?:\.git)?$/.exec(value.trim());
  const parsed = ssh ? null : new URL(value.trim());
  const host = ssh?.[1] ?? parsed?.hostname;
  const pathValue = ssh ? `${ssh[2]}/${ssh[3]}` : parsed?.pathname.replace(/^\//, "").replace(/\.git$/, "");
  const parts = pathValue?.split("/") ?? [];
  if (!host || parts.length !== 2 || parts.some(part => !part || part === "." || part === "..")) throw new Error("DEVELOPER_CONTINUATION_GITHUB_ORIGIN_INVALID");
  return { host, owner: parts[0], repository: parts[1] };
}

async function verifyContinuationDeveloperPermission(repositoryRoot: string, developerLogin: string): Promise<void> {
  const origin = githubOrigin((await runLocalCommand("git", ["remote", "get-url", "origin"], repositoryRoot)).trim());
  const identity = JSON.parse(await runLocalCommand("gh", ["api", "--hostname", origin.host, "user"], repositoryRoot)) as { login?: unknown };
  if (identity.login !== developerLogin) throw new Error("DEVELOPER_CONTINUATION_IDENTITY_MISMATCH");
  const access = JSON.parse(await runLocalCommand("gh", ["api", "--hostname", origin.host,
    `repos/${origin.owner}/${origin.repository}/collaborators/${developerLogin}/permission`], repositoryRoot)) as { permission?: unknown };
  if (!["write", "maintain", "admin"].includes(String(access.permission))) throw new Error("DEVELOPER_CONTINUATION_PERMISSION_REQUIRED");
}

function requestScope(binding: FastLaneBinding): Record<string, unknown> {
  return Object.fromEntries(Object.entries(binding.request).filter(([key]) => [
    "developerLogin", "sourceRevision", "task", "allowedFiles", "writableFiles", "patchableFiles", "tests",
    "acceptanceCriteria", "budget", "browserUat", "implementationGuidance", "scopeTtlSeconds",
  ].includes(key)));
}

export async function issueContinuationGrant(input: {
  binding: FastLaneBinding;
  lease: LeaseContext;
  evidenceRoot: string;
  repositoryRoot: string;
  now: Date;
  authorize: (repositoryRoot: string, developerLogin: string) => Promise<void>;
}): Promise<ContinuationGrant | null> {
  const { binding, lease } = input;
  const runId = binding.runId;
  if (!/^[a-f0-9-]{36}$/i.test(runId)) throw new Error("DEVELOPER_FAST_LANE_RUN_ID_INVALID");
  const evidenceDir = path.join(input.evidenceRoot, runId);
  const contract = JSON.parse(await readFile(path.join(evidenceDir, "contract.json"), "utf8")) as Record<string, any>;
  const receiptBytes = await readFile(path.join(evidenceDir, "authorization-receipt.json"));
  const receipt = JSON.parse(receiptBytes.toString("utf8")) as Record<string, any>;
  const expectedJob = contract.canonicalJobBinding as Record<string, unknown> | undefined;
  const request = binding.request;
  const expectedBudget = request.budget ?? { maxAttempts: 3, implementationMaxTurns: 12, planMaxTurns: 4, reviewMaxTurns: 4 };
  const expectedTools = ["list_files", "read_file", "read_range", "write_file", "patch_file", "run_focused_tests",
    ...(request.browserUat?.status === "configured" ? ["run_browser_uat"] : [])];
  const immutableScopeMatches = contract.taskId === runId && contract.sourceRevision === request.sourceRevision &&
    contract.requirementText === request.task && contract.workspaceId === receipt.workspaceId &&
    typeof contract.workspace === "string" && contract.allowedFiles && sameJson(contract.allowedFiles, request.allowedFiles) &&
    sameJson(contract.writableFiles, request.writableFiles) && sameJson(contract.patchableFiles ?? [], request.patchableFiles ?? []) &&
    sameJson(contract.acceptanceCriteria, request.acceptanceCriteria) && sameJson(contract.tests, request.tests) &&
    sameJson(contract.browserUat ?? null, request.browserUat ?? null) && sameJson(contract.budget, expectedBudget) &&
    sameJson(contract.allowedTools, expectedTools) && contract.authority?.productionAccess === false &&
    contract.authority?.sharedDatabaseWrite === false && contract.authority?.runnerDispatch === false &&
    receipt.sourceSha === contract.sourceRevision && receipt.taskId === runId &&
    sameJson(receipt.allowedFiles, contract.allowedFiles) && sameJson(receipt.writableFiles, contract.writableFiles) &&
    sameJson(receipt.allowedTools, contract.allowedTools) && sameJson(receipt.budget, contract.budget);
  if (!immutableScopeMatches || expectedJob?.jobId !== lease.jobId || expectedJob.runId !== runId ||
      expectedJob.tenantId !== binding.tenantId || expectedJob.actorId !== binding.actorId ||
      receipt.developerIdentity?.login !== request.developerLogin) {
    throw new Error("DEVELOPER_CONTINUATION_SCOPE_BINDING_MISMATCH");
  }
  const receiptDigest = sha256(receiptBytes);
  if (contract.originalAuthorizationReceiptSha256 && contract.originalAuthorizationReceiptSha256 !== receiptDigest) {
    throw new Error("DEVELOPER_ORIGINAL_AUTHORIZATION_RECEIPT_CHANGED");
  }
  const sourceSha = String(contract.sourceRevision);
  await runLocalCommand("git", ["cat-file", "-e", `${sourceSha}^{commit}`], input.repositoryRoot);
  const workspaceHead = (await runLocalCommand("git", ["rev-parse", "HEAD"], String(contract.workspace))).trim();
  if (workspaceHead !== sourceSha) throw new Error("DEVELOPER_CONTINUATION_SOURCE_BASELINE_CHANGED");
  // Developer WorkUnit contracts persist scope expiry as Unix seconds. Compare
  // milliseconds only after normalizing the durable representation; the
  // previous seconds-vs-milliseconds comparison treated every active scope as
  // expired and reauthorized it on every attempt.
  const rawExpiry = contract.scopeExpiresAt;
  const parsedExpiry = typeof rawExpiry === "number"
    ? rawExpiry * (rawExpiry < 100_000_000_000 ? 1_000 : 1)
    : typeof rawExpiry === "string" ? Date.parse(rawExpiry) : Number.NaN;
  if (!Number.isFinite(parsedExpiry)) throw new Error("DEVELOPER_CONTINUATION_SCOPE_EXPIRY_INVALID");
  if (parsedExpiry > input.now.getTime()) return null;
  const priorContinuations = await readFile(path.join(evidenceDir, "continuation-receipts.jsonl"), "utf8").catch(error => {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return "";
    throw error;
  });
  const continuationOrdinal = priorContinuations.split("\n").filter(Boolean).length + 1;
  const continuationLimit = Number(request.budget?.maxAttempts ?? 3);
  if (continuationOrdinal > continuationLimit) throw new Error("DEVELOPER_CONTINUATION_ALLOWANCE_EXHAUSTED");
  await input.authorize(input.repositoryRoot, request.developerLogin);
  const ttl = Number(request.scopeTtlSeconds ?? 8 * 60 * 60);
  if (!Number.isSafeInteger(ttl) || ttl < 300 || ttl > 86_400) throw new Error("DEVELOPER_CONTINUATION_SCOPE_TTL_INVALID");
  const issuedAt = input.now.toISOString();
  const scopeExpiresAt = new Date(input.now.getTime() + ttl * 1_000).toISOString();
  const grantCore = {
    schema: "spec224.developer-continuation-grant.v1" as const,
    continuationId: sha256(`${lease.jobId}\0${runId}\0${lease.attemptId}\0${lease.fencingVersion}\0${receiptDigest}\0${issuedAt}`).slice(0, 32),
    continuationOrdinal, jobId: lease.jobId, runId, tenantId: binding.tenantId, actorId: binding.actorId,
    attemptId: lease.attemptId, fencingVersion: lease.fencingVersion, developerLogin: request.developerLogin,
    workspaceId: String(contract.workspaceId), sourceRevision: sourceSha,
    originalAuthorizationReceiptSha256: receiptDigest, scopeDigest: sha256(canonicalJson(requestScope(binding))),
    issuedAt, scopeExpiresAt,
  };
  return grantCore;
}

function connectAdmissionRpc(child: ChildProcess, transport: ReturnType<typeof createSpec224DeveloperModelAdmissionTransport>, setWaiting: () => void) {
  // FD 4 is child-to-server requests; FD 3 is server-to-child replies.
  const requestStream = child.stdio[4];
  const responseWriter = child.stdio[3] as Writable | null;
  if (!requestStream || typeof requestStream.on !== "function" || !responseWriter || typeof responseWriter.write !== "function") {
    throw new Error("DEVELOPER_FAST_LANE_PRIVATE_IPC_UNAVAILABLE");
  }
  let buffer = "";
  requestStream.on("data", (chunk: Buffer) => {
    buffer += chunk.toString("utf8");
    if (buffer.length > 64_000 && !buffer.includes("\n")) { child.kill("SIGKILL"); return; }
    let newline: number;
    while ((newline = buffer.indexOf("\n")) >= 0) {
      const line = buffer.slice(0, newline); buffer = buffer.slice(newline + 1);
      if (!line || line.length > 64_000) { child.kill("SIGKILL"); return; }
      void (async () => {
        const message = asObject(JSON.parse(line));
        if (!message || !Number.isSafeInteger(message.id) || typeof message.method !== "string") throw new Error("DEVELOPER_FAST_LANE_RPC_REQUEST_INVALID");
        const args = asObject(message.arguments) ?? {};
        let result: Record<string, unknown>;
        switch (message.method) {
          case "reserve": {
            const request = asObject(args.request);
            if (!request) throw new Error("DEVELOPER_FAST_LANE_RPC_REQUEST_INVALID");
            result = await transport.reserve({
              runId: stringField(request.runId, "RUN_ID"), modelCallId: stringField(request.modelCallId, "CALL_ID"),
              phase: stringField(request.phase, "PHASE", 40), role: stringField(request.role, "ROLE", 64),
              requestedModel: stringField(request.requestedModel, "MODEL", 120), reasoningEffort: stringField(request.reasoningEffort, "EFFORT", 24),
              promptBytes: Number(request.promptBytes), threadId: typeof request.threadId === "string" ? request.threadId : null,
              selection: asObject(request.selection) ?? undefined,
            });
            break;
          }
          case "dispatching": result = await transport.dispatching(stringField(args.operationKey, "OPERATION_KEY", 200)); break;
          case "threadCreated": result = await transport.threadCreated(stringField(args.operationKey, "OPERATION_KEY", 200), stringField(args.threadId, "THREAD_ID")); break;
          case "turnStarted": result = await transport.turnStarted(stringField(args.operationKey, "OPERATION_KEY", 200), stringField(args.threadId, "THREAD_ID"), stringField(args.turnId, "TURN_ID")); break;
          case "settle": result = await transport.settle(stringField(args.operationKey, "OPERATION_KEY", 200), usageFromRpc(args.usage), args.reconcile === true); break;
          case "providerCapacity": {
            const evidence = asObject(args.evidence) ?? {};
            result = await transport.providerCapacity(stringField(args.operationKey, "OPERATION_KEY", 200), evidence);
            break;
          }
          case "wait": {
            const operationKey = stringField(args.operationKey, "OPERATION_KEY", 200);
            const reason = args.reason;
            if (reason !== "budget" && reason !== "provider_capacity") throw new Error("DEVELOPER_FAST_LANE_RPC_WAIT_REASON_INVALID");
            const nextEligibleAt = stringField(args.nextEligibleAt, "NEXT_ELIGIBLE_AT", 64);
            await transport.wait(operationKey, reason, nextEligibleAt);
            setWaiting();
            result = { kind: "waiting" };
            break;
          }
          default: throw new Error("DEVELOPER_FAST_LANE_RPC_METHOD_DENIED");
        }
        responseWriter.write(`${JSON.stringify({ id: message.id, result })}\n`);
      })().catch(error => {
        const message = asObject(JSON.parse(line));
        if (message) responseWriter.write(`${JSON.stringify({ id: message.id, error: error instanceof Error ? error.message.slice(0, 160) : "RPC_FAILED" })}\n`);
      });
    }
  });
}

export function createSpec224DeveloperFastLaneExecutor(options: {
  spawnImpl?: typeof spawn;
  pythonExecutable?: string;
  repositoryRoot?: string;
  evidenceRoot?: string;
  pythonScript?: string;
  pythonScriptArgs?: (binding: FastLaneBinding, evidenceRoot: string) => string[];
  includeStderrInFailure?: boolean;
  now?: () => Date;
  authorizeContinuation?: (repositoryRoot: string, developerLogin: string) => Promise<void>;
} = {}): JobExecutor {
  const spawnImpl = options.spawnImpl ?? spawn;
  return async ({ context, lease, reporter }) => {
    const binding = readBinding(context);
    await reporter.assertActive(lease);
    const repositoryRoot = options.repositoryRoot ?? await findRepositoryRoot();
    const tempDir = await mkdtemp(path.join(os.tmpdir(), "spec224-fast-lane-"));
    try {
    const requestPath = path.join(tempDir, "request.json");
    const bindingPath = path.join(tempDir, "canonical-job-binding.json");
    const continuationGrantPath = path.join(tempDir, "developer-continuation-grant.json");
    const evidenceRoot = options.evidenceRoot ?? process.env.SPEC224_DEVELOPER_EVIDENCE_ROOT ?? path.join(os.homedir(), ".cache", "codex", "developer-workunits");
    const sessionId = `dev-fast-lane-${lease.jobId}-${lease.fencingVersion}`.slice(0, 120);
    await writeFile(requestPath, JSON.stringify(binding.request), { mode: 0o600 });
    await writeFile(bindingPath, JSON.stringify({ jobId: lease.jobId, runId: binding.runId, tenantId: binding.tenantId, actorId: binding.actorId, attemptId: lease.attemptId, fencingVersion: lease.fencingVersion }), { mode: 0o600 });
    const now = options.now ?? (() => new Date());
    const evidenceDir = path.join(options.evidenceRoot ?? process.env.SPEC224_DEVELOPER_EVIDENCE_ROOT ?? path.join(os.homedir(), ".cache", "codex", "developer-workunits"), binding.runId);
    const contractExists = await access(path.join(evidenceDir, "contract.json")).then(() => true, () => false);
    if (contractExists) {
      try {
        const grant = await issueContinuationGrant({
          binding, lease, evidenceRoot: path.dirname(evidenceDir), repositoryRoot,
          now: now(), authorize: options.authorizeContinuation ?? verifyContinuationDeveloperPermission,
        });
        if (grant) await writeFile(continuationGrantPath, JSON.stringify(grant), { mode: 0o600 });
      } catch (error) {
        const code = error instanceof Error ? error.message : "DEVELOPER_CONTINUATION_AUTHORIZATION_REQUIRED";
        if (!["DEVELOPER_CONTINUATION_IDENTITY_MISMATCH", "DEVELOPER_CONTINUATION_PERMISSION_REQUIRED",
          "DEVELOPER_CONTINUATION_ALLOWANCE_EXHAUSTED"].includes(code) && !code.startsWith("LOCAL_AUTHORITY_COMMAND_FAILED:") &&
          !code.startsWith("LOCAL_AUTHORITY_COMMAND_TIMEOUT:")) throw error;
        const currentTime = now();
        await reporter.assertActive(lease);
        await reporter.waitForExternal(lease, {
          operationKey: `developer-authorization:${binding.runId}:${lease.fencingVersion}`,
          reason: "authorization",
          resumeAfter: new Date(currentTime.getTime() + 60 * 60_000).toISOString(),
          metadata: {
            schemaVersion: "spec224.developer-authorization-wait.v1",
            runId: binding.runId, jobId: lease.jobId, attemptId: lease.attemptId,
            fencingVersion: lease.fencingVersion, reason: code,
          },
        });
        return { deferred: true };
      }
    }
    const command = options.pythonExecutable ?? process.env.SMARTSPEC_PYTHON_EXECUTABLE ?? "python3";
    const child = spawnImpl(command, [
      options.pythonScript ?? path.join(repositoryRoot, "experiments", "agents-sdk-codex-subscription", "developer_workunit.py"),
      ...(options.pythonScript ? (options.pythonScriptArgs?.(binding, evidenceRoot) ?? []) : [
      "start", requestPath, "--repository", repositoryRoot, "--policy", path.join(repositoryRoot, ".development-repository.toml"),
      "--developer-login", binding.request.developerLogin, "--base-sha", binding.request.sourceRevision,
      "--canonical-job-binding-file", bindingPath, "--canonical-admission-fd", "3", "--evidence-root", evidenceRoot,
      "--scope-ttl-seconds", String(binding.request.scopeTtlSeconds ?? 8 * 60 * 60),
      ...(await access(continuationGrantPath).then(() => ["--continuation-grant-file", continuationGrantPath], () => [])),
      ]),
    ], { cwd: repositoryRoot, env: { ...process.env, CODEX_SESSION_ID: sessionId, PYTHONUNBUFFERED: "1" }, stdio: ["ignore", "pipe", "pipe", "pipe", "pipe"] });
    const transport = createSpec224DeveloperModelAdmissionTransport({
      lease, runId: binding.runId, reporter, repository: createPostgresProviderSchedulerRepository(),
    });
    let deferred = false;
    let heartbeatError: unknown;
    let stdout = "";
    let stderr = "";
    const append = (current: string, chunk: Buffer) => (current + chunk.toString("utf8")).slice(-64_000);
    if (!child.stdout || !child.stderr) throw new Error("DEVELOPER_FAST_LANE_PROCESS_STREAMS_UNAVAILABLE");
    child.stdout.on("data", (chunk: Buffer) => { stdout = append(stdout, chunk); });
    child.stderr.on("data", (chunk: Buffer) => { stderr = append(stderr, chunk); });
    connectAdmissionRpc(child, transport, () => { deferred = true; });
    const heartbeat = setInterval(() => {
      if (deferred || heartbeatError) return;
      void reporter.heartbeat(lease).catch(error => { heartbeatError = error; child.kill("SIGTERM"); });
    }, 10_000);
    heartbeat.unref?.();
    const exit = await new Promise<{ code: number | null; signal: NodeJS.Signals | null }>((resolve, reject) => {
      child.once("error", reject);
      child.once("close", (code, signal) => resolve({ code, signal }));
    }).finally(() => clearInterval(heartbeat));
    if (heartbeatError) throw Object.assign(new Error("DEVELOPER_FAST_LANE_LEASE_LOST"), { diagnosticCode: "DEVELOPER_FAST_LANE_LEASE_LOST" });
    if (deferred) return { deferred: true };
    if (exit.code !== 0) throw Object.assign(new Error(`DEVELOPER_FAST_LANE_PROCESS_FAILED:${exit.code ?? exit.signal ?? "unknown"}:${createHash("sha256").update(stderr).digest("hex").slice(0, 16)}${options.includeStderrInFailure ? `:${stderr.slice(-2_000)}` : ""}`), { diagnosticCode: "DEVELOPER_FAST_LANE_PROCESS_FAILED" });
    const statePath = path.join(evidenceRoot, binding.runId, "run-state.json");
    const state = asObject(JSON.parse(await readFile(statePath, "utf8")));
    if (!state || state.runId !== binding.runId) throw new Error("DEVELOPER_FAST_LANE_DURABLE_RECEIPT_MISSING");
    const workspaceId = typeof state.workspaceId === "string" ? state.workspaceId : null;
    return { resultRef: `developer-workunit:${binding.runId}`, output: { runId: binding.runId, status: state.functionalDeliveryStatus ?? state.status, workspaceId, evidencePath: statePath, stdoutTail: stdout.slice(-2_000) } };
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
  };
}

export const executeSpec224DeveloperFastLaneJob = createSpec224DeveloperFastLaneExecutor();
