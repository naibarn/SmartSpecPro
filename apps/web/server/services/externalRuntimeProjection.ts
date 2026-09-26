export function buildExternalRuntimeProjection(input: {
  sessionState:
    "idle" | "running" | "permission_required" | "completed" | "failed";
  transport: "accepted" | "rejected";
  effect: "pending" | "completed" | "unknown";
  permission: "none" | "pending" | "allowed" | "denied";
  backgroundTask: "running" | "stopped" | "unsupported";
  stopSupport: "task" | "session_only" | "unsupported";
  observedAt: string | null;
}): {
  status: "idle" | "running" | "approval" | "success" | "error";
  transportLabel: "accepted" | "rejected";
  effectLabel: "pending" | "completed" | "unknown";
  stopLabel: "stop_task" | "stop_session" | "stop_unsupported";
  freshness: "fresh" | "unknown";
} {
  const status =
    input.permission === "pending"
      ? "approval"
      : input.sessionState === "completed" && input.effect === "completed"
        ? "success"
        : input.sessionState === "failed" || input.effect === "unknown"
          ? "error"
          : input.sessionState === "idle"
            ? "idle"
            : "running";
  return {
    status,
    transportLabel: input.transport,
    effectLabel: input.effect,
    stopLabel:
      input.stopSupport === "task"
        ? "stop_task"
        : input.stopSupport === "session_only"
          ? "stop_session"
          : "stop_unsupported",
    freshness: input.observedAt ? "fresh" : "unknown",
  };
}
