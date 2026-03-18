import { describe, it, expect } from "vitest";
import {
  interAgentMessages,
  systemResourceState,
  interAgentChannelEnum,
  interAgentSourceTypeEnum,
  interAgentTargetTypeEnum,
  interAgentPriorityEnum,
  resourceStatusEnum,
} from "../../../drizzle/schema";

describe("interAgentService — Schema", () => {
  describe("enums", () => {
    it("interAgentChannelEnum has correct values", () => {
      expect(interAgentChannelEnum.enumValues).toEqual([
        "system_broadcast", "system_control", "team_escalation", "system_direct", "system_context",
      ]);
    });

    it("interAgentSourceTypeEnum has correct values", () => {
      expect(interAgentSourceTypeEnum.enumValues).toEqual(["team", "system", "external"]);
    });

    it("interAgentTargetTypeEnum has correct values", () => {
      expect(interAgentTargetTypeEnum.enumValues).toEqual([
        "room", "run", "team", "user", "all_active_runs",
      ]);
    });

    it("interAgentPriorityEnum has correct values", () => {
      expect(interAgentPriorityEnum.enumValues).toEqual(["low", "normal", "high", "critical"]);
    });

    it("resourceStatusEnum has correct values", () => {
      expect(resourceStatusEnum.enumValues).toEqual(["healthy", "degraded", "down", "critical"]);
    });
  });

  describe("inter_agent_messages table", () => {
    it("has all required columns", () => {
      const cols = Object.keys(interAgentMessages);
      expect(cols).toContain("id");
      expect(cols).toContain("tenantId");
      expect(cols).toContain("channel");
      expect(cols).toContain("sourceAgentType");
      expect(cols).toContain("targetType");
      expect(cols).toContain("priority");
      expect(cols).toContain("messageType");
      expect(cols).toContain("payload");
      expect(cols).toContain("actionRequired");
    });
  });

  describe("system_resource_state table", () => {
    it("has all required columns", () => {
      const cols = Object.keys(systemResourceState);
      expect(cols).toContain("id");
      expect(cols).toContain("resourceType");
      expect(cols).toContain("status");
      expect(cols).toContain("stateJson");
    });
  });
});
