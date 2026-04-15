type CounterKey = string;

const counters = new Map<CounterKey, number>();

function incCounter(name: string, labels: Record<string, string>) {
  const key = `${name}:${Object.entries(labels)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([label, value]) => `${label}=${value}`)
    .join(",")}`;
  counters.set(key, (counters.get(key) ?? 0) + 1);
}

function bucketReason(reason: string): string {
  const normalized = reason.toLowerCase();

  if (normalized.includes("registry not found")) return "registry_not_found";
  if (normalized.includes("missing policy")) return "missing_policy";
  if (normalized.includes("draft")) return "draft_blocked";
  if (normalized.includes("rollout")) return "rollout_mismatch";
  if (normalized.includes("unsupported tool")) return "unsupported_tool";
  if (normalized.includes("disallowed action")) return "disallowed_action";
  if (normalized.includes("model family")) return "model_incompatible";
  if (normalized.includes("approval required")) return "approval_required";
  return "other";
}

export function recordRegistryResolutionMetrics(input: {
  selectedVersionId: string | null;
  reason: string;
  usedEvidencePreference: boolean;
}) {
  incCounter("agent_registry_resolution_total", {
    outcome: input.selectedVersionId ? "selected" : "rejected",
    reason_bucket: bucketReason(input.reason),
  });
  incCounter("agent_registry_evidence_preference_total", {
    used: input.usedEvidencePreference ? "true" : "false",
  });
}

export function recordRegistryPromotionMetrics(input: {
  action: "created" | "published" | "selected" | "reviewed" | "frozen" | "rolled_back";
  decision?: string | null;
}) {
  incCounter("agent_registry_promotion_total", {
    action: input.action,
    decision: input.decision ?? "n/a",
  });
}

export function getAgentRegistryMetricSnapshot(): Record<string, number> {
  return Object.fromEntries(counters.entries());
}

export function resetAgentRegistryMetricsForTests(): void {
  counters.clear();
}

function escapeLabelValue(value: string): string {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/\n/g, "\\n")
    .replace(/"/g, '\\"');
}

function parseCounterKey(key: string): { metric: string; labels: Record<string, string>; value: number } | null {
  const separatorIndex = key.indexOf(":");
  if (separatorIndex < 0) {
    return null;
  }

  const metric = key.slice(0, separatorIndex);
  const labelBlob = key.slice(separatorIndex + 1);
  const labels: Record<string, string> = {};
  if (labelBlob.length > 0) {
    for (const pair of labelBlob.split(",")) {
      if (!pair) continue;
      const eqIndex = pair.indexOf("=");
      if (eqIndex < 0) continue;
      const label = pair.slice(0, eqIndex);
      const value = pair.slice(eqIndex + 1);
      labels[label] = value;
    }
  }

  return {
    metric,
    labels,
    value: counters.get(key) ?? 0,
  };
}

export function renderAgentRegistryMetrics(): string {
  const rows = [...counters.keys()]
    .map((key) => parseCounterKey(key))
    .filter((row): row is NonNullable<typeof row> => row !== null);

  const metrics = new Map<string, typeof rows>();
  for (const row of rows) {
    const list = metrics.get(row.metric) ?? [];
    list.push(row);
    metrics.set(row.metric, list);
  }

  const lines: string[] = [];
  for (const [metric, entries] of metrics.entries()) {
    lines.push(`# HELP ${metric} Agent registry metric ${metric}`);
    lines.push(`# TYPE ${metric} counter`);
    for (const entry of entries) {
      const labels = Object.entries(entry.labels)
        .map(([label, value]) => `${label}="${escapeLabelValue(value)}"`)
        .join(",");
      lines.push(`${metric}{${labels}} ${entry.value}`);
    }
  }

  return lines.length > 0 ? `${lines.join("\n")}\n` : "# HELP agent_registry_resolution_total Agent registry metric agent_registry_resolution_total\n# TYPE agent_registry_resolution_total counter\n";
}
