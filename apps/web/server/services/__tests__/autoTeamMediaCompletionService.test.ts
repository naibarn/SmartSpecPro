import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  mockGetDb: vi.fn(),
  mockDbSelect: vi.fn(),
  mockDbInsert: vi.fn(),
  mockDbUpdate: vi.fn(),
  mockPostWorkUpdate: vi.fn(),
  mockBuildCanonicalArtifactRef: vi.fn(),
  mockGetLatestRunSnapshot: vi.fn(),
  mockExtractRunPlanArtifact: vi.fn(),
  mockCaptureSnapshot: vi.fn(),
  mockCallLLMStructured: vi.fn(async () => ({
    data: {
      pass: true,
      score: 0.91,
      issues: [],
      summary: "Semantic review passed for the final media delivery.",
    },
  })),
  mockShouldAutoCompleteFinalApprovalForRun: vi.fn(),
  mockValidateFinalApprovalEvidenceForRun: vi.fn(),
  mockStopRun: vi.fn(),
  mockGetMediaTask: vi.fn(),
  mockGenerateVideoAsync: vi.fn(),
  mockSubmitInternalMediaJob: vi.fn(),
  mockGetInternalMediaJobStatus: vi.fn(),
  mockStoragePut: vi.fn(),
  mockAssertR2StorageActive: vi.fn(),
  mockStorageStreamFile: vi.fn(),
  mockGetActiveStorageConfig: vi.fn(async () => ({ provider: "local" })),
  mockGetUploadsDir: vi.fn(() => "/tmp/uploads"),
  mockAssertPublicIp: vi.fn(),
}));

vi.mock("../callLLMStructured", () => ({
  callLLMStructured: (...args: unknown[]) => mocks.mockCallLLMStructured(...args),
}));

vi.mock("../../db", () => ({
  getDb: (...args: unknown[]) => mocks.mockGetDb(...args),
}));

vi.mock("../roomService", () => ({
  postWorkUpdate: (...args: unknown[]) => mocks.mockPostWorkUpdate(...args),
}));

vi.mock("../autoTeamArtifactRefService", () => ({
  buildCanonicalArtifactRef: (...args: unknown[]) =>
    mocks.mockBuildCanonicalArtifactRef(...args),
}));

vi.mock("../mediaGenerationService", () => ({
  mediaGenerationService: {
    getTask: (...args: unknown[]) => mocks.mockGetMediaTask(...args),
    generateVideoAsync: (...args: unknown[]) => mocks.mockGenerateVideoAsync(...args),
  },
}));

vi.mock("../../routers/mediaJobs", () => ({
  submitInternalMediaJob: (...args: unknown[]) =>
    mocks.mockSubmitInternalMediaJob(...args),
  getInternalMediaJobStatus: (...args: unknown[]) =>
    mocks.mockGetInternalMediaJobStatus(...args),
}));

vi.mock("../../storage", () => ({
  assertR2StorageActive: (...args: unknown[]) => mocks.mockAssertR2StorageActive(...args),
  getActiveStorageConfig: (...args: unknown[]) =>
    mocks.mockGetActiveStorageConfig(...args),
  storagePut: (...args: unknown[]) => mocks.mockStoragePut(...args),
  storageStreamFile: (...args: unknown[]) => mocks.mockStorageStreamFile(...args),
  getUploadsDir: (...args: unknown[]) => mocks.mockGetUploadsDir(...args),
}));

vi.mock("../ssrfValidation", () => ({
  sanitizeUri: (rawUrl: string) => new URL(rawUrl).toString(),
  assertPublicIp: (...args: unknown[]) => mocks.mockAssertPublicIp(...args),
}));

vi.mock("../monitoringService", () => ({
  getLatestRunSnapshot: (...args: unknown[]) =>
    mocks.mockGetLatestRunSnapshot(...args),
  extractRunPlanArtifact: (...args: unknown[]) =>
    mocks.mockExtractRunPlanArtifact(...args),
  captureSnapshot: (...args: unknown[]) => mocks.mockCaptureSnapshot(...args),
}));

vi.mock("../runEngine", () => ({
  shouldAutoCompleteFinalApprovalForRun: (...args: unknown[]) =>
    mocks.mockShouldAutoCompleteFinalApprovalForRun(...args),
  validateFinalApprovalEvidenceForRun: (...args: unknown[]) =>
    mocks.mockValidateFinalApprovalEvidenceForRun(...args),
  stopRun: (...args: unknown[]) => mocks.mockStopRun(...args),
}));

import {
  __autoTeamMediaCompletionTestHooks,
  advanceAutoTeamMediaPipeline,
  registerAutoTeamMediaArtifact,
} from "../autoTeamMediaCompletionService";

function makePipeline(overrides: Record<string, unknown> = {}) {
  return {
    status: "probing_final_video",
    objective: "Create a final video longer than one minute.",
    runId: "run-1",
    roomId: "room-1",
    tenantId: "tenant-1",
    teamId: "team-1",
    userId: 1,
    assistantId: "assistant-1",
    targetDurationSeconds: 70,
    expectedClipCount: 7,
    storyboardImages: [],
    clipTasks: Array.from({ length: 7 }, (_, index) => ({
      taskId: `task-${index + 1}`,
      resultUrl: `https://cdn.example.com/clip-${index + 1}.mp4`,
      plannedDurationSeconds: 10,
      clipIndex: index + 1,
      clipCount: 7,
      createdAt: "2026-04-26T00:00:00.000Z",
    })),
    renderJobId: "render-1",
    probeJobId: "probe-1",
    probeResult: {
      derived: { durationSeconds: 72 },
      streams: [{ codec_type: "video", width: 1920, height: 1080, codec_name: "h264" }],
    },
    finalVideoUrl: "https://cdn.example.com/final.mp4",
    createdAt: "2026-04-26T00:00:00.000Z",
    updatedAt: "2026-04-26T00:00:00.000Z",
    ...overrides,
  } as Parameters<
    typeof __autoTeamMediaCompletionTestHooks.summarizeFinalReview
  >[0];
}

function makeRun() {
  return {
    id: "run-1",
    roomId: "room-1",
    teamId: "team-1",
    executionMode: "auto_team",
    runtimeStateJson: {},
  } as any;
}

function makeCompletedPlan() {
  return {
    version: 1,
    runId: "run-1",
    roomId: "room-1",
    teamId: "team-1",
    caseId: null,
    requestId: null,
    objective: "Create a final video longer than one minute.",
    source: "team_run",
    status: "completed",
    generatedAt: "2026-04-26T00:00:00.000Z",
    lastUpdatedAt: "2026-04-26T00:00:00.000Z",
    steps: [
      {
        stepKey: "video-composition",
        title: "Compose final video",
        objective: "Compose storyboard clips into a final video.",
        deliverable: "Final video",
        ownerPersona: "Video Editor",
        ownerMemberId: null,
        reviewerPersona: "Reviewer",
        reviewerMemberId: null,
        verificationMethod: "Probe and review final video.",
        retryRule: "Repair and retry if review fails.",
        evidenceRequirements: ["final video artifact"],
        qualityCriteria: ["Duration meets target"],
        reviewChecklist: ["Duration", "Objective match"],
        status: "completed",
        evidenceRefs: ["message:msg-1"],
        notes: null,
        surface: "video_editor",
        selectedCapabilityId: "video_editor:compose",
        runtimeDispatchPolicy: null,
        validationState: {
          status: "passed",
          attempt: 1,
          maxAttempts: 2,
          issues: [],
          summary: "Initial composition step passed.",
          semanticScore: 0.8,
          checkedAt: "2026-04-26T00:01:00.000Z",
        },
      },
    ],
    evidenceRefs: ["message:msg-1"],
    planEvidenceRefs: [],
    reviewerMatrix: [],
    exploration: null,
    review: {
      status: "passed",
      iteration: 1,
      reviewedAt: "2026-04-26T00:02:00.000Z",
      reviewerPersona: "Reviewer",
      issues: [],
      score: 0.9,
      recommendation: "Proceed",
    },
  } as any;
}

describe("autoTeamMediaCompletionService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.mockGetActiveStorageConfig.mockResolvedValue({ provider: "local" });
    let insertCount = 0;
    mocks.mockDbSelect.mockImplementation(() => ({
      from: vi.fn(() => ({
        where: vi.fn(() => ({
          limit: vi.fn(async () => []),
        })),
      })),
    }));
    mocks.mockDbInsert.mockImplementation(() => ({
      values: vi.fn((values: Record<string, unknown>) => ({
        returning: vi.fn(async () => {
          insertCount += 1;
          return [
            {
              id: insertCount === 1 ? "review-1" : "final-result-1",
              ...values,
            },
          ];
        }),
      })),
    }));
    mocks.mockDbUpdate.mockImplementation(() => ({
      set: vi.fn(() => ({
        where: vi.fn(async () => []),
      })),
    }));
    mocks.mockGetDb.mockResolvedValue({
      select: mocks.mockDbSelect,
      insert: mocks.mockDbInsert,
      update: mocks.mockDbUpdate,
    });
    mocks.mockBuildCanonicalArtifactRef.mockResolvedValue({
      id: "artifact-final-1",
      tenantId: "tenant-1",
      teamId: "team-1",
      roomId: "room-1",
      runId: "run-1",
      stageId: null,
      workItemId: null,
      artifactType: "final_result",
      artifactRole: "result",
      storageRef: "auto-team-media/tenant-1/run-1/final-hash.mp4",
      externalRef: null,
      contentHash: "hash-final",
      visibility: "tenant",
      retentionPolicyJson: {},
      safetyStatus: "safe",
      source: "auto_team_media_pipeline",
    });
    mocks.mockStoragePut.mockResolvedValue({
      key: "auto-team-media/tenant-1/run-1/final-hash.mp4",
      url: "/api/storage/files/auto-team-media/tenant-1/run-1/final-hash.mp4",
    });
    mocks.mockAssertPublicIp.mockResolvedValue(undefined);
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(Buffer.from("fake-final-video"), {
          status: 200,
          headers: { "content-type": "video/mp4" },
        }),
      ),
    );
    const plan = makeCompletedPlan();
    mocks.mockGetLatestRunSnapshot.mockResolvedValue({
      artifactCountJson: { planArtifact: plan },
    });
    mocks.mockExtractRunPlanArtifact.mockImplementation(
      (snapshot: any) => snapshot?.artifactCountJson?.planArtifact ?? null,
    );
    mocks.mockCaptureSnapshot.mockResolvedValue({ id: "snapshot-1" });
    mocks.mockShouldAutoCompleteFinalApprovalForRun.mockReturnValue(true);
    mocks.mockValidateFinalApprovalEvidenceForRun.mockResolvedValue({
      checkedRefs: ["artifact:artifact-final-1", "review:review-1", "final-result:final-result-1"],
      resolvedRefs: ["artifact:artifact-final-1", "review:review-1", "final-result:final-result-1"],
      unresolvedRefs: [],
      allResolved: true,
    });
    mocks.mockStopRun.mockResolvedValue(undefined);
    mocks.mockPostWorkUpdate.mockResolvedValue({ id: "message-final" });
    mocks.mockSubmitInternalMediaJob.mockReset();
    mocks.mockGetInternalMediaJobStatus.mockReset();
  });

  it("passes final review only after probe duration satisfies the target", async () => {
    const review =
      await __autoTeamMediaCompletionTestHooks.summarizeFinalReview(
        makePipeline(),
      );

    expect(review.status).toBe("passed");
    expect(review.actualDurationSeconds).toBe(72);
    expect(review.semanticScore).toBe(0.91);
  });

  it("fails final review when the probed duration is below the target", async () => {
    const review =
      await __autoTeamMediaCompletionTestHooks.summarizeFinalReview(
        makePipeline({
          probeResult: {
            format: { duration: "55.2" },
            streams: [{ codec_type: "video", width: 1920, height: 1080 }],
          },
        }),
      );

    expect(review.status).toBe("failed");
    expect(review.summary).toMatch(/below target/i);
    expect(review.actualDurationSeconds).toBe(55.2);
  });

  it("allows signed final media URLs only as transient inputs before managed storage internalization", async () => {
    const review =
      await __autoTeamMediaCompletionTestHooks.summarizeFinalReview(
        makePipeline({
          finalVideoUrl: "https://cdn.example.com/final.mp4?X-Amz-Signature=secret",
        }),
      );

    expect(review.status).toBe("passed");
    expect(mocks.mockCallLLMStructured).toHaveBeenCalled();
  });

  it("fails final review before LLM review when media output points at an internal URL", async () => {
    const review =
      await __autoTeamMediaCompletionTestHooks.summarizeFinalReview(
        makePipeline({
          finalVideoUrl: "http://127.0.0.1:8080/final.mp4",
        }),
      );

    expect(review.status).toBe("failed");
    expect(review.summary).toBe("internal_media_url_detected");
    expect(mocks.mockCallLLMStructured).not.toHaveBeenCalled();
  });

  it("rejects unsafe relative final media paths", async () => {
    const review =
      await __autoTeamMediaCompletionTestHooks.summarizeFinalReview(
        makePipeline({
          finalVideoUrl: "/api/private/final.mp4",
        }),
      );

    expect(review.status).toBe("failed");
    expect(review.summary).toBe("unsupported_relative_media_url");
    expect(mocks.mockCallLLMStructured).not.toHaveBeenCalled();
  });

  it("rejects managed media paths with encoded traversal", async () => {
    const review =
      await __autoTeamMediaCompletionTestHooks.summarizeFinalReview(
        makePipeline({
          finalVideoUrl: "/uploads/%2e%2e/private/final.mp4",
        }),
      );

    expect(review.status).toBe("failed");
    expect(review.summary).toBe("unsupported_relative_media_url");
    expect(mocks.mockCallLLMStructured).not.toHaveBeenCalled();
  });

  it("fails final review when objective semantic review is unavailable", async () => {
    mocks.mockCallLLMStructured.mockRejectedValueOnce(new Error("provider down"));

    const review =
      await __autoTeamMediaCompletionTestHooks.summarizeFinalReview(
        makePipeline(),
      );

    expect(review.status).toBe("failed");
    expect(review.semanticIssues).toContain("final_objective_review_unavailable");
  });

  it("builds a probe job against the final composed video", () => {
    const spec = __autoTeamMediaCompletionTestHooks.buildProbeSpec(
      makePipeline(),
    );

    expect(spec.jobType).toBe("probe");
    expect(spec.inputs.assets?.[0]).toEqual(
      expect.objectContaining({
        kind: "video",
        uri: "https://cdn.example.com/final.mp4",
      }),
    );
    expect(spec.output.mode).toBe("memory");
  });

  it("fails closed when registering media without a run or video task id", async () => {
    await expect(
      registerAutoTeamMediaArtifact({
        runId: "missing-run",
        roomId: "room-1",
        teamId: "team-1",
        tenantId: "tenant-1",
        userId: 1,
        assistantId: "assistant-1",
        objective: "Create video.",
        mediaType: "video",
        mediaPayload: { status: "processing" },
      }),
    ).rejects.toThrow("auto_team_media_run_not_found");

    mocks.mockDbSelect.mockImplementation(() => ({
      from: vi.fn(() => ({
        where: vi.fn(() => ({
          limit: vi.fn(async () => [makeRun()]),
        })),
      })),
    }));

    await expect(
      registerAutoTeamMediaArtifact({
        runId: "run-1",
        roomId: "room-1",
        teamId: "team-1",
        tenantId: "tenant-1",
        userId: 1,
        assistantId: "assistant-1",
        objective: "Create video.",
        mediaType: "video",
        mediaPayload: { status: "processing" },
      }),
    ).rejects.toThrow("video_media_task_id_missing");
  });

  it("rejects media artifact registration when the run scope does not match", async () => {
    mocks.mockDbSelect.mockImplementation(() => ({
      from: vi.fn(() => ({
        where: vi.fn(() => ({
          limit: vi.fn(async () => [
            {
              ...makeRun(),
              roomId: "room-other",
              teamId: "team-1",
              initiatedByUserId: 1,
            },
          ]),
        })),
      })),
    }));

    await expect(
      registerAutoTeamMediaArtifact({
        runId: "run-1",
        roomId: "room-1",
        teamId: "team-1",
        tenantId: "tenant-1",
        userId: 1,
        assistantId: "assistant-1",
        objective: "Create video.",
        mediaType: "video",
        mediaPayload: { taskId: "video-task-1" },
      }),
    ).rejects.toThrow("auto_team_media_run_scope_mismatch");

    mocks.mockDbSelect.mockImplementation(() => ({
      from: vi.fn(() => ({
        where: vi.fn(() => ({
          limit: vi.fn(async () => [
            {
              ...makeRun(),
              initiatedByUserId: 99,
            },
          ]),
        })),
      })),
    }));

    await expect(
      registerAutoTeamMediaArtifact({
        runId: "run-1",
        roomId: "room-1",
        teamId: "team-1",
        tenantId: "tenant-1",
        userId: 1,
        assistantId: "assistant-1",
        objective: "Create video.",
        mediaType: "video",
        mediaPayload: { taskId: "video-task-1" },
      }),
    ).rejects.toThrow("auto_team_media_run_user_mismatch");
  });

  it("rejects media artifact registration when the run tenant does not match the room tenant", async () => {
    let selectCount = 0;
    mocks.mockDbSelect.mockImplementation(() => ({
      from: vi.fn(() => ({
        where: vi.fn(() => ({
          limit: vi.fn(async () => {
            selectCount += 1;
            return selectCount === 1
              ? [
                  {
                    ...makeRun(),
                    initiatedByUserId: 1,
                  },
                ]
              : [{ tenantId: "tenant-other" }];
          }),
        })),
      })),
    }));

    await expect(
      registerAutoTeamMediaArtifact({
        runId: "run-1",
        roomId: "room-1",
        teamId: "team-1",
        tenantId: "tenant-1",
        userId: 1,
        assistantId: "assistant-1",
        objective: "Create video.",
        mediaType: "video",
        mediaPayload: { taskId: "video-task-1" },
      }),
    ).rejects.toThrow("auto_team_media_run_tenant_mismatch");
  });

  it("tracks async storyboard image tasks until safe image URLs are available", async () => {
    vi.useFakeTimers();
    const updateSets: Array<Record<string, any>> = [];
    try {
      mocks.mockDbSelect.mockImplementation(() => ({
        from: vi.fn(() => ({
          where: vi.fn(() => ({
            limit: vi.fn(async () => [makeRun()]),
          })),
        })),
      }));
      mocks.mockDbUpdate.mockImplementation(() => ({
        set: vi.fn((values: Record<string, any>) => {
          updateSets.push(values);
          return { where: vi.fn(async () => []) };
        }),
      }));

      await registerAutoTeamMediaArtifact({
        runId: "run-1",
        roomId: "room-1",
        teamId: "team-1",
        tenantId: "tenant-1",
        userId: 1,
        assistantId: "assistant-1",
        objective: "Create storyboard then video.",
        mediaType: "image",
        mediaPayload: { taskId: "image-task-1", status: "processing" },
        promptText: "Storyboard frame",
        mediaSkillId: "media_studio:image",
      });

      const pipeline = extractPipelineUpdate(updateSets[0]);
      expect(pipeline.status).toBe("collecting_assets");
      expect(pipeline.imageTasks[0]).toMatchObject({
        taskId: "image-task-1",
        status: "processing",
        resultUrls: [],
      });
      expect(pipeline.storyboardImages).toEqual([]);
    } finally {
      vi.clearAllTimers();
      vi.useRealTimers();
    }
  });

  it("polls async storyboard image tasks and stores only validated image URLs", async () => {
    vi.useFakeTimers();
    const updateSets: Array<Record<string, any>> = [];
    try {
      mocks.mockDbSelect.mockImplementation(() => ({
        from: vi.fn(() => ({
          where: vi.fn(() => ({
            limit: vi.fn(async () => [
              {
                ...makeRun(),
                runtimeStateJson: {
                  autoTeamMediaPipeline: makePipeline({
                    status: "collecting_assets",
                    createdAt: new Date().toISOString(),
                    updatedAt: new Date().toISOString(),
                    expectedClipCount: 1,
                    imageTasks: [
                      {
                        taskId: "image-task-1",
                        prompt: "Storyboard frame",
                        sourceSkillId: "media_studio:image",
                        status: "processing",
                        resultUrls: [],
                        createdAt: "2026-04-26T00:00:00.000Z",
                      },
                    ],
                    storyboardImages: [],
                    clipTasks: [],
                  }),
                },
              },
            ]),
          })),
        })),
      }));
      mocks.mockDbUpdate.mockImplementation(() => ({
        set: vi.fn((values: Record<string, any>) => {
          updateSets.push(values);
          return { where: vi.fn(async () => []) };
        }),
      }));
      mocks.mockGetMediaTask.mockResolvedValue({
        taskId: "image-task-1",
        status: "completed",
        resultUrl: "https://cdn.example.com/storyboard-1.png",
        resultData: {},
      });

      await advanceAutoTeamMediaPipeline("run-1");

      const persistedPipelines = updateSets
        .map(values => extractPipelineUpdate(values))
        .filter(Boolean);
      const latestPipeline = persistedPipelines[persistedPipelines.length - 1];
      expect(latestPipeline.storyboardImages).toEqual([
        expect.objectContaining({
          url: "https://cdn.example.com/storyboard-1.png",
          sourceSkillId: "media_studio:image",
        }),
      ]);
      expect(JSON.stringify(persistedPipelines)).not.toContain("?token=");
    } finally {
      vi.clearAllTimers();
      vi.useRealTimers();
    }
  });

  it("queues missing video clip tasks from completed storyboard images", async () => {
    vi.useFakeTimers();
    const updateSets: Array<Record<string, any>> = [];
    try {
      mocks.mockDbSelect.mockImplementation(() => ({
        from: vi.fn(() => ({
          where: vi.fn(() => ({
            limit: vi.fn(async () => [
              {
                ...makeRun(),
                runtimeStateJson: {
                  autoTeamMediaPipeline: makePipeline({
                    status: "collecting_assets",
                    createdAt: new Date().toISOString(),
                    updatedAt: new Date().toISOString(),
                    expectedClipCount: 1,
                    storyboardImages: [
                      {
                        url: "https://cdn.example.com/storyboard-1.png",
                        prompt: "Storyboard frame",
                        sourceSkillId: "media_studio:image",
                        createdAt: "2026-04-26T00:00:00.000Z",
                      },
                    ],
                    imageTasks: [],
                    clipTasks: [],
                  }),
                },
              },
            ]),
          })),
        })),
      }));
      mocks.mockDbUpdate.mockImplementation(() => ({
        set: vi.fn((values: Record<string, any>) => {
          updateSets.push(values);
          return { where: vi.fn(async () => []) };
        }),
      }));
      mocks.mockGenerateVideoAsync.mockResolvedValue({
        taskId: "video-task-1",
        status: "pending",
        resultData: {},
      });

      await advanceAutoTeamMediaPipeline("run-1");

      expect(mocks.mockGenerateVideoAsync).toHaveBeenCalledWith(
        expect.objectContaining({
          referenceImageUrls: ["https://cdn.example.com/storyboard-1.png"],
          duration: 10,
        }),
        expect.any(String),
      );
      const persistedPipelines = updateSets
        .map(values => extractPipelineUpdate(values))
        .filter(Boolean);
      const latestPipeline = persistedPipelines[persistedPipelines.length - 1];
      expect(latestPipeline.clipTasks).toEqual([
        expect.objectContaining({
          taskId: "video-task-1",
          clipIndex: 1,
          clipCount: 1,
        }),
      ]);
      expect(latestPipeline.status).toBe("waiting_for_video_tasks");
    } finally {
      vi.clearAllTimers();
      vi.useRealTimers();
    }
  });

  it("uses the in-process pipeline lock to avoid duplicate video submissions", async () => {
    vi.useFakeTimers();
    let releaseSubmit: (() => void) | null = null;
    try {
      mocks.mockDbSelect.mockImplementation(() => ({
        from: vi.fn(() => ({
          where: vi.fn(() => ({
            limit: vi.fn(async () => [
              {
                ...makeRun(),
                runtimeStateJson: {
                  autoTeamMediaPipeline: makePipeline({
                    status: "collecting_assets",
                    createdAt: new Date().toISOString(),
                    updatedAt: new Date().toISOString(),
                    expectedClipCount: 1,
                    storyboardImages: [
                      {
                        url: "https://cdn.example.com/storyboard-1.png",
                        prompt: "Scene 1: opener",
                        sourceSkillId: "media_studio:image",
                        createdAt: "2026-04-26T00:00:00.000Z",
                      },
                    ],
                    imageTasks: [],
                    clipTasks: [],
                  }),
                },
              },
            ]),
          })),
        })),
      }));
      mocks.mockGenerateVideoAsync.mockImplementation(
        () =>
          new Promise(resolve => {
            releaseSubmit = () =>
              resolve({
                taskId: "video-task-1",
                status: "pending",
                resultData: {},
              });
          }),
      );

      const first = advanceAutoTeamMediaPipeline("run-1");
      const second = advanceAutoTeamMediaPipeline("run-1");
      await vi.waitFor(() => {
        expect(releaseSubmit).toBeTypeOf("function");
      });
      releaseSubmit?.();
      await Promise.all([first, second]);

      expect(mocks.mockGenerateVideoAsync).toHaveBeenCalledTimes(1);
    } finally {
      vi.clearAllTimers();
      vi.useRealTimers();
    }
  });

  it("waits instead of failing when video generation capacity is full", async () => {
    vi.useFakeTimers();
    const updateSets: Array<Record<string, any>> = [];
    try {
      mocks.mockDbSelect.mockImplementation(() => ({
        from: vi.fn(() => ({
          where: vi.fn(() => ({
            limit: vi.fn(async () => [
              {
                ...makeRun(),
                runtimeStateJson: {
                  autoTeamMediaPipeline: makePipeline({
                    status: "collecting_assets",
                    createdAt: new Date().toISOString(),
                    updatedAt: new Date().toISOString(),
                    expectedClipCount: 2,
                    storyboardImages: [
                      {
                        url: "https://cdn.example.com/storyboard-1.png",
                        prompt: "Storyboard frame",
                        sourceSkillId: "media_studio:image",
                        createdAt: "2026-04-26T00:00:00.000Z",
                      },
                    ],
                    imageTasks: [],
                    clipTasks: [
                      {
                        taskId: "video-task-1",
                        resultUrl: "https://cdn.example.com/clip-1.mp4",
                        plannedDurationSeconds: 10,
                        clipIndex: 1,
                        clipCount: 2,
                        createdAt: "2026-04-26T00:00:00.000Z",
                        completedAt: "2026-04-26T00:01:00.000Z",
                      },
                    ],
                  }),
                },
              },
            ]),
          })),
        })),
      }));
      mocks.mockDbUpdate.mockImplementation(() => ({
        set: vi.fn((values: Record<string, any>) => {
          updateSets.push(values);
          return { where: vi.fn(async () => []) };
        }),
      }));
      mocks.mockGenerateVideoAsync.mockRejectedValue(
        new Error("Maximum 3 concurrent media jobs reached"),
      );

      await advanceAutoTeamMediaPipeline("run-1");

      const persistedPipelines = updateSets
        .map(values => extractPipelineUpdate(values))
        .filter(Boolean);
      const latestPipeline = persistedPipelines[persistedPipelines.length - 1];
      expect(latestPipeline.status).toBe("collecting_assets");
      expect(latestPipeline.capacityWaitPolls).toBe(1);
      expect(latestPipeline.clipTasks).toEqual([
        expect.objectContaining({ taskId: "video-task-1", clipIndex: 1 }),
      ]);
      expect(latestPipeline.videoSubmitAttemptsByClip).toEqual({ "2": 1 });
      expect(mocks.mockPostWorkUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          content: expect.stringContaining("waiting for media generation capacity"),
        }),
      );
    } finally {
      vi.clearAllTimers();
      vi.useRealTimers();
    }
  });

  it("fails fast with plan-step metadata when the video provider is not configured", async () => {
    const plan = makeCompletedPlan();
    plan.status = "executing";
    plan.steps = [
      {
        ...plan.steps[0],
        stepKey: "generate-visual-assets",
        title: "Generate storyboard keyframes",
        objective: "Prepare storyboard images.",
        deliverable: "Storyboard keyframes",
        surface: "media_studio",
        selectedCapabilityId: "media_studio:image",
        status: "completed",
      },
      {
        ...plan.steps[0],
        stepKey: "compose-final-video",
        title: "Create and compose final video",
        objective: "Generate the final video with Veo 3.1.",
        deliverable: "Final composed video",
        surface: "video_editor",
        selectedCapabilityId: "video_editor:compose",
        status: "in_progress",
      },
    ];
    mocks.mockGetLatestRunSnapshot.mockResolvedValue({
      artifactCountJson: { planArtifact: plan },
    });

    const currentRun = {
      ...makeRun(),
      runtimeStateJson: {
        autoTeamMediaPipeline: makePipeline({
          status: "collecting_assets",
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          expectedClipCount: 1,
          storyboardImages: [
            {
              url: "https://cdn.example.com/storyboard-1.png",
              prompt: "Scene 1: opening comparison",
              sourceSkillId: "media_studio:image",
              createdAt: "2026-04-26T00:00:00.000Z",
            },
          ],
          imageTasks: [],
          clipTasks: [],
        }),
      },
    };
    const updateSets: Array<Record<string, any>> = [];
    mocks.mockDbSelect.mockImplementation(() => ({
      from: vi.fn(() => ({
        where: vi.fn(() => ({
          limit: vi.fn(async () => [currentRun]),
        })),
      })),
    }));
    mocks.mockDbUpdate.mockImplementation(() => ({
      set: vi.fn((values: Record<string, any>) => {
        updateSets.push(values);
        const pipeline = extractPipelineUpdate(values);
        if (pipeline) {
          currentRun.runtimeStateJson.autoTeamMediaPipeline = pipeline;
        }
        return { where: vi.fn(async () => []) };
      }),
    }));
    mocks.mockGenerateVideoAsync.mockResolvedValue({
      id: "video-task-1",
      status: "failed",
      model: "veo-3-1",
      errorMessage:
        "503: KNPLabs not configured. Please add API key in Admin > Media Providers.",
      resultData: {},
    });

    await advanceAutoTeamMediaPipeline("run-1");

    expect(mocks.mockGenerateVideoAsync).toHaveBeenCalledTimes(1);
    const latestPipeline = updateSets
      .map(values => extractPipelineUpdate(values))
      .filter(Boolean)
      .at(-1);
    expect(latestPipeline.status).toBe("failed");
    expect(latestPipeline.errorMessage).toContain("KNPLabs not configured");
    expect(updateSets).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          stopReason: "media_provider_not_configured",
          runtimeTerminalReason: "media_provider_not_configured",
        }),
      ]),
    );
    expect(mocks.mockPostWorkUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        content: expect.stringContaining("selected media provider is not configured"),
        metadataJson: expect.objectContaining({
          source: "auto_team_media_pipeline",
          pipelineStatus: "failed",
          pipelineFailureReason: "media_provider_not_configured",
          stepKey: "compose-final-video",
          stepTitle: "Create and compose final video",
          stepObjective: "Generate the final video with Veo 3.1.",
          stepDeliverable: "Final composed video",
          stepReviewStatus: "failed",
        }),
      }),
    );
  });

  it("does not queue a repair attempt for non-retryable provider failures", async () => {
    const plan = makeCompletedPlan();
    plan.status = "executing";
    plan.steps[0] = {
      ...plan.steps[0],
      stepKey: "compose-final-video",
      title: "Create and compose final video",
      objective: "Generate the final video with Veo 3.1.",
      deliverable: "Final composed video",
      surface: "video_editor",
      selectedCapabilityId: "video_editor:compose",
      status: "in_progress",
    };
    mocks.mockGetLatestRunSnapshot.mockResolvedValue({
      artifactCountJson: { planArtifact: plan },
    });
    const currentRun = {
      ...makeRun(),
      runtimeStateJson: {
        autoTeamMediaPipeline: makePipeline({
          status: "waiting_for_video_tasks",
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          expectedClipCount: 1,
          storyboardImages: [
            {
              url: "https://cdn.example.com/storyboard-1.png",
              prompt: "Scene 1: opening comparison",
              sourceSkillId: "media_studio:image",
              createdAt: "2026-04-26T00:00:00.000Z",
            },
          ],
          imageTasks: [],
          clipTasks: [
            {
              taskId: "video-task-1",
              prompt: "Create the video clip.",
              model: "veo-3-1",
              status: "failed",
              resultUrl: null,
              errorMessage:
                "503: KNPLabs not configured. Please add API key in Admin > Media Providers.",
              plannedDurationSeconds: 10,
              clipIndex: 1,
              clipCount: 1,
              createdAt: "2026-04-26T00:00:00.000Z",
            },
          ],
        }),
      },
    };
    const updateSets: Array<Record<string, any>> = [];
    mocks.mockDbSelect.mockImplementation(() => ({
      from: vi.fn(() => ({
        where: vi.fn(() => ({
          limit: vi.fn(async () => [currentRun]),
        })),
      })),
    }));
    mocks.mockDbUpdate.mockImplementation(() => ({
      set: vi.fn((values: Record<string, any>) => {
        updateSets.push(values);
        return { where: vi.fn(async () => []) };
      }),
    }));

    await advanceAutoTeamMediaPipeline("run-1");

    expect(mocks.mockGenerateVideoAsync).not.toHaveBeenCalled();
    expect(updateSets).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          stopReason: "media_provider_not_configured",
        }),
      ]),
    );
    const postedContent = mocks.mockPostWorkUpdate.mock.calls
      .map(call => String(call[0]?.content ?? ""))
      .join("\n");
    expect(postedContent).not.toContain("queued repair attempt");
    expect(postedContent).toContain("provider is not configured");
  });

  it("finalizes completed media through canonical evidence before stopping the run", async () => {
    const finalReview = {
      status: "passed" as const,
      summary:
        "Final media satisfies the objective. Preview: https://cdn.example.com/final.mp4",
      checkedAt: "2026-04-26T00:03:00.000Z",
      actualDurationSeconds: 72,
      semanticScore: 0.91,
      semanticIssues: [],
    };
    const completed = await __autoTeamMediaCompletionTestHooks
      .finalizeCompletedMediaPipeline(
        makeRun(),
        makePipeline({ status: "finalizing_evidence", finalReview }),
        finalReview,
      );

    expect(completed).toBe(true);
    expect(mocks.mockBuildCanonicalArtifactRef).toHaveBeenCalledWith(
      expect.objectContaining({
        artifactType: "final_result",
        artifactRole: "result",
        storageRef: "auto-team-media/tenant-1/run-1/final-hash.mp4",
        externalRef: null,
        safetyStatus: "safe",
      }),
    );
    const captureOptions = mocks.mockCaptureSnapshot.mock.calls[0][2] as any;
    const updatedPlan = captureOptions.artifactCountJson.planArtifact;
    expect(updatedPlan.evidenceRefs).toEqual(
      expect.arrayContaining([
        "artifact:artifact-final-1",
        "review:review-1",
        "final-result:final-result-1",
      ]),
    );
    expect(updatedPlan.steps[0].evidenceRefs).toEqual(
      expect.arrayContaining(["artifact:artifact-final-1"]),
    );
    expect(mocks.mockValidateFinalApprovalEvidenceForRun).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: "tenant-1",
        planArtifact: updatedPlan,
      }),
    );
    expect(mocks.mockStopRun).toHaveBeenCalledWith(
      "run-1",
      "plan_completed",
      "tenant-1",
    );
    const postedContent = mocks.mockPostWorkUpdate.mock.calls
      .map(call => String(call[0]?.content ?? ""))
      .join("\n");
    expect(postedContent).not.toContain("https://cdn.example.com/final.mp4");
    expect(postedContent).toContain("[redacted-url]");
  });

  it("queues an automatic repair pass when final review fails before exhausting repair attempts", async () => {
    vi.useFakeTimers();
    const currentRun = {
      ...makeRun(),
      runtimeStateJson: {
        autoTeamMediaPipeline: makePipeline({
          status: "probing_final_video",
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          targetDurationSeconds: 70,
          expectedClipCount: 1,
          storyboardImages: [
            {
              url: "https://cdn.example.com/storyboard-1.png",
              prompt: "Scene 1: opening comparison",
              sourceSkillId: "media_studio:image",
              createdAt: "2026-04-26T00:00:00.000Z",
            },
          ],
          clipTasks: [
            {
              taskId: "video-task-1",
              resultUrl: "https://cdn.example.com/clip-1.mp4",
              plannedDurationSeconds: 10,
              clipIndex: 1,
              clipCount: 1,
              createdAt: "2026-04-26T00:00:00.000Z",
            },
          ],
          probeJobId: "probe-job-1",
        }),
      },
    };
    const updateSets: Array<Record<string, any>> = [];
    try {
      mocks.mockDbSelect.mockImplementation(() => ({
        from: vi.fn(() => ({
          where: vi.fn(() => ({
            limit: vi.fn(async () => [currentRun]),
          })),
        })),
      }));
      mocks.mockDbUpdate.mockImplementation(() => ({
        set: vi.fn((values: Record<string, any>) => {
          updateSets.push(values);
          return { where: vi.fn(async () => []) };
        }),
      }));
      mocks.mockGetInternalMediaJobStatus.mockResolvedValue({
        status: "done",
        result: {
          derived: { durationSeconds: 30 },
          streams: [{ codec_type: "video", width: 1920, height: 1080 }],
        },
      });

      await advanceAutoTeamMediaPipeline("run-1");

      const latestPipeline = updateSets
        .map(values => extractPipelineUpdate(values))
        .filter(Boolean)
        .at(-1);
      expect(latestPipeline.status).toBe("waiting_for_video_tasks");
      expect(latestPipeline.finalReviewRepairAttempts).toBe(1);
      expect(latestPipeline.expectedClipCount).toBe(2);
      expect(mocks.mockStopRun).not.toHaveBeenCalled();
      expect(mocks.mockPostWorkUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          content: expect.stringContaining("automatic repair pass"),
        }),
      );
    } finally {
      vi.clearAllTimers();
      vi.useRealTimers();
    }
  });

  it("internalizes signed or tokenized final media URLs before canonical evidence is created", async () => {
    const finalReview = {
      status: "passed" as const,
      summary: "Final media satisfies the objective.",
      checkedAt: "2026-04-26T00:03:00.000Z",
      actualDurationSeconds: 72,
      semanticScore: 0.91,
      semanticIssues: [],
    };
    const completed = await __autoTeamMediaCompletionTestHooks
      .finalizeCompletedMediaPipeline(
        makeRun(),
        makePipeline({
          status: "finalizing_evidence",
          finalReview,
          finalVideoUrl: "https://cdn.example.com/final.mp4?token=secret",
        }),
        finalReview,
      );

    expect(completed).toBe(true);
    expect(mocks.mockStoragePut).toHaveBeenCalled();
    expect(mocks.mockBuildCanonicalArtifactRef).toHaveBeenCalledWith(
      expect.objectContaining({
        storageRef: "auto-team-media/tenant-1/run-1/final-hash.mp4",
        externalRef: null,
      }),
    );
    expect(mocks.mockStopRun).toHaveBeenCalled();
    const postedContent = mocks.mockPostWorkUpdate.mock.calls
      .map(call => String(call[0]?.content ?? ""))
      .join("\n");
    expect(postedContent).not.toContain("token=secret");
  });

  it("does not mark unrelated final/export steps as media-completed", () => {
    const plan = makeCompletedPlan();
    plan.steps[0] = {
      ...plan.steps[0],
      stepKey: "export-summary",
      title: "Export final package",
      objective: "Export the completed work package",
      deliverable: "Final export bundle",
      surface: "work_os",
      selectedCapabilityId: "work_os",
      evidenceRefs: ["message:msg-1"],
    };

    const updated =
      __autoTeamMediaCompletionTestHooks.attachFinalMediaEvidenceToPlanArtifact({
        planArtifact: plan,
        evidenceRefs: ["artifact:artifact-final-1"],
        summary: "Final video passed.",
        semanticScore: 0.91,
      });

    expect(updated.steps[0].evidenceRefs).toEqual(["message:msg-1"]);
  });

  it("attaches final media evidence only to the best final composition step", () => {
    const plan = makeCompletedPlan();
    plan.steps = [
      {
        ...plan.steps[0],
        stepKey: "storyboard",
        title: "Storyboard keyframes",
        objective: "Generate storyboard images",
        deliverable: "storyboard images",
        surface: "media_studio",
        selectedCapabilityId: "media_studio:image",
        evidenceRefs: ["artifact:storyboard-1"],
      },
      {
        ...plan.steps[0],
        stepKey: "clip-generation",
        title: "Generate video clips",
        objective: "Generate storyboard video clips",
        deliverable: "video clips",
        surface: "media_studio",
        selectedCapabilityId: "media_studio:video",
        evidenceRefs: ["media-job:clip-job-1"],
      },
      {
        ...plan.steps[0],
        stepKey: "final-composition",
        title: "Final video composition",
        objective: "Compose clips into the final video",
        deliverable: "final video",
        surface: "video_editor",
        selectedCapabilityId: "video_editor:compose",
        evidenceRefs: ["message:composition-started"],
      },
    ];

    const updated =
      __autoTeamMediaCompletionTestHooks.attachFinalMediaEvidenceToPlanArtifact({
        planArtifact: plan,
        evidenceRefs: ["artifact:artifact-final-1"],
        summary: "Final video passed.",
        semanticScore: 0.91,
      });

    expect(updated.steps[0].evidenceRefs).toEqual(["artifact:storyboard-1"]);
    expect(updated.steps[1].evidenceRefs).toEqual(["media-job:clip-job-1"]);
    expect(updated.steps[2].evidenceRefs).toEqual(
      expect.arrayContaining(["artifact:artifact-final-1"]),
    );
  });

  it("dry-runs the full storyboard-to-video pipeline through final evidence completion", async () => {
    vi.useFakeTimers();
    const currentRun = {
      ...makeRun(),
      runtimeStateJson: {
        autoTeamMediaPipeline: makePipeline({
          status: "collecting_assets",
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          targetDurationSeconds: 60,
          expectedClipCount: 1,
          storyboardImages: [
            {
              url: "https://cdn.example.com/storyboard-1.png",
              prompt: "Storyboard frame",
              sourceSkillId: "image_prompt_engineer",
              createdAt: "2026-04-26T00:00:00.000Z",
            },
          ],
          imageTasks: [],
          clipTasks: [],
          renderJobId: null,
          probeJobId: null,
          probeResult: null,
          finalVideoUrl: null,
        }),
      },
    };
    const updateSets: Array<Record<string, any>> = [];
    try {
      mocks.mockDbSelect.mockImplementation(() => ({
        from: vi.fn(() => ({
          where: vi.fn(() => ({
            limit: vi.fn(async () => [currentRun]),
          })),
        })),
      }));
      mocks.mockDbUpdate.mockImplementation(() => ({
        set: vi.fn((values: Record<string, any>) => {
          updateSets.push(values);
          const pipeline = extractPipelineUpdate(values);
          if (pipeline) {
            currentRun.runtimeStateJson = {
              ...currentRun.runtimeStateJson,
              autoTeamMediaPipeline: pipeline,
            };
          }
          return { where: vi.fn(async () => []) };
        }),
      }));
      mocks.mockGenerateVideoAsync.mockResolvedValue({
        taskId: "video-task-1",
        status: "completed",
        resultUrl: "https://cdn.example.com/clip-1.mp4",
        resultData: {},
      });
      mocks.mockSubmitInternalMediaJob
        .mockResolvedValueOnce({ jobId: "compose-job-1" })
        .mockResolvedValueOnce({ jobId: "probe-job-1" });
      mocks.mockGetInternalMediaJobStatus.mockImplementation(async (jobId: string) => {
        if (jobId === "compose-job-1") {
          return {
            status: "done",
            resultUrl: "https://cdn.example.com/final.mp4?token=secret",
          };
        }
        if (jobId === "probe-job-1") {
          return {
            status: "done",
            result: {
              derived: { durationSeconds: 72 },
              streams: [
                {
                  codec_type: "video",
                  width: 1920,
                  height: 1080,
                  codec_name: "h264",
                },
              ],
            },
          };
        }
        return null;
      });

      await advanceAutoTeamMediaPipeline("run-1");
      expect(currentRun.runtimeStateJson.autoTeamMediaPipeline.status).toBe(
        "waiting_for_video_tasks",
      );
      expect(currentRun.runtimeStateJson.autoTeamMediaPipeline.clipTasks).toEqual([
        expect.objectContaining({
          taskId: "video-task-1",
          resultUrl: "https://cdn.example.com/clip-1.mp4",
        }),
      ]);

      await advanceAutoTeamMediaPipeline("run-1");
      expect(mocks.mockSubmitInternalMediaJob).toHaveBeenNthCalledWith(
        1,
        expect.objectContaining({
          requestId: "auto-team-final-compose:run-1",
        }),
      );
      expect(currentRun.runtimeStateJson.autoTeamMediaPipeline.status).toBe(
        "rendering_final_video",
      );

      await advanceAutoTeamMediaPipeline("run-1");
      expect(mocks.mockSubmitInternalMediaJob).toHaveBeenNthCalledWith(
        2,
        expect.objectContaining({
          requestId: "auto-team-final-probe:run-1",
        }),
      );
      expect(currentRun.runtimeStateJson.autoTeamMediaPipeline.status).toBe(
        "probing_final_video",
      );

      await advanceAutoTeamMediaPipeline("run-1");

      expect(mocks.mockStoragePut).toHaveBeenCalled();
      expect(mocks.mockBuildCanonicalArtifactRef).toHaveBeenCalledWith(
        expect.objectContaining({
          artifactType: "final_result",
          artifactRole: "result",
          externalRef: null,
          safetyStatus: "safe",
        }),
      );
      expect(mocks.mockValidateFinalApprovalEvidenceForRun).toHaveBeenCalled();
      expect(mocks.mockStopRun).toHaveBeenCalledWith(
        "run-1",
        "plan_completed",
        "tenant-1",
      );
      const postedContent = mocks.mockPostWorkUpdate.mock.calls
        .map(call => String(call[0]?.content ?? ""))
        .join("\n");
      expect(postedContent).toContain("Starting final video composition now");
      expect(postedContent).toContain(
        "Final media review passed. Saving canonical evidence",
      );
      expect(postedContent).not.toContain("token=secret");
      expect(updateSets.length).toBeGreaterThanOrEqual(4);
    } finally {
      vi.clearAllTimers();
      vi.useRealTimers();
    }
  });
});

function extractPipelineUpdate(values: Record<string, any>): any | null {
  const direct = values.runtimeStateJson?.autoTeamMediaPipeline;
  if (direct) return direct;
  const chunks = values.runtimeStateJson?.queryChunks;
  if (!Array.isArray(chunks)) return null;
  for (const chunk of chunks) {
    if (typeof chunk !== "string") continue;
    try {
      const parsed = JSON.parse(chunk);
      if (parsed && typeof parsed === "object" && "status" in parsed) {
        return parsed;
      }
    } catch {
      // Ignore non-JSON SQL parameters.
    }
  }
  return null;
}
