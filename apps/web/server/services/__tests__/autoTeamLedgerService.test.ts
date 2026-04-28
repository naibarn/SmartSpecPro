import { describe, expect, it } from "vitest";

import {
  buildAutoTeamLedgerReadModel,
} from "../autoTeamLedgerService";

function makeSnapshot(overrides: Record<string, unknown> = {}) {
  return {
    tenantId: "tenant-1",
    room: {
      id: "room-1",
      tenantId: "tenant-1",
      teamId: "team-1",
      roomType: "auto_team",
      goalPrompt: "Create a Songkran video",
      createdAt: new Date("2026-04-18T10:00:00.000Z"),
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
      status: "running",
      stopReason: null,
      endedAt: null,
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
          id: "stage-2",
          planStepKey: "storyboard",
          stageType: "review",
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
            planStepKey: "storyboard",
            stageType: "storyboard",
            status: "needs_revision",
            assignedPersonaId: "assistant-1",
            expectedCapabilityFamily: "research.synthesis",
            selectedSkillId: "storyboard-skill",
            selectedProvider: "openai",
            inputArtifactRefsJson: [],
            outputArtifactRefsJson: ["artifact-1"],
            jobRefIdsJson: [],
            attempt: 1,
            maxAttempts: 3,
            startedAt: new Date("2026-04-18T10:00:00.000Z"),
            completedAt: new Date("2026-04-18T10:05:00.000Z"),
            blockedReason: "review_repair_required",
            errorCode: "repair",
            errorMessage: "Need stronger hook",
            metadataJson: {
              selectedModel: "gpt-5",
              promptRefs: ["prompt:1"],
              contextRefs: ["ctx:1"],
              toolRefs: ["tool:1"],
              rawOutputRefs: ["raw:1"],
            },
            createdAt: new Date("2026-04-18T10:00:00.000Z"),
          },
          {
            id: "stage-2",
            tenantId: "tenant-1",
            teamId: "team-1",
            roomId: "room-1",
            runId: "run-1",
            routeDecisionId: "route-1",
            workItemId: "work-2",
            planStepKey: "storyboard",
            stageType: "storyboard",
            status: "completed",
            assignedPersonaId: "assistant-1",
            expectedCapabilityFamily: "research.synthesis",
            selectedSkillId: "storyboard-skill",
            selectedProvider: "openai",
            inputArtifactRefsJson: [],
            outputArtifactRefsJson: ["artifact-2"],
            jobRefIdsJson: [],
            attempt: 2,
            maxAttempts: 3,
            startedAt: new Date("2026-04-18T10:10:00.000Z"),
            completedAt: new Date("2026-04-18T10:16:00.000Z"),
            blockedReason: null,
            errorCode: null,
            errorMessage: null,
            metadataJson: {
              selectedModel: "gpt-5",
              promptRefs: ["prompt:2"],
              contextRefs: ["ctx:2"],
              toolRefs: ["tool:2"],
              rawOutputRefs: ["raw:2"],
            },
            createdAt: new Date("2026-04-18T10:10:00.000Z"),
          },
        ],
        mediaJobs: [],
        reviews: [
          {
            id: "review-1",
            tenantId: "tenant-1",
            teamId: "team-1",
            roomId: "room-1",
            runId: "run-1",
            stageId: "stage-1",
            workItemId: "work-1",
            reviewerPersonaId: "assistant-2",
            reviewType: "qa_review",
            score: 0.62,
            passThreshold: 0.75,
            passed: false,
            reviewedArtifactRefsJson: ["artifact-1"],
            reviewedJobRefIdsJson: [],
            comments: "Need stronger hook",
            repairInstructions: "Rewrite opening with a clearer narrative",
            idempotencyKey: "review-1",
            createdAt: new Date("2026-04-18T10:06:00.000Z"),
          },
          {
            id: "review-2",
            tenantId: "tenant-1",
            teamId: "team-1",
            roomId: "room-1",
            runId: "run-1",
            stageId: "stage-2",
            workItemId: "work-2",
            reviewerPersonaId: "assistant-2",
            reviewType: "qa_review",
            score: 0.91,
            passThreshold: 0.75,
            passed: true,
            reviewedArtifactRefsJson: ["artifact-2"],
            reviewedJobRefIdsJson: [],
            comments: "Approved for finalization",
            repairInstructions: null,
            idempotencyKey: "review-2",
            createdAt: new Date("2026-04-18T10:17:00.000Z"),
          },
        ],
        finalResult: null,
        traceEvents: [
          {
            traceEventId: "planning.generated:run-1",
            runId: "run-1",
            teamId: "team-1",
            roomId: "room-1",
            eventName: "planning.generated",
            sourceComponent: "runEngine",
            severity: "info",
            summary: "Planner generated the initial audited plan.",
            workItemId: null,
            stageId: null,
            sequence: 1,
            redactedMetadataJson: {
              stepKey: "storyboard",
            },
            idempotencyKey: "planning.generated:run-1",
            createdAt: new Date("2026-04-18T09:59:00.000Z"),
          },
        ],
        updatedAt: "2026-04-18T10:17:00.000Z",
        latestMonitoringSnapshot: {
          artifactCountJson: {
            planArtifact: {
              version: 1,
              runId: "run-1",
              roomId: "room-1",
              teamId: "team-1",
              caseId: null,
              requestId: null,
              objective: "Create a Songkran video",
              source: "team_run",
              status: "executing",
              generatedAt: "2026-04-18T10:00:00.000Z",
              lastUpdatedAt: "2026-04-18T10:17:00.000Z",
              steps: [
                {
                  stepKey: "storyboard",
                  title: "Storyboard",
                  objective: "Draft the storyboard",
                  deliverable: "Storyboard draft with scene-by-scene narrative",
                  ownerPersona: "Researcher",
                  ownerMemberId: "assistant-1",
                  reviewerPersona: "Reviewer",
                  reviewerMemberId: "assistant-2",
                  verificationMethod: "qa review",
                  retryRule: "loop until passing",
                  evidenceRequirements: ["storyboard"],
                  qualityCriteria: [
                    "Narrative is coherent",
                    "Storyboard is production ready",
                  ],
                  reviewChecklist: [
                    "Hook is strong",
                    "Each scene supports the brief",
                  ],
                  status: "completed",
                  evidenceRefs: ["artifact-2"],
                  notes: null,
                },
              ],
              evidenceRefs: ["artifact-2"],
              planEvidenceRefs: ["artifact-2"],
              reviewerMatrix: [],
              exploration: null,
              review: {
                status: "passed",
                iteration: 2,
                reviewedAt: "2026-04-18T10:17:00.000Z",
                reviewerPersona: "Reviewer",
                issues: [],
                score: 0.91,
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
    finalResult: null,
    workItems: [],
    agencyRuns: [],
    migrationVerification: null,
    missingEvidenceSummary: "final_artifact",
    loopGuard: { triggered: false, reason: null, repeatCount: 1, fingerprint: "abc" },
    timeout: null,
    observability: {
      budgetDecision: null,
      providerDecision: null,
      safetyStatus: "unknown",
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
    retention: { routeDecisions: 1, executionStages: 2, mediaJobs: 0, reviewRecords: 2, finalResults: 0, traceEvents: 0, artifactRefs: 0 },
    traceSummary: [],
    rawDiagnostics: null,
    ...overrides,
  } as any;
}

describe("autoTeamLedgerService", () => {
  it("preserves resolved review loops while redacting detailed audit metadata for summary viewers", () => {
    const readModel = buildAutoTeamLedgerReadModel({
      snapshot: makeSnapshot(),
      messages: [
        {
          id: "msg-1",
          roomId: "room-1",
          runId: "run-1",
          senderType: "assistant",
          senderAssistantId: "assistant-1",
          recipientType: "all",
          turnType: "execution_update",
          visibility: "transparent",
          content: "Draft storyboard v1",
          summaryContent: "Draft storyboard v1",
          metadataJson: {
            messageType: "work_update",
            workItemId: "work-1",
            details: {
              runtimeMetadata: {
                llmModelId: "gpt-5",
              },
            },
          },
          createdAt: new Date("2026-04-18T10:04:00.000Z"),
        },
        {
          id: "msg-1-checkpoint",
          roomId: "room-1",
          runId: "run-1",
          senderType: "assistant",
          senderAssistantId: "assistant-1",
          recipientType: "all",
          turnType: "execution_update",
          visibility: "transparent",
          content: "Checkpoint persisted for storyboard",
          summaryContent: "Checkpoint persisted for storyboard",
          metadataJson: {
            messageType: "checkpoint_state",
            stepKey: "storyboard",
            checkpointId: "checkpoint-1",
            details: {
              checkpointId: "checkpoint-1",
              runtimeMetadata: {
                runtimeTraceId: "trace-runtime-2",
              },
            },
          },
          createdAt: new Date("2026-04-18T10:05:30.000Z"),
        },
        {
          id: "msg-2",
          roomId: "room-1",
          runId: "run-1",
          senderType: "assistant",
          senderAssistantId: "assistant-1",
          recipientType: "all",
          turnType: "execution_update",
          visibility: "transparent",
          content: "Revised storyboard with a stronger opening",
          summaryContent: "Revised storyboard with a stronger opening",
          metadataJson: {
            messageType: "work_update",
            workItemId: "work-2",
            details: {
              runtimeMetadata: {
                llmModelId: "gpt-5",
              },
            },
          },
          createdAt: new Date("2026-04-18T10:15:00.000Z"),
        },
      ] as any,
      workItemEvents: [
        {
          id: "event-1",
          workItemId: "work-1",
          roomId: "room-1",
          runId: "run-1",
          actorAssistantId: "assistant-2",
          actorUserId: null,
          eventType: "rejected",
          fromStatus: "in_review",
          toStatus: "needs_revision",
          revisionVersion: 1,
          detailJson: {
            reason: "Need stronger hook",
          },
          createdAt: new Date("2026-04-18T10:06:00.000Z"),
        },
      ] as any,
      accessLevel: "summary",
    });

    expect(readModel.accessLevel).toBe("summary");
    expect(readModel.attempts[0]?.auditDetail).toBeNull();
    expect(readModel.steps[0]?.resolvedFindingCount).toBe(1);
    expect(readModel.attempts[0]?.reviews[0]).toEqual(
      expect.objectContaining({
        passed: false,
        resolution: "resolved",
        resolvedByAttemptId: "stage-2",
      }),
    );
    expect(readModel.timeline.some((entry) => entry.kind === "trace")).toBe(true);
    expect(
      readModel.steps[0]?.stepLinks.some(
        (link) =>
          link.linkType === "checkpoint" &&
          link.checkpointId === "checkpoint-1" &&
          link.traceId === "trace-runtime-2",
      ),
    ).toBe(true);
  });

  it("surfaces paused step validation as the current plan blocker", () => {
    const base = makeSnapshot();
    const planArtifact =
      (base.execution.canonicalSnapshot.latestMonitoringSnapshot.artifactCountJson as any)
        .planArtifact;
    const readModel = buildAutoTeamLedgerReadModel({
      snapshot: makeSnapshot({
        run: {
          ...base.run,
          status: "paused",
          stopReason: null,
          runtimeCurrentStepKey: "storyboard",
          runtimeStateJson: {
            stepValidation: {
              stepKey: "storyboard",
              issues: ["video_step_missing_job_or_clip_reference"],
              summary:
                "Step result failed automatic artifact validation: video_step_missing_job_or_clip_reference",
              attempt: 2,
              maxAttempts: 2,
              retryable: false,
            },
          },
        },
        execution: {
          ...base.execution,
          canonicalSnapshot: {
            ...base.execution.canonicalSnapshot,
            currentStage: null,
            latestMonitoringSnapshot: {
              artifactCountJson: {
                planArtifact: {
                  ...planArtifact,
                  status: "blocked",
                  steps: planArtifact.steps.map((step: any) => ({
                    ...step,
                    status:
                      step.stepKey === "storyboard" ? "blocked" : step.status,
                  })),
                },
              },
            },
          },
        },
      }),
      messages: [] as any,
      workItemEvents: [] as any,
      accessLevel: "detailed",
    });

    expect(readModel.summary.stopReason).toBe("auto_team_step_validation_failed");
    expect(readModel.summary.currentStepKey).toBe("storyboard");
    expect(readModel.summary.nextAction).toContain(
      "failed automatic validation",
    );
    expect(readModel.steps[0]?.validationState).toEqual(
      expect.objectContaining({
        status: "failed",
        attempt: 2,
        issues: ["video_step_missing_job_or_clip_reference"],
      }),
    );
  });

  it("exposes detailed audit metadata for authorized viewers and classifies idle timeout with missing gates as stalled no-gate progress", () => {
    const readModel = buildAutoTeamLedgerReadModel({
      snapshot: makeSnapshot({
        run: {
          id: "run-1",
          tenantId: "tenant-1",
          roomId: "room-1",
          teamId: "team-1",
          initiatedByUserId: 42,
          status: "completed",
          stopReason: "idle_timeout",
          endedAt: new Date("2026-04-18T10:30:00.000Z"),
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
            ...makeSnapshot().execution.canonicalSnapshot,
            reviews: [
              {
                id: "review-1",
                tenantId: "tenant-1",
                teamId: "team-1",
                roomId: "room-1",
                runId: "run-1",
                stageId: "stage-1",
                workItemId: "work-1",
                reviewerPersonaId: "assistant-2",
                reviewType: "qa_review",
                score: 0.62,
                passThreshold: 0.75,
                passed: false,
                reviewedArtifactRefsJson: ["artifact-1"],
                reviewedJobRefIdsJson: [],
                comments: "Need stronger hook",
                repairInstructions: "Rewrite opening",
                idempotencyKey: "review-1",
                createdAt: new Date("2026-04-18T10:06:00.000Z"),
              },
            ],
            finalResult: null,
            latestMonitoringSnapshot: {
              artifactCountJson: {
                planArtifact: {
                  version: 1,
                  runId: "run-1",
                  roomId: "room-1",
                  teamId: "team-1",
                  caseId: null,
                  requestId: null,
                  objective: "Create a Songkran video",
                  source: "team_run",
                  status: "blocked",
                  generatedAt: "2026-04-18T10:00:00.000Z",
                  lastUpdatedAt: "2026-04-18T10:17:00.000Z",
                  steps: [
                    {
                      stepKey: "storyboard",
                      title: "Storyboard",
                      objective: "Draft the storyboard",
                      deliverable: "Storyboard draft with scene-by-scene narrative",
                      ownerPersona: "Researcher",
                      ownerMemberId: "assistant-1",
                      reviewerPersona: "Reviewer",
                      reviewerMemberId: "assistant-2",
                      verificationMethod: "qa review",
                      retryRule: "loop until passing",
                      evidenceRequirements: ["storyboard"],
                      qualityCriteria: [
                        "Narrative is coherent",
                        "Storyboard is production ready",
                      ],
                      reviewChecklist: [
                        "Hook is strong",
                        "Each scene supports the brief",
                      ],
                      status: "blocked",
                      evidenceRefs: ["artifact-1"],
                      notes: "Review still failing",
                    },
                  ],
                  evidenceRefs: ["artifact-1"],
                  planEvidenceRefs: ["artifact-1"],
                  reviewerMatrix: [],
                  exploration: null,
                  review: {
                    status: "failed",
                    iteration: 1,
                    reviewedAt: "2026-04-18T10:06:00.000Z",
                    reviewerPersona: "Reviewer",
                    issues: ["Need stronger hook"],
                    score: 0.62,
                    recommendation: "repair",
                  },
                },
              },
            },
          },
        },
        missingEvidenceSummary: "review, final_artifact",
      }),
      messages: [] as any,
      workItemEvents: [] as any,
      accessLevel: "detailed",
    });

    expect(readModel.summary.terminalState).toBe("failed");
    expect(readModel.summary.terminalReason).toBe("stalled_no_gate_progress");
    expect(readModel.attempts[0]?.auditDetail).toEqual(
      expect.objectContaining({
        provider: "openai",
        model: "gpt-5",
        promptRefs: ["prompt:1"],
        contextRefs: ["ctx:1"],
        toolRefs: ["tool:1"],
        rawOutputRefs: ["raw:1"],
      }),
    );
    expect(readModel.gates.map((gate) => [gate.key, gate.status])).toEqual(
      expect.arrayContaining([
        ["review", "blocked"],
        ["final_result", "pending"],
      ]),
    );
  });

  it("marks the ledger partial and blocks the plan gate when execution exists without an audited plan artifact", () => {
    const readModel = buildAutoTeamLedgerReadModel({
      snapshot: makeSnapshot({
        execution: {
          ...makeSnapshot().execution,
          canonicalSnapshot: {
            ...makeSnapshot().execution.canonicalSnapshot,
            latestMonitoringSnapshot: {
              artifactCountJson: {},
            },
          },
        },
      }),
      messages: [] as any,
      workItemEvents: [] as any,
      accessLevel: "summary",
    });

    expect(readModel.derivedState).toBe("partial");
    expect(readModel.gates.find((gate) => gate.key === "plan")?.status).toBe(
      "blocked",
    );
    expect(readModel.summary.nextAction).toContain("audited plan artifact");
  });

  it("extracts a draft plan from plan_summary room messages when the audited plan is missing", () => {
    const readModel = buildAutoTeamLedgerReadModel({
      snapshot: makeSnapshot({
        execution: {
          ...makeSnapshot().execution,
          canonicalSnapshot: {
            ...makeSnapshot().execution.canonicalSnapshot,
            latestMonitoringSnapshot: {
              artifactCountJson: {},
            },
          },
        },
      }),
      messages: [
        {
          id: "plan-msg-1",
          roomId: "room-1",
          runId: "run-1",
          senderType: "system",
          senderAssistantId: null,
          recipientType: "all",
          turnType: "summary",
          visibility: "summary_only",
          content: "Plan and responsibilities draft",
          summaryContent: "Plan and responsibilities draft",
          metadataJson: {
            messageType: "plan_summary",
            details: {
              planStatus: "ready",
              reviewStatus: "passed",
              reviewIteration: 1,
              reviewScore: 0.9,
              reviewRecommendation: "Looks good to proceed",
              reviewIssues: [],
              stepCount: 1,
              steps: [
                {
                  stepKey: "research",
                  title: "Research direction",
                  objective: "Define the cultural direction",
                  ownerPersona: "Researcher",
                  ownerMemberId: "assistant-1",
                  reviewerPersona: "Director",
                  reviewerMemberId: "assistant-2",
                  deliverable: "Research brief",
                  verificationMethod: "review",
                  retryRule: "retry until approved",
                  evidenceRequirements: ["brief"],
                  qualityCriteria: ["clear direction"],
                  reviewChecklist: ["brief aligned"],
                  status: "planned",
                  notes: null,
                },
              ],
            },
          },
          createdAt: new Date("2026-04-18T10:00:00.000Z"),
        },
      ] as any,
      workItemEvents: [] as any,
      accessLevel: "summary",
    });

    expect(readModel.plan?.source).toBe("chat");
    expect(readModel.plan?.reviewStatus).toBe("passed");
    expect(readModel.plan?.sourceMessageId).toBe("plan-msg-1");
    expect(readModel.chatPlan?.messageId).toBe("plan-msg-1");
    expect(readModel.chatPlan?.steps[0]).toEqual(
      expect.objectContaining({
        stepKey: "research",
        title: "Research direction",
        objective: "Define the cultural direction",
        ownerMemberId: "assistant-1",
        reviewerMemberId: "assistant-2",
        deliverable: "Research brief",
      }),
    );
  });
});
