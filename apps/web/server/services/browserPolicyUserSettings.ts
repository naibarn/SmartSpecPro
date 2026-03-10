import { and, eq } from "drizzle-orm";

import { tenantBrowserPolicyConfig, users } from "../../drizzle/schema";
import {
  type BrowserActionClass,
  type BrowserPolicyBlockedTransfer,
  type BrowserPolicyConfig,
  type BrowserPolicyEnforcementMode,
  type BrowserPolicyUserCustomization,
  type BrowserPolicyUserProfile,
  normalizeBrowserPolicyUserCustomization,
  normalizeBrowserPolicyUserProfile,
} from "../../shared/browserPolicy";
import { getDb } from "../db";
import {
  buildSeededBrowserPolicyConfig,
  loadTenantBrowserPolicyConfig,
} from "./browserPolicyStore";

const ENFORCEMENT_MODE_ORDER: Record<BrowserPolicyEnforcementMode, number> = {
  observe: 0,
  read_only: 1,
  draft: 2,
  commit: 3,
  expanded: 4,
};

const TRANSFER_ACTION_BLOCKS: Array<{
  blockedTransfer: BrowserPolicyBlockedTransfer;
  actionTypes: string[];
}> = [
  { blockedTransfer: "download", actionTypes: ["download"] },
  { blockedTransfer: "upload", actionTypes: ["upload"] },
  { blockedTransfer: "clipboard", actionTypes: ["clipboard_read", "clipboard_write"] },
  { blockedTransfer: "external_send", actionTypes: ["external_send"] },
];

export interface BrowserPolicyPlatformGuardrails {
  minApprovalTtlSeconds: number;
  maxApprovalTtlSeconds: number;
  maxEnforcementMode: BrowserPolicyEnforcementMode;
  requireTamperEvidenceMinimum: boolean;
}

export interface EffectiveUserAutomationPolicy {
  tenantId: string;
  profile: BrowserPolicyUserProfile;
  customization: BrowserPolicyUserCustomization;
  inheritedConfig: BrowserPolicyConfig;
  effectiveConfig: BrowserPolicyConfig;
  allowedVisionModels: string[];
  source: "db" | "seeded";
}

export const DEFAULT_BROWSER_POLICY_PLATFORM_GUARDRAILS: BrowserPolicyPlatformGuardrails = {
  minApprovalTtlSeconds: 60,
  maxApprovalTtlSeconds: 900,
  maxEnforcementMode: "expanded",
  requireTamperEvidenceMinimum: true,
};

export const DEFAULT_BROWSER_POLICY_USER_CUSTOMIZATION =
  normalizeBrowserPolicyUserCustomization({});
export const DEFAULT_BROWSER_POLICY_USER_PROFILE = normalizeBrowserPolicyUserProfile({});

function normalizeDomainList(values: string[]): string[] {
  return Array.from(
    new Set(
      values
        .map((value) => value.trim().toLowerCase())
        .filter(Boolean),
    ),
  );
}

function isSubdomainOrSameDomain(hostname: string, domain: string): boolean {
  return hostname === domain || hostname.endsWith(`.${domain}`);
}

function isDomainAllowedByTenant(domain: string, tenantAllowedDomains: string[]): boolean {
  return tenantAllowedDomains.some((allowedDomain) => {
    if (allowedDomain.startsWith("*.")) {
      const wildcardDomain = allowedDomain.slice(2);
      return isSubdomainOrSameDomain(domain, wildcardDomain);
    }
    return isSubdomainOrSameDomain(domain, allowedDomain);
  });
}

export function resolveBrowserPolicyUserCustomization(
  metadata: Record<string, unknown> | null | undefined,
): BrowserPolicyUserCustomization {
  const customization = metadata?.userCustomization;
  if (!customization || typeof customization !== "object") {
    return DEFAULT_BROWSER_POLICY_USER_CUSTOMIZATION;
  }
  return normalizeBrowserPolicyUserCustomization(
    customization as Partial<BrowserPolicyUserCustomization>,
  );
}

export function resolveBrowserPolicyAllowedVisionModels(
  config: Pick<BrowserPolicyConfig, "visionModel">,
  metadata: Record<string, unknown> | null | undefined,
): string[] {
  const rawAllowed = metadata?.allowedVisionModels;
  if (!Array.isArray(rawAllowed)) {
    return [config.visionModel];
  }

  const allowed = Array.from(
    new Set(
      rawAllowed
        .filter((value): value is string => typeof value === "string")
        .map((value) => value.trim())
        .filter(Boolean),
    ),
  );

  return allowed.length > 0 ? allowed : [config.visionModel];
}

export function narrowBrowserPolicyEnforcementMode(
  baseMode: BrowserPolicyEnforcementMode,
  requestedMode: BrowserPolicyEnforcementMode | null | undefined,
): BrowserPolicyEnforcementMode {
  if (!requestedMode) {
    return baseMode;
  }

  return ENFORCEMENT_MODE_ORDER[requestedMode] <= ENFORCEMENT_MODE_ORDER[baseMode]
    ? requestedMode
    : baseMode;
}

export function intersectBrowserPolicyDomains(
  tenantAllowedDomains: string[],
  personalDomains: string[],
): string[] {
  if (personalDomains.length === 0) {
    return tenantAllowedDomains;
  }

  const normalizedTenantDomains = normalizeDomainList(tenantAllowedDomains);
  const normalizedPersonalDomains = normalizeDomainList(personalDomains);

  return normalizedPersonalDomains.filter((domain) =>
    isDomainAllowedByTenant(domain, normalizedTenantDomains),
  );
}

export function applyUserBrowserPolicyProfileToConfig(input: {
  config: BrowserPolicyConfig;
  profile?: BrowserPolicyUserProfile | null;
  customization?: BrowserPolicyUserCustomization | null;
  allowedVisionModels?: string[];
}): BrowserPolicyConfig {
  const profile = normalizeBrowserPolicyUserProfile(input.profile ?? {});
  const customization = normalizeBrowserPolicyUserCustomization(input.customization ?? {});
  const allowedVisionModels = Array.from(
    new Set((input.allowedVisionModels ?? [input.config.visionModel]).filter(Boolean)),
  );

  if (!profile.enabled) {
    return input.config;
  }

  const effectiveAllowedDomains = customization.allowPersonalDomainSubset
    ? intersectBrowserPolicyDomains(input.config.allowedDomains, profile.allowedDomainsSubset)
    : input.config.allowedDomains;
  const effectiveMode = customization.allowModeCap
    ? narrowBrowserPolicyEnforcementMode(input.config.enforcementMode, profile.modeCap)
    : input.config.enforcementMode;
  const effectiveApprovalTtl = customization.allowApprovalTtlCap && profile.approvalTtlSecondsCap
    ? Math.min(input.config.defaultApprovalTtlSeconds, profile.approvalTtlSecondsCap)
    : input.config.defaultApprovalTtlSeconds;
  const effectiveVisionModel = customization.allowPreferredVisionModel
    && profile.preferredVisionModel
    && allowedVisionModels.includes(profile.preferredVisionModel)
    ? profile.preferredVisionModel
    : input.config.visionModel;

  return {
    ...input.config,
    enforcementMode: effectiveMode,
    defaultApprovalTtlSeconds: effectiveApprovalTtl,
    allowedDomains: effectiveAllowedDomains,
    visionModel: effectiveVisionModel,
  };
}

export async function loadUserBrowserPolicyProfile(input: {
  userId: number;
}): Promise<BrowserPolicyUserProfile> {
  const db = await getDb();
  if (!db) {
    return DEFAULT_BROWSER_POLICY_USER_PROFILE;
  }

  const [row] = await db
    .select({ userPreferences: users.userPreferences })
    .from(users)
    .where(eq(users.id, input.userId))
    .limit(1);

  const rawPreferences =
    (row?.userPreferences as { automationPolicy?: Partial<BrowserPolicyUserProfile> } | null | undefined)
    ?? {};
  return normalizeBrowserPolicyUserProfile(rawPreferences.automationPolicy ?? {});
}

export async function resolveEffectiveUserAutomationPolicy(input: {
  tenantId: string;
  userId: number;
  seededConfig?: Partial<BrowserPolicyConfig> | null;
}): Promise<EffectiveUserAutomationPolicy> {
  const tenantState = await loadTenantBrowserPolicyConfig({
    tenantId: input.tenantId,
    seededConfig: input.seededConfig ?? null,
  });
  const inheritedConfig = tenantState.config
    ?? buildSeededBrowserPolicyConfig(input.seededConfig ?? {});
  const customization = resolveBrowserPolicyUserCustomization(tenantState.metadata);
  const allowedVisionModels = resolveBrowserPolicyAllowedVisionModels(
    inheritedConfig,
    tenantState.metadata,
  );
  const profile = await loadUserBrowserPolicyProfile({ userId: input.userId });
  const effectiveConfig = applyUserBrowserPolicyProfileToConfig({
    config: inheritedConfig,
    profile,
    customization,
    allowedVisionModels,
  });

  return {
    tenantId: input.tenantId,
    profile,
    customization,
    inheritedConfig,
    effectiveConfig,
    allowedVisionModels,
    source: tenantState.source,
  };
}

function validateUserProfileAgainstTenant(input: {
  profile: BrowserPolicyUserProfile;
  customization: BrowserPolicyUserCustomization;
  effectiveTenantConfig: BrowserPolicyConfig;
  allowedVisionModels: string[];
  platformGuardrails?: BrowserPolicyPlatformGuardrails;
}): void {
  const platformGuardrails = input.platformGuardrails ?? DEFAULT_BROWSER_POLICY_PLATFORM_GUARDRAILS;
  const profile = input.profile;
  const config = input.effectiveTenantConfig;

  if (
    profile.modeCap
    && (
      !input.customization.allowModeCap
      || ENFORCEMENT_MODE_ORDER[profile.modeCap] > ENFORCEMENT_MODE_ORDER[config.enforcementMode]
      || ENFORCEMENT_MODE_ORDER[profile.modeCap] > ENFORCEMENT_MODE_ORDER[platformGuardrails.maxEnforcementMode]
    )
  ) {
    throw new Error("Requested personal mode exceeds tenant policy");
  }

  if (
    profile.allowedDomainsSubset.length > 0
    && (
      !input.customization.allowPersonalDomainSubset
      || intersectBrowserPolicyDomains(config.allowedDomains, profile.allowedDomainsSubset).length
      !== normalizeDomainList(profile.allowedDomainsSubset).length
    )
  ) {
    throw new Error("Requested personal domains exceed tenant policy");
  }

  if (profile.blockedTransfers.length > 0 && !input.customization.allowTransferBlocks) {
    throw new Error("Tenant policy does not allow personal transfer restrictions");
  }

  if (
    profile.requireApprovalForActionClasses.length > 0
    && !input.customization.allowActionApprovalEscalation
  ) {
    throw new Error("Tenant policy does not allow personal approval escalation");
  }

  if (
    profile.approvalTtlSecondsCap != null
    && (
      !input.customization.allowApprovalTtlCap
      || profile.approvalTtlSecondsCap > config.defaultApprovalTtlSeconds
      || profile.approvalTtlSecondsCap > platformGuardrails.maxApprovalTtlSeconds
      || profile.approvalTtlSecondsCap < platformGuardrails.minApprovalTtlSeconds
    )
  ) {
    throw new Error("Requested personal approval TTL exceeds tenant policy");
  }

  if (
    profile.preferredVisionModel
    && (
      !input.customization.allowPreferredVisionModel
      || !input.allowedVisionModels.includes(profile.preferredVisionModel)
    )
  ) {
    throw new Error("Requested personal vision model is not allowed");
  }
}

export async function updateUserBrowserPolicyProfile(input: {
  tenantId: string;
  userId: number;
  profile: Partial<BrowserPolicyUserProfile>;
}): Promise<EffectiveUserAutomationPolicy> {
  const db = await getDb();
  if (!db) {
    throw new Error("Database not available");
  }

  const current = await resolveEffectiveUserAutomationPolicy({
    tenantId: input.tenantId,
    userId: input.userId,
  });
  const nextProfile = normalizeBrowserPolicyUserProfile({
    ...current.profile,
    ...input.profile,
  });

  validateUserProfileAgainstTenant({
    profile: nextProfile,
    customization: current.customization,
    effectiveTenantConfig: current.inheritedConfig,
    allowedVisionModels: current.allowedVisionModels,
  });

  const [existing] = await db
    .select({ userPreferences: users.userPreferences })
    .from(users)
    .where(eq(users.id, input.userId))
    .limit(1);
  const currentPreferences = (existing?.userPreferences as Record<string, unknown> | null | undefined) ?? {};

  await db
    .update(users)
    .set({
      userPreferences: {
        ...currentPreferences,
        automationPolicy: nextProfile,
      },
    })
    .where(eq(users.id, input.userId));

  return resolveEffectiveUserAutomationPolicy({
    tenantId: input.tenantId,
    userId: input.userId,
  });
}

export function getUserBlockedTransferReason(
  actionType: string,
  blockedTransfers: BrowserPolicyBlockedTransfer[],
): string | null {
  const normalizedActionType = actionType.trim().toLowerCase();
  const blockedSet = new Set(blockedTransfers);
  const match = TRANSFER_ACTION_BLOCKS.find(
    ({ blockedTransfer, actionTypes }) =>
      blockedSet.has(blockedTransfer) && actionTypes.includes(normalizedActionType),
  );
  return match ? `user_blocked_${match.blockedTransfer}` : null;
}

export function requiresUserEscalatedApproval(
  actionClass: BrowserActionClass,
  requiredActionClasses: BrowserActionClass[],
): boolean {
  return new Set(requiredActionClasses).has(actionClass);
}
