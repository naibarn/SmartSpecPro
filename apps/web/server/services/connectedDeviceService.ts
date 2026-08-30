import crypto from "node:crypto";
import { and, desc, eq, inArray, isNull, or } from "drizzle-orm";

import {
  connectedDevices,
  tenants,
  workers,
  type ConnectedDevice,
} from "../../drizzle/schema";
import { getDb } from "../db";
import { revokeJti } from "../_core/revocation";
import { auditLogger } from "./auditLogger";
import { MCP_OAUTH_ALLOWED_SCOPES } from "./mcpOAuthScopes";
import {
  connectedDeviceRecordSchema,
  type ConnectedDeviceRecord,
} from "../../shared/connectedDevices";

const WORKER_CONNECTION_REVOKE_TTL_MS = 30 * 24 * 60 * 60 * 1000;

export type ConnectedDeviceUpsertInput = {
  tenantId: string;
  ownerUserId: number;
  workerId?: string | null;
  deviceId: string;
  workerConnectionId?: string | null;
  consentId?: string | null;
  displayName: string;
  runtimeType: string;
  authKind: string;
  connectionMethod: string;
  platform?: string | null;
  architecture?: string | null;
  scopes?: string[];
  approvedAt?: Date | null;
  accessTokenExpiresAt?: Date | null;
  refreshTokenExpiresAt?: Date | null;
  metadataJson?: Record<string, unknown>;
};

function sha256(value: string): string {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function deviceIdHash(value: string): string {
  const normalized = value.trim();
  return /^[a-f0-9]{64}$/i.test(normalized)
    ? normalized.toLowerCase()
    : sha256(normalized);
}

function safeFingerprint(hash: string): string {
  return hash.slice(0, 12);
}

function dateOrNull(value: Date | string | null | undefined): string | null {
  return value ? new Date(value).toISOString() : null;
}

function safeClientOrigin(redirectUri: string | null): string | null {
  if (!redirectUri) return null;
  try {
    const url = new URL(redirectUri);
    if (url.protocol !== "https:" && url.protocol !== "http:") return null;
    return url.origin;
  } catch {
    return null;
  }
}

function normalizeScopes(scopes: unknown): string[] {
  return Array.from(
    new Set(
      (Array.isArray(scopes) ? scopes : [])
        .filter((scope): scope is string => typeof scope === "string")
        .map(scope => scope.trim())
        .filter(Boolean)
    )
  ).sort();
}

function effectiveScopesForRow(row: ConnectedDevice): {
  grantedScopes: string[];
  allowedScopes: string[];
  effectiveScopes: string[];
  permissionPolicyCustomized: boolean;
} {
  const allGrantedScopes = normalizeScopes(row.scopesJson);
  const isUserMcpConnection = ["mcp_oauth", "mcp_agent_pairing"].includes(
    row.authKind,
  );
  const grantedScopes = isUserMcpConnection
    ? allGrantedScopes.filter(scope => MCP_OAUTH_ALLOWED_SCOPES.has(scope))
    : allGrantedScopes;
  const configuredPolicy = Array.isArray(row.permissionPolicyJson)
    ? normalizeScopes(row.permissionPolicyJson)
    : null;
  const granted = new Set(grantedScopes);
  const allowedScopes = configuredPolicy ?? grantedScopes;
  const effectiveScopes = allowedScopes.filter(scope => granted.has(scope));
  return {
    grantedScopes,
    allowedScopes,
    effectiveScopes,
    permissionPolicyCustomized: configuredPolicy !== null,
  };
}

function deriveStatus(row: ConnectedDevice): ConnectedDeviceRecord["status"] {
  if (row.revokedAt) return "revoked";
  if (
    row.refreshTokenExpiresAt &&
    row.refreshTokenExpiresAt.getTime() <= Date.now()
  )
    return "expired";
  if (row.lastSeenAt && row.lastSeenAt.getTime() < Date.now() - 10 * 60 * 1000)
    return "offline";
  return row.status === "offline" ? "offline" : "active";
}

function toRecord(
  row: ConnectedDevice,
  tenantName?: string | null,
  worker?: {
    status: string | null;
    runtimeVersion: string | null;
    lastSeenAt: Date | null;
  } | null
): ConnectedDeviceRecord {
  const metadata =
    row.metadataJson && typeof row.metadataJson === "object"
      ? row.metadataJson
      : {};
  const safeMetadata = (key: string): string | null => {
    const value = metadata[key];
    return typeof value === "string" && value.length <= 1024 ? value : null;
  };
  const scopePolicy = effectiveScopesForRow(row);
  return connectedDeviceRecordSchema.parse({
    deviceId: row.id,
    displayName: row.displayName,
    runtimeType: row.runtimeType,
    authKind: row.authKind,
    connectionMethod: row.connectionMethod,
    platform: row.platform ?? null,
    architecture: row.architecture ?? null,
    deviceFingerprint: row.deviceFingerprint ?? null,
    scopes: scopePolicy.grantedScopes,
    allowedScopes: scopePolicy.allowedScopes,
    permissionPolicyCustomized: scopePolicy.permissionPolicyCustomized,
    effectiveScopes: scopePolicy.effectiveScopes,
    status: deriveStatus(row),
    approvedAt: dateOrNull(row.approvedAt),
    lastSeenAt: dateOrNull(row.lastSeenAt),
    accessTokenExpiresAt: dateOrNull(row.accessTokenExpiresAt),
    refreshTokenExpiresAt: dateOrNull(row.refreshTokenExpiresAt),
    revokedAt: dateOrNull(row.revokedAt),
    revokedByUserId: row.revokedByUserId ?? null,
    revocationReason: row.revocationReason ?? null,
    workerId: row.workerId ?? null,
    workerStatus: worker?.status ?? null,
    workerRuntimeVersion: worker?.runtimeVersion ?? null,
    workerLastSeenAt: dateOrNull(worker?.lastSeenAt),
    consentId: row.consentId ?? null,
    tenantId: row.tenantId,
    tenantName: tenantName ?? null,
    clientId: safeMetadata("clientId"),
    clientName: safeMetadata("clientName"),
    clientOrigin: safeClientOrigin(safeMetadata("redirectUri")),
    redirectUri: safeMetadata("redirectUri"),
  });
}

export async function upsertConnectedDevice(
  input: ConnectedDeviceUpsertInput
): Promise<ConnectedDeviceRecord | null> {
  const db = await getDb();
  const hash = deviceIdHash(input.deviceId);
  const now = new Date();
  const requestedScopes = Array.from(
    new Set((input.scopes ?? []).map(scope => scope.trim()).filter(Boolean))
  ).sort();
  const scopes = ["mcp_oauth", "mcp_agent_pairing"].includes(input.authKind)
    ? requestedScopes.filter(scope => MCP_OAUTH_ALLOWED_SCOPES.has(scope))
    : requestedScopes;
  const values = {
    tenantId: input.tenantId,
    ownerUserId: input.ownerUserId,
    workerId: input.workerId ?? null,
    deviceIdHash: hash,
    deviceFingerprint: safeFingerprint(hash),
    workerConnectionId: input.workerConnectionId ?? null,
    consentId: input.consentId ?? null,
    displayName: input.displayName.trim().slice(0, 255) || "Connected device",
    runtimeType: input.runtimeType.trim().slice(0, 80) || "unknown",
    authKind: input.authKind.trim().slice(0, 40) || "unknown",
    connectionMethod: input.connectionMethod.trim().slice(0, 40) || "mcp",
    platform: input.platform?.trim().slice(0, 40) || null,
    architecture: input.architecture?.trim().slice(0, 40) || null,
    scopesJson: scopes,
    permissionPolicyJson: null,
    metadataJson: input.metadataJson ?? {},
    status: "active",
    approvedAt: input.approvedAt ?? now,
    lastSeenAt: now,
    accessTokenExpiresAt: input.accessTokenExpiresAt ?? null,
    refreshTokenExpiresAt: input.refreshTokenExpiresAt ?? null,
    revokedAt: null,
    revokedByUserId: null,
    revocationReason: null,
    updatedAt: now,
  } as const;

  const [row] = await db
    .insert(connectedDevices)
    .values(values)
    .onConflictDoUpdate({
      target: [
        connectedDevices.tenantId,
        connectedDevices.ownerUserId,
        connectedDevices.deviceIdHash,
        connectedDevices.authKind,
      ],
      // A token refresh/upsert must never reset a user's device permission
      // policy back to the default. `undefined` is omitted by Drizzle.
      set: { ...values, permissionPolicyJson: undefined },
    })
    .returning();
  return row ? toRecord(row) : null;
}

export async function updateConnectedDevicePermissions(input: {
  tenantId: string;
  ownerUserId: number;
  deviceId: string;
  allowedScopes: string[];
}): Promise<ConnectedDeviceRecord> {
  const db = await getDb();
  const [row] = await db
    .select()
    .from(connectedDevices)
    .where(
      and(
        eq(connectedDevices.id, input.deviceId),
        eq(connectedDevices.tenantId, input.tenantId),
        eq(connectedDevices.ownerUserId, input.ownerUserId)
      )
    )
    .limit(1);
  if (!row) throw new Error("Connected device not found");
  if (row.revokedAt) throw new Error("Connected device is revoked");

  const grantedScopes = new Set(effectiveScopesForRow(row).grantedScopes);
  const allowedScopes = normalizeScopes(input.allowedScopes);
  if (allowedScopes.some(scope => !grantedScopes.has(scope))) {
    throw new Error("Permission policy cannot grant an unapproved scope");
  }

  const [updated] = await db
    .update(connectedDevices)
    .set({
      permissionPolicyJson: allowedScopes,
      updatedAt: new Date(),
    })
    .where(eq(connectedDevices.id, row.id))
    .returning();

  auditLogger.log({
    eventType: "connected_device_permissions_updated",
    userId: input.ownerUserId,
    tenantId: input.tenantId,
    metadata: {
      deviceRecordId: row.id,
      authKind: row.authKind,
      deviceFingerprint: row.deviceFingerprint,
      grantedScopeCount: grantedScopes.size,
      allowedScopeCount: allowedScopes.length,
      deniedScopes: [...grantedScopes].filter(scope => !allowedScopes.includes(scope)),
    },
  });

  return toRecord(updated ?? { ...row, permissionPolicyJson: allowedScopes });
}

/**
 * Applies the user-controlled device policy at request time. OAuth claims
 * remain the upper bound, while a policy change takes effect without waiting
 * for an access-token refresh. Missing policy is intentionally treated as
 * allow-all for backwards compatibility with existing approved devices.
 */
export async function applyConnectedDeviceScopePolicy(input: {
  tenantId: string;
  ownerUserId: number;
  authKind: "mcp_oauth" | "mcp_agent_pairing";
  grantedScopes: string[];
  deviceIdHash?: string | null;
  grantId?: string | null;
}): Promise<string[]> {
  const grantedScopes = normalizeScopes(input.grantedScopes).filter(scope =>
    MCP_OAUTH_ALLOWED_SCOPES.has(scope),
  );
  try {
    const db = await getDb();
    const rows = await db
      .select({
        deviceIdHash: connectedDevices.deviceIdHash,
        permissionPolicyJson: connectedDevices.permissionPolicyJson,
        metadataJson: connectedDevices.metadataJson,
      })
      .from(connectedDevices)
      .where(
        and(
          eq(connectedDevices.tenantId, input.tenantId),
          eq(connectedDevices.ownerUserId, input.ownerUserId),
          eq(connectedDevices.authKind, input.authKind),
          isNull(connectedDevices.revokedAt)
        )
      );
    const row = rows.find(candidate => {
      if (input.deviceIdHash && candidate.deviceIdHash === deviceIdHash(input.deviceIdHash)) {
        return true;
      }
      if (!input.grantId) return false;
      const metadata = candidate.metadataJson;
      return Boolean(
        metadata &&
        typeof metadata === "object" &&
        (metadata as Record<string, unknown>).grantId === input.grantId
      );
    });
    if (!row || !Array.isArray(row.permissionPolicyJson)) return grantedScopes;
    const allowed = new Set(normalizeScopes(row.permissionPolicyJson));
    return grantedScopes.filter(scope => allowed.has(scope));
  } catch (error) {
    // Production must fail closed: a configured DB error must not silently
    // bypass a user-maintained permission restriction.
    if (process.env.DATABASE_URL) throw error;
    return grantedScopes;
  }
}

export async function updateConnectedDeviceTokenMetadata(input: {
  tenantId: string;
  ownerUserId?: number;
  deviceId?: string | null;
  workerId?: string | null;
  workerConnectionId?: string | null;
  authKind?: string;
  accessTokenExpiresAt?: Date | null;
  refreshTokenExpiresAt?: Date | null;
}): Promise<boolean> {
  const db = await getDb();
  const predicates = [eq(connectedDevices.tenantId, input.tenantId)];
  if (input.ownerUserId != null)
    predicates.push(eq(connectedDevices.ownerUserId, input.ownerUserId));
  if (input.deviceId)
    predicates.push(
      eq(connectedDevices.deviceIdHash, deviceIdHash(input.deviceId))
    );
  if (input.workerId)
    predicates.push(eq(connectedDevices.workerId, input.workerId));
  if (input.workerConnectionId) {
    // The approval record is created before the redemption endpoint mints
    // the worker connection id. Match that same device while allowing the
    // initial NULL to be populated; subsequent refreshes still match the
    // exact connection id.
    const connectionPredicate = or(
      eq(connectedDevices.workerConnectionId, input.workerConnectionId),
      isNull(connectedDevices.workerConnectionId),
    );
    if (connectionPredicate) predicates.push(connectionPredicate);
  }
  if (input.authKind)
    predicates.push(eq(connectedDevices.authKind, input.authKind));
  if (!input.deviceId && !input.workerId && !input.workerConnectionId) return false;
  const updatedRows = await db
    .update(connectedDevices)
    .set({
      ...(input.workerConnectionId
        ? { workerConnectionId: input.workerConnectionId }
        : {}),
      ...(input.accessTokenExpiresAt !== undefined
        ? { accessTokenExpiresAt: input.accessTokenExpiresAt }
        : {}),
      ...(input.refreshTokenExpiresAt !== undefined
        ? { refreshTokenExpiresAt: input.refreshTokenExpiresAt }
        : {}),
      lastSeenAt: new Date(),
      status: "active",
      updatedAt: new Date(),
    })
    .where(and(...predicates))
    .returning({ id: connectedDevices.id });
  return updatedRows.length > 0;
}

export async function listConnectedDevicesForUser(input: {
  tenantId: string;
  ownerUserId: number;
}): Promise<ConnectedDeviceRecord[]> {
  const db = await getDb();
  const rows = await db
    .select({
      device: connectedDevices,
      tenantName: tenants.name,
      worker: {
        status: workers.status,
        runtimeVersion: workers.runtimeVersion,
        lastSeenAt: workers.lastSeenAt,
      },
    })
    .from(connectedDevices)
    .leftJoin(tenants, eq(connectedDevices.tenantId, tenants.id))
    .leftJoin(
      workers,
      and(
        eq(connectedDevices.workerId, workers.id),
        eq(connectedDevices.tenantId, workers.tenantId)
      )
    )
    .where(
      and(
        eq(connectedDevices.tenantId, input.tenantId),
        eq(connectedDevices.ownerUserId, input.ownerUserId)
      )
    )
    .orderBy(
      desc(connectedDevices.updatedAt),
      desc(connectedDevices.createdAt)
    );
  return rows.map(({ device, tenantName, worker }) =>
    toRecord(device, tenantName, worker)
  );
}

export async function isConnectedDeviceRevoked(input: {
  tenantId: string;
  deviceId?: string | null;
  workerConnectionId?: string | null;
  authKind?: string;
}): Promise<boolean> {
  const identifiers = [];
  if (input.deviceId)
    identifiers.push(
      eq(connectedDevices.deviceIdHash, deviceIdHash(input.deviceId))
    );
  if (input.workerConnectionId)
    identifiers.push(
      eq(connectedDevices.workerConnectionId, input.workerConnectionId)
    );
  if (!identifiers.length) return false;

  try {
    const db = await getDb();
    const predicates = [
      eq(connectedDevices.tenantId, input.tenantId),
      or(...identifiers),
    ];
    if (input.authKind)
      predicates.push(eq(connectedDevices.authKind, input.authKind));
    const rows = await db
      .select({
        revokedAt: connectedDevices.revokedAt,
        status: connectedDevices.status,
      })
      .from(connectedDevices)
      .where(and(...predicates));
    return rows.some(row => Boolean(row.revokedAt) || row.status === "revoked");
  } catch (error) {
    // Unit tests and local single-process development may not have a database.
    // A configured production database must fail closed instead of bypassing
    // the durable revocation check.
    if (!process.env.DATABASE_URL) return false;
    throw error;
  }
}

/**
 * Returns the effective permission policy for a connected native worker.
 *
 * The access-token scopes are the immutable upper bound issued at approval
 * time. The connected-device policy is the user-controlled subset and is
 * checked at request time so a reduction takes effect without waiting for a
 * worker token refresh. A missing row is returned as null for compatibility
 * with older workers that were registered before device records existed.
 */
export async function getConnectedWorkerEffectiveScopes(input: {
  tenantId: string;
  workerConnectionId?: string | null;
}): Promise<string[] | null> {
  const workerConnectionId = input.workerConnectionId?.trim();
  if (!workerConnectionId) return null;

  try {
    const db = await getDb();
    const [row] = await db
      .select()
      .from(connectedDevices)
      .where(
        and(
          eq(connectedDevices.tenantId, input.tenantId),
          eq(connectedDevices.workerConnectionId, workerConnectionId),
          eq(connectedDevices.authKind, "worker_executor"),
        ),
      )
      .orderBy(desc(connectedDevices.updatedAt), desc(connectedDevices.createdAt))
      .limit(1);
    if (!row) return null;
    return effectiveScopesForRow(row).effectiveScopes;
  } catch (error) {
    // A configured production database must fail closed. Local unit tests and
    // legacy single-process development may intentionally run without DB.
    if (process.env.DATABASE_URL) throw error;
    return null;
  }
}

export async function revokeConnectedDevice(input: {
  tenantId: string;
  ownerUserId: number;
  deviceId: string;
  reason?: string;
}): Promise<ConnectedDeviceRecord> {
  const db = await getDb();
  const [row] = await db
    .select()
    .from(connectedDevices)
    .where(
      and(
        eq(connectedDevices.id, input.deviceId),
        eq(connectedDevices.tenantId, input.tenantId),
        eq(connectedDevices.ownerUserId, input.ownerUserId)
      )
    )
    .limit(1);
  if (!row) throw new Error("Connected device not found");

  const revokedAt = row.revokedAt ?? new Date();
  const reason = input.reason?.trim().slice(0, 255) || "user_revoked";
  if (!row.revokedAt) {
    const siblingRows = await db
      .select()
      .from(connectedDevices)
      .where(
        and(
          eq(connectedDevices.tenantId, input.tenantId),
          eq(connectedDevices.ownerUserId, input.ownerUserId),
          eq(connectedDevices.deviceIdHash, row.deviceIdHash)
        )
      );
    await db
      .update(connectedDevices)
      .set({
        status: "revoked",
        revokedAt,
        revokedByUserId: input.ownerUserId,
        revocationReason: reason,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(connectedDevices.tenantId, input.tenantId),
          eq(connectedDevices.ownerUserId, input.ownerUserId),
          eq(connectedDevices.deviceIdHash, row.deviceIdHash)
        )
      );

    if (siblingRows.some(sibling => sibling.authKind === "mcp_agent_pairing")) {
      const { hermesAgentDeviceRevocationKey } =
        await import("./hermesAgentPairingService");
      for (const sibling of siblingRows) {
        if (sibling.authKind !== "mcp_agent_pairing") continue;
        await revokeJti(
          hermesAgentDeviceRevocationKey({
            tenantId: input.tenantId,
            userId: input.ownerUserId,
            deviceIdHash: row.deviceIdHash,
            consentId: sibling.consentId,
          }),
          Date.now() + 30 * 24 * 60 * 60 * 1000
        );
      }
    }
    const oauthGrants = siblingRows
      .filter(sibling => sibling.authKind === "mcp_oauth")
      .map(sibling => sibling.metadataJson?.grantId)
      .filter(
        (grantId): grantId is string =>
          typeof grantId === "string" && grantId.length > 0
      );
    if (oauthGrants.length) {
      const { revokeMcpOAuthGrant } =
        await import("./mcpOAuthAuthorizationService");
      for (const grantId of oauthGrants) {
        await revokeMcpOAuthGrant({
          grantId,
          userId: input.ownerUserId,
          tenantId: input.tenantId,
          reason,
        });
      }
    }
    for (const sibling of siblingRows) {
      if (sibling.workerConnectionId) {
        await revokeJti(
          `worker_connection:${sibling.workerConnectionId}`,
          Date.now() + WORKER_CONNECTION_REVOKE_TTL_MS
        );
      }
    }
    const workerIds = siblingRows
      .map(sibling => sibling.workerId)
      .filter((id): id is string => Boolean(id));
    for (const workerId of workerIds) {
      await db
        .update(workers)
        .set({ status: "disabled", updatedAt: new Date() })
        .where(
          and(
            eq(workers.id, workerId),
            eq(workers.tenantId, input.tenantId),
            eq(workers.registeredByUserId, input.ownerUserId)
          )
        );
    }
    auditLogger.log({
      eventType: "connected_device_revoked",
      userId: input.ownerUserId,
      tenantId: input.tenantId,
      metadata: {
        deviceRecordId: row.id,
        authKind: row.authKind,
        runtimeType: row.runtimeType,
        deviceFingerprint: row.deviceFingerprint,
        workerId: row.workerId,
        revokedRecordCount: siblingRows.length,
        reason,
      },
    });
  }

  const [updated] = await db
    .select()
    .from(connectedDevices)
    .where(eq(connectedDevices.id, row.id))
    .limit(1);
  return toRecord(
    updated ?? {
      ...row,
      status: "revoked",
      revokedAt,
      revokedByUserId: input.ownerUserId,
      revocationReason: reason,
    }
  );
}

export async function revokeAllMcpConnectionsForUser(input: {
  tenantId: string;
  ownerUserId: number;
  reason?: string;
}): Promise<{ revokedDeviceCount: number; revokedRecordCount: number }> {
  const db = await getDb();
  const rows = await db
    .select({
      id: connectedDevices.id,
      deviceIdHash: connectedDevices.deviceIdHash,
    })
    .from(connectedDevices)
    .where(
      and(
        eq(connectedDevices.tenantId, input.tenantId),
        eq(connectedDevices.ownerUserId, input.ownerUserId),
        inArray(connectedDevices.authKind, ["mcp_oauth", "mcp_agent_pairing"]),
        isNull(connectedDevices.revokedAt)
      )
    );

  const uniqueHashes = new Set<string>();
  let revokedDeviceCount = 0;
  for (const row of rows) {
    if (uniqueHashes.has(row.deviceIdHash)) continue;
    uniqueHashes.add(row.deviceIdHash);
    await revokeConnectedDevice({
      tenantId: input.tenantId,
      ownerUserId: input.ownerUserId,
      deviceId: row.id,
      reason: input.reason ?? "user_revoked_all_mcp_connections",
    });
    revokedDeviceCount += 1;
  }

  return { revokedDeviceCount, revokedRecordCount: rows.length };
}

export async function revokeConnectedDeviceForBinding(input: {
  tenantId: string;
  ownerUserId: number;
  deviceIdHash: string;
  reason?: string;
}): Promise<ConnectedDeviceRecord | null> {
  const db = await getDb();
  const [row] = await db
    .select({ id: connectedDevices.id })
    .from(connectedDevices)
    .where(
      and(
        eq(connectedDevices.tenantId, input.tenantId),
        eq(connectedDevices.ownerUserId, input.ownerUserId),
        eq(connectedDevices.deviceIdHash, deviceIdHash(input.deviceIdHash)),
        eq(connectedDevices.authKind, "mcp_agent_pairing")
      )
    )
    .limit(1);
  if (!row) return null;
  return revokeConnectedDevice({
    tenantId: input.tenantId,
    ownerUserId: input.ownerUserId,
    deviceId: row.id,
    reason: input.reason ?? "mcp_disconnect",
  });
}
