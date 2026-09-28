/**
 * Feature 135 — Hermes Grok media worker (section 07): `jobHandlers.ts`
 * unit tests. Real workspace manager + native profile strategy backed by
 * `mkdtemp` roots; fully injected control-plane client, spawn, and fetch —
 * no real network/DB/Hermes.
 */
import { createHash } from "node:crypto";
import { EventEmitter } from "node:events";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  HERMES_CONNECTION_AUTH_JOB_TYPE,
  HERMES_CONNECTION_DISCONNECT_JOB_TYPE,
  HERMES_CONNECTION_PROBE_JOB_TYPE,
  HERMES_MEDIA_IMAGE_JOB_TYPE,
} from "../../../shared/workerRuntime";
import { createNativeProfileStrategy } from "../hermesInstallation";
import { createJobHandlers, type JobHandlersDeps } from "../jobHandlers";
import { createWorkspaceManager } from "../workspace";
import { HermesControlPlaneError, type HermesClaimedJob, type HermesControlPlaneClient } from "../controlPlaneClient";

const PNG_BYTES = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);

function sha256(buffer: Buffer): string {
  return createHash("sha256").update(buffer).digest("hex");
}

interface FakeClientOverrides {
  initArtifact?: HermesControlPlaneClient["initArtifact"];
  completeArtifact?: HermesControlPlaneClient["completeArtifact"];
  refreshReferenceUrls?: HermesControlPlaneClient["refreshReferenceUrls"];
}

function createFakeClient(overrides: FakeClientOverrides = {}) {
  const events: Array<{ jobId: string; eventType: string; payloadJson: Record<string, unknown> }> = [];
  const refreshCalls: string[] = [];
  const client: HermesControlPlaneClient = {
    register: async () => {
      throw new Error("register() is not exercised by jobHandlers tests");
    },
    heartbeat: async () => {},
    claim: async () => ({ job: null, queueDepth: 0 }),
    postEvent: async (jobId, event) => {
      events.push({ jobId, eventType: event.eventType, payloadJson: event.payloadJson ?? {} });
      return { accepted: true, replayed: false, job: {} };
    },
    initArtifact:
      overrides.initArtifact ??
      (async () => ({ key: "k", method: "presigned", storageRef: "storage://ref", uploadUrl: "https://upload.test/put" })),
    completeArtifact: overrides.completeArtifact ?? (async () => ({ created: true, artifact: {} })),
    refreshReferenceUrls:
      overrides.refreshReferenceUrls ??
      (async (jobId) => {
        refreshCalls.push(jobId);
        return [];
      }),
  };
  return { client, events, refreshCalls };
}

function createSuccessSpawn(startOrder: Record<string, number> = {}, finishOrder: Record<string, number> = {}, delayMs = 0) {
  return (argv: string[], opts: { cwd: string; env: NodeJS.ProcessEnv }) => {
    const jobId = path.basename(opts.cwd);
    startOrder[jobId] = Date.now();
    const stdoutEmitter = new EventEmitter();
    const stderrEmitter = new EventEmitter();
    const emitter = new EventEmitter();
    const child = Object.assign(emitter, { stdout: stdoutEmitter, stderr: stderrEmitter, kill: vi.fn(() => true) });
    setTimeout(() => {
      void (async () => {
        const outputDir = path.join(opts.cwd, "output");
        await fs.mkdir(outputDir, { recursive: true });
        await fs.writeFile(path.join(outputDir, "result.png"), PNG_BYTES);
        finishOrder[jobId] = Date.now();
        emitter.emit("exit", 0);
      })();
    }, delayMs);
    return child;
  };
}

function createFailingExitSpawn() {
  return () => {
    const stdoutEmitter = new EventEmitter();
    const stderrEmitter = new EventEmitter();
    const emitter = new EventEmitter();
    const child = Object.assign(emitter, { stdout: stdoutEmitter, stderr: stderrEmitter, kill: vi.fn(() => true) });
    setTimeout(() => emitter.emit("exit", 1), 0);
    return child;
  };
}

function baseMediaJob(overrides: Partial<HermesClaimedJob> = {}): HermesClaimedJob {
  return {
    id: overrides.id ?? "job-plain",
    jobType: HERMES_MEDIA_IMAGE_JOB_TYPE,
    tenantId: "tenant-1",
    inputJson: {
      contractVersion: 1,
      operation: "image.generate",
      connectionId: "conn-1",
      prompt: "a cat wearing a hat",
      settings: { model: "grok-imagine", outputCount: 1 },
      references: [],
      traceId: "trace-1",
    },
    instructionsJson: {},
    capabilityRequirementsJson: { connectionId: "conn-1" },
    retryPolicyJson: { maxAttempts: 2 },
    timeoutSeconds: 600,
    leaseOwnerToken: "lease-1",
    leaseExpiresAt: null,
    assignmentAttempt: "attempt-1",
    referenceUrls: [],
    ...overrides,
  };
}

describe("createJobHandlers", () => {
  let workspaceRoot: string;
  let profileRoot: string;

  beforeEach(async () => {
    workspaceRoot = await fs.mkdtemp(path.join(os.tmpdir(), "hermes-jh-ws-"));
    profileRoot = await fs.mkdtemp(path.join(os.tmpdir(), "hermes-jh-profile-"));
  });
  afterEach(async () => {
    await fs.rm(workspaceRoot, { recursive: true, force: true });
    await fs.rm(profileRoot, { recursive: true, force: true });
  });

  function buildDeps(overrides: Partial<JobHandlersDeps> = {}): { deps: JobHandlersDeps; events: ReturnType<typeof createFakeClient>["events"] } {
    const { client, events } = createFakeClient();
    const strategy = createNativeProfileStrategy({ root: profileRoot });
    const workspaceManager = createWorkspaceManager({ root: workspaceRoot });
    const deps: JobHandlersDeps = {
      client,
      strategy,
      workspaceManager,
      spawnImpl: createSuccessSpawn(),
      fetchImpl: (async () => ({ ok: true, status: 200, arrayBuffer: async () => new ArrayBuffer(0) })) as unknown as typeof fetch,
      config: { globalMaxConcurrent: 2, invocationTemplate: "print_mode", enableFileToolset: false, profileRoot },
      ...overrides,
    };
    return { deps, events };
  }

  it("posts the progress-event stage sequence in order and completes the job", async () => {
    const { deps, events } = buildDeps();
    const handlers = createJobHandlers(deps);
    await handlers.handle(baseMediaJob({ id: "job-order" }));

    const stageNames = events.filter((event) => event.jobId === "job-order").map((event) => event.eventType);
    expect(stageNames).toEqual([
      "downloading_references",
      "starting_hermes",
      "generating",
      "collecting_output",
      "validating_output",
      "uploading",
      "job.completed",
    ]);
  });

  it("regression (lease renewal): activeJobIds() reports a job's id while handle() is in flight and clears it after", async () => {
    const { deps } = buildDeps({ spawnImpl: createSuccessSpawn({}, {}, 50) });
    const handlers = createJobHandlers(deps);

    expect(handlers.activeJobIds()).toEqual([]);
    const inFlight = handlers.handle(baseMediaJob({ id: "job-active-ids" }));
    expect(handlers.activeJobIds()).toEqual(["job-active-ids"]);
    await inFlight;
    expect(handlers.activeJobIds()).toEqual([]);
    // main.ts heartbeats these ids — currentJobCount 0 during a running job
    // means the control plane never renews the lease and the job gets
    // re-claimed mid-flow (observed: duplicate device codes 2026-08-02).
  });

  it("regression (FIX 1 — security): never leaks process.env secrets into the spawned Hermes child env", async () => {
    const originalEnv = { ...process.env };
    process.env.DATABASE_URL = "postgresql://user:pass@host/db";
    process.env.JWT_SECRET = "super-secret-jwt-value-1234567890";
    process.env.LLM_ENCRYPTION_KEY = "super-secret-encryption-key";
    process.env.HERMES_WORKER_TOKEN = "super-secret-refresh-token";

    try {
      const capturedEnvs: NodeJS.ProcessEnv[] = [];
      const spawnImpl = (argv: string[], opts: { cwd: string; env: NodeJS.ProcessEnv }) => {
        capturedEnvs.push(opts.env);
        return createSuccessSpawn()(argv, opts);
      };
      const { deps } = buildDeps({ spawnImpl });
      const handlers = createJobHandlers(deps);
      await handlers.handle(baseMediaJob({ id: "job-env-leak" }));

      expect(capturedEnvs.length).toBeGreaterThan(0);
      for (const env of capturedEnvs) {
        expect(env.HERMES_WORKER_TOKEN).toBeUndefined();
        expect(env.DATABASE_URL).toBeUndefined();
        expect(env.JWT_SECRET).toBeUndefined();
        expect(env.LLM_ENCRYPTION_KEY).toBeUndefined();
      }
    } finally {
      process.env = originalEnv;
    }
  });

  it("fails a reference with a sha256 mismatch as HERMES_REFERENCE_DOWNLOAD_FAILED", async () => {
    const realBytes = Buffer.from("real reference bytes");
    const { client, events } = createFakeClient();
    const strategy = createNativeProfileStrategy({ root: profileRoot });
    const workspaceManager = createWorkspaceManager({ root: workspaceRoot });
    const fetchImpl = (async () => ({
      ok: true,
      status: 200,
      arrayBuffer: async () => realBytes.buffer.slice(realBytes.byteOffset, realBytes.byteOffset + realBytes.byteLength),
    })) as unknown as typeof fetch;

    const handlers = createJobHandlers({
      client,
      strategy,
      workspaceManager,
      spawnImpl: createSuccessSpawn(),
      fetchImpl,
      config: { globalMaxConcurrent: 2, invocationTemplate: "print_mode", enableFileToolset: false, profileRoot },
    });

    const job = baseMediaJob({
      id: "job-ref-mismatch",
      inputJson: {
        contractVersion: 1,
        operation: "image.edit",
        connectionId: "conn-1",
        prompt: "edit this",
        settings: { model: "grok-imagine" },
        references: [{ assetId: "asset-1", index: 1, role: "subject", label: "Char A", sha256: "0".repeat(64) }],
        traceId: "trace-1",
      },
      referenceUrls: [{ assetId: "asset-1", url: "https://cdn.test/asset-1.png", expiresAt: new Date(Date.now() + 60_000).toISOString() }],
    });

    await handlers.handle(job);

    const failedEvent = events.find((event) => event.jobId === "job-ref-mismatch" && event.eventType === "job.failed");
    expect(failedEvent?.payloadJson.code).toBe("HERMES_REFERENCE_DOWNLOAD_FAILED");
  });

  it("refreshes an expired reference URL then retries the download", async () => {
    const realBytes = Buffer.from("real reference bytes");
    const digest = sha256(realBytes);
    const refreshReferenceUrls = vi.fn(async () => [
      { assetId: "asset-1", url: "https://cdn.test/asset-1-fresh.png", expiresAt: new Date(Date.now() + 60_000).toISOString() },
    ]);
    const { client } = createFakeClient({ refreshReferenceUrls });
    const strategy = createNativeProfileStrategy({ root: profileRoot });
    const workspaceManager = createWorkspaceManager({ root: workspaceRoot });
    const fetchImpl = (async () => ({
      ok: true,
      status: 200,
      arrayBuffer: async () => realBytes.buffer.slice(realBytes.byteOffset, realBytes.byteOffset + realBytes.byteLength),
    })) as unknown as typeof fetch;

    const handlers = createJobHandlers({
      client,
      strategy,
      workspaceManager,
      spawnImpl: createSuccessSpawn(),
      fetchImpl,
      config: { globalMaxConcurrent: 2, invocationTemplate: "print_mode", enableFileToolset: false, profileRoot },
    });

    const job = baseMediaJob({
      id: "job-ref-refresh",
      inputJson: {
        contractVersion: 1,
        operation: "image.edit",
        connectionId: "conn-1",
        prompt: "edit this",
        settings: { model: "grok-imagine" },
        references: [{ assetId: "asset-1", index: 1, role: "subject", label: "Char A", sha256: digest }],
        traceId: "trace-1",
      },
      // Expired — must trigger refreshReferenceUrls before the download succeeds.
      referenceUrls: [{ assetId: "asset-1", url: "https://cdn.test/asset-1-stale.png", expiresAt: new Date(Date.now() - 60_000).toISOString() }],
    });

    await handlers.handle(job);
    expect(refreshReferenceUrls).toHaveBeenCalledTimes(1);
  });

  it("rejects a reference that passes sha256 but fails format validation BEFORE spawning Hermes", async () => {
    const badBytes = Buffer.from("not an image at all");
    const digest = sha256(badBytes);
    const { client, events } = createFakeClient();
    const strategy = createNativeProfileStrategy({ root: profileRoot });
    const workspaceManager = createWorkspaceManager({ root: workspaceRoot });
    const fetchImpl = (async () => ({
      ok: true,
      status: 200,
      arrayBuffer: async () => badBytes.buffer.slice(badBytes.byteOffset, badBytes.byteOffset + badBytes.byteLength),
    })) as unknown as typeof fetch;
    const spawnImpl = vi.fn(createSuccessSpawn());

    const handlers = createJobHandlers({
      client,
      strategy,
      workspaceManager,
      spawnImpl,
      fetchImpl,
      config: { globalMaxConcurrent: 2, invocationTemplate: "print_mode", enableFileToolset: false, profileRoot },
    });

    const job = baseMediaJob({
      id: "job-ref-corrupt",
      inputJson: {
        contractVersion: 1,
        operation: "image.edit",
        connectionId: "conn-1",
        prompt: "edit this",
        settings: { model: "grok-imagine" },
        references: [{ assetId: "asset-1", index: 1, role: "subject", label: "Char A", sha256: digest }],
        traceId: "trace-1",
      },
      referenceUrls: [{ assetId: "asset-1", url: "https://cdn.test/asset-1.png", expiresAt: new Date(Date.now() + 60_000).toISOString() }],
    });

    await handlers.handle(job);

    const failedEvent = events.find((event) => event.jobId === "job-ref-corrupt" && event.eventType === "job.failed");
    // Code review FIX 7: a corrupt-but-checksummed reference is a PERMANENT
    // (non-retryable) condition — `HERMES_OUTPUT_INVALID` is retryable:false,
    // unlike `HERMES_REFERENCE_DOWNLOAD_FAILED` (retryable:true), which
    // would incorrectly offer the user a "try again" affordance.
    expect(failedEvent?.payloadJson.code).toBe("HERMES_OUTPUT_INVALID");
    expect(spawnImpl).not.toHaveBeenCalled();
  });

  it("retries an artifact call once on 401 after a token refresh, then completes", async () => {
    let initAttempts = 0;
    const initArtifact: HermesControlPlaneClient["initArtifact"] = async () => {
      initAttempts += 1;
      if (initAttempts === 1) {
        throw new HermesControlPlaneError(401, "worker_auth_invalid", "token expired");
      }
      return { key: "k", method: "presigned", storageRef: "storage://ref", uploadUrl: "https://upload.test/put" };
    };
    const { deps, events } = buildDeps({});
    const { client, events: clientEvents } = createFakeClient({ initArtifact });
    deps.client = client;

    const handlers = createJobHandlers(deps);
    await handlers.handle(baseMediaJob({ id: "job-401-retry" }));

    expect(initAttempts).toBe(2);
    const completed = clientEvents.find((event) => event.jobId === "job-401-retry" && event.eventType === "job.completed");
    expect(completed).toBeDefined();
    void events;
  });

  it("regression (FIX 3): a presigned PUT that returns HTTP 500 retries, then fails the job — completeArtifact is NEVER called", async () => {
    let putAttempts = 0;
    const completeArtifact = vi.fn(async () => ({ created: true, artifact: {} }));
    const { client, events } = createFakeClient({ completeArtifact });
    const strategy = createNativeProfileStrategy({ root: profileRoot });
    const workspaceManager = createWorkspaceManager({ root: workspaceRoot });
    const fetchImpl = (async (url: string, init?: RequestInit) => {
      if (init?.method === "PUT") {
        putAttempts += 1;
        return { ok: false, status: 500 };
      }
      return { ok: true, status: 200, arrayBuffer: async () => new ArrayBuffer(0) };
    }) as unknown as typeof fetch;

    const handlers = createJobHandlers({
      client,
      strategy,
      workspaceManager,
      spawnImpl: createSuccessSpawn(),
      fetchImpl,
      config: { globalMaxConcurrent: 2, invocationTemplate: "print_mode", enableFileToolset: false, profileRoot },
    });

    await handlers.handle(baseMediaJob({ id: "job-put-500" }));

    expect(putAttempts).toBeGreaterThan(1); // bounded retry, not a single attempt
    expect(completeArtifact).not.toHaveBeenCalled();
    const failedEvent = events.find((event) => event.jobId === "job-put-500" && event.eventType === "job.failed");
    expect(failedEvent?.payloadJson.code).toBe("HERMES_UPLOAD_FAILED");
  });

  it("serializes two jobs on the same connection while a different connection runs in parallel (up to the global max)", async () => {
    const startOrder: Record<string, number> = {};
    const finishOrder: Record<string, number> = {};
    const spawnImpl = (argv: string[], opts: { cwd: string; env: NodeJS.ProcessEnv }) => {
      const jobId = path.basename(opts.cwd);
      const delay = jobId === "job-a" ? 40 : 5;
      return createSuccessSpawn(startOrder, finishOrder, delay)(argv, opts);
    };

    const { client } = createFakeClient();
    const strategy = createNativeProfileStrategy({ root: profileRoot });
    const workspaceManager = createWorkspaceManager({ root: workspaceRoot });
    const handlers = createJobHandlers({
      client,
      strategy,
      workspaceManager,
      spawnImpl,
      config: { globalMaxConcurrent: 2, invocationTemplate: "print_mode", enableFileToolset: false, profileRoot },
    });

    const jobA = baseMediaJob({ id: "job-a", capabilityRequirementsJson: { connectionId: "conn-1" } });
    const jobB = baseMediaJob({ id: "job-b", capabilityRequirementsJson: { connectionId: "conn-1" } });
    const jobC = baseMediaJob({ id: "job-c", capabilityRequirementsJson: { connectionId: "conn-2" } });

    await Promise.all([handlers.handle(jobA), handlers.handle(jobB), handlers.handle(jobC)]);

    // Same-connection serialization: job-b must not START until job-a FINISHED.
    expect(startOrder["job-b"]).toBeGreaterThanOrEqual(finishOrder["job-a"]);
    // Cross-connection parallelism: job-c starts well before job-a finishes.
    expect(startOrder["job-c"]).toBeLessThan(finishOrder["job-a"]);
  });

  it("routes the three hermes_connection_* job types to the section-04 handlers (spy-level)", async () => {
    const authorize = vi.fn(async () => ({ ok: true as const, accountHint: "user@example.com" }));
    const probe = vi.fn(async () => ({
      ok: true as const,
      accountHint: "user@example.com",
      manifest: { operations: { "image.generate": { enabled: true } } },
    }));
    const disconnect = vi.fn(async () => ({ ok: true as const }));
    const { client, events } = createFakeClient();
    const strategy = createNativeProfileStrategy({ root: profileRoot });
    const workspaceManager = createWorkspaceManager({ root: workspaceRoot });
    const handlers = createJobHandlers({
      client,
      strategy,
      workspaceManager,
      spawnImpl: createSuccessSpawn(),
      controlHandlers: { authorize, probe, disconnect },
      config: { globalMaxConcurrent: 2, invocationTemplate: "print_mode", enableFileToolset: false, profileRoot },
    });

    const controlJobBase = {
      tenantId: "tenant-1",
      capabilityRequirementsJson: { connectionId: "conn-9" },
      inputJson: { connectionId: "conn-9", profileReference: "conn_conn-9" },
      instructionsJson: {},
      retryPolicyJson: null,
      timeoutSeconds: 120,
      leaseOwnerToken: "lease-1",
      leaseExpiresAt: null,
      assignmentAttempt: null,
    };

    await handlers.handle({ ...controlJobBase, id: "job-auth", jobType: HERMES_CONNECTION_AUTH_JOB_TYPE });
    await handlers.handle({ ...controlJobBase, id: "job-probe", jobType: HERMES_CONNECTION_PROBE_JOB_TYPE });
    await handlers.handle({ ...controlJobBase, id: "job-disconnect", jobType: HERMES_CONNECTION_DISCONNECT_JOB_TYPE });

    expect(authorize).toHaveBeenCalledTimes(1);
    expect(authorize.mock.calls[0][0]).toMatchObject({ connectionId: "conn-9", profileReference: "conn_conn-9", timeoutSeconds: 120 });
    expect(probe).toHaveBeenCalledTimes(1);
    expect(disconnect).toHaveBeenCalledTimes(1);

    for (const jobId of ["job-auth", "job-probe", "job-disconnect"]) {
      expect(
        events.filter((event) => event.jobId === jobId).map((event) => event.eventType),
      ).toEqual(["job.running", "job.completed"]);
    }
    expect(events.find((event) => event.jobId === "job-auth" && event.eventType === "job.completed")).toBeDefined();
    expect(
      events.find((event) => event.jobId === "job-probe" && event.eventType === "job.completed")?.payloadJson,
    ).toMatchObject({
      capabilities: { operations: { "image.generate": { enabled: true } } },
    });
    expect(events.find((event) => event.jobId === "job-disconnect" && event.eventType === "job.completed")).toBeDefined();
  });

  it("regression (FIX 1 — security): the control-job spawn site also never leaks process.env secrets", async () => {
    const originalEnv = { ...process.env };
    process.env.DATABASE_URL = "postgresql://user:pass@host/db";
    process.env.JWT_SECRET = "super-secret-jwt-value-1234567890";
    process.env.HERMES_WORKER_TOKEN = "super-secret-refresh-token";

    try {
      const capturedEnvs: NodeJS.ProcessEnv[] = [];
      // Real section-04 `runHermesConnectionProbe` (not mocked) so its
      // `deps.spawnHermes` closure — built inside `handleControlJob` — is
      // actually exercised.
      const spawnImpl = (argv: string[], opts: { cwd: string; env: NodeJS.ProcessEnv }) => {
        capturedEnvs.push(opts.env);
        const stdoutEmitter = new EventEmitter();
        const stderrEmitter = new EventEmitter();
        const emitter = new EventEmitter();
        const child = Object.assign(emitter, { stdout: stdoutEmitter, stderr: stderrEmitter, kill: vi.fn(() => true) });
        setTimeout(() => {
          stdoutEmitter.emit("data", Buffer.from("Status: not authenticated\n"));
          emitter.emit("exit", 0);
        }, 0);
        return child;
      };
      const { client, events } = createFakeClient();
      const strategy = createNativeProfileStrategy({ root: profileRoot });
      const workspaceManager = createWorkspaceManager({ root: workspaceRoot });
      const handlers = createJobHandlers({
        client,
        strategy,
        workspaceManager,
        spawnImpl,
        config: { globalMaxConcurrent: 2, invocationTemplate: "print_mode", enableFileToolset: false, profileRoot },
      });

      await handlers.handle({
        id: "job-control-env",
        jobType: HERMES_CONNECTION_PROBE_JOB_TYPE,
        tenantId: "tenant-1",
        capabilityRequirementsJson: { connectionId: "conn-env" },
        inputJson: { connectionId: "conn-env", profileReference: "conn_conn-env" },
        instructionsJson: {},
        retryPolicyJson: null,
        timeoutSeconds: 30,
        leaseOwnerToken: "lease-1",
        leaseExpiresAt: null,
        assignmentAttempt: null,
      });

      expect(capturedEnvs.length).toBeGreaterThan(0);
      for (const env of capturedEnvs) {
        expect(env.HERMES_WORKER_TOKEN).toBeUndefined();
        expect(env.DATABASE_URL).toBeUndefined();
        expect(env.JWT_SECRET).toBeUndefined();
      }
      void events;
    } finally {
      process.env = originalEnv;
    }
  });

  it("classifies a Hermes process failure as a terminal, explicit failure — never retried in-handler", async () => {
    const { deps, events } = buildDeps({ spawnImpl: createFailingExitSpawn() });
    const settleFailedSpy = vi.spyOn(deps.workspaceManager, "settleFailed");
    const handlers = createJobHandlers(deps);

    await handlers.handle(baseMediaJob({ id: "job-terminal-fail" }));

    const failedEvent = events.find((event) => event.jobId === "job-terminal-fail" && event.eventType === "job.failed");
    expect(failedEvent).toBeDefined();
    expect(failedEvent?.payloadJson.code).toBe("HERMES_PROCESS_FAILED");
    expect(typeof failedEvent?.payloadJson.failureReason).toBe("string");
    // Exactly one job.failed — the handler never retries the SAME failure itself.
    expect(events.filter((event) => event.jobId === "job-terminal-fail" && event.eventType === "job.failed")).toHaveLength(1);
    expect(settleFailedSpy).toHaveBeenCalledWith("job-terminal-fail");
  });

  it("regression (FIX 9): a VALID leftover output file skips re-invoking Hermes (retry-avoidance)", async () => {
    const spawnImpl = vi.fn(createSuccessSpawn());
    const { deps, events } = buildDeps({ spawnImpl });
    const jobId = "job-prior-valid";
    // Pre-stage a valid PNG at the exact deterministic workspace path
    // BEFORE `handlers.handle()` even creates the workspace — `workspace.create`
    // is `mkdir -p`, so a pre-existing file survives.
    const outputDir = path.join(workspaceRoot, jobId, "output");
    await fs.mkdir(outputDir, { recursive: true });
    await fs.writeFile(path.join(outputDir, "prior-result.png"), PNG_BYTES);

    const handlers = createJobHandlers(deps);
    await handlers.handle(baseMediaJob({ id: jobId }));

    expect(spawnImpl).not.toHaveBeenCalled();
    const completed = events.find((event) => event.jobId === jobId && event.eventType === "job.completed");
    expect(completed).toBeDefined();
  });

  it("regression (FIX 9): a CORRUPT/truncated leftover output file is NEVER trusted — Hermes is re-invoked fresh", async () => {
    const spawnImpl = vi.fn(createSuccessSpawn());
    const completeArtifact = vi.fn(async () => ({ created: true, artifact: {} }));
    const { client, events } = createFakeClient({ completeArtifact });
    const strategy = createNativeProfileStrategy({ root: profileRoot });
    const workspaceManager = createWorkspaceManager({ root: workspaceRoot });
    const jobId = "job-prior-corrupt";
    const outputDir = path.join(workspaceRoot, jobId, "output");
    await fs.mkdir(outputDir, { recursive: true });
    // Corrupt/truncated leftover — magic-byte validation must reject this.
    await fs.writeFile(path.join(outputDir, "prior-result.png"), Buffer.from("not a real png"));

    const handlers = createJobHandlers({
      client,
      strategy,
      workspaceManager,
      spawnImpl,
      fetchImpl: (async () => ({ ok: true, status: 200, arrayBuffer: async () => new ArrayBuffer(0) })) as unknown as typeof fetch,
      config: { globalMaxConcurrent: 2, invocationTemplate: "print_mode", enableFileToolset: false, profileRoot },
    });
    await handlers.handle(baseMediaJob({ id: jobId }));

    // Must NOT have been shipped as-is — Hermes WAS invoked fresh, and the
    // artifact actually uploaded is the FRESH file's checksum (PNG_BYTES,
    // written by `createSuccessSpawn`), never the corrupt leftover's.
    expect(spawnImpl).toHaveBeenCalledTimes(1);
    expect(completeArtifact).toHaveBeenCalledTimes(1);
    expect(completeArtifact.mock.calls[0][1].checksumSha256).toBe(sha256(PNG_BYTES));
    const completed = events.find((event) => event.jobId === jobId && event.eventType === "job.completed");
    expect(completed).toBeDefined();
  });
});
