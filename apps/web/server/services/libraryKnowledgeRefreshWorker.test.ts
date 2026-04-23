import { beforeEach, describe, expect, it, vi } from "vitest";

const knowledgeBackfillMocks = vi.hoisted(() => ({
  refreshLibraryKnowledgeItem: vi.fn(),
}));

const dbMocks = vi.hoisted(() => ({
  getDb: vi.fn(),
}));

const cloudTaskMocks = vi.hoisted(() => ({
  enqueueTask: vi.fn(),
}));

vi.mock("./libraryKnowledgeBackfillService", () => ({
  refreshLibraryKnowledgeItem: knowledgeBackfillMocks.refreshLibraryKnowledgeItem,
}));

vi.mock("../db", () => ({
  getDb: dbMocks.getDb,
}));

vi.mock("./cloudTasks", () => ({
  enqueueTask: cloudTaskMocks.enqueueTask,
}));

import {
  dispatchLibraryKnowledgeRefreshWorker,
  processLibraryKnowledgeRefreshJobs,
  runLibraryKnowledgeRefreshWorker,
  type LibraryKnowledgeRefreshExecutionStatus,
  type LibraryKnowledgeRefreshWorkerJob,
  type LibraryKnowledgeRefreshWorkerRepository,
} from "./libraryKnowledgeRefreshWorker";

interface MutableJobState {
  job: LibraryKnowledgeRefreshWorkerJob;
  completedAt: Date | null;
  error: string | null;
  skippedReason: string | null;
  claimed: boolean;
}

function createInMemoryRepo(
  jobs: LibraryKnowledgeRefreshWorkerJob[],
): {
  repo: LibraryKnowledgeRefreshWorkerRepository;
  state: Map<number, MutableJobState>;
} {
  const state = new Map<number, MutableJobState>(
    jobs.map((job) => [
      job.id,
      {
        job: { ...job },
        completedAt: null,
        error: null,
        skippedReason: null,
        claimed: false,
      },
    ]),
  );

  return {
    state,
    repo: {
      listDueJobs: async (limit, now, filter) =>
        Array.from(state.values())
          .map((entry) => entry.job)
          .filter((job) =>
            job.knowledgeRefreshRequestedAt
            && job.knowledgeRefreshRequestedAt.getTime() <= now.getTime()
            && (job.knowledgeRefreshStatus === "pending"
              || job.knowledgeRefreshStatus === "retry_pending"),
          )
          .filter((job) => !filter?.jobIds?.length || filter.jobIds.includes(job.id))
          .filter((job) => !filter?.libraryItemId || job.libraryItemId === filter.libraryItemId)
          .filter((job) => !filter?.tenantId || job.tenantId === filter.tenantId)
          .slice(0, limit),
      claimJobProcessing: async (jobId) => {
        const entry = state.get(jobId);
        if (!entry || entry.claimed || !["pending", "retry_pending"].includes(entry.job.knowledgeRefreshStatus ?? "")) {
          return false;
        }
        entry.claimed = true;
        entry.job.knowledgeRefreshStatus = "processing";
        return true;
      },
      markJobCompleted: async (jobId, now) => {
        const entry = state.get(jobId);
        if (!entry) return;
        entry.job.knowledgeRefreshStatus = "completed";
        entry.completedAt = now;
        entry.error = null;
      },
      markJobSkipped: async (jobId, now, skippedReason) => {
        const entry = state.get(jobId);
        if (!entry) return;
        entry.job.knowledgeRefreshStatus = "skipped";
        entry.completedAt = now;
        entry.skippedReason = skippedReason;
      },
      markJobFailed: async (jobId, now, errorMessage, shouldRetry) => {
        const entry = state.get(jobId);
        if (!entry) return;
        entry.job.knowledgeRefreshAttemptCount += 1;
        entry.job.knowledgeRefreshStatus = shouldRetry ? "retry_pending" : "failed";
        entry.job.knowledgeRefreshRequestedAt = shouldRetry
          ? new Date(now.getTime() + 60_000)
          : now;
        entry.completedAt = shouldRetry ? null : now;
        entry.error = errorMessage;
      },
    },
  };
}

function createJob(overrides: Partial<LibraryKnowledgeRefreshWorkerJob> = {}): LibraryKnowledgeRefreshWorkerJob {
  return {
    id: 1,
    tenantId: "tenant-1",
    libraryItemId: 99,
    jobStatus: "pending",
    maxAttempts: 3,
    payloadJson: {},
    source: "library.markdown_update",
    sourceMetadataJson: {},
    knowledgeRefreshReason: "markdown_save",
    knowledgeRefreshStatus: "pending",
    knowledgeRefreshAttemptCount: 0,
    knowledgeRefreshRequestedAt: new Date("2026-04-21T00:00:00.000Z"),
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  delete process.env.USE_CLOUD_TASKS;
});

describe("processLibraryKnowledgeRefreshJobs", () => {
  it("calls refreshLibraryKnowledgeItem only for jobs containing knowledge-refresh metadata", async () => {
    knowledgeBackfillMocks.refreshLibraryKnowledgeItem.mockResolvedValue({
      libraryItemId: 99,
      refreshed: true,
      relationCount: 2,
      skippedReason: null,
    });

    const { repo } = createInMemoryRepo([
      createJob({
        id: 1,
        knowledgeRefreshRequestedAt: new Date("2026-04-21T00:00:00.000Z"),
      }),
      createJob({
        id: 2,
        knowledgeRefreshRequestedAt: null,
        knowledgeRefreshStatus: null,
      }),
    ]);

    const result = await processLibraryKnowledgeRefreshJobs(repo, { limit: 10 });

    expect(result).toEqual({
      processed: 1,
      completed: 1,
      failed: 0,
      skipped: 0,
      jobIds: [1],
    });
    expect(knowledgeBackfillMocks.refreshLibraryKnowledgeItem).toHaveBeenCalledTimes(1);
    expect(knowledgeBackfillMocks.refreshLibraryKnowledgeItem).toHaveBeenCalledWith({
      tenantId: "tenant-1",
      libraryItemId: 99,
    });
  });

  it("records completed knowledge refresh without changing vector-index job status semantics", async () => {
    knowledgeBackfillMocks.refreshLibraryKnowledgeItem.mockResolvedValue({
      libraryItemId: 101,
      refreshed: true,
      relationCount: 3,
      skippedReason: null,
    });

    const { repo, state } = createInMemoryRepo([
      createJob({
        id: 3,
        libraryItemId: 101,
        jobStatus: "processing",
      }),
    ]);

    await processLibraryKnowledgeRefreshJobs(repo, { limit: 10 });

    expect(state.get(3)?.job.jobStatus).toBe("processing");
    expect(state.get(3)?.job.knowledgeRefreshStatus).toBe("completed");
  });

  it("records retryable failures with retry count and error details for transient errors", async () => {
    knowledgeBackfillMocks.refreshLibraryKnowledgeItem.mockRejectedValue(
      new Error("database timeout"),
    );

    const { repo, state } = createInMemoryRepo([
      createJob({
        id: 4,
        libraryItemId: 404,
        maxAttempts: 3,
      }),
    ]);

    const result = await processLibraryKnowledgeRefreshJobs(repo, { limit: 10 });

    expect(result.failed).toBe(1);
    expect(state.get(4)?.job.knowledgeRefreshStatus).toBe(
      "retry_pending" satisfies LibraryKnowledgeRefreshExecutionStatus,
    );
    expect(state.get(4)?.job.knowledgeRefreshAttemptCount).toBe(1);
    expect(state.get(4)?.error).toContain("database timeout");
    expect(state.get(4)?.completedAt).toBeNull();
    expect(state.get(4)?.job.knowledgeRefreshRequestedAt?.getTime()).toBeGreaterThan(
      new Date("2026-04-21T00:00:00.000Z").getTime(),
    );
  });

  it("marks deleted or non-markdown items as skipped with deterministic diagnostics", async () => {
    knowledgeBackfillMocks.refreshLibraryKnowledgeItem.mockResolvedValue({
      libraryItemId: 505,
      refreshed: false,
      relationCount: 0,
      skippedReason: "not_markdown",
    });

    const { repo, state } = createInMemoryRepo([
      createJob({
        id: 5,
        libraryItemId: 505,
      }),
    ]);

    const result = await processLibraryKnowledgeRefreshJobs(repo, { limit: 10 });

    expect(result.skipped).toBe(1);
    expect(state.get(5)?.job.knowledgeRefreshStatus).toBe("skipped");
    expect(state.get(5)?.skippedReason).toBe("not_markdown");
  });

  it("claims due jobs before processing so duplicate worker kicks do not double-run the same job", async () => {
    knowledgeBackfillMocks.refreshLibraryKnowledgeItem.mockResolvedValue({
      libraryItemId: 606,
      refreshed: true,
      relationCount: 1,
      skippedReason: null,
    });

    const { repo, state } = createInMemoryRepo([
      createJob({
        id: 6,
        libraryItemId: 606,
      }),
    ]);

    await processLibraryKnowledgeRefreshJobs(repo, {
      limit: 10,
      jobIds: [6, 6],
    });
    await processLibraryKnowledgeRefreshJobs(repo, {
      limit: 10,
      jobIds: [6],
    });

    expect(knowledgeBackfillMocks.refreshLibraryKnowledgeItem).toHaveBeenCalledTimes(1);
    expect(state.get(6)?.job.knowledgeRefreshStatus).toBe("completed");
  });
});

describe("runLibraryKnowledgeRefreshWorker", () => {
  it("returns an empty result when the database is unavailable", async () => {
    dbMocks.getDb.mockResolvedValue(null);

    await expect(runLibraryKnowledgeRefreshWorker()).resolves.toEqual({
      processed: 0,
      completed: 0,
      failed: 0,
      skipped: 0,
      jobIds: [],
    });
  });
});

describe("dispatchLibraryKnowledgeRefreshWorker", () => {
  it("enqueues a node Cloud Task when Cloud Tasks mode is enabled", async () => {
    process.env.USE_CLOUD_TASKS = "true";
    cloudTaskMocks.enqueueTask.mockResolvedValue("projects/p/locations/l/queues/q/tasks/kt-1");

    const result = await dispatchLibraryKnowledgeRefreshWorker({
      jobIds: [42],
      libraryItemId: 101,
      tenantId: "tenant-1",
      limit: 10,
    });

    expect(result).toEqual({
      mode: "cloud_tasks",
      taskName: "projects/p/locations/l/queues/q/tasks/kt-1",
    });
    expect(cloudTaskMocks.enqueueTask).toHaveBeenCalledWith({
      queueName: "periodic-tasks",
      handlerPath: "/_internal/tasks/library-knowledge-refresh",
      payload: {
        jobId: 42,
        libraryItemId: 101,
        tenantId: "tenant-1",
        limit: 10,
      },
      delaySeconds: undefined,
      targetService: "node",
    });
    delete process.env.USE_CLOUD_TASKS;
  });

  it("falls back to inline execution when Cloud Tasks mode is disabled", async () => {
    process.env.USE_CLOUD_TASKS = "false";
    knowledgeBackfillMocks.refreshLibraryKnowledgeItem.mockResolvedValue({
      libraryItemId: 202,
      refreshed: true,
      relationCount: 1,
      skippedReason: null,
    });

    const db = {
      select: vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            orderBy: vi.fn().mockReturnValue({
              limit: vi.fn().mockResolvedValue([
                createJob({
                  id: 7,
                  libraryItemId: 202,
                  tenantId: "tenant-inline",
                }),
              ]),
            }),
          }),
        }),
      }),
      update: vi.fn().mockReturnValue({
        set: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            returning: vi.fn().mockResolvedValue([{ id: 7 }]),
          }),
        }),
      }),
    };
    const updateChain = {
      set: vi.fn()
        .mockReturnValueOnce({
          where: vi.fn().mockReturnValue({
            returning: vi.fn().mockResolvedValue([{ id: 7 }]),
          }),
        })
        .mockReturnValueOnce({
          where: vi.fn().mockResolvedValue(undefined),
        }),
    };
    db.update = vi.fn()
      .mockReturnValueOnce(updateChain)
      .mockReturnValueOnce({
        set: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue(undefined),
        }),
      });
    dbMocks.getDb.mockResolvedValue(db as any);

    const result = await dispatchLibraryKnowledgeRefreshWorker({
      jobIds: [7],
      tenantId: "tenant-inline",
    });

    expect(result.mode).toBe("inline");
    expect(result.result).toMatchObject({
      processed: 1,
      completed: 1,
      failed: 0,
      skipped: 0,
      jobIds: [7],
    });
    delete process.env.USE_CLOUD_TASKS;
  });
});
