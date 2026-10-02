/**
 * Lane B (worker-fleet) `remotion_render_video` completion regression suite.
 *
 * The bug this locks down: `recordWorkerJobEvent` nested a `job.completed`
 * event's `payloadJson` under `outputJson.lastEventPayload` and never spread
 * it to the ROOT of `worker_jobs.outputJson`. Lane A (in-process dispatch)
 * writes `{ outputUrl, outputArtifactRef, artifacts, videoProjectId,
 * projectRevision, traceId }` at the root directly, so every consumer written
 * against that shape saw `outputJson.outputUrl === undefined` forever for a
 * render that had genuinely finished on an external worker.
 *
 * These tests drive the real Lane B sequence end to end against one in-memory
 * store — artifact init/complete upload, then the final `job.completed` event
 * — using the real `completeWorkerArtifact`, the real `recordWorkerJobEvent`,
 * and the real `finalizeRemotionRenderVideoLaneBOutput` (only the DB repos and
 * the storage backend are faked).
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

import type {
  WorkerArtifactCompletePayload,
  WorkerJobEventPayload,
} from "../../../shared/workerRuntime";

const { mockGetDb } = vi.hoisted(() => {
  process.env.JWT_SECRET = "test-jwt-secret-for-remotion-lane-b-finalize";
  return { mockGetDb: vi.fn() };
});

vi.mock("../../db", () => ({
  getDb: mockGetDb,
}));

const TENANT_ID = "tenant-1";
const WORKER_ID = "worker-1";
const JOB_ID = "job-remotion-lane-b-1";
const RUNTIME_TYPE = "desktop_zeroclaw_managed";
const LEASE_TOKEN = "lease-lane-b-1";
const MP4_STORAGE_REF = `worker-artifacts/${TENANT_ID}/${JOB_ID}/output.mp4`;
const RESOLVED_MP4_URL = `https://cdn.example.test/${MP4_STORAGE_REF}?signature=abc`;

interface Store {
  job: Record<string, any>;
  artifacts: Record<string, any>[];
  events: Record<string, any>[];
}

function buildStore(jobOverrides: Record<string, unknown> = {}): Store {
  return {
    job: {
      id: JOB_ID,
      tenantId: TENANT_ID,
      teamId: null,
      workerId: WORKER_ID,
      runtimeType: RUNTIME_TYPE,
      jobType: "remotion_render_video",
      status: "running",
      requestedByUserId: null,
      inputJson: {
        kind: "remotion_render_video",
        videoProjectId: "video-project-9",
        projectRevision: 4,
        traceId: "trace-lane-b-1",
      },
      instructionsJson: {},
      capabilityRequirementsJson: {},
      outputJson: null,
      leaseOwnerToken: LEASE_TOKEN,
      leaseExpiresAt: new Date("2030-04-06T00:05:00.000Z"),
      startedAt: new Date("2030-04-06T00:00:00.000Z"),
      finishedAt: null,
      failureReason: null,
      ...jobOverrides,
    },
    artifacts: [],
    events: [],
  };
}

/** Fake `WorkerRuntimeRepository` — the same store both calls mutate. */
function buildRuntimeRepo(store: Store) {
  return {
    getJobById: vi.fn(async (tenantId: string, jobId: string) =>
      store.job.tenantId === tenantId && store.job.id === jobId ? { ...store.job } : null,
    ),
    listJobEvents: vi.fn(async () => store.events.map((event) => ({ ...event }))),
    insertJobEvent: vi.fn(async (workerJobId: string, eventType: string, payloadJson: Record<string, unknown>) => {
      const event = { id: `event-${store.events.length + 1}`, workerJobId, eventType, payloadJson };
      store.events.push(event);
      return event;
    }),
    updateJob: vi.fn(async (_jobId: string, values: Record<string, unknown>) => {
      store.job = { ...store.job, ...values };
      return { ...store.job };
    }),
    findArtifact: vi.fn(async (workerJobId: string, storageRef: string) =>
      store.artifacts.find(
        (artifact) => artifact.workerJobId === workerJobId && artifact.storageRef === storageRef,
      ) ?? null,
    ),
    insertArtifact: vi.fn(async (values: Record<string, unknown>) => {
      const artifact = { id: `artifact-${store.artifacts.length + 1}`, ...values };
      store.artifacts.push(artifact);
      return { ...artifact };
    }),
  };
}

/** Fake `RemotionRenderLaneBFinalizeRepository` over the same store. */
function buildFinalizeRepo(store: Store) {
  return {
    getJobById: vi.fn(async (tenantId: string, jobId: string) =>
      store.job.tenantId === tenantId && store.job.id === jobId ? { ...store.job } : null,
    ),
    listArtifactsByJobId: vi.fn(async (jobId: string) =>
      store.artifacts.filter((artifact) => artifact.workerJobId === jobId).map((a) => ({ ...a })),
    ),
    updateJobOutput: vi.fn(async (_jobId: string, outputJson: Record<string, unknown>) => {
      store.job = { ...store.job, outputJson };
    }),
  };
}

const auth = {
  tenantId: TENANT_ID,
  workerId: WORKER_ID,
  runtimeType: RUNTIME_TYPE,
  scopes: ["workers:report"],
} as any;

const artifactCompletePayload: WorkerArtifactCompletePayload = {
  artifactType: "remotion_render_mp4",
  storageRef: MP4_STORAGE_REF,
  checksumSha256: "c".repeat(64),
  sizeBytes: 4_211_233,
  contentType: "video/mp4",
  metadataJson: { fileName: "output.mp4" },
  leaseOwnerToken: LEASE_TOKEN,
  assignmentAttempt: null,
};

/**
 * The Rust worker's `job.completed` payload: it mirrors Lane A's shape but
 * cannot mint a real URL (no `url` column on `worker_artifacts`), so it sends
 * its `storageRef` as the `outputUrl` stand-in.
 */
function buildCompletedEventPayload(overrides: Record<string, unknown> = {}): WorkerJobEventPayload {
  return {
    eventType: "job.completed",
    payloadJson: {
      videoProjectId: "video-project-9",
      projectRevision: 4,
      traceId: "trace-lane-b-1",
      outputUrl: MP4_STORAGE_REF,
      outputArtifactRef: {
        artifactType: "remotion_render_mp4",
        storageRef: MP4_STORAGE_REF,
        url: MP4_STORAGE_REF,
        contentHash: "c".repeat(64),
        mimeType: "video/mp4",
        sizeBytes: 4_211_233,
      },
      artifacts: [
        {
          artifactType: "remotion_render_mp4",
          storageRef: MP4_STORAGE_REF,
          url: MP4_STORAGE_REF,
          contentHash: "c".repeat(64),
          mimeType: "video/mp4",
          sizeBytes: 4_211_233,
        },
        { artifactType: "remotion_render_log", inline: { stagesCompleted: ["upload_artifacts"] } },
      ],
      ...overrides,
    },
    sequenceNumber: 7,
    leaseOwnerToken: LEASE_TOKEN,
  } as any;
}

/**
 * Runs the real Lane B sequence: artifact upload completion, then the final
 * `job.completed` event with the real finalizer bound to the fake repo/storage.
 */
async function runLaneBCompletion(
  store: Store,
  options: {
    eventPayload?: WorkerJobEventPayload;
    storageGet?: (storageRef: string) => Promise<{ key: string; url: string }>;
  } = {},
) {
  const { completeWorkerArtifact, recordWorkerJobEvent } = await import("../workerRegistryService");
  const { finalizeRemotionRenderVideoLaneBOutput } = await import(
    "../remotionRenderLaneBFinalizeService"
  );

  const repo = buildRuntimeRepo(store);
  const finalizeRepo = buildFinalizeRepo(store);
  const storageGet = options.storageGet
    ?? vi.fn(async (storageRef: string) => ({ key: storageRef, url: RESOLVED_MP4_URL }));

  await completeWorkerArtifact(
    { auth, jobId: JOB_ID, payload: artifactCompletePayload },
    { repo } as any,
  );

  const result = await recordWorkerJobEvent(
    { auth, jobId: JOB_ID, payload: options.eventPayload ?? buildCompletedEventPayload() },
    {
      repo,
      finalizeRemotionRenderVideoLaneBOutput: (params) =>
        finalizeRemotionRenderVideoLaneBOutput(params, { repo: finalizeRepo, storageGet }),
    } as any,
  );

  return { result, repo, finalizeRepo, storageGet };
}

describe("Lane B remotion_render_video completion", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("makes outputJson.outputUrl readable at the ROOT after the artifact upload + job.completed sequence", async () => {
    const store = buildStore();

    const { result, storageGet } = await runLaneBCompletion(store);

    // The regression: this was `undefined` for every Lane B render.
    expect(store.job.outputJson.outputUrl).toBe(RESOLVED_MP4_URL);
    expect(store.job.status).toBe("completed");

    // The URL is server-resolved from storageRef, never the worker's stand-in.
    expect(storageGet).toHaveBeenCalledWith(MP4_STORAGE_REF);
    expect(store.job.outputJson.outputUrl).not.toBe(MP4_STORAGE_REF);

    // The rest of Lane A's root shape is present too.
    expect(store.job.outputJson).toMatchObject({
      videoProjectId: "video-project-9",
      projectRevision: 4,
      traceId: "trace-lane-b-1",
    });
    expect(store.job.outputJson.outputArtifactRef).toMatchObject({
      artifactType: "remotion_render_mp4",
      storageRef: MP4_STORAGE_REF,
      url: RESOLVED_MP4_URL,
      mimeType: "video/mp4",
      sizeBytes: 4_211_233,
    });
    expect(store.job.outputJson.artifacts).toHaveLength(2);
    expect(store.job.outputJson.artifacts[0]).toMatchObject({
      artifactType: "remotion_render_mp4",
      url: RESOLVED_MP4_URL,
    });
    expect(store.job.outputJson.artifacts[1]).toMatchObject({
      artifactType: "remotion_render_log",
    });

    // Existing per-event bookkeeping is preserved, not replaced.
    expect(store.job.outputJson.lastEventType).toBe("job.completed");
    expect(store.job.outputJson.lastEventPayload).toMatchObject({ traceId: "trace-lane-b-1" });
    expect(store.job.outputJson.lastSequenceNumber).toBe(7);

    // The returned job reflects the finalized output (callers read it directly).
    expect((result.job as Record<string, any>).outputJson.outputUrl).toBe(RESOLVED_MP4_URL);
  });

  it("resolves the URL from the uploaded artifact even when the worker reports no outputUrl at all", async () => {
    const store = buildStore();

    await runLaneBCompletion(store, {
      eventPayload: buildCompletedEventPayload({
        outputUrl: undefined,
        outputArtifactRef: undefined,
        artifacts: undefined,
      }),
    });

    expect(store.job.outputJson.outputUrl).toBe(RESOLVED_MP4_URL);
    // With no reported list, artifacts are synthesized from the uploaded rows.
    expect(store.job.outputJson.artifacts).toEqual([
      expect.objectContaining({
        artifactType: "remotion_render_mp4",
        storageRef: MP4_STORAGE_REF,
        url: RESOLVED_MP4_URL,
      }),
    ]);
    // Identity fields fall back to the job's enqueue-time inputJson.
    expect(store.job.outputJson).toMatchObject({
      videoProjectId: "video-project-9",
      projectRevision: 4,
      traceId: "trace-lane-b-1",
    });
  });

  it("still completes the job when storage cannot resolve the artifact (fail-soft, no root outputUrl)", async () => {
    const store = buildStore();

    await runLaneBCompletion(store, {
      storageGet: vi.fn(async () => {
        throw new Error("storage backend unavailable");
      }),
    });

    expect(store.job.status).toBe("completed");
    expect(store.job.outputJson.outputUrl).toBeUndefined();
    // The completion itself is still recorded.
    expect(store.job.outputJson.lastEventPayload).toMatchObject({ traceId: "trace-lane-b-1" });
  });

  it("regression: a non-remotion job type's completion never gains root outputUrl/artifacts keys", async () => {
    const store = buildStore({ jobType: "video_assembly" });
    const { recordWorkerJobEvent } = await import("../workerRegistryService");
    const repo = buildRuntimeRepo(store);
    const finalize = vi.fn();

    await recordWorkerJobEvent(
      {
        auth,
        jobId: JOB_ID,
        payload: {
          eventType: "job.completed",
          payloadJson: { outputUrl: "should-not-be-spread" },
          sequenceNumber: 1,
          leaseOwnerToken: LEASE_TOKEN,
        } as any,
      },
      { repo, finalizeRemotionRenderVideoLaneBOutput: finalize } as any,
    );

    expect(finalize).not.toHaveBeenCalled();
    expect(store.job.outputJson).not.toHaveProperty("outputUrl");
    expect(store.job.outputJson).not.toHaveProperty("outputArtifactRef");
    expect(store.job.outputJson).not.toHaveProperty("artifacts");
  });
});
