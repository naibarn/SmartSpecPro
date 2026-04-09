import type { DesktopRolloutGateState } from "../../shared/desktopHost";

export type DesktopRolloutPhase =
  | "foundation"
  | "package_trust"
  | "managed_file_roots"
  | "pi_runtime"
  | "agency_runtime"
  | "enterprise_managed_default";

const REQUIRED_GATES_BY_PHASE: Record<DesktopRolloutPhase, string[]> = {
  foundation: ["device_binding_ready"],
  package_trust: ["device_binding_ready", "signed_packages_enforced"],
  managed_file_roots: [
    "device_binding_ready",
    "signed_packages_enforced",
    "managed_file_roots_default",
  ],
  pi_runtime: [
    "device_binding_ready",
    "signed_packages_enforced",
    "managed_file_roots_default",
    "pi_gateway_only",
  ],
  agency_runtime: [
    "device_binding_ready",
    "signed_packages_enforced",
    "managed_file_roots_default",
    "pi_gateway_only",
    "agency_gateway_only",
  ],
  enterprise_managed_default: [
    "device_binding_ready",
    "signed_packages_enforced",
    "signed_updates_enforced",
    "managed_file_roots_default",
    "pi_gateway_only",
    "agency_gateway_only",
    "offboarding_cleanup_ready",
  ],
};

export function evaluateDesktopManagedRollout(input: {
  phase: DesktopRolloutPhase;
  gates: DesktopRolloutGateState[];
}): {
  allowed: boolean;
  blockingGates: DesktopRolloutGateState[];
} {
  const required = new Set(REQUIRED_GATES_BY_PHASE[input.phase]);
  const blockingGates = input.gates.filter(
    (gate) => required.has(gate.gate) && !gate.satisfied,
  );

  return {
    allowed: blockingGates.length === 0,
    blockingGates,
  };
}

export function assertDesktopManagedRolloutAllowed(input: {
  phase: DesktopRolloutPhase;
  gates: DesktopRolloutGateState[];
}): void {
  const result = evaluateDesktopManagedRollout(input);
  if (!result.allowed) {
    throw new Error(
      `desktop managed rollout blocked for ${input.phase}: ${result.blockingGates
        .map((gate) => `${gate.gate}:${gate.reason}`)
        .join(", ")}`,
    );
  }
}
