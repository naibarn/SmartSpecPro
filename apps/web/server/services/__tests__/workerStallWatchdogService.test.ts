import { describe, expect, it, vi } from "vitest";

import {
  getWorkerReassignEligibility,
  requeueStalledWorkerJobs,
  requestWorkerJobReassignment,
  WORKER_HARD_STALL_THRESHOLD_MS,
  WORKER_USER_REASSIGN_THRESHOLD_MS,
  type WorkerStallWatchdogRepository,
} from "../workerStallWatchdogService";

const now = new Date("2026-06-22T10:30:00.000Z");

function hyperframesJob(overrides: Record<string, any> = {}) {
  return {
    id: "job-hf-1",
    tenantId: "tenant-1",
    requestedByUserId: 7,
    workerId: "worker-1",
    runtimeType: "desktop_zeroclaw_managed",
    jobType: "hyperframes_final_composite",
    status: "running",
    outputJson: {
      assignmentAttempt: "attempt_1",
      assignmentWorkerId: "worker-1",
      assignmentStatus: "active",
      assignedAt: new Date(now.getTime() - WORKER_USER_REASSIGN_THRESHOLD_MS - 1_000).toISOString(),
    },
    leaseOwnerToken: "lease-1",
    leaseExpiresAt: new Date(now.getTime() + 60_000),
    createdAt: new Date(now.getTime() - WORKER_USER_REASSIGN_THRESHOLD_MS - 1_000),
    startedAt: new Date(now.getTime() - WORKER_USER_REASSIGN_THRESHOLD_MS - 1_000),
    ...overrides,
  };
}

function createRepo(job = hyperframesJob(), candidates = [job]): WorkerStallWatchdogRepository {
  return {
    getJobById: vi.fn().mockResolvedValue(job),
    listWatchdogCandidates: vi.fn().mockResolvedValue(candidates),
    updateJob: vi.fn().mockImplementation(async (_jobId, values) => ({
      ...job,
      ...values,
    })),
    insertJobEvent: vi.fn().mockResolvedValue({ id: "event-1" }),
  };
}

describe("workerStallWatchdogService", () => {
  it("allows user reassignment only after the slow threshold", async () => {
    const slowJob = hyperframesJob();
    const repo = createRepo(slowJob);

    await expect(requestWorkerJobReassignment({
      auth: { tenantId: "tenant-1", userId: 7 },
      jobId: "job-hf-1",
      now,
    }, { repo })).resolves.toEqual(expect.objectContaining({
      requeued: true,
      previousWorkerId: "worker-1",
    }));

    expect(repo.updateJob).toHaveBeenCalledWith("job-hf-1", expect.objectContaining({
      status: "queued",
      workerId: null,
      leaseOwnerToken: null,
      leaseExpiresAt: null,
      outputJson: expect.objectContaining({
        assignmentAttempt: null,
        assignmentStatus: "requeued",
        previousAssignments: [
          expect.objectContaining({
            assignmentAttempt: "attempt_1",
            assignmentWorkerId: "worker-1",
          }),
        ],
      }),
    }));

    const freshRepo = createRepo(hyperframesJob({
      outputJson: {
        assignmentAttempt: "attempt_2",
        assignedAt: new Date(now.getTime() - 5 * 60 * 1000).toISOString(),
      },
      createdAt: new Date(now.getTime() - 5 * 60 * 1000),
    }));

    await expect(requestWorkerJobReassignment({
      auth: { tenantId: "tenant-1", userId: 7 },
      jobId: "job-hf-1",
      now,
    }, { repo: freshRepo })).rejects.toMatchObject({
      code: "CONFLICT",
    });
  });

  it("does not let another requester reassign a job", async () => {
    const repo = createRepo(hyperframesJob());

    await expect(requestWorkerJobReassignment({
      auth: { tenantId: "tenant-1", userId: 99 },
      jobId: "job-hf-1",
      now,
    }, { repo })).rejects.toMatchObject({
      code: "NOT_FOUND",
    });

    expect(repo.updateJob).not.toHaveBeenCalled();
  });

  it("reports reassign eligibility with remaining wait time", () => {
    const job = hyperframesJob({
      outputJson: {
        assignedAt: new Date(now.getTime() - 10 * 60 * 1000).toISOString(),
      },
    });

    expect(getWorkerReassignEligibility(job, now)).toEqual(expect.objectContaining({
      eligible: false,
      remainingMs: 5 * 60 * 1000,
    }));
  });

  it("watchdog requeues jobs held beyond the hard stall threshold", async () => {
    const stalledJob = hyperframesJob({
      outputJson: {
        assignmentAttempt: "attempt_stalled",
        assignmentWorkerId: "worker-1",
        assignedAt: new Date(now.getTime() - WORKER_HARD_STALL_THRESHOLD_MS - 1_000).toISOString(),
      },
      createdAt: new Date(now.getTime() - WORKER_HARD_STALL_THRESHOLD_MS - 1_000),
    });
    const freshJob = hyperframesJob({
      id: "job-hf-2",
      outputJson: {
        assignmentAttempt: "attempt_fresh",
        assignedAt: new Date(now.getTime() - 5 * 60 * 1000).toISOString(),
      },
    });
    const repo = createRepo(stalledJob, [stalledJob, freshJob]);

    await expect(requeueStalledWorkerJobs({
      tenantId: "tenant-1",
      now,
    }, { repo })).resolves.toEqual({
      inspected: 2,
      requeued: 1,
      failed: 0,
      skipped: 1,
      jobIds: ["job-hf-1"],
    });

    expect(repo.updateJob).toHaveBeenCalledWith("job-hf-1", expect.objectContaining({
      status: "queued",
      statusReason: "Worker attempt exceeded watchdog threshold and was requeued",
      workerId: null,
      outputJson: expect.objectContaining({
        assignmentStatus: "requeued",
      }),
    }));
    expect(repo.insertJobEvent).toHaveBeenCalledWith("job-hf-1", "job.requeued", expect.objectContaining({
      actor: "watchdog",
      terminal: false,
    }));
  });

  it("fails repeated stalled jobs instead of requeueing forever", async () => {
    const stalledJob = hyperframesJob({
      outputJson: {
        assignmentAttempt: "attempt_3",
        assignedAt: new Date(now.getTime() - WORKER_HARD_STALL_THRESHOLD_MS - 1_000).toISOString(),
        previousAssignments: [
          { assignmentAttempt: "attempt_1" },
          { assignmentAttempt: "attempt_2" },
        ],
      },
    });
    const repo = createRepo(stalledJob, [stalledJob]);

    await expect(requeueStalledWorkerJobs({
      tenantId: "tenant-1",
      now,
      maxAutomaticAttempts: 3,
    }, { repo })).resolves.toEqual(expect.objectContaining({
      requeued: 0,
      failed: 1,
    }));

    expect(repo.updateJob).toHaveBeenCalledWith("job-hf-1", expect.objectContaining({
      status: "failed",
      workerId: null,
      outputJson: expect.objectContaining({
        assignmentStatus: "operator_required",
      }),
    }));
    expect(repo.insertJobEvent).toHaveBeenCalledWith("job-hf-1", "job.failed", expect.objectContaining({
      terminal: true,
    }));
  });
});
