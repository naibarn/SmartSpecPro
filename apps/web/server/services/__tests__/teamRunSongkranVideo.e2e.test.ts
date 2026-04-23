import { beforeEach, describe, expect, it, vi } from "vitest";
import { VideoGenerationExecutor } from "../executors/videoExecutor";
import { evaluateCompletionEvidence, createFinalResult } from "../autoTeamCompletionEvidence";
import { buildAutoTeamLedgerReadModel } from "../autoTeamLedgerService";

const mockGetDb = vi.hoisted(() => vi.fn());

vi.mock("../../db", () => ({
  getDb: mockGetDb,
}));

vi.mock("../mediaGenerationService", () => ({
  mediaGenerationService: {
    generateVideoAsync: vi.fn(),
  },
  DEFAULT_MODELS: {
    video: "veo-3-1",
  },
}));

import { mediaGenerationService } from "../mediaGenerationService";

const mockGenerateVideo = vi.mocked(mediaGenerationService.generateVideoAsync);

function makeDb() {
  const inserted: any[] = [];
  const db: any = {
    select: vi.fn(() => ({
      from: vi.fn(() => ({
        where: vi.fn(() => ({
          limit: vi.fn(async () => []),
        })),
      })),
    })),
    insert: vi.fn(() => ({
      values: vi.fn((payload: any) => ({
        returning: vi.fn(async () => {
          const row = {
            id: `final-${inserted.length + 1}`,
            createdAt: new Date("2026-04-17T12:10:00.000Z"),
            updatedAt: new Date("2026-04-17T12:10:00.000Z"),
            ...payload,
          };
          inserted.push(row);
          return [row];
        }),
      })),
    })),
    _inserted: inserted,
  };
  return db;
}

beforeEach(() => {
  vi.clearAllMocks();
  mockGenerateVideo.mockResolvedValue({
    id: "job-1",
    taskId: "provider-task-1",
    userId: "1",
    mediaType: "video",
    status: "pending",
    model: "veo-3-1",
    prompt: "Create a 24-30 second Songkran video using Veo 3.1",
    createdAt: "2026-04-17T12:00:00.000Z",
  } as any);
});

describe("teamRunSongkranVideo e2e", () => {
  it("routes Songkran video work to media generation, then reviews and finalizes it", async () => {
    const executor = new VideoGenerationExecutor();
    const execution = await executor.execute({
      messages: [
        { role: "system", content: "You are a video generator" },
        { role: "user", content: "Create a 24-30 second Songkran video using Veo 3.1." },
      ],
      executionPolicy: {},
      skill: {
        id: "songkran-video-skill",
        name: "Songkran Video Creator",
        category: "video_generation",
        executionMode: "media-generate",
        systemPrompt: "Create cinematic Songkran video prompts",
      } as any,
      skillSlug: "songkran-video-creator",
      userId: 42,
      channel: "team_room",
      dynamicParams: {
        model: "veo-3-1",
        duration: 28,
        aspectRatio: "16:9",
        fps: 24,
        resolution: "1080p",
      },
    } as any);

    expect(execution.success).toBe(true);
    expect(execution.mediaJob?.mediaType).toBe("video");
    expect(execution.mediaJob?.jobPayload).toMatchObject({
      prompt: "Create a 24-30 second Songkran video using Veo 3.1",
    });
    expect(mockGenerateVideo).toHaveBeenCalledWith(
      expect.objectContaining({
        duration: 28,
        aspectRatio: "16:9",
        fps: 24,
        resolution: "1080p",
      }),
      expect.any(String),
    );

    const evidence = evaluateCompletionEvidence({
      tenantId: "tenant-1",
      teamId: "team-1",
      roomId: "room-1",
      runId: "run-1",
      routeDecision: {
        id: "route-1",
        routeClass: "media.video",
        language: "th",
      },
      artifactRefs: [
        {
          tenantId: "tenant-1",
          teamId: "team-1",
          roomId: "room-1",
          runId: "run-1",
          stageId: "stage-1",
          workItemId: "work-1",
          artifactType: "research_summary",
          artifactRole: "summary",
          storageRef: "research-summary-1",
          externalRef: null,
          contentHash: null,
          visibility: "tenant",
          retentionPolicyJson: null,
          safetyStatus: "safe",
          source: "test",
        },
        {
          tenantId: "tenant-1",
          teamId: "team-1",
          roomId: "room-1",
          runId: "run-1",
          stageId: "stage-2",
          workItemId: "work-1",
          artifactType: "storyboard",
          artifactRole: "evidence",
          storageRef: "storyboard-1",
          externalRef: null,
          contentHash: null,
          visibility: "tenant",
          retentionPolicyJson: null,
          safetyStatus: "safe",
          source: "test",
        },
        {
          tenantId: "tenant-1",
          teamId: "team-1",
          roomId: "room-1",
          runId: "run-1",
          stageId: "stage-3",
          workItemId: "work-1",
          artifactType: "media_prompt",
          artifactRole: "prompt",
          storageRef: "prompt-1",
          externalRef: null,
          contentHash: null,
          visibility: "tenant",
          retentionPolicyJson: null,
          safetyStatus: "safe",
          source: "test",
        },
        {
          tenantId: "tenant-1",
          teamId: "team-1",
          roomId: "room-1",
          runId: "run-1",
          stageId: "stage-4",
          workItemId: "work-1",
          artifactType: "media_result",
          artifactRole: "result",
          storageRef: "video-1",
          externalRef: null,
          contentHash: null,
          visibility: "tenant",
          retentionPolicyJson: null,
          safetyStatus: "safe",
          source: "test",
        },
      ],
      mediaJobRefs: [
        {
          id: "job-1",
          providerStatus: "succeeded",
          resultArtifactRefsJson: ["video-1"],
          stageId: "stage-4",
        },
      ],
      reviewRecords: [
        {
          id: "review-1",
          passed: true,
          reviewType: "final",
        },
      ],
      humanApprovalStatus: "approved",
      finalCandidateStageId: "stage-4",
    });

    expect(evidence.ok).toBe(true);
    expect(evidence.missingEvidence).toHaveLength(0);

    const db = makeDb();
    mockGetDb.mockResolvedValue(db);

    const finalResult = await createFinalResult({
      tenantId: "tenant-1",
      teamId: "team-1",
      roomId: "room-1",
      runId: "run-1",
      routeDecision: {
        id: "route-1",
        routeClass: "media.video",
        language: "th",
      },
      artifactRefs: [
        {
          tenantId: "tenant-1",
          teamId: "team-1",
          roomId: "room-1",
          runId: "run-1",
          stageId: "stage-1",
          workItemId: "work-1",
          artifactType: "research_summary",
          artifactRole: "summary",
          storageRef: "research-summary-1",
          externalRef: null,
          contentHash: null,
          visibility: "tenant",
          retentionPolicyJson: null,
          safetyStatus: "safe",
          source: "test",
        },
        {
          tenantId: "tenant-1",
          teamId: "team-1",
          roomId: "room-1",
          runId: "run-1",
          stageId: "stage-2",
          workItemId: "work-1",
          artifactType: "storyboard",
          artifactRole: "evidence",
          storageRef: "storyboard-1",
          externalRef: null,
          contentHash: null,
          visibility: "tenant",
          retentionPolicyJson: null,
          safetyStatus: "safe",
          source: "test",
        },
        {
          tenantId: "tenant-1",
          teamId: "team-1",
          roomId: "room-1",
          runId: "run-1",
          stageId: "stage-3",
          workItemId: "work-1",
          artifactType: "media_prompt",
          artifactRole: "prompt",
          storageRef: "prompt-1",
          externalRef: null,
          contentHash: null,
          visibility: "tenant",
          retentionPolicyJson: null,
          safetyStatus: "safe",
          source: "test",
        },
        {
          tenantId: "tenant-1",
          teamId: "team-1",
          roomId: "room-1",
          runId: "run-1",
          stageId: "stage-4",
          workItemId: "work-1",
          artifactType: "media_result",
          artifactRole: "result",
          storageRef: "video-1",
          externalRef: null,
          contentHash: null,
          visibility: "tenant",
          retentionPolicyJson: null,
          safetyStatus: "safe",
          source: "test",
        },
      ],
      mediaJobRefs: [
        {
          id: "job-1",
          providerStatus: "succeeded",
          resultArtifactRefsJson: ["video-1"],
          stageId: "stage-4",
        },
      ],
      reviewRecords: [
        {
          id: "review-1",
          passed: true,
          reviewType: "final",
        },
      ],
      humanApprovalStatus: "approved",
      summary: "Songkran video completed",
    });

    expect(finalResult.status).toBe("completed");
    expect(finalResult.mediaJobRefIdsJson).toEqual(["job-1"]);
    expect(finalResult.reviewRecordRefIdsJson).toEqual(["review-1"]);
    expect(db._inserted[0]).toEqual(
      expect.objectContaining({
        status: "completed",
        summary: "Songkran video completed",
      }),
    );

    const ledger = buildAutoTeamLedgerReadModel({
      snapshot: {
        tenantId: "tenant-1",
        room: {
          id: "room-1",
          tenantId: "tenant-1",
          teamId: "team-1",
          roomType: "auto_team",
          goalPrompt:
            "Create a 24-30 second Songkran video using Veo 3.1.",
          createdAt: new Date("2026-04-17T12:00:00.000Z"),
        },
        team: {
          id: "team-1",
          tenantId: "tenant-1",
          name: "Creative Content",
        },
        request: null,
        workCase: null,
        run: {
          id: "run-1",
          tenantId: "tenant-1",
          roomId: "room-1",
          teamId: "team-1",
          initiatedByUserId: 42,
          status: "completed",
          stopReason: null,
          endedAt: new Date("2026-04-17T12:10:00.000Z"),
        },
        execution: {
          routeDecision: {
            id: "route-1",
            routeClass: "media.video",
            language: "th",
          },
          executionMode: "enforced",
          frozenAt: null,
          rolloutFlags: {},
          canonicalSnapshot: {
            tenantId: "tenant-1",
            teamId: "team-1",
            roomId: "room-1",
            runId: "run-1",
            routeDecision: {
              id: "route-1",
              routeClass: "media.video",
              language: "th",
            },
            currentStage: {
              id: "stage-4",
              planStepKey: "media-production",
              stageType: "media_generation",
              status: "completed",
            },
            stages: [
              {
                id: "stage-1",
                tenantId: "tenant-1",
                teamId: "team-1",
                roomId: "room-1",
                runId: "run-1",
                routeDecisionId: "route-1",
                workItemId: "work-1",
                planStepKey: "research",
                stageType: "research",
                status: "completed",
                assignedPersonaId: "researcher",
                expectedCapabilityFamily: "research.synthesis",
                selectedSkillId: "songkran-research",
                selectedProvider: "openai",
                inputArtifactRefsJson: [],
                outputArtifactRefsJson: ["research-summary-1"],
                jobRefIdsJson: [],
                attempt: 1,
                maxAttempts: 3,
                startedAt: new Date("2026-04-17T12:00:00.000Z"),
                completedAt: new Date("2026-04-17T12:02:00.000Z"),
                blockedReason: null,
                errorCode: null,
                errorMessage: null,
                metadataJson: {
                  selectedModel: "gpt-5",
                  promptRefs: ["prompt:research"],
                  contextRefs: ["ctx:songkran-history"],
                  toolRefs: [],
                  rawOutputRefs: ["raw:research"],
                },
                createdAt: new Date("2026-04-17T12:00:00.000Z"),
              },
              {
                id: "stage-2",
                tenantId: "tenant-1",
                teamId: "team-1",
                roomId: "room-1",
                runId: "run-1",
                routeDecisionId: "route-1",
                workItemId: "work-1",
                planStepKey: "storyboard",
                stageType: "storyboard",
                status: "completed",
                assignedPersonaId: "creative-director",
                expectedCapabilityFamily: "creative.storyboard",
                selectedSkillId: "video-storyboard-to-prompts",
                selectedProvider: "openai",
                inputArtifactRefsJson: ["research-summary-1"],
                outputArtifactRefsJson: ["storyboard-1"],
                jobRefIdsJson: [],
                attempt: 1,
                maxAttempts: 3,
                startedAt: new Date("2026-04-17T12:02:00.000Z"),
                completedAt: new Date("2026-04-17T12:04:00.000Z"),
                blockedReason: null,
                errorCode: null,
                errorMessage: null,
                metadataJson: {
                  selectedModel: "gpt-5",
                  promptRefs: ["prompt:storyboard"],
                  contextRefs: ["ctx:research-summary-1"],
                  toolRefs: [],
                  rawOutputRefs: ["raw:storyboard"],
                },
                createdAt: new Date("2026-04-17T12:02:00.000Z"),
              },
              {
                id: "stage-3",
                tenantId: "tenant-1",
                teamId: "team-1",
                roomId: "room-1",
                runId: "run-1",
                routeDecisionId: "route-1",
                workItemId: "work-1",
                planStepKey: "media-prompt",
                stageType: "media_prompt",
                status: "completed",
                assignedPersonaId: "prompt-producer",
                expectedCapabilityFamily: "media.prompting",
                selectedSkillId: "cinematic-video-createprompt",
                selectedProvider: "openai",
                inputArtifactRefsJson: ["storyboard-1"],
                outputArtifactRefsJson: ["prompt-1"],
                jobRefIdsJson: [],
                attempt: 1,
                maxAttempts: 3,
                startedAt: new Date("2026-04-17T12:04:00.000Z"),
                completedAt: new Date("2026-04-17T12:06:00.000Z"),
                blockedReason: null,
                errorCode: null,
                errorMessage: null,
                metadataJson: {
                  selectedModel: "gpt-5",
                  promptRefs: ["prompt:media"],
                  contextRefs: ["ctx:storyboard-1"],
                  toolRefs: [],
                  rawOutputRefs: ["raw:media-prompt"],
                },
                createdAt: new Date("2026-04-17T12:04:00.000Z"),
              },
              {
                id: "stage-4",
                tenantId: "tenant-1",
                teamId: "team-1",
                roomId: "room-1",
                runId: "run-1",
                routeDecisionId: "route-1",
                workItemId: "work-1",
                planStepKey: "media-production",
                stageType: "media_generation",
                status: "completed",
                assignedPersonaId: "video-producer",
                expectedCapabilityFamily: "media.video",
                selectedSkillId: "songkran-video-skill",
                selectedProvider: "mediaGenerationService",
                inputArtifactRefsJson: ["prompt-1"],
                outputArtifactRefsJson: ["video-1"],
                jobRefIdsJson: ["job-1"],
                attempt: 1,
                maxAttempts: 3,
                startedAt: new Date("2026-04-17T12:06:00.000Z"),
                completedAt: new Date("2026-04-17T12:10:00.000Z"),
                blockedReason: null,
                errorCode: null,
                errorMessage: null,
                metadataJson: {
                  selectedModel: "veo-3-1",
                  promptRefs: ["prompt-1"],
                  contextRefs: ["ctx:media-prompt"],
                  toolRefs: ["mediaGenerationService.generateVideoAsync"],
                  rawOutputRefs: ["media-job:job-1"],
                },
                createdAt: new Date("2026-04-17T12:06:00.000Z"),
              },
            ],
            mediaJobs: [
              {
                id: "job-1",
                stageId: "stage-4",
                model: "veo-3-1",
                providerStatus: "succeeded",
                resultArtifactRefsJson: ["video-1"],
              },
            ],
            reviews: [
              {
                id: "review-1",
                tenantId: "tenant-1",
                teamId: "team-1",
                roomId: "room-1",
                runId: "run-1",
                stageId: "stage-4",
                workItemId: "work-1",
                reviewerPersonaId: "content-director",
                reviewType: "final",
                score: 0.94,
                passThreshold: 0.75,
                passed: true,
                reviewedArtifactRefsJson: ["video-1"],
                reviewedJobRefIdsJson: ["job-1"],
                comments:
                  "Approved: video result satisfies Songkran objective and duration.",
                repairInstructions: null,
                idempotencyKey: "review-1",
                createdAt: new Date("2026-04-17T12:10:00.000Z"),
              },
            ],
            finalResult,
            traceEvents: [],
            updatedAt: "2026-04-17T12:10:00.000Z",
            latestMonitoringSnapshot: {
              artifactCountJson: {
                planArtifact: {
                  version: 1,
                  runId: "run-1",
                  roomId: "room-1",
                  teamId: "team-1",
                  caseId: null,
                  requestId: null,
                  objective:
                    "Create a 24-30 second Songkran video using Veo 3.1.",
                  source: "team_run",
                  status: "completed",
                  generatedAt: "2026-04-17T12:00:00.000Z",
                  lastUpdatedAt: "2026-04-17T12:10:00.000Z",
                  steps: [
                    {
                      stepKey: "research",
                      title: "Research Songkran context",
                      objective: "Collect key Songkran context and constraints.",
                      ownerPersona: "Trend Researcher",
                      ownerMemberId: "researcher",
                      reviewerPersona: "Content Director",
                      reviewerMemberId: "content-director",
                      verificationMethod: "source and relevance review",
                      retryRule: "revise until reviewer passes",
                      evidenceRequirements: ["research_summary"],
                      status: "completed",
                      evidenceRefs: ["research-summary-1"],
                      notes: null,
                    },
                    {
                      stepKey: "storyboard",
                      title: "Storyboard video",
                      objective: "Create the 24-30 second scene plan.",
                      ownerPersona: "Creative Director",
                      ownerMemberId: "creative-director",
                      reviewerPersona: "Content Director",
                      reviewerMemberId: "content-director",
                      verificationMethod: "storyboard review",
                      retryRule: "revise until reviewer passes",
                      evidenceRequirements: ["storyboard"],
                      status: "completed",
                      evidenceRefs: ["storyboard-1"],
                      notes: null,
                    },
                    {
                      stepKey: "media-prompt",
                      title: "Prepare Veo 3.1 prompt",
                      objective: "Convert storyboard into production prompt.",
                      ownerPersona: "Prompt Producer",
                      ownerMemberId: "prompt-producer",
                      reviewerPersona: "Content Director",
                      reviewerMemberId: "content-director",
                      verificationMethod: "prompt review",
                      retryRule: "revise until prompt is production-ready",
                      evidenceRequirements: ["media_prompt"],
                      status: "completed",
                      evidenceRefs: ["prompt-1"],
                      notes: null,
                    },
                    {
                      stepKey: "media-production",
                      title: "Generate final video",
                      objective: "Generate final video artifact with Veo 3.1.",
                      ownerPersona: "Video Producer",
                      ownerMemberId: "video-producer",
                      reviewerPersona: "Content Director",
                      reviewerMemberId: "content-director",
                      verificationMethod: "final review and approval",
                      retryRule: "regenerate until final review passes",
                      evidenceRequirements: ["media_result"],
                      status: "completed",
                      evidenceRefs: ["video-1"],
                      notes: null,
                    },
                  ],
                  evidenceRefs: [
                    "research-summary-1",
                    "storyboard-1",
                    "prompt-1",
                    "video-1",
                  ],
                  planEvidenceRefs: ["research-summary-1"],
                  reviewerMatrix: [],
                  exploration: null,
                  review: {
                    status: "passed",
                    iteration: 1,
                    reviewedAt: "2026-04-17T12:10:00.000Z",
                    reviewerPersona: "Content Director",
                    issues: [],
                    score: 0.94,
                    recommendation: "approve",
                  },
                },
              },
            },
          },
        },
        stages: [],
        roomMessages: [],
        mediaJobs: [],
        reviews: [],
        finalResult,
        workItems: [],
        agencyRuns: [],
        migrationVerification: null,
        missingEvidenceSummary: null,
        loopGuard: {
          triggered: false,
          reason: null,
          repeatCount: 1,
          fingerprint: "songkran-complete",
        },
        timeout: null,
        observability: {
          budgetDecision: null,
          providerDecision: null,
          safetyStatus: "safe",
          timeout: null,
        },
        contextEngineHealth: null,
        memoryContinuity: {
          roomLanguage: "th",
          initiatorUserId: 42,
          availableMemoryScopes: ["user", "room"],
          guidedChatBacked: false,
          automationLed: true,
        },
        retention: {
          routeDecisions: 1,
          executionStages: 4,
          mediaJobs: 1,
          reviewRecords: 1,
          finalResults: 1,
          traceEvents: 0,
          artifactRefs: 4,
        },
        traceSummary: [],
        rawDiagnostics: null,
      } as any,
      messages: [
        {
          id: "msg-1",
          roomId: "room-1",
          runId: "run-1",
          senderType: "assistant",
          senderAssistantId: "video-producer",
          recipientType: "all",
          turnType: "execution_update",
          visibility: "transparent",
          content: "Generated Songkran video with Veo 3.1.",
          summaryContent: "Generated Songkran video with Veo 3.1.",
          metadataJson: {
            messageType: "work_update",
            workItemId: "work-1",
            stageId: "stage-4",
            details: {
              runtimeMetadata: {
                llmModelId: "veo-3-1",
              },
            },
          },
          createdAt: new Date("2026-04-17T12:10:00.000Z"),
        },
      ] as any,
      workItemEvents: [
        {
          id: "event-1",
          workItemId: "work-1",
          roomId: "room-1",
          runId: "run-1",
          actorAssistantId: "content-director",
          actorUserId: null,
          eventType: "approved",
          fromStatus: "in_review",
          toStatus: "completed",
          revisionVersion: 1,
          detailJson: {
            reason:
              "Approved: video result satisfies Songkran objective and duration.",
          },
          createdAt: new Date("2026-04-17T12:10:00.000Z"),
        },
      ] as any,
      accessLevel: "detailed",
    });

    expect(ledger.summary.terminalState).toBe("completed");
    expect(ledger.gates).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ key: "plan", status: "passed" }),
        expect.objectContaining({ key: "execution", status: "passed" }),
        expect.objectContaining({ key: "review", status: "passed" }),
        expect.objectContaining({ key: "human_approval", status: "passed" }),
        expect.objectContaining({ key: "final_result", status: "passed" }),
      ]),
    );
    expect(ledger.steps.map((step) => step.title)).toEqual([
      "Research Songkran context",
      "Storyboard video",
      "Prepare Veo 3.1 prompt",
      "Generate final video",
    ]);
    expect(ledger.attempts.at(-1)).toEqual(
      expect.objectContaining({
        stepKey: "media-production",
        assignedPersonaId: "video-producer",
        selectedModel: "veo-3-1",
        auditDetail: expect.objectContaining({
          provider: "mediaGenerationService",
          model: "veo-3-1",
          promptRefs: ["prompt-1"],
          rawOutputRefs: ["media-job:job-1"],
        }),
      }),
    );
    expect(ledger.timeline).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: "attempt",
          actorId: "video-producer",
          title: "Generate final video · attempt 1",
        }),
        expect.objectContaining({
          kind: "review",
          actorId: "content-director",
          title: "Review passed",
        }),
        expect.objectContaining({
          kind: "terminal",
          title: "Run completed",
        }),
      ]),
    );
  });
});
