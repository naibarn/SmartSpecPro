import { spawn, type ChildProcess } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
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
    const evidenceRoot = options.evidenceRoot ?? process.env.SPEC224_DEVELOPER_EVIDENCE_ROOT ?? path.join(os.homedir(), ".cache", "codex", "developer-workunits");
    const sessionId = `dev-fast-lane-${lease.jobId}-${lease.fencingVersion}`.slice(0, 120);
    await writeFile(requestPath, JSON.stringify(binding.request), { mode: 0o600 });
    await writeFile(bindingPath, JSON.stringify({ jobId: lease.jobId, runId: binding.runId, tenantId: binding.tenantId, actorId: binding.actorId, attemptId: lease.attemptId, fencingVersion: lease.fencingVersion }), { mode: 0o600 });
    const command = options.pythonExecutable ?? process.env.SMARTSPEC_PYTHON_EXECUTABLE ?? "python3";
    const child = spawnImpl(command, [
      options.pythonScript ?? path.join(repositoryRoot, "experiments", "agents-sdk-codex-subscription", "developer_workunit.py"),
      ...(options.pythonScript ? (options.pythonScriptArgs?.(binding, evidenceRoot) ?? []) : [
      "start", requestPath, "--repository", repositoryRoot, "--policy", path.join(repositoryRoot, ".development-repository.toml"),
      "--developer-login", binding.request.developerLogin, "--base-sha", binding.request.sourceRevision,
      "--canonical-job-binding-file", bindingPath, "--canonical-admission-fd", "3", "--evidence-root", evidenceRoot,
      "--scope-ttl-seconds", String(binding.request.scopeTtlSeconds ?? 8 * 60 * 60),
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
