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
  tenantName?: string | null
): ConnectedDeviceRecord {
  const metadata =
    row.metadataJson && typeof row.metadataJson === "object"
      ? row.metadataJson
      : {};
  const safeMetadata = (key: string): string | null => {
    const value = metadata[key];
    return typeof value === "string" && value.length <= 1024 ? value : null;
  };
  return connectedDeviceRecordSchema.parse({
    deviceId: row.id,
    displayName: row.displayName,
    runtimeType: row.runtimeType,
    authKind: row.authKind,
    connectionMethod: row.connectionMethod,
    platform: row.platform ?? null,
    architecture: row.architecture ?? null,
    deviceFingerprint: row.deviceFingerprint ?? null,
    scopes: Array.isArray(row.scopesJson) ? row.scopesJson : [],
    status: deriveStatus(row),
    approvedAt: dateOrNull(row.approvedAt),
    lastSeenAt: dateOrNull(row.lastSeenAt),
    accessTokenExpiresAt: dateOrNull(row.accessTokenExpiresAt),
    refreshTokenExpiresAt: dateOrNull(row.refreshTokenExpiresAt),
    revokedAt: dateOrNull(row.revokedAt),
    revokedByUserId: row.revokedByUserId ?? null,
    revocationReason: row.revocationReason ?? null,
    workerId: row.workerId ?? null,
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
  const scopes = Array.from(
    new Set((input.scopes ?? []).map(scope => scope.trim()).filter(Boolean))
  ).sort();
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
      set: values,
    })
    .returning();
  return row ? toRecord(row) : null;
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
}): Promise<void> {
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
  if (input.workerConnectionId)
    predicates.push(
      eq(connectedDevices.workerConnectionId, input.workerConnectionId)
    );
  if (input.authKind)
    predicates.push(eq(connectedDevices.authKind, input.authKind));
  if (!input.deviceId && !input.workerId && !input.workerConnectionId) return;
  await db
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
    .where(and(...predicates));
}

export async function listConnectedDevicesForUser(input: {
  tenantId: string;
  ownerUserId: number;
}): Promise<ConnectedDeviceRecord[]> {
  const db = await getDb();
  const rows = await db
    .select({ device: connectedDevices, tenantName: tenants.name })
    .from(connectedDevices)
    .leftJoin(tenants, eq(connectedDevices.tenantId, tenants.id))
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
  return rows.map(({ device, tenantName }) => toRecord(device, tenantName));
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
