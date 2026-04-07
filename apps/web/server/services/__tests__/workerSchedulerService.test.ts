import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  OPENCLAW_SUPPORTED_CAPABILITY_FAMILIES,
  queueOpenClawWorkerJob,
  workerJobMatchesSelection,
} from "../workerSchedulerService";

describe("workerSchedulerService", () => {
  const repo = {
    findJobByIdempotencyKey: vi.fn(),
    findWorkerById: vi.fn(),
    insertJob: vi.fn(),
  };
  const reserveCredits = vi.fn();
  const getFeatureFlags = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.OPENCLAW_EXTERNAL_RUNTIME_DISPATCH_ENABLED;
    repo.findJobByIdempotencyKey.mockResolvedValue(null);
    repo.findWorkerById.mockResolvedValue({
      id: "worker-1",
      runtimeType: "openclaw_gateway",
      status: "online",
    });
    repo.insertJob.mockResolvedValue({
      id: "job-1",
      status: "queued",
      instructionsJson: {},
      capabilityRequirementsJson: {},
    });
    reserveCredits.mockResolvedValue({
      reservationId: "res-1",
      reservedCredits: 25,
      sourceType: "worker_runtime",
    });
    getFeatureFlags.mockResolvedValue({ openClawExternalRuntime: true });
  });

  it("queues supported OpenClaw jobs with billing metadata", async () => {
    const result = await queueOpenClawWorkerJob(
      {
        tenantId: "tenant-1",
        teamId: "team-1",
        workflowRunId: "run-1",
        requestedByUserId: 7,
        jobType: "external_agent_task",
        capabilityFamilies: ["artifact-producing-session"],
        idempotencyKey: "job-key-1",
        preferredWorkerId: "worker-1",
      },
      {
        repo: repo as any,
        reserveCredits,
        getFeatureFlags,
      },
    );

    expect(reserveCredits).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 7,
        tenantId: "tenant-1",
      }),
    );
    expect(repo.insertJob).toHaveBeenCalledWith(
      expect.objectContaining({
        runtimeType: "openclaw_gateway",
        jobType: "external_agent_task",
        capabilityRequirementsJson: expect.objectContaining({
          capabilityFamilies: ["artifact-producing-session"],
          preferredWorkerId: "worker-1",
        }),
        instructionsJson: expect.objectContaining({
          workerBilling: expect.objectContaining({
            reservationId: "res-1",
          }),
        }),
      }),
    );
    expect(result.created).toBe(true);
  });

  it("returns an existing idempotent worker job without double-reserving credits", async () => {
    repo.findJobByIdempotencyKey.mockResolvedValueOnce({
      id: "job-existing",
      status: "queued",
    });

    const result = await queueOpenClawWorkerJob(
      {
        tenantId: "tenant-1",
        requestedByUserId: 7,
        jobType: "external_agent_task",
        capabilityFamilies: ["artifact-producing-session"],
        idempotencyKey: "job-key-2",
      },
      {
        repo: repo as any,
        reserveCredits,
        getFeatureFlags,
      },
    );

    expect(result).toEqual({
      created: false,
      job: { id: "job-existing", status: "queued" },
    });
    expect(reserveCredits).not.toHaveBeenCalled();
    expect(repo.insertJob).not.toHaveBeenCalled();
  });

  it("rejects unsupported resource profiles for OpenClaw", async () => {
    await expect(
      queueOpenClawWorkerJob(
        {
          tenantId: "tenant-1",
          requestedByUserId: 7,
          jobType: "external_agent_task",
          capabilityFamilies: ["artifact-producing-session"],
          resourceProfile: "gpu_required",
        },
        {
          repo: repo as any,
          reserveCredits,
          getFeatureFlags,
        },
      ),
    ).rejects.toMatchObject({
      code: "unsupported_resource_profile",
    });
  });

  it("rejects unsupported capability families", async () => {
    await expect(
      queueOpenClawWorkerJob(
        {
          tenantId: "tenant-1",
          requestedByUserId: 7,
          jobType: "external_agent_task",
          capabilityFamilies: [
            OPENCLAW_SUPPORTED_CAPABILITY_FAMILIES[0],
            "local-file-access" as any,
          ],
        },
        {
          repo: repo as any,
          reserveCredits,
          getFeatureFlags,
        },
      ),
    ).rejects.toMatchObject({
      code: "unsupported_capability_family",
    });
  });

  it("rejects queueing when the tenant rollout flag is disabled", async () => {
    getFeatureFlags.mockResolvedValueOnce({ openClawExternalRuntime: false });

    await expect(
      queueOpenClawWorkerJob(
        {
          tenantId: "tenant-1",
          requestedByUserId: 7,
          jobType: "external_agent_task",
          capabilityFamilies: ["artifact-producing-session"],
        },
        {
          repo: repo as any,
          reserveCredits,
          getFeatureFlags,
        },
      ),
    ).rejects.toMatchObject({
      code: "feature_disabled",
      statusCode: 403,
    });

    expect(repo.insertJob).not.toHaveBeenCalled();
  });

  it("honors the operator kill switch without mutating worker jobs", async () => {
    process.env.OPENCLAW_EXTERNAL_RUNTIME_DISPATCH_ENABLED = "false";

    await expect(
      queueOpenClawWorkerJob(
        {
          tenantId: "tenant-1",
          requestedByUserId: 7,
          jobType: "external_agent_task",
          capabilityFamilies: ["artifact-producing-session"],
        },
        {
          repo: repo as any,
          reserveCredits,
          getFeatureFlags,
        },
      ),
    ).rejects.toMatchObject({
      code: "dispatch_disabled",
      statusCode: 503,
    });

    expect(getFeatureFlags).not.toHaveBeenCalled();
    expect(repo.insertJob).not.toHaveBeenCalled();
  });

  it("matches job claims against preferred workers and capability hints", () => {
    expect(
      workerJobMatchesSelection(
        {
          capabilityRequirementsJson: {
            preferredWorkerId: "worker-1",
            capabilityFamilies: ["browser-automation"],
          },
        },
        "worker-1",
        ["browser-automation"],
      ),
    ).toBe(true);

    expect(
      workerJobMatchesSelection(
        {
          capabilityRequirementsJson: {
            preferredWorkerId: "worker-2",
            capabilityFamilies: ["browser-automation"],
          },
        },
        "worker-1",
        ["browser-automation"],
      ),
    ).toBe(false);

    expect(
      workerJobMatchesSelection(
        {
          capabilityRequirementsJson: {
            capabilityFamilies: ["plugin-automation"],
          },
        },
        "worker-1",
        ["browser-automation"],
      ),
    ).toBe(false);
  });
});
