import { and, eq } from "drizzle-orm";
import {
  disableHyperframesTemplate,
  enableHyperframesTemplate,
  listHyperframesTemplateRegistry,
} from "./hyperframesTemplateRegistry";
import {
  cancelHyperframesRenderJob,
  getHyperframesRenderProjection,
} from "./hyperframesRenderService";
import {
  redactHyperframesDiagnostics,
} from "./hyperframesCompositionSanitizer";
import { getDb } from "../db";
import { auditLogger } from "./auditLogger";
import { getTraceId } from "./traceContext";
import { apiAuditEvents, marketplaceAutoReviewOutboxJobs } from "../../drizzle/schema";
import type { HyperframesAuthContext } from "./hyperframesFeatureAccessService";
import {
  HYPERFRAMES_MARKETPLACE_CONTRACT_VERSION,
  stableHash,
  type HyperframesRenderStatusProjection,
} from "@shared/hyperframes/contracts";

export interface HyperframesOperatorAuth extends HyperframesAuthContext {
  role?: string | null;
  operatorEnabled?: boolean;
}

function assertOperator(auth: HyperframesOperatorAuth): void {
  const role = auth.role ?? "";
  const allowed =
    ["admin", "system_agent"].includes(role) ||
    (Boolean(auth.operatorEnabled) &&
      ["owner", "operator", "support"].includes(role));
  if (!allowed) {
    throw new Error("HyperFrames operator permission required");
  }
}

export interface HyperframesOperatorAuditEvent {
  action: string;
  userId: number;
  tenantId: string;
  renderJobId?: string | null;
  productId?: string | null;
  runId?: string | null;
  templateId?: string | null;
  reason?: string | null;
  redacted: true;
}

export function buildHyperframesOperatorAuditEvent(input: {
  auth: HyperframesOperatorAuth;
  action: string;
  renderJobId?: string | null;
  productId?: string | null;
  runId?: string | null;
  templateId?: string | null;
  reason?: string | null;
}): HyperframesOperatorAuditEvent {
  assertOperator(input.auth);
  return {
    action: input.action,
    userId: input.auth.userId,
    tenantId: input.auth.tenantId ?? "default",
    renderJobId: input.renderJobId ?? null,
    productId: input.productId ?? null,
    runId: input.runId ?? null,
    templateId: input.templateId ?? null,
    reason: input.reason ? redactHyperframesDiagnostics(input.reason) : null,
    redacted: true,
  };
}

export function buildHyperframesMetricsSnapshot(input: {
  renders: Array<Pick<HyperframesRenderStatusProjection, "status" | "qaStatus">>;
}) {
  const counters = {
    queued: 0,
    started: 0,
    completed: 0,
    cancelled: 0,
    transientFailures: 0,
    permanentFailures: 0,
    deadLettered: 0,
    libraryReady: 0,
  };
  for (const render of input.renders) {
    if (render.status === "queued") counters.queued += 1;
    if (
      ["staging_assets", "linting", "snapshotting", "inspecting", "rendering", "qa_checking"].includes(
        render.status
      )
    ) {
      counters.started += 1;
    }
    if (render.status === "completed" || render.status === "saved_to_library") {
      counters.completed += 1;
    }
    if (render.status === "cancelled" || render.status === "cancel_requested") {
      counters.cancelled += 1;
    }
    if (render.status === "failed_transient") counters.transientFailures += 1;
    if (render.status === "failed_permanent" || render.status === "failed") {
      counters.permanentFailures += 1;
    }
    if (render.status === "dead_lettered") counters.deadLettered += 1;
    if (
      (render.status === "completed" || render.status === "saved_to_library") &&
      (render.qaStatus === "passed" || render.qaStatus === "passed_with_warnings")
    ) {
      counters.libraryReady += 1;
    }
  }
  return counters;
}

export interface HyperframesOperatorAuditSink {
  recordAuditEvent?: (
    event: HyperframesOperatorAuditEvent
  ) =>
    | Promise<HyperframesOperatorAuditWriteResult | void>
    | HyperframesOperatorAuditWriteResult
    | void;
}

export interface HyperframesOperatorAuditWriteResult {
  auditLoggerPersisted?: boolean;
  dbPersisted?: boolean;
}

export async function persistHyperframesOperatorAuditEvent(
  event: HyperframesOperatorAuditEvent,
  sink: HyperframesOperatorAuditSink = {}
) {
  try {
    const writeResult = await sink.recordAuditEvent?.(event);
    return {
      persisted: Boolean(sink.recordAuditEvent),
      auditLoggerPersisted: Boolean(writeResult?.auditLoggerPersisted),
      dbPersisted: Boolean(writeResult?.dbPersisted),
      audit: event,
    };
  } catch (error) {
    return {
      persisted: false,
      auditLoggerPersisted: false,
      dbPersisted: false,
      errorMessage: redactHyperframesDiagnostics(String(error)),
      audit: event,
    };
  }
}

export async function recordHyperframesOperatorAuditEvent(
  event: HyperframesOperatorAuditEvent
): Promise<HyperframesOperatorAuditWriteResult> {
  const traceId = (getTraceId() ?? auditLogger.createTrace()).slice(0, 32);
  auditLogger.log({
    traceId,
    eventType: "hyperframes_operator_action",
    userId: event.userId,
    tenantId: event.tenantId,
    endpoint: `marketplaceCapture.${event.action}`,
    requestType: event.action,
    mediaType: "video",
    statusCode: 200,
    metadata: { ...event },
  });

  let dbPersisted = false;
  try {
    const db = await getDb();
    if (db) {
      await db.insert(apiAuditEvents).values({
        traceId,
        eventType: "hyperframes_operator_action",
        userId: event.userId,
        endpoint: `marketplaceCapture.${event.action}`,
        statusCode: 200,
        skillSlug: "marketplace-hyperframes",
        mediaType: "video",
        mediaTaskId: event.renderJobId ?? undefined,
        metadata: { ...event },
      });
      dbPersisted = true;
    }
  } catch {
    dbPersisted = false;
  }

  return {
    auditLoggerPersisted: true,
    dbPersisted,
  };
}

export const defaultHyperframesOperatorAuditSink: HyperframesOperatorAuditSink = {
  recordAuditEvent: recordHyperframesOperatorAuditEvent,
};

export function buildHyperframesDeadLetterReplayToken(
  render: HyperframesRenderStatusProjection
): string {
  return `hf_replay_${stableHash({
    renderJobId: render.renderJobId,
    tenantId: render.tenantId,
    productId: render.productId,
    runId: render.runId,
    templateId: render.templateId,
    templateVersion: render.templateVersion,
    compositionInputHash: render.compositionInputHash,
  }).replace(/^hf_/, "")}`;
}

export interface HyperframesDeadLetterReplayAccessGuard {
  featureEnabled?: boolean;
  tenantAllowed?: boolean;
  workerEnabled?: boolean;
  operatorEnabled?: boolean;
  canReplayAsOperator?: boolean;
  complianceBlocked?: boolean;
}

function assertReplayAccessGuard(input: {
  auth: HyperframesOperatorAuth;
  access?: HyperframesDeadLetterReplayAccessGuard;
}) {
  const access = input.access;
  if (!access) return;
  const adminLike = ["admin", "system_agent"].includes(input.auth.role ?? "");
  if (access.featureEnabled === false) {
    throw new Error("Cannot replay while HyperFrames is disabled");
  }
  if (access.tenantAllowed === false) {
    throw new Error("Cannot replay for a tenant outside the HyperFrames allowlist");
  }
  if (access.workerEnabled === false) {
    throw new Error("Cannot replay while the HyperFrames render worker is disabled");
  }
  if (access.complianceBlocked) {
    throw new Error("Cannot replay while compliance review is blocking the render");
  }
  if (access.canReplayAsOperator === false) {
    throw new Error("HyperFrames operator replay is not allowed for this context");
  }
  if (!adminLike && access.operatorEnabled === false) {
    throw new Error("Delegated HyperFrames operator replay is disabled");
  }
}

function assertReplayTemplateGuard(
  render: HyperframesRenderStatusProjection
) {
  if (!render.templateId) {
    throw new Error("Cannot replay HyperFrames job without template identity");
  }
  const template = listHyperframesTemplateRegistry({ includeDisabled: true }).find(
    candidate => candidate.templateId === render.templateId
  );
  if (!template) {
    throw new Error("Cannot replay because the HyperFrames template is unavailable");
  }
  if (!template.enabled || template.lifecycleState === "disabled") {
    throw new Error("Cannot replay while the HyperFrames template is disabled");
  }
  if (template.approval.status !== "approved") {
    throw new Error("Cannot replay an unapproved HyperFrames template");
  }
  if (
    render.templateVersion &&
    template.templateVersion !== render.templateVersion
  ) {
    throw new Error("Cannot replay stale HyperFrames template version");
  }
  if (
    render.templateContentHash &&
    template.templateContentHash !== render.templateContentHash
  ) {
    throw new Error("Cannot replay stale HyperFrames template content hash");
  }
  return template;
}

export function replayHyperframesDeadLetterAsOperator(input: {
  auth: HyperframesOperatorAuth;
  render: HyperframesRenderStatusProjection;
  currentCompositionInputHash: string;
  reason: string;
  replayToken: string;
  access?: HyperframesDeadLetterReplayAccessGuard;
}) {
  assertOperator(input.auth);
  assertReplayAccessGuard({ auth: input.auth, access: input.access });
  if (input.render.status !== "dead_lettered") {
    throw new Error("Only dead-lettered HyperFrames jobs can be replayed");
  }
  if (
    !input.render.compositionInputHash ||
    input.render.compositionInputHash !== input.currentCompositionInputHash
  ) {
    throw new Error("Cannot replay stale HyperFrames input hash");
  }
  const template = assertReplayTemplateGuard(input.render);
  const reason = input.reason.trim();
  if (reason.length < 6) {
    throw new Error("HyperFrames replay requires an operator reason");
  }
  const expectedReplayToken = buildHyperframesDeadLetterReplayToken(input.render);
  if (input.replayToken !== expectedReplayToken) {
    throw new Error("Invalid HyperFrames replay token");
  }
  return {
    contractVersion: HYPERFRAMES_MARKETPLACE_CONTRACT_VERSION,
    replayable: true as const,
    nextStatus: "queued" as const,
    replayGuard: {
      compositionInputHashCurrent: true as const,
      replayTokenVerified: true as const,
      templateEnabled: true as const,
      templateApproved: true as const,
      featureAccessReady: input.access ? (true as const) : null,
      reasonCaptured: true as const,
    },
    audit: buildHyperframesOperatorAuditEvent({
      auth: input.auth,
      action: "hyperframes_dead_letter_replayed",
      renderJobId: input.render.renderJobId,
      productId: input.render.productId,
      runId: input.render.runId,
      templateId: template.templateId,
      reason,
    }),
  };
}

export async function replayHyperframesDeadLetterJobAsOperator(input: {
  auth: HyperframesOperatorAuth;
  render: HyperframesRenderStatusProjection;
  currentCompositionInputHash: string;
  reason: string;
  replayToken: string;
  access?: HyperframesDeadLetterReplayAccessGuard;
  transitionJob: (request: {
    renderJobId: string;
    tenantId: string;
    runId: string;
    productId: string;
    nextStatus: "queued";
  }) => Promise<{ updated: boolean }> | { updated: boolean };
  auditSink?: HyperframesOperatorAuditSink;
}) {
  const replay = replayHyperframesDeadLetterAsOperator(input);
  const transition = await input.transitionJob({
    renderJobId: input.render.renderJobId,
    tenantId: input.render.tenantId,
    runId: input.render.runId,
    productId: input.render.productId,
    nextStatus: replay.nextStatus,
  });
  const auditPersistence = await persistHyperframesOperatorAuditEvent(
    replay.audit,
    input.auditSink
  );
  return {
    ...replay,
    transition,
    auditPersistence,
  };
}

export async function transitionHyperframesDeadLetterRenderJobAsOperator(input: {
  auth: HyperframesOperatorAuth;
  renderJobId: string;
  tenantId: string;
  runId: string;
  productId: string;
  nextStatus: "queued";
}) {
  assertOperator(input.auth);
  const db = await getDb();
  if (!db) return { updated: false };
  const updated = await db
    .update(marketplaceAutoReviewOutboxJobs)
    .set({
      status: input.nextStatus,
      attempts: 0,
      lockedBy: null,
      lockedUntil: null,
      completedAt: null,
      lastError: null,
      scheduledAt: new Date(),
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(marketplaceAutoReviewOutboxJobs.id, input.renderJobId),
        eq(marketplaceAutoReviewOutboxJobs.tenantId, input.tenantId),
        eq(marketplaceAutoReviewOutboxJobs.runId, input.runId),
        eq(marketplaceAutoReviewOutboxJobs.status, "dead_lettered")
      )
    )
    .returning({ id: marketplaceAutoReviewOutboxJobs.id });
  return { updated: updated.length > 0 };
}

export async function replayHyperframesDeadLetterByIdAsOperator(input: {
  auth: HyperframesOperatorAuth;
  renderJobId: string;
  productId?: string;
  runId?: string;
  currentCompositionInputHash: string;
  reason: string;
  replayToken: string;
  access?: HyperframesDeadLetterReplayAccessGuard;
  auditSink?: HyperframesOperatorAuditSink;
}) {
  const inspected = await inspectHyperframesRenderAsOperator(input);
  return replayHyperframesDeadLetterJobAsOperator({
    auth: input.auth,
    render: inspected.render,
    currentCompositionInputHash: input.currentCompositionInputHash,
    reason: input.reason,
    replayToken: input.replayToken,
    access: input.access,
    transitionJob: request =>
      transitionHyperframesDeadLetterRenderJobAsOperator({
        auth: input.auth,
        ...request,
      }),
    auditSink: input.auditSink,
  });
}

export async function inspectHyperframesRenderAsOperator(input: {
  auth: HyperframesOperatorAuth;
  renderJobId: string;
  productId?: string;
  runId?: string;
  auditSink?: HyperframesOperatorAuditSink;
}) {
  assertOperator(input.auth);
  const projection = await getHyperframesRenderProjection({
    ...input,
    operatorTenantAccess: true,
  });
  const audit = buildHyperframesOperatorAuditEvent({
    auth: input.auth,
    action: "hyperframes_render_diagnostics_inspected",
    renderJobId: projection.renderJobId,
    productId: projection.productId,
    runId: projection.runId,
    templateId: projection.templateId,
    reason: "operator sanitized diagnostics inspected",
  });
  const auditPersistence = await persistHyperframesOperatorAuditEvent(
    audit,
    input.auditSink
  );
  const operatorReplayToken =
    projection.status === "dead_lettered" &&
    projection.compositionInputHash &&
    projection.templateId
      ? buildHyperframesDeadLetterReplayToken(projection)
      : null;
  return {
    contractVersion: HYPERFRAMES_MARKETPLACE_CONTRACT_VERSION,
    render: projection,
    diagnostics: projection.safeDiagnostics.map(redactHyperframesDiagnostics),
    redacted: true as const,
    operatorReplayToken,
    auditPersistence,
  };
}

export async function cancelHyperframesRenderAsOperator(input: {
  auth: HyperframesOperatorAuth;
  renderJobId: string;
  productId?: string;
  runId?: string;
  reason?: string;
  auditSink?: HyperframesOperatorAuditSink;
}) {
  assertOperator(input.auth);
  const render = await cancelHyperframesRenderJob({
    ...input,
    operatorTenantAccess: true,
  });
  const audit = buildHyperframesOperatorAuditEvent({
    auth: input.auth,
    action: "hyperframes_render_cancelled_as_operator",
    renderJobId: render.renderJobId,
    productId: render.productId,
    runId: render.runId,
    templateId: render.templateId,
    reason: input.reason ?? "operator cancellation requested",
  });
  const auditPersistence = await persistHyperframesOperatorAuditEvent(
    audit,
    input.auditSink
  );
  return {
    contractVersion: HYPERFRAMES_MARKETPLACE_CONTRACT_VERSION,
    render,
    auditPersistence,
  };
}

export function disableHyperframesTemplateAsOperator(input: {
  auth: HyperframesOperatorAuth;
  templateId: string;
  reason: string;
}) {
  assertOperator(input.auth);
  disableHyperframesTemplate(input.templateId, input.reason);
  return {
    templateId: input.templateId,
    disabled: true,
    audit: buildHyperframesOperatorAuditEvent({
      auth: input.auth,
      action: "hyperframes_template_disabled",
      templateId: input.templateId,
      reason: input.reason,
    }),
  };
}

export function enableHyperframesTemplateAsOperator(input: {
  auth: HyperframesOperatorAuth;
  templateId: string;
}) {
  assertOperator(input.auth);
  enableHyperframesTemplate(input.templateId);
  return {
    templateId: input.templateId,
    enabled: true,
    audit: buildHyperframesOperatorAuditEvent({
      auth: input.auth,
      action: "hyperframes_template_enabled",
      templateId: input.templateId,
    }),
  };
}

export async function disableHyperframesTemplateWithAuditAsOperator(input: {
  auth: HyperframesOperatorAuth;
  templateId: string;
  reason: string;
  auditSink?: HyperframesOperatorAuditSink;
}) {
  const result = disableHyperframesTemplateAsOperator(input);
  const auditPersistence = await persistHyperframesOperatorAuditEvent(
    result.audit,
    input.auditSink
  );
  return {
    contractVersion: HYPERFRAMES_MARKETPLACE_CONTRACT_VERSION,
    ...result,
    auditPersistence,
  };
}

export async function enableHyperframesTemplateWithAuditAsOperator(input: {
  auth: HyperframesOperatorAuth;
  templateId: string;
  auditSink?: HyperframesOperatorAuditSink;
}) {
  const result = enableHyperframesTemplateAsOperator(input);
  const auditPersistence = await persistHyperframesOperatorAuditEvent(
    result.audit,
    input.auditSink
  );
  return {
    contractVersion: HYPERFRAMES_MARKETPLACE_CONTRACT_VERSION,
    ...result,
    auditPersistence,
  };
}
