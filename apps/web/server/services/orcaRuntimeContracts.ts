import type { RunnerCapabilitySnapshot } from "./runnerContracts";

export const ORCA_ROUTE_ID = "orca.v1" as const;

export type OrcaReadinessStatus =
  | "ready"
  | "setup_required"
  | "auth_required"
  | "unsupported"
  | "stale"
  | "disabled";

export type OrcaReadiness = {
  route: typeof ORCA_ROUTE_ID;
  status: OrcaReadinessStatus;
  reasonCode: string;
  runnerId: string | null;
  snapshotRevision: string | null;
  provider: "orca";
};

export type OrcaReadinessInput = {
  featureEnabled: boolean;
  runner: {
    runnerId: string;
    tenantId: string;
    trustState: string;
    status: string;
  } | null;
  snapshot: {
    runnerId: string;
    revision: string;
    observedAt: string;
    expiresAt: string;
    workspaceIds: string[];
    platform?: { os: string; architecture: string; target: string };
    tool: {
      installed: boolean;
      configured: boolean;
      authenticated: boolean;
      healthy: boolean;
      version: string | null;
    };
    capability: { available: boolean; policyAllowed: boolean };
  } | null;
  workspaceId: string;
  now?: Date;
};

export type OrcaSessionState =
  | "created"
  | "attached"
  | "running"
  | "waiting_input"
  | "completed"
  | "failed"
  | "cancelled";
export type OrcaCommandKind =
  "create" | "attach" | "prompt" | "observe" | "cancel" | "kill";

export type OrcaSession = {
  sessionId: string;
  route: typeof ORCA_ROUTE_ID;
  runnerId: string;
  tenantId: string;
  jobId: string;
  attemptId: string;
  generation: number;
  state: OrcaSessionState;
};

export type OrcaReceipt = {
  receiptId: string;
  sessionId: string;
  jobId: string;
  attemptId: string;
  generation: number;
  kind: "ack" | "effect";
  status: "accepted" | "verified" | "failed" | "unknown";
  payload: Record<string, unknown>;
};

export function resolveOrcaReadiness(input: OrcaReadinessInput): OrcaReadiness {
  const base = {
    route: ORCA_ROUTE_ID,
    runnerId: input.runner?.runnerId ?? null,
    snapshotRevision: input.snapshot?.revision ?? null,
    provider: "orca" as const,
  };
  if (!input.featureEnabled)
    return { ...base, status: "disabled", reasonCode: "ORCA_FEATURE_DISABLED" };
  if (
    !input.runner ||
    input.runner.trustState !== "trusted" ||
    input.runner.status === "offline"
  ) {
    return {
      ...base,
      status: "setup_required",
      reasonCode: "RUNNER_NOT_READY",
    };
  }
  if (!input.snapshot || input.snapshot.runnerId !== input.runner.runnerId) {
    return {
      ...base,
      status: "setup_required",
      reasonCode: "CAPABILITY_SNAPSHOT_REQUIRED",
    };
  }
  if (
    Date.parse(input.snapshot.expiresAt) <= (input.now ?? new Date()).getTime()
  ) {
    return {
      ...base,
      status: "stale",
      reasonCode: "CAPABILITY_SNAPSHOT_STALE",
    };
  }
  if (
    !input.snapshot.platform ||
    !["linux", "macos", "windows"].includes(input.snapshot.platform.os)
  ) {
    return {
      ...base,
      status: "unsupported",
      reasonCode: "ORCA_OS_UNSUPPORTED",
    };
  }
  if (!input.snapshot.tool.installed || !input.snapshot.tool.configured) {
    return {
      ...base,
      status: "setup_required",
      reasonCode: "ORCA_TOOL_SETUP_REQUIRED",
    };
  }
  if (!input.snapshot.tool.authenticated)
    return {
      ...base,
      status: "auth_required",
      reasonCode: "ORCA_AUTH_REQUIRED",
    };
  if (!input.snapshot.tool.healthy || !input.snapshot.capability.available) {
    return {
      ...base,
      status: "unsupported",
      reasonCode: "ORCA_CAPABILITY_UNAVAILABLE",
    };
  }
  if (!input.snapshot.capability.policyAllowed)
    return { ...base, status: "unsupported", reasonCode: "ORCA_POLICY_DENIED" };
  if (!input.snapshot.workspaceIds.includes(input.workspaceId)) {
    return {
      ...base,
      status: "setup_required",
      reasonCode: "ORCA_WORKSPACE_NOT_BOUND",
    };
  }
  return { ...base, status: "ready", reasonCode: "ORCA_READY" };
}

export function toOrcaCapabilitySnapshot(
  snapshot: RunnerCapabilitySnapshot
): OrcaReadinessInput["snapshot"] {
  const tool = snapshot.toolInventory?.find(
    item => item.kind === "agent_cli" || item.kind === "agent_harness"
  );
  const capability = snapshot.capabilityInventory?.find(
    item =>
      item.capabilityId === "agent.orca" || item.implementationId === "orca"
  );
  return {
    runnerId: snapshot.runnerId,
    revision: snapshot.revision,
    observedAt: snapshot.observedAt,
    expiresAt: snapshot.expiresAt,
    workspaceIds: snapshot.workspaceIds,
    platform: snapshot.platform,
    tool: {
      installed: tool?.installState === "installed",
      configured: tool?.configurationState === "configured",
      authenticated: tool?.authState === "authenticated",
      healthy: tool?.healthState === "healthy",
      version: tool?.version ?? null,
    },
    capability: {
      available: capability?.availabilityState === "available",
      policyAllowed: capability?.policyDecision === "allowed",
    },
  };
}
