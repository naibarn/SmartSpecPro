export type LocalBrowserBinding = {
  tenantId: string;
  ownerId: string;
  deviceId: string;
  runnerId: string;
  runnerSessionId: string;
  capabilitySnapshotId: string;
  snapshotRevision: string;
  snapshotExpiresAt: string;
  observationRevision: number;
  sessionId: string;
  profile: "browser" | "desktop";
  generation: number;
  sequence: number;
  status: "bound" | "cancelled";
};

export class LocalBrowserRunnerError extends Error {
  readonly code:
    | "AUTH_REQUIRED"
    | "OWNER_MISMATCH"
    | "TENANT_MISMATCH"
    | "DEVICE_MISMATCH"
    | "SEQUENCE_STALE"
    | "RUNNER_SNAPSHOT_STALE"
    | "OBSERVATION_STALE"
    | "SESSION_CANCELLED";
  constructor(code: LocalBrowserRunnerError["code"], message = code) {
    super(message);
    this.name = "LocalBrowserRunnerError";
    this.code = code;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export class LocalBrowserRunnerService {
  bind(input: {
    tenantId: string;
    ownerId: string;
    deviceId: string;
    runnerId: string;
    runnerSessionId: string;
    capabilitySnapshotId: string;
    snapshotRevision: string;
    snapshotExpiresAt: string;
    sessionId: string;
    profile: LocalBrowserBinding["profile"];
    authenticated?: boolean;
  }): LocalBrowserBinding {
    if (input.authenticated === false)
      throw new LocalBrowserRunnerError("AUTH_REQUIRED");
    return {
      tenantId: input.tenantId,
      ownerId: input.ownerId,
      deviceId: input.deviceId,
      runnerId: input.runnerId,
      runnerSessionId: input.runnerSessionId,
      capabilitySnapshotId: input.capabilitySnapshotId,
      snapshotRevision: input.snapshotRevision,
      snapshotExpiresAt: input.snapshotExpiresAt,
      observationRevision: 0,
      sessionId: input.sessionId,
      profile: input.profile,
      generation: 1,
      sequence: 0,
      status: "bound",
    };
  }

  command(
    binding: LocalBrowserBinding,
    input: {
      tenantId: string;
      ownerId: string;
      deviceId: string;
      runnerId: string;
      runnerSessionId: string;
      capabilitySnapshotId: string;
      snapshotRevision: string;
      observationRevision: number;
      now?: string;
      sequence: number;
      action: string;
    }
  ): { status: "accepted"; sequence: number } {
    if (binding.status === "cancelled")
      throw new LocalBrowserRunnerError("SESSION_CANCELLED");
    if (input.tenantId !== binding.tenantId)
      throw new LocalBrowserRunnerError("TENANT_MISMATCH");
    if (input.ownerId !== binding.ownerId)
      throw new LocalBrowserRunnerError("OWNER_MISMATCH");
    if (input.deviceId !== binding.deviceId)
      throw new LocalBrowserRunnerError("DEVICE_MISMATCH");
    if (input.sequence <= binding.sequence)
      throw new LocalBrowserRunnerError("SEQUENCE_STALE");
    if (
      input.runnerId !== binding.runnerId ||
      input.runnerSessionId !== binding.runnerSessionId ||
      input.capabilitySnapshotId !== binding.capabilitySnapshotId ||
      input.snapshotRevision !== binding.snapshotRevision ||
      !Number.isFinite(Date.parse(binding.snapshotExpiresAt)) ||
      Date.parse(input.now ?? new Date().toISOString()) >= Date.parse(binding.snapshotExpiresAt)
    )
      throw new LocalBrowserRunnerError("RUNNER_SNAPSHOT_STALE");
    if (input.observationRevision <= binding.observationRevision)
      throw new LocalBrowserRunnerError("OBSERVATION_STALE");
    binding.sequence = input.sequence;
    binding.observationRevision = input.observationRevision;
    return { status: "accepted", sequence: input.sequence };
  }

  cancel(binding: LocalBrowserBinding): {
    status: "cancelled" | "already_cancelled";
  } {
    if (binding.status === "cancelled") return { status: "already_cancelled" };
    binding.status = "cancelled";
    return { status: "cancelled" };
  }

  rebind(
    binding: LocalBrowserBinding,
    input: {
      deviceId: string;
      runnerSessionId: string;
      capabilitySnapshotId: string;
      snapshotRevision: string;
      snapshotExpiresAt: string;
    }
  ): LocalBrowserBinding {
    if (binding.status === "cancelled")
      throw new LocalBrowserRunnerError("SESSION_CANCELLED");
    binding.deviceId = input.deviceId;
    binding.runnerSessionId = input.runnerSessionId;
    binding.capabilitySnapshotId = input.capabilitySnapshotId;
    binding.snapshotRevision = input.snapshotRevision;
    binding.snapshotExpiresAt = input.snapshotExpiresAt;
    binding.generation += 1;
    binding.sequence = 0;
    binding.observationRevision = 0;
    return binding;
  }
}
