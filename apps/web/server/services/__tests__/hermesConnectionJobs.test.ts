import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  enqueueHermesConnectionControlJob,
  HERMES_CONTROL_JOB_PRIORITY,
  onTerminalHermesMediaJob,
  runHermesConnectionSettlementTick,
  settleHermesConnectionJob,
  startHermesConnectionJobSweep,
  stopHermesConnectionJobSweep,
  type HermesConnectionJobsRepo,
} from "../hermesConnectionJobs";
import {
  HERMES_CONNECTION_AUTH_JOB_TYPE,
  HERMES_CONNECTION_DISCONNECT_JOB_TYPE,
  HERMES_CONNECTION_PROBE_JOB_TYPE,
  HERMES_MEDIA_IMAGE_JOB_TYPE,
} from "../../../shared/workerRuntime";
import { HERMES_CONNECTION_SETTLED_EVENT_TYPE } from "../../../shared/hermesMedia";
import type { HermesProviderConnection, Worker, WorkerJob } from "../../../drizzle/schema";
import { auditLogger } from "../auditLogger";

vi.mock("../hermesMediaObservability", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../hermesMediaObservability")>();
  return { ...actual, recordHermesUsage: vi.fn().mockResolvedValue(undefined) };
});

const NOW = new Date("2026-06-01T12:00:00.000Z");
const TENANT_ID = "tenant-1";

function buildConnectionRow(overrides: Partial<HermesProviderConnection> = {}): HermesProviderConnection {
  return {
    id: "conn-1",
    tenantId: TENANT_ID,
    ownerUserId: 1,
    scope: "server_personal",
    providerType: "xai_grok",
    adapterType: "hermes_cli",
    authenticationType: "oauth_device_code",
    status: "pending",
    assignedWorkerId: "worker-1",
    profileReference: "conn_conn-1",
    accountLabel: null,
    accountHint: null,
    entitlementStatus: null,
    capabilitiesJson: null,
    defaultForImage: false,
    defaultForVideo: false,
    dailyJobQuota: null,
    metadataJson: {},
    createdAt: NOW,
    authorizedAt: null,
    lastProbeAt: null,
    disconnectedAt: null,
    ...overrides,
  } as HermesProviderConnection;
}

function buildWorkerRow(overrides: Partial<Worker> = {}): Worker {
  return {
    id: "worker-1",
    tenantId: TENANT_ID,
    teamId: null,
    runtimeType: "desktop_zeroclaw_managed",
    workerMode: "external_runtime",
    machineId: null,
    machineName: null,
    displayName: "Hermes worker",
    status: "online",
    runtimeVersion: "1.0.0",
    runtimeMode: "external_managed",
    runtimeProfileId: null,
    policyProfileId: null,
    externalReference: "worker-app://hermes-1",
    dashboardUrl: null,
    capabilitiesJson: {},
    hardwareJson: {},
    healthSummaryJson: {},
    warningFlagsJson: [],
    fileScopeMode: "workspace_scoped",
    lastSeenAt: NOW,
    registeredByUserId: 1,
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  } as Worker;
}

function buildWorkerJob(overrides: Partial<WorkerJob> = {}): WorkerJob {
  return {
    id: "job-1",
    tenantId: TENANT_ID,
    teamId: null,
    workerId: "worker-1",
    runtimeType: "desktop_zeroclaw_managed",
    workflowRunId: null,
    requestedByUserId: 1,
    requestedByPersonaId: null,
    requestedBySystemComponent: null,
    jobType: HERMES_CONNECTION_AUTH_JOB_TYPE,
    status: "completed",
    statusReason: null,
    priority: HERMES_CONTROL_JOB_PRIORITY,
    resourceProfile: "cpu_light",
    capabilityRequirementsJson: { connectionId: "conn-1" },
    inputJson: {},
    instructionsJson: {},
    outputJson: null,
    failureReason: null,
    timeoutSeconds: 900,
    retryPolicyJson: {},
    idempotencyKey: null,
    leaseOwnerToken: null,
    leaseExpiresAt: null,
    createdAt: NOW,
    startedAt: NOW,
    finishedAt: NOW,
    ...overrides,
  } as WorkerJob;
}

function buildRepo(overrides: Partial<HermesConnectionJobsRepo> = {}): HermesConnectionJobsRepo {
  return {
    findJobById: vi.fn().mockResolvedValue(null),
    findNonTerminalControlJobForConnection: vi.fn().mockResolvedValue(null),
    findWorkerById: vi.fn().mockResolvedValue(buildWorkerRow()),
    insertJob: vi.fn().mockImplementation(async (values) => ({ id: "job-new", createdAt: NOW, ...values })),
    listTerminalUnsettledHermesJobs: vi.fn().mockResolvedValue([]),
    appendJobEvent: vi.fn().mockResolvedValue(undefined),
    updateConnectionRow: vi.fn(),
    findConnectionById: vi.fn().mockResolvedValue(buildConnectionRow()),
    ...overrides,
  };
}

describe("enqueueHermesConnectionControlJob", () => {
  it("authorize: inserts with cpu_light, timeout=900, statusReason, priority, retryPolicyJson maxAttempts=1, capabilityRequirementsJson + inputJson from the section-03 builder", async () => {
    const repo = buildRepo();
    const connection = buildConnectionRow();

    const result = await enqueueHermesConnectionControlJob(
      {
        jobType: HERMES_CONNECTION_AUTH_JOB_TYPE,
        tenantId: TENANT_ID,
        requestedByUserId: 1,
        connection,
        workerId: "worker-1",
      },
      { repo },
    );

    expect(result.created).toBe(true);
    expect(repo.insertJob).toHaveBeenCalledWith(expect.objectContaining({
      jobType: HERMES_CONNECTION_AUTH_JOB_TYPE,
      resourceProfile: "cpu_light",
      timeoutSeconds: 900,
      statusReason: "hermes_connection_jobs",
      priority: HERMES_CONTROL_JOB_PRIORITY,
      retryPolicyJson: { maxAttempts: 1 },
      workerId: "worker-1",
      runtimeType: "desktop_zeroclaw_managed",
      idempotencyKey: `${HERMES_CONNECTION_AUTH_JOB_TYPE}:conn-1`,
      capabilityRequirementsJson: expect.objectContaining({
        requiredClaimCapability: "hermes_media",
        capabilityFamilies: ["hermes-media-generation"],
        connectionId: "conn-1",
        preferredWorkerId: "worker-1",
      }),
      inputJson: {
        connectionId: "conn-1",
        profileReference: "conn_conn-1",
        timeoutSeconds: 900,
      },
    }));
  });

  it("probe: timeout=300, retryPolicyJson maxAttempts=2", async () => {
    const repo = buildRepo();
    await enqueueHermesConnectionControlJob(
      {
        jobType: HERMES_CONNECTION_PROBE_JOB_TYPE,
        tenantId: TENANT_ID,
        requestedByUserId: 1,
        connection: buildConnectionRow(),
        workerId: "worker-1",
      },
      { repo },
    );
    expect(repo.insertJob).toHaveBeenCalledWith(expect.objectContaining({
      jobType: HERMES_CONNECTION_PROBE_JOB_TYPE,
      timeoutSeconds: 300,
      retryPolicyJson: { maxAttempts: 2 },
    }));
  });

  it("disconnect: timeout=120, retryPolicyJson maxAttempts=1", async () => {
    const repo = buildRepo();
    await enqueueHermesConnectionControlJob(
      {
        jobType: HERMES_CONNECTION_DISCONNECT_JOB_TYPE,
        tenantId: TENANT_ID,
        requestedByUserId: 1,
        connection: buildConnectionRow(),
        workerId: "worker-1",
      },
      { repo },
    );
    expect(repo.insertJob).toHaveBeenCalledWith(expect.objectContaining({
      jobType: HERMES_CONNECTION_DISCONNECT_JOB_TYPE,
      timeoutSeconds: 120,
      retryPolicyJson: { maxAttempts: 1 },
    }));
  });

  it("never calls any admission/rate-limit-shaped repo method (only the 8 declared repo methods exist to call)", async () => {
    const repo = buildRepo();
    await enqueueHermesConnectionControlJob(
      {
        jobType: HERMES_CONNECTION_AUTH_JOB_TYPE,
        tenantId: TENANT_ID,
        requestedByUserId: 1,
        connection: buildConnectionRow(),
        workerId: "worker-1",
      },
      { repo },
    );
    expect(repo.listTerminalUnsettledHermesJobs).not.toHaveBeenCalled();
    expect(repo.appendJobEvent).not.toHaveBeenCalled();
  });

  it("1-concurrent-per-connection: a non-terminal control job in flight short-circuits to created:false with the existing job", async () => {
    const existingJob = buildWorkerJob({ id: "job-existing", status: "running" });
    const repo = buildRepo({
      findNonTerminalControlJobForConnection: vi.fn().mockResolvedValue(existingJob),
    });

    const result = await enqueueHermesConnectionControlJob(
      {
        jobType: HERMES_CONNECTION_PROBE_JOB_TYPE,
        tenantId: TENANT_ID,
        requestedByUserId: 1,
        connection: buildConnectionRow(),
        workerId: "worker-1",
      },
      { repo },
    );

    expect(result).toEqual({ created: false, job: existingJob });
    expect(repo.insertJob).not.toHaveBeenCalled();
  });

  it("a terminal prior job does not block a new enqueue (repo simply returns null for non-terminal lookup)", async () => {
    const repo = buildRepo({ findNonTerminalControlJobForConnection: vi.fn().mockResolvedValue(null) });
    const result = await enqueueHermesConnectionControlJob(
      {
        jobType: HERMES_CONNECTION_PROBE_JOB_TYPE,
        tenantId: TENANT_ID,
        requestedByUserId: 1,
        connection: buildConnectionRow(),
        workerId: "worker-1",
      },
      { repo },
    );
    expect(result.created).toBe(true);
  });

  it("idempotency-key race: a real Postgres unique-violation (code 23505) re-reads and returns the winner's row instead of throwing", async () => {
    const racedJob = buildWorkerJob({ id: "job-raced", status: "queued" });
    const pgUniqueViolation = Object.assign(
      new Error('duplicate key value violates unique constraint "worker_jobs_tenant_idempotency_key_unique"'),
      { code: "23505" },
    );
    const repo = buildRepo({
      insertJob: vi.fn().mockRejectedValue(pgUniqueViolation),
      findNonTerminalControlJobForConnection: vi.fn()
        .mockResolvedValueOnce(null) // first check: nothing in flight yet
        .mockResolvedValueOnce(racedJob), // re-read after the unique-conflict
    });

    const result = await enqueueHermesConnectionControlJob(
      {
        jobType: HERMES_CONNECTION_AUTH_JOB_TYPE,
        tenantId: TENANT_ID,
        requestedByUserId: 1,
        connection: buildConnectionRow(),
        workerId: "worker-1",
      },
      { repo },
    );

    expect(result).toEqual({ created: false, job: racedJob });
  });

  it("a unique-violation with no existing non-terminal job (race lost by neither party) rethrows instead of returning a fake success", async () => {
    const pgUniqueViolation = Object.assign(
      new Error('duplicate key value violates unique constraint "worker_jobs_tenant_idempotency_key_unique"'),
      { code: "23505" },
    );
    const repo = buildRepo({
      insertJob: vi.fn().mockRejectedValue(pgUniqueViolation),
      findNonTerminalControlJobForConnection: vi.fn().mockResolvedValue(null),
    });

    await expect(enqueueHermesConnectionControlJob(
      {
        jobType: HERMES_CONNECTION_AUTH_JOB_TYPE,
        tenantId: TENANT_ID,
        requestedByUserId: 1,
        connection: buildConnectionRow(),
        workerId: "worker-1",
      },
      { repo },
    )).rejects.toBe(pgUniqueViolation);
  });

  it("a GENERIC insert error (not a unique-violation) propagates instead of being masked as an idempotency race", async () => {
    const genericError = new Error("connection terminated unexpectedly");
    const findNonTerminalControlJobForConnection = vi.fn().mockResolvedValue(null);
    const repo = buildRepo({
      insertJob: vi.fn().mockRejectedValue(genericError),
      findNonTerminalControlJobForConnection,
    });

    await expect(enqueueHermesConnectionControlJob(
      {
        jobType: HERMES_CONNECTION_AUTH_JOB_TYPE,
        tenantId: TENANT_ID,
        requestedByUserId: 1,
        connection: buildConnectionRow(),
        workerId: "worker-1",
      },
      { repo },
    )).rejects.toBe(genericError);

    // Only the initial pre-insert concurrency check — no race re-read
    // triggered for a non-unique-violation error.
    expect(findNonTerminalControlJobForConnection).toHaveBeenCalledTimes(1);
  });

  it("tenant mismatch (connection.tenantId !== params.tenantId) rejects before building/inserting anything", async () => {
    const repo = buildRepo();
    await expect(enqueueHermesConnectionControlJob(
      {
        jobType: HERMES_CONNECTION_AUTH_JOB_TYPE,
        tenantId: TENANT_ID,
        requestedByUserId: 1,
        connection: buildConnectionRow({ tenantId: "tenant-other" }),
        workerId: "worker-1",
      },
      { repo },
    )).rejects.toThrow();

    expect(repo.findNonTerminalControlJobForConnection).not.toHaveBeenCalled();
    expect(repo.insertJob).not.toHaveBeenCalled();
  });

  it("passes tenantId through to findNonTerminalControlJobForConnection (tenant-scoped concurrency check)", async () => {
    const repo = buildRepo();
    await enqueueHermesConnectionControlJob(
      {
        jobType: HERMES_CONNECTION_AUTH_JOB_TYPE,
        tenantId: TENANT_ID,
        requestedByUserId: 1,
        connection: buildConnectionRow(),
        workerId: "worker-1",
      },
      { repo },
    );
    expect(repo.findNonTerminalControlJobForConnection).toHaveBeenCalledWith({
      connectionId: "conn-1",
      tenantId: TENANT_ID,
    });
  });

  it("throws when the target worker cannot be found", async () => {
    const repo = buildRepo({ findWorkerById: vi.fn().mockResolvedValue(null) });
    await expect(enqueueHermesConnectionControlJob(
      {
        jobType: HERMES_CONNECTION_AUTH_JOB_TYPE,
        tenantId: TENANT_ID,
        requestedByUserId: 1,
        connection: buildConnectionRow(),
        workerId: "worker-missing",
      },
      { repo },
    )).rejects.toThrow();
  });
});

describe("settleHermesConnectionJob — control job settlement (table-driven)", () => {
  it("authorize completed -> row authorized, authorizedAt set, accountHint persisted; marker appended", async () => {
    let state = buildConnectionRow({ status: "pending" });
    const updateConnectionRow = vi.fn().mockImplementation(async ({ values }) => {
      state = { ...state, ...values };
      return state;
    });
    const repo = buildRepo({
      findConnectionById: vi.fn().mockImplementation(async () => state),
      updateConnectionRow,
    });
    const job = buildWorkerJob({
      status: "completed",
      outputJson: { accountHint: "grok-fan" },
    });

    const result = await settleHermesConnectionJob(job, { repo, now: () => NOW });

    expect(result.settled).toBe(true);
    expect(state.status).toBe("authorized");
    expect(state.accountHint).toBe("grok-fan");
    expect(repo.appendJobEvent).toHaveBeenCalledWith({
      jobId: job.id,
      eventType: HERMES_CONNECTION_SETTLED_EVENT_TYPE,
      payloadJson: {},
    });
  });

  it("authorize failed with expiry/denial reasons -> row error + typed metadataJson.lastError", async () => {
    let state = buildConnectionRow({ status: "pending" });
    const repo = buildRepo({
      findConnectionById: vi.fn().mockImplementation(async () => state),
      updateConnectionRow: vi.fn().mockImplementation(async ({ values }) => {
        state = { ...state, ...values };
        return state;
      }),
    });
    const job = buildWorkerJob({ status: "failed", failureReason: "oauth_session_expired" });

    await settleHermesConnectionJob(job, { repo, now: () => NOW });

    expect(state.status).toBe("error");
    expect((state.metadataJson as any).lastError).toBe("HERMES_OAUTH_SESSION_EXPIRED");
  });

  it("authorize lease-expired with no terminal event -> row error with the expiry code", async () => {
    let state = buildConnectionRow({ status: "pending" });
    const repo = buildRepo({
      findConnectionById: vi.fn().mockImplementation(async () => state),
      updateConnectionRow: vi.fn().mockImplementation(async ({ values }) => {
        state = { ...state, ...values };
        return state;
      }),
    });
    const job = buildWorkerJob({ status: "expired", failureReason: null });

    await settleHermesConnectionJob(job, { repo, now: () => NOW });

    expect(state.status).toBe("error");
    expect((state.metadataJson as any).lastError).toBe("HERMES_TIMEOUT");
  });

  it("probe completed -> capabilitiesJson = manifest, lastProbeAt set", async () => {
    let state = buildConnectionRow({ status: "authorized" });
    const repo = buildRepo({
      findConnectionById: vi.fn().mockImplementation(async () => state),
      updateConnectionRow: vi.fn().mockImplementation(async ({ values }) => {
        state = { ...state, ...values };
        return state;
      }),
    });
    const manifest = { hermesVersion: "1.0", probedAt: NOW.toISOString(), operations: {}, models: { image: [], video: [] } };
    const job = buildWorkerJob({
      jobType: HERMES_CONNECTION_PROBE_JOB_TYPE,
      status: "completed",
      outputJson: { capabilities: manifest },
    });

    await settleHermesConnectionJob(job, { repo, now: () => NOW });

    expect(state.capabilitiesJson).toEqual(manifest);
    expect(state.lastProbeAt).toEqual(NOW);
  });

  it("probe classified 403 (constants-first, exact reason string) -> entitlement_restricted", async () => {
    let state = buildConnectionRow({ status: "authorized" });
    const repo = buildRepo({
      findConnectionById: vi.fn().mockImplementation(async () => state),
      updateConnectionRow: vi.fn().mockImplementation(async ({ values }) => {
        state = { ...state, ...values };
        return state;
      }),
    });
    const job = buildWorkerJob({
      jobType: HERMES_CONNECTION_PROBE_JOB_TYPE,
      status: "failed",
      failureReason: "entitlement_restricted",
    });

    await settleHermesConnectionJob(job, { repo, now: () => NOW });

    expect(state.status).toBe("entitlement_restricted");
  });

  it("probe classified auth-invalid (constants-first, exact reason string) -> reauth_required", async () => {
    let state = buildConnectionRow({ status: "authorized" });
    const repo = buildRepo({
      findConnectionById: vi.fn().mockImplementation(async () => state),
      updateConnectionRow: vi.fn().mockImplementation(async ({ values }) => {
        state = { ...state, ...values };
        return state;
      }),
    });
    const job = buildWorkerJob({
      jobType: HERMES_CONNECTION_PROBE_JOB_TYPE,
      status: "failed",
      failureReason: "reauth_required",
    });

    await settleHermesConnectionJob(job, { repo, now: () => NOW });

    expect(state.status).toBe("reauth_required");
  });

  it("disconnect completed -> disconnected + disconnectedAt", async () => {
    let state = buildConnectionRow({ status: "authorized" });
    const repo = buildRepo({
      findConnectionById: vi.fn().mockImplementation(async () => state),
      updateConnectionRow: vi.fn().mockImplementation(async ({ values }) => {
        state = { ...state, ...values };
        return state;
      }),
    });
    const job = buildWorkerJob({ jobType: HERMES_CONNECTION_DISCONNECT_JOB_TYPE, status: "completed" });

    await settleHermesConnectionJob(job, { repo, now: () => NOW });

    expect(state.status).toBe("disconnected");
    expect(state.disconnectedAt).toEqual(NOW);
  });

  it("disconnect failed -> row NOT marked disconnected", async () => {
    let state = buildConnectionRow({ status: "authorized" });
    const updateConnectionRow = vi.fn().mockImplementation(async ({ values }) => {
      state = { ...state, ...values };
      return state;
    });
    const repo = buildRepo({
      findConnectionById: vi.fn().mockImplementation(async () => state),
      updateConnectionRow,
    });
    const job = buildWorkerJob({ jobType: HERMES_CONNECTION_DISCONNECT_JOB_TYPE, status: "failed", failureReason: "process crashed" });

    await settleHermesConnectionJob(job, { repo, now: () => NOW });

    expect(state.status).not.toBe("disconnected");
    expect(updateConnectionRow).not.toHaveBeenCalled();
  });

  it("is a no-op (settled: false) for a non-terminal job", async () => {
    const repo = buildRepo();
    const job = buildWorkerJob({ status: "running" });
    const result = await settleHermesConnectionJob(job, { repo });
    expect(result.settled).toBe(false);
    expect(repo.appendJobEvent).not.toHaveBeenCalled();
  });
});

describe("settleHermesConnectionJob — hermes_media_* side effects", () => {
  it("auth-classified failureReason -> connection reauth_required", async () => {
    let state = buildConnectionRow({ status: "authorized" });
    const repo = buildRepo({
      findConnectionById: vi.fn().mockImplementation(async () => state),
      updateConnectionRow: vi.fn().mockImplementation(async ({ values }) => {
        state = { ...state, ...values };
        return state;
      }),
    });
    const job = buildWorkerJob({
      jobType: HERMES_MEDIA_IMAGE_JOB_TYPE,
      status: "failed",
      failureReason: "reauth_required",
      capabilityRequirementsJson: {},
      inputJson: { connectionId: "conn-1" },
    });

    const result = await settleHermesConnectionJob(job, { repo });

    expect(result.settled).toBe(true);
    expect(state.status).toBe("reauth_required");
    expect(repo.appendJobEvent).toHaveBeenCalledTimes(1);
  });

  it("403-classified failureReason -> connection entitlement_restricted", async () => {
    let state = buildConnectionRow({ status: "authorized" });
    const repo = buildRepo({
      findConnectionById: vi.fn().mockImplementation(async () => state),
      updateConnectionRow: vi.fn().mockImplementation(async ({ values }) => {
        state = { ...state, ...values };
        return state;
      }),
    });
    const job = buildWorkerJob({
      jobType: HERMES_MEDIA_IMAGE_JOB_TYPE,
      status: "failed",
      failureReason: "entitlement_restricted",
      capabilityRequirementsJson: {},
      inputJson: { connectionId: "conn-1" },
    });

    await settleHermesConnectionJob(job, { repo });

    expect(state.status).toBe("entitlement_restricted");
  });

  it("a generic (\"other\") failure has no connection-status side effect", async () => {
    const updateConnectionRow = vi.fn();
    const repo = buildRepo({
      findConnectionById: vi.fn().mockResolvedValue(buildConnectionRow({ status: "authorized" })),
      updateConnectionRow,
    });
    const job = buildWorkerJob({
      jobType: HERMES_MEDIA_IMAGE_JOB_TYPE,
      status: "failed",
      failureReason: "ffmpeg exited with code 1",
      capabilityRequirementsJson: {},
      inputJson: { connectionId: "conn-1" },
    });

    await onTerminalHermesMediaJob(job, { repo });

    expect(updateConnectionRow).not.toHaveBeenCalled();
  });

  it("tenant mismatch (defense-in-depth) -> no connection-status side effect", async () => {
    const updateConnectionRow = vi.fn();
    const repo = buildRepo({
      findConnectionById: vi.fn().mockResolvedValue(buildConnectionRow({ tenantId: "tenant-other" })),
      updateConnectionRow,
    });
    const job = buildWorkerJob({
      jobType: HERMES_MEDIA_IMAGE_JOB_TYPE,
      status: "failed",
      failureReason: "reauth_required",
      tenantId: TENANT_ID,
      capabilityRequirementsJson: {},
      inputJson: { connectionId: "conn-1" },
    });

    await onTerminalHermesMediaJob(job, { repo });

    expect(updateConnectionRow).not.toHaveBeenCalled();
  });
});

describe("runHermesConnectionSettlementTick", () => {
  it("settles all terminal-unsettled jobs in one tick and marks them settled", async () => {
    let connState1 = buildConnectionRow({ id: "conn-1", status: "pending" });
    let connState2 = buildConnectionRow({ id: "conn-2", status: "pending" });
    const job1 = buildWorkerJob({ id: "job-1", status: "completed", capabilityRequirementsJson: { connectionId: "conn-1" }, outputJson: { accountHint: "a" } });
    const job2 = buildWorkerJob({ id: "job-2", status: "completed", capabilityRequirementsJson: { connectionId: "conn-2" }, outputJson: { accountHint: "b" } });

    const repo = buildRepo({
      listTerminalUnsettledHermesJobs: vi.fn().mockResolvedValue([job1, job2]),
      findConnectionById: vi.fn().mockImplementation(async ({ connectionId }) => (
        connectionId === "conn-1" ? connState1 : connState2
      )),
      updateConnectionRow: vi.fn().mockImplementation(async ({ connectionId, values }) => {
        if (connectionId === "conn-1") connState1 = { ...connState1, ...values };
        else connState2 = { ...connState2, ...values };
        return connectionId === "conn-1" ? connState1 : connState2;
      }),
    });

    await runHermesConnectionSettlementTick({ repo, now: () => NOW });

    expect(connState1.status).toBe("authorized");
    expect(connState2.status).toBe("authorized");
    expect(repo.appendJobEvent).toHaveBeenCalledTimes(2);
  });

  it("a repo error settling one job does not abort the rest", async () => {
    const job1 = buildWorkerJob({ id: "job-1", status: "completed", capabilityRequirementsJson: { connectionId: "conn-1" } });
    const job2 = buildWorkerJob({ id: "job-2", status: "completed", capabilityRequirementsJson: { connectionId: "conn-2" } });
    let secondSettled = false;

    const repo = buildRepo({
      listTerminalUnsettledHermesJobs: vi.fn().mockResolvedValue([job1, job2]),
      findConnectionById: vi.fn().mockImplementation(async ({ connectionId }) => {
        if (connectionId === "conn-1") throw new Error("db exploded");
        return buildConnectionRow({ id: "conn-2", status: "pending" });
      }),
      updateConnectionRow: vi.fn().mockImplementation(async ({ values }) => {
        secondSettled = true;
        return buildConnectionRow({ id: "conn-2", ...values });
      }),
    });

    await expect(runHermesConnectionSettlementTick({ repo, now: () => NOW })).resolves.toBeUndefined();
    expect(secondSettled).toBe(true);
  });

  it("a repo error listing jobs never throws (fails closed)", async () => {
    const repo = buildRepo({ listTerminalUnsettledHermesJobs: vi.fn().mockRejectedValue(new Error("db down")) });
    await expect(runHermesConnectionSettlementTick({ repo })).resolves.toBeUndefined();
  });

  it("idempotent across ticks: once a job is settled it drops off the unsettled list, so a second tick performs zero additional writes", async () => {
    let settled = false;
    let state = buildConnectionRow({ status: "pending" });
    const job = buildWorkerJob({ status: "completed", capabilityRequirementsJson: { connectionId: "conn-1" }, outputJson: { accountHint: "a" } });

    const repo = buildRepo({
      listTerminalUnsettledHermesJobs: vi.fn().mockImplementation(async () => (settled ? [] : [job])),
      findConnectionById: vi.fn().mockImplementation(async () => state),
      updateConnectionRow: vi.fn().mockImplementation(async ({ values }) => {
        state = { ...state, ...values };
        return state;
      }),
      appendJobEvent: vi.fn().mockImplementation(async () => {
        settled = true;
      }),
    });

    await runHermesConnectionSettlementTick({ repo, now: () => NOW });
    await runHermesConnectionSettlementTick({ repo, now: () => NOW });

    expect(repo.appendJobEvent).toHaveBeenCalledTimes(1);
    expect(repo.updateConnectionRow).toHaveBeenCalledTimes(1);
  });
});

describe("Feature 135 section 12 — onTerminalHermesMediaJob observability wiring", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("emits hermes_connection_entitlement_restricted when a media job failure is classified entitlement_restricted", async () => {
    const spy = vi.spyOn(auditLogger, "log").mockImplementation(() => {});
    let state = buildConnectionRow({ status: "authorized" });
    const repo = buildRepo({
      findConnectionById: vi.fn().mockImplementation(async () => state),
      updateConnectionRow: vi.fn().mockImplementation(async ({ values }) => {
        state = { ...state, ...values };
        return state;
      }),
    });
    const job = buildWorkerJob({
      jobType: HERMES_MEDIA_IMAGE_JOB_TYPE,
      status: "failed",
      failureReason: "entitlement_restricted",
      capabilityRequirementsJson: {},
      inputJson: { connectionId: "conn-1" },
    });

    await onTerminalHermesMediaJob(job, { repo });

    expect(spy).toHaveBeenCalledWith(expect.objectContaining({ eventType: "hermes_connection_entitlement_restricted" }));
    spy.mockRestore();
  });

  it("code review FIX 4: emits hermes_connection_reauth_required when a media job failure is classified reauth_required", async () => {
    const spy = vi.spyOn(auditLogger, "log").mockImplementation(() => {});
    let state = buildConnectionRow({ status: "authorized" });
    const repo = buildRepo({
      findConnectionById: vi.fn().mockImplementation(async () => state),
      updateConnectionRow: vi.fn().mockImplementation(async ({ values }) => {
        state = { ...state, ...values };
        return state;
      }),
    });
    const job = buildWorkerJob({
      jobType: HERMES_MEDIA_IMAGE_JOB_TYPE,
      status: "failed",
      failureReason: "reauth_required",
      capabilityRequirementsJson: {},
      inputJson: { connectionId: "conn-1" },
    });

    await onTerminalHermesMediaJob(job, { repo });

    expect(spy).toHaveBeenCalledWith(expect.objectContaining({ eventType: "hermes_connection_reauth_required" }));
    spy.mockRestore();
  });

  it("calls recordHermesUsage for a completed hermes_media_* job (terminal sweep path)", async () => {
    const { recordHermesUsage } = await import("../hermesMediaObservability");
    const repo = buildRepo();
    const job = buildWorkerJob({
      jobType: HERMES_MEDIA_IMAGE_JOB_TYPE,
      status: "completed",
      capabilityRequirementsJson: { connectionId: "conn-1" },
      inputJson: { settings: { model: "grok-image-1" } },
      instructionsJson: {},
    });

    await onTerminalHermesMediaJob(job, { repo });

    expect(recordHermesUsage).toHaveBeenCalledWith(
      expect.objectContaining({ job: expect.objectContaining({ id: job.id, status: "completed" }), feeCreditsKept: 0 }),
    );
  });

  it("does not call recordHermesUsage's completion path for a failed job (feeCreditsKept forced to 0, still gated inside recordHermesUsage by status)", async () => {
    const { recordHermesUsage } = await import("../hermesMediaObservability");
    const repo = buildRepo();
    const job = buildWorkerJob({
      jobType: HERMES_MEDIA_IMAGE_JOB_TYPE,
      status: "failed",
      failureReason: "ffmpeg exited with code 1",
      capabilityRequirementsJson: {},
      inputJson: { connectionId: "conn-1" },
    });

    await onTerminalHermesMediaJob(job, { repo });

    expect(recordHermesUsage).toHaveBeenCalledWith(
      expect.objectContaining({ feeCreditsKept: 0 }),
    );
  });
});

describe("start/stop sweep", () => {
  it("startHermesConnectionJobSweep / stopHermesConnectionJobSweep are idempotent and use an unref'd timer", () => {
    const originalSetTimeout = global.setTimeout;
    const unrefSpy = vi.fn();
    const timeoutSpy = vi.spyOn(global, "setTimeout").mockImplementation(((fn: any, ms?: number) => {
      const handle = originalSetTimeout(() => {}, 0);
      (handle as any).unref = unrefSpy;
      return handle as any;
    }) as any);

    startHermesConnectionJobSweep();
    startHermesConnectionJobSweep(); // second call is a no-op (idempotent)
    expect(timeoutSpy).toHaveBeenCalledTimes(1);
    expect(unrefSpy).toHaveBeenCalledTimes(1);

    stopHermesConnectionJobSweep();
    stopHermesConnectionJobSweep(); // second call is a no-op (idempotent)

    timeoutSpy.mockRestore();
  });
});
