import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../db", () => ({
  getDb: vi.fn().mockResolvedValue(null),
}));

vi.mock("../workpackReadinessService", () => ({
  getWorkpackReadinessSummary: vi.fn().mockResolvedValue({
    gateResult: "ready",
    reasonCode: "ready",
    nextAction: "Ready for role execution.",
  }),
}));

vi.mock("../workpackRolloutGateService", () => ({
  evaluateWorkpackRolloutGate: vi.fn().mockResolvedValue({
    gateResult: "ready",
    blockers: [],
    reasonCode: "ready",
    rolloutPhase: "supervised",
  }),
}));

const launchWorkpackMock = vi.fn();

vi.mock("../workpackLaunchService", () => ({
  launchWorkpack: (...args: unknown[]) => launchWorkpackMock(...args),
}));

import { getRoleCheckpointHealth } from "../roleCheckpointService";
import { executeRoleRoutineRun, reconcileRoleRoutineRuns } from "../roleExecutionService";
import {
  getRoleAgent,
  getRoleRoutineRun,
  listRoleQueueItemsByTenant,
  listRoleRoutineRunsForRoutine,
  resetRoleStore,
  saveRoleAgent,
  saveRoleContract,
  saveRoleRoutine,
  saveRoleWorkpackBinding,
} from "../rolePersistence";
import { tickRoleRoutineScheduler } from "../roleRoutineSchedulerService";
import {
  getWorkpackRun,
  resetWorkpackStore,
  saveWorkpack,
  saveWorkpackRun,
  saveWorkpackVersion,
  updateWorkpackRun,
} from "../workpackPersistence";

function workpackVersionFixture(input: {
  workpackId: string;
  versionId: string;
  versionNumber: number;
  createdAt: string;
}) {
  return {
    id: input.versionId,
    workpackId: input.workpackId,
    versionNumber: input.versionNumber,
    playbook: {
      id: `playbook_${input.versionId}`,
      tenantId: "tenant-1",
      title: "Executive sweep playbook",
      goal: "Review and route the executive operating queue",
      description: "Pinned workpack version for the role execution flow test",
      domainPack: "executive_support" as const,
      sourceIds: [],
      extractedFields: [],
      clarificationQueue: [],
      localFileIntelligence: {
        available: false,
        parserStatus: "unknown" as const,
        capabilities: [],
        notes: [],
      },
      steps: [
        {
          id: `step_${input.versionId}`,
          title: "Review queue",
          objective: "Inspect the current executive operating queue",
          expectedOutcome: "Queue contents are ready for routing",
          preferredRuntimePath: "workflow" as const,
          allowedFallbackPaths: [],
          requiredConnectorFamilies: [],
          sideEffectClass: "read_only" as const,
          requiresReplay: true,
          requiresApproval: false,
          localityHint: "none" as const,
          idempotency: {
            mode: "effect_journal" as const,
            effectKey: `effect_${input.versionId}`,
            retryDisposition: "safe_retry" as const,
            replayMode: "inspection_only" as const,
          },
          metadata: {},
        },
      ],
      createdAt: input.createdAt,
    },
    executionPlan: {
      workpackId: input.workpackId,
      versionId: input.versionId,
      generatedAt: input.createdAt,
      routeReason: "workflow route for persistent executive role",
      fixtureRequirements: {
        requiresFixtures: false,
        requiresMaskedInputs: false,
      },
      evidenceRequirements: {
        requiredTraceDetail: "standard" as const,
        promotionNeedsReplay: true,
      },
      steps: [
        {
          id: `step_${input.versionId}`,
          title: "Review queue",
          objective: "Inspect the current executive operating queue",
          expectedOutcome: "Queue contents are ready for routing",
          preferredRuntimePath: "workflow" as const,
          allowedFallbackPaths: [],
          requiredConnectorFamilies: [],
          sideEffectClass: "read_only" as const,
          requiresReplay: true,
          requiresApproval: false,
          localityHint: "none" as const,
          idempotency: {
            mode: "effect_journal" as const,
            effectKey: `effect_${input.versionId}`,
            retryDisposition: "safe_retry" as const,
            replayMode: "inspection_only" as const,
          },
          metadata: {},
        },
      ],
    },
    connectorMaps: [],
    connectorIntrospections: [],
    fixtureCatalog: [],
    compilerMetadata: {},
    publishedAt: input.createdAt,
    createdAt: input.createdAt,
  };
}

describe("role execution flow", () => {
  beforeEach(async () => {
    await resetRoleStore();
    await resetWorkpackStore();
    launchWorkpackMock.mockReset();
  });

  async function seedRoleAndWorkpack() {
    await saveWorkpackVersion(workpackVersionFixture({
      workpackId: "wp_exec",
      versionId: "wpv_exec_1",
      versionNumber: 1,
      createdAt: "2026-04-11T00:00:00.000Z",
    }));
    await saveWorkpack({
      id: "wp_exec",
      tenantId: "tenant-1",
      title: "Executive queue sweep",
      description: "Pinned workpack for the virtual executive role",
      goal: "Handle recurring executive queue triage",
      domainPack: "executive_support",
      lifecycleState: "needs_review",
      autonomyMode: "supervised",
      promotionState: "unpromoted",
      currentVersionId: "wpv_exec_1",
      caseSourceIds: [],
      policyProfile: {},
      runtimePreferenceHints: ["workflow"],
      createdAt: "2026-04-11T00:00:00.000Z",
      updatedAt: "2026-04-11T00:00:00.000Z",
    });

    await saveRoleAgent({
      id: "role_exec_1",
      tenantId: "tenant-1",
      blueprintId: null,
      name: "Virtual CEO",
      departmentLabel: "Executive",
      lifecycleState: "active",
      healthState: "healthy",
      currentAutonomyTier: "supervised",
      activeContractId: "role_contract_1",
      bridgeTeamId: null,
      roomId: "room_exec",
      ownerUserId: 99,
      ownershipContext: {},
      tags: ["executive"],
      lastCheckpointAt: null,
      lastRoutineRunId: null,
      createdAt: "2026-04-11T00:00:00.000Z",
      updatedAt: "2026-04-11T00:00:00.000Z",
    });

    await saveRoleContract({
      id: "role_contract_1",
      tenantId: "tenant-1",
      roleId: "role_exec_1",
      versionNumber: 1,
      status: "active",
      missionStatement: "Continuously review and route executive operating work",
      kpiTargets: [],
      authorityEnvelope: {
        autonomyTier: "supervised",
        connectorFamilies: [],
        sideEffectCeiling: "read_only",
        monthlyBudgetLimit: 100,
        regulatedActionLabels: [],
        requiresApprovalFor: [],
        visibilityDefaults: ["owner_full", "delegated_minimum", "redacted_summary", "shared_reference", "operator_review"],
      },
      workpackBindingIds: ["role_bind_1"],
      visibilityMatrix: {
        role_messages: ["owner_full", "delegated_minimum", "redacted_summary"],
        room_threads: ["redacted_summary", "shared_reference"],
      },
      notes: "",
      activatedAt: "2026-04-11T00:00:00.000Z",
      supersededByContractId: null,
      createdAt: "2026-04-11T00:00:00.000Z",
    });

    await saveRoleWorkpackBinding({
      id: "role_bind_1",
      tenantId: "tenant-1",
      roleId: "role_exec_1",
      contractId: "role_contract_1",
      label: "Executive queue binding",
      workpackFamily: "wp_exec",
      benchmarkTrack: null,
      pinnedVersionId: "wpv_exec_1",
      resolutionPolicy: "pinned_version",
      rollbackBaselineVersionId: "wpv_exec_1",
      connectorCeilingFamilies: [],
      sideEffectCeiling: "read_only",
      budgetCeiling: 10,
      regulatedBoundaryLabel: null,
      active: true,
      createdAt: "2026-04-11T00:00:00.000Z",
    });

    await saveRoleRoutine({
      id: "role_routine_1",
      tenantId: "tenant-1",
      roleId: "role_exec_1",
      contractId: "role_contract_1",
      title: "Executive queue sweep",
      description: "Recurring queue review for the executive role",
      status: "active",
      autonomyTier: "supervised",
      workpackBindingIds: ["role_bind_1"],
      schedule: {
        triggerType: "manual",
      },
      concurrencyPolicy: "singleton",
      slaMinutes: 60,
      partitionKeyField: null,
      nextWakeAt: null,
      lastWakeAt: null,
      rollbackBaselineVersionId: "wpv_exec_1",
      createdAt: "2026-04-11T00:00:00.000Z",
      updatedAt: "2026-04-11T00:00:00.000Z",
    });
  }

  it("drives a due role routine through workpack launch and reconcile", async () => {
    await seedRoleAndWorkpack();

    launchWorkpackMock.mockImplementation(async (input: {
      workpackId: string;
      autonomyMode?: "supervised" | "autonomous";
      trigger?: "manual" | "schedule" | "event" | "role_agent";
      triggerSource?: string;
    }) => {
      const run = await saveWorkpackRun({
        id: "wrun_exec_1",
        workpackId: input.workpackId,
        versionId: "wpv_exec_1",
        tenantId: "tenant-1",
        trigger: input.trigger ?? "role_agent",
        triggerSource: input.triggerSource ?? "role_routine_run:test",
        scheduleId: null,
        startedAt: "2026-04-11T01:00:00.000Z",
        endedAt: null,
        status: "running",
        autonomyMode: input.autonomyMode ?? "supervised",
        plannedSteps: [],
        actualSteps: [],
        approvalCheckpoints: [],
        artifactReferences: [],
        connectorSummaries: [],
        notes: "Mocked launch for role execution flow regression",
      });

      return {
        run,
        exceptionIds: [],
        readinessReason: "ready",
      };
    });

    const tickResult = await tickRoleRoutineScheduler({
      tenantId: "tenant-1",
      claimantId: "role-scheduler:test",
      now: new Date("2026-04-11T01:00:00.000Z"),
      executeRoleRoutineRun: async (routineRunId) => {
        await executeRoleRoutineRun({ routineRunId, requestedBy: 99 });
      },
    });

    expect(tickResult.enqueuedQueueItemIds).toHaveLength(1);
    expect(tickResult.claimedQueueItemIds).toHaveLength(1);
    expect(tickResult.launchedRoutineRunIds).toHaveLength(1);
    expect(launchWorkpackMock).toHaveBeenCalledWith(expect.objectContaining({
      workpackId: "wp_exec",
      autonomyMode: "supervised",
      trigger: "role_agent",
      triggerSource: expect.stringContaining("role_routine_run:"),
    }));

    const queueItems = await listRoleQueueItemsByTenant("tenant-1");
    expect(queueItems).toHaveLength(1);
    expect(queueItems[0]).toEqual(expect.objectContaining({
      status: "completed",
      claimState: "released",
      routineId: "role_routine_1",
    }));

    const routineRuns = await listRoleRoutineRunsForRoutine("role_routine_1");
    expect(routineRuns).toHaveLength(1);
    expect(routineRuns[0]).toEqual(expect.objectContaining({
      status: "running",
      selectedWorkpackFamily: "wp_exec",
      resolvedWorkpackVersionId: "wpv_exec_1",
      linkedWorkpackRunIds: ["wrun_exec_1"],
      resolutionPolicy: "pinned_version",
    }));

    const checkpointHealth = await getRoleCheckpointHealth("role_exec_1");
    expect(checkpointHealth.freshnessTier).toBe("fresh");
    expect(checkpointHealth.checkpoint?.routineRunId).toBe(routineRuns[0].id);
    expect(checkpointHealth.checkpoint?.objectiveSummary).toContain("launched workpack run wrun_exec_1");

    const launchedWorkpackRun = await getWorkpackRun("wrun_exec_1");
    expect(launchedWorkpackRun?.status).toBe("running");

    await updateWorkpackRun("wrun_exec_1", (run) => ({
      ...run,
      status: "succeeded",
      endedAt: "2026-04-11T01:03:00.000Z",
      notes: `${run.notes}\nCompleted by mock reconcile`,
    }));

    const reconciledRoutineRunIds = await reconcileRoleRoutineRuns({ tenantId: "tenant-1" });
    expect(reconciledRoutineRunIds).toEqual([routineRuns[0].id]);

    const reconciledRoutineRun = await getRoleRoutineRun(routineRuns[0].id);
    expect(reconciledRoutineRun).toEqual(expect.objectContaining({
      status: "succeeded",
      endedAt: "2026-04-11T01:03:00.000Z",
    }));

    const roleAgent = await getRoleAgent("role_exec_1");
    expect(roleAgent?.healthState).toBe("healthy");
    expect(roleAgent?.lastRoutineRunId).toBe(routineRuns[0].id);
  });
});
