import { describe, expect, it } from "vitest";
import { evaluateAgentExperienceFlags, type AgentExperienceFeatureFlags } from "../index";

const baseFlags: AgentExperienceFeatureFlags = {
  agentExperienceLayer: true,
  agentExperienceShadowMode: false,
  agentExperienceAgencyPreview: true,
  agentExperienceTeamPreview: false,
  agentExperienceChatPreview: false,
  agentExperienceRuntypeRenderer: false,
  agentExperienceDebugInspector: false,
  agentExperienceForceRollback: false,
  agentExperienceWebsiteWidget: true,
  agentExperiencePageActions: true,
};

describe("Agent Experience feature flag precedence", () => {
  it("force rollback disables all behavior", () => {
    const result = evaluateAgentExperienceFlags({
      flags: { ...baseFlags, agentExperienceForceRollback: true },
      surface: "agency",
      dependencyGatePassed: true,
      debugPermissionGranted: true,
      redactionGatePassed: true,
    });
    expect(result.forceRollback).toBe(true);
    expect(result.previewEnabled).toBe(false);
    expect(result.externalRendererEnabled).toBe(false);
    expect(result.debugInspectorEnabled).toBe(false);
  });

  it("layer disabled ignores child flags", () => {
    const result = evaluateAgentExperienceFlags({
      flags: { ...baseFlags, agentExperienceLayer: false },
      surface: "agency",
      dependencyGatePassed: true,
    });
    expect(result.reason).toBe("layer_disabled");
    expect(result.previewEnabled).toBe(false);
  });

  it("enables shadow and surface preview only when layer is enabled", () => {
    const result = evaluateAgentExperienceFlags({
      flags: { ...baseFlags, agentExperienceShadowMode: true },
      surface: "agency",
    });
    expect(result.shadowModeEnabled).toBe(true);
    expect(result.previewEnabled).toBe(true);
  });

  it("requires dependency and permission gates for renderer and debug", () => {
    const result = evaluateAgentExperienceFlags({
      flags: {
        ...baseFlags,
        agentExperienceRuntypeRenderer: true,
        agentExperienceDebugInspector: true,
      },
      surface: "agency",
      dependencyGatePassed: true,
      debugPermissionGranted: true,
      redactionGatePassed: true,
    });
    expect(result.externalRendererEnabled).toBe(true);
    expect(result.debugInspectorEnabled).toBe(true);
  });

  it("falls back to the SmartSpec renderer when the Runtype dependency gate fails", () => {
    const result = evaluateAgentExperienceFlags({
      flags: { ...baseFlags, agentExperienceRuntypeRenderer: true },
      surface: "agency",
      dependencyGatePassed: false,
    });

    expect(result.layerEnabled).toBe(true);
    expect(result.previewEnabled).toBe(true);
    expect(result.externalRendererEnabled).toBe(false);
  });

  it("keeps future customer flags as no-ops", () => {
    const result = evaluateAgentExperienceFlags({ flags: baseFlags, surface: "agency" });
    expect(result.websiteWidgetEnabled).toBe(false);
    expect(result.pageActionsEnabled).toBe(false);
  });
});
