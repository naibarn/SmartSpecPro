const companionInvoke = window.__TAURI__.core.invoke;

const STATUS_LABELS = {
  unavailable: "Unavailable",
  stale: "Stale",
  queued: "Queued",
  running: "Running",
  waiting_for_approval: "Waiting for approval",
  waiting_for_input: "Waiting for input",
  waiting_external: "Waiting",
  cancel_requested: "Cancellation requested",
  cancelled: "Cancelled",
  completed: "Completed",
  failed: "Failed",
  expired: "Expired",
  unknown_outcome: "Unknown outcome",
};

function statusLabel(value) {
  return STATUS_LABELS[value] || "Unknown outcome";
}

function normalizeCompanionState(value) {
  if (!value || value.schemaVersion !== "runner-companion.v1") {
    return null;
  }
  return {
    ...value,
    devices: Array.isArray(value.devices) ? value.devices : [],
    tasks: Array.isArray(value.tasks) ? value.tasks : [],
    approvals: Array.isArray(value.approvals) ? value.approvals : [],
    evidence: Array.isArray(value.evidence) ? value.evidence : [],
  };
}

function progressLabel(task) {
  const percent = task?.progress?.percent;
  if (Number.isFinite(percent)) return `${Math.max(0, Math.min(100, percent))}%`;
  return "Progress not reported";
}

function taskStatusClass(status) {
  return `state-${String(status || "unknown_outcome").replaceAll("_", "-").replace(/[^a-z0-9-]/gi, "")}`;
}

function escapeText(value) {
  return value == null ? "" : String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function taskDetail(task) {
  const phase = task?.progress?.phase;
  const source = task?.progress?.source;
  return [phase || "No phase reported", source === "unreported" ? "Canonical progress not reported" : source]
    .filter(Boolean)
    .join(" · ");
}

window.SmartAIHubCompanion = {
  companionInvoke,
  normalizeCompanionState,
  statusLabel,
  progressLabel,
  taskStatusClass,
  escapeText,
  taskDetail,
};
