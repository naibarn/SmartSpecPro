import type { AgentExperienceIntent, SmartSpecAgentEvent } from "./events";
import { filterAgentExperienceEventsForRenderer } from "./redaction";

export interface RuntypeRendererDependencyGate {
  approved: boolean;
  packageName?: string;
  exactVersion?: string;
  licenseReviewed?: boolean;
  bundleImpactReviewed?: boolean;
  accessibilityReviewed?: boolean;
  supplyChainReviewed?: boolean;
}

export interface RuntypeBridgeInput {
  events: SmartSpecAgentEvent[];
  dependencyGate: RuntypeRendererDependencyGate;
  debugAllowed?: boolean;
}

export interface RuntypeBridgeResult {
  enabled: boolean;
  events: SmartSpecAgentEvent[];
  intents: AgentExperienceIntent[];
  reason?: string;
}

export function createRuntypePersonaBridge(input: RuntypeBridgeInput): RuntypeBridgeResult {
  const gate = input.dependencyGate;
  const gatePassed = gate.approved === true
    && gate.packageName === "@runtypelabs/persona"
    && typeof gate.exactVersion === "string"
    && gate.exactVersion.length > 0
    && gate.licenseReviewed === true
    && gate.bundleImpactReviewed === true
    && gate.accessibilityReviewed === true
    && gate.supplyChainReviewed === true;

  if (!gatePassed) {
    return {
      enabled: false,
      events: [],
      intents: [],
      reason: "dependency_gate_incomplete",
    };
  }

  const filtered = filterAgentExperienceEventsForRenderer(input.events, {
    debugAllowed: input.debugAllowed,
  });

  return {
    enabled: true,
    events: filtered.events,
    intents: [],
  };
}
