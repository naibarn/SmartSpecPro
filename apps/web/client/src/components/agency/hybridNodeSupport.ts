import type { AgencyNodeData } from "./nodes/types";

export type HybridEngine = "agency_swarm" | "adk2";
export type HybridNodeSupportState = "native" | "compatible" | "emulated" | "unsupported";

export const NODE_ENGINE_SUPPORT: Record<string, Record<HybridEngine, HybridNodeSupportState>> = {
  agent: { agency_swarm: "native", adk2: "native" },
  supervisor: { agency_swarm: "native", adk2: "emulated" },
  autonomous_agent: { agency_swarm: "compatible", adk2: "emulated" },
  router: { agency_swarm: "emulated", adk2: "native" },
  aggregator: { agency_swarm: "emulated", adk2: "native" },
  knowledge_base: { agency_swarm: "compatible", adk2: "compatible" },
  skill_call: { agency_swarm: "compatible", adk2: "compatible" },
  skill_discovery: { agency_swarm: "compatible", adk2: "compatible" },
  data_transform: { agency_swarm: "native", adk2: "native" },
  human_approval: { agency_swarm: "compatible", adk2: "native" },
  browser_session: { agency_swarm: "native", adk2: "unsupported" },
  conditional_branch: { agency_swarm: "compatible", adk2: "native" },
  parallel_fan_out: { agency_swarm: "emulated", adk2: "native" },
  loop_retry: { agency_swarm: "compatible", adk2: "native" },
  error_handler: { agency_swarm: "compatible", adk2: "emulated" },
  engine_boundary: { agency_swarm: "native", adk2: "native" },
};

export function getNodeSupport(
  nodeType: AgencyNodeData["nodeType"] | string | undefined,
  engine: HybridEngine,
): HybridNodeSupportState {
  return NODE_ENGINE_SUPPORT[nodeType ?? "agent"]?.[engine] ?? "unsupported";
}
