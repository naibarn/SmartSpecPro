/**
 * Vertical Drama Render Queue plan
 * (`planning/vertical-drama-render-queue/plan.md` §4.1/§4.2) Wave 1 —
 * `queueVerticalDramaFfmpegAssemblyJob` tests. Mocked repo only — never hits
 * the DB (repo methods are `vi.fn()` injected via the `deps` param).
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  queueVerticalDramaFfmpegAssemblyJob,
  workerJobMatchesSelection,
  type QueueVerticalDramaFfmpegAssemblyJobInput,
} from "../workerSchedulerService";
import {
  HYPERFRAMES_FINAL_COMPOSITE_CAPABILITY_FAMILIES,
  VERTICAL_DRAMA_FFMPEG_ASSEMBLY_CAPABILITY_FAMILIES,
  VERTICAL_DRAMA_FFMPEG_ASSEMBLY_JOB_TYPE,
} from "../../../shared/workerRuntime";

let fixtureCounter = 0;

function buildInput(
  overrides: Partial<QueueVerticalDramaFfmpegAssemblyJobInput> = {},
): QueueVerticalDramaFfmpegAssemblyJobInput {
  fixtureCounter += 1;
  const n = fixtureCounter;
  return {
    kind: "sub_episode",
    owner: {
      tenantId: `tenant_${n}`,
      userId: `user_${n}`,
      seriesId: `series_${n}`,
      episodeId: `episode_${n}`,
    },
    display: {
      label: `Episode ${n}`,
      seriesTitle: `Series ${n}`,
      episodeNumber: n,
    },
    renderFeed: { clips: [{ id: `clip_${n}`, url: `https://example.com/clip_${n}.mp4` }] },
    contractVersion: 1,
    tenantId: `tenant_${n}`,
    requestedByUserId: n,
    ...overrides,
  };
}

describe("queueVerticalDramaFfmpegAssemblyJob", () => {
  const repo = {
    findJobByIdempotencyKey: vi.fn(),
    findWorkerById: vi.fn(),
    insertJob: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    repo.findJobByIdempotencyKey.mockResolvedValue(null);
    repo.insertJob.mockImplementation(async (values: Record<string, unknown>) => ({
      id: "job-1",
      status: "queued",
      ...values,
    }));
  });

  it(`parses input and inserts a job with jobType=${VERTICAL_DRAMA_FFMPEG_ASSEMBLY_JOB_TYPE}`, async () => {
    const input = buildInput();
    const result = await queueVerticalDramaFfmpegAssemblyJob(input, { repo: repo as any });

    expect(result.created).toBe(true);
    expect(repo.insertJob).toHaveBeenCalledWith(
      expect.objectContaining({
        jobType: VERTICAL_DRAMA_FFMPEG_ASSEMBLY_JOB_TYPE,
        runtimeType: "desktop_zeroclaw_managed",
        status: "queued",
        resourceProfile: "cpu_heavy",
        requestedByUserId: input.requestedByUserId,
      }),
    );
  });

  it("rejects invalid input with a specific schema-parse error, never a blanket message", async () => {
    const input = buildInput({ owner: { tenantId: "t", userId: "", seriesId: "s" } as any });
    await expect(
      queueVerticalDramaFfmpegAssemblyJob(input, { repo: repo as any }),
    ).rejects.toThrow();
    expect(repo.insertJob).not.toHaveBeenCalled();
  });

  it("sets capabilityFamilies=VERTICAL_DRAMA_FFMPEG_ASSEMBLY_CAPABILITY_FAMILIES (non-empty, distinct)", async () => {
    expect(VERTICAL_DRAMA_FFMPEG_ASSEMBLY_CAPABILITY_FAMILIES.length).toBeGreaterThan(0);
    const input = buildInput();
    await queueVerticalDramaFfmpegAssemblyJob(input, { repo: repo as any });

    expect(repo.insertJob).toHaveBeenCalledWith(
      expect.objectContaining({
        capabilityRequirementsJson: expect.objectContaining({
          capabilityFamilies: [...VERTICAL_DRAMA_FFMPEG_ASSEMBLY_CAPABILITY_FAMILIES],
        }),
      }),
    );
  });

  it("a hyperframes-only worker's hints do NOT match this job (isolated capability family)", async () => {
    const input = buildInput();
    await queueVerticalDramaFfmpegAssemblyJob(input, { repo: repo as any });
    const insertedJob = repo.insertJob.mock.calls[0]![0] as Record<string, unknown>;

    expect(
      workerJobMatchesSelection(insertedJob, "hf-worker", [
        ...HYPERFRAMES_FINAL_COMPOSITE_CAPABILITY_FAMILIES,
      ]),
    ).toBe(false);
  });

  it("a vertical-drama-ffmpeg-assembly worker's hints DO match", async () => {
    const input = buildInput();
    await queueVerticalDramaFfmpegAssemblyJob(input, { repo: repo as any });
    const insertedJob = repo.insertJob.mock.calls[0]![0] as Record<string, unknown>;

    expect(
      workerJobMatchesSelection(insertedJob, "vd-ffmpeg-worker", [
        ...VERTICAL_DRAMA_FFMPEG_ASSEMBLY_CAPABILITY_FAMILIES,
      ]),
    ).toBe(true);
  });

  it("reserves ZERO credits (free job — no billing reservation, no workerBilling block)", async () => {
    // The function signature deliberately has no `reserveCredits` dep to
    // inject (contrast queueDesktopVideoAssemblyJob/queueRemotionRenderVideoJob) —
    // this is a compile-time guarantee that billing is never called, not
    // just a runtime one. We assert the runtime side: no workerBilling key
    // ends up in instructionsJson.
    const input = buildInput();
    await queueVerticalDramaFfmpegAssemblyJob(input, { repo: repo as any });

    const insertedJob = repo.insertJob.mock.calls[0]![0] as Record<string, unknown>;
    const instructions = insertedJob.instructionsJson as Record<string, unknown>;
    expect(instructions.workerBilling).toBeUndefined();
    expect(Object.prototype.hasOwnProperty.call(instructions, "workerBilling")).toBe(false);
  });

  it("is idempotent on a duplicate server-computed idempotency key", async () => {
    const input = buildInput();
    repo.findJobByIdempotencyKey.mockResolvedValueOnce({
      id: "existing-job",
      status: "queued",
      jobType: VERTICAL_DRAMA_FFMPEG_ASSEMBLY_JOB_TYPE,
    });

    const result = await queueVerticalDramaFfmpegAssemblyJob(input, { repo: repo as any });

    expect(result.created).toBe(false);
    expect(result.job.id).toBe("existing-job");
    expect(repo.insertJob).not.toHaveBeenCalled();
  });

  it("computes a stable idempotency key from kind/owner/renderFeed (same input -> same key)", async () => {
    const input = buildInput({ tenantId: "tenant_fixed", owner: {
      tenantId: "tenant_fixed",
      userId: "user_fixed",
      seriesId: "series_fixed",
      episodeId: "episode_fixed",
    } });

    await queueVerticalDramaFfmpegAssemblyJob(input, { repo: repo as any });
    const firstKey = (repo.insertJob.mock.calls[0]![0] as Record<string, unknown>).idempotencyKey;

    repo.insertJob.mockClear();
    await queueVerticalDramaFfmpegAssemblyJob(input, { repo: repo as any });
    const secondKey = (repo.insertJob.mock.calls[0]![0] as Record<string, unknown>).idempotencyKey;

    expect(firstKey).toBe(secondKey);
    expect(typeof firstKey).toBe("string");
    expect((firstKey as string).length).toBeGreaterThan(0);
  });

  it("prefers a caller-supplied idempotencyKey over the computed one", async () => {
    const input = buildInput({ idempotencyKey: "custom-key-123" });
    await queueVerticalDramaFfmpegAssemblyJob(input, { repo: repo as any });

    expect(repo.findJobByIdempotencyKey).toHaveBeenCalledWith(input.tenantId, "custom-key-123");
    expect(repo.insertJob).toHaveBeenCalledWith(
      expect.objectContaining({ idempotencyKey: "custom-key-123" }),
    );
  });

  it("uses maxAttempts:1 (not auto-retry-safe) and a generous timeout floor", async () => {
    const input = buildInput();
    await queueVerticalDramaFfmpegAssemblyJob(input, { repo: repo as any });

    expect(repo.insertJob).toHaveBeenCalledWith(
      expect.objectContaining({
        retryPolicyJson: { maxAttempts: 1, backoffSeconds: 0 },
        timeoutSeconds: expect.any(Number),
      }),
    );
    const insertedJob = repo.insertJob.mock.calls[0]![0] as Record<string, unknown>;
    expect(insertedJob.timeoutSeconds as number).toBeGreaterThanOrEqual(1800);
  });

  it("defaults priority to 25 and allows caller override", async () => {
    const input = buildInput();
    await queueVerticalDramaFfmpegAssemblyJob(input, { repo: repo as any });
    expect(repo.insertJob).toHaveBeenCalledWith(expect.objectContaining({ priority: 25 }));

    repo.insertJob.mockClear();
    const priorityInput = buildInput({ priority: 60 });
    await queueVerticalDramaFfmpegAssemblyJob(priorityInput, { repo: repo as any });
    expect(repo.insertJob).toHaveBeenCalledWith(expect.objectContaining({ priority: 60 }));
  });

  it("carries the renderFeed opaquely (unvalidated internal shape round-trips unchanged)", async () => {
    const renderFeed = {
      clips: [{ id: "c1", nested: { deeply: { value: 42 } } }],
      arbitraryUnknownField: "anything goes here",
    };
    const input = buildInput({ renderFeed });
    await queueVerticalDramaFfmpegAssemblyJob(input, { repo: repo as any });

    const insertedJob = repo.insertJob.mock.calls[0]![0] as Record<string, unknown>;
    const inputJson = insertedJob.inputJson as Record<string, unknown>;
    expect(inputJson.renderFeed).toEqual(renderFeed);
  });
});
