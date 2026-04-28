import { describe, expect, it, vi } from "vitest";

const mockCallLLMStructured = vi.hoisted(() =>
  vi.fn(async () => ({
    data: {
      pass: true,
      score: 0.92,
      issues: [],
      summary: "ผ่านการตรวจอัตโนมัติ",
      recommendation: null,
    },
    tokensUsed: 20,
    creditsUsed: 1,
  })),
);

vi.mock("../callLLMStructured", () => ({
  callLLMStructured: mockCallLLMStructured,
  LLMStructuredOutputError: class LLMStructuredOutputError extends Error {},
}));

import {
  accumulateBudget,
  advanceAutoTeamPlanArtifactProgress,
  evaluateRuntimeBudgetGate,
  initBudgetSnapshot,
  prepareAutoTeamPlanArtifactForExecution,
  shouldAutoCompleteFinalApprovalForRun,
  validateAutoTeamStepResult,
} from "../runEngine";
import { createPreflightPlan } from "../workOrchestratorPlanningService";
import { resolveAutomationLaunchPolicy } from "../workAutomationPolicyService";
import { buildCapabilityCatalog } from "../orchestratorCapabilityCatalogService";
import { buildPreflightRevisionFingerprint } from "../preflightRevisionService";
import {
  buildApprovedRunPlanArtifact,
  getApprovedPlanForRun,
} from "../teamExecutionPlanService";
import { evaluateCompletionEvidence } from "../autoTeamCompletionEvidence";
import {
  preflightApprovalBundleSchema,
  type CompiledWorkBrief,
  type WorkIntakeActorContext,
} from "../../../shared/workOrchestrator";
import type { AutoTeamArtifactRef } from "../../../shared/autoTeamExecution";
import type { RunPlanArtifact, RunPlanStep } from "../monitoringService";

const tenantId = "tenant-1";
const teamId = "team-creative";
const roomId = "room-auto-full";
const runId = "run-auto-full";
const requestId = "request-auto-full";
const caseId = "case-auto-full";

const actorContext: WorkIntakeActorContext = {
  tenantId,
  actorUserId: 1,
  requesterUserId: "1",
  roles: ["admin"],
  domainId: null,
  privateVaultUnlocked: false,
  allowedSourceScopes: ["case", "request", "conversation", "manual"],
  allowedSurfacePermissions: [
    "orchestrator.surface.skill",
    "orchestrator.surface.agency",
    "orchestrator.surface.browser",
    "orchestrator.surface.document_management",
    "orchestrator.surface.media_studio",
    "orchestrator.surface.video_editor",
    "orchestrator.surface.work_os",
    "orchestrator.surface.manual",
  ],
  previewAccessLevel: "admin_diagnostic",
};

const brief: CompiledWorkBrief = {
  title: "สร้างวิดีโอประเพณีปีใหม่ไทย 2570",
  objective:
    "สร้างวิดีโอเปรียบเทียบปีใหม่สากลกับปีใหม่ไทย 2570 วันสงกรานต์ ความยาวไม่น้อยกว่า 1 นาที โดยใช้ Veo 3.1",
  summary:
    "ต้องค้นคว้า วางแผน เขียนสตอรี่บอร์ด สร้าง keyframes สร้างคลิปวิดีโอ ตัดต่อรวม และตรวจคุณภาพสุดท้ายแบบอัตโนมัติ",
  sourceRefs: [
    {
      sourceId: "request-source-1",
      sourceType: "request",
      label: "คำสั่งผู้ใช้ภาษาไทย",
      trust: "trusted",
      freshness: "current",
      required: true,
    },
  ],
  approvalSnapshots: [],
  generatedAt: "2026-04-29T00:00:00.000Z",
};

function makeApprovedPlanArtifact() {
  const policy = resolveAutomationLaunchPolicy({
    caseRecord: {
      id: caseId,
      title: brief.title,
      summary: brief.summary,
      riskLevel: "medium",
      automationMode: "fully_auto",
      currentState: "new",
    },
    requestRecord: {
      sourceType: "manual",
      workType: "content-production",
      businessDomain: "creative",
      urgency: "normal",
      riskLevel: "medium",
      classificationConfidence: 0.95,
      title: brief.title,
      objective: brief.objective,
    },
    mode: "fully_auto",
    preserveRequestedMode: true,
  });
  const capabilityCatalog = buildCapabilityCatalog({
    actorContext,
    flags: { privilegedSurfaceAutoExecution: true },
    selectedSurfaces: policy.surfaceAllowlist,
  });
  const preflightRevision = buildPreflightRevisionFingerprint({
    requestTitle: brief.title,
    requestObjective: brief.objective,
    linkedConversationIds: [],
    linkedWorkpackRunIds: [],
    linkedRoleRoutineRunIds: [],
    selectedSourceIds: ["request-source-1"],
    generatedAt: "2026-04-29T00:00:00.000Z",
  });
  const plan = createPreflightPlan({
    brief,
    capabilityCatalog,
    preflightRevision,
    teamResolution: {
      status: "resolved",
      code: "resolved_plan_override",
      teamId,
      source: "plan_override",
      reason: "ทดสอบเลือกทีมอัตโนมัติ",
      diagnostics: {},
    },
    policy,
    createdAt: "2026-04-29T00:00:00.000Z",
  });
  const bundle = preflightApprovalBundleSchema.parse({
    id: "bundle-auto-full",
    tenantId,
    requestId,
    caseId,
    state: "approved",
    createdAt: "2026-04-29T00:00:00.000Z",
    updatedAt: "2026-04-29T00:01:00.000Z",
    previewView: "admin_diagnostic",
    brief,
    capabilityCatalog,
    capabilityPlan: plan.capabilityPlan,
    executionPlan: plan.executionPlan,
    teamResolution: plan.executionPlan.teamResolution,
    budget: plan.budget,
    approvalSnapshots: [],
    preflightRevision,
    createdByUserId: 1,
    launchedAt: "2026-04-29T00:02:00.000Z",
    supersededByBundleId: null,
    approvedAt: "2026-04-29T00:01:00.000Z",
    approvedByUserId: 1,
    idempotencyRecords: [],
    stateTransitions: [],
    requesterSafeDiagnostics: {},
    adminDiagnostics: {},
    metadata: {},
  });
  const snapshot = getApprovedPlanForRun({
    constraintsJson: {
      source: "work_os",
      workRequestId: requestId,
      workCaseId: caseId,
      workOrchestrator: { preflightBundle: bundle },
    },
  });
  if (!snapshot) throw new Error("approved plan snapshot missing");
  return {
    budget: snapshot.budget,
    planArtifact: prepareAutoTeamPlanArtifactForExecution(
      buildApprovedRunPlanArtifact({ snapshot, runId, roomId, teamId }),
    ),
  };
}

function outputForStep(step: RunPlanStep, index: number) {
  const artifactId = `artifact-${index + 1}-${step.stepKey}`;
  const baseMetadata = {
    artifactRefs: [artifactId],
  };

  if (step.surface === "agency") {
    return {
      content:
        "สรุปงานวิจัย: ปีใหม่สากลเน้นการนับถอยหลัง ส่วนสงกรานต์เน้นครอบครัว การรดน้ำดำหัว และการเริ่มต้นใหม่ทางวัฒนธรรม พร้อมแหล่งอ้างอิงที่เชื่อถือได้",
      metadata: {
        ...baseMetadata,
        agencyRunId: `agency-run-${index + 1}`,
      },
      evidenceRefs: [`agency-run:agency-run-${index + 1}`, `artifact:${artifactId}`],
      artifactType: "research_summary" as const,
      artifactRole: "summary" as const,
    };
  }

  if (step.stepKey === "storyboard-script") {
    return {
      content:
        "สตอรี่บอร์ดและสคริปต์ 8 ฉาก: เปิดด้วยภาพครอบครัวเตรียมงานปีใหม่ ต่อด้วยนับถอยหลังปีใหม่สากล เปรียบเทียบกับสงกรานต์ การรดน้ำดำหัว ขบวนแห่ วัฒนธรรมครอบครัว และสรุปความหมายร่วม ความยาวรวม 72 วินาที พร้อมบทบรรยายและข้อความหน้าจอทุกฉาก",
      metadata: baseMetadata,
      evidenceRefs: [`artifact:${artifactId}`],
      artifactType: "storyboard" as const,
      artifactRole: "evidence" as const,
    };
  }

  if (step.surface === "media_studio") {
    return {
      content:
        "สร้าง keyframes สำหรับ storyboard ครบ 8 ภาพ พร้อม style guide ตัวละคร สี แสง และ reference สำหรับนำไปสร้างคลิปวิดีโอด้วย Veo 3.1",
      metadata: {
        ...baseMetadata,
        mediaJob: {
          id: "image-job-keyframes",
          taskId: "image-task-keyframes",
          providerStatus: "succeeded",
          resultArtifactRefsJson: [artifactId],
        },
      },
      evidenceRefs: ["media-job:image-job-keyframes", `artifact:${artifactId}`],
      artifactType: "media_prompt" as const,
      artifactRole: "prompt" as const,
    };
  }

  if (step.surface === "video_editor") {
    return {
      content:
        "สร้างคลิปวิดีโอจาก keyframes ครบทุกฉาก รอ job สำเร็จครบแล้วตัดต่อรวมเป็น final video ความยาว 72 วินาที ตรวจ probe แล้วไฟล์สุดท้ายพร้อมส่งมอบ",
      metadata: {
        ...baseMetadata,
        finalVideoUrl: "/api/storage/files/auto-team-media/tenant-1/run-auto-full/final.mp4",
        mediaJobs: [
          {
            id: "veo-clip-job-1",
            taskId: "veo-clip-task-1",
            providerStatus: "succeeded",
            resultArtifactRefsJson: ["clip-1"],
          },
          {
            id: "video-compose-job",
            taskId: "video-compose-task",
            providerStatus: "succeeded",
            resultArtifactRefsJson: [artifactId],
          },
        ],
      },
      evidenceRefs: [
        "media-job:veo-clip-job-1",
        "media-job:video-compose-job",
        "media:/api/storage/files/auto-team-media/tenant-1/run-auto-full/final.mp4",
        `artifact:${artifactId}`,
      ],
      artifactType: "media_result" as const,
      artifactRole: "result" as const,
    };
  }

  if (step.stepKey === "final-quality-review") {
    return {
      content:
        "ผลตรวจคุณภาพสุดท้ายผ่าน: วิดีโอสุดท้ายสอดคล้องกับเป้าหมายภาษาไทย ความยาวเกิน 1 นาที มีการเปรียบเทียบปีใหม่สากลกับสงกรานต์ และมีหลักฐานไฟล์สุดท้ายครบถ้วน",
      metadata: baseMetadata,
      evidenceRefs: [`artifact:${artifactId}`, "final-result:final-result-1"],
      artifactType: "review_note" as const,
      artifactRole: "review" as const,
    };
  }

  return {
    content:
      "สรุปขั้นตอน: แปลงข้อมูลเป็น brief ที่นำไปปฏิบัติได้ ระบุผู้ชม โทน โครงเรื่อง และข้อกำหนดด้านคุณภาพครบถ้วน",
    metadata: baseMetadata,
    evidenceRefs: [`artifact:${artifactId}`],
    artifactType: step.stepKey === "plan-and-brief" ? "media_prompt" as const : "review_note" as const,
    artifactRole: step.stepKey === "plan-and-brief" ? "prompt" as const : "evidence" as const,
  };
}

async function runHarnessToCompletion(initialPlan: RunPlanArtifact, budget: ReturnType<typeof makeApprovedPlanArtifact>["budget"]) {
  let planArtifact = initialPlan;
  let budgetSnapshot = initBudgetSnapshot();
  const artifacts: AutoTeamArtifactRef[] = [];
  const trace: Array<Record<string, unknown>> = [];

  for (let index = 0; index < initialPlan.steps.length + 2; index += 1) {
    const activeStep = planArtifact.steps.find(step => step.status === "in_progress");
    if (!activeStep) break;
    const policy = activeStep.runtimeDispatchPolicy ?? null;
    const budgetGate = evaluateRuntimeBudgetGate({
      budget,
      budgetSnapshot,
      policy,
      softTokenBudget: true,
    });
    if (budgetGate.blocked) {
      throw new Error(
        JSON.stringify({
          blocker: "budget_gate",
          stepKey: activeStep.stepKey,
          reasonCode: budgetGate.reasonCode,
          exceededResource: budgetGate.exceededResource,
          usage: budgetGate.usage,
          reservation: policy?.budgetReservation ?? null,
          trace,
        }),
      );
    }

    const output = outputForStep(activeStep, index);
    const validation = await validateAutoTeamStepResult({
      tenantId,
      userId: 1,
      runObjective: brief.objective,
      step: activeStep,
      content: output.content,
      metadata: output.metadata,
    });
    if (!validation.passed) {
      throw new Error(
        JSON.stringify({
          blocker: "step_validation",
          stepKey: activeStep.stepKey,
          issues: validation.issues,
          summary: validation.summary,
          trace,
        }),
      );
    }

    artifacts.push({
      id: output.evidenceRefs.at(-1)?.replace(/^[^:]+:/, "") ?? output.artifactType,
      tenantId,
      teamId,
      roomId,
      runId,
      stageId: `stage-${index + 1}`,
      workItemId: "work-item-1",
      artifactType: output.artifactType,
      artifactRole: output.artifactRole,
      storageRef: output.artifactType === "media_result"
        ? "auto-team-media/tenant-1/run-auto-full/final.mp4"
        : `${output.artifactType}-${index + 1}`,
      externalRef: null,
      contentHash: `hash-${index + 1}`,
      visibility: "tenant",
      retentionPolicyJson: null,
      safetyStatus: "safe",
      source: output.artifactType === "media_result" ? "auto_team_media" : "auto_team",
    });

    planArtifact = {
      ...planArtifact,
      evidenceRefs: Array.from(new Set([...planArtifact.evidenceRefs, ...output.evidenceRefs])),
      steps: planArtifact.steps.map(step =>
        step.stepKey === activeStep.stepKey
          ? {
              ...step,
              evidenceRefs: Array.from(new Set([...(step.evidenceRefs ?? []), ...output.evidenceRefs])),
              validationState: {
                status: "passed" as const,
                attempt: validation.attempt,
                maxAttempts: validation.maxAttempts,
                issues: [],
                summary: validation.summary,
                semanticScore: validation.semanticScore,
                checkedAt: "2026-04-29T00:10:00.000Z",
              },
            }
          : step,
      ),
    };
    budgetSnapshot = accumulateBudget(
      budgetSnapshot,
      activeStep.ownerMemberId ?? "auto-team-worker",
      {
        inputTokens: 14_000,
        outputTokens: 1_000,
        costCredits: 4,
      },
      policy?.budgetReservation ?? null,
      policy
        ? [
            runId,
            activeStep.stepKey,
            validation.attempt,
            policy.authorityDecision,
            policy.sideEffectClass,
          ].join(":")
        : null,
    );
    trace.push({
      stepKey: activeStep.stepKey,
      surface: activeStep.surface,
      capability: activeStep.selectedCapabilityId,
      validation: validation.summary,
      budget: {
        toolCallsUsed: budgetSnapshot.toolCallsUsed,
        mediaJobsUsed: budgetSnapshot.mediaJobsUsed,
        agencyRunsUsed: budgetSnapshot.agencyRunsUsed,
        totalCreditsUsed: budgetSnapshot.totalCreditsUsed,
      },
    });
    planArtifact = advanceAutoTeamPlanArtifactProgress(
      planArtifact,
      activeStep.stepKey,
    ).planArtifact;
  }

  if (planArtifact.status !== "completed") {
    throw new Error(
      JSON.stringify({
        blocker: "plan_not_completed",
        statuses: planArtifact.steps.map(step => ({
          stepKey: step.stepKey,
          status: step.status,
          issues: step.validationState?.issues ?? [],
        })),
        trace,
      }),
    );
  }

  return { planArtifact, budgetSnapshot, artifacts, trace };
}

describe("auto-team full-run harness", () => {
  it("runs a Thai Work OS video request from plan through final result without manual step testing", async () => {
    const { planArtifact: initialPlan, budget } = makeApprovedPlanArtifact();
    expect(initialPlan.steps.map(step => step.stepKey)).toEqual([
      "research-context",
      "plan-and-brief",
      "storyboard-script",
      "generate-visual-assets",
      "compose-final-video",
      "final-quality-review",
    ]);

    const { planArtifact, budgetSnapshot, artifacts, trace } =
      await runHarnessToCompletion(initialPlan, budget);

    expect(planArtifact.steps.every(step => step.validationState?.status === "passed")).toBe(true);
    expect(
      shouldAutoCompleteFinalApprovalForRun(
        { executionMode: "auto_team" } as any,
        planArtifact,
      ),
      JSON.stringify(
        planArtifact.steps.map(step => ({
          stepKey: step.stepKey,
          surface: step.surface,
          status: step.status,
          validation: step.validationState?.status ?? null,
          authority: step.runtimeDispatchPolicy?.authorityDecision ?? null,
          sideEffectClass: step.runtimeDispatchPolicy?.sideEffectClass ?? null,
          evidenceRefs: step.evidenceRefs,
        })),
        null,
        2,
      ),
    ).toBe(true);

    const completionEvidence = evaluateCompletionEvidence({
      tenantId,
      teamId,
      roomId,
      runId,
      routeDecision: {
        id: "route-media-video",
        routeClass: "media.video",
        language: "th",
      },
      artifactRefs: [
        ...artifacts,
        {
          id: "final-result-1",
          tenantId,
          teamId,
          roomId,
          runId,
          stageId: "stage-final",
          workItemId: "work-item-1",
          artifactType: "final_result",
          artifactRole: "result",
          storageRef: "auto-team-results/tenant-1/run-auto-full/final.json",
          externalRef: null,
          contentHash: "hash-final",
          visibility: "tenant",
          retentionPolicyJson: null,
          safetyStatus: "safe",
          source: "auto_team",
        },
      ],
      mediaJobRefs: [
        {
          id: "video-compose-job",
          providerStatus: "succeeded",
          resultArtifactRefsJson: ["artifact-5-compose-final-video"],
          stageId: "stage-5",
        },
      ],
      reviewRecords: [
        {
          id: "final-review-1",
          passed: true,
          reviewType: "final",
        },
      ],
      humanApprovalStatus: "approved",
      finalCandidateStageId: "stage-5",
    });

    expect(completionEvidence.ok, JSON.stringify({ completionEvidence, trace }, null, 2)).toBe(true);
    expect(completionEvidence.missingEvidence).toEqual([]);
    expect(budgetSnapshot.totalCreditsUsed).toBeLessThanOrEqual(
      budget.maxBudgetCredits ?? Number.POSITIVE_INFINITY,
    );
    expect(budgetSnapshot.toolCallsUsed).toBeLessThanOrEqual(
      budget.maxToolCalls ?? Number.POSITIVE_INFINITY,
    );
    expect(budgetSnapshot.mediaJobsUsed).toBeLessThanOrEqual(
      budget.maxMediaJobs ?? Number.POSITIVE_INFINITY,
    );
    expect(trace.map(item => item.stepKey)).toEqual([
      "research-context",
      "plan-and-brief",
      "storyboard-script",
      "generate-visual-assets",
      "compose-final-video",
      "final-quality-review",
    ]);
  });
});
