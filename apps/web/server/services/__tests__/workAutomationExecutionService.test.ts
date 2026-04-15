import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getWorkCaseProjection: vi.fn(),
  getAutomationRunProjection: vi.fn(),
  recordAutomationRunStepProgress: vi.fn(),
  recordAutomationCheckpoint: vi.fn(),
  resolveAutomationLaunchPolicy: vi.fn(),
  resolveAutomationStepRoute: vi.fn(),
  getSkillByIdAsync: vi.fn(),
  executeSkill: vi.fn(),
  agencyExecuteRun: vi.fn(),
  executeAutomationCopilotTask: vi.fn(),
  claimBrowserAutomationTask: vi.fn(),
  getBrowserAutomationTaskClaimByTaskId: vi.fn(),
  updateBrowserAutomationTaskClaim: vi.fn(),
  createLibraryItem: vi.fn(),
  createPresentationDeckForLibraryItem: vi.fn(),
  generateImage: vi.fn(),
  generateVideo: vi.fn(),
}));

vi.mock("../workOsService", () => ({
  getWorkCaseProjection: mocks.getWorkCaseProjection,
}));

vi.mock("../workAutomationFabricService", () => ({
  getAutomationRunProjection: mocks.getAutomationRunProjection,
  recordAutomationRunStepProgress: mocks.recordAutomationRunStepProgress,
  recordAutomationCheckpoint: mocks.recordAutomationCheckpoint,
}));

vi.mock("../workAutomationPolicyService", () => ({
  resolveAutomationLaunchPolicy: mocks.resolveAutomationLaunchPolicy,
  resolveAutomationStepRoute: mocks.resolveAutomationStepRoute,
}));

vi.mock("../skillRegistry", () => ({
  getSkillByIdAsync: mocks.getSkillByIdAsync,
}));

vi.mock("../skillExecutor", () => ({
  executeSkill: mocks.executeSkill,
}));

vi.mock("../agencyBridge", () => ({
  agencyBridge: {
    executeRun: mocks.agencyExecuteRun,
  },
}));

vi.mock("../automationCopilotExecutionService", () => ({
  executeAutomationCopilotTask: mocks.executeAutomationCopilotTask,
}));

vi.mock("../workAutomationBrowserTaskService", () => ({
  claimBrowserAutomationTask: mocks.claimBrowserAutomationTask,
  getBrowserAutomationTaskClaimByTaskId: mocks.getBrowserAutomationTaskClaimByTaskId,
  updateBrowserAutomationTaskClaim: mocks.updateBrowserAutomationTaskClaim,
  isBrowserAutomationClaimTerminal: (status: string) => status === "completed" || status === "failed" || status === "cancelled",
}));

vi.mock("../libraryService", () => ({
  createLibraryItem: mocks.createLibraryItem,
}));

vi.mock("../presentationService", () => ({
  createPresentationDeckForLibraryItem: mocks.createPresentationDeckForLibraryItem,
}));

vi.mock("../mediaGenerationService", () => ({
  mediaGenerationService: {
    generateImage: mocks.generateImage,
    generateVideo: mocks.generateVideo,
  },
}));

import { executeAutomationStep } from "../workAutomationExecutionService";

function makePolicy(surface: "browser" | "skill" | "agency" | "document_management" | "media_studio" | "video_editor" | "manual" | "work_os") {
  return {
    templateKey: "content-production",
    templateFamily: "content-production",
    templateVersion: "content-production.v1",
    templateSource: "case_intake",
    templateTitle: "Content Production Fabric",
    modeResolution: {
      requestedMode: "semi_auto",
      effectiveMode: "semi_auto",
      recommendedMode: "semi_auto",
      downgraded: false,
      reasonCode: "safe_default",
      reason: "Resolved semi_auto from case_intake signals",
      confidence: 0.9,
    },
    stepBlueprints: [],
    approvalGateStepKeys: [],
    surfaceAllowlist: ["manual", "work_os", "skill", "agency", "document_management", "media_studio", "video_editor"],
    policyJson: { templateKey: "content-production" },
  };
}

function makeRoute(surface: "browser" | "skill" | "agency" | "document_management" | "media_studio" | "video_editor" | "manual" | "work_os") {
  return {
    stepKey: "brief",
    surface,
    allowedSurfaces: [surface],
    requiresApproval: surface === "manual" || surface === "work_os",
    checkpointKey: surface === "manual" ? "manual-review" : surface === "work_os" ? "final-export" : null,
    riskTier: "medium",
    evidenceType: "draft",
    sideEffectClass: "bounded_write",
  } as any;
}

function makeProjection() {
  return {
    request: {
      id: "req-1",
      objective: "Create launch assets",
      title: "Launch assets",
      sourceType: "chat",
      workType: "content",
      businessDomain: "marketing",
      urgency: "normal",
      riskLevel: "medium",
      classificationConfidence: 0.94,
    },
    case: {
      id: "case-1",
      title: "Launch assets",
      summary: "Research, draft, storyboard, media, and video for the launch",
      riskLevel: "medium",
      automationMode: "semi_auto",
      currentState: "running",
    },
  };
}

function makeRunProjection(overrides: Record<string, unknown> = {}) {
  return {
    run: {
      id: "run-1",
      tenantId: "tenant-1",
      caseId: "case-1",
      requestId: "req-1",
      taskId: null,
      templateKey: "content-production",
      templateVersion: "content-production.v1",
      templateFamily: "content-production",
      templateSource: "case_intake",
      title: "Launch assets",
      objective: "Create launch assets",
      currentMode: "semi_auto",
      status: "running",
      currentStepId: null,
      currentCheckpointId: null,
      finalDisposition: null,
      finalDispositionReason: null,
      resumeCursor: null,
      policyJson: {},
      resolvedAt: new Date("2026-04-10T00:00:00.000Z"),
      createdByUserId: 42,
      createdByAssistantId: null,
      startedAt: null,
      completedAt: null,
      createdAt: new Date("2026-04-10T00:00:00.000Z"),
      updatedAt: new Date("2026-04-10T00:00:00.000Z"),
      ...overrides,
    },
    steps: [],
    checkpoints: [],
    events: [],
  };
}

function makeRecordResult(stepStatus: string, adapterDetail: Record<string, unknown> = {}) {
  return {
    run: {
      id: "run-1",
      tenantId: "tenant-1",
      caseId: "case-1",
      requestId: "req-1",
      taskId: null,
      templateKey: "content-production",
      templateVersion: "content-production.v1",
      templateFamily: "content-production",
      templateSource: "case_intake",
      title: "Launch assets",
      objective: "Create launch assets",
      currentMode: "semi_auto",
      status: stepStatus === "failed" ? "failed" : "running",
      currentStepId: "step-1",
      currentCheckpointId: null,
      finalDisposition: null,
      finalDispositionReason: null,
      resumeCursor: null,
      policyJson: {},
      resolvedAt: new Date("2026-04-10T00:00:00.000Z"),
      createdByUserId: 42,
      createdByAssistantId: null,
      startedAt: new Date("2026-04-10T00:00:00.000Z"),
      completedAt: null,
      createdAt: new Date("2026-04-10T00:00:00.000Z"),
      updatedAt: new Date("2026-04-10T00:00:00.000Z"),
    },
    step: {
      id: "step-1",
      tenantId: "tenant-1",
      requestId: "req-1",
      caseId: "case-1",
      runId: "run-1",
      stepKey: "brief",
      stepIndex: 0,
      title: "Brief synthesis",
      status: stepStatus,
      riskTier: "medium",
      surface: "skill",
      inputRefsJson: [],
      outputRefsJson: ["library-item:101"],
      retryCount: 0,
      idempotencyKey: null,
      summary: "ok",
      detailJson: adapterDetail,
      actorUserId: 42,
      actorAssistantId: null,
      startedAt: new Date("2026-04-10T00:00:00.000Z"),
      completedAt: new Date("2026-04-10T00:00:00.000Z"),
      createdAt: new Date("2026-04-10T00:00:00.000Z"),
      updatedAt: new Date("2026-04-10T00:00:00.000Z"),
    },
  };
}

describe("workAutomationExecutionService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getWorkCaseProjection.mockResolvedValue(makeProjection());
    mocks.getAutomationRunProjection.mockResolvedValue(makeRunProjection());
    mocks.resolveAutomationLaunchPolicy.mockReturnValue(makePolicy("skill"));
    mocks.resolveAutomationStepRoute.mockReturnValue(makeRoute("skill"));
    mocks.getSkillByIdAsync.mockResolvedValue({
      id: "general-article-writer",
      executionMode: "llm-only",
      type: "text",
    } as any);
    mocks.executeSkill.mockResolvedValue({
      success: true,
      skillId: "general-article-writer",
      type: "text",
      message: "brief draft",
      creditsUsed: 5,
    } as any);
    mocks.agencyExecuteRun.mockResolvedValue({
      runId: "agency-run-1",
      status: "completed",
      response: "research summary",
      creditsUsed: 3,
      durationMs: 1000,
      stepAttemptSnapshots: [],
      structuredResult: null,
      previewArtifacts: [],
      hybridSummary: null,
    });
    mocks.createLibraryItem.mockResolvedValue({
      item: { id: 101 },
      idempotent: false,
    });
    mocks.createPresentationDeckForLibraryItem.mockResolvedValue({
      deck: { id: 201 },
      slides: [],
      assets: [],
    });
    mocks.generateImage.mockResolvedValue({
      success: true,
      data: [{ id: "media-1", url: "https://example.com/image.png" }],
      creditsUsed: 1,
      creditsBalance: 99,
      model: "image-model",
    });
    mocks.generateVideo.mockResolvedValue({
      success: true,
      data: [{ id: "video-1", url: "https://example.com/video.mp4" }],
      creditsUsed: 2,
      creditsBalance: 98,
      model: "video-model",
    });
    mocks.executeAutomationCopilotTask.mockResolvedValue({
      ok: true,
      taskId: "browser-task-1",
      executionId: "run-1:research:browser",
      reservationId: "reservation-1",
    });
    mocks.getBrowserAutomationTaskClaimByTaskId.mockResolvedValue(null);
    mocks.claimBrowserAutomationTask.mockResolvedValue({
      claim: {
        id: "claim-1",
        tenantId: "tenant-1",
        requestId: null,
        caseId: "case-1",
        runId: "run-1",
        stepId: null,
        stepKey: "research",
        stepIndex: 0,
        title: "Research",
        idempotencyKey: null,
        claimToken: "claim-token-1",
        status: "claimed",
        taskId: "run-1:research",
        executionId: "run-1:research:browser",
        reservationId: null,
        inputRefsJson: [],
        outputRefsJson: [],
        detailJson: {},
        errorMessage: null,
        claimedAt: new Date("2026-04-10T00:00:00.000Z"),
        dispatchedAt: null,
        lastPolledAt: null,
        nextPollAt: null,
        completedAt: null,
        pollCount: 0,
        createdByUserId: 42,
        createdByAssistantId: null,
        createdAt: new Date("2026-04-10T00:00:00.000Z"),
        updatedAt: new Date("2026-04-10T00:00:00.000Z"),
      },
      created: true,
    });
    mocks.updateBrowserAutomationTaskClaim.mockResolvedValue({
      id: "claim-1",
      tenantId: "tenant-1",
      requestId: null,
      caseId: "case-1",
      runId: "run-1",
      stepId: "step-1",
      stepKey: "research",
      stepIndex: 0,
      title: "Research",
      idempotencyKey: null,
      claimToken: "claim-token-1",
      status: "queued",
      taskId: "browser-task-1",
      executionId: "run-1:research:browser",
      reservationId: "reservation-1",
      inputRefsJson: [],
      outputRefsJson: [],
      detailJson: {},
      errorMessage: null,
      claimedAt: new Date("2026-04-10T00:00:00.000Z"),
      dispatchedAt: null,
      lastPolledAt: null,
      nextPollAt: null,
      completedAt: null,
      pollCount: 0,
      createdByUserId: 42,
      createdByAssistantId: null,
      createdAt: new Date("2026-04-10T00:00:00.000Z"),
      updatedAt: new Date("2026-04-10T00:00:00.000Z"),
    });
    mocks.recordAutomationCheckpoint.mockResolvedValue({
      run: makeRunProjection().run,
      checkpoint: {
        id: "checkpoint-1",
        tenantId: "tenant-1",
        requestId: "req-1",
        caseId: "case-1",
        runId: "run-1",
        stepId: "step-1",
        stepKey: "brief",
        checkpointKey: "brief-approval",
        resumeCursor: "run-1:brief",
        approvalState: "approved",
        checkpointStatus: "approved",
        editSnapshotRefsJson: [],
        snapshotJson: {},
        detailJson: {},
        requestedByUserId: 42,
        approvedByUserId: 42,
        actorAssistantId: null,
        requestedAt: new Date("2026-04-10T00:00:00.000Z"),
        approvedAt: new Date("2026-04-10T00:00:00.000Z"),
        resumedAt: null,
        createdAt: new Date("2026-04-10T00:00:00.000Z"),
        updatedAt: new Date("2026-04-10T00:00:00.000Z"),
      } as any,
    });
    mocks.recordAutomationRunStepProgress.mockImplementation(async (payload: any) => {
      const status = payload.status === "failed"
        ? "failed"
        : payload.status === "awaiting_approval"
          ? "awaiting_approval"
          : payload.status === "running"
            ? "running"
            : "succeeded";
      return makeRecordResult(status, payload.detailJson ?? {});
    });
  });

  it("executes a skill step and records a library-backed artifact", async () => {
    const result = await executeAutomationStep({
      tenantId: "tenant-1",
      caseId: "case-1",
      runId: "run-1",
      stepKey: "brief",
      stepIndex: 1,
      title: "Brief synthesis",
      prompt: "Summarize the launch plan",
      skillId: "general-article-writer",
      userToken: "user-token",
      actorUserId: 42,
    });

    expect(mocks.executeSkill).toHaveBeenCalled();
    expect(mocks.createLibraryItem).toHaveBeenCalledWith(expect.objectContaining({
      itemType: "document",
      source: "work_automation_skill",
      title: "Brief synthesis",
    }), expect.objectContaining({ userId: 42, tenantId: "tenant-1" }));
    expect(mocks.recordAutomationRunStepProgress).toHaveBeenCalledWith(expect.objectContaining({
      stepKey: "brief",
      surface: "skill",
      outputRefsJson: expect.arrayContaining(["library-item:101", "skill:general-article-writer"]),
    }));
    expect(result).toEqual(expect.objectContaining({
      adapterKind: "skill",
      skillId: "general-article-writer",
      libraryItemId: 101,
    }));
  });

  it("executes an agency step with the provided agency target", async () => {
    mocks.resolveAutomationStepRoute.mockReturnValue(makeRoute("agency"));

    const result = await executeAutomationStep({
      tenantId: "tenant-1",
      caseId: "case-1",
      runId: "run-1",
      stepKey: "research",
      stepIndex: 0,
      title: "Research",
      prompt: "Research launch competitors",
      agencyId: "agency-1",
      userToken: "user-token",
      actorUserId: 42,
    });

    expect(mocks.agencyExecuteRun).toHaveBeenCalledWith(expect.objectContaining({
      agencyId: "agency-1",
      conversationId: "run-1:research",
      userToken: "user-token",
      tenantId: "tenant-1",
      userId: 42,
    }));
    expect(mocks.createLibraryItem).toHaveBeenCalledWith(expect.objectContaining({
      source: "work_automation_agency",
    }), expect.objectContaining({ userId: 42, tenantId: "tenant-1" }));
    expect(result).toEqual(expect.objectContaining({
      adapterKind: "agency",
      agencyRunId: "agency-run-1",
      libraryItemId: 101,
    }));
  });

  it("creates storyboard document and presentation deck outputs", async () => {
    mocks.resolveAutomationStepRoute.mockReturnValue(makeRoute("document_management"));

    const result = await executeAutomationStep({
      tenantId: "tenant-1",
      caseId: "case-1",
      runId: "run-1",
      stepKey: "storyboard",
      stepIndex: 3,
      title: "Storyboard",
      prompt: "Create a six-frame storyboard",
      userToken: "user-token",
      actorUserId: 42,
      libraryItemType: "presentation",
    });

    expect(mocks.createLibraryItem).toHaveBeenCalledWith(expect.objectContaining({
      itemType: "presentation",
      source: "work_automation",
    }), expect.objectContaining({ userId: 42, tenantId: "tenant-1" }));
    expect(mocks.createPresentationDeckForLibraryItem).toHaveBeenCalledWith(expect.objectContaining({
      libraryItemId: 101,
      title: "Storyboard",
    }), expect.objectContaining({ userId: 42, tenantId: "tenant-1" }));
    expect(result).toEqual(expect.objectContaining({
      adapterKind: "document",
      deckId: 201,
      libraryItemId: 101,
    }));
  });

  it("executes media and video steps through the media generation service", async () => {
    mocks.resolveAutomationStepRoute.mockReturnValue(makeRoute("media_studio"));

    const imageResult = await executeAutomationStep({
      tenantId: "tenant-1",
      caseId: "case-1",
      runId: "run-1",
      stepKey: "media",
      stepIndex: 4,
      title: "Generate media",
      prompt: "Create a hero image",
      mediaModel: "image-model",
      size: "1024x1024",
      userToken: "user-token",
      actorUserId: 42,
    });

    expect(mocks.generateImage).toHaveBeenCalledWith(expect.objectContaining({
      prompt: "Create a hero image",
      model: "image-model",
      size: "1024x1024",
      publicUrl: undefined,
    }), "user-token");
    expect(imageResult).toEqual(expect.objectContaining({
      adapterKind: "media",
      libraryItemId: 101,
    }));

    mocks.resolveAutomationStepRoute.mockReturnValue(makeRoute("video_editor"));
    const videoResult = await executeAutomationStep({
      tenantId: "tenant-1",
      caseId: "case-1",
      runId: "run-1",
      stepKey: "video",
      stepIndex: 5,
      title: "Generate video",
      prompt: "Create a launch video",
      videoModel: "video-model",
      duration: 10,
      userToken: "user-token",
      actorUserId: 42,
    });

    expect(mocks.generateVideo).toHaveBeenCalledWith(expect.objectContaining({
      prompt: "Create a launch video",
      model: "video-model",
      duration: 10,
    }), "user-token");
    expect(videoResult).toEqual(expect.objectContaining({
      adapterKind: "video",
      libraryItemId: 101,
    }));
  });

  it("creates a checkpoint and pauses when approval is required", async () => {
    mocks.resolveAutomationStepRoute.mockReturnValue(makeRoute("manual"));

    const result = await executeAutomationStep({
      tenantId: "tenant-1",
      caseId: "case-1",
      runId: "run-1",
      stepKey: "review",
      stepIndex: 6,
      title: "Review",
      prompt: "Review the draft",
      userToken: "user-token",
      actorUserId: 42,
    });

    expect(mocks.recordAutomationCheckpoint).toHaveBeenCalled();
    expect(mocks.executeSkill).not.toHaveBeenCalled();
    expect(result.adapterKind).toBe("manual");
    expect(result.checkpoint?.id).toBe("checkpoint-1");
  });

  it("queues browser automation through the copilot adapter when allowed", async () => {
    mocks.resolveAutomationStepRoute.mockReturnValue(makeRoute("browser"));

    const result = await executeAutomationStep({
      tenantId: "tenant-1",
      caseId: "case-1",
      runId: "run-1",
      stepKey: "research",
      stepIndex: 0,
      title: "Research",
      prompt: "Research launch competitors",
      userToken: "user-token",
      actorUserId: 42,
    });

    expect(mocks.executeAutomationCopilotTask).toHaveBeenCalledWith(expect.objectContaining({
      tenantId: "tenant-1",
      userId: 42,
      taskId: "run-1:research",
      executionId: "run-1:research:browser",
    }));
    expect(mocks.claimBrowserAutomationTask).toHaveBeenCalledWith(expect.objectContaining({
      tenantId: "tenant-1",
      caseId: "case-1",
      runId: "run-1",
      stepKey: "research",
      taskId: "run-1:research",
    }));
    expect(mocks.updateBrowserAutomationTaskClaim).toHaveBeenCalledWith(expect.objectContaining({
      tenantId: "tenant-1",
      claimId: "claim-1",
      status: "queued",
      stepId: "step-1",
    }));
    expect(mocks.recordAutomationRunStepProgress).toHaveBeenCalledWith(expect.objectContaining({
      stepKey: "research",
      surface: "browser",
      status: "running",
      outputRefsJson: expect.arrayContaining([
        "browser-task:browser-task-1",
        "browser-execution:run-1:research:browser",
        "browser-reservation:reservation-1",
      ]),
    }));
    expect(result).toEqual(expect.objectContaining({
      adapterKind: "browser",
      outputRefsJson: expect.arrayContaining(["browser-task:browser-task-1"]),
    }));
  });

  it("replays an idempotent step without dispatching the adapter again", async () => {
    const firstResult = await executeAutomationStep({
      tenantId: "tenant-1",
      caseId: "case-1",
      runId: "run-1",
      stepKey: "brief",
      stepIndex: 1,
      title: "Brief synthesis",
      prompt: "Summarize the launch plan",
      skillId: "general-article-writer",
      idempotencyKey: "idem-1",
      userToken: "user-token",
      actorUserId: 42,
    });

    const secondResult = await executeAutomationStep({
      tenantId: "tenant-1",
      caseId: "case-1",
      runId: "run-1",
      stepKey: "brief",
      stepIndex: 1,
      title: "Brief synthesis",
      prompt: "Summarize the launch plan",
      skillId: "general-article-writer",
      idempotencyKey: "idem-1",
      userToken: "user-token",
      actorUserId: 42,
    });

    expect(mocks.executeSkill).toHaveBeenCalledTimes(1);
    expect(secondResult).toEqual(firstResult);
  });

  it("rejects auth-sensitive adapters when the user token is missing", async () => {
    await expect(executeAutomationStep({
      tenantId: "tenant-1",
      caseId: "case-1",
      runId: "run-1",
      stepKey: "brief",
      stepIndex: 1,
      title: "Brief synthesis",
      prompt: "Summarize the launch plan",
      skillId: "general-article-writer",
      userToken: "   ",
      actorUserId: 42,
    })).rejects.toThrow("requires a user token");
  });

  it("keeps idempotent replays isolated by step key", async () => {
    mocks.resolveAutomationStepRoute.mockImplementation(({ stepKey }) => makeRoute(stepKey === "draft" ? "skill" : "skill"));

    await executeAutomationStep({
      tenantId: "tenant-1",
      caseId: "case-1",
      runId: "run-1",
      stepKey: "brief",
      stepIndex: 1,
      title: "Brief synthesis",
      prompt: "Summarize the launch plan",
      skillId: "general-article-writer",
      idempotencyKey: "idem-shared",
      userToken: "user-token",
      actorUserId: 42,
    });

    await executeAutomationStep({
      tenantId: "tenant-1",
      caseId: "case-1",
      runId: "run-1",
      stepKey: "draft",
      stepIndex: 2,
      title: "Draft synthesis",
      prompt: "Draft the launch plan",
      skillId: "general-article-writer",
      idempotencyKey: "idem-shared",
      userToken: "user-token",
      actorUserId: 42,
    });

    expect(mocks.executeSkill).toHaveBeenCalledTimes(2);
  });
});
