import { fingerprintLongFormPolicy } from "@shared/verticalDramaSeries/longFormContracts";

export type LongFormTelemetryEvent = {
  name:
    | "admission"
    | "chunk"
    | "graph_read"
    | "repair"
    | "closure"
    | "credit"
    | "fence";
  tenantId: string;
  seriesId: number;
  mode?: string;
  episodeNumber?: number;
  status?: string;
  durationMs?: number;
  estimatedCredits?: number;
  consumedCredits?: number;
  reconciledCredits?: number;
  redactedEdgeCount?: number;
  repairImpactSize?: number;
  policyFingerprint?: string;
};

/** Returns a metrics-safe event; prompts, evidence payloads, and graph IDs are never accepted. */
export function createLongFormTelemetryEvent(
  input: LongFormTelemetryEvent
): LongFormTelemetryEvent {
  return {
    ...input,
    tenantId: fingerprintLongFormPolicy(input.tenantId).slice(0, 16),
  };
}

export type LongFormRolloutState =
  | "shadow"
  | "blueprint"
  | "checkpoints"
  | "domain_ledgers"
  | "arc_gate"
  | "finale_gate"
  | "agents_adapter";

export const LONG_FORM_ROLLOUT_ORDER: readonly LongFormRolloutState[] = [
  "shadow",
  "blueprint",
  "checkpoints",
  "domain_ledgers",
  "arc_gate",
  "finale_gate",
  "agents_adapter",
];

export function canAdvanceLongFormRollout(
  current: LongFormRolloutState,
  requested: LongFormRolloutState
): boolean {
  return (
    LONG_FORM_ROLLOUT_ORDER.indexOf(requested) <=
    LONG_FORM_ROLLOUT_ORDER.indexOf(current) + 1
  );
}
