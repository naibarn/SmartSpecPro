import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  HERMES_SUPPORTED_CAPABILITY_FAMILIES,
  queueDesktopHyperframesFinalCompositeJob,
  queueDesktopComfyImageGenerationJob,
  queueDesktopComfyWorkflowRunJob,
  queueDesktopLocalFolderIngestJob,
  OPENCLAW_SUPPORTED_CAPABILITY_FAMILIES,
  queueHiClawWorkerJob,
  queueHermesWorkerJob,
  queueNemoClawWorkerJob,
  queueDesktopVideoAssemblyJob,
  queueOpenClawWorkerJob,
  queueWorkerJobByRuntime,
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
    delete process.env.DESKTOP_ZEROCLAW_WORKER_DISPATCH_ENABLED;
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
    getFeatureFlags.mockResolvedValue({
      openClawExternalRuntime: true,
      desktopZeroClawWorker: false,
      nemoClawSecureWorkerPool: false,
      hiClawClusterRuntime: false,
      hermesAgentRuntime: true,
    });
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
    getFeatureFlags.mockResolvedValueOnce({
      openClawExternalRuntime: false,
      desktopZeroClawWorker: false,
      nemoClawSecureWorkerPool: false,
      hiClawClusterRuntime: false,
    });

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

  it("queues Hermes external follow-up jobs through the feature-gated scheduler", async () => {
    repo.findWorkerById.mockResolvedValue({
      id: "worker-hermes-1",
      runtimeType: "hermes_agent_gateway",
      status: "online",
      capabilitiesJson: {
        runtimeMetadata: {
          hermesVersion: "1.2.3",
          profileName: "personal-default",
          apiServerEnabled: true,
          apiServerBaseUrl: "http://127.0.0.1:4100",
          terminalBackend: "pty",
          gatewayPlatforms: ["telegram"],
          supportsDelegatedHttp: true,
          supportsDelegatedMcp: false,
          supportsBoundConnector: true,
          supportsCallbacks: true,
          hostPlatform: "macos",
          hostExecutionMode: "foreground",
        },
      },
    });

    const result = await queueHermesWorkerJob(
      {
        tenantId: "tenant-1",
        teamId: "team-1",
        workflowRunId: "run-1",
        requestedByUserId: 7,
        jobType: "external_agent_task",
        capabilityFamilies: ["artifact-producing-session"],
        preferredWorkerId: "worker-hermes-1",
        idempotencyKey: "hermes-job-1",
      },
      {
        repo: repo as any,
        reserveCredits,
        getFeatureFlags,
      },
    );

    expect(repo.insertJob).toHaveBeenCalledWith(expect.objectContaining({
      runtimeType: "hermes_agent_gateway",
      jobType: "external_agent_task",
      resourceProfile: "network_heavy",
      capabilityRequirementsJson: expect.objectContaining({
        capabilityFamilies: ["artifact-producing-session"],
        preferredWorkerId: "worker-hermes-1",
      }),
      instructionsJson: expect.objectContaining({
        intent: "external_connector_follow_up",
      }),
    }));
    expect(result.created).toBe(true);
  });

  it("rejects Hermes jobs that overclaim unsupported capability families", async () => {
    await expect(
      queueHermesWorkerJob(
        {
          tenantId: "tenant-1",
          requestedByUserId: 7,
          jobType: "external_agent_task",
          capabilityFamilies: [
            HERMES_SUPPORTED_CAPABILITY_FAMILIES[0],
            "tool-using-research" as any,
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
      statusCode: 400,
    });
  });

  it("fails closed for Hermes dispatch when the tenant rollout gate is disabled", async () => {
    getFeatureFlags.mockResolvedValueOnce({
      openClawExternalRuntime: true,
      desktopZeroClawWorker: false,
      nemoClawSecureWorkerPool: false,
      hiClawClusterRuntime: false,
      hermesAgentRuntime: false,
    });

    await expect(
      queueHermesWorkerJob(
        {
          tenantId: "tenant-1",
          requestedByUserId: 7,
          jobType: "external_agent_task",
          capabilityFamilies: ["artifact-producing-session"],
          preferredWorkerId: "worker-hermes-disabled",
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
  });

  it("fails closed for Hermes dispatch when the worker has registration but not bound-dispatch readiness", async () => {
    repo.findWorkerById.mockResolvedValueOnce({
      id: "worker-hermes-staged",
      runtimeType: "hermes_agent_gateway",
      status: "online",
      capabilitiesJson: {
        runtimeMetadata: {
          hermesVersion: "1.2.3",
          profileName: "personal-default",
          apiServerEnabled: true,
          apiServerBaseUrl: "http://127.0.0.1:4100",
          terminalBackend: "pty",
          gatewayPlatforms: ["telegram"],
          supportsDelegatedHttp: true,
          supportsDelegatedMcp: true,
          supportsBoundConnector: false,
          supportsCallbacks: true,
          hostPlatform: "macos",
          hostExecutionMode: "foreground",
        },
      },
    });

    await expect(
      queueHermesWorkerJob(
        {
          tenantId: "tenant-1",
          requestedByUserId: 7,
          jobType: "external_agent_task",
          capabilityFamilies: ["artifact-producing-session"],
          preferredWorkerId: "worker-hermes-staged",
        },
        {
          repo: repo as any,
          reserveCredits,
          getFeatureFlags,
        },
      ),
    ).rejects.toMatchObject({
      code: "rollout_stage_blocked",
      statusCode: 409,
    });
  });

  it("dispatches Hermes jobs through queueWorkerJobByRuntime", async () => {
    repo.findWorkerById.mockResolvedValue({
      id: "worker-hermes-2",
      runtimeType: "hermes_agent_gateway",
      status: "online",
      capabilitiesJson: {
        runtimeMetadata: {
          hermesVersion: "1.2.3",
          profileName: "personal-default",
          apiServerEnabled: true,
          apiServerBaseUrl: "http://127.0.0.1:4200",
          terminalBackend: "pty",
          gatewayPlatforms: [],
          supportsDelegatedHttp: true,
          supportsDelegatedMcp: false,
          supportsBoundConnector: true,
          supportsCallbacks: false,
          hostPlatform: "macos",
          hostExecutionMode: "foreground",
        },
      },
    });

    await queueWorkerJobByRuntime(
      {
        runtimeType: "hermes_agent_gateway",
        tenantId: "tenant-1",
        requestedByUserId: 7,
        jobType: "external_agent_task",
        capabilityFamilies: ["artifact-producing-session"],
        preferredWorkerId: "worker-hermes-2",
      },
      {
        repo: repo as any,
        reserveCredits,
        getFeatureFlags,
      },
    );

    expect(repo.insertJob).toHaveBeenCalledWith(expect.objectContaining({
      runtimeType: "hermes_agent_gateway",
      capabilityRequirementsJson: expect.objectContaining({
        preferredWorkerId: "worker-hermes-2",
      }),
    }));
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

  it("uses requiredClaimCapability as the claim gate when a job also carries descriptive capability families", () => {
    const hermesJob = {
      capabilityRequirementsJson: {
        preferredWorkerId: "worker-hermes-1",
        requiredClaimCapability: "hermes_media",
        capabilityFamilies: ["hermes-media-generation"],
      },
    };

    expect(
      workerJobMatchesSelection(
        hermesJob,
        "worker-hermes-1",
        ["hermes_media"],
      ),
    ).toBe(true);

    expect(
      workerJobMatchesSelection(
        hermesJob,
        "worker-hermes-1",
        ["hermes-media-generation"],
      ),
    ).toBe(false);
  });

  it("queues desktop video_assembly jobs through the desktop runtime lane", async () => {
    getFeatureFlags.mockResolvedValue({
      openClawExternalRuntime: true,
      desktopZeroClawWorker: true,
      nemoClawSecureWorkerPool: false,
      hiClawClusterRuntime: false,
    });
    repo.findWorkerById.mockResolvedValue({
      id: "desktop-worker-1",
      runtimeType: "desktop_zeroclaw_managed",
      status: "online",
    });

    const result = await queueDesktopVideoAssemblyJob(
      {
        tenantId: "tenant-1",
        teamId: "team-video",
        requestedByUserId: 7,
        preferredWorkerId: "desktop-worker-1",
        inputRefs: [
          {
            sourceKind: "authorized_local_path",
            path: "C:\\Media\\job\\source.mp4",
          },
        ],
        editPlan: {
          clips: [
            {
              sourceRef: "C:\\Media\\job\\source.mp4",
              trim: { startMs: 0, endMs: 5000 },
            },
          ],
          applyWatermark: false,
        },
        subtitlePlan: {
          sourcePriority: "user_provided",
          mode: "burn_in",
        },
        renderProfile: {
          aspectRatios: ["16:9"],
          codecPreset: "h264_high",
          qualityPreset: "social_default",
          gpuRequired: true,
        },
        workspacePolicy: {
          mode: "workspace_scoped",
          allowedSourceRoots: ["C:\\Media\\job"],
        },
        outputTargets: {
          renderedAssets: [
            {
              label: "main",
              aspectRatio: "16:9",
              publishToLibrary: true,
            },
          ],
          subtitlesOptional: true,
          thumbnailsOptional: true,
        },
      },
      {
        repo: repo as any,
        reserveCredits,
        getFeatureFlags,
      },
    );

    expect(result.created).toBe(true);
    expect(repo.insertJob).toHaveBeenCalledWith(expect.objectContaining({
      runtimeType: "desktop_zeroclaw_managed",
      jobType: "video_assembly",
      resourceProfile: "gpu_required",
      capabilityRequirementsJson: expect.objectContaining({
        preferredWorkerId: "desktop-worker-1",
        capabilityFamilies: expect.arrayContaining(["video-edit", "file-access"]),
      }),
      inputJson: expect.objectContaining({
        inputRefs: expect.any(Array),
        workspacePolicy: expect.objectContaining({
          allowedSourceRoots: ["C:\\Media\\job"],
        }),
      }),
    }));
  });

  it("queues HyperFrames final composite jobs through the desktop worker lane without a product binding", async () => {
    getFeatureFlags.mockResolvedValue({
      openClawExternalRuntime: true,
      desktopZeroClawWorker: true,
      hyperframesWorkerFinalComposite: true,
      nemoClawSecureWorkerPool: false,
      hiClawClusterRuntime: false,
      hermesAgentRuntime: false,
    });

    const result = await queueDesktopHyperframesFinalCompositeJob(
      {
        tenantId: "tenant-1",
        teamId: "team-video",
        requestedByUserId: 7,
        idempotencyKey: "hf-final:hf_config_123",
        compositionHash: "hf_composition_123",
        timelineHash: "hf_timeline_123",
        finalCompositeConfigHash: "hf_config_123",
        templateVersion: "official_html_css_browser_final_composite_v1",
        platformContractVersion: "2026-06-21",
        rendererPolicyVersion: "official_html_css_browser_final_composite_v1",
        runtimeProfileId: "smart-ai-hub-worker-app/windows/hyperframes",
        source: {
          storyboardReviewId: 94,
          productId: null,
          manualProjectName: "Manual Storyboard Project",
          runId: "run-123",
        },
        finalVideoLengthSec: 238,
        shots: [
          {
            shotId: "shot-1",
            shotIndex: 0,
            absoluteStartSec: 0,
            absoluteEndSec: 30,
            durationSec: 30,
            overlayText: "Opening hook",
          },
        ],
        assetManifest: {
          sourceVideos: [
            {
              shotId: "shot-1",
              storageRef: "/api/storage/files/media-jobs/assets/final-1.mp4",
              durationSec: 30,
            },
          ],
        },
        outputRequirements: {
          requireOfficialRuntime: true,
          rejectFallbackRender: true,
          requireCssBrowserRuntime: true,
          requireServerVerification: true,
          publishToLibrary: true,
        },
      },
      {
        repo: repo as any,
        reserveCredits,
        getFeatureFlags,
      },
    );

    expect(result.created).toBe(true);
    expect(repo.insertJob).toHaveBeenCalledWith(expect.objectContaining({
      runtimeType: "desktop_zeroclaw_managed",
      jobType: "hyperframes_final_composite",
      status: "queued",
      resourceProfile: "cpu_heavy",
      capabilityRequirementsJson: expect.objectContaining({
        preferredWorkerId: null,
        capabilityFamilies: expect.arrayContaining([
          "hyperframes-final-composite",
          "official-hyperframes-runtime",
          "browser-render",
          "thai-fonts",
          "ffmpeg-probe",
        ]),
      }),
      inputJson: expect.objectContaining({
        renderIntent: "hyperframes_final_composite",
        finalCompositeConfigHash: "hf_config_123",
        source: expect.objectContaining({
          productId: null,
          manualProjectName: "Manual Storyboard Project",
        }),
      }),
      instructionsJson: expect.objectContaining({
        intent: "hyperframes_final_composite",
        outputPolicy: expect.objectContaining({
          rejectFallbackRender: true,
          requireCssBrowserRuntime: true,
          requireServerVerification: true,
        }),
      }),
    }));
  });

  it("reuses only the same active HyperFrames final composite idempotency key", async () => {
    getFeatureFlags.mockResolvedValue({
      openClawExternalRuntime: true,
      desktopZeroClawWorker: true,
      hyperframesWorkerFinalComposite: true,
      nemoClawSecureWorkerPool: false,
      hiClawClusterRuntime: false,
      hermesAgentRuntime: false,
    });
    repo.findJobByIdempotencyKey.mockResolvedValueOnce({
      id: "existing-job",
      status: "queued",
      jobType: "hyperframes_final_composite",
    });

    const commonInput = {
      tenantId: "tenant-1",
      compositionHash: "hf_composition_123",
      timelineHash: "hf_timeline_123",
      finalCompositeConfigHash: "hf_config_123",
      templateVersion: "official_html_css_browser_final_composite_v1",
      platformContractVersion: "2026-06-21",
      rendererPolicyVersion: "official_html_css_browser_final_composite_v1",
      runtimeProfileId: "smart-ai-hub-worker-app/windows/hyperframes",
      finalVideoLengthSec: 30,
      shots: [
        {
          shotId: "shot-1",
          shotIndex: 0,
          absoluteStartSec: 0,
          absoluteEndSec: 30,
          durationSec: 30,
        },
      ],
      assetManifest: {
        sourceVideos: [
          {
            shotId: "shot-1",
            storageRef: "/api/storage/files/media-jobs/assets/final-1.mp4",
            durationSec: 30,
          },
        ],
      },
      outputRequirements: {
        requireOfficialRuntime: true,
        rejectFallbackRender: true,
      },
    };

    const first = await queueDesktopHyperframesFinalCompositeJob(
      {
        ...commonInput,
        idempotencyKey: "hf-final:hf_config_123",
      },
      { repo: repo as any, reserveCredits },
    );

    expect(first.created).toBe(false);
    expect(first.job.id).toBe("existing-job");

    repo.findJobByIdempotencyKey.mockResolvedValueOnce(null);
    const second = await queueDesktopHyperframesFinalCompositeJob(
      {
        ...commonInput,
        finalCompositeConfigHash: "hf_config_regenerated_456",
        idempotencyKey: "hf-final:hf_config_regenerated_456",
      },
      { repo: repo as any, reserveCredits },
    );

    expect(second.created).toBe(true);
    expect(repo.insertJob).toHaveBeenCalledWith(expect.objectContaining({
      idempotencyKey: "hf-final:hf_config_regenerated_456",
    }));
  });

  it("queues HyperFrames final composite without tenant flags but still rejects draining preferred workers", async () => {
    getFeatureFlags.mockResolvedValue({
      openClawExternalRuntime: true,
      desktopZeroClawWorker: true,
      hyperframesWorkerFinalComposite: false,
      nemoClawSecureWorkerPool: false,
      hiClawClusterRuntime: false,
      hermesAgentRuntime: false,
    });

    const input = {
      tenantId: "tenant-1",
      compositionHash: "hf_composition_123",
      timelineHash: "hf_timeline_123",
      finalCompositeConfigHash: "hf_config_123",
      templateVersion: "official_html_css_browser_final_composite_v1",
      platformContractVersion: "2026-06-21",
      rendererPolicyVersion: "official_html_css_browser_final_composite_v1",
      runtimeProfileId: "smart-ai-hub-worker-app/windows/hyperframes",
      finalVideoLengthSec: 30,
      shots: [
        {
          shotId: "shot-1",
          shotIndex: 0,
          absoluteStartSec: 0,
          absoluteEndSec: 30,
          durationSec: 30,
        },
      ],
      assetManifest: {
        sourceVideos: [
          {
            shotId: "shot-1",
            storageRef: "/api/storage/files/media-jobs/assets/final-1.mp4",
            durationSec: 30,
          },
        ],
      },
      outputRequirements: {
        requireOfficialRuntime: true,
        rejectFallbackRender: true,
      },
    };

    const queued = await queueDesktopHyperframesFinalCompositeJob(
      input,
      { repo: repo as any, reserveCredits },
    );

    expect(queued.created).toBe(true);
    expect(repo.insertJob).toHaveBeenCalledWith(expect.objectContaining({
      runtimeType: "desktop_zeroclaw_managed",
      jobType: "hyperframes_final_composite",
      status: "queued",
    }));

    getFeatureFlags.mockResolvedValue({
      openClawExternalRuntime: true,
      desktopZeroClawWorker: true,
      hyperframesWorkerFinalComposite: true,
      nemoClawSecureWorkerPool: false,
      hiClawClusterRuntime: false,
      hermesAgentRuntime: false,
    });
    repo.findWorkerById.mockResolvedValue({
      id: "desktop-worker-1",
      runtimeType: "desktop_zeroclaw_managed",
      status: "draining",
    });

    await expect(queueDesktopHyperframesFinalCompositeJob(
      {
        ...input,
        preferredWorkerId: "desktop-worker-1",
      },
      { repo: repo as any, reserveCredits },
    )).rejects.toMatchObject({
      code: "worker_state_invalid",
      statusCode: 409,
    });
  });

  it("rejects desktop video_assembly jobs when local paths fall outside the approved workspace roots", async () => {
    getFeatureFlags.mockResolvedValue({
      openClawExternalRuntime: true,
      desktopZeroClawWorker: true,
      nemoClawSecureWorkerPool: false,
      hiClawClusterRuntime: false,
    });

    await expect(
      queueDesktopVideoAssemblyJob(
        {
          tenantId: "tenant-1",
          requestedByUserId: 7,
          inputRefs: [
            {
              sourceKind: "authorized_local_path",
              path: "D:\\Other\\source.mp4",
            },
          ],
          editPlan: {
            clips: [
              {
                sourceRef: "D:\\Other\\source.mp4",
                trim: { startMs: 0, endMs: 1000 },
              },
            ],
            applyWatermark: false,
          },
          subtitlePlan: {
            sourcePriority: "system_generated",
            mode: "soft_mux",
          },
          renderProfile: {
            aspectRatios: ["16:9"],
            codecPreset: "h264_high",
            qualityPreset: "social_default",
            gpuRequired: false,
          },
          workspacePolicy: {
            mode: "workspace_scoped",
            allowedSourceRoots: ["C:\\Media"],
          },
          outputTargets: {
            renderedAssets: [
              {
                label: "main",
                aspectRatio: "16:9",
                publishToLibrary: true,
              },
            ],
            subtitlesOptional: false,
            thumbnailsOptional: false,
          },
        },
        {
          repo: repo as any,
          reserveCredits,
          getFeatureFlags,
        },
      ),
    ).rejects.toMatchObject({
      code: "unauthorized_path",
      statusCode: 403,
    });
  });

  it("rejects desktop video_assembly subtitle refs that escape the approved roots", async () => {
    getFeatureFlags.mockResolvedValue({
      openClawExternalRuntime: true,
      desktopZeroClawWorker: true,
      nemoClawSecureWorkerPool: false,
      hiClawClusterRuntime: false,
    });

    await expect(
      queueDesktopVideoAssemblyJob(
        {
          tenantId: "tenant-1",
          requestedByUserId: 7,
          inputRefs: [
            {
              sourceKind: "authorized_local_path",
              path: "C:\\Media\\source.mp4",
            },
          ],
          editPlan: {
            clips: [
              {
                sourceRef: "C:\\Media\\source.mp4",
                trim: { startMs: 0, endMs: 1000 },
              },
            ],
            applyWatermark: false,
          },
          subtitlePlan: {
            sourcePriority: "user_provided",
            mode: "burn_in",
            subtitleRef: "D:\\Other\\captions.srt",
          },
          renderProfile: {
            aspectRatios: ["16:9"],
            codecPreset: "h264_high",
            qualityPreset: "social_default",
            gpuRequired: false,
          },
          workspacePolicy: {
            mode: "workspace_scoped",
            allowedSourceRoots: ["C:\\Media"],
          },
          outputTargets: {
            renderedAssets: [
              {
                label: "main",
                aspectRatio: "16:9",
                publishToLibrary: true,
              },
            ],
            subtitlesOptional: false,
            thumbnailsOptional: false,
          },
        },
        {
          repo: repo as any,
          reserveCredits,
          getFeatureFlags,
        },
      ),
    ).rejects.toMatchObject({
      issues: expect.arrayContaining([
        expect.objectContaining({
          path: ["subtitlePlan", "subtitleRef"],
          message:
            "subtitleRef must stay inside an approved source root when using a local file path",
        }),
      ]),
    });
  });

  it("queues desktop local_folder_ingest jobs through the desktop runtime lane", async () => {
    getFeatureFlags.mockResolvedValue({
      openClawExternalRuntime: true,
      desktopZeroClawWorker: true,
      nemoClawSecureWorkerPool: false,
      hiClawClusterRuntime: false,
    });
    repo.findWorkerById.mockResolvedValue({
      id: "desktop-worker-1",
      runtimeType: "desktop_zeroclaw_managed",
      status: "online",
    });

    const result = await queueDesktopLocalFolderIngestJob(
      {
        tenantId: "tenant-1",
        teamId: "team-docs",
        requestedByUserId: 7,
        preferredWorkerId: "desktop-worker-1",
        roots: [
          {
            rootId: "quotes",
            name: "Quotes",
            path: "C:\\Media\\Quotes",
          },
        ],
        workspacePolicy: {
          mode: "workspace_scoped",
          allowedSourceRoots: ["C:\\Media"],
        },
        ingestPolicy: {
          maxDepth: 4,
          maxFiles: 150,
          includePreviewText: true,
          previewFileLimit: 10,
          snippetQuery: "launch",
          snippetFileLimit: 5,
        },
        outputTargets: {
          publishManifestToLibrary: true,
          publishSummaryToLibrary: true,
          triggerIndexing: true,
        },
      },
      {
        repo: repo as any,
        reserveCredits,
        getFeatureFlags,
      },
    );

    expect(result.created).toBe(true);
    expect(repo.insertJob).toHaveBeenCalledWith(expect.objectContaining({
      runtimeType: "desktop_zeroclaw_managed",
      jobType: "local_folder_ingest",
      resourceProfile: "cpu_heavy",
      capabilityRequirementsJson: expect.objectContaining({
        preferredWorkerId: "desktop-worker-1",
        capabilityFamilies: expect.arrayContaining(["file-access", "doc-indexing"]),
      }),
      instructionsJson: expect.objectContaining({
        intent: "local_folder_ingest",
      }),
    }));
  });

  it("rejects local_folder_ingest roots that fall outside the approved workspace roots", async () => {
    getFeatureFlags.mockResolvedValue({
      openClawExternalRuntime: true,
      desktopZeroClawWorker: true,
      nemoClawSecureWorkerPool: false,
      hiClawClusterRuntime: false,
    });

    await expect(
      queueDesktopLocalFolderIngestJob(
        {
          tenantId: "tenant-1",
          requestedByUserId: 7,
          roots: [
            {
              rootId: "quotes",
              name: "Quotes",
              path: "D:\\Other\\Quotes",
            },
          ],
          workspacePolicy: {
            mode: "workspace_scoped",
            allowedSourceRoots: ["C:\\Media"],
          },
          ingestPolicy: {
            maxDepth: 4,
            maxFiles: 50,
            includePreviewText: true,
            previewFileLimit: 10,
            snippetFileLimit: 0,
          },
          outputTargets: {
            publishManifestToLibrary: true,
            publishSummaryToLibrary: false,
            triggerIndexing: true,
          },
        },
        {
          repo: repo as any,
          reserveCredits,
          getFeatureFlags,
        },
      ),
    ).rejects.toMatchObject({
      code: "unauthorized_path",
      statusCode: 403,
    });
  });

  it("queues desktop comfy_image_generation jobs through the desktop runtime lane", async () => {
    getFeatureFlags.mockResolvedValue({
      openClawExternalRuntime: true,
      desktopZeroClawWorker: true,
      nemoClawSecureWorkerPool: false,
      hiClawClusterRuntime: false,
    });
    repo.findWorkerById.mockResolvedValue({
      id: "desktop-worker-1",
      runtimeType: "desktop_zeroclaw_managed",
      status: "online",
    });

    const result = await queueDesktopComfyImageGenerationJob(
      {
        tenantId: "tenant-1",
        requestedByUserId: 7,
        preferredWorkerId: "desktop-worker-1",
        service: {
          baseUrl: "http://127.0.0.1:8188",
          submitPath: "/prompt",
          historyPathTemplate: "/history/{promptId}",
          viewPath: "/view",
        },
        workflowJson: {
          "1": { class_type: "KSampler", inputs: { seed: 42 } },
        },
        generationSpec: {
          promptSummary: "Editorial portrait",
          gpuRequired: true,
        },
        outputTargets: {
          publishImagesToLibrary: true,
          publishManifestToLibrary: true,
          triggerIndexing: true,
          maxImages: 4,
        },
      },
      {
        repo: repo as any,
        reserveCredits,
        getFeatureFlags,
      },
    );

    expect(result.created).toBe(true);
    expect(repo.insertJob).toHaveBeenCalledWith(expect.objectContaining({
      runtimeType: "desktop_zeroclaw_managed",
      jobType: "comfy_image_generation",
      resourceProfile: "gpu_required",
      capabilityRequirementsJson: expect.objectContaining({
        preferredWorkerId: "desktop-worker-1",
        capabilityFamilies: expect.arrayContaining(["comfyui-image-generate", "gpu-nvidia"]),
      }),
      instructionsJson: expect.objectContaining({
        intent: "comfy_image_generation",
      }),
    }));
  });

  it("rejects comfy_image_generation jobs that point to non-loopback services", async () => {
    getFeatureFlags.mockResolvedValue({
      openClawExternalRuntime: true,
      desktopZeroClawWorker: true,
      nemoClawSecureWorkerPool: false,
      hiClawClusterRuntime: false,
    });

    await expect(
      queueDesktopComfyImageGenerationJob(
        {
          tenantId: "tenant-1",
          requestedByUserId: 7,
          service: {
            baseUrl: "https://comfy.example.test",
            submitPath: "/prompt",
            historyPathTemplate: "/history/{promptId}",
            viewPath: "/view",
          },
          workflowJson: {
            "1": { class_type: "KSampler" },
          },
          generationSpec: {
            promptSummary: "Studio portrait",
            gpuRequired: true,
          },
          outputTargets: {
            publishImagesToLibrary: true,
            publishManifestToLibrary: true,
            triggerIndexing: true,
            maxImages: 2,
          },
        },
        {
          repo: repo as any,
          reserveCredits,
          getFeatureFlags,
        },
      ),
    ).rejects.toMatchObject({
      issues: expect.arrayContaining([
        expect.objectContaining({
          path: ["service", "baseUrl"],
        }),
      ]),
    });
  });

  it("queues desktop comfy_workflow_run jobs through the desktop runtime lane", async () => {
    getFeatureFlags.mockResolvedValue({
      openClawExternalRuntime: true,
      desktopZeroClawWorker: true,
      nemoClawSecureWorkerPool: false,
      hiClawClusterRuntime: false,
    });
    repo.findWorkerById.mockResolvedValue({
      id: "desktop-worker-1",
      runtimeType: "desktop_zeroclaw_managed",
      status: "online",
    });

    const result = await queueDesktopComfyWorkflowRunJob(
      {
        tenantId: "tenant-1",
        requestedByUserId: 7,
        preferredWorkerId: "desktop-worker-1",
        service: {
          baseUrl: "http://localhost:8188",
          submitPath: "/prompt",
          historyPathTemplate: "/history/{promptId}",
          viewPath: "/view",
        },
        workflowJson: {
          "10": { class_type: "SaveImage", inputs: { filename_prefix: "smartspec" } },
        },
        executionPolicy: {
          expectedOutputTypes: ["images", "files"],
          gpuRequired: false,
          failOnMissingOutputs: true,
        },
        outputTargets: {
          publishOutputFilesToLibrary: true,
          publishManifestToLibrary: true,
          triggerIndexing: false,
          maxOutputFiles: 12,
        },
      },
      {
        repo: repo as any,
        reserveCredits,
        getFeatureFlags,
      },
    );

    expect(result.created).toBe(true);
    expect(repo.insertJob).toHaveBeenCalledWith(expect.objectContaining({
      runtimeType: "desktop_zeroclaw_managed",
      jobType: "comfy_workflow_run",
      resourceProfile: "cpu_heavy",
      capabilityRequirementsJson: expect.objectContaining({
        preferredWorkerId: "desktop-worker-1",
        capabilityFamilies: expect.arrayContaining(["comfyui-workflow-run"]),
      }),
      instructionsJson: expect.objectContaining({
        intent: "comfy_workflow_run",
      }),
    }));
  });

  it("queues NemoClaw jobs through the secure runtime lane", async () => {
    getFeatureFlags.mockResolvedValue({
      openClawExternalRuntime: true,
      desktopZeroClawWorker: true,
      nemoClawSecureWorkerPool: true,
      hiClawClusterRuntime: false,
    });
    repo.findWorkerById.mockResolvedValue({
      id: "nemo-worker-1",
      runtimeType: "nemoclaw_sandbox",
      status: "online",
    });

    const result = await queueNemoClawWorkerJob(
      {
        tenantId: "tenant-1",
        requestedByUserId: 7,
        preferredWorkerId: "nemo-worker-1",
        jobType: "secure_browser_task",
        inputJson: { url: "https://example.com" },
      },
      {
        repo: repo as any,
        reserveCredits,
        getFeatureFlags,
      },
    );

    expect(result.created).toBe(true);
    expect(repo.insertJob).toHaveBeenCalledWith(expect.objectContaining({
      runtimeType: "nemoclaw_sandbox",
      jobType: "secure_browser_task",
      resourceProfile: "sandbox_required",
      capabilityRequirementsJson: expect.objectContaining({
        preferredWorkerId: "nemo-worker-1",
        capabilityFamilies: ["secure-sandbox-exec"],
      }),
    }));
  });

  it("queues HiClaw jobs through the collaborative cluster lane", async () => {
    getFeatureFlags.mockResolvedValue({
      openClawExternalRuntime: true,
      desktopZeroClawWorker: true,
      nemoClawSecureWorkerPool: false,
      hiClawClusterRuntime: true,
    });
    repo.findWorkerById.mockResolvedValue({
      id: "hiclaw-worker-1",
      runtimeType: "hiclaw_cluster",
      status: "online",
    });

    const result = await queueHiClawWorkerJob(
      {
        tenantId: "tenant-1",
        requestedByUserId: 7,
        preferredWorkerId: "hiclaw-worker-1",
        jobType: "collaborative_agent_task",
        inputJson: { topic: "market scan" },
      },
      {
        repo: repo as any,
        reserveCredits,
        getFeatureFlags,
      },
    );

    expect(result.created).toBe(true);
    expect(repo.insertJob).toHaveBeenCalledWith(expect.objectContaining({
      runtimeType: "hiclaw_cluster",
      jobType: "collaborative_agent_task",
      resourceProfile: "human_observable",
      capabilityRequirementsJson: expect.objectContaining({
        preferredWorkerId: "hiclaw-worker-1",
        capabilityFamilies: ["multi-agent-cluster"],
      }),
    }));
  });

  it("rejects nested local Windows paths for NemoClaw jobs", async () => {
    getFeatureFlags.mockResolvedValue({
      openClawExternalRuntime: true,
      desktopZeroClawWorker: true,
      nemoClawSecureWorkerPool: true,
      hiClawClusterRuntime: false,
    });

    await expect(
      queueNemoClawWorkerJob(
        {
          tenantId: "tenant-1",
          requestedByUserId: 7,
          jobType: "secure_browser_task",
          inputJson: {
            artifacts: [{
              sourcePath: "C:\\Media\\private\\notes.txt",
            }],
          },
        },
        {
          repo: repo as any,
          reserveCredits,
          getFeatureFlags,
        },
      ),
    ).rejects.toMatchObject({
      code: "unsupported_job_scope",
      statusCode: 400,
    });

    expect(repo.insertJob).not.toHaveBeenCalled();
  });

  it("rejects UNC paths for HiClaw jobs", async () => {
    getFeatureFlags.mockResolvedValue({
      openClawExternalRuntime: true,
      desktopZeroClawWorker: true,
      nemoClawSecureWorkerPool: false,
      hiClawClusterRuntime: true,
    });

    await expect(
      queueHiClawWorkerJob(
        {
          tenantId: "tenant-1",
          requestedByUserId: 7,
          jobType: "collaborative_agent_task",
          inputJson: {
            source: {
              uncPath: "\\\\fileserver\\teamshare\\brief.docx",
            },
          },
        },
        {
          repo: repo as any,
          reserveCredits,
          getFeatureFlags,
        },
      ),
    ).rejects.toMatchObject({
      code: "unsupported_job_scope",
      statusCode: 400,
    });

    expect(repo.insertJob).not.toHaveBeenCalled();
  });

  it("routes generic worker queue requests by runtime family", async () => {
    getFeatureFlags.mockResolvedValue({
      openClawExternalRuntime: true,
      desktopZeroClawWorker: true,
      nemoClawSecureWorkerPool: false,
      hiClawClusterRuntime: false,
    });
    repo.findWorkerById.mockResolvedValue({
      id: "desktop-worker-1",
      runtimeType: "desktop_zeroclaw_managed",
      status: "online",
    });

    const result = await queueWorkerJobByRuntime(
      {
        runtimeType: "desktop_zeroclaw_managed",
        jobType: "video_assembly",
        tenantId: "tenant-1",
        requestedByUserId: 7,
        preferredWorkerId: "desktop-worker-1",
        inputRefs: [
          {
            sourceKind: "authorized_local_path",
            path: "C:\\Media\\source.mp4",
          },
        ],
        editPlan: {
          clips: [
            {
              sourceRef: "C:\\Media\\source.mp4",
              trim: { startMs: 0, endMs: 1000 },
            },
          ],
          applyWatermark: false,
        },
        subtitlePlan: {
          sourcePriority: "system_generated",
          mode: "none",
        },
        renderProfile: {
          aspectRatios: ["16:9"],
          codecPreset: "h264_high",
          qualityPreset: "social_default",
          gpuRequired: false,
        },
        workspacePolicy: {
          mode: "workspace_scoped",
          allowedSourceRoots: ["C:\\Media"],
        },
        outputTargets: {
          renderedAssets: [
            {
              label: "main",
              aspectRatio: "16:9",
              publishToLibrary: true,
            },
          ],
          subtitlesOptional: false,
          thumbnailsOptional: false,
        },
      },
      {
        repo: repo as any,
        reserveCredits,
        getFeatureFlags,
      },
    );

    expect(result.created).toBe(true);
    expect(repo.insertJob).toHaveBeenCalledWith(expect.objectContaining({
      runtimeType: "desktop_zeroclaw_managed",
      jobType: "video_assembly",
    }));
  });

  it("routes local_folder_ingest queue requests through the desktop runtime family", async () => {
    getFeatureFlags.mockResolvedValue({
      openClawExternalRuntime: true,
      desktopZeroClawWorker: true,
      nemoClawSecureWorkerPool: false,
      hiClawClusterRuntime: false,
    });
    repo.findWorkerById.mockResolvedValue({
      id: "desktop-worker-1",
      runtimeType: "desktop_zeroclaw_managed",
      status: "online",
    });

    const result = await queueWorkerJobByRuntime(
      {
        runtimeType: "desktop_zeroclaw_managed",
        jobType: "local_folder_ingest",
        tenantId: "tenant-1",
        requestedByUserId: 7,
        preferredWorkerId: "desktop-worker-1",
        roots: [
          {
            rootId: "quotes",
            name: "Quotes",
            path: "C:\\Media\\Quotes",
          },
        ],
        workspacePolicy: {
          mode: "workspace_scoped",
          allowedSourceRoots: ["C:\\Media"],
        },
        ingestPolicy: {
          maxDepth: 4,
          maxFiles: 25,
          includePreviewText: true,
          previewFileLimit: 5,
          snippetQuery: "launch",
          snippetFileLimit: 3,
        },
        outputTargets: {
          publishManifestToLibrary: true,
          publishSummaryToLibrary: true,
          triggerIndexing: true,
        },
      },
      {
        repo: repo as any,
        reserveCredits,
        getFeatureFlags,
      },
    );

    expect(result.created).toBe(true);
    expect(repo.insertJob).toHaveBeenCalledWith(expect.objectContaining({
      runtimeType: "desktop_zeroclaw_managed",
      jobType: "local_folder_ingest",
    }));
  });

  it("routes comfy_image_generation queue requests through the desktop runtime family", async () => {
    getFeatureFlags.mockResolvedValue({
      openClawExternalRuntime: true,
      desktopZeroClawWorker: true,
      nemoClawSecureWorkerPool: false,
      hiClawClusterRuntime: false,
    });
    repo.findWorkerById.mockResolvedValue({
      id: "desktop-worker-1",
      runtimeType: "desktop_zeroclaw_managed",
      status: "online",
    });

    const result = await queueWorkerJobByRuntime(
      {
        runtimeType: "desktop_zeroclaw_managed",
        jobType: "comfy_image_generation",
        tenantId: "tenant-1",
        requestedByUserId: 7,
        preferredWorkerId: "desktop-worker-1",
        service: {
          baseUrl: "http://127.0.0.1:8188",
          submitPath: "/prompt",
          historyPathTemplate: "/history/{promptId}",
          viewPath: "/view",
        },
        workflowJson: {
          "1": { class_type: "KSampler" },
        },
        generationSpec: {
          promptSummary: "Portrait study",
          gpuRequired: true,
        },
        outputTargets: {
          publishImagesToLibrary: true,
          publishManifestToLibrary: true,
          triggerIndexing: true,
          maxImages: 2,
        },
      },
      {
        repo: repo as any,
        reserveCredits,
        getFeatureFlags,
      },
    );

    expect(result.created).toBe(true);
    expect(repo.insertJob).toHaveBeenCalledWith(expect.objectContaining({
      runtimeType: "desktop_zeroclaw_managed",
      jobType: "comfy_image_generation",
    }));
  });
});
