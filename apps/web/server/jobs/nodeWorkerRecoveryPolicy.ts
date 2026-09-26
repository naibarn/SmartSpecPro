export const NODE_WORKER_HEARTBEAT_STALE_MS = 30_000;
export const NODE_WORKER_STARTUP_GRACE_MS = 60_000;
export const NODE_WORKER_DISPATCH_BACKLOG_STALE_MS = 120_000;
export const NODE_WORKER_RESTART_WINDOW_MS = 10 * 60_000;
export const NODE_WORKER_MAX_RESTARTS_IN_WINDOW = 3;

export type NodeWorkerHealthSnapshot = {
  serviceActive: boolean;
  serviceAgeMs?: number | null;
  heartbeatAgeMs: number | null;
  queuedUnconsumedCount: number;
  oldestQueuedUnconsumedAgeMs: number | null;
  activeJobCount: number;
  activeLeaseValidCount: number;
  restartsInWindow: number;
};

export type NodeWorkerRecoveryDecision = {
  action: "healthy" | "restart" | "alert";
  reason:
  | "healthy"
  | "service_inactive"
  | "startup_grace"
  | "active_lease"
  | "active_lease_expired"
  | "heartbeat_stale"
    | "dispatch_backlog"
    | "restart_circuit_open";
};

export function decideNodeWorkerRecovery(
  snapshot: NodeWorkerHealthSnapshot,
): NodeWorkerRecoveryDecision {
  const unhealthy = !snapshot.serviceActive
    || snapshot.heartbeatAgeMs == null
    || snapshot.heartbeatAgeMs > NODE_WORKER_HEARTBEAT_STALE_MS
    || (
      snapshot.activeJobCount > 0
      && snapshot.activeLeaseValidCount === 0
    )
    || (
      snapshot.queuedUnconsumedCount > 0
      && snapshot.oldestQueuedUnconsumedAgeMs != null
      && snapshot.oldestQueuedUnconsumedAgeMs > NODE_WORKER_DISPATCH_BACKLOG_STALE_MS
      && snapshot.activeJobCount === 0
    );

  if (!unhealthy) return { action: "healthy", reason: "healthy" };

  if (snapshot.restartsInWindow >= NODE_WORKER_MAX_RESTARTS_IN_WINDOW) {
    return { action: "alert", reason: "restart_circuit_open" };
  }

  if (!snapshot.serviceActive) {
    return { action: "restart", reason: "service_inactive" };
  }
  if (snapshot.activeJobCount > 0 && snapshot.activeLeaseValidCount === 0) {
    return { action: "restart", reason: "active_lease_expired" };
  }
  if (snapshot.heartbeatAgeMs == null || snapshot.heartbeatAgeMs > NODE_WORKER_HEARTBEAT_STALE_MS) {
    if (snapshot.activeLeaseValidCount > 0) {
      return { action: "healthy", reason: "active_lease" };
    }
    if (
      snapshot.serviceAgeMs != null &&
      snapshot.serviceAgeMs >= 0 &&
      snapshot.serviceAgeMs < NODE_WORKER_STARTUP_GRACE_MS
    ) {
      return { action: "healthy", reason: "startup_grace" };
    }
    return { action: "restart", reason: "heartbeat_stale" };
  }
  return { action: "restart", reason: "dispatch_backlog" };
}
