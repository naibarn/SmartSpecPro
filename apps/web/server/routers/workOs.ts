import crypto from "crypto";
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import {
  domainAdminProcedure,
  protectedProcedure,
  router,
} from "../_core/trpc";
import { resolveTenantIdVarchar } from "../services/tenantContext";
import {
  buildAutomationPolicySnapshot,
  resolveAutomationLaunchPolicy,
  resolveAutomationStepRoute,
} from "../services/workAutomationPolicyService";
import {
  type PreflightPreviewView,
} from "../../shared/workOrchestrator";
import { executeAutomationStep } from "../services/workAutomationExecutionService";
import * as automationFabricService from "../services/workAutomationFabricService";
import * as runEngine from "../services/runEngine";
import {
  getBrowserAutomationHealth,
  reconcileBrowserAutomationTaskClaims,
} from "../services/workAutomationBrowserTaskService";
import {
  logAutomationStartError,
  logAutomationStartTrace,
} from "../services/automationStartTraceLogger";
import { getAutoTeamDebugSnapshot } from "../services/autoTeamDebugSnapshotService";
import * as roomService from "../services/roomService";
import * as workItemService from "../services/workItemService";
import * as workOsService from "../services/workOsService";
import {
  buildPreflightRevisionFingerprint,
  comparePreflightRevision,
} from "../services/preflightRevisionService";
import {
  isPreflightAdminRole,
  resolvePreflightPreviewAccess,
} from "../services/preflightAccessPolicyService";
import { resolveTeamForAutomation } from "../services/teamResolutionPolicyService";
import {
  deriveWorkIntakeActorContext,
} from "../services/workIntakeActorContext";
import {
  type WorkIntakeSourceSeed,
  resolveWorkIntakeSources,
} from "../services/workIntakeSourceResolver";
import { compileWorkBrief } from "../services/workIntakeBriefService";
import {
  buildCapabilityCatalog,
} from "../services/orchestratorCapabilityCatalogService";
import {
  captureApprovalSnapshots,
  compareApprovalSnapshots,
} from "../services/approvalSourceSnapshotService";
import {
  appendIdempotencyRecord,
  checkIdempotency,
  transitionPreflightBundle,
} from "../services/preflightApprovalLifecycleService";
import {
  buildRequesterSafeDiagnostics,
  buildStopPolicyFromBudget,
} from "../services/workOrchestratorSecurityPolicy";
import {
  createPreflightPlan,
} from "../services/workOrchestratorPlanningService";
import * as preflightBundleStoreService from "../services/preflightBundleStoreService";
import {
  getWorkOrchestratorFeatureFlags,
} from "../services/workOrchestratorFeatureFlags";
import {
  createTelemetryEvent,
  redactTelemetryEventForRequester,
} from "../services/workOrchestratorTelemetryService";
import { auditLogger } from "../services/auditLogger";
import {
  getPrivateVaultPinVersion,
  normalizePrivateVaultPrefs,
  validatePrivateVaultAccessToken,
} from "../services/privateVaultService";
import { getConversationById } from "../services/chatService";
import { getRoleRoutineRunForTenant } from "../services/rolePersistence";
import { getWorkpackRun } from "../services/workpackPersistence";
import {
  getDefaultContractCompatibility,
  type CapabilityCatalogEntry,
  type OrchestratorTelemetryEvent,
  preflightApprovalBundleSchema,
  type PreflightApprovalBundle,
  type PreflightSourceRef,
  type SkillStudioAction,
  type SurfaceGovernancePolicy,
  type TeamExecutionPlan,
  type WorkOrchestratorSurface,
} from "../../shared/workOrchestrator";

function requireTenantId(ctx: {
  tenantId: string | null;
  user?: { currentTenantId?: number | null } | null;
}): string {
  const tenantId = resolveTenantIdVarchar(
    ctx.tenantId,
    ctx.user?.currentTenantId
  );
  if (!tenantId) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Tenant context required",
    });
  }
  return tenantId;
}

function isPlaceholderAutomationObjective(
  objective: string | null | undefined,
  title: string
): boolean {
  if (!objective) return true;
  const normalized = objective.trim().toLowerCase();
  const normalizedTitle = title.trim().toLowerCase();
  return (
    normalized.length === 0 ||
    normalized === normalizedTitle ||
    normalized === `start automation for ${normalizedTitle}` ||
    normalized.startsWith("start automation for ")
  );
}

function resolveAutomationObjective(input: {
  title: string;
  objective?: string | null;
  requestObjective?: string | null;
  caseSummary?: string | null;
  caseTitle?: string | null;
}): {
  objective: string | null;
  source: "input" | "request.objective" | "case.summary" | "case.title";
} {
  const title = input.title.trim();
  const rawObjective = input.objective?.trim() || null;
  const requestObjective = input.requestObjective?.trim() || null;
  const caseSummary = input.caseSummary?.trim() || null;
  const caseTitle = input.caseTitle?.trim() || title || null;

  if (rawObjective && !isPlaceholderAutomationObjective(rawObjective, title)) {
    return { objective: rawObjective, source: "input" };
  }
  if (requestObjective) {
    return { objective: requestObjective, source: "request.objective" };
  }
  if (caseSummary) {
    return { objective: caseSummary, source: "case.summary" };
  }
  if (caseTitle) {
    return { objective: caseTitle, source: "case.title" };
  }
  return { objective: rawObjective, source: "input" };
}

function buildAutomationKickoffContent(input: {
  title: string;
  objective: string | null;
  requestTitle?: string | null;
  requestObjective?: string | null;
  caseSummary?: string | null;
  runMode?: string | null;
  teamId?: string | null;
  language?: "en" | "th";
}): { summary: string; content: string } {
  const isThai = input.language === "th";
  const briefLines = isThai
    ? [
        `เริ่มการทำงานอัตโนมัติสำหรับ${input.title}.`,
        input.objective
          ? `บรีฟงาน: ${input.objective}`
          : "บรีฟงาน: ตรวจสอบคำขอและแยกเป็นขั้นตอนที่ชัดเจนต่อไป",
        input.requestTitle ? `คำขอ: ${input.requestTitle}` : null,
        input.requestObjective && input.requestObjective !== input.objective
          ? `หมายเหตุคำขอ: ${input.requestObjective}`
          : null,
        input.caseSummary && input.caseSummary !== input.objective
          ? `สรุปเคส: ${input.caseSummary}`
          : null,
        input.teamId ? `ทีมเป้าหมาย: ${input.teamId}` : null,
        input.runMode ? `โหมดรัน: ${input.runMode}` : null,
        "ถัดไป: แยกบรีฟออกเป็นงานย่อยที่ชัดเจน มอบหมาย persona ที่เหมาะสม และอัปเดตความคืบหน้าอย่างต่อเนื่อง",
      ].filter((line): line is string => Boolean(line))
    : [
        `Automation started for ${input.title}.`,
        input.objective
          ? `Work brief: ${input.objective}`
          : "Work brief: Review the request and derive the next concrete actions.",
        input.requestTitle ? `Request: ${input.requestTitle}` : null,
        input.requestObjective && input.requestObjective !== input.objective
          ? `Request notes: ${input.requestObjective}`
          : null,
        input.caseSummary && input.caseSummary !== input.objective
          ? `Case summary: ${input.caseSummary}`
          : null,
        input.teamId ? `Target team: ${input.teamId}` : null,
        input.runMode ? `Run mode: ${input.runMode}` : null,
        "Next: break the brief into concrete subtasks, assign the right persona, and update progress continuously.",
      ].filter((line): line is string => Boolean(line));

  return {
    summary: briefLines[0] ?? `Automation started for ${input.title}.`,
    content: briefLines.join("\n\n"),
  };
}

function resolveAutomationTeamRunMode(
  mode: Awaited<
    ReturnType<typeof automationFabricService.createAutomationRun>
  >["currentMode"]
): Parameters<typeof runEngine.startRun>[0]["executionMode"] {
  return mode === "manual_assist" ? "review" : "auto_team";
}

function buildDefaultTeamStopPolicy(): Parameters<
  typeof runEngine.startRun
>[0]["stopPolicy"] {
  return {
    maxRounds: 20,
    maxDurationMinutes: 30,
    maxBudgetCredits: 500,
    stopOnConsensus: false,
    stopOnArtifactReady: false,
    stopOnLeadSummary: false,
    requireFinalSummary: false,
    idleTimeoutSeconds: 120,
  };
}

function selectLatestRevisionWorkItem(
  workItems: Awaited<ReturnType<typeof workItemService.listWorkItemsByRoom>>,
  runId: string
): (typeof workItems)[number] | null {
  const candidates = workItems.filter(item => item.runId === runId);
  if (candidates.length === 0) {
    return null;
  }

  return candidates.reduce((latest, current) => {
    if (!latest) {
      return current;
    }

    const latestSuperseded = Boolean(latest.supersededByWorkItemId);
    const currentSuperseded = Boolean(current.supersededByWorkItemId);
    if (latestSuperseded !== currentSuperseded) {
      return currentSuperseded ? latest : current;
    }

    const latestRevision = latest.revisionVersion ?? 0;
    const currentRevision = current.revisionVersion ?? 0;
    if (currentRevision !== latestRevision) {
      return currentRevision > latestRevision ? current : latest;
    }

    const latestCreatedAt =
      latest.createdAt instanceof Date
        ? latest.createdAt.getTime()
        : new Date(latest.createdAt ?? 0).getTime();
    const currentCreatedAt =
      current.createdAt instanceof Date
        ? current.createdAt.getTime()
        : new Date(current.createdAt ?? 0).getTime();
    if (currentCreatedAt !== latestCreatedAt) {
      return currentCreatedAt > latestCreatedAt ? current : latest;
    }

    return current;
  }, candidates[0] ?? null);
}

function asStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.map(item => String(item).trim()).filter(Boolean)
    : [];
}

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map(item => stableStringify(item)).join(",")}]`;
  }
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record)
    .sort()
    .map(key => `${JSON.stringify(key)}:${stableStringify(record[key])}`)
    .join(",")}}`;
}

function buildPreflightInputFingerprint(value: Record<string, unknown>): string {
  return stableStringify(value);
}

function hashSourceContent(value: unknown): string {
  return crypto
    .createHash("sha256")
    .update(stableStringify(value))
    .digest("hex");
}

function classifyFreshness(value: Date | string | null | undefined): PreflightSourceRef["freshness"] {
  if (!value) return "unknown";
  const timestamp =
    value instanceof Date ? value.getTime() : Date.parse(String(value));
  if (!Number.isFinite(timestamp)) return "unknown";

  const ageMs = Math.max(0, Date.now() - timestamp);
  if (ageMs <= 24 * 60 * 60 * 1000) return "current";
  if (ageMs <= 30 * 24 * 60 * 60 * 1000) return "recent";
  return "stale";
}

function classifyTelemetryActorClass(
  role: string | null | undefined,
): OrchestratorTelemetryEvent["actorClass"] {
  if (role === "admin") return "admin";
  if (role === "domain_admin") return "domain_admin";
  return "requester";
}

function asJsonRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? { ...(value as Record<string, unknown>) }
    : {};
}

function appendBundleTelemetryEvent(input: {
  bundle: PreflightApprovalBundle;
  ctx: {
    user?: {
      id?: number | null;
      role?: string | null;
    } | null;
  };
  eventName: string;
  severity: OrchestratorTelemetryEvent["severity"];
  primaryReasonCode?: string | null;
  payload?: Record<string, unknown>;
  idempotencyKey?: string | null;
  automationRunId?: string | null;
  teamId?: string | null;
  roomId?: string | null;
  teamRunId?: string | null;
  workItemId?: string | null;
}): PreflightApprovalBundle {
  const event = createTelemetryEvent({
    eventName: input.eventName,
    eventVersion: "1",
    occurredAt: new Date().toISOString(),
    severity: input.severity,
    primaryReasonCode: input.primaryReasonCode ?? null,
    actorClass: classifyTelemetryActorClass(input.ctx.user?.role),
    redactionMode: "admin_diagnostic",
    tenantId: input.bundle.tenantId ?? null,
    actorUserId: input.ctx.user?.id ?? null,
    requestId: input.bundle.requestId ?? null,
    caseId: input.bundle.caseId,
    preflightBundleId: input.bundle.id,
    preflightRevisionHash: input.bundle.preflightRevision.fingerprint,
    automationRunId: input.automationRunId ?? null,
    teamId: input.teamId ?? null,
    roomId: input.roomId ?? null,
    teamRunId: input.teamRunId ?? null,
    workItemId: input.workItemId ?? null,
    correlationId:
      input.bundle.stateTransitions[input.bundle.stateTransitions.length - 1]
        ?.correlationId ?? null,
    idempotencyKey: input.idempotencyKey ?? null,
    payload: input.payload ?? {},
  });
  const requesterSafeEvent = redactTelemetryEventForRequester({
    ...event,
    redactionMode: "requester_safe",
  });
  auditLogger.log({
    eventType: "orchestration_pipeline",
    tenantId: event.tenantId,
    userId: event.actorUserId,
    requestPayload: {
      source: "work_orchestrator",
      event,
    },
  });
  const existingTelemetryTrail = Array.isArray(input.bundle.metadata.telemetryEvents)
    ? input.bundle.metadata.telemetryEvents
        .filter(
          candidate => candidate && typeof candidate === "object" && !Array.isArray(candidate),
        )
        .slice(-24)
    : [];

  return {
    ...input.bundle,
    requesterSafeDiagnostics: {
      ...asJsonRecord(input.bundle.requesterSafeDiagnostics),
      latestTelemetryEvent: requesterSafeEvent,
    },
    adminDiagnostics: {
      ...asJsonRecord(input.bundle.adminDiagnostics),
      latestTelemetryEvent: event,
    },
    metadata: {
      ...input.bundle.metadata,
      telemetryEvents: [...existingTelemetryTrail, event],
    },
  };
}

async function resolvePrivateVaultUnlocked(input: {
  tenantId: string;
  ctx: {
    privateVaultToken?: string | null;
    user?: {
      id?: number | null;
      userPreferences?: unknown;
    } | null;
  };
}): Promise<boolean> {
  if (!input.ctx.user?.id || !input.ctx.privateVaultToken) {
    return false;
  }

  const prefs = normalizePrivateVaultPrefs(input.ctx.user.userPreferences);
  if (!prefs?.enabled || !prefs.pinHash) {
    return false;
  }

  return validatePrivateVaultAccessToken({
    token: input.ctx.privateVaultToken,
    userId: input.ctx.user.id,
    tenantId: input.tenantId,
    pinVersion: getPrivateVaultPinVersion(input.ctx.user.userPreferences),
  });
}

function buildLaunchReadiness(bundle: PreflightApprovalBundle) {
  const selectedEntries = bundle.capabilityCatalog.filter(entry =>
    Boolean(entry.metadata?.selectedByPolicy)
  );
  const selectedBlockedReasons = selectedEntries
    .map(entry => entry.blockedReason)
    .filter((value): value is string => Boolean(value));

  if (bundle.teamResolution?.status !== "resolved" || !bundle.teamResolution.teamId) {
    return {
      ready: false,
      primaryReasonCode: bundle.teamResolution?.code ?? "missing_team",
      blockedReasonCodes: [bundle.teamResolution?.code ?? "missing_team"],
    };
  }

  if (selectedBlockedReasons.length > 0) {
    return {
      ready: false,
      primaryReasonCode: selectedBlockedReasons[0],
      blockedReasonCodes: Array.from(new Set(selectedBlockedReasons)),
    };
  }

  if (bundle.state !== "approved" && bundle.state !== "launching" && bundle.state !== "launched") {
    return {
      ready: false,
      primaryReasonCode: "preflight_approval_required",
      blockedReasonCodes: ["preflight_approval_required"],
    };
  }

  return {
    ready: true,
    primaryReasonCode: null,
    blockedReasonCodes: [],
  };
}

function sanitizeGovernanceForRequester(
  governance: SurfaceGovernancePolicy,
): SurfaceGovernancePolicy {
  return {
    ...governance,
    requiredFeatureFlags: [],
    requiredPermissions: [],
  };
}

function sanitizeCapabilityCatalogForAccess(input: {
  access: ReturnType<typeof resolvePreflightPreviewAccess>;
  capabilityCatalog: PreflightApprovalBundle["capabilityCatalog"];
}): PreflightApprovalBundle["capabilityCatalog"] {
  if (input.access.view === "admin_diagnostic" && !input.access.redacted) {
    return input.capabilityCatalog;
  }

  return input.capabilityCatalog.map((entry): CapabilityCatalogEntry => ({
    ...entry,
    governance: sanitizeGovernanceForRequester(entry.governance),
    metadata: {
      selectedByPolicy: Boolean(entry.metadata?.selectedByPolicy),
      reasonCodes: Array.isArray(entry.metadata?.reasonCodes)
        ? entry.metadata.reasonCodes
        : [],
    },
  }));
}

function sanitizeExecutionPlanForAccess(input: {
  access: ReturnType<typeof resolvePreflightPreviewAccess>;
  executionPlan: PreflightApprovalBundle["executionPlan"];
}): PreflightApprovalBundle["executionPlan"] {
  if (!input.executionPlan) {
    return null;
  }
  if (input.access.view === "admin_diagnostic" && !input.access.redacted) {
    return input.executionPlan;
  }

  return {
    ...input.executionPlan,
    steps: input.executionPlan.steps.map(
      (step): TeamExecutionPlan["steps"][number] => ({
        ...step,
        governance: sanitizeGovernanceForRequester(step.governance),
        metadata: {},
      }),
    ),
  };
}

function buildRequesterSafeTeamResolutionReason(
  teamResolution: NonNullable<PreflightApprovalBundle["teamResolution"]>,
): string {
  if (teamResolution.status === "resolved") {
    return "Automation team is configured for this request.";
  }
  if (teamResolution.code === "unauthorized_team") {
    return "Automation team is not available for this request.";
  }
  return "Automation team needs attention before launch.";
}

function sanitizeTeamResolutionForAccess(input: {
  access: ReturnType<typeof resolvePreflightPreviewAccess>;
  teamResolution: PreflightApprovalBundle["teamResolution"];
}): PreflightApprovalBundle["teamResolution"] {
  if (!input.teamResolution) {
    return null;
  }
  if (input.access.view === "admin_diagnostic" && !input.access.redacted) {
    return input.teamResolution;
  }

  return {
    ...input.teamResolution,
    teamId: null,
    reason: buildRequesterSafeTeamResolutionReason(input.teamResolution),
    diagnostics: {},
  };
}

function mapTeamResolutionToLaunchErrorCode(
  teamResolution: PreflightApprovalBundle["teamResolution"],
): string {
  return teamResolution?.code === "unauthorized_team"
    ? "UNAUTHORIZED_TEAM"
    : "MISSING_TEAM";
}

function mapCatalogBlockToLaunchErrorCode(reasonCode: string): string {
  if (reasonCode === "surface_feature_flag_disabled") {
    return "SURFACE_FEATURE_FLAG_DISABLED";
  }
  return reasonCode === "surface_authority_missing"
    ? "SURFACE_AUTHORITY_MISSING"
    : "SURFACE_CONTRACT_NOT_MIGRATED";
}

type AutomationKickoffFailureReason =
  | "missing_team"
  | "room_create_failed"
  | "team_run_start_failed";

function mapKickoffFailureToLaunchErrorCode(
  reasonCode: AutomationKickoffFailureReason,
): string {
  return reasonCode === "missing_team" ? "MISSING_TEAM" : "TEAM_KICKOFF_FAILED";
}

function buildLaunchBlockedBundle(input: {
  bundle: PreflightApprovalBundle;
  ctx: {
    tenantId: string | null;
    user?: {
      id?: number | null;
      role?: string | null;
      currentTenantId?: number | null;
      userPreferences?: unknown;
    } | null;
  };
  idempotencyKey: string;
  inputFingerprint: string;
  reasonCode: string;
  errorCode: string;
  actorUserId?: number | null;
  eventName?: string;
  severity?: "info" | "warning" | "error";
  automationRunId?: string;
  payload?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
}): PreflightApprovalBundle {
  return appendIdempotencyRecord({
    bundle: appendBundleTelemetryEvent({
      bundle: transitionPreflightBundle({
        bundle: {
          ...input.bundle,
          metadata:
            input.metadata || input.automationRunId
              ? {
                  ...input.bundle.metadata,
                  ...(input.metadata ?? {}),
                  ...(input.automationRunId
                    ? { automationRunId: input.automationRunId }
                    : {}),
                }
              : input.bundle.metadata,
        },
        toState: "launch_blocked",
        event: "launch.validation_failed",
        actorUserId: input.actorUserId ?? null,
        reasonCode: input.reasonCode,
      }),
      ctx: input.ctx,
      eventName: input.eventName ?? "launch.blocked",
      severity: input.severity ?? "warning",
      primaryReasonCode: input.reasonCode,
      idempotencyKey: input.idempotencyKey,
      automationRunId: input.automationRunId,
      payload: input.payload,
    }),
    operation: "launch_approved_automation",
    idempotencyKey: input.idempotencyKey,
    inputFingerprint: input.inputFingerprint,
    result: {
      ...(input.automationRunId ? { automationRunId: input.automationRunId } : {}),
      preflightBundleId: input.bundle.id,
      state: "launch_blocked",
      errorCode: input.errorCode,
    },
  });
}

function formatPreflightBundleResponse(input: {
  access: ReturnType<typeof resolvePreflightPreviewAccess>;
  bundle: PreflightApprovalBundle;
}) {
  const launchReadiness = buildLaunchReadiness(input.bundle);
  return {
    access: input.access,
    caseId: input.bundle.caseId,
    requestId: input.bundle.requestId ?? null,
    preflightBundleId: input.bundle.id,
    state: input.bundle.state,
    previewView: input.access.view,
    brief: input.bundle.brief,
    capabilityCatalog: sanitizeCapabilityCatalogForAccess({
      access: input.access,
      capabilityCatalog: input.bundle.capabilityCatalog,
    }),
    capabilityPlan: input.bundle.capabilityPlan ?? null,
    executionPlan: sanitizeExecutionPlanForAccess({
      access: input.access,
      executionPlan: input.bundle.executionPlan ?? null,
    }),
    teamResolution: sanitizeTeamResolutionForAccess({
      access: input.access,
      teamResolution: input.bundle.teamResolution ?? null,
    }),
    preflightRevision: input.bundle.preflightRevision,
    budget: input.bundle.budget ?? null,
    approvalSnapshotStatus: {
      requiredCount: input.bundle.preflightRevision.inputs.selectedSourceIds.length,
      capturedCount: input.bundle.approvalSnapshots.length,
    },
    launchReadiness,
    approvalSnapshots:
      input.access.view === "admin_diagnostic" && !input.access.redacted
        ? input.bundle.approvalSnapshots
        : [],
    diagnostics:
      input.access.view === "admin_diagnostic" && !input.access.redacted
        ? input.bundle.adminDiagnostics ?? {}
        : input.bundle.requesterSafeDiagnostics ?? {},
  };
}

function isAutomationMode(
  value: unknown,
): value is z.infer<typeof automationModeSchema> {
  return value === "manual_assist" || value === "semi_auto" || value === "fully_auto";
}

function readBundlePolicyInput(
  bundle: PreflightApprovalBundle,
): {
  templateKey?: string;
  templateVersion?: string;
  mode?: z.infer<typeof automationModeSchema>;
} {
  const metadataPolicy =
    bundle.metadata &&
    typeof bundle.metadata === "object" &&
    bundle.metadata.policyJson &&
    typeof bundle.metadata.policyJson === "object"
      ? (bundle.metadata.policyJson as Record<string, unknown>)
      : null;

  const templateKey =
    metadataPolicy && typeof metadataPolicy.templateKey === "string"
      ? metadataPolicy.templateKey
      : undefined;
  const templateVersion =
    metadataPolicy && typeof metadataPolicy.templateVersion === "string"
      ? metadataPolicy.templateVersion
      : undefined;
  const requestedMode =
    metadataPolicy &&
    typeof metadataPolicy.modeResolution === "object" &&
    metadataPolicy.modeResolution &&
    typeof (metadataPolicy.modeResolution as Record<string, unknown>).requestedMode ===
      "string"
      ? (metadataPolicy.modeResolution as Record<string, unknown>).requestedMode
      : null;

  return {
    templateKey,
    templateVersion,
    mode: isAutomationMode(requestedMode) ? requestedMode : undefined,
  };
}

async function loadProjectionWithPreflightAccess(input: {
  caseId: string;
  ctx: {
    tenantId: string | null;
    privateVaultToken?: string | null;
    user?: {
      id?: number | null;
      role?: string | null;
      currentTenantId?: number | null;
      userPreferences?: unknown;
    } | null;
  };
}): Promise<{
  tenantId: string;
  projection: Awaited<ReturnType<typeof workOsService.getWorkCaseProjection>>;
  access: ReturnType<typeof resolvePreflightPreviewAccess>;
}> {
  const tenantId = requireTenantId(input.ctx);
  const projection = await workOsService.getWorkCaseProjection(
    input.caseId,
    tenantId,
  );
  const access = resolvePreflightPreviewAccess({
    actorUserId: input.ctx.user?.id ?? null,
    actorRole: input.ctx.user?.role ?? null,
    requesterId: projection.request?.requesterId ?? null,
  });
  if (!access.allowed || !access.view) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "You can only preview automation for your own request or as an admin.",
    });
  }

  return {
    tenantId,
    projection,
    access,
  };
}

async function loadStoredPreflightBundle(input: {
  caseId: string;
  preflightBundleId: string;
  ctx: {
    tenantId: string | null;
    privateVaultToken?: string | null;
    user?: {
      id?: number | null;
      role?: string | null;
      currentTenantId?: number | null;
      userPreferences?: unknown;
    } | null;
  };
}) {
  const { tenantId, projection, access } = await loadProjectionWithPreflightAccess({
    caseId: input.caseId,
    ctx: input.ctx,
  });
  const bundle = await preflightBundleStoreService.getPreflightBundle({
    tenantId,
    caseId: input.caseId,
    preflightBundleId: input.preflightBundleId,
  });
  if (!bundle) {
    throw new TRPCError({
      code: "NOT_FOUND",
      message: "PREVIEW_NOT_FOUND",
    });
  }

  return {
    tenantId,
    projection,
    access,
    bundle,
  };
}

async function buildCurrentDraftForStoredBundle(input: {
  caseId: string;
  bundle: PreflightApprovalBundle;
  projection: Awaited<ReturnType<typeof workOsService.getWorkCaseProjection>>;
  ctx: {
    tenantId: string | null;
    privateVaultToken?: string | null;
    user?: {
      id?: number | null;
      role?: string | null;
      currentTenantId?: number | null;
      userPreferences?: unknown;
    } | null;
  };
}) {
  const policyInput = readBundlePolicyInput(input.bundle);
  return buildPreflightBundleDraft({
    caseId: input.caseId,
    ctx: input.ctx,
    projection: input.projection,
    title: input.bundle.brief.title,
    objective: input.bundle.brief.objective ?? undefined,
    templateKey: policyInput.templateKey,
    templateVersion: policyInput.templateVersion,
    mode: policyInput.mode,
    linkedConversationIds:
      input.bundle.preflightRevision.inputs.linkedConversationIds,
    linkedWorkpackRunIds:
      input.bundle.preflightRevision.inputs.linkedWorkpackRunIds,
    linkedRoleRoutineRunIds:
      input.bundle.preflightRevision.inputs.linkedRoleRoutineRunIds,
    selectedSourceIds: input.bundle.preflightRevision.inputs.selectedSourceIds,
    explicitTeamId:
      input.bundle.preflightRevision.inputs.explicitTeamId ?? undefined,
    existingBundle: input.bundle,
  });
}

function isCancellationReasonCode(reasonCode: string): boolean {
  return /cancel/i.test(reasonCode);
}

function buildSourceExcerpt(value: string | null | undefined): string {
  return (value ?? "").trim().slice(0, 600);
}

function unavailableSourceSeed(input: {
  sourceType: WorkIntakeSourceSeed["sourceType"];
  sourceId: string;
  label: string;
  required: boolean;
  requesterMessage: string;
  adminDetail: string;
  trust?: WorkIntakeSourceSeed["trust"];
  freshness?: WorkIntakeSourceSeed["freshness"];
}): WorkIntakeSourceSeed {
  return {
    sourceType: input.sourceType,
    sourceId: input.sourceId,
    label: input.label,
    required: input.required,
    trust: input.trust ?? "derived",
    freshness: input.freshness ?? "unknown",
    availability: "unavailable",
    requesterMessage: input.requesterMessage,
    adminDetail: input.adminDetail,
    integrityMarker: {
      summary: `${input.label} unavailable`,
      contentHash: hashSourceContent({
        sourceType: input.sourceType,
        sourceId: input.sourceId,
        unavailable: true,
        adminDetail: input.adminDetail,
      }),
      sanitizationState: "hash_only",
    },
  };
}

async function buildPreflightSourceSeeds(input: {
  tenantId: string;
  ctx: {
    user?: {
      id?: number | null;
    } | null;
  };
  projection: Awaited<ReturnType<typeof workOsService.getWorkCaseProjection>>;
  linkedConversationIds: readonly string[];
  linkedWorkpackRunIds: readonly string[];
  linkedRoleRoutineRunIds: readonly string[];
}): Promise<WorkIntakeSourceSeed[]> {
  const projectionCase = input.projection.case as Record<string, unknown>;
  const projectionRequest =
    input.projection.request as Record<string, unknown> | null;
  const requesterUserId = Number.parseInt(
    String(
      input.projection.request?.requesterId ??
        input.ctx.user?.id ??
        "",
    ),
    10,
  );

  const caseSeed: WorkIntakeSourceSeed = {
    sourceType: "case",
    sourceId: input.projection.case.id,
    label: input.projection.case.title,
    required: true,
    trust: "trusted",
    freshness: "current",
    integrityMarker: {
      summary:
        String(projectionCase.summary ?? "").trim() || input.projection.case.title,
      approvedExcerpt: buildSourceExcerpt(
        String(projectionCase.summary ?? input.projection.case.title ?? ""),
      ),
      versionMarker:
        typeof projectionCase.updatedAt === "string"
          ? projectionCase.updatedAt
          : null,
      contentHash: hashSourceContent({
        title: input.projection.case.title,
        summary: projectionCase.summary ?? null,
        ownerType: projectionCase.ownerType ?? null,
        ownerId: projectionCase.ownerId ?? null,
        currentState: projectionCase.currentState ?? null,
        updatedAt: projectionCase.updatedAt ?? null,
      }),
      sanitizationState: "summary_only",
    },
  };
  const requestSeed = input.projection.request
    ? ({
        sourceType: "request",
        sourceId: input.projection.request.id,
        label: input.projection.request.title,
        required: true,
        trust: "trusted",
        freshness: "current",
        integrityMarker: {
          summary:
            String(projectionRequest?.objective ?? "").trim() ||
            input.projection.request.title,
          approvedExcerpt: buildSourceExcerpt(
            String(
              projectionRequest?.objective ?? input.projection.request.title ?? "",
            ),
          ),
          versionMarker:
            typeof projectionRequest?.updatedAt === "string"
              ? projectionRequest.updatedAt
              : null,
          contentHash: hashSourceContent({
            title: input.projection.request.title,
            objective: projectionRequest?.objective ?? null,
            sourceType: projectionRequest?.sourceType ?? null,
            sourceRef: projectionRequest?.sourceRef ?? null,
            updatedAt: projectionRequest?.updatedAt ?? null,
          }),
          sanitizationState: "summary_only",
        },
      } satisfies WorkIntakeSourceSeed)
    : null;

  const conversationSeeds = await Promise.all(
    Array.from(new Set(input.linkedConversationIds))
      .map(sourceId => sourceId.trim())
      .filter(Boolean)
      .map(async sourceId => {
        const conversationId = Number.parseInt(sourceId, 10);
        if (!Number.isInteger(conversationId) || !Number.isInteger(requesterUserId)) {
          return unavailableSourceSeed({
            sourceType: "conversation",
            sourceId,
            label: `Conversation ${sourceId}`,
            required: true,
            requesterMessage:
              "This linked conversation could not be validated for review.",
            adminDetail: "conversation_invalid_or_unowned",
          });
        }

        const conversation = await getConversationById(conversationId, requesterUserId)
          .catch(() => undefined);
        if (!conversation || conversation.tenantId !== input.tenantId) {
          return unavailableSourceSeed({
            sourceType: "conversation",
            sourceId,
            label: `Conversation ${sourceId}`,
            required: true,
            requesterMessage:
              "This linked conversation is no longer available to this request.",
            adminDetail: conversation
              ? "conversation_wrong_tenant"
              : "conversation_not_accessible",
          });
        }

        return {
          sourceType: "conversation",
          sourceId,
          label: conversation.title?.trim() || `Conversation ${sourceId}`,
          required: true,
          trust: "trusted",
          freshness: classifyFreshness(conversation.updatedAt ?? conversation.createdAt),
          integrityMarker: {
            summary: conversation.title?.trim() || `Conversation ${sourceId}`,
            approvedExcerpt: buildSourceExcerpt(conversation.title),
            versionMarker:
              conversation.updatedAt instanceof Date
                ? conversation.updatedAt.toISOString()
                : String(conversation.updatedAt ?? ""),
            contentHash: hashSourceContent({
              id: conversation.id,
              title: conversation.title,
              messageCount: conversation.messageCount,
              model: conversation.model,
              updatedAt: conversation.updatedAt ?? null,
            }),
            sanitizationState: "summary_only",
          },
        } satisfies WorkIntakeSourceSeed;
      }),
  );

  const workpackRunSeeds = await Promise.all(
    Array.from(new Set(input.linkedWorkpackRunIds))
      .map(sourceId => sourceId.trim())
      .filter(Boolean)
      .map(async sourceId => {
        const run = await getWorkpackRun(sourceId).catch(() => null);
        if (!run || run.tenantId !== input.tenantId) {
          return unavailableSourceSeed({
            sourceType: "workpack_run",
            sourceId,
            label: `Workpack run ${sourceId}`,
            required: false,
            requesterMessage:
              "This linked workpack run is not available in the current tenant.",
            adminDetail: "workpack_run_not_accessible",
          });
        }

        const versionMarker = String(run.endedAt ?? run.startedAt ?? "");
        return {
          sourceType: "workpack_run",
          sourceId,
          label: `Workpack ${run.workpackId} (${run.status})`,
          required: false,
          trust: "trusted",
          freshness: classifyFreshness(run.endedAt ?? run.startedAt),
          integrityMarker: {
            summary: `Workpack ${run.workpackId} is ${run.status}`,
            approvedExcerpt: buildSourceExcerpt(
              [run.workpackId, run.status, run.triggerSource].filter(Boolean).join(" | "),
            ),
            versionMarker: versionMarker || null,
            contentHash: hashSourceContent({
              id: run.id,
              workpackId: run.workpackId,
              versionId: run.versionId,
              status: run.status,
              trigger: run.trigger,
              triggerSource: run.triggerSource,
              endedAt: run.endedAt ?? null,
              startedAt: run.startedAt ?? null,
            }),
            sanitizationState: "summary_only",
          },
        } satisfies WorkIntakeSourceSeed;
      }),
  );

  const roleRoutineRunSeeds = await Promise.all(
    Array.from(new Set(input.linkedRoleRoutineRunIds))
      .map(sourceId => sourceId.trim())
      .filter(Boolean)
      .map(async sourceId => {
        const run = await getRoleRoutineRunForTenant(input.tenantId, sourceId)
          .catch(() => null);
        if (!run) {
          return unavailableSourceSeed({
            sourceType: "role_routine_run",
            sourceId,
            label: `Role routine run ${sourceId}`,
            required: false,
            requesterMessage:
              "This linked role routine run is not available in the current tenant.",
            adminDetail: "role_routine_run_not_accessible",
          });
        }

        return {
          sourceType: "role_routine_run",
          sourceId,
          label: `Role routine ${run.routineId} (${run.status})`,
          required: false,
          trust: "trusted",
          freshness: classifyFreshness(run.updatedAt ?? run.startedAt),
          integrityMarker: {
            summary:
              run.currentObjectiveSummary?.trim() ||
              `Role routine ${run.routineId} is ${run.status}`,
            approvedExcerpt: buildSourceExcerpt(
              [
                run.currentObjectiveSummary,
                run.status,
                run.selectedWorkpackFamily,
              ]
                .filter(Boolean)
                .join(" | "),
            ),
            versionMarker: String(run.updatedAt ?? run.startedAt ?? ""),
            contentHash: hashSourceContent({
              id: run.id,
              routineId: run.routineId,
              status: run.status,
              currentObjectiveSummary: run.currentObjectiveSummary ?? null,
              selectedWorkpackFamily: run.selectedWorkpackFamily ?? null,
              resolvedWorkpackVersionId: run.resolvedWorkpackVersionId ?? null,
              updatedAt: run.updatedAt ?? null,
            }),
            sanitizationState: "summary_only",
          },
        } satisfies WorkIntakeSourceSeed;
      }),
  );

  return [
    caseSeed,
    requestSeed,
    ...conversationSeeds,
    ...workpackRunSeeds,
    ...roleRoutineRunSeeds,
  ].filter((source): source is WorkIntakeSourceSeed => Boolean(source));
}

async function buildPreflightBundleDraft(input: {
  caseId: string;
  title?: string;
  objective?: string;
  mode?: z.infer<typeof automationModeSchema>;
  templateKey?: string;
  templateVersion?: string;
  linkedConversationIds?: string[];
  linkedWorkpackRunIds?: string[];
  linkedRoleRoutineRunIds?: string[];
  selectedSourceIds?: string[];
  explicitTeamId?: string;
  ctx: {
    tenantId: string | null;
    privateVaultToken?: string | null;
    user?: {
      id?: number | null;
      role?: string | null;
      currentTenantId?: number | null;
      userPreferences?: unknown;
    } | null;
  };
  projection: Awaited<ReturnType<typeof workOsService.getWorkCaseProjection>>;
  existingBundle?: PreflightApprovalBundle | null;
}) {
  const tenantId = requireTenantId(input.ctx);
  const access = resolvePreflightPreviewAccess({
    actorUserId: input.ctx.user?.id ?? null,
    actorRole: input.ctx.user?.role ?? null,
    requesterId: input.projection.request?.requesterId ?? null,
  });
  if (!access.allowed || !access.view) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "You can only preview automation for your own request or as an admin.",
    });
  }

  const flags = await getWorkOrchestratorFeatureFlags();
  const privateVaultUnlocked = await resolvePrivateVaultUnlocked({
    tenantId,
    ctx: input.ctx,
  });
  const actorContext = deriveWorkIntakeActorContext({
    tenantId,
    actorUserId: input.ctx.user?.id ?? null,
    actorRole: input.ctx.user?.role ?? null,
    requesterUserId: input.projection.request?.requesterId ?? null,
    privateVaultUnlocked,
  });

  const policy = resolveAutomationLaunchPolicy({
    caseRecord: input.projection.case,
    requestRecord: input.projection.request,
    templateKey: input.templateKey ?? null,
    templateVersion: input.templateVersion ?? null,
    mode: input.mode ?? null,
  });
  const policyJson = buildAutomationPolicySnapshot(policy);
  const title = input.title?.trim() || input.projection.case.title;
  const resolvedObjective = resolveAutomationObjective({
    title,
    objective: input.objective ?? null,
    requestObjective: input.projection.request?.objective ?? null,
    caseSummary: input.projection.case.summary ?? null,
    caseTitle: input.projection.case.title ?? null,
  });

  const requestRecord = input.projection.request as Record<string, unknown> | null;
  const linkedConversationIds =
    input.linkedConversationIds ??
    asStringArray(requestRecord?.linkedConversationIdsJson);
  const linkedWorkpackRunIds =
    input.linkedWorkpackRunIds ??
    asStringArray(requestRecord?.linkedWorkpackRunIdsJson);
  const linkedRoleRoutineRunIds =
    input.linkedRoleRoutineRunIds ??
    asStringArray(requestRecord?.linkedRoleRoutineRunIdsJson);

  const sourceResolution = resolveWorkIntakeSources({
    actorContext,
    sourceRefs: await buildPreflightSourceSeeds({
      tenantId,
      ctx: input.ctx,
      projection: input.projection,
      linkedConversationIds,
      linkedWorkpackRunIds,
      linkedRoleRoutineRunIds,
    }),
    selectedSourceIds: input.selectedSourceIds,
  });

  const preflightRevision = buildPreflightRevisionFingerprint({
    requestTitle: title,
    requestObjective: resolvedObjective.objective,
    linkedConversationIds,
    linkedWorkpackRunIds,
    linkedRoleRoutineRunIds,
    selectedSourceIds: sourceResolution.selectedSourceIds,
    policyInputs: policyJson,
    explicitTeamId: input.explicitTeamId ?? null,
  });
  const explicitTeamAuthorized =
    Boolean(input.explicitTeamId) &&
    (input.ctx.user?.role === "admin" || input.ctx.user?.role === "domain_admin");
  const teamResolution = resolveTeamForAutomation({
    explicitTeamId: input.explicitTeamId ?? null,
    explicitTeamAuthorized,
    caseOwnerType: input.projection.case.ownerType,
    caseOwnerId: input.projection.case.ownerId,
    requestDefaultQueueId: input.projection.request?.defaultQueueId ?? null,
    requestDefaultOwnerType: input.projection.request?.defaultOwnerType ?? null,
    requestDefaultOwnerId: input.projection.request?.defaultOwnerId ?? null,
  });

  const capabilityCatalog = buildCapabilityCatalog({
    actorContext,
    flags,
    selectedSurfaces: policy.surfaceAllowlist,
  });
  const { brief, governedContext } = compileWorkBrief({
    actorContext,
    title,
    objective: resolvedObjective.objective,
    sourceRefs: sourceResolution.sourceRefs,
    selectedSourceIds: sourceResolution.selectedSourceIds,
    diagnostics: sourceResolution.diagnostics,
    generatedAt: preflightRevision.generatedAt,
  });
  const plan = createPreflightPlan({
    brief,
    capabilityCatalog,
    preflightRevision,
    teamResolution,
    policy,
    createdAt: preflightRevision.generatedAt,
  });
  const visibleReasonCodes = Array.from(
    new Set(
      capabilityCatalog
        .map(entry => entry.blockedReason)
        .filter((value): value is string => Boolean(value))
    )
  );
  const adminDiagnostics = {
    visibleReasonCodes,
    policyJson,
    teamResolution,
    governedContext,
    blockedAlternatives: plan.blockedAlternatives,
    selectedSourceIds: sourceResolution.selectedSourceIds,
    featureFlags: flags,
    sourceIntegrityMarkers: Object.keys(sourceResolution.integrityMarkers),
  };
  const draftBundle = appendBundleTelemetryEvent({
    bundle: preflightApprovalBundleSchema.parse({
      id: crypto.randomUUID(),
      tenantId,
      requestId: input.projection.request?.id ?? null,
      caseId: input.caseId,
      state: "previewed",
      createdAt: preflightRevision.generatedAt,
      updatedAt: preflightRevision.generatedAt,
      previewView: access.view,
      brief,
      capabilityCatalog,
      capabilityPlan: plan.capabilityPlan,
      executionPlan: plan.executionPlan,
      teamResolution,
      budget: plan.budget,
      approvalSnapshots: [],
      preflightRevision,
      createdByUserId: input.ctx.user?.id ?? null,
      launchedAt: null,
      supersededByBundleId: null,
      approvedAt: null,
      approvedByUserId: null,
      idempotencyRecords: [],
      stateTransitions: [
        {
          event: input.existingBundle ? "preview.regenerated" : "preview.generated",
          fromState: input.existingBundle?.state ?? null,
          toState: "previewed",
          actorUserId: input.ctx.user?.id ?? null,
          reasonCode: input.existingBundle
            ? "preview_regenerated"
            : "preview_generated",
          correlationId: crypto.randomUUID(),
          occurredAt: preflightRevision.generatedAt,
        },
      ],
      requesterSafeDiagnostics: buildRequesterSafeDiagnostics(adminDiagnostics),
      adminDiagnostics,
      metadata: {
        policyJson,
        featureFlags: flags,
        governedContext,
        blockedAlternatives: plan.blockedAlternatives,
      },
    }),
    ctx: input.ctx,
    eventName: input.existingBundle
      ? "preflight.preview.regenerated"
      : "preflight.preview.generated",
    severity: "info",
    primaryReasonCode: input.existingBundle
      ? "preview_regenerated"
      : "preview_generated",
    payload: {
      selectedSourceCount: sourceResolution.selectedSourceIds.length,
      visibleReasonCodes,
      previewView: access.view,
      privateVaultUnlocked,
    },
  });

  return {
    access,
    flags,
    actorContext,
    sourceResolution,
    policy,
    policyJson,
    draftBundle: {
      ...draftBundle,
      metadata: {
        ...draftBundle.metadata,
        launchReadiness: buildLaunchReadiness(draftBundle),
      },
    } satisfies PreflightApprovalBundle,
  };
}

async function materializePreflightBundle(input: Parameters<
  typeof buildPreflightBundleDraft
>[0] & { forceRegenerate?: boolean }) {
  const tenantId = requireTenantId(input.ctx);
  const existingBundle = await preflightBundleStoreService.getCurrentPreflightBundle({
    tenantId,
    caseId: input.caseId,
  });
  const draft = await buildPreflightBundleDraft({
    ...input,
    existingBundle,
  });

  const canReuseExisting =
    !input.forceRegenerate &&
    existingBundle &&
    existingBundle.preflightRevision.fingerprint ===
      draft.draftBundle.preflightRevision.fingerprint &&
    existingBundle.state !== "stale" &&
    existingBundle.state !== "launch_blocked" &&
    existingBundle.state !== "cancelled" &&
    existingBundle.state !== "superseded";

  if (canReuseExisting) {
    return {
      access: draft.access,
      bundle: existingBundle,
      sourceResolution: draft.sourceResolution,
      policyJson: draft.policyJson,
    };
  }

  const bundle = await preflightBundleStoreService.putPreflightBundle({
    tenantId,
    caseId: input.caseId,
    bundle: draft.draftBundle,
    makeCurrent: true,
    supersedeCurrent: Boolean(existingBundle),
  });

  return {
    access: draft.access,
    bundle,
    sourceResolution: draft.sourceResolution,
    policyJson: draft.policyJson,
  };
}

function surfaceGateFor(surface: WorkOrchestratorSurface) {
  switch (surface) {
    case "skill":
      return "manifest_risk_policy" as const;
    case "agency":
      return "capability_risk_policy" as const;
    case "workflow":
      return "feature_flag_runtime_permission_approval" as const;
    case "browser":
      return "connector_domain_policy" as const;
    case "document_management":
      return "bounded_write_scope" as const;
    case "media_studio":
      return "provider_allowlist_quota" as const;
    case "skill_studio":
      return "skill_studio_action_policy" as const;
    case "manual":
      return "human_action" as const;
    case "video_editor":
    case "work_os":
    default:
      return "explicit_approval" as const;
  }
}

function buildCapabilityEntry(input: {
  surface: WorkOrchestratorSurface;
  action?: SkillStudioAction | null;
  selected: boolean;
}) {
  const contractCompatibility = getDefaultContractCompatibility(input.surface);
  const approvalRequired =
    input.surface === "workflow" ||
    input.surface === "skill_studio" ||
    input.surface === "video_editor" ||
    input.surface === "manual" ||
    input.surface === "work_os";
  return {
    id: input.action ? `${input.surface}:${input.action}` : input.surface,
    surface: input.surface,
    action: input.action ?? null,
    title: input.action
      ? `Skill Studio: ${input.action.replace(/_/g, " ")}`
      : input.surface.replace(/_/g, " "),
    description: input.selected
      ? "Selected by the legacy launch policy allowlist."
      : "Planner-visible capability candidate.",
    governance: {
      surface: input.surface,
      action: input.action ?? null,
      plannerVisible: true,
      autoExecutableByDefault:
        input.surface === "skill" || input.surface === "agency",
      approvalRequired,
      minimumGate: surfaceGateFor(input.surface),
      requiredFeatureFlags:
        input.surface === "workflow"
          ? ["workflow_surface_planning"]
          : input.surface === "skill_studio"
            ? ["skill_studio_planning"]
            : [],
      requiredPermissions:
        input.surface === "workflow"
          ? ["workflow:execute"]
          : input.surface === "skill_studio"
            ? ["skill_studio:launch"]
            : [],
    },
    contractCompatibility,
    blockedReason:
      contractCompatibility.state === "blocked_contract_not_migrated"
        ? contractCompatibility.reasonCode
        : null,
    metadata: {
      selected: input.selected,
    },
  };
}

async function startAutomationKickoffWorkItem(params: {
  tenantId: string;
  userId: number;
  run: Awaited<ReturnType<typeof automationFabricService.createAutomationRun>>;
  projection: Awaited<ReturnType<typeof workOsService.getWorkCaseProjection>>;
  roomLanguage: "en" | "th";
  teamResolution?: ReturnType<typeof resolveTeamForAutomation>;
  approvedBundle?: PreflightApprovalBundle | null;
  stopPolicy?: ReturnType<typeof buildDefaultTeamStopPolicy>;
}): Promise<
  | {
      ok: true;
      teamId: string;
      roomId: string;
      teamRunId: string | null;
      workItemId: string | null;
    }
  | {
      ok: false;
      reasonCode: AutomationKickoffFailureReason;
      teamId: string | null;
      roomId: string | null;
      teamRunId: string | null;
      workItemId: string | null;
    }
> {
  logAutomationStartTrace("kickoff.begin", {
    tenantId: params.tenantId,
    userId: params.userId,
    runId: params.run.id,
    caseId: params.run.caseId,
    requestId: params.projection.request?.id ?? null,
    caseOwnerType: params.projection.case.ownerType,
    caseOwnerId: params.projection.case.ownerId,
    roomLanguage: params.roomLanguage,
    requestDefaultOwnerType:
      params.projection.request?.defaultOwnerType ?? null,
    requestDefaultOwnerId: params.projection.request?.defaultOwnerId ?? null,
    requestDefaultQueueId: params.projection.request?.defaultQueueId ?? null,
  });

  const teamResolution =
    params.teamResolution ??
    resolveTeamForAutomation({
      caseOwnerType: params.projection.case.ownerType,
      caseOwnerId: params.projection.case.ownerId,
      requestDefaultQueueId: params.projection.request?.defaultQueueId ?? null,
      requestDefaultOwnerType:
        params.projection.request?.defaultOwnerType ?? null,
      requestDefaultOwnerId: params.projection.request?.defaultOwnerId ?? null,
    });
  const kickoffTeamId = teamResolution.teamId;

  if (teamResolution.status !== "resolved" || !kickoffTeamId) {
    logAutomationStartTrace("kickoff.no_team", {
      tenantId: params.tenantId,
      userId: params.userId,
      runId: params.run.id,
      caseId: params.run.caseId,
      requestId: params.projection.request?.id ?? null,
      teamResolution,
    });
    return {
      ok: false,
      reasonCode: "missing_team",
      teamId: null,
      roomId: null,
      teamRunId: null,
      workItemId: null,
    };
  }

  logAutomationStartTrace("kickoff.team_resolved", {
    tenantId: params.tenantId,
    userId: params.userId,
    runId: params.run.id,
    caseId: params.run.caseId,
    teamId: kickoffTeamId,
    teamResolution,
  });

  let room: Awaited<ReturnType<typeof roomService.createRoom>>;
  try {
    room = await roomService.createRoom({
      tenantId: params.tenantId,
      teamId: kickoffTeamId,
      orchestratorUserId: params.userId,
      roomType: "auto_team",
      goalPrompt: params.run.objective ?? params.run.title,
      language: params.roomLanguage,
      projectId: params.projection.request?.projectId ?? undefined,
      autonomyLevel: "autonomous",
    });
    logAutomationStartTrace("kickoff.room_created", {
      tenantId: params.tenantId,
      userId: params.userId,
      runId: params.run.id,
      caseId: params.run.caseId,
      teamId: kickoffTeamId,
      roomId: room.id,
      roomType: room.roomType,
    });
  } catch (error) {
    logAutomationStartError("kickoff.room_create_failed", error, {
      tenantId: params.tenantId,
      userId: params.userId,
      runId: params.run.id,
      caseId: params.run.caseId,
      teamId: kickoffTeamId,
    });
    return {
      ok: false,
      reasonCode: "room_create_failed",
      teamId: kickoffTeamId,
      roomId: null,
      teamRunId: null,
      workItemId: null,
    };
  }

  const resolvedObjective = resolveAutomationObjective({
    title: params.run.title,
    objective: params.run.objective,
    requestObjective: params.projection.request?.objective ?? null,
    caseSummary: params.projection.case.summary ?? null,
    caseTitle: params.projection.case.title ?? null,
  });
  logAutomationStartTrace("kickoff.team_run_start_requested", {
    tenantId: params.tenantId,
    userId: params.userId,
    runId: params.run.id,
    caseId: params.run.caseId,
    teamId: kickoffTeamId,
    roomId: room.id,
    objective: resolvedObjective.objective ?? params.run.objective ?? null,
    requestedMode: "fully_auto",
    roomLanguage: params.roomLanguage,
  });

  let currentTeamRun: Awaited<ReturnType<typeof runEngine.startRun>>;
  try {
    currentTeamRun = await runEngine.startRun({
      roomId: room.id,
      tenantId: params.tenantId,
      initiatedByUserId: params.userId,
      executionMode: "auto_team",
      objective:
        resolvedObjective.objective ?? params.run.objective ?? params.run.title,
      stopPolicy: params.stopPolicy ?? buildDefaultTeamStopPolicy(),
      constraintsJson: {
        workOsAutomationRunId: params.run.id,
        workCaseId: params.run.caseId,
        workRequestId: params.projection.request?.id ?? null,
        source: "work_os",
        ...(params.approvedBundle
          ? {
              workOrchestrator: {
                preflightBundle: params.approvedBundle,
              },
            }
          : {}),
      },
      approvalPolicyJson: params.approvedBundle
        ? {
            workOrchestrator: {
              preflightBundle: params.approvedBundle,
            },
          }
        : undefined,
    });
    logAutomationStartTrace("kickoff.team_run_started", {
      tenantId: params.tenantId,
      userId: params.userId,
      runId: params.run.id,
      caseId: params.run.caseId,
      teamId: kickoffTeamId,
      roomId: room.id,
      teamRunId: currentTeamRun.id,
      teamRunStatus: currentTeamRun.status,
      teamRunExecutionMode: currentTeamRun.executionMode,
    });

    logAutomationStartTrace("kickoff.team_auto_advance_requested", {
      tenantId: params.tenantId,
      userId: params.userId,
      runId: params.run.id,
      caseId: params.run.caseId,
      teamId: kickoffTeamId,
      roomId: room.id,
      teamRunId: currentTeamRun.id,
    });
    await runEngine.advanceRun(currentTeamRun.id, params.tenantId, 1);
    const advancedRun = await runEngine.getRun(
      currentTeamRun.id,
      params.tenantId
    );
    if (advancedRun) {
      currentTeamRun = advancedRun;
    }
    logAutomationStartTrace("kickoff.team_auto_advance_completed", {
      tenantId: params.tenantId,
      userId: params.userId,
      runId: params.run.id,
      caseId: params.run.caseId,
      teamId: kickoffTeamId,
      roomId: room.id,
      teamRunId: currentTeamRun.id,
      teamRunStatus: currentTeamRun.status,
    });
  } catch (error) {
    logAutomationStartError("kickoff.team_run_start_failed", error, {
      tenantId: params.tenantId,
      userId: params.userId,
      runId: params.run.id,
      caseId: params.run.caseId,
      teamId: kickoffTeamId,
      roomId: room.id,
    });
    return {
      ok: false,
      reasonCode: "team_run_start_failed",
      teamId: kickoffTeamId,
      roomId: room.id,
      teamRunId: null,
      workItemId: null,
    };
  }

  const workItems = await workItemService
    .listWorkItemsByRoom(room.id, params.tenantId)
    .catch(() => []);
  const kickoffWorkItem = selectLatestRevisionWorkItem(
    workItems,
    currentTeamRun.id
  );

  if (kickoffWorkItem) {
    logAutomationStartTrace("kickoff.team_work_item_found", {
      tenantId: params.tenantId,
      userId: params.userId,
      runId: params.run.id,
      caseId: params.run.caseId,
      teamId: kickoffTeamId,
      roomId: room.id,
      teamRunId: currentTeamRun.id,
      workItemId: kickoffWorkItem.id,
      workItemStatus: kickoffWorkItem.status,
      workItemSourceType: kickoffWorkItem.sourceType,
      workItemSourceRef: kickoffWorkItem.sourceRef,
    });

    try {
      await workOsService.attachLegacyTaskToCase({
        tenantId: params.tenantId,
        caseId: params.run.caseId,
        taskId: kickoffWorkItem.id,
        actorUserId: params.userId,
      });
      logAutomationStartTrace("kickoff.team_work_item_linked", {
        tenantId: params.tenantId,
        userId: params.userId,
        runId: params.run.id,
        caseId: params.run.caseId,
        teamId: kickoffTeamId,
        roomId: room.id,
        teamRunId: currentTeamRun.id,
        workItemId: kickoffWorkItem.id,
      });
    } catch (error) {
      logAutomationStartError("kickoff.team_work_item_link_failed", error, {
        tenantId: params.tenantId,
        userId: params.userId,
        runId: params.run.id,
        caseId: params.run.caseId,
        teamId: kickoffTeamId,
        roomId: room.id,
        teamRunId: currentTeamRun.id,
        workItemId: kickoffWorkItem.id,
      });
    }
  } else {
    logAutomationStartTrace("kickoff.team_work_item_missing", {
      tenantId: params.tenantId,
      userId: params.userId,
      runId: params.run.id,
      caseId: params.run.caseId,
      teamId: kickoffTeamId,
      roomId: room.id,
      teamRunId: currentTeamRun.id,
    });
  }

  const kickoffBrief = buildAutomationKickoffContent({
    title: params.run.title,
    objective: resolvedObjective.objective ?? params.run.objective ?? null,
    requestTitle: params.projection.request?.title ?? null,
    requestObjective: params.projection.request?.objective ?? null,
    caseSummary: params.projection.case.summary ?? null,
    runMode: "auto_team",
    teamId: kickoffTeamId,
    language: params.roomLanguage,
  });

  logAutomationStartTrace("kickoff.completed", {
    tenantId: params.tenantId,
    userId: params.userId,
    runId: params.run.id,
    caseId: params.run.caseId,
    teamId: kickoffTeamId,
    roomId: room.id,
    teamRunId: currentTeamRun.id,
    workItemId: kickoffWorkItem?.id ?? null,
    resolvedObjectiveSource: resolvedObjective.source,
    resolvedObjective: resolvedObjective.objective,
    kickoffSummary: kickoffBrief.summary,
  });

  return {
    ok: true,
    teamId: kickoffTeamId,
    roomId: room.id,
    teamRunId: currentTeamRun?.id ?? null,
    workItemId: kickoffWorkItem?.id ?? null,
  };
}

const assignmentTypeSchema = z.enum(["human", "queue", "role", "hybrid"]);
const automationModeSchema = z.enum([
  "manual_assist",
  "semi_auto",
  "fully_auto",
]);
const automationRunStatusSchema = z.enum([
  "pending",
  "running",
  "waiting_for_input",
  "waiting_for_approval",
  "paused",
  "completed",
  "failed",
  "cancelled",
]);
const automationStepStatusSchema = z.enum([
  "planned",
  "running",
  "needs_input",
  "awaiting_approval",
  "blocked",
  "succeeded",
  "failed",
  "skipped",
  "cancelled",
]);
const automationCheckpointApprovalStateSchema = z.enum([
  "pending",
  "approved",
  "rejected",
  "not_required",
]);
const automationCheckpointStatusSchema = z.enum([
  "open",
  "approved",
  "rejected",
  "resumed",
  "cancelled",
]);
const automationSurfaceSchema = z.enum([
  "manual",
  "work_os",
  "skill",
  "agency",
  "browser",
  "document_management",
  "media_studio",
  "video_editor",
]);

export const workOsRouter = router({
  createRequest: protectedProcedure
    .input(
      z.object({
        projectId: z.number().int().optional(),
        sourceType: z.string().min(1),
        sourceRef: z.string().max(255).optional(),
        requesterType: assignmentTypeSchema.optional(),
        requesterId: z.string().max(36).optional(),
        workType: z.string().max(100).optional(),
        businessDomain: z.string().max(100).optional(),
        urgency: z.string().max(30).optional(),
        riskLevel: z.string().max(30).optional(),
        classificationConfidence: z.number().min(0).max(1).optional(),
        defaultOwnerType: assignmentTypeSchema.optional(),
        defaultOwnerId: z.string().max(36).optional(),
        defaultQueueId: z.string().max(36).optional(),
        title: z.string().min(1).max(500),
        objective: z.string().max(10000).optional(),
        linkedConversationIds: z.array(z.string().min(1)).optional(),
        linkedWorkpackRunIds: z.array(z.string().min(1)).optional(),
        linkedRoleRoutineRunIds: z.array(z.string().min(1)).optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const tenantId = requireTenantId(ctx);
      const { requesterId: inputRequesterId, ...requestInput } = input;
      const currentUserId = String(ctx.user!.id);
      const isAdmin = isPreflightAdminRole(ctx.user?.role ?? null);
      if (
        inputRequesterId &&
        inputRequesterId !== currentUserId &&
        !isAdmin
      ) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "REQUESTER_ID_OVERRIDE_FORBIDDEN",
        });
      }
      const requesterId = inputRequesterId ?? currentUserId;
      return workOsService.createWorkRequest({
        tenantId,
        ...requestInput,
        requesterId,
      });
    }),

  getRequest: protectedProcedure
    .input(z.object({ requestId: z.string().min(1) }))
    .query(async ({ input, ctx }) => {
      const tenantId = requireTenantId(ctx);
      return workOsService.getWorkRequest({
        tenantId,
        requestId: input.requestId,
        actorUserId: ctx.user?.id ?? null,
        actorRole: ctx.user?.role ?? null,
      });
    }),

  updateRequest: protectedProcedure
    .input(
      z.object({
        requestId: z.string().min(1),
        title: z.string().min(1).max(500).optional(),
        objective: z.string().max(10000).optional().nullable(),
        sourceType: z.string().max(50).optional(),
        sourceRef: z.string().max(255).optional().nullable(),
        businessDomain: z.string().max(100).optional().nullable(),
        urgency: z.string().max(30).optional(),
        riskLevel: z.string().max(30).optional(),
        defaultOwnerType: assignmentTypeSchema.optional().nullable(),
        defaultOwnerId: z.string().max(36).optional().nullable(),
        defaultQueueId: z.string().max(36).optional().nullable(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const tenantId = requireTenantId(ctx);
      return workOsService.updateWorkRequest({
        tenantId,
        requestId: input.requestId,
        actorUserId: ctx.user?.id ?? null,
        actorRole: ctx.user?.role ?? null,
        title: input.title,
        objective: input.objective,
        sourceType: input.sourceType,
        sourceRef: input.sourceRef,
        businessDomain: input.businessDomain,
        urgency: input.urgency,
        riskLevel: input.riskLevel,
        defaultOwnerType: input.defaultOwnerType,
        defaultOwnerId: input.defaultOwnerId,
        defaultQueueId: input.defaultQueueId,
      });
    }),

  listMyRequests: protectedProcedure
    .input(
      z.object({ limit: z.number().int().min(1).max(50).optional() }).optional()
    )
    .query(async ({ input, ctx }) => {
      const tenantId = requireTenantId(ctx);
      return workOsService.listMyWorkRequests({
        tenantId,
        requesterId: String(ctx.user!.id),
        limit: input?.limit ?? 10,
      });
    }),

  createTask: domainAdminProcedure
    .input(
      z.object({
        caseId: z.string().min(1),
        teamId: z.string().min(1),
        roomId: z.string().min(1),
        runId: z.string().min(1).optional(),
        title: z.string().min(1).max(500),
        objective: z.string().max(10000).optional(),
        sourceType: z.string().max(50).optional(),
        sourceRef: z.string().max(255).optional(),
        priority: z.enum(["low", "normal", "high", "urgent"]).optional(),
        riskClass: z.enum(["low", "medium", "high", "critical"]).optional(),
        requiresApproval: z.boolean().optional(),
        actorUserId: z.number().int().optional(),
        actorAssistantId: z.string().min(1).optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const tenantId = requireTenantId(ctx);
      return workOsService.createWorkTask({
        tenantId,
        ...input,
      });
    }),

  attachLegacyTask: domainAdminProcedure
    .input(
      z.object({
        caseId: z.string().min(1),
        taskId: z.string().min(1),
        actorUserId: z.number().int().optional(),
        actorAssistantId: z.string().min(1).optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const tenantId = requireTenantId(ctx);
      return workOsService.attachLegacyTaskToCase({
        tenantId,
        ...input,
      });
    }),

  getCase: domainAdminProcedure
    .input(z.object({ caseId: z.string().min(1) }))
    .query(async ({ input, ctx }) => {
      const tenantId = requireTenantId(ctx);
      return workOsService.getWorkCaseProjection(input.caseId, tenantId);
    }),

  projectTask: domainAdminProcedure
    .input(z.object({ taskId: z.string().min(1) }))
    .query(async ({ input, ctx }) => {
      const tenantId = requireTenantId(ctx);
      return workOsService.projectTaskAsCase(input.taskId, tenantId);
    }),

  inbox: domainAdminProcedure
    .input(
      z
        .object({
          ownerType: assignmentTypeSchema.optional(),
          ownerId: z.string().max(36).optional(),
        })
        .optional()
    )
    .query(async ({ input, ctx }) => {
      const tenantId = requireTenantId(ctx);
      return workOsService.getInbox(
        tenantId,
        input?.ownerType ?? null,
        input?.ownerId ?? null
      );
    }),

  timeline: domainAdminProcedure
    .input(z.object({ caseId: z.string().min(1) }))
    .query(async ({ input, ctx }) => {
      const tenantId = requireTenantId(ctx);
      const projection = await workOsService.getWorkCaseProjection(
        input.caseId,
        tenantId
      );
      return projection.timeline;
    }),

  recordApproval: domainAdminProcedure
    .input(
      z.object({
        caseId: z.string().min(1),
        taskId: z.string().min(1).optional(),
        requestId: z.string().min(1).optional(),
        approvalTransportId: z.string().min(1).optional(),
        decision: z
          .enum(["pending", "approved", "rejected", "cancelled"])
          .optional(),
        approverType: assignmentTypeSchema.optional(),
        approverId: z.string().min(1).optional(),
        comment: z.string().max(1000).optional(),
        metadataJson: z.record(z.string(), z.unknown()).optional(),
        actorUserId: z.number().int().optional(),
        actorAssistantId: z.string().min(1).optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const tenantId = requireTenantId(ctx);
      return workOsService.recordApproval({
        tenantId,
        ...input,
      });
    }),

  recordException: domainAdminProcedure
    .input(
      z.object({
        caseId: z.string().min(1),
        taskId: z.string().min(1).optional(),
        requestId: z.string().min(1).optional(),
        exceptionType: z.string().min(1).max(100),
        severity: z.string().max(30).optional(),
        reason: z.string().max(5000).optional(),
        ownerType: assignmentTypeSchema.optional(),
        ownerId: z.string().min(1).optional(),
        status: z.enum(["open", "paused", "downgraded", "resolved"]).optional(),
        metadataJson: z.record(z.string(), z.unknown()).optional(),
        actorUserId: z.number().int().optional(),
        actorAssistantId: z.string().min(1).optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const tenantId = requireTenantId(ctx);
      return workOsService.recordException({
        tenantId,
        ...input,
      });
    }),

  recordOutcome: domainAdminProcedure
    .input(
      z.object({
        caseId: z.string().min(1),
        taskId: z.string().min(1).optional(),
        requestId: z.string().min(1).optional(),
        disposition: z.string().min(1).max(100),
        resolutionCode: z.string().max(100).optional(),
        customerImpact: z.string().max(100).optional(),
        reviewerResult: z.string().max(100).optional(),
        followUpRequired: z.boolean().optional(),
        summary: z.string().max(5000).optional(),
        metadataJson: z.record(z.string(), z.unknown()).optional(),
        actorUserId: z.number().int().optional(),
        actorAssistantId: z.string().min(1).optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const tenantId = requireTenantId(ctx);
      return workOsService.recordOutcome({
        tenantId,
        ...input,
      });
    }),

  recordSla: domainAdminProcedure
    .input(
      z.object({
        caseId: z.string().min(1),
        taskId: z.string().min(1).optional(),
        requestId: z.string().min(1).optional(),
        policyId: z.string().min(1).optional(),
        dueAt: z.coerce.date().optional(),
        serviceWindowStartAt: z.coerce.date().optional(),
        serviceWindowEndAt: z.coerce.date().optional(),
        urgency: z.string().max(30).optional(),
        breachState: z
          .enum(["none", "at_risk", "breached", "resolved"])
          .optional(),
        breachedAt: z.coerce.date().optional(),
        escalatedAt: z.coerce.date().optional(),
        actorUserId: z.number().int().optional(),
        actorAssistantId: z.string().min(1).optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const tenantId = requireTenantId(ctx);
      return workOsService.recordSla({
        tenantId,
        ...input,
      });
    }),

  reassignCase: domainAdminProcedure
    .input(
      z.object({
        caseId: z.string().min(1),
        ownerType: assignmentTypeSchema,
        ownerId: z.string().max(36).optional(),
        reason: z.string().max(500).optional(),
        actorUserId: z.number().int().optional(),
        actorAssistantId: z.string().min(1).optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const tenantId = requireTenantId(ctx);
      return workOsService.reassignWorkCase({
        tenantId,
        ...input,
      });
    }),

  createAutomationRun: protectedProcedure
    .input(
      z.object({
        caseId: z.string().min(1),
        requestId: z.string().min(1).optional(),
        taskId: z.string().min(1).optional(),
        roomLanguage: z.enum(["en", "th"]).optional(),
        templateKey: z.string().min(1).max(120).optional(),
        templateVersion: z.string().max(50).optional(),
        title: z.string().min(1).max(500),
        objective: z.string().max(10000).optional(),
        mode: automationModeSchema.optional(),
        status: automationRunStatusSchema.optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const tenantId = requireTenantId(ctx);
      const flags = await getWorkOrchestratorFeatureFlags();
      if (flags.launchEnforcement) {
        throw new TRPCError({
          code: "CONFLICT",
          message: "PREVIEW_APPROVAL_REQUIRED",
        });
      }
      const requestedMode = input.mode ?? "fully_auto";
      const roomLanguage = roomService.normalizeRoomLanguage(
        input.roomLanguage
      );
      logAutomationStartTrace("createAutomationRun.requested", {
        tenantId,
        userId: ctx.user?.id ?? null,
        caseId: input.caseId,
        requestId: input.requestId ?? null,
        taskId: input.taskId ?? null,
        title: input.title,
        mode: requestedMode,
        preserveRequestedMode: true,
        roomLanguage,
      });
      const projection = await workOsService.getWorkCaseProjection(
        input.caseId,
        tenantId
      );
      const isRequester =
        ctx.user?.id != null &&
        projection.request?.requesterId === String(ctx.user.id);
      const isAdmin =
        ctx.user?.role === "admin" || ctx.user?.role === "domain_admin";
      if (!isRequester && !isAdmin) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message:
            "You can only start automation for your own request or as an admin.",
        });
      }
      const resolvedObjective = resolveAutomationObjective({
        title: input.title,
        objective: input.objective ?? null,
        requestObjective: projection.request?.objective ?? null,
        caseSummary: projection.case.summary ?? null,
        caseTitle: projection.case.title ?? null,
      });
      const run = await automationFabricService.createAutomationRun({
        tenantId,
        ...input,
        mode: requestedMode,
        preserveRequestedMode: true,
        roomLanguage,
        objective: resolvedObjective.objective ?? input.objective ?? null,
        createdByUserId: ctx.user?.id ?? null,
        createdByAssistantId: null,
      });

      logAutomationStartTrace("createAutomationRun.created", {
        tenantId,
        userId: ctx.user?.id ?? null,
        caseId: input.caseId,
        requestId: input.requestId ?? null,
        runId: run.id,
        runStatus: run.status,
        runMode: run.currentMode,
        requestedMode,
        preserveRequestedMode: true,
        roomLanguage,
        resolvedObjectiveSource: resolvedObjective.source,
        resolvedObjective: resolvedObjective.objective,
      });

      const kickoff = await startAutomationKickoffWorkItem({
        tenantId,
        userId: ctx.user!.id,
        run,
        projection,
        roomLanguage,
      }).catch(error => {
        logAutomationStartError("kickoff.unhandled_error", error, {
          tenantId,
          userId: ctx.user?.id ?? null,
          caseId: input.caseId,
          requestId: input.requestId ?? null,
          runId: run.id,
        });
        return null;
      });

      return {
        ...run,
        kickoff: kickoff && kickoff.ok ? {
          teamId: kickoff.teamId,
          roomId: kickoff.roomId,
          teamRunId: kickoff.teamRunId,
          workItemId: kickoff.workItemId,
        } : null,
      };
    }),

  resolvePreflightPreview: protectedProcedure
    .input(
      z.object({
        caseId: z.string().min(1),
        title: z.string().max(500).optional(),
        objective: z.string().max(10000).optional(),
        mode: automationModeSchema.optional(),
        templateKey: z.string().min(1).max(120).optional(),
        templateVersion: z.string().max(50).optional(),
        linkedConversationIds: z.array(z.string().min(1)).optional(),
        linkedWorkpackRunIds: z.array(z.string().min(1)).optional(),
        linkedRoleRoutineRunIds: z.array(z.string().min(1)).optional(),
        selectedSourceIds: z.array(z.string().min(1)).optional(),
        explicitTeamId: z.string().min(1).optional(),
        idempotencyKey: z.string().max(180).optional(),
      })
    )
    .query(async ({ input, ctx }) => {
      const tenantId = requireTenantId(ctx);
      const projection = await workOsService.getWorkCaseProjection(
        input.caseId,
        tenantId
      );
      const { access, bundle } = await materializePreflightBundle({
        ...input,
        ctx,
        projection,
      });

      return formatPreflightBundleResponse({
        access,
        bundle,
      });
    }),

  regeneratePreflightPreview: protectedProcedure
    .input(
      z.object({
        caseId: z.string().min(1),
        previousPreflightBundleId: z.string().min(1).optional(),
        title: z.string().max(500).optional(),
        objective: z.string().max(10000).optional(),
        mode: automationModeSchema.optional(),
        templateKey: z.string().min(1).max(120).optional(),
        templateVersion: z.string().max(50).optional(),
        linkedConversationIds: z.array(z.string().min(1)).optional(),
        linkedWorkpackRunIds: z.array(z.string().min(1)).optional(),
        linkedRoleRoutineRunIds: z.array(z.string().min(1)).optional(),
        selectedSourceIds: z.array(z.string().min(1)).optional(),
        explicitTeamId: z.string().min(1).optional(),
        regenerationReason: z.string().max(500).optional(),
        idempotencyKey: z.string().min(1).max(180),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const tenantId = requireTenantId(ctx);
      const projection = await workOsService.getWorkCaseProjection(
        input.caseId,
        tenantId
      );
      const currentBundle =
        await preflightBundleStoreService.getCurrentPreflightBundle({
          tenantId,
          caseId: input.caseId,
        });
      const idempotencyFingerprint = buildPreflightInputFingerprint({
        caseId: input.caseId,
        previousPreflightBundleId: input.previousPreflightBundleId ?? null,
        title: input.title ?? null,
        objective: input.objective ?? null,
        mode: input.mode ?? null,
        templateKey: input.templateKey ?? null,
        templateVersion: input.templateVersion ?? null,
        linkedConversationIds: input.linkedConversationIds ?? [],
        linkedWorkpackRunIds: input.linkedWorkpackRunIds ?? [],
        linkedRoleRoutineRunIds: input.linkedRoleRoutineRunIds ?? [],
        selectedSourceIds: input.selectedSourceIds ?? [],
        explicitTeamId: input.explicitTeamId ?? null,
        regenerationReason: input.regenerationReason ?? null,
      });

      if (currentBundle) {
        const idempotency = checkIdempotency({
          bundle: currentBundle,
          operation: "regenerate_preflight_preview",
          idempotencyKey: input.idempotencyKey,
          inputFingerprint: idempotencyFingerprint,
        });
        if (idempotency.conflict) {
          throw new TRPCError({
            code: "CONFLICT",
            message: "REGENERATION_IDEMPOTENCY_CONFLICT",
          });
        }
        if (idempotency.matched) {
          return {
            ...formatPreflightBundleResponse({
              access: resolvePreflightPreviewAccess({
                actorUserId: ctx.user?.id ?? null,
                actorRole: ctx.user?.role ?? null,
                requesterId: projection.request?.requesterId ?? null,
              }),
              bundle: currentBundle,
            }),
            supersededBundleIds: [],
          };
        }
      }

      const previousBundle =
        input.previousPreflightBundleId != null
          ? await preflightBundleStoreService.getPreflightBundle({
              tenantId,
              caseId: input.caseId,
              preflightBundleId: input.previousPreflightBundleId,
            })
          : currentBundle;

      if (input.previousPreflightBundleId && !previousBundle) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "PREVIEW_NOT_FOUND",
        });
      }

      const draft = await buildPreflightBundleDraft({
        ...input,
        ctx,
        projection,
        existingBundle: previousBundle,
      });
      const persisted = await preflightBundleStoreService.putPreflightBundle({
        tenantId,
        caseId: input.caseId,
        bundle: appendIdempotencyRecord({
          bundle: draft.draftBundle,
          operation: "regenerate_preflight_preview",
          idempotencyKey: input.idempotencyKey,
          inputFingerprint: idempotencyFingerprint,
          result: {
            preflightBundleId: draft.draftBundle.id,
            state: "previewed",
          },
        }),
        makeCurrent: true,
        supersedeCurrent: Boolean(previousBundle),
      });

      return {
        ...formatPreflightBundleResponse({
          access: draft.access,
          bundle: persisted,
        }),
        supersededBundleIds:
          previousBundle && previousBundle.id !== persisted.id
            ? [previousBundle.id]
            : [],
      };
    }),

  approvePreflightBundle: protectedProcedure
    .input(
      z.object({
        caseId: z.string().min(1),
        preflightBundleId: z.string().min(1),
        approvedRevisionHash: z.string().regex(/^[a-f0-9]{64}$/),
        selectedSourceIds: z.array(z.string().min(1)),
        approvalDecision: z.enum(["approve"]),
        approvalComment: z.string().max(2000).optional(),
        idempotencyKey: z.string().min(1).max(180),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const { tenantId, projection, access, bundle } = await loadStoredPreflightBundle({
        caseId: input.caseId,
        preflightBundleId: input.preflightBundleId,
        ctx,
      });

      const currentBundle =
        await preflightBundleStoreService.getCurrentPreflightBundle({
          tenantId,
          caseId: input.caseId,
        });
      if (!currentBundle || currentBundle.id !== bundle.id) {
        throw new TRPCError({
          code: "CONFLICT",
          message: "APPROVAL_BUNDLE_SUPERSEDED",
        });
      }

      const idempotencyFingerprint = buildPreflightInputFingerprint({
        preflightBundleId: input.preflightBundleId,
        approvedRevisionHash: input.approvedRevisionHash,
        selectedSourceIds: input.selectedSourceIds,
        approvalDecision: input.approvalDecision,
        approvalComment: input.approvalComment ?? null,
      });
      const idempotency = checkIdempotency({
        bundle,
        operation: "approve_preflight_bundle",
        idempotencyKey: input.idempotencyKey,
        inputFingerprint: idempotencyFingerprint,
      });
      if (idempotency.conflict) {
        throw new TRPCError({
          code: "CONFLICT",
          message: "APPROVAL_IDEMPOTENCY_CONFLICT",
        });
      }
      if (idempotency.matched) {
        return {
          preflightBundleId: currentBundle.id,
          state: currentBundle.state,
          approvedAt: currentBundle.approvedAt ?? null,
          approvedByUserId: currentBundle.approvedByUserId ?? null,
          preflightRevision: currentBundle.preflightRevision,
          approvalSnapshots:
            access.view === "admin_diagnostic" && !access.redacted
              ? currentBundle.approvalSnapshots
              : [],
          launchReadiness: buildLaunchReadiness(currentBundle),
        };
      }

      const normalizedSelectedIds = Array.from(
        new Set(input.selectedSourceIds.map(value => value.trim()).filter(Boolean))
      ).sort();
      const currentDraft = await buildCurrentDraftForStoredBundle({
        caseId: input.caseId,
        bundle,
        projection,
        ctx,
      });
      const revisionComparison = comparePreflightRevision(
        bundle.preflightRevision,
        currentDraft.draftBundle.preflightRevision,
      );
      const approvedSelectedIds = [
        ...currentDraft.draftBundle.preflightRevision.inputs.selectedSourceIds,
      ].sort();
      if (
        revisionComparison.stale ||
        input.approvedRevisionHash !== bundle.preflightRevision.fingerprint ||
        stableStringify(normalizedSelectedIds) !==
        stableStringify(approvedSelectedIds)
      ) {
        await preflightBundleStoreService.putPreflightBundle({
          tenantId,
          caseId: input.caseId,
          bundle: transitionPreflightBundle({
            bundle,
            toState: "stale",
            event: "request.edited",
            actorUserId: ctx.user?.id ?? null,
            reasonCode: revisionComparison.reasonCode ?? "PREVIEW_STALE",
          }),
          makeCurrent: true,
        });
        throw new TRPCError({
          code: "CONFLICT",
          message: "PREVIEW_STALE",
        });
      }

      const approvedSnapshots = captureApprovalSnapshots({
        sourceRefs: currentDraft.draftBundle.brief.sourceRefs,
        selectedSourceIds: normalizedSelectedIds,
        privateVaultUnlocked: currentDraft.actorContext.privateVaultUnlocked,
        integrityMarkers: currentDraft.sourceResolution.integrityMarkers,
      });
      const sourceDrift = compareApprovalSnapshots(
        approvedSnapshots,
        currentDraft.draftBundle.brief.sourceRefs,
        currentDraft.sourceResolution.integrityMarkers,
      );
      if (sourceDrift.hasDrift) {
        throw new TRPCError({
          code: "CONFLICT",
          message: "APPROVAL_SOURCE_DRIFT",
        });
      }
      if (bundle.state === "approved") {
        return {
          preflightBundleId: currentBundle.id,
          state: currentBundle.state,
          approvedAt: currentBundle.approvedAt ?? null,
          approvedByUserId: currentBundle.approvedByUserId ?? null,
          preflightRevision: currentBundle.preflightRevision,
          approvalSnapshots:
            access.view === "admin_diagnostic" && !access.redacted
              ? currentBundle.approvalSnapshots
              : [],
          launchReadiness: buildLaunchReadiness(currentBundle),
        };
      }
      const approvedBundle = appendIdempotencyRecord({
        bundle: appendBundleTelemetryEvent({
          bundle: transitionPreflightBundle({
            bundle: {
              ...bundle,
              capabilityCatalog: currentDraft.draftBundle.capabilityCatalog,
              capabilityPlan: currentDraft.draftBundle.capabilityPlan,
              executionPlan: currentDraft.draftBundle.executionPlan,
              teamResolution: currentDraft.draftBundle.teamResolution,
              budget: currentDraft.draftBundle.budget,
              approvalSnapshots: approvedSnapshots,
              requesterSafeDiagnostics:
                currentDraft.draftBundle.requesterSafeDiagnostics,
              adminDiagnostics: currentDraft.draftBundle.adminDiagnostics,
              metadata: {
                ...bundle.metadata,
                ...currentDraft.draftBundle.metadata,
                approvalComment: input.approvalComment ?? null,
              },
            },
            toState: "approved",
            event: "preflight.approved",
            actorUserId: ctx.user?.id ?? null,
            reasonCode: "preflight_approved",
          }),
          ctx,
          eventName: "preflight.approved",
          severity: "info",
          primaryReasonCode: "preflight_approved",
          idempotencyKey: input.idempotencyKey,
          payload: {
            selectedSourceCount: normalizedSelectedIds.length,
            visibleReasonCodes:
              currentDraft.draftBundle.requesterSafeDiagnostics
                ?.visibleReasonCodes ?? [],
          },
        }),
        operation: "approve_preflight_bundle",
        idempotencyKey: input.idempotencyKey,
        inputFingerprint: idempotencyFingerprint,
        result: {
          preflightBundleId: bundle.id,
          state: "approved",
        },
      });
      const persisted = await preflightBundleStoreService.putPreflightBundle({
        tenantId,
        caseId: input.caseId,
        bundle: approvedBundle,
        makeCurrent: true,
      });

      return {
        preflightBundleId: persisted.id,
        state: persisted.state,
        approvedAt: persisted.approvedAt ?? null,
        approvedByUserId: persisted.approvedByUserId ?? null,
        preflightRevision: persisted.preflightRevision,
        approvalSnapshots:
          access.view === "admin_diagnostic" && !access.redacted
            ? persisted.approvalSnapshots
            : [],
        launchReadiness: buildLaunchReadiness(persisted),
      };
    }),

  getPreflightBundle: protectedProcedure
    .input(
      z.object({
        caseId: z.string().min(1),
        preflightBundleId: z.string().min(1),
        view: z.enum(["requester_safe", "admin_diagnostic"]).optional(),
      })
    )
    .query(async ({ input, ctx }) => {
      const tenantId = requireTenantId(ctx);
      const projection = await workOsService.getWorkCaseProjection(
        input.caseId,
        tenantId
      );
      const access = resolvePreflightPreviewAccess({
        actorUserId: ctx.user?.id ?? null,
        actorRole: ctx.user?.role ?? null,
        requesterId: projection.request?.requesterId ?? null,
      });
      if (!access.allowed) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "FORBIDDEN_PREVIEW_ACCESS",
        });
      }

      const bundle = await preflightBundleStoreService.getPreflightBundle({
        tenantId,
        caseId: input.caseId,
        preflightBundleId: input.preflightBundleId,
      });
      if (!bundle) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "PREVIEW_NOT_FOUND",
        });
      }

      const effectiveAccess =
        input.view === "admin_diagnostic" &&
        access.view === "admin_diagnostic" &&
        !access.redacted
          ? access
          : {
              ...access,
              view: "requester_safe" as const,
              redacted: true,
            };

      return formatPreflightBundleResponse({
        access: effectiveAccess,
        bundle,
      });
    }),

  invalidatePreflightBundle: protectedProcedure
    .input(
      z.object({
        caseId: z.string().min(1),
        preflightBundleId: z.string().min(1),
        reasonCode: z.string().min(1).max(120),
        currentRevisionHash: z.string().regex(/^[a-f0-9]{64}$/).optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const tenantId = requireTenantId(ctx);
      const projection = await workOsService.getWorkCaseProjection(
        input.caseId,
        tenantId
      );
      const access = resolvePreflightPreviewAccess({
        actorUserId: ctx.user?.id ?? null,
        actorRole: ctx.user?.role ?? null,
        requesterId: projection.request?.requesterId ?? null,
      });
      if (!access.allowed) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "FORBIDDEN_PREVIEW_ACCESS",
        });
      }

      const bundle = await preflightBundleStoreService.getPreflightBundle({
        tenantId,
        caseId: input.caseId,
        preflightBundleId: input.preflightBundleId,
      });
      if (!bundle) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "PREVIEW_NOT_FOUND",
        });
      }
      if (
        bundle.state === "cancelled" ||
        bundle.state === "superseded" ||
        bundle.state === "launched"
      ) {
        throw new TRPCError({
          code: "CONFLICT",
          message: "PREVIEW_ALREADY_TERMINAL",
        });
      }

      const nextState = input.reasonCode.includes("cancel")
        ? "cancelled"
        : "stale";
      const persisted = await preflightBundleStoreService.putPreflightBundle({
        tenantId,
        caseId: input.caseId,
        bundle: transitionPreflightBundle({
          bundle,
          toState: nextState,
          event:
            nextState === "cancelled"
              ? "preflight.cancelled"
              : "request.edited",
          actorUserId: ctx.user?.id ?? null,
          reasonCode: input.reasonCode,
        }),
        makeCurrent: true,
      });

      return {
        preflightBundleId: persisted.id,
        state: persisted.state,
        reasonCode: input.reasonCode,
      };
    }),

  launchApprovedAutomation: protectedProcedure
    .input(
      z.object({
        caseId: z.string().min(1),
        preflightBundleId: z.string().min(1),
        approvedRevisionHash: z.string().regex(/^[a-f0-9]{64}$/),
        mode: automationModeSchema.optional(),
        idempotencyKey: z.string().min(1).max(180),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const { tenantId, projection, bundle } = await loadStoredPreflightBundle({
        caseId: input.caseId,
        preflightBundleId: input.preflightBundleId,
        ctx,
      });
      const isAdmin = isPreflightAdminRole(ctx.user?.role ?? null);

      const idempotencyFingerprint = buildPreflightInputFingerprint({
        preflightBundleId: input.preflightBundleId,
        approvedRevisionHash: input.approvedRevisionHash,
        mode: input.mode ?? null,
      });
      const idempotency = checkIdempotency({
        bundle,
        operation: "launch_approved_automation",
        idempotencyKey: input.idempotencyKey,
        inputFingerprint: idempotencyFingerprint,
      });
      if (idempotency.conflict) {
        throw new TRPCError({
          code: "CONFLICT",
          message: "LAUNCH_IDEMPOTENCY_CONFLICT",
        });
      }
      if (
        idempotency.matched &&
        bundle.state === "launched" &&
        typeof bundle.metadata.automationRunId === "string"
      ) {
        return {
          automationRunId: String(bundle.metadata.automationRunId),
          teamId: String(bundle.metadata.teamId ?? ""),
          roomId: String(bundle.metadata.roomId ?? ""),
          teamRunId: String(bundle.metadata.teamRunId ?? ""),
          workItemId:
            typeof bundle.metadata.workItemId === "string"
              ? String(bundle.metadata.workItemId)
              : null,
          preflightBundleId: bundle.id,
          state: bundle.state,
          launchDiagnostics:
            isAdmin
              ? bundle.adminDiagnostics ?? {}
            : bundle.requesterSafeDiagnostics ?? {},
        };
      }
      if (idempotency.matched) {
        const priorState =
          typeof idempotency.record?.result?.state === "string"
            ? idempotency.record.result.state
            : bundle.state;
        if (priorState === "launch_blocked") {
          throw new TRPCError({
            code: "CONFLICT",
            message:
              typeof idempotency.record?.result?.errorCode === "string"
                ? idempotency.record.result.errorCode
                : "LAUNCH_BLOCKED",
          });
        }
        if (priorState === "launching") {
          throw new TRPCError({
            code: "CONFLICT",
            message: "LAUNCH_IN_PROGRESS",
          });
        }
      }

      const currentBundle =
        await preflightBundleStoreService.getCurrentPreflightBundle({
          tenantId,
          caseId: input.caseId,
        });
      if (!currentBundle || currentBundle.id !== bundle.id) {
        throw new TRPCError({
          code: "CONFLICT",
          message: "PREVIEW_STALE",
        });
      }
      if (bundle.state !== "approved") {
        throw new TRPCError({
          code: "CONFLICT",
          message: "PREVIEW_STALE",
        });
      }
      if (input.approvedRevisionHash !== bundle.preflightRevision.fingerprint) {
        throw new TRPCError({
          code: "CONFLICT",
          message: "PREVIEW_STALE",
        });
      }

      const currentDraft = await buildPreflightBundleDraft({
        caseId: input.caseId,
        ctx,
        projection,
        existingBundle: bundle,
        explicitTeamId:
          bundle.preflightRevision.inputs.explicitTeamId ?? undefined,
        selectedSourceIds: bundle.preflightRevision.inputs.selectedSourceIds,
      });
      const revisionComparison = comparePreflightRevision(
        bundle.preflightRevision,
        currentDraft.draftBundle.preflightRevision
      );
      if (revisionComparison.stale) {
        await preflightBundleStoreService.putPreflightBundle({
          tenantId,
          caseId: input.caseId,
          bundle: transitionPreflightBundle({
            bundle,
            toState: "stale",
            event: "request.edited",
            actorUserId: ctx.user?.id ?? null,
            reasonCode: revisionComparison.reasonCode,
          }),
          makeCurrent: true,
        });
        throw new TRPCError({
          code: "CONFLICT",
          message: "PREVIEW_STALE",
        });
      }

      const sourceDrift = compareApprovalSnapshots(
        bundle.approvalSnapshots,
        currentDraft.draftBundle.brief.sourceRefs,
        currentDraft.sourceResolution.integrityMarkers,
      );
      if (
        currentDraft.flags.approvalSnapshotEnforcement &&
        sourceDrift.hasDrift
      ) {
        await preflightBundleStoreService.putPreflightBundle({
          tenantId,
          caseId: input.caseId,
          bundle: buildLaunchBlockedBundle({
            bundle,
            ctx,
            idempotencyKey: input.idempotencyKey,
            inputFingerprint: idempotencyFingerprint,
            actorUserId: ctx.user?.id ?? null,
            reasonCode: "approval_source_drift",
            errorCode: "APPROVAL_SOURCE_DRIFT",
          }),
          makeCurrent: true,
        });
        throw new TRPCError({
          code: "CONFLICT",
          message: "APPROVAL_SOURCE_DRIFT",
        });
      }

      if (
        currentDraft.draftBundle.teamResolution?.status !== "resolved" ||
        !currentDraft.draftBundle.teamResolution.teamId
      ) {
        const launchErrorCode = mapTeamResolutionToLaunchErrorCode(
          currentDraft.draftBundle.teamResolution ?? null,
        );
        await preflightBundleStoreService.putPreflightBundle({
          tenantId,
          caseId: input.caseId,
          bundle: buildLaunchBlockedBundle({
            bundle,
            ctx,
            idempotencyKey: input.idempotencyKey,
            inputFingerprint: idempotencyFingerprint,
            actorUserId: ctx.user?.id ?? null,
            reasonCode:
              currentDraft.draftBundle.teamResolution?.code ?? "missing_team",
            errorCode: launchErrorCode,
          }),
          makeCurrent: true,
        });
        throw new TRPCError({
          code: "CONFLICT",
          message: launchErrorCode,
        });
      }

      const selectedCatalogBlocks = currentDraft.draftBundle.capabilityCatalog
        .filter(entry => Boolean(entry.metadata?.selectedByPolicy))
        .map(entry => entry.blockedReason)
        .filter((value): value is string => Boolean(value));
      if (selectedCatalogBlocks.length > 0) {
        const launchErrorCode = mapCatalogBlockToLaunchErrorCode(
          selectedCatalogBlocks[0],
        );
        await preflightBundleStoreService.putPreflightBundle({
          tenantId,
          caseId: input.caseId,
          bundle: buildLaunchBlockedBundle({
            bundle,
            ctx,
            idempotencyKey: input.idempotencyKey,
            inputFingerprint: idempotencyFingerprint,
            actorUserId: ctx.user?.id ?? null,
            reasonCode: selectedCatalogBlocks[0],
            errorCode: launchErrorCode,
          }),
          makeCurrent: true,
        });
        throw new TRPCError({
          code: "CONFLICT",
          message: launchErrorCode,
        });
      }

      const launchingTransition =
        await preflightBundleStoreService.transitionPreflightBundleAtomically({
          tenantId,
          caseId: input.caseId,
          preflightBundleId: bundle.id,
          expectedCurrentBundleId: bundle.id,
          expectedState: "approved",
          makeCurrent: true,
          transform: currentBundle =>
            appendBundleTelemetryEvent({
              bundle: transitionPreflightBundle({
                bundle: currentBundle,
                toState: "launching",
                event: "launch.requested",
                actorUserId: ctx.user?.id ?? null,
                reasonCode: "launch_requested",
              }),
              ctx,
              eventName: "launch.requested",
              severity: "info",
              primaryReasonCode: "launch_requested",
              idempotencyKey: input.idempotencyKey,
              payload: {
                approvedRevisionHash: input.approvedRevisionHash,
                requestedMode: input.mode ?? null,
              },
            }),
        });
      if (!launchingTransition.applied || !launchingTransition.bundle) {
        throw new TRPCError({
          code: "CONFLICT",
          message: "PREVIEW_STALE",
        });
      }

      const launchingBundle = launchingTransition.bundle;

      const roomLanguage = roomService.normalizeRoomLanguage(undefined);
      const persistedPolicyJson = {
        ...currentDraft.policyJson,
        workOrchestrator: {
          preflightBundle: launchingBundle,
        },
      };
      let run: Awaited<ReturnType<typeof automationFabricService.createAutomationRun>>;
      try {
        run = await automationFabricService.createAutomationRun({
          tenantId,
          caseId: input.caseId,
          requestId: projection.request?.id ?? null,
          title: launchingBundle.brief.title,
          objective:
            launchingBundle.brief.objective ?? launchingBundle.brief.summary,
          mode: input.mode ?? undefined,
          preserveRequestedMode: true,
          roomLanguage,
          createdByUserId: ctx.user?.id ?? null,
          policyJson: persistedPolicyJson,
        });
      } catch (error) {
        await preflightBundleStoreService.transitionPreflightBundleAtomically({
          tenantId,
          caseId: input.caseId,
          preflightBundleId: bundle.id,
          expectedCurrentBundleId: bundle.id,
          expectedState: "launching",
          makeCurrent: true,
          transform: currentBundle =>
            buildLaunchBlockedBundle({
              bundle: currentBundle,
              ctx,
              idempotencyKey: input.idempotencyKey,
              inputFingerprint: idempotencyFingerprint,
              actorUserId: ctx.user?.id ?? null,
              reasonCode: "automation_run_create_failed",
              errorCode: "AUTOMATION_RUN_CREATE_FAILED",
              eventName: "launch.failed",
              severity: "error",
              payload: {
                errorMessage:
                  error instanceof Error ? error.message : String(error),
              },
            }),
        });
        throw new TRPCError({
          code: "CONFLICT",
          message: "AUTOMATION_RUN_CREATE_FAILED",
        });
      }

      const kickoff = await startAutomationKickoffWorkItem({
        tenantId,
        userId: ctx.user!.id,
        run,
        projection,
        roomLanguage,
        teamResolution: currentDraft.draftBundle.teamResolution ?? undefined,
        approvedBundle: launchingBundle,
        stopPolicy: buildStopPolicyFromBudget(
          launchingBundle.budget ?? {
            maxRounds: 20,
            maxDurationMinutes: 30,
            maxBudgetCredits: 500,
            maxRetries: 1,
            perSurfaceMaxAttempts: {},
            retryDisposition: "single_attempt",
            sideEffectRetryPolicy: "verify_then_retry",
            onExceeded: "pause_for_approval",
          }
        ),
      });

      if (!kickoff.ok) {
        const kickoffErrorCode = mapKickoffFailureToLaunchErrorCode(
          kickoff.reasonCode,
        );
        await automationFabricService.recordAutomationRunStepProgress({
          tenantId,
          caseId: input.caseId,
          runId: run.id,
          stepKey: "team_kickoff",
          stepIndex: 0,
          title: "Team kickoff",
          status: "failed",
          surface: "work_os",
          summary: "Team kickoff failed before the approved automation could start.",
          detailJson: {
            preflightBundleId: launchingBundle.id,
            reasonCode: "team_kickoff_failed",
          },
          runStatus: "failed",
          finalDisposition: "failed",
          finalDispositionReason: "team_kickoff_failed",
          createdByUserId: ctx.user?.id ?? null,
        }).catch(error => {
          logAutomationStartError("kickoff.automation_run_mark_failed", error, {
            tenantId,
            caseId: input.caseId,
            runId: run.id,
          });
        });
        await preflightBundleStoreService.transitionPreflightBundleAtomically({
          tenantId,
          caseId: input.caseId,
          preflightBundleId: bundle.id,
          expectedCurrentBundleId: bundle.id,
          expectedState: "launching",
          makeCurrent: true,
          transform: currentBundle =>
            buildLaunchBlockedBundle({
              bundle: currentBundle,
              ctx,
              idempotencyKey: input.idempotencyKey,
              inputFingerprint: idempotencyFingerprint,
              actorUserId: ctx.user?.id ?? null,
              reasonCode:
                kickoff.reasonCode === "missing_team"
                  ? "missing_team"
                  : "team_kickoff_failed",
              errorCode: kickoffErrorCode,
              automationRunId: run.id,
              payload: {
                requestedMode: input.mode ?? null,
                kickoffFailureReason: kickoff.reasonCode,
              },
            }),
        });
        throw new TRPCError({
          code: "CONFLICT",
          message: kickoffErrorCode,
        });
      }

      const launchedTransition =
        await preflightBundleStoreService.transitionPreflightBundleAtomically({
          tenantId,
          caseId: input.caseId,
          preflightBundleId: bundle.id,
          expectedCurrentBundleId: bundle.id,
          expectedState: "launching",
          makeCurrent: true,
          transform: currentBundle =>
            appendIdempotencyRecord({
              bundle: appendBundleTelemetryEvent({
                bundle: transitionPreflightBundle({
                  bundle: {
                    ...currentBundle,
                    metadata: {
                      ...currentBundle.metadata,
                      automationRunId: run.id,
                      teamId: kickoff.teamId,
                      roomId: kickoff.roomId,
                      teamRunId: kickoff.teamRunId,
                      workItemId: kickoff.workItemId,
                    },
                  },
                  toState: "launched",
                  event: "launch.created",
                  actorUserId: ctx.user?.id ?? null,
                  reasonCode: "launch_created",
                }),
                ctx,
                eventName: "launch.created",
                severity: "info",
                primaryReasonCode: "launch_created",
                idempotencyKey: input.idempotencyKey,
                automationRunId: run.id,
                teamId: kickoff.teamId,
                roomId: kickoff.roomId,
                teamRunId: kickoff.teamRunId,
                workItemId: kickoff.workItemId,
                payload: {
                  requestedMode: input.mode ?? null,
                  teamId: kickoff.teamId,
                },
              }),
              operation: "launch_approved_automation",
              idempotencyKey: input.idempotencyKey,
              inputFingerprint: idempotencyFingerprint,
              result: {
                automationRunId: run.id,
                teamId: kickoff.teamId,
                roomId: kickoff.roomId,
                teamRunId: kickoff.teamRunId,
                workItemId: kickoff.workItemId,
                state: "launched",
              },
            }),
        });
      if (!launchedTransition.applied || !launchedTransition.bundle) {
        throw new TRPCError({
          code: "CONFLICT",
          message: "PREVIEW_STALE",
        });
      }
      const persisted = launchedTransition.bundle;

      return {
        automationRunId: run.id,
        teamId: kickoff.teamId,
        roomId: kickoff.roomId,
        teamRunId: kickoff.teamRunId,
        workItemId: kickoff.workItemId,
        preflightBundleId: persisted.id,
        state: persisted.state,
        launchDiagnostics: isAdmin
          ? persisted.adminDiagnostics ?? {}
          : persisted.requesterSafeDiagnostics ?? {},
      };
    }),

  resolveAutomationPlan: domainAdminProcedure
    .input(
      z.object({
        caseId: z.string().min(1),
        templateKey: z.string().min(1).max(120).optional(),
        templateVersion: z.string().max(50).optional(),
        title: z.string().max(500).optional(),
        objective: z.string().max(10000).optional(),
        mode: automationModeSchema.optional(),
      })
    )
    .query(async ({ input, ctx }) => {
      const tenantId = requireTenantId(ctx);
      const projection = await workOsService.getWorkCaseProjection(
        input.caseId,
        tenantId
      );
      const policy = resolveAutomationLaunchPolicy({
        caseRecord: projection.case,
        requestRecord: projection.request,
        templateKey: input.templateKey ?? null,
        templateVersion: input.templateVersion ?? null,
        mode: input.mode ?? null,
      });
      return {
        ...policy,
        policyJson: buildAutomationPolicySnapshot(policy),
        caseId: input.caseId,
        title: input.title?.trim() || projection.case.title,
        objective:
          input.objective?.trim() ||
          projection.case.summary ||
          projection.request?.objective ||
          null,
      };
    }),

  resolveAutomationStepRoute: domainAdminProcedure
    .input(
      z.object({
        caseId: z.string().min(1),
        stepKey: z.string().min(1).max(120),
        requestedSurface: automationSurfaceSchema.optional().nullable(),
        templateKey: z.string().min(1).max(120).optional(),
        templateVersion: z.string().max(50).optional(),
        mode: automationModeSchema.optional(),
      })
    )
    .query(async ({ input, ctx }) => {
      const tenantId = requireTenantId(ctx);
      const projection = await workOsService.getWorkCaseProjection(
        input.caseId,
        tenantId
      );
      const policy = resolveAutomationLaunchPolicy({
        caseRecord: projection.case,
        requestRecord: projection.request,
        templateKey: input.templateKey ?? null,
        templateVersion: input.templateVersion ?? null,
        mode: input.mode ?? null,
      });
      const route = resolveAutomationStepRoute({
        stepKey: input.stepKey,
        requestedSurface: input.requestedSurface ?? null,
        policy,
      });
      return {
        ...route,
        policyJson: buildAutomationPolicySnapshot(policy),
        caseId: input.caseId,
      };
    }),

  executeAutomationStep: domainAdminProcedure
    .input(
      z.object({
        caseId: z.string().min(1),
        runId: z.string().min(1),
        stepKey: z.string().min(1).max(120),
        stepIndex: z.number().int().min(0),
        title: z.string().min(1).max(500),
        objective: z.string().max(10000).optional(),
        prompt: z.string().max(20000).optional(),
        requestedSurface: automationSurfaceSchema.optional().nullable(),
        approvalState: automationCheckpointApprovalStateSchema
          .optional()
          .nullable(),
        idempotencyKey: z.string().max(180).optional(),
        inputRefsJson: z.array(z.string().min(1)).optional(),
        skillId: z.string().max(120).optional(),
        agencyId: z.string().max(120).optional(),
        agencyConversationId: z.string().max(120).optional(),
        agencyRecipientAgent: z.string().max(120).optional(),
        agencyAdditionalInstructions: z.string().max(5000).optional(),
        libraryItemType: z.string().max(100).optional(),
        librarySource: z.string().max(100).optional(),
        libraryTitle: z.string().max(500).optional(),
        mediaModel: z.string().max(120).optional(),
        videoModel: z.string().max(120).optional(),
        aspectRatio: z.string().max(30).optional(),
        size: z.string().max(30).optional(),
        duration: z.number().int().positive().optional(),
        referenceImageUrls: z.array(z.string().min(1)).optional(),
        referenceVideoUrls: z.array(z.string().min(1)).optional(),
        createdByUserId: z.number().int().optional(),
        createdByAssistantId: z.string().min(1).optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const tenantId = requireTenantId(ctx);
      return executeAutomationStep({
        tenantId,
        ...input,
        userToken: ctx.userToken ?? "",
        actorUserId: input.createdByUserId ?? ctx.user.id,
        actorAssistantId: input.createdByAssistantId ?? null,
      });
    }),

  recordAutomationStep: domainAdminProcedure
    .input(
      z.object({
        caseId: z.string().min(1),
        runId: z.string().min(1),
        stepKey: z.string().min(1).max(120),
        stepIndex: z.number().int().min(0),
        title: z.string().min(1).max(500),
        status: automationStepStatusSchema,
        riskTier: z.enum(["low", "medium", "high", "critical"]).optional(),
        surface: automationSurfaceSchema.optional(),
        inputRefsJson: z.array(z.string().min(1)).optional(),
        outputRefsJson: z.array(z.string().min(1)).optional(),
        retryCount: z.number().int().min(0).optional(),
        idempotencyKey: z.string().max(180).optional(),
        summary: z.string().max(5000).optional(),
        detailJson: z.record(z.string(), z.unknown()).optional(),
        checkpointId: z.string().min(1).optional(),
        startedAt: z.coerce.date().optional(),
        completedAt: z.coerce.date().optional(),
        runStatus: automationRunStatusSchema.optional(),
        finalDisposition: z.string().max(120).optional(),
        finalDispositionReason: z.string().max(5000).optional(),
        createdByUserId: z.number().int().optional(),
        createdByAssistantId: z.string().min(1).optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const tenantId = requireTenantId(ctx);
      return automationFabricService.recordAutomationRunStepProgress({
        tenantId,
        ...input,
      });
    }),

  recordAutomationCheckpoint: domainAdminProcedure
    .input(
      z.object({
        caseId: z.string().min(1),
        runId: z.string().min(1),
        stepId: z.string().min(1).optional(),
        stepKey: z.string().min(1).optional(),
        checkpointKey: z.string().min(1).max(120),
        resumeCursor: z.string().min(1),
        approvalState: automationCheckpointApprovalStateSchema.optional(),
        checkpointStatus: automationCheckpointStatusSchema.optional(),
        editSnapshotRefsJson: z.array(z.string().min(1)).optional(),
        snapshotJson: z.record(z.string(), z.unknown()).optional(),
        detailJson: z.record(z.string(), z.unknown()).optional(),
        requestedByUserId: z.number().int().optional(),
        approvedByUserId: z.number().int().optional(),
        actorAssistantId: z.string().min(1).optional(),
        requestedAt: z.coerce.date().optional(),
        approvedAt: z.coerce.date().optional(),
        resumedAt: z.coerce.date().optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const tenantId = requireTenantId(ctx);
      return automationFabricService.recordAutomationCheckpoint({
        tenantId,
        ...input,
      });
    }),

  resumeAutomationCheckpoint: domainAdminProcedure
    .input(
      z.object({
        caseId: z.string().min(1),
        runId: z.string().min(1),
        checkpointId: z.string().min(1),
        requestedByUserId: z.number().int().optional(),
        actorAssistantId: z.string().min(1).optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const tenantId = requireTenantId(ctx);
      return automationFabricService.resumeAutomationRunFromCheckpoint({
        tenantId,
        ...input,
      });
    }),

  recordAutomationModeChange: domainAdminProcedure
    .input(
      z.object({
        caseId: z.string().min(1),
        runId: z.string().min(1),
        fromMode: automationModeSchema.optional().nullable(),
        toMode: automationModeSchema,
        reason: z.string().max(5000).optional(),
        detailJson: z.record(z.string(), z.unknown()).optional(),
        actorUserId: z.number().int().optional(),
        actorAssistantId: z.string().min(1).optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const tenantId = requireTenantId(ctx);
      return automationFabricService.recordAutomationModeChange({
        tenantId,
        ...input,
      });
    }),

  reconcileBrowserAutomationTasks: domainAdminProcedure
    .input(
      z
        .object({ limit: z.number().int().min(1).max(100).optional() })
        .optional()
    )
    .mutation(async ({ input, ctx }) => {
      const tenantId = requireTenantId(ctx);
      return reconcileBrowserAutomationTaskClaims(tenantId, {
        limit: input?.limit ?? 20,
      });
    }),

  getBrowserAutomationHealth: domainAdminProcedure.query(async ({ ctx }) => {
    const tenantId = requireTenantId(ctx);
    return getBrowserAutomationHealth(tenantId);
  }),

  getAutomationRun: domainAdminProcedure
    .input(z.object({ runId: z.string().min(1) }))
    .query(async ({ input, ctx }) => {
      const tenantId = requireTenantId(ctx);
      return automationFabricService.getAutomationRunProjection(
        input.runId,
        tenantId
      );
    }),

  getAutoTeamDebugSnapshot: domainAdminProcedure
    .input(
      z.object({
        roomId: z.string().min(1).optional(),
        runId: z.string().min(1).optional(),
        workRequestId: z.string().min(1).optional(),
        workCaseId: z.string().min(1).optional(),
        limitMessages: z.number().int().min(1).max(50).optional(),
      }),
    )
    .query(async ({ input, ctx }) => {
      const tenantId = requireTenantId(ctx);
      return getAutoTeamDebugSnapshot({
        tenantId,
        caller: {
          tenantId,
          userId: ctx.user?.id ?? null,
          isTenantAdmin: ctx.user?.role === "admin",
          isDebugUser: ctx.user?.role === "admin" || ctx.user?.role === "domain_admin",
        },
        roomId: input.roomId ?? null,
        runId: input.runId ?? null,
        workRequestId: input.workRequestId ?? null,
        workCaseId: input.workCaseId ?? null,
        limitMessages: input.limitMessages,
      });
    }),

  overview: domainAdminProcedure.query(async ({ ctx }) => {
    const tenantId = requireTenantId(ctx);
    return workOsService.getOverview(tenantId);
  }),
});
