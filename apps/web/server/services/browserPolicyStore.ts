import { and, asc, eq } from "drizzle-orm";

import {
  browserWorkflowEntitlements,
  tenantBrowserPolicyConfig,
  tenantBrowserPolicyRules,
} from "../../drizzle/schema";
import {
  type BrowserPolicyConfig,
  type BrowserPolicyRule,
  type BrowserWorkflowEntitlement,
  BROWSER_APPROVAL_TTL_DEFAULT_SECONDS,
  normalizeBrowserPolicyConfig,
  normalizeBrowserWorkflowEntitlement,
  validateBrowserApprovalTtlSeconds,
} from "../../shared/browserPolicy";
import { getDb } from "../db";

export type BrowserPolicyLookupFailureReason =
  | "policy_config_missing"
  | "workflow_entitlement_missing"
  | "workflow_entitlement_disabled"
  | "workflow_entitlement_expired"
  | "required_capability_missing";

export interface BrowserPolicyLookupSuccess {
  ok: true;
  config: BrowserPolicyConfig;
  rules: BrowserPolicyRule[];
  entitlement: BrowserWorkflowEntitlement;
}

export interface BrowserPolicyLookupFailure {
  ok: false;
  reason: BrowserPolicyLookupFailureReason;
}

export type BrowserPolicyLookupResult =
  | BrowserPolicyLookupSuccess
  | BrowserPolicyLookupFailure;

export interface BrowserPolicyLookupOptions {
  tenantId: string;
  workflowId: number;
  requiredCapabilities?: string[];
  now?: Date;
  seededConfig?: Partial<BrowserPolicyConfig> | null;
}

export interface TenantBrowserPolicyConfigResult {
  config: BrowserPolicyConfig | null;
  rules: BrowserPolicyRule[];
  source: "db" | "seeded";
}

export function buildSeededBrowserPolicyConfig(
  overrides: Partial<BrowserPolicyConfig> = {},
): BrowserPolicyConfig {
  return normalizeBrowserPolicyConfig({
    seededDefault: true,
    defaultApprovalTtlSeconds: BROWSER_APPROVAL_TTL_DEFAULT_SECONDS,
    ...overrides,
  });
}

export function resolveBrowserPolicyState(
  input: {
    config: Partial<BrowserPolicyConfig> | null;
    rules?: BrowserPolicyRule[] | null;
    entitlement: Partial<BrowserWorkflowEntitlement> | null;
  } & Omit<BrowserPolicyLookupOptions, "tenantId" | "workflowId">,
): BrowserPolicyLookupResult {
  const now = input.now ?? new Date();
  const config = input.config
    ? normalizeBrowserPolicyConfig(input.config)
    : input.seededConfig
      ? buildSeededBrowserPolicyConfig(input.seededConfig)
      : null;

  if (!config || !config.enabled || config.killSwitchEnabled) {
    return { ok: false, reason: "policy_config_missing" };
  }

  if (!input.entitlement) {
    return { ok: false, reason: "workflow_entitlement_missing" };
  }

  const entitlement = normalizeBrowserWorkflowEntitlement(input.entitlement);
  const entitlementExpiresAt = entitlement.expiresAt ?? null;

  if (!entitlement.enabled) {
    return { ok: false, reason: "workflow_entitlement_disabled" };
  }

  if (entitlementExpiresAt && entitlementExpiresAt.getTime() <= now.getTime()) {
    return { ok: false, reason: "workflow_entitlement_expired" };
  }

  const requiredCapabilities = input.requiredCapabilities ?? [];
  if (requiredCapabilities.some((capability) => !entitlement.allowedCapabilities.includes(capability))) {
    return { ok: false, reason: "required_capability_missing" };
  }

  const rules = (input.rules ?? []).map((rule) => ({
    ...rule,
    priority: rule.priority ?? 100,
  }));

  return {
    ok: true,
    config,
    rules,
    entitlement: {
      ...entitlement,
      config: {
        ...entitlement.config,
        approvalTtlSeconds: validateBrowserApprovalTtlSeconds(
          entitlement.config.approvalTtlSeconds,
        ),
      },
    },
  };
}

export async function loadTenantBrowserPolicyConfig(options: {
  tenantId: string;
  seededConfig?: Partial<BrowserPolicyConfig> | null;
}): Promise<TenantBrowserPolicyConfigResult> {
  const db = await getDb();
  if (!db) {
    return {
      config:
        options.seededConfig == null
          ? null
          : buildSeededBrowserPolicyConfig(options.seededConfig),
      rules: [],
      source: "seeded",
    };
  }

  const [configRow, ruleRows] = await Promise.all([
    db
      .select()
      .from(tenantBrowserPolicyConfig)
      .where(eq(tenantBrowserPolicyConfig.tenantId, options.tenantId))
      .limit(1),
    db
      .select()
      .from(tenantBrowserPolicyRules)
      .where(eq(tenantBrowserPolicyRules.tenantId, options.tenantId))
      .orderBy(asc(tenantBrowserPolicyRules.priority)),
  ]);

  const config = configRow[0]
    ? normalizeBrowserPolicyConfig({
        enabled: configRow[0].enabled,
        enforcementMode: configRow[0].enforcementMode as BrowserPolicyConfig["enforcementMode"],
        defaultApprovalTtlSeconds: configRow[0].defaultApprovalTtlSeconds,
        reviewCadenceDays: configRow[0].reviewCadenceDays,
        killSwitchEnabled: configRow[0].killSwitchEnabled,
        requireTamperEvidence: configRow[0].requireTamperEvidence,
        evidenceRetentionDays: configRow[0].evidenceRetentionDays,
        allowedDomains: configRow[0].allowedDomains ?? [],
        visionModel: configRow[0].visionModel,
        seededDefault: configRow[0].seededDefault,
      })
    : options.seededConfig == null
      ? null
      : buildSeededBrowserPolicyConfig(options.seededConfig);

  const rules = ruleRows.map((row) => ({
    id: row.id,
    priority: row.priority,
    enabled: row.enabled,
    description: row.description ?? undefined,
    match: row.match ?? {},
    decision: row.decision,
    reasonCode: row.reasonCode,
    actionClass: row.actionClass ?? undefined,
  })) satisfies BrowserPolicyRule[];

  return {
    config,
    rules,
    source: configRow[0] ? "db" : "seeded",
  };
}

export async function lookupBrowserPolicyState(
  options: BrowserPolicyLookupOptions,
): Promise<BrowserPolicyLookupResult> {
  const db = await getDb();
  if (!db) {
    return resolveBrowserPolicyState({
      seededConfig: options.seededConfig ?? null,
      rules: [],
      entitlement: null,
      now: options.now,
      requiredCapabilities: options.requiredCapabilities,
      config: null,
    });
  }

  const [{ config, rules }, entitlementRow] = await Promise.all([
    loadTenantBrowserPolicyConfig({
      tenantId: options.tenantId,
      seededConfig: options.seededConfig ?? null,
    }),
    db
      .select()
      .from(browserWorkflowEntitlements)
      .where(
        and(
          eq(browserWorkflowEntitlements.tenantId, options.tenantId),
          eq(browserWorkflowEntitlements.workflowId, options.workflowId),
        ),
      )
      .limit(1),
  ]);

  const entitlement = entitlementRow[0]
    ? normalizeBrowserWorkflowEntitlement({
        tenantId: entitlementRow[0].tenantId,
        workflowId: entitlementRow[0].workflowId,
        workflowName: entitlementRow[0].workflowName,
        enabled: entitlementRow[0].enabled,
        expiresAt: entitlementRow[0].expiresAt ?? null,
        reviewCadenceDays: entitlementRow[0].reviewCadenceDays,
        allowedCapabilities: entitlementRow[0].allowedCapabilities ?? [],
        forbiddenCapabilities: entitlementRow[0].forbiddenCapabilities ?? [],
        allowedDataClasses: entitlementRow[0].allowedDataClasses ?? [],
        config: entitlementRow[0].config ?? {},
      })
    : null;

  return resolveBrowserPolicyState({
    config,
    rules,
    entitlement,
    now: options.now,
    requiredCapabilities: options.requiredCapabilities,
    seededConfig: options.seededConfig ?? null,
  });
}
