import fs from "node:fs/promises";
import path from "node:path";

import { sql } from "drizzle-orm";

import {
  type BrowserApprovalPayload,
  type BrowserPolicyAuditMetadata,
  type BrowserPolicyApprovalState,
  type BrowserPolicyDecisionEnvelope,
  type BrowserPolicyExecutionContext,
  type BrowserPolicyIncidentStatus,
  type BrowserPolicyOutcome,
  normalizeBrowserPolicyExecutionContext,
  normalizeBrowserPolicyUserCustomization,
  normalizeBrowserPolicyUserProfile,
  normalizeBrowserWorkflowEntitlement,
} from "../../shared/browserPolicy";
import { getDb } from "../db";
import {
  buildBrowserApprovalPayload,
  getBrowserApprovalCorrelationKey,
} from "./browserApprovalPayload";
import {
  buildBrowserPolicyAuditArtifacts,
  type BrowserPolicyAuditDbRecord,
  type BrowserPolicyAuditEvent,
} from "./browserPolicyAuditLogger";
import { evaluateBrowserIncidentControls } from "./browserIncidentControls";
import { evaluateBrowserPolicy, type BrowserPolicyEvaluationInput } from "./browserPolicyEngine";
import {
  buildSeededBrowserPolicyConfig,
  loadTenantBrowserPolicyConfig,
} from "./browserPolicyStore";
import {
  applyUserBrowserPolicyProfileToConfig,
  getUserBlockedTransferReason,
  requiresUserEscalatedApproval,
  resolveBrowserPolicyAllowedVisionModels,
  resolveBrowserPolicyUserCustomization,
  resolveEffectiveUserAutomationPolicy,
} from "./browserPolicyUserSettings";
import { getRedisClient } from "./redis";

const DEFAULT_AUTOMATION_COPILOT_CAPABILITIES = [
  "navigate",
  "click",
  "fill",
  "select",
  "hover",
  "extract_data",
];
const DEFAULT_BROWSER_POLICY_AUDIT_PATH = (
  process.env.BROWSER_POLICY_AUDIT_JSONL_PATH
  || "logs/browser_policy_decisions.jsonl"
).trim();
const BROWSER_POLICY_AUDIT_HASH_TTL_SECONDS = 30 * 24 * 60 * 60;
const BROWSER_POLICY_AUDIT_HASH_PREFIX = "browser-policy:audit:last-hash";

function matchesAllowedDomain(targetOrigin: string, allowedDomains: string[]): boolean {
  if (allowedDomains.length === 0) {
    return false;
  }

  let hostname: string;
  try {
    hostname = new URL(targetOrigin).hostname.toLowerCase();
  } catch {
    return false;
  }

  return allowedDomains.some((domain) => {
    const normalized = domain.toLowerCase().trim();
    if (normalized.startsWith("*.")) {
      return hostname === normalized.slice(2) || hostname.endsWith(normalized.slice(1));
    }
    return hostname === normalized || hostname.endsWith(`.${normalized}`);
  });
}

function mergeAllowedDomains(...domainLists: string[][]): string[] {
  return Array.from(
    new Set(
      domainLists
        .flat()
        .map((domain) => domain.trim())
        .filter(Boolean),
    ),
  );
}

export async function buildAutomationCopilotBrowserPolicyContext(input: {
  tenantId: string;
  userId?: number;
  executionId: string;
  allowedDomains: string[];
  visionModel?: string;
}): Promise<BrowserPolicyExecutionContext> {
  const tenantPolicy = await loadTenantBrowserPolicyConfig({
    tenantId: input.tenantId,
    seededConfig: {
      allowedDomains: input.allowedDomains,
      ...(input.visionModel ? { visionModel: input.visionModel } : {}),
    },
  });

  const inheritedConfig = tenantPolicy.config
    ? {
        ...tenantPolicy.config,
        allowedDomains: mergeAllowedDomains(
          tenantPolicy.config.allowedDomains,
          input.allowedDomains,
        ),
      }
    : buildSeededBrowserPolicyConfig({
        allowedDomains: input.allowedDomains,
        ...(input.visionModel ? { visionModel: input.visionModel } : {}),
      });
  const userCustomization = resolveBrowserPolicyUserCustomization(tenantPolicy.metadata);
  const allowedVisionModels = resolveBrowserPolicyAllowedVisionModels(
    inheritedConfig,
    tenantPolicy.metadata,
  );
  const userProfile = input.userId
    ? (await resolveEffectiveUserAutomationPolicy({
        tenantId: input.tenantId,
        userId: input.userId,
        seededConfig: inheritedConfig,
      })).profile
    : normalizeBrowserPolicyUserProfile({});
  const config = applyUserBrowserPolicyProfileToConfig({
    config: inheritedConfig,
    profile: userProfile,
    customization: userCustomization,
    allowedVisionModels,
  });

  return normalizeBrowserPolicyExecutionContext({
    config,
    rules: tenantPolicy.rules,
    entitlement: normalizeBrowserWorkflowEntitlement({
      tenantId: input.tenantId,
      workflowId: 0,
      workflowName: `Automation Copilot ${input.executionId}`,
      allowedCapabilities: DEFAULT_AUTOMATION_COPILOT_CAPABILITIES,
      config: {
        approvalTtlSeconds: config.defaultApprovalTtlSeconds,
      },
    }),
    userCustomization,
    userProfile,
  });
}

export interface BrowserPolicyRuntimeInput
  extends BrowserPolicyEvaluationInput {
  actionDescription: string;
  normalizedAction: Record<string, unknown>;
  payloadPreview: Record<string, unknown>;
  policyContext: BrowserPolicyExecutionContext;
  approvalRevoked?: boolean;
  emergencyDeniedDomains?: string[];
}

export interface BrowserPolicyRuntimeResult {
  decision: BrowserPolicyDecisionEnvelope;
  approvalPayload?: BrowserApprovalPayload;
  correlationKey?: string;
  audit?: BrowserPolicyAuditMetadata;
  incident?: BrowserPolicyIncidentStatus;
}

export interface BrowserPolicyRuntimePersistenceDeps {
  loadPreviousEventHash?: (scopeKey: string) => Promise<string | null>;
  storeLatestEventHash?: (scopeKey: string, eventHash: string) => Promise<void>;
  persistJsonlEvent?: (event: BrowserPolicyAuditEvent) => Promise<void>;
  persistDbRecord?: (record: BrowserPolicyAuditDbRecord) => Promise<void>;
}

export interface BrowserPolicyOutcomePersistenceInput {
  decision: BrowserPolicyDecisionEnvelope;
  approvalState: BrowserPolicyApprovalState;
  outcome: BrowserPolicyOutcome;
  previousEventHash?: string | null;
  requireTamperEvidence?: boolean;
}

export function evaluateBrowserPolicyRuntime(
  input: BrowserPolicyRuntimeInput,
): BrowserPolicyRuntimeResult {
  const policyContext = normalizeBrowserPolicyExecutionContext(input.policyContext);
  const userProfile = normalizeBrowserPolicyUserProfile(policyContext.userProfile ?? {});
  const userCustomization = normalizeBrowserPolicyUserCustomization(
    policyContext.userCustomization ?? {},
  );
  let decision = evaluateBrowserPolicy(input, {
    entitlement: policyContext.entitlement,
  });

  const targetOrigin = input.targetOrigin ?? input.currentOrigin ?? "";
  if (targetOrigin && !matchesAllowedDomain(targetOrigin, policyContext.config.allowedDomains)) {
    decision = {
      ...decision,
      decision: "deny",
      reasonCodes: Array.from(new Set([...decision.reasonCodes, "domain_not_allowed"])),
    };
  }

  const reasonCodes = new Set(decision.reasonCodes);
  const incidentControl = evaluateBrowserIncidentControls({
    targetOrigin,
    pageSensitivity: decision.pageSensitivity,
    workflowEnabled: policyContext.entitlement.enabled,
    tenantKillSwitchEnabled: policyContext.config.killSwitchEnabled,
    approvalRevoked: input.approvalRevoked,
    emergencyDeniedDomains: input.emergencyDeniedDomains,
  });

  if (!incidentControl.allowed) {
    reasonCodes.add(incidentControl.reasonCode);
    decision = {
      ...decision,
      decision: "deny",
      reasonCodes: Array.from(reasonCodes),
    };
  }

  const userTransferReason = userProfile.enabled && userCustomization.allowTransferBlocks
    ? getUserBlockedTransferReason(input.actionType, userProfile.blockedTransfers)
    : null;
  if (userTransferReason) {
    decision = {
      ...decision,
      decision: "deny",
      reasonCodes: Array.from(new Set([...decision.reasonCodes, userTransferReason])),
    };
  }

  if (
    userProfile.enabled
    && userCustomization.allowActionApprovalEscalation
    && decision.decision === "allow"
    && requiresUserEscalatedApproval(
      decision.actionClass,
      userProfile.requireApprovalForActionClasses,
    )
  ) {
    decision = {
      ...decision,
      decision: "require_approval",
      reasonCodes: Array.from(
        new Set([...decision.reasonCodes, `user_requires_${decision.actionClass}_approval`]),
      ),
      approval: {
        required: true,
        approvalTtlSeconds: policyContext.config.defaultApprovalTtlSeconds,
      },
    };
  }

  if (decision.decision !== "require_approval") {
    return { decision };
  }

  const approvalPayload = buildBrowserApprovalPayload({
    actionDescription: input.actionDescription,
    executionId: input.executionId ?? "",
    targetOrigin,
    reasonCodes: decision.reasonCodes,
    normalizedAction: input.normalizedAction,
    payloadPreview: input.payloadPreview,
    domFingerprint: input.evidence.domFingerprint ?? input.evidence.actionDigest,
    screenshotHash: input.evidence.screenshotHash,
    approvalTtlSeconds:
      decision.approval?.approvalTtlSeconds
      ?? policyContext.entitlement.config.approvalTtlSeconds,
  });

  return {
    decision,
    approvalPayload,
    correlationKey: getBrowserApprovalCorrelationKey(approvalPayload),
  };
}

export async function evaluateAndPersistBrowserPolicyRuntime(
  input: BrowserPolicyRuntimeInput,
  deps: BrowserPolicyRuntimePersistenceDeps = {},
): Promise<BrowserPolicyRuntimeResult> {
  const result = evaluateBrowserPolicyRuntime(input);
  const approvalState = resolveBrowserPolicyApprovalState(result.decision);
  const outcome = resolveBrowserPolicyOutcome(result.decision);
  const persistedAudit = await persistBrowserPolicyAuditArtifacts({
    decision: result.decision,
    approvalState,
    outcome,
    requireTamperEvidence: input.policyContext.config.requireTamperEvidence,
  }, deps);

  if (persistedAudit.mustBlock) {
    const auditFailureDecision = buildAuditFailureDecision(result.decision);
    const auditFailureApprovalState = resolveBrowserPolicyApprovalState(auditFailureDecision);
    return {
      decision: auditFailureDecision,
      audit: persistedAudit.audit,
      incident: {
        approvalState: auditFailureApprovalState,
        outcome: "failed",
        operatorMessage: buildBrowserPolicyOperatorMessage(
          auditFailureDecision,
          auditFailureApprovalState,
          "failed",
        ),
      },
    };
  }

  return {
    ...result,
    audit: persistedAudit.audit,
    incident: {
      approvalState,
      outcome,
      operatorMessage: buildBrowserPolicyOperatorMessage(result.decision, approvalState, outcome),
    },
  };
}

export async function persistBrowserPolicyOutcomeRuntime(
  input: BrowserPolicyOutcomePersistenceInput,
  deps: BrowserPolicyRuntimePersistenceDeps = {},
): Promise<Pick<BrowserPolicyRuntimeResult, "audit" | "incident">> {
  const persistedAudit = await persistBrowserPolicyAuditArtifacts({
    decision: input.decision,
    approvalState: input.approvalState,
    outcome: input.outcome,
    previousEventHash: input.previousEventHash,
    requireTamperEvidence: input.requireTamperEvidence ?? true,
  }, deps);

  if (persistedAudit.mustBlock) {
    throw new Error("Browser policy outcome audit persistence failed");
  }

  return {
    audit: persistedAudit.audit,
    incident: {
      approvalState: input.approvalState,
      outcome: input.outcome,
      operatorMessage: buildBrowserPolicyOperatorMessage(
        input.decision,
        input.approvalState,
        input.outcome,
      ),
    },
  };
}

async function persistBrowserPolicyAuditArtifacts(
  input: {
    decision: BrowserPolicyDecisionEnvelope;
    approvalState: BrowserPolicyApprovalState;
    outcome: BrowserPolicyOutcome;
    previousEventHash?: string | null;
    requireTamperEvidence: boolean;
  },
  deps: BrowserPolicyRuntimePersistenceDeps,
): Promise<{
  audit: BrowserPolicyAuditMetadata;
  mustBlock: boolean;
}> {
  const scopeKey = buildBrowserPolicyAuditScopeKey(input.decision);
  const loadPreviousEventHash = deps.loadPreviousEventHash ?? defaultLoadPreviousEventHash;
  const storeLatestEventHash = deps.storeLatestEventHash ?? defaultStoreLatestEventHash;
  const persistJsonlEvent = deps.persistJsonlEvent ?? defaultPersistJsonlEvent;
  const persistDbRecord = deps.persistDbRecord ?? defaultPersistDbRecord;
  const previousEventHash = input.previousEventHash !== undefined
    ? input.previousEventHash
    : await loadPreviousEventHash(scopeKey).catch(() => null);
  const artifacts = buildBrowserPolicyAuditArtifacts({
    decision: input.decision,
    approvalState: input.approvalState,
    outcome: input.outcome,
    previousEventHash,
  });

  let jsonlPersisted = false;
  let dbPersisted = false;

  try {
    await persistJsonlEvent(artifacts.jsonlEvent);
    jsonlPersisted = true;
  } catch {
    jsonlPersisted = false;
  }

  try {
    await persistDbRecord(artifacts.dbRecord);
    dbPersisted = true;
  } catch {
    dbPersisted = false;
  }

  if (jsonlPersisted || dbPersisted) {
    await storeLatestEventHash(scopeKey, artifacts.jsonlEvent.integrity.eventHash).catch(() => undefined);
  }

  return {
    audit: {
      traceId: input.decision.traceId,
      eventHash: artifacts.jsonlEvent.integrity.eventHash,
      previousEventHash,
      jsonlPersisted,
      dbPersisted,
      auditWriteFailed: !jsonlPersisted || !dbPersisted,
    },
    mustBlock: input.requireTamperEvidence && (!jsonlPersisted || !dbPersisted),
  };
}

function buildBrowserPolicyAuditScopeKey(
  decision: BrowserPolicyDecisionEnvelope,
): string {
  return [
    decision.tenantId,
    decision.executionId ?? "no-execution",
    decision.traceId ?? "no-trace",
  ].join(":");
}

function resolveBrowserPolicyApprovalState(
  decision: BrowserPolicyDecisionEnvelope,
): BrowserPolicyApprovalState {
  if (decision.decision === "require_approval") {
    return "pending";
  }
  if (decision.reasonCodes.includes("approval_context_changed")) {
    return "context_changed";
  }
  if (decision.reasonCodes.includes("approval_revoked")) {
    return "revoked";
  }
  if (decision.reasonCodes.includes("approval_expired")) {
    return "expired";
  }
  if (decision.reasonCodes.includes("approval_rejected")) {
    return "rejected";
  }
  return "not_required";
}

function resolveBrowserPolicyOutcome(
  decision: BrowserPolicyDecisionEnvelope,
): BrowserPolicyOutcome {
  return decision.decision === "allow" || decision.decision === "allow_with_redaction"
    ? "executed"
    : "blocked";
}

function buildBrowserPolicyOperatorMessage(
  decision: BrowserPolicyDecisionEnvelope,
  approvalState: BrowserPolicyApprovalState,
  outcome: BrowserPolicyOutcome,
): string {
  const reasonCodes = decision.reasonCodes.join(", ") || "none";
  return `browser_policy outcome=${outcome} approval_state=${approvalState} trace_id=${decision.traceId ?? "n/a"} reasons=${reasonCodes}`;
}

function buildAuditFailureDecision(
  decision: BrowserPolicyDecisionEnvelope,
): BrowserPolicyDecisionEnvelope {
  return {
    ...decision,
    decision: "deny",
    reasonCodes: Array.from(new Set([...decision.reasonCodes, "audit_persistence_failed"])),
    approval: {
      required: false,
    },
  };
}

async function defaultLoadPreviousEventHash(scopeKey: string): Promise<string | null> {
  try {
    const redis = getRedisClient();
    return await redis.get(`${BROWSER_POLICY_AUDIT_HASH_PREFIX}:${scopeKey}`);
  } catch {
    return null;
  }
}

async function defaultStoreLatestEventHash(
  scopeKey: string,
  eventHash: string,
): Promise<void> {
  const redis = getRedisClient();
  await redis.set(
    `${BROWSER_POLICY_AUDIT_HASH_PREFIX}:${scopeKey}`,
    eventHash,
    "EX",
    BROWSER_POLICY_AUDIT_HASH_TTL_SECONDS,
  );
}

async function defaultPersistJsonlEvent(event: BrowserPolicyAuditEvent): Promise<void> {
  const auditPath = path.isAbsolute(DEFAULT_BROWSER_POLICY_AUDIT_PATH)
    ? DEFAULT_BROWSER_POLICY_AUDIT_PATH
    : path.join(process.cwd(), DEFAULT_BROWSER_POLICY_AUDIT_PATH);
  await fs.mkdir(path.dirname(auditPath), { recursive: true });
  await fs.appendFile(auditPath, `${JSON.stringify(event)}\n`, "utf8");
}

async function defaultPersistDbRecord(record: BrowserPolicyAuditDbRecord): Promise<void> {
  const db = await getDb();
  if (!db) {
    throw new Error("Database unavailable");
  }

  await db.execute(sql`
    INSERT INTO browser_policy_decisions (
      "traceId",
      "tenantId",
      "userId",
      "workflowId",
      "executionId",
      "actionType",
      "actionClass",
      "pageSensitivity",
      "decision",
      "reasonCodes",
      "approvalState",
      "outcome",
      "evidence",
      "previousEventHash",
      "eventHash",
      "createdAt"
    ) VALUES (
      ${record.traceId ?? null},
      ${record.tenantId},
      ${record.userId ?? null},
      ${record.workflowId ?? null},
      ${record.executionId ?? null},
      ${record.actionType},
      ${record.actionClass},
      ${record.pageSensitivity},
      ${record.decision},
      ${JSON.stringify(record.reasonCodes)}::jsonb,
      ${record.approvalState},
      ${record.outcome},
      ${JSON.stringify(record.evidence)}::jsonb,
      ${record.integrity.previousEventHash ?? null},
      ${record.integrity.eventHash},
      ${record.createdAt}
    )
  `);
}
