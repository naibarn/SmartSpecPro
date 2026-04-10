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
    reasonCode: "ready_for_exception_test",
    publicationScope: "tenant_local",
    trustTags: [],
    evidenceCompleteness: 0.9,
    benchmarkCandidate: true,
    rollbackAvailable: true,
  })),
}));

vi.mock("../workerSchedulerService", () => ({
  queueWorkerJobByRuntime: vi.fn().mockResolvedValue({
    created: true,
    job: {
      id: "worker-job-exception",
      status: "queued",
      runtimeType: "openclaw_gateway",
      jobType: "plugin_workflow_task",
    },
  }),
}));

import { compileWorkpackExecutionPlan } from "../workpackCompilerService";
import { createDraftWorkpack } from "../workpackIntakeService";
import { launchWorkpack } from "../workpackLaunchService";
import {
  listWorkpackExceptionInbox,
  normalizeWorkpackException,
  resolveWorkpackException,
} from "../workpackExceptionService";
import {
  getWorkpackDetail,
  resetWorkpackStore,
  updateWorkpack,
  updateWorkpackVersion,
} from "../workpackPersistence";

describe("workpackExceptionService", () => {
  beforeEach(async () => {
    await resetWorkpackStore();
  });

  it("normalizes raw failures into a unified workpack exception shape", async () => {
    const draft = await createDraftWorkpack({
      tenantId: "tenant-1",
      title: "Store keeper daily count",
      goal: "Count inventory discrepancies",
      domainPack: "procurement_ops",
      sources: [
        {
          type: "document",
          title: "Inventory SOP",
          sourceText: "Compare inventory movement and reconcile variances.",
        },
      ],
    });

    const exceptionRecord = await normalizeWorkpackException({
      workpackId: draft.workpack.id,
      reasonCategory: "schema_mismatch",
      reasonCode: "field_drift",
      title: "Schema drift",
      summary: "Vendor portal field names changed",
      remediationPointer: "/workpacks/test/connectors",
      nextAction: "Refresh field mappings",
      mismatchCategory: "schema_mismatch",
    });

    expect(exceptionRecord.reasonCode).toBe("field_drift");
    expect(exceptionRecord.mismatchCategory).toBe("schema_mismatch");
  });

  it("approves a boundary by opening a continuation run instead of only closing the exception", async () => {
    const draft = await createDraftWorkpack({
      tenantId: "tenant-1",
      title: "HR onboarding",
      goal: "Prepare onboarding packet",
      domainPack: "hr_ops",
      sources: [
        {
          type: "document",
          title: "Onboarding SOP",
          sourceText: "Create onboarding checklist and HRIS record.",
        },
      ],
    });
    await compileWorkpackExecutionPlan({ workpackId: draft.workpack.id });

    const detail = await getWorkpackDetail(draft.workpack.id);
    expect(detail).not.toBeNull();

    await updateWorkpackVersion(detail!.version.id, (version) => ({
      ...version,
      playbook: {
        ...version.playbook,
        steps: [{
          ...version.playbook.steps[0]!,
          id: "step_approval",
          title: "Commit onboarding record",
          objective: "Create the onboarding record in the HR system.",
          expectedOutcome: "Employee record created",
          preferredRuntimePath: "workflow",
          allowedFallbackPaths: [],
          requiredConnectorFamilies: [],
          sideEffectClass: "external_write",
          requiresApproval: true,
        }],
        clarificationQueue: [],
      },
      connectorMaps: [],
      executionPlan: {
        ...version.executionPlan!,
        steps: [{
          ...version.executionPlan!.steps[0]!,
          id: "step_approval",
          title: "Commit onboarding record",
          objective: "Create the onboarding record in the HR system.",
          expectedOutcome: "Employee record created",
          preferredRuntimePath: "workflow",
          allowedFallbackPaths: [],
          requiredConnectorFamilies: [],
          sideEffectClass: "external_write",
          requiresApproval: true,
        }],
      },
    }));
    await updateWorkpack(draft.workpack.id, (workpack) => ({
      ...workpack,
      lifecycleState: "draft",
      updatedAt: "2026-04-10T00:00:00.000Z",
    }));

    const launchResult = await launchWorkpack({
      workpackId: draft.workpack.id,
      autonomyMode: "supervised",
      requestedBy: 7,
    });

    expect(launchResult.run.status).toBe("awaiting_approval");

    const updatedDetail = await getWorkpackDetail(draft.workpack.id);
    const boundaryException = updatedDetail?.exceptions.find((record) => record.reasonCode === "approval_boundary_pending");
    expect(boundaryException).toBeTruthy();

    const resolved = await resolveWorkpackException({
      tenantId: "tenant-1",
      exceptionId: boundaryException!.id,
      action: "approve",
      requestedBy: 11,
    });

    const afterApproval = await getWorkpackDetail(draft.workpack.id);
    const continuationRun = afterApproval?.runs.find((run) => run.id !== launchResult.run.id);

    expect(resolved.resolvedAt).not.toBeNull();
    expect(continuationRun?.status).toBe("queued");
    expect(continuationRun?.approvalCheckpoints[0]?.approved).toBe(true);
    expect(continuationRun?.actualSteps[0]?.status).toBe("queued");
  });

  it("keeps connector exceptions open when remap still fails closed, and rejects cross-tenant access", async () => {
    const draft = await createDraftWorkpack({
      tenantId: "tenant-1",
      title: "Sales follow-up",
      goal: "Update CRM after inbound lead",
      domainPack: "sales_ops",
      sources: [
        {
          type: "document",
          title: "CRM flow",
          sourceText: "Update CRM and send follow-up.",
        },
      ],
    });
    await compileWorkpackExecutionPlan({ workpackId: draft.workpack.id });

    const exceptionRecord = await normalizeWorkpackException({
      workpackId: draft.workpack.id,
      reasonCategory: "connector_auth",
      reasonCode: "connector_scope_missing",
      title: "Connector scope missing",
      summary: "CRM write scope is unavailable.",
      remediationPointer: `/workpacks/${draft.workpack.id}/connectors`,
      nextAction: "Refresh connector auth",
    });

    await expect(resolveWorkpackException({
      tenantId: "tenant-2",
      exceptionId: exceptionRecord.id,
      action: "remap_connector",
      requestedBy: 5,
    })).rejects.toThrow(/unknown workpack exception/i);

    const stillOpen = await resolveWorkpackException({
      tenantId: "tenant-1",
      exceptionId: exceptionRecord.id,
      action: "remap_connector",
      requestedBy: 5,
    });

    const inbox = await listWorkpackExceptionInbox(draft.workpack.id);

    expect(stillOpen.resolvedAt).toBeNull();
    expect(stillOpen.nextAction).toMatch(/still requires mapping or scope fixes/i);
    expect(inbox.some((entry) => entry.exceptionIds.includes(exceptionRecord.id))).toBe(true);
  });
});
