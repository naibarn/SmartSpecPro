import { beforeEach, describe, expect, it, vi } from "vitest";

const mockGetDb = vi.fn();
const mockListTaskObservability = vi.fn();
const mockListUserWorkerJobs = vi.fn();

vi.mock("../../db", () => ({
  getDb: (...args: unknown[]) => mockGetDb(...args),
}));
vi.mock("../taskObservabilityReadModel", () => ({
  listTaskObservability: (...args: unknown[]) =>
    mockListTaskObservability(...args),
}));
vi.mock("../workerJobMonitorService", () => ({
  listUserWorkerJobs: (...args: unknown[]) => mockListUserWorkerJobs(...args),
}));

import {
  getRunnerCompanionState,
  mapRunnerDeviceView,
} from "../runnerCompanionViewState";

function makeDb(rows: unknown[]) {
  let call = 0;
  const dbChain = () => {
    const chain: Record<string, ReturnType<typeof vi.fn>> = {};
    chain.from = vi.fn(() => chain);
    chain.where = vi.fn(() => chain);
    chain.orderBy = vi.fn(() => chain);
    chain.limit = vi.fn(async () => rows[call++] ?? []);
    return chain;
  };
  return { select: vi.fn(dbChain) };
}

const freshObservedAt = new Date(Date.now() - 30_000);
const freshExpiresAt = new Date(Date.now() + 9 * 60_000);

const runnerRow = {
  runnerId: "runner-1",
  tenantId: "tenant-a",
  ownerUserId: 7,
  deviceId: "device-1",
  displayName: "Windows Runner",
  profile: "local_device",
  nodeKind: "local_device",
  trustState: "trusted",
  status: "online",
  revokedAt: null,
  lastSeenAt: freshObservedAt,
  activeSessionId: "session-1",
  currentSnapshotRevision: "rev-1",
  snapshotObservedAt: freshObservedAt,
  snapshotExpiresAt: freshExpiresAt,
  currentSnapshotJson: {
    runnerSessionId: "session-1",
    platform: { os: "windows", architecture: "x64", target: "desktop" },
    capabilityInventory: [
      { capabilityId: "browser", availabilityState: "available" },
      { capabilityId: "files", availabilityState: "unavailable" },
    ],
  },
};

const baseWorkerJob = {
  id: "job-1",
  jobType: "computer_use.browser",
  status: "waiting_external",
  statusReason: "waiting_approval",
  operatorReviewRequired: true,
  operatorReviewReason: "Approve the bounded browser action",
  failureReason: null,
  runtimeType: "node_job_worker",
  resourceProfile: "quick",
  workflowRunId: null,
  createdAt: new Date("2026-10-22T00:00:00.000Z"),
  startedAt: new Date("2026-10-22T00:00:01.000Z"),
  finishedAt: null,
  progressPercent: null,
  progressPhase: null,
  orchestration: {
    planId: null,
    stepId: null,
    stepIndex: null,
    totalSteps: null,
    dependsOnJobIds: [],
    metadataState: "none",
  },
  latestEvent: null,
  worker: null,
  outputRefs: [
    {
      artifactId: "artifact-1",
      artifactType: "browser-screenshot",
      verificationState: "verified",
      contentHash: "hash-1",
      mimeType: "image/png",
      sizeBytes: 128,
      storageRef: "private-storage-ref",
      downloadUrl: "https://private.example/download",
      sourceUrl: "https://private.example/source",
    },
  ],
  canCancel: true,
  canRetry: false,
  retryReason: null,
  attempt: 1,
  maxAttempts: 1,
};

describe("Runner Companion view-state projection", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetDb.mockReturnValue(
      makeDb([
        [runnerRow],
        [
          {
            id: "job-1",
            progressJson: {
              externalWait: {
                metadata: {
                  approval: {
                    state: "pending",
                    requestId: "approval-1",
                    actionId: "action-1",
                    requestedAt: "2026-10-22T00:00:02.000Z",
                  },
                },
              },
            },
          },
        ],
      ])
    );
    mockListTaskObservability.mockResolvedValue({
      items: [
        {
          id: "job-1",
          runnerId: "runner-1",
          runnerSessionState: "running",
          stage: "observe",
          attempt: 1,
          maxAttempts: 2,
        },
      ],
      snapshot: {
        asOf: "2026-10-22T00:00:00.000Z",
        expiresAt: "2026-10-22T00:05:00.000Z",
        projectionToken: "signed-snapshot-token",
        consistency: "created_at_watermark_live_state",
      },
    });
    mockListUserWorkerJobs.mockResolvedValue({
      items: [
        {
          id: "job-1",
          jobType: "computer_use.browser",
          status: "waiting_external",
          statusReason: "waiting_approval",
          operatorReviewRequired: true,
          operatorReviewReason: "Approve the bounded browser action",
          failureReason: null,
          runtimeType: "node_job_worker",
          resourceProfile: "quick",
          workflowRunId: null,
          createdAt: new Date("2026-10-22T00:00:00.000Z"),
          startedAt: new Date("2026-10-22T00:00:01.000Z"),
          finishedAt: null,
          progressPercent: null,
          progressPhase: null,
          orchestration: {
            planId: null,
            stepId: null,
            stepIndex: null,
            totalSteps: null,
            dependsOnJobIds: [],
            metadataState: "none",
          },
          latestEvent: null,
          worker: null,
          outputRefs: [
            {
              artifactId: "artifact-1",
              artifactType: "browser-screenshot",
              verificationState: "verified",
              contentHash: "hash-1",
              mimeType: "image/png",
              sizeBytes: 128,
              storageRef: "private-storage-ref",
              downloadUrl: "https://private.example/download",
              sourceUrl: "https://private.example/source",
            },
          ],
          canCancel: true,
          canRetry: false,
          retryReason: null,
          attempt: 1,
          maxAttempts: 1,
        },
      ],
    });
  });

  it("projects owned Runner, canonical task, approval and verified output references", async () => {
    const state = await getRunnerCompanionState({
      tenantId: "tenant-a",
      userId: 7,
    });

    expect(state.schemaVersion).toBe("runner-companion.v1");
    expect(state.devices[0]).toMatchObject({
      runnerId: "runner-1",
      pairing: "paired",
      connectivity: "online",
      capabilities: { state: "fresh", count: 2, availableCount: 1 },
      session: { active: true, continuity: "current" },
    });
    expect(state.tasks[0]).toMatchObject({
      jobId: "job-1",
      status: "waiting_for_approval",
      attempt: 1,
      maxAttempts: 2,
      progress: {
        percent: null,
        phase: "observe",
        source: "canonical_task_observability",
      },
      nextAction: "approve",
      outputEvidenceIds: ["artifact:artifact-1"],
    });
    expect(state.approvals[0]).toMatchObject({
      jobId: "job-1",
      source: "canonical_job_external_wait",
    });
    expect(state.evidence[0]).toMatchObject({
      evidenceId: "artifact:artifact-1",
      verificationState: "verified",
      contentHash: "hash-1",
    });
    expect(state.evidence[0]).not.toHaveProperty("storageRef");
    expect(state.evidence[0]).not.toHaveProperty("downloadUrl");
    expect(state.evidence[0]).not.toHaveProperty("sourceUrl");
    expect(state.reconciliation).toMatchObject({
      projectionToken: "signed-snapshot-token",
      eventContinuity: "not_claimed",
    });
    expect(mockListTaskObservability).toHaveBeenCalledWith({
      scope: { tenantId: "tenant-a", userId: 7, isAdmin: false },
    });
    expect(mockListUserWorkerJobs).toHaveBeenCalledWith({
      auth: { tenantId: "tenant-a", userId: 7 },
      limit: 50,
    });
  });

  it.each([
    ["completed", "completed"],
    ["failed", "failed"],
    ["cancelled", "cancelled"],
  ] as const)(
    "keeps terminal %s status ahead of stale approval metadata",
    async (storedStatus, expectedStatus) => {
      mockListUserWorkerJobs.mockResolvedValue({
        items: [
          {
            ...baseWorkerJob,
            status: storedStatus,
            finishedAt: new Date("2026-10-22T00:00:03.000Z"),
          },
        ],
      });

      const state = await getRunnerCompanionState({
        tenantId: "tenant-a",
        userId: 7,
      });

      expect(state.tasks[0]).toMatchObject({
        status: expectedStatus,
      });
      expect(state.tasks[0].nextAction).toBe(
        storedStatus === "cancelled" ? "none" : "review_result"
      );
      expect(state.approvals).toEqual([]);
    }
  );

  it("bounds evidence globally and per task without schema overflow", async () => {
    mockListUserWorkerJobs.mockResolvedValue({
      items: Array.from({ length: 4 }, (_, jobIndex) => ({
        ...baseWorkerJob,
        id: `job-${jobIndex + 1}`,
        outputRefs: Array.from({ length: 140 }, (_, index) => ({
          artifactId: `artifact-${jobIndex}-${index}`,
          artifactType: "browser-screenshot",
          verificationState: "verified",
          contentHash: `hash-${jobIndex}-${index}`,
          mimeType: "image/png",
          sizeBytes: 128,
        })),
      })),
    });

    const state = await getRunnerCompanionState({
      tenantId: "tenant-a",
      userId: 7,
    });

    expect(state.evidence).toHaveLength(100);
    expect(state.tasks[0].outputEvidenceIds).toHaveLength(32);
    expect(state.tasks[0].outputEvidenceIds).toEqual(
      state.evidence.slice(0, 32).map(item => item.evidenceId)
    );
  });

  it("shows tenant-shared Runner visibility without projecting execution authority", async () => {
    mockGetDb.mockReturnValue(
      makeDb([[{ ...runnerRow, ownerUserId: null }], []])
    );

    const state = await getRunnerCompanionState({
      tenantId: "tenant-a",
      userId: 7,
    });

    expect(state.devices).toHaveLength(1);
    expect(state.devices[0]).toMatchObject({ runnerId: "runner-1" });
    expect(state.devices[0]).not.toHaveProperty("canExecute");
    expect(state.devices[0]).not.toHaveProperty("authority");
    expect(state.devices[0]).not.toHaveProperty("lease");
  });

  it("represents input waits from canonical status reason without inventing approval", async () => {
    mockGetDb.mockReturnValue(
      makeDb([[runnerRow], [{ id: "job-1", progressJson: {} }]])
    );
    mockListUserWorkerJobs.mockResolvedValueOnce({
      items: [
        {
          id: "job-1",
          jobType: "computer_use.browser",
          status: "waiting_external",
          statusReason: "input_required",
          operatorReviewRequired: false,
          operatorReviewReason: null,
          failureReason: null,
          runtimeType: "node_job_worker",
          resourceProfile: "quick",
          workflowRunId: null,
          createdAt: new Date("2026-10-22T00:00:00.000Z"),
          startedAt: null,
          finishedAt: null,
          progressPercent: null,
          progressPhase: null,
          orchestration: {
            planId: null,
            stepId: null,
            stepIndex: null,
            totalSteps: null,
            dependsOnJobIds: [],
            metadataState: "none",
          },
          latestEvent: null,
          worker: null,
          outputRefs: [],
          canCancel: true,
          canRetry: false,
          retryReason: null,
          attempt: 1,
          maxAttempts: 1,
        },
      ],
    });

    const state = await getRunnerCompanionState({
      tenantId: "tenant-a",
      userId: 7,
    });

    expect(state.tasks[0]).toMatchObject({
      status: "waiting_for_input",
      nextAction: "provide_input",
    });
    expect(state.approvals).toEqual([]);
  });

  it("does not claim a fresh capability when the snapshot is stale", () => {
    const stale = mapRunnerDeviceView({
      ...runnerRow,
      snapshotExpiresAt: new Date("2026-10-21T23:00:00.000Z"),
    });

    expect(stale).toMatchObject({
      connectivity: "stale",
      capabilities: { state: "stale" },
      session: { continuity: "stale" },
    });
  });

  it("fails closed when the companion scope is missing", async () => {
    await expect(
      getRunnerCompanionState({ tenantId: "", userId: 7 })
    ).rejects.toThrow("RUNNER_COMPANION_SCOPE_REQUIRED");
    expect(mockListTaskObservability).not.toHaveBeenCalled();
  });
});
