export type ExternalRoute = "acp" | "gascity" | "orca";
export type ExternalRouteCandidate = {
  route: ExternalRoute;
  tenantId: string;
  ready: boolean;
  reasonCode: string;
  contractVersion?: string;
};

export class ExternalRuntimeRoutingError extends Error {
  readonly code: "TENANT_ROUTE_MISMATCH";
  constructor(code: "TENANT_ROUTE_MISMATCH", message = code) {
    super(message);
    this.name = "ExternalRuntimeRoutingError";
    this.code = code;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export function resolveExternalRuntimeRoute(input: {
  tenantId: string;
  preferred: ExternalRoute[];
  policyAllowed: boolean;
  candidates: ExternalRouteCandidate[];
}): {
  decision: "routed" | "denied" | "blocked";
  route?: ExternalRoute;
  reasonCode: string;
} {
  if (!input.policyAllowed)
    return { decision: "denied", reasonCode: "POLICY_DENIED" };
  const candidates = input.candidates.map(candidate => {
    if (candidate.tenantId !== input.tenantId)
      throw new ExternalRuntimeRoutingError("TENANT_ROUTE_MISMATCH");
    return candidate;
  });
  for (const route of input.preferred) {
    const candidate = candidates.find(item => item.route === route);
    if (!candidate || !candidate.ready) continue;
    if (
      candidate.contractVersion &&
      candidate.contractVersion !== `${route}-v1`
    )
      return {
        decision: "blocked",
        reasonCode: "CONTRACT_VERSION_UNSUPPORTED",
      };
    return { decision: "routed", route, reasonCode: candidate.reasonCode };
  }
  return {
    decision: "blocked",
    reasonCode: candidates[0]?.reasonCode ?? "NO_CERTIFIED_ROUTE",
  };
}
