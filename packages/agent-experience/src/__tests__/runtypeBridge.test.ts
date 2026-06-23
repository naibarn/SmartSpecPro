import { describe, expect, it } from "vitest";
import {
  AGENT_EXPERIENCE_SCHEMA_VERSION,
  RUNTYPE_PERSONA_PACKAGE_NAME,
  RUNTYPE_PERSONA_VERSION,
  createRuntypePersonaBridge,
  evaluateAgentExperienceFlags,
  loadRuntypePersonaRenderer,
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
  it("resolves the installed Runtype Persona dependency", async () => {
    const persona = await import("@runtypelabs/persona");
    const renderer = await loadRuntypePersonaRenderer();

    expect(RUNTYPE_PERSONA_PACKAGE_NAME).toBe("@runtypelabs/persona");
    expect(RUNTYPE_PERSONA_VERSION).toBe("4.4.0");
    expect(renderer.packageName).toBe(RUNTYPE_PERSONA_PACKAGE_NAME);
    expect(renderer.version).toBe(RUNTYPE_PERSONA_VERSION);
    expect(renderer.createAgentExperience).toBe(persona.createAgentExperience);
    expect(typeof persona.createAgentExperience).toBe("function");
  });

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

  it("stays disabled when the installed dependency version is not the pinned version", () => {
    expect(createRuntypePersonaBridge({
      events: [event],
      dependencyGate: {
        approved: true,
        packageName: RUNTYPE_PERSONA_PACKAGE_NAME,
        exactVersion: "4.4.x",
        licenseReviewed: true,
        bundleImpactReviewed: true,
        accessibilityReviewed: true,
        supplyChainReviewed: true,
      },
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
        packageName: RUNTYPE_PERSONA_PACKAGE_NAME,
        exactVersion: RUNTYPE_PERSONA_VERSION,
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
