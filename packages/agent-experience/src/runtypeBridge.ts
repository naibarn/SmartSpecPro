import type { AgentExperienceIntent, SmartSpecAgentEvent } from "./events";
import { filterAgentExperienceEventsForRenderer } from "./redaction";

export const RUNTYPE_PERSONA_PACKAGE_NAME = "@runtypelabs/persona" as const;
export const RUNTYPE_PERSONA_VERSION = "4.4.0" as const;

export async function loadRuntypePersonaRenderer() {
  const renderer = await import("@runtypelabs/persona");
  return {
    packageName: RUNTYPE_PERSONA_PACKAGE_NAME,
    version: RUNTYPE_PERSONA_VERSION,
    createAgentExperience: renderer.createAgentExperience,
  };
}

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
    && gate.packageName === RUNTYPE_PERSONA_PACKAGE_NAME
    && gate.exactVersion === RUNTYPE_PERSONA_VERSION
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
