import { and, desc, eq, gt, isNotNull, isNull, or } from "drizzle-orm";

import { libraryKnowledgeReleaseGateOverrides } from "../../drizzle/schema";
import { getDb } from "../db";

function parseBoolean(raw: string | undefined, fallback: boolean): boolean {
  if (raw === undefined) return fallback;
  const normalized = raw.trim().toLowerCase();
  if (!normalized) return fallback;
  return ["1", "true", "yes", "on"].includes(normalized);
}

function shouldUnlockProtectedKnowledgeSurfacesForDev(): boolean {
  if (process.env.NODE_ENV !== "development") {
    return false;
  }

  return parseBoolean(
    process.env.KNOWLEDGE_VAULT_DEV_UNLOCK_PROTECTED_SURFACES,
    true,
  );
}

function normalizeTenantIdValue(value: unknown): string | null {
  if (typeof value === "number" && Number.isInteger(value) && value > 0) {
    return String(value);
  }

  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return null;
    return trimmed;
  }

  return null;
}

function parseTenantAllowlist(raw: string | undefined): Set<string> | null {
  if (!raw) return null;
  const ids = raw
    .split(",")
    .map((value) => normalizeTenantIdValue(value))
    .filter((value): value is string => Boolean(value));
  if (!ids.length) return null;
  return new Set(ids);
}

export type KnowledgeVaultSurface =
  | "quickSwitcher"
  | "inspector"
  | "savedViews"
  | "contextPacks"
  | "contextPacksRuntime"
  | "contextPacksDelegatedMcp"
  | "contextPacksSnapshot"
  | "graph"
  | "canvas"
  | "privateVaultRuntimeUnlock";

export type KnowledgeVaultReleaseGateStatus =
  | "unknown"
  | "pass"
  | "blocked"
  | "insufficient_data"
  | "overridden";

export type KnowledgeVaultReleaseGateOverrideMetadata = {
  actorUserId: number | null;
  approvedByUserId: number | null;
  reason: string;
  scopeType: "tenant" | "global";
  scopeId: string | null;
  createdAt: string;
  expiresAt: string;
};

export type KnowledgeVaultSurfaceDecisionReason =
  | "library_disabled"
  | "knowledge_vault_disabled"
  | "tenant_not_allowlisted"
  | "surface_env_disabled"
  | "release_gate_not_ready";

export type KnowledgeVaultAccessPolicy = {
  enabled: boolean;
  tenantScoped: boolean;
  broadRollout: boolean;
  releaseGateStatus: KnowledgeVaultReleaseGateStatus;
  releaseGateBypassed: boolean;
  releaseGateOverride: KnowledgeVaultReleaseGateOverrideMetadata | null;
  surfaces: Record<KnowledgeVaultSurface, boolean>;
  surfaceReasons: Record<
    KnowledgeVaultSurface,
    KnowledgeVaultSurfaceDecisionReason[]
  >;
};

const knowledgeVaultSurfaceConfig: Record<
  KnowledgeVaultSurface,
  { env: string; defaultEnabled: boolean }
> = {
  quickSwitcher: {
    env: "KNOWLEDGE_VAULT_QUICK_SWITCHER_ENABLED",
    defaultEnabled: true,
  },
  inspector: {
    env: "KNOWLEDGE_VAULT_INSPECTOR_ENABLED",
    defaultEnabled: true,
  },
  savedViews: {
    env: "KNOWLEDGE_VAULT_SAVED_VIEWS_ENABLED",
    defaultEnabled: true,
  },
  contextPacks: {
    env: "KNOWLEDGE_VAULT_CONTEXT_PACKS_ENABLED",
    defaultEnabled: true,
  },
  contextPacksRuntime: {
    env: "KNOWLEDGE_VAULT_CONTEXT_PACKS_RUNTIME_ENABLED",
    defaultEnabled: true,
  },
  contextPacksDelegatedMcp: {
    env: "KNOWLEDGE_VAULT_CONTEXT_PACKS_DELEGATED_MCP_ENABLED",
    defaultEnabled: true,
  },
  contextPacksSnapshot: {
    env: "KNOWLEDGE_VAULT_CONTEXT_PACKS_SNAPSHOT_ENABLED",
    defaultEnabled: true,
  },
  graph: {
    env: "KNOWLEDGE_VAULT_GRAPH_ENABLED",
    defaultEnabled: true,
  },
  canvas: {
    env: "KNOWLEDGE_VAULT_CANVAS_ENABLED",
    defaultEnabled: true,
  },
  privateVaultRuntimeUnlock: {
    env: "KNOWLEDGE_VAULT_PRIVATE_VAULT_RUNTIME_UNLOCK_ENABLED",
    defaultEnabled: false,
  },
};

const releaseGateProtectedSurfaces = new Set<KnowledgeVaultSurface>([
  "contextPacksRuntime",
  "contextPacksDelegatedMcp",
  "canvas",
  "privateVaultRuntimeUnlock",
]);

export function isLibraryEnabledForTenant(tenantId: unknown): boolean {
  const enabled = parseBoolean(process.env.LIBRARY_ENABLED, true);
  if (!enabled) return false;

  const allowlist = parseTenantAllowlist(process.env.LIBRARY_ENABLED_TENANTS);
  if (!allowlist) return true;

  const normalized = normalizeTenantIdValue(tenantId);

  // In allowlist mode, missing tenant context must fail closed.
  if (!normalized) return false;
  return allowlist.has(normalized);
}

function parseKnowledgeVaultReleaseGateStatus(
  raw: string | undefined,
): KnowledgeVaultReleaseGateStatus {
  const normalized = raw?.trim().toLowerCase();
  if (
    normalized === "pass"
    || normalized === "ready"
    || normalized === "blocked"
    || normalized === "insufficient_data"
  ) {
    return normalized === "ready" ? "pass" : normalized;
  }
  return "unknown";
}

function normalizeOptionalInteger(value: unknown): number | null {
  if (value === null || value === undefined) {
    return null;
  }
  if (typeof value === "number" && Number.isInteger(value) && value > 0) {
    return value;
  }
  if (typeof value === "string" && /^\d+$/.test(value.trim())) {
    const parsed = Number(value);
    return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
  }
  return null;
}

function normalizeIsoDate(value: unknown): string | null {
  if (typeof value !== "string" || !value.trim()) {
    return null;
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return null;
  }
  return date.toISOString();
}

function normalizeReleaseGateOverride(
  value: unknown,
): KnowledgeVaultReleaseGateOverrideMetadata | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const record = value as Record<string, unknown>;
  const scopeType =
    record.scopeType === "global" || record.scope_type === "global"
      ? "global"
      : record.scopeType === "tenant" || record.scope_type === "tenant"
      ? "tenant"
      : null;
  if (!scopeType) {
    return null;
  }

  const rawScopeId = record.scopeId ?? record.scope_id ?? null;
  const scopeId = scopeType === "global"
    ? null
    : normalizeTenantIdValue(rawScopeId);
  if (scopeType === "tenant" && !scopeId) {
    return null;
  }

  const reason =
    typeof record.reason === "string" ? record.reason.trim() : "";
  if (reason.length < 8) {
    return null;
  }

  const createdAt = normalizeIsoDate(record.createdAt ?? record.created_at);
  const expiresAt = normalizeIsoDate(record.expiresAt ?? record.expires_at);
  if (!createdAt || !expiresAt) {
    return null;
  }
  if (new Date(expiresAt).getTime() <= new Date(createdAt).getTime()) {
    return null;
  }

  const actorUserId = normalizeOptionalInteger(
    record.actorUserId ?? record.actor_user_id,
  );
  const approvedByUserId = normalizeOptionalInteger(
    record.approvedByUserId ?? record.approved_by_user_id,
  );
  if (!actorUserId || !approvedByUserId) {
    return null;
  }

  return {
    actorUserId,
    approvedByUserId,
    reason,
    scopeType,
    scopeId,
    createdAt,
    expiresAt,
  };
}

function parseReleaseGateOverrideEnv():
  | KnowledgeVaultReleaseGateOverrideMetadata
  | null {
  const raw = process.env.KNOWLEDGE_VAULT_RELEASE_GATE_OVERRIDE;
  if (!raw?.trim()) {
    return null;
  }

  try {
    return normalizeReleaseGateOverride(JSON.parse(raw));
  } catch {
    return null;
  }
}

export function isKnowledgeVaultReleaseGateOverrideActive(
  override: KnowledgeVaultReleaseGateOverrideMetadata | null | undefined,
  tenantId: unknown,
  now = new Date(),
): override is KnowledgeVaultReleaseGateOverrideMetadata {
  if (!override) {
    return false;
  }
  const expiresAt = new Date(override.expiresAt).getTime();
  const createdAt = new Date(override.createdAt).getTime();
  if (
    Number.isNaN(expiresAt)
    || Number.isNaN(createdAt)
    || expiresAt <= createdAt
    || expiresAt <= now.getTime()
  ) {
    return false;
  }
  if (!override.reason.trim()) {
    return false;
  }
  if (!override.actorUserId || !override.approvedByUserId) {
    return false;
  }
  if (override.scopeType === "global") {
    return override.scopeId === null;
  }

  const normalizedTenantId = normalizeTenantIdValue(tenantId);
  return Boolean(
    normalizedTenantId
    && override.scopeId
    && override.scopeId === normalizedTenantId,
  );
}

function resolveKnowledgeVaultBaseDisableReasons(
  tenantId: unknown,
): KnowledgeVaultSurfaceDecisionReason[] {
  if (!isLibraryEnabledForTenant(tenantId)) {
    return ["library_disabled"];
  }

  const knowledgeVaultEnabled = parseBoolean(
    process.env.KNOWLEDGE_VAULT_ENABLED,
    true,
  );
  if (!knowledgeVaultEnabled) {
    return ["knowledge_vault_disabled"];
  }

  const allowlist = parseTenantAllowlist(
    process.env.KNOWLEDGE_VAULT_ENABLED_TENANTS,
  );
  if (!allowlist) {
    return [];
  }

  const normalized = normalizeTenantIdValue(tenantId);
  if (!normalized || !allowlist.has(normalized)) {
    return ["tenant_not_allowlisted"];
  }

  return [];
}

export function getKnowledgeVaultAccessPolicy(
  tenantId: unknown,
  options?: {
    releaseGateOverride?: KnowledgeVaultReleaseGateOverrideMetadata | null;
    now?: Date;
  },
): KnowledgeVaultAccessPolicy {
  const normalizedTenantId = normalizeTenantIdValue(tenantId);
  const baseDisableReasons = resolveKnowledgeVaultBaseDisableReasons(tenantId);
  const enabled = baseDisableReasons.length === 0;
  const rolloutAllowlist = parseTenantAllowlist(
    process.env.KNOWLEDGE_VAULT_ENABLED_TENANTS,
  );
  const tenantScoped = Boolean(
    rolloutAllowlist,
  );
  const releaseGateStatus = parseKnowledgeVaultReleaseGateStatus(
    process.env.KNOWLEDGE_VAULT_RELEASE_GATE_STATUS,
  );
  const releaseGateBypassTenants = parseTenantAllowlist(
    process.env.KNOWLEDGE_VAULT_RELEASE_GATE_BYPASS_TENANTS,
  );
  const releaseGateBypassed = Boolean(
    normalizedTenantId
    && releaseGateBypassTenants
    && releaseGateBypassTenants.has(normalizedTenantId),
  );
  const configuredOverride =
    options?.releaseGateOverride === undefined
      ? parseReleaseGateOverrideEnv()
      : options.releaseGateOverride;
  const devUnlockProtectedSurfaces = shouldUnlockProtectedKnowledgeSurfacesForDev();
  const activeReleaseGateOverride = isKnowledgeVaultReleaseGateOverrideActive(
    configuredOverride,
    tenantId,
    options?.now,
  )
    ? configuredOverride
    : null;
  const effectiveReleaseGateStatus: KnowledgeVaultReleaseGateStatus =
    activeReleaseGateOverride
      ? "overridden"
      : devUnlockProtectedSurfaces
        ? "pass"
        : releaseGateStatus;
  const broadRollout = enabled && !tenantScoped;
  const releaseGateAllowsProtectedSurfaces =
    releaseGateBypassed
    || releaseGateStatus === "pass"
    || Boolean(activeReleaseGateOverride)
    || devUnlockProtectedSurfaces;
  const surfaceReasons = Object.fromEntries(
    Object.entries(knowledgeVaultSurfaceConfig).map(([surface, config]) => {
      const reasons = [...baseDisableReasons];
      if (
        enabled
        && !parseBoolean(process.env[config.env], config.defaultEnabled)
      ) {
        reasons.push("surface_env_disabled");
      }
      if (
        enabled
        && !releaseGateAllowsProtectedSurfaces
        && releaseGateProtectedSurfaces.has(surface as KnowledgeVaultSurface)
      ) {
        reasons.push("release_gate_not_ready");
      }
      return [surface, Array.from(new Set(reasons))];
    }),
  ) as KnowledgeVaultAccessPolicy["surfaceReasons"];
  const surfaces = Object.fromEntries(
    (Object.keys(knowledgeVaultSurfaceConfig) as KnowledgeVaultSurface[]).map(
      (surface) => [surface, surfaceReasons[surface].length === 0],
    ),
  ) as KnowledgeVaultAccessPolicy["surfaces"];

  return {
    enabled,
    tenantScoped,
    broadRollout,
    releaseGateStatus: effectiveReleaseGateStatus,
    releaseGateBypassed,
    releaseGateOverride: activeReleaseGateOverride,
    surfaces,
    surfaceReasons,
  };
}

export function getKnowledgeVaultSurfaceDecision(
  surface: KnowledgeVaultSurface,
  tenantId: unknown,
): {
  enabled: boolean;
  reasons: KnowledgeVaultSurfaceDecisionReason[];
} {
  const policy = getKnowledgeVaultAccessPolicy(tenantId);
  return {
    enabled: policy.surfaces[surface] === true,
    reasons: policy.surfaceReasons[surface],
  };
}

async function getActiveReleaseGateOverrideFromDb(
  tenantId: unknown,
  now = new Date(),
): Promise<KnowledgeVaultReleaseGateOverrideMetadata | null> {
  const normalizedTenantId = normalizeTenantIdValue(tenantId);
  if (!normalizedTenantId) {
    return null;
  }

  try {
    const db = await getDb();
    if (!db || typeof (db as { select?: unknown }).select !== "function") {
      return null;
    }

    const rows = await db
      .select({
        actorUserId: libraryKnowledgeReleaseGateOverrides.actorUserId,
        approvedByUserId: libraryKnowledgeReleaseGateOverrides.approvedByUserId,
        reason: libraryKnowledgeReleaseGateOverrides.reason,
        scopeType: libraryKnowledgeReleaseGateOverrides.scopeType,
        scopeId: libraryKnowledgeReleaseGateOverrides.scopeId,
        createdAt: libraryKnowledgeReleaseGateOverrides.createdAt,
        expiresAt: libraryKnowledgeReleaseGateOverrides.expiresAt,
      })
      .from(libraryKnowledgeReleaseGateOverrides)
      .where(
        and(
          eq(libraryKnowledgeReleaseGateOverrides.status, "active"),
          isNotNull(libraryKnowledgeReleaseGateOverrides.approvedByUserId),
          isNotNull(libraryKnowledgeReleaseGateOverrides.approvedAt),
          isNull(libraryKnowledgeReleaseGateOverrides.revokedAt),
          gt(libraryKnowledgeReleaseGateOverrides.expiresAt, now),
          or(
            and(
              isNull(libraryKnowledgeReleaseGateOverrides.tenantId),
              eq(libraryKnowledgeReleaseGateOverrides.scopeType, "global"),
              isNull(libraryKnowledgeReleaseGateOverrides.scopeId),
            ),
            and(
              eq(libraryKnowledgeReleaseGateOverrides.tenantId, normalizedTenantId),
              eq(libraryKnowledgeReleaseGateOverrides.scopeType, "tenant"),
              eq(libraryKnowledgeReleaseGateOverrides.scopeId, normalizedTenantId),
            ),
          ),
        ),
      )
      .orderBy(desc(libraryKnowledgeReleaseGateOverrides.expiresAt))
      .limit(1);

    const row = rows[0];
    if (!row) {
      return null;
    }

    return isKnowledgeVaultReleaseGateOverrideActive(
      {
        actorUserId: row.actorUserId,
        approvedByUserId: row.approvedByUserId,
        reason: row.reason,
        scopeType: row.scopeType === "global" ? "global" : "tenant",
        scopeId: row.scopeType === "global" ? null : row.scopeId,
        createdAt: row.createdAt.toISOString(),
        expiresAt: row.expiresAt.toISOString(),
      },
      normalizedTenantId,
      now,
    )
      ? {
          actorUserId: row.actorUserId,
          approvedByUserId: row.approvedByUserId,
          reason: row.reason,
          scopeType: row.scopeType === "global" ? "global" : "tenant",
          scopeId: row.scopeType === "global" ? null : row.scopeId,
          createdAt: row.createdAt.toISOString(),
          expiresAt: row.expiresAt.toISOString(),
        }
      : null;
  } catch {
    return null;
  }
}

export async function getKnowledgeVaultAccessPolicyAsync(
  tenantId: unknown,
  options?: {
    releaseGateOverride?: KnowledgeVaultReleaseGateOverrideMetadata | null;
    now?: Date;
  },
): Promise<KnowledgeVaultAccessPolicy> {
  const now = options?.now ?? new Date();
  const basePolicy = getKnowledgeVaultAccessPolicy(tenantId, {
    releaseGateOverride: options?.releaseGateOverride,
    now,
  });
  if (
    basePolicy.releaseGateStatus === "pass"
    || basePolicy.releaseGateBypassed
    || basePolicy.releaseGateOverride
    || options?.releaseGateOverride !== undefined
  ) {
    return basePolicy;
  }

  const dbOverride = await getActiveReleaseGateOverrideFromDb(tenantId, now);
  if (!dbOverride) {
    return basePolicy;
  }

  return getKnowledgeVaultAccessPolicy(tenantId, {
    releaseGateOverride: dbOverride,
    now,
  });
}

export async function isKnowledgeVaultSurfaceEnabledAsync(
  surface: KnowledgeVaultSurface,
  tenantId: unknown,
): Promise<boolean> {
  return (await getKnowledgeVaultAccessPolicyAsync(tenantId)).surfaces[surface] === true;
}

export async function assertKnowledgeVaultSurfaceEnabledAsync(
  surface: KnowledgeVaultSurface,
  tenantId: unknown,
): Promise<void> {
  const policy = await getKnowledgeVaultAccessPolicyAsync(tenantId);
  if (policy.surfaces[surface] === true) {
    return;
  }

  const reasons = policy.surfaceReasons[surface] ?? [];
  const reasonSuffix = reasons.length > 0
    ? ` (${reasons.join(",")})`
    : "";
  throw new Error(
    `Knowledge Vault surface is disabled: ${surface}${reasonSuffix}`,
  );
}

export function isKnowledgeVaultSurfaceEnabled(
  surface: KnowledgeVaultSurface,
  tenantId: unknown,
): boolean {
  return getKnowledgeVaultAccessPolicy(tenantId).surfaces[surface] === true;
}

export function assertKnowledgeVaultSurfaceEnabled(
  surface: KnowledgeVaultSurface,
  tenantId: unknown,
): void {
  const decision = getKnowledgeVaultSurfaceDecision(surface, tenantId);
  if (!decision.enabled) {
    const reasonSuffix = decision.reasons.length > 0
      ? ` (${decision.reasons.join(",")})`
      : "";
    throw new Error(
      `Knowledge Vault surface is disabled: ${surface}${reasonSuffix}`,
    );
  }
}
