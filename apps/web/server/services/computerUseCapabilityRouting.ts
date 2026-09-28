export type ComputerUseRoute =
  "structured" | "semantic" | "localRunner" | "visual";
export type ComputerUseCapabilitySnapshot = Record<
  ComputerUseRoute,
  { ready: boolean; reasonCode: string; costClass: "low" | "medium" | "high" }
>;

export function resolveComputerUseRoute(input: {
  snapshot: ComputerUseCapabilitySnapshot;
  policy: "allowed" | "denied" | "approval_required";
  required: "click" | "type" | "submit";
}): {
  decision: "routed" | "denied" | "blocked";
  route?: ComputerUseRoute;
  reasonCode: string;
  candidates: ComputerUseRoute[];
} {
  const candidates: ComputerUseRoute[] = [
    "structured",
    "semantic",
    "localRunner",
    "visual",
  ];
  if (input.policy === "denied")
    return { decision: "denied", reasonCode: "POLICY_DENIED", candidates: [] };
  if (input.policy === "approval_required")
    return {
      decision: "blocked",
      reasonCode: "APPROVAL_REQUIRED",
      candidates: [],
    };
  for (const route of candidates)
    if (input.snapshot[route].ready)
      return {
        decision: "routed",
        route,
        reasonCode: input.snapshot[route].reasonCode,
        candidates,
      };
  return { decision: "blocked", reasonCode: "NO_CAPABILITY_READY", candidates };
}
