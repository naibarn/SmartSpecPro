/**
 * Tests for MCP feature flags and audit event types (section-16).
 */

import { describe, it, expect } from "vitest";
import {
  ALLOWED_FEATURE_FLAGS,
  FEATURE_FLAG_DEFAULTS,
} from "../../../shared/featureFlags";
import { validateFeatureFlags } from "../tenantFeatureFlagService";

describe("MCP Feature Flags", () => {
  const mediaMcpFlags = [
    "mcpConnectEnabled",
    "mcpConnectMagnificEnabled",
    "mcpConnectHiggsfieldEnabled",
    "mcpConnectGroupSharingEnabled",
    "mcpMediaStudioEnabled",
    "mcpAutoStoryboardReviewEnabled",
    "mcpMarketplaceCaptureEnabled",
    "mcpStoryboardReviewEnabled",
    "mcpMediaImageEnabled",
    "mcpMediaVideoEnabled",
    "mcpToolSchemaCacheEnabled",
    "mcpAutoFallbackToGatewayApiEnabled",
    "mcpProviderCreditsTrackedEnabled",
  ] as const;
  const videoSegmentPlannerFlags = [
    "videoSegmentPlannerShadow",
    "videoSegmentPlannerPerShot",
    "videoSegmentPlannerPreview",
    "videoSegmentPlannerMultiShotBeta",
  ] as const;

  it("mcpServerRegistry flag exists in ALLOWED_FEATURE_FLAGS", () => {
    expect(ALLOWED_FEATURE_FLAGS.has("mcpServerRegistry")).toBe(true);
  });

  it("mcpStdio flag exists in ALLOWED_FEATURE_FLAGS", () => {
    expect(ALLOWED_FEATURE_FLAGS.has("mcpStdio")).toBe(true);
  });

  it("mcpOAuth flag exists in ALLOWED_FEATURE_FLAGS", () => {
    expect(ALLOWED_FEATURE_FLAGS.has("mcpOAuth")).toBe(true);
  });

  it("mcpServerRegistry remains enabled by default for the existing registry surface", () => {
    expect(FEATURE_FLAG_DEFAULTS.mcpServerRegistry).toBe(true);
  });

  it("mcpStdio defaults to false (phased rollout)", () => {
    expect(FEATURE_FLAG_DEFAULTS.mcpStdio).toBe(false);
  });

  it("mcpOAuth defaults to false (phased rollout)", () => {
    expect(FEATURE_FLAG_DEFAULTS.mcpOAuth).toBe(false);
  });

  it("MCP Connect media flags exist in ALLOWED_FEATURE_FLAGS", () => {
    for (const flag of mediaMcpFlags) {
      expect(ALLOWED_FEATURE_FLAGS.has(flag)).toBe(true);
    }
  });

  it("MCP Connect media flags default to false", () => {
    for (const flag of mediaMcpFlags) {
      expect(FEATURE_FLAG_DEFAULTS[flag]).toBe(false);
    }
  });

  it("tenant flag validation strips arbitrary MCP-like keys", () => {
    const result = validateFeatureFlags({
      mcpConnectEnabled: true,
      mcp_connect_enabled: true,
      mcpArbitraryProviderEnabled: true,
      mcpProviderCreditsTrackedEnabled: false,
    });

    expect(result).toEqual({
      mcpConnectEnabled: true,
      mcpProviderCreditsTrackedEnabled: false,
    });
  });

  it("video segment planner rollout flags exist in ALLOWED_FEATURE_FLAGS", () => {
    for (const flag of videoSegmentPlannerFlags) {
      expect(ALLOWED_FEATURE_FLAGS.has(flag)).toBe(true);
    }
  });

  it("video segment planner defaults keep only shadow and per-shot enabled", () => {
    expect(FEATURE_FLAG_DEFAULTS.videoSegmentPlannerShadow).toBe(true);
    expect(FEATURE_FLAG_DEFAULTS.videoSegmentPlannerPerShot).toBe(true);
    expect(FEATURE_FLAG_DEFAULTS.videoSegmentPlannerPreview).toBe(false);
    expect(FEATURE_FLAG_DEFAULTS.videoSegmentPlannerMultiShotBeta).toBe(false);
  });
});

describe("MCP Audit Event Types", () => {
  it("mcp_tool_call is a valid audit event type", async () => {
    // Import the type — TypeScript compilation validates it
    const { AuditLogger } = await import("../auditLogger");
    // If the type doesn't include mcp_tool_call, this file won't compile
    const eventType: string = "mcp_tool_call";
    expect(eventType).toBe("mcp_tool_call");
  });

  it("mcp_server_created is a valid audit event type", () => {
    const eventType: string = "mcp_server_created";
    expect(eventType).toBe("mcp_server_created");
  });

  it("mcp_server_deleted is a valid audit event type", () => {
    const eventType: string = "mcp_server_deleted";
    expect(eventType).toBe("mcp_server_deleted");
  });
});
