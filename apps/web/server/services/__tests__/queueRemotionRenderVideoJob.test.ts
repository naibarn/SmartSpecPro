/**
 * Feature 133 (Video Intelligence Platform) — section-04 —
 * `queueRemotionRenderVideoJob` tests. Mocked repo/deps only — never hits
 * the DB (repo methods + reserveCredits + getFeatureFlags are all `vi.fn()`
 * injected via the `deps` param).
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  queueRemotionRenderVideoJob,
  workerJobMatchesSelection,
  type QueueRemotionRenderVideoJobInput,
} from "../workerSchedulerService";
import {
  HYPERFRAMES_FINAL_COMPOSITE_CAPABILITY_FAMILIES,
  REMOTION_RENDER_VIDEO_CLAIM_CAPABILITY,
  REMOTION_RENDER_VIDEO_CAPABILITY_FAMILIES,
  REMOTION_RENDER_VIDEO_PLATFORM_CONTRACT_VERSION,
} from "../../../shared/workerRuntime";

let fixtureCounter = 0;

function buildInput(
  overrides: Partial<QueueRemotionRenderVideoJobInput> = {},
): QueueRemotionRenderVideoJobInput {
  fixtureCounter += 1;
  const n = fixtureCounter;
  return {
    kind: "remotion_render_video",
    schemaVersion: 1,
    platformContractVersion: REMOTION_RENDER_VIDEO_PLATFORM_CONTRACT_VERSION,
    rendererPolicyVersion: "remotion-1",
    videoProjectId: `vproj_${n}`,
    projectRevision: 1,
    traceId: `trace_${n}`,
    renderProfile: {
      profile: "final",
      width: 1080,
      height: 1920,
      fps: 30,
      codec: "h264",
      loudnessNormalize: true,
      burnInAssCaptions: false,
    },
    remotionTemplate: {
      id: "tpl_1",
      name: "Template",
      width: 1080,
      height: 1920,
      fps: 30,
      durationInFrames: 900,
      layers: [],
    },
    compositionId: "GenericTemplate",
    assetManifest: { sources: [] },
    postPasses: [],
    segmentPlan: null,
    remotionTemplateHash: `hash_${String(n).padStart(8, "0")}`,
    durationInFrames: 900,
    tenantId: `tenant_${n}`,
    requestedByUserId: n,
    ...overrides,
  };
}

describe("queueRemotionRenderVideoJob", () => {
  const repo = {
    findJobByIdempotencyKey: vi.fn(),
    findWorkerById: vi.fn(),
    insertJob: vi.fn(),
    findActiveRemotionPreviewJobForUser: vi.fn(),
  };
  const reserveCredits = vi.fn();
  const getFeatureFlags = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.DESKTOP_ZEROCLAW_WORKER_DISPATCH_ENABLED;
    repo.findJobByIdempotencyKey.mockResolvedValue(null);
    repo.findActiveRemotionPreviewJobForUser.mockResolvedValue(null);
    repo.insertJob.mockImplementation(async (values: Record<string, unknown>) => ({
      id: "job-1",
      status: "queued",
      ...values,
    }));
    reserveCredits.mockResolvedValue({
      reservationId: "res-1",
      reservedCredits: 25,
      sourceType: "worker_runtime",
    });
    getFeatureFlags.mockResolvedValue({ remotionRenderVideoJobEnabled: true });
  });

  it("parses input and inserts a job with jobType=remotion_render_video", async () => {
    const input = buildInput();
    const result = await queueRemotionRenderVideoJob(input, {
      repo: repo as any,
      reserveCredits,
      getFeatureFlags,
    });

    expect(result.created).toBe(true);
    expect(repo.insertJob).toHaveBeenCalledWith(
      expect.objectContaining({
        jobType: "remotion_render_video",
        runtimeType: "desktop_zeroclaw_managed",
        status: "queued",
        resourceProfile: "cpu_heavy",
        timeoutSeconds: expect.any(Number),
        retryPolicyJson: {
          maxAttempts: 1,
          backoffSeconds: 0,
          sidecarMaxAttempts: 3,
          sidecarBackoffSeconds: [20, 60],
        },
      }),
    );
    const inserted = repo.insertJob.mock.calls[0]![0] as Record<string, unknown>;
    expect(inserted.timeoutSeconds).toBeGreaterThanOrEqual(60 * 60);
  });

  it("rejects invalid input with a specific schema-parse error, never a blanket message", async () => {
    const input = buildInput({ videoProjectId: "" as any });
    await expect(
      queueRemotionRenderVideoJob(input, { repo: repo as any, reserveCredits, getFeatureFlags }),
    ).rejects.toThrow();
    expect(repo.insertJob).not.toHaveBeenCalled();
  });

  it("sets capabilityFamilies=REMOTION_RENDER_VIDEO_CAPABILITY_FAMILIES (non-empty)", async () => {
    expect(REMOTION_RENDER_VIDEO_CAPABILITY_FAMILIES.length).toBeGreaterThan(0);
    const input = buildInput();
    await queueRemotionRenderVideoJob(input, { repo: repo as any, reserveCredits, getFeatureFlags });

    expect(repo.insertJob).toHaveBeenCalledWith(
      expect.objectContaining({
        capabilityRequirementsJson: expect.objectContaining({
          capabilityFamilies: [...REMOTION_RENDER_VIDEO_CAPABILITY_FAMILIES],
          requiredClaimCapability: REMOTION_RENDER_VIDEO_CLAIM_CAPABILITY,
        }),
      }),
    );
  });

  it("a hyperframes-only worker's hints do NOT match this job", async () => {
    const input = buildInput();
    await queueRemotionRenderVideoJob(input, { repo: repo as any, reserveCredits, getFeatureFlags });
    const insertedJob = repo.insertJob.mock.calls[0]![0] as Record<string, unknown>;

    expect(
      workerJobMatchesSelection(insertedJob, "hf-worker", [
        ...HYPERFRAMES_FINAL_COMPOSITE_CAPABILITY_FAMILIES,
      ]),
    ).toBe(false);
  });

  it("a remotion-render worker's hints DO match", async () => {
    const input = buildInput();
    await queueRemotionRenderVideoJob(input, { repo: repo as any, reserveCredits, getFeatureFlags });
    const insertedJob = repo.insertJob.mock.calls[0]![0] as Record<string, unknown>;

    expect(
      workerJobMatchesSelection(insertedJob, "remotion-worker", [
        ...REMOTION_RENDER_VIDEO_CAPABILITY_FAMILIES,
        REMOTION_RENDER_VIDEO_CLAIM_CAPABILITY,
      ]),
    ).toBe(true);
  });

  it("does not match an older Remotion worker even when it advertises the generic families", async () => {
    const input = buildInput();
    await queueRemotionRenderVideoJob(input, { repo: repo as any, reserveCredits, getFeatureFlags });
    const insertedJob = repo.insertJob.mock.calls[0]![0] as Record<string, unknown>;

    expect(
      workerJobMatchesSelection(insertedJob, "old-remotion-worker", [
        ...REMOTION_RENDER_VIDEO_CAPABILITY_FAMILIES,
      ]),
    ).toBe(false);
  });

  it("does not claim a legacy queued payload even with a current worker token", () => {
    expect(
      workerJobMatchesSelection(
        {
          jobType: "remotion_render_video",
          capabilityRequirementsJson: {
            capabilityFamilies: [...REMOTION_RENDER_VIDEO_CAPABILITY_FAMILIES],
          },
          inputJson: {
            platformContractVersion: "2026-07-12",
          },
        },
        "current-remotion-worker",
        [REMOTION_RENDER_VIDEO_CLAIM_CAPABILITY],
      ),
    ).toBe(false);
  });

  it("reserves credits before insert", async () => {
    const input = buildInput();
    await queueRemotionRenderVideoJob(input, { repo: repo as any, reserveCredits, getFeatureFlags });

    expect(reserveCredits).toHaveBeenCalledTimes(1);
    expect(repo.insertJob).toHaveBeenCalledTimes(1);
    const reserveOrder = reserveCredits.mock.invocationCallOrder[0]!;
    const insertOrder = repo.insertJob.mock.invocationCallOrder[0]!;
    expect(reserveOrder).toBeLessThan(insertOrder);
  });

  it("is idempotent on (projectId,revision,profile)", async () => {
    const input = buildInput();
    repo.findJobByIdempotencyKey.mockResolvedValueOnce({
      id: "existing-job",
      status: "queued",
      jobType: "remotion_render_video",
    });

    const result = await queueRemotionRenderVideoJob(input, {
      repo: repo as any,
      reserveCredits,
      getFeatureFlags,
    });

    expect(result.created).toBe(false);
    expect(result.job.id).toBe("existing-job");
    expect(repo.insertJob).not.toHaveBeenCalled();
    expect(reserveCredits).not.toHaveBeenCalled();
  });

  it("rejects a second queued preview for the same user", async () => {
    const input = buildInput({
      renderProfile: {
        profile: "preview",
        width: 540,
        height: 960,
        fps: 15,
        codec: "h264",
        loudnessNormalize: true,
        burnInAssCaptions: false,
      },
    });
    repo.findActiveRemotionPreviewJobForUser.mockResolvedValueOnce({
      id: "active-preview",
      status: "running",
      jobType: "remotion_render_video",
    });

    await expect(
      queueRemotionRenderVideoJob(input, { repo: repo as any, reserveCredits, getFeatureFlags }),
    ).rejects.toThrow(/preview/i);
    expect(repo.insertJob).not.toHaveBeenCalled();
  });

  it("prioritizes final (40) over preview (20)", async () => {
    const finalInput = buildInput({ renderProfile: {
      profile: "final",
      width: 1080,
      height: 1920,
      fps: 30,
      codec: "h264",
      loudnessNormalize: true,
      burnInAssCaptions: false,
    } });
    await queueRemotionRenderVideoJob(finalInput, { repo: repo as any, reserveCredits, getFeatureFlags });
    expect(repo.insertJob).toHaveBeenCalledWith(expect.objectContaining({ priority: 40 }));

    repo.insertJob.mockClear();
    const previewInput = buildInput({ renderProfile: {
      profile: "preview",
      width: 540,
      height: 960,
      fps: 15,
      codec: "h264",
      loudnessNormalize: true,
      burnInAssCaptions: false,
    } });
    await queueRemotionRenderVideoJob(previewInput, { repo: repo as any, reserveCredits, getFeatureFlags });
    expect(repo.insertJob).toHaveBeenCalledWith(expect.objectContaining({ priority: 20 }));
  });

  it("is gated off when the F133B tenant feature flag is disabled", async () => {
    getFeatureFlags.mockResolvedValueOnce({ remotionRenderVideoJobEnabled: false });
    const input = buildInput();

    await expect(
      queueRemotionRenderVideoJob(input, { repo: repo as any, reserveCredits, getFeatureFlags }),
    ).rejects.toThrow(/disabled/i);
    expect(repo.insertJob).not.toHaveBeenCalled();
  });

  it("enforces the ≤6 render-job submissions/min per-user rate limit", async () => {
    const tenantId = "tenant_rate_limit";
    const requestedByUserId = 999;
    for (let i = 0; i < 6; i += 1) {
      const input = buildInput({ tenantId, requestedByUserId, idempotencyKey: `rl-${i}` });
      // eslint-disable-next-line no-await-in-loop
      await queueRemotionRenderVideoJob(input, { repo: repo as any, reserveCredits, getFeatureFlags });
    }
    const seventh = buildInput({ tenantId, requestedByUserId, idempotencyKey: "rl-7" });
    await expect(
      queueRemotionRenderVideoJob(seventh, { repo: repo as any, reserveCredits, getFeatureFlags }),
    ).rejects.toThrow(/too many/i);
  });
});
