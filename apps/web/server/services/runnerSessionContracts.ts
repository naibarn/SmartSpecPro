import { randomBytes, randomUUID } from "node:crypto";

export type RunnerSessionState =
  | "connected"
  | "paired"
  | "authorized"
  | "capability_ready"
  | "revoked"
  | "expired";

export type RunnerSessionRecord = {
  runnerSessionId: string;
  runnerId: string;
  tenantId: string;
  deviceId: string;
  ownerUserId: number | null;
  nonce: string;
  state: RunnerSessionState;
  createdAt: string;
  expiresAt: string;
  approvedAt?: string;
  authorizedAt?: string;
  capabilitySnapshotId?: string;
  snapshotRevision?: string;
};

export type RunnerSessionAuditEvent = {
  type:
    | "runner_pairing_started"
    | "runner_pairing_approved"
    | "runner_authorized"
    | "runner_capability_ready"
    | "runner_session_revoked"
    | "runner_session_expired";
  runnerId: string;
  tenantId: string;
  runnerSessionId: string;
  at: string;
  reason?: string;
};

export class RunnerSessionError extends Error {
  constructor(
    public readonly code:
      | "CHALLENGE_INVALID"
      | "OWNER_MISMATCH"
      | "DEVICE_PROOF_REQUIRED"
      | "CAPABILITY_NOT_READY"
      | "SESSION_REVOKED"
      | "SESSION_EXPIRED"
      | "SESSION_STATE_INVALID"
      | "CAPABILITY_BINDING_INVALID",
    message = code,
  ) {
    super(message);
    this.name = "RunnerSessionError";
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

type Clock = { now: () => Date };

function assertText(value: string, code: RunnerSessionError["code"]): string {
  if (!value.trim()) throw new RunnerSessionError(code);
  return value.trim();
}

export class RunnerSessionController {
  private readonly sessions = new Map<string, RunnerSessionRecord>();
  private readonly activeByRunner = new Map<string, string>();
  private readonly events: RunnerSessionAuditEvent[] = [];

  constructor(private readonly clock: Clock = { now: () => new Date() }) {}

  start(input: {
    runnerId: string;
    tenantId: string;
    deviceId: string;
    ownerUserId?: number | null;
    ttlMs: number;
  }): RunnerSessionRecord {
    const runnerId = assertText(input.runnerId, "CHALLENGE_INVALID");
    const tenantId = assertText(input.tenantId, "CHALLENGE_INVALID");
    const deviceId = assertText(input.deviceId, "CHALLENGE_INVALID");
    if (
      input.ownerUserId !== undefined &&
      input.ownerUserId !== null &&
      (!Number.isInteger(input.ownerUserId) || input.ownerUserId <= 0)
    )
      throw new RunnerSessionError("OWNER_MISMATCH");
    if (!Number.isFinite(input.ttlMs) || input.ttlMs <= 0)
      throw new RunnerSessionError("CHALLENGE_INVALID");

    const existingId = [...this.sessions.values()].find(
      session =>
        session.runnerId === runnerId &&
        session.state !== "revoked" &&
        session.state !== "expired",
    )?.runnerSessionId;
    if (existingId) this.revoke(existingId, "runner_repaired");
    const createdAt = this.clock.now();
    const record: RunnerSessionRecord = {
      runnerSessionId: randomUUID(),
      runnerId,
      tenantId,
      deviceId,
      ownerUserId: input.ownerUserId ?? null,
      nonce: randomBytes(24).toString("base64url"),
      state: "connected",
      createdAt: createdAt.toISOString(),
      expiresAt: new Date(createdAt.getTime() + input.ttlMs).toISOString(),
    };
    this.sessions.set(record.runnerSessionId, record);
    this.activeByRunner.set(`${tenantId}:${runnerId}`, record.runnerSessionId);
    this.emit("runner_pairing_started", record);
    return structuredClone(record);
  }

  repair(input: Parameters<RunnerSessionController["start"]>[0]): RunnerSessionRecord {
    return this.start(input);
  }

  approve(input: {
    runnerSessionId: string;
    nonce: string;
    ownerUserId: number;
    tenantId?: string;
  }): RunnerSessionRecord {
    const record = this.getActive(input.runnerSessionId);
    if (record.ownerUserId !== null && record.ownerUserId !== input.ownerUserId)
      throw new RunnerSessionError("OWNER_MISMATCH");
    if (record.nonce !== input.nonce || record.state !== "connected")
      throw new RunnerSessionError("CHALLENGE_INVALID");
    record.state = "paired";
    record.ownerUserId = input.ownerUserId;
    if (input.tenantId) {
      this.activeByRunner.delete(`${record.tenantId}:${record.runnerId}`);
      record.tenantId = input.tenantId;
      this.activeByRunner.set(`${record.tenantId}:${record.runnerId}`, record.runnerSessionId);
    }
    record.approvedAt = this.clock.now().toISOString();
    this.emit("runner_pairing_approved", record);
    return structuredClone(record);
  }

  authorize(input: {
    runnerSessionId: string;
    deviceProofVerified: boolean;
  }): RunnerSessionRecord {
    const record = this.getActive(input.runnerSessionId);
    if (record.state === "authorized" || record.state === "capability_ready")
      return structuredClone(record);
    if (record.state !== "paired")
      throw new RunnerSessionError("SESSION_STATE_INVALID");
    if (!input.deviceProofVerified)
      throw new RunnerSessionError("DEVICE_PROOF_REQUIRED");
    record.state = "authorized";
    record.authorizedAt = this.clock.now().toISOString();
    this.emit("runner_authorized", record);
    return structuredClone(record);
  }

  restoreAuthorized(input: {
    runnerSessionId: string;
    runnerId: string;
    tenantId: string;
    deviceId: string;
    ownerUserId?: number | null;
    ttlMs?: number;
  }): RunnerSessionRecord {
    const existing = this.sessions.get(input.runnerSessionId);
    if (existing) {
      if (existing.state === "revoked") throw new RunnerSessionError("SESSION_REVOKED");
      return structuredClone(existing);
    }
    const now = this.clock.now();
    const record: RunnerSessionRecord = {
      runnerSessionId: assertText(input.runnerSessionId, "CHALLENGE_INVALID"),
      runnerId: assertText(input.runnerId, "CHALLENGE_INVALID"),
      tenantId: assertText(input.tenantId, "CHALLENGE_INVALID"),
      deviceId: assertText(input.deviceId, "CHALLENGE_INVALID"),
      ownerUserId: input.ownerUserId ?? null,
      nonce: "restored-session",
      state: "authorized",
      createdAt: now.toISOString(),
      expiresAt: new Date(now.getTime() + (input.ttlMs ?? 15 * 60 * 1000)).toISOString(),
      authorizedAt: now.toISOString(),
    };
    this.sessions.set(record.runnerSessionId, record);
    this.activeByRunner.set(`${record.tenantId}:${record.runnerId}`, record.runnerSessionId);
    this.emit("runner_authorized", record, "restored_from_active_control_plane_session");
    return structuredClone(record);
  }

  publishCapability(input: {
    runnerSessionId: string;
    probeState: "ready" | "degraded" | "unavailable";
    capabilitySnapshotId: string;
    snapshotRevision: string;
  }): RunnerSessionRecord {
    const record = this.getActive(input.runnerSessionId);
    if (record.state !== "authorized" && record.state !== "capability_ready")
      throw new RunnerSessionError("SESSION_STATE_INVALID");
    if (input.probeState !== "ready")
      throw new RunnerSessionError("CAPABILITY_NOT_READY");
    record.capabilitySnapshotId = assertText(input.capabilitySnapshotId, "CAPABILITY_BINDING_INVALID");
    record.snapshotRevision = assertText(input.snapshotRevision, "CAPABILITY_BINDING_INVALID");
    record.state = "capability_ready";
    this.emit("runner_capability_ready", record);
    return structuredClone(record);
  }

  assertAuthorized(runnerSessionId: string): RunnerSessionRecord {
    const record = this.getActive(runnerSessionId);
    if (record.state === "revoked") throw new RunnerSessionError("SESSION_REVOKED");
    if (record.state === "expired") throw new RunnerSessionError("SESSION_EXPIRED");
    if (record.state !== "authorized" && record.state !== "capability_ready")
      throw new RunnerSessionError("SESSION_STATE_INVALID");
    return structuredClone(record);
  }

  assertCapabilityReady(runnerSessionId: string): RunnerSessionRecord {
    const record = this.getActive(runnerSessionId);
    if (record.state === "revoked") throw new RunnerSessionError("SESSION_REVOKED");
    if (record.state === "expired") throw new RunnerSessionError("SESSION_EXPIRED");
    if (record.state !== "capability_ready")
      throw new RunnerSessionError("CAPABILITY_NOT_READY");
    return structuredClone(record);
  }

  revoke(runnerSessionId: string, reason = "runner_revoked"): void {
    const record = this.sessions.get(runnerSessionId);
    if (!record || record.state === "revoked") return;
    record.state = "revoked";
    if (this.activeByRunner.get(`${record.tenantId}:${record.runnerId}`) === runnerSessionId)
      this.activeByRunner.delete(`${record.tenantId}:${record.runnerId}`);
    this.emit("runner_session_revoked", record, reason);
  }

  auditEvents(): RunnerSessionAuditEvent[] {
    return structuredClone(this.events);
  }

  private getActive(runnerSessionId: string): RunnerSessionRecord {
    const record = this.sessions.get(runnerSessionId);
    if (!record) throw new RunnerSessionError("CHALLENGE_INVALID");
    if (record.state !== "revoked" && Date.parse(record.expiresAt) <= this.clock.now().getTime()) {
      record.state = "expired";
      this.emit("runner_session_expired", record);
      throw new RunnerSessionError("SESSION_EXPIRED");
    }
    return record;
  }

  private emit(
    type: RunnerSessionAuditEvent["type"],
    record: RunnerSessionRecord,
    reason?: string,
  ): void {
    this.events.push({
      type,
      runnerId: record.runnerId,
      tenantId: record.tenantId,
      runnerSessionId: record.runnerSessionId,
      at: this.clock.now().toISOString(),
      ...(reason ? { reason } : {}),
    });
  }
}
