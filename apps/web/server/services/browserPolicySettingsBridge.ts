import { and, eq } from "drizzle-orm";

import {
  systemSettings,
  tenantBrowserPolicyConfig,
} from "../../drizzle/schema";
import {
  type BrowserPolicyConfig,
  type BrowserPolicyUserCustomization,
  normalizeBrowserPolicyConfig,
} from "../../shared/browserPolicy";
import { getDb } from "../db";
import {
  buildSeededBrowserPolicyConfig,
  isRecoverableBrowserPolicySchemaError,
  loadTenantBrowserPolicyConfig,
} from "./browserPolicyStore";
import {
  getBrowserPolicySurfaceGateStatus,
  type BrowserPolicyControlledSurface,
} from "./browserPolicyReleaseControl";
import {
  DEFAULT_BROWSER_POLICY_PLATFORM_GUARDRAILS,
  resolveBrowserPolicyAllowedVisionModels,
  resolveBrowserPolicyUserCustomization,
} from "./browserPolicyUserSettings";

const DEFAULT_AUTOMATION_VISION_MODEL = "gpt-4o";

export interface LegacyAutomationSettings {
  allowedDomains: string[];
  visionModel: string;
}

export function parseAllowedDomainsSetting(
  value: string | null | undefined,
): string[] {
  if (!value) {
    return [];
  }

  return value
    .split(",")
    .map((domain) => domain.trim())
    .filter(Boolean);
}

export async function loadLegacyAutomationSettings(): Promise<LegacyAutomationSettings> {
  const db = await getDb();
  if (!db) {
    return {
      allowedDomains: [],
      visionModel: DEFAULT_AUTOMATION_VISION_MODEL,
    };
  }

  const rows = await db
    .select({ key: systemSettings.key, value: systemSettings.value })
    .from(systemSettings)
    .where(eq(systemSettings.category, "tenant_automation"));

  let allowedDomains: string[] = [];
  let visionModel = DEFAULT_AUTOMATION_VISION_MODEL;

  for (const row of rows) {
    if (row.key === "allowed_domains") {
      allowedDomains = parseAllowedDomainsSetting(row.value);
    } else if (row.key === "automation_vision_model" && row.value?.trim()) {
      visionModel = row.value.trim();
    }
  }

  return {
    allowedDomains,
    visionModel,
  };
}

export interface TenantAutomationPolicyStatus {
  tenantId: string | null;
  legacySettings: LegacyAutomationSettings;
  storageStatus: "ready" | "schema_missing";
  policyConfig: Pick<
    BrowserPolicyConfig,
    | "enabled"
    | "enforcementMode"
    | "defaultApprovalTtlSeconds"
    | "reviewCadenceDays"
    | "killSwitchEnabled"
    | "requireTamperEvidence"
    | "evidenceRetentionDays"
    | "allowedDomains"
    | "visionModel"
    | "seededDefault"
  > & {
    source: "db" | "seeded";
    auditFailClosed: boolean;
  };
  userCustomization: BrowserPolicyUserCustomization;
  allowedVisionModels: string[];
  platformGuardrails: {
    minApprovalTtlSeconds: number;
    maxApprovalTtlSeconds: number;
    maxEnforcementMode: BrowserPolicyConfig["enforcementMode"];
    requireTamperEvidenceMinimum: boolean;
  };
  legacyUiConnected: boolean;
  releaseGates: Record<
    BrowserPolicyControlledSurface,
    Awaited<ReturnType<typeof getBrowserPolicySurfaceGateStatus>>
  >;
}

export async function loadTenantAutomationPolicyStatus(
  tenantId: string | null | undefined,
): Promise<TenantAutomationPolicyStatus> {
  const normalizedTenantId = tenantId?.trim() || null;
  const legacySettings = await loadLegacyAutomationSettings();
  const seededConfig = buildSeededBrowserPolicyConfig({
    allowedDomains: legacySettings.allowedDomains,
    visionModel: legacySettings.visionModel,
  });

  const policyState = normalizedTenantId
    ? await loadTenantBrowserPolicyConfig({
        tenantId: normalizedTenantId,
        seededConfig,
      })
    : {
        config: seededConfig,
        rules: [],
      source: "seeded" as const,
      metadata: {},
      storageStatus: "ready" as const,
    };

  const effectiveConfig = policyState.config ?? seededConfig;
  const userCustomization = resolveBrowserPolicyUserCustomization(policyState.metadata);
  const allowedVisionModels = resolveBrowserPolicyAllowedVisionModels(
    effectiveConfig,
    policyState.metadata,
  );
  const [browserToolGate, automationCopilotGate] = await Promise.all([
    getBrowserPolicySurfaceGateStatus({ surface: "browserTool" }),
    getBrowserPolicySurfaceGateStatus({ surface: "automationCopilot" }),
  ]);

  return {
    tenantId: normalizedTenantId,
    legacySettings,
    storageStatus: policyState.storageStatus,
    policyConfig: {
      enabled: effectiveConfig.enabled,
      enforcementMode: effectiveConfig.enforcementMode,
      defaultApprovalTtlSeconds: effectiveConfig.defaultApprovalTtlSeconds,
      reviewCadenceDays: effectiveConfig.reviewCadenceDays,
      killSwitchEnabled: effectiveConfig.killSwitchEnabled,
      requireTamperEvidence: effectiveConfig.requireTamperEvidence,
      evidenceRetentionDays: effectiveConfig.evidenceRetentionDays,
      allowedDomains: effectiveConfig.allowedDomains,
      visionModel: effectiveConfig.visionModel,
      seededDefault: effectiveConfig.seededDefault,
      source: policyState.source,
      auditFailClosed: effectiveConfig.requireTamperEvidence,
    },
    userCustomization,
    allowedVisionModels,
    platformGuardrails: DEFAULT_BROWSER_POLICY_PLATFORM_GUARDRAILS,
    legacyUiConnected: legacySettings.allowedDomains.every((domain) =>
      effectiveConfig.allowedDomains.includes(domain),
    ) && effectiveConfig.visionModel === legacySettings.visionModel,
    releaseGates: {
      browserTool: browserToolGate,
      automationCopilot: automationCopilotGate,
    },
  };
}

async function upsertLegacyAutomationSetting(db: NonNullable<Awaited<ReturnType<typeof getDb>>>, input: {
  key: "allowed_domains" | "automation_vision_model";
  value: string;
  description: string;
  userId?: number | null;
}): Promise<void> {
  const existing = await db
    .select()
    .from(systemSettings)
    .where(
      and(
        eq(systemSettings.category, "tenant_automation"),
        eq(systemSettings.key, input.key),
      ),
    )
    .limit(1);

  if (existing[0]) {
    await db
      .update(systemSettings)
      .set({
        value: input.value,
        description: input.description,
        updatedBy: input.userId ?? undefined,
        updatedAt: new Date(),
      })
      .where(eq(systemSettings.id, existing[0].id));
    return;
  }

  await db.insert(systemSettings).values({
    category: "tenant_automation",
    key: input.key,
    value: input.value,
    description: input.description,
    updatedBy: input.userId ?? undefined,
  });
}

export async function updateTenantAutomationPolicySettings(input: {
  tenantId: string;
  config: Partial<BrowserPolicyConfig>;
  userCustomization?: Partial<BrowserPolicyUserCustomization>;
  allowedVisionModels?: string[];
  userId?: number | null;
}): Promise<TenantAutomationPolicyStatus> {
  const db = await getDb();
  if (!db) {
    throw new Error("Database not available");
  }

  const normalizedConfig = normalizeBrowserPolicyConfig({
    seededDefault: false,
    ...input.config,
  });

  let existing: Array<{
    id: number;
    metadata: Record<string, unknown> | null;
  }>;

  try {
    existing = await db
      .select({
        id: tenantBrowserPolicyConfig.id,
        metadata: tenantBrowserPolicyConfig.metadata,
      })
      .from(tenantBrowserPolicyConfig)
      .where(eq(tenantBrowserPolicyConfig.tenantId, input.tenantId))
      .limit(1);
  } catch (error) {
    if (!isRecoverableBrowserPolicySchemaError(error)) {
      throw error;
    }

    throw new Error(
      "Tenant-wide browser policy storage is not ready in this environment yet. Apply the browser policy database migration before saving tenant-wide settings.",
    );
  }

  const persistedValues = {
    enabled: normalizedConfig.enabled,
    enforcementMode: normalizedConfig.enforcementMode,
    defaultApprovalTtlSeconds: normalizedConfig.defaultApprovalTtlSeconds,
    reviewCadenceDays: normalizedConfig.reviewCadenceDays,
    killSwitchEnabled: normalizedConfig.killSwitchEnabled,
    requireTamperEvidence: normalizedConfig.requireTamperEvidence,
    evidenceRetentionDays: normalizedConfig.evidenceRetentionDays,
    allowedDomains: normalizedConfig.allowedDomains,
    visionModel: normalizedConfig.visionModel,
    seededDefault: false,
    metadata: {
      ...((existing[0]?.metadata as Record<string, unknown> | null | undefined) ?? {}),
      userCustomization: resolveBrowserPolicyUserCustomization(input.userCustomization),
      allowedVisionModels:
        input.allowedVisionModels && input.allowedVisionModels.length > 0
          ? Array.from(
              new Set(
                input.allowedVisionModels
                  .map((model) => model.trim())
                  .filter(Boolean),
              ),
            )
          : [normalizedConfig.visionModel],
    },
    updatedAt: new Date(),
  };

  if (existing[0]) {
    await db
      .update(tenantBrowserPolicyConfig)
      .set(persistedValues)
      .where(eq(tenantBrowserPolicyConfig.id, existing[0].id));
  } else {
    await db.insert(tenantBrowserPolicyConfig).values({
      tenantId: input.tenantId,
      ...persistedValues,
    });
  }

  await Promise.all([
    upsertLegacyAutomationSetting(db, {
      key: "allowed_domains",
      value: normalizedConfig.allowedDomains.join(", "),
      description: "Allowed domains for automation (comma-separated)",
      userId: input.userId,
    }),
    upsertLegacyAutomationSetting(db, {
      key: "automation_vision_model",
      value: normalizedConfig.visionModel,
      description: "Vision model for automation copilot",
      userId: input.userId,
    }),
  ]);

  return loadTenantAutomationPolicyStatus(input.tenantId);
}
