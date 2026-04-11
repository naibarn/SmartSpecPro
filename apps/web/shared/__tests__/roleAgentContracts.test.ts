/**
 * @vitest-environment node
 */

import { describe, expect, it } from "vitest";

import {
  buildDefaultRoleContextGovernance,
  requiresNewRoleContractVersion,
  roleAgentSchema,
  roleBlueprintSchema,
  roleCheckpointSchema,
  roleContractSchema,
  roleMessageSchema,
  roleRoutineRunSchema,
  roleRoutineSchema,
  roleWorkpackBindingSchema,
  sanitizeRoleSensitivePayload,
} from "../roleAgentContracts";

describe("roleAgentContracts", () => {
  it("validates blueprint, role, contract, binding, routine, routine run, checkpoint, and message payloads", () => {
    const blueprint = roleBlueprintSchema.parse({
      id: "rbp_1",
      tenantId: "tenant-1",
      key: "sales_ops",
      title: "Sales Ops",
      departmentLabel: "Revenue",
      purpose: "Keep pipeline and CRM current",
      defaultMission: "Run recurring sales operations without manual babysitting",
      kpiCategories: ["throughput", "sla"],
      defaultAuthorityEnvelope: {
        autonomyTier: "guided",
        connectorFamilies: ["crm"],
        sideEffectCeiling: "bounded_write",
        monthlyBudgetLimit: 250,
        regulatedActionLabels: [],
        requiresApprovalFor: ["financial_export"],
        visibilityDefaults: ["owner_full"],
      },
      typicalConnectorFamilies: ["crm"],
      recommendedRoutineStarters: [
        {
          title: "Pipeline hygiene",
          description: "Clean stale opportunities",
          triggerType: "schedule",
          suggestedWorkpackFamilies: ["wp_sales_hygiene"],
          recommendedAutonomyTier: "guided",
        },
      ],
      createdAt: "2026-04-10T00:00:00.000Z",
      updatedAt: "2026-04-10T00:00:00.000Z",
    });

    const role = roleAgentSchema.parse({
      id: "role_1",
      tenantId: blueprint.tenantId,
      blueprintId: blueprint.id,
      name: "Virtual Sales Ops",
      departmentLabel: "Revenue",
      lifecycleState: "active",
      healthState: "healthy",
      currentAutonomyTier: "guided",
      activeContractId: "rc_1",
      bridgeTeamId: "team_1",
      roomId: "room_1",
      ownerUserId: 7,
      ownershipContext: { source: "team_bridge" },
      tags: ["pilot"],
      lastCheckpointAt: "2026-04-10T00:05:00.000Z",
      lastRoutineRunId: "rrun_1",
      createdAt: "2026-04-10T00:00:00.000Z",
      updatedAt: "2026-04-10T00:00:00.000Z",
    });

    const contract = roleContractSchema.parse({
      id: "rc_1",
      tenantId: role.tenantId,
      roleId: role.id,
      versionNumber: 1,
      status: "active",
      missionStatement: "Keep CRM pipeline trustworthy every day.",
      kpiTargets: [
        {
          key: "pipeline_sla",
          label: "Pipeline SLA",
          unit: "%",
          targetValue: 0.95,
          warningFloor: 0.9,
          criticalFloor: 0.8,
        },
      ],
      authorityEnvelope: blueprint.defaultAuthorityEnvelope,
      workpackBindingIds: ["bind_1"],
      visibilityMatrix: {
        role_memory: ["owner_full"],
      },
      notes: "",
      activatedAt: "2026-04-10T00:00:00.000Z",
      supersededByContractId: null,
      createdAt: "2026-04-10T00:00:00.000Z",
    });

    const binding = roleWorkpackBindingSchema.parse({
      id: "bind_1",
      tenantId: role.tenantId,
      roleId: role.id,
      contractId: contract.id,
      label: "CRM hygiene",
      workpackFamily: "wp_sales_hygiene",
      benchmarkTrack: null,
      pinnedVersionId: null,
      resolutionPolicy: "follow_latest_ready_in_family",
      rollbackBaselineVersionId: "wpv_baseline",
      connectorCeilingFamilies: ["crm"],
      sideEffectCeiling: "bounded_write",
      budgetCeiling: 25,
      regulatedBoundaryLabel: null,
      active: true,
      createdAt: "2026-04-10T00:00:00.000Z",
    });

    const routine = roleRoutineSchema.parse({
      id: "routine_1",
      tenantId: role.tenantId,
      roleId: role.id,
      contractId: contract.id,
      title: "Nightly hygiene",
      description: "Clean and route stale opportunities nightly.",
      status: "active",
      autonomyTier: "guided",
      workpackBindingIds: [binding.id],
      schedule: {
        triggerType: "schedule",
        intervalMinutes: 1440,
      },
      concurrencyPolicy: "singleton",
      slaMinutes: 120,
      partitionKeyField: null,
      nextWakeAt: "2026-04-11T00:00:00.000Z",
      lastWakeAt: null,
      rollbackBaselineVersionId: "wpv_baseline",
      createdAt: "2026-04-10T00:00:00.000Z",
      updatedAt: "2026-04-10T00:00:00.000Z",
    });

    const run = roleRoutineRunSchema.parse({
      id: "rrun_1",
      tenantId: role.tenantId,
      roleId: role.id,
      routineId: routine.id,
      contractId: contract.id,
      status: "queued",
      triggerSource: "schedule",
      idempotencyKey: "tenant-1:role_1:routine_1:2026-04-11",
      selectedWorkpackFamily: binding.workpackFamily,
      resolvedWorkpackVersionId: "wpv_ready_2",
      linkedWorkpackRunIds: ["wpr_1"],
      checkpointId: "chk_1",
      recoveryState: "fresh",
      resolutionPolicy: binding.resolutionPolicy,
      previousResolvedVersionId: "wpv_ready_1",
      rollbackBaselineVersionId: binding.rollbackBaselineVersionId,
      partitionKey: null,
      blockerCodes: [],
      currentObjectiveSummary: "Queue the nightly CRM hygiene pass",
      approvalRequestIds: [],
      startedAt: "2026-04-11T00:00:00.000Z",
      endedAt: null,
      createdAt: "2026-04-11T00:00:00.000Z",
      updatedAt: "2026-04-11T00:00:00.000Z",
    });

    const checkpoint = roleCheckpointSchema.parse({
      id: "chk_1",
      tenantId: role.tenantId,
      roleId: role.id,
      routineId: routine.id,
      routineRunId: run.id,
      recoveryState: "fresh",
      objectiveSummary: "Dispatch the current hygiene cycle",
      activeQueueSummary: ["1 queued wake"],
      recentDecisions: ["Selected wp_sales_hygiene"],
      pendingApprovalIds: [],
      nextWakeConditions: ["next scheduled wake 2026-04-12"],
      progressCursor: { stage: "dispatching" },
      healthState: "healthy",
      lastSuccessfulOutcomeSummary: null,
      memorySummaryIds: [],
      governance: buildDefaultRoleContextGovernance(),
      createdAt: "2026-04-11T00:00:00.000Z",
      updatedAt: "2026-04-11T00:00:00.000Z",
    });

    const message = roleMessageSchema.parse({
      id: "msg_1",
      tenantId: role.tenantId,
      roomId: "room_1",
      senderRoleId: role.id,
      recipientRoleId: "role_2",
      recipientGroup: null,
      relatedRoutineId: routine.id,
      relatedRoutineRunId: run.id,
      relatedWorkpackFamily: binding.workpackFamily,
      relatedWorkpackRunId: "wpr_1",
      intentType: "handoff",
      priority: "high",
      dueState: "pending",
      actionabilityState: "pending",
      provenance: {
        source: "team_room",
        actorId: role.id,
        actorType: "role",
        traceId: "trace_1",
      },
      visibilityClass: "delegated_minimum",
      contentSummary: "Please review the blocked opportunity cluster.",
      metadata: { checkpointId: checkpoint.id },
      createdAt: "2026-04-11T00:00:00.000Z",
      acknowledgedAt: null,
    });

    expect(binding.resolutionPolicy).toBe("follow_latest_ready_in_family");
    expect(run.linkedWorkpackRunIds).toContain("wpr_1");
    expect(message.relatedRoutineRunId).toBe(run.id);
  });

  it("fails closed on unknown lifecycle and delegation values", () => {
    expect(() => roleAgentSchema.parse({
      id: "role_1",
      tenantId: "tenant-1",
      name: "Bad Role",
      departmentLabel: "Ops",
      lifecycleState: "running",
      createdAt: "2026-04-10T00:00:00.000Z",
      updatedAt: "2026-04-10T00:00:00.000Z",
    })).toThrow();

    expect(() => roleMessageSchema.parse({
      id: "msg_1",
      tenantId: "tenant-1",
      senderRoleId: "role_1",
      intentType: "chat",
      provenance: {
        source: "team_room",
      },
      contentSummary: "Hello",
      createdAt: "2026-04-10T00:00:00.000Z",
    })).toThrow();
  });

  it("requires a new role-contract version for active material changes", () => {
    const current = roleContractSchema.parse({
      id: "rc_1",
      tenantId: "tenant-1",
      roleId: "role_1",
      versionNumber: 1,
      status: "active",
      missionStatement: "Original mission",
      kpiTargets: [],
      authorityEnvelope: {
        autonomyTier: "guided",
        connectorFamilies: ["crm"],
        sideEffectCeiling: "bounded_write",
        monthlyBudgetLimit: 100,
        regulatedActionLabels: [],
        requiresApprovalFor: [],
        visibilityDefaults: ["owner_full"],
      },
      workpackBindingIds: ["bind_1"],
      visibilityMatrix: {},
      notes: "",
      activatedAt: "2026-04-10T00:00:00.000Z",
      supersededByContractId: null,
      createdAt: "2026-04-10T00:00:00.000Z",
    });

    const changedMission = {
      ...current,
      missionStatement: "Expanded mission",
    };

    expect(requiresNewRoleContractVersion(current, changedMission)).toBe(true);
    expect(requiresNewRoleContractVersion(current, { ...current, notes: "typo fix" })).toBe(false);
  });

  it("redacts secret-like role payload fields", () => {
    expect(
      sanitizeRoleSensitivePayload({
        authToken: "secret",
        apiKey: "top-secret",
        summary: "allowed",
      }),
    ).toEqual({
      authToken: "[REDACTED]",
      apiKey: "[REDACTED]",
      summary: "allowed",
    });
  });
});

