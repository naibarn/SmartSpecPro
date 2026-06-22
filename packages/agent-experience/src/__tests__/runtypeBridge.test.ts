import { describe, expect, it } from "vitest";
import {
  AGENT_EXPERIENCE_SCHEMA_VERSION,
  createRuntypePersonaBridge,
  evaluateAgentExperienceFlags,
  type SmartSpecAgentEvent,
} from "../index";

const event: SmartSpecAgentEvent = {
  schemaVersion: AGENT_EXPERIENCE_SCHEMA_VERSION,
  id: "evt-1",
  type: "message.delta",
  source: "agency",
  surface: "agency_chat",
  visibility: "tenant",
  redaction: "summary",
  timestamp: "2026-06-22T00:00:00.000Z",
  tenantId: "tenant-1",
  payload: { kind: "message", message: { delta: "Hello" } },
};

describe("Runtype renderer bridge spike gate", () => {
  it("ignores renderer flag when layer is disabled", () => {
    const result = evaluateAgentExperienceFlags({
      flags: { agentExperienceLayer: false, agentExperienceRuntypeRenderer: true },
      dependencyGatePassed: true,
    });

    expect(result.externalRendererEnabled).toBe(false);
  });

  it("stays disabled until dependency gate is complete", () => {
    expect(createRuntypePersonaBridge({
      events: [event],
      dependencyGate: { approved: false },
    })).toMatchObject({
      enabled: false,
      reason: "dependency_gate_incomplete",
    });
  });

  it("passes only filtered canonical events when approved", () => {
    const result = createRuntypePersonaBridge({
      events: [event, { ...event, id: "private", visibility: "private_internal" }],
      dependencyGate: {
        approved: true,
        packageName: "@runtypelabs/persona",
        exactVersion: "0.0.0-spike",
        licenseReviewed: true,
        bundleImpactReviewed: true,
        accessibilityReviewed: true,
        supplyChainReviewed: true,
      },
    });

    expect(result.enabled).toBe(true);
    expect(result.events.map((item) => item.id)).toEqual(["evt-1"]);
    expect(result.intents).toEqual([]);
  });
});
