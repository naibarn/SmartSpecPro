import { VD_SERIES_PROFILE_IDS } from "../../shared/verticalDramaSeries/seriesProfile";

type Labels = Record<string, string>;
type MetricEntry = { type: "counter" | "gauge" | "histogram"; values: Map<string, number>; labels: string[] };

const ALLOWED = {
  taskKind: new Set(["premise_expansion", "story_architecture", "full_story", "draft_qc", "draft_repair", "start_frame_prompt", "reference_image_prompt", "video_prompt_qc", "broll_assembly_qc", "season_qc", "other"]),
  mode: new Set(["agent_active", "agent_shadow", "legacy_deterministic", "recovered_result", "other"]),
  outcome: new Set(["accepted", "blocked", "failed", "retryable", "reconciled", "other"]),
  release: new Set(["unknown"]),
};
const metrics = new Map<string, MetricEntry>();

function bounded(value: unknown, allowed: Set<string>): string {
  const text = typeof value === "string" ? value : "";
  return allowed.has(text) ? text : "other";
}
function metric(name: string, type: MetricEntry["type"], labels: string[]): MetricEntry {
  const existing = metrics.get(name);
  if (existing) return existing;
  const created = { type, values: new Map<string, number>(), labels };
  metrics.set(name, created);
  return created;
}
function record(name: string, type: MetricEntry["type"], labels: Labels, value = 1): void {
  const names = Object.keys(labels).sort();
  const entry = metric(name, type, names);
  const key = names.map(name => `${name}=${labels[name]}`).join(",");
  entry.values.set(key, (entry.values.get(key) ?? 0) + value);
}
function common(input: { taskKind?: string; assuranceMode?: string; outcome?: string; release?: string }): Labels {
  return { task_kind: bounded(input.taskKind, ALLOWED.taskKind), assurance_mode: bounded(input.assuranceMode, ALLOWED.mode), outcome: bounded(input.outcome, ALLOWED.outcome), release: bounded(input.release, ALLOWED.release) };
}
function boundedProfile(value: unknown): string {
  return typeof value === "string" && (VD_SERIES_PROFILE_IDS as readonly string[]).includes(value) ? value : "unknown";
}

export function recordVerticalDramaAssuranceAdmission(input: { taskKind: string; profileId?: string; assuranceMode?: string; outcome: string; release?: string }): void {
  record("smartspec_vertical_drama_assurance_admissions_total", "counter", { ...common(input), profile_id: boundedProfile(input.profileId) });
}
export function recordVerticalDramaAssuranceTransition(input: { taskKind: string; fromState: string; toState: string; reasonClass?: string; release?: string }): void {
  record("smartspec_vertical_drama_assurance_transitions_total", "counter", { task_kind: bounded(input.taskKind, ALLOWED.taskKind), from_state: input.fromState || "other", to_state: input.toState || "other", reason_class: input.reasonClass || "other", release: bounded(input.release, ALLOWED.release) });
}
export function recordVerticalDramaAssuranceFinalGate(input: { taskKind: string; requiredReadiness: string; outcome: "allow" | "block"; reason?: string; release?: string }): void {
  record("smartspec_vertical_drama_assurance_final_gate_total", "counter", { task_kind: bounded(input.taskKind, ALLOWED.taskKind), required_readiness: input.requiredReadiness || "other", outcome: input.outcome, reason: input.reason || "other", release: bounded(input.release, ALLOWED.release) });
}
export function recordVerticalDramaAssuranceProviderCall(input: { taskKind: string; provider?: string; callClass?: string; payer?: string; outcome: string; release?: string }): void {
  record("smartspec_vertical_drama_assurance_provider_calls_total", "counter", { ...common(input), provider: input.provider || "other", call_class: input.callClass || "other", payer: input.payer || "other" });
}
export function observeVerticalDramaAssuranceTerminalLatency(input: { taskKind: string; assuranceMode?: string; outcome: string; release?: string; seconds: number }): void {
  record("smartspec_vertical_drama_assurance_terminal_latency_seconds", "histogram", { ...common(input) }, Math.max(0, Math.min(input.seconds, 86_400)));
}
export function setVerticalDramaAssuranceBacklogSnapshot(input: { taskKind: string; state: string; tenantClass?: string; nonterminal: number; oldestAgeSeconds: number; release?: string }): void {
  const labels = { task_kind: bounded(input.taskKind, ALLOWED.taskKind), state: input.state || "other", tenant_class: input.tenantClass || "standard", release: bounded(input.release, ALLOWED.release) };
  record("smartspec_vertical_drama_assurance_nonterminal_runs", "gauge", labels, Math.max(0, input.nonterminal));
  record("smartspec_vertical_drama_assurance_oldest_nonterminal_age_seconds", "gauge", labels, Math.max(0, input.oldestAgeSeconds));
}
export function renderVerticalDramaAssuranceMetrics(): string {
  const lines: string[] = [];
  for (const [name, entry] of [...metrics.entries()].sort(([left], [right]) => left.localeCompare(right))) {
    lines.push(`# TYPE ${name} ${entry.type}`);
    for (const [key, value] of [...entry.values.entries()].sort(([left], [right]) => left.localeCompare(right))) {
      const labels = key ? key.split(",").map(item => { const [label, ...rest] = item.split("="); return `${label}="${rest.join("=").replaceAll("\\", "\\\\").replaceAll('"', '\\"')}"`; }).join(",") : "";
      lines.push(`${name}${labels ? `{${labels}}` : ""} ${value}`);
    }
  }
  return lines.length ? `${lines.join("\n")}\n` : "";
}
export function resetVerticalDramaAssuranceMetricsForTests(): void { metrics.clear(); }
