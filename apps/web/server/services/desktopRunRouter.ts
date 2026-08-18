import {
  desktopRunSelectionResultSchema,
  type DesktopPackageTrustClass,
  type DesktopRunSelection,
  type DesktopRunSelectionResult,
} from "../../shared/desktopHost";

export interface DesktopRunRouterInput {
  explicitRuntime?: DesktopRunSelection | null;
  packageTrustClass: DesktopPackageTrustClass;
  requiresLocalFiles: boolean;
  requiresConnectors: boolean;
  platformSkillEligible: boolean;
  orchestrationComplexity: "simple" | "moderate" | "complex";
  piAvailable: boolean;
  agencyAvailable: boolean;
  openClawAvailable: boolean;
  cloudAllowed: boolean;
  offline: boolean;
  degradedGateway: boolean;
  rawInputLeavesDevice?: boolean;
  serverToolsRequired?: boolean;
}

function isRuntimeAvailable(
  runtime: DesktopRunSelection,
  input: DesktopRunRouterInput,
): boolean {
  switch (runtime) {
    case "platform_skill":
      return input.platformSkillEligible;
    case "pi":
      return input.piAvailable;
    case "agency_swarm":
      // Agency Swarm is retired. Keep the historical enum readable for old
      // desktop records, but never advertise it as an executable runtime.
      return false;
    case "openclaw_gateway":
      return input.openClawAvailable;
    case "cloud_agent":
      return input.cloudAllowed;
    default:
      return false;
  }
}

export function resolveDesktopRunLocalityLabel(input: {
  runtime: DesktopRunSelection;
  rawInputLeavesDevice?: boolean;
  serverToolsRequired?: boolean;
}): "local" | "hybrid" | "server" | "external" {
  if (input.runtime === "cloud_agent") {
    return "server";
  }
  if (input.runtime === "openclaw_gateway") {
    return "external";
  }
  if (input.runtime === "pi" || input.runtime === "agency_swarm") {
    return input.rawInputLeavesDevice === true || input.serverToolsRequired === true
      ? "hybrid"
      : "local";
  }
  return "server";
}

export function routeDesktopRun(
  input: DesktopRunRouterInput,
): DesktopRunSelectionResult {
  let selectedRuntime: DesktopRunSelection;
  let reason: DesktopRunSelectionResult["reason"];

  if (input.explicitRuntime) {
    if (!isRuntimeAvailable(input.explicitRuntime, input)) {
      throw new Error(`requested runtime ${input.explicitRuntime} is unavailable`);
    }
    selectedRuntime = input.explicitRuntime;
    reason = "explicit_user_choice";
  } else if (
    !input.offline
    && input.cloudAllowed
    && (input.orchestrationComplexity === "complex" || input.requiresConnectors)
  ) {
    selectedRuntime = "cloud_agent";
    reason = input.requiresConnectors
      ? "connector_orchestration"
      : "multi_agent_complexity";
  } else if (input.piAvailable && input.requiresLocalFiles) {
    selectedRuntime = "pi";
    reason = "local_file_heavy";
  } else if (input.platformSkillEligible && !input.requiresLocalFiles && !input.requiresConnectors) {
    selectedRuntime = "platform_skill";
    reason = "deterministic_skill";
  } else if (!input.offline && input.openClawAvailable) {
    selectedRuntime = "openclaw_gateway";
    reason = input.degradedGateway ? "runtime_unavailable" : "gateway_policy_required";
  } else if (!input.offline && input.cloudAllowed) {
    selectedRuntime = "cloud_agent";
    reason = input.degradedGateway ? "runtime_unavailable" : "gateway_policy_required";
  } else {
    throw new Error("no eligible runtime for desktop run");
  }

  const locality = resolveDesktopRunLocalityLabel({
    runtime: selectedRuntime,
    rawInputLeavesDevice: input.rawInputLeavesDevice,
    serverToolsRequired: input.serverToolsRequired || input.degradedGateway,
  });

  return desktopRunSelectionResultSchema.parse({
    selectedRuntime,
    reason: input.offline && (selectedRuntime === "pi" || selectedRuntime === "agency_swarm")
      ? "degraded_offline"
      : reason,
    labels: {
      surface: "desktop",
      runtime:
        selectedRuntime === "openclaw_gateway"
          ? "openclaw_gateway"
          : selectedRuntime,
      locality,
      workspace:
        selectedRuntime === "pi" || selectedRuntime === "agency_swarm"
          ? "local_workspace"
          : "none",
      trustClass: input.packageTrustClass,
    },
    sidecarBoundaryRequired: selectedRuntime === "pi",
  });
}
