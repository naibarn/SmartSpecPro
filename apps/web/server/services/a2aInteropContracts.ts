import { URL } from "node:url";

export const A2A_PROTOCOL_VERSION = "1.0" as const;

export const A2A_TRANSPORTS = ["HTTP+JSON", "JSON-RPC", "gRPC"] as const;
export type A2ATransport = (typeof A2A_TRANSPORTS)[number];

export type A2AAgentInterface = {
  url: string;
  transport: A2ATransport;
  protocolVersion: string;
};

export type A2AAgentSkill = {
  id: string;
};

export type A2AAgentCard = {
  externalAgentId: string;
  name: string;
  supportedInterfaces: A2AAgentInterface[];
  skills: A2AAgentSkill[];
};

export type A2ACapabilityState =
  | "unknown"
  | "discovered"
  | "verified"
  | "degraded"
  | "unsupported"
  | "stale";

export type A2ARouteEligibility =
  | "a2a_eligible"
  | "native_only"
  | "blocked"
  | "needs_review";

export type A2ACapabilitySnapshot = {
  state: A2ACapabilityState;
  routeEligibility: A2ARouteEligibility;
  health: "healthy" | "degraded" | "failed" | "not_checked";
  interface: A2AAgentInterface | null;
};

export type InteropPolicy =
  | "a2a_required"
  | "a2a_preferred"
  | "native_required";

export type InteropDispatchState =
  | "not_started"
  | "pre_dispatch_failed"
  | "remote_task_created";

export type InteropRouteDecision =
  | {
      decision: "a2a";
      reasonCode: "A2A_VERIFIED";
      selectedInterface: A2AAgentInterface;
    }
  | {
      decision: "spec200_native";
      reasonCode: "A2A_NOT_VERIFIED" | "NATIVE_REQUIRED";
    }
  | {
      decision: "blocked";
      reasonCode: "A2A_CAPABILITY_UNVERIFIED";
    }
  | {
      decision: "ambiguous_dispatch";
      reasonCode: "REMOTE_TASK_RECONCILIATION_REQUIRED";
    };

function invalid(code: "A2A_AGENT_CARD_INVALID" | "A2A_PROTOCOL_UNSUPPORTED"): never {
  throw new Error(code);
}

function requiredText(value: unknown, field: string): string {
  if (typeof value !== "string") invalid("A2A_AGENT_CARD_INVALID");
  const normalized = value.trim();
  if (!normalized || normalized.length > 256) invalid("A2A_AGENT_CARD_INVALID");
  return normalized;
}

function validateInterface(value: unknown): A2AAgentInterface {
  if (!value || typeof value !== "object" || Array.isArray(value))
    invalid("A2A_AGENT_CARD_INVALID");
  const candidate = value as Record<string, unknown>;
  const url = requiredText(candidate.url, "url");
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    invalid("A2A_AGENT_CARD_INVALID");
  }
  if (parsed.protocol !== "https:") invalid("A2A_AGENT_CARD_INVALID");
  if (candidate.protocolVersion !== A2A_PROTOCOL_VERSION)
    invalid("A2A_PROTOCOL_UNSUPPORTED");
  if (
    typeof candidate.transport !== "string" ||
    !A2A_TRANSPORTS.includes(candidate.transport as A2ATransport)
  )
    invalid("A2A_AGENT_CARD_INVALID");
  return {
    url,
    transport: candidate.transport as A2ATransport,
    protocolVersion: A2A_PROTOCOL_VERSION,
  };
}

export function validateA2AAgentCard(input: unknown): A2AAgentCard {
  if (!input || typeof input !== "object" || Array.isArray(input))
    invalid("A2A_AGENT_CARD_INVALID");
  const raw = input as Record<string, unknown>;
  if (!Array.isArray(raw.supportedInterfaces) || raw.supportedInterfaces.length === 0)
    invalid("A2A_AGENT_CARD_INVALID");
  if (!Array.isArray(raw.skills)) invalid("A2A_AGENT_CARD_INVALID");
  const supportedInterfaces = raw.supportedInterfaces.map(validateInterface);
  if (new Set(supportedInterfaces.map(item => item.url)).size !== supportedInterfaces.length)
    invalid("A2A_AGENT_CARD_INVALID");
  const skills = raw.skills.map(skill => {
    if (!skill || typeof skill !== "object" || Array.isArray(skill))
      invalid("A2A_AGENT_CARD_INVALID");
    return { id: requiredText((skill as Record<string, unknown>).id, "skill.id") };
  });
  if (new Set(skills.map(skill => skill.id)).size !== skills.length)
    invalid("A2A_AGENT_CARD_INVALID");
  return {
    externalAgentId: requiredText(raw.externalAgentId, "externalAgentId"),
    name: requiredText(raw.name, "name"),
    supportedInterfaces,
    skills,
  };
}

export function selectA2AInterface(
  card: A2AAgentCard,
  supportedTransports: readonly A2ATransport[]
): A2AAgentInterface | null {
  for (const candidate of card.supportedInterfaces) {
    if (
      candidate.protocolVersion === A2A_PROTOCOL_VERSION &&
      supportedTransports.includes(candidate.transport)
    )
      return candidate;
  }
  return null;
}

function isVerifiedA2A(capability: A2ACapabilitySnapshot): capability is A2ACapabilitySnapshot & {
  interface: A2AAgentInterface;
} {
  return (
    capability.state === "verified" &&
    capability.routeEligibility === "a2a_eligible" &&
    capability.health === "healthy" &&
    capability.interface?.protocolVersion === A2A_PROTOCOL_VERSION
  );
}

export function selectInteropRoute(input: {
  policy: InteropPolicy;
  capability: A2ACapabilitySnapshot;
  dispatchState: InteropDispatchState;
}): InteropRouteDecision {
  if (input.dispatchState === "remote_task_created")
    return {
      decision: "ambiguous_dispatch",
      reasonCode: "REMOTE_TASK_RECONCILIATION_REQUIRED",
    };
  if (input.policy === "native_required")
    return { decision: "spec200_native", reasonCode: "NATIVE_REQUIRED" };
  if (isVerifiedA2A(input.capability))
    return {
      decision: "a2a",
      reasonCode: "A2A_VERIFIED",
      selectedInterface: input.capability.interface,
    };
  if (input.policy === "a2a_required")
    return { decision: "blocked", reasonCode: "A2A_CAPABILITY_UNVERIFIED" };
  return { decision: "spec200_native", reasonCode: "A2A_NOT_VERIFIED" };
}
