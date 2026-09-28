import { describe, expect, it } from "vitest";

import {
  selectA2AInterface,
  selectInteropRoute,
  validateA2AAgentCard,
  type A2AAgentCard,
} from "../a2aInteropContracts";

const card: A2AAgentCard = {
  externalAgentId: "agent-a",
  name: "Agent A",
  supportedInterfaces: [
    { url: "https://agent.example/jsonrpc", transport: "JSON-RPC", protocolVersion: "1.0" },
    { url: "https://agent.example/http", transport: "HTTP+JSON", protocolVersion: "1.0" },
  ],
  skills: [{ id: "workflow.execute" }],
};

describe("A2A interop contracts", () => {
  it("preserves Agent Card interface order and selects the first supported binding", () => {
    expect(selectA2AInterface(card, ["HTTP+JSON", "JSON-RPC"])).toEqual(
      card.supportedInterfaces[0]
    );
  });

  it("rejects unsupported protocol versions and non-HTTPS interfaces", () => {
    expect(() =>
      validateA2AAgentCard({
        ...card,
        supportedInterfaces: [
          { url: "http://agent.example", transport: "HTTP+JSON", protocolVersion: "1.0" },
        ],
      })
    ).toThrow("A2A_AGENT_CARD_INVALID");
    expect(() =>
      validateA2AAgentCard({
        ...card,
        supportedInterfaces: [
          { url: "https://agent.example", transport: "HTTP+JSON", protocolVersion: "2.0" },
        ],
      })
    ).toThrow("A2A_PROTOCOL_UNSUPPORTED");
  });

  it("uses verified A2A for preferred policy and native fallback for unverified capability", () => {
    expect(
      selectInteropRoute({
        policy: "a2a_preferred",
        capability: {
          state: "verified",
          routeEligibility: "a2a_eligible",
          health: "healthy",
          interface: card.supportedInterfaces[0],
        },
        dispatchState: "not_started",
      })
    ).toMatchObject({ decision: "a2a", reasonCode: "A2A_VERIFIED" });

    expect(
      selectInteropRoute({
        policy: "a2a_preferred",
        capability: {
          state: "unknown",
          routeEligibility: "native_only",
          health: "not_checked",
          interface: null,
        },
        dispatchState: "not_started",
      })
    ).toMatchObject({ decision: "spec200_native", reasonCode: "A2A_NOT_VERIFIED" });
  });

  it("fails closed when A2A is required but not verified", () => {
    expect(
      selectInteropRoute({
        policy: "a2a_required",
        capability: {
          state: "stale",
          routeEligibility: "blocked",
          health: "failed",
          interface: null,
        },
        dispatchState: "not_started",
      })
    ).toMatchObject({ decision: "blocked", reasonCode: "A2A_CAPABILITY_UNVERIFIED" });
  });

  it("does not create a native duplicate after remote dispatch becomes ambiguous", () => {
    expect(
      selectInteropRoute({
        policy: "a2a_preferred",
        capability: {
          state: "degraded",
          routeEligibility: "blocked",
          health: "failed",
          interface: null,
        },
        dispatchState: "remote_task_created",
      })
    ).toMatchObject({ decision: "ambiguous_dispatch", reasonCode: "REMOTE_TASK_RECONCILIATION_REQUIRED" });
  });
});
