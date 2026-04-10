import {
  type ReplayDiffCategory,
  type WorkpackException,
  workpackExceptionSchema,
} from "../../shared/workpackContracts";
import { createWorkpackId, getWorkpackDetail, getWorkpackException, saveTelemetryEvent, saveWorkpackException, updateWorkpack } from "./workpackPersistence";

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

export function normalizeWorkpackException(input: NormalizeWorkpackExceptionInput): WorkpackException {
  const detail = getWorkpackDetail(input.workpackId);
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

  saveWorkpackException(exceptionRecord);
  saveTelemetryEvent({
    id: createWorkpackId("evt"),
    tenantId: detail.workpack.tenantId,
    workpackId: detail.workpack.id,
    versionId: detail.version.id,
    eventName: "exception_opened",
    detail: `${exceptionRecord.reasonCode}: ${exceptionRecord.summary}`,
    createdAt,
  });

  updateWorkpack(detail.workpack.id, (workpack) => ({
    ...workpack,
    lifecycleState: workpack.lifecycleState === "archived" ? "archived" : "needs_review",
    updatedAt: createdAt,
  }));

  return exceptionRecord;
}

export function resolveWorkpackException(
  input: string | {
    exceptionId: string;
    action?: WorkpackException["allowedActions"][number];
  },
): WorkpackException {
  const exceptionId = typeof input === "string" ? input : input.exceptionId;
  const action = typeof input === "string" ? undefined : input.action;
  const record = getWorkpackException(exceptionId);
  if (!record) {
    throw new Error(`Unknown workpack exception: ${exceptionId}`);
  }
  if (record.resolvedAt) return record;

  const resolvedAt = nowIso();
  const next = {
    ...record,
    resolvedAt,
    nextAction: action ? `${record.nextAction} (actioned via ${action})` : record.nextAction,
  };
  saveWorkpackException(next);

  const detail = getWorkpackDetail(record.workpackId);
  if (detail) {
    if (action === "downgrade_autonomy") {
      updateWorkpack(detail.workpack.id, (workpack) => ({
        ...workpack,
        autonomyMode: "draft",
        lifecycleState: "needs_review",
        updatedAt: resolvedAt,
      }));
    }
    saveTelemetryEvent({
      id: createWorkpackId("evt"),
      tenantId: detail.workpack.tenantId,
      workpackId: detail.workpack.id,
      versionId: detail.version.id,
      eventName: "exception_resolved",
      detail: `${record.reasonCode}: resolved`,
      createdAt: resolvedAt,
    });
  }

  return next;
}

export function listWorkpackExceptionInbox(workpackId: string): WorkpackExceptionInboxEntry[] {
  const detail = getWorkpackDetail(workpackId);
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
