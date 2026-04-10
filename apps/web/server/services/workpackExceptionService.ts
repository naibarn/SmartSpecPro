import {
  type ReplayDiffCategory,
  type WorkpackException,
  type WorkpackRun,
  workpackExceptionSchema,
} from "../../shared/workpackContracts";
import {
  createWorkpackId,
  getWorkpackDetail,
  getSimulationRun,
  getWorkpackExceptionForTenant,
  saveTelemetryEvent,
  saveWorkpackException,
  updateWorkpack,
} from "./workpackPersistence";

export interface NormalizeWorkpackExceptionInput {
  workpackId: string;
  versionId?: string | null;
  runId?: string | null;
  simulationRunId?: string | null;
  reasonCategory: WorkpackException["reasonCategory"];
  reasonCode: string;
  title: string;
  summary: string;
  remediationPointer: string;
  nextAction: string;
  riskClass?: WorkpackException["riskClass"];
  mismatchCategory?: ReplayDiffCategory | null;
}

export interface WorkpackExceptionInboxEntry {
  workpackId: string;
  versionId: string;
  reasonCode: string;
  reasonCategory: WorkpackException["reasonCategory"];
  riskClass: WorkpackException["riskClass"];
  count: number;
  latestCreatedAt: string;
  nextAction: string;
  remediationPointer: string;
  title: string;
  exceptionIds: string[];
  allowedActions: WorkpackException["allowedActions"];
}

export interface ResolveWorkpackExceptionInput {
  tenantId: string;
  exceptionId: string;
  action?: WorkpackException["allowedActions"][number];
  requestedBy?: number | null;
}

function nowIso(): string {
  return new Date().toISOString();
}

function deriveRiskClass(input: NormalizeWorkpackExceptionInput): WorkpackException["riskClass"] {
  if (input.riskClass) return input.riskClass;
  if (
    input.reasonCategory === "irreversible_action"
    || input.reasonCategory === "policy_boundary"
    || input.reasonCode.includes("financial")
  ) {
    return "critical";
  }
  if (
    input.reasonCategory === "connector_auth"
    || input.reasonCategory === "schema_mismatch"
    || input.reasonCategory === "drift"
  ) {
    return "high";
  }
  if (input.reasonCategory === "ambiguity" || input.reasonCategory === "operational") {
    return "medium";
  }
  return "low";
}

function deriveAllowedActions(
  reasonCategory: WorkpackException["reasonCategory"],
): WorkpackException["allowedActions"] {
  const base: WorkpackException["allowedActions"] = ["mark_false_positive", "escalate_admin"];
  if (reasonCategory === "connector_auth" || reasonCategory === "schema_mismatch") {
    return [...base, "remap_connector", "retry"];
  }
  if (reasonCategory === "policy_boundary" || reasonCategory === "irreversible_action") {
    return [...base, "approve", "reject", "downgrade_autonomy"];
  }
  if (reasonCategory === "ambiguity") {
    return [...base, "regenerate_workpack", "retry", "reject"];
  }
  if (reasonCategory === "drift") {
    return [...base, "retry", "downgrade_autonomy", "remap_connector"];
  }
  return [...base, "retry"];
}

export async function normalizeWorkpackException(input: NormalizeWorkpackExceptionInput): Promise<WorkpackException> {
  const detail = await getWorkpackDetail(input.workpackId);
  if (!detail) {
    throw new Error(`Unknown workpack: ${input.workpackId}`);
  }

  const createdAt = nowIso();
  const exceptionRecord = workpackExceptionSchema.parse({
    id: createWorkpackId("wpe"),
    workpackId: input.workpackId,
    versionId: input.versionId ?? detail.version.id,
    runId: input.runId ?? null,
    simulationRunId: input.simulationRunId ?? null,
    reasonCategory: input.reasonCategory,
    riskClass: deriveRiskClass(input),
    mismatchCategory: input.mismatchCategory ?? null,
    reasonCode: input.reasonCode,
    title: input.title,
    summary: input.summary,
    remediationPointer: input.remediationPointer,
    nextAction: input.nextAction,
    allowedActions: deriveAllowedActions(input.reasonCategory),
    createdAt,
    resolvedAt: null,
  });

  await saveWorkpackException(exceptionRecord);
  await saveTelemetryEvent({
    id: createWorkpackId("evt"),
    tenantId: detail.workpack.tenantId,
    workpackId: detail.workpack.id,
    versionId: detail.version.id,
    eventName: "exception_opened",
    detail: `${exceptionRecord.reasonCode}: ${exceptionRecord.summary}`,
    createdAt,
  });

  await updateWorkpack(detail.workpack.id, (workpack) => ({
    ...workpack,
    lifecycleState: workpack.lifecycleState === "archived" ? "archived" : "needs_review",
    updatedAt: createdAt,
  }));

  return exceptionRecord;
}

type WorkpackDetailRecord = NonNullable<Awaited<ReturnType<typeof getWorkpackDetail>>>;

interface ExceptionActionResult {
  resolve: boolean;
  nextAction?: string;
  detailMessage: string;
}

function findExceptionRun(detail: WorkpackDetailRecord, record: WorkpackException): WorkpackRun | null {
  if (!record.runId) return null;
  return detail.runs.find((run) => run.id === record.runId) ?? null;
}

function findContinuationStepId(detail: WorkpackDetailRecord, record: WorkpackException): string | null {
  const run = findExceptionRun(detail, record);
  const blockedApprovalStep = run?.approvalCheckpoints.find((checkpoint) => !checkpoint.approved)?.stepId ?? null;
  if (blockedApprovalStep) {
    return blockedApprovalStep;
  }

  const blockedRuntimeStep = run?.actualSteps.find((step) => step.status === "blocked" || step.status === "failed")?.stepId ?? null;
  if (blockedRuntimeStep) {
    return blockedRuntimeStep;
  }

  return detail.version.executionPlan?.steps[0]?.id ?? null;
}

async function refreshWorkpackPostExceptionState(workpackId: string): Promise<void> {
  const detail = await getWorkpackDetail(workpackId);
  if (!detail) return;

  const hasOpenExceptions = detail.exceptions.some((item) => !item.resolvedAt);
  const clarificationOpen = detail.playbook.clarificationQueue.some((question) => question.status === "pending");
  const connectorBlocked = detail.version.connectorMaps.some((map) => map.validationStatus === "blocked");
  const connectorStale = detail.version.connectorMaps.some((map) => map.validationStatus === "stale");
  const latestRun = detail.runs[0] ?? null;

  await updateWorkpack(detail.workpack.id, (workpack) => ({
    ...workpack,
    lifecycleState: workpack.lifecycleState === "archived"
      ? "archived"
      : clarificationOpen
        ? "clarification_needed"
        : hasOpenExceptions || connectorBlocked || connectorStale
          ? "needs_review"
          : latestRun?.status === "queued" || latestRun?.status === "running"
            ? latestRun.autonomyMode === "autonomous" ? "autonomous" : "supervised"
            : detail.version.executionPlan
              ? "ready"
              : "draft",
    autonomyMode: clarificationOpen || hasOpenExceptions || connectorBlocked || connectorStale
      ? workpack.autonomyMode === "autonomous" ? "supervised" : workpack.autonomyMode
      : latestRun?.status === "queued" || latestRun?.status === "running"
        ? latestRun.autonomyMode
        : workpack.autonomyMode,
    policyProfile: {
      ...workpack.policyProfile,
      safeResumeRequired: clarificationOpen || hasOpenExceptions || connectorBlocked || connectorStale,
      safeResumeReason: clarificationOpen
        ? "clarification_queue_open"
        : connectorBlocked || connectorStale
          ? "connector_revalidation_required"
          : hasOpenExceptions
            ? "open_exception_backlog"
            : null,
    },
    updatedAt: nowIso(),
  }));
}

async function performExceptionAction(
  input: ResolveWorkpackExceptionInput,
  record: WorkpackException,
  detail: WorkpackDetailRecord,
): Promise<ExceptionActionResult> {
  if (!input.action) {
    return {
      resolve: true,
      detailMessage: "Exception closed manually.",
    };
  }

  if (!record.allowedActions.includes(input.action)) {
    throw new Error(`Action ${input.action} is not allowed for exception ${record.id}`);
  }

  const continuationStepId = findContinuationStepId(detail, record);

  switch (input.action) {
    case "approve": {
      if (!continuationStepId) {
        throw new Error("No approval boundary step is available to continue.");
      }
      const { continueWorkpackRunFromStep } = await import("./workpackLaunchService");
      const result = await continueWorkpackRunFromStep({
        workpackId: detail.workpack.id,
        stepId: continuationStepId,
        sourceRunId: record.runId ?? null,
        requestedBy: input.requestedBy ?? null,
        autonomyMode: detail.workpack.autonomyMode === "draft" ? "supervised" : detail.workpack.autonomyMode,
        approvedBoundaryStepIds: [continuationStepId],
        triggerSource: "exception_inbox:approve",
      });
      return {
        resolve: true,
        detailMessage: `Approved boundary and opened continuation run ${result.run.id}.`,
      };
    }
    case "retry": {
      if (record.simulationRunId) {
        const simulationRun = await getSimulationRun(record.simulationRunId);
        if (simulationRun) {
          const { simulateWorkpack } = await import("./workpackSimulationService");
          const result = await simulateWorkpack({
            workpackId: detail.workpack.id,
            requestedBy: input.requestedBy ?? null,
            mode: simulationRun.mode,
            fixtureId: simulationRun.fixtureId ?? null,
            replayRunId: simulationRun.runId ?? null,
          });
          return {
            resolve: true,
            detailMessage: `Reran simulation as ${result.simulationRun.id}.`,
          };
        }
      }
      if (!continuationStepId) {
        const { launchWorkpack } = await import("./workpackLaunchService");
        const result = await launchWorkpack({
          workpackId: detail.workpack.id,
          requestedBy: input.requestedBy ?? null,
          autonomyMode: detail.workpack.autonomyMode === "draft" ? "supervised" : detail.workpack.autonomyMode,
          triggerSource: "exception_inbox:retry",
        });
        return {
          resolve: true,
          detailMessage: `Retried the full workpack as run ${result.run.id}.`,
        };
      }
      const { continueWorkpackRunFromStep } = await import("./workpackLaunchService");
      const result = await continueWorkpackRunFromStep({
        workpackId: detail.workpack.id,
        stepId: continuationStepId,
        sourceRunId: record.runId ?? null,
        requestedBy: input.requestedBy ?? null,
        autonomyMode: detail.workpack.autonomyMode === "draft" ? "supervised" : detail.workpack.autonomyMode,
        triggerSource: "exception_inbox:retry",
      });
      return {
        resolve: true,
        detailMessage: `Retried automation from ${continuationStepId} as run ${result.run.id}.`,
      };
    }
    case "remap_connector": {
      const { validateConnectorMaps } = await import("./workpackConnectorService");
      const validation = await validateConnectorMaps({
        workpackId: detail.workpack.id,
        runId: record.runId ?? null,
        emitExceptions: false,
      });
      if (validation.blocked || validation.stale) {
        await refreshWorkpackPostExceptionState(detail.workpack.id);
        return {
          resolve: false,
          nextAction: "Connector posture refreshed but still requires mapping or scope fixes before automation can continue.",
          detailMessage: "Connector validation still needs attention after remap.",
        };
      }
      if (continuationStepId) {
        const { continueWorkpackRunFromStep } = await import("./workpackLaunchService");
        const result = await continueWorkpackRunFromStep({
          workpackId: detail.workpack.id,
          stepId: continuationStepId,
          sourceRunId: record.runId ?? null,
          requestedBy: input.requestedBy ?? null,
          autonomyMode: detail.workpack.autonomyMode === "draft" ? "supervised" : detail.workpack.autonomyMode,
          triggerSource: "exception_inbox:remap_connector",
        });
        return {
          resolve: true,
          detailMessage: `Connector posture cleared and continuation run ${result.run.id} started.`,
        };
      }
      await refreshWorkpackPostExceptionState(detail.workpack.id);
      return {
        resolve: true,
        detailMessage: "Connector posture revalidated successfully.",
      };
    }
    case "regenerate_workpack": {
      const { compileWorkpackExecutionPlan } = await import("./workpackCompilerService");
      await compileWorkpackExecutionPlan({
        workpackId: detail.workpack.id,
        requestedBy: input.requestedBy ?? null,
      });
      await refreshWorkpackPostExceptionState(detail.workpack.id);
      return {
        resolve: false,
        nextAction: "Execution plan regenerated. Review the updated plan and retry only after the missing context is complete.",
        detailMessage: "Recompiled the workpack execution plan.",
      };
    }
    case "escalate_admin": {
      const { applyWorkpackIncidentAction } = await import("./workpackIncidentControlService");
      await applyWorkpackIncidentAction({
        tenantId: input.tenantId,
        workpackId: detail.workpack.id,
        versionId: detail.version.id,
        action: "quarantine",
        reason: `Escalated from exception ${record.reasonCode}`,
      });
      return {
        resolve: true,
        detailMessage: "Escalated the exception into incident quarantine.",
      };
    }
    case "reject": {
      await updateWorkpack(detail.workpack.id, (workpack) => ({
        ...workpack,
        autonomyMode: "draft",
        lifecycleState: "needs_review",
        policyProfile: {
          ...workpack.policyProfile,
          safeResumeRequired: true,
          safeResumeReason: "exception_rejected",
        },
        updatedAt: nowIso(),
      }));
      return {
        resolve: true,
        detailMessage: "Rejected the exception path and downgraded the workpack to draft review.",
      };
    }
    case "downgrade_autonomy": {
      await updateWorkpack(detail.workpack.id, (workpack) => ({
        ...workpack,
        autonomyMode: "draft",
        lifecycleState: "needs_review",
        policyProfile: {
          ...workpack.policyProfile,
          safeResumeRequired: true,
          safeResumeReason: "autonomy_downgraded_by_exception",
        },
        updatedAt: nowIso(),
      }));
      return {
        resolve: true,
        detailMessage: "Autonomy downgraded to draft until the exception is reviewed.",
      };
    }
    case "mark_false_positive": {
      return {
        resolve: true,
        detailMessage: "Marked the exception as a false positive.",
      };
    }
    default: {
      const exhaustiveCheck: never = input.action;
      throw new Error(`Unhandled exception action: ${exhaustiveCheck}`);
    }
  }
}

export async function resolveWorkpackException(input: ResolveWorkpackExceptionInput): Promise<WorkpackException> {
  const record = await getWorkpackExceptionForTenant(input.tenantId, input.exceptionId);
  if (!record) {
    throw new Error(`Unknown workpack exception: ${input.exceptionId}`);
  }
  if (record.resolvedAt) return record;

  const detail = await getWorkpackDetail(record.workpackId);
  if (!detail || detail.workpack.tenantId !== input.tenantId) {
    throw new Error(`Unknown workpack for tenant: ${record.workpackId}`);
  }

  const actionResult = await performExceptionAction(input, record, detail);
  const handledAt = nowIso();
  const next = workpackExceptionSchema.parse({
    ...record,
    resolvedAt: actionResult.resolve ? handledAt : null,
    nextAction: actionResult.nextAction
      ?? (input.action ? `${record.nextAction} (actioned via ${input.action})` : record.nextAction),
  });
  await saveWorkpackException(next);

  if (actionResult.resolve && input.action !== "reject" && input.action !== "downgrade_autonomy" && input.action !== "escalate_admin") {
    await refreshWorkpackPostExceptionState(detail.workpack.id);
  }

  await saveTelemetryEvent({
    id: createWorkpackId("evt"),
    tenantId: detail.workpack.tenantId,
    workpackId: detail.workpack.id,
    versionId: detail.version.id,
    eventName: actionResult.resolve ? "exception_resolved" : "exception_action_applied",
    detail: `${record.reasonCode}: ${actionResult.detailMessage}`,
    createdAt: handledAt,
  });

  return next;
}

export async function listWorkpackExceptionInbox(workpackId: string): Promise<WorkpackExceptionInboxEntry[]> {
  const detail = await getWorkpackDetail(workpackId);
  if (!detail) {
    throw new Error(`Unknown workpack: ${workpackId}`);
  }

  const grouped = new Map<string, WorkpackExceptionInboxEntry>();
  for (const record of detail.exceptions.filter((item) => !item.resolvedAt)) {
    const key = [record.reasonCode, record.riskClass, record.versionId].join(":");
    const existing = grouped.get(key);
    if (existing) {
      existing.count += 1;
      existing.exceptionIds.push(record.id);
      if (record.createdAt > existing.latestCreatedAt) {
        existing.latestCreatedAt = record.createdAt;
      }
      continue;
    }
    grouped.set(key, {
      workpackId: record.workpackId,
      versionId: record.versionId,
      reasonCode: record.reasonCode,
      reasonCategory: record.reasonCategory,
      riskClass: record.riskClass,
      count: 1,
      latestCreatedAt: record.createdAt,
      nextAction: record.nextAction,
      remediationPointer: record.remediationPointer,
      title: record.title,
      exceptionIds: [record.id],
      allowedActions: record.allowedActions,
    });
  }

  return Array.from(grouped.values()).sort((left, right) => right.latestCreatedAt.localeCompare(left.latestCreatedAt));
}
