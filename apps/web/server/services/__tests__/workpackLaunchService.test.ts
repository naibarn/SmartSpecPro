import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../tenantFeatureFlagService", async () => {
  const actual = await vi.importActual<typeof import("../tenantFeatureFlagService")>("../tenantFeatureFlagService");
  return {
    ...actual,
    getTenantFeatureFlags: vi.fn().mockResolvedValue({
      workpacksEnabled: true,
      workpackAutonomousPilot: true,
      workpackOpsConsole: true,
    }),
  };
});

vi.mock("../workpackPromotionService", () => ({
  evaluateWorkpackPromotionEligibility: vi.fn(() => ({
    eligible: true,
    reasonCode: "ready_for_launch_test",
    publicationScope: "tenant_local",
    trustTags: [],
    evidenceCompleteness: 0.9,
    benchmarkCandidate: true,
    rollbackAvailable: true,
  })),
}));

import { createDraftWorkpack } from "../workpackIntakeService";
import {
  getWorkpackDetail,
  resetWorkpackStore,
  updateWorkpack,
  updateWorkpackVersion,
} from "../workpackPersistence";
import { compileWorkpackExecutionPlan } from "../workpackCompilerService";
import {
  continueWorkpackRunFromStep,
  launchWorkpack,
  listWorkpackExecutorSnapshots,
  reconcileDispatchedWorkpackRuns,
} from "../workpackLaunchService";

describe("workpackLaunchService", () => {
  beforeEach(async () => {
    await resetWorkpackStore();
  });

  async function seedWorkpack() {
    const draft = await createDraftWorkpack({
      tenantId: "tenant-1",
      title: "Autonomous Queue Triage",
      goal: "Review and route recurring operations tasks automatically with low human intervention",
      domainPack: "custom",
      sources: [
        {
          type: "sop",
          title: "Ops SOP",
          sourceText: "Review the recurring task inbox, classify work by urgency, and dispatch the next best automation path based on the case details and connector availability.",
        },
      ],
    });
    await compileWorkpackExecutionPlan({ workpackId: draft.workpack.id, requestedBy: 7 });
    await updateWorkpackVersion(draft.version.id, (version) => ({
      ...version,
      playbook: {
        ...version.playbook,
        extractedFields: version.playbook.extractedFields.map((field) => ({
          ...field,
          confidence: Math.max(field.confidence, 0.85),
          requiresClarification: false,
        })),
        clarificationQueue: [],
      },
    }));
    await updateWorkpack(draft.workpack.id, (workpack) => ({
      ...workpack,
      lifecycleState: "draft",
      updatedAt: "2026-04-10T00:00:00.000Z",
    }));
    return draft;
  }

  it("dispatches queued workpack steps through worker runtime adapters", async () => {
    const draft = await seedWorkpack();
    const detail = await getWorkpackDetail(draft.workpack.id);
    expect(detail).not.toBeNull();

    await updateWorkpackVersion(detail!.version.id, (version) => ({
      ...version,
      executionPlan: {
        ...version.executionPlan!,
        steps: [{
          ...version.executionPlan!.steps[0]!,
          id: "step_browser",
          title: "Inspect browser queue",
          objective: "Open the browser queue and classify the next recurring task.",
          expectedOutcome: "Queued task classified",
          preferredRuntimePath: "browser",
          allowedFallbackPaths: [],
          requiredConnectorFamilies: [],
          sideEffectClass: "read_only",
          requiresApproval: false,
        }],
      },
    }));

    const queueWorkerJobByRuntime = vi.fn().mockResolvedValue({
      created: true,
      job: {
        id: "worker-job-1",
        status: "queued",
        runtimeType: "openclaw_gateway",
        jobType: "browser_automation_task",
      },
    });

    const result = await launchWorkpack({
      workpackId: draft.workpack.id,
      requestedBy: 7,
      autonomyMode: "supervised",
    }, {
      queueWorkerJobByRuntime: queueWorkerJobByRuntime as any,
    });

    expect(queueWorkerJobByRuntime).toHaveBeenCalledWith(expect.objectContaining({
      runtimeType: "openclaw_gateway",
      jobType: "browser_automation_task",
      workflowRunId: result.run.id,
      requestedByUserId: 7,
    }));
    expect(result.run.status).toBe("queued");
    expect(result.run.actualSteps[0]?.status).toBe("queued");
    expect(result.run.actualSteps[0]?.executionRef).toMatchObject({
      provider: "worker_job",
      executionId: "worker-job-1",
      runtimeType: "openclaw_gateway",
      jobType: "browser_automation_task",
      status: "queued",
    });
  });

  it("falls back to worker fabric routing when a desktop-local dispatch contract is unavailable", async () => {
    const draft = await seedWorkpack();
    const detail = await getWorkpackDetail(draft.workpack.id);
    expect(detail).not.toBeNull();

    await updateWorkpackVersion(detail!.version.id, (version) => ({
      ...version,
      executionPlan: {
        ...version.executionPlan!,
        steps: [{
          ...version.executionPlan!.steps[0]!,
          id: "step_desktop",
          title: "Inspect local folder",
          objective: "Collect local folder evidence for the recurring task.",
          expectedOutcome: "Local artifacts collected",
          preferredRuntimePath: "desktop_local",
          allowedFallbackPaths: ["worker_fabric"],
          requiredConnectorFamilies: [],
          sideEffectClass: "read_only",
          localityHint: "desktop",
          requiresApproval: false,
        }],
      },
    }));

    const queueWorkerJobByRuntime = vi.fn().mockResolvedValue({
      created: true,
      job: {
        id: "worker-job-2",
        status: "queued",
        runtimeType: "hiclaw_cluster",
        jobType: "workpack_worker_fabric_step",
      },
    });

    const result = await launchWorkpack({
      workpackId: draft.workpack.id,
      requestedBy: 9,
      autonomyMode: "supervised",
    }, {
      queueWorkerJobByRuntime: queueWorkerJobByRuntime as any,
    });

    expect(queueWorkerJobByRuntime).toHaveBeenCalledWith(expect.objectContaining({
      runtimeType: "hiclaw_cluster",
      jobType: "workpack_worker_fabric_step",
    }));
    expect(result.run.actualSteps[0]?.runtimePath).toBe("worker_fabric");
    expect(result.run.actualSteps[0]?.outputSummary).toContain("desktop_local -> worker_fabric");
  });

  it("reconciles queued worker jobs into succeeded workpack runs", async () => {
    const draft = await seedWorkpack();
    const detail = await getWorkpackDetail(draft.workpack.id);
    expect(detail).not.toBeNull();

    await updateWorkpackVersion(detail!.version.id, (version) => ({
      ...version,
      executionPlan: {
        ...version.executionPlan!,
        steps: [{
          ...version.executionPlan!.steps[0]!,
          id: "step_flow",
          title: "Dispatch plugin workflow",
          objective: "Route the recurring task through the managed workflow lane.",
          expectedOutcome: "Workflow lane executed",
          preferredRuntimePath: "workflow",
          allowedFallbackPaths: [],
          requiredConnectorFamilies: [],
          sideEffectClass: "read_only",
          requiresApproval: false,
        }],
      },
    }));

    const launchResult = await launchWorkpack({
      workpackId: draft.workpack.id,
      requestedBy: 11,
      autonomyMode: "supervised",
    }, {
      queueWorkerJobByRuntime: vi.fn().mockResolvedValue({
        created: true,
        job: {
          id: "worker-job-3",
          status: "queued",
          runtimeType: "openclaw_gateway",
          jobType: "plugin_workflow_task",
        },
      }) as any,
    });

    const reconciledRunIds = await reconcileDispatchedWorkpackRuns({
      tenantId: "tenant-1",
      workpackId: draft.workpack.id,
    }, {
      loadWorkerJobsById: vi.fn().mockResolvedValue({
        "worker-job-3": {
          id: "worker-job-3",
          status: "completed",
          runtimeType: "openclaw_gateway",
          jobType: "plugin_workflow_task",
          failureReason: null,
          outputJson: {
            publishedArtifacts: [{ id: "artifact-worker-1", label: "manifest" }],
          },
        },
      }),
    });

    const updatedDetail = await getWorkpackDetail(draft.workpack.id);
    expect(reconciledRunIds).toContain(launchResult.run.id);
    expect(updatedDetail?.runs[0]?.status).toBe("succeeded");
    expect(updatedDetail?.runs[0]?.actualSteps[0]?.status).toBe("succeeded");
    expect(updatedDetail?.runs[0]?.artifactReferences.some((artifact) => artifact.label === "Dispatch plugin workflow published artifacts")).toBe(true);
  });

  it("continues from an approved boundary step instead of restarting from the beginning", async () => {
    const draft = await seedWorkpack();
    const detail = await getWorkpackDetail(draft.workpack.id);
    expect(detail).not.toBeNull();

    await updateWorkpackVersion(detail!.version.id, (version) => ({
      ...version,
      executionPlan: {
        ...version.executionPlan!,
        steps: [
          {
            ...version.executionPlan!.steps[0]!,
            id: "step_boundary",
            title: "Approve payroll export",
            objective: "Create the payroll export in the managed workflow lane.",
            expectedOutcome: "Payroll export queued",
            preferredRuntimePath: "workflow",
            allowedFallbackPaths: [],
            requiredConnectorFamilies: [],
            sideEffectClass: "external_write",
            requiresApproval: true,
          },
          {
            ...version.executionPlan!.steps[0]!,
            id: "step_followup",
            title: "Notify downstream team",
            objective: "Notify the downstream team that the export is ready.",
            expectedOutcome: "Notification queued",
            preferredRuntimePath: "workflow",
            allowedFallbackPaths: [],
            requiredConnectorFamilies: [],
            sideEffectClass: "read_only",
            requiresApproval: false,
          },
        ],
      },
    }));

    const result = await continueWorkpackRunFromStep({
      workpackId: draft.workpack.id,
      stepId: "step_boundary",
      approvedBoundaryStepIds: ["step_boundary"],
      requestedBy: 17,
      autonomyMode: "supervised",
      triggerSource: "test_boundary_continue",
    }, {
      queueWorkerJobByRuntime: vi.fn()
        .mockResolvedValueOnce({
          created: true,
          job: {
            id: "worker-job-continue-1",
            status: "queued",
            runtimeType: "openclaw_gateway",
            jobType: "plugin_workflow_task",
          },
        })
        .mockResolvedValueOnce({
          created: true,
          job: {
            id: "worker-job-continue-2",
            status: "queued",
            runtimeType: "openclaw_gateway",
            jobType: "plugin_workflow_task",
          },
        }) as any,
    });

    expect(result.run.approvalCheckpoints[0]).toMatchObject({
      stepId: "step_boundary",
      approved: true,
    });
    expect(result.run.actualSteps[0]).toMatchObject({
      stepId: "step_boundary",
      status: "queued",
    });
    expect(result.run.actualSteps[1]).toMatchObject({
      stepId: "step_followup",
      status: "queued",
    });
  });

  it("returns lane-aware executor monitor snapshots for recent workpack runs", async () => {
    const draft = await seedWorkpack();
    const detail = await getWorkpackDetail(draft.workpack.id);
    expect(detail).not.toBeNull();

    await updateWorkpackVersion(detail!.version.id, (version) => ({
      ...version,
      executionPlan: {
        ...version.executionPlan!,
        steps: [{
          ...version.executionPlan!.steps[0]!,
          id: "step_browser_monitor",
          title: "Inspect browser queue",
          objective: "Open the browser queue and classify the next task.",
          expectedOutcome: "Queued task inspected",
          preferredRuntimePath: "browser",
          allowedFallbackPaths: [],
          requiredConnectorFamilies: [],
          sideEffectClass: "read_only",
          requiresApproval: false,
        }],
      },
    }));

    await launchWorkpack({
      workpackId: draft.workpack.id,
      requestedBy: 7,
      autonomyMode: "supervised",
    }, {
      queueWorkerJobByRuntime: vi.fn().mockResolvedValue({
        created: true,
        job: {
          id: "worker-job-monitor",
          status: "running",
          runtimeType: "openclaw_gateway",
          jobType: "browser_automation_task",
        },
      }) as any,
    });

    const snapshots = await listWorkpackExecutorSnapshots({
      tenantId: "tenant-1",
      workpackId: draft.workpack.id,
    }, {
      loadExecutorSnapshotsById: vi.fn().mockResolvedValue({
        "worker-job-monitor": {
          executionId: "worker-job-monitor",
          provider: "worker_job",
          runtimeType: "openclaw_gateway",
          jobType: "browser_automation_task",
          runtimePathHint: "browser",
          laneLabel: "Browser automation lane",
          status: "running",
          statusReason: "navigating_queue",
          failureReason: null,
          workerId: "worker-alpha",
          resourceProfile: "network_heavy",
          terminal: false,
          artifactCount: 1,
          publishedArtifactCount: 0,
          latestEventType: "navigation_completed",
          startedAt: "2026-04-10T00:00:00.000Z",
          finishedAt: null,
          laneDetails: {
            lane: "browser",
            stage: "navigate_queue",
            connectorFamilies: ["crm"],
            sourceCount: 1,
          },
          recentEvents: [{
            eventId: "evt-1",
            eventType: "navigation_completed",
            createdAt: "2026-04-10T00:01:00.000Z",
            payload: { page: "queue" },
          }],
          artifacts: [{
            artifactId: "artifact-1",
            artifactType: "summary",
            storageRef: "library://artifact-1",
            publishedItemId: null,
            createdAt: "2026-04-10T00:01:10.000Z",
            metadata: { label: "Queue summary" },
          }],
        },
      }),
    });

    expect(snapshots).toHaveLength(1);
    expect(snapshots[0]).toMatchObject({
      executionId: "worker-job-monitor",
      laneLabel: "Browser automation lane",
      workerId: "worker-alpha",
      latestEventType: "navigation_completed",
      artifactCount: 1,
      laneDetails: expect.objectContaining({
        lane: "browser",
        stage: "navigate_queue",
        connectorFamilies: ["crm"],
      }),
    });
  });
});
