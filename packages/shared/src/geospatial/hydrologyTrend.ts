export type HydroTrendLabel = "RAPIDLY_RISING" | "RISING" | "SLIGHTLY_RISING" | "STABLE" | "SLIGHTLY_FALLING" | "FALLING" | "RAPIDLY_FALLING" | "UNKNOWN";
export interface HydroTrendSample { readonly observedAt: string; readonly value: number | null; readonly quality: "valid" | "suspect" | "estimated" | "missing" | "censored" | "rejected"; readonly freshness: "current" | "stale" | "delayed" | "unknown"; readonly unit: string; }
export interface HydroTrendPolicy { readonly revision: string; readonly minSamples: number; readonly windowSeconds: number; readonly staleAfterSeconds: number; readonly stableDelta: number; readonly slightDelta: number; readonly rapidDelta: number; }
export function calculateHydroTrend(samples: readonly HydroTrendSample[], policy: HydroTrendPolicy, now: string) {
  const validPolicy = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,159}$/.test(policy.revision) && Number.isInteger(policy.minSamples) && policy.minSamples >= 2 && policy.minSamples <= 100 && Number.isInteger(policy.windowSeconds) && policy.windowSeconds > 0 && policy.windowSeconds <= 31_536_000 && Number.isInteger(policy.staleAfterSeconds) && policy.staleAfterSeconds >= 0 && Number.isFinite(policy.stableDelta) && policy.stableDelta >= 0 && Number.isFinite(policy.slightDelta) && policy.slightDelta > policy.stableDelta && Number.isFinite(policy.rapidDelta) && policy.rapidDelta > policy.slightDelta;
  if (!validPolicy || !Number.isFinite(Date.parse(now))) return { label: "UNKNOWN" as const, reason: "INVALID_POLICY_OR_TIME", sampleCount: 0, delta: null, policyRevision: policy.revision };
  const start = Date.parse(now) - policy.windowSeconds * 1000;
  const window = samples.filter(sample => Number.isFinite(Date.parse(sample.observedAt)) && Date.parse(sample.observedAt) <= Date.parse(now) && Date.parse(sample.observedAt) >= start);
  const eligible = window.filter(sample => sample.value !== null && Number.isFinite(sample.value) && sample.quality === "valid" && sample.freshness === "current").sort((a, b) => Date.parse(a.observedAt) - Date.parse(b.observedAt));
  if (eligible.length < policy.minSamples) return { label: "UNKNOWN" as const, reason: "INSUFFICIENT_CURRENT_SAMPLES", sampleCount: eligible.length, delta: null, policyRevision: policy.revision };
  if (eligible.some(sample => sample.unit !== eligible[0]!.unit)) return { label: "UNKNOWN" as const, reason: "INCOMPARABLE_UNITS", sampleCount: eligible.length, delta: null, policyRevision: policy.revision };
  const first = eligible[0]!;
  const last = eligible.at(-1)!;
  if ((Date.parse(now) - Date.parse(last.observedAt)) / 1000 > policy.staleAfterSeconds) return { label: "UNKNOWN" as const, reason: "STALE_LATEST_SAMPLE", sampleCount: eligible.length, delta: null, policyRevision: policy.revision };
  const delta = last.value! - first.value!;
  const magnitude = Math.abs(delta);
  const label: HydroTrendLabel = magnitude <= policy.stableDelta ? "STABLE"
    : delta > 0 ? magnitude <= policy.slightDelta ? "SLIGHTLY_RISING" : magnitude >= policy.rapidDelta ? "RAPIDLY_RISING" : "RISING"
      : magnitude <= policy.slightDelta ? "SLIGHTLY_FALLING" : magnitude >= policy.rapidDelta ? "RAPIDLY_FALLING" : "FALLING";
  return { label, reason: "OBSERVED_WINDOW_DELTA", sampleCount: eligible.length, delta, startAt: first.observedAt, endAt: last.observedAt, policyRevision: policy.revision };
}
