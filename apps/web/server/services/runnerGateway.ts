import { and, eq } from "drizzle-orm";

import { getDb } from "../db";
import { runnerCapabilitySnapshots, runnerNodes } from "../../drizzle/schema";
import {
  RUNNER_CONTRACT_VERSION,
  type RunnerCapabilitySnapshot,
  type RunnerIdentity,
  type RunnerNodeKind,
  type RunnerProfile,
  validateRunnerCapabilitySnapshot,
  validateRunnerIdentity,
} from "./runnerContracts";
import type { RunnerAuthContext } from "./runnerAuthService";

type RunnerGatewayAuth = Pick<
  RunnerAuthContext,
  | "runnerId"
  | "tenantId"
  | "profile"
  | "nodeKind"
  | "deviceId"
  | "ownerUserId"
  | "runnerSessionId"
>;

export type RunnerGatewayNode = {
  runnerId: string;
  tenantId: string;
  ownerUserId: number | null;
  nodeKind: RunnerNodeKind;
  profile: RunnerProfile;
  deviceId: string | null;
  displayName: string;
  trustState: "pending" | "trusted" | "revoked" | "quarantined";
  status: "offline" | "online" | "degraded" | "revoked";
  currentSnapshotRevision: string | null;
  currentSnapshot: RunnerCapabilitySnapshot | null;
  lastSeenAt: string | null;
  revokedAt: string | null;
  activeSessionId: string | null;
};

export type CapabilityPublicationResult = {
  status: "accepted" | "duplicate";
  runnerId: string;
  acceptedRevision: string;
  expiresAt: string;
  staleEntriesMarkedUnavailable: number;
};

export interface RunnerRepository {
  getNode(
    runnerId: string,
    tenantId: string
  ): Promise<RunnerGatewayNode | null>;
  saveNode(node: RunnerGatewayNode): Promise<void>;
  getSnapshotByIdempotency(
    runnerId: string,
    idempotencyKey: string
  ): Promise<RunnerCapabilitySnapshot | null>;
  saveSnapshot(
    snapshot: RunnerCapabilitySnapshot,
    tenantId: string,
    idempotencyKey: string
  ): Promise<void>;
  commitSnapshot?(
    node: RunnerGatewayNode,
    snapshot: RunnerCapabilitySnapshot,
    idempotencyKey: string
  ): Promise<void>;
}

export class RunnerGatewayError extends Error {
  constructor(
    public readonly code: string,
    message: string
  ) {
    super(message);
    this.name = "RunnerGatewayError";
  }
}

export class InMemoryRunnerRepository implements RunnerRepository {
  readonly nodes = new Map<string, RunnerGatewayNode>();
  readonly snapshots = new Map<
    string,
    { snapshot: RunnerCapabilitySnapshot; idempotencyKey: string }
  >();

  async getNode(
    runnerId: string,
    tenantId: string
  ): Promise<RunnerGatewayNode | null> {
    const node = this.nodes.get(runnerId);
    return node?.tenantId === tenantId ? structuredClone(node) : null;
  }

  async saveNode(node: RunnerGatewayNode): Promise<void> {
    this.nodes.set(node.runnerId, structuredClone(node));
  }

  async getSnapshotByIdempotency(
    runnerId: string,
    idempotencyKey: string
  ): Promise<RunnerCapabilitySnapshot | null> {
    const entry = this.snapshots.get(`${runnerId}:${idempotencyKey}`);
    return entry ? structuredClone(entry.snapshot) : null;
  }

  async saveSnapshot(
    snapshot: RunnerCapabilitySnapshot,
    tenantId: string,
    idempotencyKey: string
  ): Promise<void> {
    this.snapshots.set(`${snapshot.runnerId}:${idempotencyKey}`, {
      snapshot: structuredClone(snapshot),
      idempotencyKey,
    });
  }
}

/** Database adapter. The in-memory adapter remains the deterministic test seam. */
export class DrizzleRunnerRepository implements RunnerRepository {
  async getNode(
    runnerId: string,
    tenantId: string
  ): Promise<RunnerGatewayNode | null> {
    const db = getDb();
    const [row] = await db
      .select()
      .from(runnerNodes)
      .where(
        and(
          eq(runnerNodes.runnerId, runnerId),
          eq(runnerNodes.tenantId, tenantId)
        )
      )
      .limit(1);
    if (!row) return null;
    return {
      runnerId: row.runnerId,
      tenantId: row.tenantId,
      ownerUserId: row.ownerUserId,
      nodeKind: row.nodeKind as RunnerNodeKind,
      profile: row.profile as RunnerProfile,
      deviceId: row.deviceId,
      displayName: row.displayName,
      trustState: row.trustState as RunnerGatewayNode["trustState"],
      status: row.status as RunnerGatewayNode["status"],
      currentSnapshotRevision: row.currentSnapshotRevision,
      currentSnapshot:
        row.currentSnapshotJson as RunnerCapabilitySnapshot | null,
      lastSeenAt: row.lastSeenAt?.toISOString() ?? null,
      revokedAt: row.revokedAt?.toISOString() ?? null,
      activeSessionId: row.activeSessionId ?? null,
    };
  }

  async saveNode(node: RunnerGatewayNode): Promise<void> {
    const db = getDb();
    await db
      .insert(runnerNodes)
      .values({
        runnerId: node.runnerId,
        tenantId: node.tenantId,
        ownerUserId: node.ownerUserId,
        nodeKind: node.nodeKind,
        profile: node.profile,
        deviceId: node.deviceId,
        displayName: node.displayName,
        trustState: node.trustState,
        status: node.status,
        currentSnapshotRevision: node.currentSnapshotRevision,
        currentSnapshotJson: node.currentSnapshot as Record<
          string,
          unknown
        > | null,
        snapshotObservedAt: node.currentSnapshot
          ? new Date(node.currentSnapshot.observedAt)
          : null,
        snapshotExpiresAt: node.currentSnapshot
          ? new Date(node.currentSnapshot.expiresAt)
          : null,
        lastSeenAt: node.lastSeenAt ? new Date(node.lastSeenAt) : null,
        revokedAt: node.revokedAt ? new Date(node.revokedAt) : null,
        activeSessionId: node.activeSessionId,
        updatedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: runnerNodes.runnerId,
        set: {
          ownerUserId: node.ownerUserId,
          displayName: node.displayName,
          trustState: node.trustState,
          status: node.status,
          currentSnapshotRevision: node.currentSnapshotRevision,
          currentSnapshotJson: node.currentSnapshot as Record<
            string,
            unknown
          > | null,
          snapshotObservedAt: node.currentSnapshot
            ? new Date(node.currentSnapshot.observedAt)
            : null,
          snapshotExpiresAt: node.currentSnapshot
            ? new Date(node.currentSnapshot.expiresAt)
            : null,
          lastSeenAt: node.lastSeenAt ? new Date(node.lastSeenAt) : null,
          revokedAt: node.revokedAt ? new Date(node.revokedAt) : null,
          activeSessionId: node.activeSessionId,
          updatedAt: new Date(),
        },
      });
  }

  async getSnapshotByIdempotency(
    runnerId: string,
    idempotencyKey: string
  ): Promise<RunnerCapabilitySnapshot | null> {
    const db = getDb();
    const [row] = await db
      .select({ snapshot: runnerCapabilitySnapshots.snapshotJson })
      .from(runnerCapabilitySnapshots)
      .where(
        and(
          eq(runnerCapabilitySnapshots.runnerId, runnerId),
          eq(runnerCapabilitySnapshots.idempotencyKey, idempotencyKey)
        )
      )
      .limit(1);
    return (row?.snapshot as RunnerCapabilitySnapshot | undefined) ?? null;
  }

  async saveSnapshot(
    snapshot: RunnerCapabilitySnapshot,
    tenantId: string,
    idempotencyKey: string
  ): Promise<void> {
    const db = getDb();
    await db
      .insert(runnerCapabilitySnapshots)
      .values({
        runnerId: snapshot.runnerId,
        tenantId,
        revision: snapshot.revision,
        idempotencyKey,
        observedAt: new Date(snapshot.observedAt),
        expiresAt: new Date(snapshot.expiresAt),
        snapshotJson: snapshot as unknown as Record<string, unknown>,
      })
      .onConflictDoNothing();
  }

  async commitSnapshot(
    node: RunnerGatewayNode,
    snapshot: RunnerCapabilitySnapshot,
    idempotencyKey: string
  ): Promise<void> {
    const db = getDb();
    await db.transaction(async tx => {
      const [current] = await tx
        .select({
          currentSnapshotRevision: runnerNodes.currentSnapshotRevision,
        })
        .from(runnerNodes)
        .where(
          and(
            eq(runnerNodes.runnerId, node.runnerId),
            eq(runnerNodes.tenantId, node.tenantId)
          )
        )
        .for("update")
        .limit(1);
      if (!current) {
        throw new RunnerGatewayError(
          "RUNNER_NOT_ENROLLED",
          "Runner is not enrolled"
        );
      }
      if (
        current.currentSnapshotRevision &&
        compareRevisions(snapshot.revision, current.currentSnapshotRevision) < 0
      ) {
        throw new RunnerGatewayError(
          "RUNNER_SNAPSHOT_OLD",
          "Capability snapshot revision is older than the current revision"
        );
      }
      await tx
        .insert(runnerCapabilitySnapshots)
        .values({
          runnerId: snapshot.runnerId,
          tenantId: node.tenantId,
          revision: snapshot.revision,
          idempotencyKey,
          observedAt: new Date(snapshot.observedAt),
          expiresAt: new Date(snapshot.expiresAt),
          snapshotJson: snapshot as unknown as Record<string, unknown>,
        })
        .onConflictDoNothing();
      await tx
        .update(runnerNodes)
        .set({
          currentSnapshotRevision: node.currentSnapshotRevision,
          currentSnapshotJson: node.currentSnapshot as Record<
            string,
            unknown
          > | null,
          snapshotObservedAt: new Date(snapshot.observedAt),
          snapshotExpiresAt: new Date(snapshot.expiresAt),
          status: node.status,
          lastSeenAt: node.lastSeenAt ? new Date(node.lastSeenAt) : null,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(runnerNodes.runnerId, node.runnerId),
            eq(runnerNodes.tenantId, node.tenantId)
          )
        );
    });
  }
}

function compareRevisions(left: string, right: string): number {
  if (/^\d+$/.test(left) && /^\d+$/.test(right)) {
    const a = BigInt(left);
    const b = BigInt(right);
    return a === b ? 0 : a > b ? 1 : -1;
  }
  return left === right ? 0 : left > right ? 1 : -1;
}

export class RunnerGateway {
  constructor(private readonly repository: RunnerRepository) {}

  async getNode(runnerId: string, tenantId: string): Promise<RunnerGatewayNode | null> {
    return this.repository.getNode(runnerId, tenantId);
  }

  async enroll(input: {
    auth: RunnerGatewayAuth;
    deviceId: string | null;
    displayName: string;
    ownerUserId?: number | null;
  }): Promise<RunnerGatewayNode> {
    const existing = await this.repository.getNode(
      input.auth.runnerId,
      input.auth.tenantId
    );
    const requestedOwnerUserId =
      input.ownerUserId ?? input.auth.ownerUserId ?? null;
    if (existing && existing.revokedAt)
      throw new RunnerGatewayError("RUNNER_REVOKED", "Runner is revoked");
    if (
      existing &&
      existing.ownerUserId !== null &&
      requestedOwnerUserId !== null &&
      existing.ownerUserId !== requestedOwnerUserId
    )
      throw new RunnerGatewayError(
        "RUNNER_PERMISSION_DENIED",
        "Runner is owned by another user"
      );
    if (
      input.auth.profile === "local_device" &&
      (!input.deviceId ||
        !input.auth.deviceId ||
        input.auth.deviceId !== input.deviceId)
    )
      throw new RunnerGatewayError(
        "RUNNER_DEVICE_REQUIRED",
        "Local Runner requires a matching device binding"
      );
    if (input.auth.profile === "shared_container" && input.deviceId)
      throw new RunnerGatewayError(
        "RUNNER_PROFILE_MISMATCH",
        "Shared Container cannot enroll as a device"
      );
    const now = new Date().toISOString();
    const node: RunnerGatewayNode = existing ?? {
      runnerId: input.auth.runnerId,
      tenantId: input.auth.tenantId,
      ownerUserId: requestedOwnerUserId,
      nodeKind: input.auth.nodeKind,
      profile: input.auth.profile,
      deviceId: input.deviceId,
      displayName: input.displayName.trim().slice(0, 255),
      trustState: "trusted",
      status: "online",
      currentSnapshotRevision: null,
      currentSnapshot: null,
      lastSeenAt: now,
      revokedAt: null,
      activeSessionId: null,
    };
    node.status = "online";
    node.lastSeenAt = now;
    await this.repository.saveNode(node);
    return node;
  }

  async publishCapabilities(input: {
    auth: RunnerGatewayAuth;
    snapshot: RunnerCapabilitySnapshot;
    idempotencyKey: string;
  }): Promise<CapabilityPublicationResult> {
    const node = await this.repository.getNode(
      input.auth.runnerId,
      input.auth.tenantId
    );
    if (!node)
      throw new RunnerGatewayError(
        "RUNNER_NOT_ENROLLED",
        "Runner is not enrolled"
      );
    this.assertSessionBinding(node, input.auth);
    if (node.revokedAt || node.trustState === "revoked")
      throw new RunnerGatewayError("RUNNER_REVOKED", "Runner is revoked");
    const snapshot = validateRunnerCapabilitySnapshot(input.snapshot);
    if (snapshot.runnerId !== input.auth.runnerId)
      throw new RunnerGatewayError(
        "RUNNER_SCOPE_MISMATCH",
        "Snapshot runner does not match token"
      );
    if (
      input.idempotencyKey.trim().length === 0 ||
      input.idempotencyKey.length > 200
    )
      throw new RunnerGatewayError(
        "RUNNER_IDEMPOTENCY_INVALID",
        "Idempotency key is invalid"
      );
    const duplicate = await this.repository.getSnapshotByIdempotency(
      input.auth.runnerId,
      input.idempotencyKey
    );
    if (duplicate)
      return {
        status: "duplicate",
        runnerId: snapshot.runnerId,
        acceptedRevision: duplicate.revision,
        expiresAt: duplicate.expiresAt,
        staleEntriesMarkedUnavailable: 0,
      };
    if (
      node.currentSnapshotRevision &&
      compareRevisions(snapshot.revision, node.currentSnapshotRevision) < 0
    )
      throw new RunnerGatewayError(
        "RUNNER_SNAPSHOT_OLD",
        "Capability snapshot revision is older than the current revision"
      );
    const previous = node.currentSnapshot;
    const previousToolIds = new Set(
      (previous?.toolInventory ?? []).map(tool => tool.toolId)
    );
    const nextToolIds = new Set(
      (snapshot.toolInventory ?? []).map(tool => tool.toolId)
    );
    const staleEntriesMarkedUnavailable = [...previousToolIds].filter(
      toolId => !nextToolIds.has(toolId)
    ).length;
    node.currentSnapshotRevision = snapshot.revision;
    node.currentSnapshot = snapshot;
    node.status = "online";
    node.lastSeenAt = new Date().toISOString();
    if (this.repository.commitSnapshot) {
      await this.repository.commitSnapshot(
        node,
        snapshot,
        input.idempotencyKey
      );
    } else {
      await this.repository.saveSnapshot(
        snapshot,
        input.auth.tenantId,
        input.idempotencyKey
      );
      await this.repository.saveNode(node);
    }
    return {
      status: "accepted",
      runnerId: snapshot.runnerId,
      acceptedRevision: snapshot.revision,
      expiresAt: snapshot.expiresAt,
      staleEntriesMarkedUnavailable,
    };
  }

  async heartbeat(auth: RunnerGatewayAuth): Promise<RunnerGatewayNode> {
    const node = await this.repository.getNode(auth.runnerId, auth.tenantId);
    if (!node)
      throw new RunnerGatewayError(
        "RUNNER_NOT_ENROLLED",
        "Runner is not enrolled"
      );
    this.assertSessionBinding(node, auth);
    if (node.revokedAt || node.trustState === "revoked")
      throw new RunnerGatewayError("RUNNER_REVOKED", "Runner is revoked");
    node.status =
      node.currentSnapshot &&
      Date.parse(node.currentSnapshot.expiresAt) > Date.now()
        ? "online"
        : "degraded";
    node.lastSeenAt = new Date().toISOString();
    await this.repository.saveNode(node);
    return node;
  }

  async getStatus(auth: RunnerGatewayAuth): Promise<RunnerGatewayNode> {
    const node = await this.repository.getNode(auth.runnerId, auth.tenantId);
    if (!node)
      throw new RunnerGatewayError(
        "RUNNER_NOT_ENROLLED",
        "Runner is not enrolled"
      );
    this.assertSessionBinding(node, auth);
    return node;
  }

  async bindSession(input: {
    runnerId: string;
    tenantId: string;
    ownerUserId: number;
    runnerSessionId: string;
  }): Promise<RunnerGatewayNode> {
    const node = await this.repository.getNode(input.runnerId, input.tenantId);
    if (!node)
      throw new RunnerGatewayError("RUNNER_NOT_ENROLLED", "Runner is not enrolled");
    if (node.ownerUserId !== input.ownerUserId)
      throw new RunnerGatewayError("RUNNER_PERMISSION_DENIED", "Runner is not owned by the authenticated user");
    if (!input.runnerSessionId.trim())
      throw new RunnerGatewayError("RUNNER_SESSION_INVALID", "Runner session is required");
    if (node.revokedAt || node.trustState === "revoked")
      throw new RunnerGatewayError("RUNNER_REVOKED", "Runner is revoked");
    node.activeSessionId = input.runnerSessionId;
    node.status = "online";
    node.lastSeenAt = new Date().toISOString();
    await this.repository.saveNode(node);
    return node;
  }

  private assertSessionBinding(node: RunnerGatewayNode, auth: RunnerGatewayAuth): void {
    if (
      auth.profile === "local_device" &&
      auth.runnerSessionId !== null &&
      node.activeSessionId !== auth.runnerSessionId
    )
      throw new RunnerGatewayError(
        "RUNNER_SESSION_STALE",
        "Runner session is stale or disconnected",
      );
  }

  async revoke(input: {
    runnerId: string;
    tenantId: string;
    ownerUserId: number;
  }): Promise<RunnerGatewayNode> {
    const node = await this.repository.getNode(input.runnerId, input.tenantId);
    if (!node)
      throw new RunnerGatewayError(
        "RUNNER_NOT_FOUND",
        "Runner is not enrolled"
      );
    if (node.ownerUserId !== input.ownerUserId)
      throw new RunnerGatewayError(
        "RUNNER_PERMISSION_DENIED",
        "Runner is not owned by the authenticated user"
      );
    const revoked = new Date().toISOString();
    node.revokedAt = revoked;
    node.activeSessionId = null;
    node.trustState = "revoked";
    node.status = "revoked";
    await this.repository.saveNode(node);
    return node;
  }
}

export const defaultRunnerGateway = new RunnerGateway(
  new DrizzleRunnerRepository()
);

export function runnerIdentityFromNode(
  node: RunnerGatewayNode
): RunnerIdentity {
  return validateRunnerIdentity({
    runnerId: node.runnerId,
    tenantId: node.tenantId,
    deviceId: node.deviceId ?? node.runnerId,
    runtime: node.profile === "shared_container" ? "container" : "desktop",
    trustState: node.trustState,
    registeredAt: node.lastSeenAt ?? new Date().toISOString(),
  });
}

export function runnerContractVersion(): string {
  return RUNNER_CONTRACT_VERSION;
}
